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
// Copia profunda del catálogo demo ORIGINAL, para construir fixtures de
// "cliente vacío" (Adendum R8 punto 4 / R9 multi-cliente) sin depender de
// mutaciones que otras secciones de este mismo selfcheck le hagan a DATA
// más abajo (sección 11 reasigna arreglos de DATA.series in situ).
var DATA_ORIGINAL_JSON = JSON.stringify(DATA);

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

// R9 (Adendum R9 punto 3): bus de eventos global GENÉRICO -- captura
// CUALQUIER tipo (`herzon:mediciones-importadas`, `herzon:modo-cambiado`,
// `herzon:cliente-nuevo-solicitado`), no solo el de importación como en R8.
// Node no implementa addEventListener sobre globalThis (a diferencia de un
// navegador real): se stubea para poder invocar los manejadores capturados
// directamente más abajo, mismo patrón que build/selfcheck_almacen.js.
var listenersPorTipo = {};
globalThis.addEventListener = function (tipo, manejador) {
  listenersPorTipo[tipo] = listenersPorTipo[tipo] || [];
  listenersPorTipo[tipo].push(manejador);
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
function nodosPorClase(raiz, clase) {
  return recolectarNodos(raiz).filter(function (n) { return clasesDe(n).indexOf(clase) !== -1; });
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
function buscarPorId(raiz, id) {
  if (raiz.getAttribute && raiz.getAttribute('id') === id) { return raiz; }
  var hijos = raiz.children || [];
  for (var i = 0; i < hijos.length; i++) {
    var encontrado = buscarPorId(hijos[i], id);
    if (encontrado) { return encontrado; }
  }
  return null;
}

// Ejecuta `fn(listeners)` con un bus de eventos GLOBAL fresco y aislado
// (nunca contamina ni depende de `listenersPorTipo`, usado por las
// secciones 1-12 de regresión); restaura el bus anterior al salir, incluso
// si `fn` lanza.
function conBusDeEventosAislado(fn) {
  var anterior = globalThis.addEventListener;
  var listeners = {};
  globalThis.addEventListener = function (tipo, manejador) {
    listeners[tipo] = listeners[tipo] || [];
    listeners[tipo].push(manejador);
  };
  try {
    fn(listeners);
  } finally {
    globalThis.addEventListener = anterior;
  }
}

// R10: thenable SINCRONO (no una Promise nativa -- .then() de una Promise
// real siempre difiere al microtask queue, y este selfcheck es un script
// top-level sin async/await). `promesaSincrona` resuelve su callback en el
// momento exacto en que se llama .then(). `promesaControlada` permite
// posponer la resolución a un momento elegido por el test (para verificar
// el estado ocupado ANTES de resolver, p.ej. "Descifrando…"/"Cifrando…").
function promesaSincrona(valor) {
  return { then: function (cb) { return promesaSincrona(cb(valor)); } };
}
function promesaControlada() {
  var cb = null, resuelta = false, valorPendiente;
  var p = {
    then: function (callback) {
      cb = callback;
      if (resuelta) { cb(valorPendiente); }
      return p;
    },
    resolver: function (valor) {
      resuelta = true;
      valorPendiente = valor;
      if (cb) { cb(valor); }
    }
  };
  return p;
}

// Mock de Herzon.Almacen (R8/R9/R10): registra llamadas y permite configurar
// resultados. NO reimplementa build/almacen.js (eso ya lo prueba
// build/selfcheck_almacen.js) -- solo prueba que vista_metricas.js llama a
// la API correcta con los datos correctos y reacciona a sus eventos.
function crearAlmacenMock(config) {
  config = config || {};
  var llamadas = {
    crearCliente: [], actualizarPerfil: [], agregarMedicion: [], eliminarCliente: [], seleccionarCliente: [],
    actualizarConfig: [], desbloquearYMontar: [], exportarRespaldo: [], restaurarRespaldo: [], volverADemo: [], borrarTodo: []
  };
  return {
    _llamadas: llamadas,
    modo: function () { return config.modo || 'real'; },
    clientes: function () { return config.clientes || []; },
    clienteActivo: function () { return (config.clienteActivo !== undefined) ? config.clienteActivo : null; },
    // S-02: bloqueado puede ser un booleano fijo o una función (para poder
    // mutar el estado a mitad de un test, p.ej. tras un desbloqueo exitoso).
    bloqueado: function () { return (typeof config.bloqueado === 'function') ? config.bloqueado() === true : config.bloqueado === true; },
    crearCliente: function (perfil) {
      llamadas.crearCliente.push(perfil);
      return (typeof config.crearCliente === 'function') ? config.crearCliente(perfil) : { ok: true, id: 'c-mock' };
    },
    actualizarPerfil: function (p) {
      llamadas.actualizarPerfil.push(p);
      return (typeof config.actualizarPerfil === 'function') ? config.actualizarPerfil(p) : true;
    },
    actualizarConfig: function (parcial) {
      llamadas.actualizarConfig.push(parcial);
      return (typeof config.actualizarConfig === 'function') ? config.actualizarConfig(parcial) : true;
    },
    agregarMedicion: function (m) {
      llamadas.agregarMedicion.push(m);
      return (typeof config.agregarMedicion === 'function') ? config.agregarMedicion(m) : { ok: true, errores: [], medicion: m };
    },
    eliminarCliente: function (id) {
      llamadas.eliminarCliente.push(id);
      return (typeof config.eliminarCliente === 'function') ? config.eliminarCliente(id) : { ok: true, restantes: 0 };
    },
    desbloquearYMontar: function (contrasena) {
      llamadas.desbloquearYMontar.push(contrasena);
      return (typeof config.desbloquearYMontar === 'function') ? config.desbloquearYMontar(contrasena) : promesaSincrona({ ok: true });
    },
    exportarRespaldo: function () {
      return (typeof config.exportarRespaldo === 'function') ? config.exportarRespaldo() : { ok: true, nombreArchivo: 'rinde-respaldo-mock.json', json: '{}' };
    },
    restaurarRespaldo: function (objeto) {
      llamadas.restaurarRespaldo.push(objeto);
      return (typeof config.restaurarRespaldo === 'function') ? config.restaurarRespaldo(objeto) : { ok: true, errores: [], clientes: 1 };
    },
    volverADemo: function () {
      llamadas.volverADemo.push(true);
      if (typeof config.volverADemo === 'function') { config.volverADemo(); }
    },
    borrarTodo: function () {
      llamadas.borrarTodo.push(true);
      if (typeof config.borrarTodo === 'function') { config.borrarTodo(); }
    }
  };
}

// Mock de Herzon.Seguridad (S-01/S-02/S-03): cripto puro simulado -- NO
// reimplementa build/seguridad.js (eso lo prueba build/selfcheck_seguridad.js),
// solo prueba que vista_metricas.js llama a la API correcta y reacciona a
// sus resultados (éxito/error, estado ocupado, limpieza de contraseñas).
function crearSeguridadMock(config) {
  config = config || {};
  var llamadas = { activar: [], desactivar: [], cambiar: [], desbloquear: [], bloquear: [] };
  return {
    _llamadas: llamadas,
    activa: function () { return (typeof config.activa === 'function') ? config.activa() === true : config.activa === true; },
    activar: function (contrasena) {
      llamadas.activar.push(contrasena);
      return (typeof config.activar === 'function') ? config.activar(contrasena) : promesaSincrona({ ok: true, errores: [] });
    },
    desactivar: function (contrasena) {
      llamadas.desactivar.push(contrasena);
      return (typeof config.desactivar === 'function') ? config.desactivar(contrasena) : promesaSincrona({ ok: true, errores: [] });
    },
    cambiar: function (actual, nueva) {
      llamadas.cambiar.push({ actual: actual, nueva: nueva });
      return (typeof config.cambiar === 'function') ? config.cambiar(actual, nueva) : promesaSincrona({ ok: true, errores: [] });
    },
    desbloquear: function (contrasena) {
      llamadas.desbloquear.push(contrasena);
      return (typeof config.desbloquear === 'function') ? config.desbloquear(contrasena) : promesaSincrona(null);
    },
    bloquear: function () {
      llamadas.bloquear.push(true);
      if (typeof config.bloquear === 'function') { config.bloquear(); }
    }
  };
}

// Fixture de "cliente real vacío" (Adendum R8 punto 4): misma forma que
// HERZON_DATA, pero perfil casi vacío y TODAS las series/labs/plicometría en
// 0 puntos -- exactamente el estado de un cliente recién creado (MC-01/
// MC-02) antes de capturar su primera medición.
function datosClienteVacio() {
  var clon = JSON.parse(DATA_ORIGINAL_JSON);
  clon.paciente = {
    nombre: 'Cliente Nuevo', edad: null, sexo: '', talla_cm: null, pesoInicial_kg: null,
    pesoActual_kg: null, imcInicial: null, imcActual: null, objetivo: '', actividad: '',
    diagnosticos: [], alergias: [], restricciones: [],
    gastoEnergetico: { tmb_kcal: null, get_kcal: null }, inicio: '2026-08-31'
  };
  clon.series = { semanas: [], fechas: [], peso_kg: [], grasa_pct: [], musculo_kg: [], cintura_cm: [], adherenciaDieta_pct: [], adherenciaDiaria: [] };
  clon.labs = {
    cortes: [],
    marcadores: clon.labs.marcadores.map(function (m) { return { clave: m.clave, nombre: m.nombre, unidad: m.unidad, referencia: m.referencia, mejorSi: m.mejorSi, valores: [] }; })
  };
  clon.plicometria = {
    unidad: clon.plicometria.unidad, cortes: [],
    sitios: clon.plicometria.sitios.map(function (s) { return { clave: s.clave, nombre: s.nombre, valores_mm: [] }; }),
    sumaPliegues_mm: []
  };
  clon.suplementos = [];
  clon.planAplicado = null;
  return clon;
}

// Contenedor de Seguimiento con el markup ESTÁTICO real que shell.html
// (T-038/T-044) monta alrededor de esta vista: #captura-mediciones al
// inicio, #doc-herramientas después (con un botón de otro dueño, para
// probar que un remontaje NUNCA lo destruye).
function contenedorSeguimientoConEstatico() {
  var root = contenedorNuevo();
  var captura = doc.createElement('section');
  captura.setAttribute('id', 'captura-mediciones');
  root.appendChild(captura);
  var docHerramientas = doc.createElement('div');
  docHerramientas.setAttribute('id', 'doc-herramientas');
  var botonAjeno = doc.createElement('button');
  botonAjeno.setAttribute('id', 'hz-doc-btn-imprimir');
  docHerramientas.appendChild(botonAjeno);
  root.appendChild(docHerramientas);
  return { root: root, captura: captura, docHerramientas: docHerramientas, botonAjeno: botonAjeno };
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
// 3. Vista Resumen (baseline: Herzon.Almacen AUSENTE -- equivalente a demo,
// PR-04 rama "Almacen ausente"). LY-01 piezas 2 y 4, DV-06.
// ---------------------------------------------------------------------
var rootResumen = contenedorNuevo();
afirmar((function () {
  try { Herzon.Views.resumen(rootResumen); return true; }
  catch (e) { console.error(e); return false; }
})(), 'Herzon.Views.resumen debe montar sin lanzar');

afirmar(contarPorClase(rootResumen, 'hz-hero') === 1, 'Vista Resumen debe tener EXACTAMENTE un .hz-hero');
afirmar(contienePrefijoHz(rootResumen), 'Vista Resumen: toda clase nueva debe llevar prefijo hz-');

// LY-01 pieza 2: UNA sola .hz-grid con 3 hijos (héroe data-ancho="doble" +
// 2 wrappers de 2 stat tiles).
var gridsResumen = nodosPorClase(rootResumen, 'hz-grid');
afirmar(gridsResumen.length === 1, 'LY-01: Vista Resumen debe tener EXACTAMENTE una .hz-grid');
var gridResumen = gridsResumen[0];
afirmar(gridResumen.children.length === 3, 'LY-01: la .hz-grid de Resumen debe tener 3 hijos (héroe + 2 wrappers de stat tiles)');
var heroCardResumen = gridResumen.children[0];
afirmar(clasesDe(heroCardResumen).indexOf('hz-card') !== -1, 'LY-01: el primer hijo de la grid de Resumen debe ser la card héroe');
afirmar(heroCardResumen.getAttribute('data-ancho') === 'doble', 'LY-01 pieza 1: la card héroe de Resumen debe llevar data-ancho="doble"');
var wrapAResumen = gridResumen.children[1];
var wrapBResumen = gridResumen.children[2];
afirmar(contarPorClase(wrapAResumen, 'hz-stat') === 2 && contarPorClase(wrapBResumen, 'hz-stat') === 2,
  'LY-01 pieza 2: cada wrapper debe contener exactamente 2 stat tiles (IMC+Grasa / Cintura+Adherencia)');

var heroResumenDelta = recolectarNodos(rootResumen).filter(function (n) { return clasesDe(n).indexOf('hz-stat-delta') !== -1; });
afirmar(heroResumenDelta.length >= 1 && /^[+-]/.test(heroResumenDelta[0].textContent),
  'El número héroe de Resumen debe traer un delta con signo');

// LY-01 pieza 4: sparkline del héroe con alto 56 y lineaAcento (color en vez
// de var(--text-muted)) -- circles contadas SOLO dentro de la card héroe
// (con DV-06 el resto de la vista también trae sparklines).
var svgSparkHero = recolectarNodos(heroCardResumen).filter(function (n) { return (n.tagName || '').toLowerCase() === 'svg'; })[0];
afirmar(!!svgSparkHero, 'LY-01: la card héroe de Resumen debe traer un <svg> de sparkline');
afirmar(svgSparkHero.style.height === '56px', 'LY-01 pieza 4: el sparkline del héroe debe tener alto 56');
var circulosHero = recolectarNodos(heroCardResumen).filter(function (n) { return (n.tagName || '').toLowerCase() === 'circle'; });
afirmar(circulosHero.length === 12, 'El sparkline del héroe de Resumen debe tener exactamente 12 puntos');
var polilineaHero = polylinesDe(heroCardResumen)[0];
afirmar(polilineaHero.style.stroke === 'var(--series-1)',
  'LY-01 pieza 3: con lineaAcento:true, la polilínea del héroe debe usar el color de acento (var(--series-1)), no var(--text-muted)');

afirmar(contarPorClase(rootResumen, 'hz-stat') >= 3, 'Vista Resumen debe tener al menos 3 .hz-stat');

// DV-06: sparklines de trayectoria en Grasa/Cintura/Adherencia, coloreadas
// por entidad (grasa: series-2, resto: series-1), lineaAcento activo.
function statTilePorEtiqueta(raiz, etiqueta) {
  return nodosPorClase(raiz, 'hz-stat').filter(function (tile) {
    var label = recolectarNodos(tile).filter(function (n) { return clasesDe(n).indexOf('hz-stat-label') !== -1; })[0];
    return label && label.textContent === etiqueta;
  })[0];
}
var tileGrasaResumen = statTilePorEtiqueta(rootResumen, 'Grasa corporal');
var tileCinturaResumen = statTilePorEtiqueta(rootResumen, 'Cintura');
var tileAdherenciaResumen = statTilePorEtiqueta(rootResumen, 'Adherencia a dieta (promedio)');
afirmar(!!tileGrasaResumen && !!tileCinturaResumen && !!tileAdherenciaResumen,
  'DV-06: deben existir los stat tiles de Grasa corporal, Cintura y Adherencia a dieta (promedio)');
[tileGrasaResumen, tileCinturaResumen, tileAdherenciaResumen].forEach(function (tile, idx) {
  var circulos = recolectarNodos(tile).filter(function (n) { return (n.tagName || '').toLowerCase() === 'circle'; });
  afirmar(circulos.length === 12, 'DV-06: el stat tile #' + idx + ' debe traer un sparkline de 12 puntos (12 semanas de datos demo)');
});
var polilineaGrasa = polylinesDe(tileGrasaResumen)[0];
afirmar(polilineaGrasa.style.stroke === 'var(--series-2)', 'DV-06: el sparkline de Grasa corporal debe usar var(--series-2) (colorSparkline por entidad)');
var polilineaCintura = polylinesDe(tileCinturaResumen)[0];
afirmar(polilineaCintura.style.stroke === 'var(--series-1)', 'DV-06: el sparkline de Cintura debe usar var(--series-1)');
var polilineaAdherencia = polylinesDe(tileAdherenciaResumen)[0];
afirmar(polilineaAdherencia.style.stroke === 'var(--series-1)', 'DV-06: el sparkline de Adherencia debe usar var(--series-1)');

// PR-04: con Almacen ausente, la nota vive con el título nuevo "Acerca del
// modo demo" (NO "Acerca de este prototipo") y lista TODOS los supuestos.
afirmar(contarPorClase(rootResumen, 'hz-nota') === 1, 'Vista Resumen debe tener la nota .hz-nota (PR-04, modo demo: Almacen ausente)');
var notaResumen = nodosPorClase(rootResumen, 'hz-nota')[0];
var tituloNotaResumen = recolectarNodos(notaResumen).filter(function (n) { return (n.tagName || '').toLowerCase() === 'strong'; })[0];
afirmar(!!tituloNotaResumen && tituloNotaResumen.textContent === 'Acerca del modo demo',
  'PR-04: el título de la nota debe ser exactamente "Acerca del modo demo"');
var liNotaResumen = recolectarNodos(rootResumen).filter(function (n) { return (n.tagName || '').toLowerCase() === 'li'; });
afirmar(liNotaResumen.length >= 3, 'La nota "Acerca del modo demo" debe listar al menos 3 supuestos');
afirmar(liNotaResumen.length === DATA.supuestos.length, 'La nota debe listar TODOS los supuestos de HERZON_DATA.supuestos');

// ---------------------------------------------------------------------
// 4. Vista Perfil (baseline: Herzon.Almacen AUSENTE). LY-02, MC-04 (form
// oculto por default, ids congelados).
// ---------------------------------------------------------------------
var rootPerfil = contenedorNuevo();
afirmar((function () {
  try { Herzon.Views.perfil(rootPerfil); return true; }
  catch (e) { console.error(e); return false; }
})(), 'Herzon.Views.perfil debe montar sin lanzar');

afirmar(contarPorClase(rootPerfil, 'hz-hero') === 1, 'Vista Perfil debe tener EXACTAMENTE un .hz-hero');
afirmar(contienePrefijoHz(rootPerfil), 'Vista Perfil: toda clase nueva debe llevar prefijo hz-');

// LY-02 pieza (a): héroe IMC como PRIMER hijo de la .hz-grid superior, junto
// a tarjetaClinica y tarjetaAntro (3 hijos).
var gridsPerfil = nodosPorClase(rootPerfil, 'hz-grid');
afirmar(gridsPerfil.length >= 1, 'Vista Perfil debe tener al menos una .hz-grid');
var gridSuperiorPerfil = gridsPerfil[0];
afirmar(gridSuperiorPerfil.children.length === 3, 'LY-02: la grid superior de Perfil debe tener 3 hijos (héroe + tarjeta clínica + tarjeta antropométrica)');
afirmar(contarPorClase(gridSuperiorPerfil.children[0], 'hz-hero') === 1, 'LY-02: el primer hijo de la grid superior debe ser la card héroe (con .hz-hero adentro)');
var tarjetasTitulos = gridSuperiorPerfil.children.slice(1).map(function (c) {
  var t = recolectarNodos(c).filter(function (n) { return clasesDe(n).indexOf('hz-card-title') !== -1; })[0];
  return t ? t.textContent : null;
});
afirmar(tarjetasTitulos[0] === 'Tarjeta clínica' && tarjetasTitulos[1] === 'Tarjeta antropométrica',
  'LY-02: el 2do y 3er hijo de la grid superior deben ser Tarjeta clínica y Tarjeta antropométrica, en ese orden');

// LY-02 pieza (b): 7 semáforos en un .hz-grid ANIDADO (no una columna lineal
// de filas sueltas); cada wrapper de marcador es un div con 3 hijos (punto +
// nombre + valor).
var dotsPerfil = contarPorClase(rootPerfil, 'hz-status-dot');
var labelsPerfil = contarPorClase(rootPerfil, 'hz-status-label');
afirmar(dotsPerfil === labelsPerfil, 'El número de .hz-status-dot debe ser igual al número de .hz-status-label');
afirmar(dotsPerfil === DATA.labs.marcadores.length, 'Debe haber un semaforo de estatus por cada marcador de laboratorio');
afirmar(gridsPerfil.length === 2, 'LY-02: debe existir una SEGUNDA .hz-grid anidada (semáforos de laboratorios), además de la grid superior');
var gridSemaforosPerfil = gridsPerfil[1];
afirmar(gridSemaforosPerfil.children.length === DATA.labs.marcadores.length,
  'LY-02: la grid de semáforos debe tener un wrapper por marcador (' + DATA.labs.marcadores.length + ')');
gridSemaforosPerfil.children.forEach(function (wrapMarcador, idxFila) {
  afirmar(wrapMarcador.children.length === 3, 'LY-02: cada wrapper de semáforo debe tener 3 hijos (punto + nombre + valor), obtuvo ' + wrapMarcador.children.length);
  var nombreSpan = wrapMarcador.children[1];
  var valorSpan = wrapMarcador.children[2];
  afirmar(clasesDe(nombreSpan).indexOf('hz-status-label') === -1,
    'jera-7: el span del nombre del marcador no debe llevar la clase de valor (jerarquía distinta dentro del wrapper)');
  afirmar(nombreSpan.style.color === 'var(--text-secondary)',
    'jera-7: el nombre del marcador debe usar el token --text-secondary (peso regular, dato de apoyo)');
  afirmar(clasesDe(valorSpan).indexOf('hz-status-label') !== -1,
    'jera-7: el span del valor debe conservar la clase congelada hz-status-label (600, --text-primary)');
  afirmar(valorSpan.style.fontVariantNumeric === 'tabular-nums',
    'jera-7: el valor del marcador debe usar font-variant-numeric: tabular-nums');
});

var textosPerfil = textosDe(rootPerfil).join(' ');
afirmar(textosPerfil.indexOf(String(DATA.paciente.talla_cm)) !== -1, 'La tarjeta antropometrica debe mostrar la talla del paciente');
afirmar(textosPerfil.indexOf(DATA.paciente.objetivo) !== -1, 'La tarjeta clínica debe mostrar el objetivo del paciente');

// Con Almacen ausente: enReal===false -> NO se monta edición de perfil ni
// botón eliminar; el formulario de alta SÍ se monta (siempre presente) pero
// OCULTO, con el subtítulo de "primer uso" (0 clientes reportados).
afirmar(buscarPorId(rootPerfil, 'hz-btn-eliminar-cliente') === null,
  'sin Almacen (modo no-real), Vista Perfil NO debe montar #hz-btn-eliminar-cliente');
var formEditarPerfilAusente = recolectarNodos(rootPerfil).filter(function (n) { return (n.tagName || '').toLowerCase() === 'form'; })
  .filter(function (f) { return f.getAttribute('id') !== 'hz-form-alta-cliente'; });
afirmar(formEditarPerfilAusente.length === 0, 'sin Almacen (modo no-real), Vista Perfil NO debe montar el formulario de edición de perfil');

// MC-04 + F-03: formulario de alta -- ids EXACTOS del Adendum R9 punto 6,
// ahora envuelto en una card centrada (#hz-card-alta-cliente, hz-form-card).
var cardAltaBase = buscarPorId(rootPerfil, 'hz-card-alta-cliente');
afirmar(!!cardAltaBase, 'F-03: debe existir #hz-card-alta-cliente');
afirmar(clasesDe(cardAltaBase).indexOf('hz-card') !== -1 && clasesDe(cardAltaBase).indexOf('hz-form-card') !== -1,
  'F-03: #hz-card-alta-cliente debe llevar las clases hz-card y hz-form-card (720px, sistema de formularios)');
afirmar(cardAltaBase.hasAttribute('hidden') && cardAltaBase.style.display === 'none',
  'F-03.2: la card de alta debe estar oculta por default (hidden + style.display=none, cinturón verificado)');
var formAltaBase = buscarPorId(rootPerfil, 'hz-form-alta-cliente');
afirmar(!!formAltaBase, 'MC-04: debe existir #hz-form-alta-cliente');
afirmar(formAltaBase.hasAttribute('hidden'), 'MC-04: #hz-form-alta-cliente debe estar oculto por default (togglea junto con la card)');
afirmar(clasesDe(formAltaBase).indexOf('hz-form') !== -1 && clasesDe(formAltaBase).indexOf('hz-form-columnas') !== -1,
  'F-03.2: el form de alta debe llevar las clases hz-form y hz-form-columnas');
['hz-alta-nombre', 'hz-alta-sexo', 'hz-alta-edad', 'hz-alta-talla', 'hz-alta-peso', 'hz-alta-actividad', 'hz-alta-objetivo',
  'hz-btn-crear-cliente', 'hz-alta-error'].forEach(function (id) {
  afirmar(!!buscarPorId(formAltaBase, id), 'MC-04: el formulario de alta debe traer el id exacto #' + id);
});
afirmar(!!buscarPorId(formAltaBase, 'hz-btn-cancelar-alta'),
  'MC-04: con 0 clientes y Almacen ausente (equivalente a demo), el botón Cancelar debe estar presente');
// F-03.3: el campo Nombre cae en fila completa (hz-form-ancho).
var campoNombreAltaBase = buscarPorId(formAltaBase, 'hz-alta-nombre');
var wrapperNombreAltaBase = campoNombreAltaBase.parentNode;
afirmar(clasesDe(wrapperNombreAltaBase).indexOf('hz-form-ancho') !== -1,
  'F-03.3: el campo Nombre del alta debe caer en fila completa (hz-form-ancho)');
// F-03.5: jerarquía de botones -- Crear cliente primario, Cancelar secundario.
var botonCrearBase = buscarPorId(formAltaBase, 'hz-btn-crear-cliente');
afirmar(clasesDe(botonCrearBase).indexOf('hz-btn') !== -1 && clasesDe(botonCrearBase).indexOf('hz-btn-primario') !== -1,
  'F-02/F-03.5: #hz-btn-crear-cliente debe llevar hz-btn hz-btn-primario');
var botonCancelarAltaBase = buscarPorId(formAltaBase, 'hz-btn-cancelar-alta');
afirmar(clasesDe(botonCancelarAltaBase).indexOf('hz-btn') !== -1 && clasesDe(botonCancelarAltaBase).indexOf('hz-btn-secundario') !== -1,
  'F-02/F-03.5: #hz-btn-cancelar-alta debe llevar hz-btn hz-btn-secundario');
// F-03.1: título, subtítulo de primer uso y nota de privacidad son hijos de
// la CARD (ANTES del form), no del form.
var tituloAltaBase = recolectarNodos(cardAltaBase).filter(function (n) { return clasesDe(n).indexOf('hz-card-title') !== -1; })[0];
afirmar(!!tituloAltaBase && tituloAltaBase.textContent === 'Nuevo cliente', 'MC-04: el título del formulario de alta debe ser "Nuevo cliente"');
afirmar(tituloAltaBase.parentNode === cardAltaBase, 'F-03.1: el título de alta debe ser hijo directo de la card, no del form');
var textosCardAltaBase = textosDe(cardAltaBase).join(' ');
afirmar(textosCardAltaBase.indexOf('Registra a tu primer cliente para empezar a capturar mediciones.') !== -1,
  'MC-04: con 0 clientes debe aparecer el subtítulo de primer uso exacto');
afirmar(textosCardAltaBase.indexOf('Los datos de cada cliente se guardan solo en este dispositivo.') !== -1,
  'MC-04: debe aparecer la nota fija de privacidad exacta');
var errorAltaBase = buscarPorId(formAltaBase, 'hz-alta-error');
afirmar(errorAltaBase.style.color === 'var(--delta-bad)', 'MC-04: #hz-alta-error debe usar var(--delta-bad) (patrón T-029)');
afirmar(clasesDe(errorAltaBase).indexOf('hz-form-error') !== -1 && clasesDe(errorAltaBase).indexOf('hz-form-ancho') !== -1,
  'F-03.4: #hz-alta-error debe llevar hz-form-error y hz-form-ancho');

// ---------------------------------------------------------------------
// 5. Vista Seguimiento (baseline: Herzon.Almacen AUSENTE, con el markup
// ESTÁTICO real de #captura-mediciones/#doc-herramientas). LY-04, DV-04.
// ---------------------------------------------------------------------
var fixtureSeg = contenedorSeguimientoConEstatico();
var rootSeg = fixtureSeg.root;
afirmar((function () {
  try { Herzon.Views.seguimiento(rootSeg); return true; }
  catch (e) { console.error(e); return false; }
})(), 'Herzon.Views.seguimiento debe montar sin lanzar');

afirmar(contarPorClase(rootSeg, 'hz-hero') === 1, 'Vista Seguimiento debe tener EXACTAMENTE un .hz-hero');
afirmar(contienePrefijoHz(rootSeg), 'Vista Seguimiento: toda clase nueva debe llevar prefijo hz-');

// #captura-mediciones/#doc-herramientas (estáticos, de otros dueños) deben
// seguir siendo EXACTAMENTE los mismos nodos tras el montaje.
afirmar(buscarPorId(rootSeg, 'captura-mediciones') === fixtureSeg.captura,
  'Vista Seguimiento NO debe reemplazar el nodo estático #captura-mediciones');
afirmar(buscarPorId(rootSeg, 'doc-herramientas') === fixtureSeg.docHerramientas,
  'Vista Seguimiento NO debe tocar el nodo estático #doc-herramientas (de otro dueño)');
afirmar(buscarPorId(rootSeg, 'hz-doc-btn-imprimir') === fixtureSeg.botonAjeno,
  'Vista Seguimiento NO debe destruir contenido ajeno dentro de #doc-herramientas');

// Con Almacen ausente (no modo real), el formulario de captura NO se monta.
afirmar(fixtureSeg.captura.children.length === 0,
  'sin Almacen (modo no-real), #captura-mediciones debe quedar vacío (el formulario de captura es solo modo real)');

// LY-04: las 4 cards de línea deben vivir dentro de UN div.hz-grid.hz-grid-pares.
var gridPares = recolectarNodos(rootSeg).filter(function (n) {
  return clasesDe(n).indexOf('hz-grid') !== -1 && clasesDe(n).indexOf('hz-grid-pares') !== -1;
})[0];
afirmar(!!gridPares, 'LY-04: debe existir un div.hz-grid.hz-grid-pares en Vista Seguimiento');
afirmar(gridPares.children.length === 4, 'LY-04: hz-grid-pares debe contener EXACTAMENTE las 4 cards de línea');

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
  'Vista Seguimiento debe traer las 6 tarjetas de gráficas esperadas');
afirmar(!cardPorTitulo('Composición corporal'),
  'data-2 (Adendum R6 punto 7): ya no debe existir una card única "Composición corporal" con dos series en un eje compartido');
[cardPeso, cardMusculo, cardGrasa, cardCintura].forEach(function (c, idx) {
  afirmar(gridPares.children.indexOf(c) !== -1, 'LY-04: la card de línea #' + idx + ' debe ser hija directa de hz-grid-pares');
});

// DV-04: laboratorios -- valoresEnBarras vertical (3 valores por marcador,
// uno por corte) + unidad, cortesEtiquetas cortas y horizontales (sin
// rotación).
var chartsLabs = recolectarNodos(cardLabs).filter(function (n) { return clasesDe(n).indexOf('hz-chart') !== -1; });
afirmar(chartsLabs.length === DATA.labs.marcadores.length, 'Debe haber una gráfica de laboratorio por cada marcador, en los 3 cortes');
var togglesLabs = contarPorClase(cardLabs, 'hz-table-toggle');
afirmar(togglesLabs === DATA.labs.marcadores.length, 'Cada gráfica de laboratorio debe traer su toggle Ver tabla');

var etiquetasValorLabs = contarPorClase(cardLabs, 'hz-etiqueta-valor');
afirmar(etiquetasValorLabs === DATA.labs.marcadores.length * DATA.labs.cortes.length,
  'DV-04: con valoresEnBarras:true, cada marcador debe traer UNA etiqueta de valor POR CORTE (' + DATA.labs.cortes.length + ' cortes x ' + DATA.labs.marcadores.length + ' marcadores)');
var etiquetasRotadasLabs = recolectarNodos(cardLabs).filter(function (n) { return n.getAttribute && n.getAttribute('data-etiqueta-rotada') === '1'; });
afirmar(etiquetasRotadasLabs.length === 0,
  'DV-04: con cortesEtiquetas cortas (Basal/Seg./Final), ninguna etiqueta de categoría debe rotarse (deben caber horizontales)');
var textosCortesLabs = textosDe(cardLabs).join(' | ');
afirmar(textosCortesLabs.indexOf('Seg.') !== -1, 'DV-04: la etiqueta corta "Seg." (de "Seguimiento") debe aparecer en la gráfica');
afirmar(textosCortesLabs.indexOf('Basal') !== -1 && textosCortesLabs.indexOf('Final') !== -1,
  'DV-04: las etiquetas "Basal" y "Final" (ya cortas) deben conservarse tal cual');

var marcadoresConReferencia = DATA.labs.marcadores.filter(function (m) {
  return m.referencia && typeof m.referencia.min === 'number' && typeof m.referencia.max === 'number';
});
afirmar(marcadoresConReferencia.length === DATA.labs.marcadores.length,
  'este selfcheck asume que HERZON_DATA.labs.marcadores trae referencia {min,max} en los 7 marcadores (si esto cambia, ajustar el conteo de abajo)');
afirmar(contarPorClase(cardLabs, 'hz-referencia-linea') === marcadoresConReferencia.length * 2,
  'data-8: cada gráfica de laboratorio con referencia clínica en los datos debe dibujar las hairlines de referencia (min y max)');

// ---------------------------------------------------------------------
// 5bis. R4: el héroe de Seguimiento se recalcula contra el PRIMER punto del
// rango ACTIVO (4/8/12 semanas), no contra el inicio absoluto de las 12
// semanas.
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
  'El eje Y de masa muscular debe estar forzado a un rango completo propio (yMin=15 / yMax=40)');
var textosGrasa = textosDe(cardGrasa);
afirmar(textosGrasa.indexOf('15') !== -1 && textosGrasa.indexOf('45') !== -1,
  'El eje Y de grasa corporal debe estar forzado a un rango completo propio (yMin=15 / yMax=45)');

afirmar(textosDe(cardPeso).join(' ').indexOf(DATA.meta.unidades.peso) !== -1,
  'data-4: la línea de peso debe traer la unidad de HERZON_DATA.meta.unidades.peso en su etiqueta de punta');
afirmar(textosMusculo.join(' ').indexOf(DATA.meta.unidades.peso) !== -1,
  'data-4: la línea de masa muscular debe traer la unidad de HERZON_DATA.meta.unidades.peso en su etiqueta de punta');
afirmar(textosDe(cardCintura).join(' ').indexOf(DATA.meta.unidades.cintura) !== -1,
  'data-4: la línea de cintura debe traer la unidad de HERZON_DATA.meta.unidades.cintura en su etiqueta de punta');

var polyCintura0 = polylinesDe(cardCintura);
afirmar(polyCintura0.length === 1, 'La gráfica de cintura debe tener una sola serie (línea)');
afirmar(puntosDe(polyCintura0[0]).length === 12, 'Con el rango inicial (12 semanas) la línea de cintura debe tener 12 puntos');

// ---------------------------------------------------------------------
// 6. Filtro de rango (contrato regla 12).
// ---------------------------------------------------------------------
afirmar(listenersRango.length === 1, 'Vista Seguimiento debe suscribirse UNA vez a Herzon.filters.onRangeChange');
afirmar((listenersPorTipo['herzon:mediciones-importadas'] || []).length === 1,
  'prod-1: al montar rootSeg (esta sección), Vista Seguimiento debe registrar EXACTAMENTE un listener de herzon:mediciones-importadas');
afirmar((listenersPorTipo['herzon:modo-cambiado'] || []).length >= 3,
  'Adendum R9 punto 3: Resumen, Perfil y Seguimiento deben registrar CADA uno un listener de herzon:modo-cambiado (van 3 vistas montadas hasta ahora)');

listenersRango[0](4);
afirmar(puntosDe(polylinesDe(cardPeso)[0]).length === 4, 'Al filtrar a 4 semanas, la línea de peso debe tener 4 puntos');
afirmar(puntosDe(polylinesDe(cardMusculo)[0]).length === 4, 'Al filtrar a 4 semanas, la línea de masa muscular debe tener 4 puntos');
afirmar(puntosDe(polylinesDe(cardGrasa)[0]).length === 4, 'Al filtrar a 4 semanas, la línea de grasa corporal debe tener 4 puntos');
afirmar(puntosDe(polylinesDe(cardCintura)[0]).length === 4, 'Al filtrar a 4 semanas, la línea de cintura debe tener 4 puntos');
afirmarHeroPara(4);
afirmar(polylinesDe(cardPlic).every(function (p) { return puntosDe(p).length === DATA.plicometria.cortes.length; }),
  'Al filtrar a 4 semanas, la plicometría NO debe recortarse: sigue con sus 4 cortes fijos');

listenersRango[0](8);
afirmar(puntosDe(polylinesDe(cardPeso)[0]).length === 8, 'Al filtrar a 8 semanas, la línea de peso debe tener 8 puntos');
afirmar(puntosDe(polylinesDe(cardMusculo)[0]).length === 8, 'Al filtrar a 8 semanas, la línea de masa muscular debe tener 8 puntos');
afirmar(puntosDe(polylinesDe(cardGrasa)[0]).length === 8, 'Al filtrar a 8 semanas, la línea de grasa corporal debe tener 8 puntos');
afirmar(puntosDe(polylinesDe(cardCintura)[0]).length === 8, 'Al filtrar a 8 semanas, la línea de cintura debe tener 8 puntos');
afirmarHeroPara(8);
afirmar(polylinesDe(cardPlic).every(function (p) { return puntosDe(p).length === DATA.plicometria.cortes.length; }),
  'Al filtrar a 8 semanas, la plicometría NO debe recortarse: sigue con sus 4 cortes fijos');

// ---------------------------------------------------------------------
// 7. D5 (QA ronda 1): ninguna .hz-chart-title interna duplica el heading
//    .hz-card-title de su propia card.
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
// (héroe de Resumen + 3 stat tiles con DV-06) deben estar YA conectados al
// árbol de la vista en el instante EXACTO en que se invoca esa función.
// ---------------------------------------------------------------------
function esDescendienteDe(nodo, raiz) {
  var actual = nodo;
  while (actual) {
    if (actual === raiz) { return true; }
    actual = actual.parentNode;
  }
  return false;
}

var fixtureSegCausaRaiz = contenedorSeguimientoConEstatico();
var rootSegCausaRaiz = fixtureSegCausaRaiz.root;
var rootResumenCausaRaiz = contenedorNuevo();
var conexionesBarrasAlMomentoDeLlamar = [];
var conexionesSparklineAlMomentoDeLlamar = [];
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
  'jera-2/data-1/fini-2 (causa raíz): los 7 contenedores de laboratorio deben estar YA montados en el DOM de la vista ANTES de invocar Herzon.Charts.barras');
