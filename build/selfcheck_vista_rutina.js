// build/selfcheck_vista_rutina.js
// Selfcheck de node puro (sin dependencias externas) para
// build/vista_rutina.js. Formato de salida congelado en plan.md 3.J: última
// línea de stdout literal "checks ejecutados: N"; exit 0 solo si todas las
// aserciones pasan; en fallo, exit 1 e imprime la aserción fallida (P-025).
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

var REGEX_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/u;

// ---------------------------------------------------------------------
// Mock de addEventListener/dispatchEvent EN MEMORIA (mismo patrón que
// build/selfcheck_vistas_a.js/build/selfcheck_almacen.js): build/almacen.js
// usa G.dispatchEvent + `new CustomEvent(...)` para notificar
// herzon:modo-cambiado, y build/vista_rutina.js (R-05.6, MC-07) usa
// G.addEventListener para escucharlo. Node trae CustomEvent global desde
// v18/19, pero NO trae addEventListener/dispatchEvent en globalThis -- sin
// este mock, el listener del módulo nunca se registra ni se dispara.
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

// Mock de localStorage EN MEMORIA (mismo patrón que build/selfcheck_vistas_a.js).
function crearLocalStorageMock() {
  var almacen = {};
  return {
    getItem: function (clave) { return Object.prototype.hasOwnProperty.call(almacen, clave) ? almacen[clave] : null; },
    setItem: function (clave, valor) { almacen[clave] = String(valor); },
    removeItem: function (clave) { delete almacen[clave]; }
  };
}

// Búsqueda recursiva por atributo id (build/testdom.js no implementa
// getElementById/querySelector; mismo patrón buscarHijoPorId/buscarPorId de
// build/vista_metricas.js y build/selfcheck_vistas_b.js).
function buscarPorId(raiz, id) {
  if (raiz.getAttribute && raiz.getAttribute('id') === id) { return raiz; }
  var hijos = raiz.children || [];
  for (var i = 0; i < hijos.length; i++) {
    var encontrado = buscarPorId(hijos[i], id);
    if (encontrado) { return encontrado; }
  }
  return null;
}

// ---------------------------------------------------------------------
// 0. Carga del módulo: DOM headless antes de require (plan.md 3.A), stub de
//    Herzon.registerView que captura los registros (mismo patrón que
//    build/selfcheck_vistas_a.js) y orden de inyección real R10 (C-5):
//    data -> almacen -> documentos (build/documentos.js NO se toca en esta
//    ronda, C-7 -- se require solo para consumir sus funciones YA
//    publicadas contra las que este módulo codifica: descargarArchivo y
//    nombreArchivoExportable).
// ---------------------------------------------------------------------
globalThis.window = globalThis;
instalarBusDeEventos();
globalThis.localStorage = crearLocalStorageMock();

var TESTDOM_PATH = path.join(__dirname, 'testdom.js');
var DATA_PATH = path.join(__dirname, 'data.js');
var ALMACEN_PATH = path.join(__dirname, 'almacen.js');
var DOCS_PATH = path.join(__dirname, 'documentos.js');
var VISTA_PATH = path.join(__dirname, 'vista_rutina.js');

require(TESTDOM_PATH);
require(DATA_PATH);
require(ALMACEN_PATH);
require(DOCS_PATH);

// Referencia ESTABLE al Almacén real: build/almacen.js es un IIFE de
// navegador (sin module.exports) -- una vez ejecutado, volver a
// `require()` no lo re-ejecuta. Si más abajo se hace
// `Herzon.Almacen = undefined` (para simular demo/sin-Almacén) o
// `Herzon.Almacen = {...}` (mock de espía), esta referencia es la única
// forma de recuperar el módulo real para las secciones siguientes (mismo
// patrón `almacenReal` de build/selfcheck_vistas_b.js).
var AlmacenReal = globalThis.Herzon.Almacen;

var registrosCapturados = {};
Herzon.registerView = function (id, mountFn) { registrosCapturados[id] = mountFn; };

require(VISTA_PATH);

var fuenteVista = fs.readFileSync(VISTA_PATH, 'utf8');
var TestDOM = Herzon.TestDOM;
var Vistas = Herzon.Views;
var Rutina = Vistas.rutinaInterno;
var Docs = Herzon.Docs;

// =========================================================================
// 1. Namespace y forma de la API (R-08.1: registro doble + funciones puras
//    expuestas para prueba).
// =========================================================================
afirmar(typeof Vistas.rutina === 'function', 'Herzon.Views.rutina debe ser una función (montarVistaRutina)');
afirmar(registrosCapturados.rutina === Vistas.rutina, 'Herzon.registerView("rutina", montarVistaRutina) debe registrar EXACTAMENTE la misma función que Herzon.Views.rutina');
afirmar(typeof Rutina === 'object' && Rutina !== null, 'Herzon.Views.rutinaInterno debe existir como objeto');
afirmar(typeof Rutina.renderDocumentoRutina === 'function', 'rutinaInterno.renderDocumentoRutina debe ser una función');
afirmar(typeof Rutina.generarHtmlRutinaDescargable === 'function', 'rutinaInterno.generarHtmlRutinaDescargable debe ser una función');
afirmar(typeof Rutina.validarBorrador === 'function', 'rutinaInterno.validarBorrador debe ser una función');
afirmar(typeof globalThis.document === 'undefined', 'este selfcheck no debe tener document real global (mismo patrón que los demás selfchecks de node)');

