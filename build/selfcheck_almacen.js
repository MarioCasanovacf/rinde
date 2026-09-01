// build/selfcheck_almacen.js
// Selfcheck de node puro (sin dependencias externas) para build/almacen.js.
// Formato de salida congelado en plan.md 3.J: última línea de stdout literal
// "checks ejecutados: N"; exit 0 solo si todas las aserciones pasan; en
// fallo, exit 1 e imprime la aserción fallida antes de salir.
'use strict';

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

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
// Mock de localStorage EN MEMORIA (objeto plano, sin persistencia real
// fuera del proceso): implementa exactamente la superficie que consume
// build/almacen.js (getItem/setItem/removeItem).
// ---------------------------------------------------------------------
function crearLocalStorageMock() {
  var almacen = {};
  return {
    getItem: function (clave) { return Object.prototype.hasOwnProperty.call(almacen, clave) ? almacen[clave] : null; },
    setItem: function (clave, valor) { almacen[clave] = String(valor); },
    removeItem: function (clave) { delete almacen[clave]; },
    _volcado: function () { return almacen; }
  };
}

// ---------------------------------------------------------------------
// Mock de addEventListener/dispatchEvent EN MEMORIA: build/almacen.js usa
// G.dispatchEvent + `new CustomEvent(...)` para notificar a las vistas, y
// desde R9 también usa G.addEventListener para cablear la reconstrucción
// del selector del header (MC-03: "el select se reconstruye SOLO al
// recibir herzon:clientes-actualizados / herzon:cliente-cambiado"). Node
// SÍ trae un EventTarget global desde v15+, pero reemplazar solo
// dispatchEvent (como hacía el selfcheck de T-039) rompería ese cableado
// -- por eso este mock implementa el par completo, coherente entre sí,
// en vez de mezclar un dispatchEvent propio con el addEventListener nativo.
// ---------------------------------------------------------------------
function instalarBusDeEventos() {
  var eventosCapturados = [];
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
    eventosCapturados.push(evento);
    var lista = listenersPorTipo[evento.type] || [];
    for (var i = 0; i < lista.length; i++) { lista[i](evento); }
    return true;
  };
  return eventosCapturados;
}

// ---------------------------------------------------------------------
// 0. Carga del módulo: DOM headless antes de require (plan.md 3.A). El
//    localStorage mock se instala ANTES de requerir build/almacen.js
//    porque ese módulo llama cargar() de forma síncrona en cuanto se
//    define (Adendum R8 punto 6) -- debe ver el mock desde el arranque.
// ---------------------------------------------------------------------
globalThis.window = globalThis;

var eventosCapturados = instalarBusDeEventos();

var mockStorage = crearLocalStorageMock();
globalThis.localStorage = mockStorage;

var TESTDOM_PATH = path.join(__dirname, 'testdom.js');
var DATA_PATH = path.join(__dirname, 'data.js');
var ALMACEN_PATH = path.join(__dirname, 'almacen.js');

require(TESTDOM_PATH);
require(DATA_PATH);
require(ALMACEN_PATH);

var fuenteAlmacen = fs.readFileSync(ALMACEN_PATH, 'utf8');
var TestDOM = Herzon.TestDOM;
var Almacen = Herzon.Almacen;

function eventosDeTipo(tipo) {
  return eventosCapturados.filter(function (e) { return e.type === tipo; });
}

// Instantánea del demo ORIGINAL, tomada por fuera del módulo (JSON puro,
// sin referencias compartidas), para comparar contra ella después de
// crear/eliminar clientes y así demostrar que el sintético jamás se
// contaminó.
var DEMO_ORIGINAL_JSON = JSON.stringify(globalThis.HERZON_DATA);
var DEMO_NOTA_ORIGINAL = globalThis.HERZON_DATA.meta.nota;
var DEMO_GENERADO_ORIGINAL = globalThis.HERZON_DATA.meta.generado;
var DEMO_NOMBRE_PACIENTE = globalThis.HERZON_DATA.paciente.nombre;

// ---------------------------------------------------------------------
// 1. Namespace y forma de la API (plan.md 3.B: Herzon.Almacen es dueño
//    único; funciones existentes de R8 + API aditiva de R9/MC-02).
// ---------------------------------------------------------------------
afirmar(typeof Almacen === 'object' && Almacen !== null, 'window.Herzon.Almacen debe existir como objeto tras require(./almacen.js)');
['modo', 'cargar', 'activarReal', 'volverADemo', 'actualizarPerfil', 'agregarMedicion', 'mergeMediciones', 'borrarTodo', 'initUI',
  'clientes', 'crearCliente', 'seleccionarCliente', 'renombrarCliente', 'eliminarCliente', 'clienteActivo', 'guardarPlan'
].forEach(function (nombre) {
  afirmar(typeof Almacen[nombre] === 'function', 'Herzon.Almacen.' + nombre + ' debe ser una función');
});
afirmar(typeof globalThis.document === 'undefined', 'este selfcheck no debe tener document real global: valida que cargar() en el auto-inicio no dependa del DOM');

// ---------------------------------------------------------------------
// 2. cargar() en boot: sin nada persistido, debe quedar en modo demo, sin
//    tocar la forma de HERZON_DATA, y con el esquema de clientes vacío
//    (MC-01/MC-05).
// ---------------------------------------------------------------------
afirmar(Almacen.modo() === 'demo', 'sin datos persistidos, el modo tras el auto-arranque debe ser "demo"');
afirmar(globalThis.HERZON_DATA.paciente.nombre === 'Daniela Reyes Cortez', 'en modo demo, HERZON_DATA.paciente debe seguir siendo el paciente sintético original');
afirmar(globalThis.HERZON_DATA.series.peso_kg.length === 12, 'en modo demo, la serie de peso debe conservar las 12 semanas sintéticas');
afirmar(globalThis.HERZON_DATA.labs.marcadores.length === 7, 'en modo demo, labs.marcadores debe conservar los 7 marcadores sintéticos');
afirmar(mockStorage.getItem('rinde.datos.v1') === null, 'sin haber creado ningún cliente, localStorage no debe tener la clave rinde.datos.v1');
afirmar(Array.isArray(Almacen.clientes()) && Almacen.clientes().length === 0, 'sin clientes creados, clientes() debe devolver un arreglo vacío (MC-05: la demo jamás entra en clientes{})');
afirmar(Almacen.clienteActivo() === null, 'en modo demo, clienteActivo() debe devolver null (MC-05)');

// ---------------------------------------------------------------------
// 3. Aislamiento demo/real (MC-05): agregarMedicion/mergeMediciones/
//    actualizarPerfil/guardarPlan rechazados en modo demo (no escriben, no
//    persisten, no emiten evento de datos).
// ---------------------------------------------------------------------
var pesoDemoAntes = globalThis.HERZON_DATA.series.peso_kg.length;
var resultadoAgregarEnDemo = Almacen.agregarMedicion({ peso_kg: 70, grasa_pct: 30, musculo_kg: 25, cintura_cm: 85 });
afirmar(resultadoAgregarEnDemo.ok === false, 'agregarMedicion en modo demo debe devolver ok:false');
afirmar(resultadoAgregarEnDemo.errores.length > 0, 'agregarMedicion en modo demo debe traer al menos un mensaje de error');
afirmar(globalThis.HERZON_DATA.series.peso_kg.length === pesoDemoAntes, 'agregarMedicion en modo demo NO debe mutar la serie sintética');

var resultadoMergeEnDemo = Almacen.mergeMediciones([{ semana: 99, fecha: '2026-01-01', peso_kg: 70, grasa_pct: 30, musculo_kg: 25, cintura_cm: 85 }]);
afirmar(resultadoMergeEnDemo.ok === false, 'mergeMediciones en modo demo debe devolver ok:false');
afirmar(globalThis.HERZON_DATA.series.peso_kg.length === pesoDemoAntes, 'mergeMediciones en modo demo NO debe mutar la serie sintética');

afirmar(Almacen.actualizarPerfil({ nombre: 'No debería aplicar' }) === false, 'actualizarPerfil en modo demo debe devolver false');
afirmar(globalThis.HERZON_DATA.paciente.nombre === DEMO_NOMBRE_PACIENTE, 'actualizarPerfil en modo demo no debe mutar el paciente sintético');
afirmar(Almacen.guardarPlan({ plantillaId: 'estandar_1600', kcalObjetivo: 1600, fecha: '2026-01-01' }) === false, 'guardarPlan en modo demo debe devolver false (aislamiento MC-05)');
afirmar(JSON.stringify(globalThis.HERZON_DATA) === DEMO_ORIGINAL_JSON, 'ninguno de los rechazos anteriores debe haber tocado el sintético original');

