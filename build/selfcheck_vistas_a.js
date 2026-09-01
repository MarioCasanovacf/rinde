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
// Mock de addEventListener/dispatchEvent EN MEMORIA (mismo patrón que
// build/selfcheck_almacen.js): build/almacen.js usa G.dispatchEvent +
// `new CustomEvent(...)` para notificar herzon:modo-cambiado, y
// build/vista_dieta_supl.js (R9, MC-07) usa G.addEventListener para
// escucharlo. Node trae CustomEvent global desde v18/19, pero NO trae
// addEventListener/dispatchEvent en globalThis -- sin este mock, el
// listener del módulo nunca se registra ni se dispara, y toda la
// reactividad multi-cliente (sección 7) sería un falso verde silencioso.
// ---------------------------------------------------------------------
function instalarBusDeEventos() {
  var listenersPorTipo = {};
  globalThis.addEventListener = function (tipo, manejador) {
    listenersPorTipo[tipo] = listenersPorTipo[tipo] || [];
    listenersPorTipo[tipo].push(manejador);
  };
  globalThis.removeEventListener = function (tipo, manejador) {
    var lista = listenersPorTipo[tipo] || [];
    var idx = lista.indexOf(manejador);
    if (idx !== -1) { lista.splice(idx, 1); }
  };
  globalThis.dispatchEvent = function (evento) {
    var lista = listenersPorTipo[evento.type] || [];
    for (var i = 0; i < lista.length; i++) { lista[i](evento); }
    return true;
  };
}

// Mock de localStorage EN MEMORIA (build/almacen.js lo usa para persistir
// clientes reales; sin él, crearCliente/guardarPlan igual funcionan porque
// almacen.js degrada con gracia, pero probar seleccionarCliente() tras
// volverADemo() -- MC-07 "precarga desde planAplicado" -- necesita que el
// remontaje lea lo mismo que se guardó).
function crearLocalStorageMock() {
  var almacen = {};
  return {
    getItem: function (clave) { return Object.prototype.hasOwnProperty.call(almacen, clave) ? almacen[clave] : null; },
    setItem: function (clave, valor) { almacen[clave] = String(valor); },
    removeItem: function (clave) { delete almacen[clave]; }
  };
}

// ---------------------------------------------------------------------
// 0. Carga del módulo: DOM headless antes de require (plan.md 3.A), y stub
//    de Herzon.registerView que captura los registros (task T-004, criterio
//    "instala un stub de Herzon.registerView que captura los registros").
// ---------------------------------------------------------------------
globalThis.window = globalThis;
instalarBusDeEventos();
globalThis.localStorage = crearLocalStorageMock();

var TESTDOM_PATH = path.join(__dirname, 'testdom.js');
var DATA_PATH = path.join(__dirname, 'data.js');
var ALMACEN_PATH = path.join(__dirname, 'almacen.js');
var CHARTS_PATH = path.join(__dirname, 'charts.js');
var MOTOR_PATH = path.join(__dirname, 'motor_recomendacion.js');
var VISTA_PATH = path.join(__dirname, 'vista_dieta_supl.js');

require(TESTDOM_PATH);
require(DATA_PATH);
// R9 (T-045, orden de inyección real: data -> almacen -> charts -> vistas,
// plan.md Adendum R8 punto 6): build/almacen.js NO conoce registerView (su
// única API de UI es initUI, que este selfcheck no llama), así que
// requerirlo antes del stub de abajo no interfiere con él. Se necesita
// disponible ANTES de vista_dieta_supl.js porque ese módulo, al cargarse,
// registra su listener de herzon:modo-cambiado (G.addEventListener, ya
// mockeado arriba) y sus llamadas a G.Herzon.Almacen ocurren en tiempo de
// interacción (sección 7), no al cargar.
require(ALMACEN_PATH);
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
afirmar(clasesEnFuente.length > 0, 'debe haber al menos una clase hz- agregada vía classList.add (sanity del propio test)');

// ---------------------------------------------------------------------
// 2. Namespaces disjuntos (plan.md 3.B): SOLO plan y suplementos
// ---------------------------------------------------------------------
afirmar(typeof Herzon.Views === 'object' && Herzon.Views !== null,
  'Herzon.Views debe existir como objeto (abierto con G.Herzon.Views = G.Herzon.Views || {})');

afirmar(typeof Herzon.Views.plan === 'function', 'Herzon.Views.plan debe ser una función');
afirmar(typeof Herzon.Views.suplementos === 'function', 'Herzon.Views.suplementos debe ser una función');

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
afirmar(typeof Herzon.planActivo === 'function', 'Herzon.planActivo debe existir como función (Adendum R5 punto 4)');

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
// Refleja EXACTAMENTE la marca estática de build/shell.html (T-021): un
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
})(), 'Herzon.Views.plan (vía registerView) debe montar sin lanzar contra el TestDOM');

afirmar(rootPlan.consultarTodo('.hz-reco-panel').length === 1,
  'la vista Plan de dieta NO debe duplicar #reco-plan: debe reutilizar el nodo estático de build/shell.html');
afirmar(rootPlan.children.indexOf(recoPlanEstatico) !== -1,
  'el #reco-plan estático original debe seguir siendo el mismo nodo (reutilizado, no reemplazado)');

afirmar(rootPlan.consultarTodo('.hz-hero').length === 1,
  'la vista Plan de dieta debe tener EXACTAMENTE un .hz-hero (regla 11)');

// R6 (fini-4, Adendum R6 punto 6): los botones del recomendador ("Calcular
// necesidades", "Usar este plan"/"Plan aplicado") ahora REUTILIZAN la clase
// .hz-table-toggle en vez de estilos inline -- ya no son un proxy fiel del
// toggle "Ver tabla" de cada .hz-chart (contrato regla 9). Los toggles
// reales de gráfica los marca build/charts.js con aria-expanded (ver
// Charts.tablaToggle); los botones del recomendador nunca lo llevan, así
// que se filtran por esa marca para no romper la paridad chart<->toggle.
var chartsPlan = rootPlan.consultarTodo('.hz-chart');
var togglesPlan = rootPlan.consultarTodo('.hz-table-toggle').filter(function (b) { return b.hasAttribute('aria-expanded'); });
afirmar(chartsPlan.length === togglesPlan.length,
  'en la vista Plan de dieta el número de .hz-chart debe igualar el número de .hz-table-toggle propios de gráfica (con aria-expanded), paridad regla 9');

var botonesRecoConTogglePlan = rootPlan.consultarTodo('.hz-table-toggle').filter(function (b) { return !b.hasAttribute('aria-expanded'); });
afirmar(botonesRecoConTogglePlan.length === 6,
  'los botones del recomendador (Calcular + 5 "Usar este plan"/"Plan aplicado") deben reutilizar .hz-table-toggle (fini-4), tiene ' + botonesRecoConTogglePlan.length);
// R9 (LY-06b, decisión final): "Usar este plan"/"Plan aplicado" pasa a vivir
// como último hijo de .hz-reco-razones, empujado a la derecha con
// margin-left:auto -- ese ÚNICO estilo inline es el que autoriza el
// hallazgo LY-06b (no hay clase reutilizable en shell.html para ese caso
// puntual). El botón "Calcular necesidades" conserva la regla fini-4
// original: cero estilo inline, solo .hz-table-toggle.
var botonCalcularToggle = botonesRecoConTogglePlan.filter(function (b) { return b.getAttribute('data-accion') === 'calcular'; });
var botonesUsarPlanToggle = botonesRecoConTogglePlan.filter(function (b) { return b.getAttribute('data-accion') === 'usar-plan'; });
afirmar(botonCalcularToggle.length === 1 && botonesUsarPlanToggle.length === 5,
  'debe haber exactamente 1 botón "Calcular necesidades" y 5 "Usar este plan"/"Plan aplicado" (uno por plantilla del ranking)');
afirmar(Object.keys(botonCalcularToggle[0].style).length === 0,
  'el botón "Calcular necesidades" no debe llevar propiedades de estilo inline (fini-4): usa .hz-table-toggle, no element.style');
botonesUsarPlanToggle.forEach(function (boton) {
  var clavesEstilo = Object.keys(boton.style);
  afirmar(clavesEstilo.length === 1 && clavesEstilo[0] === 'marginLeft' && boton.style.marginLeft === 'auto',
    'R9 (LY-06b): "Usar este plan"/"Plan aplicado" debe llevar SOLO marginLeft:auto inline (empuje a la derecha dentro de .hz-reco-razones), el resto del estilo viene de .hz-table-toggle');
});
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