// =========================================================================
// 2. validarBorrador: función PURA (R-06.2), los 5 casos de rechazo del
//    contrato + un caso válido de control + espía que confirma que NUNCA
//    invoca Almacen.guardarRutina (R-08.3).
// =========================================================================
var llamadasGuardarRutinaEspia = 0;
Herzon.Almacen = {
  modo: function () { return 'real'; },
  guardarRutina: function () { llamadasGuardarRutinaEspia += 1; return true; }
};

function ejercicioValido(extra) {
  var base = { nombre: 'Sentadilla', series: '4', repeticiones: '10-12', descanso: '90', notas: '' };
  for (var k in (extra || {})) { base[k] = extra[k]; }
  return base;
}

var casoNombreVacio = Rutina.validarBorrador([{ titulo: '', ejercicios: [ejercicioValido({ nombre: '' })] }]);
afirmar(casoNombreVacio.valido === false, 'validarBorrador debe rechazar nombre de ejercicio vacío');
afirmar(casoNombreVacio.invalidos.some(function (inv) { return inv.campo === 'nombre'; }), 'el rechazo por nombre vacío debe marcar el campo "nombre" en invalidos');

var casoSeriesCero = Rutina.validarBorrador([{ titulo: '', ejercicios: [ejercicioValido({ series: '0' })] }]);
afirmar(casoSeriesCero.valido === false, 'validarBorrador debe rechazar series = 0 (fuera de 1..10)');
afirmar(casoSeriesCero.invalidos.some(function (inv) { return inv.campo === 'series'; }), 'el rechazo por series=0 debe marcar el campo "series"');

var casoSeriesOnce = Rutina.validarBorrador([{ titulo: '', ejercicios: [ejercicioValido({ series: '11' })] }]);
afirmar(casoSeriesOnce.valido === false, 'validarBorrador debe rechazar series = 11 (fuera de 1..10)');
afirmar(casoSeriesOnce.invalidos.some(function (inv) { return inv.campo === 'series'; }), 'el rechazo por series=11 debe marcar el campo "series"');

var casoDescanso700 = Rutina.validarBorrador([{ titulo: '', ejercicios: [ejercicioValido({ descanso: '700' })] }]);
afirmar(casoDescanso700.valido === false, 'validarBorrador debe rechazar descanso_s = 700 (fuera de 0..600)');
afirmar(casoDescanso700.invalidos.some(function (inv) { return inv.campo === 'descanso'; }), 'el rechazo por descanso=700 debe marcar el campo "descanso"');

var casoSinDias = Rutina.validarBorrador([]);
afirmar(casoSinDias.valido === false, 'validarBorrador debe rechazar un borrador sin días');

var casoDescansoVacioValido = Rutina.validarBorrador([{ titulo: 'Piernas', ejercicios: [ejercicioValido({ descanso: '' })] }]);
afirmar(casoDescansoVacioValido.valido === true, 'descanso_s vacío es válido (acondicionamiento sin descanso prescrito, R-02)');

var casoValido = Rutina.validarBorrador([{ titulo: 'Piernas', ejercicios: [ejercicioValido()] }]);
afirmar(casoValido.valido === true, 'un borrador con todos los campos correctos debe ser válido (caso de control)');
afirmar(casoValido.errores.length === 0, 'un borrador válido no debe traer errores');

afirmar(llamadasGuardarRutinaEspia === 0, 'validarBorrador es una función PURA: nunca debe invocar Almacen.guardarRutina, ni en los 5 rechazos ni en los casos válidos (espía)');

Herzon.Almacen = undefined;

// =========================================================================
// 3. Demo (R-08.3): 1 hz-hero, 4 cards de día, data-rutina-dias="4", editor
//    AUSENTE, nota TEXTO_DEMO_RUTINA presente, herramientas de documento
//    habilitadas (la demo siempre trae rutina).
// =========================================================================
var TEXTO_DEMO_RUTINA_ESPERADO = 'En modo demo la rutina es un ejemplo de solo lectura; con el botón Usar mis datos puedes prescribir y guardar la rutina de cada cliente.';
var TEXTO_VACIO_RUTINA_ESPERADO = 'Aún no hay una rutina prescrita para este cliente. Ármala con el editor de abajo para poder imprimirla.';

var docDemo = TestDOM.crearDocumento();
var rootDemo = docDemo.createElement('section');
rootDemo.setAttribute('id', 'vista-rutina');
Vistas.rutina(rootDemo);

afirmar(rootDemo.consultarTodo('.hz-hero').length === 1, 'demo: la vista Rutina debe pintar exactamente UN .hz-hero (regla 11)');
var gridDiasDemo = rootDemo.consultarTodo('.hz-grid-pares');
afirmar(gridDiasDemo.length === 1, 'demo: debe existir exactamente un grid .hz-grid-pares de días');
var cardsDiaDemo = gridDiasDemo[0].consultarTodo('.hz-card');
afirmar(cardsDiaDemo.length === 4, 'demo: la rutina de Daniela (R-04) trae 4 días -- deben pintarse 4 cards de día');
afirmar(rootDemo.getAttribute('data-rutina-dias') === '4', 'demo: data-rutina-dias debe ser "4" (QA)');
afirmar(buscarPorId(rootDemo, 'hz-rutina-editor') === null, 'demo: el editor #hz-rutina-editor debe estar AUSENTE (R-06: solo modo real)');
var notasDemo = rootDemo.consultarTodo('.hz-nota').map(function (n) { return n.textContent; });
afirmar(notasDemo.indexOf(TEXTO_DEMO_RUTINA_ESPERADO) !== -1, 'demo: debe aparecer la nota TEXTO_DEMO_RUTINA exacta (C-10)');
afirmar(notasDemo.some(function (t) { return t.indexOf('Actualizada: ') === 0; }), 'demo: debe aparecer la nota "Actualizada: <fecha>" (rutina.actualizado)');