// =========================================================================
// 4. Ciclo multi-cliente completo (criterio de aceptación de T-045):
//    crear A -> capturar 2 mediciones -> crear B -> capturar 1 ->
//    seleccionar A -> datos de A intactos y los de B invisibles ->
//    recarga simulada con cargar() -> activoId y ambos clientes persisten
//    -> eliminar B -> monta A -> eliminar A -> volverADemo y select con
//    option Demo.
// =========================================================================
var perfilA = { nombre: 'Cliente A', sexo: 'femenino', edad: 30, talla_cm: 165, pesoInicial_kg: 70, actividad: 'ligero', objetivo: 'Recomposición corporal' };
var perfilB = { nombre: 'Cliente B', sexo: 'masculino', edad: 40, talla_cm: 178, pesoInicial_kg: 90, actividad: 'moderado', objetivo: 'Mantenimiento' };

eventosCapturados.length = 0;
var creacionA = Almacen.crearCliente(perfilA);
afirmar(creacionA.ok === true && typeof creacionA.id === 'string' && creacionA.id.length > 0, 'crearCliente(perfilA) debe devolver ok:true con un id de cliente');
var idA = creacionA.id;
afirmar(Almacen.modo() === 'real', 'crearCliente debe montar el cliente recién creado en modo real');
afirmar(globalThis.HERZON_DATA.paciente.nombre === 'Cliente A', 'crearCliente(perfilA) debe montar paciente.nombre === "Cliente A"');
afirmar(globalThis.HERZON_DATA.series.peso_kg.length === 0, 'crearCliente debe dejar series.peso_kg VACÍO (misma regla que activarReal(perfil) de R8)');
afirmar(globalThis.HERZON_DATA.meta.generado === 'real', 'PR-06: al montar un cliente real, meta.generado debe ser "real"');
afirmar(globalThis.HERZON_DATA.meta.nota === 'Documento generado con Rinde (CECAD) como apoyo al seguimiento nutricional; no sustituye la valoración clínica ni nutriológica de un profesional.', 'PR-06: meta.nota de un cliente real debe ser el texto exacto del hallazgo (no el sintético)');
afirmar(globalThis.HERZON_DATA.planAplicado === null, 'MC-07: un cliente recién creado sin plan guardado debe exponer planAplicado === null');
afirmar(Almacen.clienteActivo() !== null && Almacen.clienteActivo().id === idA && Almacen.clienteActivo().nombre === 'Cliente A', 'clienteActivo() en modo real debe devolver {id,nombre} del cliente montado');
afirmar(Almacen.clientes().length === 1 && Almacen.clientes()[0].nombre === 'Cliente A', 'clientes() tras crear A debe listar exactamente 1 cliente ("Cliente A")');

afirmar(eventosDeTipo('herzon:clientes-actualizados').length === 1, 'crearCliente debe emitir herzon:clientes-actualizados exactamente una vez');
afirmar(eventosDeTipo('herzon:cliente-cambiado').length === 1 && eventosDeTipo('herzon:cliente-cambiado')[0].detail.id === idA && eventosDeTipo('herzon:cliente-cambiado')[0].detail.anteriorId === null, 'crearCliente debe emitir herzon:cliente-cambiado con {id:idA, anteriorId:null}');
afirmar(eventosDeTipo('herzon:modo-cambiado').length === 1 && eventosDeTipo('herzon:modo-cambiado')[0].detail.modo === 'real' && eventosDeTipo('herzon:modo-cambiado')[0].detail.clienteId === idA, 'crearCliente debe emitir herzon:modo-cambiado con {modo:"real", clienteId:idA} (semántica de remontaje)');

// Validaciones de nombre (MC-02): vacío y duplicado, con los textos EXACTOS
// del hallazgo.
var creacionVacia = Almacen.crearCliente({ nombre: '   ' });
afirmar(creacionVacia.ok === false && creacionVacia.errores[0] === 'Escribe el nombre del cliente para crearlo.', 'crearCliente con nombre vacío/solo espacios debe rechazar con el texto exacto del hallazgo');
var creacionDuplicada = Almacen.crearCliente({ nombre: '  cliente a  ' });
afirmar(creacionDuplicada.ok === false && creacionDuplicada.errores[0] === 'Ya existe un cliente con ese nombre en este dispositivo.', 'crearCliente con nombre duplicado (trim+minúsculas) debe rechazar con el texto exacto del hallazgo');
afirmar(Almacen.clientes().length === 1, 'un crearCliente rechazado NO debe agregar un cliente a la lista');

var m1A = Almacen.agregarMedicion({ peso_kg: 69, grasa_pct: 32, musculo_kg: 25, cintura_cm: 88 });
var m2A = Almacen.agregarMedicion({ peso_kg: 68, grasa_pct: 31, musculo_kg: 25.2, cintura_cm: 87 });
afirmar(m1A.ok === true && m2A.ok === true, 'las 2 mediciones de A deben registrarse con ok:true');
afirmar(globalThis.HERZON_DATA.series.peso_kg.join(',') === '69,68', 'tras 2 agregarMedicion, la serie de A debe reflejar EXACTAMENTE los 2 valores en orden');

eventosCapturados.length = 0;
var creacionB = Almacen.crearCliente(perfilB);
afirmar(creacionB.ok === true, 'crearCliente(perfilB) debe devolver ok:true');
var idB = creacionB.id;
afirmar(idB !== idA, 'los ids de A y B deben ser distintos');
afirmar(globalThis.HERZON_DATA.paciente.nombre === 'Cliente B', 'crearCliente(perfilB) debe montar el nuevo cliente (B) como activo');
afirmar(globalThis.HERZON_DATA.series.peso_kg.length === 0, 'B recién creado debe tener series.peso_kg VACÍO (aislado de A)');
afirmar(eventosDeTipo('herzon:cliente-cambiado')[0].detail.anteriorId === idA, 'crearCliente(B) debe emitir cliente-cambiado con anteriorId:idA');
afirmar(Almacen.clientes().length === 2, 'clientes() tras crear B debe listar 2 clientes');

var m1B = Almacen.agregarMedicion({ peso_kg: 91, grasa_pct: 22, musculo_kg: 36, cintura_cm: 96 });
afirmar(m1B.ok === true, 'la medición de B debe registrarse con ok:true');
afirmar(globalThis.HERZON_DATA.series.peso_kg.join(',') === '91', 'la serie de peso de B debe traer únicamente su propia medición');

eventosCapturados.length = 0;
var modoTrasSeleccionarA = Almacen.seleccionarCliente(idA);
afirmar(modoTrasSeleccionarA === 'real', 'seleccionarCliente(idA) debe dejar el modo en "real"');
afirmar(globalThis.HERZON_DATA.paciente.nombre === 'Cliente A', 'tras seleccionarCliente(idA), HERZON_DATA debe reflejar a A');
afirmar(globalThis.HERZON_DATA.series.peso_kg.join(',') === '69,68', 'datos de A intactos: sus 2 mediciones deben seguir presentes tal cual tras el cambio de cliente');
afirmar(globalThis.HERZON_DATA.series.peso_kg.indexOf(91) === -1, 'los datos de B deben ser INVISIBLES en HERZON_DATA mientras A está montado');
afirmar(eventosDeTipo('herzon:cliente-cambiado').length === 1 && eventosDeTipo('herzon:cliente-cambiado')[0].detail.id === idA && eventosDeTipo('herzon:cliente-cambiado')[0].detail.anteriorId === idB, 'seleccionarCliente(idA) debe emitir cliente-cambiado con {id:idA, anteriorId:idB}');

// seleccionarCliente(idA) llamado de nuevo, ya siendo el activo: no-op
// idempotente, sin remontar ni re-emitir eventos.
eventosCapturados.length = 0;
var refHDAntesDeNoOp = globalThis.HERZON_DATA;
afirmar(Almacen.seleccionarCliente(idA) === 'real', 'seleccionarCliente(idA) ya activo debe seguir devolviendo "real"');
afirmar(globalThis.HERZON_DATA === refHDAntesDeNoOp, 'seleccionarCliente(idA) ya activo NO debe remontar HERZON_DATA (misma referencia)');
afirmar(eventosCapturados.length === 0, 'seleccionarCliente(idA) ya activo NO debe emitir ningún evento');

// "Recarga simulada": cargar() contra el MISMO mock de localStorage, sin
// reiniciar el proceso. Si los datos realmente persistieron, activoId y
// AMBOS clientes deben seguir presentes.
var HD_antesDeRecarga = globalThis.HERZON_DATA;
var crudoAntesDeRecarga = JSON.parse(mockStorage.getItem('rinde.datos.v1'));
afirmar(crudoAntesDeRecarga.version === 2, 'lo persistido debe traer version:2 (esquema v2, MC-01)');
afirmar(crudoAntesDeRecarga.activoId === idA, 'lo persistido debe traer activoId === idA (A quedó como el último seleccionado)');
afirmar(Object.keys(crudoAntesDeRecarga.clientes).length === 2, 'lo persistido debe traer AMBOS clientes en clientes{} antes de la recarga simulada');

