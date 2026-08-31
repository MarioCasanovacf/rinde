// build/selfcheck_shell.js
// Comando de aceptación EXACTO (T-002): node build/selfcheck_shell.js
// Node puro, sin dependencias externas, sin red (npm install imposible).
// Formato de salida (plan.md 3.J): última línea de stdout literal
// "checks ejecutados: N"; exit 0 solo si todas las aserciones pasan;
// en fallo, exit 1 e imprime la aserción fallida.

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var SHELL_PATH = path.join(__dirname, 'shell.html');

var checks = 0;

function fail(desc, extra) {
  console.error('FALLO: ' + desc + (extra ? ' -- ' + extra : ''));
  console.log('checks ejecutados: ' + checks);
  process.exit(1);
}

function assert(cond, desc, extra) {
  checks += 1;
  if (!cond) { fail(desc, extra); }
}

// ---------------------------------------------------------------
// 0. Lectura del archivo
// ---------------------------------------------------------------
var html;
try {
  html = fs.readFileSync(SHELL_PATH, 'utf8');
} catch (e) {
  console.error('FALLO: build/shell.html no existe o no se pudo leer -- ' + e.message);
  console.log('checks ejecutados: 0');
  process.exit(1);
}
assert(typeof html === 'string' && html.length > 0, 'build/shell.html existe y es legible');

// ---------------------------------------------------------------
// 1. Bloques <script>: extraer y compilar cada uno con vm.Script
//    (chequeo de sintaxis, un check por bloque).
// ---------------------------------------------------------------
var scriptBlocks = [];
var scriptRe = /<script([^>]*)>([\s\S]*?)<\/script>/g;
var sm;
while ((sm = scriptRe.exec(html))) {
  scriptBlocks.push({ attrs: sm[1], body: sm[2] });
}
assert(scriptBlocks.length === 2, 'hay exactamente 2 bloques <script> (hz-runtime y hz-boot)', 'encontrados=' + scriptBlocks.length);

for (var si = 0; si < scriptBlocks.length; si++) {
  (function (idx) {
    var block = scriptBlocks[idx];
    var ok = true;
    var errMsg = '';
    try {
      new vm.Script(block.body, { filename: 'shell-script-' + idx + '.js' });
    } catch (e) {
      ok = false;
      errMsg = e.message;
    }
    assert(ok, 'bloque <script> #' + idx + ' compila (vm.Script, chequeo de sintaxis)', errMsg);
  })(si);
}