var botonImprimirDemo = buscarPorId(rootDemo, 'hz-btn-imprimir-rutina');
var botonDescargarDemo = buscarPorId(rootDemo, 'hz-btn-descargar-rutina');
afirmar(botonImprimirDemo !== null && botonImprimirDemo.textContent === 'Imprimir / PDF' && botonImprimirDemo.classList.contains('hz-doc-btn'), 'demo: botón imprimir con texto e id exactos, clase hz-doc-btn');
afirmar(botonDescargarDemo !== null && botonDescargarDemo.textContent === 'Descargar rutina (.html)' && botonDescargarDemo.classList.contains('hz-doc-btn'), 'demo: botón descargar con texto e id exactos, clase hz-doc-btn');
afirmar(botonImprimirDemo.getAttribute('disabled') === null && botonDescargarDemo.getAttribute('disabled') === null, 'demo: con rutina siempre presente, ambos botones deben estar habilitados');

var itemsDemo = rootDemo.consultarTodo('.hz-rutina-item');
afirmar(itemsDemo.length === 20, 'demo: 5+6+5+4 = 20 ejercicios en total (R-04) deben producir 20 .hz-rutina-item');
afirmar(rootDemo.consultarTodo('.hz-rutina-descanso').length === 16, 'demo: 16 de los 20 ejercicios traen descanso_s no nulo (día 4 completo trae null) -- deben pintarse exactamente 16 .hz-rutina-descanso');
var primerItemDemo = itemsDemo[0];
afirmar(primerItemDemo.consultarUno('.hz-rutina-nombre').textContent === 'Sentadilla goblet con mancuerna', 'demo: primer ejercicio del día 1 debe coincidir con R-04 (nombre exacto)');
afirmar(primerItemDemo.consultarUno('.hz-rutina-dosis').textContent === '4 x 10-12', 'demo: la dosis debe formatearse como "series x repeticiones" literal');
afirmar(primerItemDemo.consultarUno('.hz-rutina-descanso').textContent === 'descanso 90 s', 'demo: el descanso debe formatearse como "descanso <n> s"');

// R-05.6: remontaje ante herzon:modo-cambiado sobre la MISMA vista ya
// montada (patrón manejarRemontajeDatos copiado de vista_dieta_supl.js) --
// se dispara sin cambiar de modo (sigue en demo) solo para confirmar que el
// listener re-invoca render() sin lanzar y sin duplicar el hz-hero.
globalThis.dispatchEvent({ type: 'herzon:modo-cambiado', detail: { modo: 'demo', clienteId: null } });
afirmar(rootDemo.consultarTodo('.hz-hero').length === 1, 'tras herzon:modo-cambiado, la vista remontada debe seguir con exactamente UN .hz-hero (sin duplicar nodos)');

// =========================================================================
// 4. Real, sin rutina (R-08.3): TEXTO_VACIO_RUTINA exacto, editor PRESENTE
//    (aunque vacío -- así se prescribe la primera rutina), data-rutina-dias
//    = "0", herramientas de documento deshabilitadas.
// =========================================================================
Herzon.Almacen = AlmacenReal;
AlmacenReal.borrarTodo();
var resCliente = AlmacenReal.crearCliente({
  nombre: 'Cliente De Prueba Rutina', sexo: 'femenino', edad: 30, talla_cm: 165,
  pesoInicial_kg: 60, actividad: 'moderado', objetivo: 'Salud general'
});
afirmar(resCliente.ok === true, 'fixture: crearCliente debe funcionar para preparar el escenario real (setup, no es un check del contrato)');
afirmar(AlmacenReal.modo() === 'real', 'fixture: tras crearCliente, Almacen.modo() debe ser "real"');

var docReal = TestDOM.crearDocumento();
var rootReal = docReal.createElement('section');
rootReal.setAttribute('id', 'vista-rutina');
Vistas.rutina(rootReal);

var vaciosReal = rootReal.consultarTodo('.hz-vacio');
afirmar(vaciosReal.length === 1 && vaciosReal[0].textContent === TEXTO_VACIO_RUTINA_ESPERADO, 'real sin rutina: debe pintar exactamente un p.hz-vacio con el texto EXACTO TEXTO_VACIO_RUTINA (R-05.4)');
afirmar(rootReal.getAttribute('data-rutina-dias') === '0', 'real sin rutina: data-rutina-dias debe ser "0"');
afirmar(rootReal.consultarTodo('.hz-grid-pares').length === 0, 'real sin rutina: NUNCA debe pintarse el grid de días (jamás datos fingidos)');