var modoTrasRecarga = Almacen.cargar();
afirmar(modoTrasRecarga === 'real', 'tras la recarga simulada, cargar() debe restaurar el modo "real" desde localStorage');
afirmar(globalThis.HERZON_DATA !== HD_antesDeRecarga, 'tras la recarga simulada, HERZON_DATA debe ser un objeto NUEVO (reconstruido desde JSON, no la misma referencia)');
afirmar(Almacen.clientes().length === 2, 'tras la recarga simulada, AMBOS clientes deben seguir presentes en clientes()');
afirmar(globalThis.HERZON_DATA.paciente.nombre === 'Cliente A', 'tras la recarga simulada, el cliente montado debe seguir siendo A (activoId persistido)');
afirmar(globalThis.HERZON_DATA.series.peso_kg.join(',') === '69,68', 'tras la recarga simulada, las 2 mediciones de A deben seguir presentes (persistencia real, no solo continuidad en memoria)');

// eliminar B (NO es el activo): la lista baja a 1, A sigue montado sin
// remontaje ni evento de cliente-cambiado.
eventosCapturados.length = 0;
var refHDAntesDeEliminarB = globalThis.HERZON_DATA;
var resultadoEliminarB = Almacen.eliminarCliente(idB);
afirmar(resultadoEliminarB.ok === true && resultadoEliminarB.restantes === 1, 'eliminarCliente(idB) debe devolver {ok:true, restantes:1}');
afirmar(Almacen.clientes().length === 1 && Almacen.clientes()[0].id === idA, 'tras eliminar B, clientes() debe listar únicamente a A');
afirmar(globalThis.HERZON_DATA === refHDAntesDeEliminarB, 'eliminar un cliente que NO es el activo no debe remontar HERZON_DATA');
afirmar(eventosDeTipo('herzon:cliente-cambiado').length === 0, 'eliminar un cliente que NO es el activo no debe emitir herzon:cliente-cambiado');
afirmar(eventosDeTipo('herzon:clientes-actualizados').length === 1, 'eliminarCliente(idB) debe emitir herzon:clientes-actualizados');
afirmar(globalThis.HERZON_DATA.paciente.nombre === 'Cliente A', 'tras eliminar B, A sigue montado sin cambios');

// eliminar A (el activo, y el último restante): vuelve a demo.
eventosCapturados.length = 0;
var resultadoEliminarA = Almacen.eliminarCliente(idA);
afirmar(resultadoEliminarA.ok === true && resultadoEliminarA.restantes === 0, 'eliminarCliente(idA) debe devolver {ok:true, restantes:0}');
afirmar(Almacen.modo() === 'demo', 'eliminar el último cliente activo debe dejar el modo en "demo" (MC-06)');
afirmar(Almacen.clientes().length === 0, 'tras eliminar A (el último), clientes() debe quedar vacío');
afirmar(Almacen.clienteActivo() === null, 'tras volver a demo, clienteActivo() debe ser null');
afirmar(JSON.stringify(globalThis.HERZON_DATA) === DEMO_ORIGINAL_JSON, 'tras eliminar el último cliente, HERZON_DATA debe restaurar el sintético original IDÉNTICO');
afirmar(eventosDeTipo('herzon:modo-cambiado').length === 1 && eventosDeTipo('herzon:modo-cambiado')[0].detail.modo === 'demo' && eventosDeTipo('herzon:modo-cambiado')[0].detail.clienteId === null, 'eliminarCliente sin restantes debe emitir modo-cambiado con {modo:"demo", clienteId:null}');

Almacen.borrarTodo();

// ---------------------------------------------------------------------
// 5. MC-06: al eliminar el cliente activo con VARIOS restantes, se monta
//    el primero por fecha de creación (desempatado por id si el mismo
//    día).
// ---------------------------------------------------------------------
var idX = Almacen.crearCliente({ nombre: 'Cliente X', sexo: 'femenino', edad: 25 }).id;
var idY = Almacen.crearCliente({ nombre: 'Cliente Y', sexo: 'masculino', edad: 26 }).id;
var idZ = Almacen.crearCliente({ nombre: 'Cliente Z', sexo: 'femenino', edad: 27 }).id; // queda activo
afirmar(Almacen.clienteActivo().id === idZ, 'sanity: Z debe quedar como el activo tras su creación');
var idEsperadoTrasEliminarZ = [idX, idY].sort()[0];
eventosCapturados.length = 0;
var resultadoEliminarZ = Almacen.eliminarCliente(idZ);
afirmar(resultadoEliminarZ.ok === true && resultadoEliminarZ.restantes === 2, 'eliminarCliente(idZ) con 2 restantes debe devolver {ok:true, restantes:2}');
afirmar(Almacen.clienteActivo().id === idEsperadoTrasEliminarZ, 'al eliminar el activo con varios restantes, debe montarse el primero por fecha de creación (desempate por id)');
afirmar(eventosDeTipo('herzon:cliente-cambiado').length === 1, 'eliminar el activo con restantes debe emitir cliente-cambiado hacia el nuevo montado');
Almacen.borrarTodo();

// ---------------------------------------------------------------------
// 6. renombrarCliente(id, nombre): mismas validaciones (vacío/duplicado);
//    si el renombrado es el activo, HERZON_DATA.paciente.nombre se
//    actualiza en el momento.
// ---------------------------------------------------------------------
var idUno = Almacen.crearCliente({ nombre: 'Persona Uno' }).id;
var idDos = Almacen.crearCliente({ nombre: 'Persona Dos' }).id;
var renombreVacio = Almacen.renombrarCliente(idUno, '   ');
afirmar(renombreVacio.ok === false && renombreVacio.errores[0] === 'Escribe el nombre del cliente para crearlo.', 'renombrarCliente con nombre vacío debe rechazar con el mismo texto exacto que crearCliente');
var renombreDuplicado = Almacen.renombrarCliente(idUno, 'persona dos');
afirmar(renombreDuplicado.ok === false && renombreDuplicado.errores[0] === 'Ya existe un cliente con ese nombre en este dispositivo.', 'renombrarCliente con nombre duplicado (case/trim-insensible) debe rechazar con el texto exacto');
eventosCapturados.length = 0;
var renombreOk = Almacen.renombrarCliente(idDos, 'Persona Dos Renombrada');
afirmar(renombreOk.ok === true, 'renombrarCliente con nombre válido y disponible debe devolver ok:true');
afirmar(globalThis.HERZON_DATA.paciente.nombre === 'Persona Dos Renombrada', 'renombrar al cliente ACTIVO debe reflejarse de inmediato en HERZON_DATA.paciente.nombre');
afirmar(eventosDeTipo('herzon:clientes-actualizados').length === 1, 'renombrarCliente debe emitir herzon:clientes-actualizados (la lista cambió)');
afirmar(eventosDeTipo('herzon:cliente-cambiado').length === 0, 'renombrarCliente NO debe emitir cliente-cambiado (no cambió quién está montado)');
var crudoTrasRenombrar = JSON.parse(mockStorage.getItem('rinde.datos.v1'));
afirmar(crudoTrasRenombrar.clientes[idDos].perfil.nombre === 'Persona Dos Renombrada', 'renombrarCliente debe persistir el nuevo nombre en localStorage');
Almacen.borrarTodo();

// ---------------------------------------------------------------------
// 7. actualizarPerfil(p): resincroniza el selector vía
//    herzon:clientes-actualizados cuando el nombre del activo cambia
//    (MC-02: "el select del header se resincroniza por evento").
// ---------------------------------------------------------------------
Almacen.crearCliente({ nombre: 'Perfil Editable', sexo: 'femenino', edad: 28, talla_cm: 160, pesoInicial_kg: 75, actividad: 'sedentario', objetivo: 'Pérdida de grasa' });
Almacen.agregarMedicion({ peso_kg: 74, grasa_pct: 33, musculo_kg: 24, cintura_cm: 90 });
afirmar(globalThis.HERZON_DATA.paciente.pesoActual_kg === 74, 'sanity: tras una medición, pesoActual_kg debe reflejarla antes de probar actualizarPerfil');
eventosCapturados.length = 0;
var okActualizar = Almacen.actualizarPerfil({ talla_cm: 162, actividad: 'ligero', nombre: 'Perfil Editado' });
afirmar(okActualizar === true, 'actualizarPerfil(p) en modo real con datos válidos debe devolver true');
afirmar(globalThis.HERZON_DATA.paciente.talla_cm === 162, 'actualizarPerfil(p) debe pisar SOLO las claves provistas (talla_cm)');
afirmar(globalThis.HERZON_DATA.paciente.pesoActual_kg === 74, 'actualizarPerfil(p) NO debe reiniciar pesoActual_kg al peso inicial: debe conservar la última medición');
afirmar(eventosDeTipo('herzon:clientes-actualizados').length === 1, 'actualizarPerfil debe emitir herzon:clientes-actualizados para resincronizar el selector con el nombre nuevo');
Almacen.borrarTodo();