// DV-06: con lineaAcento/colorSparkline en 3 stat tiles + el sparkline del
// héroe, esperamos 4 llamadas a Charts.sparkline en este montaje de Resumen.
afirmar(conexionesSparklineAlMomentoDeLlamar.length === 4,
  'DV-06/LY-01: Vista Resumen debe llamar Charts.sparkline 4 veces (héroe + Grasa + Cintura + Adherencia), obtuvo ' + conexionesSparklineAlMomentoDeLlamar.length);
afirmar(conexionesSparklineAlMomentoDeLlamar.every(function (c) { return c === true; }),
  'jera-8/fini-6 (causa raíz): TODOS los contenedores de sparkline de Resumen deben estar YA montados en el DOM antes de invocar Herzon.Charts.sparkline');

// ---------------------------------------------------------------------
// 9bis. T-033 (montaje en DOS FASES del grid de laboratorios).
// ---------------------------------------------------------------------
afirmar(hijosGridLabsAlMomentoDeLlamar.length === DATA.labs.marcadores.length,
  'T-033: debe haberse capturado un conteo de hijos de gridLabs por cada llamada a Charts.barras (una por marcador)');
afirmar(hijosGridLabsAlMomentoDeLlamar.every(function (c) { return c === DATA.labs.marcadores.length; }),
  'T-033 (causa raíz real, fase 1 antes que fase 2): gridLabs debe tener sus ' + DATA.labs.marcadores.length +
  ' wraps YA adjuntos en el instante de CADA llamada a Charts.barras -- obtuvo la secuencia [' +
  hijosGridLabsAlMomentoDeLlamar.join(',') + ']');

