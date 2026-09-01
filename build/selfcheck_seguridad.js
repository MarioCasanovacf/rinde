// build/selfcheck_seguridad.js
// Selfcheck de node puro (sin dependencias externas más allá del módulo
// nativo `crypto`) para build/seguridad.js. Formato de salida congelado en
// plan.md 3.J: última línea de stdout literal "checks ejecutados: N"; exit
// 0 solo si todas las aserciones pasan; en fallo, exit 1 e imprime la
// aserción fallida (P-025).
'use strict';

var fs = require('fs');
var path = require('path');
var nodeCrypto = require('crypto');

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
// 0. Carga del módulo: patrón del contrato S-01 — `globalThis.crypto =
//    require('crypto').webcrypto` ANTES del require del módulo. Sin
//    `document`/`window` real: valida que el módulo jamás toca DOM.
// ---------------------------------------------------------------------
// Patrón literal del contrato S-01: `globalThis.crypto = require('crypto').webcrypto`
// ANTES del require del módulo. En Node >=19 `globalThis.crypto` YA es un
// getter nativo (sin setter) que apunta al mismo objeto webcrypto, asi que
// la asignacion directa lanzaria "Cannot set property crypto of..."; se
// intenta la asignacion literal primero y, solo si el entorno la rechaza
// por ser un accessor sin setter, se redefine la propiedad al MISMO
// objeto (`require('crypto').webcrypto`), preservando el patrón exacto
// del contrato en ambos casos.
try {
  globalThis.crypto = nodeCrypto.webcrypto;
} catch (e) {
  Object.defineProperty(globalThis, 'crypto', {
    value: nodeCrypto.webcrypto,
    configurable: true,
    writable: true,
    enumerable: true
  });
}
globalThis.window = globalThis;

var SEGURIDAD_PATH = path.join(__dirname, 'seguridad.js');
var fuenteSeguridad = fs.readFileSync(SEGURIDAD_PATH, 'utf8');

require(SEGURIDAD_PATH);

var Seguridad = globalThis.Herzon && globalThis.Herzon.Seguridad;

// ---------------------------------------------------------------------
// Mock de localStorage EN MEMORIA (mismo patrón que selfcheck_almacen.js).
// ---------------------------------------------------------------------
function crearLocalStorageMock() {
  var almacen = Object.create(null);
  return {
    getItem: function (clave) {
      return Object.prototype.hasOwnProperty.call(almacen, clave) ? almacen[clave] : null;
    },
    setItem: function (clave, valor) {
      almacen[clave] = String(valor);
    },
    removeItem: function (clave) {
      delete almacen[clave];
    },
    _volcado: function () {
      return almacen;
    }
  };
}

var mockStorage = crearLocalStorageMock();
globalThis.localStorage = mockStorage;

// ---------------------------------------------------------------------
// Helpers de fixture INDEPENDIENTES del módulo (construidos con el
// `crypto` nativo de Node por fuera de Herzon.Seguridad) para poder
// fabricar sobres arbitrarios (iteraciones distintas, bytes alterados)
// sin depender de funciones internas no expuestas por la API pública.
// ---------------------------------------------------------------------
function base64DeBuffer(buffer) {
  return Buffer.from(buffer).toString('base64');
}

function base64ABufferNode(texto) {
  return Buffer.from(texto, 'base64');
}

function construirSobreIndependiente(contraseña, textoPlanoObjeto, iteraciones) {
  var sal = nodeCrypto.randomBytes(16);
  var iv = nodeCrypto.randomBytes(12);
  var clave = nodeCrypto.pbkdf2Sync(String(contraseña), sal, iteraciones, 32, 'sha256');
  var cifrador = nodeCrypto.createCipheriv('aes-256-gcm', clave, iv);
  var textoPlano = Buffer.from(JSON.stringify(textoPlanoObjeto), 'utf8');
  var cifrado = Buffer.concat([cifrador.update(textoPlano), cifrador.final()]);
  var tag = cifrador.getAuthTag();
  var datos = Buffer.concat([cifrado, tag]);
  return JSON.stringify({
    version: 'cifrado-1',
    kdf: { algoritmo: 'PBKDF2', sal: base64DeBuffer(sal), iteraciones: iteraciones, hash: 'SHA-256' },
    cifrado: { algoritmo: 'AES-GCM', iv: base64DeBuffer(iv), datos: base64DeBuffer(datos) }
  });
}