// =========================================================================
// 8. guardarPlan(plan): persiste en clientes[activoId].plan y expone
//    HERZON_DATA.planAplicado de inmediato y tras un remontaje (MC-07).
// =========================================================================
var idConPlan = Almacen.crearCliente({ nombre: 'Cliente Con Plan' }).id;
var planGuardado = { plantillaId: 'estandar_1600', kcalObjetivo: 1600, fecha: '2026-02-01' };
var okGuardarPlan = Almacen.guardarPlan(planGuardado);
afirmar(okGuardarPlan === true || typeof okGuardarPlan === 'boolean', 'guardarPlan en modo real debe devolver un booleano (persistencia intentada)');
afirmar(globalThis.HERZON_DATA.planAplicado !== null, 'guardarPlan debe exponer HERZON_DATA.planAplicado de inmediato, sin esperar a un remontaje');
afirmar(globalThis.HERZON_DATA.planAplicado.plantillaId === 'estandar_1600' && globalThis.HERZON_DATA.planAplicado.kcalObjetivo === 1600, 'planAplicado debe reflejar EXACTAMENTE el plan guardado');
var crudoConPlan = JSON.parse(mockStorage.getItem('rinde.datos.v1'));
afirmar(crudoConPlan.clientes[idConPlan].plan.plantillaId === 'estandar_1600', 'guardarPlan debe persistir el plan en clientes[activoId].plan');

// Remontaje (crear otro cliente y volver): planAplicado debe reconstruirse
// desde el slot persistido, no perderse.
var idOtro = Almacen.crearCliente({ nombre: 'Otro Cliente Temporal' }).id;
afirmar(globalThis.HERZON_DATA.planAplicado === null, 'un cliente sin plan guardado debe montar planAplicado === null');
Almacen.seleccionarCliente(idConPlan);
afirmar(globalThis.HERZON_DATA.planAplicado !== null && globalThis.HERZON_DATA.planAplicado.plantillaId === 'estandar_1600', 'al re-montar el cliente con plan guardado, planAplicado debe reaparecer con el mismo contenido');

// guardarPlan(null) limpia el slot.
var okLimpiarPlan = Almacen.guardarPlan(null);
afirmar(okLimpiarPlan === true, 'guardarPlan(null) debe devolver true');
afirmar(globalThis.HERZON_DATA.planAplicado === null, 'guardarPlan(null) debe dejar HERZON_DATA.planAplicado en null');
var crudoSinPlan = JSON.parse(mockStorage.getItem('rinde.datos.v1'));
afirmar(crudoSinPlan.clientes[idConPlan].plan === null, 'guardarPlan(null) debe persistir plan:null');
Almacen.borrarTodo();

// =========================================================================
// 8b. agregarMedicion(m) detallado sobre un cliente real v2: semana
//     consecutiva, fecha del día, validación de rangos plausibles,
//     plicometría atómica, persistencia en clientes[activoId] (PR-07/MC-02)
//     y evento reutilizado herzon:mediciones-importadas.
// =========================================================================
var idMediciones = Almacen.crearCliente({ nombre: 'Cliente Mediciones', sexo: 'femenino', edad: 29, talla_cm: 165, pesoInicial_kg: 70, actividad: 'ligero', objetivo: 'Prueba' }).id;
eventosCapturados.length = 0;
var med1 = Almacen.agregarMedicion({ peso_kg: 70, grasa_pct: 32, musculo_kg: 25, cintura_cm: 88 });
afirmar(med1.ok === true && med1.medicion.semana === 1, 'la primera medición en una serie vacía debe asignarse a la semana 1');
afirmar(/^\d{4}-\d{2}-\d{2}$/.test(med1.medicion.fecha), 'agregarMedicion debe asignar una fecha con formato AAAA-MM-DD');
var med2 = Almacen.agregarMedicion({ peso_kg: 69.5, grasa_pct: 31.5, musculo_kg: 25.1, cintura_cm: 87.5 });
afirmar(med2.ok === true && med2.medicion.semana === 2, 'la segunda medición debe asignarse a la semana 2 (consecutiva)');
var med3 = Almacen.agregarMedicion({ peso_kg: 69, grasa_pct: 31, musculo_kg: 25.2, cintura_cm: 87, plicometria: { tricipital: 26, subescapular: 22, suprailiaco: 24, abdominal: 30 } });
afirmar(med3.ok === true && med3.medicion.plicometria.tricipital === 26, 'agregarMedicion con plicometría opcional válida debe devolver ok:true con la plicometría en el resultado');
afirmar(globalThis.HERZON_DATA.plicometria.cortes.length === 1 && globalThis.HERZON_DATA.plicometria.cortes[0] === 'S3', 'la plicometría de la medición #3 debe escribir un corte "S3"');
afirmar(globalThis.HERZON_DATA.paciente.pesoActual_kg === 69, 'pesoActual_kg debe seguir la ÚLTIMA medición registrada');
afirmar(eventosDeTipo('herzon:mediciones-importadas').length === 3, 'cada agregarMedicion exitoso debe emitir herzon:mediciones-importadas (3 en total)');

var crudoTrasMediciones = JSON.parse(mockStorage.getItem('rinde.datos.v1'));
afirmar(crudoTrasMediciones.clientes[idMediciones].series.peso_kg.length === 3, 'MC-02/PR-07: las 3 mediciones deben quedar persistidas en clientes[activoId].series (esquema v2)');

var seriesAntesDeInvalida = globalThis.HERZON_DATA.series.semanas.length;
var storageAntesDeInvalida = mockStorage.getItem('rinde.datos.v1');
var medInvalida = Almacen.agregarMedicion({ peso_kg: 500, grasa_pct: 30, musculo_kg: 25, cintura_cm: 85 });
afirmar(medInvalida.ok === false && /peso_kg/.test(medInvalida.errores[0]), 'agregarMedicion con peso_kg=500 (fuera de 20-400) debe rechazar mencionando el campo');
afirmar(globalThis.HERZON_DATA.series.semanas.length === seriesAntesDeInvalida, 'una medición inválida NO debe agregar una fila a la serie');
afirmar(mockStorage.getItem('rinde.datos.v1') === storageAntesDeInvalida, 'una medición inválida NO debe reescribir localStorage');

var medPlicoInvalida = Almacen.agregarMedicion({ peso_kg: 68, grasa_pct: 30, musculo_kg: 25, cintura_cm: 86, plicometria: { tricipital: 26, subescapular: 22, suprailiaco: 24 } });
afirmar(medPlicoInvalida.ok === false, 'una plicometría incompleta (falta abdominal) debe invalidar TODA la medición');
afirmar(globalThis.HERZON_DATA.series.semanas.length === seriesAntesDeInvalida, 'una medición con plicometría inválida NO debe agregar una fila (atomicidad)');
Almacen.borrarTodo();

// =========================================================================
// 8c. mergeMediciones(lista) detallado sobre un cliente real v2: agrega
//     semana nueva, actualiza semana existente, reordena cronológicamente,
//     ignora filas malformadas, y persiste en clientes[activoId] (PR-07).
// =========================================================================
var idMerge = Almacen.crearCliente({ nombre: 'Cliente Merge' }).id;
Almacen.agregarMedicion({ peso_kg: 70, grasa_pct: 32, musculo_kg: 25, cintura_cm: 88 });
Almacen.agregarMedicion({ peso_kg: 69.5, grasa_pct: 31.5, musculo_kg: 25.1, cintura_cm: 87.5 });
eventosCapturados.length = 0;
var resultadoMerge = Almacen.mergeMediciones([
  { semana: 3, fecha: '2026-06-22', peso_kg: 68.5, grasa_pct: 30.5, musculo_kg: 25.3, cintura_cm: 86.5 },
  { semana: 2, fecha: '2026-06-08', peso_kg: 69.8, grasa_pct: 31.8, musculo_kg: 25.0, cintura_cm: 87.8 },
  { semana: 5, fecha: 'no-es-una-fecha-valida' } // fila malformada: debe ignorarse sin lanzar
]);
afirmar(resultadoMerge.ok === true && resultadoMerge.agregadas === 1 && resultadoMerge.actualizadas === 1, 'mergeMediciones debe reportar 1 agregada (semana 3) y 1 actualizada (semana 2)');
afirmar(globalThis.HERZON_DATA.series.semanas.join(',') === '1,2,3', 'tras el merge, series.semanas debe quedar reordenada cronológicamente (1,2,3)');
afirmar(globalThis.HERZON_DATA.series.peso_kg[1] === 69.8, 'tras el merge, la semana 2 (índice 1) debe reflejar el peso_kg actualizado (69.8)');
afirmar(eventosDeTipo('herzon:mediciones-importadas').length === 1 && eventosDeTipo('herzon:mediciones-importadas')[0].detail.agregadas === 1, 'mergeMediciones con cambios debe emitir herzon:mediciones-importadas (reutilizado) con el detail correcto');
var crudoTrasMerge = JSON.parse(mockStorage.getItem('rinde.datos.v1'));
afirmar(crudoTrasMerge.clientes[idMerge].series.semanas.join(',') === '1,2,3', 'PR-07: mergeMediciones debe persistir el resultado en clientes[activoId].series');
var mergeSinCambios = Almacen.mergeMediciones([]);
afirmar(mergeSinCambios.ok === true && mergeSinCambios.agregadas === 0 && mergeSinCambios.actualizadas === 0, 'mergeMediciones([]) debe devolver ok:true sin agregar ni actualizar nada');
Almacen.borrarTodo();