var idxUltimoAppendGridLabs = fuenteVistas.lastIndexOf('gridLabs.appendChild(');
var idxPrimeraLlamadaBarras = fuenteVistas.indexOf('Charts.barras(');
afirmar(idxUltimoAppendGridLabs !== -1 && idxPrimeraLlamadaBarras !== -1,
  'T-033: el fuente debe contener tanto "gridLabs.appendChild(" como "Charts.barras(" para poder verificar su orden');
afirmar(idxUltimoAppendGridLabs < idxPrimeraLlamadaBarras,
  'T-033 (estructural, dos fases en el código): la ÚLTIMA llamada a gridLabs.appendChild( debe aparecer en el fuente ANTES que la PRIMERA llamada a Charts.barras(');

// ---------------------------------------------------------------------
// 11. prod-1 (Adendum R6 punto 4): redibujar() debe releer
// G.HERZON_DATA.series en CADA llamada, y la vista debe escuchar
// 'herzon:mediciones-importadas' para re-renderizar el rango activo.
// ---------------------------------------------------------------------
afirmar((listenersPorTipo['herzon:mediciones-importadas'] || []).length === 2,
  'prod-1: tras el montaje adicional de la sección de causa raíz debe haber 2 listeners acumulados (uno por cada montaje de Vista Seguimiento)');

