// build/selfcheck_charts.js
// Selfcheck de node puro (sin dependencias externas) para build/charts.js y
// build/testdom.js. Formato de salida congelado en plan.md sección 3.J:
// última linea de stdout literal "checks ejecutados: N"; exit 0 solo si todas las
// aserciones pasan; en fallo, exit 1 e imprime la aserción fallida.
'use strict';

var fs = require('fs');
var path = require('path');

var contador = 0;

function afirmar(condicion, mensaje) {
  contador += 1;
  if (!condicion) {
    console.error('ASERCION FALLIDA (#' + contador + '): ' + mensaje);
    process.exit(1);
  }
}

function cercaDe(a, b, tolerancia) {
  return Math.abs(a - b) <= (tolerancia == null ? 0.01 : tolerancia);
}

// ---------------------------------------------------------------------
// 0. Carga del módulo: DOM headless antes de require, como especifica plan.md 3.A
// ---------------------------------------------------------------------
globalThis.window = globalThis;
var TESTDOM_PATH = path.join(__dirname, 'testdom.js');
var CHARTS_PATH = path.join(__dirname, 'charts.js');
require(TESTDOM_PATH);
require(CHARTS_PATH);

var fuenteCharts = fs.readFileSync(CHARTS_PATH, 'utf8');
var fuenteTestdom = fs.readFileSync(TESTDOM_PATH, 'utf8');

var Charts = Herzon.Charts;
var TestDOM = Herzon.TestDOM;

// ---------------------------------------------------------------------
// Utilidades de recorrido para las aserciones (whitebox, sobre el DOM falso)
// ---------------------------------------------------------------------
function recolectarNodos(raiz) {
  var resultado = [raiz];
  for (var i = 0; i < raiz.children.length; i++) {
    resultado = resultado.concat(recolectarNodos(raiz.children[i]));
  }
  return resultado;
}

function clasesDe(nodo) {
  var atributo = nodo.getAttribute && nodo.getAttribute('class');
  if (!atributo) return [];
  return atributo.split(/\s+/).filter(function (c) { return c.length > 0; });
}

// T-034 (R6-fix): serializador determinista whitebox (tag + atributos
// ordenados + estilos ordenados + texto) usado SOLO para la aserción
// "con referencia apagada, render byte-identico". No es un serializador HTML
// general: alcanza para detectar cualquier cambio de estructura/atributos en
// el árbol que devuelve una primitiva de Herzon.Charts.
function serializarNodo(nodo) {
  if (nodo.nodeType === 3) return 'T(' + (nodo._data || '') + ')';
  var partes = ['<' + nodo.tagName];
  Object.keys(nodo._atributos || {}).sort().forEach(function (k) {
    partes.push(' ' + k + '=' + JSON.stringify(nodo._atributos[k]));
  });
  var estiloClaves = Object.keys(nodo.style || {}).sort();
  if (estiloClaves.length) {
    partes.push(' style={' + estiloClaves.map(function (k) { return k + ':' + nodo.style[k]; }).join(';') + '}');
  }
  partes.push('>');
  (nodo.childNodes || []).forEach(function (hijo) { partes.push(serializarNodo(hijo)); });
  partes.push('</' + nodo.tagName + '>');
  return partes.join('');
}

// Hash FNV-1a de 32 bits + longitud (no criptográfico: solo para comparar
// igualdad exacta de la serialización anterior sin embeber la cadena entera,
// que en un SVG de barras() ronda los 4,000 caracteres).
function hashCadena(cadena) {
  var h = 0x811c9dc5;
  for (var i = 0; i < cadena.length; i++) {
    h ^= cadena.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16) + ':' + cadena.length;
}

// ---------------------------------------------------------------------
// 1. Higiene de fuente (build/charts.js)
// ---------------------------------------------------------------------
afirmar(fuenteCharts.indexOf('HERZON_DATA') === -1,
  'build/charts.js no debe mencionar HERZON_DATA en ninguna parte (agnosticismo de datos)');

afirmar(!/#[0-9a-fA-F]{3,8}\b/.test(fuenteCharts),
  'build/charts.js no debe contener hexes de color literales');

afirmar(fuenteCharts.indexOf('stroke-dasharray') === -1,
  'build/charts.js no debe contener la cadena stroke-dasharray en el fuente');

afirmar(fuenteCharts.indexOf('innerHTML') === -1,
  'build/charts.js no debe usar innerHTML en ninguna parte');

afirmar(fuenteCharts.indexOf('<style') === -1,
  'build/charts.js no debe declarar bloques <style> propios');

afirmar(fuenteTestdom.indexOf('innerHTML') === -1,
  'build/testdom.js no debe usar innerHTML en ninguna parte');

afirmar(!/\bCategoria\b/.test(fuenteCharts),
  'build/charts.js no debe contener "Categoria" sin tilde (regresión QA-R2: debe ser "Categoría")');

// ---------------------------------------------------------------------
// 2. API congelada (plan.md 3.B): las 8 primitivas + TestDOM.crearDocumento
// ---------------------------------------------------------------------
var NOMBRES_API = ['linea', 'barras', 'apilada100', 'heatmapCalendario', 'sparkline', 'statTile', 'leyenda', 'tablaToggle'];
NOMBRES_API.forEach(function (nombre) {
  afirmar(typeof Charts[nombre] === 'function',
    'Herzon.Charts.' + nombre + ' debe existir y ser una función');
});

afirmar(typeof TestDOM.crearDocumento === 'function',
  'Herzon.TestDOM.crearDocumento debe existir y ser una función');

var doc = TestDOM.crearDocumento();
function contenedorNuevo() { return doc.createElement('div'); }

// ---------------------------------------------------------------------
// 3. Cada primitiva renderiza contra el TestDOM sin lanzar, y devuelve la raiz
//    que ella misma creó (aparece como hijo del contenedor recibido).
// ---------------------------------------------------------------------
var cLinea = contenedorNuevo();
var rLinea;
afirmar((function () {
  try {
    rLinea = Charts.linea(cLinea, {
      titulo: 'Peso (kg)',
      series: [
        { nombre: 'Peso', datos: [80, 79.6, 79.1, 78.8, 78.5, 78.3] },
        { nombre: 'Meta', datos: [75, 75, 75, 75, 75, 75] }
      ],
      etiquetasX: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
      yMin: 60, yMax: 90,
      area: true,
      tabla: true
    });
    return true;
  } catch (e) { console.error(e); return false; }
})(), 'Herzon.Charts.linea debe renderizar sin lanzar');

afirmar(rLinea && rLinea.parentNode === cLinea, 'Herzon.Charts.linea debe devolver la raiz que creo y anexarla al contenedor recibido');

var cBarras = contenedorNuevo();
var rBarras;
afirmar((function () {
  try {
    rBarras = Charts.barras(cBarras, {
      titulo: 'Calorías por día',
      categorias: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie'],
      series: [{ nombre: 'Kcal', datos: [1500, 1600, 1550, 1620, 1580] }],
      tabla: true
    });
    return true;
  } catch (e) { console.error(e); return false; }
})(), 'Herzon.Charts.barras (vertical) debe renderizar sin lanzar');
afirmar(rBarras && rBarras.parentNode === cBarras, 'Herzon.Charts.barras debe devolver la raiz que creo');

var cBarrasH = contenedorNuevo();
var rBarrasH;
afirmar((function () {
  try {
    rBarrasH = Charts.barras(cBarrasH, {
      orientacion: 'horizontal',
      categorias: ['Proteina', 'Suplemento A'],
      series: [{ nombre: 'Adherencia', datos: [92, 78] }, { nombre: 'Meta', datos: [100, 100] }]
    });
    return true;
  } catch (e) { console.error(e); return false; }
})(), 'Herzon.Charts.barras (horizontal) debe renderizar sin lanzar');

var cApilada = contenedorNuevo();
var rApilada;
afirmar((function () {
  try {
    rApilada = Charts.apilada100(cApilada, {
      titulo: 'Adherencia diaria',
      categorias: ['Semana 1', 'Semana 2', 'Semana 3'],
      series: [{ nombre: 'Dieta', datos: [80, 85, 90] }, { nombre: 'Suplementos', datos: [20, 15, 10] }],
      tabla: true
    });
    return true;
  } catch (e) { console.error(e); return false; }
})(), 'Herzon.Charts.apilada100 debe renderizar sin lanzar');
afirmar(rApilada && rApilada.parentNode === cApilada, 'Herzon.Charts.apilada100 debe devolver la raiz que creo');

var cHeat = contenedorNuevo();
var rHeat;
afirmar((function () {
  try {
    rHeat = Charts.heatmapCalendario(cHeat, {
      titulo: 'Adherencia (84 días)',
      valores: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 55, 65, 75, 85],
      etiquetas: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13', 'D14']
    });
    return true;
  } catch (e) { console.error(e); return false; }
})(), 'Herzon.Charts.heatmapCalendario debe renderizar sin lanzar');
afirmar(rHeat && rHeat.parentNode === cHeat, 'Herzon.Charts.heatmapCalendario debe devolver la raiz que creo');

var cSpark12 = contenedorNuevo();
var rSpark12;
afirmar((function () {
  try {
    rSpark12 = Charts.sparkline(cSpark12, { valores: [80, 79.6, 79.4, 79.1, 78.9, 78.8, 78.6, 78.5, 78.4, 78.3, 78.2, 78.1] });
    return true;
  } catch (e) { console.error(e); return false; }
})(), 'Herzon.Charts.sparkline debe renderizar sin lanzar');
afirmar(rSpark12 && rSpark12.parentNode === cSpark12, 'Herzon.Charts.sparkline debe devolver la raiz que creo');

var cStat = contenedorNuevo();
var rStat;
afirmar((function () {
  try {
    rStat = Charts.statTile(cStat, { etiqueta: 'Peso actual', valor: 78.1, delta: -1.9, mejorSi: 'menor', sufijoDelta: ' kg' });
    return true;
  } catch (e) { console.error(e); return false; }
})(), 'Herzon.Charts.statTile debe renderizar sin lanzar');
afirmar(rStat && rStat.parentNode === cStat, 'Herzon.Charts.statTile debe devolver la raiz que creo');