// =========================================================================
// 8d. activarReal(perfil) -- SUPERSEDE del Adendum R8 (Adendum R9 punto 3):
//     con perfil equivale a crearCliente(perfil); sin perfil y sin
//     clientes despacha el alta en vez de crear un real anónimo; sin
//     perfil y con clientes recupera el activo conocido.
// =========================================================================
eventosCapturados.length = 0;
var modoTrasActivarSinNada = Almacen.activarReal();
afirmar(modoTrasActivarSinNada === 'demo', 'activarReal() sin perfil y sin clientes debe QUEDARSE en demo (no crear un real anónimo)');
afirmar(eventosDeTipo('herzon:cliente-nuevo-solicitado').length === 1, 'activarReal() sin perfil y sin clientes debe despachar herzon:cliente-nuevo-solicitado');

eventosCapturados.length = 0;
var modoTrasActivarConPerfil = Almacen.activarReal({ nombre: 'Activado Directo', sexo: 'masculino', edad: 35 });
afirmar(modoTrasActivarConPerfil === 'real', 'activarReal(perfil) debe equivaler a crearCliente(perfil): deja el modo en "real"');
afirmar(globalThis.HERZON_DATA.paciente.nombre === 'Activado Directo', 'activarReal(perfil) debe montar el paciente con el perfil dado');
afirmar(eventosDeTipo('herzon:cliente-cambiado').length === 1, 'activarReal(perfil) debe emitir cliente-cambiado (mismo camino que crearCliente)');

Almacen.volverADemo();
eventosCapturados.length = 0;
var modoTrasActivarConClientes = Almacen.activarReal();
afirmar(modoTrasActivarConClientes === 'real', 'activarReal() sin perfil, CON un cliente ya conocido, debe recuperarlo (no quedarse en demo)');
afirmar(globalThis.HERZON_DATA.paciente.nombre === 'Activado Directo', 'activarReal() sin perfil debe montar el ÚLTIMO cliente activo conocido, sin perder sus datos');
afirmar(eventosDeTipo('herzon:cliente-nuevo-solicitado').length === 0, 'con clientes ya guardados, activarReal() sin perfil NO debe despachar herzon:cliente-nuevo-solicitado');
Almacen.borrarTodo();

// ---------------------------------------------------------------------
// 9. meta.nota/meta.generado por modo (PR-06): real ya cubierto arriba;
//    demo debe conservar el catálogo original SIN alterarse por haber
//    pasado por modo real (ninguna referencia compartida contaminó
//    datosOriginalDemo).
// ---------------------------------------------------------------------
Almacen.crearCliente({ nombre: 'Cliente Nota' });
Almacen.volverADemo();
afirmar(globalThis.HERZON_DATA.meta.nota === DEMO_NOTA_ORIGINAL, 'volverADemo() debe restaurar meta.nota EXACTAMENTE al texto sintético original (no el de PR-06)');
afirmar(globalThis.HERZON_DATA.meta.generado === DEMO_GENERADO_ORIGINAL, 'volverADemo() debe restaurar meta.generado al valor original del catálogo (no "real")');
Almacen.borrarTodo();

// =========================================================================
// 10. Migración v1 -> v2 (MC-01), idempotente: proceso node NUEVO con un
//     payload v1 pre-sembrado en el mock de localStorage, ANTES de
//     requerir build/almacen.js (que migra de forma síncrona en su
//     arranque).
// =========================================================================
var payloadV1 = JSON.stringify({
  version: 1,
  modo: 'real',
  paciente: {
    nombre: 'Migrado Uno', edad: 33, sexo: 'femenino', talla_cm: 160,
    pesoInicial_kg: 65, pesoActual_kg: 63, imcInicial: 25.4, imcActual: 24.6,
    objetivo: 'Prueba de migración', actividad: 'ligero', diagnosticos: [],
    alergias: [], restricciones: [], gastoEnergetico: { tmb_kcal: 1300, get_kcal: 1800 }, inicio: '2026-01-01'
  },
  series: { semanas: [1], fechas: ['2026-01-08'], peso_kg: [63], grasa_pct: [30], musculo_kg: [24], cintura_cm: [80], adherenciaDieta_pct: [70], adherenciaDiaria: [] },
  labs: { cortes: [], marcadores: [] },
  plicometria: { unidad: 'mm', cortes: [], sitios: [], sumaPliegues_mm: [] },
  suplementos: []
});

var scriptMigracion = [
  'globalThis.window = globalThis;',
  'var almacenCrudo = { "rinde.datos.v1": ' + JSON.stringify(payloadV1) + ' };',
  'globalThis.localStorage = {',
  '  getItem: function (k) { return Object.prototype.hasOwnProperty.call(almacenCrudo, k) ? almacenCrudo[k] : null; },',
  '  setItem: function (k, v) { almacenCrudo[k] = String(v); },',
  '  removeItem: function (k) { delete almacenCrudo[k]; }',
  '};',
  'require(' + JSON.stringify(TESTDOM_PATH) + ');',
  'require(' + JSON.stringify(DATA_PATH) + ');',
  'require(' + JSON.stringify(ALMACEN_PATH) + ');',
  'if (Herzon.Almacen.modo() !== "real") { process.exit(2); }',
  'var lista1 = Herzon.Almacen.clientes();',
  'if (lista1.length !== 1) { process.exit(3); }',
  'if (lista1[0].nombre !== "Migrado Uno") { process.exit(4); }',
  'if (globalThis.HERZON_DATA.series.peso_kg.length !== 1 || globalThis.HERZON_DATA.series.peso_kg[0] !== 63) { process.exit(5); }',
  'var crudo = JSON.parse(almacenCrudo["rinde.datos.v1"]);',
  'if (crudo.version !== 2) { process.exit(6); }', // reescritura inmediata en v2
  'if (crudo.activoId !== lista1[0].id) { process.exit(7); }',
  'var idPrimero = lista1[0].id;',
  'Herzon.Almacen.cargar();', // segunda pasada: NO debe volver a migrar (idempotente)
  'var lista2 = Herzon.Almacen.clientes();',
  'if (lista2.length !== 1) { process.exit(8); }',
  'if (lista2[0].id !== idPrimero) { process.exit(9); }',
  'process.exit(0);'
].join('\n');

var resultadoMigracion = childProcess.spawnSync(process.execPath, ['-e', scriptMigracion], { encoding: 'utf8' });
afirmar(resultadoMigracion.status === 0, 'migración v1->v2 idempotente falló (status=' + resultadoMigracion.status + '); stderr: ' + (resultadoMigracion.stderr || ''));

// version desconocida / corrupta => demo funcional sin lanzar.
var scriptCorrupcion = [
  'globalThis.window = globalThis;',
  'var almacenCrudo = { "rinde.datos.v1": "{ esto no es json valido" };',
  'globalThis.localStorage = {',
  '  getItem: function (k) { return Object.prototype.hasOwnProperty.call(almacenCrudo, k) ? almacenCrudo[k] : null; },',
  '  setItem: function (k, v) { almacenCrudo[k] = String(v); },',
  '  removeItem: function (k) { delete almacenCrudo[k]; }',
  '};',
  'require(' + JSON.stringify(TESTDOM_PATH) + ');',
  'require(' + JSON.stringify(DATA_PATH) + ');',
  'require(' + JSON.stringify(ALMACEN_PATH) + ');',
  'if (Herzon.Almacen.modo() !== "demo") { process.exit(2); }',
  'if (Herzon.Almacen.clientes().length !== 0) { process.exit(3); }',
  'process.exit(0);'
].join('\n');
var resultadoCorrupcion = childProcess.spawnSync(process.execPath, ['-e', scriptCorrupcion], { encoding: 'utf8' });
afirmar(resultadoCorrupcion.status === 0, 'JSON corrupto en localStorage debe resolver en modo demo sin lanzar (status=' + resultadoCorrupcion.status + ')');