var pesoAntesDeImportar = DATA.series.peso_kg.slice();
var semanasAntesDeImportar = DATA.series.semanas.slice();
var totalSemanasAntes = semanasAntesDeImportar.length;

DATA.series.semanas = semanasAntesDeImportar.concat([totalSemanasAntes + 1]);
DATA.series.peso_kg = pesoAntesDeImportar.concat([69.5]);
DATA.series.grasa_pct = DATA.series.grasa_pct.concat([DATA.series.grasa_pct[DATA.series.grasa_pct.length - 1]]);
DATA.series.musculo_kg = DATA.series.musculo_kg.concat([DATA.series.musculo_kg[DATA.series.musculo_kg.length - 1]]);
DATA.series.cintura_cm = DATA.series.cintura_cm.concat([DATA.series.cintura_cm[DATA.series.cintura_cm.length - 1]]);

var listenerImportacion0 = listenersPorTipo['herzon:mediciones-importadas'][0];
afirmar(typeof listenerImportacion0 === 'function', 'prod-1: el listener capturado de herzon:mediciones-importadas debe ser una función invocable');
listenerImportacion0({ type: 'herzon:mediciones-importadas', detail: { agregadas: 1, actualizadas: 0, errores: 0 } });

afirmar(puntosDe(polylinesDe(cardPeso)[0]).length === 12,
  'prod-1: tras disparar herzon:mediciones-importadas con una semana nueva, la línea de peso debe seguir mostrando 12 puntos (recorte contra el rango activo=12 sobre 13 semanas totales)');
afirmar(textosDe(cardPeso).join(' ').indexOf('69.5') !== -1,
  'prod-1: la línea de peso debe mostrar el valor recién importado (69.5) sin volver a montar la vista');
afirmar(puntosDe(polylinesDe(cardMusculo)[0]).length === 12 && puntosDe(polylinesDe(cardGrasa)[0]).length === 12 && puntosDe(polylinesDe(cardCintura)[0]).length === 12,
  'prod-1: masa muscular, grasa corporal y cintura también deben re-renderizarse con la serie importada');

// Restaura las series de DATA (HERZON_DATA original) para las secciones
// siguientes, que asumen el fixture demo intacto.
DATA.series.semanas = semanasAntesDeImportar;
DATA.series.peso_kg = pesoAntesDeImportar;
DATA.series.grasa_pct = DATA.series.grasa_pct.slice(0, totalSemanasAntes);
DATA.series.musculo_kg = DATA.series.musculo_kg.slice(0, totalSemanasAntes);
DATA.series.cintura_cm = DATA.series.cintura_cm.slice(0, totalSemanasAntes);

// ---------------------------------------------------------------------
// 12. Anti-regresión D1 (QA ronda 1): ninguna de estas palabras en español
//    sin acento/eñe puede reaparecer en el CÓDIGO FUENTE de este módulo.
// ---------------------------------------------------------------------
// R8/R9: 'medicion' y 'plicometria' quedan FUERA de esta lista -- son
// identificadores del contrato de datos (data.js `plicometria`, la variable
// `medicion`/`plicometriaObj` que arma el payload de
// Herzon.Almacen.agregarMedicion, mismos nombres que exige la API de
// build/almacen.js) y no prosa; misma exclusión ya establecida en el
// audit de build/almacen.js (T-039/T-045: "catalogo/boton/medicion/
// plicometria/almacen" como identificadores). La prosa visible SIEMPRE
// usa la forma acentuada ("medición", "plicometría"), verificada aparte.
var PALABRAS_SIN_ACENTO_PROHIBIDAS = [
  'anos', 'Composicion', 'Calorias', 'Regimen', 'Probiotico', 'clinica',
  'demostracion', 'sinteticos', 'ultimas', 'capsula', 'jerarquia', 'raiz',
  'heroe', 'mecanica', 'confirmacion', 'edicion',
  'creacion', 'eliminacion', 'validacion', 'invalido', 'valido',
  'seleccion', 'automatico'
];
for (var pa = 0; pa < PALABRAS_SIN_ACENTO_PROHIBIDAS.length; pa++) {
  var palabra = PALABRAS_SIN_ACENTO_PROHIBIDAS[pa];
  var regexPalabra = new RegExp('\\b' + palabra + '\\b');
  afirmar(!regexPalabra.test(fuenteVistas), 'build/vista_metricas.js contiene la palabra sin acento "' + palabra + '" (D1, QA ronda 1): revisar y corregir a español con acentos/eñe');
}

// ---------------------------------------------------------------------
// 13. PR-04: la nota "Acerca del modo demo" vive SOLO en modo demo (Almacen
// ausente, ya probado en la sección 3, o modo()==='demo'); NO se monta en
// modo real.
// ---------------------------------------------------------------------
conBusDeEventosAislado(function () {
  var almacenDemo = crearAlmacenMock({ modo: 'demo' });
  globalThis.Herzon.Almacen = almacenDemo;
  var rootResumenDemo = contenedorNuevo();
  Herzon.Views.resumen(rootResumenDemo);
  afirmar(contarPorClase(rootResumenDemo, 'hz-nota') === 1, 'PR-04: con Almacen en modo "demo", la nota debe montarse');

  var almacenReal = crearAlmacenMock({ modo: 'real' });
  globalThis.Herzon.Almacen = almacenReal;
  var rootResumenReal = contenedorNuevo();
  Herzon.Views.resumen(rootResumenReal);
  afirmar(contarPorClase(rootResumenReal, 'hz-nota') === 0, 'PR-04: con Almacen en modo "real", la nota "Acerca del modo demo" NO debe montarse');

  globalThis.Herzon.Almacen = undefined;
});

// ---------------------------------------------------------------------
// 14. MC-04 (parte 2): apertura por evento, error de validación, éxito
// cierra y limpia (remontaje vía herzon:modo-cambiado simulando lo que
// dispara Herzon.Almacen.crearCliente en la implementación real).
// ---------------------------------------------------------------------
conBusDeEventosAislado(function (listeners) {
  var resultadoCrear = { ok: false, errores: ['Ya existe un cliente con ese nombre en este dispositivo.'] };
  var almacenMock = crearAlmacenMock({
    modo: 'real',
    clientes: [{ id: 'c-1', nombre: 'Ana', creado: '2026-08-01' }],
    crearCliente: function () { return resultadoCrear; }
  });
  globalThis.Herzon.Almacen = almacenMock;

  var rootPerfilMC04 = contenedorNuevo();
  Herzon.Views.perfil(rootPerfilMC04);

  var formAlta = buscarPorId(rootPerfilMC04, 'hz-form-alta-cliente');
  afirmar(formAlta.hasAttribute('hidden'), 'MC-04: el formulario de alta debe seguir oculto al montar (sin solicitud de alta)');
  var cardAltaMC04 = buscarPorId(rootPerfilMC04, 'hz-card-alta-cliente');
  afirmar(cardAltaMC04.hasAttribute('hidden') && cardAltaMC04.style.display === 'none',
    'F-03.2: la card de alta también debe estar oculta al montar (togglea junto con el form)');
  // El formulario de alta se construye COMPLETO (solo oculto con `hidden`)
  // desde el primer montaje: con 1 cliente ya registrado en el mock,
  // clientesCount>=1 y el botón Cancelar debe existir desde ya (MC-04:
  // "Cancelar visible solo si ya existe al menos un cliente o se está en
  // demo"), sin esperar a herzon:cliente-nuevo-solicitado.
  afirmar(!!buscarPorId(formAlta, 'hz-btn-cancelar-alta'),
    'MC-04: con 1+ clientes ya registrados, el botón Cancelar debe existir desde el primer montaje (aunque el formulario esté oculto)');

  afirmar((listeners['herzon:cliente-nuevo-solicitado'] || []).length === 1,
    'MC-04: Vista Perfil debe registrar EXACTAMENTE un listener de herzon:cliente-nuevo-solicitado');
  listeners['herzon:cliente-nuevo-solicitado'][0]({ type: 'herzon:cliente-nuevo-solicitado', detail: {} });

  var formAltaAbierto = buscarPorId(rootPerfilMC04, 'hz-form-alta-cliente');
  afirmar(!formAltaAbierto.hasAttribute('hidden'), 'MC-04: tras herzon:cliente-nuevo-solicitado, el formulario de alta debe mostrarse (sin atributo hidden)');
  afirmar(!!buscarPorId(formAltaAbierto, 'hz-btn-cancelar-alta'), 'MC-04: con clientes existentes, Cancelar debe estar presente');

  var campoNombreAlta = buscarPorId(formAltaAbierto, 'hz-alta-nombre');
  campoNombreAlta.value = 'Ana';
  var errorAlta = buscarPorId(formAltaAbierto, 'hz-alta-error');
  formAltaAbierto.despachar('submit', {});
  afirmar(almacenMock._llamadas.crearCliente.length === 1, 'MC-04: el submit debe llamar Almacen.crearCliente exactamente una vez');
  afirmar(almacenMock._llamadas.crearCliente[0].nombre === 'Ana', 'MC-04: crearCliente debe recibir el nombre capturado en #hz-alta-nombre');
  afirmar(errorAlta.textContent === resultadoCrear.errores.join(' '), 'MC-04: en fallo, #hz-alta-error debe mostrar el mensaje EXACTO devuelto por Almacen.crearCliente');
  // C-6: validación canónica en código nuevo -- SOLO aria-invalid + la
  // regla CSS F-01.6, sin inline borderColor.
  afirmar(campoNombreAlta.getAttribute('aria-invalid') === 'true', 'C-6: en fallo, el campo nombre debe marcarse con aria-invalid="true" (sin borderColor inline)');
  afirmar(campoNombreAlta.style.borderColor !== 'var(--delta-bad)', 'C-6: el campo nombre NO debe usar borderColor inline en código nuevo (solo aria-invalid)');
  afirmar(buscarPorId(rootPerfilMC04, 'hz-form-alta-cliente') === formAltaAbierto,
    'MC-04: un fallo de validación NO debe remontar la vista (el formulario sigue siendo el mismo nodo)');

  // Éxito: crearCliente ahora aprueba y simula el remontaje SÍNCRONO que
  // Herzon.Almacen dispara vía herzon:modo-cambiado en la implementación
  // real (Adendum R9 punto 3).
  resultadoCrear = { ok: true, id: 'c-nuevo' };
  var datosNuevoCliente = datosClienteVacio();
  globalThis.HERZON_DATA = datosNuevoCliente;
  errorAlta.textContent = '';
  formAltaAbierto.despachar('submit', {});
  afirmar(almacenMock._llamadas.crearCliente.length === 2, 'MC-04: el segundo submit (éxito) también debe invocar Almacen.crearCliente');
  // Simula el evento síncrono que Almacen.crearCliente dispara al montar el
  // nuevo cliente: invoca el listener de herzon:modo-cambiado registrado
  // por ESTA misma vista Perfil.
  afirmar((listeners['herzon:modo-cambiado'] || []).length === 1, 'Adendum R9 punto 3: Vista Perfil debe registrar UN listener de herzon:modo-cambiado');
  listeners['herzon:modo-cambiado'][0]({ type: 'herzon:modo-cambiado', detail: { modo: 'real', clienteId: 'c-nuevo' } });

  var formAltaTrasExito = buscarPorId(rootPerfilMC04, 'hz-form-alta-cliente');
  afirmar(formAltaTrasExito.hasAttribute('hidden'), 'MC-04: tras un alta exitosa, el remontaje debe volver a ocultar el formulario de alta');
  afirmar(textosDe(rootPerfilMC04).join(' ').indexOf('Cliente Nuevo') !== -1,
    'MC-04: tras el alta exitosa, la vista debe reflejar el perfil del nuevo cliente (releído de G.HERZON_DATA)');

  globalThis.Herzon.Almacen = undefined;
  globalThis.HERZON_DATA = DATA;
});

