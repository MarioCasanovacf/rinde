// build/selfcheck_vistas_b.js
// Selfcheck de node puro (sin dependencias externas) para build/vista_metricas.js.
// Formato de salida congelado en plan.md sección 3.J: última línea de stdout
// literal "checks ejecutados: N"; exit 0 solo si todas las aserciones pasan; en
// fallo, exit 1 e imprime la aserción fallida.
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

// ---------------------------------------------------------------------
// 0. Carga del módulo: DOM headless + stubs de shell (Herzon.registerView,
// Herzon.filters) ANTES de requerir vista_metricas.js -- el módulo llama a
// Herzon.registerView de forma SINCRONA al cargar, no en un boot posterior.
// ---------------------------------------------------------------------
globalThis.window = globalThis;

var DATA_PATH = path.join(__dirname, 'data.js');
var CHARTS_PATH = path.join(__dirname, 'charts.js');
var TESTDOM_PATH = path.join(__dirname, 'testdom.js');
var VISTAS_PATH = path.join(__dirname, 'vista_metricas.js');

require(DATA_PATH);
require(CHARTS_PATH);
require(TESTDOM_PATH);

var Herzon = globalThis.Herzon;
var DATA = globalThis.HERZON_DATA;

var registros = {};
Herzon.registerView = function (id, mountFn) {
  registros[id] = mountFn;
};

var rangoActual = 12;
var listenersRango = [];
Herzon.filters = {
  getRange: function () { return rangoActual; },
  onRangeChange: function (cb) { listenersRango.push(cb); }
};

require(VISTAS_PATH);

var fuenteVistas = fs.readFileSync(VISTAS_PATH, 'utf8');

var TestDOM = Herzon.TestDOM;
var doc = TestDOM.crearDocumento();
function contenedorNuevo() { return doc.createElement('div'); }

// ---------------------------------------------------------------------
// Utilidades de recorrido (whitebox sobre el TestDOM)
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
  if (!atributo) { return []; }
  return atributo.split(/\s+/).filter(function (c) { return c.length > 0; });
}
function contarPorClase(raiz, clase) {
  return recolectarNodos(raiz).filter(function (n) { return clasesDe(n).indexOf(clase) !== -1; }).length;
}
function textosDe(raiz) {
  var resultado = [];
  (function recorrer(nodo) {
    if (nodo.nodeType === 3) { resultado.push(nodo._data || ''); return; }
    for (var i = 0; i < (nodo.childNodes || []).length; i++) { recorrer(nodo.childNodes[i]); }
  })(raiz);
  return resultado;
}
function contienePrefijoHz(raiz) {
  return recolectarNodos(raiz).every(function (n) {
    return clasesDe(n).every(function (c) { return c.indexOf('hz-') === 0; });
  });
}
function polylinesDe(nodo) { return nodo.consultarTodo('polyline'); }
function puntosDe(polyline) {
  var attr = polyline.getAttribute('points') || '';
  return attr.trim().length ? attr.trim().split(/\s+/) : [];
}

// ---------------------------------------------------------------------
// 1. Higiene de fuente (build/vista_metricas.js)
// ---------------------------------------------------------------------
afirmar(!/#[0-9a-fA-F]{3,8}\b/.test(fuenteVistas),
  'build/vista_metricas.js no debe contener hexes de color literales');
afirmar(fuenteVistas.indexOf('innerHTML') === -1,
  'build/vista_metricas.js no debe usar innerHTML en ninguna parte');
afirmar(fuenteVistas.indexOf('<style') === -1,
  'build/vista_metricas.js no debe declarar bloques <style> propios');
afirmar(fuenteVistas.indexOf('import ') === -1 && fuenteVistas.indexOf('export ') === -1,
  'build/vista_metricas.js debe ser script clasico (sin import/export)');