var cLeyenda = contenedorNuevo();
var rLeyenda;
afirmar((function () {
  try {
    rLeyenda = Charts.leyenda(cLeyenda, { series: [{ nombre: 'Proteina' }, { nombre: 'Carbohidrato' }, { nombre: 'Grasa' }] });
    return true;
  } catch (e) { console.error(e); return false; }
})(), 'Herzon.Charts.leyenda debe renderizar sin lanzar');
afirmar(rLeyenda && rLeyenda.parentNode === cLeyenda, 'Herzon.Charts.leyenda debe devolver la raiz que creo');

var cTablaToggle = contenedorNuevo();
var rTablaToggle;
afirmar((function () {
  try {
    rTablaToggle = Charts.tablaToggle(cTablaToggle, { columnas: ['Semana', 'Peso'], filas: [['S1', 80], ['S2', 79.6]] });
    return true;
  } catch (e) { console.error(e); return false; }
})(), 'Herzon.Charts.tablaToggle debe renderizar sin lanzar');
afirmar(rTablaToggle && rTablaToggle.parentNode === cTablaToggle, 'Herzon.Charts.tablaToggle debe devolver la raiz que creo');

// ---------------------------------------------------------------------
// 4. Regla 2 y 3: un solo eje Y por gráfica; rango forzado exacto
// ---------------------------------------------------------------------
var svgsEjeY = rLinea.consultarTodo('svg').filter(function (s) { return s.getAttribute('data-eje-y') === '1'; });
afirmar(svgsEjeY.length === 1, 'linea debe exponer exactamente un eje Y por gráfica (data-eje-y)');

var svgsEjeYBarras = rBarras.consultarTodo('svg').filter(function (s) { return s.getAttribute('data-eje-y') === '1'; });
afirmar(svgsEjeYBarras.length === 1, 'barras debe exponer exactamente un eje Y (de valor) por gráfica (data-eje-y)');

var ticksForzados = Charts._debug.generarTicksY(60, 90, 5);
afirmar(ticksForzados[0] === 60, 'linea: con opciones.yMin/yMax forzados, el primer tick generado debe ser exactamente yMin');
afirmar(ticksForzados[ticksForzados.length - 1] === 90, 'linea: con opciones.yMin/yMax forzados, el último tick generado debe ser exactamente yMax');

// ---------------------------------------------------------------------
// 5. Regla 4: marcas (linea 2px round, marcador >=8px con anillo, area 8-12%)
// ---------------------------------------------------------------------
var polilineaPrincipal = rLinea.consultarTodo('polyline')[0];
afirmar(polilineaPrincipal.getAttribute('stroke-width') === '2', 'linea: la polilinea debe tener stroke-width 2px');
afirmar(polilineaPrincipal.getAttribute('stroke-linejoin') === 'round', 'linea: la polilinea debe tener stroke-linejoin round');
afirmar(polilineaPrincipal.getAttribute('stroke-linecap') === 'round', 'linea: la polilinea debe tener stroke-linecap round');

var marcadorFinal = rLinea.consultarTodo('circle')[0];
var radioMarcador = parseFloat(marcadorFinal.getAttribute('r'));
afirmar(radioMarcador * 2 >= 8, 'linea: el marcador de extremo debe medir al menos 8px de diametro');
afirmar(marcadorFinal.style.stroke === 'var(--surface-1)', 'linea: el marcador de extremo debe llevar anillo del color de superficie via style.stroke');
afirmar(marcadorFinal.getAttribute('stroke-width') === '2', 'linea: el anillo del marcador debe medir 2px');

var areaPoligono = rLinea.consultarTodo('polygon')[0];
var opacidadArea = parseFloat(areaPoligono.getAttribute('fill-opacity'));
afirmar(opacidadArea >= 0.08 && opacidadArea <= 0.12, 'linea: el area debe pintarse con fill-opacity entre 0.08 y 0.12');

var barraPathAncho = contenedorNuevo();
var rBarraAncha = Charts.barras(barraPathAncho, { categorias: ['Única'], series: [{ nombre: 'Kcal', datos: [2000] }], ancho: 800 });
var pathBarra = rBarraAncha.consultarTodo('path')[0];
var grosorBarra = parseFloat(pathBarra.getAttribute('data-grosor'));
afirmar(grosorBarra <= 24, 'barras: el grosor de cada barra nunca debe exceder 24px, incluso en un contenedor ancho');
var comandosQ = (pathBarra.getAttribute('d').match(/Q/g) || []).length;
afirmar(comandosQ === 2, 'barras: la marca debe tener exactamente 2 curvas (punta redondeada) y base cuadrada desde la linea base');
afirmar(pathBarra.style.stroke === 'none', 'barras: la marca no debe llevar borde dibujado (regla 5)');

// ---------------------------------------------------------------------
// 6. Regla 5: gaps de 2px (apilada100, intra-columna y entre columnas)
// ---------------------------------------------------------------------
var categoriasGap = [];
var serieGapA = [], serieGapB = [];
for (var i = 0; i < 30; i++) { categoriasGap.push('C' + i); serieGapA.push(50 + i); serieGapB.push(50 - (i % 40)); }
var cGap = contenedorNuevo();
var rGap = Charts.apilada100(cGap, { categorias: categoriasGap, series: [{ nombre: 'A', datos: serieGapA }, { nombre: 'B', datos: serieGapB }] });
var segmentosGap = rGap.consultarTodo('rect').filter(function (r) { return r.getAttribute('fill-opacity') !== '0'; });
afirmar(segmentosGap.length === categoriasGap.length * 2, 'apilada100: debe emitir un segmento por serie y categoría');

var seg0 = segmentosGap[0], seg1 = segmentosGap[1];
var gapVertical = parseFloat(seg1.getAttribute('y')) - (parseFloat(seg0.getAttribute('y')) + parseFloat(seg0.getAttribute('height')));
afirmar(cercaDe(gapVertical, 2, 0.05), 'apilada100: el gap entre segmentos apilados de una misma columna debe ser de 2px');

var seg2 = segmentosGap[2];
var gapHorizontal = parseFloat(seg2.getAttribute('x')) - (parseFloat(seg0.getAttribute('x')) + parseFloat(seg0.getAttribute('width')));
afirmar(cercaDe(gapHorizontal, 2, 0.05), 'apilada100: el gap entre columnas (barras) adyacentes debe ser de 2px cuando no aplica el tope de 24px');

segmentosGap.forEach(function (seg) {
  afirmar(seg.style.stroke === 'none', 'apilada100: ningún segmento debe llevar borde dibujado (regla 5)');
});

// ---------------------------------------------------------------------
// 7. Regla 6: grid y ejes hairline sólida, cero stroke-dasharray en lo generado
// ---------------------------------------------------------------------
var todosNodosLinea = recolectarNodos(rLinea);
var conDasharray = todosNodosLinea.filter(function (n) {
  return (n.getAttribute && n.getAttribute('stroke-dasharray') != null) || (n.style && n.style.strokeDasharray);
});
afirmar(conDasharray.length === 0, 'linea: ningún elemento generado debe tener stroke-dasharray');

var gridLinea = rLinea.consultarTodo('line')[0];
afirmar(gridLinea.getAttribute('stroke-width') === '1', 'linea: el grid debe ser hairline de 1px');
afirmar(gridLinea.style.stroke === 'var(--grid)', 'linea: el grid debe usar var(--grid) via style.stroke');

// ---------------------------------------------------------------------
// 8. Regla 7: leyenda con >=2 series, ausente con 1 serie; etiquetado selectivo
// ---------------------------------------------------------------------
afirmar(rLinea.consultarTodo('.hz-legend').length === 1, 'linea con 2 series debe emitir exactamente un .hz-legend');
afirmar(rLinea.consultarTodo('.hz-legend-item').length === 2, 'linea con 2 series debe emitir un .hz-legend-item por serie');

var cLineaUna = contenedorNuevo();
var rLineaUna = Charts.linea(cLineaUna, { series: [{ nombre: 'Peso', datos: [80, 79, 78] }], etiquetasX: ['S1', 'S2', 'S3'] });
afirmar(rLineaUna.consultarTodo('.hz-legend').length === 0, 'linea con 1 sola serie NO debe emitir caja .hz-legend');

var totalPuntosLinea = 6 * 2; // 6 etiquetasX * 2 series
var etiquetasValorLinea = rLinea.consultarTodo('.hz-etiqueta-valor');
afirmar(etiquetasValorLinea.length < totalPuntosLinea, 'linea: el número de etiquetas de valor debe ser menor que el número de puntos (etiquetado selectivo, nunca uno por punto)');

// ---------------------------------------------------------------------
// 9. Regla 8: el texto nunca viste el color de la serie
// ---------------------------------------------------------------------
function walkTodosLosContenedores() {
  return [cLinea, cBarras, cBarrasH, cApilada, cHeat, cSpark12, cStat, cLeyenda, cTablaToggle];
}
var violacionesTexto = [];
walkTodosLosContenedores().forEach(function (raizContenedor) {
  recolectarNodos(raizContenedor).forEach(function (nodo) {
    var tieneTexto = false;
    for (var k = 0; k < (nodo.childNodes || []).length; k++) {
      if (nodo.childNodes[k].nodeType === 3 && nodo.childNodes[k].textContent) { tieneTexto = true; break; }
    }
    if (tieneTexto && nodo.style && nodo.style.fill && /var\(--series-\d\)/.test(nodo.style.fill)) {
      violacionesTexto.push(nodo);
    }
  });
});
afirmar(violacionesTexto.length === 0, 'ningún nodo de texto debe tener style.fill con var(--series-*) (la identidad la da el swatch, no el texto)');

var swatchLeyenda = rLinea.consultarTodo('.hz-legend-swatch')[0];
afirmar(/var\(--series-\d\)/.test(swatchLeyenda.style.backgroundColor), 'la leyenda debe dar identidad de color por swatch (.hz-legend-swatch), no por texto');

// ---------------------------------------------------------------------
// 10. Regla 9: toggle "Ver tabla" + tabla equivalente
// ---------------------------------------------------------------------
var botonTablaLinea = rLinea.consultarTodo('.hz-table-toggle')[0];
afirmar(!!botonTablaLinea, 'linea con opciones.tabla debe emitir un boton .hz-table-toggle');
afirmar(botonTablaLinea.getAttribute('aria-expanded') === 'false', 'el boton .hz-table-toggle debe iniciar con aria-expanded=false');

