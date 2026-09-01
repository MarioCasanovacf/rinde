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

// Adendum R9 punto 5 / PR-04 (T-042): la nota del Resumen se renombró de
// "Acerca de este prototipo" a "Acerca del modo demo" (build/vista_metricas.js);
// pin actualizado en el MISMO cambio que la propagación (regla de la tarea).
var ETIQUETAS_ES = ['Resumen', 'Perfil', 'Plan de dieta', 'Seguimiento', 'Suplementos', 'Ver tabla', 'Acerca del modo demo'];
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
// T-042 (R8/R9): namespace nuevo que assemble.js integra como segundo
// bloque del marcador INJECT:data.
assert(html.indexOf('Herzon.Almacen') !== -1, 'presencia de Herzon.Almacen (T-039/T-045, modo demo/real y multi-cliente)');

var VISTAS_REGISTRADAS = ['plan', 'suplementos', 'resumen', 'perfil', 'seguimiento'];
for (var vi = 0; vi < VISTAS_REGISTRADAS.length; vi++) {
  var idVista = VISTAS_REGISTRADAS[vi];
  assert(html.indexOf('Herzon.Views.' + idVista) !== -1, 'presencia de la vista registrada Herzon.Views.' + idVista);
}

// ---------------------------------------------------------------------
// G. Cada bloque <script> compila con vm.Script (criterio de aceptación 14).
//    T-024 (R5): el ensamble ahora inyecta motor_recomendacion.js y
//    documentos.js entre charts y vistas-a (build/assemble.js, marcador
//    <!-- INJECT:vistas-a --> resuelto en tres bloques). T-038 (R8) agregó
//    el registro guardeado del service worker como bloque estático propio
//    de build/shell.html (hz-sw-registro, fuera de cualquier marcador
//    INJECT). T-042 (R8/R9) agrega build/almacen.js como segundo bloque del
//    marcador <!-- INJECT:data -->. La cuenta total: runtime, data,
//    almacen, charts, motor, docs, vistas-a, vistas-b, boot, sw-registro =
//    10. (bloquesScript ya se extrajo arriba, antes de la sección A.)
// ---------------------------------------------------------------------
assert(bloquesScript.length === 10, 'exactamente 10 bloques <script> inline (runtime, data, almacen, charts, motor, docs, vistas-a, vistas-b, boot, sw-registro); encontrados ' + bloquesScript.length);

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

  // Adendum R8 punto 2 (T-038/T-042): el <head>, ANTES de que abra el
  // <style>, trae los dos <meta name="theme-color"> (claro/oscuro) que el
  // contrato autoriza explícitamente con los hexes de --surface-1, más el
  // comentario de proveniencia del favicon/theme-color que documenta esos
  // mismos tres valores (--series-1 y --surface-1 claro/oscuro) en prosa.
  // Ninguno es un hex nuevo: los tres ya viven en <style> como custom
  // properties; esto solo cuenta su aparición literal fuera de <style>,
  // autorizada por el Adendum, en vez de tratarla como fuga de paleta.
  var HEXES_PERMITIDOS_EN_HEAD = ['#2a78d6', '#fcfcfb', '#1a1a19'];
  var idxStyle = html.indexOf('<style>');
  var bloqueHead = idxStyle !== -1 ? html.slice(0, idxStyle) : '';
  var hexesEnHead = bloqueHead.match(HEX_REGEX) || [];

  assert(hexesEnEstilo > 0, 'el bloque de tokens CSS (<style>) contiene hexes (sanity: la paleta está definida)');
  assert(
    hexesEnDocumento === hexesEnEstilo + hexesEnDocs.length + hexesEnHead.length,
    'todos los hexes del documento viven dentro del bloque de tokens CSS, del documento descargable de hz-docs o del <head> PWA autorizado por el Adendum R8 punto 2 (' +
      hexesEnDocumento + ' totales vs ' + hexesEnEstilo + ' en <style> + ' + hexesEnDocs.length + ' en hz-docs + ' + hexesEnHead.length + ' en <head>)'
  );

  for (var hdi = 0; hdi < hexesEnDocs.length; hdi++) {
    var hexEncontrado = hexesEnDocs[hdi].toLowerCase();
    assert(
      HEXES_PERMITIDOS_FUERA_DE_ESTILO.indexOf(hexEncontrado) !== -1,
      'el hex "' + hexesEnDocs[hdi] + '" dentro de hz-docs (documento descargable) pertenece a la lista validada del contrato de diseño sección 2 (' + HEXES_PERMITIDOS_FUERA_DE_ESTILO.join(', ') + ')'
    );
  }

  for (var hhi = 0; hhi < hexesEnHead.length; hhi++) {
    var hexEnHead = hexesEnHead[hhi].toLowerCase();
    assert(
      HEXES_PERMITIDOS_EN_HEAD.indexOf(hexEnHead) !== -1,
      'el hex "' + hexesEnHead[hhi] + '" dentro del <head> (antes de <style>) pertenece a la lista autorizada por el Adendum R8 punto 2 (' + HEXES_PERMITIDOS_EN_HEAD.join(', ') + ')'
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
  { nombre: 'build/almacen.js', archivo: 'almacen.js' },
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
// J. Anti-regresión D1 (QA ronda 1, T-010) -- COMPLETA (T-024, extendida
//    T-042/R8-R9): la lista original de T-009 (10 palabras) cubría solo
//    data/charts/vistas-a/b. Los módulos de R5 (T-020 motor, T-023 docs)
//    traen sus propias listas de palabras sin acento en selfcheck_motor.js
//    y selfcheck_docs.js; T-042 (R8/R9) suma aquí las palabras nuevas de
//    selfcheck_almacen.js (T-039/T-045) y de la lista ampliada de
//    selfcheck_vistas_b.js (R9, vista_metricas.js) que aún no estaban en la
//    unión, para que el documento final ensamblado -- que desde esta ronda
//    incluye build/almacen.js como octavo fuente inyectado -- quede
//    cubierto también contra esas dos listas.
//    Se excluyen deliberadamente de la unión las palabras que colisionan
//    con IDENTIFICADORES legítimos del código ya ensamblado (mismo
//    principio que la exclusión original de 'numero', variable local en
//    charts.js/statTile -- verificado por inspección con grep de límite de
//    palabra sobre los 8 fuentes + build/shell.html):
//      - 'catalogo': parámetro/variable local muy repetido en almacen.js
//        (estructurasVaciasDesdeCatalogo, montarObjetoCompleto, montarDemo).
//        Estaba en la unión desde T-024 (lista de selfcheck_motor.js, donde
//        no colisiona) pero build/almacen.js es fuente NUEVA que T-042
//        integra por primera vez al ensamble -- la colisión solo aparece
//        aquí, contra el documento completo; selfcheck_motor.js sigue
//        vigilando 'catalogo' correctamente dentro de su propio archivo.
//      - 'invalidos': variable local en vista_dieta_supl.js/vista_metricas.js
//        (validarCamposNumericos), preexistente a esta ronda.
//      - 'vacio': coincide con el nombre de clase/identificador `hz-vacio`
//        (Adendum R8 punto 2), usado en shell.html (regla CSS) y en
//        classList.add('hz-vacio') de vista_dieta_supl.js/vista_metricas.js;
//        las formas plural/femenino sin ese choque ('vacios', 'vacias') sí
//        se incluyen abajo.
//      - 'raiz': variable local muy repetida en charts.js/vista_dieta_supl.js
//        (elemento raíz del contenedor de cada primitiva).
//      - 'valido': clave de objeto `{valido: true/false}` en almacen.js
//        (validarNombreCliente), interna a la validación de alta/renombrado.
//    Todas las exclusiones se verificaron por inspección directa sobre
//    prototype/index.html ya ensamblado (cero colisiones para el resto).
//    Coincidencia con límite de palabra (\b), aplicada al documento ya
//    ensamblado como red de seguridad cruzada del ensamble.
// ---------------------------------------------------------------------
(function verificarSinPalabrasSinAcentoD1() {
  var PALABRAS_SIN_ACENTO_PROHIBIDAS = [
    // Lista original T-009 (data.js, charts.js, vista_dieta_supl.js, vista_metricas.js).
    'anos', 'Composicion', 'Calorias', 'Regimen', 'Probiotico', 'clinica',
    'demostracion', 'sinteticos', 'ultimas', 'capsula',
    // Lista propia de selfcheck_motor.js (T-020), sin 'numero' ni 'catalogo'
    // (ver nota arriba: 'catalogo' colisiona con build/almacen.js, fuente
    // nueva que T-042 suma al ensamble).
    'funcion', 'preambulo', 'formulas', 'segun', 'explicito',
    'espanol', 'anios', 'invalido', 'invalida',
    // Lista propia de selfcheck_docs.js (T-023), palabras nuevas no ya listadas.
    'validacion', 'importacion', 'fisiologico', 'fisiologica',
    'automatico', 'automatica', 'basica', 'basico', 'facil', 'metodo',
    // T-042 (R8/R9): palabras nuevas de selfcheck_almacen.js sin colisión
    // de identificador ('invalidos', 'vacio', 'numero' quedan fuera, ver nota).
    'modulo', 'vacios', 'vacias', 'sesion', 'sincrono', 'sincrona', 'logica',
    'pagina', 'aqui', 'tambien', 'parametro', 'construccion', 'publicacion',
    'confirmacion', 'cronologicamente', 'mutacion', 'formula', 'diseno',
    'dialogos', 'unica', 'unico', 'ultima', 'ultimo', 'estan', 'clasico',
    'clasica', 'aceptacion',
    // T-042 (R8/R9): palabras nuevas de la lista ampliada de
    // selfcheck_vistas_b.js sin colisión ('raiz', 'valido' quedan fuera).
    'jerarquia', 'heroe', 'mecanica', 'edicion', 'creacion', 'eliminacion',
    'seleccion'
  ];
  for (var pa = 0; pa < PALABRAS_SIN_ACENTO_PROHIBIDAS.length; pa++) {
    var palabra = PALABRAS_SIN_ACENTO_PROHIBIDAS[pa];
    var regexPalabra = new RegExp('\\b' + palabra + '\\b');
    assert(!regexPalabra.test(html), 'prototype/index.html contiene la palabra sin acento "' + palabra + '" (D1, QA ronda 1 + R5): revisar y corregir a español con acentos/eñe');
  }
})();

// ---------------------------------------------------------------------
// K. Guard anti-fuga de script (T-031, R6): tras remover TODOS los bloques
//    <script>...</script> del HTML ensamblado, el texto restante no debe
//    contener fragmentos de código JS reconocibles. Guarda contra el
//    hazard descrito en .harness/qa-visual-ronda1.md -- build/documentos.js
//    (bloque hz-docs) construye su documento descargable con el patrón
//    `var partes = []; partes.push(...); ... partes.join('\n')`, que
//    incluye la cadena JS '</body>' como STRING de JS dentro de un
//    'partes.push(...)' (nunca como markup real de prototype/index.html).
//    Ese warning documenta un defecto de una HERRAMIENTA de QA que ancla su
//    inyección de navegación al PRIMER '</body>' del archivo (que cae
//    dentro de ese string) y confirma que el defecto NO existe en
//    prototype/index.html en sí: aquí no se inyecta ningún script
//    adicional, así que el único '</script>' real es el que assemble.js
//    emite al cerrar cada bloque <script id="...">. Esta aserción verifica
//    esa realidad de forma mecánica y queda como regla permanente: si algún
//    cambio futuro rompiera el envoltorio de un bloque <script> (por
//    ejemplo, una subcadena '</scr' + 'ipt>' sin escapar dentro de un
//    módulo), el código JS de ese módulo se volvería texto visible fuera de
//    cualquier <script>, y esta aserción lo atraparía de inmediato.
// ---------------------------------------------------------------------
(function verificarGuardAntiFugaDeScript() {
  var htmlSinBloquesScript = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  var FRAGMENTOS_CODIGO_PROHIBIDOS = ['partes.push(', 'function(', '.join('];
  for (var fci = 0; fci < FRAGMENTOS_CODIGO_PROHIBIDOS.length; fci++) {
    var fragmento = FRAGMENTOS_CODIGO_PROHIBIDOS[fci];
    assert(
      htmlSinBloquesScript.indexOf(fragmento) === -1,
      'guard anti-fuga de script: el texto fuera de todo bloque <script> no debe contener "' + fragmento + '" (código JS visible como texto plano; ver hazard de .harness/qa-visual-ronda1.md)'
    );
  }
})();

// ---------------------------------------------------------------------
// L. Atributo data-ancho="completo" (Adendum R6 punto 1): la regla vive en
//    el CSS del shell y al menos una vista la consume vía setAttribute.
// ---------------------------------------------------------------------
assert(
  html.indexOf('.hz-grid > [data-ancho="completo"] { grid-column: 1 / -1; }') !== -1,
  'presencia literal de la regla CSS .hz-grid > [data-ancho="completo"] { grid-column: 1 / -1; } (Adendum R6 punto 1)'
);
assert(
  /setAttribute\(\s*['"]data-ancho['"]\s*,\s*['"]completo['"]\s*\)/.test(html),
  'al menos una vista consume data-ancho="completo" vía setAttribute (Adendum R6 punto 1)'
);

// ---------------------------------------------------------------------
// M. color-scheme sigue al toggle (Adendum R6 punto 5 / hallazgos
//    fini-5 y resp-2): el chrome nativo (track del slider, controles del
//    navegador) debe cambiar de tema junto con :root[data-theme].
// ---------------------------------------------------------------------
assert(html.indexOf(':root[data-theme="dark"] { color-scheme: dark; }') !== -1, 'presencia literal de :root[data-theme="dark"] { color-scheme: dark; } (color-scheme sigue al toggle en oscuro)');
assert(html.indexOf(':root[data-theme="light"] { color-scheme: light; }') !== -1, 'presencia literal de :root[data-theme="light"] { color-scheme: light; } (color-scheme sigue al toggle en claro)');

// ---------------------------------------------------------------------
// N. Opciones ADITIVAS de Herzon.Charts (Adendum R6 punto 2) consumidas
//    por las vistas -- criterio T-031 (d): unidad, leyendaRampa. Se
//    verifica dentro de los bloques hz-vistas-a/hz-vistas-b específicamente
//    (no en hz-charts, donde el nombre de la opción vive aunque nadie la
//    invoque desde una vista real: eso volvería la aserción trivialmente
//    verdadera sin probar consumo real).
// ---------------------------------------------------------------------
(function verificarOpcionesNuevasDeChartsConsumidasPorLasVistas() {
  var bloqueVistasA = bloquePorId('hz-vistas-a'); // vista_dieta_supl.js
  var bloqueVistasB = bloquePorId('hz-vistas-b'); // vista_metricas.js
  assert(bloqueVistasA !== null, 'el bloque <script id="hz-vistas-a"> existe (necesario para verificar consumo de opciones nuevas de Charts)');
  assert(bloqueVistasB !== null, 'el bloque <script id="hz-vistas-b"> existe (necesario para verificar consumo de opciones nuevas de Charts)');
  var contenidoVistas = bloqueVistasA.contenido + '\n' + bloqueVistasB.contenido;

  assert(/\bunidad\s*:/.test(contenidoVistas), 'opciones.unidad (Adendum R6 punto 2, línea/barras) aparece consumida por al menos una vista');
  assert(/\bleyendaRampa\s*:/.test(contenidoVistas), 'opciones.leyendaRampa (Adendum R6 punto 2, heatmapCalendario) aparece consumida por al menos una vista');
})();

// ---------------------------------------------------------------------
// O. Adendum R8 punto 6 (T-042): bloque hz-almacen presente y ORDENADO --
//    segundo bloque del marcador INJECT:data, después de hz-data y antes
//    de hz-charts, para que Almacen.cargar() corra antes de que boot monte
//    las vistas.
// ---------------------------------------------------------------------
(function verificarBloqueAlmacenPresenteYOrdenado() {
  var indiceData = -1, indiceAlmacen = -1, indiceCharts = -1;
  for (var bi = 0; bi < bloquesScript.length; bi++) {
    if (bloquesScript[bi].atributos.indexOf('id="hz-data"') !== -1) { indiceData = bi; }
    if (bloquesScript[bi].atributos.indexOf('id="hz-almacen"') !== -1) { indiceAlmacen = bi; }
    if (bloquesScript[bi].atributos.indexOf('id="hz-charts"') !== -1) { indiceCharts = bi; }
  }
  assert(indiceAlmacen !== -1, 'el bloque <script id="hz-almacen"> existe en el documento ensamblado');
  assert(indiceData !== -1 && indiceAlmacen === indiceData + 1, 'hz-almacen es EXACTAMENTE el bloque siguiente a hz-data (segundo bloque del marcador INJECT:data)');
  assert(indiceCharts !== -1 && indiceAlmacen < indiceCharts, 'hz-almacen precede a hz-charts (Almacen.cargar() corre antes de que boot monte las vistas)');
})();

// ---------------------------------------------------------------------
// P. Adendum R8 punto 2 (T-038/T-042): capa PWA en el head -- link
//    manifest presente, registro del service worker GUARDEADO (nunca
//    intenta registrar en file://). Verificar además que manifest.webmanifest
//    y sw.js NO se inyectan al HTML (solo referencias: assemble.js no los
//    toca, viven junto a index.html en prototype/).
// ---------------------------------------------------------------------
assert(html.indexOf('<link rel="manifest" href="./manifest.webmanifest">') !== -1, 'presencia literal de <link rel="manifest" href="./manifest.webmanifest"> en el head PWA');
assert(
  /'serviceWorker'\s+in\s+navigator\s*&&\s*\/\^https\?:\$\/\.test\(\s*location\.protocol\s*\)/.test(html),
  'el registro del service worker está GUARDEADO por el test de protocolo (\'serviceWorker\' in navigator && /^https?:$/.test(location.protocol)); nunca intenta registrar abierto por file://'
);
(function verificarManifestYSwNoInyectados() {
  var manifestPath = path.join(ROOT, 'prototype', 'manifest.webmanifest');
  var swPath = path.join(ROOT, 'prototype', 'sw.js');
  if (fs.existsSync(manifestPath)) {
    var manifestContenido = fs.readFileSync(manifestPath, 'utf8');
    assert(contarOcurrencias(html, manifestContenido) === 0, 'el contenido de prototype/manifest.webmanifest NO aparece inyectado dentro de prototype/index.html (solo referencia por <link>)');
  }
  if (fs.existsSync(swPath)) {
    var swContenido = fs.readFileSync(swPath, 'utf8');
    assert(contarOcurrencias(html, swContenido) === 0, 'el contenido de prototype/sw.js NO aparece inyectado dentro de prototype/index.html (solo referencia por navigator.serviceWorker.register)');
  }
})();

// ---------------------------------------------------------------------
// Q. De-prototipo (Adendum R9 punto 5, PR-01/PR-02/PR-03): title exacto,
//    badge inicial 'Modo demo', footer SIN la palabra 'prototipo' (el
//    disclaimer clínico se conserva, solo cambia el texto).
// ---------------------------------------------------------------------
assert(html.indexOf('<title>Rinde — Seguimiento nutricional del CECAD</title>') !== -1, 'presencia literal de <title>Rinde — Seguimiento nutricional del CECAD</title> (PR-01)');
assert(/<span class="hz-badge" id="hz-modo-datos">Modo demo<\/span>/.test(html), 'el badge #hz-modo-datos arranca en el markup con el texto exacto "Modo demo" (PR-02, textoBadge() de almacen.js lo actualiza a MODO DEMO/oculto en runtime)');
assert(
  /\.hz-badge\[hidden\]\s*\{\s*display:\s*none;\s*\}/.test(html),
  'presencia de la regla CSS .hz-badge[hidden] { display: none; } (Adendum R9 punto 4/C1, T-046: sin esta regla el atributo hidden que almacen.js aplica en modo real no tiene efecto visual porque .hz-badge fija display:inline-flex explícito)'
);
(function verificarFooterSinPrototipo() {
  var mFooter = /<footer class="hz-footer">([\s\S]*?)<\/footer>/.exec(html);
  assert(mFooter !== null, 'el <footer class="hz-footer"> existe en el documento');
  var textoFooter = mFooter[1].replace(/<[^>]*>/g, '');
  assert(textoFooter.toLowerCase().indexOf('prototipo') === -1, 'el texto visible del footer no contiene la palabra "prototipo" (PR-03: la app deja de autodenominarse prototipo)');
  assert(textoFooter.indexOf('valoración clínica') !== -1, 'el disclaimer clínico permanece en el footer tras el cambio de texto (PR-03)');
})();

// ---------------------------------------------------------------------
// R. Selector de cliente (Adendum R9 punto 4, MC-03): #hz-cliente-selector
//    reemplaza al span estático #hz-paciente-nombre, que debe estar AUSENTE.
// ---------------------------------------------------------------------
assert(/<select id="hz-cliente-selector" class="hz-selector-cliente" aria-label="Cliente activo">/.test(html), 'presencia del <select id="hz-cliente-selector"> del header (MC-03)');
assert(html.indexOf('hz-paciente-nombre') === -1, 'el span #hz-paciente-nombre (reemplazado por el selector de cliente) está AUSENTE del documento (MC-03)');

// ---------------------------------------------------------------------
// S. Exportables sin la marca vieja (PR-05/C6): cero 'herzon-' como
//    prefijo de nombre de archivo descargado en todo el documento.
// ---------------------------------------------------------------------
assert(html.indexOf('herzon-') === -1, 'cero \'herzon-\' en el documento (PR-05: los tres exportables usan el prefijo rinde-/rinde-demo-/rinde-<slug>-, namespace interno Herzon.*/hz- congelado y sin ese prefijo)');

// ---------------------------------------------------------------------
// T. CSS aditivo Adendum R9 punto 1 (LY-01/LY-04/LY-05/DV-05, T-044):
//    data-ancho="doble" y .hz-grid-pares presentes Y consumidos por al
//    menos una vista.
// ---------------------------------------------------------------------
assert(
  /\.hz-grid\s*>\s*\[data-ancho="doble"\]\s*\{\s*grid-column:\s*span 2;\s*\}/.test(html),
  'presencia de la regla CSS .hz-grid > [data-ancho="doble"] { grid-column: span 2; } (Adendum R9 punto 1)'
);
assert(
  /setAttribute\(\s*['"]data-ancho['"]\s*,\s*['"]doble['"]\s*\)/.test(html),
  'al menos una vista consume data-ancho="doble" vía setAttribute (Adendum R9 punto 1, LY-01/LY-05/DV-05)'
);
assert(
  /\.hz-grid-pares\s*\{\s*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(480px, 100%\), 1fr\)\);\s*\}/.test(html),
  'presencia de la regla CSS .hz-grid-pares { grid-template-columns: repeat(auto-fit, minmax(min(480px, 100%), 1fr)); } (Adendum R9 punto 1, LY-04)'
);
assert(html.indexOf("'hz-grid-pares'") !== -1 || html.indexOf('"hz-grid-pares"') !== -1, 'la clase hz-grid-pares aparece consumida (classList/crear) por al menos una vista (LY-04, Seguimiento)');

// ---------------------------------------------------------------------
// U. Clase hz-vacio definida (Adendum R8 punto 2): estados vacíos de
//    cards en modo real sin datos.
// ---------------------------------------------------------------------
assert(html.indexOf('.hz-vacio {') !== -1, 'presencia de la regla CSS .hz-vacio { ... } (Adendum R8 punto 2, estados vacíos)');

// ---------------------------------------------------------------------
// Cierre (plan.md 3.J).
// ---------------------------------------------------------------------
console.log('todas las aserciones pasaron.');
console.log('checks ejecutados: ' + n);
process.exit(0);
