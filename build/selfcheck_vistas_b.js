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

// prod-1 (Adendum R6 punto 4): Node no implementa addEventListener sobre
// globalThis (a diferencia de un navegador real) -- se stubea con la MISMA
// técnica que build/selfcheck_docs.js usa para dispatchEvent, solo para
// capturar el listener que vista_metricas.js registre para
// 'herzon:mediciones-importadas' y poder invocarlo directamente más abajo.
var listenersEventoImportacion = [];
globalThis.addEventListener = function (tipo, manejador) {
  if (tipo === 'herzon:mediciones-importadas') { listenersEventoImportacion.push(manejador); }
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
afirmar(sparklineCirculosResumen.length === 12, 'El sparkline del héroe de Resumen debe tener exactamente 12 puntos');

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
var cardMusculo = cardPorTitulo('Masa muscular (kg)');
var cardGrasa = cardPorTitulo('Grasa corporal (%)');
var cardCintura = cardPorTitulo('Circunferencia de cintura');
var cardLabs = cardPorTitulo('Laboratorios en 3 cortes');
var cardPlic = cardPorTitulo('Plicometría en 4 cortes');
afirmar(!!cardPeso && !!cardMusculo && !!cardGrasa && !!cardCintura && !!cardLabs && !!cardPlic,
  'Vista Seguimiento debe traer las 6 tarjetas de gráficas esperadas (Composición corporal partida en Masa muscular y Grasa corporal, Adendum R6 punto 7)');
afirmar(!cardPorTitulo('Composición corporal'),
  'data-2 (Adendum R6 punto 7): ya no debe existir una card única "Composición corporal" con dos series en un eje compartido');

// ---------------------------------------------------------------------
// 5bis. R4 (esta tarea): el héroe de Seguimiento se recalcula contra el
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

// data-2 (Adendum R6 punto 7): Composición corporal partida en DOS gráficas
// de una serie y un eje cada una -- kg y % nunca en el mismo eje. Con una
// sola serie, Herzon.Charts.linea no dibuja caja de leyenda (regla 7).
var polyMusculo0 = polylinesDe(cardMusculo);
afirmar(polyMusculo0.length === 1, 'La gráfica de masa muscular debe tener una sola serie (línea), un eje propio en kg');
afirmar(polyMusculo0[0].style.stroke === 'var(--series-3)', 'Masa muscular debe pintarse con series-3 (asignación fija)');
afirmar(puntosDe(polyMusculo0[0]).length === 12, 'Con el rango inicial (12 semanas) la línea de masa muscular debe tener 12 puntos');
afirmar(contarPorClase(cardMusculo, 'hz-legend') === 0, 'data-2: con una sola serie, la gráfica de masa muscular NO debe traer caja de leyenda');

var polyGrasa0 = polylinesDe(cardGrasa);
afirmar(polyGrasa0.length === 1, 'La gráfica de grasa corporal debe tener una sola serie (línea), un eje propio en %');
afirmar(polyGrasa0[0].style.stroke === 'var(--series-2)', 'Grasa corporal debe pintarse con series-2 (asignación fija)');
afirmar(puntosDe(polyGrasa0[0]).length === 12, 'Con el rango inicial (12 semanas) la línea de grasa corporal debe tener 12 puntos');
afirmar(contarPorClase(cardGrasa, 'hz-legend') === 0, 'data-2: con una sola serie, la gráfica de grasa corporal NO debe traer caja de leyenda');

var textosMusculo = textosDe(cardMusculo);
afirmar(textosMusculo.indexOf('15') !== -1 && textosMusculo.indexOf('40') !== -1,
  'El eje Y de masa muscular debe estar forzado a un rango completo propio (yMin=15 / yMax=40), no autoescalado sobre datos casi planos (regla de Mario)');
var textosGrasa = textosDe(cardGrasa);
afirmar(textosGrasa.indexOf('15') !== -1 && textosGrasa.indexOf('45') !== -1,
  'El eje Y de grasa corporal debe estar forzado a un rango completo propio (yMin=15 / yMax=45), independiente del eje de masa muscular');

// data-4/data-8 (consumo): unidad de HERZON_DATA.meta.unidades en la
// etiqueta de punta de las líneas de seguimiento.
afirmar(textosDe(cardPeso).join(' ').indexOf(DATA.meta.unidades.peso) !== -1,
  'data-4: la línea de peso debe traer la unidad de HERZON_DATA.meta.unidades.peso en su etiqueta de punta');
afirmar(textosMusculo.join(' ').indexOf(DATA.meta.unidades.peso) !== -1,
  'data-4: la línea de masa muscular debe traer la unidad de HERZON_DATA.meta.unidades.peso en su etiqueta de punta');
afirmar(textosDe(cardCintura).join(' ').indexOf(DATA.meta.unidades.cintura) !== -1,
  'data-4: la línea de cintura debe traer la unidad de HERZON_DATA.meta.unidades.cintura en su etiqueta de punta');

var polyCintura0 = polylinesDe(cardCintura);
afirmar(polyCintura0.length === 1, 'La gráfica de cintura debe tener una sola serie (línea)');
afirmar(puntosDe(polyCintura0[0]).length === 12, 'Con el rango inicial (12 semanas) la línea de cintura debe tener 12 puntos');

var chartsLabs = recolectarNodos(cardLabs).filter(function (n) { return clasesDe(n).indexOf('hz-chart') !== -1; });
afirmar(chartsLabs.length === DATA.labs.marcadores.length, 'Debe haber una gráfica de laboratorio por cada marcador, en los 3 cortes');
var togglesLabs = contarPorClase(cardLabs, 'hz-table-toggle');
afirmar(togglesLabs === DATA.labs.marcadores.length, 'Cada gráfica de laboratorio debe traer su toggle Ver tabla');

// data-8 (consumo, Adendum R6 punto 2): referencia clínica {min,max} para
// los marcadores que la traen en HERZON_DATA (hoy los 7): Herzon.Charts.barras
// dibuja una hairline con la clase hz-referencia-linea cuando recibe
// opciones.referencia con min y max numéricos.
var marcadoresConReferencia = DATA.labs.marcadores.filter(function (m) {
  return m.referencia && typeof m.referencia.min === 'number' && typeof m.referencia.max === 'number';
});
afirmar(marcadoresConReferencia.length === DATA.labs.marcadores.length,
  'este selfcheck asume que HERZON_DATA.labs.marcadores trae referencia {min,max} en los 7 marcadores (si esto cambia, ajustar el conteo de abajo)');
afirmar(contarPorClase(cardLabs, 'hz-referencia-linea') === marcadoresConReferencia.length * 2,
  'data-8: cada gráfica de laboratorio con referencia clínica en los datos debe dibujar las hairlines de referencia (min y max, Adendum R6 punto 2)');

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
afirmar(listenersEventoImportacion.length === 1,
  'prod-1: al montar rootSeg (esta sección), Vista Seguimiento debe registrar EXACTAMENTE un listener de herzon:mediciones-importadas');

listenersRango[0](4);
afirmar(puntosDe(polylinesDe(cardPeso)[0]).length === 4, 'Al filtrar a 4 semanas, la línea de peso debe tener 4 puntos');
afirmar(puntosDe(polylinesDe(cardMusculo)[0]).length === 4, 'Al filtrar a 4 semanas, la línea de masa muscular debe tener 4 puntos');
afirmar(puntosDe(polylinesDe(cardGrasa)[0]).length === 4, 'Al filtrar a 4 semanas, la línea de grasa corporal debe tener 4 puntos');
afirmar(puntosDe(polylinesDe(cardCintura)[0]).length === 4, 'Al filtrar a 4 semanas, la línea de cintura debe tener 4 puntos');
afirmarHeroPara(4);
afirmar(polylinesDe(cardPlic).every(function (p) { return puntosDe(p).length === DATA.plicometria.cortes.length; }),
  'Al filtrar a 4 semanas, la plicometría NO debe recortarse: sigue con sus 4 cortes fijos (consistente con Laboratorios)');

listenersRango[0](8);
afirmar(puntosDe(polylinesDe(cardPeso)[0]).length === 8, 'Al filtrar a 8 semanas, la línea de peso debe tener 8 puntos');
afirmar(puntosDe(polylinesDe(cardMusculo)[0]).length === 8, 'Al filtrar a 8 semanas, la línea de masa muscular debe tener 8 puntos');
afirmar(puntosDe(polylinesDe(cardGrasa)[0]).length === 8, 'Al filtrar a 8 semanas, la línea de grasa corporal debe tener 8 puntos');
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
// 9. jera-2/data-1/fini-2 (Adendum R6, CAUSA RAÍZ): los contenedores que
// reciben Herzon.Charts.barras (los 7 laboratorios) y Herzon.Charts.sparkline
// (el sparkline del héroe de Resumen) deben estar YA conectados al árbol de
// la vista en el instante EXACTO en que se invoca esa función -- en un
// navegador real, si el contenedor está desconectado en ese momento,
// `contenedorEl.clientWidth` es 0 y el chart cae al ancho de respaldo
// comprimido (bug reproducido en las capturas de Justesse). TestDOM no
// implementa clientWidth (comentario de build/charts.js), así que la
// verificación aquí es estructural: se envuelve temporalmente
// Herzon.Charts.barras/.sparkline para capturar, en cada llamada, si el
// contenedorEl ya es descendiente del rootEl de la vista que lo montó.
// ---------------------------------------------------------------------
function esDescendienteDe(nodo, raiz) {
  var actual = nodo;
  while (actual) {
    if (actual === raiz) { return true; }
    actual = actual.parentNode;
  }
  return false;
}

var rootSegCausaRaiz = contenedorNuevo();
var rootResumenCausaRaiz = contenedorNuevo();
var conexionesBarrasAlMomentoDeLlamar = [];
var conexionesSparklineAlMomentoDeLlamar = [];

// T-033 (causa raíz REAL, corrige el bug que la sección 9 original -- solo
// "descendiente de rootEl" -- no detectaba): en cada llamada a
// Charts.barras se captura además cuántos hijos tiene YA el gridLabs
// (contenedorEl.parentNode) en ese instante. Si el fix de dos fases es
// correcto, gridLabs ya tiene sus 7 wraps adjuntos ANTES de la primera
// llamada a Charts.barras, así que el conteo debe ser 7 en las 7 llamadas
// (nunca 1, 2, 3... creciendo, que era la firma del bug de append+render
// por ítem: Glucosa medía el grid con un solo hijo).
var hijosGridLabsAlMomentoDeLlamar = [];

var barrasOriginal = Herzon.Charts.barras;
var sparklineOriginal = Herzon.Charts.sparkline;
Herzon.Charts.barras = function (contenedorEl, opciones) {
  conexionesBarrasAlMomentoDeLlamar.push(esDescendienteDe(contenedorEl, rootSegCausaRaiz));
  var gridPadre = contenedorEl && contenedorEl.parentNode;
  hijosGridLabsAlMomentoDeLlamar.push(gridPadre ? gridPadre.children.length : -1);
  return barrasOriginal.apply(this, arguments);
};
Herzon.Charts.sparkline = function (contenedorEl, opciones) {
  conexionesSparklineAlMomentoDeLlamar.push(esDescendienteDe(contenedorEl, rootResumenCausaRaiz));
  return sparklineOriginal.apply(this, arguments);
};

Herzon.Views.seguimiento(rootSegCausaRaiz);
Herzon.Views.resumen(rootResumenCausaRaiz);

Herzon.Charts.barras = barrasOriginal;
Herzon.Charts.sparkline = sparklineOriginal;

afirmar(conexionesBarrasAlMomentoDeLlamar.length === DATA.labs.marcadores.length,
  'Herzon.Charts.barras debe invocarse exactamente una vez por marcador de laboratorio');
afirmar(conexionesBarrasAlMomentoDeLlamar.every(function (c) { return c === true; }),
  'jera-2/data-1/fini-2 (causa raíz): los 7 contenedores de laboratorio deben estar YA montados en el DOM de la vista ANTES de invocar Herzon.Charts.barras (patrón de la card de plicometría)');
afirmar(conexionesSparklineAlMomentoDeLlamar.length === 1 && conexionesSparklineAlMomentoDeLlamar[0] === true,
  'jera-8/fini-6 (causa raíz): el contenedor del sparkline del héroe de Resumen debe estar YA montado en el DOM de la vista ANTES de invocar Herzon.Charts.sparkline');

// ---------------------------------------------------------------------
// 9bis. T-033 (montaje en DOS FASES del grid de laboratorios): la sección 9
// de arriba solo probaba "conectado al DOM", que NO detectaba el bug real
// (el wrapMarcador SÍ estaba adjunto a gridLabs antes de cada llamada
// individual -- el problema era que sus 6 HERMANOS todavía no lo estaban).
// Aquí se prueba directamente que gridLabs ya tiene TODOS sus hijos (7,
// uno por marcador) en el instante de CADA una de las 7 llamadas a
// Charts.barras: eso es lo que garantiza que el grid ya esté en su
// geometría final de columnas -- y no en la fila completa de un hijo
// único -- cuando se mide su ancho para dibujar el viewBox.
// ---------------------------------------------------------------------
afirmar(hijosGridLabsAlMomentoDeLlamar.length === DATA.labs.marcadores.length,
  'T-033: debe haberse capturado un conteo de hijos de gridLabs por cada llamada a Charts.barras (una por marcador)');
afirmar(hijosGridLabsAlMomentoDeLlamar.every(function (c) { return c === DATA.labs.marcadores.length; }),
  'T-033 (causa raíz real, fase 1 antes que fase 2): gridLabs debe tener sus ' + DATA.labs.marcadores.length +
  ' wraps YA adjuntos en el instante de CADA llamada a Charts.barras -- obtuvo la secuencia [' +
  hijosGridLabsAlMomentoDeLlamar.join(',') + '] (si crece 1,2,3... es la firma del bug de append+render por ítem)');

// Verificación estructural adicional (parseo de orden en el código fuente,
// según pide el criterio de aceptación): en el texto de vista_metricas.js,
// la ÚLTIMA vez que se adjunta un wrap a gridLabs (fase 1) debe ocurrir
// ANTES de la PRIMERA llamada a Charts.barras (fase 2) -- es decir, ninguna
// llamada Charts.barras puede aparecer entre dos "gridLabs.appendChild".
var idxUltimoAppendGridLabs = fuenteVistas.lastIndexOf('gridLabs.appendChild(');
var idxPrimeraLlamadaBarras = fuenteVistas.indexOf('Charts.barras(');
afirmar(idxUltimoAppendGridLabs !== -1 && idxPrimeraLlamadaBarras !== -1,
  'T-033: el fuente debe contener tanto "gridLabs.appendChild(" como "Charts.barras(" para poder verificar su orden');
afirmar(idxUltimoAppendGridLabs < idxPrimeraLlamadaBarras,
  'T-033 (estructural, dos fases en el código): la ÚLTIMA llamada a gridLabs.appendChild( debe aparecer en el fuente ANTES que la PRIMERA llamada a Charts.barras( -- fase 1 (adjuntar todo) completa antes de que arranque fase 2 (renderizar)');

// ---------------------------------------------------------------------
// 10. jera-7 (Adendum R6): jerarquía interna en cada fila de laboratorios
// de Perfil -- nombre en peso regular / --text-secondary, valor en 600 /
// --text-primary / tabular-nums, punto de estatus intacto, y 6-8px de
// separación entre filas.
// ---------------------------------------------------------------------
var dotsPerfilNodos = recolectarNodos(rootPerfil).filter(function (n) { return clasesDe(n).indexOf('hz-status-dot') !== -1; });
afirmar(dotsPerfilNodos.length === DATA.labs.marcadores.length, 'debe haber un punto de estatus por marcador en Perfil (regresión)');
dotsPerfilNodos.forEach(function (dot, idxFila) {
  var fila = dot.parentNode;
  afirmar(fila.children.length === 3, 'jera-7: cada fila de laboratorio de Perfil debe tener 3 hijos (punto + nombre + valor), obtuvo ' + fila.children.length);
  var nombreSpan = fila.children[1];
  var valorSpan = fila.children[2];
  afirmar(clasesDe(nombreSpan).indexOf('hz-status-label') === -1,
    'jera-7: el span del nombre del marcador no debe llevar la clase de valor (jerarquía distinta dentro de la fila)');
  afirmar(nombreSpan.style.color === 'var(--text-secondary)',
    'jera-7: el nombre del marcador debe usar el token --text-secondary (peso regular, dato de apoyo)');
  afirmar(clasesDe(valorSpan).indexOf('hz-status-label') !== -1,
    'jera-7: el span del valor debe conservar la clase congelada hz-status-label (600, --text-primary)');
  afirmar(valorSpan.style.fontVariantNumeric === 'tabular-nums',
    'jera-7: el valor del marcador debe usar font-variant-numeric: tabular-nums');
  if (idxFila > 0) {
    var separacion = parseFloat(fila.style.marginTop || '0');
    afirmar(separacion >= 6 && separacion <= 8,
      'jera-7: la separación vertical entre filas de laboratorio debe ser de 6 a 8px, obtuvo "' + fila.style.marginTop + '"');
  }
});

// ---------------------------------------------------------------------
// 11. prod-1 (Adendum R6 punto 4): redibujar() debe releer
// G.HERZON_DATA.series en CADA llamada (no un arreglo capturado una sola
// vez al montar), y la vista debe escuchar 'herzon:mediciones-importadas'
// para re-renderizar el rango activo. build/documentos.js hace merge de
// mediciones REASIGNANDO `HERZON_DATA.series.<clave> = arregloNuevo`
// (nunca in-place, ver mergeMediciones) -- se reproduce ese mismo patrón
// aquí para probar que la vista YA MONTADA (rootSeg de la sección 5) capta
// el cambio sin volver a montarse.
// ---------------------------------------------------------------------
// La sección 9 (causa raíz) montó una SEGUNDA instancia de la vista
// (rootSegCausaRaiz) para instrumentar Herzon.Charts, así que
// listenersEventoImportacion ya trae 2 entradas en este punto -- la [0] es
// la de rootSeg (verificada arriba, en la sección 6, justo tras su único
// montaje) y es la que corresponde a `cardPeso`/`cardMusculo`/etc. de más
// arriba; se dispara esa.
afirmar(listenersEventoImportacion.length === 2,
  'prod-1: tras el montaje adicional de la sección de causa raíz debe haber 2 listeners acumulados (uno por cada montaje de Vista Seguimiento)');

var pesoAntesDeImportar = DATA.series.peso_kg.slice();
var semanasAntesDeImportar = DATA.series.semanas.slice();
var totalSemanasAntes = semanasAntesDeImportar.length;

// Reasigna los arreglos (no los muta in-place) -- mismo patrón que
// mergeMediciones en build/documentos.js -- agregando una semana 13 nueva
// con un peso de 69.5kg claramente distinto a cualquier valor existente.
DATA.series.semanas = semanasAntesDeImportar.concat([totalSemanasAntes + 1]);
DATA.series.peso_kg = pesoAntesDeImportar.concat([69.5]);
DATA.series.grasa_pct = DATA.series.grasa_pct.concat([DATA.series.grasa_pct[DATA.series.grasa_pct.length - 1]]);
DATA.series.musculo_kg = DATA.series.musculo_kg.concat([DATA.series.musculo_kg[DATA.series.musculo_kg.length - 1]]);
DATA.series.cintura_cm = DATA.series.cintura_cm.concat([DATA.series.cintura_cm[DATA.series.cintura_cm.length - 1]]);

afirmar(typeof listenersEventoImportacion[0] === 'function', 'prod-1: el listener capturado de herzon:mediciones-importadas debe ser una función invocable');
listenersEventoImportacion[0]({ type: 'herzon:mediciones-importadas', detail: { agregadas: 1, actualizadas: 0, errores: 0 } });

// Herzon.filters.getRange() de este selfcheck sigue fijo en 12 (el stub no
// rastrea el último rango notificado por los botones): con 13 semanas
// totales y un rango activo de 12, redibujar debe recortar a las últimas
// 12 -- si la serie siguiera siendo la vieja capturada al montar (12
// semanas), el conteo de puntos no cambiaría y el valor nuevo (69.5) jamás
// aparecería en el texto de la card.
afirmar(puntosDe(polylinesDe(cardPeso)[0]).length === 12,
  'prod-1: tras disparar herzon:mediciones-importadas con una semana nueva, la línea de peso debe seguir mostrando 12 puntos (recorte contra el rango activo=12 sobre 13 semanas totales), evidencia de que SÍ releyó la serie');
afirmar(textosDe(cardPeso).join(' ').indexOf('69.5') !== -1,
  'prod-1: la línea de peso debe mostrar el valor recién importado (69.5) sin volver a montar la vista');
afirmar(puntosDe(polylinesDe(cardMusculo)[0]).length === 12 && puntosDe(polylinesDe(cardGrasa)[0]).length === 12 && puntosDe(polylinesDe(cardCintura)[0]).length === 12,
  'prod-1: masa muscular, grasa corporal y cintura también deben re-renderizarse con la serie importada (redibujar relee TODA G.HERZON_DATA.series, no solo peso)');

// ---------------------------------------------------------------------
// 12. Anti-regresión D1 (QA ronda 1): ninguna de estas palabras en español
//    sin acento/eñe puede reaparecer en el CÓDIGO FUENTE de este módulo
//    (comentarios incluidos). Coincidencia con límite de palabra.
// ---------------------------------------------------------------------
var PALABRAS_SIN_ACENTO_PROHIBIDAS = [
  'anos', 'Composicion', 'Calorias', 'Regimen', 'Probiotico', 'clinica',
  'demostracion', 'sinteticos', 'ultimas', 'capsula', 'jerarquia', 'raiz',
  'heroe', 'mecanica'
];
for (var pa = 0; pa < PALABRAS_SIN_ACENTO_PROHIBIDAS.length; pa++) {
  var palabra = PALABRAS_SIN_ACENTO_PROHIBIDAS[pa];
  var regexPalabra = new RegExp('\\b' + palabra + '\\b');
  afirmar(!regexPalabra.test(fuenteVistas), 'build/vista_metricas.js contiene la palabra sin acento "' + palabra + '" (D1, QA ronda 1): revisar y corregir a español con acentos/eñe');
}

console.log('checks ejecutados: ' + contador);
process.exit(0);