var editorReal = buscarPorId(rootReal, 'hz-rutina-editor');
afirmar(editorReal !== null, 'real: el editor #hz-rutina-editor debe estar PRESENTE (aunque sin rutina -- así se prescribe la primera)');
afirmar(editorReal.classList.contains('hz-card') && editorReal.classList.contains('hz-form-card'), 'el editor debe traer las clases hz-card + hz-form-card (C-2)');
afirmar(editorReal.consultarTodo('.hz-card-title')[0].textContent === 'Editar rutina', 'el editor debe titularse "Editar rutina"');

var botonImprimirReal = buscarPorId(rootReal, 'hz-btn-imprimir-rutina');
var botonDescargarReal = buscarPorId(rootReal, 'hz-btn-descargar-rutina');
afirmar(botonImprimirReal.getAttribute('disabled') === 'disabled' && botonImprimirReal.getAttribute('aria-disabled') === 'true', 'real sin rutina: el botón imprimir debe quedar disabled + aria-disabled="true"');
afirmar(botonDescargarReal.getAttribute('disabled') === 'disabled' && botonDescargarReal.getAttribute('aria-disabled') === 'true', 'real sin rutina: el botón descargar debe quedar disabled + aria-disabled="true"');

var formEditorReal = editorReal.consultarTodo('form')[0];
afirmar(formEditorReal !== null && formEditorReal.classList.contains('hz-form') && formEditorReal.classList.contains('hz-form-columnas'), 'el form del editor debe traer hz-form + hz-form-columnas (F-01.2)');
afirmar(editorReal.consultarTodo('fieldset').length === 0, 'real sin rutina: el editor arranca sin días (0 fieldsets) -- se prescriben con Agregar día');

var botonAgregarDiaEl = buscarPorId(rootReal, 'hz-btn-agregar-dia');
afirmar(botonAgregarDiaEl !== null && botonAgregarDiaEl.textContent === 'Agregar día' && botonAgregarDiaEl.classList.contains('hz-btn-secundario'), 'debe existir #hz-btn-agregar-dia secundario con el texto exacto');
afirmar(botonAgregarDiaEl.getAttribute('disabled') === null, 'con 0 días, Agregar día debe estar habilitado');

var botonGuardarEl = buscarPorId(rootReal, 'hz-btn-guardar-rutina');
afirmar(botonGuardarEl !== null && botonGuardarEl.textContent === 'Guardar rutina' && botonGuardarEl.classList.contains('hz-btn-primario') && botonGuardarEl.getAttribute('type') === 'submit', 'debe existir #hz-btn-guardar-rutina primario, type=submit, texto exacto');

// =========================================================================
// 5. Ciclo completo de guardado (R-06.3/R-06.4): Agregar día -> llenar
//    campos -> Guardar -> Almacen.guardarRutina (REAL) persiste ->
//    HERZON_DATA.rutina se actualiza -> mensaje de éxito consumo-único ->
//    la LECTURA se remonta reflejando el nuevo día.
// =========================================================================
botonAgregarDiaEl.despachar('click');
var campoTituloD1 = buscarPorId(rootReal, 'hz-rut-d1-titulo');
var campoNombreD1E1 = buscarPorId(rootReal, 'hz-rut-d1-e1-nombre');
var campoSeriesD1E1 = buscarPorId(rootReal, 'hz-rut-d1-e1-series');
var campoRepeticionesD1E1 = buscarPorId(rootReal, 'hz-rut-d1-e1-repeticiones');
var campoDescansoD1E1 = buscarPorId(rootReal, 'hz-rut-d1-e1-descanso');
afirmar(campoNombreD1E1 !== null && campoSeriesD1E1 !== null && campoRepeticionesD1E1 !== null && campoDescansoD1E1 !== null,
  'tras Agregar día deben aparecer los campos hz-rut-d1-e1-nombre/series/repeticiones/descanso (R-06.1, ids exactos)');
afirmar(campoNombreD1E1.getAttribute('type') === 'text' && campoSeriesD1E1.getAttribute('type') === 'number' && campoDescansoD1E1.getAttribute('type') === 'number',
  'tipos de input correctos: nombre/repeticiones texto libre, series/descanso numéricos');

campoTituloD1.value = 'Piernas';
campoNombreD1E1.value = 'Sentadilla goblet';
campoSeriesD1E1.value = '4';
campoRepeticionesD1E1.value = '10-12';
campoDescansoD1E1.value = '90';

var snapshotAntesDeGuardar = JSON.stringify(globalThis.HERZON_DATA.rutina);
formEditorReal.despachar('submit', {});

afirmar(JSON.stringify(globalThis.HERZON_DATA.rutina) !== snapshotAntesDeGuardar, 'tras un guardado válido, HERZON_DATA.rutina debe cambiar (Almacen.guardarRutina persistió)');
afirmar(globalThis.HERZON_DATA.rutina && globalThis.HERZON_DATA.rutina.dias.length === 1, 'HERZON_DATA.rutina debe reflejar 1 día tras guardar');
afirmar(globalThis.HERZON_DATA.rutina.dias[0].ejercicios[0].nombre === 'Sentadilla goblet', 'el ejercicio guardado debe coincidir con lo tecleado');