// ---------------------------------------------------------------------
// 1. Namespace y forma de la API (S-01: activa/activar/desactivar/
//    cambiar/desbloquear/cifrarYPersistir/bloquear).
// ---------------------------------------------------------------------
afirmar(typeof Seguridad === 'object' && Seguridad !== null, 'window.Herzon.Seguridad debe existir como objeto tras require(./seguridad.js)');
afirmar(typeof Seguridad.activa === 'function', 'Herzon.Seguridad.activa debe ser una función');
afirmar(typeof Seguridad.activar === 'function', 'Herzon.Seguridad.activar debe ser una función');
afirmar(typeof Seguridad.desactivar === 'function', 'Herzon.Seguridad.desactivar debe ser una función');
afirmar(typeof Seguridad.cambiar === 'function', 'Herzon.Seguridad.cambiar debe ser una función');
afirmar(typeof Seguridad.desbloquear === 'function', 'Herzon.Seguridad.desbloquear debe ser una función');
afirmar(typeof Seguridad.cifrarYPersistir === 'function', 'Herzon.Seguridad.cifrarYPersistir debe ser una función');
afirmar(typeof Seguridad.bloquear === 'function', 'Herzon.Seguridad.bloquear debe ser una función');
afirmar(typeof globalThis.document === 'undefined', 'este selfcheck no debe tener document real global: valida que el módulo jamás toca DOM');

// ---------------------------------------------------------------------
// 2. activa() antes de cualquier cripto: síncrona, sobre ausente => false.
// ---------------------------------------------------------------------
afirmar(mockStorage.getItem('rinde.datos.v1') === null, 'sanity: el mock de localStorage arranca vacío');
afirmar(Seguridad.activa() === false, 'activa() debe ser false cuando no existe ninguna clave en localStorage');