// --- R6-fix (hallazgo data-7, T-035): "Macronutrientes por comida" no
//     mostraba ni un valor. Fix quirúrgico: cablear etiquetasSegmento: true
//     en la llamada a Charts.apilada100 (opción verificada en T-027). ---
var inicioLlamadaMacros = fuenteVista.indexOf('Charts.apilada100(contMacros');
afirmar(inicioLlamadaMacros !== -1, 'debe existir una llamada a Charts.apilada100(contMacros, ...) en la fuente');
var finLlamadaMacros = fuenteVista.indexOf('});', inicioLlamadaMacros);
var bloqueLlamadaMacros = fuenteVista.slice(inicioLlamadaMacros, finLlamadaMacros);
afirmar(/etiquetasSegmento\s*:\s*true/.test(bloqueLlamadaMacros),
  'la llamada a Charts.apilada100 de "Macronutrientes por comida" debe declarar etiquetasSegmento: true (fix quirúrgico T-035, hallazgo data-7)');

var etiquetasSegmentoMacros = contMacros.consultarTodo('.hz-etiqueta-segmento');
afirmar(etiquetasSegmentoMacros.length > 0,
  'tras cablear etiquetasSegmento: true, la gráfica de macros por comida debe montar al menos una etiqueta de segmento (%) en el TestDOM (hallazgo data-7)');
etiquetasSegmentoMacros.forEach(function (nodo) {
  afirmar(/^[0-9]+([.,][0-9]+)?%$/.test(nodo.textContent),
    'cada etiqueta de segmento de la gráfica de macros debe mostrar un valor porcentual, tiene "' + nodo.textContent + '"');
});

// --- Calorías por día: una barra por cada uno de los 7 días del plan ---
var contKcal = chartsPlan[1];
var barrasVisualesKcal = contarPorTagSinAtributo(contKcal, 'path', 'role');
afirmar(barrasVisualesKcal.length === planActual.dias.length,
  'la gráfica de calorías por día debe tener una barra por cada uno de los ' + planActual.dias.length + ' días del plan');

// ---------------------------------------------------------------------
// R9 (DV-01): "Macronutrientes por comida" restringe las etiquetas de %
// a la comida principal (la de mayor kcal, categoría "Comida") en vez de
// rotular los 15 segmentos -- selectividad de saillance.
// ---------------------------------------------------------------------
var inicioLlamadaMacrosDV01 = fuenteVista.indexOf('Charts.apilada100(contMacros');
var finLlamadaMacrosDV01 = fuenteVista.indexOf('});', inicioLlamadaMacrosDV01);
var bloqueLlamadaMacrosDV01 = fuenteVista.slice(inicioLlamadaMacrosDV01, finLlamadaMacrosDV01);
afirmar(/etiquetasSegmentoIndices\s*:/.test(bloqueLlamadaMacrosDV01),
  'R9 (DV-01): la llamada a Charts.apilada100 de "Macronutrientes por comida" debe pasar etiquetasSegmentoIndices (selectividad: solo la comida principal conserva sus 3 %)');
// Espejo LOCAL del mapa NOMBRES_MOMENTO de build/vista_dieta_supl.js (no se
// importa: el selfcheck es Node puro y ese mapa vive en un closure privado
// del módulo) -- solo para reconstruir qué categoría es "Comida" y así
// predecir cuántas etiquetas de segmento debe dejar etiquetasSegmentoIndices.
var NOMBRES_MOMENTO_TEST = {
  desayuno: 'Desayuno',
  colacion_manana: 'Colación matutina',
  comida: 'Comida',
  colacion_tarde: 'Colación vespertina',
  cena: 'Cena'
};
var categoriasComidaActual = diaActual.comidas.map(function (c) { return NOMBRES_MOMENTO_TEST[c.momento] || c.momento; });
var idxComidaPrincipalEsperado = categoriasComidaActual.indexOf('Comida');
if (idxComidaPrincipalEsperado !== -1) {
  var etiquetasSegmentoDV01 = contMacros.consultarTodo('.hz-etiqueta-segmento');
  afirmar(etiquetasSegmentoDV01.length === 3,
    'R9 (DV-01): con etiquetasSegmentoIndices restringido a la comida principal, deben quedar EXACTAMENTE 3 etiquetas de % visibles (una por macro de esa columna), tiene ' + etiquetasSegmentoDV01.length);
}

// ---------------------------------------------------------------------
// R9 (DV-03): "Calorías por día" dibuja el objetivo de kcal aplicado como
// umbral explícito (hairline var(--text-muted) + etiqueta "Objetivo"), no
// solo el dato -- referencia: {valor, etiqueta} + unidad: 'kcal'.
// ---------------------------------------------------------------------
var inicioLlamadaKcalDV03 = fuenteVista.indexOf('Charts.barras(contKcal');
var finLlamadaKcalDV03 = fuenteVista.indexOf('});', inicioLlamadaKcalDV03);
var bloqueLlamadaKcalDV03 = fuenteVista.slice(inicioLlamadaKcalDV03, finLlamadaKcalDV03);
afirmar(/referencia\s*:\s*\{\s*valor\s*:\s*activo\.kcalObjetivo\s*,\s*etiqueta\s*:\s*'Objetivo'\s*\}/.test(bloqueLlamadaKcalDV03),
  'R9 (DV-03): la llamada a Charts.barras de "Calorías por día" debe pasar referencia: { valor: activo.kcalObjetivo, etiqueta: \'Objetivo\' } (el kcalObjetivo APLICADO, no un literal)');
afirmar(/unidad\s*:\s*'kcal'/.test(bloqueLlamadaKcalDV03),
  'R9 (DV-03): la llamada a Charts.barras de "Calorías por día" debe pasar unidad: \'kcal\'');

var lineasReferenciaKcal = contKcal.consultarTodo('.hz-referencia-linea');
afirmar(lineasReferenciaKcal.length === 1,
  'R9 (DV-03): "Calorías por día" debe dibujar EXACTAMENTE una hairline de referencia (el objetivo de kcal), tiene ' + lineasReferenciaKcal.length);
var etiquetasReferenciaKcal = contKcal.consultarTodo('.hz-referencia-etiqueta');
afirmar(etiquetasReferenciaKcal.length === 1 && etiquetasReferenciaKcal[0].textContent === 'Objetivo',
  'R9 (DV-03): la etiqueta de la hairline de referencia debe leer exactamente "Objetivo", tiene "' + (etiquetasReferenciaKcal[0] && etiquetasReferenciaKcal[0].textContent) + '"');
var etiquetasValorKcalDV03 = contKcal.consultarTodo('.hz-etiqueta-valor');
afirmar(etiquetasValorKcalDV03.length > 0 && etiquetasValorKcalDV03.every(function (e) { return /\skcal$/.test(e.textContent); }),
  'R9 (DV-03): la etiqueta de valor de "Calorías por día" debe llevar la unidad "kcal" (opciones.unidad)');

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
//         cualquier columna sobrante en cualquier ancho >= 3 columnas.
//     R9 (LY-03) SUPERSEDE la pieza (a): "Gráficas del plan" ya NO es la
//     3a card del grid superior -- sale a vivir como hermana de `grid`
//     (mismo patrón bendecido que hz-menu-fila/#reco-plan), y el grid
//     superior queda con EXACTAMENTE 2 hijos (hero + formulario), que a
//     1240px resuelven 2 columnas de ~570px sin hueco muerto (la objeción
//     de R4 era contra una 4a card suelta en un grid de 3 columnas; con 2
//     hijos no aplica). La pieza (b) -- el menú del día fuera de todo
//     .hz-grid -- se conserva intacta. ---
var cardsPlan = rootPlan.consultarTodo('.hz-card');
afirmar(cardsPlan.length === 5,
  'la vista Plan de dieta debe tener 5 .hz-card en total: #reco-plan (recomendador, T-022), hero, formulario, "Gráficas del plan" (agrupa macros+calorías) y menú del día, tiene ' + cardsPlan.length);

// Adendum R5 (T-022): #reco-plan se suma como card de ancho completo, con
// el mismo patrón ya usado por hz-menu-fila (hermana de .hz-grid, ver
// build/shell.html comentario sobre #reco-plan). R9 (LY-03): "Gráficas del
// plan" se une a ese mismo patrón de hermana-de-grid, así que ya NO cuenta
// como "ancho normal dentro del grid superior" -- se identifica aparte, por
// título, no por exclusión de clase (no lleva hz-menu-fila ni hz-reco-panel,
// pero tampoco vive dentro del grid superior).
var cardsAnchoCompleto = cardsPlan.filter(function (c) {
  return c._clases.indexOf('hz-menu-fila') !== -1 || c._clases.indexOf('hz-reco-panel') !== -1;
});
afirmar(cardsAnchoCompleto.length === 2,
  'deben existir EXACTAMENTE 2 cards de ancho completo (hz-reco-panel y hz-menu-fila), tiene ' + cardsAnchoCompleto.length);