var wrapTablaLinea = rLinea.consultarTodo('.hz-table-wrap')[0];
afirmar(!!wrapTablaLinea, 'linea con opciones.tabla debe emitir un .hz-table-wrap');
var filasDatosLinea = wrapTablaLinea.consultarTodo('tbody')[0].consultarTodo('tr').length;
afirmar(filasDatosLinea === 6, 'linea: el número de filas de datos de la tabla debe coincidir con el número de puntos de la serie (6)');

botonTablaLinea.despachar('click');
afirmar(botonTablaLinea.getAttribute('aria-expanded') === 'true', 'al activar el boton .hz-table-toggle, aria-expanded debe pasar a true');
afirmar(wrapTablaLinea.style.display === '', 'al activar el boton .hz-table-toggle, la tabla debe volverse visible (style.display vacio)');
botonTablaLinea.despachar('click');
afirmar(botonTablaLinea.getAttribute('aria-expanded') === 'false', 'al desactivar el boton .hz-table-toggle, aria-expanded debe volver a false');

var filasApilada = rApilada.consultarTodo('.hz-table-wrap')[0].consultarTodo('tbody')[0].consultarTodo('tr').length;
afirmar(filasApilada === 3, 'apilada100: el número de filas de datos de la tabla debe coincidir con el número de categorías (3)');

// ---------------------------------------------------------------------
// 11. Regla 10: crosshair + tooltip único (linea); tooltip por marca + lift (barras)
// ---------------------------------------------------------------------
afirmar(rLinea.consultarTodo('.hz-crosshair').length === 1, 'linea debe emitir exactamente un .hz-crosshair vertical');
afirmar(rLinea.consultarTodo('.hz-tooltip').length === 1, 'linea debe emitir exactamente un .hz-tooltip para todas las series');

var zonasHitLinea = rLinea.consultarTodo('rect').filter(function (r) { return r.getAttribute('fill-opacity') === '0'; });
zonasHitLinea.forEach(function (z) {
  afirmar(parseFloat(z.getAttribute('width')) >= 24, 'linea: cada zona de hit debe medir al menos 24px en el eje de barrido');
});

var tooltipLinea = rLinea.consultarTodo('.hz-tooltip')[0];
var primerZonaHit = zonasHitLinea[0];
afirmar(tooltipLinea.style.display === 'none', 'el tooltip de linea debe iniciar oculto');
primerZonaHit.despachar('pointermove');
afirmar(tooltipLinea.style.display === '', 'el tooltip de linea debe mostrarse en pointermove sobre la zona de hit');
var filasSeriesEnTooltip = tooltipLinea.children.length - 1; // resta el titulo (la etiqueta X)
afirmar(filasSeriesEnTooltip === 2, 'el tooltip de linea debe listar todas las series (2) en la X activa');
primerZonaHit.despachar('focus');
afirmar(tooltipLinea.style.display === '', 'el tooltip de linea debe mostrar los mismos detalles en focus que en hover');
primerZonaHit.despachar('blur');
afirmar(tooltipLinea.style.display === 'none', 'el tooltip de linea debe ocultarse al perder foco, igual que al salir del hover');

var zonasHitBarras = rBarras.consultarTodo('rect').filter(function (r) { return r.getAttribute('fill-opacity') === '0'; });
var primerBarraPath = rBarras.consultarTodo('path')[0];
afirmar(primerBarraPath.getAttribute('fill-opacity') === null, 'la barra no debe tener lift antes del hover');
zonasHitBarras[0].despachar('pointerenter');
afirmar(primerBarraPath.getAttribute('fill-opacity') === '0.85', 'barras: la marca debe recibir lift visual (fill-opacity) al pasar el puntero');
zonasHitBarras[0].despachar('pointerleave');
afirmar(primerBarraPath.getAttribute('fill-opacity') === null, 'barras: el lift debe retirarse al salir del hover');

// ---------------------------------------------------------------------
// 12. Regla 11: statTile (número + delta con signo + clase de bondad); sparkline 12 puntos
// ---------------------------------------------------------------------
afirmar(rStat.consultarTodo('.hz-stat-num')[0].textContent.length > 0, 'statTile debe emitir un número visible');
var deltaStat = rStat.consultarTodo('.hz-stat-delta')[0];
afirmar(deltaStat.classList.contains('hz-delta-good'), 'statTile: delta negativo con mejorSi=menor debe usar la clase hz-delta-good');

var cStatMalo = contenedorNuevo();
var rStatMalo = Charts.statTile(cStatMalo, { etiqueta: 'Glucosa', valor: 130, delta: 8, mejorSi: 'menor' });
var deltaStatMalo = rStatMalo.consultarTodo('.hz-stat-delta')[0];
afirmar(deltaStatMalo.classList.contains('hz-delta-bad'), 'statTile: delta positivo con mejorSi=menor debe usar la clase hz-delta-bad');
afirmar(deltaStatMalo.textContent.charAt(0) === '+', 'statTile: el delta positivo debe mostrarse con signo +');

var cStatMayor = contenedorNuevo();
var rStatMayor = Charts.statTile(cStatMayor, { etiqueta: 'Masa muscular', valor: 30, delta: 1.2, mejorSi: 'mayor' });
afirmar(rStatMayor.consultarTodo('.hz-stat-delta')[0].classList.contains('hz-delta-good'), 'statTile: delta positivo con mejorSi=mayor debe usar la clase hz-delta-good');

var puntosSpark12 = rSpark12.consultarTodo('.hz-spark-punto');
afirmar(puntosSpark12.length === 12, 'sparkline: debe dibujar exactamente 12 puntos cuando recibe 12 valores');

var cSpark5 = contenedorNuevo();
var rSpark5 = Charts.sparkline(cSpark5, { valores: [1, 2, 3, 4, 5] });
afirmar(rSpark5.consultarTodo('.hz-spark-punto').length === 5, 'sparkline: debe dibujar un punto por cada valor recibido (caso general con 5)');

// ---------------------------------------------------------------------
// 13. Rampa de magnitud: heatmapCalendario usa solo var(--heat-1..5)
// ---------------------------------------------------------------------
var celdasHeat = rHeat.consultarTodo('.hz-heat-celda');
afirmar(celdasHeat.length === 14, 'heatmapCalendario debe emitir una celda por valor recibido');
celdasHeat.forEach(function (celda) {
  afirmar(/^var\(--heat-[1-5]\)$/.test(celda.style.fill), 'heatmapCalendario: cada celda debe usar exclusivamente var(--heat-1..5)');
  afirmar(!/var\(--series-\d\)/.test(celda.style.fill), 'heatmapCalendario: ninguna celda debe usar la serie categorica');
});

// ---------------------------------------------------------------------
// 14. Higiene general: cero clases sin prefijo hz-, cero <style>, cero emojis
// ---------------------------------------------------------------------
var clasesVistas = {};
walkTodosLosContenedores().forEach(function (raizContenedor) {
  recolectarNodos(raizContenedor).forEach(function (nodo) {
    clasesDe(nodo).forEach(function (c) { clasesVistas[c] = true; });
    afirmar((nodo.tagName || '').toUpperCase() !== 'STYLE', 'ningún módulo debe emitir un nodo <style> propio');
  });
});
Object.keys(clasesVistas).forEach(function (clase) {
  afirmar(/^hz-/.test(clase), 'toda clase generada debe llevar el prefijo hz- (encontrada: ' + clase + ')');
});

var RANGO_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
afirmar(!RANGO_EMOJI.test(fuenteCharts), 'build/charts.js no debe contener emojis');
afirmar(!RANGO_EMOJI.test(fuenteTestdom), 'build/testdom.js no debe contener emojis');

// ---------------------------------------------------------------------
// 15. leyenda() y tablaToggle() como primitivas standalone
// ---------------------------------------------------------------------
afirmar(rLeyenda.consultarTodo('.hz-legend-item').length === 3, 'Herzon.Charts.leyenda debe emitir un item por serie recibida');
var botonStandalone = rTablaToggle.consultarTodo('.hz-table-toggle')[0];
afirmar(botonStandalone.getAttribute('aria-controls') === rTablaToggle.consultarTodo('.hz-table-wrap')[0].getAttribute('id'),
  'Herzon.Charts.tablaToggle: el boton debe controlar (aria-controls) el id del .hz-table-wrap correspondiente');
afirmar(rTablaToggle.consultarTodo('tbody')[0].consultarTodo('tr').length === 2, 'Herzon.Charts.tablaToggle: la tabla standalone debe reflejar las filas recibidas');

// ---------------------------------------------------------------------
// 16. QA ronda 1 - D3: el SVG debe renderizarse al ancho real del contenedor
// (clientWidth al momento del render), NUNCA a un viewBox fijo escalado por
// CSS width:100% (causa raíz de fuentes microscópicas en small multiples).
// ---------------------------------------------------------------------
function anchoViewBox(raiz) {
  var svg = raiz.consultarTodo('svg')[0];
  return parseFloat(svg.getAttribute('viewBox').split(' ')[2]);
}

var cAnchoRealLinea = contenedorNuevo();
cAnchoRealLinea.clientWidth = 300;
var rAnchoRealLinea = Charts.linea(cAnchoRealLinea, {
  series: [{ nombre: 'Peso', datos: [80, 79, 78] }],
  etiquetasX: ['S1', 'S2', 'S3']
});
afirmar(anchoViewBox(rAnchoRealLinea) === 300, 'linea: con contenedorEl.clientWidth medible, el viewBox debe usar ese ancho real (D3)');

var cAnchoRealBarras = contenedorNuevo();
cAnchoRealBarras.clientWidth = 250;
var rAnchoRealBarras = Charts.barras(cAnchoRealBarras, { categorias: ['A', 'B'], series: [{ nombre: 'X', datos: [10, 20] }], ancho: 900 });
afirmar(anchoViewBox(rAnchoRealBarras) === 250, 'barras: clientWidth debe prevalecer incluso si se paso opciones.ancho explícito (D3)');

var cAnchoRealApilada = contenedorNuevo();
cAnchoRealApilada.clientWidth = 180;
var rAnchoRealApilada = Charts.apilada100(cAnchoRealApilada, { categorias: ['A'], series: [{ nombre: 'X', datos: [10] }] });
afirmar(anchoViewBox(rAnchoRealApilada) === 180, 'apilada100: debe renderizarse al ancho real del contenedor (D3)');

afirmar(anchoViewBox(rBarraAncha) === 800, 'barras: sin clientWidth medible (TestDOM sin layout real) debe conservar opciones.ancho, sin romper el comportamiento headless previo');