// ---------------------------------------------------------------------
// 2. Namespaces disjuntos (plan.md 3.B): SOLO resumen/perfil/seguimiento
// ---------------------------------------------------------------------
afirmar(typeof Herzon.Views === 'object' && Herzon.Views !== null, 'Herzon.Views debe existir');
afirmar(typeof Herzon.Views.resumen === 'function', 'Herzon.Views.resumen debe ser una función');
afirmar(typeof Herzon.Views.perfil === 'function', 'Herzon.Views.perfil debe ser una función');
afirmar(typeof Herzon.Views.seguimiento === 'function', 'Herzon.Views.seguimiento debe ser una función');
afirmar(Herzon.Views.plan === undefined, 'T-005 no debe escribir en Herzon.Views.plan (dueno T-004)');
afirmar(Herzon.Views.suplementos === undefined, 'T-005 no debe escribir en Herzon.Views.suplementos (dueno T-004)');

afirmar(Object.keys(registros).sort().join(',') === 'perfil,resumen,seguimiento',
  'Herzon.registerView debe haberse llamado EXACTAMENTE con resumen, perfil y seguimiento');
afirmar(registros.resumen === Herzon.Views.resumen, 'el registro de resumen debe ser la misma función que Herzon.Views.resumen');
afirmar(registros.perfil === Herzon.Views.perfil, 'el registro de perfil debe ser la misma función que Herzon.Views.perfil');
afirmar(registros.seguimiento === Herzon.Views.seguimiento, 'el registro de seguimiento debe ser la misma función que Herzon.Views.seguimiento');

// ---------------------------------------------------------------------
// 3. Vista Resumen
// ---------------------------------------------------------------------
var rootResumen = contenedorNuevo();
afirmar((function () {
  try { Herzon.Views.resumen(rootResumen); return true; }
  catch (e) { console.error(e); return false; }
})(), 'Herzon.Views.resumen debe montar sin lanzar');

afirmar(contarPorClase(rootResumen, 'hz-hero') === 1, 'Vista Resumen debe tener EXACTAMENTE un .hz-hero');
afirmar(contienePrefijoHz(rootResumen), 'Vista Resumen: toda clase nueva debe llevar prefijo hz-');

var heroResumenDelta = recolectarNodos(rootResumen).filter(function (n) { return clasesDe(n).indexOf('hz-stat-delta') !== -1; });
afirmar(heroResumenDelta.length >= 1 && /^[+-]/.test(heroResumenDelta[0].textContent),
  'El número héroe de Resumen debe traer un delta con signo');

var sparklineCirculosResumen = recolectarNodos(rootResumen).filter(function (n) { return (n.tagName || '').toLowerCase() === 'circle'; });
afirmar(sparklineCirculosResumen.length === 12, 'El sparkline del heroe de Resumen debe tener exactamente 12 puntos');

afirmar(contarPorClase(rootResumen, 'hz-stat') >= 3, 'Vista Resumen debe tener al menos 3 .hz-stat');

afirmar(contarPorClase(rootResumen, 'hz-nota') === 1, 'Vista Resumen debe tener la nota .hz-nota');
var liNotaResumen = recolectarNodos(rootResumen).filter(function (n) { return (n.tagName || '').toLowerCase() === 'li'; });
afirmar(liNotaResumen.length >= 3, 'La nota "Acerca de este prototipo" debe listar al menos 3 supuestos');
afirmar(liNotaResumen.length === DATA.supuestos.length, 'La nota debe listar TODOS los supuestos de HERZON_DATA.supuestos');

// ---------------------------------------------------------------------
// 4. Vista Perfil
// ---------------------------------------------------------------------
var rootPerfil = contenedorNuevo();
afirmar((function () {
  try { Herzon.Views.perfil(rootPerfil); return true; }
  catch (e) { console.error(e); return false; }
})(), 'Herzon.Views.perfil debe montar sin lanzar');

afirmar(contarPorClase(rootPerfil, 'hz-hero') === 1, 'Vista Perfil debe tener EXACTAMENTE un .hz-hero');
afirmar(contienePrefijoHz(rootPerfil), 'Vista Perfil: toda clase nueva debe llevar prefijo hz-');