// ---------------------------------------------------------------------
// 15. MC-06: eliminación de cliente con confirmación en dos pasos y
// reversión automática a los 6 segundos (setTimeout interceptado, sin
// esperar tiempo real).
// ---------------------------------------------------------------------
conBusDeEventosAislado(function () {
  var timeoutsCapturados = [];
  var setTimeoutOriginal = globalThis.setTimeout;
  var clearTimeoutOriginal = globalThis.clearTimeout;
  globalThis.setTimeout = function (fn, ms) {
    var entrada = { fn: fn, ms: ms, cancelado: false };
    timeoutsCapturados.push(entrada);
    return entrada;
  };
  globalThis.clearTimeout = function (entrada) { if (entrada) { entrada.cancelado = true; } };

  var almacenMock = crearAlmacenMock({ modo: 'real', clienteActivo: { id: 'c-activo', nombre: 'Beatriz Luna' } });
  globalThis.Herzon.Almacen = almacenMock;
  var rootPerfilMC06 = contenedorNuevo();
  Herzon.Views.perfil(rootPerfilMC06);

  var botonEliminar = buscarPorId(rootPerfilMC06, 'hz-btn-eliminar-cliente');
  afirmar(!!botonEliminar, 'MC-06: en modo real con cliente activo, debe existir #hz-btn-eliminar-cliente');
  // F-05.2: el botón cambia SOLO de clases: de hz-doc-btn a hz-btn/hz-btn-peligro.
  afirmar(clasesDe(botonEliminar).indexOf('hz-doc-btn') === -1, 'F-05.2: el botón eliminar ya NO debe llevar la clase hz-doc-btn');
  afirmar(clasesDe(botonEliminar).indexOf('hz-btn') !== -1 && clasesDe(botonEliminar).indexOf('hz-btn-peligro') !== -1,
    'F-05.2: el botón eliminar debe llevar hz-btn hz-btn-peligro');
  afirmar(botonEliminar.textContent === 'Eliminar este cliente', 'MC-06: el texto inicial debe ser exactamente "Eliminar este cliente"');
  afirmar(botonEliminar.getAttribute('data-confirmar') === 'false', 'MC-06: data-confirmar debe iniciar en "false"');
  // F-05.1/F-05.3: descendiente de .hz-form-pie DENTRO de la card de Editar
  // perfil, NO hijo directo de rootPerfil (jamás banda de ancho completo).
  afirmar(rootPerfilMC06.children.indexOf(botonEliminar) === -1,
    'F-05.1: #hz-btn-eliminar-cliente NO debe ser hijo directo del root de Perfil (jamás banda destructiva de ancho completo)');
  var piePadreEliminar = botonEliminar.parentNode;
  afirmar(!!piePadreEliminar && clasesDe(piePadreEliminar).indexOf('hz-form-pie') !== -1,
    'F-05.1: #hz-btn-eliminar-cliente debe ser descendiente directo de .hz-form-pie');
  var cardEditarPerfilMC06 = piePadreEliminar.parentNode;
  afirmar(!!cardEditarPerfilMC06 && clasesDe(cardEditarPerfilMC06).indexOf('hz-form-card') !== -1,
    'F-05.1: .hz-form-pie del botón eliminar debe vivir dentro de la card de Editar perfil (hz-form-card)');
  var tituloCardEditarMC06 = recolectarNodos(cardEditarPerfilMC06).filter(function (n) { return clasesDe(n).indexOf('hz-card-title') !== -1; })[0];
  afirmar(!!tituloCardEditarMC06 && tituloCardEditarMC06.textContent === 'Editar perfil',
    'F-05.1: el pie de eliminación debe estar en la card titulada "Editar perfil"');

  botonEliminar.despachar('click', {});
  afirmar(almacenMock._llamadas.eliminarCliente.length === 0, 'MC-06: el PRIMER click NO debe invocar Almacen.eliminarCliente todavía');
  afirmar(botonEliminar.getAttribute('data-confirmar') === 'true', 'MC-06: tras el primer click, data-confirmar debe pasar a "true"');
  afirmar(botonEliminar.textContent === '¿Eliminar a Beatriz Luna? Confirmar',
    'MC-06: tras el primer click, el texto debe ser exactamente "¿Eliminar a {nombre}? Confirmar"');
  afirmar(timeoutsCapturados.length === 1, 'MC-06: el primer click debe programar UN temporizador de reversión');
  afirmar(timeoutsCapturados[0].ms === 6000, 'MC-06: la reversión debe programarse a 6000ms (6 segundos)');

  // Simula el paso de los 6 segundos SIN un segundo click: debe revertir.
  timeoutsCapturados[0].fn();
  afirmar(botonEliminar.getAttribute('data-confirmar') === 'false', 'MC-06: tras 6s sin confirmar, data-confirmar debe volver a "false"');
  afirmar(botonEliminar.textContent === 'Eliminar este cliente', 'MC-06: tras 6s sin confirmar, el texto debe volver al original');

  // Segundo escenario: primer click, luego SEGUNDO click (confirmar) antes
  // de que venza el temporizador -- debe invocar eliminarCliente y cancelar
  // el temporizador pendiente.
  timeoutsCapturados = [];
  botonEliminar.despachar('click', {});
  afirmar(timeoutsCapturados.length === 1, 'MC-06: el click de re-armado también debe programar su propio temporizador');
  botonEliminar.despachar('click', {});
  afirmar(almacenMock._llamadas.eliminarCliente.length === 1, 'MC-06: el SEGUNDO click (confirmado) debe invocar Almacen.eliminarCliente exactamente una vez');
  afirmar(almacenMock._llamadas.eliminarCliente[0] === 'c-activo', 'MC-06: eliminarCliente debe recibir el id del cliente activo');
  afirmar(timeoutsCapturados[0].cancelado === true, 'MC-06: el segundo click (confirmado) debe cancelar el temporizador de reversión pendiente');

  globalThis.setTimeout = setTimeoutOriginal;
  globalThis.clearTimeout = clearTimeoutOriginal;
  globalThis.Herzon.Almacen = undefined;
});

// ---------------------------------------------------------------------
// 16. R8 punto 5: edición de perfil -- formulario prellenado con el perfil
// actual, submit llama Herzon.Almacen.actualizarPerfil con el objeto
// correcto y refresca la vista (SIN depender de herzon:modo-cambiado,
// actualizarPerfil no remonta cliente).
// ---------------------------------------------------------------------
conBusDeEventosAislado(function () {
  var almacenMock = crearAlmacenMock({ modo: 'real', actualizarPerfil: function () { return true; } });
  globalThis.Herzon.Almacen = almacenMock;
  var datosEdicion = datosClienteVacio();
  datosEdicion.paciente.nombre = 'Carla Ruiz';
  datosEdicion.paciente.sexo = 'femenino';
  datosEdicion.paciente.edad = 30;
  datosEdicion.paciente.talla_cm = 165;
  datosEdicion.paciente.pesoInicial_kg = 60;
  datosEdicion.paciente.actividad = 'ligero';
  datosEdicion.paciente.objetivo = 'Bajar grasa corporal';
  globalThis.HERZON_DATA = datosEdicion;

  var rootPerfilEditar = contenedorNuevo();
  Herzon.Views.perfil(rootPerfilEditar);

  var campoNombreEditar = buscarPorId(rootPerfilEditar, 'hz-editar-nombre');
  afirmar(!!campoNombreEditar, 'R8 punto 5: debe existir el campo de edición de nombre');
  afirmar(campoNombreEditar.value === 'Carla Ruiz', 'R8 punto 5: el formulario de edición debe venir PRELLENADO con el perfil actual');
  var campoTallaEditar = buscarPorId(rootPerfilEditar, 'hz-editar-talla');
  afirmar(campoTallaEditar.value === '165', 'R8 punto 5: la talla prellenada debe coincidir con el perfil actual');

  var formEditar = campoNombreEditar;
  while (formEditar && (formEditar.tagName || '').toLowerCase() !== 'form') { formEditar = formEditar.parentNode; }
  afirmar(!!formEditar, 'R8 punto 5: el campo de edición debe estar dentro de un <form>');

  campoNombreEditar.value = 'Carla Ruiz Gómez';
  formEditar.despachar('submit', {});
  afirmar(almacenMock._llamadas.actualizarPerfil.length === 1, 'R8 punto 5: el submit debe llamar Almacen.actualizarPerfil exactamente una vez');
  afirmar(almacenMock._llamadas.actualizarPerfil[0].nombre === 'Carla Ruiz Gómez', 'R8 punto 5: actualizarPerfil debe recibir el nombre editado');
  afirmar(almacenMock._llamadas.actualizarPerfil[0].talla_cm === 165, 'R8 punto 5: actualizarPerfil debe recibir talla_cm como número');

  globalThis.Herzon.Almacen = undefined;
  globalThis.HERZON_DATA = DATA;
});

// ---------------------------------------------------------------------
// 17. R8 punto 5 (captura de mediciones): formulario SOLO en modo real,
// validación patrón T-029 (borde var(--delta-bad), nunca guarda en
// silencio), plicometría opcional (vacía ok / parcial inválida / completa
// ok), éxito llama Almacen.agregarMedicion con el payload correcto.
// ---------------------------------------------------------------------
conBusDeEventosAislado(function () {
  // 17a. Modo demo (Almacen ausente): el formulario de captura NO se monta.
  var fixtureDemo = contenedorSeguimientoConEstatico();
  Herzon.Views.seguimiento(fixtureDemo.root);
  afirmar(fixtureDemo.captura.children.length === 0, 'R8 punto 5: en modo demo, #captura-mediciones debe quedar vacío');
});

conBusDeEventosAislado(function () {
  var resultadoAgregar = { ok: false, errores: ['"peso_kg" fuera de rango plausible (20-400)'] };
  var almacenMock = crearAlmacenMock({ modo: 'real', agregarMedicion: function (m) { return resultadoAgregar; } });
  globalThis.Herzon.Almacen = almacenMock;

  var fixtureCap = contenedorSeguimientoConEstatico();
  Herzon.Views.seguimiento(fixtureCap.root);

  afirmar(fixtureCap.captura.children.length > 0, 'R8 punto 5: en modo real, #captura-mediciones debe montar el formulario de captura');
  var textosCaptura = textosDe(fixtureCap.captura).join(' ');
  afirmar(textosCaptura.indexOf('Tus datos se guardan solo en este dispositivo.') !== -1,
    'Adendum R8 punto 4/5: la captura debe declarar la nota de privacidad exacta');

  // F-06.1/F-06.2: card hz-form-card, form hz-form-columnas.
  var cardCaptura = fixtureCap.captura.children[0];
  afirmar(clasesDe(cardCaptura).indexOf('hz-card') !== -1 && clasesDe(cardCaptura).indexOf('hz-form-card') !== -1,
    'F-06.1: la card de captura debe llevar hz-card y hz-form-card');

  var campoPeso = buscarPorId(fixtureCap.captura, 'hz-cap-peso');
  var campoGrasa = buscarPorId(fixtureCap.captura, 'hz-cap-grasa');
  var campoMusculo = buscarPorId(fixtureCap.captura, 'hz-cap-musculo');
  var campoCintura = buscarPorId(fixtureCap.captura, 'hz-cap-cintura');
  afirmar(!!campoPeso && !!campoGrasa && !!campoMusculo && !!campoCintura, 'R8 punto 5: deben existir los 4 campos requeridos de captura');

  var formCaptura = campoPeso;
  while (formCaptura && (formCaptura.tagName || '').toLowerCase() !== 'form') { formCaptura = formCaptura.parentNode; }
  afirmar(!!formCaptura, 'R8 punto 5: los campos de captura deben vivir dentro de un <form>');
  afirmar(clasesDe(formCaptura).indexOf('hz-form-columnas') !== -1, 'F-06.2: el form de captura debe llevar hz-form-columnas');

  // F-06.3: el <details> de plicometría gana hz-form-ancho y los 4 campos
  // viven en un sub-grid .hz-form-sub, no directo en <details>.
  var detallesCaptura = recolectarNodos(formCaptura).filter(function (n) { return (n.tagName || '').toLowerCase() === 'details'; })[0];
  afirmar(!!detallesCaptura && clasesDe(detallesCaptura).indexOf('hz-form-ancho') !== -1,
    'F-06.3: <details> de plicometría debe llevar hz-form-ancho');
  var subPlicometria = nodosPorClase(detallesCaptura, 'hz-form-sub')[0];
  afirmar(!!subPlicometria, 'F-06.3: debe existir un .hz-form-sub dentro de <details> con los 4 campos de plicometría');
  afirmar(subPlicometria.children.length === 4, 'F-06.3: .hz-form-sub debe contener los 4 campos de plicometría');

  // F-06.5: botón primario dentro de hz-form-acciones.
  var botonCaptura = recolectarNodos(formCaptura).filter(function (n) { return (n.tagName || '').toLowerCase() === 'button'; })[0];
  afirmar(clasesDe(botonCaptura).indexOf('hz-btn') !== -1 && clasesDe(botonCaptura).indexOf('hz-btn-primario') !== -1,
    'F-06.5: el botón "Registrar medición" debe llevar hz-btn hz-btn-primario');

  // Caso 1: campos vacíos -- validación bloquea, NO llama agregarMedicion.
  formCaptura.despachar('submit', {});
  afirmar(almacenMock._llamadas.agregarMedicion.length === 0, 'T-029: con campos vacíos, el submit NO debe llamar Almacen.agregarMedicion');
  afirmar(campoPeso.style.borderColor === 'var(--delta-bad)', 'T-029: el campo peso vacío debe marcarse con var(--delta-bad)');
  // F-06.4: notaValidacion pasa de hz-nota a hz-form-error + hz-form-ancho.
  var notaValidacionCaptura = nodosPorClase(formCaptura, 'hz-form-error')[0];
  afirmar(!!notaValidacionCaptura, 'F-06.4: debe existir la nota de validación con clase hz-form-error');
  afirmar(clasesDe(notaValidacionCaptura).indexOf('hz-form-ancho') !== -1, 'F-06.4: la nota de validación debe llevar hz-form-ancho');
  afirmar(notaValidacionCaptura.textContent.indexOf('No se guardó') !== -1, 'T-029: debe explicar que no se guardó, nunca en silencio');

  // Caso 2: campos requeridos válidos, plicometría PARCIAL -- inválido.
  campoPeso.value = '70'; campoGrasa.value = '20'; campoMusculo.value = '30'; campoCintura.value = '80';
  var campoTricipital = buscarPorId(fixtureCap.captura, 'hz-cap-plic-tricipital');
  campoTricipital.value = '12';
  formCaptura.despachar('submit', {});
  afirmar(almacenMock._llamadas.agregarMedicion.length === 0, 'R8 punto 5: con plicometría parcial (1 de 4 sitios), el submit NO debe llamar Almacen.agregarMedicion');
  afirmar(campoTricipital.style.borderColor === '', 'R8 punto 5: el sitio YA lleno no debe marcarse inválido');
  var campoSubescapular = buscarPorId(fixtureCap.captura, 'hz-cap-plic-subescapular');
  afirmar(campoSubescapular.style.borderColor === 'var(--delta-bad)', 'R8 punto 5: los sitios FALTANTES de la plicometría parcial deben marcarse con var(--delta-bad)');

  // Caso 3: éxito, SIN plicometría (limpiar el campo parcial).
  campoTricipital.value = '';
  resultadoAgregar = { ok: true, errores: [], medicion: { semana: 1 } };
  formCaptura.despachar('submit', {});
  afirmar(almacenMock._llamadas.agregarMedicion.length === 1, 'R8 punto 5: con datos válidos y sin plicometría, debe llamar Almacen.agregarMedicion una vez');
  var payload1 = almacenMock._llamadas.agregarMedicion[0];
  afirmar(payload1.peso_kg === 70 && payload1.grasa_pct === 20 && payload1.musculo_kg === 30 && payload1.cintura_cm === 80,
    'R8 punto 5: el payload debe traer los 4 valores numéricos capturados');
  afirmar(payload1.plicometria === undefined, 'R8 punto 5: sin plicometría llenada, el payload NO debe traer la clave plicometria');
  afirmar(campoPeso.value === '', 'R8 punto 5: tras un guardado exitoso, el formulario debe limpiarse');

  // Caso 4: éxito CON los 4 sitios de plicometría completos.
  campoPeso.value = '71'; campoGrasa.value = '19'; campoMusculo.value = '31'; campoCintura.value = '79';
  buscarPorId(fixtureCap.captura, 'hz-cap-plic-tricipital').value = '12';
  buscarPorId(fixtureCap.captura, 'hz-cap-plic-subescapular').value = '10';
  buscarPorId(fixtureCap.captura, 'hz-cap-plic-suprailiaco').value = '14';
  buscarPorId(fixtureCap.captura, 'hz-cap-plic-abdominal').value = '18';
  formCaptura.despachar('submit', {});
  afirmar(almacenMock._llamadas.agregarMedicion.length === 2, 'R8 punto 5: con plicometría completa, también debe llamar Almacen.agregarMedicion');
  var payload2 = almacenMock._llamadas.agregarMedicion[1];
  afirmar(!!payload2.plicometria, 'R8 punto 5: con los 4 sitios llenos, el payload SÍ debe traer plicometria');
  afirmar(payload2.plicometria.tricipital === 12 && payload2.plicometria.subescapular === 10 &&
    payload2.plicometria.suprailiaco === 14 && payload2.plicometria.abdominal === 18,
    'R8 punto 5: la plicometria del payload debe traer los 4 valores exactos capturados');

  globalThis.Herzon.Almacen = undefined;
});