var cardGraficasPlan = cardsPlan.filter(function (c) {
  var t = c.consultarUno('.hz-card-title');
  return !!t && t.textContent === 'Gráficas del plan';
})[0];
afirmar(!!cardGraficasPlan, 'debe existir la card "Gráficas del plan" (agrupa macros por comida y calorías por día en un grid anidado)');
var gridsAnidadosGraficas = cardGraficasPlan ? cardGraficasPlan.consultarTodo('.hz-grid') : [];
afirmar(gridsAnidadosGraficas.length === 1,
  'la card "Gráficas del plan" debe contener EXACTAMENTE un grid anidado (.hz-grid) que agrupa sus 2 gráficas, en vez de 2 cards sueltas');
afirmar(!!gridsAnidadosGraficas[0] && gridsAnidadosGraficas[0].consultarTodo('.hz-chart').length === 2,
  'el grid anidado de "Gráficas del plan" debe contener las 2 gráficas (macros por comida y calorías por día)');

// (b): ni el menú del día ni "Gráficas del plan" deben ser descendientes de
// ningún .hz-grid que no sea el suyo propio (el grid superior de hero+
// formulario, o cualquier otro grid ajeno).
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

// R9 (LY-03): el grid superior (el que contiene el héroe "Plan de dieta
// actual" y "Personaliza tu plan") queda con EXACTAMENTE 2 hijos; "Gráficas
// del plan" vive FUERA de él, hermana directa de ese grid bajo rootPlan --
// el gridGraficas anidado (dentro de cardGraficasPlan, ya verificado arriba)
// es un grid DISTINTO y no cuenta aquí.
var gridSuperiorPlan = todosLosGridsDeLaVista.filter(function (g) {
  return g !== gridsAnidadosGraficas[0];
})[0];
afirmar(!!gridSuperiorPlan && gridSuperiorPlan.children.length === 2,
  'R9 (LY-03): el grid superior de la vista Plan (héroe + formulario) debe tener EXACTAMENTE 2 hijos, tiene ' + (gridSuperiorPlan ? gridSuperiorPlan.children.length : 'ningún grid encontrado'));
afirmar(!!gridSuperiorPlan && !esDescendienteDeAlgunGrid(cardGraficasPlan, [gridSuperiorPlan]),
  'R9 (LY-03): "Gráficas del plan" debe vivir FUERA del grid superior (hermana directa de `grid` bajo rootEl, patrón #reco-plan/hz-menu-fila), no como su 3a card');
afirmar(!!gridSuperiorPlan && !!cardGraficasPlan && rootPlan.children.indexOf(gridSuperiorPlan) < rootPlan.children.indexOf(cardGraficasPlan) &&
  rootPlan.children.indexOf(cardGraficasPlan) < rootPlan.children.indexOf(cardMenuDelDia),
  'R9 (LY-03): el orden vertical de la vista debe ser grid héroe+formulario, luego "Gráficas del plan", luego "Menú del día"');

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

// R6 (jera-6): las razones del ranking ya NO son chips .hz-badge (reservado
// a rótulos cortos reales, Adendum R6 punto 6), sino una línea de texto
// normal (0.85rem, sentence case, var(--text-secondary)) separada por
// ' · ', con el par suficiente/insuficiente de proteína distinguido con el
// patrón punto de estatus (.hz-status-dot + .hz-status-label, ya usado por
// build/vista_metricas.js). El ranking esperado se recomputa con el MISMO
// perfil basal del ancla (Herzon.Motor.recomendar) para verificar el
// contenido EXACTO de cada fila contra la fuente de verdad, no un string
// adivinado.
var kcalNecesidadAncla = MotorParaAncla.kcalObjetivo(getAncla, 'recomposicion');
var macrosNecesidadAncla = MotorParaAncla.macrosObjetivo({ kcal: kcalNecesidadAncla, pesoKg: 75, objetivo: 'recomposicion' });
var necesidadesEsperadasAncla = {
  kcal: kcalNecesidadAncla,
  proteina_g: macrosNecesidadAncla.proteina_g,
  carbohidrato_g: macrosNecesidadAncla.carbohidrato_g,
  grasa_g: macrosNecesidadAncla.grasa_g
};
var rankingEsperadoInicial = MotorParaAncla.recomendar(necesidadesEsperadasAncla, HERZON_DATA.planes);