var dotsPerfil = contarPorClase(rootPerfil, 'hz-status-dot');
var labelsPerfil = contarPorClase(rootPerfil, 'hz-status-label');
afirmar(dotsPerfil === labelsPerfil, 'El número de .hz-status-dot debe ser igual al número de .hz-status-label');
afirmar(dotsPerfil === DATA.labs.marcadores.length, 'Debe haber un semaforo de estatus por cada marcador de laboratorio');

var textosPerfil = textosDe(rootPerfil).join(' ');
afirmar(textosPerfil.indexOf(String(DATA.paciente.talla_cm)) !== -1, 'La tarjeta antropometrica debe mostrar la talla del paciente');
afirmar(textosPerfil.indexOf(DATA.paciente.objetivo) !== -1, 'La tarjeta clínica debe mostrar el objetivo del paciente');

// ---------------------------------------------------------------------
// 5. Vista Seguimiento
// ---------------------------------------------------------------------
var rootSeg = contenedorNuevo();
afirmar((function () {
  try { Herzon.Views.seguimiento(rootSeg); return true; }
  catch (e) { console.error(e); return false; }
})(), 'Herzon.Views.seguimiento debe montar sin lanzar');

afirmar(contarPorClase(rootSeg, 'hz-hero') === 1, 'Vista Seguimiento debe tener EXACTAMENTE un .hz-hero');
afirmar(contienePrefijoHz(rootSeg), 'Vista Seguimiento: toda clase nueva debe llevar prefijo hz-');

var cardsSeg = recolectarNodos(rootSeg).filter(function (n) { return clasesDe(n).indexOf('hz-card') !== -1; });
function cardPorTitulo(titulo) {
  return cardsSeg.filter(function (c) {
    return recolectarNodos(c).some(function (n) { return clasesDe(n).indexOf('hz-card-title') !== -1 && n.textContent === titulo; });
  })[0];
}
var cardPeso = cardPorTitulo('Peso corporal');
var cardComp = cardPorTitulo('Composición corporal');
var cardCintura = cardPorTitulo('Circunferencia de cintura');
var cardLabs = cardPorTitulo('Laboratorios en 3 cortes');
var cardPlic = cardPorTitulo('Plicometría en 4 cortes');
afirmar(!!cardPeso && !!cardComp && !!cardCintura && !!cardLabs && !!cardPlic, 'Vista Seguimiento debe traer las 5 tarjetas de gráficas esperadas (incluida Plicometría, R4)');