// version desconocida (ni 1 ni 2) => demo funcional.
var scriptVersionDesconocida = [
  'globalThis.window = globalThis;',
  'var almacenCrudo = { "rinde.datos.v1": JSON.stringify({ version: 99, algo: "raro" }) };',
  'globalThis.localStorage = {',
  '  getItem: function (k) { return Object.prototype.hasOwnProperty.call(almacenCrudo, k) ? almacenCrudo[k] : null; },',
  '  setItem: function (k, v) { almacenCrudo[k] = String(v); },',
  '  removeItem: function (k) { delete almacenCrudo[k]; }',
  '};',
  'require(' + JSON.stringify(TESTDOM_PATH) + ');',
  'require(' + JSON.stringify(DATA_PATH) + ');',
  'require(' + JSON.stringify(ALMACEN_PATH) + ');',
  'if (Herzon.Almacen.modo() !== "demo") { process.exit(2); }',
  'process.exit(0);'
].join('\n');
var resultadoVersionDesconocida = childProcess.spawnSync(process.execPath, ['-e', scriptVersionDesconocida], { encoding: 'utf8' });
afirmar(resultadoVersionDesconocida.status === 0, 'version desconocida en localStorage debe resolver en modo demo sin lanzar (status=' + resultadoVersionDesconocida.status + ')');

// activoId colgante SIN clientes => demo. activoId colgante CON clientes
// => se monta el primero por creado.
var scriptActivoIdColgante = [
  'globalThis.window = globalThis;',
  'var almacenCrudo = { "rinde.datos.v1": JSON.stringify({ version: 2, activoId: "c-fantasma", clientes: {} }) };',
  'globalThis.localStorage = {',
  '  getItem: function (k) { return Object.prototype.hasOwnProperty.call(almacenCrudo, k) ? almacenCrudo[k] : null; },',
  '  setItem: function (k, v) { almacenCrudo[k] = String(v); },',
  '  removeItem: function (k) { delete almacenCrudo[k]; }',
  '};',
  'require(' + JSON.stringify(TESTDOM_PATH) + ');',
  'require(' + JSON.stringify(DATA_PATH) + ');',
  'require(' + JSON.stringify(ALMACEN_PATH) + ');',
  'if (Herzon.Almacen.modo() !== "demo") { process.exit(2); }',
  'process.exit(0);'
].join('\n');
var resultadoActivoIdColgante = childProcess.spawnSync(process.execPath, ['-e', scriptActivoIdColgante], { encoding: 'utf8' });
afirmar(resultadoActivoIdColgante.status === 0, 'activoId colgante SIN clientes debe resolver en modo demo sin lanzar (status=' + resultadoActivoIdColgante.status + ')');

var scriptActivoIdColganteConClientes = [
  'globalThis.window = globalThis;',
  'var clientesCrudos = {};',
  'clientesCrudos["c-real"] = { perfil: { nombre: "Real Existente" }, series: { semanas: [], fechas: [], peso_kg: [], grasa_pct: [], musculo_kg: [], cintura_cm: [], adherenciaDieta_pct: [], adherenciaDiaria: [] }, labs: { cortes: [], marcadores: [] }, plicometria: { unidad: "mm", cortes: [], sitios: [], sumaPliegues_mm: [] }, suplementos: [], plan: null, creado: "2026-01-01" };',
  'var almacenCrudo = { "rinde.datos.v1": JSON.stringify({ version: 2, activoId: "c-fantasma-inexistente", clientes: clientesCrudos }) };',
  'globalThis.localStorage = {',
  '  getItem: function (k) { return Object.prototype.hasOwnProperty.call(almacenCrudo, k) ? almacenCrudo[k] : null; },',
  '  setItem: function (k, v) { almacenCrudo[k] = String(v); },',
  '  removeItem: function (k) { delete almacenCrudo[k]; }',
  '};',
  'require(' + JSON.stringify(TESTDOM_PATH) + ');',
  'require(' + JSON.stringify(DATA_PATH) + ');',
  'require(' + JSON.stringify(ALMACEN_PATH) + ');',
  'if (Herzon.Almacen.modo() !== "real") { process.exit(2); }',
  'if (globalThis.HERZON_DATA.paciente.nombre !== "Real Existente") { process.exit(3); }',
  'process.exit(0);'
].join('\n');
var resultadoActivoIdColganteConClientes = childProcess.spawnSync(process.execPath, ['-e', scriptActivoIdColganteConClientes], { encoding: 'utf8' });
afirmar(resultadoActivoIdColganteConClientes.status === 0, 'activoId colgante CON clientes debe montar el primero por creado, sin lanzar (status=' + resultadoActivoIdColganteConClientes.status + ')');

// ---------------------------------------------------------------------
// 10b. Casos borde de gestión de clientes: eliminar/renombrar un id
//      inexistente no debe lanzar; borrarTodo() reinicia TODOS los
//      clientes (MC-06), no solo el activo.
// ---------------------------------------------------------------------
var resultadoEliminarInexistente = Almacen.eliminarCliente('c-no-existe');
afirmar(resultadoEliminarInexistente.ok === false, 'eliminarCliente con un id inexistente debe devolver ok:false sin lanzar');
var resultadoRenombrarInexistente = Almacen.renombrarCliente('c-no-existe', 'Cualquiera');
afirmar(resultadoRenombrarInexistente.ok === false, 'renombrarCliente con un id inexistente debe devolver ok:false sin lanzar');
var modoTrasSeleccionarInexistente = Almacen.seleccionarCliente('c-no-existe');
afirmar(modoTrasSeleccionarInexistente === Almacen.modo(), 'seleccionarCliente con un id inexistente debe ser un no-op (mismo modo, sin lanzar)');

Almacen.crearCliente({ nombre: 'Borrado Uno' });
Almacen.crearCliente({ nombre: 'Borrado Dos' });
afirmar(Almacen.clientes().length === 2, 'sanity: deben existir 2 clientes antes de borrarTodo()');
eventosCapturados.length = 0;
var okBorrarTodoConClientes = Almacen.borrarTodo();
afirmar(okBorrarTodoConClientes === true, 'borrarTodo() debe devolver true cuando localStorage está disponible');
afirmar(Almacen.clientes().length === 0, 'borrarTodo() debe reiniciar TODOS los clientes guardados, no solo el activo (MC-06)');
afirmar(Almacen.modo() === 'demo', 'borrarTodo() desde modo real debe regresar el modo a "demo"');
afirmar(mockStorage.getItem('rinde.datos.v1') === null, 'borrarTodo() debe dejar localStorage.getItem("rinde.datos.v1") en null');
afirmar(eventosDeTipo('herzon:modo-cambiado').length === 1 && eventosDeTipo('herzon:modo-cambiado')[0].detail.modo === 'demo', 'borrarTodo() desde real debe emitir herzon:modo-cambiado hacia demo');
afirmar(eventosDeTipo('herzon:clientes-actualizados').length === 1, 'borrarTodo() debe emitir herzon:clientes-actualizados (la lista quedó vacía)');

// borrarTodo() llamado YA en modo demo: limpia igual, sin emitir
// modo-cambiado (el modo no cambió).
eventosCapturados.length = 0;
afirmar(Almacen.borrarTodo() === true, 'borrarTodo() en modo demo también debe devolver true');
afirmar(eventosDeTipo('herzon:modo-cambiado').length === 0, 'borrarTodo() ya en modo demo NO debe emitir herzon:modo-cambiado (el modo no cambió)');

// clientes() ordenados por fecha de creación.
var idOrdenUno = Almacen.crearCliente({ nombre: 'Orden Uno' }).id;
Almacen.crearCliente({ nombre: 'Orden Dos' });
var listaOrdenada = Almacen.clientes();
afirmar(listaOrdenada.length === 2 && typeof listaOrdenada[0].creado === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(listaOrdenada[0].creado), 'clientes() debe traer el campo "creado" en formato AAAA-MM-DD');
afirmar(listaOrdenada[0].id === idOrdenUno, 'clientes() debe listar primero al creado antes (mismo día: desempate determinístico por id)');
Almacen.borrarTodo();