itemsRankingInicial.forEach(function (item, i) {
  var razonesEl = item.consultarUno('.hz-reco-razones');

  afirmar(razonesEl.consultarTodo('.hz-badge').length === 0,
    'la fila ' + i + ' del ranking NO debe usar chips .hz-badge para las razones (Adendum R6 punto 6)');
  afirmar(razonesEl.style.fontSize === '0.85rem',
    'la línea de razones de la fila ' + i + ' debe tener font-size 0.85rem (jera-6)');
  afirmar(razonesEl.style.color === 'var(--text-secondary)',
    'la línea de razones de la fila ' + i + ' debe usar var(--text-secondary) (jera-6)');

  var planIdFila = item.getAttribute('data-plan-id');
  var entradaEsperada = rankingEsperadoInicial.filter(function (e) { return e.plan.id === planIdFila; })[0];
  afirmar(!!entradaEsperada, 'debe existir una entrada esperada de Herzon.Motor.recomendar para la plantilla ' + planIdFila);
  var razonesEsperadas = entradaEsperada.razones;
  afirmar(razonesEsperadas.length === 4, 'sanity: Herzon.Motor debe producir 4 razones por plantilla (kcal, proteína, carbohidrato, grasa)');

  var textoLinea = razonesEl.textContent;
  afirmar(textoLinea.indexOf(' · ') !== -1,
    'la fila ' + i + ' del ranking debe separar sus razones con " · " (jera-6)');
  afirmar(textoLinea.charAt(0) === textoLinea.charAt(0).toUpperCase(),
    'la primera razón de la fila ' + i + ' debe ir en sentence case (primera letra mayúscula)');

  razonesEsperadas.forEach(function (razonEsperada, ri) {
    var fragmentoEsperado = ri === 0
      ? (razonEsperada.charAt(0).toUpperCase() + razonEsperada.slice(1))
      : razonEsperada;
    afirmar(textoLinea.indexOf(fragmentoEsperado) !== -1,
      'la fila ' + i + ' del ranking debe incluir la razón "' + fragmentoEsperado + '" (Herzon.Motor)');
  });

  // Exactamente una razón (proteína) lleva el patrón punto de estatus.
  var puntosEstado = razonesEl.consultarTodo('.hz-status-dot');
  var etiquetasEstado = razonesEl.consultarTodo('.hz-status-label');
  afirmar(puntosEstado.length === 1 && etiquetasEstado.length === 1,
    'la fila ' + i + ' del ranking debe distinguir EXACTAMENTE una razón (proteína) con .hz-status-dot + .hz-status-label, tiene ' + puntosEstado.length + ' puntos y ' + etiquetasEstado.length + ' etiquetas');
  var razonProteinaEsperada = razonesEsperadas.filter(function (r) { return r.indexOf('proteína') !== -1; })[0];
  afirmar(!!razonProteinaEsperada, 'debe existir una razón sobre proteína en la fila ' + i);
  var esperaInsuficiente = razonProteinaEsperada.indexOf('insuficiente') !== -1;
  afirmar(puntosEstado[0].getAttribute('data-status') === (esperaInsuficiente ? 'warning' : 'good'),
    'el punto de estatus de proteína de la fila ' + i + ' debe ser data-status="' + (esperaInsuficiente ? 'warning' : 'good') + '" según "' + razonProteinaEsperada + '"');
  afirmar(etiquetasEstado[0].textContent === razonProteinaEsperada,
    'la etiqueta del punto de estatus de la fila ' + i + ' debe mostrar el texto exacto de la razón de proteína ("' + razonProteinaEsperada + '"), mostró "' + etiquetasEstado[0].textContent + '"');
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
// 3.6 R6 prod-8: el valor vivo de la escala se muestra JUNTO a su
//     etiqueta ("Escala de porciones: 1.20x"), no en un span aparte.
// ---------------------------------------------------------------------
var etiquetaEscalaEl = buscarPorAtributo(rootPlan, 'for', 'hz-reco-escala');
afirmar(!!etiquetaEscalaEl && etiquetaEscalaEl.tagName === 'LABEL',
  'debe existir un <label for="hz-reco-escala"> (prod-8)');
afirmar(etiquetaEscalaEl.textContent === 'Escala de porciones: 1.20x',
  'tras mover la escala a 1.2, la etiqueta debe mostrar el valor junto al texto ("Escala de porciones: 1.20x", prod-8), mostró "' + etiquetaEscalaEl.textContent + '"');

// ---------------------------------------------------------------------
// 3.7 R6 prod-2: con la plantilla elegida + kcal manual (1500) + escala
//     (1.2x) TODOS activos a la vez, el héroe y el Total del día de la
//     vista PRINCIPAL (no solo los stats de #reco-plan) deben mostrar lo
//     que el menú REAL, escalado, realmente suma -- nunca el kcal manual
//     (que es solo el objetivo del panel del recomendador).
// ---------------------------------------------------------------------
var diaIdxTrasEscala = Math.max(1, Math.min(planElegidoObjeto.dias.length, parseInt(selectDia.value, 10) || 1)) - 1;
var comidasDiaTrasEscala = planElegidoObjeto.dias[diaIdxTrasEscala].comidas;
var kcalRealEsperadoTrasEscala = Math.round(comidasDiaTrasEscala.reduce(function (acc, c) { return acc + c.kcal * 1.2; }, 0));
var heroNumTrasEscala = rootPlan.consultarTodo('.hz-hero-num')[0];
var totalKcalTrasEscala = rootPlan.consultarTodo('.hz-menu-total-kcal')[0];
afirmar(soloDigitos(heroNumTrasEscala.textContent) === String(kcalRealEsperadoTrasEscala),
  'tras escalar a 1.2x, el héroe de "Plan de dieta actual" debe mostrar la suma REAL del menú escalado (' + kcalRealEsperadoTrasEscala + ' kcal, prod-2), mostró "' + heroNumTrasEscala.textContent + '"');
afirmar(soloDigitos(totalKcalTrasEscala.textContent) === String(kcalRealEsperadoTrasEscala),
  'tras escalar a 1.2x, el Total del día debe coincidir con el héroe (' + kcalRealEsperadoTrasEscala + ' kcal, prod-2), mostró "' + totalKcalTrasEscala.textContent + '"');
afirmar(soloDigitos(heroNumTrasEscala.textContent) !== '1500',
  'el héroe NO debe mostrar el kcal objetivo MANUAL (1500 kcal): ese override solo gobierna el objetivo del panel del recomendador, no lo que el menú real ya escalado realmente suma (prod-2)');

// ---------------------------------------------------------------------
// 3.8 R6 prod-6: con una plantilla fijada desde el recomendador, la card
//     "Personaliza tu plan" (vista principal) muestra la nota vía
//     textContent; se retira al volver al modo automático.
// ---------------------------------------------------------------------
var cardPersonaliza = rootPlan.consultarTodo('.hz-card').filter(function (c) {
  var t = c.consultarUno('.hz-card-title');
  return !!t && t.textContent === 'Personaliza tu plan';
})[0];
afirmar(!!cardPersonaliza, 'debe existir la card "Personaliza tu plan"');
var notaPlantillaFijadaEl = cardPersonaliza.consultarTodo('.hz-nota')[0];
afirmar(!!notaPlantillaFijadaEl, 'la card "Personaliza tu plan" debe tener una .hz-nota para la plantilla fijada (prod-6)');
afirmar(
  notaPlantillaFijadaEl.textContent.indexOf('Plantilla fijada desde el recomendador') !== -1 &&
  notaPlantillaFijadaEl.textContent.indexOf(planElegidoObjeto.nombre) !== -1,
  'con una plantilla fijada desde el recomendador, la nota debe decir "Plantilla fijada desde el recomendador: ' +
  planElegidoObjeto.nombre + '..." (prod-6), mostró "' + notaPlantillaFijadaEl.textContent + '"'
);

// Tocar de nuevo el formulario objetivo/restricción vuelve al modo
// automático (limpia planIdSeleccionado, ver render()); la nota se retira.
selectRestriccion.despachar('change');
afirmar(notaPlantillaFijadaEl.textContent === '',
  'al volver al modo automático (tocar el formulario objetivo/restricción), la nota de plantilla fijada debe retirarse (prod-6), quedó "' + notaPlantillaFijadaEl.textContent + '"');
afirmar(Herzon.planActivo().plan.id !== idPlanElegido || HERZON_DATA.planes.length === 1,
  'sanity (prod-6): en modo automático Herzon.planActivo() vuelve a resolver por objetivo/restricción, ya no por la elección manual retirada');

// ---------------------------------------------------------------------
// 3.9 R6 prod-4: "Calcular" con un campo numérico vacío o inválido NO
//     recalcula en silencio -- marca el input (element.style con
//     var(--delta-bad), regla 3.H) y pinta una .hz-nota indicando el
//     campo. Los .hz-nota de #reco-plan, en orden de aparición en el DOM:
//     [0] disclaimer Mifflin-St Jeor, [1] validación (prod-4), [2] nota de
//     "plantilla aplicada" (Adendum R5).
// ---------------------------------------------------------------------
var notasReco = contenedorReco.consultarTodo('.hz-nota');
afirmar(notasReco.length === 3,
  '#reco-plan debe tener 3 .hz-nota: disclaimer, validación (prod-4) y plantilla aplicada, tiene ' + notasReco.length);
var notaValidacionEl = notasReco[1];
afirmar(notaValidacionEl.textContent === '',
  'antes de cualquier intento inválido, la nota de validación debe estar vacía');

var tmbAntesDeInvalido = statsNecesidades[0].consultarUno('.hz-stat-num').textContent;

campoRecoTalla.value = '';
campoRecoTalla.despachar('change');
botonCalcular.despachar('click');

afirmar(statsNecesidades[0].consultarUno('.hz-stat-num').textContent === tmbAntesDeInvalido,
  'Calcular con Talla vacía NO debe recalcular en silencio: el TMB mostrado debe seguir siendo el del último cálculo válido ("' + tmbAntesDeInvalido + '")');
afirmar(notaValidacionEl.textContent.indexOf('Talla') !== -1,
  'la nota de validación debe señalar el campo inválido (Talla), mostró "' + notaValidacionEl.textContent + '"');
afirmar(campoRecoTalla.style.borderColor === 'var(--delta-bad)',
  'el campo Talla inválido debe marcarse con element.style.borderColor = var(--delta-bad) (prod-4, regla 3.H), fue "' + campoRecoTalla.style.borderColor + '"');
afirmar(campoRecoTalla.getAttribute('aria-invalid') === 'true',
  'el campo Talla inválido debe marcarse aria-invalid="true"');

// Un segundo campo con un valor negativo también debe bloquear, sin
// acumular texto de validaciones previas (el mensaje se reemplaza, no se
// concatena).
campoRecoTalla.value = '162';
campoRecoPeso.value = '-5';
campoRecoPeso.despachar('change');
botonCalcular.despachar('click');
afirmar(notaValidacionEl.textContent.indexOf('Peso') !== -1 && notaValidacionEl.textContent.indexOf('Talla') === -1,
  'con Talla ya corregida y Peso en -5, la nota de validación debe señalar solo Peso, sin arrastrar el mensaje anterior de Talla, mostró "' + notaValidacionEl.textContent + '"');
afirmar(campoRecoTalla.style.borderColor === '',
  'al corregir Talla, su marca de invalidez debe retirarse aunque otro campo (Peso) siga inválido');
afirmar(campoRecoPeso.style.borderColor === 'var(--delta-bad)',
  'el campo Peso con valor negativo debe marcarse inválido (prod-4)');

// Corrige el último campo: Calcular vuelve a recalcular con normalidad y
// limpia toda marca/nota de validación.
campoRecoPeso.value = '90';
campoRecoPeso.despachar('change');
botonCalcular.despachar('click');
afirmar(notaValidacionEl.textContent === '',
  'al corregir el último campo inválido y Calcular de nuevo, la nota de validación debe vaciarse');
afirmar(campoRecoPeso.style.borderColor === '' && campoRecoTalla.style.borderColor === '',
  'al recalcular con éxito, ningún campo debe seguir marcado en var(--delta-bad)');
afirmar(!campoRecoPeso.hasAttribute('aria-invalid') && !campoRecoTalla.hasAttribute('aria-invalid'),
  'al recalcular con éxito, aria-invalid debe retirarse de los campos ya corregidos');
afirmar(statsNecesidades[0].consultarUno('.hz-stat-num').textContent === tmbAntesDeInvalido,
  'tras corregir Talla/Peso de vuelta a 162/90 (los mismos valores del último cálculo válido) y Calcular, el TMB debe reproducir el mismo resultado ("' + tmbAntesDeInvalido + '")');

// ---------------------------------------------------------------------
// 4. Vista "Suplementos": monta contra TestDOM, sin lanzar
// ---------------------------------------------------------------------
var rootSup = doc.createElement('div');
afirmar((function () {
  try { registrosCapturados.suplementos(rootSup); return true; }
  catch (e) { console.error(e); return false; }
})(), 'Herzon.Views.suplementos (vía registerView) debe montar sin lanzar contra el TestDOM');

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
afirmar(tablasSup.length === 3,
  'la vista Suplementos debe tener 3 tablas: barras (Ver tabla), heatmap (Ver tabla) y régimen, tiene ' + tablasSup.length);

// R6 (jera-1/data-3/fini-1/resp-1): la card del régimen lleva
// data-ancho="completo" (regla de T-026: .hz-grid > [data-ancho="completo"]
// { grid-column: 1/-1 }) para que sus 5 columnas quepan a 1240px sin
// recortar Horario/Momento/Propósito fuera del viewport.
var cardRegimenSup = rootSup.consultarTodo('.hz-card').filter(function (c) {
  var t = c.consultarUno('.hz-card-title');
  return !!t && t.textContent === 'Régimen de suplementos';
})[0];
afirmar(!!cardRegimenSup, 'debe existir la card "Régimen de suplementos"');
afirmar(!!cardRegimenSup && cardRegimenSup.getAttribute('data-ancho') === 'completo',
  'la card "Régimen de suplementos" debe llevar data-ancho="completo" (jera-1/data-3/fini-1/resp-1)');

// R9 (LY-05): el régimen pasa a ser la ÚLTIMA card montada (fila 2, antes
// era la segunda), así que su tabla ya NO es tablasSup[0] -- se ubica por
// pertenencia a cardRegimenSup, no por índice de montaje.
var tablaRegimen = cardRegimenSup.consultarTodo('.hz-table')[0];
afirmar(!!tablaRegimen, 'la card "Régimen de suplementos" debe contener su propia .hz-table');
var filasRegimen = tablaRegimen.consultarTodo('tbody')[0].consultarTodo('tr');
afirmar(filasRegimen.length === nSuplementos,
  'la tabla de régimen debe tener exactamente ' + nSuplementos + ' filas (una por suplemento), tiene ' + filasRegimen.length);

var columnasEncabezadoRegimen = tablaRegimen.consultarTodo('thead')[0].consultarTodo('th').map(function (th) { return th.textContent; });
afirmar(columnasEncabezadoRegimen.length === 5 &&
  columnasEncabezadoRegimen[0] === 'Suplemento' && columnasEncabezadoRegimen[1] === 'Dosis' &&
  columnasEncabezadoRegimen[2] === 'Horario' && columnasEncabezadoRegimen[3] === 'Momento' &&
  columnasEncabezadoRegimen[4] === 'Propósito',
  'la tabla de régimen debe tener las 5 columnas visibles, en orden Suplemento/Dosis/Horario/Momento/Propósito, obtuvo ' + columnasEncabezadoRegimen.join(','));

// R9 (LY-05, decisión C4): reparto fila 1 = héroe(1) + barras con rótulos
// cortos(1) + heatmap transpuesto data-ancho="doble"(2) = 4 pistas exactas;
// fila 2 = régimen data-ancho="completo". Se verifica por título de card (no
// por índice) porque el orden de montaje ya no coincide 1:1 con el orden de
// .hz-table (las tablas "Ver tabla" de barras/heatmap preceden a la de
// régimen, que ahora se monta al final).
var gridSup = rootSup.consultarTodo('.hz-grid')[0];
afirmar(!!gridSup && gridSup.children.length === 4,
  'R9 (LY-05): el grid de Suplementos debe tener exactamente 4 cards (héroe, barras, heatmap, régimen)');
function buscarCardPorTitulo(raizGrid, tituloExacto) {
  return raizGrid.children.filter(function (c) {
    var t = c.consultarUno && c.consultarUno('.hz-card-title');
    return !!t && t.textContent === tituloExacto;
  })[0];
}
var cardHeroSup = buscarCardPorTitulo(gridSup, 'Suplementos');
var cardAdherenciaSupCard = buscarCardPorTitulo(gridSup, 'Adherencia por suplemento');
var cardAdherenciaTiempoSup = buscarCardPorTitulo(gridSup, 'Adherencia diaria a suplementos en el tiempo');
afirmar(!!cardHeroSup && !!cardAdherenciaSupCard && !!cardAdherenciaTiempoSup,
  'deben existir las cards "Suplementos" (héroe), "Adherencia por suplemento" y "Adherencia diaria a suplementos en el tiempo"');
afirmar(!cardHeroSup.getAttribute('data-ancho'),
  'R9 (LY-05): la card héroe de Suplementos debe ocupar 1 pista (sin data-ancho)');
afirmar(!cardAdherenciaSupCard.getAttribute('data-ancho'),
  'R9 (LY-05/C3): la card "Adherencia por suplemento" debe ocupar 1 pista (sin data-ancho) -- los rótulos cortos la hacen legible a ese ancho');
afirmar(cardAdherenciaTiempoSup.getAttribute('data-ancho') === 'doble',
  'R9 (DV-05/C4): la card "Adherencia diaria a suplementos en el tiempo" debe llevar data-ancho="doble"');
afirmar(gridSup.children.indexOf(cardHeroSup) === 0 &&
  gridSup.children.indexOf(cardAdherenciaSupCard) === 1 &&
  gridSup.children.indexOf(cardAdherenciaTiempoSup) === 2 &&
  gridSup.children.indexOf(cardRegimenSup) === 3,
  'R9 (LY-05): el orden vertical del grid debe ser héroe, barras, heatmap, régimen');

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
// 4.bis (T-032, Adendum R6 punto 2; hallazgos jera-5/data-5/data-6 de
// T-031): las opciones de Charts.heatmapCalendario y Charts.barras que
// T-027 implementó y verificó en build/charts.js deben aparecer CABLEADAS
// en sus únicos call sites reales de esta vista, tanto en el código fuente
// (estructural) como en el DOM que efectivamente renderizan.
// ---------------------------------------------------------------------
function extraerLlamada(fuente, marcadorInicio) {
  var inicio = fuente.indexOf(marcadorInicio);
  if (inicio === -1) return '';
  var resto = fuente.slice(inicio);
  // R9: la profundidad de indentación de los call sites cambió (montarVistaPlan/
  // montarVistaSuplementos ganaron una render() interna para la reactividad
  // multi-cliente de MC-07/MC-02), así que el cierre "});" ya no vive a un
  // ancho fijo de indentación -- se busca por patrón, no por 4 espacios
  // literales, para no volver a romperse con el próximo nivel de anidado.
  var cierre = /\n[ \t]*\}\);/.exec(resto);
  if (!cierre) return '';
  return resto.slice(0, cierre.index);
}