var estadoElTrasGuardar = buscarPorId(rootReal, 'hz-rutina-estado');
afirmar(estadoElTrasGuardar !== null, 'tras guardar, #hz-rutina-estado debe existir en el editor remontado');
afirmar(estadoElTrasGuardar.textContent === 'Rutina guardada en este dispositivo — 1 día(s), 1 ejercicio(s).', 'mensaje de éxito EXACTO (R-06.3)');
afirmar(estadoElTrasGuardar.style.color === 'var(--delta-good)', 'el mensaje de éxito debe pintarse con var(--delta-good) (C-9)');
afirmar(estadoElTrasGuardar.classList.contains('hz-nota') && estadoElTrasGuardar.classList.contains('hz-form-ancho'), 'clases exactas de #hz-rutina-estado');

afirmar(rootReal.getAttribute('data-rutina-dias') === '1', 'tras guardar, la LECTURA remontada debe reflejar data-rutina-dias="1"');
var itemsTrasGuardar = rootReal.consultarTodo('.hz-rutina-item');
afirmar(itemsTrasGuardar.length === 1 && itemsTrasGuardar[0].consultarUno('.hz-rutina-nombre').textContent === 'Sentadilla goblet', 'la lectura remontada debe pintar el ejercicio recién guardado');
afirmar(rootReal.consultarTodo('.hz-vacio').length === 0, 'con una rutina guardada, el estado vacío ya no debe pintarse');

var botonImprimirTrasGuardar = buscarPorId(rootReal, 'hz-btn-imprimir-rutina');
afirmar(botonImprimirTrasGuardar.getAttribute('disabled') === null && botonImprimirTrasGuardar.getAttribute('aria-disabled') === null, 'con rutina ya guardada, el botón imprimir debe quedar habilitado');

// =========================================================================
// 6. Validación al guardar (R-06.2, patrón T-029): nombre vacío rechaza el
//    guardado, marca aria-invalid, pinta el mensaje EXACTO, NO llama a
//    Almacen.guardarRutina (espía sobre el módulo real) y NUNCA pierde lo
//    tecleado en los demás campos (sin reconstrucción del formulario ante
//    error).
// =========================================================================
var editorRealTrasGuardar = buscarPorId(rootReal, 'hz-rutina-editor');
// El guardado exitoso disparó render() (rebuild completo de rootReal): TODA
// referencia capturada ANTES de este punto (botonAgregarDiaEl incluido)
// quedó apuntando a nodos DESTACADOS del árbol vivo -- se refrescan aquí.
botonAgregarDiaEl = buscarPorId(rootReal, 'hz-btn-agregar-dia');
var formEditorReal2 = editorRealTrasGuardar.consultarTodo('form')[0];
var campoNombreD1E1v2 = buscarPorId(rootReal, 'hz-rut-d1-e1-nombre');
var campoSeriesD1E1v2 = buscarPorId(rootReal, 'hz-rut-d1-e1-series');
campoNombreD1E1v2.value = '';
campoSeriesD1E1v2.value = '4';

var llamadasGuardarRutinaReal = 0;
var guardarRutinaOriginal = AlmacenReal.guardarRutina;
Herzon.Almacen.guardarRutina = function () { llamadasGuardarRutinaReal += 1; return guardarRutinaOriginal.apply(AlmacenReal, arguments); };

var snapshotAntesDeInvalido = JSON.stringify(globalThis.HERZON_DATA.rutina);
formEditorReal2.despachar('submit', {});

afirmar(llamadasGuardarRutinaReal === 0, 'un submit inválido NUNCA debe invocar Almacen.guardarRutina (espía sobre el módulo real, C-6/T-029)');
afirmar(JSON.stringify(globalThis.HERZON_DATA.rutina) === snapshotAntesDeInvalido, 'un submit inválido no debe alterar HERZON_DATA.rutina');

var errorElTrasInvalido = buscarPorId(rootReal, 'hz-rutina-error');
afirmar(errorElTrasInvalido !== null && errorElTrasInvalido.textContent.indexOf('Revisa: ') === 0, 'el mensaje de error debe empezar con "Revisa: " (R-06.2)');
afirmar(errorElTrasInvalido.textContent.indexOf('No se guardó la rutina.') !== -1, 'el mensaje de error debe terminar con "No se guardó la rutina." (R-06.2)');
afirmar(errorElTrasInvalido.classList.contains('hz-form-error') && errorElTrasInvalido.classList.contains('hz-form-ancho'), 'clases exactas de #hz-rutina-error (C-9: errores siempre hz-form-error)');

var campoInvalidoTrasSubmit = buscarPorId(rootReal, 'hz-rut-d1-e1-nombre');
afirmar(campoInvalidoTrasSubmit.getAttribute('aria-invalid') === 'true', 'el campo nombre vacío debe quedar marcado aria-invalid="true" (C-6: sin inline borderColor)');
afirmar(campoInvalidoTrasSubmit.style.borderColor === undefined || campoInvalidoTrasSubmit.style.borderColor === '', 'C-6: el editor de rutina NO debe usar inline borderColor, solo aria-invalid + la regla CSS F-01.6');

// R-06.4: ante un error de validación NO hay reconstrucción del formulario
// -- lo tecleado en OTROS campos (series, en este caso) debe seguir intacto.
var campoSeriesTrasSubmit = buscarPorId(rootReal, 'hz-rut-d1-e1-series');
afirmar(campoSeriesTrasSubmit.value === '4', 'ante un error de validación, los demás campos NUNCA deben perder lo tecleado (R-06.4)');