// ---------------------------------------------------------------------
// 11. Tolerancia a localStorage AUSENTE desde el arranque (Adendum R8
//     punto 1). Proceso node NUEVO, sin tocar `localStorage` en ningún
//     momento.
// ---------------------------------------------------------------------
var scriptArranqueSinStorage = [
  'globalThis.window = globalThis;',
  'require(' + JSON.stringify(TESTDOM_PATH) + ');',
  'require(' + JSON.stringify(DATA_PATH) + ');',
  'require(' + JSON.stringify(ALMACEN_PATH) + ');',
  'if (typeof globalThis.localStorage !== "undefined") { process.exit(9); }',
  'if (Herzon.Almacen.modo() !== "demo") { process.exit(2); }',
  'if (!globalThis.HERZON_DATA || globalThis.HERZON_DATA.series.peso_kg.length !== 12) { process.exit(3); }',
  'if (Herzon.Almacen.clientes().length !== 0) { process.exit(10); }',
  'var r = Herzon.Almacen.agregarMedicion({ peso_kg: 70, grasa_pct: 30, musculo_kg: 25, cintura_cm: 85 });',
  'if (r.ok !== false) { process.exit(4); }', // sigue en demo: agregarMedicion debe rechazar, no lanzar
  'var creacion = Herzon.Almacen.crearCliente({ nombre: "Sin Storage" });', // crear SÍ es posible, pero no puede persistir
  'if (creacion.ok !== true) { process.exit(5); }',
  'if (Herzon.Almacen.modo() !== "real") { process.exit(6); }',
  'process.exit(0);'
].join('\n');

var resultadoSubproceso = childProcess.spawnSync(process.execPath, ['-e', scriptArranqueSinStorage], { encoding: 'utf8' });
afirmar(resultadoSubproceso.status === 0, 'build/almacen.js debe arrancar en modo demo funcional SIN errores cuando localStorage nunca existió (proceso node limpio); stderr: ' + (resultadoSubproceso.stderr || '') + ' status: ' + resultadoSubproceso.status);

// =========================================================================
// 12. Cableado de UI (#hz-btn-modo / #hz-modo-datos / #hz-cliente-selector):
//     badge oculto en real (PR-02, decisión C1), textos exactos, y
//     poblacion/cableado del selector (MC-03).
// =========================================================================
afirmar(Almacen.initUI(null) === null, 'initUI(doc) sin doc y sin G.document debe devolver null sin lanzar');

function crearDocumentoConHeader(conElementos, conSelector) {
  var docPrueba = TestDOM.crearDocumento();
  var registro = {};
  function crear(tag, id) {
    var el = docPrueba.createElement(tag);
    if (id) { el.setAttribute('id', id); registro[id] = el; }
    return el;
  }
  docPrueba.getElementById = function (id) { return registro[id] || null; };
  var elementos = {};
  if (conElementos) {
    elementos.badge = crear('span', 'hz-modo-datos');
    elementos.boton = crear('button', 'hz-btn-modo');
  }
  if (conSelector) {
    elementos.selector = crear('select', 'hz-cliente-selector');
  }
  return { doc: docPrueba, badge: elementos.badge, boton: elementos.boton, selector: elementos.selector };
}

var fixtureSinElementos = crearDocumentoConHeader(false, false);
afirmar(Almacen.initUI(fixtureSinElementos.doc) === null, 'initUI(doc) sin #hz-modo-datos/#hz-btn-modo debe devolver null sin lanzar');

var localStorageParaUI = crearLocalStorageMock();
globalThis.localStorage = localStorageParaUI;
Almacen.borrarTodo();
afirmar(Almacen.modo() === 'demo', 'sanity: antes de probar el cableado de UI, el modo debe estar en demo');

var fixtureSinSelector = crearDocumentoConHeader(true, false);
var handleSinSelector = Almacen.initUI(fixtureSinSelector.doc);
afirmar(handleSinSelector !== null, 'initUI(doc) sin #hz-cliente-selector debe seguir funcionando (tolera un shell.html todavía sin el select, back-compat)');
afirmar(fixtureSinSelector.badge.textContent === 'MODO DEMO', 'en modo demo, el badge debe decir exactamente "MODO DEMO" (PR-02, decisión C1: literal nuevo, ya no "DATOS SINTETICOS")');
afirmar(fixtureSinSelector.badge.hasAttribute('hidden') === false, 'en modo demo, el badge NO debe estar oculto');
afirmar(fixtureSinSelector.boton.textContent === 'Usar mis datos', 'en modo demo, el botón debe decir "Usar mis datos"');

var fixtureUI = crearDocumentoConHeader(true, true);
var handleUI = Almacen.initUI(fixtureUI.doc);
afirmar(handleUI !== null && typeof handleUI.sincronizar === 'function', 'initUI(doc) con los elementos presentes debe devolver un handle con sincronizar');
afirmar(fixtureUI.badge.textContent === 'MODO DEMO', 'en modo demo, el badge debe decir "MODO DEMO"');
afirmar(fixtureUI.badge.hasAttribute('hidden') === false, 'en modo demo, el badge NO debe estar oculto');
afirmar(fixtureUI.boton.textContent === 'Usar mis datos', 'en modo demo, el botón debe decir "Usar mis datos"');

// Selector en demo, sin clientes: option Demo (seleccionada) + "+ Nuevo
// cliente...".
var opcionesDemoSinClientes = fixtureUI.selector.consultarTodo('option');
afirmar(opcionesDemoSinClientes.length === 2, 'en demo sin clientes, el selector debe traer 2 options: Demo + Nuevo cliente');
afirmar(opcionesDemoSinClientes[0].getAttribute('value') === '__demo__' && opcionesDemoSinClientes[0].textContent === 'Demo: Daniela Reyes Cortez', 'la primera option en demo debe ser "Demo: Daniela Reyes Cortez" con value="__demo__"');
afirmar(opcionesDemoSinClientes[0].hasAttribute('selected') === true, 'la option Demo debe llevar el atributo selected cuando el modo es demo');
afirmar(opcionesDemoSinClientes[1].getAttribute('value') === '__nuevo__' && opcionesDemoSinClientes[1].textContent === '+ Nuevo cliente…', 'la última option debe ser "+ Nuevo cliente…" con value="__nuevo__"');
afirmar(fixtureUI.selector.value === '__demo__', 'el value del selector debe quedar en "__demo__" en modo demo sin clientes');

// Botón #hz-btn-modo con 0 clientes: despacha herzon:cliente-nuevo-solicitado
// EN VEZ DE crear un real anónimo (MC-03).
eventosCapturados.length = 0;
fixtureSinSelector.boton.despachar('click');
afirmar(Almacen.modo() === 'demo', 'click en #hz-btn-modo con 0 clientes NO debe activar un real anónimo: debe quedarse en demo');
afirmar(eventosDeTipo('herzon:cliente-nuevo-solicitado').length === 1, 'click en #hz-btn-modo con 0 clientes debe despachar herzon:cliente-nuevo-solicitado');

// El selector con value="__nuevo__" (usuario elige "+ Nuevo cliente...")
// también despacha el evento y restaura la selección anterior.
eventosCapturados.length = 0;
fixtureUI.selector.value = '__nuevo__';
fixtureUI.selector.despachar('change');
afirmar(eventosDeTipo('herzon:cliente-nuevo-solicitado').length === 1, 'elegir "+ Nuevo cliente..." en el selector debe despachar herzon:cliente-nuevo-solicitado');
afirmar(fixtureUI.selector.value === '__demo__', 'tras elegir "+ Nuevo cliente...", el selector debe restaurar la selección anterior ("__demo__", seguíamos en demo)');

// Crear un cliente vía API y comprobar que el selector se reconstruye SOLO
// por los eventos (sin llamada directa desde este test).
eventosCapturados.length = 0;
var creacionParaSelector = Almacen.crearCliente({ nombre: 'Selector Uno' });
afirmar(creacionParaSelector.ok === true, 'sanity: crearCliente para probar el selector debe tener éxito');
afirmar(fixtureUI.badge.hasAttribute('hidden') === true, 'PR-02: en modo real, el badge debe quedar OCULTO (atributo hidden), sin texto sustituto');
afirmar(fixtureUI.boton.textContent === 'Ver demo', 'tras activar real, el botón debe decir "Ver demo"');
var opcionesTrasCrear = fixtureUI.selector.consultarTodo('option');
afirmar(opcionesTrasCrear.length === 2, 'en real con 1 cliente, el selector debe traer 2 options: el cliente + Nuevo cliente (SIN la opción demo)');
afirmar(opcionesTrasCrear[0].getAttribute('value') === creacionParaSelector.id && opcionesTrasCrear[0].textContent === 'Selector Uno', 'la option del cliente activo debe traer su id como value y su nombre como texto');
afirmar(opcionesTrasCrear[0].hasAttribute('selected') === true, 'la option del cliente activo debe llevar selected');
afirmar(fixtureUI.selector.value === creacionParaSelector.id, 'el value del selector debe quedar en el id del cliente recién creado');