// -- Estructural: las opciones nuevas aparecen en el texto de cada llamada.
var llamadaBarrasAdherenciaSup = extraerLlamada(fuenteVista, 'Charts.barras(contAdherenciaSup');
afirmar(llamadaBarrasAdherenciaSup.length > 0,
  'debe existir la llamada Charts.barras(contAdherenciaSup...) ("Adherencia por suplemento") en el código fuente');
afirmar(/unidad\s*:\s*'%'/.test(llamadaBarrasAdherenciaSup),
  'la llamada Charts.barras de "Adherencia por suplemento" debe pasar unidad: \'%\' (data-6, Adendum R6 punto 2)');
afirmar(/valoresEnBarras\s*:\s*true/.test(llamadaBarrasAdherenciaSup),
  'la llamada Charts.barras de "Adherencia por suplemento" debe pasar valoresEnBarras: true (data-6, Adendum R6 punto 2)');

var llamadaHeatmapAdherenciaTiempo = extraerLlamada(fuenteVista, 'Charts.heatmapCalendario(contAdherenciaTiempo');
afirmar(llamadaHeatmapAdherenciaTiempo.length > 0,
  'debe existir la llamada Charts.heatmapCalendario(contAdherenciaTiempo...) en el código fuente');
// R9 (DV-05, decisión C4): heatmap TRANSPUESTO -- el tiempo corre a lo largo
// del eje x (semanas en columnas), no hacia abajo. encabezadosDia (días como
// columnas) queda RETIRADO de esta llamada; encabezadosColumna toma su lugar
// para rotular S1/S4/S8/S12 sobre las 12 columnas de semana, y etiquetasFila
// pasa a nombrar los 7 días (L a D) como filas.
afirmar(!/encabezadosDia\s*:/.test(llamadaHeatmapAdherenciaTiempo),
  'R9 (DV-05): la llamada Charts.heatmapCalendario de adherencia diaria transpuesta NO debe pasar encabezadosDia (los días ya no son columnas, son filas)');
afirmar(/encabezadosColumna\s*:/.test(llamadaHeatmapAdherenciaTiempo),
  'R9 (DV-05): la llamada Charts.heatmapCalendario de adherencia diaria debe pasar encabezadosColumna (S1/S4/S8/S12 sobre las semanas)');