// ---------------------------------------------------------------------
// 17. QA ronda 1 - D3: fuentes a tamaño físico >= 11px, declaradas por
// atributo font-size explícito (no dependen de que el CSS del ensamble
// defina la clase correcta), en labels/ticks/etiquetas de TODAS las formas.
// ---------------------------------------------------------------------
[[rLinea, 'linea'], [rBarras, 'barras (vertical)'], [rBarrasH, 'barras (horizontal)'], [rApilada, 'apilada100']].forEach(function (par) {
  var raizForma = par[0], nombreForma = par[1];
  var textos = raizForma.consultarTodo('text');
  afirmar(textos.length > 0, nombreForma + ': debe emitir al menos un nodo <text>');
  textos.forEach(function (nodo) {
    var tamanoFuente = parseFloat(nodo.getAttribute('font-size'));
    afirmar(!isNaN(tamanoFuente) && tamanoFuente >= 11,
      nombreForma + ': todo <text> debe declarar font-size explícito >= 11px físicos (D3) (encontrado: ' + nodo.getAttribute('font-size') + ')');
  });
});

// ---------------------------------------------------------------------
// 18. QA ronda 1 - D2: margen derecho reservado en el layout calculado; la
// etiqueta de punta no debe recortarse contra el borde del viewBox, ni
// siquiera con valores largos en un contenedor angosto (linea y barras
// horizontales, los dos casos señalados por el QA).
// ---------------------------------------------------------------------
var cLineaLarga = contenedorNuevo();
cLineaLarga.clientWidth = 260; // contenedor angosto, típico de un small multiple
var rLineaLarga = Charts.linea(cLineaLarga, {
  series: [
    { nombre: 'A', datos: [10, 20, 12345.6] },
    { nombre: 'B', datos: [10, 20, -987.4] }
  ],
  etiquetasX: ['S1', 'S2', 'S3']
});
var anchoViewBoxLineaLarga = anchoViewBox(rLineaLarga);
var etiquetasPuntaLineaLarga = rLineaLarga.consultarTodo('.hz-etiqueta-valor');
afirmar(etiquetasPuntaLineaLarga.length === 2, 'linea: debe emitir una etiqueta de punta por serie');
etiquetasPuntaLineaLarga.forEach(function (etiqueta) {
  var xInicio = parseFloat(etiqueta.getAttribute('x'));
  var anchoEstimado = Charts._debug.estimarAnchoTexto(etiqueta.textContent, Charts._debug.TAMANO_FUENTE_ETIQUETA);
  afirmar(xInicio + anchoEstimado <= anchoViewBoxLineaLarga,
    'linea: la etiqueta de punta "' + etiqueta.textContent + '" debe caber dentro del viewBox sin recortarse (D2) (x=' +
    xInicio + ', ancho estimado=' + anchoEstimado.toFixed(1) + ', viewBox=' + anchoViewBoxLineaLarga + ')');
});

var cBarraHLarga = contenedorNuevo();
cBarraHLarga.clientWidth = 240;
var rBarraHLarga = Charts.barras(cBarraHLarga, {
  orientacion: 'horizontal',
  categorias: ['Suplemento A', 'Suplemento B'],
  series: [{ nombre: 'Adherencia', datos: [42, 99876.3] }]
});
var anchoViewBoxBarraHLarga = anchoViewBox(rBarraHLarga);
var etiquetaValorBarraHLarga = rBarraHLarga.consultarTodo('.hz-etiqueta-valor')[0];
afirmar(!!etiquetaValorBarraHLarga, 'barras horizontales con serie única debe emitir la etiqueta de valor de la barra máxima');
var xInicioBarraHLarga = parseFloat(etiquetaValorBarraHLarga.getAttribute('x'));
var anchoEstimadoBarraHLarga = Charts._debug.estimarAnchoTexto(etiquetaValorBarraHLarga.textContent, Charts._debug.TAMANO_FUENTE_ETIQUETA);
afirmar(xInicioBarraHLarga + anchoEstimadoBarraHLarga <= anchoViewBoxBarraHLarga,
  'barras horizontales: la etiqueta de valor de punta debe caber dentro del viewBox sin recortarse (D2) (x=' +
  xInicioBarraHLarga + ', ancho estimado=' + anchoEstimadoBarraHLarga.toFixed(1) + ', viewBox=' + anchoViewBoxBarraHLarga + ')');

// ---------------------------------------------------------------------
// 19. QA ronda 3 (a): colisión de labels X en apilada100 (macros por comida) — deben
// rotarse ~35 grados con text-anchor end cuando no caben, NUNCA quedar encimados ni
// reemplazarse por un número encima de cada punto.
// ---------------------------------------------------------------------
var CATEGORIAS_MACROS_QAR3 = ['Desayuno', 'Colación matutina', 'Comida', 'Colación vespertina', 'Cena'];

// 19.1 Unidad pura: el mismo set de categorías del QA, en una banda angosta (típico de
// una card de 3 columnas), debe decidir rotar.
var decisionAngosta = Charts._debug.calcularRotacionEtiquetasX(CATEGORIAS_MACROS_QAR3, (300 - 32) / 5);
afirmar(decisionAngosta.rotar === true,
  'calcularRotacionEtiquetasX: con las 5 categorías de macros en una banda angosta (~53.6px) debe decidir rotar (regresión QA-R3 a)');
afirmar(decisionAngosta.margenAbajo > 40,
  'calcularRotacionEtiquetasX: al rotar debe reservar más margen inferior que el caso sin rotar (40px)');

// 19.2 Anti-regresión: categorías cortas en una banda amplia NO deben rotar.
var decisionAmplia = Charts._debug.calcularRotacionEtiquetasX(['Día 1', 'Día 2', 'Día 3'], 200);
afirmar(decisionAmplia.rotar === false,
  'calcularRotacionEtiquetasX: categorías cortas en banda amplia no deben rotar (no regresionar el caso normal)');

// 19.3 Render real reproduciendo la card del QA (apilada100, contenedor angosto ~300px):
// las 5 etiquetas deben rotar TODAS juntas (nunca una mezcla), con text-anchor end y
// transform rotate(-35 ...), y CERO etiquetas de valor sobre cada punto.
var cApiladaMacros = contenedorNuevo();
cApiladaMacros.clientWidth = 300;
var rApiladaMacros = Charts.apilada100(cApiladaMacros, {
  titulo: 'Macronutrientes por comida',
  categorias: CATEGORIAS_MACROS_QAR3,
  series: [
    { nombre: 'Proteínas', datos: [30, 25, 35, 22, 28] },
    { nombre: 'Carbohidratos', datos: [45, 50, 40, 55, 48] },
    { nombre: 'Grasas', datos: [25, 25, 25, 23, 24] }
  ]
});
var todosLosTextosApiladaMacros = rApiladaMacros.consultarTodo('text');
var etiquetasCategoriaApiladaMacros = todosLosTextosApiladaMacros.filter(function (t) { return CATEGORIAS_MACROS_QAR3.indexOf(t.textContent) !== -1; });
afirmar(etiquetasCategoriaApiladaMacros.length === CATEGORIAS_MACROS_QAR3.length,
  'apilada100: debe emitir exactamente una etiqueta de categoría por banda del eje X (5)');
etiquetasCategoriaApiladaMacros.forEach(function (etiqueta) {
  afirmar(etiqueta.getAttribute('data-etiqueta-rotada') === '1',
    'apilada100 (QA-R3 a): con las 5 categorías de macros en un contenedor angosto, CADA etiqueta debe rotarse (prohibido dejarlas encimadas): "' + etiqueta.textContent + '"');
  afirmar(etiqueta.getAttribute('text-anchor') === 'end',
    'apilada100 (QA-R3 a): la etiqueta rotada debe usar text-anchor end: "' + etiqueta.textContent + '"');
  var transformAttr = etiqueta.getAttribute('transform') || '';
  afirmar(transformAttr.indexOf('rotate(-' + Charts._debug.ROTACION_ETIQUETA_X_GRADOS) === 0,
    'apilada100 (QA-R3 a): la etiqueta rotada debe declarar transform="rotate(-' + Charts._debug.ROTACION_ETIQUETA_X_GRADOS + ' ...)" (encontrado: "' + transformAttr + '")');
});
afirmar(rApiladaMacros.consultarTodo('.hz-etiqueta-valor').length === 0,
  'apilada100 (QA-R3 a): jamás debe dibujar un número encima de cada punto como alternativa a rotar/truncar');

// 19.4 Anti-regresión: el caso ya cubierto (rApilada, categorías cortas, ancho 640) no debe
// rotarse — el fix no debe activarse quando no hace falta.
var etiquetasSinRotarApilada = rApilada.consultarTodo('text').filter(function (t) { return t.getAttribute('data-etiqueta-rotada') != null; });
afirmar(etiquetasSinRotarApilada.length === 0,
  'apilada100: con categorías cortas que ya caben (Semana 1..3, ancho 640) ninguna etiqueta debe rotarse (no regresionar el caso normal)');

// 19.5 El mismo fix aplica a barras verticales (regla genérica del contrato: "en gráficas
// de barras/apilada verticales"): categorías largas en un contenedor angosto deben rotar.
var cBarrasVerticalLargas = contenedorNuevo();
cBarrasVerticalLargas.clientWidth = 300;
var rBarrasVerticalLargas = Charts.barras(cBarrasVerticalLargas, {
  categorias: CATEGORIAS_MACROS_QAR3,
  series: [{ nombre: 'Kcal', datos: [420, 180, 610, 210, 480] }]
});
var etiquetasCategoriaBarrasVert = rBarrasVerticalLargas.consultarTodo('text').filter(function (t) { return CATEGORIAS_MACROS_QAR3.indexOf(t.textContent) !== -1; });
afirmar(etiquetasCategoriaBarrasVert.length === CATEGORIAS_MACROS_QAR3.length,
  'barras (vertical): debe emitir una etiqueta de categoría por banda del eje X (5)');
etiquetasCategoriaBarrasVert.forEach(function (etiqueta) {
  afirmar(etiqueta.getAttribute('data-etiqueta-rotada') === '1',
    'barras (vertical, QA-R3 a): con categorías largas en contenedor angosto deben rotarse igual que en apilada100: "' + etiqueta.textContent + '"');
});