var runtimeBlock = null;
var bootBlock = null;
for (var bi = 0; bi < scriptBlocks.length; bi++) {
  if (/id\s*=\s*["']hz-runtime["']/.test(scriptBlocks[bi].attrs)) { runtimeBlock = scriptBlocks[bi]; }
  if (/id\s*=\s*["']hz-boot["']/.test(scriptBlocks[bi].attrs)) { bootBlock = scriptBlocks[bi]; }
}
assert(runtimeBlock !== null, 'existe <script id="hz-runtime">');
assert(bootBlock !== null, 'existe <script id="hz-boot">');

var runtimeSrc = runtimeBlock ? runtimeBlock.body : '';

// ---------------------------------------------------------------
// 2. Documento base
// ---------------------------------------------------------------
assert(/^<!DOCTYPE html>/i.test(html.trim()), 'el documento empieza con <!DOCTYPE html>');
assert(/<html[^>]*\blang="es"/.test(html), '<html> declara lang="es"');
assert(/<title>[^<]*Herzon[^<]*<\/title>/.test(html), '<title> menciona Herzon');

// ---------------------------------------------------------------
// 3. Header (nombre Herzon, paciente, período, etiqueta sintética)
// ---------------------------------------------------------------
assert(/<header class="hz-header">/.test(html), 'existe <header class="hz-header">');
assert(/<span class="hz-header-nombre">Herzon<\/span>/.test(html), 'el header muestra el nombre Herzon');
assert(/id="hz-paciente-nombre"/.test(html), 'el header tiene el contenedor del paciente activo (#hz-paciente-nombre)');
assert(/id="hz-periodo"/.test(html) && /12 semanas/.test(html), 'el header tiene el período de 12 semanas (#hz-periodo)');
assert(/id="hz-badge-sintetico"[^>]*>[^<]*[Ss]int[eé]tic/.test(html), 'el header tiene una etiqueta visible de datos sintéticos (acepta con o sin tilde en la "e")');
assert(/id="toggle-tema"/.test(html), 'existe el toggle de tema #toggle-tema');

// ---------------------------------------------------------------
// 4. Tablist accesible: 5 pestañas
// ---------------------------------------------------------------
assert(/role="tablist"/.test(html), 'existe un contenedor [role="tablist"]');
var TAB_LABELS = {
  resumen: 'Resumen',
  perfil: 'Perfil',
  plan: 'Plan de dieta',
  seguimiento: 'Seguimiento',
  suplementos: 'Suplementos'
};
var TAB_ORDER = ['resumen', 'perfil', 'plan', 'seguimiento', 'suplementos'];

TAB_ORDER.forEach(function (id, idx) {
  var re = new RegExp(
    '<button[^>]*id="tab-' + id + '"[^>]*role="tab"[^>]*aria-selected="(true|false)"[^>]*aria-controls="vista-' + id + '"[^>]*tabindex="(-?\\d+)"[^>]*>' +
    TAB_LABELS[id] + '</button>'
  );
  var m = re.exec(html);
  assert(m !== null, 'pestaña #tab-' + id + ' existe con role=tab, aria-selected, aria-controls=vista-' + id + ' y su etiqueta correcta');
  if (m) {
    var expectSelected = (idx === 0) ? 'true' : 'false';
    var expectTabindex = (idx === 0) ? '0' : '-1';
    assert(m[1] === expectSelected, 'pestaña #tab-' + id + ' tiene aria-selected="' + expectSelected + '" por defecto');
    assert(m[2] === expectTabindex, 'pestaña #tab-' + id + ' tiene tabindex roving="' + expectTabindex + '" por defecto');
  }
});

// ---------------------------------------------------------------
// 5. Cinco tabpanels
// ---------------------------------------------------------------
TAB_ORDER.forEach(function (id, idx) {
  var re = new RegExp(
    '<section id="vista-' + id + '" class="hz-vista" role="tabpanel" aria-labelledby="tab-' + id + '"( hidden)?>'
  );
  var m = re.exec(html);
  assert(m !== null, 'contenedor #vista-' + id + ' existe con role=tabpanel y aria-labelledby=tab-' + id);
  if (m) {
    var isHidden = !!m[1];
    var expectHidden = (idx !== 0);
    assert(isHidden === expectHidden, '#vista-' + id + ' tiene el atributo hidden correcto en el estado inicial (activo=' + (idx === 0) + ')');
  }
});

// ---------------------------------------------------------------
// 6. Fila de filtros #filtro-rango
// ---------------------------------------------------------------
assert(/<div id="filtro-rango" class="hz-filtros"( hidden)?>/.test(html), 'existe #filtro-rango con clase hz-filtros');
[4, 8, 12].forEach(function (w) {
  var re = new RegExp('<button[^>]*class="hz-filtro-btn"[^>]*data-weeks="' + w + '"');
  assert(re.test(html), 'filtro-rango tiene un botón con data-weeks="' + w + '"');
});
assert(/data-weeks="12"\s+aria-pressed="true"/.test(html), 'el filtro de 12 semanas está activo por defecto (aria-pressed="true")');

// El filtro-rango NO debe estar anidado dentro de un elemento con clase hz-card.
// Análisis estructural acotado a la región estática del documento (antes del
// primer <script>), para no confundir el parseo de tags con código JS.
var firstScriptIdx = html.indexOf('<script');
var staticRegion = firstScriptIdx > -1 ? html.slice(0, firstScriptIdx) : html;

function ancestorsOf(fragment, id) {
  var VOID_TAGS = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };
  var tagRe = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g;
  var stack = [];
  var found = null;
  var m2;
  while ((m2 = tagRe.exec(fragment))) {
    if (m2[0].slice(0, 4) === '<!--') { continue; }
    var closing = m2[1] === '/';
    var name = m2[2].toLowerCase();
    var attrs = m2[3] || '';
    var selfClose = m2[4] === '/' || VOID_TAGS[name];
    if (closing) {
      for (var i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) { stack.length = i; break; }
      }
      continue;
    }
    var idMatch = /\bid=["']([^"']+)["']/.exec(attrs);
    var classMatch = /\bclass=["']([^"']*)["']/.exec(attrs);
    var node = { name: name, id: idMatch ? idMatch[1] : null, cls: classMatch ? classMatch[1] : '' };
    if (node.id === id && found === null) {
      found = stack.slice();
    }
    if (!selfClose) { stack.push(node); }
  }
  return found;
}

var filtroAncestors = ancestorsOf(staticRegion, 'filtro-rango');
assert(filtroAncestors !== null, 'se pudo localizar #filtro-rango en el árbol estático del documento');
if (filtroAncestors !== null) {
  var nestedInCard = filtroAncestors.some(function (node) {
    return (' ' + node.cls + ' ').indexOf(' hz-card ') !== -1;
  });
  assert(!nestedInCard, '#filtro-rango NO está anidado dentro de un elemento con clase hz-card');
}

// ---------------------------------------------------------------
// 7. Marcadores de inyección: presentes exactamente una vez, en orden,
//    hz-runtime antes del primero, hz-boot después del último.
// ---------------------------------------------------------------
var MARKERS = ['<!-- INJECT:data -->', '<!-- INJECT:charts -->', '<!-- INJECT:vistas-a -->', '<!-- INJECT:vistas-b -->'];
var markerIdx = [];
MARKERS.forEach(function (marker) {
  var count = html.split(marker).length - 1;
  assert(count === 1, 'el marcador ' + marker + ' aparece exactamente una vez', 'apariciones=' + count);
  markerIdx.push(html.indexOf(marker));
});
assert(markerIdx[0] < markerIdx[1] && markerIdx[1] < markerIdx[2] && markerIdx[2] < markerIdx[3], 'los marcadores INJECT aparecen en el orden data -> charts -> vistas-a -> vistas-b');

var runtimeTagIdx = html.indexOf('<script id="hz-runtime">');
var bootTagIdx = html.indexOf('<script id="hz-boot">');
assert(runtimeTagIdx > -1 && runtimeTagIdx < markerIdx[0], '<script id="hz-runtime"> aparece ANTES del primer marcador INJECT');
assert(bootTagIdx > -1 && bootTagIdx > markerIdx[3], '<script id="hz-boot"> aparece DESPUÉS del último marcador INJECT');

// ---------------------------------------------------------------
// 8. APIs del runtime (Herzon.registerView, boot, filters, theme)
// ---------------------------------------------------------------
assert(/Herzon\.registerView\s*=\s*function/.test(runtimeSrc), 'Herzon.registerView(id, mountFn) está publicado en hz-runtime');
assert(/entry\.mounted\s*=\s*true/.test(runtimeSrc) && /entry\.mounted\)/.test(runtimeSrc), 'el montaje de vistas es perezoso y una sola vez (guardia de "mounted")');
assert(/Herzon\.boot\s*=\s*function/.test(runtimeSrc), 'Herzon.boot() está publicado en hz-runtime');
assert(/Herzon\.filters\s*=\s*\{/.test(runtimeSrc), 'Herzon.filters está publicado en hz-runtime');
assert(/getRange:\s*function[^}]*return rangeWeeks/.test(runtimeSrc), 'Herzon.filters.getRange() devuelve el estado interno de rango');
assert(/var rangeWeeks\s*=\s*12/.test(runtimeSrc), 'Herzon.filters.getRange() tiene default 12');
assert(/onRangeChange:\s*function/.test(runtimeSrc), 'Herzon.filters.onRangeChange(cb) está publicado');
assert(/Herzon\.theme\s*=\s*\{/.test(runtimeSrc), 'Herzon.theme está publicado en hz-runtime');
assert(/get:\s*function/.test(runtimeSrc), 'Herzon.theme.get() está publicado');
assert(/set:\s*function\s*\(t\)/.test(runtimeSrc) && /documentElement\.setAttribute\('data-theme', t\)/.test(runtimeSrc), 'Herzon.theme.set(t) fija data-theme en <html>');
assert(/\(typeof window !== 'undefined'\) \? window : globalThis/.test(runtimeSrc), 'hz-runtime usa el preámbulo idempotente G = window||globalThis (plan.md 3.A)');
assert(/G\.Herzon = G\.Herzon \|\| \{\}/.test(runtimeSrc), 'hz-runtime no asume que otro módulo ya creó Herzon (G.Herzon = G.Herzon || {})');

// ---------------------------------------------------------------
// 9. Teclado en el tablist
// ---------------------------------------------------------------
assert(/ev\.key === 'ArrowRight'/.test(runtimeSrc), 'flecha derecha mueve/activa pestañas');
assert(/ev\.key === 'ArrowLeft'/.test(runtimeSrc), 'flecha izquierda mueve/activa pestañas');
assert(/ev\.key === 'Home'/.test(runtimeSrc), 'Home mueve/activa a la primera pestaña');
assert(/ev\.key === 'End'/.test(runtimeSrc), 'End mueve/activa a la última pestaña');
assert(/ev\.key === 'Enter' \|\| ev\.key === ' ' \|\| ev\.key === 'Spacebar'/.test(runtimeSrc), 'Enter/Espacio activan la pestaña enfocada');
assert(/addEventListener\('keydown', onTablistKeydown\)/.test(runtimeSrc), 'el tablist está cableado a un manejador de teclado');

// ---------------------------------------------------------------
// 10. Tres scopes de tema, literales, en el orden correcto
// ---------------------------------------------------------------
assert(html.indexOf('@media (prefers-color-scheme: dark)') > -1, 'existe literalmente @media (prefers-color-scheme: dark)');
assert(html.indexOf(':root[data-theme="dark"]') > -1, 'existe literalmente :root[data-theme="dark"]');
assert(html.indexOf(':root[data-theme="light"]') > -1, 'existe literalmente :root[data-theme="light"]');

var idxBaseRoot = html.indexOf(':root {');
var idxMediaDark = html.indexOf('@media (prefers-color-scheme: dark)');
var idxAttrDark = html.indexOf(':root[data-theme="dark"]');
var idxAttrLight = html.indexOf(':root[data-theme="light"]');
assert(idxBaseRoot > -1 && idxBaseRoot < idxMediaDark && idxMediaDark < idxAttrDark && idxAttrDark < idxAttrLight,
  'los 4 bloques de tokens aparecen en orden: :root base -> @media dark -> [data-theme=dark] -> [data-theme=light]');

// ---------------------------------------------------------------
// 11. Tokens: comparación literal de hexes contra el contrato sec. 2 y 3.K
// ---------------------------------------------------------------
function extractBlock(source, startNeedle) {
  var start = source.indexOf(startNeedle);
  if (start === -1) { return ''; }
  var braceStart = source.indexOf('{', start);
  if (braceStart === -1) { return ''; }
  var depth = 0;
  for (var i = braceStart; i < source.length; i++) {
    if (source[i] === '{') { depth++; }
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { return source.slice(braceStart + 1, i); }
    }
  }
  return '';
}

var mediaDarkOuter = extractBlock(html, '@media (prefers-color-scheme: dark)');
var mediaDarkRoot = extractBlock(mediaDarkOuter, ':root {');
var attrDarkBlock = extractBlock(html, ':root[data-theme="dark"]');
var attrLightBlock = extractBlock(html, ':root[data-theme="light"]');
var baseRootBlock = extractBlock(html.slice(0, idxMediaDark), ':root {');

assert(mediaDarkRoot.length > 0, 'el bloque @media dark contiene un :root { ... } con tokens');
assert(attrDarkBlock.length > 0, 'el bloque :root[data-theme="dark"] tiene contenido');
assert(attrLightBlock.length > 0, 'el bloque :root[data-theme="light"] tiene contenido');
assert(baseRootBlock.length > 0, 'el bloque :root base (default) tiene contenido');

// Lista de hexes embebida (contrato sec. 2 y 3.K) -- FINAL, no se re-litiga.
var TOKENS = [
  { name: '--page', light: '#f9f9f7', dark: '#0d0d0d' },
  { name: '--surface-1', light: '#fcfcfb', dark: '#1a1a19' },
  { name: '--text-primary', light: '#0b0b0b', dark: '#ffffff' },
  { name: '--text-secondary', light: '#52514e', dark: '#c3c2b7' },
  { name: '--text-muted', light: '#898781', dark: '#898781' },
  { name: '--grid', light: '#e1e0d9', dark: '#2c2c2a' },
  { name: '--axis', light: '#c3c2b7', dark: '#383835' },
  { name: '--delta-good', light: '#006300', dark: '#0ca30c' },
  { name: '--series-1', light: '#2a78d6', dark: '#3987e5' },
  { name: '--series-2', light: '#eb6834', dark: '#d95926' },
  { name: '--series-3', light: '#1baf7a', dark: '#199e70' },
  { name: '--series-4', light: '#eda100', dark: '#c98500' },
  { name: '--series-5', light: '#e87ba4', dark: '#d55181' },
  { name: '--status-good', light: '#0ca30c', dark: '#0ca30c' },
  { name: '--status-warning', light: '#fab219', dark: '#fab219' },
  { name: '--status-serious', light: '#ec835a', dark: '#ec835a' },
  { name: '--status-critical', light: '#d03b3b', dark: '#d03b3b' },
  { name: '--heat-1', light: '#6da7ec', dark: '#9ec5f4' },
  { name: '--heat-2', light: '#3987e5', dark: '#6da7ec' },
  { name: '--heat-3', light: '#2a78d6', dark: '#3987e5' },
  { name: '--heat-4', light: '#1c5cab', dark: '#2a78d6' },
  { name: '--heat-5', light: '#104281', dark: '#1c5cab' }
];

function tokenDeclared(block, name, value) {
  var re = new RegExp('(^|\\s)' + name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + ':\\s*' + value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + ';');
  return re.test(block);
}

TOKENS.forEach(function (tok) {
  var lightOk = tokenDeclared(attrLightBlock, tok.name, tok.light) && tokenDeclared(baseRootBlock, tok.name, tok.light);
  assert(lightOk, 'token ' + tok.name + ' = ' + tok.light + ' en modo claro (bloque base y :root[data-theme="light"])');
  var darkOk = tokenDeclared(attrDarkBlock, tok.name, tok.dark) && tokenDeclared(mediaDarkRoot, tok.name, tok.dark);
  assert(darkOk, 'token ' + tok.name + ' = ' + tok.dark + ' en modo oscuro (bloque @media dark y :root[data-theme="dark"])');
});

// --border es rgba (no hex) pero forma parte del contrato sec. 2: se verifica su presencia.
assert(/--border:\s*rgba\(11,\s*11,\s*11,\s*0\.10\);/.test(attrLightBlock), '--border tiene el valor claro del contrato (rgba(11,11,11,0.10))');
assert(/--border:\s*rgba\(255,\s*255,\s*255,\s*0\.10\);/.test(attrDarkBlock), '--border tiene el valor oscuro del contrato (rgba(255,255,255,0.10))');

// ---------------------------------------------------------------
// 12. Todas las clases congeladas de plan.md 3.G tienen regla CSS
// ---------------------------------------------------------------
var styleBlockMatch = /<style>([\s\S]*?)<\/style>/.exec(html);
assert(styleBlockMatch !== null, 'existe un único bloque <style> (dueño único de todo el CSS)');
var cssText = styleBlockMatch ? styleBlockMatch[1] : '';

var FROZEN_CLASSES = [
  'hz-card', 'hz-card-title', 'hz-grid', 'hz-hero', 'hz-hero-num', 'hz-hero-label',
  'hz-stat', 'hz-stat-label', 'hz-stat-num', 'hz-stat-delta', 'hz-delta-good', 'hz-delta-bad',
  'hz-spark', 'hz-chart', 'hz-chart-title', 'hz-legend', 'hz-legend-item', 'hz-legend-swatch',
  'hz-table-toggle', 'hz-table-wrap', 'hz-table', 'hz-tooltip', 'hz-crosshair',
  'hz-status-dot', 'hz-status-label', 'hz-filtros', 'hz-filtro-btn', 'hz-nota', 'hz-form',
  'hz-form-campo', 'hz-badge'
];

function hasClassSelector(css, cls) {
  var re = new RegExp('\\.' + cls.replace(/-/g, '\\-') + '(?![a-zA-Z0-9_-])');
  return re.test(css);
}

FROZEN_CLASSES.forEach(function (cls) {
  assert(hasClassSelector(cssText, cls), 'clase congelada .' + cls + ' tiene una regla CSS definida');
});

// ---------------------------------------------------------------
// 13. Tipografía: system-ui en body; tabular-nums SOLO en tabla y ticks de eje
// ---------------------------------------------------------------
assert(/font-family:\s*system-ui,\s*-apple-system,\s*"Segoe UI",\s*sans-serif;/.test(cssText), 'body usa la pila tipográfica system-ui del contrato');

var tabularOccurrences = cssText.match(/font-variant-numeric:\s*tabular-nums;/g) || [];
assert(tabularOccurrences.length === 2, 'font-variant-numeric: tabular-nums aparece exactamente 2 veces (tabla + ticks de eje)', 'encontradas=' + tabularOccurrences.length);

var tableRuleBlock = extractBlock(cssText, '.hz-table {');
var axisTickRuleBlock = extractBlock(cssText, '.hz-axis-tick {');
assert(/tabular-nums/.test(tableRuleBlock), '.hz-table incluye tabular-nums');
assert(/tabular-nums/.test(axisTickRuleBlock), '.hz-axis-tick incluye tabular-nums');

var bodyRuleBlock = extractBlock(cssText, 'body {');
var heroNumRuleBlock = extractBlock(cssText, '.hz-hero-num {');
var rootBaseForTabular = baseRootBlock;
assert(!/tabular-nums/.test(bodyRuleBlock), 'body NO usa tabular-nums');
assert(!/tabular-nums/.test(heroNumRuleBlock), '.hz-hero-num NO usa tabular-nums');
assert(!/tabular-nums/.test(rootBaseForTabular), ':root NO usa tabular-nums');

// ---------------------------------------------------------------
// 14. Responsive: max-width:100%, overflow-x:auto solo en .hz-table-wrap
// ---------------------------------------------------------------
assert(/max-width:\s*100%;/.test(cssText), 'existe al menos una regla con max-width:100%');
var tableWrapBlock = extractBlock(cssText, '.hz-table-wrap {');
assert(/overflow-x:\s*auto;/.test(tableWrapBlock), '.hz-table-wrap tiene overflow-x:auto');
assert(!/overflow-x/.test(bodyRuleBlock), 'body NO tiene overflow-x (nunca en el body)');

// ---------------------------------------------------------------
// 15. Higiene: cero red, cero emojis, cero stroke-dasharray
// ---------------------------------------------------------------
assert(html.indexOf('<script src=') === -1, 'cero "<script src=" en el documento');
assert(html.indexOf('<link rel="stylesheet"') === -1, 'cero "<link rel=\\"stylesheet\\"" en el documento');
assert(html.indexOf('@import') === -1, 'cero @import en el documento');
assert(html.indexOf('url(http') === -1, 'cero url(http en el documento');
assert(html.indexOf('fetch(') === -1, 'cero fetch( en el documento');
assert(html.indexOf('http://') === -1, 'cero http:// en el documento');
assert(html.indexOf('https://') === -1, 'cero https:// en el documento');
assert(html.indexOf('stroke-dasharray') === -1, 'cero stroke-dasharray en el documento (grid hairline solida)');

var EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
assert(!EMOJI_RE.test(html), 'cero emojis en el documento');

// ---------------------------------------------------------------
// 16. Cero hexes literales fuera del bloque de tokens del shell
// ---------------------------------------------------------------
var styleStart = cssText.indexOf(':root {');
var lastTokenBlockEnd = idxAttrLight === -1 ? -1 : (function () {
  var braceStart = html.indexOf('{', idxAttrLight);
  var depth = 0;
  for (var i = braceStart; i < html.length; i++) {
    if (html[i] === '{') { depth++; }
    else if (html[i] === '}') { depth--; if (depth === 0) { return i; } }
  }
  return -1;
})();
assert(lastTokenBlockEnd > -1, 'se pudo delimitar el final del último bloque de tokens (:root[data-theme="light"])');

var cssAfterTokens = '';
if (lastTokenBlockEnd > -1) {
  var styleTagEnd = html.indexOf('</style>');
  cssAfterTokens = html.slice(lastTokenBlockEnd + 1, styleTagEnd);
}
// Adendum R5 (T-021): el bloque @media print agrega un 5o bloque de
// tokens legitimo (:root dentro de @media print, mismos nombres, mismos
// valores claros del contrato, sobre-escritura aditiva con !important
// para que el documento imprimible nunca herede el tema oscuro). Se
// excluye ese sub-bloque específico del escaneo -- cualquier OTRO hex
// fuera de él (incluidas las reglas hz-reco-*/hz-doc-* nuevas) sigue
// siendo motivo de rechazo.
var cssAfterTokensParaEscaneo = cssAfterTokens;
var printOuterBlockParaEscaneo = extractBlock(html, '@media print {');
if (printOuterBlockParaEscaneo.length > 0) {
  var printRootBlockParaEscaneo = extractBlock(printOuterBlockParaEscaneo, ':root {');
  if (printRootBlockParaEscaneo.length > 0) {
    cssAfterTokensParaEscaneo = cssAfterTokensParaEscaneo.split(printRootBlockParaEscaneo).join('');
  }
}
var strayHex = /#[0-9a-fA-F]{3,8}\b/.exec(cssAfterTokensParaEscaneo);
assert(strayHex === null, 'cero hexes literales en reglas de componentes (fuera de los 4 bloques de tokens y del 5o bloque :root de @media print, Adendum R5)', strayHex ? strayHex[0] : '');

// ---------------------------------------------------------------
// 17. Namespace disjunto: hz-runtime NO define Herzon.Charts/.Views/HERZON_DATA
// ---------------------------------------------------------------
assert(!/Herzon\.Charts\s*=/.test(runtimeSrc), 'hz-runtime no invade el namespace Herzon.Charts (dueño T-003)');
assert(!/Herzon\.Views\s*=/.test(runtimeSrc), 'hz-runtime no invade el namespace Herzon.Views (dueño T-004/T-005)');
assert(!/HERZON_DATA\s*=/.test(runtimeSrc), 'hz-runtime no define HERZON_DATA (dueño T-001), solo lo lee si existe');

// ---------------------------------------------------------------
// 18. QA-R1 anti-regresión D4 (piso ACTUALIZADO por Adendum R6, fini-6):
//     grids con wrap (auto-fit/minmax) y tablas con su propio
//     overflow-x:auto.
//
//     R6 (fini-6, alcance shell de T-026) baja el piso de 300px a 260px
//     para que las 4 stat tiles de Resumen (IMC / Grasa corporal / Cintura
//     / Adherencia) quepan en UNA fila a 1240px sin dejar la última
//     huérfana en su propia fila (con 300px solo entraban 3 por fila:
//     3*300 + 2*16 = 932px de 1176px disponibles, la 4a se iba sola).
//     Aritmética que preserva la garantía original de D4 ("nunca 5 cards
//     forzadas en una fila a 1240px"): a 1240px el contenido disponible es
//     1240 - 2*32 (padding lateral clamp(...,32px) de .hz-main) = 1176px;
//     con piso 260px caben 4 columnas (4*260 + 3*16 = 1088 <= 1176) pero
//     NUNCA 5 (5*260 + 4*16 = 1364 > 1176) -- D4 sigue sin poder regresar,
//     solo se relaja lo suficiente para el caso de 4 tiles de fini-6. El
//     piso previamente prohibido de 220px (el que sí permitía 5 en una
//     fila) sigue prohibido.
// ---------------------------------------------------------------
var gridRuleBlock = extractBlock(cssText, '.hz-grid {');
assert(gridRuleBlock.length > 0, '.hz-grid tiene una regla CSS con contenido (D4)');
assert(/auto-fit/.test(gridRuleBlock), '.hz-grid usa auto-fit en grid-template-columns (D4: wrap en vez de forzar todas las cards en una fila)');
assert(/minmax\(/.test(gridRuleBlock), '.hz-grid usa minmax() en grid-template-columns (D4)');
assert(
  /minmax\(\s*min\(\s*260px\s*,\s*100%\s*\)\s*,\s*1fr\s*\)/.test(gridRuleBlock),
  '.hz-grid tiene piso de 260px por columna (min(260px, 100%)) que colapsa a 100% del contenedor en viewports angostos (R6/fini-6: 4 stat tiles de Resumen caben en una fila a 1240px; D4: nunca 5 cards en una fila a 1240px; D6: nunca desborda a <=420px)'
);
assert(!/minmax\(\s*220px/.test(gridRuleBlock), '.hz-grid ya NO usa el piso de 220px que permitía 5 cards forzadas en una sola fila a 1240px (regresión D4, ver aritmética arriba)');
assert(!/minmax\(\s*min\(\s*300px/.test(gridRuleBlock), '.hz-grid ya NO usa el piso previo de 300px de R1-R5 (R6/fini-6 lo relaja a 260px a propósito para cerrar la huérfana de 4 stat tiles, ver justificación aritmética arriba)');

var cardRuleBlockD4 = extractBlock(cssText, '.hz-card {');
assert(/min-width:\s*0;/.test(cardRuleBlockD4), '.hz-card tiene min-width:0 (evita que el contenido de una card -- p.ej. una tabla ancha -- fuerce el track del grid a desbordar en vez de hacer scroll propio, D4)');

assert(/overflow-x:\s*auto;/.test(tableWrapBlock), '.hz-table-wrap conserva overflow-x:auto (D4: todo contenedor de tabla scrollea en su propio wrapper, regla del contrato sección 1, nunca en el body)');
assert(tableWrapBlock.length > 0, '.hz-table-wrap tiene una regla CSS con contenido (D4, anti-regresión)');

// ---------------------------------------------------------------
// 19. QA-R1 anti-regresión D6: padding lateral consistente (chrome del
//     shell) en viewports angostos (<=420px), sin texto pegado al borde.
// ---------------------------------------------------------------
var PADDED_CHROME_BLOCKS = [
  { needle: '.hz-header {', label: 'header (marca, paciente, toggle de tema)' },
  { needle: '.hz-tablist {', label: 'tablist (pestañas)' },
  { needle: '.hz-main {', label: 'main (contenido de las vistas)' },
  { needle: '.hz-footer {', label: 'footer (nota "Acerca de este prototipo")' }
];
PADDED_CHROME_BLOCKS.forEach(function (item) {
  var block = extractBlock(cssText, item.needle);
  assert(block.length > 0, item.label + ' tiene una regla CSS con contenido');
  assert(
    /clamp\(12px,\s*4vw,\s*32px\)/.test(block),
    item.label + ' usa el mismo padding lateral clamp(12px, 4vw, 32px) (D6: consistente entre secciones, piso de 12px que nunca deja texto pegado al borde en <=420px)'
  );
});

// ---------------------------------------------------------------
// 20. QA-R1 anti-regresión D1: español con tildes en los 2 strings
//     visibles de shell.html (badge sintético y nota del footer).
// ---------------------------------------------------------------
assert(
  /id="hz-badge-sintetico"[^>]*>Datos sintéticos</.test(html),
  'el badge #hz-badge-sintetico dice "Datos sintéticos" con tilde (D1, anti-regresión)'
);
assert(
  /id="hz-nota-prototipo">Acerca de este prototipo: interfaz de demostración con datos sintéticos generados con fines ilustrativos; no sustituye valoración clínica ni nutriológica real\.<\/p>/.test(html),
  'la nota del footer #hz-nota-prototipo usa español con tildes completas (demostración, sintéticos, valoración, clínica, nutriológica) (D1, anti-regresión)'
);

// ---------------------------------------------------------------
// 21. Adendum R4 (T-017): layout del menú del día (Plan de dieta).
//     Clases nuevas SOLO con prefijo hz-menu- (plan.md Adendum R4 punto 2,
//     regla 3.G); cada una tiene su regla CSS definida aquí en shell.html.
// ---------------------------------------------------------------
var MENU_CLASSES_R4 = [
  'hz-menu-fila', 'hz-menu-lista', 'hz-menu-item', 'hz-menu-hora',
  'hz-menu-nombre', 'hz-menu-momento', 'hz-menu-platillo', 'hz-menu-kcal',
  'hz-menu-macros', 'hz-menu-macro-seg', 'hz-menu-total',
  'hz-menu-total-label', 'hz-menu-total-macros', 'hz-menu-total-kcal'
];
MENU_CLASSES_R4.forEach(function (cls) {
  assert(cls.indexOf('hz-menu-') === 0, 'clase nueva ' + cls + ' lleva el único prefijo autorizado por el Adendum R4 (hz-menu-)');
  assert(hasClassSelector(cssText, cls), 'clase nueva .' + cls + ' (Adendum R4, menú del día) tiene una regla CSS definida en build/shell.html');
});

var menuFilaBlock = extractBlock(cssText, '.hz-menu-fila {');
assert(menuFilaBlock.length > 0, '.hz-menu-fila tiene una regla CSS con contenido');
// Corrección R4 (intento 2, rechazo del verifier por hueco muerto en el
// grid superior): la card del menú ya NO vive dentro de .hz-grid (evita que
// auto-fit deje columnas usadas-en-otra-fila sin colapsar); vive como
// hermana de .hz-grid dentro de .hz-vista (flex column, gap:20px,
// congelado 3.G) y solo declara su propio ancho completo con width:100%.
assert(/width:\s*100%;/.test(menuFilaBlock), '.hz-menu-fila ocupa fila de ancho completo (width:100%) fuera del grid superior, tal como pide el criterio de aceptación de T-017 sin dejar huecos muertos en las demás cards (corrección R4)');
assert(!/grid-column/.test(menuFilaBlock), '.hz-menu-fila ya no usa grid-column: 1 / -1 (corrección R4: el menú vive fuera de .hz-grid, no como ítem de ese grid)');

var menuNombreBlock = extractBlock(cssText, '.hz-menu-nombre {');
assert(menuNombreBlock.length > 0, '.hz-menu-nombre tiene una regla CSS con contenido');
assert(/white-space:\s*normal;/.test(menuNombreBlock), '.hz-menu-nombre fuerza white-space:normal: el platillo del menú NO hereda el nowrap de .hz-table, el texto envuelve (criterio de aceptación T-017)');
assert(!/nowrap/.test(menuNombreBlock), '.hz-menu-nombre no contiene "nowrap" en ninguna forma (ausencia de truncado por nowrap en el menú)');

var menuMacrosBlock = extractBlock(cssText, '.hz-menu-macros {');
assert(menuMacrosBlock.length > 0, '.hz-menu-macros tiene una regla CSS con contenido');
assert(/gap:\s*2px;/.test(menuMacrosBlock), '.hz-menu-macros usa gap:2px entre los segmentos de la mini barra apilada de macros (regla 5 del contrato de diseño)');

// Anti-regresión: .hz-table conserva su white-space:nowrap original -- solo
// el nuevo menú del día queda exento de heredarlo, ninguna otra tabla del
// prototipo cambia de comportamiento.
var tableCellRuleBlockR4 = extractBlock(cssText, '.hz-table th, .hz-table td {');
assert(tableCellRuleBlockR4.length > 0, '.hz-table th, .hz-table td conserva una regla CSS con contenido (anti-regresión R4)');
assert(/white-space:\s*nowrap;/.test(tableCellRuleBlockR4), 'anti-regresión R4: .hz-table conserva white-space:nowrap (solo el menú del día deja de ser tabla, el resto del prototipo no cambia)');

// ---------------------------------------------------------------
// 22. Adendum R5 (T-021): recomendador (hz-reco-*), herramientas de
//     documentos + documento imprimible (hz-doc-*) y bloque @media
//     print. T-022 y T-023 NO poseen build/shell.html, así que este es
//     el set congelado de contenedores y estilos que consumen.
// ---------------------------------------------------------------
var RECO_CLASSES_R5 = [
  'hz-reco-panel', 'hz-reco-form', 'hz-reco-resumen', 'hz-reco-lista',
  'hz-reco-item', 'hz-reco-rank', 'hz-reco-nombre', 'hz-reco-score',
  'hz-reco-score-barra', 'hz-reco-score-fill', 'hz-reco-razones',
  'hz-reco-acciones', 'hz-reco-slider'
];
var DOC_CLASSES_R5 = [
  'hz-doc-herramientas', 'hz-doc-btn', 'hz-doc-import', 'hz-doc-import-label',
  'hz-doc-documento', 'hz-doc-titulo', 'hz-doc-meta', 'hz-doc-seccion',
  'hz-doc-seccion-titulo', 'hz-doc-pie'
];

RECO_CLASSES_R5.forEach(function (cls) {
  assert(cls.indexOf('hz-reco-') === 0, 'clase nueva ' + cls + ' lleva el único prefijo autorizado por el Adendum R5 para el recomendador (hz-reco-)');
  assert(hasClassSelector(cssText, cls), 'clase nueva .' + cls + ' (Adendum R5, recomendador) tiene una regla CSS definida en build/shell.html');
});
DOC_CLASSES_R5.forEach(function (cls) {
  assert(cls.indexOf('hz-doc-') === 0, 'clase nueva ' + cls + ' lleva el único prefijo autorizado por el Adendum R5 para documentos (hz-doc-)');
  assert(hasClassSelector(cssText, cls), 'clase nueva .' + cls + ' (Adendum R5, documentos) tiene una regla CSS definida en build/shell.html');
});

// 22.1 Cero clases nuevas fuera de hz-reco-/hz-doc-: se enumeran TODOS
// los selectores de clase del bloque <style> (comentarios fuera, para no
// confundir "shell.html" o "vista_dieta_supl.js" en la prosa de un
// comentario con un selector real) y cada uno debe pertenecer al set
// previamente congelado (frozen + menu R4 + utilidades de chrome) o
// empezar con hz-reco- / hz-doc-.
var CHROME_UTILITY_CLASSES = [
  'hz-axis-tick', 'hz-filtros-label', 'hz-footer', 'hz-header',
  'hz-header-brand', 'hz-header-meta', 'hz-header-nombre', 'hz-main',
  'hz-tab', 'hz-tablist', 'hz-toggle-tema', 'hz-vista'
];
var cssTextSinComentarios = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
var classSelectorRe = /\.([a-zA-Z][a-zA-Z0-9-]*)/g;
var classesEnCss = {};
var cmSel;
while ((cmSel = classSelectorRe.exec(cssTextSinComentarios))) { classesEnCss[cmSel[1]] = true; }
var KNOWN_PREEXISTING = {};
FROZEN_CLASSES.concat(MENU_CLASSES_R4).concat(CHROME_UTILITY_CLASSES).forEach(function (c) { KNOWN_PREEXISTING[c] = true; });
Object.keys(classesEnCss).sort().forEach(function (cls) {
  var esConocida = !!KNOWN_PREEXISTING[cls];
  var esRecoODoc = (cls.indexOf('hz-reco-') === 0) || (cls.indexOf('hz-doc-') === 0);
  assert(esConocida || esRecoODoc, 'la clase .' + cls + ' definida en build/shell.html es previamente conocida o lleva prefijo hz-reco-/hz-doc- (cero clases nuevas fuera de esos dos prefijos, Adendum R5)');
});
assert(Object.keys(classesEnCss).length >= 78, 'el bloque <style> define al menos 78 selectores de clase distintos (frozen + menú R4 + chrome + reco + doc)', 'encontrados=' + Object.keys(classesEnCss).length);

// 22.2 Contenedor #reco-plan: dentro de #vista-plan, hz-card + hz-reco-panel, vacío.
assert(/<div id="reco-plan" class="hz-card hz-reco-panel"><\/div>/.test(html), '#reco-plan existe, vacío, con clases "hz-card hz-reco-panel"');
var recoPlanAncestors = ancestorsOf(staticRegion, 'reco-plan');
assert(recoPlanAncestors !== null, 'se pudo localizar #reco-plan en el árbol estático del documento');
if (recoPlanAncestors !== null) {
  var recoDentroDeVistaPlan = recoPlanAncestors.some(function (node) { return node.id === 'vista-plan'; });
  assert(recoDentroDeVistaPlan, '#reco-plan está anidado dentro de #vista-plan (Adendum R5 punto 5)');
}

// 22.3 Contenedor #doc-herramientas: primer hijo estático de #vista-seguimiento,
// NO anidado dentro de una card, con los 3 botones + control de importar.
assert(
  /<section id="vista-seguimiento"[^>]*>\s*<!--[\s\S]*?-->\s*<div id="doc-herramientas" class="hz-doc-herramientas">/.test(html),
  '#doc-herramientas es el primer elemento dentro de #vista-seguimiento (arriba de las cards que T-005 agrega vía appendChild)'
);
var docHerramientasAncestors = ancestorsOf(staticRegion, 'doc-herramientas');
assert(docHerramientasAncestors !== null, 'se pudo localizar #doc-herramientas en el árbol estático del documento');
if (docHerramientasAncestors !== null) {
  var docDentroDeSeguimiento = docHerramientasAncestors.some(function (node) { return node.id === 'vista-seguimiento'; });
  assert(docDentroDeSeguimiento, '#doc-herramientas está anidado dentro de #vista-seguimiento');
  var docAnidadoEnCard = docHerramientasAncestors.some(function (node) { return (' ' + node.cls + ' ').indexOf(' hz-card ') !== -1; });
  assert(!docAnidadoEnCard, '#doc-herramientas NO está anidado dentro de un elemento con clase hz-card (consistente con la regla de #filtro-rango)');
}

assert(/<button type="button" id="hz-doc-btn-imprimir" class="hz-doc-btn">Imprimir \/ PDF<\/button>/.test(html), 'botón #hz-doc-btn-imprimir existe con clase hz-doc-btn y texto "Imprimir / PDF"');
assert(/<button type="button" id="hz-doc-btn-descargar-plan" class="hz-doc-btn">Descargar plan \(\.html\)<\/button>/.test(html), 'botón #hz-doc-btn-descargar-plan existe con clase hz-doc-btn y texto "Descargar plan (.html)"');
assert(/<button type="button" id="hz-doc-btn-descargar-datos" class="hz-doc-btn">Descargar datos \(\.csv\)<\/button>/.test(html), 'botón #hz-doc-btn-descargar-datos existe con clase hz-doc-btn y texto "Descargar datos (.csv)"');
assert(/<label for="hz-doc-input-importar" class="hz-doc-import-label">Importar mediciones \(\.csv\)<\/label>/.test(html), 'label #hz-doc-input-importar (hz-doc-import-label) existe con texto "Importar mediciones (.csv)"');
assert(/<input type="file" id="hz-doc-input-importar" accept="\.csv,text\/csv">/.test(html), 'input[type=file] #hz-doc-input-importar existe con accept=".csv,text/csv"');

// 22.4 Contenedor #documento-plan: al final del body, DESPUÉS de hz-boot,
// clase hz-doc-documento, vacío (T-023 lo llena vía JS).
var bootScriptCloseIdx = html.indexOf('</script>', bootTagIdx);
var documentoPlanIdx = html.indexOf('<div id="documento-plan"');
var bodyCloseIdx = html.indexOf('</body>');
assert(documentoPlanIdx > -1 && documentoPlanIdx > bootScriptCloseIdx, '#documento-plan aparece DESPUÉS del cierre de <script id="hz-boot">');
assert(bodyCloseIdx > -1 && documentoPlanIdx < bodyCloseIdx, '#documento-plan aparece ANTES de </body>');
var tailDespuesDeDocumento = html.slice(documentoPlanIdx);
assert(/^<div id="documento-plan" class="hz-doc-documento"><\/div>\s*<\/body>\s*<\/html>\s*$/.test(tailDespuesDeDocumento), '#documento-plan es literalmente el ÚLTIMO elemento del body (vacío, clase hz-doc-documento, nada más entre él y </body>)');

// 22.5 Bloque @media print: existe, aparece DESPUÉS de los 4 bloques de
// tokens y contiene la regla que oculta todo menos #documento-plan.
var idxMediaPrint = html.indexOf('@media print');
assert(idxMediaPrint > -1 && idxMediaPrint > idxAttrLight, '@media print aparece DESPUÉS de los 4 bloques de tokens (:root base, @media dark, [data-theme=dark], [data-theme=light])');

var printOuterBlock = extractBlock(html, '@media print {');
assert(printOuterBlock.length > 0, 'el bloque @media print tiene contenido');
assert(
  /body\s*>\s*\*:not\(#documento-plan\)\s*\{\s*display:\s*none\s*!important;\s*\}/.test(printOuterBlock),
  '@media print oculta TODO excepto #documento-plan con "body > *:not(#documento-plan) { display: none !important; }"'
);

var printRootBlock = extractBlock(printOuterBlock, ':root {');
assert(printRootBlock.length > 0, '@media print tiene un bloque :root { ... } que sobre-escribe tokens para impresión');

var PRINT_FORCED_LIGHT_NAMES = ['--page', '--surface-1', '--text-primary', '--text-secondary', '--text-muted', '--grid', '--axis', '--delta-good', '--delta-bad', '--series-1', '--series-2', '--series-3', '--series-4', '--series-5'];
TOKENS.filter(function (tok) { return PRINT_FORCED_LIGHT_NAMES.indexOf(tok.name) !== -1; }).forEach(function (tok) {
  var re = new RegExp('(^|\\s)' + tok.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + ':\\s*' + tok.light.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '\\s*!important;');
  assert(re.test(printRootBlock), '@media print fuerza ' + tok.name + ' = ' + tok.light + ' !important (valor de modo CLARO, "documento siempre claro para impresión", Adendum R5 punto 5)');
});
assert(/--border:\s*rgba\(11,\s*11,\s*11,\s*0\.10\)\s*!important;/.test(printRootBlock), '@media print fuerza --border al valor claro !important');
assert(/--shadow-card:\s*none\s*!important;/.test(printRootBlock), '@media print fuerza --shadow-card: none !important (sin sombras en el documento impreso)');

// Ningún hex de modo OSCURO se cuela en el bloque de impresión.
var DARK_HEXES_MUESTRA = ['#0d0d0d', '#1a1a19', '#ffffff', '#2c2c2a'];
DARK_HEXES_MUESTRA.forEach(function (hex) {
  assert(printRootBlock.indexOf(hex) === -1, '@media print NO contiene el hex de modo oscuro ' + hex + ' (el documento nunca es oscuro)');
});

assert(/\.hz-doc-documento\s*\{\s*display:\s*block;/.test(printOuterBlock), '@media print pone .hz-doc-documento en display:block (visible solo al imprimir)');
var docDocumentoBaseBlock = extractBlock(cssText, '.hz-doc-documento { display: none;');
// La regla base (fuera de @media print) esconde el documento en pantalla.
assert(/\.hz-doc-documento\s*\{\s*display:\s*none;\s*\}/.test(cssText), '.hz-doc-documento tiene display:none como regla base (oculto en pantalla, fuera de @media print)');

// Nota: el check #16 (arriba) ya excluye este mismo printRootBlock antes
// de escanear hexes sueltos, así que cualquier OTRO hex fuera de él
// (incluidas las reglas hz-reco-*/hz-doc-* nuevas) ya queda cubierto ahí;
// no se repite el escaneo aquí para no duplicar el mismo assert.

// ---------------------------------------------------------------
// 23. Adendum R6 (T-026): refinamiento Justesse (modo preserve). Una
//     aserción de presencia del selector + valor clave por cada regla
//     nueva del alcance shell (plan.md 3.J: aserciones nuevas para cada
//     regla agregada). Los 4 bloques de tokens no se tocan en esta
//     sección (ya cubiertos por los checks 10-11 y 22.5 arriba).
// ---------------------------------------------------------------

// 23.1 jera-3/fini-3: el slider del recomendador dentro de un campo del
// formulario deja de estirarse verticalmente.
var recoSliderEnCampoBlock = extractBlock(cssText, '.hz-form-campo .hz-reco-slider {');
assert(recoSliderEnCampoBlock.length > 0, '.hz-form-campo .hz-reco-slider (R6 jera-3/fini-3) tiene una regla CSS con contenido');
assert(/flex:\s*0 0 auto;/.test(recoSliderEnCampoBlock), '.hz-form-campo .hz-reco-slider fija flex: 0 0 auto (R6 jera-3/fini-3: ya no se estira ~200px de alto en layout vertical)');
assert(/width:\s*100%;/.test(recoSliderEnCampoBlock), '.hz-form-campo .hz-reco-slider fija width: 100% (R6 jera-3/fini-3: ocupa el ancho del campo)');
assert(/min-width:\s*0;/.test(recoSliderEnCampoBlock), '.hz-form-campo .hz-reco-slider fija min-width: 0 (R6 jera-3/fini-3)');

// 23.2 jera-4: reasignación de token en prosa secundaria (--text-muted ->
// --text-secondary); --text-muted queda solo para ejes/labels de gráfica.
var notaBlockR6 = extractBlock(cssText, '.hz-nota {');
assert(notaBlockR6.length > 0, '.hz-nota (R6 jera-4) tiene una regla CSS con contenido');
assert(/color:\s*var\(--text-secondary\);/.test(notaBlockR6), '.hz-nota usa color: var(--text-secondary) (R6 jera-4: prosa 4.5:1, ya no --text-muted)');
assert(!/var\(--text-muted\)/.test(notaBlockR6), '.hz-nota ya NO referencia var(--text-muted) (R6 jera-4, anti-regresión)');

var docPieBlockR6 = extractBlock(cssText, '.hz-doc-pie {');
assert(docPieBlockR6.length > 0, '.hz-doc-pie (R6 jera-4) tiene una regla CSS con contenido');
assert(/color:\s*var\(--text-secondary\);/.test(docPieBlockR6), '.hz-doc-pie usa color: var(--text-secondary) (R6 jera-4: prosa 4.5:1, ya no --text-muted)');
assert(!/var\(--text-muted\)/.test(docPieBlockR6), '.hz-doc-pie ya NO referencia var(--text-muted) (R6 jera-4, anti-regresión)');

var axisTickBlockR6 = extractBlock(cssText, '.hz-axis-tick {');
assert(/var\(--text-muted\)|fill:\s*var\(--axis\)/.test(axisTickBlockR6) === true || /fill:\s*var\(--axis\)/.test(axisTickBlockR6), '.hz-axis-tick conserva su tinta de eje (anti-regresión R6 jera-4: --text-muted queda reservado para ejes/labels de gráfica, no se retira de ahí)');

// 23.3 prod-7/fini-7: gramática de botones. Radius 8px en acciones
// one-shot; píldora 999px reservada a .hz-badge y .hz-filtro-btn. Disabled
// + hover/focus-visible garantizados en toda acción.
var docBtnBlockR6 = extractBlock(cssText, '.hz-doc-btn {');
assert(docBtnBlockR6.length > 0, '.hz-doc-btn tiene una regla CSS con contenido');
assert(/border-radius:\s*8px;/.test(docBtnBlockR6), '.hz-doc-btn usa border-radius: 8px (R6 prod-7/fini-7: familia rectangular de acciones one-shot)');
assert(!/border-radius:\s*999px;/.test(docBtnBlockR6), '.hz-doc-btn ya NO usa border-radius: 999px (R6 prod-7/fini-7: la píldora queda reservada a .hz-badge y .hz-filtro-btn)');

// Needle anclado a inicio de línea: ".hz-doc-import-label {" también
// aparece como sufijo del selector compuesto ".hz-doc-import:focus-within
// .hz-doc-import-label {" (varias líneas antes); sin el "\n" inicial,
// extractBlock encontraría ESE bloque primero por ser una simple
// coincidencia de subcadena.
var docImportLabelBlockR6 = extractBlock(cssText, '\n.hz-doc-import-label {');
assert(docImportLabelBlockR6.length > 0, '.hz-doc-import-label tiene una regla CSS con contenido');
assert(/border-radius:\s*8px;/.test(docImportLabelBlockR6), '.hz-doc-import-label usa border-radius: 8px (R6 prod-7/fini-7)');
assert(!/border-radius:\s*999px;/.test(docImportLabelBlockR6), '.hz-doc-import-label ya NO usa border-radius: 999px (R6 prod-7/fini-7)');

var badgeBlockR6 = extractBlock(cssText, '.hz-badge {');
assert(/border-radius:\s*999px;/.test(badgeBlockR6), '.hz-badge conserva border-radius: 999px (R6 prod-7/fini-7: la píldora queda reservada a chips, anti-regresión)');
var filtroBtnBlockR6 = extractBlock(cssText, '.hz-filtro-btn {');
assert(/border-radius:\s*999px;/.test(filtroBtnBlockR6), '.hz-filtro-btn conserva border-radius: 999px (R6 prod-7/fini-7: la píldora queda reservada a filtros, anti-regresión)');

var disabledBlockR6 = extractBlock(cssText, '.hz-doc-btn:disabled,');
assert(disabledBlockR6.length > 0, 'existe una regla de estado disabled para .hz-doc-btn/.hz-doc-import-label/.hz-table-toggle (R6 prod-7/fini-7, Adendum R6 punto 6)');
assert(/opacity:\s*0\.5;/.test(disabledBlockR6), 'la regla disabled (R6 prod-7/fini-7) fija opacity (atenúa la acción deshabilitada)');
assert(/cursor:\s*default;/.test(disabledBlockR6), 'la regla disabled (R6 prod-7/fini-7) fija cursor: default');
assert(/\.hz-table-toggle:disabled/.test(cssText), 'el selector combinado de disabled incluye .hz-table-toggle (R6: "garantizado en todas las acciones")');

assert(/\.hz-doc-btn:hover/.test(cssText), '.hz-doc-btn conserva :hover (R6: hover garantizado en todas las acciones)');
assert(/\.hz-doc-btn:focus-visible/.test(cssText), '.hz-doc-btn conserva :focus-visible (R6: focus-visible garantizado en todas las acciones)');
assert(/\.hz-doc-import-label:hover/.test(cssText), '.hz-doc-import-label conserva :hover (R6: hover garantizado en todas las acciones)');
assert(/\.hz-doc-import-label:focus-visible\s*\{/.test(cssText), '.hz-doc-import-label tiene :focus-visible propio (R6: focus-visible garantizado en todas las acciones)');
assert(/\.hz-table-toggle:hover/.test(cssText), '.hz-table-toggle conserva :hover (anti-regresión, familia de acciones)');
assert(/\.hz-table-toggle:focus-visible/.test(cssText), '.hz-table-toggle conserva :focus-visible (anti-regresión, familia de acciones)');

// 23.4 fini-5/resp-2: color-scheme sigue al toggle en ambas direcciones.
// Regla nueva ADITIVA con el MISMO selector que el bloque de tokens
// (`:root[data-theme="dark"]`/`:root[data-theme="light"]` ya existen para
// los hexes, congelados, sección 3); esta es una segunda declaración
// independiente solo con `color-scheme`, así que se verifica por patrón
// literal en cssText en vez de vía extractBlock (que devolvería el
// PRIMER bloque -- el de tokens, sin tocar -- y no esta regla nueva).
assert(
  /:root\[data-theme="dark"\]\s*\{\s*color-scheme:\s*dark;\s*\}/.test(cssText),
  'existe la regla nueva :root[data-theme="dark"] { color-scheme: dark; } (R6 fini-5/resp-2: la UI nativa -- p.ej. el track del slider -- cambia de tema con el toggle; no modifica el bloque de tokens congelado, es una regla aditiva independiente con el mismo selector)'
);
assert(
  /:root\[data-theme="light"\]\s*\{\s*color-scheme:\s*light;\s*\}/.test(cssText),
  'existe la regla nueva :root[data-theme="light"] { color-scheme: light; } (R6 fini-5/resp-2: espejo del lado claro, regla aditiva independiente)'
);
var htmlBaseBlockR6 = extractBlock(cssText, 'html {');
assert(/color-scheme:\s*light dark;/.test(htmlBaseBlockR6), 'html conserva color-scheme: light dark como default SIN toggle (R6 fini-5/resp-2: el toggle solo gana cuando está activo, anti-regresión)');

// 23.5 fini-8: las tabs no se desplazan al activarse -- peso constante.
var tabBlockR6 = extractBlock(cssText, '.hz-tab {');
assert(/font-weight:\s*600;/.test(tabBlockR6), '.hz-tab fija font-weight: 600 constante en todo estado (R6 fini-8: la métrica bold queda reservada, no salta al activar)');
var tabActivoBlockR6 = extractBlock(cssText, '.hz-tab[aria-selected="true"] {');
assert(tabActivoBlockR6.length > 0, '.hz-tab[aria-selected="true"] tiene una regla CSS con contenido');
assert(!/font-weight/.test(tabActivoBlockR6), '.hz-tab[aria-selected="true"] ya NO declara font-weight propio (R6 fini-8: el peso es constante, viene de .hz-tab base, cero salto de ancho al activar)');
assert(/border-bottom-color:\s*var\(--series-1\);/.test(tabActivoBlockR6), '.hz-tab[aria-selected="true"] conserva el subrayado con acento series-1 (R6 fini-8: se mantiene el indicador visual de estado activo)');
assert(/color:\s*var\(--text-primary\);/.test(tabActivoBlockR6), '.hz-tab[aria-selected="true"] conserva el cambio de color a --text-primary (R6 fini-8)');

// 23.6 resp-3: targets táctiles >=44px en pantallas táctiles o angostas.
assert(html.indexOf('@media (pointer: coarse), (max-width: 640px)') > -1, 'existe literalmente @media (pointer: coarse), (max-width: 640px) (R6 resp-3)');
var tactilBlockR6 = extractBlock(cssText, '@media (pointer: coarse), (max-width: 640px) {');
assert(tactilBlockR6.length > 0, 'el bloque de media query táctil (R6 resp-3) tiene contenido');
assert(/min-height:\s*44px;/.test(tactilBlockR6), 'el bloque táctil (R6 resp-3) fija min-height: 44px');
['hz-filtro-btn', 'hz-doc-btn', 'hz-doc-import-label', 'hz-table-toggle'].forEach(function (cls) {
  assert(hasClassSelector(tactilBlockR6, cls), 'el bloque táctil (R6 resp-3) incluye el selector .' + cls);
});

// 23.7 resp-4: reglas de salto de página dentro del @media print existente.
assert(/\.hz-doc-seccion\s*>\s*p\s*\{\s*break-after:\s*avoid-page;\s*\}/.test(printOuterBlock), '@media print tiene ".hz-doc-seccion > p { break-after: avoid-page; }" (R6 resp-4: un párrafo de sección no queda solo al pie de página)');
assert(/\.hz-doc-seccion\s+\.hz-table-wrap\s*\{\s*break-inside:\s*avoid-page;\s*overflow-x:\s*visible;\s*\}/.test(printOuterBlock), '@media print tiene ".hz-doc-seccion .hz-table-wrap { break-inside: avoid-page; overflow-x: visible; }" (R6 resp-4: tabla no se parte entre páginas y su scroll de pantalla no aplica al imprimir)');

// 23.8 Adendum R6 punto 1: regla data-ancho="completo" (consumida por
// T-028/T-029 vía setAttribute; primer consumidor: régimen de suplementos).
assert(/\.hz-grid\s*>\s*\[data-ancho="completo"\]\s*\{\s*grid-column:\s*1\s*\/\s*-1;\s*\}/.test(cssText), 'existe la regla .hz-grid > [data-ancho="completo"] { grid-column: 1 / -1; } (Adendum R6 punto 1)');

// 23.9 fini-6 (parte shell): verificación aritmética de que el piso NUEVO
// de .hz-grid deja entrar 4 columnas a 1240px (contenido disponible =
// 1240 - 2*32 de padding lateral clamp(...,32px) de .hz-main) pero NUNCA
// 5 (D4 no regresa). Ligado al valor real extraído de la regla, no a un
// número hardcodeado dos veces.
var floorMatchR6 = /minmax\(\s*min\(\s*(\d+)px/.exec(gridRuleBlock);
assert(floorMatchR6 !== null, 'se pudo extraer el piso numérico de .hz-grid para verificar la aritmética de fini-6');
if (floorMatchR6 !== null) {
  var floorPxR6 = parseInt(floorMatchR6[1], 10);
  var contenidoA1240R6 = 1240 - 2 * 32;
  assert(4 * floorPxR6 + 3 * 16 <= contenidoA1240R6, 'con el piso actual de .hz-grid (' + floorPxR6 + 'px), 4 columnas caben en una fila a 1240px (fini-6: 4*piso + 3*gap <= ' + contenidoA1240R6 + 'px de contenido disponible)');
  assert(5 * floorPxR6 + 4 * 16 > contenidoA1240R6, 'con el piso actual de .hz-grid (' + floorPxR6 + 'px), 5 columnas NO caben en una fila a 1240px (D4 no regresa)');
}

console.log('checks ejecutados: ' + checks);
process.exit(0);
