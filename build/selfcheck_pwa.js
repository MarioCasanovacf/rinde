/* build/selfcheck_pwa.js
 * Selfcheck de node puro (sin dependencias externas) para los assets PWA de
 * Rinde (Adendum R8 punto 3, plan.md). Formato de salida congelado
 * (plan.md 3.J): última línea de stdout es el literal "checks ejecutados: N";
 * exit 0 solo si todas las aserciones pasan; en fallo, exit 1 e imprime la
 * aserción fallida antes de salir.
 *
 * Cubre: existencia y tamaño de los 7 archivos del POSEE de T-037 (menos
 * este propio selfcheck), dimensiones exactas de los 4 PNG leídas del header
 * IHDR (bytes 16-23, big endian, vía fs — sin librería de imágenes),
 * manifest.webmanifest válido con los campos congelados, sw.js con sintaxis
 * válida (new Function() + node --check) que declara el cache 'rinde-v1' y
 * no referencia ningún host externo, y el SVG fuente del icono sin la
 * palabra "Herzon" (la marca visible es Rinde, R7).
 */
'use strict';

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

var RAIZ = path.join(__dirname, '..');

var checks = 0;

function falla(mensaje) {
  console.error('ASERCIÓN FALLIDA: ' + mensaje);
  process.exit(1);
}

function assert(condicion, mensaje) {
  checks++;
  if (!condicion) {
    falla(mensaje);
  }
}

function assertIgual(real, esperado, mensaje) {
  assert(real === esperado, mensaje + ' (esperado ' + JSON.stringify(esperado) + ', obtuvo ' + JSON.stringify(real) + ')');
}

var REGEX_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/u;
var REGEX_HTTP_EXTERNO = /https?:\/\//;

// ---------------------------------------------------------------------
// 0. Existencia y tamaño > 0 de los 7 archivos del POSEE (sin contar este
//    propio selfcheck).
// ---------------------------------------------------------------------
var ARCHIVOS = [
  'build/icono_rinde.svg',
  'prototype/manifest.webmanifest',
  'prototype/sw.js',
  'prototype/icon-512.png',
  'prototype/icon-192.png',
  'prototype/icon-180.png',
  'prototype/favicon-32.png'
];

var rutasAbsolutas = {};

ARCHIVOS.forEach(function (relativo) {
  var absoluto = path.join(RAIZ, relativo);
  rutasAbsolutas[relativo] = absoluto;
  var existe = fs.existsSync(absoluto);
  assert(existe, 'debe existir el archivo ' + relativo);
  if (existe) {
    var tamano = fs.statSync(absoluto).size;
    assert(tamano > 0, 'el archivo ' + relativo + ' debe tener tamaño > 0 (obtuvo ' + tamano + ')');
  }
});

// ---------------------------------------------------------------------
// 1. Dimensiones EXACTAS de los 4 PNG, leídas del header IHDR (bytes 16-23,
//    big endian) con fs puro, sin dependencias de imágenes.
// ---------------------------------------------------------------------
var FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

var DIMENSIONES_ESPERADAS = {
  'prototype/icon-512.png': 512,
  'prototype/icon-192.png': 192,
  'prototype/icon-180.png': 180,
  'prototype/favicon-32.png': 32
};

Object.keys(DIMENSIONES_ESPERADAS).forEach(function (relativo) {
  var esperado = DIMENSIONES_ESPERADAS[relativo];
  var buffer = fs.readFileSync(rutasAbsolutas[relativo]);
  var firmaOk = buffer.length >= 24 && buffer.slice(0, 8).equals(FIRMA_PNG);
  assert(firmaOk, relativo + ' debe traer la firma PNG estándar en sus primeros 8 bytes');
  var ancho = buffer.readUInt32BE(16);
  var alto = buffer.readUInt32BE(20);
  assertIgual(ancho, esperado, relativo + ': ancho IHDR (bytes 16-19)');
  assertIgual(alto, esperado, relativo + ': alto IHDR (bytes 20-23)');
});

// ---------------------------------------------------------------------
// 2. manifest.webmanifest: JSON válido con los campos congelados por el
//    Adendum R8 punto 3.
// ---------------------------------------------------------------------
var textoManifest = fs.readFileSync(rutasAbsolutas['prototype/manifest.webmanifest'], 'utf8');
var manifest;
try {
  manifest = JSON.parse(textoManifest);
  checks++;
} catch (error) {
  falla('prototype/manifest.webmanifest debe ser JSON válido (' + error.message + ')');
}