afirmar(/etiquetasFila\s*:/.test(llamadaHeatmapAdherenciaTiempo),
  'la llamada Charts.heatmapCalendario de adherencia diaria debe pasar etiquetasFila (jera-5/data-5, Adendum R6 punto 2; R9: ahora L a D)');
afirmar(/columnas\s*:\s*semanasHeatmap/.test(llamadaHeatmapAdherenciaTiempo),
  'R9 (DV-05): la llamada debe pasar columnas: semanasHeatmap (12 semanas en x tras la transposición)');
afirmar(/leyendaRampa\s*:\s*true/.test(llamadaHeatmapAdherenciaTiempo),
  'la llamada Charts.heatmapCalendario de adherencia diaria debe pasar leyendaRampa: true (jera-5/data-5, Adendum R6 punto 2)');

// -- DOM (TestDOM): el heatmap transpuesto realmente monta 12 columnas (S1,
//    S4, S8, S12 visibles, el resto vacío), 7 filas L-D y la leyenda de 5
//    swatches. encabezadosDia ya no se pasa, así que .hz-heat-encabezado-dia
//    debe estar AUSENTE del DOM (no-regresión: si reapareciera significaría
//    que la opción vieja sigue activa junto con la nueva).
var encabezadosDiaSup = contHeatmap.consultarTodo('.hz-heat-encabezado-dia');
afirmar(encabezadosDiaSup.length === 0,
  'R9 (DV-05): el heatmap transpuesto NO debe emitir .hz-heat-encabezado-dia (encabezadosDia retirado), encontró ' + encabezadosDiaSup.length);

var encabezadosColumnaSup = contHeatmap.consultarTodo('.hz-heat-encabezado-columna');
afirmar(encabezadosColumnaSup.length === 4,
  'R9 (DV-05): el heatmap transpuesto debe emitir exactamente 4 encabezados de columna no vacíos (S1, S4, S8, S12 de las 12 semanas), encontró ' + encabezadosColumnaSup.length);
var textosColumnaSup = encabezadosColumnaSup.map(function (e) { return e.textContent; }).sort();
afirmar(textosColumnaSup.join(',') === 'S1,S12,S4,S8',
  'los encabezados de columna del heatmap deben ser exactamente S1, S4, S8, S12, encontró ' + textosColumnaSup.join(', '));

var etiquetasFilaSup = contHeatmap.consultarTodo('.hz-heat-fila-etiqueta');
afirmar(etiquetasFilaSup.length === 7,
  'R9 (DV-05): el heatmap transpuesto debe emitir exactamente 7 etiquetas de fila (L, M, X, J, V, S, D -- un día por fila), encontró ' + etiquetasFilaSup.length);
var textosFilaSup = etiquetasFilaSup.map(function (e) { return e.textContent; });
afirmar(textosFilaSup.join(',') === 'L,M,X,J,V,S,D',
  'las etiquetas de fila del heatmap transpuesto deben ser exactamente L, M, X, J, V, S, D en ese orden, encontró ' + textosFilaSup.join(', '));

// R9 (DV-05/LY-05/C4): la card del heatmap transpuesto lleva data-ancho="doble"
// (~570px) para que sus 12 columnas tengan celda digna.
afirmar(cardAdherenciaTiempoSup.getAttribute('data-ancho') === 'doble',
  'R9 (DV-05/C4): la card "Adherencia diaria a suplementos en el tiempo" debe llevar data-ancho="doble"');

var leyendaHeatmapSup = contHeatmap.consultarTodo('.hz-legend')[0];
afirmar(!!leyendaHeatmapSup, 'el heatmap de adherencia diaria debe emitir una .hz-legend (leyendaRampa)');
var itemsLeyendaHeatmapSup = leyendaHeatmapSup ? leyendaHeatmapSup.consultarTodo('.hz-legend-item') : [];
afirmar(itemsLeyendaHeatmapSup.length === 5,
  'la leyenda del heatmap debe tener exactamente 5 swatches (uno por bucket --heat-1..5), encontró ' + itemsLeyendaHeatmapSup.length);
afirmar(!!itemsLeyendaHeatmapSup[0] && itemsLeyendaHeatmapSup[0].textContent === '0-20',
  'el primer swatch de la leyenda del heatmap debe cubrir el rango 0-20 (min=0, max=100 de la adherencia diaria)');
afirmar(!!itemsLeyendaHeatmapSup[4] && itemsLeyendaHeatmapSup[4].textContent === '80-100',
  'el último swatch de la leyenda del heatmap debe cubrir el rango 80-100 (min=0, max=100 de la adherencia diaria)');

// -- DOM (TestDOM): la gráfica de barras muestra un valor con unidad "%"
//    al final de CADA una de las barras (no solo la máxima).
var etiquetasValorBarrasSup = contAdherenciaSup.consultarTodo('.hz-etiqueta-valor');
afirmar(etiquetasValorBarrasSup.length === nSuplementos,
  'la gráfica de adherencia por suplemento debe mostrar una etiqueta de valor por cada uno de los ' + nSuplementos + ' suplementos (valoresEnBarras), encontró ' + etiquetasValorBarrasSup.length);
var todasEtiquetasValorConPorcentaje = etiquetasValorBarrasSup.every(function (e) { return /%$/.test(e.textContent); });
afirmar(todasEtiquetasValorConPorcentaje,
  'cada etiqueta de valor de la gráfica de adherencia por suplemento debe terminar en "%" (opciones.unidad)');

// R9 (LY-05, decisión C3, final): "Adherencia por suplemento" pasa
// categorías CORTAS de despliegue ('Omega-3', 'Vitamina D3', 'Magnesio',
// 'Probiótico') en vez del nombre completo con dosis -- caben sin truncar
// en el gutter a cualquier ancho de card, incluida 1 pista. El nombre
// completo con dosis se conserva en la tabla "Régimen de suplementos"
// (verificado más arriba, columna "Suplemento") Y TAMBIÉN en "Ver tabla" de
// esta misma gráfica: charts.js (resolverEspecTabla, charts.js:618-623)
// devuelve `opciones.tabla` TAL CUAL cuando trae columnas y filas completos
// -- opción ya existente, cero cambios a charts.js -- así que la llamada
// construye la espec de tabla a mano con s.nombre (completo) en vez de
// dejar que 'tabla: true' la derive de `categorias` (rótulo corto). Lo
// único que SÍ queda en rótulo corto, porque charts.js lo deriva de
// `categorias` sin una opción separada para texto completo (fuera del
// POSEE de T-041: requeriría una opción aditiva nueva en charts.js), es el
// aria-label/tooltip de cada barra.
var ETIQUETAS_CORTAS_ESPERADAS = ['Omega-3', 'Vitamina D3', 'Magnesio', 'Probiótico'];
var textosSvgAdherenciaSup = contAdherenciaSup.consultarTodo('text');
var etiquetasCategoriaCortaSup = textosSvgAdherenciaSup.filter(function (t) {
  return ETIQUETAS_CORTAS_ESPERADAS.indexOf(t.textContent) !== -1;
});
afirmar(etiquetasCategoriaCortaSup.length === 4,
  'R9 (LY-05/C3): deben aparecer las 4 categorías cortas exactas (Omega-3, Vitamina D3, Magnesio, Probiótico) como etiquetas de eje, encontró ' + etiquetasCategoriaCortaSup.length);
etiquetasCategoriaCortaSup.forEach(function (t) {
  afirmar(!t.hasAttribute('data-etiqueta-truncada'),
    'R9 (LY-05/C3): con rótulos cortos ninguna etiqueta de categoría debe truncarse en el gutter (data-etiqueta-truncada ausente)');
});
// Nombres completos que DIFIEREN de su rótulo corto (excluye 'Vitamina D3',
// cuyo nombre completo ya coincide con el corto -- no hay nada que truncar
// ni ocultar ahí, así que no puede formar parte de una aserción de ausencia).
var nombresCompletosConDosisSuplementos = HERZON_DATA.suplementos
  .map(function (s) { return s.nombre; })
  .filter(function (n) { return ETIQUETAS_CORTAS_ESPERADAS.indexOf(n) === -1; });
var ningunNombreCompletoEnEjeSup = textosSvgAdherenciaSup.every(function (t) {
  return nombresCompletosConDosisSuplementos.indexOf(t.textContent) === -1;
});
afirmar(ningunNombreCompletoEnEjeSup,
  'R9 (LY-05/C3): ningún nombre completo con dosis debe aparecer como etiqueta de eje de "Adherencia por suplemento" (solo la tabla de régimen lo conserva)');