// ---------------------------------------------------------------------
// 18. Estados vacíos (Adendum R8 punto 4, modo real sin datos): hero/líneas
// con < 2 puntos, labs/plicometría con 0 puntos -> .hz-vacio con el texto
// exacto.
// ---------------------------------------------------------------------
conBusDeEventosAislado(function () {
  var almacenMock = crearAlmacenMock({ modo: 'real' });
  globalThis.Herzon.Almacen = almacenMock;
  globalThis.HERZON_DATA = datosClienteVacio();

  var rootResumenVacio = contenedorNuevo();
  Herzon.Views.resumen(rootResumenVacio);
  var gridResumenVacio = nodosPorClase(rootResumenVacio, 'hz-grid')[0];
  afirmar(contarPorClase(gridResumenVacio.children[0], 'hz-vacio') === 1,
    'Adendum R8 punto 4: con < 2 puntos, el héroe de Resumen debe mostrar .hz-vacio');
  afirmar(gridResumenVacio.children[0].textContent === TEXTO_VACIO_ESPERADO(),
    'Adendum R8 punto 4: el texto del vacío debe ser exactamente "Sin datos aún — registra tu primera medición"');
  afirmar(contarPorClase(rootResumenVacio, 'hz-hero') === 0,
    'con el héroe vacío, NO debe existir un .hz-hero (contenido reemplazado por .hz-vacio, sin nodos huérfanos)');

  var rootPerfilVacio = contenedorNuevo();
  Herzon.Views.perfil(rootPerfilVacio);
  var gridSuperiorVacio = nodosPorClase(rootPerfilVacio, 'hz-grid')[0];
  afirmar(contarPorClase(gridSuperiorVacio.children[0], 'hz-vacio') === 1,
    'Adendum R8 punto 4: con paciente.imcActual ausente, el héroe de Perfil (IMC) debe mostrar .hz-vacio');
  var cardLabsVacio = recolectarNodos(rootPerfilVacio).filter(function (n) {
    return clasesDe(n).indexOf('hz-card') !== -1 &&
      recolectarNodos(n).some(function (t) { return clasesDe(t).indexOf('hz-card-title') !== -1 && t.textContent === 'Laboratorios - estado actual'; });
  })[0];
  afirmar(contarPorClase(cardLabsVacio, 'hz-vacio') === 1, 'Adendum R8 punto 4: sin marcadores con valores, la card de laboratorios de Perfil debe mostrar .hz-vacio');

  var fixtureSegVacio = contenedorSeguimientoConEstatico();
  Herzon.Views.seguimiento(fixtureSegVacio.root);
  afirmar(contarPorClase(fixtureSegVacio.root, 'hz-vacio') >= 6,
    'Adendum R8 punto 4: con 0 puntos, deben mostrarse vacíos para hero + 4 líneas + labs + plicometría (>= 6 nodos .hz-vacio)');
  afirmar(contarPorClase(fixtureSegVacio.root, 'hz-hero') === 0, 'con el héroe de Seguimiento vacío, NO debe existir un .hz-hero');
  afirmar(polylinesDe(fixtureSegVacio.root).length === 0, 'Adendum R8 punto 4: sin datos, ninguna línea/barra debe dibujarse');
  afirmar(fixtureSegVacio.captura.children.length > 0, 'en modo real, la captura SÍ debe montarse aunque el resto esté vacío (para poder registrar la primera medición)');

  globalThis.Herzon.Almacen = undefined;
  globalThis.HERZON_DATA = DATA;
});
function TEXTO_VACIO_ESPERADO() { return 'Sin datos aún — registra tu primera medición'; }

// ---------------------------------------------------------------------
// 19. herzon:modo-cambiado -- remontaje COMPLETO de Vista Seguimiento
// (hero + líneas + labs + plicometría + captura) al cambiar de cliente,
// SIN tocar #captura-mediciones/#doc-herramientas (mismos nodos).
// ---------------------------------------------------------------------
conBusDeEventosAislado(function (listeners) {
  var almacenMock = crearAlmacenMock({ modo: 'real' });
  globalThis.Herzon.Almacen = almacenMock;
  globalThis.HERZON_DATA = datosClienteVacio();

  var fixtureRemontaje = contenedorSeguimientoConEstatico();
  Herzon.Views.seguimiento(fixtureRemontaje.root);
  afirmar(contarPorClase(fixtureRemontaje.root, 'hz-vacio') >= 6, 'sanity: el cliente inicial (vacío) debe mostrar los vacíos esperados');

  // Cambia de cliente: HERZON_DATA pasa a ser el objeto demo completo (12
  // semanas de datos) y se dispara herzon:modo-cambiado (semántica de
  // remontaje, Adendum R9 punto 3).
  globalThis.HERZON_DATA = JSON.parse(DATA_ORIGINAL_JSON);
  afirmar((listeners['herzon:modo-cambiado'] || []).length === 1, 'Vista Seguimiento debe registrar UN listener de herzon:modo-cambiado');
  listeners['herzon:modo-cambiado'][0]({ type: 'herzon:modo-cambiado', detail: { modo: 'real', clienteId: 'c-otro' } });

  afirmar(buscarPorId(fixtureRemontaje.root, 'captura-mediciones') === fixtureRemontaje.captura,
    'herzon:modo-cambiado: el remontaje NO debe reemplazar el nodo estático #captura-mediciones');
  afirmar(buscarPorId(fixtureRemontaje.root, 'doc-herramientas') === fixtureRemontaje.docHerramientas,
    'herzon:modo-cambiado: el remontaje NO debe tocar #doc-herramientas (de otro dueño)');
  afirmar(buscarPorId(fixtureRemontaje.root, 'hz-doc-btn-imprimir') === fixtureRemontaje.botonAjeno,
    'herzon:modo-cambiado: el contenido ajeno dentro de #doc-herramientas debe sobrevivir intacto');

  afirmar(contarPorClase(fixtureRemontaje.root, 'hz-vacio') === 0,
    'herzon:modo-cambiado: tras cambiar a un cliente con datos completos, ya NO deben quedar nodos .hz-vacio');
  afirmar(contarPorClase(fixtureRemontaje.root, 'hz-hero') === 1, 'herzon:modo-cambiado: el héroe debe reaparecer con datos');
  var cardPesoRemontado = recolectarNodos(fixtureRemontaje.root).filter(function (n) {
    return clasesDe(n).indexOf('hz-card') !== -1 &&
      recolectarNodos(n).some(function (t) { return clasesDe(t).indexOf('hz-card-title') !== -1 && t.textContent === 'Peso corporal'; });
  })[0];
  afirmar(puntosDe(polylinesDe(cardPesoRemontado)[0]).length === 12,
    'herzon:modo-cambiado: la línea de peso del cliente nuevo debe dibujar sus 12 puntos');
  afirmar(fixtureRemontaje.captura.children.length > 0,
    'herzon:modo-cambiado: el formulario de captura debe seguir montado (modo real) tras el remontaje');

  globalThis.Herzon.Almacen = undefined;
  globalThis.HERZON_DATA = DATA;
});

// ---------------------------------------------------------------------
// 20. S-05: casilla #hz-perfil-labs-ocultos en Editar perfil -- precargada
// del config vigente; "Guardar cambios" llama actualizarConfig SOLO si el
// valor de la casilla cambió (nunca si quedó igual, evita un remontaje
// redundante).
// ---------------------------------------------------------------------
conBusDeEventosAislado(function () {
  var almacenMock = crearAlmacenMock({ modo: 'real', actualizarPerfil: function () { return true; } });
  globalThis.Herzon.Almacen = almacenMock;
  var datosS05a = datosClienteVacio();
  datosS05a.config = { labsOcultos: false };
  globalThis.HERZON_DATA = datosS05a;

  var rootS05a = contenedorNuevo();
  Herzon.Views.perfil(rootS05a);
  var checkboxLabsA = buscarPorId(rootS05a, 'hz-perfil-labs-ocultos');
  afirmar(!!checkboxLabsA, 'S-05: debe existir #hz-perfil-labs-ocultos en Editar perfil');
  afirmar(checkboxLabsA.getAttribute('type') === 'checkbox', 'S-05: #hz-perfil-labs-ocultos debe ser type=checkbox');
  afirmar(checkboxLabsA.checked === false, 'S-05: con config.labsOcultos=false, la casilla debe iniciar SIN marcar');
  afirmar(clasesDe(checkboxLabsA.parentNode).indexOf('hz-form-ancho') !== -1, 'S-05: la fila de la casilla debe caer en hz-form-ancho');

  var formEditarS05a = checkboxLabsA;
  while (formEditarS05a && (formEditarS05a.tagName || '').toLowerCase() !== 'form') { formEditarS05a = formEditarS05a.parentNode; }
  formEditarS05a.despachar('submit', {});
  afirmar(almacenMock._llamadas.actualizarPerfil.length === 1, 'S-05: "Guardar cambios" siempre debe llamar actualizarPerfil');
  afirmar(almacenMock._llamadas.actualizarConfig.length === 0, 'S-05: si la casilla NO cambió, actualizarConfig NO debe llamarse');

  globalThis.Herzon.Almacen = undefined;
  globalThis.HERZON_DATA = DATA;
});

conBusDeEventosAislado(function () {
  var almacenMock = crearAlmacenMock({ modo: 'real', actualizarPerfil: function () { return true; } });
  globalThis.Herzon.Almacen = almacenMock;
  var datosS05b = datosClienteVacio();
  datosS05b.config = { labsOcultos: true };
  globalThis.HERZON_DATA = datosS05b;

  var rootS05b = contenedorNuevo();
  Herzon.Views.perfil(rootS05b);
  var checkboxLabsB = buscarPorId(rootS05b, 'hz-perfil-labs-ocultos');
  afirmar(checkboxLabsB.checked === true, 'S-05: con config.labsOcultos=true, la casilla debe iniciar MARCADA');

  checkboxLabsB.checked = false;
  var formEditarS05b = checkboxLabsB;
  while (formEditarS05b && (formEditarS05b.tagName || '').toLowerCase() !== 'form') { formEditarS05b = formEditarS05b.parentNode; }
  formEditarS05b.despachar('submit', {});
  afirmar(almacenMock._llamadas.actualizarConfig.length === 1, 'S-05: si la casilla SÍ cambió, actualizarConfig debe llamarse exactamente una vez');
  afirmar(almacenMock._llamadas.actualizarConfig[0].labsOcultos === false, 'S-05: actualizarConfig debe recibir el valor NUEVO de la casilla');

  globalThis.Herzon.Almacen = undefined;
  globalThis.HERZON_DATA = DATA;
});

// ---------------------------------------------------------------------
// 21. S-05: con labsOcultos=true en modo REAL, la vista Perfil OMITE la
// card "Laboratorios - estado actual" (decisión clínica, nunca un vacío);
// en DEMO la card SIEMPRE se monta, sin importar config.labsOcultos.
// ---------------------------------------------------------------------
function cardPorTituloEn(raiz, titulo) {
  return recolectarNodos(raiz).filter(function (n) {
    return clasesDe(n).indexOf('hz-card') !== -1 &&
      recolectarNodos(n).some(function (t) { return clasesDe(t).indexOf('hz-card-title') !== -1 && t.textContent === titulo; });
  })[0];
}
conBusDeEventosAislado(function () {
  var almacenReal = crearAlmacenMock({ modo: 'real' });
  globalThis.Herzon.Almacen = almacenReal;
  var datosRealOcultos = datosClienteVacio();
  datosRealOcultos.config = { labsOcultos: true };
  globalThis.HERZON_DATA = datosRealOcultos;
  var rootPerfilOcultoReal = contenedorNuevo();
  Herzon.Views.perfil(rootPerfilOcultoReal);
  afirmar(!cardPorTituloEn(rootPerfilOcultoReal, 'Laboratorios - estado actual'),
    'S-05: en modo real con labsOcultos=true, Perfil NO debe montar la card de laboratorios');

  var almacenDemo = crearAlmacenMock({ modo: 'demo' });
  globalThis.Herzon.Almacen = almacenDemo;
  var datosDemoOcultos = datosClienteVacio();
  datosDemoOcultos.config = { labsOcultos: true };
  globalThis.HERZON_DATA = datosDemoOcultos;
  var rootPerfilOcultoDemo = contenedorNuevo();
  Herzon.Views.perfil(rootPerfilOcultoDemo);
  afirmar(!!cardPorTituloEn(rootPerfilOcultoDemo, 'Laboratorios - estado actual'),
    'S-05: en modo demo, la card de laboratorios de Perfil SIEMPRE debe montarse (aunque labsOcultos sea true en los datos)');

  globalThis.Herzon.Almacen = undefined;
  globalThis.HERZON_DATA = DATA;
});

