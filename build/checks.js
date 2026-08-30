// build/checks.js
// T-006 U-ASSEMBLY: verificación mecánica de prototype/index.html.
//
// Comando de aceptación EXACTO (P-025, .harness/tasks/T-006.json): `node build/checks.js`
// Paso previo (no forma parte del comando de aceptación): `node build/assemble.js`
// regenera prototype/index.html desde los cinco fuentes antes de correr este archivo.
//
// Formato obligatorio (plan.md 3.J): última línea de stdout literal
// "checks ejecutados: N"; exit 0 solo si todas las aserciones pasan; en
// fallo, exit 1 e imprime la aserción fallida. Un exit 0 con N==0 es falso
// verde (P-025). Node puro, sin dependencias externas, sin red.
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var BUILD_DIR = path.join(ROOT, 'build');
var PROTOTYPE_FILE = path.join(ROOT, 'prototype', 'index.html');

var assemble = require('./assemble.js');

var n = 0;
function assert(condicion, mensaje) {
  n++;
  if (!condicion) {
    console.error('aserción fallida (#' + n + '): ' + mensaje);
    process.exit(1);
  }
}

function contarOcurrencias(texto, subcadena) {
  if (subcadena === '') { return 0; }
  var total = 0;
  var indice = texto.indexOf(subcadena);
  while (indice !== -1) {
    total++;
    indice = texto.indexOf(subcadena, indice + subcadena.length);
  }
  return total;
}

// ---------------------------------------------------------------------
// 0. El entregable debe existir (generado por `node build/assemble.js`,
//    paso previo documentado, no parte del comando de aceptación).
// ---------------------------------------------------------------------
if (!fs.existsSync(PROTOTYPE_FILE)) {
  console.error(
    'aserción fallida (#0): prototype/index.html no existe. ' +
    'Corre primero: node build/assemble.js'
  );
  process.exit(1);
}

var html = fs.readFileSync(PROTOTYPE_FILE, 'utf8');

// ---------------------------------------------------------------------
// Extracción de los bloques <script> inline (movida al inicio del archivo,
// T-024: varias secciones de abajo -- DOCTYPE embebido en E, hexes
// permitidos en H -- necesitan localizar el bloque hz-docs por su id antes
// de que la sección G original lo hiciera).
// ---------------------------------------------------------------------
var bloquesScript = [];
(function extraerBloquesScript() {
  var regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  var m;
  while ((m = regex.exec(html)) !== null) {
    bloquesScript.push({ atributos: m[1], contenido: m[2] });
  }
})();

