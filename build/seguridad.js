// build/seguridad.js
// R10 SEGURIDAD (T-050, contrato S-01 de .harness/justesse-r10-diseno.md,
// sección 2.3): Herzon.Seguridad — módulo de CRIPTO PURO, sin DOM, sin el
// objeto de datos en memoria del prototipo, sin red. Cifra/descifra el
// payload v2 completo que vive en la MISMA clave de localStorage
// `rinde.datos.v1` (dueño de esa clave: build/almacen.js), envolviéndolo
// en un SOBRE versionado `version:"cifrado-1"`.
//
// Separación estricta (C-4 del documento de diseño): seguridad.js NO
// conoce clientes ni la forma del payload v2 más allá de tratarlo como
// texto JSON opaco que cifra/descifra; almacen.js NO conoce WebCrypto y
// solo llama a esta API. Este módulo JAMÁS toca `document` ni el objeto
// de datos global del runtime, ni monta interfaz.
//
// Preámbulo obligatorio (plan.md 3.A): script clásico, IIFE, sin
// import/export, sin tocar `document` en el nivel superior (aquí ni
// siquiera existe esa noción: el módulo no usa DOM en absoluto). En los
// selfchecks de Node se hace `globalThis.crypto = require('crypto').webcrypto`
// ANTES de requerir este archivo (mismo patrón que documenta el contrato
// S-01): en el navegador `window.crypto` ya trae `subtle` y
// `getRandomValues` de forma nativa, incluso bajo `file://` (contexto
// seguro en Chrome/Firefox/Safari).
//
// SOBRE (formato exacto, JSON, contrato S-01):
// {"version":"cifrado-1","kdf":{"algoritmo":"PBKDF2","sal":"<base64 16 bytes>",
//  "iteraciones":600000,"hash":"SHA-256"},
//  "cifrado":{"algoritmo":"AES-GCM","iv":"<base64 12 bytes>","datos":"<base64 ciphertext+tag>"}}
// El texto plano cifrado es `JSON.stringify` del payload v2 completo
// `{version:2,activoId,clientes}` en UTF-8. La clave se deriva con
// PBKDF2-SHA-256 -> AES-GCM 256 bits, SIEMPRE no extraíble.
// `desbloquear`/`desactivar`/`cambiar` leen SIEMPRE la sal y las
// iteraciones DEL SOBRE (nunca de una constante): un aumento futuro de
// `ITERACIONES_MINIMAS` no rompe sobres viejos.
//
// INVARIANTE DE IV: `crypto.getRandomValues` genera un IV de 12 bytes
// FRESCO en cada llamada a `cifrarYPersistir` (reutilizar un IV bajo la
// misma clave AES-GCM es catastrófico: revela el XOR de los dos textos
// planos y compromete la autenticación). El selfcheck asierta
// literalmente `iv1 !== iv2` entre dos escrituras consecutivas.
//
// COLA DE ESCRITURA: las escrituras son asíncronas (derivar/cifrar toma
// tiempo). Se serializan y COALESCEN: como máximo una escritura en vuelo y
// una pendiente; si llegan más peticiones mientras hay una pendiente,
// SOLO la última sobrevive (gana la última). La memoria del llamador
// (almacen.js) es la fuente de verdad: este módulo nunca lee de vuelta lo
// que va a escribir, solo serializa el `payload` que recibe en cada
// llamada.
(function () {
  'use strict';

  var G = (typeof window !== 'undefined') ? window : globalThis;
  G.Herzon = G.Herzon || {};

  var CLAVE_ALMACEN = 'rinde.datos.v1';
  var VERSION_SOBRE = 'cifrado-1';
  var ITERACIONES_MINIMAS = 600000;
  var LONGITUD_SAL = 16;
  var LONGITUD_IV = 12;
  var BASE64_ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  // -----------------------------------------------------------------------
  // Estado de sesión (closure del módulo; jamás expuesto). `claveSesion` es
  // el CryptoKey no extraíble derivado en activar/desbloquear/cambiar;
  // `salSesion`/`iteracionesSesion` acompañan a esa clave para poder
  // reconstruir el bloque `kdf` del sobre en cada escritura sin volver a
  // derivar.
  // -----------------------------------------------------------------------
  var claveSesion = null;
  var salSesion = null;
  var iteracionesSesion = null;

  // Cola serializada y coalescente de escrituras (ver nota de cabecera).
  var trabajoEnVuelo = null;
  var trabajoPendiente = null;

  // -----------------------------------------------------------------------
  // Base64 propio (bytes <-> texto), sin depender de btoa/atob: idéntico en
  // Node y en el navegador, sin límites de tamaño de argumento.
  // -----------------------------------------------------------------------
  function bytesABase64(bytes) {
    var resultado = '';
    var i;
    for (i = 0; i + 3 <= bytes.length; i += 3) {
      var b0 = bytes[i];
      var b1 = bytes[i + 1];
      var b2 = bytes[i + 2];
      resultado += BASE64_ALFABETO[b0 >> 2];
      resultado += BASE64_ALFABETO[((b0 & 3) << 4) | (b1 >> 4)];
      resultado += BASE64_ALFABETO[((b1 & 15) << 2) | (b2 >> 6)];
      resultado += BASE64_ALFABETO[b2 & 63];
    }
    var restantes = bytes.length - i;
    if (restantes === 1) {
      var c0 = bytes[i];
      resultado += BASE64_ALFABETO[c0 >> 2];
      resultado += BASE64_ALFABETO[(c0 & 3) << 4];
      resultado += '==';
    } else if (restantes === 2) {
      var d0 = bytes[i];
      var d1 = bytes[i + 1];
      resultado += BASE64_ALFABETO[d0 >> 2];
      resultado += BASE64_ALFABETO[((d0 & 3) << 4) | (d1 >> 4)];
      resultado += BASE64_ALFABETO[(d1 & 15) << 2];
      resultado += '=';
    }
    return resultado;
  }

  function base64ABytes(texto) {
    var cadena = String(texto == null ? '' : texto);
    var sinPadding = cadena.replace(/=+$/, '');
    var bytesEsperados = Math.floor((sinPadding.length * 6) / 8);
    var bytes = new Uint8Array(bytesEsperados);
    var buffer = 0;
    var bitsAcumulados = 0;
    var indiceByte = 0;
    for (var i = 0; i < sinPadding.length; i++) {
      var valor = BASE64_ALFABETO.indexOf(sinPadding[i]);
      if (valor === -1) { continue; }
      buffer = (buffer << 6) | valor;
      bitsAcumulados += 6;
      if (bitsAcumulados >= 8) {
        bitsAcumulados -= 8;
        bytes[indiceByte] = (buffer >> bitsAcumulados) & 0xFF;
        indiceByte += 1;
      }
    }
    return bytes;
  }

  // -----------------------------------------------------------------------
  // Acceso a localStorage: TOLERANTE por diseño (mismo patrón que
  // build/almacen.js, copia propia porque seguridad.js no depende de otros
  // módulos). El módulo no debe lanzar si `localStorage` no existe.
  // -----------------------------------------------------------------------
  function localStorageDisponible() {
    try {
      if (typeof G.localStorage === 'undefined' || G.localStorage === null) { return false; }
      var claveDePrueba = '__rinde_seguridad_prueba__';
      G.localStorage.setItem(claveDePrueba, '1');
      G.localStorage.removeItem(claveDePrueba);
      return true;
    } catch (e) {
      return false;
    }
  }

  function leerCrudo() {
    try {
      if (!localStorageDisponible()) { return null; }
      return G.localStorage.getItem(CLAVE_ALMACEN);
    } catch (e) {
      return null;
    }
  }

  function escribirCrudo(texto) {
    try {
      if (!localStorageDisponible()) { return false; }
      G.localStorage.setItem(CLAVE_ALMACEN, texto);
      return true;
    } catch (e) {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Sobre cifrado-1: construcción y parseo.
  // -----------------------------------------------------------------------
  function construirSobre(salBytes, iteraciones, ivBytes, datosBytes) {
    return JSON.stringify({
      version: VERSION_SOBRE,
      kdf: {
        algoritmo: 'PBKDF2',
        sal: bytesABase64(salBytes),
        iteraciones: iteraciones,
        hash: 'SHA-256'
      },
      cifrado: {
        algoritmo: 'AES-GCM',
        iv: bytesABase64(ivBytes),
        datos: bytesABase64(datosBytes)
      }
    });
  }

  function parsearSobre(crudo) {
    if (crudo === null || crudo === undefined) { return null; }
    var objeto;
    try {
      objeto = JSON.parse(crudo);
    } catch (e) {
      return null;
    }
    if (!objeto || typeof objeto !== 'object') { return null; }
    if (objeto.version !== VERSION_SOBRE) { return null; }
    if (!objeto.kdf || !objeto.cifrado) { return null; }
    if (typeof objeto.kdf.sal !== 'string' || typeof objeto.kdf.iteraciones !== 'number') { return null; }
    if (typeof objeto.cifrado.iv !== 'string' || typeof objeto.cifrado.datos !== 'string') { return null; }
    return objeto;
  }

  // -----------------------------------------------------------------------
  // Primitivas WebCrypto (todas asíncronas, todas leen `G.crypto`: nunca el
  // identificador suelto `crypto`, para que el patrón `globalThis.crypto = ...`
  // de los selfchecks y de la app real sea la única fuente).
  // -----------------------------------------------------------------------
  function bytesAleatorios(n) {
    var bytes = new Uint8Array(n);
    G.crypto.getRandomValues(bytes);
    return bytes;
  }

  function derivarClave(contrasena, salBytes, iteraciones) {
    var codificador = new TextEncoder();
    return G.crypto.subtle.importKey(
      'raw',
      codificador.encode(String(contrasena)),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    ).then(function (materialClave) {
      return G.crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salBytes, iterations: iteraciones, hash: 'SHA-256' },
        materialClave,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    });
  }

  function cifrarBytes(clave, ivBytes, textoPlano) {
    var codificador = new TextEncoder();
    return G.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: ivBytes },
      clave,
      codificador.encode(textoPlano)
    ).then(function (bufferCifrado) {
      return new Uint8Array(bufferCifrado);
    });
  }

  function descifrarBytes(clave, ivBytes, datosBytes) {
    return G.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      clave,
      datosBytes
    ).then(function (bufferPlano) {
      var decodificador = new TextDecoder();
      return decodificador.decode(bufferPlano);
    }).catch(function () {
      return null;
    });
  }

  // Descifra un sobre YA PARSEADO con una contrasena candidata, derivando
  // SIEMPRE desde cero (nunca confía en la clave de sesión cacheada: eso es
  // lo que hace a `desactivar`/`cambiar` verificaciones reales). Devuelve
  // null ante CUALQUIER fallo (contrasena incorrecta, sobre manipulado o
  // JSON inválido son indistinguibles por diseño).
  function descifrarSobreConContrasena(sobre, contrasena) {
    var salBytes;
    var ivBytes;
    var datosBytes;
    try {
      salBytes = base64ABytes(sobre.kdf.sal);
      ivBytes = base64ABytes(sobre.cifrado.iv);
      datosBytes = base64ABytes(sobre.cifrado.datos);
    } catch (e) {
      return Promise.resolve(null);
    }
    var iteraciones = sobre.kdf.iteraciones;
    return derivarClave(contrasena, salBytes, iteraciones).then(function (clave) {
      return descifrarBytes(clave, ivBytes, datosBytes).then(function (textoPlano) {
        if (textoPlano === null) { return null; }
        var payload;
        try {
          payload = JSON.parse(textoPlano);
        } catch (e) {
          return null;
        }
        return { payload: payload, clave: clave, sal: salBytes, iteraciones: iteraciones };
      });
    }).catch(function () {
      return null;
    });
  }

  function limpiarSesion() {
    claveSesion = null;
    salSesion = null;
    iteracionesSesion = null;
  }

  function fijarSesion(clave, salBytes, iteraciones) {
    claveSesion = clave;
    salSesion = salBytes;
    iteracionesSesion = iteraciones;
  }

  // -----------------------------------------------------------------------
  // API pública
  // -----------------------------------------------------------------------

  // activa(): SÍNCRONA, sin cripto (solo JSON.parse) — invocable desde el
  // boot síncrono de almacen.js.
  function activa() {
    var crudo = leerCrudo();
    if (crudo === null) { return false; }
    return parsearSobre(crudo) !== null;
  }

  // activar(contrasena): lee el v2 plano vigente (o cifra el esqueleto
  // vacío si la clave no existe todavía), genera sal nueva, cifra y escribe
  // el sobre. Deja la sesión DESBLOQUEADA.
  function activar(contrasena) {
    return new Promise(function (resolve) {
      if (!localStorageDisponible()) {
        resolve({ ok: false, errores: ['No hay almacenamiento disponible en este dispositivo.'] });
        return;
      }
      var crudo = leerCrudo();
      if (crudo !== null && parsearSobre(crudo) !== null) {
        resolve({ ok: false, errores: ['La protección ya está activa en este dispositivo.'] });
        return;
      }
      var plano;
      if (crudo === null) {
        plano = { version: 2, activoId: null, clientes: {} };
      } else {
        try {
          plano = JSON.parse(crudo);
        } catch (e) {
          resolve({ ok: false, errores: ['Los datos existentes de este dispositivo no se pudieron leer; no es seguro activar la protección sobre ellos.'] });
          return;
        }
      }
      var sal = bytesAleatorios(LONGITUD_SAL);
      var iteraciones = ITERACIONES_MINIMAS;
      derivarClave(contrasena, sal, iteraciones).then(function (clave) {
        var iv = bytesAleatorios(LONGITUD_IV);
        var textoPlano = JSON.stringify(plano);
        return cifrarBytes(clave, iv, textoPlano).then(function (datosBytes) {
          var sobre = construirSobre(sal, iteraciones, iv, datosBytes);
          var ok = escribirCrudo(sobre);
          if (!ok) {
            resolve({ ok: false, errores: ['No se pudo escribir la protección cifrada en este dispositivo.'] });
            return;
          }
          fijarSesion(clave, sal, iteraciones);
          resolve({ ok: true, errores: [] });
        });
      }).catch(function () {
        resolve({ ok: false, errores: ['No se pudo activar la protección en este dispositivo.'] });
      });
    });
  }

  // desactivar(contrasena): verifica descifrando DESDE CERO (nunca confía
  // en la clave cacheada), escribe el v2 PLANO de vuelta y borra la sesión.
  function desactivar(contrasena) {
    return new Promise(function (resolve) {
      var crudo = leerCrudo();
      var sobre = parsearSobre(crudo);
      if (sobre === null) {
        resolve({ ok: false, errores: ['No hay protección activa en este dispositivo.'] });
        return;
      }
      descifrarSobreConContrasena(sobre, contrasena).then(function (resultado) {
        if (resultado === null) {
          resolve({ ok: false, errores: ['Contraseña incorrecta.'] });
          return;
        }
        var ok = escribirCrudo(JSON.stringify(resultado.payload));
        if (!ok) {
          resolve({ ok: false, errores: ['No se pudo escribir los datos sin cifrar en este dispositivo.'] });
          return;
        }
        limpiarSesion();
        resolve({ ok: true, errores: [] });
      });
    });
  }

  // cambiar(actual, nueva): descifra con `actual`, re-deriva con SAL NUEVA
  // y re-cifra con `nueva`.
  function cambiar(actual, nueva) {
    return new Promise(function (resolve) {
      var crudo = leerCrudo();
      var sobre = parsearSobre(crudo);
      if (sobre === null) {
        resolve({ ok: false, errores: ['No hay protección activa en este dispositivo.'] });
        return;
      }
      descifrarSobreConContrasena(sobre, actual).then(function (resultado) {
        if (resultado === null) {
          resolve({ ok: false, errores: ['La contraseña actual es incorrecta.'] });
          return;
        }
        var salNueva = bytesAleatorios(LONGITUD_SAL);
        var iteracionesNueva = ITERACIONES_MINIMAS;
        derivarClave(nueva, salNueva, iteracionesNueva).then(function (claveNueva) {
          var iv = bytesAleatorios(LONGITUD_IV);
          var textoPlano = JSON.stringify(resultado.payload);
          return cifrarBytes(claveNueva, iv, textoPlano).then(function (datosBytes) {
            var sobreNuevo = construirSobre(salNueva, iteracionesNueva, iv, datosBytes);
            var ok = escribirCrudo(sobreNuevo);
            if (!ok) {
              resolve({ ok: false, errores: ['No se pudo escribir la nueva protección en este dispositivo.'] });
              return;
            }
            fijarSesion(claveNueva, salNueva, iteracionesNueva);
            resolve({ ok: true, errores: [] });
          });
        }).catch(function () {
          resolve({ ok: false, errores: ['No se pudo cambiar la contraseña en este dispositivo.'] });
        });
      });
    });
  }

  // desbloquear(contrasena): null ante fallo de autenticación GCM
  // (contrasena incorrecta y sobre manipulado son indistinguibles por
  // diseño). En éxito cachea la clave de sesión y devuelve el payload v2.
  function desbloquear(contrasena) {
    return new Promise(function (resolve) {
      var crudo = leerCrudo();
      var sobre = parsearSobre(crudo);
      if (sobre === null) {
        resolve(null);
        return;
      }
      descifrarSobreConContrasena(sobre, contrasena).then(function (resultado) {
        if (resultado === null) {
          resolve(null);
          return;
        }
        fijarSesion(resultado.clave, resultado.sal, resultado.iteraciones);
        resolve(resultado.payload);
      }).catch(function () {
        resolve(null);
      });
    });
  }

  // bloquear(): SÍNCRONA, borra la clave de sesión (re-bloqueo sin
  // recargar la página).
  function bloquear() {
    limpiarSesion();
  }

  // cifrarYPersistir(payload): rechaza/false sin clave de sesión. IV
  // fresco en CADA escritura. Cola serializada y coalescente: una en
  // vuelo, una pendiente máximo, gana la última.
  function cifrarYPersistir(payload) {
    return new Promise(function (resolve) {
      if (!claveSesion) {
        resolve(false);
        return;
      }
      var instantanea = { clave: claveSesion, sal: salSesion, iteraciones: iteracionesSesion };
      if (trabajoEnVuelo) {
        if (trabajoPendiente) {
          trabajoPendiente.payload = payload;
          trabajoPendiente.instantanea = instantanea;
          trabajoPendiente.resolvers.push(resolve);
        } else {
          trabajoPendiente = { payload: payload, instantanea: instantanea, resolvers: [resolve] };
        }
        return;
      }
      ejecutarTrabajo(payload, instantanea, [resolve]);
    });
  }

  function procesarEscritura(payload, instantanea) {
    var iv = bytesAleatorios(LONGITUD_IV);
    var textoPlano = JSON.stringify(payload);
    return cifrarBytes(instantanea.clave, iv, textoPlano).then(function (datosBytes) {
      var sobre = construirSobre(instantanea.sal, instantanea.iteraciones, iv, datosBytes);
      return escribirCrudo(sobre);
    });
  }

  function ejecutarTrabajo(payload, instantanea, resolvers) {
    trabajoEnVuelo = procesarEscritura(payload, instantanea).then(function (ok) {
      for (var i = 0; i < resolvers.length; i++) { resolvers[i](ok); }
    }).catch(function () {
      for (var i = 0; i < resolvers.length; i++) { resolvers[i](false); }
    }).then(function () {
      trabajoEnVuelo = null;
      if (trabajoPendiente) {
        var siguiente = trabajoPendiente;
        trabajoPendiente = null;
        ejecutarTrabajo(siguiente.payload, siguiente.instantanea, siguiente.resolvers);
      }
    });
  }

  G.Herzon.Seguridad = {
    activa: activa,
    activar: activar,
    desactivar: desactivar,
    cambiar: cambiar,
    desbloquear: desbloquear,
    cifrarYPersistir: cifrarYPersistir,
    bloquear: bloquear
  };
})();