// ---------------------------------------------------------------------
// 3..N. El resto de las pruebas son asíncronas (cripto real via
//    crypto.subtle). Se corren dentro de una IIFE async y el proceso
//    termina explícitamente al final con el código de salida correcto.
// ---------------------------------------------------------------------
(async function principal() {
  // -------------------------------------------------------------------
  // 3. activar(): sobre el esqueleto vacío (clave inexistente). Debe
  //    escribir un sobre válido, dejar la sesión desbloqueada y activa()
  //    debe pasar a true.
  // -------------------------------------------------------------------
  var resultadoActivar = await Seguridad.activar('contraseña-correcta-1');
  afirmar(resultadoActivar && resultadoActivar.ok === true, 'activar() sobre localStorage vacío debe resolver ok:true; errores: ' + JSON.stringify(resultadoActivar && resultadoActivar.errores));
  afirmar(Array.isArray(resultadoActivar.errores) && resultadoActivar.errores.length === 0, 'activar() exitoso debe traer errores:[] vacío');
  afirmar(Seguridad.activa() === true, 'tras activar(), activa() debe ser true');

  var crudoTrasActivar = mockStorage.getItem('rinde.datos.v1');
  var sobreTrasActivar = JSON.parse(crudoTrasActivar);
  afirmar(sobreTrasActivar.version === 'cifrado-1', 'el sobre escrito debe traer version literal "cifrado-1"');
  afirmar(sobreTrasActivar.kdf.algoritmo === 'PBKDF2', 'el sobre debe traer kdf.algoritmo "PBKDF2"');
  afirmar(sobreTrasActivar.kdf.hash === 'SHA-256', 'el sobre debe traer kdf.hash "SHA-256"');
  afirmar(typeof sobreTrasActivar.kdf.sal === 'string' && sobreTrasActivar.kdf.sal.length > 0, 'el sobre debe traer kdf.sal en base64 no vacío');
  afirmar(sobreTrasActivar.kdf.iteraciones >= 600000, 'el sobre debe traer kdf.iteraciones >= 600000 (contrato S-01)');
  afirmar(sobreTrasActivar.cifrado.algoritmo === 'AES-GCM', 'el sobre debe traer cifrado.algoritmo "AES-GCM"');
  afirmar(typeof sobreTrasActivar.cifrado.iv === 'string' && sobreTrasActivar.cifrado.iv.length > 0, 'el sobre debe traer cifrado.iv en base64 no vacío');
  afirmar(typeof sobreTrasActivar.cifrado.datos === 'string' && sobreTrasActivar.cifrado.datos.length > 0, 'el sobre debe traer cifrado.datos en base64 no vacío');
  afirmar(crudoTrasActivar.indexOf('activoId') === -1, 'el crudo cifrado NUNCA debe contener texto plano reconocible del payload v2 (clave "activoId")');

  // -------------------------------------------------------------------
  // 4. activar() de nuevo mientras ya hay protección activa: ok:false,
  //    error honesto, y el sobre en disco no cambia.
  // -------------------------------------------------------------------
  var crudoAntesDeSegundoActivar = mockStorage.getItem('rinde.datos.v1');
  var resultadoActivarDeNuevo = await Seguridad.activar('otra-contraseña');
  afirmar(resultadoActivarDeNuevo.ok === false, 'activar() con protección ya activa debe resolver ok:false');
  afirmar(Array.isArray(resultadoActivarDeNuevo.errores) && resultadoActivarDeNuevo.errores.length > 0, 'activar() fallido debe traer al menos un error honesto en errores[]');
  afirmar(mockStorage.getItem('rinde.datos.v1') === crudoAntesDeSegundoActivar, 'activar() con protección ya activa NO debe reescribir el sobre existente');

  // -------------------------------------------------------------------
  // 5. round-trip byte-idéntico: desbloquear() con la contraseña correcta
  //    debe devolver EXACTAMENTE el payload v2 que se cifró (el esqueleto
  //    vacío de activar()).
  // -------------------------------------------------------------------
  var payloadDesbloqueado = await Seguridad.desbloquear('contraseña-correcta-1');
  afirmar(payloadDesbloqueado !== null, 'desbloquear() con la contraseña correcta NUNCA debe devolver null');
  afirmar(JSON.stringify(payloadDesbloqueado) === JSON.stringify({ version: 2, activoId: null, clientes: {} }), 'round-trip activar->desbloquear debe ser byte-idéntico al payload v2 original');

  // -------------------------------------------------------------------
  // 6. contraseña mala -> null.
  // -------------------------------------------------------------------
  var desbloqueoConContrasenaMala = await Seguridad.desbloquear('esta-contraseña-es-incorrecta');
  afirmar(desbloqueoConContrasenaMala === null, 'desbloquear() con una contraseña incorrecta debe devolver null');

  // -------------------------------------------------------------------
  // 7. sobre con 1 byte alterado -> null (autenticación GCM falla: la
  //    contraseña correcta ya no descifra un blob manipulado).
  // -------------------------------------------------------------------
  var sobreOriginalParaAlterar = JSON.parse(mockStorage.getItem('rinde.datos.v1'));
  var bytesDatosOriginal = base64ABufferNode(sobreOriginalParaAlterar.cifrado.datos);
  var bytesDatosAlterado = Buffer.from(bytesDatosOriginal);
  bytesDatosAlterado[0] = bytesDatosAlterado[0] ^ 0xFF; // voltea el primer byte del ciphertext+tag
  var sobreAlterado = JSON.parse(JSON.stringify(sobreOriginalParaAlterar));
  sobreAlterado.cifrado.datos = base64DeBuffer(bytesDatosAlterado);
  mockStorage.setItem('rinde.datos.v1', JSON.stringify(sobreAlterado));
  var desbloqueoConSobreAlterado = await Seguridad.desbloquear('contraseña-correcta-1');
  afirmar(desbloqueoConSobreAlterado === null, 'desbloquear() con el sobre alterado en 1 byte (cifrado.datos) debe devolver null, aun con la contraseña correcta');
  // Restaura el sobre válido para el resto de las pruebas.
  mockStorage.setItem('rinde.datos.v1', JSON.stringify(sobreOriginalParaAlterar));
  var desbloqueoTrasRestaurar = await Seguridad.desbloquear('contraseña-correcta-1');
  afirmar(desbloqueoTrasRestaurar !== null, 'sanity: tras restaurar el sobre original, desbloquear() con la contraseña correcta vuelve a funcionar');

  // -------------------------------------------------------------------
  // 8. iteraciones LEIDAS DEL SOBRE (no de una constante interna): se
  //    construye un sobre INDEPENDIENTE (con el `crypto` nativo de Node,
  //    sin pasar por Herzon.Seguridad) con un número de iteraciones
  //    distinto al que usaría activar() por defecto. Si el módulo
  //    ignorara el sobre y usara un valor fijo, la clave derivada NO
  //    coincidiría y desbloquear() devolvería null.
  // -------------------------------------------------------------------
  var ITERACIONES_DE_PRUEBA = 611111;
  afirmar(ITERACIONES_DE_PRUEBA !== 600000, 'sanity de esta prueba: las iteraciones de prueba deben diferir del valor por defecto del módulo');
  var payloadDePrueba = { version: 2, activoId: 'c-marcador-iteraciones', clientes: {} };
  var sobreConIteracionesCustom = construirSobreIndependiente('contraseña-iteraciones', payloadDePrueba, ITERACIONES_DE_PRUEBA);
  mockStorage.setItem('rinde.datos.v1', sobreConIteracionesCustom);
  var desbloqueoConIteracionesCustom = await Seguridad.desbloquear('contraseña-iteraciones');
  afirmar(desbloqueoConIteracionesCustom !== null, 'desbloquear() debe respetar kdf.iteraciones LEIDO DEL SOBRE (611111), no un valor fijo interno');
  afirmar(desbloqueoConIteracionesCustom.activoId === 'c-marcador-iteraciones', 'el payload descifrado con iteraciones custom debe coincidir exactamente con el que se cifró por fuera del módulo');
  Seguridad.bloquear();

  // -------------------------------------------------------------------
  // 9. Reactivar sobre limpio para las pruebas de desactivar/cambiar/cola.
  // -------------------------------------------------------------------
  mockStorage.removeItem('rinde.datos.v1');
  var payloadConCliente = { version: 2, activoId: 'c-1', clientes: { 'c-1': { perfil: { nombre: 'Persona De Prueba' } } } };
  // Se siembra el v2 plano ANTES de activar (activar() debe cifrar lo que
  // ya existe en la clave, no un esqueleto, cuando la clave trae datos).
  mockStorage.setItem('rinde.datos.v1', JSON.stringify(payloadConCliente));
  var resultadoActivarConDatos = await Seguridad.activar('contraseña-2');
  afirmar(resultadoActivarConDatos.ok === true, 'activar() debe poder cifrar un v2 plano preexistente (no solo el esqueleto vacío)');
  var payloadDesbloqueadoConDatos = await Seguridad.desbloquear('contraseña-2');
  afirmar(JSON.stringify(payloadDesbloqueadoConDatos) === JSON.stringify(payloadConCliente), 'round-trip con datos reales de cliente debe ser byte-idéntico');

  // -------------------------------------------------------------------
  // 10. desactivar(): restaura el v2 PLANO exacto y borra la sesión.
  // -------------------------------------------------------------------
  var resultadoDesactivarConMala = await Seguridad.desactivar('contraseña-incorrecta');
  afirmar(resultadoDesactivarConMala.ok === false, 'desactivar() con contraseña incorrecta debe resolver ok:false');
  afirmar(Seguridad.activa() === true, 'desactivar() fallido NO debe desactivar la protección');

  var resultadoDesactivar = await Seguridad.desactivar('contraseña-2');
  afirmar(resultadoDesactivar.ok === true, 'desactivar() con la contraseña correcta debe resolver ok:true');
  afirmar(Seguridad.activa() === false, 'tras desactivar(), activa() debe ser false (la clave ya no es un sobre cifrado)');
  var crudoTrasDesactivar = mockStorage.getItem('rinde.datos.v1');
  afirmar(crudoTrasDesactivar === JSON.stringify(payloadConCliente), 'desactivar() debe restaurar el v2 PLANO EXACTO (mismo JSON.stringify que el payload original)');

  // cifrarYPersistir() sin clave de sesión (tras desactivar) debe fallar.
  var cifrarSinSesionTrasDesactivar = await Seguridad.cifrarYPersistir({ version: 2, activoId: null, clientes: {} });
  afirmar(cifrarSinSesionTrasDesactivar === false, 'cifrarYPersistir() sin clave de sesión (tras desactivar) debe resolver false');

  // -------------------------------------------------------------------
  // 11. cambiar(): descifra con actual, re-deriva con SAL NUEVA y
  //    re-cifra; la contraseña vieja deja de servir, la nueva sirve.
  // -------------------------------------------------------------------
  mockStorage.removeItem('rinde.datos.v1');
  await Seguridad.activar('contraseña-vieja');
  var salAntesDeCambiar = JSON.parse(mockStorage.getItem('rinde.datos.v1')).kdf.sal;

  var cambiarConActualIncorrecta = await Seguridad.cambiar('contraseña-que-no-es', 'contraseña-nueva');
  afirmar(cambiarConActualIncorrecta.ok === false, 'cambiar() con la contraseña actual incorrecta debe resolver ok:false');

  var resultadoCambiar = await Seguridad.cambiar('contraseña-vieja', 'contraseña-nueva');
  afirmar(resultadoCambiar.ok === true, 'cambiar() con la contraseña actual correcta debe resolver ok:true');
  var salTrasCambiar = JSON.parse(mockStorage.getItem('rinde.datos.v1')).kdf.sal;
  afirmar(salTrasCambiar !== salAntesDeCambiar, 'cambiar() debe re-derivar con una SAL NUEVA (distinta a la anterior)');

  var desbloqueoConContrasenaVieja = await Seguridad.desbloquear('contraseña-vieja');
  afirmar(desbloqueoConContrasenaVieja === null, 'tras cambiar(), la contraseña vieja ya NO debe desbloquear');
  var desbloqueoConContrasenaNueva = await Seguridad.desbloquear('contraseña-nueva');
  afirmar(desbloqueoConContrasenaNueva !== null, 'tras cambiar(), la contraseña nueva SI debe desbloquear');

  // -------------------------------------------------------------------
  // 12. IV fresco por escritura: dos llamadas SECUENCIALES (una tras otra,
  //    con await) a cifrarYPersistir deben producir IVs distintos.
  // -------------------------------------------------------------------
  var okEscritura1 = await Seguridad.cifrarYPersistir({ version: 2, activoId: 'c-iv-1', clientes: {} });
  afirmar(okEscritura1 === true, 'cifrarYPersistir() con sesión desbloqueada debe resolver true');
  var iv1 = JSON.parse(mockStorage.getItem('rinde.datos.v1')).cifrado.iv;

  var okEscritura2 = await Seguridad.cifrarYPersistir({ version: 2, activoId: 'c-iv-2', clientes: {} });
  afirmar(okEscritura2 === true, 'segunda escritura secuencial también debe resolver true');
  var iv2 = JSON.parse(mockStorage.getItem('rinde.datos.v1')).cifrado.iv;

  afirmar(iv1 !== iv2, 'INVARIANTE DE IV: dos escrituras consecutivas deben usar IVs distintos (iv1 !== iv2)');

  // El mock de localStorage jamás debe contener texto plano reconocible
  // (el activoId "c-iv-2" no debe aparecer literal en el crudo).
  var crudoTrasEscrituras = mockStorage.getItem('rinde.datos.v1');
  afirmar(crudoTrasEscrituras.indexOf('c-iv-2') === -1, 'tras cifrarYPersistir(), el crudo de localStorage jamás debe contener el texto plano del payload (activoId legible)');
  afirmar(JSON.parse(crudoTrasEscrituras).version === 'cifrado-1', 'tras cifrarYPersistir(), el crudo debe seguir siendo un sobre válido version "cifrado-1"');

  // -------------------------------------------------------------------
  // 13. Cola serializada y coalescente: dos escrituras RAPIDAS (sin await
  //    entre ellas) deben coalescer y GANAR LA ULTIMA.
  // -------------------------------------------------------------------
  var promesaRapidaA = Seguridad.cifrarYPersistir({ version: 2, activoId: 'c-cola-A', clientes: {} });
  var promesaRapidaB = Seguridad.cifrarYPersistir({ version: 2, activoId: 'c-cola-B', clientes: {} });
  var resultadosCola = await Promise.all([promesaRapidaA, promesaRapidaB]);
  afirmar(resultadosCola[0] === true && resultadosCola[1] === true, 'ambas promesas de la cola (rápida A y B) deben resolver true (ninguna se pierde silenciosamente)');
  var payloadFinalDeLaCola = await Seguridad.desbloquear('contraseña-nueva');
  afirmar(payloadFinalDeLaCola.activoId === 'c-cola-B', 'cola coalescente: con dos escrituras rápidas debe ganar la ULTIMA (c-cola-B), no la primera');

  // -------------------------------------------------------------------
  // 14. bloquear(): borra la clave de sesión; cifrarYPersistir() posterior
  //    debe fallar hasta un desbloqueo nuevo.
  // -------------------------------------------------------------------
  Seguridad.bloquear();
  var cifrarTrasBloquear = await Seguridad.cifrarYPersistir({ version: 2, activoId: 'no-debería-escribir', clientes: {} });
  afirmar(cifrarTrasBloquear === false, 'cifrarYPersistir() tras bloquear() debe resolver false (sin clave de sesión)');
  var crudoTrasIntentoBloqueado = mockStorage.getItem('rinde.datos.v1');
  afirmar(crudoTrasIntentoBloqueado.indexOf('no-debería-escribir') === -1, 'cifrarYPersistir() tras bloquear() NO debe haber escrito nada nuevo en localStorage');

  var desbloqueoTrasBloquear = await Seguridad.desbloquear('contraseña-nueva');
  afirmar(desbloqueoTrasBloquear !== null, 'tras bloquear(), la contraseña vigente sigue desbloqueando correctamente (el sobre en disco no se corrompió)');

  // -------------------------------------------------------------------
  // 15. Tolerancia SIN localStorage: proceso Node limpio, sin
  //    `globalThis.localStorage` en absoluto. activa() debe ser false sin
  //    lanzar y activar() debe resolver ok:false con error honesto, sin
  //    lanzar.
  // -------------------------------------------------------------------
  var scriptSubproceso = [
    'try { globalThis.crypto = require("crypto").webcrypto; } catch (e) { Object.defineProperty(globalThis, "crypto", { value: require("crypto").webcrypto, configurable: true, writable: true, enumerable: true }); }',
    'globalThis.window = globalThis;',
    'if (typeof globalThis.localStorage !== "undefined") { process.exit(9); }',
    'require(' + JSON.stringify(SEGURIDAD_PATH) + ');',
    'var S = globalThis.Herzon.Seguridad;',
    'if (S.activa() !== false) { process.exit(10); }',
    'S.activar("contraseña-cualquiera").then(function (r) {',
    '  if (r.ok !== false) { process.exit(11); }',
    '  if (!Array.isArray(r.errores) || r.errores.length === 0) { process.exit(12); }',
    '  process.exit(0);',
    '}).catch(function () { process.exit(13); });'
  ].join('\n');
  var cp = require('child_process');
  var resultadoSubproceso = cp.spawnSync(process.execPath, ['-e', scriptSubproceso], { encoding: 'utf8' });
  afirmar(resultadoSubproceso.status === 0, 'build/seguridad.js debe funcionar SIN lanzar cuando localStorage nunca existió (proceso node limpio); stderr: ' + (resultadoSubproceso.stderr || '') + ' status: ' + resultadoSubproceso.status);

  // -------------------------------------------------------------------
  // 16. Cero DOM, cero HERZON_DATA, cero red, cero innerHTML, cero
  //    emojis, cero hexes nuevos (el módulo es cripto puro: no debe traer
  //    ni un solo hex literal).
  // -------------------------------------------------------------------
  afirmar(fuenteSeguridad.indexOf('HERZON_DATA') === -1, 'build/seguridad.js jamás debe mencionar HERZON_DATA (separación estricta del contrato S-01)');
  afirmar(fuenteSeguridad.indexOf('innerHTML') === -1, 'build/seguridad.js no debe usar innerHTML en ninguna parte');
  afirmar(fuenteSeguridad.indexOf('fetch(') === -1, 'build/seguridad.js no debe usar fetch (cero red)');
  afirmar(fuenteSeguridad.indexOf('XMLHttpRequest') === -1, 'build/seguridad.js no debe usar XMLHttpRequest (cero red)');
  afirmar(fuenteSeguridad.indexOf('document.') === -1, 'build/seguridad.js no debe tocar document en ninguna parte (cripto puro, sin DOM)');
  afirmar(!REGEX_EMOJI.test(fuenteSeguridad), 'build/seguridad.js no debe contener emojis (regla dura de Mario)');
  var hexesEnSeguridad = fuenteSeguridad.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  afirmar(hexesEnSeguridad.length === 0, 'build/seguridad.js no debe contener ningun hex literal (cripto puro, cero tokens visuales, cero excepción de documentos.js aquí): encontrados ' + JSON.stringify(hexesEnSeguridad));

  // ---------------------------------------------------------------------
  // 17. Anti-regresión de acentos (patrón QA ronda 1, D1): ninguna de
  //    estas palabras en español sin acento/eñe puede aparecer en el
  //    CÓDIGO FUENTE de este módulo (prosa de comentarios y mensajes).
  //    "contrasena" (minúscula, sin eñe) queda FUERA de esta lista a
  //    propósito: es un identificador legítimo (parámetros `contrasena` en
  //    activar/desactivar/cambiar/desbloquear/derivarClave, tal cual los
  //    nombra el contrato S-01 en su propia firma `activar(contrasena)`, y
  //    la función interna `descifrarSobreConContrasena`), igual que
  //    "sección"/"peso_kg" quedan fuera en otros selfchecks. El MENSAJE
  //    visible capitalizado ('Contrasena' al inicio de una oración) SÍ se
  //    verifica aparte, abajo: ahí no hay excusa de identificador. "diseno"
  //    tampoco entra en la lista: build/seguridad.js referencia el nombre
  //    LITERAL del archivo `.harness/justesse-r10-diseno.md` (sin eñe,
  //    porque así se llama el archivo en disco); esa única aparición se
  //    verifica aparte, abajo, para que "diseno" no reaparezca en NINGÚN
  //    otro lugar (prosa) sin que esta prueba lo note.
  // ---------------------------------------------------------------------
  var PALABRAS_SIN_ACENTO_PROHIBIDAS = [
    'proteccion', 'invalido', 'invalida', 'sesion', 'traves',
    'facil', 'metodo', 'automatico', 'automatica', 'codigo', 'numero',
    'espanol', 'exito', 'aqui', 'jamas', 'dueno', 'modulo',
    'patron', 'maximo', 'ultima', 'ultimo', 'unica', 'unico', 'vacio',
    'publica', 'sincrona', 'sincrono', 'asincrona', 'asincronas',
    'identico', 'construccion', 'autenticacion', 'catastrofico', 'tamano',
    'acompanan', 'confia'
  ];
  for (var pa = 0; pa < PALABRAS_SIN_ACENTO_PROHIBIDAS.length; pa++) {
    var palabra = PALABRAS_SIN_ACENTO_PROHIBIDAS[pa];
    var regexPalabra = new RegExp('\\b' + palabra + '\\b');
    afirmar(!regexPalabra.test(fuenteSeguridad), 'build/seguridad.js contiene la palabra sin acento "' + palabra + '": revisar y corregir a español con acentos/eñe');
  }
  // El mensaje visible capitalizado 'Contrasena incorrecta.' (inicio de
  // oración, no identificador) jamás debe aparecer sin eñe/acento; la
  // forma correcta 'Contraseña incorrecta' sí debe estar presente.
  afirmar(fuenteSeguridad.indexOf('Contraseña incorrecta') !== -1, 'build/seguridad.js debe usar el mensaje "Contraseña incorrecta" con eñe y acento (español correcto)');
  afirmar(!/\bContrasena\b/.test(fuenteSeguridad), 'build/seguridad.js no debe tener ningún mensaje visible capitalizado "Contrasena" sin eñe (los identificadores de código en minúscula sí pueden, un mensaje de oración no)');
  // "diseno" solo puede aparecer UNA vez: dentro del nombre literal del
  // archivo ".harness/justesse-r10-diseno.md" (sin eñe, así se llama en
  // disco); en cualquier otro lugar (prosa) sería una regresión.
  var ocurrenciasDeDiseno = (fuenteSeguridad.match(/\bdiseno\b/g) || []).length;
  afirmar(ocurrenciasDeDiseno === 1, 'build/seguridad.js debe mencionar "diseno" (sin eñe) EXACTAMENTE una vez, solo dentro del nombre literal de archivo justesse-r10-diseno.md; encontradas: ' + ocurrenciasDeDiseno);
  afirmar(fuenteSeguridad.indexOf('justesse-r10-diseno.md') !== -1, 'build/seguridad.js debe referenciar el archivo de contrato justesse-r10-diseno.md por su nombre literal exacto');
  // "jamás" y "contraseña" con eñe/acento correctos SÍ deben aparecer
  // (evidencia de que el archivo trae español con acentos, no que carece
  // de esas palabras por completo).
  afirmar(fuenteSeguridad.indexOf('jamás') !== -1, 'build/seguridad.js debe usar "jamás" con acento (español correcto)');
  afirmar(fuenteSeguridad.indexOf('contraseña') !== -1, 'build/seguridad.js debe usar "contraseña" con eñe (espanol correcto)');
  afirmar(fuenteSeguridad.indexOf('protección') !== -1, 'build/seguridad.js debe usar "protección" con acento (espanol correcto)');

  console.log('checks ejecutados: ' + contador);
  process.exit(0);
})().catch(function (error) {
  console.error('ERROR INESPERADO en selfcheck_seguridad.js: ' + (error && error.stack ? error.stack : error));
  process.exit(1);
});