// ---------------------------------------------------------------------
// 22. S-05: mismo comportamiento de omisión en Vista Seguimiento, para la
// card "Laboratorios en 3 cortes".
// ---------------------------------------------------------------------
conBusDeEventosAislado(function () {
  var almacenReal = crearAlmacenMock({ modo: 'real' });
  globalThis.Herzon.Almacen = almacenReal;
  var datosSegRealOcultos = datosClienteVacio();
  datosSegRealOcultos.config = { labsOcultos: true };
  globalThis.HERZON_DATA = datosSegRealOcultos;
  var fixtureSegOcultoReal = contenedorSeguimientoConEstatico();
  Herzon.Views.seguimiento(fixtureSegOcultoReal.root);
  afirmar(!cardPorTituloEn(fixtureSegOcultoReal.root, 'Laboratorios en 3 cortes'),
    'S-05: en modo real con labsOcultos=true, Seguimiento NO debe montar "Laboratorios en 3 cortes"');

  var almacenDemo = crearAlmacenMock({ modo: 'demo' });
  globalThis.Herzon.Almacen = almacenDemo;
  var datosSegDemoOcultos = datosClienteVacio();
  datosSegDemoOcultos.config = { labsOcultos: true };
  globalThis.HERZON_DATA = datosSegDemoOcultos;
  var fixtureSegOcultoDemo = contenedorSeguimientoConEstatico();
  Herzon.Views.seguimiento(fixtureSegOcultoDemo.root);
  afirmar(!!cardPorTituloEn(fixtureSegOcultoDemo.root, 'Laboratorios en 3 cortes'),
    'S-05: en modo demo, "Laboratorios en 3 cortes" SIEMPRE debe montarse (aunque labsOcultos sea true en los datos)');

  globalThis.Herzon.Almacen = undefined;
  globalThis.HERZON_DATA = DATA;
});

// ---------------------------------------------------------------------
// 23. S-02: card #hz-card-desbloqueo -- SOLO mientras
// Almacen.bloqueado()===true, como PRIMERA card (C-3); textos EXACTOS
// (C-10); estado ocupado "Descifrando…"; error nunca silencioso;
// contraseña limpiada tras un intento fallido; ruta de recuperación
// (S-04) presente; el éxito desmonta la card vía el remontaje real.
// ---------------------------------------------------------------------
conBusDeEventosAislado(function () {
  var almacenDesbloqueado = crearAlmacenMock({ modo: 'real', bloqueado: false });
  globalThis.Herzon.Almacen = almacenDesbloqueado;
  var rootSinBloqueo = contenedorNuevo();
  Herzon.Views.perfil(rootSinBloqueo);
  afirmar(!buscarPorId(rootSinBloqueo, 'hz-card-desbloqueo'), 'S-02: con bloqueado()===false, #hz-card-desbloqueo NO debe montarse');
  globalThis.Herzon.Almacen = undefined;
});

conBusDeEventosAislado(function (listeners) {
  var bloqueadoActual = true;
  var promesaDesbloqueo = null;
  var almacenMock = crearAlmacenMock({
    modo: 'real',
    bloqueado: function () { return bloqueadoActual; },
    desbloquearYMontar: function (contrasena) {
      promesaDesbloqueo = promesaControlada();
      return promesaDesbloqueo;
    }
  });
  globalThis.Herzon.Almacen = almacenMock;

  var rootBloqueado = contenedorNuevo();
  Herzon.Views.perfil(rootBloqueado);

  afirmar(rootBloqueado.children[0] === buscarPorId(rootBloqueado, 'hz-card-desbloqueo'),
    'S-02/C-3: #hz-card-desbloqueo debe ser la PRIMERA card mientras bloqueado()===true');
  var cardDesbloqueo = buscarPorId(rootBloqueado, 'hz-card-desbloqueo');
  afirmar(clasesDe(cardDesbloqueo).indexOf('hz-card') !== -1 && clasesDe(cardDesbloqueo).indexOf('hz-form-card') !== -1,
    'S-02: #hz-card-desbloqueo debe llevar hz-card hz-form-card');

  var tituloDesbloqueo = recolectarNodos(cardDesbloqueo).filter(function (n) { return clasesDe(n).indexOf('hz-card-title') !== -1; })[0];
  afirmar(!!tituloDesbloqueo && tituloDesbloqueo.textContent === 'Tus datos están protegidos', 'C-10: título EXACTO de la card de desbloqueo');
  var textosDesbloqueo = textosDe(cardDesbloqueo).join(' ');
  afirmar(textosDesbloqueo.indexOf('La información de tus clientes está cifrada en este dispositivo. Escribe tu contraseña para desbloquearla.') !== -1,
    'C-10: cuerpo EXACTO de la card de desbloqueo');
  afirmar(textosDesbloqueo.indexOf('Si olvidaste tu contraseña, no es posible recuperarla. Puedes restaurar un respaldo o borrar todos los datos para empezar de cero.') !== -1,
    'C-10: pie de recuperación EXACTO');

  var campoPass = buscarPorId(cardDesbloqueo, 'hz-desbloqueo-pass');
  afirmar(!!campoPass && campoPass.getAttribute('type') === 'password', 'S-02: #hz-desbloqueo-pass debe ser type=password');
  afirmar(campoPass.getAttribute('autocomplete') === 'current-password', 'S-02: #hz-desbloqueo-pass debe llevar autocomplete=current-password');

  var botonDesbloquear = buscarPorId(cardDesbloqueo, 'hz-btn-desbloquear');
  afirmar(!!botonDesbloquear && botonDesbloquear.textContent === 'Desbloquear', 'C-10: texto EXACTO del botón "Desbloquear"');
  afirmar(clasesDe(botonDesbloquear).indexOf('hz-btn') !== -1 && clasesDe(botonDesbloquear).indexOf('hz-btn-primario') !== -1,
    'F-02: #hz-btn-desbloquear debe llevar hz-btn hz-btn-primario');

  var errorDesbloqueo = buscarPorId(cardDesbloqueo, 'hz-desbloqueo-error');
  afirmar(!!errorDesbloqueo && clasesDe(errorDesbloqueo).indexOf('hz-form-error') !== -1, 'S-02: #hz-desbloqueo-error debe llevar hz-form-error');

  var botonBorrarTodo = buscarPorId(cardDesbloqueo, 'hz-btn-desbloqueo-borrar-todo');
  afirmar(!!botonBorrarTodo && botonBorrarTodo.textContent === 'Borrar todos los datos', 'S-02: debe existir el botón "Borrar todos los datos" en el pie');

  // S-04 (ruta de recuperación desde bloqueado): restaurar un respaldo con
  // la frase EXTRA que advierte que desactiva la contraseña actual.
  var labelRestaurarBloqueado = buscarPorId(cardDesbloqueo, 'hz-desbloqueo-import-label');
  var inputRestaurarBloqueado = buscarPorId(cardDesbloqueo, 'hz-desbloqueo-input-restaurar');
  afirmar(!!labelRestaurarBloqueado && !!inputRestaurarBloqueado, 'S-04: la card de desbloqueo debe ofrecer restaurar un respaldo');
  function FileReaderStubBloqueado() { this.onload = null; this.onerror = null; this.result = null; }
  FileReaderStubBloqueado.prototype.readAsText = function (archivo) {
    this.result = archivo && archivo._contenidoTexto;
    if (typeof this.onload === 'function') { this.onload({ target: this }); }
  };
  globalThis.FileReader = FileReaderStubBloqueado;
  var respaldoParaBloqueado = { _contenidoTexto: JSON.stringify({ formato: 'rinde-respaldo-1', exportado: '2026-08-01', datos: { version: 2, activoId: null, clientes: { 'c-1': {} } } }) };
  inputRestaurarBloqueado.files = [respaldoParaBloqueado];
  inputRestaurarBloqueado.despachar('change');
  afirmar(textosDe(cardDesbloqueo).join(' ').indexOf('Esto reemplaza los datos cifrados de este dispositivo y desactiva la contraseña actual. Podrás activar una nueva después.') !== -1,
    'C-10/S-04: la ruta desde bloqueado debe agregar la advertencia EXACTA de que desactiva la contraseña actual');
  delete globalThis.FileReader;

  // Envía la contraseña: estado ocupado ANTES de que la promesa resuelva.
  campoPass.value = 'clave-mala';
  var formDesbloqueo = campoPass;
  while (formDesbloqueo && (formDesbloqueo.tagName || '').toLowerCase() !== 'form') { formDesbloqueo = formDesbloqueo.parentNode; }
  formDesbloqueo.despachar('submit', {});
  afirmar(almacenMock._llamadas.desbloquearYMontar.length === 1 && almacenMock._llamadas.desbloquearYMontar[0] === 'clave-mala',
    'S-02: el submit debe llamar Almacen.desbloquearYMontar con la contraseña capturada');
  afirmar(botonDesbloquear.getAttribute('disabled') === 'disabled', 'S-02: durante el descifrado, el botón debe deshabilitarse (estado ocupado)');
  afirmar(botonDesbloquear.textContent === 'Descifrando…', 'C-10: el botón ocupado debe decir EXACTAMENTE "Descifrando…"');
  afirmar(campoPass.getAttribute('disabled') === 'disabled', 'S-02: el campo de contraseña también debe deshabilitarse mientras descifra');

  // Resuelve con fallo (contraseña incorrecta): error nunca silencioso +
  // contraseña limpiada + botón vuelve a su estado normal.
  promesaDesbloqueo.resolver({ ok: false, error: 'Contraseña incorrecta. Vuelve a intentarlo.' });
  afirmar(errorDesbloqueo.textContent === 'Contraseña incorrecta. Vuelve a intentarlo.',
    'C-10: mensaje de error EXACTO tras una contraseña incorrecta (nunca silencioso)');
  afirmar(botonDesbloquear.getAttribute('disabled') === null, 'S-02: tras el fallo, el botón debe volver a habilitarse');
  afirmar(botonDesbloquear.textContent === 'Desbloquear', 'S-02: tras el fallo, el texto del botón vuelve a "Desbloquear"');
  afirmar(campoPass.value === '', 'S-02: tras un intento fallido, el campo de contraseña debe limpiarse');

  // Segundo intento, ahora exitoso: simula la secuencia de eventos que
  // Almacen dispara en la implementación real (clientes-actualizados ->
  // cliente-cambiado -> modo-cambiado) bajando bloqueadoActual y
  // remontando -- la card de desbloqueo debe desaparecer.
  campoPass.value = 'clave-buena';
  formDesbloqueo.despachar('submit', {});
  bloqueadoActual = false;
  promesaDesbloqueo.resolver({ ok: true });
  afirmar((listeners['herzon:modo-cambiado'] || []).length === 1, 'S-02: Vista Perfil debe registrar UN listener de herzon:modo-cambiado');
  listeners['herzon:modo-cambiado'][0]({ type: 'herzon:modo-cambiado', detail: { modo: 'real', clienteId: 'c-x' } });
  afirmar(!buscarPorId(rootBloqueado, 'hz-card-desbloqueo'), 'S-02: tras un desbloqueo exitoso y el remontaje, #hz-card-desbloqueo debe desaparecer');

  globalThis.Herzon.Almacen = undefined;
});

// ---------------------------------------------------------------------
// 24. S-03: card #hz-card-seguridad -- SOLO en modo real Y desbloqueado
// (ausente en demo, ausente mientras bloqueado); estado SIN protección
// completo (C-10): checkbox de confirmación habilita el primario,
// validación nunca silenciosa, estado ocupado "Cifrando…", contraseñas
// limpiadas tras el resultado (éxito incluido), mensaje de éxito
// consumo-único.
// ---------------------------------------------------------------------
conBusDeEventosAislado(function () {
  var almacenDemo = crearAlmacenMock({ modo: 'demo' });
  globalThis.Herzon.Almacen = almacenDemo;
  var rootDemoSeg = contenedorNuevo();
  Herzon.Views.perfil(rootDemoSeg);
  afirmar(!buscarPorId(rootDemoSeg, 'hz-card-seguridad'), 'S-03: en modo demo, #hz-card-seguridad NO debe montarse');

  var almacenBloqueado = crearAlmacenMock({ modo: 'real', bloqueado: true });
  globalThis.Herzon.Almacen = almacenBloqueado;
  var rootBloqueadoSeg = contenedorNuevo();
  Herzon.Views.perfil(rootBloqueadoSeg);
  afirmar(!buscarPorId(rootBloqueadoSeg, 'hz-card-seguridad'), 'S-03: mientras bloqueado()===true, #hz-card-seguridad NO debe montarse (en su lugar va #hz-card-desbloqueo)');

  globalThis.Herzon.Almacen = undefined;
});