Herzon.Almacen.guardarRutina = guardarRutinaOriginal;

// =========================================================================
// 7. Mutaciones estructurales del borrador (R-06.4): quitar el ÚNICO
//    ejercicio de un día elimina el día completo; el borrador es reversible
//    hasta Guardar (sin llamar a Almacen).
// =========================================================================
var fieldsetsAntesDeQuitar = editorRealTrasGuardar.consultarTodo('fieldset');
afirmar(fieldsetsAntesDeQuitar.length === 1, 'debe existir exactamente 1 fieldset de día antes de la mutación');
var botonesEnFieldset = fieldsetsAntesDeQuitar[0].consultarTodo('button');
var botonQuitarEjercicio = botonesEnFieldset.filter(function (b) { return b.classList.contains('hz-btn-peligro') && b.textContent === 'Quitar'; })[0];
var botonQuitarDia = botonesEnFieldset.filter(function (b) { return b.classList.contains('hz-btn-peligro') && b.textContent === 'Quitar día'; })[0];
afirmar(botonQuitarEjercicio !== undefined, 'debe existir el botón "Quitar" (peligro) por ejercicio, distinto de "Quitar día"');
afirmar(botonQuitarDia !== undefined, 'debe existir el botón "Quitar día" (peligro) por día');
afirmar(!botonQuitarEjercicio.hasAttribute('data-confirmar') && !botonQuitarDia.hasAttribute('data-confirmar'), 'F-02: Quitar/Quitar día son peligro SIN data-confirmar (mutan solo el borrador, reversibles hasta Guardar)');

var llamadasGuardarRutinaTrasQuitar = 0;
Herzon.Almacen.guardarRutina = function () { llamadasGuardarRutinaTrasQuitar += 1; return guardarRutinaOriginal.apply(AlmacenReal, arguments); };
botonQuitarEjercicio.despachar('click');
afirmar(llamadasGuardarRutinaTrasQuitar === 0, 'una mutación estructural del borrador (Quitar) NUNCA debe invocar Almacen.guardarRutina por sí sola');
Herzon.Almacen.guardarRutina = guardarRutinaOriginal;

afirmar(editorRealTrasGuardar.consultarTodo('fieldset').length === 0, 'quitar el ÚLTIMO ejercicio de un día debe eliminar el día completo del borrador (R-06.4)');
afirmar(botonAgregarDiaEl.getAttribute('disabled') === null, 'Agregar día debe seguir habilitado tras quitar el único día');
afirmar(globalThis.HERZON_DATA.rutina && globalThis.HERZON_DATA.rutina.dias.length === 1, 'la mutación del BORRADOR no debe alterar el HERZON_DATA.rutina ya persistido (nada se guarda hasta Guardar)');

// Límite de 7 días (F-02: "Agregar día... deshabilitado con 7 días").
for (var ad = 0; ad < 8; ad++) { botonAgregarDiaEl.despachar('click'); }
afirmar(editorRealTrasGuardar.consultarTodo('fieldset').length === 7, 'Agregar día debe detenerse en 7 días (tope duro del contrato R-02)');
afirmar(botonAgregarDiaEl.getAttribute('disabled') === 'disabled' && botonAgregarDiaEl.getAttribute('aria-disabled') === 'true', 'con 7 días, Agregar día debe quedar disabled + aria-disabled');

// =========================================================================
// 8. renderDocumentoRutina (R-07.1): estructura, clases hz-doc-* congeladas,
//    título vacío sin em dash colgante, pie = meta.nota del modo.
// =========================================================================
var docDoc = TestDOM.crearDocumento();
var contenedorDoc = docDoc.createElement('div');
var payloadDoc = {
  paciente: { nombre: 'Cliente De Prueba Rutina', objetivo: 'Salud general' },
  rutina: {
    actualizado: '2026-05-01',
    dias: [
      {
        dia: 1, titulo: 'Piernas', ejercicios: [
          { nombre: 'Sentadilla', series: 4, repeticiones: '10-12', descanso_s: 90, notas: 'Cuidar la espalda.' },
          { nombre: 'Zancada', series: 3, repeticiones: '10 por pierna', descanso_s: null, notas: '' }
        ]
      },
      { dia: 2, titulo: '', ejercicios: [{ nombre: 'Press de banca', series: 4, repeticiones: '8-10', descanso_s: 90, notas: '' }] }
    ]
  },
  notaDatos: 'Nota de prueba del modo.',
  fechaGeneracion: '2026-06-01'
};
Rutina.renderDocumentoRutina(docDoc, contenedorDoc, payloadDoc);

var titulosDoc = contenedorDoc.consultarTodo('.hz-doc-titulo');
afirmar(titulosDoc.length === 1 && titulosDoc[0].textContent === 'Rutina de entrenamiento — Rinde', 'renderDocumentoRutina debe pintar exactamente un .hz-doc-titulo con el texto EXACTO (R-07.1)');