// ---------------------------------------------------------------------
// 5bis. R4 (esta tarea): el heroe de Seguimiento se recalcula contra el
// PRIMER punto del rango ACTIVO (4/8/12 semanas), no contra el inicio
// absoluto de las 12 semanas -- esa lectura "desde el inicio" sigue siendo
// exclusiva de Resumen (sin filtro). Se recalcula aquí mismo desde
// HERZON_DATA con la MISMA aritmética que el módulo (redondeo a 1 decimal
// del delta en kg primero, delta% calculado a partir de ese delta YA
// redondeado) para no depender de que el módulo se autoafirme.
// ---------------------------------------------------------------------
function redondearSC(v, decimales) {
  var f = Math.pow(10, decimales || 0);
  return Math.round(v * f) / f;
}
function conSignoSC(v, decimales) {
  var r = redondearSC(v, decimales);
  return (r > 0 ? '+' : '') + String(r);
}
function ultimasNSC(arr, n) {
  var cantidad = Math.min(n, arr.length);
  return arr.slice(Math.max(arr.length - cantidad, 0));
}
function heroPesoEsperado(n) {
  var recorte = ultimasNSC(DATA.series.peso_kg, n);
  var inicioPeriodo = recorte[0];
  var pesoActual = recorte[recorte.length - 1];
  var deltaPeriodo = redondearSC(pesoActual - inicioPeriodo, 1);
  var deltaPct = inicioPeriodo ? redondearSC((deltaPeriodo / inicioPeriodo) * 100, 1) : 0;
  return {
    label: 'Cambio de peso en las últimas ' + n + ' semanas',
    num: conSignoSC(deltaPeriodo, 1) + ' kg',
    delta: conSignoSC(deltaPct, 1) + '% respecto al inicio del periodo'
  };
}
function heroActualDe(rootVista) {
  var label = recolectarNodos(rootVista).filter(function (n) { return clasesDe(n).indexOf('hz-hero-label') !== -1; })[0];
  var num = recolectarNodos(rootVista).filter(function (n) { return clasesDe(n).indexOf('hz-hero-num') !== -1; })[0];
  var delta = recolectarNodos(rootVista).filter(function (n) { return clasesDe(n).indexOf('hz-stat-delta') !== -1; })[0];
  return { label: label.textContent, num: num.textContent, delta: delta.textContent };
}
function afirmarHeroPara(n) {
  var esperado = heroPesoEsperado(n);
  var actual = heroActualDe(rootSeg);
  afirmar(actual.label === esperado.label,
    'R4 (' + n + ' semanas): la etiqueta del hero debe ser "' + esperado.label + '", obtuvo "' + actual.label + '"');
  afirmar(actual.num === esperado.num,
    'R4 (' + n + ' semanas): el número del hero debe ser "' + esperado.num + '", obtuvo "' + actual.num + '"');
  afirmar(actual.delta === esperado.delta,
    'R4 (' + n + ' semanas): el delta del hero debe ser "' + esperado.delta + '", obtuvo "' + actual.delta + '"');
}
afirmarHeroPara(12);

var polyPeso0 = polylinesDe(cardPeso);
afirmar(polyPeso0.length === 1, 'La gráfica de peso debe tener una sola serie (línea)');
afirmar(puntosDe(polyPeso0[0]).length === 12, 'Con el rango inicial (12 semanas) la línea de peso debe tener 12 puntos');

var textosPeso = textosDe(cardPeso);
afirmar(textosPeso.indexOf('55') !== -1 && textosPeso.indexOf('85') !== -1,
  'El eje Y de la línea de peso debe estar forzado literalmente a yMin=55 / yMax=85 (amplitud 30kg >= 10kg, regla de Mario)');

var polyComp0 = polylinesDe(cardComp);
afirmar(polyComp0.length === 2, 'La gráfica de composición corporal debe tener 2 series (músculo y grasa)');
afirmar(polyComp0[0].style.stroke === 'var(--series-3)', 'Masa muscular debe pintarse con series-3 (asignación fija)');
afirmar(polyComp0[1].style.stroke === 'var(--series-2)', 'Grasa corporal debe pintarse con series-2 (asignación fija)');

var polyCintura0 = polylinesDe(cardCintura);
afirmar(polyCintura0.length === 1, 'La gráfica de cintura debe tener una sola serie (línea)');
afirmar(puntosDe(polyCintura0[0]).length === 12, 'Con el rango inicial (12 semanas) la línea de cintura debe tener 12 puntos');

var chartsLabs = recolectarNodos(cardLabs).filter(function (n) { return clasesDe(n).indexOf('hz-chart') !== -1; });
afirmar(chartsLabs.length === DATA.labs.marcadores.length, 'Debe haber una gráfica de laboratorio por cada marcador, en los 3 cortes');
var togglesLabs = contarPorClase(cardLabs, 'hz-table-toggle');
afirmar(togglesLabs === DATA.labs.marcadores.length, 'Cada gráfica de laboratorio debe traer su toggle Ver tabla');

