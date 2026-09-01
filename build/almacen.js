/* build/almacen.js
 * R8 (T-039) + R9 (T-045) + R10 (T-052): Herzon.Almacen -- modo demo/real,
 * multi-cliente y persistencia local. Dueño único de este archivo. Contrato
 * congelado en .harness/plan.md Adendum R8 punto 1, Adendum R9 punto 3
 * (SUPERSEDE parcial de R8: ver `activarReal` más abajo) y Adendum R10
 * (R-02/R-03/S-02/S-04/S-05, ver el documento normativo consolidado de la
 * ronda 10 dentro de `.harness/`).
 *
 * R10 -- ampliación aditiva, NINGUNA firma previa cambia:
 *   - Slot `rutina` por cliente (R-02/R-03): `guardarRutina`, normalización
 *     tolerante, expuesto en `HERZON_DATA.rutina`.
 *   - Slot `config` por cliente (S-05): `{labsOcultos}`, `actualizarConfig`,
 *     expuesto en `HERZON_DATA.config` (SIEMPRE `{labsOcultos:false}` en
 *     demo, aunque el catálogo no traiga la clave).
 *   - Respaldo exportable/importable (S-04): `exportarRespaldo`,
 *     `restaurarRespaldo` (reemplazo TOTAL, nunca fusión).
 *   - Boot bloqueado + embudo único de escritura (S-02): con
 *     `Herzon.Seguridad.activa()===true` el boot arranca en demo funcional
 *     con `bloqueado()===true`; `desbloquearYMontar(contrasena)` asíncrono
 *     levanta el bloqueo. `escribirAlmacenCrudo` es el ÚNICO sitio de este
 *     archivo que escribe la clave `rinde.datos.v1` (assert de selfcheck).
 *     Tolerancia total: si `Herzon.Seguridad` no existe, comportamiento
 *     IDÉNTICO al de antes de esta ronda (sin flag day).
 *
 * Responsabilidad EXCLUSIVA de este módulo: datos, persistencia, modo,
 * clientes y el cableado del botón/badge/selector del header
 * (#hz-btn-modo / #hz-modo-datos / #hz-cliente-selector). NO monta
 * formularios ni ninguna otra UI: eso es de las vistas (T-040/T-041).
 *
 * Persistencia: UNA clave localStorage `rinde.datos.v1` (JSON versionado).
 * Sin backend, sin red: todo vive en este dispositivo.
 *
 * -------------------------------------------------------------------------
 * Esquema v2 (Adendum R9 punto 3), MISMA clave que v1:
 *   { "version": 2, "activoId": "c-<id>" | null,
 *     "clientes": { "c-<id>": { perfil, series, labs, plicometria,
 *                                suplementos, plan: null|{plantillaId,
 *                                kcalObjetivo,fecha}, creado } } }
 * `perfil` tiene la MISMA forma que el `paciente` de v1. La demo JAMÁS
 * entra en `clientes{}` ni toca localStorage (MC-05): vive solo en
 * `datosOriginalDemo` (copia profunda en memoria de data.js).
 *
 * Migración v1 -> v2: en `cargar()`, si el payload leído trae
 * `version===1 && modo==='real'`, se envuelve como ÚNICO cliente y se
 * reescribe la clave YA en v2 (idempotente: la próxima lectura ve
 * version===2 directo, la rama de migración no vuelve a correr).
 *
 * Corrupción / version desconocida / `activoId` colgante SIN clientes =>
 * modo demo funcional, sin lanzar. `activoId` colgante CON clientes =>
 * se monta el primero por `creado` (y se corrige el activoId persistido).
 * `clientes` vacío => demo.
 *
 * Contrato del parámetro `perfil` que reciben `crearCliente(perfil)`,
 * `activarReal(perfil)` y `actualizarPerfil(p)` (mismas claves en los
 * tres, todas opcionales salvo donde se indique; quien llama -- T-040,
 * vista Perfil -- construye este objeto desde su formulario):
 *   nombre           string (requerido en crearCliente/activarReal(perfil))
 *   sexo             'femenino' | 'masculino'
 *   edad             número (años)
 *   talla_cm         número
 *   pesoInicial_kg   número
 *   actividad        una clave de HERZON_DATA.factoresActividad
 *                     ('sedentario' | 'ligero' | 'moderado' | 'intenso')
 *   objetivo         string libre (se muestra tal cual, sin mapear)
 *   alergias         string[] opcional
 *   restricciones    string[] opcional
 * Campos ausentes o inválidos quedan como valor vacío/null: un cliente
 * real puede existir sin perfil completo (onboarding pendiente, T-040 se
 * encarga de mostrar el formulario) sin que este módulo lance nunca.
 *
 * Preámbulo obligatorio (plan.md 3.A): script clásico, IIFE, sin
 * import/export, sin acceso al identificador global `document` en el nivel
 * superior del módulo (solo vía `G.document`, dentro de funciones).
 */