// R9 (LY-05/C3, corrección post-verificación): "Ver tabla" de ESTA gráfica
// (contAdherenciaSup) debe mostrar el nombre COMPLETO con dosis en su
// columna "Suplemento" -- no el rótulo corto del eje -- porque la llamada
// ahora pasa una espec de tabla explícita (tabla: {columnas, filas} con
// s.nombre) en vez de dejar que 'tabla: true' la derive de `categorias`.
var tablaAdherenciaSup = contAdherenciaSup.consultarTodo('.hz-table')[0];
afirmar(!!tablaAdherenciaSup, 'la gráfica "Adherencia por suplemento" debe contener su propia .hz-table ("Ver tabla")');
var filasTablaAdherenciaSup = tablaAdherenciaSup ? tablaAdherenciaSup.consultarTodo('tbody')[0].consultarTodo('tr') : [];
afirmar(filasTablaAdherenciaSup.length === nSuplementos,
  'la tabla "Ver tabla" de "Adherencia por suplemento" debe tener exactamente ' + nSuplementos + ' filas (una por suplemento), tiene ' + filasTablaAdherenciaSup.length);
var nombresEnTablaAdherenciaSup = filasTablaAdherenciaSup.map(function (tr) {
  var th = tr.consultarTodo('th')[0];
  return th ? th.textContent : null;
});
var nombresCompletosEsperadosSup = HERZON_DATA.suplementos.map(function (s) { return s.nombre; });
afirmar(nombresEnTablaAdherenciaSup.join('|') === nombresCompletosEsperadosSup.join('|'),
  'R9 (LY-05/C3): la columna "Suplemento" de "Ver tabla" en "Adherencia por suplemento" debe mostrar el nombre COMPLETO con dosis de cada suplemento (no el rótulo corto del eje), encontró [' + nombresEnTablaAdherenciaSup.join(', ') + ']');
nombresEnTablaAdherenciaSup.forEach(function (n) {
  afirmar(ETIQUETAS_CORTAS_ESPERADAS.indexOf(n) === -1 || n === 'Vitamina D3',
    'R9 (LY-05/C3): ningún rótulo corto (salvo "Vitamina D3", que ya coincide con su nombre completo) debe aparecer en la columna "Suplemento" de "Ver tabla", encontró "' + n + '"');
});

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
// 6. Anti-regresión D1 (QA ronda 1): ninguna de estas palabras en español
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
  afirmar(!regexPalabra.test(fuenteVista), 'build/vista_dieta_supl.js contiene la palabra sin acento "' + palabra + '" (D1, QA ronda 1): revisar y corregir a español con acentos/eñe');
}

// ---------------------------------------------------------------------
// 7. R9 (Adendum R9 punto 3; MC-07; R8 punto 4 estados vacíos): reactividad
//    multi-cliente sobre las vistas YA MONTADAS (rootPlan/rootSup de las
//    secciones 3 y 4), contra el Herzon.Almacen REAL (T-045, no un mock) --
//    la misma vía que usa la app. Todo lo de arriba (secciones 1-6) corrió
//    en modo demo: es, en sí mismo, la línea base de no-regresión demo.
// ---------------------------------------------------------------------
var Almacen = Herzon.Almacen;
afirmar(!!Almacen && typeof Almacen.crearCliente === 'function' && typeof Almacen.guardarPlan === 'function',
  'Herzon.Almacen debe estar disponible con crearCliente/guardarPlan (T-045)');
afirmar(Almacen.modo() === 'demo',
  'antes de crear ningún cliente, Almacen debe seguir en modo demo (las secciones 1-6 son la línea base de no-regresión)');

var textoVacioPlanEsperado = (/var TEXTO_VACIO_PLAN = '([^']*)';/.exec(fuenteVista) || [])[1];
afirmar(!!textoVacioPlanEsperado, 'debe poder extraer TEXTO_VACIO_PLAN de la fuente (pin de literal, plan.md nota de PR-03/04/06)');
var textoVacioSuplementosEsperado = (/var TEXTO_VACIO_SUPLEMENTOS = '([^']*)';/.exec(fuenteVista) || [])[1];
afirmar(!!textoVacioSuplementosEsperado, 'debe poder extraer TEXTO_VACIO_SUPLEMENTOS de la fuente (pin de literal)');

function tituloCard(c) {
  var t = c.consultarUno('.hz-card-title');
  return t ? t.textContent : null;
}
function buscarCardPorTituloEn(raiz, titulo) {
  return raiz.consultarTodo('.hz-card').filter(function (c) { return tituloCard(c) === titulo; })[0];
}

// --- 7.1 Cliente 1: recién creado, SIN plantilla aplicada y SIN régimen de
//     suplementos -- ambas vistas deben caer en su estado vacío (R8 punto 4)
//     y el recomendador debe seguir SIEMPRE visible y funcional. ---
var perfilCliente1 = { nombre: 'Cliente Selfcheck Uno', sexo: 'femenino', edad: 30, talla_cm: 165, pesoInicial_kg: 60, actividad: 'ligero', objetivo: 'Recomposición corporal' };
var creacionCliente1 = Almacen.crearCliente(perfilCliente1);
afirmar(creacionCliente1.ok === true, 'Almacen.crearCliente(perfilCliente1) debe crear el primer cliente real sin errores: ' + JSON.stringify(creacionCliente1.errores || []));
var idCliente1 = creacionCliente1.id;
afirmar(Almacen.modo() === 'real', 'tras crearCliente, Almacen.modo() debe ser "real"');
afirmar(window.HERZON_DATA.planAplicado === null,
  'un cliente recién creado debe montar HERZON_DATA.planAplicado === null (sin plantilla aplicada aún)');

afirmar(!rootPlan.hasAttribute('data-plan-id'),
  'R8/MC-07: sin plantilla aplicada en modo real, la vista Plan debe RETIRAR data-plan-id de su raíz');
afirmar(rootPlan.consultarTodo('.hz-hero').length === 1,
  'regla 11: incluso en estado vacío, la vista Plan debe conservar EXACTAMENTE un .hz-hero');
afirmar(rootPlan.consultarTodo('.hz-hero')[0].consultarUno('.hz-hero-num').textContent === '—',
  'R8: el héroe del Plan sin plantilla aplicada debe mostrar "—" en vez de un número inventado');

var cardHeroPlanVacio = buscarCardPorTituloEn(rootPlan, 'Plan de dieta actual');
afirmar(!!cardHeroPlanVacio, 'debe existir la card "Plan de dieta actual" incluso en estado vacío');
var vaciosHeroPlan = cardHeroPlanVacio.consultarTodo('.hz-vacio');
afirmar(vaciosHeroPlan.length === 1 && !vaciosHeroPlan[0].hasAttribute('hidden') && vaciosHeroPlan[0].textContent === textoVacioPlanEsperado,
  'R8: la card héroe del Plan debe mostrar la nota .hz-vacio visible con TEXTO_VACIO_PLAN cuando no hay plantilla aplicada');

afirmar(gridsAnidadosGraficas[0].hasAttribute('hidden'),
  'R8/MC-07: sin plantilla aplicada, el grid anidado de "Gráficas del plan" debe quedar oculto (hidden)');
var vaciosGraficasPlan = cardGraficasPlan.consultarTodo('.hz-vacio');
afirmar(vaciosGraficasPlan.length === 1 && !vaciosGraficasPlan[0].hasAttribute('hidden') && vaciosGraficasPlan[0].textContent === textoVacioPlanEsperado,
  'R8: la card "Gráficas del plan" debe mostrar su propia nota .hz-vacio visible cuando no hay plantilla aplicada');

var listaMenuVacia = cardMenuDelDia.consultarTodo('.hz-menu-lista')[0];
afirmar(!!listaMenuVacia && listaMenuVacia.hasAttribute('hidden'),
  'R8/MC-07: sin plantilla aplicada, la lista del menú del día debe quedar oculta (hidden)');
var vaciosMenu = cardMenuDelDia.consultarTodo('.hz-vacio');
afirmar(vaciosMenu.length === 1 && !vaciosMenu[0].hasAttribute('hidden') && vaciosMenu[0].textContent === textoVacioPlanEsperado,
  'R8: la card "Menú del día" debe mostrar su propia nota .hz-vacio visible cuando no hay plantilla aplicada');

// El recomendador (#reco-plan) NUNCA se apaga por el estado vacío: sigue
// SIEMPRE visible y funcional (spec T-041), con las 5 plantillas rankeadas
// listas para elegir -- así el usuario tiene por dónde salir del vacío.
afirmar(rootPlan.consultarTodo('.hz-reco-panel').length === 1,
  'el recomendador (#reco-plan) debe seguir montado y visible incluso con la vista Plan en estado vacío');
var listaRankingVacio = contenedorReco.consultarTodo('.hz-reco-lista')[0];
afirmar(!!listaRankingVacio && listaRankingVacio.consultarTodo('.hz-reco-item').length === HERZON_DATA.planes.length,
  'con la vista Plan en estado vacío, el recomendador debe seguir mostrando el ranking completo de plantillas (' + HERZON_DATA.planes.length + ')');