// ---------------------------------------------------------------------
// 20. QA ronda 3 (b): truncado izquierdo de labels Y en barras horizontales — el gutter
// debe crecer hasta ~40% del ancho y, si aun así no cabe, truncar SIEMPRE al FINAL (nunca
// por el inicio), con el texto completo disponible en tooltip, title/aria-label y tabla.
// ---------------------------------------------------------------------
var ETIQUETA_LARGA_QAR3 = 'Omega-3 (aceite de pescado)';
var CATEGORIAS_SUPLEMENTOS_QAR3 = [ETIQUETA_LARGA_QAR3, 'Vitamina D3', 'Magnesio quelado', 'Probiótico multiflora'];

var cBarrasHSuplementos = contenedorNuevo();
cBarrasHSuplementos.clientWidth = 300;
var rBarrasHSuplementos = Charts.barras(cBarrasHSuplementos, {
  orientacion: 'horizontal',
  categorias: CATEGORIAS_SUPLEMENTOS_QAR3,
  series: [{ nombre: 'Adherencia', datos: [78, 91, 65, 82] }],
  tabla: true
});
var anchoViewBoxSuplementos = anchoViewBox(rBarrasHSuplementos);
var etiquetasCategoriaSuplementos = rBarrasHSuplementos.consultarTodo('text').filter(function (t) {
  return !t.classList.contains('hz-etiqueta-valor');
});
afirmar(etiquetasCategoriaSuplementos.length === CATEGORIAS_SUPLEMENTOS_QAR3.length,
  'barras (horizontal): debe emitir una etiqueta de categoría por fila (4)');

etiquetasCategoriaSuplementos.forEach(function (etiqueta, idx) {
  var original = CATEGORIAS_SUPLEMENTOS_QAR3[idx];
  var mostrado = etiqueta.textContent;
  var xFinal = parseFloat(etiqueta.getAttribute('x'));
  var anchoEstimadoMostrado = Charts._debug.estimarAnchoTexto(mostrado, Charts._debug.TAMANO_FUENTE_EJE);
  var xInicioMostrado = xFinal - anchoEstimadoMostrado;
  afirmar(xInicioMostrado >= -0.5,
    'barras (horizontal, QA-R3 b): la etiqueta "' + mostrado + '" no debe desbordar hacia x negativo (recorte por el INICIO contra el borde del viewBox) (x_inicio=' + xInicioMostrado.toFixed(1) + ')');
  afirmar(xFinal <= anchoViewBoxSuplementos * Charts._debug.GUTTER_IZQUIERDO_PROPORCION_MAX + 0.5,
    'barras (horizontal, QA-R3 b): el gutter izquierdo no debe exceder ~40% del ancho del chart (x=' + xFinal + ', tope=' + (anchoViewBoxSuplementos * Charts._debug.GUTTER_IZQUIERDO_PROPORCION_MAX) + ')');
  if (mostrado !== original) {
    afirmar(mostrado.charAt(mostrado.length - 1) === '…',
      'barras (horizontal, QA-R3 b): si se trunca, debe terminar en elipsis (…): "' + mostrado + '"');
    var sinElipsis = mostrado.slice(0, -1);
    afirmar(original.indexOf(sinElipsis) === 0,
      'barras (horizontal, QA-R3 b): el texto truncado debe ser un PREFIJO del original (recorte al FINAL, nunca por el inicio); original="' + original + '" mostrado="' + mostrado + '"');
    afirmar(etiqueta.getAttribute('data-etiqueta-truncada') === '1',
      'barras (horizontal, QA-R3 b): una etiqueta truncada debe marcarse con data-etiqueta-truncada=1');
    afirmar(etiqueta.getAttribute('aria-label') === original,
      'barras (horizontal, QA-R3 b): una etiqueta truncada debe llevar aria-label con el texto completo');
  } else {
    afirmar(!etiqueta.hasAttribute('data-etiqueta-truncada'),
      'barras (horizontal, QA-R3 b): una etiqueta que SI cabe completa no debe marcarse como truncada (no regresionar el caso normal): "' + mostrado + '"');
  }
});

afirmar(etiquetasCategoriaSuplementos[0].textContent !== ETIQUETA_LARGA_QAR3,
  'barras (horizontal, QA-R3 b): en un contenedor angosto (300px) el label más largo del QA debe truncarse (si esto falla en un ancho mayor no es regresión; ajustar el escenario del test)');
afirmar(ETIQUETA_LARGA_QAR3.indexOf('3 (aceite de pescado)') !== 0,
  'sanity: la cadena de regresión original no debe ser el propio prefijo (evita un test que pase por accidente)');
afirmar(etiquetasCategoriaSuplementos[0].textContent.indexOf('3 (aceite de pescado)') !== 0,
  'barras (horizontal, QA-R3 b): el label mostrado JAMÁS debe ser el sufijo recortado por el inicio ("3 (aceite de pescado)...") que reporto el QA');

// 20.1 El tooltip de la barra (hover/focus) y la tabla equivalente deben mostrar SIEMPRE el
// texto COMPLETO, incluso cuando la etiqueta del eje está truncada.
var zonasHitSuplementos = rBarrasHSuplementos.consultarTodo('rect').filter(function (r) { return r.getAttribute('fill-opacity') === '0'; });
afirmar(zonasHitSuplementos.length === CATEGORIAS_SUPLEMENTOS_QAR3.length,
  'barras (horizontal): debe haber una zona de hit por categoría (4)');
zonasHitSuplementos[0].despachar('pointerenter');
var tooltipSuplementos = rBarrasHSuplementos.consultarTodo('.hz-tooltip')[0];
afirmar(tooltipSuplementos.textContent.indexOf(ETIQUETA_LARGA_QAR3) !== -1,
  'barras (horizontal, QA-R3 b): el tooltip debe mostrar el texto COMPLETO de la categoría aunque la etiqueta del eje esté truncada (tooltip="' + tooltipSuplementos.textContent + '")');
zonasHitSuplementos[0].despachar('pointerleave');

var filaTablaSuplementos = rBarrasHSuplementos.consultarTodo('.hz-table-wrap')[0].consultarTodo('tbody')[0].consultarTodo('tr')[0];
var primeraCeldaSuplementos = filaTablaSuplementos.children[0];
afirmar(primeraCeldaSuplementos.textContent === ETIQUETA_LARGA_QAR3,
  'barras (horizontal, QA-R3 b): la tabla ("Ver tabla") debe mostrar el texto COMPLETO de la categoría, nunca truncado');

// 20.2 Anti-regresión: labels cortos en un contenedor amplio no deben truncarse.
var cBarrasHCortas = contenedorNuevo();
var rBarrasHCortas = Charts.barras(cBarrasHCortas, {
  orientacion: 'horizontal',
  categorias: ['Lun', 'Mar'],
  series: [{ nombre: 'Kcal', datos: [1500, 1600] }],
  ancho: 640
});
var etiquetasCortas = rBarrasHCortas.consultarTodo('text').filter(function (t) { return !t.classList.contains('hz-etiqueta-valor'); });
etiquetasCortas.forEach(function (etiqueta) {
  afirmar(!etiqueta.hasAttribute('data-etiqueta-truncada'),
    'barras (horizontal): labels cortos en contenedor amplio no deben truncarse (no regresionar el caso normal): "' + etiqueta.textContent + '"');
});

// ---------------------------------------------------------------------
// 21. T-025: anti-colisión de labels de punta de linea() (leader lines). Root
// cause del triple rechazo de T-018 (nota REJECTED de las 11:26 en
// .harness/tasks/T-018.json): plicometria S12, Subescapular (20mm) vs
// Suprailiaco (21mm) en escala 0-40 -- 1mm de separación real, ~5.8px entre
// centros, menos que una linea de texto -- los labels se fundian ilegibles.
// ---------------------------------------------------------------------

// 21.1 Reproducción del caso real (mismos valores de plicometria S12 que reporto
// el verifier de T-018): el par colisionante debe separarse a >= 12px.
var cPlicometria = contenedorNuevo();
var rPlicometria = Charts.linea(cPlicometria, {
  titulo: 'Plicometría en 4 cortes',
  series: [
    { nombre: 'Tricipital', datos: [18, 17, 16, 15] },
    { nombre: 'Subescapular', datos: [24, 23, 21, 20] },
    { nombre: 'Suprailiaco', datos: [26, 25, 23, 21] },
    { nombre: 'Abdominal', datos: [30, 28, 26, 24] }
  ],
  etiquetasX: ['S1', 'S4', 'S8', 'S12'],
  yMin: 0, yMax: 40
});
var etiquetasPlicometria = rPlicometria.consultarTodo('.hz-etiqueta-valor');
afirmar(etiquetasPlicometria.length === 4, 'linea (T-025): con 4 series debe emitir 4 etiquetas de punta, una por serie');
var ySubescapular = etiquetasPlicometria.filter(function (e) { return e.textContent === '20'; })[0];
var ySuprailiaco = etiquetasPlicometria.filter(function (e) { return e.textContent === '21'; })[0];
afirmar(!!ySubescapular && !!ySuprailiaco,
  'linea (T-025): deben existir las etiquetas de valor "20" (Subescapular) y "21" (Suprailiaco) del caso real de plicometria S12');
var separacionPlicometria = Math.abs(parseFloat(ySubescapular.getAttribute('y')) - parseFloat(ySuprailiaco.getAttribute('y')));
afirmar(separacionPlicometria >= Charts._debug.ALTURA_MINIMA_ETIQUETA_PUNTA - 0.01,
  'linea (T-025): el par colisionante real (Subescapular 20 / Suprailiaco 21, ~5.8px de separación original en escala 0-40) debe quedar separado >= 12px tras el anti-colisión (encontrado: ' + separacionPlicometria.toFixed(2) + 'px)');