assertIgual(manifest.name, 'Rinde', 'manifest.name');
assertIgual(manifest.short_name, 'Rinde', 'manifest.short_name');
assertIgual(manifest.lang, 'es-MX', 'manifest.lang');
assertIgual(manifest.display, 'standalone', 'manifest.display');
assertIgual(manifest.start_url, './', 'manifest.start_url');
assertIgual(manifest.scope, './', 'manifest.scope');
assertIgual(manifest.background_color, '#fcfcfb', 'manifest.background_color');
assertIgual(manifest.theme_color, '#2a78d6', 'manifest.theme_color');

assert(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest.icons debe ser un arreglo no vacío');

var icono192Any = manifest.icons.some(function (icono) {
  return icono.sizes === '192x192' && icono.purpose === 'any';
});
var icono512Any = manifest.icons.some(function (icono) {
  return icono.sizes === '512x512' && icono.purpose === 'any';
});
var algunoMaskable = manifest.icons.some(function (icono) {
  return typeof icono.purpose === 'string' && icono.purpose.indexOf('maskable') !== -1;
});
assert(icono192Any, 'manifest.icons debe traer una entrada 192x192 con purpose "any"');
assert(icono512Any, 'manifest.icons debe traer una entrada 512x512 con purpose "any"');
assert(algunoMaskable, 'manifest.icons debe traer al menos una entrada con purpose "maskable"');

manifest.icons.forEach(function (icono, indice) {
  assert(typeof icono.src === 'string' && icono.src.indexOf('./') === 0, 'manifest.icons[' + indice + '].src debe ser una ruta relativa al mismo origen (./...)');
});

assert(!REGEX_EMOJI.test(textoManifest), 'manifest.webmanifest no debe contener emojis');

// ---------------------------------------------------------------------
// 3. sw.js: sintaxis válida (new Function() y node --check), declara el
//    cache 'rinde-v1' (contiene "rinde-v") y no referencia ningún host
//    externo (sin "http://" ni "https://").
// ---------------------------------------------------------------------
var textoSw = fs.readFileSync(rutasAbsolutas['prototype/sw.js'], 'utf8');

try {
  // eslint-disable-next-line no-new-func
  new Function(textoSw);
  checks++;
} catch (error) {
  falla('prototype/sw.js debe compilar con new Function() (' + error.message + ')');
}

var resultadoNodeCheck = childProcess.spawnSync(process.execPath, ['--check', rutasAbsolutas['prototype/sw.js']]);
assertIgual(resultadoNodeCheck.status, 0, 'prototype/sw.js debe pasar `node --check` (stderr: ' + (resultadoNodeCheck.stderr ? resultadoNodeCheck.stderr.toString().trim() : '') + ')');

assert(textoSw.indexOf('rinde-v') !== -1, 'prototype/sw.js debe declarar el cache "rinde-v..." (contener la cadena "rinde-v")');
assert(!REGEX_HTTP_EXTERNO.test(textoSw), 'prototype/sw.js no debe contener referencias http(s) externas');
assert(!REGEX_EMOJI.test(textoSw), 'prototype/sw.js no debe contener emojis');

// ---------------------------------------------------------------------
// 4. build/icono_rinde.svg: sin la palabra "Herzon" (la marca visible es
//    Rinde, R7) y sin emojis; fondo con el hex autorizado por el Adendum R8.
// ---------------------------------------------------------------------
var textoSvg = fs.readFileSync(rutasAbsolutas['build/icono_rinde.svg'], 'utf8');

assert(textoSvg.indexOf('Herzon') === -1, 'build/icono_rinde.svg no debe contener la palabra "Herzon"');
assert(!REGEX_EMOJI.test(textoSvg), 'build/icono_rinde.svg no debe contener emojis');
assert(textoSvg.toLowerCase().indexOf('#2a78d6') !== -1, 'build/icono_rinde.svg debe usar el fondo #2a78d6 autorizado por el Adendum R8');
assert(textoSvg.indexOf('<svg') !== -1, 'build/icono_rinde.svg debe ser un documento SVG');

// ---------------------------------------------------------------------
console.log('checks ejecutados: ' + checks);
process.exit(0);
