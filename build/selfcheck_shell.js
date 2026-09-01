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
assert(scriptBlocks.length === 3, 'hay exactamente 3 bloques <script> (hz-runtime, hz-boot y hz-sw-registro, Adendum R8)', 'encontrados=' + scriptBlocks.length);

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
var swRegistroBlock = null;
for (var bi = 0; bi < scriptBlocks.length; bi++) {
  if (/id\s*=\s*["']hz-runtime["']/.test(scriptBlocks[bi].attrs)) { runtimeBlock = scriptBlocks[bi]; }
  if (/id\s*=\s*["']hz-boot["']/.test(scriptBlocks[bi].attrs)) { bootBlock = scriptBlocks[bi]; }
  if (/id\s*=\s*["']hz-sw-registro["']/.test(scriptBlocks[bi].attrs)) { swRegistroBlock = scriptBlocks[bi]; }
}
assert(runtimeBlock !== null, 'existe <script id="hz-runtime">');
assert(bootBlock !== null, 'existe <script id="hz-boot">');
assert(swRegistroBlock !== null, 'existe <script id="hz-sw-registro"> (Adendum R8 punto 2)');

var runtimeSrc = runtimeBlock ? runtimeBlock.body : '';

// ---------------------------------------------------------------
// 2. Documento base
// ---------------------------------------------------------------
assert(/^<!DOCTYPE html>/i.test(html.trim()), 'el documento empieza con <!DOCTYPE html>');
assert(/<html[^>]*\blang="es"/.test(html), '<html> declara lang="es"');
assert(/<title>[^<]*Rinde[^<]*<\/title>/.test(html), '<title> menciona Rinde');

// ---------------------------------------------------------------
// 3. Header (nombre Herzon, paciente, período, etiqueta sintética)
// ---------------------------------------------------------------
assert(/<header class="hz-header">/.test(html), 'existe <header class="hz-header">');
assert(/<span class="hz-header-nombre">Rinde<\/span>/.test(html), 'el header muestra el nombre Rinde');
assert(/<select id="hz-cliente-selector" class="hz-selector-cliente" aria-label="Cliente activo"><\/select>/.test(html), 'el header tiene el selector de cliente activo (#hz-cliente-selector, Adendum R9/MC-03; reemplaza al span #hz-paciente-nombre, sin options ni lógica aquí -- las puebla T-045)');
assert(!/id="hz-paciente-nombre"/.test(html), 'el header ya NO tiene el span #hz-paciente-nombre (MC-03: reemplazado por el select #hz-cliente-selector)');
assert(/id="hz-periodo"/.test(html) && /12 semanas/.test(html), 'el header tiene el período de 12 semanas (#hz-periodo)');
assert(/id="hz-modo-datos"[^>]*>Modo demo</.test(html), 'el header tiene el badge de modo demo (#hz-modo-datos, texto inicial "Modo demo", Adendum R9/PR-02, decisión C1: supersede "Datos sintéticos"/"DATOS SINTETICOS")');
assert(/id="toggle-tema"/.test(html), 'existe el toggle de tema #toggle-tema');

// ---------------------------------------------------------------
// 4. Tablist accesible: 6 pestañas (Adendum R10, R-01.1/R-01.3: sexta
//    pestaña Rutina entre Plan de dieta y Seguimiento)
// ---------------------------------------------------------------
assert(/role="tablist"/.test(html), 'existe un contenedor [role="tablist"]');
var TAB_LABELS = {
  resumen: 'Resumen',
  perfil: 'Perfil',
  plan: 'Plan de dieta',
  rutina: 'Rutina',
  seguimiento: 'Seguimiento',
  suplementos: 'Suplementos'
};
var TAB_ORDER = ['resumen', 'perfil', 'plan', 'rutina', 'seguimiento', 'suplementos'];

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
// 5. Seis tabpanels (Adendum R10, R-01.2)
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
// 13. Tipografía: system-ui en body; tabular-nums en tabla, ticks de eje y
//     -- desde Adendum R10 -- inputs numéricos de formulario (F-01.7) y
//     la dosis de la rutina (R-01.5, .hz-rutina-dosis)
// ---------------------------------------------------------------
assert(/font-family:\s*system-ui,\s*-apple-system,\s*"Segoe UI",\s*sans-serif;/.test(cssText), 'body usa la pila tipográfica system-ui del contrato');

var tabularOccurrences = cssText.match(/font-variant-numeric:\s*tabular-nums;/g) || [];
assert(tabularOccurrences.length === 4, 'font-variant-numeric: tabular-nums aparece exactamente 4 veces (tabla + ticks de eje + F-01.7 input[type=number] de formulario + R-01.5 .hz-rutina-dosis)', 'encontradas=' + tabularOccurrences.length);

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
// El namespace XML de SVG (xmlns='http://www.w3.org/2000/svg', requerido por
// el estándar SVG en CUALQUIER <svg>, incluido el favicon inline del
// Adendum R8) es texto inerte -- nunca una petición de red -- así que se
// descuenta explícitamente antes de buscar http(s):// reales en el resto
// del documento (cero red sigue siendo la regla; esto no la debilita).
var htmlSinNamespaceSvg = html.split("xmlns='http://www.w3.org/2000/svg'").join('');
assert(html.split("http://www.w3.org/2000/svg").length - 1 === (html.match(/xmlns=['"]http:\/\/www\.w3\.org\/2000\/svg['"]/g) || []).length, 'toda ocurrencia de "http://www.w3.org/2000/svg" en el documento es un xmlns de SVG (namespace inerte, no red)');
assert(htmlSinNamespaceSvg.indexOf('http://') === -1, 'cero http:// en el documento (fuera del xmlns inerte de SVG)');
assert(htmlSinNamespaceSvg.indexOf('https://') === -1, 'cero https:// en el documento (fuera del xmlns inerte de SVG)');
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
// 20. QA-R1 anti-regresión D1 (pin actualizado en Adendum R9/PR-02/PR-03):
//     español con tildes en los 2 strings visibles de shell.html (badge de
//     modo demo y nota del footer). El id del badge pasó de
//     hz-badge-sintetico a hz-modo-datos en el Adendum R8 (contrato punto
//     2); en el Adendum R9 el texto pasa de "Datos sintéticos" a
//     "Modo demo" (PR-02, decisión C1) y el footer deja de autodenominar
//     la app "prototipo" (PR-03), conservando el disclaimer clínico.
// ---------------------------------------------------------------
assert(
  /id="hz-modo-datos"[^>]*>Modo demo</.test(html),
  'el badge #hz-modo-datos dice "Modo demo" (Adendum R9/PR-02, decisión C1: supersede "Datos sintéticos")'
);
assert(
  /id="hz-nota-prototipo">Rinde es una herramienta de apoyo al seguimiento nutricional del CECAD; no sustituye la valoración clínica ni nutriológica de un profesional\.<\/p>/.test(html),
  'la nota del footer #hz-nota-prototipo usa el texto exacto de PR-03 (Adendum R9), con tildes completas (nutricional, valoración, clínica, nutriológica) y sin las palabras prototipo/demostración/sintéticos'
);
var notaPrototipoTextoMatch = /id="hz-nota-prototipo">([^<]*)<\/p>/.exec(html);
assert(notaPrototipoTextoMatch !== null, 'prerrequisito: se pudo extraer el texto visible de #hz-nota-prototipo');
if (notaPrototipoTextoMatch) {
  assert(
    !/prototipo|demostraci[oó]n|sint[eé]tic/i.test(notaPrototipoTextoMatch[1]),
    'el texto visible de #hz-nota-prototipo ya no menciona "prototipo", "demostración" ni "sintéticos" en ninguna forma (PR-03: de-prototipo, disclaimer clínico permanente; el id se conserva por namespace congelado)'
  );
}

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

// 22.1 Cero clases nuevas fuera de hz-reco-/hz-doc- salvo las autorizadas
// explícitamente por Adendums posteriores (R8: .hz-vacio, plan.md contrato
// punto 2): se enumeran TODOS los selectores de clase del bloque <style>
// (comentarios fuera, para no confundir "shell.html" o
// "vista_dieta_supl.js" en la prosa de un comentario con un selector real)
// y cada uno debe pertenecer al set previamente congelado (frozen + menu
// R4 + utilidades de chrome + R8) o empezar con hz-reco- / hz-doc-.
var CHROME_UTILITY_CLASSES = [
  'hz-axis-tick', 'hz-filtros-label', 'hz-footer', 'hz-header',
  'hz-header-brand', 'hz-header-meta', 'hz-header-nombre', 'hz-main',
  'hz-tab', 'hz-tablist', 'hz-toggle-tema', 'hz-vista'
];
// Adendum R8 punto 2: única clase nueva fuera de hz-reco-/hz-doc-,
// explícitamente autorizada por el contrato ("clase .hz-vacio ... para
// estados vacíos de cards").
var R8_CLASSES = ['hz-vacio'];
// Adendum R9 punto 1 (T-044): dos clases nuevas fuera de hz-reco-/hz-doc-,
// explícitamente autorizadas por el contrato (.hz-grid-pares para LY-04,
// .hz-selector-cliente para MC-03).
var R9_CLASSES = ['hz-grid-pares', 'hz-selector-cliente'];
// Adendum R10 (sección 12/13, T-049): sistema de formularios (F-01),
// jerarquía de botones (F-02) y clases de lectura de la rutina (R-01.5).
// Único worker autorizado a definir hz-form-*/hz-btn-*/hz-rutina-*
// (Adendum R10 punto 1, C-1/C-2).
var R10_CLASSES = [
  'hz-form-card', 'hz-form-columnas', 'hz-form-ancho', 'hz-form-sub',
  'hz-form-error', 'hz-form-acciones', 'hz-form-pie',
  'hz-btn', 'hz-btn-primario', 'hz-btn-secundario', 'hz-btn-peligro',
  'hz-rutina-lista', 'hz-rutina-item', 'hz-rutina-nombre', 'hz-rutina-dosis',
  'hz-rutina-descanso', 'hz-rutina-nota'
];
var cssTextSinComentarios = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
var classSelectorRe = /\.([a-zA-Z][a-zA-Z0-9-]*)/g;
var classesEnCss = {};
var cmSel;
while ((cmSel = classSelectorRe.exec(cssTextSinComentarios))) { classesEnCss[cmSel[1]] = true; }
var KNOWN_PREEXISTING = {};
FROZEN_CLASSES.concat(MENU_CLASSES_R4).concat(CHROME_UTILITY_CLASSES).concat(R8_CLASSES).concat(R9_CLASSES).concat(R10_CLASSES).forEach(function (c) { KNOWN_PREEXISTING[c] = true; });
Object.keys(classesEnCss).sort().forEach(function (cls) {
  var esConocida = !!KNOWN_PREEXISTING[cls];
  var esRecoODoc = (cls.indexOf('hz-reco-') === 0) || (cls.indexOf('hz-doc-') === 0);
  assert(esConocida || esRecoODoc, 'la clase .' + cls + ' definida en build/shell.html es previamente conocida (incluye .hz-vacio de R8, .hz-grid-pares/.hz-selector-cliente de R9 y hz-form-*/hz-btn-*/hz-rutina-* de R10) o lleva prefijo hz-reco-/hz-doc- (cero clases nuevas fuera de ese set, Adendum R5+R8+R9+R10)');
});
assert(Object.keys(classesEnCss).length >= 98, 'el bloque <style> define al menos 98 selectores de clase distintos (frozen + menú R4 + chrome + reco + doc + .hz-vacio de R8 + .hz-grid-pares/.hz-selector-cliente de R9 + 17 clases hz-form-*/hz-btn-*/hz-rutina-* de R10)', 'encontrados=' + Object.keys(classesEnCss).length);

// 22.1-bis Prefijos de clase nuevos de R10 autorizados SOLO en shell.html
// (nadie más define hz-form-*/hz-btn-*/hz-rutina-*, Adendum R10 punto 1).
R10_CLASSES.forEach(function (cls) {
  var prefijoOk = (cls.indexOf('hz-form-') === 0) || cls === 'hz-btn' || (cls.indexOf('hz-btn-') === 0) || (cls.indexOf('hz-rutina-') === 0);
  assert(prefijoOk, 'clase nueva ' + cls + ' lleva uno de los prefijos autorizados por el Adendum R10 (hz-form-/hz-btn-/hz-rutina-)');
  assert(hasClassSelector(cssText, cls), 'clase nueva .' + cls + ' (Adendum R10) tiene una regla CSS definida en build/shell.html');
});

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
// clase hz-doc-documento, vacío (T-023 lo llena vía JS). Desde el Adendum
// R8 el ÚLTIMO elemento literal del body es <script id="hz-sw-registro">
// (registro del service worker, contrato punto 2: "al final del body");
// #documento-plan sigue siendo un NODO DE CONTENIDO, justo antes. Desde el
// Adendum R10 (R-01.4) #documento-rutina es su hermano, ANTES de
// #hz-sw-registro.
var bootScriptCloseIdx = html.indexOf('</script>', bootTagIdx);
var documentoPlanIdx = html.indexOf('<div id="documento-plan"');
var bodyCloseIdx = html.indexOf('</body>');
assert(documentoPlanIdx > -1 && documentoPlanIdx > bootScriptCloseIdx, '#documento-plan aparece DESPUÉS del cierre de <script id="hz-boot">');
assert(bodyCloseIdx > -1 && documentoPlanIdx < bodyCloseIdx, '#documento-plan aparece ANTES de </body>');
var tailDespuesDeDocumento = html.slice(documentoPlanIdx);
assert(
  /^<div id="documento-plan" class="hz-doc-documento"><\/div>\s*<!--[\s\S]*?-->\s*<div id="documento-rutina" class="hz-doc-documento"><\/div>\s*<!--[\s\S]*?-->\s*<script id="hz-sw-registro">[\s\S]*?<\/script>\s*<\/body>\s*<\/html>\s*$/.test(tailDespuesDeDocumento),
  '#documento-plan es seguido por #documento-rutina (hermano, vacío, clase hz-doc-documento, Adendum R10 R-01.4) y luego solo <script id="hz-sw-registro"> (Adendum R8) va después, y nada más entre él y </body>'
);
var documentoRutinaIdx = html.indexOf('<div id="documento-rutina"');
var swRegistroTagIdx = html.indexOf('<script id="hz-sw-registro">');
assert(documentoRutinaIdx > documentoPlanIdx && documentoRutinaIdx < swRegistroTagIdx, '#documento-rutina aparece DESPUÉS de #documento-plan y ANTES de <script id="hz-sw-registro">');

// 22.5 Bloque @media print: existe, aparece DESPUÉS de los 4 bloques de
// tokens y contiene la regla que oculta todo menos #documento-plan y
// #documento-rutina (Adendum R10, R-01.6: compuerta de impresión por
// documento vía body[data-imprimir]).
var idxMediaPrint = html.indexOf('@media print');
assert(idxMediaPrint > -1 && idxMediaPrint > idxAttrLight, '@media print aparece DESPUÉS de los 4 bloques de tokens (:root base, @media dark, [data-theme=dark], [data-theme=light])');

var printOuterBlock = extractBlock(html, '@media print {');
assert(printOuterBlock.length > 0, 'el bloque @media print tiene contenido');
assert(
  /body\s*>\s*\*:not\(#documento-plan\):not\(#documento-rutina\)\s*\{\s*display:\s*none\s*!important;\s*\}/.test(printOuterBlock),
  '@media print oculta TODO excepto #documento-plan y #documento-rutina con "body > *:not(#documento-plan):not(#documento-rutina) { display: none !important; }" (Adendum R10, R-01.6)'
);
assert(
  /body\[data-imprimir="rutina"\]\s+#documento-plan\s*\{\s*display:\s*none\s*!important;\s*\}/.test(printOuterBlock),
  '@media print tiene "body[data-imprimir=\\"rutina\\"] #documento-plan { display: none !important; }" (R-01.6: al imprimir la rutina, el plan se oculta)'
);
assert(
  /#documento-rutina\s*\{\s*display:\s*none;\s*\}/.test(printOuterBlock),
  '@media print tiene "#documento-rutina { display: none; }" (R-01.6: oculto por defecto dentro del bloque de impresión, gana por especificidad de ID sobre .hz-doc-documento{display:block})'
);
assert(
  /body\[data-imprimir="rutina"\]\s+#documento-rutina\s*\{\s*display:\s*block;\s*\}/.test(printOuterBlock),
  '@media print tiene "body[data-imprimir=\\"rutina\\"] #documento-rutina { display: block; }" (R-01.6: visible solo al imprimir la rutina)'
);
// Con el atributo data-imprimir AUSENTE, el resultado impreso del plan
// debe ser idéntico al de antes de R10: el selector maestro sigue
// excluyendo #documento-plan (deja verlo) y NO hay ninguna regla
// "body[data-imprimir=...]" (sin el atributo, ninguna se activa nunca);
// la única regla que aplica a #documento-rutina sin el atributo es la de
// ID plana de arriba, que lo mantiene oculto -- se verifica no-regresión
// simulando el CSS en Node más abajo (sección 25).

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
assert(/\.hz-badge\[hidden\]\s*\{\s*display:\s*none;\s*\}/.test(cssText), 'existe la regla .hz-badge[hidden] { display: none; } (R9-fix T-046: el atributo hidden de #hz-modo-datos debe ocultarlo en modo real, igual que .hz-vista[hidden]/.hz-filtros[hidden])');
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

// 23.10 Adendum R9 punto 1 (T-044): CSS aditivo de reparto — regla
// data-ancho="doble" (LY-01 pieza 1, consumida por LY-01/LY-05/DV-05 en
// sus vistas vía setAttribute) y clase .hz-grid-pares (LY-04, Seguimiento).
// Se implementan UNA sola vez en shell.html.
var dobleMediaBlock = extractBlock(html, '@media (min-width: 600px) {');
assert(dobleMediaBlock.length > 0, 'existe el bloque @media (min-width: 600px) { ... } (Adendum R9 punto 1: la regla doble solo aplica desde 600px)');
assert(
  /\.hz-grid\s*>\s*\[data-ancho="doble"\]\s*\{\s*grid-column:\s*span\s*2;\s*\}/.test(dobleMediaBlock),
  'dentro de @media (min-width: 600px) existe ".hz-grid > [data-ancho=\\"doble\\"] { grid-column: span 2; }" (Adendum R9 punto 1 / LY-01 pieza 1)'
);
assert(
  html.indexOf('[data-ancho="completo"]') < html.indexOf('@media (min-width: 600px)') && html.indexOf('@media (min-width: 600px)') < html.lastIndexOf('</style>'),
  'la regla data-ancho="doble" está junto a la regla data-ancho="completo" existente, dentro del mismo bloque <style> (Adendum R9 punto 1)'
);
assert(hasClassSelector(cssText, 'hz-grid-pares'), 'clase .hz-grid-pares (Adendum R9 punto 1 / LY-04) tiene una regla CSS definida en build/shell.html');
var gridParesBlock = extractBlock(cssText, '.hz-grid-pares {');
assert(gridParesBlock.length > 0, '.hz-grid-pares tiene una regla CSS con contenido');
assert(
  /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(480px,\s*100%\),\s*1fr\)\);/.test(gridParesBlock),
  '.hz-grid-pares tiene "grid-template-columns: repeat(auto-fit, minmax(min(480px, 100%), 1fr));" (LY-04: piso de 480px, exactamente 2 columnas entre ~1000-1500px)'
);

// 23.11 LY-06a: .hz-reco-resumen pasa de flex-wrap a grid auto-fit, sin
// tocar tipografía/tokens/contenido (reparto interno de la calculadora).
var recoResumenBlock = extractBlock(cssText, '.hz-reco-resumen {');
assert(recoResumenBlock.length > 0, '.hz-reco-resumen tiene una regla CSS con contenido');
assert(/display:\s*grid;/.test(recoResumenBlock), '.hz-reco-resumen usa display: grid (LY-06a: ya no flex-wrap)');
assert(!/flex-wrap/.test(recoResumenBlock), '.hz-reco-resumen ya no declara flex-wrap (LY-06a)');
assert(
  /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(150px,\s*100%\),\s*1fr\)\);/.test(recoResumenBlock),
  '.hz-reco-resumen tiene "grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr));" (LY-06a: sin huérfanas de ancho fijo)'
);
assert(/gap:\s*12px;/.test(recoResumenBlock), '.hz-reco-resumen conserva gap: 12px (LY-06a)');

// 23.12 MC-03 markup: selector de cliente del header con tokens SOLO del
// Adendum R9 punto 1 (cero hexes nuevos, paleta congelada).
assert(hasClassSelector(cssText, 'hz-selector-cliente'), 'clase .hz-selector-cliente (Adendum R9 punto 1 / MC-03) tiene una regla CSS definida en build/shell.html');
var selectorClienteBlock = extractBlock(cssText, '.hz-selector-cliente {');
assert(selectorClienteBlock.length > 0, '.hz-selector-cliente tiene una regla CSS con contenido');
assert(/border:\s*1px solid var\(--border\);/.test(selectorClienteBlock), '.hz-selector-cliente usa border: 1px solid var(--border) (token existente, MC-03)');
assert(/border-radius:\s*8px;/.test(selectorClienteBlock), '.hz-selector-cliente usa border-radius: 8px (MC-03)');
assert(/background:\s*var\(--surface-1\);/.test(selectorClienteBlock), '.hz-selector-cliente usa background: var(--surface-1) (token existente, MC-03)');
assert(/color:\s*var\(--text-primary\);/.test(selectorClienteBlock), '.hz-selector-cliente usa color: var(--text-primary) (token existente, MC-03)');
assert(!/#[0-9a-fA-F]{3,8}/.test(selectorClienteBlock), '.hz-selector-cliente no declara ningún hex nuevo (paleta congelada, solo tokens)');
var selectorClienteFocusBlock = extractBlock(cssText, '.hz-selector-cliente:focus-visible {');
assert(selectorClienteFocusBlock.length > 0, '.hz-selector-cliente:focus-visible tiene una regla CSS con contenido (MC-03)');
assert(
  /outline:\s*2px solid var\(--series-1\);/.test(selectorClienteFocusBlock) && /outline-offset:\s*2px;/.test(selectorClienteFocusBlock),
  '.hz-selector-cliente:focus-visible tiene outline: 2px solid var(--series-1) y outline-offset: 2px (token existente, MC-03)'
);

// ---------------------------------------------------------------
// 24. Adendum R8 punto 2 (T-038): capa PWA del <head> + contenedores de
//     modo real. Contratos congelados en plan.md Adendum R8.
// ---------------------------------------------------------------
var headBlockMatch = /<head>([\s\S]*?)<\/head>/.exec(html);
var headText = headBlockMatch ? headBlockMatch[1] : '';

// 24.1 link al manifest, junto a index.html (T-037 lo coloca).
assert(/<link rel="manifest" href="\.\/manifest\.webmanifest">/.test(headText), 'el <head> tiene <link rel="manifest" href="./manifest.webmanifest">');

// 24.2 favicon inline SVG data URI (para file://): rel=icon, tipo svg,
//      fondo --series-1 (#2a78d6, mismo hex ya validado en la sección 11)
//      y monograma blanco -- ningún hex fuera de tokens/spec del Adendum.
var svgFaviconRe = /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,([^"]+)">/;
var svgFaviconMatch = svgFaviconRe.exec(headText);
assert(svgFaviconMatch !== null, 'el <head> tiene un favicon inline <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,..."> (para file://)');
if (svgFaviconMatch) {
  var svgFaviconSrc = svgFaviconMatch[1];
  assert(/%3Csvg[^%]*xmlns='http:\/\/www\.w3\.org\/2000\/svg'/.test(svgFaviconSrc), 'el favicon inline es un <svg> bien formado (xmlns presente, escapado como data URI)');
  assert(svgFaviconSrc.indexOf('%232a78d6') !== -1, 'el favicon inline usa el hex de --series-1 (%232a78d6 = #2a78d6, contrato sec. 2 y Adendum R8 punto 3) como fondo del monograma');
  assert(/fill='white'|stroke='white'/.test(svgFaviconSrc), 'el favicon inline dibuja el monograma en blanco (sin hex fuera de tokens/spec)');
  assert(svgFaviconSrc.indexOf('#') === -1, 'el favicon inline no lleva "#" sin escapar (evita que el navegador lo lea como fragmento de la data URI)');
}

// 24.3 link icon 32x32 a PNG + apple-touch-icon 180 (T-037 los coloca junto
//      a index.html; el sitio publicado los usa, no file://).
assert(/<link rel="icon" sizes="32x32" href="\.\/favicon-32\.png">/.test(headText), 'el <head> tiene <link rel="icon" sizes="32x32" href="./favicon-32.png">');
assert(/<link rel="apple-touch-icon" href="\.\/icon-180\.png">/.test(headText), 'el <head> tiene <link rel="apple-touch-icon" href="./icon-180.png">');

// 24.4 meta theme-color x2 (claro/oscuro), hexes == --surface-1 ya
//      validado en la sección 11 (tokenDeclared), autorizados SOLO aquí.
var surfaceTok = TOKENS.filter(function (t) { return t.name === '--surface-1'; })[0];
assert(surfaceTok !== undefined, 'el token --surface-1 está en la lista TOKENS (prerrequisito de 24.4)');
if (surfaceTok) {
  var themeColorLightRe = new RegExp('<meta name="theme-color" content="' + surfaceTok.light.replace('#', '#') + '" media="\\(prefers-color-scheme: light\\)">');
  var themeColorDarkRe = new RegExp('<meta name="theme-color" content="' + surfaceTok.dark.replace('#', '#') + '" media="\\(prefers-color-scheme: dark\\)">');
  assert(themeColorLightRe.test(headText), 'el <head> tiene <meta name="theme-color" content="' + surfaceTok.light + '" media="(prefers-color-scheme: light)"> (== --surface-1 claro)');
  assert(themeColorDarkRe.test(headText), 'el <head> tiene <meta name="theme-color" content="' + surfaceTok.dark + '" media="(prefers-color-scheme: dark)"> (== --surface-1 oscuro)');
}

// 24.5 registro del service worker GUARDEADO al final del body: solo con
//      'serviceWorker' in navigator Y protocolo http/https (jamás file://,
//      así corre QA), catch silencioso, registra ./sw.js.
assert(swRegistroBlock !== null, 'prerrequisito 24.5: existe <script id="hz-sw-registro">');
if (swRegistroBlock) {
  var swSrc = swRegistroBlock.body;
  assert(swSrc.indexOf("'serviceWorker' in navigator") !== -1, 'hz-sw-registro comprueba \'serviceWorker\' in navigator antes de registrar');
  assert(/\/\^https\?:\$\/\.test\(location\.protocol\)/.test(swSrc), 'hz-sw-registro guardea el protocolo con /^https?:$/.test(location.protocol) (jamás intenta registrar en file://)');
  assert(/&&/.test(swSrc), 'hz-sw-registro combina ambas condiciones (serviceWorker Y protocolo) con &&');
  assert(swSrc.indexOf("navigator.serviceWorker.register('./sw.js')") !== -1, 'hz-sw-registro registra "./sw.js" (relativo, mismo origen que T-037 coloca)');
  assert(/catch/.test(swSrc), 'hz-sw-registro tiene manejo de error (catch silencioso, nunca rompe el arranque)');
  assert(html.indexOf('</body>') > html.lastIndexOf('<script id="hz-sw-registro">'), 'hz-sw-registro es el último bloque de script antes de </body> (Adendum R8: registro al final del body)');
}

// 24.6 badge #hz-modo-datos junto a #hz-btn-modo, y #hz-btn-modo junto a
//      #toggle-tema (mismo estilo .hz-toggle-tema, sin lógica: la cablea
//      T-039/almacen.js). Texto inicial 'Usar mis datos' intacto.
var headerBlockMatch = /<header class="hz-header">([\s\S]*?)<\/header>/.exec(html);
var headerText = headerBlockMatch ? headerBlockMatch[1] : '';
assert(headerBlockMatch !== null, 'prerrequisito 24.6: existe <header class="hz-header">...</header>');
assert(
  /<button type="button" id="hz-btn-modo" class="hz-toggle-tema" aria-pressed="false">Usar mis datos<\/button>/.test(headerText),
  'existe el botón #hz-btn-modo con clase .hz-toggle-tema (mismo estilo que "Cambiar tema") y texto inicial "Usar mis datos"'
);
assert(
  headerText.indexOf('id="hz-btn-modo"') < headerText.indexOf('id="toggle-tema"'),
  '#hz-btn-modo está en el header junto a #toggle-tema (Cambiar tema), inmediatamente antes'
);
var hzBtnModoTagMatch = /<button type="button" id="hz-btn-modo"[^>]*>/.exec(headerText);
var hzBtnModoTag = hzBtnModoTagMatch ? hzBtnModoTagMatch[0] : '';
assert(!/onclick|addEventListener/.test(hzBtnModoTag), '#hz-btn-modo no lleva lógica cableada en el markup del shell (la cablea T-039/almacen.js)');

// 24.7 contenedor #captura-mediciones vacío, al inicio de la vista
//      Seguimiento (T-040 lo llena).
var vistaSeguimientoMatch = /<section id="vista-seguimiento"[^>]*>([\s\S]*?)<\/section>\s*<section id="vista-suplementos"/.exec(html);
assert(vistaSeguimientoMatch !== null, 'prerrequisito 24.7: existe <section id="vista-seguimiento">...</section>');
if (vistaSeguimientoMatch) {
  var vistaSeguimientoBody = vistaSeguimientoMatch[1];
  assert(/<section id="captura-mediciones"><\/section>/.test(vistaSeguimientoBody), 'existe <section id="captura-mediciones"></section> vacío dentro de la vista Seguimiento');
  var idxCaptura = vistaSeguimientoBody.indexOf('id="captura-mediciones"');
  var idxDocHerramientas = vistaSeguimientoBody.indexOf('id="doc-herramientas"');
  assert(idxCaptura !== -1 && idxDocHerramientas !== -1 && idxCaptura < idxDocHerramientas, '#captura-mediciones está al inicio de la vista Seguimiento, antes de #doc-herramientas');
}

// 24.8 clase .hz-vacio (estados vacíos, modo real sin datos): basada en
//      .hz-nota, centrada, con padding vertical generoso.
var vacioBlock = extractBlock(cssText, '.hz-vacio {');
assert(vacioBlock.length > 0, '.hz-vacio tiene una regla CSS con contenido');
assert(/color:\s*var\(--text-secondary\);/.test(vacioBlock), '.hz-vacio usa var(--text-secondary) como .hz-nota (tinta por token, sin hex)');
assert(/text-align:\s*center;/.test(vacioBlock), '.hz-vacio está centrada (text-align: center)');
var vacioPaddingMatch = /padding:\s*(\d+)px/.exec(vacioBlock);
assert(vacioPaddingMatch !== null && parseInt(vacioPaddingMatch[1], 10) >= 24, '.hz-vacio tiene padding vertical generoso (>=24px)');

// ---------------------------------------------------------------
// 25. Adendum R10 (T-049): F-01 (sistema de formularios), F-02
//     (jerarquía de botones hz-btn-*) y R-01 (sexta pestaña Rutina,
//     clases hz-rutina-*, #documento-rutina, compuerta de impresión).
//     .harness/justesse-r10-diseno.md es la fuente única; las reglas se
//     copian literales del documento de diseño (instrucción del
//     coordinador para esta tarea).
// ---------------------------------------------------------------

// 25.1 Existencia del bloque "sección 12" (patrón extractBlock: se ancla
// en el comentario de cabecera literal y se verifica que aparece DESPUÉS
// de la sección 11 y ANTES de </style>).
var idxSeccion11 = cssText.indexOf('---------- 11. Adendum R6');
var idxSeccion12 = html.indexOf('---------- 12. Adendum R10 (F-01/F-02): sistema de formularios ----------');
var idxSeccion13 = html.indexOf('---------- 13. Adendum R10 (R-01): clases hz-rutina-');
var idxStyleEnd = html.indexOf('</style>');
assert(idxSeccion11 > -1, 'prerrequisito: existe la cabecera de la sección 11 (Adendum R6)');
assert(idxSeccion12 > -1 && idxSeccion12 > idxSeccion11, 'existe el bloque "sección 12. Adendum R10 (F-01/F-02): sistema de formularios" DESPUÉS de la sección 11');
assert(idxSeccion13 > -1 && idxSeccion13 > idxSeccion12, 'existe el bloque "sección 13. Adendum R10 (R-01): clases hz-rutina-" DESPUÉS de la sección 12');
assert(idxStyleEnd > -1 && idxSeccion13 < idxStyleEnd, 'la sección 13 (R-01) aparece ANTES de </style>');

var seccion12Block = html.slice(idxSeccion12, idxSeccion13);
var seccion13Block = html.slice(idxSeccion13, idxStyleEnd);
assert(seccion12Block.length > 0, 'el bloque de la sección 12 tiene contenido (patrón extractBlock delimitado por cabeceras consecutivas)');
assert(seccion13Block.length > 0, 'el bloque de la sección 13 tiene contenido (patrón extractBlock delimitado por cabecera y </style>)');

// 25.2 F-01: las 11 reglas EXACTAS, copiadas literales del contrato.
var F01_LITERALES = [
  '.hz-form-card { width: 100%; max-width: 720px; margin-inline: auto; }',
  '.hz-form.hz-form-columnas { display: grid; grid-template-columns: 1fr; gap: 14px 20px; max-width: none; }',
  '.hz-form.hz-form-columnas { grid-template-columns: 1fr 1fr; }',
  '.hz-form-ancho { grid-column: 1 / -1; }',
  '.hz-form-sub { display: grid; grid-template-columns: 1fr; gap: 14px 20px; margin-top: 12px; }',
  '.hz-form-sub { grid-template-columns: 1fr 1fr; }',
  '.hz-form summary { cursor: pointer; font-size: 0.9rem; font-weight: 600; color: var(--text-secondary); }',
  '.hz-form summary:hover { color: var(--text-primary); }',
  '.hz-form summary:focus-visible { outline: 2px solid var(--series-1); outline-offset: 2px; }',
  '.hz-form-campo input[aria-invalid="true"], .hz-form-campo select[aria-invalid="true"] { border-color: var(--delta-bad); }',
  '.hz-form-campo input[type="number"] { font-variant-numeric: tabular-nums; }',
  '.hz-form-error { margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--delta-bad); }',
  '.hz-form-error:empty { display: none; }',
  '.hz-form-acciones { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 6px; }',
  '.hz-form-pie { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }',
  '.hz-form[hidden] { display: none; }',
  '.hz-form-card[hidden] { display: none; }'
];
F01_LITERALES.forEach(function (regla) {
  assert(seccion12Block.indexOf(regla) !== -1, 'F-01: la sección 12 contiene literal "' + regla + '"');
});
// F-01.11 "AL FINAL de la sección": ambas reglas [hidden] aparecen
// DESPUÉS de las 10 reglas anteriores, y hz-form[hidden] antes que
// hz-form-card[hidden] (orden del contrato).
var idxFormHidden = seccion12Block.indexOf('.hz-form[hidden] { display: none; }');
var idxFormCardHidden = seccion12Block.indexOf('.hz-form-card[hidden] { display: none; }');
var idxFormPie = seccion12Block.indexOf('.hz-form-pie {');
assert(idxFormPie > -1 && idxFormHidden > idxFormPie, 'F-01.11: ".hz-form[hidden]" aparece DESPUÉS de ".hz-form-pie" (al final de la sección, no antes)');
assert(idxFormHidden > -1 && idxFormCardHidden > idxFormHidden, 'F-01.11: ".hz-form[hidden]" antes que ".hz-form-card[hidden]", ambas al final de la sección');

// 25.3 F-02: jerarquía de botones, literal.
var F02_LITERALES = [
  '.hz-btn { appearance: none; border: 1px solid transparent; border-radius: 8px; padding: 8px 18px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }',
  '.hz-btn:focus-visible { outline: 2px solid var(--series-1); outline-offset: 2px; }',
  '.hz-btn:disabled, .hz-btn[aria-disabled="true"] { opacity: 0.5; cursor: default; }',
  '.hz-btn-primario { background: var(--series-1); border-color: var(--series-1); color: var(--surface-1); }',
  '.hz-btn-primario:hover { filter: brightness(0.94); }',
  '.hz-btn-secundario { background: var(--surface-1); border-color: var(--border); color: var(--text-primary); }',
  '.hz-btn-secundario:hover { background: var(--page); }',
  '.hz-btn-peligro { background: transparent; border-color: transparent; color: var(--delta-bad); font-size: 0.85rem; padding: 6px 12px; }',
  '.hz-btn-peligro:hover { border-color: var(--delta-bad); }',
  '.hz-btn-peligro:focus-visible { outline: 2px solid var(--delta-bad); outline-offset: 2px; }',
  '.hz-btn-peligro[data-confirmar="true"] { background: var(--delta-bad); border-color: var(--delta-bad); color: var(--surface-1); font-weight: 700; }'
];
F02_LITERALES.forEach(function (regla) {
  assert(seccion12Block.indexOf(regla) !== -1, 'F-02: la sección 12 contiene literal "' + regla + '"');
});

var btnCoarseOuter = extractBlock(seccion12Block, '@media (pointer: coarse), (max-width: 640px) {');
assert(btnCoarseOuter.length > 0, 'F-02: existe un @media (pointer: coarse), (max-width: 640px) { ... } propio de .hz-btn en la sección 12 (patrón extractBlock, extiende resp-3 sin tocarla)');
assert(
  btnCoarseOuter.indexOf('.hz-btn { min-height: 44px; padding: 10px 18px; display: inline-flex; align-items: center; justify-content: center; }') !== -1,
  'F-02: el media de targets táctiles fija min-height:44px, padding:10px 18px y flex centrado en .hz-btn (literal)'
);
// La regla resp-3 original (sección 11) sigue intacta y NO incluye .hz-btn.
var resp3Outer = extractBlock(cssText, '.hz-filtro-btn,\n  .hz-doc-btn,\n  .hz-doc-import-label,\n  .hz-table-toggle {');
assert(resp3Outer.length > 0, 'prerrequisito: la regla resp-3 original (.hz-filtro-btn/.hz-doc-btn/.hz-doc-import-label/.hz-table-toggle) sigue presente');
assert(resp3Outer.indexOf('hz-btn') === -1, 'resp-3 (sección 11) NO fue tocada para incluir .hz-btn (F-02 usa su PROPIO media, sin fusionar)');

// 25.4 R-01.5: las 6 clases hz-rutina-*, literales.
var R01_RUTINA_LITERALES = [
  '.hz-rutina-lista {display:flex;flex-direction:column;gap:10px;margin-top:4px;}',
  '.hz-rutina-item {display:flex;flex-wrap:wrap;align-items:baseline;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:10px;background:var(--page);}',
  '.hz-rutina-nombre {flex:1 1 200px;min-width:140px;color:var(--text-primary);font-size:0.92rem;white-space:normal;overflow-wrap:break-word;}',
  '.hz-rutina-dosis {flex:0 0 auto;font-weight:600;color:var(--text-primary);font-variant-numeric:tabular-nums;}',
  '.hz-rutina-descanso {flex:0 0 auto;color:var(--text-secondary);font-size:0.85rem;}',
  '.hz-rutina-nota {flex:1 1 100%;color:var(--text-secondary);font-size:0.8rem;}'
];
R01_RUTINA_LITERALES.forEach(function (regla) {
  assert(seccion13Block.indexOf(regla) !== -1, 'R-01.5: la sección 13 contiene literal "' + regla + '"');
});
assert(R01_RUTINA_LITERALES.length === 6, 'prerrequisito: se declaran exactamente 6 reglas hz-rutina- (contrato R-01.5)');

// 25.5 R-01.1/R-01.3: sexta pestaña Rutina entre Plan de dieta y
// Seguimiento; TAB_ORDER de longitud 6 (ya verificado en las secciones
// 4/5 arriba, que ahora corren sobre TAB_ORDER con 'rutina' incluida).
assert(TAB_ORDER.length === 6, 'TAB_ORDER tiene exactamente 6 pestañas (R-01.3)');
assert(TAB_ORDER.indexOf('rutina') === 3 && TAB_ORDER[2] === 'plan' && TAB_ORDER[4] === 'seguimiento', 'la pestaña "rutina" está entre "plan" y "seguimiento" en TAB_ORDER (R-01.1)');
assert(/var TAB_ORDER = \['resumen', 'perfil', 'plan', 'rutina', 'seguimiento', 'suplementos'\];/.test(runtimeSrc), 'hz-runtime declara TAB_ORDER literal con "rutina" entre "plan" y "seguimiento"');

// 25.6 R-01.3: filtro-rango sigue exclusivo de Seguimiento (nada más
// cambia en esa lógica, contrato R-01.3 "nada más cambia").
assert(/if \(id === 'seguimiento'\) \{ filtroEl\.removeAttribute\('hidden'\); \}/.test(runtimeSrc), 'filtro-rango sigue condicionado exclusivamente a id === "seguimiento" (R-01.3: nada más cambia)');

console.log('checks ejecutados: ' + checks);
process.exit(0);