// 21.2 Colisión forzada (mismo valor final -> separación original 0px, el
// desplazamiento resultante SI supera el umbral de la linea guia): prueba el
// camino completo -- separación >= 12px Y linea guia presente en ambos labels.
var cColisionForzada = contenedorNuevo();
var rColisionForzada = Charts.linea(cColisionForzada, {
  series: [
    { nombre: 'A', datos: [10, 12, 15, 20] },
    { nombre: 'B', datos: [30, 25, 22, 20] }
  ],
  etiquetasX: ['S1', 'S2', 'S3', 'S4'],
  yMin: 0, yMax: 40
});
var etiquetasColisionForzada = rColisionForzada.consultarTodo('.hz-etiqueta-valor');
afirmar(etiquetasColisionForzada.length === 2, 'linea (T-025): fixture de colisión forzada debe emitir 2 etiquetas de punta');
var yColisionA = parseFloat(etiquetasColisionForzada[0].getAttribute('y'));
var yColisionB = parseFloat(etiquetasColisionForzada[1].getAttribute('y'));
afirmar(Math.abs(yColisionA - yColisionB) >= Charts._debug.ALTURA_MINIMA_ETIQUETA_PUNTA - 0.01,
  'linea (T-025): con dos series terminando en el MISMO valor (colisión total) los labels deben separarse a >= 12px');
etiquetasColisionForzada.forEach(function (e) {
  afirmar(e.getAttribute('data-etiqueta-desplazada') === '1',
    'linea (T-025): un label desplazado > 4px de su punto debe marcarse con data-etiqueta-desplazada=1');
});
var guiasColisionForzada = rColisionForzada.consultarTodo('.hz-etiqueta-guia');
afirmar(guiasColisionForzada.length === 2,
  'linea (T-025): el par colisionante forzado debe emitir una linea guia (.hz-etiqueta-guia) por cada label desplazado > 4px');
guiasColisionForzada.forEach(function (guia) {
  afirmar(guia.getAttribute('stroke-width') === '1', 'linea (T-025): la linea guia debe ser hairline de 1px');
  afirmar(guia.style.stroke === 'var(--axis)', 'linea (T-025): la linea guia debe usar var(--axis) via style.stroke');
});

// 21.3 Anti-regresión: un par que NO colisiona (separación original ya >= 12px) no
// debe desplazarse ni llevar linea guia -- el fix no debe activarse sin colisión.
var cSinColision = contenedorNuevo();
var rSinColision = Charts.linea(cSinColision, {
  series: [
    { nombre: 'A', datos: [10, 15, 20, 30] },
    { nombre: 'B', datos: [10, 12, 14, 10] }
  ],
  etiquetasX: ['S1', 'S2', 'S3', 'S4'],
  yMin: 0, yMax: 40
});
var etiquetasSinColision = rSinColision.consultarTodo('.hz-etiqueta-valor');
afirmar(etiquetasSinColision.length === 2, 'linea (T-025): fixture sin colisión debe emitir 2 etiquetas de punta');
etiquetasSinColision.forEach(function (e) {
  afirmar(!e.hasAttribute('data-etiqueta-desplazada'),
    'linea (T-025): un par SIN colisión no debe desplazar sus labels (no regresionar el caso normal): "' + e.textContent + '"');
});
afirmar(rSinColision.consultarTodo('.hz-etiqueta-guia').length === 0,
  'linea (T-025): un par SIN colisión no debe emitir ninguna linea guia');

// 21.4 Unidad pura sobre el algoritmo (Charts._debug.resolverColisionesEtiquetasPunta):
// cascada de 3 puntos colisionando entre sí, y puntos ya separados que no se mueven.
var puntosCascada = [{ cy: 100 }, { cy: 103 }, { cy: 106 }];
Charts._debug.resolverColisionesEtiquetasPunta(puntosCascada, 0, 280, Charts._debug.ALTURA_MINIMA_ETIQUETA_PUNTA);
afirmar(cercaDe(puntosCascada[1].yEtiqueta - puntosCascada[0].yEtiqueta, 12, 0.01),
  'resolverColisionesEtiquetasPunta: cascada de 3 puntos colisionando debe separar el primer par consecutivo exactamente 12px');
afirmar(cercaDe(puntosCascada[2].yEtiqueta - puntosCascada[1].yEtiqueta, 12, 0.01),
  'resolverColisionesEtiquetasPunta: cascada de 3 puntos colisionando debe separar el segundo par consecutivo exactamente 12px');

var puntosSueltos = [{ cy: 50 }, { cy: 100 }];
Charts._debug.resolverColisionesEtiquetasPunta(puntosSueltos, 0, 280, Charts._debug.ALTURA_MINIMA_ETIQUETA_PUNTA);
afirmar(puntosSueltos[0].yEtiqueta === 50 && puntosSueltos[1].yEtiqueta === 100,
  'resolverColisionesEtiquetasPunta: puntos ya separados >= 12px no deben moverse');

// ---------------------------------------------------------------------
// 22. R6 (Adendum R6 punto 2): opciones aditivas default-apagadas. Cada bloque
// prueba la opción ACTIVADA y confirma que el fixture existente (sin la
// opción) NO cambia de render (default apagado == cero cambios).
// ---------------------------------------------------------------------

// 22.1 linea: opciones.unidad — sufijo SOLO en la etiqueta de punta; los
// ticks del eje Y quedan limpios (sin sufijo).
var cLineaUnidad = contenedorNuevo();
var rLineaUnidad = Charts.linea(cLineaUnidad, {
  series: [{ nombre: 'Peso', datos: [80, 79, 78] }],
  etiquetasX: ['S1', 'S2', 'S3'],
  yMin: 0, yMax: 100,
  unidad: 'kg'
});
var etiquetaPuntaUnidad = rLineaUnidad.consultarTodo('.hz-etiqueta-valor')[0];
afirmar(etiquetaPuntaUnidad.textContent === '78 kg',
  'linea: con opciones.unidad="kg", la etiqueta de punta debe llevar el sufijo (encontrado: "' + etiquetaPuntaUnidad.textContent + '")');
var ticksYUnidad = rLineaUnidad.consultarTodo('text').filter(function (t) { return /^\d+$/.test(t.textContent); });
afirmar(ticksYUnidad.length > 0, 'linea: debe seguir emitiendo ticks numericos limpios en el eje Y');
ticksYUnidad.forEach(function (tick) {
  afirmar(tick.textContent.indexOf('kg') === -1, 'linea: opciones.unidad NUNCA debe ensuciar los ticks del eje Y (encontrado: "' + tick.textContent + '")');
});
afirmar(rLinea.consultarTodo('.hz-etiqueta-valor')[0].textContent.indexOf(' ') === -1,
  'linea: sin opciones.unidad (fixture original), la etiqueta de punta no debe llevar sufijo (default apagado, cero cambio de render)');

// 22.2 barras: opciones.unidad en la etiqueta de valor default (vertical).
var cBarrasUnidad = contenedorNuevo();
var rBarrasUnidad = Charts.barras(cBarrasUnidad, {
  categorias: ['Basal', 'Seguimiento', 'Final'],
  series: [{ nombre: 'Glucosa', datos: [104, 96, 91] }],
  unidad: 'mg/dL'
});
var etiquetaValorBarraUnidad = rBarrasUnidad.consultarTodo('.hz-etiqueta-valor')[0];
afirmar(!!etiquetaValorBarraUnidad, 'barras (vertical): debe emitir la etiqueta de valor default');
afirmar(etiquetaValorBarraUnidad.textContent === '91 mg/dL',
  'barras (vertical): con opciones.unidad, la etiqueta de valor debe llevar el sufijo (encontrado: "' + etiquetaValorBarraUnidad.textContent + '")');
afirmar(rBarras.consultarTodo('.hz-etiqueta-valor')[0].textContent.indexOf(' ') === -1,
  'barras (vertical): sin opciones.unidad (fixture original), la etiqueta de valor no debe llevar sufijo (default apagado)');

// 22.3 data-4: en barras verticales, el label directo por default va en el
// ÚLTIMO valor, no en el máximo. Fixture con el máximo en una categoría que
// NO es la última, para diferenciar ambos comportamientos sin ambigüedad.
var cBarrasUltimoValor = contenedorNuevo();
var rBarrasUltimoValor = Charts.barras(cBarrasUltimoValor, {
  categorias: ['Basal', 'Pico', 'Final'],
  series: [{ nombre: 'Glucosa', datos: [95, 130, 91] }]
});
var etiquetasValorUltimo = rBarrasUltimoValor.consultarTodo('.hz-etiqueta-valor');
afirmar(etiquetasValorUltimo.length === 1, 'barras (vertical, data-4): debe emitir exactamente una etiqueta de valor default');
afirmar(etiquetasValorUltimo[0].textContent === '91',
  'barras (vertical, data-4): el label directo por default debe ir en el ÚLTIMO valor (91), no en el máximo (130) (encontrado: "' + etiquetasValorUltimo[0].textContent + '")');

// 22.4 barras: opciones.referencia {min,max,etiqueta} — hairline 1px
// var(--text-muted) + etiqueta corta, misma anatomia que la linea Meta.
var cBarrasReferencia = contenedorNuevo();
var rBarrasReferencia = Charts.barras(cBarrasReferencia, {
  categorias: ['Basal', 'Seguimiento', 'Final'],
  series: [{ nombre: 'Glucosa', datos: [104, 96, 91] }],
  referencia: { min: 70, max: 100, etiqueta: 'Rango normal' }
});
var lineasReferencia = rBarrasReferencia.consultarTodo('.hz-referencia-linea');
afirmar(lineasReferencia.length === 2, 'barras: opciones.referencia debe dibujar exactamente 2 hairlines (min y max)');
lineasReferencia.forEach(function (l) {
  afirmar(l.getAttribute('stroke-width') === '1', 'barras: la hairline de referencia debe ser 1px');
  afirmar(l.style.stroke === 'var(--text-muted)', 'barras: la hairline de referencia debe usar var(--text-muted) (misma anatomia que la linea Meta de linea())');
});
var etiquetaReferencia = rBarrasReferencia.consultarTodo('.hz-referencia-etiqueta')[0];
afirmar(!!etiquetaReferencia, 'barras: opciones.referencia debe emitir una etiqueta corta');
afirmar(etiquetaReferencia.textContent === 'Rango normal', 'barras: la etiqueta de referencia debe usar el texto recibido');
afirmar(etiquetaReferencia.style.fill === 'var(--text-muted)', 'barras: la etiqueta de referencia debe usar var(--text-muted)');
afirmar(rBarras.consultarTodo('.hz-referencia-linea').length === 0,
  'barras: sin opciones.referencia (fixture original), no debe dibujarse ninguna hairline de referencia (default apagado)');