var metasDoc = contenedorDoc.consultarTodo('.hz-doc-meta');
afirmar(metasDoc.length === 1, 'renderDocumentoRutina debe pintar exactamente un .hz-doc-meta');
afirmar(metasDoc[0].textContent.indexOf('Cliente: Cliente De Prueba Rutina') !== -1, 'la meta debe incluir "Cliente: <nombre>"');
afirmar(metasDoc[0].textContent.indexOf('Objetivo: Salud general') !== -1, 'la meta debe incluir "Objetivo: <objetivo>"');
afirmar(metasDoc[0].textContent.indexOf('Actualizada: 2026-05-01') !== -1, 'la meta debe incluir "Actualizada: <rutina.actualizado>"');
afirmar(metasDoc[0].textContent.indexOf('Generado: 2026-06-01') !== -1, 'la meta debe incluir "Generado: <fecha>"');

var seccionesDoc = contenedorDoc.consultarTodo('.hz-doc-seccion');
afirmar(seccionesDoc.length === 2, 'debe pintarse una hz-doc-seccion por día (2 días en el payload de prueba)');
afirmar(seccionesDoc[0].consultarTodo('.hz-doc-seccion-titulo')[0].textContent === 'Día 1 — Piernas', 'título de sección con titulo no vacío: "Día <n> — <titulo>"');
afirmar(seccionesDoc[1].consultarTodo('.hz-doc-seccion-titulo')[0].textContent === 'Día 2', 'título de sección con titulo vacío: "Día <n>" SIN em dash colgante');

var tablasDoc = contenedorDoc.consultarTodo('.hz-table');
afirmar(tablasDoc.length === 2, 'debe pintarse una tabla hz-table por día');
var filasDia1Doc = seccionesDoc[0].consultarTodo('tr');
afirmar(filasDia1Doc.length === 3, 'la tabla del día 1 debe traer encabezado + 2 filas de ejercicio');
var encabezadosDoc = filasDia1Doc[0].consultarTodo('th').map(function (th) { return th.textContent; });
afirmar(JSON.stringify(encabezadosDoc) === JSON.stringify(['Ejercicio', 'Series', 'Repeticiones', 'Descanso', 'Notas']), 'columnas EXACTAS de la tabla del documento (R-07.1)');
var celdasZancada = filasDia1Doc[2].consultarTodo('td').map(function (td) { return td.textContent; });
afirmar(celdasZancada[2] === '—', 'descanso_s null debe pintarse como em dash en la tabla del documento');
var celdasSentadillaDoc = filasDia1Doc[1].consultarTodo('td');
afirmar(celdasSentadillaDoc[0].textContent === '4', 'primera <td> de la fila "Sentadilla" debe ser la columna series ("4")');
afirmar(celdasSentadillaDoc[2].textContent === '90 s', 'tercera <td> de la fila "Sentadilla" debe ser la columna descanso formateada "90 s"');

var piesDoc = contenedorDoc.consultarTodo('.hz-doc-pie');
afirmar(piesDoc.length === 1 && piesDoc[0].textContent === 'Nota de prueba del modo.', 'el pie debe repetir literalmente notaDatos (HERZON_DATA.meta.nota del modo, R-07.1)');

// =========================================================================
// 9. generarHtmlRutinaDescargable (R-07.3): HTML autocontenido, escaparHtml
//    propio (cero inyección de marcado), mismos hexes VALIDADOS del
//    precedente de build/documentos.js.
// =========================================================================
var htmlDescargable = Rutina.generarHtmlRutinaDescargable(payloadDoc);
afirmar(typeof htmlDescargable === 'string' && htmlDescargable.indexOf('<!DOCTYPE html>') === 0, 'generarHtmlRutinaDescargable debe producir un documento HTML autocontenido');
afirmar(htmlDescargable.indexOf('Rutina de entrenamiento — Rinde') !== -1, 'el HTML descargable debe mencionar el título del documento');
afirmar((htmlDescargable.match(/<table>/g) || []).length === 2, 'debe traer una tabla por día (2 días en el payload de prueba)');
afirmar(htmlDescargable.indexOf('Día 1 — Piernas') !== -1, 'debe incluir el título del día 1 con titulo no vacío');
afirmar(htmlDescargable.indexOf('Nota de prueba del modo.') !== -1, 'debe incluir el pie con notaDatos');

var payloadEscape = JSON.parse(JSON.stringify(payloadDoc));
payloadEscape.paciente.nombre = 'Ana & <script>"x"</script>';
var htmlEscapado = Rutina.generarHtmlRutinaDescargable(payloadEscape);
afirmar(htmlEscapado.indexOf('<script>') === -1, 'nombres con caracteres especiales deben escaparse: cero inyección de marcado (escaparHtml propio)');
afirmar(htmlEscapado.indexOf('Ana &amp; &lt;script&gt;&quot;x&quot;&lt;/script&gt;') !== -1, 'escaparHtml debe escapar &, <, > y " correctamente');

var HEXES_VALIDADOS_MODO_CLARO = ['#0b0b0b', '#52514e', '#c3c2b7', '#e1e0d9'];
var hexesEnVista = fuenteVista.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
afirmar(hexesEnVista.length > 0, 'build/vista_rutina.js debe traer al menos los hexes del <style> del documento descargable (sanity de esta prueba)');
for (var hxv = 0; hxv < hexesEnVista.length; hxv++) {
  afirmar(
    HEXES_VALIDADOS_MODO_CLARO.indexOf(hexesEnVista[hxv].toLowerCase()) !== -1,
    'build/vista_rutina.js contiene un hex fuera de la lista de tokens validados del modo claro (única excepción bendecida, precedente de documentos.js): ' + hexesEnVista[hxv]
  );
}