function bloquePorId(idBloque) {
  for (var i = 0; i < bloquesScript.length; i++) {
    if (bloquesScript[i].atributos.indexOf('id="' + idBloque + '"') !== -1) {
      return bloquesScript[i];
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// A. Cero red / cero inyección externa (criterio de aceptación 7).
// ---------------------------------------------------------------------
assert(html.indexOf('<script src=') === -1, 'cero \'<script src=\' en el documento');
assert(html.indexOf('<link rel="stylesheet"') === -1, 'cero \'<link rel="stylesheet"\' en el documento');
assert(html.indexOf('@import') === -1, 'cero \'@import\' en el documento');
assert(html.indexOf('fetch(') === -1, 'cero \'fetch(\' en el documento');
assert(html.indexOf('XMLHttpRequest') === -1, 'cero \'XMLHttpRequest\' en el documento');
assert(html.indexOf('navigator.sendBeacon') === -1, 'cero \'navigator.sendBeacon\' en el documento');
assert(html.indexOf('import(') === -1, 'cero \'import(\' en el documento');

(function verificarSinEsquemasDeRed() {
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var regex = /https?:\/\/[^\s'"<>)]*/g;
  var m;
  var httpFueraDeSvg = false;
  var httpsFueraDeSvg = false;
  while ((m = regex.exec(html)) !== null) {
    var url = m[0];
    var esXmlnsSvg = (url.indexOf(SVG_NS) === 0) || (SVG_NS.indexOf(url) === 0);
    if (!esXmlnsSvg) {
      if (url.indexOf('http://') === 0) { httpFueraDeSvg = true; }
      if (url.indexOf('https://') === 0) { httpsFueraDeSvg = true; }
    }
  }
  assert(!httpFueraDeSvg, 'cero \'http://\' fuera del xmlns de SVG');
  assert(!httpsFueraDeSvg, 'cero \'https://\' fuera del xmlns de SVG');
})();

// ---------------------------------------------------------------------
// B. Cero emojis por rangos unicode (criterio de aceptación 8).
// ---------------------------------------------------------------------
(function verificarSinEmojis() {
  var RANGOS = [
    { nombre: 'U+1F300-U+1FAFF (pictogramas)', min: 0x1F300, max: 0x1FAFF },
    { nombre: 'U+2600-U+27BF (símbolos y dingbats)', min: 0x2600, max: 0x27BF },
    { nombre: 'U+2B00-U+2BFF (símbolos diversos)', min: 0x2B00, max: 0x2BFF },
    { nombre: 'U+FE0F (selector de variación emoji)', min: 0xFE0F, max: 0xFE0F },
    { nombre: 'U+200D (zero width joiner)', min: 0x200D, max: 0x200D },
    { nombre: 'U+1F1E6-U+1F1FF (banderas regionales)', min: 0x1F1E6, max: 0x1F1FF }
  ];

  var puntosDeCodigo = [];
  for (var i = 0; i < html.length; i++) {
    var cp = html.codePointAt(i);
    if (cp > 0xFFFF) { i++; } // par subrogado: avanza la segunda mitad
    puntosDeCodigo.push(cp);
  }

  for (var r = 0; r < RANGOS.length; r++) {
    var rango = RANGOS[r];
    var encontrado = false;
    for (var j = 0; j < puntosDeCodigo.length; j++) {
      if (puntosDeCodigo[j] >= rango.min && puntosDeCodigo[j] <= rango.max) {
        encontrado = true;
        break;
      }
    }
    assert(!encontrado, 'cero emojis en el rango ' + rango.nombre);
  }
})();

// ---------------------------------------------------------------------
// C. Los tres scopes de tema, literales (criterio de aceptación 9).
// ---------------------------------------------------------------------
assert(html.indexOf('@media (prefers-color-scheme: dark)') !== -1, 'presencia literal de @media (prefers-color-scheme: dark)');
assert(html.indexOf(':root[data-theme="dark"]') !== -1, 'presencia literal de :root[data-theme="dark"]');
assert(html.indexOf(':root[data-theme="light"]') !== -1, 'presencia literal de :root[data-theme="light"]');

// T-024 (R5): print CSS presente -- el bloque @media print (T-021, dentro
// del <style> de build/shell.html) es lo que hace que SOLO #documento-plan
// (T-023) sea visible al imprimir/PDF (Adendum R5 puntos 3 y 5).
assert(html.indexOf('@media print') !== -1, 'presencia literal de @media print (bloque de impresión del documento del plan)');
assert(html.indexOf('#documento-plan') !== -1, 'presencia del contenedor #documento-plan que el bloque @media print hace visible');

// ---------------------------------------------------------------------
// D. Cinco contenedores, cinco pestañas y etiquetas en español
//    (criterio de aceptación 10).
// ---------------------------------------------------------------------
var CONTENEDORES = ['vista-resumen', 'vista-perfil', 'vista-plan', 'vista-seguimiento', 'vista-suplementos'];
for (var ci = 0; ci < CONTENEDORES.length; ci++) {
  var idContenedor = CONTENEDORES[ci];
  assert(html.indexOf('id="' + idContenedor + '"') !== -1, 'presencia del contenedor de vista #' + idContenedor);
}

var PESTANAS = ['tab-resumen', 'tab-perfil', 'tab-plan', 'tab-seguimiento', 'tab-suplementos'];
for (var pi = 0; pi < PESTANAS.length; pi++) {
  var idPestana = PESTANAS[pi];
  assert(html.indexOf('id="' + idPestana + '"') !== -1, 'presencia de la pestaña #' + idPestana);
}

var ETIQUETAS_ES = ['Resumen', 'Perfil', 'Plan de dieta', 'Seguimiento', 'Suplementos', 'Ver tabla', 'Acerca de este prototipo'];
for (var ei = 0; ei < ETIQUETAS_ES.length; ei++) {
  var etiqueta = ETIQUETAS_ES[ei];
  assert(html.indexOf(etiqueta) !== -1, 'presencia de la etiqueta en español "' + etiqueta + '"');
}

assert(html.indexOf('<html lang="es">') !== -1, 'presencia literal de <html lang="es">');

// ---------------------------------------------------------------------
// E. Marcadores sustituidos y archivo único sin referencias a build/
//    (criterios de aceptación 11 y 12).
// ---------------------------------------------------------------------
assert(html.indexOf('<!-- INJECT:') === -1, 'ningún marcador <!-- INJECT: sin sustituir');

// OPEN-QUESTION (ver nota de handoff): los cuatro fuentes inyectados (T-001,
// T-003, T-004, T-005) llevan un comentario de cabecera de provenencia con su
// propio nombre de archivo (p.ej. "// build/data.js"), convención legítima y
// congelada en esos fuentes, que T-006 tiene PROHIBIDO editar. Una lectura
// literal de "cero referencias a la ruta build/" (substring "build/" en
// cualquier parte del documento, incluidos comentarios de código) haría a
// T-006 imposible de construir sin violar la propiedad de archivos F1. Se
// verifica en cambio la intención real del criterio -- que el documento es
// autocontenido y no CARGA ningún archivo desde build/ en tiempo de
// ejecución -- vigilando los mecanismos de carga (src=, href=, url() de CSS,
// require()); el resto de mecanismos de red/carga ya se verifica por
// separado arriba (script src, link stylesheet, fetch, XMLHttpRequest,
// import(), http(s)://).
(function verificarSinReferenciasCargablesABuild() {
  var patronesCargables = [
    /\b(?:src|href)\s*=\s*["'][^"']*build\//i,
    /url\(\s*["']?[^)"']*build\//i,
    /require\(\s*["'][^"']*build\//i
  ];
  var encontrado = false;
  for (var pci = 0; pci < patronesCargables.length; pci++) {
    if (patronesCargables[pci].test(html)) { encontrado = true; break; }
  }
  assert(!encontrado, 'el documento no contiene ninguna referencia CARGABLE (src=, href=, url(), require()) a la ruta build/: el HTML es autocontenido');
})();

assert(html.toLowerCase().indexOf('<iframe') === -1, 'cero <iframe en el documento');
assert(html.toLowerCase().indexOf('<object ') === -1, 'cero <object en el documento');
assert(html.toLowerCase().indexOf('<embed ') === -1, 'cero <embed en el documento');

// T-024 (R5): build/documentos.js (bloque hz-docs) construye EN MEMORIA un
// documento .html descargable separado (generarHtmlDescargable, Blob local
// -- Adendum R5 punto 3) cuyo string literal incluye su propio
// "<!DOCTYPE html>", "<html lang=\"es\">" y "</html>". Es contenido de un
// string de JS para un archivo que el usuario descarga aparte, nunca
// markup real de prototype/index.html, así que se excluye el contenido del
// bloque hz-docs antes de contar -- mismo principio que la exclusión de
// comentarios de proveniencia "build/" más abajo (sección E, nota
// OPEN-QUESTION original): se vigila la ESTRUCTURA real del documento, no
// cualquier subcadena que aparezca dentro de un string de JS legítimo.
(function verificarDoctypeYHtmlUnicosFueraDeDocsDescargable() {
  var bloqueDocs = bloquePorId('hz-docs');
  assert(bloqueDocs !== null, 'el bloque <script id="hz-docs"> existe (necesario para excluir su documento descargable embebido del conteo de DOCTYPE/html)');
  var htmlSinDocumentoDescargable = html.split(bloqueDocs.contenido).join('');
  assert(contarOcurrencias(htmlSinDocumentoDescargable, '<!DOCTYPE html>') === 1, 'exactamente un <!DOCTYPE html> en la estructura real del documento (fuera del documento descargable embebido en hz-docs)');
  assert(contarOcurrencias(htmlSinDocumentoDescargable, '<html') === 1, 'exactamente un <html en la estructura real del documento (fuera del documento descargable embebido en hz-docs)');
  assert(contarOcurrencias(htmlSinDocumentoDescargable, '</html>') === 1, 'exactamente un </html> en la estructura real del documento (fuera del documento descargable embebido en hz-docs)');
})();

// ---------------------------------------------------------------------
// F. Namespaces y APIs congelados presentes (criterio de aceptación 13).
// ---------------------------------------------------------------------
assert(html.indexOf('HERZON_DATA') !== -1, 'presencia de window.HERZON_DATA');
assert(html.indexOf('Herzon.Charts') !== -1, 'presencia de Herzon.Charts');
assert(html.indexOf('Herzon.registerView') !== -1, 'presencia de Herzon.registerView');
assert(html.indexOf('Herzon.boot') !== -1, 'presencia de Herzon.boot');
assert(html.indexOf('Herzon.filters') !== -1, 'presencia de Herzon.filters');
assert(html.indexOf('Herzon.theme') !== -1, 'presencia de Herzon.theme');
// T-024 (R5): los dos namespaces nuevos que assemble.js integra ahora.
assert(html.indexOf('Herzon.Motor') !== -1, 'presencia de Herzon.Motor (T-020, motor de recomendación)');
assert(html.indexOf('Herzon.Docs') !== -1, 'presencia de Herzon.Docs (T-023, documentos)');
assert(html.indexOf('Herzon.planActivo') !== -1, 'presencia de Herzon.planActivo (Adendum R5 punto 4, dueño vista_dieta_supl.js, consumida por Herzon.Docs)');

var VISTAS_REGISTRADAS = ['plan', 'suplementos', 'resumen', 'perfil', 'seguimiento'];
for (var vi = 0; vi < VISTAS_REGISTRADAS.length; vi++) {
  var idVista = VISTAS_REGISTRADAS[vi];
  assert(html.indexOf('Herzon.Views.' + idVista) !== -1, 'presencia de la vista registrada Herzon.Views.' + idVista);
}

// ---------------------------------------------------------------------
// G. Cada bloque <script> compila con vm.Script (criterio de aceptación 14).
//    T-024 (R5): el ensamble ahora inyecta motor_recomendacion.js y
//    documentos.js entre charts y vistas-a (build/assemble.js, marcador
//    <!-- INJECT:vistas-a --> resuelto en tres bloques), así que la cuenta
//    sube de 6 a 8: runtime, data, charts, motor, docs, vistas-a, vistas-b,
//    boot. (bloquesScript ya se extrajo arriba, antes de la sección A.)
// ---------------------------------------------------------------------
assert(bloquesScript.length === 8, 'exactamente 8 bloques <script> inline (runtime, data, charts, motor, docs, vistas-a, vistas-b, boot); encontrados ' + bloquesScript.length);

for (var si = 0; si < bloquesScript.length; si++) {
  (function (indice) {
    var contenido = bloquesScript[indice].contenido;
    var compilaBien = true;
    var errorCompilacion = null;
    try {
      new vm.Script(contenido, { filename: 'bloque-script-' + indice + '.js' });
    } catch (err) {
      compilaBien = false;
      errorCompilacion = err;
    }
    assert(compilaBien, 'el bloque <script> #' + indice + ' compila sin error de sintaxis (vm.Script)' + (errorCompilacion ? (': ' + errorCompilacion.message) : ''));
  })(si);
}

// ---------------------------------------------------------------------
// H. Hexes solo en el bloque de tokens CSS; cero en el JS inyectado;
//    cero stroke-dasharray; cero innerHTML (criterio de aceptación 15).
// ---------------------------------------------------------------------
(function verificarHexesSoloEnTokens() {
  var HEX_REGEX = /#[0-9a-fA-F]{3,8}\b/g;

  var bloqueEstilo = '';
  var mEstilo = /<style>([\s\S]*?)<\/style>/.exec(html);
  if (mEstilo) { bloqueEstilo = mEstilo[1]; }

  var hexesEnEstilo = (bloqueEstilo.match(HEX_REGEX) || []).length;
  var hexesEnDocumento = (html.match(HEX_REGEX) || []).length;

  // T-024 (R5): build/documentos.js (bloque hz-docs) genera un documento
  // .html descargable AUTOCONTENIDO (Blob local, Adendum R5 punto 3) que,
  // por ser un archivo SEPARADO sin acceso a las custom properties CSS del
  // prototipo vivo, usa un puñado de hexes LITERALES -- pero solo los 4 ya
  // validados en .harness/design-contract-herzon.md sección 2, modo claro
  // (--text-primary, --text-secondary/--axis, --grid), mismo precedente
  // que el bloque @media print de build/shell.html (T-021, que fuerza
  // esos mismos 4 valores dentro de <style> con !important). Verificado
  // por el propio selfcheck de T-023 (selfcheck_docs.js, check #25).
  var HEXES_PERMITIDOS_FUERA_DE_ESTILO = ['#0b0b0b', '#52514e', '#c3c2b7', '#e1e0d9'];

  var bloqueDocs = bloquePorId('hz-docs');
  var hexesEnDocs = bloqueDocs ? (bloqueDocs.contenido.match(HEX_REGEX) || []) : [];

  assert(hexesEnEstilo > 0, 'el bloque de tokens CSS (<style>) contiene hexes (sanity: la paleta está definida)');
  assert(
    hexesEnDocumento === hexesEnEstilo + hexesEnDocs.length,
    'todos los hexes del documento viven dentro del bloque de tokens CSS o del documento descargable de hz-docs (' +
      hexesEnDocumento + ' totales vs ' + hexesEnEstilo + ' en <style> + ' + hexesEnDocs.length + ' en hz-docs)'
  );

  for (var hdi = 0; hdi < hexesEnDocs.length; hdi++) {
    var hexEncontrado = hexesEnDocs[hdi].toLowerCase();
    assert(
      HEXES_PERMITIDOS_FUERA_DE_ESTILO.indexOf(hexEncontrado) !== -1,
      'el hex "' + hexesEnDocs[hdi] + '" dentro de hz-docs (documento descargable) pertenece a la lista validada del contrato de diseño sección 2 (' + HEXES_PERMITIDOS_FUERA_DE_ESTILO.join(', ') + ')'
    );
  }

  for (var sbi = 0; sbi < bloquesScript.length; sbi++) {
    var esBloqueDocs = bloquesScript[sbi].atributos.indexOf('id="hz-docs"') !== -1;
    if (esBloqueDocs) { continue; } // ya verificado arriba contra la whitelist
    var hexesEnBloque = (bloquesScript[sbi].contenido.match(HEX_REGEX) || []).length;
    assert(hexesEnBloque === 0, 'cero hexes literales dentro del bloque <script> #' + sbi);
  }
})();

assert(html.indexOf('stroke-dasharray') === -1, 'cero stroke-dasharray en el documento (grid y ejes hairline sólida, regla 6)');
assert(html.indexOf('innerHTML') === -1, 'cero innerHTML en el documento (datos al DOM solo con textContent)');

// ---------------------------------------------------------------------
// I. Integridad del ensamble: cada fuente aparece íntegro en el HTML, y
//    re-ensamblar en memoria reproduce el archivo en disco byte a byte
//    (criterio de aceptación 16).
// ---------------------------------------------------------------------
var FUENTES = [
  { nombre: 'build/data.js', archivo: 'data.js' },
  { nombre: 'build/charts.js', archivo: 'charts.js' },
  { nombre: 'build/motor_recomendacion.js', archivo: 'motor_recomendacion.js' },
  { nombre: 'build/documentos.js', archivo: 'documentos.js' },
  { nombre: 'build/vista_dieta_supl.js', archivo: 'vista_dieta_supl.js' },
  { nombre: 'build/vista_metricas.js', archivo: 'vista_metricas.js' }
];

for (var fi = 0; fi < FUENTES.length; fi++) {
  var fuente = FUENTES[fi];
  var contenidoFuente = fs.readFileSync(path.join(BUILD_DIR, fuente.archivo), 'utf8');
  var apariciones = contarOcurrencias(html, contenidoFuente);
  assert(contenidoFuente.length > 0, fuente.nombre + ' no está vacío');
  assert(apariciones === 1, fuente.nombre + ' aparece íntegro (subcadena literal) exactamente 1 vez dentro del HTML ensamblado; encontrado ' + apariciones + ' veces');
}

(function verificarIdempotencia() {
  var reensamblado = assemble.ensamblar();
  assert(reensamblado.length === html.length, 'el re-ensamble en memoria produce la misma longitud que el archivo en disco (' + reensamblado.length + ' vs ' + html.length + ')');
  assert(reensamblado === html, 'el re-ensamble en memoria es byte a byte idéntico al archivo en disco (idempotencia de build/assemble.js)');
})();

// ---------------------------------------------------------------------
// J. Anti-regresión D1 (QA ronda 1, T-010) -- COMPLETA (T-024): la lista
//    original de T-009 (10 palabras) cubría solo data/charts/vistas-a/b.
//    Los módulos de R5 (T-020 motor, T-023 docs) traen sus propias listas
//    de palabras sin acento en selfcheck_motor.js y selfcheck_docs.js; esta
//    sección las UNE aquí para que el documento final ensamblado quede
//    cubierto también contra esas dos, en vez de solo las 10 originales.
//    Se excluye deliberadamente 'numero' de la unión: es palabra sin
//    acento en la prosa de motor/docs, pero también existe como
//    IDENTIFICADOR legítimo en build/charts.js (variable local `numero`
//    dentro de statTile) -- verificado por inspección (grep con límite de
//    palabra sobre los 7 fuentes: única colisión real). Mismo principio ya
//    aplicado en selfcheck_docs.js ("seccion"/"recomposicion"/"proteina_g"
//    quedan fuera por ser identificadores, no prosa) -- aquí se aplica al
//    documento ensamblado completo, donde el código de TODOS los módulos
//    convive. Coincidencia con límite de palabra (\b), aplicada al
//    documento ya ensamblado como red de seguridad cruzada del ensamble.
// ---------------------------------------------------------------------
(function verificarSinPalabrasSinAcentoD1() {
  var PALABRAS_SIN_ACENTO_PROHIBIDAS = [
    // Lista original T-009 (data.js, charts.js, vista_dieta_supl.js, vista_metricas.js).
    'anos', 'Composicion', 'Calorias', 'Regimen', 'Probiotico', 'clinica',
    'demostracion', 'sinteticos', 'ultimas', 'capsula',
    // Lista propia de selfcheck_motor.js (T-020), sin 'numero' (ver nota arriba).
    'funcion', 'preambulo', 'formulas', 'catalogo', 'segun', 'explicito',
    'espanol', 'anios', 'invalido', 'invalida',
    // Lista propia de selfcheck_docs.js (T-023), palabras nuevas no ya listadas.
    'validacion', 'importacion', 'fisiologico', 'fisiologica',
    'automatico', 'automatica', 'basica', 'basico', 'facil', 'metodo'
  ];
  for (var pa = 0; pa < PALABRAS_SIN_ACENTO_PROHIBIDAS.length; pa++) {
    var palabra = PALABRAS_SIN_ACENTO_PROHIBIDAS[pa];
    var regexPalabra = new RegExp('\\b' + palabra + '\\b');
    assert(!regexPalabra.test(html), 'prototype/index.html contiene la palabra sin acento "' + palabra + '" (D1, QA ronda 1 + R5): revisar y corregir a español con acentos/eñe');
  }
})();

// ---------------------------------------------------------------------
// Cierre (plan.md 3.J).
// ---------------------------------------------------------------------
console.log('todas las aserciones pasaron.');
console.log('checks ejecutados: ' + n);
process.exit(0);