// 22.4b referencia en barras horizontales (mismo contrato, eje perpendicular).
var cBarrasHReferencia = contenedorNuevo();
var rBarrasHReferencia = Charts.barras(cBarrasHReferencia, {
  orientacion: 'horizontal',
  categorias: ['Suplemento A', 'Suplemento B'],
  series: [{ nombre: 'Adherencia', datos: [92, 78] }],
  referencia: { min: 0, max: 80, etiqueta: 'Meta' }
});
afirmar(rBarrasHReferencia.consultarTodo('.hz-referencia-linea').length === 2,
  'barras (horizontal): opciones.referencia también debe dibujar 2 hairlines');

// 22.4c T-034 (R6-fix): con opciones.referencia apagada, el render debe ser
// BYTE-IDENTICO (hash pinneado como guarda de regresión). Fixture AISLADO
// (sin tabla:true) para que el hash no dependa del contador global de
// idUnico() ni del orden de ejecución de otros bloques del selfcheck — solo
// de la geometría pura que calcula barras() a partir de las opciones. La
// nueva rama de código de opciones.referencia (T-034) es un cómputo puro que
// se descarta sin tocar el DOM cuando tieneReferencia es false, así que este
// hash prueba mecánicamente que ese camino sigue siendo un no-op.
var cBarrasByteIdentico = contenedorNuevo();
var rBarrasByteIdentico = Charts.barras(cBarrasByteIdentico, {
  categorias: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie'],
  series: [{ nombre: 'Kcal', datos: [1500, 1600, 1550, 1620, 1580] }]
});
afirmar(hashCadena(serializarNodo(rBarrasByteIdentico)) === 'a13db7e2:3108',
  'barras: con opciones.referencia apagada, el render debe ser BYTE-IDENTICO (hash pinneado) — un hash distinto significa que el camino sin referencia dejo de ser un no-op');

// 22.4d T-034 (R6-fix): reproduce la evidencia del coordinador (Colesterol LDL:
// Basal/Seguimiento/Final con el ÚLTIMO valor cerca del máximo del rango
// normal — antes "Rango normal" se leía encimado con la barra Final y con su
// etiqueta de valor "105"). La etiqueta de referencia debe anclarse por la
// IZQUIERDA (nunca por la derecha, esa posición es SIEMPRE del último valor,
// R6 data-4) y las cajas estimadas (estimarAnchoTexto, mismo método que usa el
// propio módulo) no deben solaparse.
var cBarrasReferenciaEvidencia = contenedorNuevo();
var rBarrasReferenciaEvidencia = Charts.barras(cBarrasReferenciaEvidencia, {
  categorias: ['Basal', 'Seguimiento', 'Final'],
  series: [{ nombre: 'Colesterol LDL', datos: [148, 128, 105] }],
  referencia: { min: 0, max: 100, etiqueta: 'Rango normal' }
});
var etiquetaRefEvidencia = rBarrasReferenciaEvidencia.consultarTodo('.hz-referencia-etiqueta')[0];
afirmar(etiquetaRefEvidencia.getAttribute('text-anchor') === 'start',
  'barras (T-034): la etiqueta de referencia debe anclarse por la izquierda (text-anchor start), nunca por la derecha (encontrado: "' + etiquetaRefEvidencia.getAttribute('text-anchor') + '")');
afirmar(parseFloat(etiquetaRefEvidencia.getAttribute('x')) === 52,
  'barras (T-034): la etiqueta de referencia debe iniciar en el extremo izquierdo de la hairline (margen.izquierda), no en el derecho (encontrado x="' + etiquetaRefEvidencia.getAttribute('x') + '")');
var etiquetaValorEvidencia = rBarrasReferenciaEvidencia.consultarTodo('.hz-etiqueta-valor')[0];
afirmar(!!etiquetaValorEvidencia && etiquetaValorEvidencia.textContent === '105',
  'barras (T-034): el fixture de evidencia debe seguir emitiendo la etiqueta de valor del último elemento (105), que SIEMPRE gana la posición derecha');
var anchoTextoRefEvidencia = Charts._debug.estimarAnchoTexto('Rango normal', Charts._debug.TAMANO_FUENTE_EJE);
var cajaRefEvidencia = {
  x0: parseFloat(etiquetaRefEvidencia.getAttribute('x')),
  x1: parseFloat(etiquetaRefEvidencia.getAttribute('x')) + anchoTextoRefEvidencia,
  y0: parseFloat(etiquetaRefEvidencia.getAttribute('y')) - Charts._debug.TAMANO_FUENTE_EJE,
  y1: parseFloat(etiquetaRefEvidencia.getAttribute('y'))
};
var anchoTextoValorEvidencia = Charts._debug.estimarAnchoTexto('105', Charts._debug.TAMANO_FUENTE_ETIQUETA);
var xValorEvidencia = parseFloat(etiquetaValorEvidencia.getAttribute('x'));
var cajaValorEvidencia = {
  x0: xValorEvidencia - anchoTextoValorEvidencia / 2, x1: xValorEvidencia + anchoTextoValorEvidencia / 2,
  y0: parseFloat(etiquetaValorEvidencia.getAttribute('y')) - Charts._debug.TAMANO_FUENTE_ETIQUETA,
  y1: parseFloat(etiquetaValorEvidencia.getAttribute('y'))
};
afirmar(!Charts._debug.cajasIntersectan(cajaRefEvidencia, cajaValorEvidencia),
  'barras (T-034, evidencia LDL): la caja estimada de "Rango normal" no debe solapar la caja de la etiqueta de valor del último elemento ("105") (regresión del defecto reportado)');

// 22.4e T-034 (R6-fix, unidad pura): sin colisión, resolverPosicionEtiquetaReferencia
// debe dejar la etiqueta a la izquierda EN LINEA con la hairline (separación
// fija de 4px, sin desplazamiento vertical adicional).
var posicionSinColisionRef = Charts._debug.resolverPosicionEtiquetaReferencia(52, 200, 'Rango normal', Charts._debug.TAMANO_FUENTE_EJE, 4, []);
afirmar(posicionSinColisionRef.x === 52,
  'resolverPosicionEtiquetaReferencia (sin colisión): x debe quedar en el extremo izquierdo recibido (encontrado: ' + posicionSinColisionRef.x + ')');
afirmar(posicionSinColisionRef.caja.y1 === 196,
  'resolverPosicionEtiquetaReferencia (sin colisión): la etiqueta debe quedar en línea con la hairline (yHairline - separacionMinima = 200 - 4 = 196), sin desplazamiento adicional (encontrado: ' + posicionSinColisionRef.caja.y1 + ')');

// 22.4f T-034 (R6-fix, unidad pura): caso sintético con un obstáculo (barra o
// etiqueta de valor final) CERCANO en la misma franja vertical de la posición
// por defecto => la caja resultante NO debe intersectar al obstáculo, y debe
// quedar por encima de él con separación >= 4px.
var obstaculoCercanoRef = { x0: 40, x1: 140, y0: 190, y1: 230 };
var posicionConColisionRef = Charts._debug.resolverPosicionEtiquetaReferencia(52, 200, 'Rango normal', Charts._debug.TAMANO_FUENTE_EJE, 4, [obstaculoCercanoRef]);
afirmar(!Charts._debug.cajasIntersectan(posicionConColisionRef.caja, obstaculoCercanoRef),
  'resolverPosicionEtiquetaReferencia (con colisión): la caja final de la etiqueta no debe intersectar la caja del obstáculo cercano');
afirmar(posicionConColisionRef.caja.y1 <= obstaculoCercanoRef.y0 - 4,
  'resolverPosicionEtiquetaReferencia (con colisión): debe desplazarse por encima del obstáculo con separación >= 4px (encontrado y1=' + posicionConColisionRef.caja.y1 + ', obstáculo.y0=' + obstaculoCercanoRef.y0 + ')');

// 22.5 barras: opciones.valoresEnBarras (horizontal, serie única, <=6 categorías)
// — valor al final de CADA barra, no solo la máxima.
var cValoresEnBarras = contenedorNuevo();
var rValoresEnBarras = Charts.barras(cValoresEnBarras, {
  orientacion: 'horizontal',
  categorias: ['Omega-3', 'Vitamina D3', 'Magnesio', 'Probiótico'],
  series: [{ nombre: 'Adherencia', datos: [78, 91, 65, 82] }],
  valoresEnBarras: true,
  unidad: '%'
});
var etiquetasValoresEnBarras = rValoresEnBarras.consultarTodo('.hz-etiqueta-valor');
afirmar(etiquetasValoresEnBarras.length === 4,
  'barras (horizontal, valoresEnBarras): debe emitir una etiqueta de valor por CADA categoría (4), no solo la máxima');
var textosValoresEnBarras = etiquetasValoresEnBarras.map(function (e) { return e.textContent; });
afirmar(textosValoresEnBarras.indexOf('78 %') !== -1 && textosValoresEnBarras.indexOf('65 %') !== -1,
  'barras (horizontal, valoresEnBarras): las etiquetas de valores NO máximos también deben aparecer, con el sufijo de unidad (encontrado: ' + textosValoresEnBarras.join(', ') + ')');

// 22.6 valoresEnBarras: guard de <=6 categorías — con 7 categorías, la opción
// se ignora silenciosamente y se conserva el comportamiento default (1 sola
// etiqueta, la de la barra máxima), sin lanzar.
var categorias7 = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'];
var cValoresEnBarras7 = contenedorNuevo();
var rValoresEnBarras7;
afirmar((function () {
  try {
    rValoresEnBarras7 = Charts.barras(cValoresEnBarras7, {
      orientacion: 'horizontal',
      categorias: categorias7,
      series: [{ nombre: 'X', datos: [10, 20, 30, 40, 50, 60, 70] }],
      valoresEnBarras: true
    });
    return true;
  } catch (e) { console.error(e); return false; }
})(), 'barras (horizontal, valoresEnBarras): con 7 categorías (> 6) no debe lanzar');
afirmar(rValoresEnBarras7.consultarTodo('.hz-etiqueta-valor').length === 1,
  'barras (horizontal, valoresEnBarras): con 7 categorías (> 6) debe ignorar la opción y conservar el comportamiento default (1 sola etiqueta, la máxima)');