// ---------------------------------------------------------------------
// 5ter. Card de plicometría (R4): 4 series (sitios) con colores fijos del
// contrato (el color sigue al sitio), etiquetado directo obligatorio (una
// etiqueta de valor por serie, sin importar el conteo), leyenda, tooltip,
// Ver tabla, y UN solo eje Y (en mm).
// ---------------------------------------------------------------------
var TOKEN_POR_SITIO_ESPERADO = {
  tricipital: 'var(--series-1)',
  subescapular: 'var(--series-2)',
  suprailiaco: 'var(--series-3)',
  abdominal: 'var(--series-4)'
};
afirmar(DATA.plicometria.sitios.length === 4, 'HERZON_DATA.plicometria debe traer exactamente 4 sitios (contrato R4)');

var polyPlic0 = polylinesDe(cardPlic);
afirmar(polyPlic0.length === 4, 'La card de plicometría debe dibujar EXACTAMENTE 4 series (una por sitio)');
DATA.plicometria.sitios.forEach(function (sitio, idx) {
  afirmar(polyPlic0[idx].style.stroke === TOKEN_POR_SITIO_ESPERADO[sitio.clave],
    'El sitio "' + sitio.clave + '" de plicometría debe pintarse con ' + TOKEN_POR_SITIO_ESPERADO[sitio.clave] + ' (color fijo por sitio), obtuvo ' + polyPlic0[idx].style.stroke);
  afirmar(puntosDe(polyPlic0[idx]).length === DATA.plicometria.cortes.length,
    'La serie del sitio "' + sitio.clave + '" debe tener un punto por cada corte de plicometría (' + DATA.plicometria.cortes.length + ')');
});

var etiquetasDirectasPlic = recolectarNodos(cardPlic).filter(function (n) { return clasesDe(n).indexOf('hz-etiqueta-valor') !== -1; });
afirmar(etiquetasDirectasPlic.length === 4, 'La card de plicometría debe traer 4 etiquetas de valor directas, una por serie (etiquetado directo obligatorio a 4 series)');

afirmar(contarPorClase(cardPlic, 'hz-legend') === 1, 'La card de plicometría debe traer leyenda (>=2 series)');
afirmar(contarPorClase(cardPlic, 'hz-legend-item') === 4, 'La leyenda de plicometría debe listar las 4 series');
afirmar(contarPorClase(cardPlic, 'hz-tooltip') === 1, 'La card de plicometría debe traer un único tooltip');
afirmar(contarPorClase(cardPlic, 'hz-table-toggle') === 1, 'La card de plicometría debe traer el toggle Ver tabla');

var svgsPlic = recolectarNodos(cardPlic).filter(function (n) { return (n.tagName || '').toLowerCase() === 'svg'; });
afirmar(svgsPlic.length === 1, 'La card de plicometría debe tener UN solo gráfico (un solo eje Y, en mm)');

// ---------------------------------------------------------------------
// 6. Filtro de rango (contrato regla 12): re-renderiza TODAS las gráficas
// SEMANALES de la vista (peso/composición/cintura) contra el mismo corte
// de 4/8/12 semanas, y recalcula el hero contra el primer punto de ese
// mismo corte (R4). Laboratorios y Plicometría son cortes clínicos fijos
// (DECISIÓN documentada en build/vista_metricas.js): no se suscriben al
// filtro y sus series NO cambian de longitud al filtrar.
// ---------------------------------------------------------------------
afirmar(listenersRango.length === 1, 'Vista Seguimiento debe suscribirse UNA vez a Herzon.filters.onRangeChange');

listenersRango[0](4);
afirmar(puntosDe(polylinesDe(cardPeso)[0]).length === 4, 'Al filtrar a 4 semanas, la línea de peso debe tener 4 puntos');
afirmar(polylinesDe(cardComp).every(function (p) { return puntosDe(p).length === 4; }),
  'Al filtrar a 4 semanas, la composición corporal debe tener 4 puntos en AMBAS series');