(function () {
  var G = (typeof window !== 'undefined') ? window : globalThis;
  G.Herzon = G.Herzon || {};

  var CLAVE_ALMACEN = 'rinde.datos.v1';
  var VERSION_ALMACEN = 2;

  // Textos exactos del documento de hallazgos R9 (PR-02, MC-02, MC-03,
  // PR-06): centralizados aquí para que un solo cambio de literal quede
  // en un único lugar del archivo.
  var TEXTO_BADGE_DEMO = 'MODO DEMO';
  var TEXTO_BOTON_REAL = 'Ver demo';
  var TEXTO_BOTON_DEMO = 'Usar mis datos';
  var MSG_NOMBRE_VACIO = 'Escribe el nombre del cliente para crearlo.';
  var MSG_NOMBRE_DUPLICADO = 'Ya existe un cliente con ese nombre en este dispositivo.';
  var NOTA_META_REAL = 'Documento generado con Rinde (CECAD) como apoyo al seguimiento nutricional; no sustituye la valoración clínica ni nutriológica de un profesional.';
  var VALOR_DEMO_SELECTOR = '__demo__';
  var VALOR_NUEVO_SELECTOR = '__nuevo__';
  var TEXTO_NUEVO_CLIENTE = '+ Nuevo cliente…';

  // R10 (S-02/S-04/C-12): textos y valores nuevos, acentos pinneados por el
  // documento normativo de la ronda 10, sección 2.3 (C-10).
  var VALOR_BLOQUEADO_SELECTOR = '__bloqueado__';
  var TEXTO_BLOQUEADO_SELECTOR = 'Mis datos (con contraseña)…';
  var MSG_DESBLOQUEO_INCORRECTO = 'Contraseña incorrecta. Vuelve a intentarlo.';
  var FORMATO_RESPALDO = 'rinde-respaldo-1';
  var MSG_RESPALDO_INVALIDO = 'El archivo no es un respaldo válido de Rinde.';

  // -----------------------------------------------------------------------
  // Estado del módulo (closure, no se expone directo). `datosOriginalDemo`
  // se captura UNA sola vez, ANTES de cualquier patch sobre G.HERZON_DATA
  // (con copia profunda -- ver `copiaProfunda`), para que `volverADemo()`
  // nunca pueda devolver datos contaminados por una mutación posterior. Se
  // referencia SIEMPRE vía clon (nunca se entrega el objeto en sí) para que
  // ninguna mutación externa corrompa esta copia maestra.
  //
  // `estadoClientes` es la fuente de verdad de los clientes reales: se
  // hidrata desde localStorage en `cargar()` y se mantiene sincronizada en
  // cada operación mutante (persistir() vuelca G.HERZON_DATA sobre el
  // cliente activo antes de escribir). Sobrevive aunque el usuario esté
  // viendo la demo (así el botón puede recuperar el último cliente activo
  // sin volver a leer localStorage -- ver `activarReal`).
  // -----------------------------------------------------------------------
  var datosOriginalDemo = null;
  var modoActual = 'demo';
  var estadoClientes = { activoId: null, clientes: {} };
  var refsUI = { badge: null, boton: null, selector: null, doc: null };
  var eventosGlobalesCableados = false;

  // R10 (S-02, C-4): `bloqueadoActual` es la bookkeeping PROPIA de este
  // módulo sobre si la sesión tiene clave activa. Es la representación
  // local de "hay clave de sesión" que consulta el embudo único (Herzon.
  // Seguridad no expone ese booleano por contrato S-01: cripto puro, sin
  // estado de aplicación). Transiciones: `cargar()` la fija en true si
  // `Seguridad.activa()` es true al arrancar (sobre cifrado, nada
  // desbloqueado todavía); `desbloquearYMontar` la baja a false tras un
  // descifrado exitoso. Mientras es true, `modoActual` es siempre 'demo'
  // (R8/R9: la demo nunca escribe), así que las rutas de mutación real
  // jamás alcanzan el embudo en este estado -- pero el embudo igual cierra
  // la rama por construcción (ver `escribirAlmacenCrudo`).
  var bloqueadoActual = false;

  // -----------------------------------------------------------------------
  // Utilidades locales.
  // -----------------------------------------------------------------------
  function copiaProfunda(obj) {
    if (typeof structuredClone === 'function') { return structuredClone(obj); }
    return JSON.parse(JSON.stringify(obj));
  }

  function redondear(n, decimales) {
    var f = Math.pow(10, decimales || 0);
    return Math.round(n * f) / f;
  }

  function numeroPositivoONulo(v) {
    return (typeof v === 'number' && isFinite(v) && v > 0) ? v : null;
  }

  function fechaHoy() {
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  // Adendum R10 punto 7: robusta a colisiones Y a la carrera de creación
  // simultánea (flake documentado en T-048, asercion número 160 de este
  // selfcheck: `Math.random()` como único desempate entre dos clientes
  // creados en el MISMO milisegundo -- mismo prefijo `c-<ts>-` -- no
  // garantiza que el id ordene igual que el orden real de creación, y
  // `clientes()`/`primeroClientePorCreado` desempatan por comparación de
  // string cuando `creado`, granularidad de día, coincide). Fix: el último
  // segmento CONSERVA LA MISMA FORMA visible (string base36) pero se
  // deriva de un contador de proceso MONÓTONO en vez de aleatorio, así dos
  // ids generados en el mismo tick SIEMPRE ordenan en el mismo orden en
  // que se generaron. Acotado y declarado (no oculto): el relleno a 4
  // dígitos base36 garantiza el orden correcto hasta 36^4 (~1.68 millones)
  // clientes por proceso, muy por encima de cualquier uso real de esta app.
  var contadorSufijoId = 0;

  function siguienteSufijoIdOrdenado() {
    contadorSufijoId++;
    var sufijo = contadorSufijoId.toString(36);
    while (sufijo.length < 4) { sufijo = '0' + sufijo; }
    return sufijo;
  }

  // Colisión residual (id ya presente en `estadoClientes.clientes`, p.ej.
  // tras una recarga con el contador reiniciado en 0 y el mismo `Date.now`
  // congelado bajo prueba): se cierra regenerando/sufijando un contador
  // ADICIONAL, sin cambiar la forma del id (Adendum R10 punto 7).
  // Determinístico incluso con Date.now Y el contador congelados: cada id
  // generado se registra en `estadoClientes.clientes` ANTES de la
  // siguiente llamada (mismo tick de `crearCliente`), así que el sufijo de
  // colisión siempre avanza.
  function generarIdCliente() {
    var base = 'c-' + Date.now().toString(36) + '-' + siguienteSufijoIdOrdenado();
    if (!Object.prototype.hasOwnProperty.call(estadoClientes.clientes, base)) { return base; }
    var sufijoColision = 1;
    var candidato = base + '-' + sufijoColision;
    while (Object.prototype.hasOwnProperty.call(estadoClientes.clientes, candidato)) {
      sufijoColision++;
      candidato = base + '-' + sufijoColision;
    }
    return candidato;
  }

  // -----------------------------------------------------------------------
  // localStorage: TOLERANTE por diseño. `localStorage` puede no existir
  // (Node, TestDOM), puede lanzar solo al acceder a la propiedad (modo
  // privado en algunos navegadores viejos) o puede lanzar solo al escribir
  // (cuota agotada) -- por eso cada operación va envuelta en su propio
  // try/catch y nunca se asume disponible sin probarlo.
  // -----------------------------------------------------------------------
  function localStorageDisponible() {
    try {
      if (typeof G.localStorage === 'undefined' || G.localStorage === null) { return false; }
      var claveDePrueba = '__rinde_prueba__';
      G.localStorage.setItem(claveDePrueba, '1');
      G.localStorage.removeItem(claveDePrueba);
      return true;
    } catch (err) {
      return false;
    }
  }

  // Lectura CRUDA, sin validar versión/forma (esa lógica vive en
  // `resolverEstadoDesdeCrudo`, que decide migración/corrupción/demo).
  function leerAlmacenCrudo() {
    try {
      if (!localStorageDisponible()) { return null; }
      var texto = G.localStorage.getItem(CLAVE_ALMACEN);
      if (!texto) { return null; }
      var datos = JSON.parse(texto);
      if (!datos || typeof datos !== 'object') { return null; }
      return datos;
    } catch (err) {
      return null;
    }
  }

  // EMBUDO ÚNICO DE ESCRITURA (S-02, Adendum R10 punto 4, C-14): este es el
  // ÚNICO sitio de todo el archivo que hace `localStorage.setItem` sobre la
  // clave `rinde.datos.v1` (el selfcheck lo asierta contando ocurrencias en
  // la fuente). Tres ramas, en este orden:
  //   1. Seguridad activa + CON clave de sesión (bloqueadoActual===false):
  //      delega a `Seguridad.cifrarYPersistir` (asíncrono, cola propia de
  //      S-01) y devuelve `true` OPTIMISTA sin esperar la promesa.
  //   2. Seguridad activa + SIN clave de sesión (bloqueadoActual===true):
  //      `false`, NO escribe -- jamás texto plano sobre un almacén cifrado,
  //      jamás una escritura a ciegas.
  //   3. Seguridad ausente/inactiva: escritura plana de siempre.
  // `forzarPlano` es un escape interno EXCLUSIVO de la ruta de recuperación
  // de `restaurarRespaldo` cuando `bloqueadoActual` era true al llamar
  // (S-04 "ruta de recuperación desde bloqueado"): sin contraseña vigente
  // no hay forma de re-cifrar, así que el respaldo se escribe en plano,
  // sustituyendo el sobre, y la protección queda desactivada por el simple
  // hecho de que el siguiente `Seguridad.activa()` ya no encuentra un
  // sobre `cifrado-1`. Sigue siendo el mismo (y único) call-site de
  // `setItem`.
  function escribirAlmacenCrudo(payload, forzarPlano) {
    var seg = G.Herzon && G.Herzon.Seguridad;
    if (!forzarPlano && seg && typeof seg.activa === 'function' && seg.activa()) {
      if (bloqueadoActual) { return false; }
      if (typeof seg.cifrarYPersistir === 'function') { seg.cifrarYPersistir(payload); }
      return true;
    }
    try {
      if (!localStorageDisponible()) { return false; }
      G.localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(payload));
      return true;
    } catch (err) {
      return false;
    }
  }

  function borrarAlmacenCrudo() {
    try {
      if (!localStorageDisponible()) { return false; }
      G.localStorage.removeItem(CLAVE_ALMACEN);
      return true;
    } catch (err) {
      return false;
    }
  }

  // Escribe el estado COMPLETO de clientes (independiente del cliente
  // montado en G.HERZON_DATA): la usan tanto las operaciones de gestión de
  // la lista (crear/renombrar/eliminar) como `persistir()`.
  function persistirEstado(forzarPlano) {
    return escribirAlmacenCrudo({
      version: VERSION_ALMACEN,
      activoId: estadoClientes.activoId,
      clientes: estadoClientes.clientes
    }, forzarPlano);
  }

  // Vuelca G.HERZON_DATA sobre el cliente activo antes de persistir (así
  // `estadoClientes` nunca se desincroniza de lo que la app mutó en
  // memoria) y escribe el payload completo.
  function persistir() {
    if (modoActual !== 'real' || !G.HERZON_DATA || !estadoClientes.activoId) { return false; }
    var activo = estadoClientes.clientes[estadoClientes.activoId];
    if (!activo) { return false; }
    activo.perfil = G.HERZON_DATA.paciente;
    activo.series = G.HERZON_DATA.series;
    activo.labs = G.HERZON_DATA.labs;
    activo.plicometria = G.HERZON_DATA.plicometria;
    activo.suplementos = G.HERZON_DATA.suplementos;
    return persistirEstado();
  }

  // -----------------------------------------------------------------------
  // Eventos (Adendum R9 punto 3): `herzon:modo-cambiado` pasa a semántica
  // de REMONTAJE (se emite en TODO remontaje de G.HERZON_DATA, demo<->real
  // y cliente<->cliente); NUEVOS `herzon:cliente-cambiado` y
  // `herzon:clientes-actualizados`; NUEVO `herzon:cliente-nuevo-solicitado`
  // (lo despachan selector/botón, lo escucha la vista Perfil, T-040).
  // `herzon:mediciones-importadas` se REUTILIZA (Adendum R8 punto 1) sin
  // cambio.
  // -----------------------------------------------------------------------
  function emitirModoCambiado(modoNuevo, clienteId) {
    if (typeof G.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') { return false; }
    G.dispatchEvent(new CustomEvent('herzon:modo-cambiado', { detail: { modo: modoNuevo, clienteId: (clienteId !== undefined ? clienteId : null) } }));
    return true;
  }

  function emitirClienteCambiado(id, anteriorId) {
    if (typeof G.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') { return false; }
    var c = estadoClientes.clientes[id];
    G.dispatchEvent(new CustomEvent('herzon:cliente-cambiado', {
      detail: { id: id, nombre: (c && c.perfil && c.perfil.nombre) || '', anteriorId: (anteriorId !== undefined ? anteriorId : null) }
    }));
    return true;
  }

  function emitirClientesActualizados() {
    if (typeof G.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') { return false; }
    G.dispatchEvent(new CustomEvent('herzon:clientes-actualizados', {
      detail: { activoId: estadoClientes.activoId || null, lista: clientes().map(function (c) { return { id: c.id, nombre: c.nombre }; }) }
    }));
    return true;
  }

  function despacharClienteNuevoSolicitado() {
    if (typeof G.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') { return false; }
    G.dispatchEvent(new CustomEvent('herzon:cliente-nuevo-solicitado', { detail: {} }));
    return true;
  }

  // R10 (S-02): evento NUEVO que el botón/selector del header despachan
  // mientras bloqueado()===true, EN VEZ de activarReal(). La vista Perfil
  // (T-054, #hz-card-desbloqueo) lo escucha para navegar y enfocar el
  // campo de contraseña.
  function despacharDesbloqueoSolicitado() {
    if (typeof G.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') { return false; }
    G.dispatchEvent(new CustomEvent('herzon:desbloqueo-solicitado', { detail: {} }));
    return true;
  }

  function emitirEventoMediciones(detalle) {
    if (typeof G.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') { return false; }
    G.dispatchEvent(new CustomEvent('herzon:mediciones-importadas', { detail: detalle }));
    return true;
  }

  // -----------------------------------------------------------------------
  // Construcción de estructuras "misma forma que HERZON_DATA, vacías"
  // (Adendum R8 punto 1 + criterio de aceptación T-039). `planes` y
  // `factoresActividad` son catálogo (nunca datos del paciente): se
  // conservan del demo tal cual. `labs.marcadores` y `plicometria.sitios`
  // SI se conservan como catálogo (nombre/unidad/referencia son fijos,
  // clínicos) pero con sus arreglos de valores vacíos. `suplementos` es
  // 100% del paciente: arranca en `[]`.
  // -----------------------------------------------------------------------
  function seriesVacias() {
    return {
      semanas: [],
      fechas: [],
      peso_kg: [],
      grasa_pct: [],
      musculo_kg: [],
      cintura_cm: [],
      adherenciaDieta_pct: [],
      adherenciaDiaria: []
    };
  }

  function labsVaciosDesdeCatalogo(catalogoLabs) {
    var marcadores = (catalogoLabs && catalogoLabs.marcadores) || [];
    return {
      cortes: [],
      marcadores: marcadores.map(function (m) {
        return { clave: m.clave, nombre: m.nombre, unidad: m.unidad, referencia: m.referencia, mejorSi: m.mejorSi, valores: [] };
      })
    };
  }

  function plicometriaVaciaDesdeCatalogo(catalogoPlic) {
    var sitios = (catalogoPlic && catalogoPlic.sitios) || [];
    return {
      unidad: (catalogoPlic && catalogoPlic.unidad) || 'mm',
      cortes: [],
      sitios: sitios.map(function (s) { return { clave: s.clave, nombre: s.nombre, valores_mm: [] }; }),
      sumaPliegues_mm: []
    };
  }

  function calcularTmb(sexo, pesoKg, tallaCm, edad) {
    if (pesoKg == null || tallaCm == null || edad == null) { return null; }
    if (sexo !== 'femenino' && sexo !== 'masculino') { return null; }
    // Mifflin-St Jeor, EXACTA misma fórmula que Herzon.Motor.tmb
    // (build/motor_recomendacion.js): mujer -161, hombre +5.
    var base = 10 * pesoKg + 6.25 * tallaCm - 5 * edad;
    return Math.round(sexo === 'femenino' ? base - 161 : base + 5);
  }

  function construirPacienteDesdePerfil(perfil, catalogoFactores) {
    perfil = perfil || {};
    var talla_cm = numeroPositivoONulo(perfil.talla_cm);
    var pesoInicial_kg = numeroPositivoONulo(perfil.pesoInicial_kg);
    var edad = numeroPositivoONulo(perfil.edad);
    var sexo = (perfil.sexo === 'femenino' || perfil.sexo === 'masculino') ? perfil.sexo : '';
    var actividad = (catalogoFactores && perfil.actividad && Object.prototype.hasOwnProperty.call(catalogoFactores, perfil.actividad))
      ? perfil.actividad
      : '';
    var tmb = calcularTmb(sexo, pesoInicial_kg, talla_cm, edad);
    var factor = actividad ? catalogoFactores[actividad] : null;
    var get_kcal = (tmb != null && factor != null) ? Math.round(tmb * factor) : null;
    var imc = (talla_cm && pesoInicial_kg) ? redondear(pesoInicial_kg / Math.pow(talla_cm / 100, 2), 1) : null;
    return {
      nombre: (typeof perfil.nombre === 'string') ? perfil.nombre : '',
      edad: edad,
      sexo: sexo,
      talla_cm: talla_cm,
      pesoInicial_kg: pesoInicial_kg,
      pesoActual_kg: pesoInicial_kg,
      imcInicial: imc,
      imcActual: imc,
      objetivo: (typeof perfil.objetivo === 'string') ? perfil.objetivo : '',
      // `actividad`: clave ADITIVA (el paciente sintético de build/data.js
      // no la trae) para que el recomendador (T-041) precargue el factor
      // real sin adivinar (Adendum R8 punto 4).
      actividad: actividad,
      diagnosticos: [],
      alergias: Array.isArray(perfil.alergias) ? perfil.alergias.slice() : [],
      restricciones: Array.isArray(perfil.restricciones) ? perfil.restricciones.slice() : [],
      gastoEnergetico: { tmb_kcal: tmb, get_kcal: get_kcal },
      inicio: fechaHoy()
    };
  }

  function estructurasVaciasDesdeCatalogo(catalogo, perfil) {
    return {
      paciente: construirPacienteDesdePerfil(perfil, catalogo.factoresActividad),
      series: seriesVacias(),
      labs: labsVaciosDesdeCatalogo(catalogo.labs),
      plicometria: plicometriaVaciaDesdeCatalogo(catalogo.plicometria),
      suplementos: []
    };
  }

  // Monta un HERZON_DATA COMPLETO para un cliente REAL: catálogo
  // (meta/planes/factoresActividad/supuestos) desde `catalogo`, datos del
  // cliente desde `patch` (una entrada de `estadoClientes.clientes`, con
  // clave `perfil`). Sobrescribe `meta.nota`/`meta.generado` (PR-06: nunca
  // un documento de cliente real puede salir firmado como sintético) y
  // expone `planAplicado` (MC-07, clave ADITIVA) desde el slot `plan` del
  // cliente. TODO se clona (nunca se comparte referencia con `catalogo` ni
  // con `patch`) para que ninguna mutación futura sobre el objeto montado
  // alcance la copia maestra guardada en `datosOriginalDemo`.
  function montarObjetoCompleto(catalogo, patch) {
    var meta = copiaProfunda(catalogo.meta);
    meta.generado = 'real';
    meta.nota = NOTA_META_REAL;
    return {
      meta: meta,
      paciente: copiaProfunda(patch.perfil),
      series: copiaProfunda(patch.series),
      labs: copiaProfunda(patch.labs),
      plicometria: copiaProfunda(patch.plicometria),
      planes: copiaProfunda(catalogo.planes),
      factoresActividad: copiaProfunda(catalogo.factoresActividad),
      suplementos: copiaProfunda(patch.suplementos),
      supuestos: copiaProfunda(catalogo.supuestos),
      planAplicado: patch.plan ? copiaProfunda(patch.plan) : null,
      // R-02/R-03 (rutina): dato de paciente, nunca catálogo -- null si el
      // cliente no tiene rutina prescrita (payloads v2 previos a esta
      // ronda no traen la clave y también resuelven aquí en null).
      rutina: patch.rutina ? copiaProfunda(patch.rutina) : null,
      // S-05 (config): clave ADITIVA como planAplicado; payloads viejos sin
      // la clave se leen como {labsOcultos:false} (tolerancia declarada).
      config: (patch.config && typeof patch.config === 'object') ? copiaProfunda(patch.config) : { labsOcultos: false }
    };
  }

  function montarDemo(catalogo) {
    return copiaProfunda(catalogo);
  }

  function garantizarOriginal() {
    if (datosOriginalDemo === null && G.HERZON_DATA) {
      datosOriginalDemo = copiaProfunda(G.HERZON_DATA);
    }
  }

  function montarComoDemo() {
    G.HERZON_DATA = montarDemo(datosOriginalDemo);
    // S-05: en demo, config.labsOcultos es SIEMPRE false, sin importar lo
    // que traiga el catálogo (la demo no tiene un cliente real con su
    // propio slot de configuración).
    G.HERZON_DATA.config = { labsOcultos: false };
    modoActual = 'demo';
  }

  function montarClienteActivo() {
    var activo = estadoClientes.activoId ? estadoClientes.clientes[estadoClientes.activoId] : null;
    if (!activo) { montarComoDemo(); return; }
    G.HERZON_DATA = montarObjetoCompleto(datosOriginalDemo, activo);
    modoActual = 'real';
  }

  function primeroClientePorCreado(clientesObj) {
    var ids = Object.keys(clientesObj);
    ids.sort(function (a, b) {
      var ca = (clientesObj[a] && clientesObj[a].creado) || '';
      var cb = (clientesObj[b] && clientesObj[b].creado) || '';
      if (ca === cb) { return a < b ? -1 : (a > b ? 1 : 0); }
      return ca < cb ? -1 : 1;
    });
    return ids.length ? ids[0] : null;
  }

  // R10 (S-02/S-04): monta el cliente activo si existe alguno en
  // `estadoClientes.clientes`, o cae a demo si la lista quedó vacía.
  // Compartido por `cargar()` (rama sin bloqueo), `desbloquearYMontar` y
  // `restaurarRespaldo`: las tres rutas resuelven "qué mostrar" con
  // exactamente la misma regla (MC-06: primero por fecha de creación si el
  // activoId persistido está colgante).
  function montarSegunClientesDisponibles() {
    var idsClientes = Object.keys(estadoClientes.clientes);
    if (!idsClientes.length) {
      montarComoDemo();
      return;
    }
    if (!estadoClientes.activoId || !estadoClientes.clientes[estadoClientes.activoId]) {
      estadoClientes.activoId = primeroClientePorCreado(estadoClientes.clientes);
      persistirEstado();
    }
    montarClienteActivo();
  }

  // Migración v1 -> v2 + resolución de corrupción, dentro de `cargar()`.
  // Nunca lanza: cualquier forma inesperada resuelve en `{activoId:null,
  // clientes:{}}` (demo).
  function resolverEstadoDesdeCrudo(crudo) {
    if (!crudo || typeof crudo !== 'object') { return { activoId: null, clientes: {} }; }

    if (crudo.version === VERSION_ALMACEN) {
      var clientesLeidos = (crudo.clientes && typeof crudo.clientes === 'object') ? crudo.clientes : {};
      var activoIdLeido = (typeof crudo.activoId === 'string') ? crudo.activoId : null;
      return { activoId: activoIdLeido, clientes: clientesLeidos };
    }

    if (crudo.version === 1 && crudo.modo === 'real' && crudo.paciente && typeof crudo.paciente === 'object') {
      // Envolver el único paciente v1 como único cliente v2. Reescritura
      // INMEDIATA de la clave: la próxima lectura ve version===2 directo
      // (idempotente, la migración no vuelve a correr).
      var idMigrado = generarIdCliente();
      var clientesMigrados = {};
      clientesMigrados[idMigrado] = {
        perfil: crudo.paciente,
        series: (crudo.series && typeof crudo.series === 'object') ? crudo.series : seriesVacias(),
        labs: (crudo.labs && typeof crudo.labs === 'object') ? crudo.labs : { cortes: [], marcadores: [] },
        plicometria: (crudo.plicometria && typeof crudo.plicometria === 'object') ? crudo.plicometria : { unidad: 'mm', cortes: [], sitios: [], sumaPliegues_mm: [] },
        suplementos: Array.isArray(crudo.suplementos) ? crudo.suplementos : [],
        plan: null,
        // R-02: la migración v1->v2 escribe rutina:null explícito (nunca
        // existió en v1); S-05: config por defecto explícito.
        rutina: null,
        config: { labsOcultos: false },
        creado: fechaHoy()
      };
      escribirAlmacenCrudo({ version: VERSION_ALMACEN, activoId: idMigrado, clientes: clientesMigrados });
      return { activoId: idMigrado, clientes: clientesMigrados };
    }

    // version desconocida u otro payload no reconocido: demo sin lanzar.
    return { activoId: null, clientes: {} };
  }

  // -----------------------------------------------------------------------
  // pesoActual_kg/imcActual: se mantienen en sincronía con la ÚLTIMA
  // medición registrada (no con pesoInicial_kg) en cuanto existe al menos
  // una fila en `series.peso_kg`.
  // -----------------------------------------------------------------------
  function actualizarPesoActualDesdeSerie() {
    var series = G.HERZON_DATA.series;
    if (!series.peso_kg.length) { return; }
    var ultimoPeso = series.peso_kg[series.peso_kg.length - 1];
    var paciente = G.HERZON_DATA.paciente;
    paciente.pesoActual_kg = ultimoPeso;
    if (paciente.talla_cm) {
      paciente.imcActual = redondear(ultimoPeso / Math.pow(paciente.talla_cm / 100, 2), 1);
    }
  }

  // -----------------------------------------------------------------------
  // Plicometría opcional dentro de una medición nueva.
  // -----------------------------------------------------------------------
  var SITIOS_PLICOMETRIA = ['tricipital', 'subescapular', 'suprailiaco', 'abdominal'];
  var LIMITE_PLICOMETRIA_MM = { min: 2, max: 80 };

  function validarPlicometria(entrada, erroresOut) {
    var valores = {};
    var valida = true;
    for (var i = 0; i < SITIOS_PLICOMETRIA.length; i++) {
      var clave = SITIOS_PLICOMETRIA[i];
      var v = entrada ? entrada[clave] : undefined;
      if (typeof v !== 'number' || !isFinite(v)) {
        erroresOut.push('"plicometria.' + clave + '" inválido: se espera un número');
        valida = false;
        continue;
      }
      if (v < LIMITE_PLICOMETRIA_MM.min || v > LIMITE_PLICOMETRIA_MM.max) {
        erroresOut.push('"plicometria.' + clave + '" fuera de rango plausible (' + LIMITE_PLICOMETRIA_MM.min + '-' + LIMITE_PLICOMETRIA_MM.max + ' mm)');
        valida = false;
        continue;
      }
      valores[clave] = v;
    }
    return valida ? valores : null;
  }

  function escribirPlicometria(plicometria, semana, valoresPorSitio) {
    plicometria.cortes.push('S' + semana);
    var suma = 0;
    plicometria.sitios.forEach(function (sitio) {
      var v = valoresPorSitio[sitio.clave];
      sitio.valores_mm.push(v);
      suma += v;
    });
    plicometria.sumaPliegues_mm.push(redondear(suma, 1));
  }

  // -----------------------------------------------------------------------
  // Validación de nombre compartida por crearCliente/renombrarCliente
  // (MC-02: "mismas validaciones"). Duplicado tras trim+minúsculas.
  // -----------------------------------------------------------------------
  function nombreClienteDisponible(nombreNormalizado, idAExcluir) {
    return !Object.keys(estadoClientes.clientes).some(function (id) {
      if (id === idAExcluir) { return false; }
      var c = estadoClientes.clientes[id];
      var nombreExistente = (c && c.perfil && typeof c.perfil.nombre === 'string') ? c.perfil.nombre.trim().toLowerCase() : '';
      return nombreExistente === nombreNormalizado;
    });
  }

  function validarNombreCliente(nombreCrudo, idAExcluir) {
    var nombre = (typeof nombreCrudo === 'string') ? nombreCrudo.trim() : '';
    if (!nombre) { return { valido: false, nombre: nombre, errores: [MSG_NOMBRE_VACIO] }; }
    if (!nombreClienteDisponible(nombre.toLowerCase(), idAExcluir)) {
      return { valido: false, nombre: nombre, errores: [MSG_NOMBRE_DUPLICADO] };
    }
    return { valido: true, nombre: nombre, errores: [] };
  }

  // =========================================================================
  // API PUBLICA
  // =========================================================================

  function modo() {
    return modoActual;
  }

  // cargar(): síncrono, re-invocable (simula un "recargar la página" sin
  // reiniciar el proceso). Resuelve migración/corrupción vía
  // `resolverEstadoDesdeCrudo`, decide qué montar y emite
  // `herzon:clientes-actualizados` al final (Adendum R9 punto 3: el evento
  // de lista se emite "tras cargar()"); NO emite `modo-cambiado` ni
  // `cliente-cambiado` aquí -- en el arranque real (la propia IIFE) no hay
  // listeners todavía, y una "recarga simulada" no es, en sí, un cambio de
  // cliente decidido por el usuario. Nunca lanza.
  function cargar() {
    if (!G.HERZON_DATA && datosOriginalDemo === null) { return modoActual; }
    garantizarOriginal();

    // S-02 (Adendum R10 punto 5): con un sobre cifrado presente, los datos
    // reales son ILEGIBLES sin desbloquear -- arranca en demo funcional con
    // bloqueado()===true, sin siquiera intentar leer/parsear el crudo.
    // Tolerancia total: si Herzon.Seguridad no existe (ronda anterior a
    // R10, o módulo aún no inyectado), este bloque no corre nunca (sin
    // flag day).
    var seg = G.Herzon && G.Herzon.Seguridad;
    if (seg && typeof seg.activa === 'function' && seg.activa()) {
      bloqueadoActual = true;
      estadoClientes = { activoId: null, clientes: {} };
      montarComoDemo();
      emitirClientesActualizados();
      return modoActual;
    }
    bloqueadoActual = false;

    var crudo = leerAlmacenCrudo();
    estadoClientes = resolverEstadoDesdeCrudo(crudo);
    montarSegunClientesDisponibles();

    emitirClientesActualizados();
    return modoActual;
  }

  // clientes(): [{id, nombre, creado}] ordenados por creado. JAMÁS incluye
  // la demo (MC-05).
  function clientes() {
    var ids = Object.keys(estadoClientes.clientes);
    ids.sort(function (a, b) {
      var ca = estadoClientes.clientes[a].creado || '';
      var cb = estadoClientes.clientes[b].creado || '';
      if (ca === cb) { return a < b ? -1 : (a > b ? 1 : 0); }
      return ca < cb ? -1 : 1;
    });
    return ids.map(function (id) {
      var c = estadoClientes.clientes[id];
      return { id: id, nombre: (c.perfil && c.perfil.nombre) || '', creado: c.creado };
    });
  }

  // clienteActivo(): {id, nombre} en real, null en demo (MC-05).
  function clienteActivo() {
    if (modoActual !== 'real' || !estadoClientes.activoId) { return null; }
    var activo = estadoClientes.clientes[estadoClientes.activoId];
    if (!activo) { return null; }
    return { id: estadoClientes.activoId, nombre: (activo.perfil && activo.perfil.nombre) || '' };
  }

  // crearCliente(perfil): valida nombre, crea estructuras vacías desde el
  // catálogo, monta y persiste. Retorna {ok:true,id} | {ok:false,errores}.
  function crearCliente(perfil) {
    garantizarOriginal();
    var chequeoNombre = validarNombreCliente(perfil && perfil.nombre, null);
    if (!chequeoNombre.valido) { return { ok: false, errores: chequeoNombre.errores, id: null }; }
    if (!datosOriginalDemo) { return { ok: false, errores: ['El catálogo de datos no está disponible.'], id: null }; }

    var estructuras = estructurasVaciasDesdeCatalogo(datosOriginalDemo, perfil);
    estructuras.paciente.nombre = chequeoNombre.nombre;

    var id = generarIdCliente();
    estadoClientes.clientes[id] = {
      perfil: estructuras.paciente,
      series: estructuras.series,
      labs: estructuras.labs,
      plicometria: estructuras.plicometria,
      suplementos: estructuras.suplementos,
      plan: null,
      // R-02/S-05: explícitos desde la creación (Adendum R10).
      rutina: null,
      config: { labsOcultos: false },
      creado: fechaHoy()
    };
    var anteriorId = estadoClientes.activoId;
    estadoClientes.activoId = id;
    persistirEstado();
    montarClienteActivo();

    emitirClientesActualizados();
    emitirClienteCambiado(id, anteriorId);
    emitirModoCambiado('real', id);
    sincronizarUIModo();

    return { ok: true, errores: [], id: id };
  }

  // seleccionarCliente(id): persiste el activo saliente, monta clientes[id]
  // como el nuevo activo. No-op idempotente si `id` ya es el activo en
  // modo real (evita remontajes/eventos redundantes).
  function seleccionarCliente(id) {
    if (!id || !estadoClientes.clientes[id]) { return modoActual; }
    if (id === estadoClientes.activoId && modoActual === 'real') { return modoActual; }
    garantizarOriginal();
    if (modoActual === 'real' && estadoClientes.activoId) { persistir(); }

    var anteriorId = estadoClientes.activoId;
    estadoClientes.activoId = id;
    persistirEstado();
    montarClienteActivo();

    emitirClienteCambiado(id, anteriorId);
    emitirModoCambiado('real', id);
    sincronizarUIModo();

    return modoActual;
  }

  // renombrarCliente(id, nombre): mismas validaciones que crearCliente.
  function renombrarCliente(id, nombre) {
    if (!id || !estadoClientes.clientes[id]) { return { ok: false, errores: ['Cliente no encontrado.'] }; }
    var chequeoNombre = validarNombreCliente(nombre, id);
    if (!chequeoNombre.valido) { return { ok: false, errores: chequeoNombre.errores }; }

    estadoClientes.clientes[id].perfil.nombre = chequeoNombre.nombre;
    if (id === estadoClientes.activoId && modoActual === 'real' && G.HERZON_DATA) {
      G.HERZON_DATA.paciente.nombre = chequeoNombre.nombre;
    }
    persistirEstado();
    emitirClientesActualizados();

    return { ok: true, errores: [] };
  }

  // eliminarCliente(id): borra clientes[id]; si era el activo montado,
  // monta el primer restante o vuelve a demo si no queda ninguno.
  function eliminarCliente(id) {
    if (!id || !estadoClientes.clientes[id]) { return { ok: false, restantes: clientes().length }; }
    garantizarOriginal();

    var afectaMontaje = (id === estadoClientes.activoId && modoActual === 'real');
    var eraActivoId = (id === estadoClientes.activoId);
    delete estadoClientes.clientes[id];
    var idsRestantes = Object.keys(estadoClientes.clientes);

    if (eraActivoId) {
      estadoClientes.activoId = idsRestantes.length ? primeroClientePorCreado(estadoClientes.clientes) : null;
    }
    persistirEstado();
    emitirClientesActualizados();

    if (afectaMontaje) {
      if (estadoClientes.activoId) {
        montarClienteActivo();
        emitirClienteCambiado(estadoClientes.activoId, id);
        emitirModoCambiado('real', estadoClientes.activoId);
        sincronizarUIModo();
      } else {
        volverADemo();
      }
    }

    return { ok: true, restantes: idsRestantes.length };
  }

  // guardarPlan(plan): persiste en clientes[activoId].plan y expone
  // HERZON_DATA.planAplicado de inmediato (sin esperar a un remontaje).
  function guardarPlan(plan) {
    if (modoActual !== 'real' || !G.HERZON_DATA || !estadoClientes.activoId) { return false; }
    var activo = estadoClientes.clientes[estadoClientes.activoId];
    if (!activo) { return false; }
    var planNormalizado = null;
    if (plan && typeof plan === 'object') {
      planNormalizado = {
        plantillaId: (typeof plan.plantillaId === 'string') ? plan.plantillaId : '',
        kcalObjetivo: (typeof plan.kcalObjetivo === 'number' && isFinite(plan.kcalObjetivo)) ? plan.kcalObjetivo : null,
        fecha: (typeof plan.fecha === 'string' && plan.fecha !== '') ? plan.fecha : fechaHoy()
      };
    }
    activo.plan = planNormalizado;
    G.HERZON_DATA.planAplicado = planNormalizado ? copiaProfunda(planNormalizado) : null;
    return persistir();
  }

  // ===========================================================================
  // R10 -- R-02/R-03: slot rutina.
  // ===========================================================================

  function enteroFinitoEnRango(v, minimo, maximo) {
    if (typeof v !== 'number' || !isFinite(v)) { return null; }
    var entero = Math.round(v);
    return (entero < minimo || entero > maximo) ? null : entero;
  }

  function stringODefecto(v, porDefecto) {
    return (typeof v === 'string') ? v : porDefecto;
  }

  function fechaValidaOAhora(v) {
    return (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : fechaHoy();
  }

  // Normalización tolerante de UN ejercicio (R-02): nombre requerido (se
  // descarta el ejercicio entero si queda vacío tras castear a String y
  // recortar espacios); series/descanso_s enteros finitos en rango o null;
  // repeticiones/notas casteados a String. Los límites de longitud
  // (nombre<=80, repeticiones<=40, etc.) son responsabilidad del EDITOR
  // (R-06): el almacén normaliza tipos y forma, no trunca contenido.
  function normalizarEjercicioRutina(x) {
    if (!x || typeof x !== 'object') { return null; }
    var nombre = String(x.nombre != null ? x.nombre : '').trim();
    if (!nombre) { return null; }
    return {
      nombre: nombre,
      series: enteroFinitoEnRango(x.series, 1, 10),
      repeticiones: stringODefecto(x.repeticiones, ''),
      descanso_s: enteroFinitoEnRango(x.descanso_s, 0, 600),
      notas: stringODefecto(x.notas, '')
    };
  }

  // Normalización tolerante del slot completo (R-02/R-03.1): null/no-objeto
  // => null; si objeto, `dias` = entradas con >=1 ejercicio VÁLIDO tras
  // normalizar (un día cuyos ejercicios quedan todos descartados también se
  // descarta), renumeradas secuencial 1..n; `actualizado` = fecha válida o
  // `fechaHoy()`.
  function normalizarRutina(rutina) {
    if (!rutina || typeof rutina !== 'object' || !Array.isArray(rutina.dias)) { return null; }
    var diasNormalizados = [];
    rutina.dias.forEach(function (d) {
      if (!d || typeof d !== 'object' || !Array.isArray(d.ejercicios) || !d.ejercicios.length) { return; }
      var ejercicios = [];
      d.ejercicios.forEach(function (x) {
        var e = normalizarEjercicioRutina(x);
        if (e) { ejercicios.push(e); }
      });
      if (!ejercicios.length) { return; }
      diasNormalizados.push({ dia: diasNormalizados.length + 1, titulo: stringODefecto(d.titulo, ''), ejercicios: ejercicios });
    });
    return { dias: diasNormalizados, actualizado: fechaValidaOAhora(rutina.actualizado) };
  }

  // guardarRutina(rutina) -> boolean (R-03.1): false si no hay cliente real
  // activo (misma guarda que guardarPlan/persistir). Escribe
  // clientes[activoId].rutina y HERZON_DATA.rutina en el mismo tick;
  // persiste vía persistir() (que enruta por el embudo único S-02 -- el
  // cifrado cubre la rutina sin trabajo adicional, C-14).
  function guardarRutina(rutina) {
    if (modoActual !== 'real' || !G.HERZON_DATA || !estadoClientes.activoId) { return false; }
    var activo = estadoClientes.clientes[estadoClientes.activoId];
    if (!activo) { return false; }
    var slot = normalizarRutina(rutina);
    activo.rutina = slot;
    G.HERZON_DATA.rutina = slot ? copiaProfunda(slot) : null;
    return persistir();
  }

  // ===========================================================================
  // R10 -- S-05: config {labsOcultos} por cliente.
  // ===========================================================================

  // actualizarConfig(parcial) -> boolean: solo en real con activo; fusiona
  // clave por clave sobre clientes[activoId].config (hoy la única clave es
  // labsOcultos; el merge queda genérico para futuras claves aditivas sin
  // migración), sincroniza HERZON_DATA.config, persiste vía el embudo único
  // y emite herzon:modo-cambiado (semántica R9 de remontaje: Perfil y
  // Seguimiento repintan completos -- que aparezcan/desaparezcan secciones
  // ES un remontaje).
  function actualizarConfig(parcial) {
    if (modoActual !== 'real' || !G.HERZON_DATA || !estadoClientes.activoId) { return false; }
    var activo = estadoClientes.clientes[estadoClientes.activoId];
    if (!activo) { return false; }
    var configActual = (activo.config && typeof activo.config === 'object') ? activo.config : { labsOcultos: false };
    var configFusionado = { labsOcultos: configActual.labsOcultos === true };
    if (parcial && typeof parcial === 'object' && Object.prototype.hasOwnProperty.call(parcial, 'labsOcultos')) {
      configFusionado.labsOcultos = parcial.labsOcultos === true;
    }
    activo.config = configFusionado;
    G.HERZON_DATA.config = copiaProfunda(configFusionado);
    var ok = persistirEstado();
    emitirModoCambiado('real', estadoClientes.activoId);
    return ok;
  }

  // ===========================================================================
  // R10 -- S-04: respaldo exportable/importable (reemplazo TOTAL, C-11).
  // ===========================================================================

  // exportarRespaldo(): serializa estadoClientes EN MEMORIA (con cifrado
  // activo exporta lo YA desbloqueado, nunca lee el sobre crudo).
  function exportarRespaldo() {
    if (!estadoClientes || typeof estadoClientes !== 'object' || !estadoClientes.clientes) {
      return { ok: false };
    }
    var datos = { version: VERSION_ALMACEN, activoId: estadoClientes.activoId, clientes: estadoClientes.clientes };
    return {
      ok: true,
      nombreArchivo: 'rinde-respaldo-' + fechaHoy() + '.json',
      json: JSON.stringify({ formato: FORMATO_RESPALDO, exportado: fechaHoy(), datos: datos })
    };
  }

  // restaurarRespaldo(objeto) -> {ok,errores,clientes}: valida la forma
  // exacta del sobre de respaldo, REEMPLAZA estadoClientes por completo
  // (jamás fusiona por id, C-11), persiste vía el embudo único (con sesión
  // cifrada activa re-cifra con la contraseña vigente; sin cifrado,
  // plano -- automático, sin trabajo adicional aquí) y emite la MISMA
  // secuencia de eventos que desbloquearYMontar. Ruta especial "desde
  // bloqueado" (S-04): si `bloqueadoActual` era true al llamar, no hay
  // contraseña vigente para re-cifrar -- el respaldo se escribe EN PLANO
  // (forzarPlano) y la protección queda desactivada.
  function restaurarRespaldo(objeto) {
    var formaValida = objeto && typeof objeto === 'object' &&
      objeto.formato === FORMATO_RESPALDO &&
      objeto.datos && typeof objeto.datos === 'object' &&
      objeto.datos.version === VERSION_ALMACEN;
    if (!formaValida) {
      return { ok: false, errores: [MSG_RESPALDO_INVALIDO], clientes: 0 };
    }

    garantizarOriginal();
    estadoClientes = resolverEstadoDesdeCrudo(objeto.datos);

    var veniaDeBloqueado = bloqueadoActual;
    if (veniaDeBloqueado) { bloqueadoActual = false; }
    persistirEstado(veniaDeBloqueado);

    montarSegunClientesDisponibles();

    emitirClientesActualizados();
    if (modoActual === 'real') {
      emitirClienteCambiado(estadoClientes.activoId, null);
      emitirModoCambiado('real', estadoClientes.activoId);
    } else {
      emitirModoCambiado('demo', null);
    }
    sincronizarUIModo();

    return { ok: true, errores: [], clientes: Object.keys(estadoClientes.clientes).length };
  }

  // ===========================================================================
  // R10 -- S-02: boot bloqueado y desbloqueo asíncrono.
  // ===========================================================================

  function bloqueado() {
    return bloqueadoActual;
  }

  // desbloquearYMontar(contrasena) -> Promise<{ok,error}>: delega en
  // Seguridad.desbloquear; null (contraseña incorrecta o sobre manipulado,
  // indistinguibles por diseño S-01) => {ok:false,error:MSG} SIN tocar el
  // estado. Éxito: resuelve el payload v2 EN MEMORIA con la misma
  // tolerancia del boot, baja bloqueadoActual, monta y emite EN ESTE ORDEN:
  // clientes-actualizados -> cliente-cambiado -> modo-cambiado (semántica
  // R9: todas las vistas repintan sin código nuevo).
  function desbloquearYMontar(contrasena) {
    var seg = G.Herzon && G.Herzon.Seguridad;
    if (!seg || typeof seg.desbloquear !== 'function') {
      return Promise.resolve({ ok: false, error: MSG_DESBLOQUEO_INCORRECTO });
    }
    return seg.desbloquear(contrasena).then(function (payload) {
      if (!payload) {
        return { ok: false, error: MSG_DESBLOQUEO_INCORRECTO };
      }
      garantizarOriginal();
      estadoClientes = resolverEstadoDesdeCrudo(payload);
      bloqueadoActual = false;
      montarSegunClientesDisponibles();

      emitirClientesActualizados();
      if (modoActual === 'real') {
        emitirClienteCambiado(estadoClientes.activoId, null);
        emitirModoCambiado('real', estadoClientes.activoId);
      } else {
        emitirModoCambiado('demo', null);
      }
      sincronizarUIModo();

      return { ok: true, error: null };
    });
  }

  // activarReal(perfil): SUPERSEDE parcial del Adendum R8 (Adendum R9
  // punto 3). Con perfil equivale a crearCliente(perfil). Sin perfil y con
  // clientes ya registrados, recupera el activo conocido (seleccionarCliente,
  // idempotente si ya está montado). Sin perfil y sin ningún cliente NO crea
  // un real anónimo: despacha herzon:cliente-nuevo-solicitado y se queda en
  // demo -- la UI (vista Perfil, MC-04) abre el formulario de alta.
  function activarReal(perfil) {
    garantizarOriginal();
    if (!datosOriginalDemo) { return modoActual; }

    if (perfil) {
      crearCliente(perfil);
      return modoActual;
    }

    var idsClientes = Object.keys(estadoClientes.clientes);
    if (!idsClientes.length) {
      despacharClienteNuevoSolicitado();
      return modoActual;
    }

    var idParaMontar = (estadoClientes.activoId && estadoClientes.clientes[estadoClientes.activoId])
      ? estadoClientes.activoId
      : primeroClientePorCreado(estadoClientes.clientes);
    seleccionarCliente(idParaMontar);
    return modoActual;
  }

  // volverADemo(): restaura el sintético ORIGINAL sin tocar lo persistido
  // (Adendum R8 punto 1) -- borrarTodo() es la única vía para limpiar la
  // clave de localStorage. `estadoClientes.activoId` NO se limpia aquí
  // (MC-05/MC-03): la visita a demo es transitoria, y el botón/selector
  // pueden recuperar el cliente conocido sin releer localStorage.
  function volverADemo() {
    if (modoActual !== 'real') { sincronizarUIModo(); return modoActual; }
    montarComoDemo();
    emitirModoCambiado('demo', null);
    sincronizarUIModo();
    // MC-03: el selector solo se reconstruye por clientes-actualizados /
    // cliente-cambiado (nunca por sincronizarUIModo). Emitir ACÁ, con
    // modoActual ya en 'demo', para que construirOpcionesSelector() tome la
    // rama demo (option "Demo: ..." seleccionada) tanto en el click directo
    // del botón #hz-btn-modo como en el fallback de eliminarCliente cuando
    // no queda ningún cliente restante.
    emitirClientesActualizados();
    return modoActual;
  }

  // bloquearYVolverADemo() (T-058, fix de S-02): re-bloqueo EXPLÍCITO desde
  // "Bloquear ahora" -- a diferencia de volverADemo() (alterna DEMO/REAL sin
  // tocar bloqueadoActual; lo usa también el toggle #hz-btn-modo para
  // previsualizar demo mientras la sesión sigue desbloqueada, caso que NO
  // debe re-bloquear), esta función SIEMPRE deja bloqueadoActual=true y
  // limpia estadoClientes en memoria -- el mismo bookkeeping que la rama
  // bloqueada de cargar() (línea ~690). El caller (vista_metricas.js) ya
  // llamó Seguridad.bloquear() antes de invocar esto (borra la clave de
  // sesión); aquí solo se refleja ese re-bloqueo en el estado del almacén y
  // se repinta la UI, igual que volverADemo().
  function bloquearYVolverADemo() {
    bloqueadoActual = true;
    estadoClientes = { activoId: null, clientes: {} };
    montarComoDemo();
    emitirModoCambiado('demo', null);
    sincronizarUIModo();
    emitirClientesActualizados();
    return modoActual;
  }

  function actualizarPerfil(p) {
    if (modoActual !== 'real' || !p || !G.HERZON_DATA) { return false; }
    var paciente = G.HERZON_DATA.paciente;
    var perfilFusionado = {
      nombre: (p.nombre !== undefined) ? p.nombre : paciente.nombre,
      sexo: (p.sexo !== undefined) ? p.sexo : paciente.sexo,
      edad: (p.edad !== undefined) ? p.edad : paciente.edad,
      talla_cm: (p.talla_cm !== undefined) ? p.talla_cm : paciente.talla_cm,
      pesoInicial_kg: (p.pesoInicial_kg !== undefined) ? p.pesoInicial_kg : paciente.pesoInicial_kg,
      actividad: (p.actividad !== undefined) ? p.actividad : paciente.actividad,
      objetivo: (p.objetivo !== undefined) ? p.objetivo : paciente.objetivo,
      alergias: (p.alergias !== undefined) ? p.alergias : paciente.alergias,
      restricciones: (p.restricciones !== undefined) ? p.restricciones : paciente.restricciones
    };
    var pacienteActualizado = construirPacienteDesdePerfil(perfilFusionado, G.HERZON_DATA.factoresActividad);
    // No reiniciar el progreso ya rastreado: si ya hay mediciones, el peso
    // "actual" y su IMC se conservan (vienen de la ÚLTIMA medición, no del
    // peso inicial declarado en el perfil).
    if (G.HERZON_DATA.series.peso_kg.length) {
      pacienteActualizado.pesoActual_kg = paciente.pesoActual_kg;
      pacienteActualizado.imcActual = paciente.imcActual;
    }
    G.HERZON_DATA.paciente = pacienteActualizado;
    persistir();
    // El nombre pudo cambiar: el selector del header se resincroniza por
    // este evento (MC-02, "el select del header se resincroniza por
    // evento" -- renombrarCliente(id,nombre) cumple el mismo rol explícito).
    emitirClientesActualizados();
    return true;
  }

  function agregarMedicion(m) {
    if (modoActual !== 'real' || !G.HERZON_DATA) {
      return { ok: false, errores: ['agregarMedicion solo está disponible en modo real'], medicion: null };
    }
    m = m || {};
    var errores = [];
    var LIMITES = {
      peso_kg: { min: 20, max: 400 },
      grasa_pct: { min: 3, max: 70 },
      musculo_kg: { min: 5, max: 150 },
      cintura_cm: { min: 40, max: 250 }
    };
    var valores = {};
    ['peso_kg', 'grasa_pct', 'musculo_kg', 'cintura_cm'].forEach(function (campo) {
      var v = m[campo];
      if (typeof v !== 'number' || !isFinite(v)) {
        errores.push('"' + campo + '" inválido: se espera un número');
        return;
      }
      var lim = LIMITES[campo];
      if (v < lim.min || v > lim.max) {
        errores.push('"' + campo + '" fuera de rango plausible (' + lim.min + '-' + lim.max + ')');
        return;
      }
      valores[campo] = v;
    });

    var plicoValidada = null;
    if (m.plicometria != null) {
      plicoValidada = validarPlicometria(m.plicometria, errores);
    }

    if (errores.length) {
      return { ok: false, errores: errores, medicion: null };
    }

    var series = G.HERZON_DATA.series;
    var semana = series.semanas.length ? series.semanas[series.semanas.length - 1] + 1 : 1;
    var fecha = fechaHoy();

    series.semanas.push(semana);
    series.fechas.push(fecha);
    series.peso_kg.push(valores.peso_kg);
    series.grasa_pct.push(valores.grasa_pct);
    series.musculo_kg.push(valores.musculo_kg);
    series.cintura_cm.push(valores.cintura_cm);
    var ultimaAdherencia = series.adherenciaDieta_pct.length ? series.adherenciaDieta_pct[series.adherenciaDieta_pct.length - 1] : 0;
    series.adherenciaDieta_pct.push(ultimaAdherencia);

    if (plicoValidada) {
      escribirPlicometria(G.HERZON_DATA.plicometria, semana, plicoValidada);
    }

    actualizarPesoActualDesdeSerie();
    persistir();
    emitirEventoMediciones({ agregadas: 1, actualizadas: 0, errores: 0 });

    return {
      ok: true,
      errores: [],
      medicion: {
        semana: semana,
        fecha: fecha,
        peso_kg: valores.peso_kg,
        grasa_pct: valores.grasa_pct,
        musculo_kg: valores.musculo_kg,
        cintura_cm: valores.cintura_cm,
        plicometria: plicoValidada
      }
    };
  }

  function filaMedicionValida(fila) {
    return !!fila &&
      typeof fila.semana === 'number' && isFinite(fila.semana) &&
      typeof fila.fecha === 'string' && fila.fecha !== '' &&
      typeof fila.peso_kg === 'number' && isFinite(fila.peso_kg) &&
      typeof fila.grasa_pct === 'number' && isFinite(fila.grasa_pct) &&
      typeof fila.musculo_kg === 'number' && isFinite(fila.musculo_kg) &&
      typeof fila.cintura_cm === 'number' && isFinite(fila.cintura_cm);
  }

  // mergeMediciones(lista): mismo algoritmo de merge (agrega semana nueva /
  // actualiza semana existente / reordena cronológicamente). Con el
  // esquema v2 (PR-07, MC-02) opera sobre `clientes[activoId]` a través de
  // `persistir()`, sin cambio de firma.
  function mergeMediciones(lista) {
    if (modoActual !== 'real' || !G.HERZON_DATA) {
      return { ok: false, agregadas: 0, actualizadas: 0, errores: ['mergeMediciones solo está disponible en modo real'] };
    }
    lista = Array.isArray(lista) ? lista : [];
    var series = G.HERZON_DATA.series;
    var agregadas = 0;
    var actualizadas = 0;
    var ultimaAdherencia = series.adherenciaDieta_pct.length ? series.adherenciaDieta_pct[series.adherenciaDieta_pct.length - 1] : 0;

    for (var i = 0; i < lista.length; i++) {
      var fila = lista[i];
      if (!filaMedicionValida(fila)) { continue; }
      var idx = series.semanas.indexOf(fila.semana);
      if (idx === -1) {
        series.semanas.push(fila.semana);
        series.fechas.push(fila.fecha);
        series.peso_kg.push(fila.peso_kg);
        series.grasa_pct.push(fila.grasa_pct);
        series.musculo_kg.push(fila.musculo_kg);
        series.cintura_cm.push(fila.cintura_cm);
        series.adherenciaDieta_pct.push(ultimaAdherencia);
        agregadas++;
      } else {
        series.fechas[idx] = fila.fecha;
        series.peso_kg[idx] = fila.peso_kg;
        series.grasa_pct[idx] = fila.grasa_pct;
        series.musculo_kg[idx] = fila.musculo_kg;
        series.cintura_cm[idx] = fila.cintura_cm;
        actualizadas++;
      }
    }

    if (agregadas || actualizadas) {
      var orden = series.semanas.map(function (_v, indice) { return indice; });
      orden.sort(function (a, b) { return series.semanas[a] - series.semanas[b]; });
      ['semanas', 'fechas', 'peso_kg', 'grasa_pct', 'musculo_kg', 'cintura_cm', 'adherenciaDieta_pct'].forEach(function (clave) {
        series[clave] = orden.map(function (indice) { return series[clave][indice]; });
      });
      actualizarPesoActualDesdeSerie();
      persistir();
      emitirEventoMediciones({ agregadas: agregadas, actualizadas: actualizadas, errores: 0 });
    }

    return { ok: true, agregadas: agregadas, actualizadas: actualizadas, errores: [] };
  }

  // borrarTodo(): reinicio TOTAL -- limpia la clave de localStorage y TODOS
  // los clientes en memoria (MC-06: nunca "borrar mis datos" en singular;
  // el texto de confirmación es responsabilidad de la UI que lo invoque).
  // Si el modo actual era real, también regresa a demo en memoria.
  function borrarTodo() {
    var ok = borrarAlmacenCrudo();
    estadoClientes = { activoId: null, clientes: {} };
    if (modoActual === 'real') {
      montarComoDemo();
      emitirModoCambiado('demo', null);
      sincronizarUIModo();
    }
    emitirClientesActualizados();
    return ok;
  }

  // -----------------------------------------------------------------------
  // Cableado del header (badge/botón/selector -- única UI que posee este
  // módulo).
  // -----------------------------------------------------------------------
  // PR-02 (decisión C1: gana sobre el texto propuesto por MC-05): el badge
  // marca SOLO el modo demo; en real queda oculto, sin texto sustituto.
  function textoBadge() { return TEXTO_BADGE_DEMO; }
  function textoBoton(m) { return (m === 'real') ? TEXTO_BOTON_REAL : TEXTO_BOTON_DEMO; }

  function sincronizarUIModo() {
    if (refsUI.badge) {
      refsUI.badge.textContent = textoBadge();
      if (modoActual === 'real') { refsUI.badge.setAttribute('hidden', ''); }
      else { refsUI.badge.removeAttribute('hidden'); }
    }
    if (refsUI.boton) { refsUI.boton.textContent = textoBoton(modoActual); }
  }

  // MC-03: opciones del selector, textContent siempre. Demo:
  // "Demo: <nombre del sintético>" seleccionada + clientes + "+ Nuevo
  // cliente…". Real: clientes (activo con selected) + "+ Nuevo cliente…",
  // SIN opción demo. R10 (S-02): bloqueado === true es un CUARTO estado,
  // exclusivo entre sí con demo/real -- exactamente 2 opciones (Demo
  // seleccionada + "Mis datos (con contraseña)…"), SIN "+ Nuevo cliente…"
  // (crear un cliente escribiría sobre el sobre cifrado).
  function construirOpcionesSelector() {
    var opciones = [];
    if (bloqueadoActual) {
      var nombreDemoBloqueado = (datosOriginalDemo && datosOriginalDemo.paciente && datosOriginalDemo.paciente.nombre) || '';
      opciones.push({ valor: VALOR_DEMO_SELECTOR, texto: 'Demo: ' + nombreDemoBloqueado, seleccionada: true });
      opciones.push({ valor: VALOR_BLOQUEADO_SELECTOR, texto: TEXTO_BLOQUEADO_SELECTOR, seleccionada: false });
      return opciones;
    }
    var enReal = (modoActual === 'real');
    if (!enReal) {
      var nombreDemo = (datosOriginalDemo && datosOriginalDemo.paciente && datosOriginalDemo.paciente.nombre) || '';
      opciones.push({ valor: VALOR_DEMO_SELECTOR, texto: 'Demo: ' + nombreDemo, seleccionada: true });
    }
    clientes().forEach(function (c) {
      opciones.push({ valor: c.id, texto: c.nombre, seleccionada: enReal && c.id === estadoClientes.activoId });
    });
    opciones.push({ valor: VALOR_NUEVO_SELECTOR, texto: TEXTO_NUEVO_CLIENTE, seleccionada: false });
    return opciones;
  }

  // El select se reconstruye SOLO al recibir herzon:clientes-actualizados /
  // herzon:cliente-cambiado (cableado en initUI) o en la construcción
  // inicial dentro de initUI -- nunca en cada sincronizarUIModo().
  function reconstruirSelectorCliente() {
    var selector = refsUI.selector;
    if (!selector) { return; }
    var doc = refsUI.doc || selector.ownerDocument || G.document;
    if (!doc || typeof doc.createElement !== 'function') { return; }

    while (selector.childNodes && selector.childNodes.length) {
      selector.removeChild(selector.childNodes[0]);
    }

    var valorSeleccionado = null;
    construirOpcionesSelector().forEach(function (op) {
      var elOpcion = doc.createElement('option');
      elOpcion.setAttribute('value', op.valor);
      elOpcion.textContent = op.texto;
      if (op.seleccionada) {
        elOpcion.setAttribute('selected', 'selected');
        valorSeleccionado = op.valor;
      }
      selector.appendChild(elOpcion);
    });
    selector.value = valorSeleccionado;
  }

  function initUI(doc) {
    doc = doc || G.document;
    if (!doc || typeof doc.getElementById !== 'function') { return null; }
    var badge = doc.getElementById('hz-modo-datos');
    var boton = doc.getElementById('hz-btn-modo');
    if (!badge || !boton) { return null; }
    refsUI.badge = badge;
    refsUI.boton = boton;
    refsUI.doc = doc;
    // Selector opcional: tolera un shell.html todavía sin #hz-cliente-selector
    // (re-ensamblaje pendiente de otra tarea en curso).
    refsUI.selector = (typeof doc.getElementById === 'function') ? doc.getElementById('hz-cliente-selector') : null;
    sincronizarUIModo();

    boton.addEventListener('click', function () {
      // R10 (S-02): bloqueado() manda sobre cualquier otro estado -- el
      // botón despacha el desbloqueo EN VEZ de activarReal (no hay real
      // anónimo que recuperar: los datos siguen ilegibles).
      if (bloqueadoActual) {
        despacharDesbloqueoSolicitado();
        return;
      }
      if (modo() === 'real') {
        volverADemo();
      } else {
        // MC-03: sin clientes guardados, activarReal() despacha el alta en
        // vez de crear un real anónimo; con clientes, recupera el activo
        // conocido. sincronizarUIModo() ya corre dentro de esas rutas.
        activarReal();
      }
    });

    if (refsUI.selector) {
      reconstruirSelectorCliente();
      refsUI.selector.addEventListener('change', function (ev) {
        var valor = (ev && ev.target) ? ev.target.value : refsUI.selector.value;
        if (!valor) { return; }
        if (valor === VALOR_BLOQUEADO_SELECTOR) {
          // R10 (S-02): elegir "Mis datos (con contraseña)…" restaura la
          // selección Demo (el estado real no cambió: sigue bloqueado) y
          // despacha el mismo evento que el botón.
          reconstruirSelectorCliente();
          despacharDesbloqueoSolicitado();
          return;
        }
        if (valor === VALOR_NUEVO_SELECTOR) {
          // Restaura la selección anterior (el estado real no cambió) y
          // delega el alta a la vista Perfil.
          reconstruirSelectorCliente();
          despacharClienteNuevoSolicitado();
          return;
        }
        if (valor === VALOR_DEMO_SELECTOR) {
          volverADemo();
          return;
        }
        seleccionarCliente(valor);
      });
      if (!eventosGlobalesCableados) {
        eventosGlobalesCableados = true;
        G.addEventListener('herzon:clientes-actualizados', function () { reconstruirSelectorCliente(); });
        G.addEventListener('herzon:cliente-cambiado', function () { reconstruirSelectorCliente(); });
      }
    }

    return { sincronizar: sincronizarUIModo };
  }

  // -----------------------------------------------------------------------
  // Publicación.
  // -----------------------------------------------------------------------
  G.Herzon.Almacen = {
    modo: modo,
    cargar: cargar,
    activarReal: activarReal,
    volverADemo: volverADemo,
    // R10 (T-058): re-bloqueo explícito, distinto de volverADemo() (ver
    // comentario junto a la definición).
    bloquearYVolverADemo: bloquearYVolverADemo,
    actualizarPerfil: actualizarPerfil,
    agregarMedicion: agregarMedicion,
    mergeMediciones: mergeMediciones,
    borrarTodo: borrarTodo,
    initUI: initUI,
    clientes: clientes,
    crearCliente: crearCliente,
    seleccionarCliente: seleccionarCliente,
    renombrarCliente: renombrarCliente,
    eliminarCliente: eliminarCliente,
    clienteActivo: clienteActivo,
    guardarPlan: guardarPlan,
    // R10 (Adendum R10, T-052): API aditiva -- ninguna firma previa cambia.
    guardarRutina: guardarRutina,
    actualizarConfig: actualizarConfig,
    exportarRespaldo: exportarRespaldo,
    restaurarRespaldo: restaurarRespaldo,
    bloqueado: bloqueado,
    desbloquearYMontar: desbloquearYMontar
  };

  // cargar() síncrono en cuanto este módulo se define (Adendum R8 punto 6):
  // T-042 garantiza que build/almacen.js se inyecta DESPUÉS de data.js y
  // ANTES de charts/vistas, así que G.HERZON_DATA ya refleja el modo
  // correcto antes de que cualquier vista monte y lo lea.
  cargar();

  // Cableado del botón/badge/selector: diferido a DOMContentLoaded igual
  // que build/documentos.js (mismo riesgo: el header podría no existir aún
  // cuando este script corre a mitad del <body>). `G.document` es siempre
  // undefined bajo el selfcheck de node, así que este bloque nunca corre
  // ahí -- el selfcheck llama Herzon.Almacen.initUI(doc) directo con un
  // documento de prueba.
  if (G.document && typeof G.document.getElementById === 'function') {
    if (G.document.readyState === 'loading' && typeof G.document.addEventListener === 'function') {
      G.document.addEventListener('DOMContentLoaded', function () { initUI(); });
    } else {
      initUI();
    }
  }
})();