var sinRegimenSup = window.HERZON_DATA.suplementos.length === 0;
afirmar(sinRegimenSup, 'un cliente recién creado debe montar suplementos: [] (sin régimen)');
afirmar(rootSup.getAttribute('data-suplementos-count') === '0',
  'R8: la vista Suplementos de un cliente sin régimen debe exponer data-suplementos-count="0"');
afirmar(rootSup.consultarTodo('.hz-hero').length === 1,
  'regla 11: incluso sin régimen, la vista Suplementos debe conservar EXACTAMENTE un .hz-hero');
afirmar(rootSup.consultarTodo('.hz-hero')[0].consultarUno('.hz-hero-num').textContent === '—',
  'R8: el héroe de Suplementos sin régimen debe mostrar "—" (0% de adherencia a 0 suplementos sería un dato falso)');
var vaciosSup = rootSup.consultarTodo('.hz-vacio');
afirmar(vaciosSup.length === 1 && vaciosSup[0].textContent === textoVacioSuplementosEsperado,
  'R8: la vista Suplementos sin régimen debe mostrar la nota .hz-vacio con TEXTO_VACIO_SUPLEMENTOS');
afirmar(rootSup.consultarTodo('.hz-chart').length === 0,
  'R8: sin régimen, la vista Suplementos no debe intentar dibujar ninguna gráfica (0 suplementos)');

// --- 7.2 MC-07: aplicar una plantilla en modo real debe invocar
//     Almacen.guardarPlan -- se verifica por EFECTO observable (no hay hook
//     de espía sin tocar el módulo bajo prueba): HERZON_DATA.planAplicado
//     queda fijado de inmediato Y sobrevive una recarga simulada
//     (Almacen.cargar() vuelve a leer el localStorage mock desde cero). ---
var listaRankingParaAplicar = contenedorReco.consultarTodo('.hz-reco-lista')[0].consultarTodo('.hz-reco-item');
afirmar(listaRankingParaAplicar.length === HERZON_DATA.planes.length, 'el ranking del cliente 1 debe listar las ' + HERZON_DATA.planes.length + ' plantillas');
var itemParaAplicarC1 = listaRankingParaAplicar[0];
var idPlanAplicadoC1 = itemParaAplicarC1.getAttribute('data-plan-id');
var botonUsarC1 = buscarPorAtributo(itemParaAplicarC1, 'data-accion', 'usar-plan');
afirmar(!!botonUsarC1 && !botonUsarC1.hasAttribute('disabled'), 'debe existir un botón "Usar este plan" habilitado en la primera fila del ranking del cliente 1');
botonUsarC1.despachar('click');

afirmar(window.HERZON_DATA.planAplicado !== null && window.HERZON_DATA.planAplicado.plantillaId === idPlanAplicadoC1,
  'R9 (MC-07): al aplicar una plantilla en modo real, HERZON_DATA.planAplicado debe reflejar la elección de inmediato (Almacen.guardarPlan)');
afirmar(rootPlan.hasAttribute('data-plan-id') && rootPlan.getAttribute('data-plan-id') === idPlanAplicadoC1,
  'tras aplicar la plantilla, la vista Plan debe salir del estado vacío y mostrar el plan recién aplicado');
afirmar(!gridsAnidadosGraficas[0].hasAttribute('hidden'),
  'tras aplicar una plantilla, el grid de "Gráficas del plan" debe dejar de estar oculto');

var reloadTrasAplicarC1 = Almacen.cargar();
afirmar(reloadTrasAplicarC1 === 'real' && window.HERZON_DATA.planAplicado && window.HERZON_DATA.planAplicado.plantillaId === idPlanAplicadoC1,
  'R9 (MC-07): el plan aplicado debe SOBREVIVIR una recarga simulada (Almacen.cargar() vuelve a leer el localStorage mock) -- prueba de persistencia real, no solo en memoria');

// --- 7.3 MC-07: un SEGUNDO cliente recién creado NO debe heredar el plan
//     del cliente 1 (cero contaminación cruzada); vuelve a caer en el
//     estado vacío por sí mismo. ---
var perfilCliente2 = { nombre: 'Cliente Selfcheck Dos', sexo: 'masculino', edad: 42, talla_cm: 178, pesoInicial_kg: 88, actividad: 'moderado', objetivo: 'Mantenimiento' };
var creacionCliente2 = Almacen.crearCliente(perfilCliente2);
afirmar(creacionCliente2.ok === true, 'Almacen.crearCliente(perfilCliente2) debe crear el segundo cliente real sin errores: ' + JSON.stringify(creacionCliente2.errores || []));
var idCliente2 = creacionCliente2.id;
afirmar(idCliente2 !== idCliente1, 'el segundo cliente debe tener un id distinto al primero');
afirmar(window.HERZON_DATA.planAplicado === null,
  'R9 (MC-07): el cliente 2, recién creado, debe montar planAplicado === null -- el plan del cliente 1 NO debe filtrarse aquí (cero contaminación cruzada)');
afirmar(!rootPlan.hasAttribute('data-plan-id'),
  'R9 (MC-07): al remontar sobre el cliente 2 (sin plan propio), la vista Plan YA MONTADA debe volver a caer en su estado vacío vía herzon:modo-cambiado, sin necesitar un remount completo');
afirmar(gridsAnidadosGraficas[0].hasAttribute('hidden'), 'el grid de "Gráficas del plan" debe volver a ocultarse para el cliente 2 (sin plan propio)');
afirmar(rootSup.getAttribute('data-suplementos-count') === '0', 'el cliente 2 (sin régimen propio) también debe caer en el estado vacío de Suplementos');

// --- 7.4 MC-07: volver a seleccionar al cliente 1 debe PRECARGAR su plan ya
//     aplicado automáticamente (HERZON_DATA.planAplicado -> planIdSeleccionado),
//     sin que el usuario tenga que volver a elegir nada en el recomendador. ---
Almacen.seleccionarCliente(idCliente1);
afirmar(Almacen.clienteActivo() && Almacen.clienteActivo().id === idCliente1, 'Almacen.seleccionarCliente(idCliente1) debe montar de nuevo al cliente 1');
afirmar(window.HERZON_DATA.planAplicado && window.HERZON_DATA.planAplicado.plantillaId === idPlanAplicadoC1,
  'al remontar el cliente 1, HERZON_DATA.planAplicado debe seguir siendo el plan que aplicó antes');
afirmar(rootPlan.getAttribute('data-plan-id') === idPlanAplicadoC1,
  'R9 (MC-07): al remontar el cliente 1, la vista Plan debe PRECARGAR automáticamente su plan ya aplicado (data-plan-id), sin estado vacío y sin click adicional');
var listaRankingC1DeVuelta = contenedorReco.consultarTodo('.hz-reco-lista')[0].consultarTodo('.hz-reco-item');
var itemAplicadoC1DeVuelta = listaRankingC1DeVuelta.filter(function (it) { return it.getAttribute('data-plan-id') === idPlanAplicadoC1; })[0];
afirmar(!!itemAplicadoC1DeVuelta && itemAplicadoC1DeVuelta.getAttribute('data-seleccionado') === 'true',
  'R9 (MC-07): al remontar el cliente 1, su fila en el ranking del recomendador debe reaparecer marcada data-seleccionado="true" (precarga desde planAplicado)');

// --- 7.5 No-regresión demo: volver a demo no debe dejar rastro del modo
//     real -- el plan automático (ranking por defecto) vuelve a gobernar, y
//     el badge/­selector de Almacen no forman parte del alcance de este
//     módulo (T-041 solo posee vista_dieta_supl.js/selfcheck_vistas_a.js). ---
Almacen.volverADemo();
afirmar(Almacen.modo() === 'demo', 'Almacen.volverADemo() debe restaurar el modo demo');
afirmar(window.HERZON_DATA.planAplicado === undefined,
  'en modo demo, HERZON_DATA (el catálogo sintético) no debe exponer planAplicado (clave ADITIVA exclusiva de clientes reales)');
afirmar(!!rootPlan.getAttribute('data-plan-id'),
  'R9 (MC-07): de vuelta en demo, la vista Plan debe volver a resolver un plan por el ranking automático (data-plan-id presente, sin estado vacío) -- comportamiento demo intacto');
afirmar(rootSup.getAttribute('data-suplementos-count') === String(HERZON_DATA.suplementos.length),
  'R9: de vuelta en demo, la vista Suplementos debe volver a mostrar el régimen sintético completo (' + HERZON_DATA.suplementos.length + ' suplementos), sin rastro de los clientes reales de esta sección');

// ---------------------------------------------------------------------
console.log('checks ejecutados: ' + contador);
process.exit(0);