conBusDeEventosAislado(function () {
  var promesaActivar = null;
  var seguridadMock = crearSeguridadMock({
    activa: false,
    activar: function (contrasena) {
      promesaActivar = promesaControlada();
      return promesaActivar;
    }
  });
  globalThis.Herzon.Seguridad = seguridadMock;
  var almacenMock = crearAlmacenMock({ modo: 'real', bloqueado: false });
  globalThis.Herzon.Almacen = almacenMock;

  var rootSeg = contenedorNuevo();
  Herzon.Views.perfil(rootSeg);
  var cardSeg = buscarPorId(rootSeg, 'hz-card-seguridad');
  afirmar(!!cardSeg, 'S-03: en modo real desbloqueado, #hz-card-seguridad debe montarse');
  afirmar(clasesDe(cardSeg).indexOf('hz-card') !== -1 && clasesDe(cardSeg).indexOf('hz-form-card') !== -1, 'S-03: #hz-card-seguridad debe llevar hz-card hz-form-card');
  var tituloSeg = recolectarNodos(cardSeg).filter(function (n) { return clasesDe(n).indexOf('hz-card-title') !== -1; })[0];
  afirmar(!!tituloSeg && tituloSeg.textContent === 'Seguridad y respaldo', 'C-10: título EXACTO "Seguridad y respaldo"');
  afirmar(textosDe(cardSeg).join(' ').indexOf('La contraseña protege todos los clientes guardados en este dispositivo. Los datos se cifran aquí mismo: nadie puede recuperarlos sin la contraseña, ni siquiera tú.') !== -1,
    'C-10: nota de ámbito EXACTA');

  var botonRespaldoSinProteccion = buscarPorId(cardSeg, 'hz-btn-seg-respaldo');
  afirmar(!!botonRespaldoSinProteccion, 'S-03.1: debe ofrecerse "Descargar respaldo (.json)" ANTES de activar la protección');

  var campoPass1 = buscarPorId(cardSeg, 'hz-seg-pass-1');
  var campoPass2 = buscarPorId(cardSeg, 'hz-seg-pass-2');
  afirmar(campoPass1.getAttribute('minlength') === '8' && campoPass1.getAttribute('autocomplete') === 'new-password',
    'S-03.2: #hz-seg-pass-1 debe llevar minlength=8 y autocomplete=new-password');
  var checkboxConfirmo = buscarPorId(cardSeg, 'hz-seg-confirmo');
  var botonActivar = buscarPorId(cardSeg, 'hz-btn-seg-activar');
  afirmar(clasesDe(botonActivar).indexOf('hz-btn') !== -1 && clasesDe(botonActivar).indexOf('hz-btn-primario') !== -1,
    'F-02: #hz-btn-seg-activar debe llevar hz-btn hz-btn-primario');
  afirmar(botonActivar.getAttribute('disabled') === 'disabled', 'S-03.4: el botón Activar protección debe iniciar deshabilitado hasta marcar la casilla');

  checkboxConfirmo.checked = true;
  checkboxConfirmo.despachar('change', {});
  afirmar(botonActivar.getAttribute('disabled') === null, 'S-03.3: al marcar la casilla de confirmación, el botón debe habilitarse');

  var errorSeg = buscarPorId(cardSeg, 'hz-seg-error');
  var formSeg = campoPass1;
  while (formSeg && (formSeg.tagName || '').toLowerCase() !== 'form') { formSeg = formSeg.parentNode; }

  formSeg.despachar('submit', {});
  afirmar(errorSeg.textContent === 'Escribe la contraseña en ambos campos.', 'S-03.4: campos vacíos -- error nunca silencioso');
  afirmar(seguridadMock._llamadas.activar.length === 0, 'S-03.4: con campos vacíos, Seguridad.activar NO debe llamarse');

  campoPass1.value = '123'; campoPass2.value = '123';
  formSeg.despachar('submit', {});
  afirmar(errorSeg.textContent === 'La contraseña debe tener al menos 8 caracteres.', 'S-03.4: contraseña corta -- error nunca silencioso');

  campoPass1.value = 'abcdefgh'; campoPass2.value = 'abcdefgx';
  formSeg.despachar('submit', {});
  afirmar(errorSeg.textContent === 'Las contraseñas no coinciden.', 'S-03.4: contraseñas distintas -- error nunca silencioso');

  // Válido: estado ocupado ANTES de resolver, luego fallo (asíncrono).
  campoPass1.value = 'abcdefgh'; campoPass2.value = 'abcdefgh';
  formSeg.despachar('submit', {});
  afirmar(seguridadMock._llamadas.activar.length === 1 && seguridadMock._llamadas.activar[0] === 'abcdefgh',
    'S-03.4: con datos válidos, debe llamar Seguridad.activar con la contraseña');
  afirmar(botonActivar.getAttribute('disabled') === 'disabled', 'S-03.4: durante el cifrado, el botón debe deshabilitarse (estado ocupado)');
  afirmar(botonActivar.textContent === 'Cifrando…', 'C-10: el botón ocupado debe decir EXACTAMENTE "Cifrando…"');

  promesaActivar.resolver({ ok: false, errores: ['No se pudo activar la protección en este dispositivo.'] });
  afirmar(errorSeg.textContent === 'No se pudo activar la protección en este dispositivo.', 'S-03.4: fallo de activar -- error nunca silencioso');
  afirmar(botonActivar.getAttribute('disabled') === null, 'S-03.4: tras el fallo, el botón vuelve a habilitarse');
  afirmar(campoPass1.value === '' && campoPass2.value === '', 'S-03: los campos de contraseña se limpian tras la operación (también en fallo, nunca se persisten)');

  // Reintento exitoso: contraseñas limpiadas tras éxito + mensaje de éxito
  // consumo-único en el remontaje.
  campoPass1.value = 'abcdefgh'; campoPass2.value = 'abcdefgh';
  formSeg.despachar('submit', {});
  promesaActivar.resolver({ ok: true, errores: [] });
  afirmar(campoPass1.value === '' && campoPass2.value === '', 'S-03: los campos de contraseña deben limpiarse tras un ÉXITO de activar');
  var cardSegTrasExito = buscarPorId(rootSeg, 'hz-card-seguridad');
  var notaExitoSeg = buscarPorId(cardSegTrasExito, 'hz-seg-exito');
  afirmar(!!notaExitoSeg && notaExitoSeg.textContent === 'Protección activada. Tus datos quedaron cifrados en este dispositivo.',
    'C-10: tras activar con éxito, el remontaje debe mostrar el mensaje EXACTO de confirmación');

  globalThis.Herzon.Almacen = undefined;
  globalThis.Herzon.Seguridad = undefined;
});

// ---------------------------------------------------------------------
// 25. S-03: estado CON protección (Seguridad.activa()===true) -- bloquear/
// cambiar/quitar/respaldo; "Bloquear ahora" llama Seguridad.bloquear() +
// Almacen.volverADemo(); "Quitar protección" con confirmación en dos
// pasos (F-02); respaldo (S-04) presente en ambos bloques.
// ---------------------------------------------------------------------
conBusDeEventosAislado(function () {
  var seguridadMock = crearSeguridadMock({ activa: true });
  globalThis.Herzon.Seguridad = seguridadMock;
  var almacenMock = crearAlmacenMock({ modo: 'real', bloqueado: false });
  globalThis.Herzon.Almacen = almacenMock;

  var rootProtegido = contenedorNuevo();
  Herzon.Views.perfil(rootProtegido);
  var cardProtegido = buscarPorId(rootProtegido, 'hz-card-seguridad');
  afirmar(!!cardProtegido, 'S-03: con Seguridad.activa()===true, #hz-card-seguridad debe montarse en el estado protegido');
  afirmar(textosDe(cardProtegido).join(' ').indexOf('Protección activada') !== -1, 'C-10: debe mostrarse la línea de estado "Protección activada"');

  var botonBloquear = buscarPorId(cardProtegido, 'hz-btn-seg-bloquear');
  afirmar(!!botonBloquear && botonBloquear.textContent === 'Bloquear ahora', 'C-10: texto EXACTO "Bloquear ahora"');
  afirmar(clasesDe(botonBloquear).indexOf('hz-btn-secundario') !== -1, 'F-02: #hz-btn-seg-bloquear debe ser hz-btn-secundario');
  botonBloquear.despachar('click', {});
  afirmar(seguridadMock._llamadas.bloquear.length === 1, 'S-02: "Bloquear ahora" debe llamar Seguridad.bloquear()');
  afirmar(almacenMock._llamadas.volverADemo.length === 1, 'S-02: "Bloquear ahora" también debe llamar Almacen.volverADemo()');

  ['hz-seg-actual', 'hz-seg-nueva-1', 'hz-seg-nueva-2'].forEach(function (id) {
    afirmar(!!buscarPorId(cardProtegido, id), 'S-03: debe existir el campo #' + id + ' de "Cambiar contraseña"');
  });
  var botonCambiar = buscarPorId(cardProtegido, 'hz-btn-seg-cambiar');
  afirmar(!!botonCambiar && botonCambiar.textContent === 'Cambiar contraseña' && clasesDe(botonCambiar).indexOf('hz-btn-primario') !== -1,
    'C-10/F-02: botón "Cambiar contraseña" primario');

  var campoQuitarPass = buscarPorId(cardProtegido, 'hz-seg-quitar-pass');
  var botonQuitar = buscarPorId(cardProtegido, 'hz-btn-seg-desactivar');
  afirmar(!!campoQuitarPass && !!botonQuitar && botonQuitar.textContent === 'Quitar contraseña', 'C-10: campo y botón EXACTOS de "Quitar protección"');
  afirmar(clasesDe(botonQuitar).indexOf('hz-btn-peligro') !== -1, 'F-02: #hz-btn-seg-desactivar debe ser hz-btn-peligro');
  afirmar(botonQuitar.getAttribute('data-confirmar') === 'false', 'F-02: "Quitar protección" inicia con data-confirmar=false (2 pasos)');
  botonQuitar.despachar('click', {});
  afirmar(seguridadMock._llamadas.desactivar.length === 0, 'F-02: el PRIMER click de "Quitar protección" NO debe ejecutar la baja todavía');
  afirmar(botonQuitar.getAttribute('data-confirmar') === 'true', 'F-02: tras el primer click, data-confirmar pasa a true');
  afirmar(textosDe(cardProtegido).join(' ').indexOf('Al quitar la contraseña, los datos quedan guardados SIN cifrar en este dispositivo.') !== -1,
    'C-10: advertencia EXACTA antes de quitar la contraseña');

  afirmar(!!buscarPorId(cardProtegido, 'hz-btn-seg-respaldo'), 'S-04: la sección Respaldo (con protección) debe ofrecer "Descargar respaldo (.json)"');
  afirmar(textosDe(cardProtegido).join(' ').indexOf('El respaldo se descarga SIN cifrar. Incluye a todos los clientes: guárdalo en un lugar seguro.') !== -1,
    'C-10: nota de custodia EXACTA del respaldo');
  afirmar(!!buscarPorId(cardProtegido, 'hz-seg-input-restaurar'), 'S-04: la sección Respaldo debe ofrecer restaurar (input file)');

  globalThis.Herzon.Almacen = undefined;
  globalThis.Herzon.Seguridad = undefined;
});

// ---------------------------------------------------------------------
// 26. S-04: restaurar respaldo desde la card de seguridad (con
// protección) -- confirmación con conteos REALES (N actuales / M del
// archivo, C-11), confirmación en dos pasos, y Almacen.restaurarRespaldo
// recibe el objeto leído del archivo.
// ---------------------------------------------------------------------
conBusDeEventosAislado(function () {
  var seguridadMock = crearSeguridadMock({ activa: true });
  globalThis.Herzon.Seguridad = seguridadMock;
  var almacenMock = crearAlmacenMock({
    modo: 'real', bloqueado: false,
    clientes: [{ id: 'c-1' }, { id: 'c-2' }]
  });
  globalThis.Herzon.Almacen = almacenMock;
  globalThis.HERZON_DATA = datosClienteVacio();

  var rootS04 = contenedorNuevo();
  Herzon.Views.perfil(rootS04);
  var cardSegS04 = buscarPorId(rootS04, 'hz-card-seguridad');
  var inputRestaurar = buscarPorId(cardSegS04, 'hz-seg-input-restaurar');
  afirmar(!!inputRestaurar, 'S-04: debe existir #hz-seg-input-restaurar en la card de seguridad');

  function FileReaderStubS04() { this.onload = null; this.onerror = null; this.result = null; }
  FileReaderStubS04.prototype.readAsText = function (archivo) {
    this.result = archivo && archivo._contenidoTexto;
    if (typeof this.onload === 'function') { this.onload({ target: this }); }
  };
  globalThis.FileReader = FileReaderStubS04;

  var respaldoValido = {
    _contenidoTexto: JSON.stringify({ formato: 'rinde-respaldo-1', exportado: '2026-08-01', datos: { version: 2, activoId: 'c-1', clientes: { 'c-1': {}, 'c-2': {}, 'c-3': {} } } })
  };
  inputRestaurar.value = 'C:\\fakepath\\respaldo.json';
  inputRestaurar.files = [respaldoValido];
  inputRestaurar.despachar('change');

  afirmar(textosDe(cardSegS04).join(' ').indexOf('Restaurar este respaldo reemplaza los 2 clientes actuales de este dispositivo por los 3 clientes del archivo (exportado el 2026-08-01). Esta acción no se puede deshacer.') !== -1,
    'C-11/S-04: la confirmación debe mostrar los conteos REALES (N actuales / M del archivo) y la fecha exportada');

  var botonRespaldarAntes = recolectarNodos(cardSegS04).filter(function (n) { return (n.tagName || '').toLowerCase() === 'button' && n.textContent === 'Descargar respaldo de lo actual antes de continuar'; })[0];
  afirmar(!!botonRespaldarAntes, 'S-04: con N>0 clientes actuales, debe ofrecerse "Descargar respaldo de lo actual antes de continuar"');

  var botonConfirmarRestaurar = buscarPorId(cardSegS04, 'hz-btn-seg-restaurar-confirmar');
  afirmar(!!botonConfirmarRestaurar && botonConfirmarRestaurar.textContent === 'Reemplazar todo y restaurar', 'C-10: texto EXACTO del botón de confirmación');
  afirmar(clasesDe(botonConfirmarRestaurar).indexOf('hz-btn-peligro') !== -1, 'F-02: el botón de restaurar confirmado debe ser hz-btn-peligro');
  afirmar(botonConfirmarRestaurar.getAttribute('data-confirmar') === 'false', 'S-04: confirmación en dos pasos -- inicia en false');

  botonConfirmarRestaurar.despachar('click', {});
  afirmar(almacenMock._llamadas.restaurarRespaldo.length === 0, 'S-04: el PRIMER click no debe restaurar todavía (2 pasos)');
  afirmar(botonConfirmarRestaurar.getAttribute('data-confirmar') === 'true', 'S-04: tras el primer click, data-confirmar pasa a true');

  botonConfirmarRestaurar.despachar('click', {});
  afirmar(almacenMock._llamadas.restaurarRespaldo.length === 1, 'S-04: el SEGUNDO click (confirmado) debe llamar Almacen.restaurarRespaldo');
  afirmar(almacenMock._llamadas.restaurarRespaldo[0].datos.clientes['c-3'] !== undefined, 'S-04: restaurarRespaldo debe recibir el objeto EXACTO leído del archivo');

  delete globalThis.FileReader;
  globalThis.Herzon.Almacen = undefined;
  globalThis.Herzon.Seguridad = undefined;
  globalThis.HERZON_DATA = DATA;
});

// ---------------------------------------------------------------------
// Cierre
// ---------------------------------------------------------------------
console.log('checks ejecutados: ' + contador);
process.exit(0);
