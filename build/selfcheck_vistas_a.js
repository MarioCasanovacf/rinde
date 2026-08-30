// build/selfcheck_vistas_a.js
// Selfcheck de node puro (sin dependencias externas) para
// build/vista_dieta_supl.js. Formato de salida congelado en plan.md 3.J:
// última línea de stdout literal "checks ejecutados: N"; exit 0 solo si
// todas las aserciones pasan; en fallo, exit 1 e imprime la aserción fallida.
'use strict';

var fs = require('fs');
var path = require('path');

var contador = 0;

function afirmar(condicion, mensaje) {
  contador += 1;
  if (!condicion) {
    console.error('ASERCIÓN FALLIDA (#' + contador + '): ' + mensaje);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------
// 0. Carga del modulo: DOM headless antes de require (plan.md 3.A), y stub
//    de Herzon.registerView que captura los registros (task T-004, criterio
//    "instala un stub de Herzon.registerView que captura los registros").
// ---------------------------------------------------------------------
globalThis.window = globalThis;

var TESTDOM_PATH = path.join(__dirname, 'testdom.js');
var DATA_PATH = path.join(__dirname, 'data.js');
var CHARTS_PATH = path.join(__dirname, 'charts.js');
var MOTOR_PATH = path.join(__dirname, 'motor_recomendacion.js');
var VISTA_PATH = path.join(__dirname, 'vista_dieta_supl.js');

require(TESTDOM_PATH);
require(DATA_PATH);
require(CHARTS_PATH);
// Adendum R5 (T-022): vista_dieta_supl.js consume Herzon.Motor (T-020) al
// montar #reco-plan. build/motor_recomendacion.js NO toca document ni
// registerView (namespace propio Herzon.Motor, plan.md 3.B), así que
// requerirlo aquí no interfiere con el stub de registerView de abajo.
require(MOTOR_PATH);

var registrosCapturados = {};
Herzon.registerView = function (id, mountFn) {
  registrosCapturados[id] = mountFn;
};

require(VISTA_PATH);

var fuenteVista = fs.readFileSync(VISTA_PATH, 'utf8');
var HERZON_DATA = window.HERZON_DATA;
var Charts = Herzon.Charts;
var TestDOM = Herzon.TestDOM;
var doc = TestDOM.crearDocumento();

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

function buscarPorId(raiz, id) {
  var nodos = recolectarNodos(raiz);
  for (var i = 0; i < nodos.length; i++) {
    if (nodos[i].getAttribute && nodos[i].getAttribute('id') === id) return nodos[i];
  }
  return null;
}

function buscarPorAtributo(raiz, atributo, valor) {
  // consultarTodo/consultarUno (build/testdom.js) SOLO soportan selector por
  // tag o por clase (.foo); no hay selector de atributo. Este helper busca
  // por [atributo="valor"] recorriendo manualmente, igual que buscarPorId.
  var nodos = recolectarNodos(raiz);
  for (var i = 0; i < nodos.length; i++) {
    if (nodos[i].getAttribute && nodos[i].getAttribute(atributo) === valor) return nodos[i];
  }
  return null;
}

function contarPorTagSinAtributo(raiz, tag, atributo) {
  var nodos = raiz.consultarTodo(tag);
  var resultado = [];
  for (var i = 0; i < nodos.length; i++) {
    if (!nodos[i].hasAttribute(atributo)) resultado.push(nodos[i]);
  }
  return resultado;
}

function contarFillsPorValor(nodos) {
  var conteo = {};
  for (var i = 0; i < nodos.length; i++) {
    var color = nodos[i].style && nodos[i].style.fill;
    if (color) conteo[color] = (conteo[color] || 0) + 1;
  }
  return conteo;
}

// ---------------------------------------------------------------------
// 1. Higiene de fuente (build/vista_dieta_supl.js)
// ---------------------------------------------------------------------
afirmar(!/#[0-9a-fA-F]{3,8}\b/.test(fuenteVista),
  'build/vista_dieta_supl.js no debe contener hexes de color literales');

afirmar(fuenteVista.indexOf('innerHTML') === -1,
  'build/vista_dieta_supl.js no debe usar innerHTML en ninguna parte');

afirmar(fuenteVista.indexOf('<style') === -1,
  'build/vista_dieta_supl.js no debe declarar bloques <style> propios');

afirmar(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(fuenteVista),
  'build/vista_dieta_supl.js no debe contener emojis');

var clasesEnFuente = fuenteVista.match(/classList\.add\('([^']+)'\)/g) || [];
clasesEnFuente.forEach(function (linea) {
  var m = /classList\.add\('([^']+)'\)/.exec(linea);
  afirmar(m[1].indexOf('hz-') === 0, 'toda clase agregada por classList.add debe llevar prefijo hz- (' + m[1] + ')');
});
afirmar(clasesEnFuente.length > 0, 'debe haber al menos una clase hz- agregada via classList.add (sanity del propio test)');

// ---------------------------------------------------------------------
// 2. Namespaces disjuntos (plan.md 3.B): SOLO plan y suplementos
// ---------------------------------------------------------------------
afirmar(typeof Herzon.Views === 'object' && Herzon.Views !== null,
  'Herzon.Views debe existir como objeto (abierto con G.Herzon.Views = G.Herzon.Views || {})');

afirmar(typeof Herzon.Views.plan === 'function', 'Herzon.Views.plan debe ser una funcion');
afirmar(typeof Herzon.Views.suplementos === 'function', 'Herzon.Views.suplementos debe ser una funcion');

afirmar(Herzon.Views.resumen === undefined, 'Herzon.Views.resumen NO debe existir (namespace de T-005)');
afirmar(Herzon.Views.perfil === undefined, 'Herzon.Views.perfil NO debe existir (namespace de T-005)');
afirmar(Herzon.Views.seguimiento === undefined, 'Herzon.Views.seguimiento NO debe existir (namespace de T-005)');

var idsRegistrados = Object.keys(registrosCapturados).sort();
afirmar(idsRegistrados.length === 2 && idsRegistrados[0] === 'plan' && idsRegistrados[1] === 'suplementos',
  'Herzon.registerView debe haberse llamado EXACTAMENTE con los ids plan y suplementos (capturado: ' + idsRegistrados.join(',') + ')');

// ---------------------------------------------------------------------
// 2.5 Herzon.planActivo() (Adendum R5 punto 4): existe y responde ANTES de
//     que la vista "Plan de dieta" se haya montado ni una sola vez -- el
//     estado del recomendador se calcula de forma perezosa (obtenerRecoEstado
//     en build/vista_dieta_supl.js), no depende del DOM.
// ---------------------------------------------------------------------
afirmar(typeof Herzon.planActivo === 'function', 'Herzon.planActivo debe existir como funcion (Adendum R5 punto 4)');

var activoPreMontaje = Herzon.planActivo();
afirmar(!!activoPreMontaje && !!activoPreMontaje.plan && typeof activoPreMontaje.plan.id === 'string',
  'Herzon.planActivo() debe devolver { plan, ... } con una plantilla real incluso antes de montar la vista');
afirmar(HERZON_DATA.planes.some(function (p) { return p.id === activoPreMontaje.plan.id; }),
  'Herzon.planActivo() pre-montaje debe apuntar a una plantilla real de HERZON_DATA.planes');
afirmar(activoPreMontaje.escalaPorciones === 1, 'Herzon.planActivo() pre-montaje debe iniciar con escalaPorciones = 1 (sin ajustar)');
afirmar(
  activoPreMontaje.kcalObjetivo === Math.round(activoPreMontaje.plan.kcalObjetivo),
  'Herzon.planActivo() pre-montaje debe mostrar el kcalObjetivo de la plantilla (sin override manual ni escala)'
);
// Ancla de verificación del Adendum R5: perfil basal de Daniela (75 kg,
// 162 cm, 34 años, mujer, factor ligero 1.375) -> TMB 1432, GET 1969. El
// perfil precargado por defecto (pesoInicial_kg) debe reproducirlos EXACTO.
var MotorParaAncla = Herzon.Motor;
var tmbAncla = MotorParaAncla.tmb({ sexo: 'femenino', pesoKg: 75, tallaCm: 162, edad: 34 });
var getAncla = MotorParaAncla.get(tmbAncla, HERZON_DATA.factoresActividad.ligero);
afirmar(tmbAncla === 1432, 'ancla Adendum R5: TMB de Daniela (75kg/162cm/34a/mujer/ligero) debe ser 1432, fue ' + tmbAncla);
afirmar(getAncla === 1969, 'ancla Adendum R5: GET de Daniela (factor ligero) debe ser 1969, fue ' + getAncla);
afirmar(HERZON_DATA.paciente.pesoInicial_kg === 75 && HERZON_DATA.paciente.talla_cm === 162 && HERZON_DATA.paciente.edad === 34 && HERZON_DATA.paciente.sexo === 'femenino',
  'el perfil de HERZON_DATA.paciente debe seguir siendo el basal del ancla (75kg/162cm/34a/femenino) para que la precarga del formulario la reproduzca');

// ---------------------------------------------------------------------
// 3. Vista "Plan de dieta": monta contra TestDOM, sin lanzar
// ---------------------------------------------------------------------
var rootPlan = doc.createElement('div');
// Refleja EXACTAMENTE la marca estatica de build/shell.html (T-021): un
// <div id="reco-plan" class="hz-card hz-reco-panel"> ya presente como
// hermano de .hz-grid antes de que esta vista monte nada (plan.md Adendum
// R5 punto 5). vista_dieta_supl.js debe REUTILIZAR este nodo, no duplicar
// el id.
var recoPlanEstatico = doc.createElement('div');
recoPlanEstatico.setAttribute('id', 'reco-plan');
recoPlanEstatico.classList.add('hz-card');
recoPlanEstatico.classList.add('hz-reco-panel');
rootPlan.appendChild(recoPlanEstatico);

afirmar((function () {
  try { registrosCapturados.plan(rootPlan); return true; }
  catch (e) { console.error(e); return false; }
})(), 'Herzon.Views.plan (via registerView) debe montar sin lanzar contra el TestDOM');

afirmar(rootPlan.consultarTodo('.hz-reco-panel').length === 1,
  'la vista Plan de dieta NO debe duplicar #reco-plan: debe reutilizar el nodo estatico de build/shell.html');
afirmar(rootPlan.children.indexOf(recoPlanEstatico) !== -1,
  'el #reco-plan estatico original debe seguir siendo el mismo nodo (reutilizado, no reemplazado)');

afirmar(rootPlan.consultarTodo('.hz-hero').length === 1,
  'la vista Plan de dieta debe tener EXACTAMENTE un .hz-hero (regla 11)');

var chartsPlan = rootPlan.consultarTodo('.hz-chart');
var togglesPlan = rootPlan.consultarTodo('.hz-table-toggle');
afirmar(chartsPlan.length === togglesPlan.length,
  'en la vista Plan de dieta el número de .hz-chart debe igualar el número de .hz-table-toggle (paridad, regla 9)');
afirmar(chartsPlan.length === 2,
  'la vista Plan de dieta debe tener exactamente 2 gráficas: macros por comida y calorías por día');

var selectObjetivo = buscarPorId(rootPlan, 'hz-plan-objetivo');
var selectRestriccion = buscarPorId(rootPlan, 'hz-plan-restriccion');
var selectDia = buscarPorId(rootPlan, 'hz-plan-dia');
afirmar(!!selectObjetivo && selectObjetivo.tagName === 'SELECT', 'debe existir #hz-plan-objetivo como <select> dentro de .hz-form');
afirmar(!!selectRestriccion && selectRestriccion.tagName === 'SELECT', 'debe existir #hz-plan-restriccion como <select> dentro de .hz-form');
afirmar(!!selectDia && selectDia.tagName === 'SELECT', 'debe existir #hz-plan-dia como <select> para el detalle del día');

var formPlan = rootPlan.consultarTodo('.hz-form');
afirmar(formPlan.length === 1, 'la vista Plan de dieta debe tener exactamente un .hz-form');

// --- Alternancia de variante (criterio: "el selfcheck cambia el valor del
// campo y verifica que el id del plan renderizado cambia") ---
var planIdInicial = rootPlan.getAttribute('data-plan-id');
afirmar(!!planIdInicial, 'la vista Plan de dieta debe exponer data-plan-id en su raiz tras el primer render');
afirmar(HERZON_DATA.planes.some(function (p) { return p.id === planIdInicial; }),
  'data-plan-id inicial debe corresponder a un id real de HERZON_DATA.planes (' + planIdInicial + ')');

var restriccionAlterna = HERZON_DATA.planes
  .map(function (p) { return (p.indicadoPara.restriccion || [])[0]; })
  .filter(function (v, i, arr) { return v && arr.indexOf(v) === i && v !== selectRestriccion.value; })[0];
afirmar(!!restriccionAlterna, 'debe existir un valor de restriccion distinto al inicial para probar la alternancia (dato de HERZON_DATA.planes)');

selectRestriccion.value = restriccionAlterna;
selectRestriccion.despachar('change');
var planIdTrasCambio = rootPlan.getAttribute('data-plan-id');
afirmar(planIdTrasCambio !== planIdInicial,
  'cambiar el campo restriccion/alergia del formulario debe alternar el id del plan renderizado (' + planIdInicial + ' -> ' + planIdTrasCambio + ')');
afirmar(HERZON_DATA.planes.some(function (p) { return p.id === planIdTrasCambio; }),
  'el nuevo data-plan-id tras el cambio debe seguir siendo un id real de HERZON_DATA.planes');

// --- Macros por comida: asignación FIJA Proteínas=series-1, Carbohidratos=series-2, Grasas=series-3 ---
var planActual = HERZON_DATA.planes.filter(function (p) { return p.id === planIdTrasCambio; })[0];
var diaActual = planActual.dias[0];
var nComidas = diaActual.comidas.length;

var contMacros = chartsPlan[0]; // primer .hz-chart montado es el de macros
var barrasVisualesMacros = contarPorTagSinAtributo(contMacros, 'rect', 'role');
var conteoFillsMacros = contarFillsPorValor(barrasVisualesMacros);
afirmar(barrasVisualesMacros.length === nComidas * 3,
  'la gráfica de macros por comida debe tener 3 segmentos por comida (proteína, carbohidrato, grasa)');
afirmar(conteoFillsMacros['var(--series-1)'] === nComidas,
  'Proteínas debe pintarse con var(--series-1) en cada una de las ' + nComidas + ' comidas (asignación fija del contrato)');
afirmar(conteoFillsMacros['var(--series-2)'] === nComidas,
  'Carbohidratos debe pintarse con var(--series-2) en cada una de las ' + nComidas + ' comidas (asignación fija del contrato)');
afirmar(conteoFillsMacros['var(--series-3)'] === nComidas,
  'Grasas debe pintarse con var(--series-3) en cada una de las ' + nComidas + ' comidas (asignación fija del contrato)');

// --- Calorías por día: una barra por cada uno de los 7 días del plan ---
var contKcal = chartsPlan[1];
var barrasVisualesKcal = contarPorTagSinAtributo(contKcal, 'path', 'role');
afirmar(barrasVisualesKcal.length === planActual.dias.length,
  'la gráfica de calorías por día debe tener una barra por cada uno de los ' + planActual.dias.length + ' días del plan');

// --- R4 corrección (rechazo del verifier, intento 2): dos cambios
//     estructurales para eliminar el hueco muerto que el verifier midió con
//     getBoundingClientRect en Chrome headless a 1240px.
//     (a) El grid superior debe tener EXACTAMENTE 3 cards de ancho normal
//         (hero, formulario, "Gráficas del plan": macros+calorías
//         agrupadas en una sola card con grid anidado, mismo patrón que
//         "Laboratorios en 3 cortes" de vista_metricas.js) -- NO 4 cards
//         sueltas: con 4, a 1240px el grid (auto-fit/minmax(300px,1fr))
//         resuelve 3 columnas y la 4a card queda sola dejando 2 columnas de
//         hueco muerto.
//     (b) La card del menú del día (hz-menu-fila) ya NO es un ítem de ese
//         grid: vive como hermana de .hz-grid dentro de .hz-vista (flex
//         column, gap:20px, congelado 3.G). Dentro de un grid, una card con
//         grid-column:1/-1 "usa" todas las columnas en su propia fila, así
//         que auto-fit nunca las colapsa en las demás filas -- eso repetía
//         el hueco muerto en anchos de pantalla donde el grid resuelve MÁS
//         de 3 columnas (ej. 1366-1600px, donde min(300px,1fr) da 4
//         columnas). Sacando el menú del grid, auto-fit SÍ colapsa
//         cualquier columna sobrante en cualquier ancho >= 3 columnas. ---
var cardsPlan = rootPlan.consultarTodo('.hz-card');
afirmar(cardsPlan.length === 5,
  'la vista Plan de dieta debe tener 5 .hz-card en total: #reco-plan (recomendador, T-022), hero, formulario, "Gráficas del plan" (agrupa macros+calorías) y menú del día, tiene ' + cardsPlan.length);

// Adendum R5 (T-022): #reco-plan se suma como card de ancho completo, con
// el mismo patrón ya usado por hz-menu-fila (hermana de .hz-grid, ver
// build/shell.html comentario sobre #reco-plan).
var cardsAnchoNormal = cardsPlan.filter(function (c) {
  return c._clases.indexOf('hz-menu-fila') === -1 && c._clases.indexOf('hz-reco-panel') === -1;
});
var cardsAnchoCompleto = cardsPlan.filter(function (c) {
  return c._clases.indexOf('hz-menu-fila') !== -1 || c._clases.indexOf('hz-reco-panel') !== -1;
});
afirmar(cardsAnchoNormal.length === 3,
  'deben existir EXACTAMENTE 3 cards de ancho normal en el grid superior (hero, formulario, "Gráficas del plan"), para llenar sin hueco las 3 columnas del grid a 1240px sin dejar una card sola en su fila (corrección R4 tras rechazo del verifier por hueco muerto con 4 cards), tiene ' + cardsAnchoNormal.length);
afirmar(cardsAnchoCompleto.length === 2,
  'deben existir EXACTAMENTE 2 cards de ancho completo (hz-reco-panel y hz-menu-fila), tiene ' + cardsAnchoCompleto.length);

var cardGraficasPlan = cardsAnchoNormal[2];
afirmar(!!cardGraficasPlan && cardGraficasPlan.consultarUno('.hz-card-title').textContent === 'Gráficas del plan',
  'la tercera card de ancho normal debe ser "Gráficas del plan" (agrupa macros por comida y calorías por día en un grid anidado)');
var gridsAnidadosGraficas = cardGraficasPlan ? cardGraficasPlan.consultarTodo('.hz-grid') : [];
afirmar(gridsAnidadosGraficas.length === 1,
  'la card "Gráficas del plan" debe contener EXACTAMENTE un grid anidado (.hz-grid) que agrupa sus 2 gráficas, en vez de 2 cards sueltas en el grid superior');
afirmar(!!gridsAnidadosGraficas[0] && gridsAnidadosGraficas[0].consultarTodo('.hz-chart').length === 2,
  'el grid anidado de "Gráficas del plan" debe contener las 2 gráficas (macros por comida y calorías por día)');

// (b): la card del menú del día NO debe ser descendiente de ningún .hz-grid.
function esDescendienteDeAlgunGrid(nodo, grids) {
  var actual = nodo.parentNode;
  while (actual) {
    if (grids.indexOf(actual) !== -1) return true;
    actual = actual.parentNode;
  }
  return false;
}
var todosLosGridsDeLaVista = rootPlan.consultarTodo('.hz-grid');
var cardMenuDelDia = cardsAnchoCompleto.filter(function (c) { return c._clases.indexOf('hz-menu-fila') !== -1; })[0];
afirmar(!!cardMenuDelDia && !esDescendienteDeAlgunGrid(cardMenuDelDia, todosLosGridsDeLaVista),
  'la card del menú del día (hz-menu-fila) debe vivir FUERA de todo .hz-grid -- hermana de .hz-grid dentro de .hz-vista, no un ítem más del grid superior (corrección R4: evita que grid-column:1/-1 deje columnas usadas-en-otra-fila sin colapsar en anchos con más de 3 columnas)');

// --- Menú del día (Adendum R4, T-017): el Detalle del día deja de ser
//     tabla apretada y pasa a fila de ancho completo (.hz-menu-fila) con
//     una .hz-menu-item por comida: hora, platillo COMPLETO (sin truncar,
//     no hereda el nowrap de .hz-table), kcal y mini barra apilada de
//     macros de esa comida; leyenda una sola vez y total del día visible. ---
var itemsMenuDia1 = rootPlan.consultarTodo('.hz-menu-item');
afirmar(itemsMenuDia1.length === diaActual.comidas.length,
  'el menú del día debe tener una fila .hz-menu-item por cada una de las ' + diaActual.comidas.length + ' comidas del día (día 1), tiene ' + itemsMenuDia1.length);

itemsMenuDia1.forEach(function (item, i) {
  var comidaEsperada = diaActual.comidas[i];
  var horaEl = item.consultarUno('.hz-menu-hora');
  var nombreEl = item.consultarUno('.hz-menu-platillo');
  var kcalEl = item.consultarUno('.hz-menu-kcal');

  afirmar(!!horaEl && horaEl.textContent === comidaEsperada.hora,
    'la fila ' + i + ' del menú debe mostrar la hora de la comida (' + comidaEsperada.hora + ')');

  afirmar(!!nombreEl && nombreEl.textContent === comidaEsperada.nombre,
    'el platillo de la fila ' + i + ' debe mostrarse COMPLETO, sin truncar (esperado "' + comidaEsperada.nombre + '", obtenido "' + (nombreEl && nombreEl.textContent) + '")');
  afirmar(!!nombreEl && nombreEl.textContent.indexOf('...') === -1 && nombreEl.textContent.indexOf('…') === -1,
    'el platillo de la fila ' + i + ' no debe llevar puntos suspensivos de recorte (sin truncar)');

  var digitosKcalFila = kcalEl ? kcalEl.textContent.replace(/[^\d]/g, '') : '';
  afirmar(!!kcalEl && digitosKcalFila === String(Math.round(comidaEsperada.kcal)),
    'la fila ' + i + ' del menú debe mostrar las kcal de la comida (' + comidaEsperada.kcal + '), obtenido "' + (kcalEl && kcalEl.textContent) + '"');

  var macrosEl = item.consultarUno('.hz-menu-macros');
  afirmar(!!macrosEl, 'la fila ' + i + ' del menú debe tener .hz-menu-macros (mini barra apilada de macros de esa comida)');
  var segmentos = macrosEl ? macrosEl.consultarTodo('.hz-menu-macro-seg') : [];
  afirmar(segmentos.length === 3,
    'la mini barra de macros de la fila ' + i + ' debe tener exactamente 3 segmentos (proteína, carbohidrato, grasa)');
  if (segmentos.length === 3) {
    afirmar(segmentos[0].style.backgroundColor === 'var(--series-1)', 'segmento de proteína de la fila ' + i + ' debe usar var(--series-1) (asignación fija del contrato)');
    afirmar(segmentos[1].style.backgroundColor === 'var(--series-2)', 'segmento de carbohidrato de la fila ' + i + ' debe usar var(--series-2) (asignación fija del contrato)');
    afirmar(segmentos[2].style.backgroundColor === 'var(--series-3)', 'segmento de grasa de la fila ' + i + ' debe usar var(--series-3) (asignación fija del contrato)');
  }
});

// La card del menú (padre de .hz-menu-lista, abuelo de cada .hz-menu-item)
var cardMenu = itemsMenuDia1.length ? itemsMenuDia1[0].parentNode.parentNode : null;
afirmar(!!cardMenu, 'se pudo ubicar la card contenedora del menú del día (item -> hz-menu-lista -> card)');
afirmar(!!cardMenu && cardMenu._clases.indexOf('hz-menu-fila') !== -1,
  'la card del menú del día debe llevar la clase hz-menu-fila (fila de ancho completo en el grid; el CSS grid-column:1/-1 se verifica en selfcheck_shell)');
afirmar(!!cardMenu && cardMenu.consultarTodo('.hz-table').length === 0,
  'la card del menú del día ya NO debe contener ninguna .hz-table (el menú legible reemplaza la tabla apretada que truncaba el platillo)');

var leyendasEnCardMenu = cardMenu ? cardMenu.consultarTodo('.hz-legend') : [];
afirmar(leyendasEnCardMenu.length === 1,
  'la card del menú del día debe tener EXACTAMENTE una leyenda (leyenda una sola vez, no repetida por cada fila)');

var totalesMenu = cardMenu ? cardMenu.consultarTodo('.hz-menu-total') : [];
afirmar(totalesMenu.length === 1, 'el menú del día debe mostrar exactamente un total del día (.hz-menu-total)');
if (totalesMenu.length === 1) {
  var totalKcalEl = totalesMenu[0].consultarUno('.hz-menu-total-kcal');
  var digitosTotalKcal = totalKcalEl ? totalKcalEl.textContent.replace(/[^\d]/g, '') : '';
  afirmar(!!totalKcalEl && digitosTotalKcal === String(Math.round(diaActual.totales.kcal)),
    'el total del día debe mostrar las kcal totales del día (' + diaActual.totales.kcal + '), obtenido "' + (totalKcalEl && totalKcalEl.textContent) + '"');
}

// --- Cambiar el selector de día cambia el número de filas del menú (días
//     impares 5 comidas, pares 4 comidas, ver build/data.js construirPlan) ---
selectDia.value = '2';
selectDia.despachar('change');
var itemsMenuDia2 = rootPlan.consultarTodo('.hz-menu-item');
afirmar(itemsMenuDia2.length !== itemsMenuDia1.length,
  'cambiar el selector de día debe cambiar el número de filas .hz-menu-item del menú (día 1 vs día 2 tienen distinto número de comidas)');
afirmar(itemsMenuDia2.length === planActual.dias[1].comidas.length,
  'tras cambiar a día 2, el menú debe tener una fila por cada una de las ' + planActual.dias[1].comidas.length + ' comidas del día 2');

var listaMenuTrasCambio = rootPlan.consultarTodo('.hz-menu-lista')[0];
afirmar(listaMenuTrasCambio.consultarTodo('.hz-legend').length === 1,
  'tras cambiar de día, el menú sigue mostrando EXACTAMENTE una leyenda (no se acumula en cada re-render)');
afirmar(listaMenuTrasCambio.consultarTodo('.hz-menu-total').length === 1,
  'tras cambiar de día, el menú sigue mostrando EXACTAMENTE un total del día (no se acumula en cada re-render)');

// ---------------------------------------------------------------------
// 3.5 Recomendador de plan (Adendum R5, T-022): #reco-plan cubre el flujo
//     completo calcular -> recomendar (con razones) -> modificar (otra
//     plantilla, kcal manual, escala de porciones) -> Herzon.planActivo().
// ---------------------------------------------------------------------
function soloDigitos(texto) { return texto ? String(texto).replace(/[^\d]/g, '') : ''; }

var contenedorReco = buscarPorId(rootPlan, 'reco-plan');
afirmar(!!contenedorReco, 'debe existir #reco-plan dentro de la vista Plan de dieta');

var disclaimerReco = contenedorReco.consultarTodo('.hz-nota')[0];
afirmar(!!disclaimerReco && disclaimerReco.textContent.indexOf('Mifflin-St Jeor') !== -1,
  '#reco-plan debe mostrar un disclaimer que mencione la fórmula Mifflin-St Jeor');
afirmar(!!disclaimerReco && disclaimerReco.textContent.indexOf('no sustituye') !== -1,
  '#reco-plan debe dejar explícito que el cálculo no sustituye una valoración profesional');

// --- Formulario precargado con el perfil (sexo/edad/talla/peso/factor/objetivo) ---
var formReco = contenedorReco.consultarTodo('.hz-reco-form')[0];
afirmar(!!formReco, 'debe existir exactamente un .hz-reco-form dentro de #reco-plan');
afirmar(formReco.consultarTodo('.hz-form-campo').length === 6,
  'el formulario del recomendador debe tener 6 campos: sexo, edad, talla, peso, nivel de actividad y objetivo');

var campoRecoSexo = buscarPorId(rootPlan, 'hz-reco-sexo');
var campoRecoEdad = buscarPorId(rootPlan, 'hz-reco-edad');
var campoRecoTalla = buscarPorId(rootPlan, 'hz-reco-talla');
var campoRecoPeso = buscarPorId(rootPlan, 'hz-reco-peso');
var campoRecoFactor = buscarPorId(rootPlan, 'hz-reco-factor');
var campoRecoObjetivo = buscarPorId(rootPlan, 'hz-reco-objetivo');
[
  ['hz-reco-sexo', campoRecoSexo, 'SELECT'],
  ['hz-reco-edad', campoRecoEdad, 'INPUT'],
  ['hz-reco-talla', campoRecoTalla, 'INPUT'],
  ['hz-reco-peso', campoRecoPeso, 'INPUT'],
  ['hz-reco-factor', campoRecoFactor, 'SELECT'],
  ['hz-reco-objetivo', campoRecoObjetivo, 'SELECT']
].forEach(function (par) {
  afirmar(!!par[1] && par[1].tagName === par[2], 'debe existir #' + par[0] + ' como <' + par[2].toLowerCase() + '> precargado con el perfil');
});
// Precarga con el perfil (plan.md Adendum R5 punto 4): sexo/edad/talla/peso
// deben arrancar en los valores basales de HERZON_DATA.paciente (los del
// ancla de verificación).
afirmar(campoRecoSexo.value === 'femenino', 'el campo sexo del recomendador debe precargarse con paciente.sexo ("femenino")');
afirmar(soloDigitos(campoRecoEdad.value) === '34', 'el campo edad del recomendador debe precargarse con paciente.edad (34)');
afirmar(soloDigitos(campoRecoTalla.value) === '162', 'el campo talla del recomendador debe precargarse con paciente.talla_cm (162)');
afirmar(Math.round(parseFloat(campoRecoPeso.value)) === 75, 'el campo peso del recomendador debe precargarse con paciente.pesoInicial_kg (75, ancla del Adendum R5)');
afirmar(campoRecoFactor.value === 'ligero', 'el campo de nivel de actividad debe precargarse en "ligero" (reproduce el ancla TMB 1432 / GET 1969)');
afirmar(campoRecoObjetivo.value === 'recomposicion', 'el campo objetivo del recomendador debe precargarse en "recomposicion" (deriva de paciente.objetivo = "Recomposición corporal")');

// --- Necesidades: TMB/GET/kcal objetivo/macros en g, ya calculados al precargar ---
var resumenesReco = contenedorReco.consultarTodo('.hz-reco-resumen');
afirmar(resumenesReco.length === 2,
  '#reco-plan debe tener 2 .hz-reco-resumen: necesidades calculadas y plantilla aplicada, tiene ' + resumenesReco.length);
var resumenNecesidadesEl = resumenesReco[0];
var statsNecesidades = resumenNecesidadesEl.consultarTodo('.hz-stat');
afirmar(statsNecesidades.length === 6,
  'el resumen de necesidades debe tener 6 .hz-stat (TMB, GET, kcal, proteína, carbohidrato, grasa), tiene ' + statsNecesidades.length);

var numTmbInicial = statsNecesidades[0].consultarUno('.hz-stat-num');
var numGetInicial = statsNecesidades[1].consultarUno('.hz-stat-num');
var numKcalNecesidadInicial = statsNecesidades[2].consultarUno('.hz-stat-num');
afirmar(soloDigitos(numTmbInicial.textContent) === '1432', 'con el perfil precargado, el TMB mostrado debe ser 1432 kcal (ancla Adendum R5), fue "' + numTmbInicial.textContent + '"');
afirmar(soloDigitos(numGetInicial.textContent) === '1969', 'con el perfil precargado, el GET mostrado debe ser 1969 kcal (ancla Adendum R5), fue "' + numGetInicial.textContent + '"');

// --- Ranking de plantillas con la recomendada destacada y razones ---
var listaRankingEl = contenedorReco.consultarTodo('.hz-reco-lista')[0];
afirmar(!!listaRankingEl, 'debe existir .hz-reco-lista dentro de #reco-plan');
var itemsRankingInicial = listaRankingEl.consultarTodo('.hz-reco-item');
afirmar(itemsRankingInicial.length === HERZON_DATA.planes.length,
  'el ranking debe tener una fila .hz-reco-item por cada una de las ' + HERZON_DATA.planes.length + ' plantillas de HERZON_DATA.planes, tiene ' + itemsRankingInicial.length);

var scoresRankingInicial = itemsRankingInicial.map(function (item) {
  return parseInt(soloDigitos(item.consultarUno('.hz-reco-score').textContent), 10);
});
for (var ri = 1; ri < scoresRankingInicial.length; ri++) {
  afirmar(scoresRankingInicial[ri - 1] >= scoresRankingInicial[ri],
    'el ranking debe estar ordenado DESCENDENTE por score (posición ' + (ri - 1) + ': ' + scoresRankingInicial[ri - 1] + ', posición ' + ri + ': ' + scoresRankingInicial[ri] + ')');
}
afirmar(itemsRankingInicial[0].getAttribute('data-mejor') === 'true',
  'la primera fila del ranking debe llevar data-mejor="true"');
for (var rj = 1; rj < itemsRankingInicial.length; rj++) {
  afirmar(itemsRankingInicial[rj].getAttribute('data-mejor') === 'false',
    'solo la primera fila del ranking debe llevar data-mejor="true"; la fila ' + rj + ' debe llevar "false"');
}
itemsRankingInicial.forEach(function (item, i) {
  afirmar(item.getAttribute('data-seleccionado') === 'false',
    'sin elección explícita todavía, ninguna fila del ranking debe llevar data-seleccionado="true" (fila ' + i + ')');
});

itemsRankingInicial.forEach(function (item, i) {
  var razonesItem = item.consultarUno('.hz-reco-razones').consultarTodo('.hz-badge');
  afirmar(razonesItem.length === 4, 'la fila ' + i + ' del ranking debe mostrar 4 razones (.hz-badge): kcal, proteína, carbohidrato, grasa');
  razonesItem.forEach(function (chip) {
    afirmar(!!chip.textContent && chip.textContent.trim().length > 0, 'cada razón del ranking debe tener texto no vacío');
  });
});

// --- Paso "calcular": editar el perfil y pulsar Calcular recalcula
//     TMB/GET/kcal/macros y reordena el ranking contra Herzon.Motor ---
var botonCalcular = buscarPorId(rootPlan, 'hz-reco-btn-calcular');
afirmar(!!botonCalcular && botonCalcular.tagName === 'BUTTON', 'debe existir #hz-reco-btn-calcular');

campoRecoPeso.value = '90';
campoRecoPeso.despachar('change');
botonCalcular.despachar('click');

var tmbEsperadoTrasCalcular = Herzon.Motor.tmb({ sexo: 'femenino', pesoKg: 90, tallaCm: 162, edad: 34 });
var getEsperadoTrasCalcular = Herzon.Motor.get(tmbEsperadoTrasCalcular, HERZON_DATA.factoresActividad.ligero);
var kcalEsperadoTrasCalcular = Herzon.Motor.kcalObjetivo(getEsperadoTrasCalcular, 'recomposicion');
var macrosEsperadosTrasCalcular = Herzon.Motor.macrosObjetivo({ kcal: kcalEsperadoTrasCalcular, pesoKg: 90, objetivo: 'recomposicion' });

var numTmbTrasCalcular = statsNecesidades[0].consultarUno('.hz-stat-num');
var numGetTrasCalcular = statsNecesidades[1].consultarUno('.hz-stat-num');
var numKcalTrasCalcular = statsNecesidades[2].consultarUno('.hz-stat-num');
var numProteinaTrasCalcular = statsNecesidades[3].consultarUno('.hz-stat-num');
afirmar(soloDigitos(numTmbTrasCalcular.textContent) === String(tmbEsperadoTrasCalcular),
  'tras cambiar el peso a 90kg y pulsar Calcular, el TMB debe recalcularse a ' + tmbEsperadoTrasCalcular + ' (Herzon.Motor.tmb), fue "' + numTmbTrasCalcular.textContent + '"');
afirmar(soloDigitos(numGetTrasCalcular.textContent) === String(getEsperadoTrasCalcular),
  'tras Calcular, el GET debe recalcularse a ' + getEsperadoTrasCalcular + ', fue "' + numGetTrasCalcular.textContent + '"');
afirmar(soloDigitos(numKcalTrasCalcular.textContent) === String(kcalEsperadoTrasCalcular),
  'tras Calcular, el kcal objetivo calculado debe ser ' + kcalEsperadoTrasCalcular + ', fue "' + numKcalTrasCalcular.textContent + '"');
afirmar(soloDigitos(numProteinaTrasCalcular.textContent) === String(macrosEsperadosTrasCalcular.proteina_g),
  'tras Calcular, la proteína calculada debe ser ' + macrosEsperadosTrasCalcular.proteina_g + ' g, fue "' + numProteinaTrasCalcular.textContent + '"');
afirmar(soloDigitos(numTmbTrasCalcular.textContent) !== '1432',
  'el TMB tras Calcular (peso 90kg) debe ser DISTINTO al TMB inicial (1432, ancla con peso 75kg): evidencia de que Calcular realmente recalculó, no repintó lo mismo');

var itemsRankingTrasCalcular = listaRankingEl.consultarTodo('.hz-reco-item');
afirmar(itemsRankingTrasCalcular.length === HERZON_DATA.planes.length,
  'tras recalcular, el ranking debe seguir teniendo una fila por cada plantilla (no se acumulan filas repetidas)');

// --- Paso "modificar" (a): elegir otra plantilla desde el ranking debe
//     reflejarse en el resto de la vista (menú del día, data-plan-id) ---
var idPlanPrincipalAntes = rootPlan.getAttribute('data-plan-id');
var itemNoAplicado = itemsRankingTrasCalcular.filter(function (item) {
  return item.getAttribute('data-plan-id') !== idPlanPrincipalAntes;
})[0];
afirmar(!!itemNoAplicado, 'debe existir al menos una fila del ranking cuyo plan sea distinto al actualmente activo en el resto de la vista, para probar la alternancia');
var idPlanElegido = itemNoAplicado.getAttribute('data-plan-id');
var planElegidoObjeto = HERZON_DATA.planes.filter(function (p) { return p.id === idPlanElegido; })[0];
var botonUsarElegido = buscarPorAtributo(itemNoAplicado, 'data-accion', 'usar-plan');
afirmar(!!botonUsarElegido && !botonUsarElegido.hasAttribute('disabled'),
  'el botón "Usar este plan" de una fila NO aplicada debe existir y NO estar disabled');

botonUsarElegido.despachar('click');

afirmar(rootPlan.getAttribute('data-plan-id') === idPlanElegido,
  'al aplicar una plantilla desde el recomendador, el resto de la vista (data-plan-id) debe reflejar la selección (esperado ' + idPlanElegido + ', obtenido ' + rootPlan.getAttribute('data-plan-id') + ')');

var diaSeleccionadoActual = Math.max(1, Math.min(planElegidoObjeto.dias.length, parseInt(selectDia.value, 10) || 1)) - 1;
var itemsMenuTrasElegirPlan = rootPlan.consultarTodo('.hz-menu-item');
afirmar(itemsMenuTrasElegirPlan.length === planElegidoObjeto.dias[diaSeleccionadoActual].comidas.length,
  'al aplicar otra plantilla, el menú del día debe recontarse contra la plantilla recién elegida (' + planElegidoObjeto.dias[diaSeleccionadoActual].comidas.length + ' comidas), tiene ' + itemsMenuTrasElegirPlan.length);

var itemsRankingTrasElegir = listaRankingEl.consultarTodo('.hz-reco-item');
var itemAhoraAplicado = itemsRankingTrasElegir.filter(function (item) { return item.getAttribute('data-plan-id') === idPlanElegido; })[0];
afirmar(!!itemAhoraAplicado && itemAhoraAplicado.getAttribute('data-seleccionado') === 'true',
  'tras aplicar la plantilla, su fila en el ranking debe quedar marcada data-seleccionado="true"');
afirmar(buscarPorAtributo(itemAhoraAplicado, 'data-accion', 'usar-plan').hasAttribute('disabled'),
  'el botón de la fila recién aplicada debe quedar disabled ("Plan aplicado")');

var activoTrasElegirPlan = Herzon.planActivo();
afirmar(activoTrasElegirPlan.plan.id === idPlanElegido,
  'Herzon.planActivo().plan.id debe ser la plantilla recién elegida (' + idPlanElegido + '), fue ' + activoTrasElegirPlan.plan.id);
afirmar(activoTrasElegirPlan.escalaPorciones === 1 && activoTrasElegirPlan.kcalObjetivo === Math.round(planElegidoObjeto.kcalObjetivo),
  'al aplicar una nueva plantilla, kcal manual y escala de porciones deben reiniciarse (escala=1, kcal = kcalObjetivo de la plantilla)');

// --- Paso "modificar" (b): ajustar el kcal objetivo manualmente ---
var campoKcalManual = buscarPorId(rootPlan, 'hz-reco-kcal-manual');
afirmar(!!campoKcalManual, 'debe existir #hz-reco-kcal-manual');
campoKcalManual.value = '1500';
campoKcalManual.despachar('change');

var activoTrasKcalManual = Herzon.planActivo();
afirmar(activoTrasKcalManual.kcalObjetivo === 1500,
  'tras fijar el kcal objetivo manual en 1500, Herzon.planActivo().kcalObjetivo debe ser 1500, fue ' + activoTrasKcalManual.kcalObjetivo);
afirmar(activoTrasKcalManual.plan.id === idPlanElegido, 'el kcal manual no debe cambiar la plantilla aplicada');

var resumenAplicadoEl = resumenesReco[1];
var statsAplicado = resumenAplicadoEl.consultarTodo('.hz-stat');
afirmar(statsAplicado.length === 5,
  'el resumen "plantilla aplicada" debe tener 5 .hz-stat (plantilla, kcal, proteína, carbohidrato, grasa), tiene ' + statsAplicado.length);
var numKcalAplicadoStat = statsAplicado[1].consultarUno('.hz-stat-num');
afirmar(soloDigitos(numKcalAplicadoStat.textContent) === '1500',
  'el stat "Kcal objetivo (aplicado)" debe mostrar 1500 tras el ajuste manual, mostró "' + numKcalAplicadoStat.textContent + '"');

// --- Paso "modificar" (c): escalar porciones 0.8x-1.2x recalcula los
//     macros mostrados en vivo (independiente del kcal manual) ---
var campoEscala = buscarPorId(rootPlan, 'hz-reco-escala');
afirmar(!!campoEscala, 'debe existir #hz-reco-escala');
campoEscala.value = '1.2';
campoEscala.despachar('input');

var activoTrasEscala = Herzon.planActivo();
afirmar(activoTrasEscala.escalaPorciones === 1.2,
  'tras mover la escala de porciones a 1.2, Herzon.planActivo().escalaPorciones debe ser 1.2, fue ' + activoTrasEscala.escalaPorciones);
afirmar(activoTrasEscala.kcalObjetivo === 1500,
  'la escala de porciones NO debe pisar el kcal objetivo manual (debe seguir en 1500), fue ' + activoTrasEscala.kcalObjetivo);

var proteinaEsperadaEscalada = Math.round(planElegidoObjeto.macrosTotales.proteina * 1.2);
var carbohidratoEsperadoEscalado = Math.round(planElegidoObjeto.macrosTotales.carbohidrato * 1.2);
var grasaEsperadaEscalada = Math.round(planElegidoObjeto.macrosTotales.grasa * 1.2);
afirmar(activoTrasEscala.macros.proteina_g === proteinaEsperadaEscalada,
  'con escala 1.2x, la proteína mostrada debe ser ' + proteinaEsperadaEscalada + ' g (macrosTotales.proteina de la plantilla x1.2, redondeado), fue ' + activoTrasEscala.macros.proteina_g);
afirmar(activoTrasEscala.macros.carbohidrato_g === carbohidratoEsperadoEscalado,
  'con escala 1.2x, el carbohidrato mostrado debe ser ' + carbohidratoEsperadoEscalado + ' g, fue ' + activoTrasEscala.macros.carbohidrato_g);
afirmar(activoTrasEscala.macros.grasa_g === grasaEsperadaEscalada,
  'con escala 1.2x, la grasa mostrada debe ser ' + grasaEsperadaEscalada + ' g, fue ' + activoTrasEscala.macros.grasa_g);

var numProteinaAplicadoStat = statsAplicado[2].consultarUno('.hz-stat-num');
afirmar(soloDigitos(numProteinaAplicadoStat.textContent) === String(proteinaEsperadaEscalada),
  'el stat de proteína aplicada debe reflejar en vivo la escala de porciones (' + proteinaEsperadaEscalada + ' g), mostró "' + numProteinaAplicadoStat.textContent + '"');

// ---------------------------------------------------------------------
// 4. Vista "Suplementos": monta contra TestDOM, sin lanzar
// ---------------------------------------------------------------------
var rootSup = doc.createElement('div');
afirmar((function () {
  try { registrosCapturados.suplementos(rootSup); return true; }
  catch (e) { console.error(e); return false; }
})(), 'Herzon.Views.suplementos (via registerView) debe montar sin lanzar contra el TestDOM');

afirmar(rootSup.consultarTodo('.hz-hero').length === 1,
  'la vista Suplementos debe tener EXACTAMENTE un .hz-hero (regla 11)');

var chartsSup = rootSup.consultarTodo('.hz-chart');
var togglesSup = rootSup.consultarTodo('.hz-table-toggle');
afirmar(chartsSup.length === togglesSup.length,
  'en la vista Suplementos el número de .hz-chart debe igualar el número de .hz-table-toggle (paridad, regla 9)');
afirmar(chartsSup.length === 2,
  'la vista Suplementos debe tener exactamente 2 gráficas: adherencia por suplemento y adherencia en el tiempo');

var nSuplementos = HERZON_DATA.suplementos.length;
var tablasSup = rootSup.consultarTodo('.hz-table');
var filasRegimen = tablasSup[0].consultarTodo('tbody')[0].consultarTodo('tr');
afirmar(filasRegimen.length === nSuplementos,
  'la tabla de régimen debe tener exactamente ' + nSuplementos + ' filas (una por suplemento), tiene ' + filasRegimen.length);

var contAdherenciaSup = chartsSup[0];
var barrasAdherenciaSup = contarPorTagSinAtributo(contAdherenciaSup, 'path', 'role');
afirmar(barrasAdherenciaSup.length === nSuplementos,
  'la gráfica de adherencia por suplemento debe tener una barra horizontal por cada uno de los ' + nSuplementos + ' suplementos');

var contHeatmap = chartsSup[1];
var celdasHeatmap = contHeatmap.consultarTodo('.hz-heat-celda');
var nDiasAdherencia = HERZON_DATA.series.adherenciaDiaria.length;
afirmar(celdasHeatmap.length === nDiasAdherencia,
  'el heatmap de adherencia en el tiempo debe tener una celda por cada uno de los ' + nDiasAdherencia + ' días de HERZON_DATA.series.adherenciaDiaria');

var fillsHeatmap = {};
for (var h = 0; h < celdasHeatmap.length; h++) {
  var f = celdasHeatmap[h].style.fill;
  fillsHeatmap[f] = true;
}
var tokensHeatEsperados = ['var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)', 'var(--heat-5)'];
var soloTokensHeat = Object.keys(fillsHeatmap).every(function (f) { return tokensHeatEsperados.indexOf(f) !== -1; });
afirmar(soloTokensHeat, 'el heatmap de adherencia debe pintar sus celdas SOLO con var(--heat-1..5), nunca la serie categórica ni un hex');

// ---------------------------------------------------------------------
// 5. D5 (QA ronda 1): ninguna .hz-chart-title interna duplica el heading
//    .hz-card-title de su propia card. Adherencia por suplemento y
//    adherencia en el tiempo siguen sin "titulo" propio (evitarían duplicar
//    el heading de su card). Macros por comida y calorías por día SÍ pasan
//    "titulo" ahora (corrección R4): viven agrupadas dentro de la card
//    "Gráficas del plan", cuyo heading no es prefijo de ninguno de los 2
//    títulos internos, así que D5 sigue cumplido.
// ---------------------------------------------------------------------
function textoTituloInternoDuplicaHeading(rootVista) {
  var cards = rootVista.consultarTodo('.hz-card');
  for (var ci2 = 0; ci2 < cards.length; ci2++) {
    var headings = cards[ci2].consultarTodo('.hz-card-title');
    if (!headings.length) continue;
    var textoHeading = String(headings[0].textContent || '').trim();
    var titulosInternos = cards[ci2].consultarTodo('.hz-chart-title');
    for (var ti = 0; ti < titulosInternos.length; ti++) {
      var textoTitulo = String(titulosInternos[ti].textContent || '').trim();
      if (textoTitulo && textoHeading && textoTitulo.indexOf(textoHeading) === 0) return true;
    }
  }
  return false;
}
afirmar(!textoTituloInternoDuplicaHeading(rootPlan),
  'la vista Plan de dieta no debe pintar un .hz-chart-title que duplique el heading .hz-card-title de su card (D5)');
afirmar(!textoTituloInternoDuplicaHeading(rootSup),
  'la vista Suplementos no debe pintar un .hz-chart-title que duplique el heading .hz-card-title de su card (D5)');

// ---------------------------------------------------------------------
// 6. Anti-regresion D1 (QA ronda 1): ninguna de estas palabras en espanol
//    sin acento/enie puede reaparecer en el CODIGO FUENTE de este modulo
//    (comentarios incluidos). Coincidencia con limite de palabra.
// ---------------------------------------------------------------------
var PALABRAS_SIN_ACENTO_PROHIBIDAS = [
  'anos', 'Composicion', 'Calorias', 'Regimen', 'Probiotico', 'clinica',
  'demostracion', 'sinteticos', 'ultimas', 'capsula'
];
for (var pa = 0; pa < PALABRAS_SIN_ACENTO_PROHIBIDAS.length; pa++) {
  var palabra = PALABRAS_SIN_ACENTO_PROHIBIDAS[pa];
  var regexPalabra = new RegExp('\\b' + palabra + '\\b');
  afirmar(!regexPalabra.test(fuenteVista), 'build/vista_dieta_supl.js contiene la palabra sin acento "' + palabra + '" (D1, QA ronda 1): revisar y corregir a espanol con acentos/enie');
}

// ---------------------------------------------------------------------
console.log('checks ejecutados: ' + contador);
process.exit(0);