// change hacia "__demo__": vuelve a demo.
eventosCapturados.length = 0;
fixtureUI.selector.value = '__demo__';
fixtureUI.selector.despachar('change');
afirmar(Almacen.modo() === 'demo', 'elegir la option Demo en el selector debe volver a modo demo');
afirmar(fixtureUI.badge.hasAttribute('hidden') === false, 'de regreso en demo, el badge debe reaparecer (sin atributo hidden)');

// Botón #hz-btn-modo con clientes guardados: recupera el conocido (NO
// despacha alta).
eventosCapturados.length = 0;
fixtureUI.boton.despachar('click');
afirmar(Almacen.modo() === 'real', 'click en #hz-btn-modo con clientes ya guardados debe reactivar el último conocido');
afirmar(globalThis.HERZON_DATA.paciente.nombre === 'Selector Uno', 'el click debe recuperar el mismo cliente que estaba activo, no crear uno nuevo');
afirmar(eventosDeTipo('herzon:cliente-nuevo-solicitado').length === 0, 'con clientes ya guardados, el click NO debe despachar herzon:cliente-nuevo-solicitado');

// change hacia el id del cliente vía el selector.
var idSelectorDos = Almacen.crearCliente({ nombre: 'Selector Dos' }).id;
eventosCapturados.length = 0;
fixtureUI.selector.value = creacionParaSelector.id;
fixtureUI.selector.despachar('change');
afirmar(globalThis.HERZON_DATA.paciente.nombre === 'Selector Uno', 'elegir el id de un cliente en el selector debe montarlo (seleccionarCliente)');
var opcionesConDos = fixtureUI.selector.consultarTodo('option');
afirmar(opcionesConDos.length === 3, 'con 2 clientes reales, el selector debe traer 3 options (2 clientes + Nuevo cliente)');

// REGRESIÓN (verifier-herzon, T-045 intento 1): volverADemo() disparado por
// el flujo REAL de la UI (click en #hz-btn-modo, no una llamada directa a la
// función) debe reconstruir el selector a la option Demo seleccionada de
// inmediato. Antes del fix, el badge/botón cambiaban correctamente pero el
// selector se quedaba mostrando el cliente que estaba activo, porque
// volverADemo() solo emitía herzon:modo-cambiado (que el selector no
// escucha) y no herzon:clientes-actualizados/herzon:cliente-cambiado.
eventosCapturados.length = 0;
fixtureUI.boton.despachar('click');
afirmar(Almacen.modo() === 'demo', 'click en #hz-btn-modo estando en real con clientes guardados debe volver a demo');
var opcionesTrasClickModoDemo = fixtureUI.selector.consultarTodo('option');
afirmar(opcionesTrasClickModoDemo.length === 4, 'REGRESIÓN: de vuelta en demo con 2 clientes guardados, el selector debe traer 4 options: Demo + 2 clientes + Nuevo cliente');
afirmar(opcionesTrasClickModoDemo[0].getAttribute('value') === '__demo__' && opcionesTrasClickModoDemo[0].hasAttribute('selected') === true, 'REGRESIÓN: tras volver a demo por click en #hz-btn-modo, la option Demo debe reconstruirse seleccionada, no quedarse en el cliente previamente activo');
afirmar(fixtureUI.selector.value === '__demo__', 'REGRESIÓN: el value del selector debe quedar en "__demo__" tras el click en #hz-btn-modo, nunca en null ni en el id del cliente anterior');

// Recuperar el modo real (activarReal() sin perfil, con clientes guardados,
// remonta el último activo conocido) para dejar el fixture listo para la
// siguiente regresión.
fixtureUI.boton.despachar('click');
afirmar(Almacen.modo() === 'real' && globalThis.HERZON_DATA.paciente.nombre === 'Selector Uno', 'sanity: el click debe recuperar a "Selector Uno" como activo antes de probar eliminarCliente');

// REGRESIÓN (verifier-herzon, T-045 intento 1): eliminarCliente() del
// ÚLTIMO cliente activo, con initUI ya cableado (flujo real, no solo la
// llamada directa a la API), también debe reconstruir el selector a la
// option Demo seleccionada -- el caso que el verifier reprodujo con
// eliminar B (no activo) y luego eliminar A (activo y último).
eventosCapturados.length = 0;
var resultadoEliminarNoActivo = Almacen.eliminarCliente(idSelectorDos);
afirmar(resultadoEliminarNoActivo.ok === true && Almacen.modo() === 'real', 'eliminar el cliente NO activo debe conservar el modo real');
var resultadoEliminarUltimoActivo = Almacen.eliminarCliente(creacionParaSelector.id);
afirmar(resultadoEliminarUltimoActivo.ok === true && resultadoEliminarUltimoActivo.restantes === 0, 'eliminar el último cliente activo debe reportar 0 restantes');
afirmar(Almacen.modo() === 'demo', 'eliminar el último cliente activo debe volver a modo demo');
var opcionesTrasEliminarUltimo = fixtureUI.selector.consultarTodo('option');
afirmar(opcionesTrasEliminarUltimo.length === 2, 'REGRESIÓN: tras eliminar el último cliente activo, el selector debe volver a 2 options: Demo + Nuevo cliente');
afirmar(opcionesTrasEliminarUltimo[0].getAttribute('value') === '__demo__' && opcionesTrasEliminarUltimo[0].textContent === 'Demo: Daniela Reyes Cortez' && opcionesTrasEliminarUltimo[0].hasAttribute('selected') === true, 'REGRESIÓN: la option Demo debe reconstruirse seleccionada tras eliminar el último cliente (initUI ya cableado)');
afirmar(fixtureUI.selector.value === '__demo__', 'REGRESIÓN: el value del selector debe quedar en "__demo__" tras eliminar el último cliente, no en null ni en "__nuevo__"');

Almacen.borrarTodo();
globalThis.localStorage = mockStorage;

// ---------------------------------------------------------------------
// 13. Cero innerHTML, cero red, cero emojis, cero hexes (no negociables de
//     plan.md): este módulo es solo datos/UI mínima del header, no debería
//     tener NINGÚN hex.
// ---------------------------------------------------------------------
afirmar(fuenteAlmacen.indexOf('innerHTML') === -1, 'build/almacen.js no debe usar innerHTML en ninguna parte (textContent siempre)');
afirmar(fuenteAlmacen.indexOf('fetch(') === -1, 'build/almacen.js no debe usar fetch (cero red)');
afirmar(fuenteAlmacen.indexOf('XMLHttpRequest') === -1, 'build/almacen.js no debe usar XMLHttpRequest (cero red)');
afirmar(!REGEX_EMOJI.test(fuenteAlmacen), 'build/almacen.js no debe contener emojis (regla dura de Mario)');
var hexesEnAlmacen = fuenteAlmacen.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
afirmar(hexesEnAlmacen.length === 0, 'build/almacen.js es solo datos/persistencia/UI mínima: no debe traer NINGÚN hex de color (' + hexesEnAlmacen.join(', ') + ')');

// ---------------------------------------------------------------------
// 14. Anti-regresión de acentos (auditoría previa al hand-off): ninguna
//     de estas palabras en español sin acento/eñe puede reaparecer en el
//     CÓDIGO FUENTE de este módulo (prosa de comentarios y mensajes).
//     "catalogo"/"boton" quedan fuera a propósito: son identificadores
//     legítimos, mismo precedente que "seccion" en selfcheck_docs.js.
//     "medicion"/"plicometria"/"almacen" tampoco entran: son claves de
//     datos/nombre de módulo, no prosa.
// ---------------------------------------------------------------------
var PALABRAS_SIN_ACENTO_PROHIBIDAS = [
  'invalido', 'invalida', 'invalidos', 'numero', 'validacion', 'importacion',
  'automatico', 'automatica', 'basica', 'basico', 'facil', 'metodo',
  'modulo', 'vacio', 'vacios', 'vacia', 'vacias', 'sesion', 'sincrono',
  'sincrona', 'logica', 'pagina', 'aqui', 'tambien', 'parametro',
  'construccion', 'publicacion', 'confirmacion', 'cronologicamente',
  'mutacion', 'formula', 'diseno', 'dialogos', 'unica', 'unico', 'ultima',
  'ultimo', 'anios', 'estan', 'clasico', 'clasica', 'aceptacion'
];
for (var pa = 0; pa < PALABRAS_SIN_ACENTO_PROHIBIDAS.length; pa++) {
  var palabra = PALABRAS_SIN_ACENTO_PROHIBIDAS[pa];
  var regexPalabra = new RegExp('\\b' + palabra + '\\b');
  afirmar(!regexPalabra.test(fuenteAlmacen), 'build/almacen.js contiene la palabra sin acento "' + palabra + '": revisar y corregir a español con acentos/eñe');
}

// ---------------------------------------------------------------------
console.log('checks ejecutados: ' + contador);
process.exit(0);