// =========================================================================
// 10. nombreArchivoExportable (R-07): consumo del módulo YA PUBLICADO
//     build/documentos.js (C-7, sin lock) -- slug real y prefijo demo.
// =========================================================================
Herzon.Almacen = AlmacenReal;
AlmacenReal.borrarTodo();
var resMariaJose = AlmacenReal.crearCliente({
  nombre: 'María José', sexo: 'femenino', edad: 28, talla_cm: 160,
  pesoInicial_kg: 58, actividad: 'ligero', objetivo: 'Tonificar'
});
afirmar(resMariaJose.ok === true, 'fixture: crearCliente "María José" debe funcionar');
var nombreArchivoReal = Docs.nombreArchivoExportable('rutina', '2026-06-01', 'html');
afirmar(nombreArchivoReal === 'rinde-maria-jose-rutina-2026-06-01.html', 'slug real de "María José" -> "maria-jose": nombre EXACTO rinde-maria-jose-rutina-<fecha>.html');

Herzon.Almacen = undefined;
var nombreArchivoDemo = Docs.nombreArchivoExportable('rutina', '2026-06-01', 'html');
afirmar(nombreArchivoDemo === 'rinde-demo-rutina-2026-06-01.html', 'en demo/sin Almacén: nombre EXACTO rinde-demo-rutina-<fecha>.html');
afirmar(typeof Docs.descargarArchivo === 'function', 'Herzon.Docs.descargarArchivo debe existir para que #hz-btn-descargar-rutina lo consuma (R-07.3)');

Herzon.Almacen = AlmacenReal;

// =========================================================================
// 11. Cero código muerto de innerHTML/red y cero emojis (regla dura de
//     Mario) en TODO el archivo fuente.
// =========================================================================
afirmar(fuenteVista.indexOf('innerHTML') === -1, 'build/vista_rutina.js no debe usar innerHTML en ninguna parte (textContent siempre)');
afirmar(fuenteVista.indexOf('fetch(') === -1, 'build/vista_rutina.js no debe usar fetch (cero red)');
afirmar(fuenteVista.indexOf('XMLHttpRequest') === -1, 'build/vista_rutina.js no debe usar XMLHttpRequest (cero red)');
afirmar(!REGEX_EMOJI.test(fuenteVista), 'build/vista_rutina.js no debe contener emojis (regla dura de Mario)');
afirmar(/[áéíóúñÁÉÍÓÚÑ]/.test(fuenteVista), 'build/vista_rutina.js debe contener acentos/eñe en su texto visible (sanity positiva de español con acentos)');

// =========================================================================
// 12. Anti-regresión de acentos (auditoría previa al hand-off, mismo
//     patrón que build/selfcheck_almacen.js sección 14): ninguna de estas
//     palabras en español sin acento/eñe puede aparecer en el CÓDIGO FUENTE
//     de este módulo (prosa de comentarios y mensajes). Identificadores
//     legítimos (camelCase: "boton...", "modulo...") quedan fuera a
//     propósito, mismo precedente que "catalogo"/"boton" en almacen.js.
// =========================================================================
// "invalido"/"invalidos" quedan FUERA a propósito: son el nombre de campo
// que usa, literal, el resultado de validarBorrador ({errores, invalidos})
// y el nombre de parámetro derivado -- identificador, no prosa (mismo
// precedente que "catalogo"/"boton" en build/selfcheck_almacen.js).
// "vacio"/"vacios"/"vacia"/"vacias" quedan FUERA a propósito: son parte de
// la clase FROZEN "hz-vacio" (plan.md 3.G, rondas previas), no prosa nueva
// de este módulo. "dia"/"dias" quedan fuera: son la clave literal del
// esquema R-02 (`clientes[id].rutina.dias[].dia`) y nombres de parámetro
// derivados de esa clave -- identificador de datos, no prosa (mismo
// precedente que "medicion"/"plicometria" en build/selfcheck_almacen.js).
var PALABRAS_SIN_ACENTO_PROHIBIDAS = [
  'numero', 'validacion', 'automatico',
  'automatica', 'basica', 'basico', 'facil', 'metodo', 'modulo',
  'sesion', 'sincrono', 'sincrona', 'logica',
  'pagina', 'aqui', 'tambien', 'parametro', 'construccion', 'confirmacion',
  'unica', 'unico', 'ultima', 'ultimo', 'anios', 'estan', 'clasico',
  'clasica', 'aceptacion', 'genericamente', 'exito',
  'reaccion', 'edicion', 'reconstruccion', 'informacion',
  'grafica', 'graficas', 'estatico', 'estatica', 'dinamico', 'dinamica'
];
for (var pa = 0; pa < PALABRAS_SIN_ACENTO_PROHIBIDAS.length; pa++) {
  var palabra = PALABRAS_SIN_ACENTO_PROHIBIDAS[pa];
  var regexPalabra = new RegExp('\\b' + palabra + '\\b');
  afirmar(!regexPalabra.test(fuenteVista), 'build/vista_rutina.js contiene la palabra sin acento "' + palabra + '": revisar y corregir a español con acentos/eñe');
}

// =========================================================================
console.log('checks ejecutados: ' + contador);
process.exit(0);