// 22.7 apilada100: opciones.etiquetasSegmento — % SOLO en segmentos con alto
// >= 14px; segmentos angostos quedan sin etiqueta (los cubre la tabla).
var cApiladaSegmentos = contenedorNuevo();
var rApiladaSegmentos = Charts.apilada100(cApiladaSegmentos, {
  categorias: ['Comida'],
  series: [
    { nombre: 'Proteínas', datos: [48] },
    { nombre: 'Carbohidratos', datos: [48] },
    { nombre: 'Grasas', datos: [4] }
  ],
  alto: 400,
  etiquetasSegmento: true
});
var etiquetasSegmento = rApiladaSegmentos.consultarTodo('.hz-etiqueta-segmento');
afirmar(etiquetasSegmento.length === 2,
  'apilada100 (etiquetasSegmento): con 2 segmentos grandes (48% de 400px de alto) y 1 angosto (4%), debe etiquetar SOLO los 2 grandes (encontrado: ' + etiquetasSegmento.length + ')');
var textosSegmento = etiquetasSegmento.map(function (e) { return e.textContent; });
afirmar(textosSegmento.indexOf('48%') !== -1, 'apilada100 (etiquetasSegmento): el segmento grande debe mostrar su porcentaje ("48%") (encontrado: ' + textosSegmento.join(', ') + ')');
etiquetasSegmento.forEach(function (e) {
  afirmar(e.style.fill === 'var(--text-primary)', 'apilada100 (etiquetasSegmento): la tinta debe ser un token de texto (var(--text-primary)), jamás color de serie (regla 8)');
});
afirmar(rApilada.consultarTodo('.hz-etiqueta-segmento').length === 0,
  'apilada100: sin opciones.etiquetasSegmento (fixture original), no debe dibujarse ninguna etiqueta de segmento (default apagado)');
afirmar(rApiladaMacros.consultarTodo('.hz-etiqueta-segmento').length === 0,
  'apilada100 (QA-R3 a, anti-regresión): el fixture de rotación de categorías tampoco pasa etiquetasSegmento, cero etiquetas de segmento');

// 22.8 heatmapCalendario: opciones.encabezadosDia (iniciales L M X J V S D),
// etiquetasFila (S1, S4, S8, S12) y leyendaRampa (5 swatches --heat-1..5).
var VALORES_HEAT_R6 = [];
for (var vhr = 0; vhr < 84; vhr++) VALORES_HEAT_R6.push(10 + (vhr % 90));
var ETIQUETAS_FILA_R6 = [];
for (var efr = 0; efr < 12; efr++) ETIQUETAS_FILA_R6.push((efr === 0 || efr === 3 || efr === 7 || efr === 11) ? 'S' + (efr + 1) : '');

var cHeatR6 = contenedorNuevo();
var rHeatR6 = Charts.heatmapCalendario(cHeatR6, {
  valores: VALORES_HEAT_R6,
  etiquetas: VALORES_HEAT_R6.map(function (_, idx) { return 'D' + (idx + 1); }),
  columnas: 7,
  min: 0, max: 100,
  encabezadosDia: true,
  etiquetasFila: ETIQUETAS_FILA_R6,
  leyendaRampa: true,
  tabla: true
});

var encabezadosDiaR6 = rHeatR6.consultarTodo('.hz-heat-encabezado-dia');
afirmar(encabezadosDiaR6.length === 7, 'heatmapCalendario (encabezadosDia): debe emitir exactamente 7 encabezados (uno por columna)');
var textosEncabezadosR6 = encabezadosDiaR6.map(function (e) { return e.textContent; });
afirmar(textosEncabezadosR6.join('') === 'LMXJVSD',
  'heatmapCalendario (encabezadosDia): con etiquetas no fechables (fallback canónico lunes-primero) debe emitir L M X J V S D en orden (encontrado: ' + textosEncabezadosR6.join(' ') + ')');
encabezadosDiaR6.forEach(function (e) {
  afirmar(e.style.fill === 'var(--text-muted)', 'heatmapCalendario (encabezadosDia): debe usar var(--text-muted)');
});

var etiquetasFilaR6 = rHeatR6.consultarTodo('.hz-heat-fila-etiqueta');
afirmar(etiquetasFilaR6.length === 4,
  'heatmapCalendario (etiquetasFila): con solo 4 entradas no vacías (S1,S4,S8,S12 de 12 filas), debe emitir exactamente 4 rótulos (encontrado: ' + etiquetasFilaR6.length + ')');
var textosFilaR6 = etiquetasFilaR6.map(function (e) { return e.textContent; }).sort();
afirmar(textosFilaR6.join(',') === 'S1,S12,S4,S8',
  'heatmapCalendario (etiquetasFila): los rótulos emitidos deben ser exactamente S1, S4, S8, S12 (encontrado: ' + textosFilaR6.join(', ') + ')');

var leyendaRampaR6 = rHeatR6.consultarTodo('.hz-legend')[0];
afirmar(!!leyendaRampaR6, 'heatmapCalendario (leyendaRampa): debe emitir una .hz-legend (reutilizando construirLeyenda)');
var itemsLeyendaRampaR6 = rHeatR6.consultarTodo('.hz-legend-item');
afirmar(itemsLeyendaRampaR6.length === 5, 'heatmapCalendario (leyendaRampa): debe emitir exactamente 5 swatches (uno por bucket --heat-1..5)');
var swatchesRampaR6 = rHeatR6.consultarTodo('.hz-legend-swatch');
swatchesRampaR6.forEach(function (sw, idx) {
  var tokenEsperado = 'var(--heat-' + (idx + 1) + ')';
  afirmar(sw.style.backgroundColor === tokenEsperado,
    'heatmapCalendario (leyendaRampa): el swatch ' + idx + ' debe usar ' + tokenEsperado + ' (encontrado: ' + sw.style.backgroundColor + ')');
});
itemsLeyendaRampaR6.forEach(function (item) {
  afirmar(/^-?\d+(\.\d+)?-\d+(\.\d+)?$/.test(item.textContent),
    'heatmapCalendario (leyendaRampa): cada item debe mostrar el rango numérico "desde-hasta" del bucket (encontrado: "' + item.textContent + '")');
});
afirmar(itemsLeyendaRampaR6[0].textContent === '0-20', 'heatmapCalendario (leyendaRampa): el primer bucket debe cubrir 0-20 (min=0, max=100, 5 pasos)');
afirmar(itemsLeyendaRampaR6[4].textContent === '80-100', 'heatmapCalendario (leyendaRampa): el último bucket debe cubrir 80-100 (min=0, max=100, 5 pasos)');

// Celdas y tabla siguen intactas con las opciones nuevas activas (aditivo, no reemplaza).
afirmar(rHeatR6.consultarTodo('.hz-heat-celda').length === 84, 'heatmapCalendario (R6): las celdas de valor deben seguir emitiéndose igual (84)');

// Anti-regresión: el fixture original (rHeat, sin ninguna opción R6) no debe
// ganar ninguno de los elementos nuevos (default apagado, cero cambio de render).
afirmar(rHeat.consultarTodo('.hz-heat-encabezado-dia').length === 0, 'heatmapCalendario: sin encabezadosDia (fixture original), cero encabezados (default apagado)');
afirmar(rHeat.consultarTodo('.hz-heat-fila-etiqueta').length === 0, 'heatmapCalendario: sin etiquetasFila (fixture original), cero rótulos de fila (default apagado)');
afirmar(rHeat.consultarTodo('.hz-legend').length === 0, 'heatmapCalendario: sin leyendaRampa (fixture original), cero .hz-legend (default apagado)');

// 22.8b unidad pura: derivarInicialDiaSemana con fecha ISO real debe derivar el
// día de la semana REAL (no el fallback canónico) — 2026-08-31 es lunes.
afirmar(Charts._debug.derivarInicialDiaSemana('2026-08-31', 5) === 'L',
  'derivarInicialDiaSemana: con una fecha ISO parseable debe derivar el día real (2026-08-31 es lunes), ignorando la posición de columna');
afirmar(Charts._debug.derivarInicialDiaSemana('D42', 2) === 'X',
  'derivarInicialDiaSemana: con una etiqueta no fechable debe caer al orden canónico lunes-primero por posición de columna (índice 2 = miércoles = X)');
afirmar(Charts._debug.derivarInicialDiaSemana('D1', 0) === 'L' && Charts._debug.derivarInicialDiaSemana('D1', 6) === 'D',
  'derivarInicialDiaSemana: fallback canónico debe ir L(0) ... D(6)');

// 22.8c unidad pura: calcularBucketRampa / calcularRangosBucketsRampa.
afirmar(Charts._debug.calcularBucketRampa(0, 0, 100, 5) === 0, 'calcularBucketRampa: el mínimo debe caer en el bucket 0');
afirmar(Charts._debug.calcularBucketRampa(100, 0, 100, 5) === 4, 'calcularBucketRampa: el máximo debe caer en el último bucket (4)');
afirmar(Charts._debug.calcularBucketRampa(50, 0, 100, 5) === 2, 'calcularBucketRampa: el punto medio debe caer en el bucket central (2)');
var rangosPuros = Charts._debug.calcularRangosBucketsRampa(0, 100, 5);
afirmar(rangosPuros.length === 5, 'calcularRangosBucketsRampa: debe devolver 5 rangos');
afirmar(rangosPuros[0].desde === 0 && rangosPuros[4].hasta === 100,
  'calcularRangosBucketsRampa: el primer rango debe empezar en minV y el último terminar en maxV');

// 22.9 resp-6: crosshair de hover pasa a var(--text-muted); grid y ejes
// conservan var(--axis)/var(--grid) (sin tocar).
var crosshairR6 = rLinea.consultarTodo('.hz-crosshair')[0];
afirmar(crosshairR6.style.stroke === 'var(--text-muted)',
  'linea (resp-6): el crosshair de hover debe usar var(--text-muted) en vez de var(--axis) (encontrado: "' + crosshairR6.style.stroke + '")');
var ejeXPrincipal = rLinea.consultarTodo('line').filter(function (l) { return l.style.stroke === 'var(--axis)'; });
afirmar(ejeXPrincipal.length >= 1, 'linea (resp-6, anti-regresión): el eje X debe conservar var(--axis) (solo el crosshair cambió)');
var gridPrincipal = rLinea.consultarTodo('line').filter(function (l) { return l.style.stroke === 'var(--grid)'; });
afirmar(gridPrincipal.length >= 1, 'linea (resp-6, anti-regresión): las gridlines deben conservar var(--grid) (solo el crosshair cambió)');

// ---------------------------------------------------------------------
// Cierre
// ---------------------------------------------------------------------
console.log('checks ejecutados: ' + contador);
process.exit(0);
