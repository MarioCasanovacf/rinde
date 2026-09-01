// build/assemble.js
// T-006 U-ASSEMBLY: ensamblador idempotente del prototipo Herzon.
//
// Lee build/shell.html y sustituye, en este orden congelado
// (.harness/plan.md sección 3.A y 3.D), los cuatro marcadores literales
//   <!-- INJECT:data -->
//   <!-- INJECT:charts -->
//   <!-- INJECT:vistas-a -->
//   <!-- INJECT:vistas-b -->
// por el contenido LITERAL de build/data.js, build/charts.js,
// build/vista_dieta_supl.js y build/vista_metricas.js respectivamente,
// cada uno envuelto en su propio bloque <script> inline. No inyecta
// build/testdom.js ni ningún build/selfcheck_*.js (plan.md, criterio de
// aceptación T-006).
//
// Adendum R5 (T-024): build/shell.html (dueño T-021, fuera de mi POSEE) no
// ganó marcadores nuevos para los dos módulos de R5. El task T-024 pide el
// orden "motor y docs después de charts, antes de vistas" -- se logra SIN
// tocar shell.html: el marcador <!-- INJECT:vistas-a --> se resuelve con
// TRES bloques <script> consecutivos (hz-motor, hz-docs, hz-vistas-a) en
// vez de uno solo. Como ese marcador ya vive inmediatamente después de
// <!-- INJECT:charts --> en build/shell.html, el resultado final respeta
// el orden pedido usando solo los archivos que T-024 POSEE.
//
// Adendum R8 punto 6 (T-042): mismo patrón de bloques múltiples, ahora
// sobre el marcador <!-- INJECT:data -->: build/almacen.js (T-039/T-045,
// dueño Herzon.Almacen) entra como SEGUNDO bloque <script id="hz-almacen">,
// DESPUÉS de data.js y ANTES de charts/vistas -- su cargar() corre en
// cuanto se define, así que el boot de vistas ya ve el modo (demo/real) y
// el cliente activo correctos.
//
// Adendum R10 (T-055, C-5): orden de inyección canónico y único.
// INJECT:data pasa a TRES bloques: hz-data, hz-seguridad (build/seguridad.js,
// T-050, S-01 -- cripto puro, jamás DOM), hz-almacen (T-052) -- en ese orden,
// porque almacen.js consulta Herzon.Seguridad.activa() de forma síncrona en
// su cargar(). INJECT:vistas-a pasa a CUATRO bloques: hz-motor, hz-docs,
// hz-vistas-a, hz-vista-rutina (build/vista_rutina.js, T-053, R-08.2) --
// vista_rutina.js se registra AL FINAL para que HERZON_DATA, Herzon.Almacen
// y Herzon.Docs ya existan cuando llama a Herzon.registerView('rutina', ...).
//
// Idempotente por construcción: cada corrida lee los diez fuentes de
// disco desde cero y no conserva estado entre invocaciones, así que dos
// corridas consecutivas producen el mismo prototype/index.html byte a
// byte mientras los fuentes no cambien.
//
// Script clásico, node puro, sin dependencias externas (npm install está
// prohibido: la red está vetada, .harness/plan.md sección 1 TRADEOFF).
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var BUILD_DIR = path.join(ROOT, 'build');
var OUT_DIR = path.join(ROOT, 'prototype');
var OUT_FILE = path.join(OUT_DIR, 'index.html');

function leerFuente(nombreArchivo) {
  return fs.readFileSync(path.join(BUILD_DIR, nombreArchivo), 'utf8');
}

// Envuelve el contenido LITERAL de un módulo fuente en un <script> inline.
// El contenido ya es un script clásico IIFE (plan.md 3.A): se inyecta tal
// cual, sin transformar ni una sola línea.
function bloqueScript(idBloque, contenidoLiteral) {
  return '<script id="' + idBloque + '">\n' + contenidoLiteral + '\n</script>';
}

// Une varios bloques <script> con un salto de línea entre cada uno, para
// que un solo marcador pueda resolverse en más de un módulo consecutivo
// (caso de <!-- INJECT:vistas-a -->, que ahora carga motor + docs + la
// vista propiamente dicha, en ese orden -- ver nota Adendum R5 arriba).
function bloquesScript(lista) {
  var piezas = [];
  for (var i = 0; i < lista.length; i++) {
    piezas.push(bloqueScript(lista[i].idBloque, lista[i].contenido));
  }
  return piezas.join('\n');
}

// Ensambla el documento completo en memoria a partir de los diez fuentes
// en disco (cinco originales de T-006 + motor_recomendacion.js y
// documentos.js de R5 + almacen.js de R8/R9 + seguridad.js y
// vista_rutina.js de R10). Función pura respecto del sistema de archivos:
// siempre lee, nunca escribe. Permite que build/checks.js la reutilice
// para verificar idempotencia sin invocar un segundo proceso node.
function ensamblar() {
  var shellHtml = leerFuente('shell.html');

  var inyecciones = [
    {
      // Adendum R10 (T-055, C-5): hz-seguridad como SEGUNDO bloque (entre
      // hz-data y hz-almacen) -- ver nota arriba.
      marcador: '<!-- INJECT:data -->',
      bloques: [
        { idBloque: 'hz-data', contenido: leerFuente('data.js') },
        { idBloque: 'hz-seguridad', contenido: leerFuente('seguridad.js') },
        { idBloque: 'hz-almacen', contenido: leerFuente('almacen.js') }
      ]
    },
    {
      marcador: '<!-- INJECT:charts -->',
      bloques: [{ idBloque: 'hz-charts', contenido: leerFuente('charts.js') }]
    },
    {
      // Orden congelado por el task T-024, extendido por el Adendum R10
      // (T-055, C-5): motor y docs van DESPUÉS de charts y ANTES de
      // vistas; hz-vista-rutina cierra el marcador como CUARTO bloque --
      // ver nota arriba.
      marcador: '<!-- INJECT:vistas-a -->',
      bloques: [
        { idBloque: 'hz-motor', contenido: leerFuente('motor_recomendacion.js') },
        { idBloque: 'hz-docs', contenido: leerFuente('documentos.js') },
        { idBloque: 'hz-vistas-a', contenido: leerFuente('vista_dieta_supl.js') },
        { idBloque: 'hz-vista-rutina', contenido: leerFuente('vista_rutina.js') }
      ]
    },
    {
      marcador: '<!-- INJECT:vistas-b -->',
      bloques: [{ idBloque: 'hz-vistas-b', contenido: leerFuente('vista_metricas.js') }]
    }
  ];

  var salida = shellHtml;
  for (var i = 0; i < inyecciones.length; i++) {
    var inyeccion = inyecciones[i];
    var partes = salida.split(inyeccion.marcador);
    if (partes.length - 1 !== 1) {
      throw new Error(
        'marcador ' + inyeccion.marcador + ' esperado exactamente 1 vez en build/shell.html, ' +
        'encontrado ' + (partes.length - 1) + ' veces'
      );
    }
    salida = partes.join(bloquesScript(inyeccion.bloques));
  }

  if (salida.indexOf('<!-- INJECT:') !== -1) {
    throw new Error('quedó un marcador <!-- INJECT: sin sustituir tras el ensamble');
  }

  return salida;
}

function main() {
  var html = ensamblar();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html, 'utf8');
  console.log('prototype/index.html generado (' + html.length + ' caracteres).');
}

if (require.main === module) {
  main();
}

module.exports = { ensamblar: ensamblar, OUT_FILE: OUT_FILE, BUILD_DIR: BUILD_DIR };