afirmar(puntosDe(polylinesDe(cardCintura)[0]).length === 4, 'Al filtrar a 4 semanas, la línea de cintura debe tener 4 puntos');
afirmarHeroPara(4);
afirmar(polylinesDe(cardPlic).every(function (p) { return puntosDe(p).length === DATA.plicometria.cortes.length; }),
  'Al filtrar a 4 semanas, la plicometría NO debe recortarse: sigue con sus 4 cortes fijos (consistente con Laboratorios)');

listenersRango[0](8);
afirmar(puntosDe(polylinesDe(cardPeso)[0]).length === 8, 'Al filtrar a 8 semanas, la línea de peso debe tener 8 puntos');
afirmar(polylinesDe(cardComp).every(function (p) { return puntosDe(p).length === 8; }),
  'Al filtrar a 8 semanas, la composición corporal debe tener 8 puntos en AMBAS series');
afirmar(puntosDe(polylinesDe(cardCintura)[0]).length === 8, 'Al filtrar a 8 semanas, la línea de cintura debe tener 8 puntos');
afirmarHeroPara(8);
afirmar(polylinesDe(cardPlic).every(function (p) { return puntosDe(p).length === DATA.plicometria.cortes.length; }),
  'Al filtrar a 8 semanas, la plicometría NO debe recortarse: sigue con sus 4 cortes fijos (consistente con Laboratorios)');

// ---------------------------------------------------------------------
// 7. D5 (QA ronda 1): ninguna .hz-chart-title interna duplica el heading
//    .hz-card-title de su propia card (Peso, Composición corporal y
//    Circunferencia de cintura pasan sin "titulo" a Herzon.Charts.linea
//    precisamente por esto; solo se conserva tituloAccesible para a11y).
// ---------------------------------------------------------------------
function textoTituloInternoDuplicaHeading(rootVista) {
  var cards = recolectarNodos(rootVista).filter(function (n) { return clasesDe(n).indexOf('hz-card') !== -1; });
  for (var ci2 = 0; ci2 < cards.length; ci2++) {
    var headings = recolectarNodos(cards[ci2]).filter(function (n) { return clasesDe(n).indexOf('hz-card-title') !== -1; });
    if (!headings.length) continue;
    var textoHeading = String(headings[0].textContent || '').trim();
    var titulosInternos = recolectarNodos(cards[ci2]).filter(function (n) { return clasesDe(n).indexOf('hz-chart-title') !== -1; });
    for (var ti = 0; ti < titulosInternos.length; ti++) {
      var textoTitulo = String(titulosInternos[ti].textContent || '').trim();
      if (textoTitulo && textoHeading && textoTitulo.indexOf(textoHeading) === 0) return true;
    }
  }
  return false;
}
afirmar(!textoTituloInternoDuplicaHeading(rootSeg),
  'la vista Seguimiento no debe pintar un .hz-chart-title que duplique el heading .hz-card-title de su card (D5)');

// ---------------------------------------------------------------------
// 8. Anti-regresión D1 (QA ronda 1): ninguna de estas palabras en español
//    sin acento/eñe puede reaparecer en el CÓDIGO FUENTE de este módulo
//    (comentarios incluidos). Coincidencia con límite de palabra.
// ---------------------------------------------------------------------
var PALABRAS_SIN_ACENTO_PROHIBIDAS = [
  'anos', 'Composicion', 'Calorias', 'Regimen', 'Probiotico', 'clinica',
  'demostracion', 'sinteticos', 'ultimas', 'capsula'
];
for (var pa = 0; pa < PALABRAS_SIN_ACENTO_PROHIBIDAS.length; pa++) {
  var palabra = PALABRAS_SIN_ACENTO_PROHIBIDAS[pa];
  var regexPalabra = new RegExp('\\b' + palabra + '\\b');
  afirmar(!regexPalabra.test(fuenteVistas), 'build/vista_metricas.js contiene la palabra sin acento "' + palabra + '" (D1, QA ronda 1): revisar y corregir a español con acentos/eñe');
}

console.log('checks ejecutados: ' + contador);
process.exit(0);
