// build/vista_metricas.js
// U-VISTAS-B (T-005): vistas Resumen, Perfil y Seguimiento del prototipo Rinde.
// Namespaces (plan.md 3.B, disjuntos): SOLO window.Herzon.Views.resumen, .perfil y
// .seguimiento. NO toca .plan ni .suplementos (dueño build/vista_dieta_supl.js).
// Consume Herzon.Charts.* (T-003/T-043, API congelada + opciones aditivas R9) y
// HERZON_DATA (T-001, forma congelada en plan.md 3.I; claves aditivas de
// build/almacen.js: paciente.actividad, HERZON_DATA.planAplicado).
//
// R8 (T-039/T-040) + R9 (T-045/T-040, Adendum R9): esta vista también lee
// window.Herzon.Almacen (opcional -- puede no existir, o el shell puede no
// haberlo inyectado aún) para: (a) decidir modo demo/real, (b) estados vacíos
// en modo real sin datos, (c) montar el formulario de captura de mediciones
// (#captura-mediciones, solo modo real), (d) edición de perfil y alta/baja de
// cliente en la vista Perfil, y (e) re-renderizar TODO lo montado cuando
// Almacen emite `herzon:modo-cambiado` (semántica de REMONTAJE: demo<->real Y
// cliente<->cliente, Adendum R9 punto 3). Esta vista NUNCA escribe en
// localStorage directamente: toda persistencia pasa por Herzon.Almacen.
//
// Preámbulo obligatorio (plan.md 3.A): script clásico, IIFE, sin import/export,
// idempotente. Prohibido tocar `document` en el nivel superior del módulo: todo
// acceso al DOM ocurre dentro de las funciones de montaje, usando
// `rootEl.ownerDocument`.
//
// Color (contrato sección H): cero hexes literales en este módulo. Las gráficas
// asignan su propio color vía Herzon.Charts (que internamente usa
// el.style.fill / el.style.stroke con var(--token)); este módulo solo PASA
// nombres de token como string en las opciones de Herzon.Charts.*. Los estilos
// puntuales que este módulo escribe directo con `element.style` son: (a) un
// token de color (p.ej. borde de validación con var(--delta-bad), mismo patrón
// T-029 de build/vista_dieta_supl.js), (b) valores tipográficos sin color
// (font-weight, font-variant-numeric) para jerarquía de texto, o (c) reparto
// interno de puro layout (display/flex-direction/gap) para agrupaciones que no
// tienen una clase congelada propia -- mismo patrón ya usado en
// build/vista_dieta_supl.js (`envoltura.style.display = 'inline-flex'`) y en
// build/charts.js; jamás un hex y jamás una etiqueta de hoja de estilos HTML
// propia.
(function () {
  var G = (typeof window !== 'undefined') ? window : globalThis;
  G.Herzon = G.Herzon || {};
  G.Herzon.Views = G.Herzon.Views || {};

  // -----------------------------------------------------------------------
  // Textos exactos (Adendum R8 punto 4/5, Adendum R9 punto 6, hallazgos
  // DV-06/LY-01/LY-02/PR-04/MC-04/MC-06): centralizados para que un solo
  // cambio de literal quede en un único lugar del archivo.
  // -----------------------------------------------------------------------
  var TEXTO_VACIO = 'Sin datos aún — registra tu primera medición';
  var NOTA_PRIVACIDAD_CAPTURA = 'Tus datos se guardan solo en este dispositivo.';
  var NOTA_PRIVACIDAD_ALTA = 'Los datos de cada cliente se guardan solo en este dispositivo.';
  var TITULO_ALTA = 'Nuevo cliente';
  var TITULO_NOTA_DEMO = 'Acerca del modo demo';
  var TEXTO_BOTON_ELIMINAR_NORMAL = 'Eliminar este cliente';
  var MS_REVERSION_CONFIRMAR = 6000;

  // -----------------------------------------------------------------------
  // R10 (S-02/S-03/S-04, F-04/S-05): textos EXACTOS pinneados por
  // .harness/justesse-r10-diseno.md sección 2.3 (C-10) -- forma canónica,
  // con acentos, que fijan los selfchecks. El resto de esta lista completa
  // los textos que la sección 2.3 deja a criterio del implementador (sin
  // debilitar ni contradecir el contrato).
  // -----------------------------------------------------------------------
  var TITULO_DESBLOQUEO = 'Tus datos están protegidos';
  var CUERPO_DESBLOQUEO = 'La información de tus clientes está cifrada en este dispositivo. Escribe tu contraseña para desbloquearla.';
  var TEXTO_BOTON_DESBLOQUEAR = 'Desbloquear';
  var TEXTO_BOTON_DESBLOQUEANDO = 'Descifrando…';
  var MSG_DESBLOQUEO_INCORRECTO = 'Contraseña incorrecta. Vuelve a intentarlo.';
  var TEXTO_PIE_RECUPERACION = 'Si olvidaste tu contraseña, no es posible recuperarla. Puedes restaurar un respaldo o borrar todos los datos para empezar de cero.';
  var TEXTO_BOTON_BORRAR_TODO = 'Borrar todos los datos';

  var TITULO_SEGURIDAD = 'Seguridad y respaldo';
  var NOTA_AMBITO_SEGURIDAD = 'La contraseña protege todos los clientes guardados en este dispositivo. Los datos se cifran aquí mismo: nadie puede recuperarlos sin la contraseña, ni siquiera tú.';
  var NOTA_RESPALDO_PREVIO = 'Antes de activar, descarga un respaldo. Si olvidas la contraseña, será tu única forma de recuperar los datos.';
  var TEXTO_BOTON_RESPALDO = 'Descargar respaldo (.json)';
  var LABEL_PASS_1 = 'Contraseña (mínimo 8 caracteres)';
  var LABEL_PASS_2 = 'Repite la contraseña';
  var LABEL_CONFIRMO = 'Entiendo que si olvido la contraseña mis datos no se pueden recuperar';
  var TEXTO_BOTON_ACTIVAR = 'Activar protección';
  var TEXTO_BOTON_CIFRANDO = 'Cifrando…';
  var MSG_ACTIVADA = 'Protección activada. Tus datos quedaron cifrados en este dispositivo.';
  var TEXTO_ESTADO_PROTEGIDA = 'Protección activada';
  var TEXTO_BOTON_BLOQUEAR = 'Bloquear ahora';
  var LABEL_PASS_ACTUAL = 'Contraseña actual';
  var LABEL_PASS_NUEVA_1 = 'Contraseña nueva (mínimo 8 caracteres)';
  var LABEL_PASS_NUEVA_2 = 'Repite la contraseña nueva';
  var TEXTO_BOTON_CAMBIAR = 'Cambiar contraseña';
  // P-5 (R12): "Quitar protección" se elimina de la UI -- Seguridad.desactivar
  // (build/seguridad.js, INTOCABLE) queda intacta en la API, sin punto de
  // entrada desde esta vista.

  var NOTA_RESPALDO_CUSTODIA = 'El respaldo se descarga SIN cifrar. Incluye a todos los clientes: guárdalo en un lugar seguro.';
  var LABEL_IMPORTAR_RESPALDO = 'Restaurar respaldo (.json)';
  var TEXTO_BOTON_RESPALDAR_ANTES = 'Descargar respaldo de lo actual antes de continuar';
  var TEXTO_BOTON_RESTAURAR_CONFIRMAR = 'Reemplazar todo y restaurar';
  var MSG_RESPALDO_INVALIDO = 'El archivo no es un respaldo válido de Rinde.';
  var TEXTO_EXTRA_RESTAURAR_BLOQUEADO = 'Esto reemplaza los datos cifrados de este dispositivo y desactiva la contraseña actual. Podrás activar una nueva después.';

  var LABEL_LABS_OCULTOS = 'Este cliente no se realiza laboratorios';
  var NOTA_LABS_OCULTOS = 'Ocultar no borra los resultados ya capturados.';
  var MENSAJE_EXITO_PERFIL = 'Cambios guardados.';

  var OPCIONES_SEXO = [
    { valor: '', etiqueta: 'Selecciona' },
    { valor: 'femenino', etiqueta: 'Femenino' },
    { valor: 'masculino', etiqueta: 'Masculino' }
  ];

  var ETIQUETAS_ACTIVIDAD = {
    sedentario: 'Sedentario (poco o nada de ejercicio)',
    ligero: 'Actividad ligera (1 a 3 días por semana)',
    moderado: 'Actividad moderada (3 a 5 días por semana)',
    intenso: 'Actividad intensa (6 a 7 días por semana)'
  };

  // DV-04: cortes fijos del catálogo clínico (Basal/Seguimiento/Final,
  // build/data.js) -- solo "Seguimiento" se acorta a "Seg." para que las 3
  // etiquetas quepan horizontales sin rotar; Basal y Final ya caben.
  var MAPA_CORTES_CORTOS = { Basal: 'Basal', Seguimiento: 'Seg.', Final: 'Final' };

  // -----------------------------------------------------------------------
  // Utilidades puras (sin DOM)
  // -----------------------------------------------------------------------
  function redondear(v, decimales) {
    var f = Math.pow(10, decimales || 0);
    return Math.round(v * f) / f;
  }

  function formatoNumero(v, decimales) {
    if (typeof v !== 'number' || isNaN(v)) { return ''; }
    return String(redondear(v, decimales));
  }

  // Como formatoNumero, pero con un texto de respaldo cuando el valor no es
  // un número válido (perfil incompleto de un cliente recién creado, R9
  // multi-cliente): nunca imprime "null"/"undefined" en el DOM.
  function formatoOTexto(v, decimales, sufijo, textoVacio) {
    if (typeof v !== 'number' || isNaN(v)) { return textoVacio || '—'; }
    return formatoNumero(v, decimales) + (sufijo || '');
  }

  function conSigno(v, decimales) {
    var r = redondear(v, decimales);
    return (r > 0 ? '+' : '') + formatoNumero(r, decimales);
  }

  function promedio(lista) {
    if (!lista || !lista.length) { return 0; }
    var total = 0;
    for (var i = 0; i < lista.length; i++) { total += lista[i]; }
    return total / lista.length;
  }

  function ultimasN(arr, n) {
    arr = arr || [];
    var cantidad = Math.min(n, arr.length);
    return arr.slice(Math.max(arr.length - cantidad, 0));
  }

  function acortarCorte(etiqueta) {
    return Object.prototype.hasOwnProperty.call(MAPA_CORTES_CORTOS, etiqueta) ? MAPA_CORTES_CORTOS[etiqueta] : etiqueta;
  }

  function fechaHoyTexto() {
    var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
      'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    var d = new Date();
    return d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
  }

  function opcionesActividad(factoresActividad) {
    var opciones = [{ valor: '', etiqueta: 'Selecciona' }];
    Object.keys(factoresActividad || {}).forEach(function (clave) {
      opciones.push({ valor: clave, etiqueta: ETIQUETAS_ACTIVIDAD[clave] || clave });
    });
    return opciones;
  }

  // Semáforo de laboratorios (contrato sección 2): estatus reservado SOLO para
  // marcadores clínicos, jamás usado como serie. `mejorSi` indica la dirección en
  // la que el marcador debe moverse para mejorar; este prototipo solo penaliza el
  // sentido CONTRARIO a esa mejora (p.ej. HDL con mejorSi "mayor" no se penaliza
  // por estar por encima del máximo de referencia).
  var ETIQUETAS_ESTADO = { good: 'En rango', warning: 'Vigilancia', serious: 'Fuera de rango', critical: 'Crítico' };

  function calcularEstadoMarcador(valor, referencia, mejorSi) {
    var min = (referencia && typeof referencia.min === 'number') ? referencia.min : 0;
    var max = (referencia && typeof referencia.max === 'number') ? referencia.max : 0;
    var rango = (max - min) || 1;
    var distancia = 0;
    if (mejorSi === 'mayor') {
      if (valor < min) { distancia = min - valor; }
    } else {
      if (valor > max) { distancia = valor - max; }
    }
    if (distancia <= 0) { return 'good'; }
    var proporcion = distancia / rango;
    if (proporcion <= 0.15) { return 'warning'; }
    if (proporcion <= 0.40) { return 'serious'; }
    return 'critical';
  }

  // -----------------------------------------------------------------------
  // Acceso a Herzon.Almacen (R8/R9): SIEMPRE opcional/defensivo -- el shell
  // puede montar esta vista antes de que almacen.js exista (orden de
  // inyección) o el selfcheck de node puede no montarlo en absoluto (queda
  // en el comportamiento "demo" de antes de R8, sin vacíos ni captura).
  // -----------------------------------------------------------------------
  function obtenerAlmacen() {
    return (G.Herzon && G.Herzon.Almacen) ? G.Herzon.Almacen : null;
  }

  function esModoReal(Almacen) {
    return !!(Almacen && typeof Almacen.modo === 'function' && Almacen.modo() === 'real');
  }

  // -----------------------------------------------------------------------
  // Utilidades de DOM (usadas solo dentro de las funciones de montaje)
  // -----------------------------------------------------------------------
  function crear(doc, tag, clases, texto) {
    var elemento = doc.createElement(tag);
    if (clases) {
      for (var i = 0; i < clases.length; i++) { elemento.classList.add(clases[i]); }
    }
    if (texto != null) { elemento.textContent = texto; }
    return elemento;
  }

  function limpiar(elemento) {
    while (elemento.childNodes && elemento.childNodes.length) {
      elemento.removeChild(elemento.childNodes[0]);
    }
  }

  function limpiarNodo(nodo) {
    if (nodo && nodo.parentNode) { nodo.parentNode.removeChild(nodo); }
  }

  // Busca un descendiente (o el propio nodo) por atributo id, sin depender de
  // querySelector/getElementById: build/testdom.js no los implementa (solo
  // expone consultarTodo/consultarUno por tag o por clase) -- mismo patrón
  // que buscarHijoPorId en build/vista_dieta_supl.js.
  function buscarHijoPorId(raizEl, id) {
    if (raizEl.getAttribute && raizEl.getAttribute('id') === id) { return raizEl; }
    var hijos = raizEl.children || [];
    for (var i = 0; i < hijos.length; i++) {
      var encontrado = buscarHijoPorId(hijos[i], id);
      if (encontrado) { return encontrado; }
    }
    return null;
  }

  function crearVacio(doc, contenedorEl, texto) {
    var nota = crear(doc, 'div', ['hz-vacio'], texto || TEXTO_VACIO);
    contenedorEl.appendChild(nota);
    return nota;
  }

  function crearCampoInput(doc, contenedorEl, idCampo, etiquetaTexto, tipo, valorInicial, atributosExtra) {
    var campo = crear(doc, 'div', ['hz-form-campo']);
    var etiqueta = crear(doc, 'label', null, etiquetaTexto);
    etiqueta.setAttribute('for', idCampo);
    var input = crear(doc, 'input');
    input.setAttribute('id', idCampo);
    input.setAttribute('type', tipo);
    if (atributosExtra) {
      for (var clave in atributosExtra) {
        if (Object.prototype.hasOwnProperty.call(atributosExtra, clave)) {
          input.setAttribute(clave, String(atributosExtra[clave]));
        }
      }
    }
    input.value = valorInicial != null ? valorInicial : '';
    campo.appendChild(etiqueta);
    campo.appendChild(input);
    contenedorEl.appendChild(campo);
    return { campo: campo, input: input };
  }

  function crearCampoSelect(doc, contenedorEl, idCampo, etiquetaTexto, opciones) {
    var campo = crear(doc, 'div', ['hz-form-campo']);
    var etiqueta = crear(doc, 'label', null, etiquetaTexto);
    etiqueta.setAttribute('for', idCampo);
    var select = crear(doc, 'select');
    select.setAttribute('id', idCampo);
    for (var i = 0; i < opciones.length; i++) {
      var opcion = crear(doc, 'option', null, opciones[i].etiqueta);
      opcion.setAttribute('value', opciones[i].valor);
      select.appendChild(opcion);
    }
    campo.appendChild(etiqueta);
    campo.appendChild(select);
    contenedorEl.appendChild(campo);
    return { campo: campo, select: select };
  }

  // S-05/S-03: checkbox de una fila (mismo patrón que crearCampoInput/
  // crearCampoSelect de arriba, pero con type=checkbox e input.checked en
  // vez de input.value).
  function crearCampoCheckbox(doc, contenedorEl, idCampo, etiquetaTexto, checkedInicial) {
    var campo = crear(doc, 'div', ['hz-form-campo', 'hz-form-check', 'hz-form-ancho']);
    var input = crear(doc, 'input');
    input.setAttribute('id', idCampo);
    input.setAttribute('type', 'checkbox');
    input.checked = !!checkedInicial;
    var etiqueta = crear(doc, 'label', null, etiquetaTexto);
    etiqueta.setAttribute('for', idCampo);
    campo.appendChild(input);
    campo.appendChild(etiqueta);
    contenedorEl.appendChild(campo);
    return { campo: campo, input: input };
  }

  // S-04: lectura de archivo local para restaurar un respaldo. Mismo patrón
  // que `leerArchivoComoTexto` de build/documentos.js (COPIADO, no
  // importado -- C-7, documentos.js no se toca en R10): aislado en su
  // propia función para que el selfcheck pueda ejercitar el resto del
  // flujo con un stub mínimo de FileReader, sin depender de un navegador.
  function leerArchivoComoTextoLocal(archivo, callback) {
    if (typeof FileReader === 'undefined') {
      callback(null, 'este navegador no soporta FileReader');
      return;
    }
    var lector = new FileReader();
    lector.onerror = function () { callback(null, 'error de lectura del archivo'); };
    lector.onload = function () { callback(String(lector.result || ''), null); };
    lector.readAsText(archivo);
  }

  function limpiarBordesValidacion(campos) {
    campos.forEach(function (c) {
      c.input.style.borderColor = '';
      c.input.removeAttribute('aria-invalid');
    });
  }

  function marcarBordeInvalido(campo) {
    campo.input.style.borderColor = 'var(--delta-bad)';
    campo.input.setAttribute('aria-invalid', 'true');
  }

  // -----------------------------------------------------------------------
  // R12 (H-02, contrato normativo de la ronda 12): helper genérico de
  // diálogos modales -- crearDialogo(id, opciones) construye (una sola vez
  // por id, singleton a nivel de módulo) un <dialog class="hz-dialogo">
  // colgado de document.body (o del rootEl de Perfil conocido, en TestDOM
  // sin document.body -- mismo patrón R11 que #hz-dialogo-alta) con una
  // card.hz-card.hz-form-card como único hijo directo. Los diálogos H-03..
  // H-06 se construyen sobre este helper; #hz-dialogo-alta (R11) se migra
  // a él sin cambiar ids ni comportamiento.
  // -----------------------------------------------------------------------
  var dialogosPorId = {};
  var rootPerfilConocido = null;
  // R12 (H-05/H-06): siempre el render() del montaje VIGENTE de Vista
  // Perfil (o null si Perfil nunca se ha montado) -- permite que los
  // diálogos H-04/H-05, construidos a nivel de módulo (fuera de
  // mountPerfil), pidan un repintado de Perfil tras cerrar con éxito.
  var renderPerfilActual = null;
  // R12 (H-05): mensaje de éxito de "Guardar cambios" -- patrón
  // consumo-único (F-04.5 original): el diálogo lo fija ANTES de cerrar;
  // el siguiente render() de Perfil lo consume una sola vez.
  var mensajeExitoPerfil = '';
  // R12 (H-06): mismo patrón consumo-único, para "Contraseña actualizada."
  // dentro de #hz-dialogo-seguridad.
  var mensajeExitoSeguridad = '';

  // D-01: documento REAL con document.body disponible (navegador) -- en
  // TestDOM (selfcheck) `G.document` no existe, así que esto es null y el
  // llamador cae al fallback del rootEl de Perfil conocido.
  function documentoConBody() {
    return (G.document && typeof G.document.createElement === 'function' && G.document.body) ? G.document : null;
  }

  // H-02: primer <input> descendiente (recorrido en profundidad), para que
  // abrir() pueda enfocarlo. Ningún diálogo de este módulo abre con un
  // <select>/<textarea> como su primer control.
  function primerInputDe(nodo) {
    if ((nodo.tagName || '').toUpperCase() === 'INPUT') { return nodo; }
    var hijos = nodo.children || [];
    for (var i = 0; i < hijos.length; i++) {
      var encontrado = primerInputDe(hijos[i]);
      if (encontrado) { return encontrado; }
    }
    return null;
  }

  // H-02: true si el <dialog> está abierto -- .open (propiedad nativa real,
  // reflejo automático del navegador) o el atributo 'open' (fallback
  // TestDOM, donde .open no existe).
  function dialogoEstaAbierto(dialog) {
    return dialog.open === true || dialog.hasAttribute('open');
  }

  // H-02: crearDialogo(id, opciones) -> { dialog, card, abrir(), cerrar() }.
  // Singleton por id (construido UNA sola vez; llamadas siguientes
  // devuelven el mismo registro). En TestDOM (sin document.body) se ancla
  // al rootEl de Perfil VIGENTE -- si el singleton ya existe pero quedó
  // huérfano (limpiar(rootEl) lo desancla en cada render()), se reancla
  // aquí, nunca se reconstruye (mismo patrón R11 de #hz-dialogo-alta).
  // opciones.bloqueante === true: el 'cancel' nativo (Escape) hace
  // preventDefault() -- el diálogo se pinta SIN botón Cancelar/Cerrar
  // (responsabilidad del llamador, que simplemente no lo agrega).
  function crearDialogo(id, opciones) {
    opciones = opciones || {};
    var existente = dialogosPorId[id];
    if (existente) {
      if (!documentoConBody() && rootPerfilConocido && existente.dialog.parentNode !== rootPerfilConocido) {
        rootPerfilConocido.appendChild(existente.dialog);
      }
      return existente;
    }

    var docReal = documentoConBody();
    var doc = docReal || (rootPerfilConocido && rootPerfilConocido.ownerDocument);
    if (!doc) { return null; }

    var dialog = crear(doc, 'dialog', ['hz-dialogo']);
    dialog.setAttribute('id', id);
    var card = crear(doc, 'div', ['hz-card', 'hz-form-card']);
    dialog.appendChild(card);

    if (opciones.bloqueante === true) {
      dialog.addEventListener('cancel', function (ev) {
        if (ev && typeof ev.preventDefault === 'function') { ev.preventDefault(); }
      });
    }

    if (docReal) {
      docReal.body.appendChild(dialog);
    } else if (rootPerfilConocido) {
      rootPerfilConocido.appendChild(dialog);
    }

    function abrir() {
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) { dialog.showModal(); }
      } else {
        dialog.setAttribute('open', '');
      }
      var primerInput = primerInputDe(dialog);
      if (primerInput && typeof primerInput.focus === 'function') { primerInput.focus(); }
    }

    function cerrar() {
      if (typeof dialog.close === 'function') { dialog.close(); }
      else { dialog.removeAttribute('open'); }
    }

    var registro = { dialog: dialog, card: card, abrir: abrir, cerrar: cerrar };
    dialogosPorId[id] = registro;
    return registro;
  }

  // -----------------------------------------------------------------------
  // R10/S-04 (movidos a nivel de módulo en R12: ahora los usan varios
  // diálogos construidos FUERA de mountPerfil): botón de descarga de
  // respaldo y bloque de restauración, compartidos entre #hz-dialogo-
  // desbloqueo y #hz-dialogo-seguridad. Ya no cierran sobre un `Almacen`
  // capturado en el momento del montaje -- lo piden de nuevo en cada
  // manejador (obtenerAlmacen()), porque estos diálogos se construyen UNA
  // sola vez y sobreviven a cualquier remontaje de Vista Perfil.
  // -----------------------------------------------------------------------
  function construirBotonDescargarRespaldo(doc) {
    var boton = crear(doc, 'button', ['hz-btn', 'hz-btn-secundario'], TEXTO_BOTON_RESPALDO);
    boton.setAttribute('type', 'button');
    boton.setAttribute('id', 'hz-btn-seg-respaldo');
    boton.addEventListener('click', function () {
      var Almacen = obtenerAlmacen();
      if (!Almacen || typeof Almacen.exportarRespaldo !== 'function') { return; }
      var res = Almacen.exportarRespaldo();
      if (!res || !res.ok) { return; }
      var Docs = G.Herzon && G.Herzon.Docs;
      if (Docs && typeof Docs.descargarArchivo === 'function') {
        Docs.descargarArchivo(doc, res.json, res.nombreArchivo, 'application/json');
      }
    });
    return boton;
  }

  function construirBloqueRestaurarRespaldo(doc, idLabel, idInput, idBotonConfirmar, textoExtra) {
    var contenedor = crear(doc, 'div', ['hz-doc-import']);
    var label = crear(doc, 'label', ['hz-doc-import-label'], LABEL_IMPORTAR_RESPALDO);
    label.setAttribute('id', idLabel);
    label.setAttribute('for', idInput);
    var input = crear(doc, 'input');
    input.setAttribute('type', 'file');
    input.setAttribute('id', idInput);
    input.setAttribute('accept', '.json,application/json');
    contenedor.appendChild(label);
    contenedor.appendChild(input);

    var zonaConfirmacion = crear(doc, 'div');
    contenedor.appendChild(zonaConfirmacion);

    function manejarObjetoLeido(objeto) {
      limpiar(zonaConfirmacion);
      var Almacen = obtenerAlmacen();
      var formaValida = objeto && typeof objeto === 'object' && objeto.formato === 'rinde-respaldo-1' &&
        objeto.datos && typeof objeto.datos === 'object' && objeto.datos.clientes && typeof objeto.datos.clientes === 'object';
      if (!formaValida) {
        zonaConfirmacion.appendChild(crear(doc, 'p', ['hz-form-error'], MSG_RESPALDO_INVALIDO));
        return;
      }
      var n = (Almacen && typeof Almacen.clientes === 'function') ? Almacen.clientes().length : 0;
      var m = Object.keys(objeto.datos.clientes).length;
      var textoConfirmacion = 'Restaurar este respaldo reemplaza los ' + n + ' clientes actuales de este dispositivo por los ' +
        m + ' clientes del archivo (exportado el ' + (objeto.exportado || '—') + '). Esta acción no se puede deshacer.';
      if (textoExtra) { textoConfirmacion += ' ' + textoExtra; }
      zonaConfirmacion.appendChild(crear(doc, 'p', ['hz-form-error'], textoConfirmacion));

      if (n > 0) {
        var botonRespaldarAntes = crear(doc, 'button', ['hz-btn', 'hz-btn-secundario'], TEXTO_BOTON_RESPALDAR_ANTES);
        botonRespaldarAntes.setAttribute('type', 'button');
        botonRespaldarAntes.addEventListener('click', function () {
          var AlmacenAntes = obtenerAlmacen();
          if (!AlmacenAntes || typeof AlmacenAntes.exportarRespaldo !== 'function') { return; }
          var resExport = AlmacenAntes.exportarRespaldo();
          if (!resExport || !resExport.ok) { return; }
          var Docs = G.Herzon && G.Herzon.Docs;
          if (Docs && typeof Docs.descargarArchivo === 'function') {
            Docs.descargarArchivo(doc, resExport.json, resExport.nombreArchivo, 'application/json');
          }
        });
        zonaConfirmacion.appendChild(botonRespaldarAntes);
      }

      var botonConfirmar = crear(doc, 'button', ['hz-btn', 'hz-btn-peligro'], TEXTO_BOTON_RESTAURAR_CONFIRMAR);
      botonConfirmar.setAttribute('type', 'button');
      botonConfirmar.setAttribute('id', idBotonConfirmar);
      botonConfirmar.setAttribute('data-confirmar', 'false');
      var temporizadorRestaurar = null;
      botonConfirmar.addEventListener('click', function () {
        if (botonConfirmar.getAttribute('data-confirmar') === 'true') {
          var temporizadorClear = (typeof G.clearTimeout === 'function') ? G.clearTimeout : clearTimeout;
          if (temporizadorRestaurar !== null) { temporizadorClear(temporizadorRestaurar); temporizadorRestaurar = null; }
          var AlmacenRestaurar = obtenerAlmacen();
          if (!AlmacenRestaurar || typeof AlmacenRestaurar.restaurarRespaldo !== 'function') { return; }
          var resultado = AlmacenRestaurar.restaurarRespaldo(objeto);
          limpiar(zonaConfirmacion);
          if (!resultado || !resultado.ok) {
            zonaConfirmacion.appendChild(crear(doc, 'p', ['hz-form-error'],
              (resultado && resultado.errores && resultado.errores.length) ? resultado.errores.join(' ') : MSG_RESPALDO_INVALIDO));
            return;
          }
          var notaExitoRestaurar = crear(doc, 'p', ['hz-nota'], 'Respaldo restaurado: ' + resultado.clientes + ' clientes.');
          notaExitoRestaurar.style.color = 'var(--delta-good)';
          zonaConfirmacion.appendChild(notaExitoRestaurar);
          // restaurarRespaldo ya disparó la secuencia de eventos completa
          // (clientes-actualizados -> cliente-cambiado/modo-cambiado): las
          // vistas ya remontaron con los datos nuevos; este bloque de
          // confirmación queda huérfano tras ese remontaje (mismo patrón
          // que cualquier otro submit exitoso de este archivo).
          return;
        }
        botonConfirmar.setAttribute('data-confirmar', 'true');
        var temporizadorFn = (typeof G.setTimeout === 'function') ? G.setTimeout : setTimeout;
        temporizadorRestaurar = temporizadorFn(function () {
          botonConfirmar.setAttribute('data-confirmar', 'false');
          temporizadorRestaurar = null;
        }, MS_REVERSION_CONFIRMAR);
      });
      zonaConfirmacion.appendChild(botonConfirmar);

      var botonCancelar = crear(doc, 'button', ['hz-btn', 'hz-btn-secundario'], 'Cancelar');
      botonCancelar.setAttribute('type', 'button');
      botonCancelar.addEventListener('click', function () {
        limpiar(zonaConfirmacion);
        input.value = '';
      });
      zonaConfirmacion.appendChild(botonCancelar);
    }

    input.addEventListener('change', function (ev) {
      var archivo = (input.files && input.files[0]) || (ev && ev.target && ev.target.files && ev.target.files[0]);
      input.value = '';
      if (!archivo) { return; }
      leerArchivoComoTextoLocal(archivo, function (texto, errorLectura) {
        if (errorLectura || texto == null) {
          limpiar(zonaConfirmacion);
          zonaConfirmacion.appendChild(crear(doc, 'p', ['hz-form-error'], MSG_RESPALDO_INVALIDO));
          return;
        }
        var objetoLeido = null;
        try { objetoLeido = JSON.parse(texto); } catch (e) { objetoLeido = null; }
        manejarObjetoLeido(objetoLeido);
      });
    });

    return contenedor;
  }

  // S-02 (pie de #hz-dialogo-desbloqueo): "Borrar todos los datos" ->
  // Almacen.borrarTodo(), confirmación en dos pasos (patrón 6s R9).
  function montarBotonBorrarTodo(doc) {
    var contenedor = crear(doc, 'div');
    var boton = crear(doc, 'button', ['hz-btn', 'hz-btn-peligro'], TEXTO_BOTON_BORRAR_TODO);
    boton.setAttribute('type', 'button');
    boton.setAttribute('id', 'hz-btn-desbloqueo-borrar-todo');
    boton.setAttribute('data-confirmar', 'false');
    var temporizadorBorrar = null;
    boton.addEventListener('click', function () {
      if (boton.getAttribute('data-confirmar') === 'true') {
        var temporizadorClear = (typeof G.clearTimeout === 'function') ? G.clearTimeout : clearTimeout;
        if (temporizadorBorrar !== null) { temporizadorClear(temporizadorBorrar); temporizadorBorrar = null; }
        var Almacen = obtenerAlmacen();
        if (Almacen && typeof Almacen.borrarTodo === 'function') { Almacen.borrarTodo(); }
        return;
      }
      boton.setAttribute('data-confirmar', 'true');
      var temporizadorFn = (typeof G.setTimeout === 'function') ? G.setTimeout : setTimeout;
      temporizadorBorrar = temporizadorFn(function () {
        boton.setAttribute('data-confirmar', 'false');
        temporizadorBorrar = null;
      }, MS_REVERSION_CONFIRMAR);
    });
    contenedor.appendChild(boton);
    return contenedor;
  }

  // -----------------------------------------------------------------------
  // H-02 + R11 (D-01/D-02/D-03/D-06): #hz-dialogo-alta migrado al helper
  // crearDialogo -- MISMOS ids y MISMO comportamiento que antes (D-01..D-06
  // siguen aplicando literalmente). Se construye UNA sola vez, no
  // bloqueante (Cancelar SIEMPRE presente, D-03).
  // -----------------------------------------------------------------------
  function construirContenidoAlta(registro) {
    var doc = registro.dialog.ownerDocument;
    var card = registro.card;
    card.setAttribute('id', 'hz-card-alta-cliente');
    card.appendChild(crear(doc, 'h3', ['hz-card-title'], TITULO_ALTA));
    card.appendChild(crear(doc, 'p', ['hz-nota'], NOTA_PRIVACIDAD_ALTA));

    var form = crear(doc, 'form', ['hz-form', 'hz-form-columnas']);
    form.setAttribute('id', 'hz-form-alta-cliente');

    var campoNombre = crearCampoInput(doc, form, 'hz-alta-nombre', 'Nombre', 'text', '');
    campoNombre.campo.classList.add('hz-form-ancho');
    var campoSexo = crearCampoSelect(doc, form, 'hz-alta-sexo', 'Sexo', OPCIONES_SEXO);
    var campoEdad = crearCampoInput(doc, form, 'hz-alta-edad', 'Edad (años)', 'number', '', { min: 1, max: 120, step: 1 });
    var campoTalla = crearCampoInput(doc, form, 'hz-alta-talla', 'Talla (cm)', 'number', '', { min: 50, max: 250, step: 1 });
    var campoPeso = crearCampoInput(doc, form, 'hz-alta-peso', 'Peso (kg)', 'number', '', { min: 20, max: 400, step: 0.1 });
    var campoActividad = crearCampoSelect(doc, form, 'hz-alta-actividad', 'Nivel de actividad',
      opcionesActividad((G.HERZON_DATA || {}).factoresActividad));
    var campoObjetivo = crearCampoInput(doc, form, 'hz-alta-objetivo', 'Objetivo', 'text', '');

    var errorEl = crear(doc, 'p', ['hz-form-error', 'hz-form-ancho']);
    errorEl.setAttribute('id', 'hz-alta-error');
    errorEl.style.color = 'var(--delta-bad)';
    form.appendChild(errorEl);

    var acciones = crear(doc, 'div', ['hz-form-acciones', 'hz-form-ancho']);
    var botonCrear = crear(doc, 'button', ['hz-btn', 'hz-btn-primario'], 'Crear cliente');
    botonCrear.setAttribute('type', 'submit');
    botonCrear.setAttribute('id', 'hz-btn-crear-cliente');
    acciones.appendChild(botonCrear);

    // D-03: en el diálogo modal, Cancelar SIEMPRE está presente (ya no
    // depende de clientesCount/enReal: el diálogo mismo es la vía de
    // "salir sin guardar" en cualquier escenario, demo o real).
    var botonCancelar = crear(doc, 'button', ['hz-btn', 'hz-btn-secundario'], 'Cancelar');
    botonCancelar.setAttribute('type', 'button');
    botonCancelar.setAttribute('id', 'hz-btn-cancelar-alta');
    botonCancelar.addEventListener('click', function (ev) {
      if (ev && typeof ev.preventDefault === 'function') { ev.preventDefault(); }
      cerrarDialogoAlta();
    });
    acciones.appendChild(botonCancelar);
    form.appendChild(acciones);

    function limpiarCamposAlta() {
      campoNombre.input.value = '';
      campoNombre.input.removeAttribute('aria-invalid');
      campoSexo.select.value = '';
      campoEdad.input.value = '';
      campoTalla.input.value = '';
      campoPeso.input.value = '';
      campoActividad.select.value = '';
      campoObjetivo.input.value = '';
      errorEl.textContent = '';
    }

    // D-03: Cancelar, Escape (evento 'close' nativo del <dialog>) y crear
    // cliente con éxito cierran el diálogo Y limpian campos/error.
    function cerrarDialogoAlta() {
      limpiarCamposAlta();
      registro.cerrar();
    }
    registro.dialog.addEventListener('close', limpiarCamposAlta);

    form.addEventListener('submit', function (ev) {
      if (ev && typeof ev.preventDefault === 'function') { ev.preventDefault(); }
      errorEl.textContent = '';
      // C-6: código nuevo/refactorizado usa SOLO aria-invalid + la regla
      // CSS F-01.6, sin inline borderColor.
      campoNombre.input.removeAttribute('aria-invalid');
      var Almacen = obtenerAlmacen();
      if (!Almacen || typeof Almacen.crearCliente !== 'function') {
        errorEl.textContent = 'No se puede crear un cliente en este momento.';
        return;
      }
      var perfilObj = {
        nombre: campoNombre.input.value,
        sexo: campoSexo.select.value,
        edad: parseFloat(campoEdad.input.value),
        talla_cm: parseFloat(campoTalla.input.value),
        pesoInicial_kg: parseFloat(campoPeso.input.value),
        actividad: campoActividad.select.value,
        objetivo: campoObjetivo.input.value
      };
      ['edad', 'talla_cm', 'pesoInicial_kg'].forEach(function (clave) {
        if (isNaN(perfilObj[clave])) { perfilObj[clave] = undefined; }
      });
      var res = Almacen.crearCliente(perfilObj);
      if (!res || !res.ok) {
        campoNombre.input.setAttribute('aria-invalid', 'true');
        errorEl.textContent = (res && res.errores && res.errores.length) ? res.errores.join(' ') : 'No se pudo crear el cliente.';
        return;
      }
      // Éxito: crearCliente ya disparó herzon:modo-cambiado de forma
      // SÍNCRONA (Adendum R9 punto 3) -- las vistas ya remontaron con el
      // nuevo cliente montado. El diálogo cierra y se limpia (D-03).
      cerrarDialogoAlta();
    });

    card.appendChild(form);
  }

  // D-01: crea el diálogo la PRIMERA vez que se necesita (vía crearDialogo,
  // singleton por id); llamadas siguientes devuelven el mismo registro sin
  // volver a construir el contenido (guardado por card.children.length).
  function obtenerDialogoAlta() {
    var registro = crearDialogo('hz-dialogo-alta', { bloqueante: false });
    if (!registro) { return null; }
    if (registro.card.children.length === 0) { construirContenidoAlta(registro); }
    return registro;
  }

  // D-02/D-06: abre el diálogo (showModal si existe; fallback
  // setAttribute('open','') en TestDOM) y enfoca #hz-alta-nombre (vía
  // registro.abrir(), H-02). Idempotente (guarda dialog.open dentro de
  // abrir()): puede recibir la misma solicitud desde el listener de nivel
  // de módulo Y desde el listener interno de mountPerfil sin lanzar
  // InvalidStateError por un showModal() duplicado.
  function abrirDialogoAlta() {
    var Almacen = obtenerAlmacen();
    // D-06: bloqueado === true -> el diálogo NO se abre.
    if (Almacen && typeof Almacen.bloqueado === 'function' && Almacen.bloqueado()) { return; }
    var registro = obtenerDialogoAlta();
    if (!registro) { return; }
    registro.abrir();
  }

  // -----------------------------------------------------------------------
  // H-03: #hz-dialogo-desbloqueo (reemplaza a la antigua #hz-card-
  // desbloqueo inline, S-02). Se construye UNA sola vez; no bloqueante
  // (Escape y "Seguir en demo" cierran). Se abre: (a) al cargar si
  // Almacen.bloqueado()===true (P-4, ver arranque más abajo), (b) con
  // herzon:desbloqueo-solicitado, (c) con #hz-btn-abrir-desbloqueo (H-07,
  // #hz-card-bloqueado). Éxito de desbloqueo: cierra.
  // -----------------------------------------------------------------------
  function construirContenidoDesbloqueo(registro) {
    var doc = registro.dialog.ownerDocument;
    var card = registro.card;
    card.appendChild(crear(doc, 'h3', ['hz-card-title'], TITULO_DESBLOQUEO));
    card.appendChild(crear(doc, 'p', null, CUERPO_DESBLOQUEO));

    var form = crear(doc, 'form', ['hz-form']);
    var campoPass = crearCampoInput(doc, form, 'hz-desbloqueo-pass', 'Contraseña', 'password', '',
      { autocomplete: 'current-password' });

    var errorEl = crear(doc, 'p', ['hz-form-error']);
    errorEl.setAttribute('id', 'hz-desbloqueo-error');
    form.appendChild(errorEl);

    var acciones = crear(doc, 'div', ['hz-form-acciones']);
    var botonDesbloquear = crear(doc, 'button', ['hz-btn', 'hz-btn-primario'], TEXTO_BOTON_DESBLOQUEAR);
    botonDesbloquear.setAttribute('type', 'submit');
    botonDesbloquear.setAttribute('id', 'hz-btn-desbloquear');
    acciones.appendChild(botonDesbloquear);
    // H-03: "Seguir en demo" (secundario) -- cierra el diálogo sin
    // desbloquear, para poder seguir viendo el demo.
    var botonSeguirDemo = crear(doc, 'button', ['hz-btn', 'hz-btn-secundario'], 'Seguir en demo');
    botonSeguirDemo.setAttribute('type', 'button');
    botonSeguirDemo.setAttribute('id', 'hz-btn-desbloqueo-seguir-demo');
    botonSeguirDemo.addEventListener('click', function () { registro.cerrar(); });
    acciones.appendChild(botonSeguirDemo);
    form.appendChild(acciones);

    form.addEventListener('submit', function (ev) {
      if (ev && typeof ev.preventDefault === 'function') { ev.preventDefault(); }
      errorEl.textContent = '';
      var Almacen = obtenerAlmacen();
      if (!Almacen || typeof Almacen.desbloquearYMontar !== 'function') {
        errorEl.textContent = MSG_DESBLOQUEO_INCORRECTO;
        return;
      }
      // S-02: estado ocupado obligatorio -- sin doble submit, sin ocultar
      // progreso.
      botonDesbloquear.setAttribute('disabled', 'disabled');
      botonDesbloquear.textContent = TEXTO_BOTON_DESBLOQUEANDO;
      campoPass.input.setAttribute('disabled', 'disabled');
      Almacen.desbloquearYMontar(campoPass.input.value).then(function (res) {
        if (!res || !res.ok) {
          botonDesbloquear.removeAttribute('disabled');
          botonDesbloquear.textContent = TEXTO_BOTON_DESBLOQUEAR;
          campoPass.input.removeAttribute('disabled');
          campoPass.input.value = '';
          errorEl.textContent = (res && res.error) || MSG_DESBLOQUEO_INCORRECTO;
          return;
        }
        // Éxito: desbloquearYMontar ya disparó clientes-actualizados ->
        // cliente-cambiado -> modo-cambiado de forma SÍNCRONA (S-02) --
        // las vistas montadas ya remontaron con bloqueado()===false. El
        // diálogo cierra (H-03).
        registro.cerrar();
      });
    });

    card.appendChild(form);

    // Pie .hz-dialogo-pie (H-03/S-04): disponible incluso bloqueado -- las
    // DOS salidas del contrato: restaurar un respaldo o borrar todos los
    // datos.
    var pie = crear(doc, 'div', ['hz-dialogo-pie']);
    pie.appendChild(crear(doc, 'p', ['hz-nota'], TEXTO_PIE_RECUPERACION));
    pie.appendChild(construirBloqueRestaurarRespaldo(doc,
      'hz-desbloqueo-import-label', 'hz-desbloqueo-input-restaurar',
      'hz-btn-desbloqueo-restaurar-confirmar', TEXTO_EXTRA_RESTAURAR_BLOQUEADO));
    pie.appendChild(montarBotonBorrarTodo(doc));
    card.appendChild(pie);
  }

  function obtenerDialogoDesbloqueo() {
    var registro = crearDialogo('hz-dialogo-desbloqueo', { bloqueante: false });
    if (!registro) { return null; }
    if (registro.card.children.length === 0) { construirContenidoDesbloqueo(registro); }
    return registro;
  }

  function abrirDialogoDesbloqueo() {
    var registro = obtenerDialogoDesbloqueo();
    if (!registro) { return; }
    registro.abrir();
  }

  // -----------------------------------------------------------------------
  // H-04: #hz-dialogo-proteger, BLOQUEANTE (crearDialogo con
  // bloqueante:true -- Escape no cierra, sin botón Cancelar). Comparte su
  // contenido con la tolerancia sin protección de H-06 (idéntico bloque de
  // activación) vía construirBloqueActivarProteccion.
  // -----------------------------------------------------------------------
  function construirBloqueActivarProteccion(doc, contenedor, cerrarDialogo) {
    contenedor.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Protege tus datos'));
    contenedor.appendChild(crear(doc, 'p', null,
      'Rinde cifra los datos de tus clientes en este dispositivo con una contraseña. Es obligatoria y no se puede recuperar: si la olvidas, solo un respaldo te devuelve los datos.'));
    contenedor.appendChild(construirBotonDescargarRespaldo(doc));

    var form = crear(doc, 'form', ['hz-form', 'hz-form-columnas']);
    var campoPass1 = crearCampoInput(doc, form, 'hz-seg-pass-1', LABEL_PASS_1, 'password', '', { autocomplete: 'new-password', minlength: 8 });
    var campoPass2 = crearCampoInput(doc, form, 'hz-seg-pass-2', LABEL_PASS_2, 'password', '', { autocomplete: 'new-password', minlength: 8 });

    var filaConfirmo = crearCampoCheckbox(doc, form, 'hz-seg-confirmo', LABEL_CONFIRMO, false);
    filaConfirmo.campo.classList.add('hz-form-ancho');

    var errorEl = crear(doc, 'p', ['hz-form-error', 'hz-form-ancho']);
    errorEl.setAttribute('id', 'hz-seg-error');
    form.appendChild(errorEl);

    var acciones = crear(doc, 'div', ['hz-form-acciones', 'hz-form-ancho']);
    var botonActivar = crear(doc, 'button', ['hz-btn', 'hz-btn-primario'], TEXTO_BOTON_ACTIVAR);
    botonActivar.setAttribute('type', 'submit');
    botonActivar.setAttribute('id', 'hz-btn-seg-activar');
    // S-03.4: deshabilitado hasta marcar la casilla de confirmación.
    botonActivar.setAttribute('disabled', 'disabled');
    acciones.appendChild(botonActivar);
    form.appendChild(acciones);

    filaConfirmo.input.addEventListener('change', function () {
      if (filaConfirmo.input.checked) { botonActivar.removeAttribute('disabled'); }
      else { botonActivar.setAttribute('disabled', 'disabled'); }
    });

    form.addEventListener('submit', function (ev) {
      if (ev && typeof ev.preventDefault === 'function') { ev.preventDefault(); }
      errorEl.textContent = '';
      if (!filaConfirmo.input.checked) { return; }
      var p1 = campoPass1.input.value;
      var p2 = campoPass2.input.value;
      if (!p1 || !p2) { errorEl.textContent = 'Escribe la contraseña en ambos campos.'; return; }
      if (p1.length < 8) { errorEl.textContent = 'La contraseña debe tener al menos 8 caracteres.'; return; }
      if (p1 !== p2) { errorEl.textContent = 'Las contraseñas no coinciden.'; return; }
      var Seguridad = G.Herzon && G.Herzon.Seguridad;
      if (!Seguridad || typeof Seguridad.activar !== 'function') {
        errorEl.textContent = 'No se pudo activar la protección en este dispositivo.';
        return;
      }
      var textoOriginal = botonActivar.textContent;
      botonActivar.setAttribute('disabled', 'disabled');
      botonActivar.textContent = TEXTO_BOTON_CIFRANDO;
      Seguridad.activar(p1).then(function (res) {
        campoPass1.input.value = '';
        campoPass2.input.value = '';
        if (!res || !res.ok) {
          botonActivar.removeAttribute('disabled');
          botonActivar.textContent = textoOriginal;
          errorEl.textContent = (res && res.errores && res.errores.length) ? res.errores.join(' ') : 'No se pudo activar la protección en este dispositivo.';
          return;
        }
        // Éxito (H-04): Seguridad.activar -> cerrar diálogo -> render() de
        // Perfil -> H-01 muestra #hz-btn-seguridad.
        cerrarDialogo();
        if (typeof renderPerfilActual === 'function') { renderPerfilActual(); }
        sincronizarBotonSeguridad();
      });
    });

    contenedor.appendChild(form);
  }

  function construirContenidoProteger(registro) {
    var doc = registro.dialog.ownerDocument;
    construirBloqueActivarProteccion(doc, registro.card, registro.cerrar);
  }

  function obtenerDialogoProteger() {
    var registro = crearDialogo('hz-dialogo-proteger', { bloqueante: true });
    if (!registro) { return null; }
    if (registro.card.children.length === 0) { construirContenidoProteger(registro); }
    return registro;
  }

  // H-04: condición de apertura -- real, >= 1 cliente, sin protección
  // activa. Evaluada al cargar (arranque, más abajo) y en herzon:modo-
  // cambiado/herzon:clientes-actualizados (sincronizarYEvaluar, más
  // abajo). Idempotente: si ya está abierto no se reabre (showModal()
  // sobre un <dialog> ya abierto lanza InvalidStateError en DOM real).
  function evaluarAperturaProteger() {
    var Almacen = obtenerAlmacen();
    if (!Almacen || typeof Almacen.modo !== 'function' || typeof Almacen.clientes !== 'function') { return; }
    var Seguridad = G.Herzon && G.Herzon.Seguridad;
    var protegido = !!(Seguridad && typeof Seguridad.activa === 'function' && Seguridad.activa());
    if (Almacen.modo() !== 'real' || Almacen.clientes().length < 1 || protegido) { return; }
    var registro = obtenerDialogoProteger();
    if (!registro || dialogoEstaAbierto(registro.dialog)) { return; }
    registro.abrir();
  }

  // -----------------------------------------------------------------------
  // H-05: #hz-dialogo-perfil (edición) -- reemplaza a la antigua card
  // inline "Editar perfil". Se reconstruye ENTERO en cada apertura
  // (limpiar + reconstruir) para que los campos siempre precarguen el
  // cliente activo vigente, nunca datos obsoletos de una apertura previa.
  // -----------------------------------------------------------------------
  function construirContenidoPerfil(registro) {
    var doc = registro.dialog.ownerDocument;
    var card = registro.card;
    limpiar(card);
    var Almacen = obtenerAlmacen();
    var data = G.HERZON_DATA || {};
    var paciente = data.paciente || {};

    card.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Editar perfil'));
    var form = crear(doc, 'form', ['hz-form', 'hz-form-columnas']);

    var campoNombre = crearCampoInput(doc, form, 'hz-editar-nombre', 'Nombre', 'text', paciente.nombre || '');
    campoNombre.campo.classList.add('hz-form-ancho');
    var campoSexo = crearCampoSelect(doc, form, 'hz-editar-sexo', 'Sexo', OPCIONES_SEXO);
    campoSexo.select.value = paciente.sexo || '';
    var campoEdad = crearCampoInput(doc, form, 'hz-editar-edad', 'Edad (años)', 'number',
      paciente.edad != null ? String(paciente.edad) : '', { min: 1, max: 120, step: 1 });
    var campoTalla = crearCampoInput(doc, form, 'hz-editar-talla', 'Talla (cm)', 'number',
      paciente.talla_cm != null ? String(paciente.talla_cm) : '', { min: 50, max: 250, step: 1 });
    var campoPeso = crearCampoInput(doc, form, 'hz-editar-peso', 'Peso inicial (kg)', 'number',
      paciente.pesoInicial_kg != null ? String(paciente.pesoInicial_kg) : '', { min: 20, max: 400, step: 0.1 });
    var campoActividad = crearCampoSelect(doc, form, 'hz-editar-actividad', 'Nivel de actividad',
      opcionesActividad(data.factoresActividad));
    campoActividad.select.value = paciente.actividad || '';
    var campoObjetivo = crearCampoInput(doc, form, 'hz-editar-objetivo', 'Objetivo', 'text', paciente.objetivo || '');

    // S-05: casilla de laboratorios ocultos, precargada del config
    // vigente (ausente => false, tolerancia declarada del contrato).
    var labsOcultosInicial = !!(data.config && data.config.labsOcultos);
    var campoLabsOcultos = crearCampoCheckbox(doc, form, 'hz-perfil-labs-ocultos', LABEL_LABS_OCULTOS, labsOcultosInicial);
    campoLabsOcultos.campo.classList.add('hz-form-ancho');
    form.appendChild(crear(doc, 'p', ['hz-nota', 'hz-form-ancho'], NOTA_LABS_OCULTOS));

    var acciones = crear(doc, 'div', ['hz-form-acciones', 'hz-form-ancho']);
    var botonGuardar = crear(doc, 'button', ['hz-btn', 'hz-btn-primario'], 'Guardar cambios');
    botonGuardar.setAttribute('type', 'submit');
    botonGuardar.setAttribute('id', 'hz-btn-guardar-perfil');
    acciones.appendChild(botonGuardar);
    var botonCancelar = crear(doc, 'button', ['hz-btn', 'hz-btn-secundario'], 'Cancelar');
    botonCancelar.setAttribute('type', 'button');
    botonCancelar.setAttribute('id', 'hz-btn-cancelar-perfil');
    botonCancelar.addEventListener('click', function () { registro.cerrar(); });
    acciones.appendChild(botonCancelar);
    form.appendChild(acciones);

    var errorEl = crear(doc, 'p', ['hz-form-error', 'hz-form-ancho']);
    errorEl.setAttribute('id', 'hz-editar-error');
    form.appendChild(errorEl);

    form.addEventListener('submit', function (ev) {
      if (ev && typeof ev.preventDefault === 'function') { ev.preventDefault(); }
      errorEl.textContent = '';
      var perfilObj = {
        nombre: campoNombre.input.value,
        sexo: campoSexo.select.value,
        edad: parseFloat(campoEdad.input.value),
        talla_cm: parseFloat(campoTalla.input.value),
        pesoInicial_kg: parseFloat(campoPeso.input.value),
        actividad: campoActividad.select.value,
        objetivo: campoObjetivo.input.value
      };
      ['edad', 'talla_cm', 'pesoInicial_kg'].forEach(function (clave) {
        if (isNaN(perfilObj[clave])) { perfilObj[clave] = undefined; }
      });
      var AlmacenSubmit = obtenerAlmacen();
      var ok = AlmacenSubmit && typeof AlmacenSubmit.actualizarPerfil === 'function' && AlmacenSubmit.actualizarPerfil(perfilObj);
      if (!ok) {
        errorEl.textContent = 'No se pudo guardar el perfil.';
        return;
      }
      mensajeExitoPerfil = MENSAJE_EXITO_PERFIL;
      var labsOcultosNuevo = campoLabsOcultos.input.checked === true;
      registro.cerrar();
      if (labsOcultosNuevo !== labsOcultosInicial && AlmacenSubmit && typeof AlmacenSubmit.actualizarConfig === 'function') {
        AlmacenSubmit.actualizarConfig({ labsOcultos: labsOcultosNuevo });
        // S-05: actualizarConfig ya disparó herzon:modo-cambiado de forma
        // SÍNCRONA -- el listener de Perfil ya remontó, consumiendo
        // mensajeExitoPerfil. Un segundo render() aquí lo perdería.
        return;
      }
      // actualizarPerfil (sin cambio de configuración) NO emite
      // herzon:modo-cambiado: Perfil se refresca llamando directamente a
      // su propio render() vigente.
      if (typeof renderPerfilActual === 'function') { renderPerfilActual(); }
    });

    card.appendChild(form);

    // H-05: pie .hz-dialogo-pie con eliminación en dos pasos (reversión a
    // 6s, MC-06), ahora dentro del diálogo de edición -- eliminar cierra
    // el diálogo.
    var clienteActual = (Almacen && typeof Almacen.clienteActivo === 'function') ? Almacen.clienteActivo() : null;
    if (clienteActual) {
      var pie = crear(doc, 'div', ['hz-dialogo-pie']);
      var botonEliminar = crear(doc, 'button', ['hz-btn', 'hz-btn-peligro'], TEXTO_BOTON_ELIMINAR_NORMAL);
      botonEliminar.setAttribute('type', 'button');
      botonEliminar.setAttribute('id', 'hz-btn-eliminar-cliente');
      botonEliminar.setAttribute('data-confirmar', 'false');
      var temporizador = null;
      botonEliminar.addEventListener('click', function () {
        if (botonEliminar.getAttribute('data-confirmar') === 'true') {
          var temporizadorClear = (typeof G.clearTimeout === 'function') ? G.clearTimeout : clearTimeout;
          if (temporizador !== null) { temporizadorClear(temporizador); temporizador = null; }
          var AlmacenEliminar = obtenerAlmacen();
          if (AlmacenEliminar && typeof AlmacenEliminar.eliminarCliente === 'function') {
            AlmacenEliminar.eliminarCliente(clienteActual.id);
          }
          registro.cerrar();
          return;
        }
        botonEliminar.setAttribute('data-confirmar', 'true');
        botonEliminar.textContent = '¿Eliminar a ' + clienteActual.nombre + '? Confirmar';
        var temporizadorFn = (typeof G.setTimeout === 'function') ? G.setTimeout : setTimeout;
        temporizador = temporizadorFn(function () {
          botonEliminar.setAttribute('data-confirmar', 'false');
          botonEliminar.textContent = TEXTO_BOTON_ELIMINAR_NORMAL;
          temporizador = null;
        }, MS_REVERSION_CONFIRMAR);
      });
      pie.appendChild(botonEliminar);
      card.appendChild(pie);
    }
  }

  function abrirDialogoPerfil() {
    var registro = crearDialogo('hz-dialogo-perfil', { bloqueante: false });
    if (!registro) { return; }
    construirContenidoPerfil(registro);
    registro.abrir();
  }

  // -----------------------------------------------------------------------
  // H-06: #hz-dialogo-seguridad -- reemplaza a la antigua #hz-card-
  // seguridad. Se abre con #hz-btn-seguridad del header (H-08). Se
  // reconstruye entero en cada apertura y tras cada acción que deba dejarlo
  // abierto (cambiar contraseña), consumiendo mensajeExitoSeguridad.
  // -----------------------------------------------------------------------
  function construirBloqueSeguridadActiva(doc, card, registro, Seguridad) {
    var bloqueEstado = crear(doc, 'div');
    bloqueEstado.appendChild(crear(doc, 'p', null, TEXTO_ESTADO_PROTEGIDA));
    var botonBloquear = crear(doc, 'button', ['hz-btn', 'hz-btn-secundario'], TEXTO_BOTON_BLOQUEAR);
    botonBloquear.setAttribute('type', 'button');
    botonBloquear.setAttribute('id', 'hz-btn-seg-bloquear');
    botonBloquear.addEventListener('click', function () {
      // Re-bloqueo (S-02, fix T-058): Seguridad.bloquear() borra la clave
      // de sesión (síncrono) y Almacen.bloquearYVolverADemo() fija
      // bloqueadoActual=true + repinta la demo. H-06: cierra el diálogo y
      // NO reabre el desbloqueo automáticamente (P-4 solo aplica al
      // cargar, nunca al re-bloquear manualmente).
      if (Seguridad && typeof Seguridad.bloquear === 'function') { Seguridad.bloquear(); }
      var Almacen = obtenerAlmacen();
      if (Almacen && typeof Almacen.bloquearYVolverADemo === 'function') { Almacen.bloquearYVolverADemo(); }
      else if (Almacen && typeof Almacen.volverADemo === 'function') { Almacen.volverADemo(); }
      registro.cerrar();
    });
    bloqueEstado.appendChild(botonBloquear);
    card.appendChild(bloqueEstado);

    var errorEl = crear(doc, 'p', ['hz-form-error']);
    errorEl.setAttribute('id', 'hz-seg-error');
    card.appendChild(errorEl);

    card.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Cambiar contraseña'));
    var formCambiar = crear(doc, 'form', ['hz-form', 'hz-form-columnas']);
    var campoActual = crearCampoInput(doc, formCambiar, 'hz-seg-actual', LABEL_PASS_ACTUAL, 'password', '', { autocomplete: 'current-password' });
    var campoNueva1 = crearCampoInput(doc, formCambiar, 'hz-seg-nueva-1', LABEL_PASS_NUEVA_1, 'password', '', { autocomplete: 'new-password', minlength: 8 });
    var campoNueva2 = crearCampoInput(doc, formCambiar, 'hz-seg-nueva-2', LABEL_PASS_NUEVA_2, 'password', '', { autocomplete: 'new-password', minlength: 8 });
    var accionesCambiar = crear(doc, 'div', ['hz-form-acciones', 'hz-form-ancho']);
    var botonCambiar = crear(doc, 'button', ['hz-btn', 'hz-btn-primario'], TEXTO_BOTON_CAMBIAR);
    botonCambiar.setAttribute('type', 'submit');
    botonCambiar.setAttribute('id', 'hz-btn-seg-cambiar');
    accionesCambiar.appendChild(botonCambiar);
    formCambiar.appendChild(accionesCambiar);

    if (mensajeExitoSeguridad) {
      var notaExitoSeg = crear(doc, 'p', ['hz-nota'], mensajeExitoSeguridad);
      notaExitoSeg.setAttribute('id', 'hz-seg-exito');
      notaExitoSeg.style.color = 'var(--delta-good)';
      formCambiar.appendChild(notaExitoSeg);
      mensajeExitoSeguridad = '';
    }

    formCambiar.addEventListener('submit', function (ev) {
      if (ev && typeof ev.preventDefault === 'function') { ev.preventDefault(); }
      errorEl.textContent = '';
      var actual = campoActual.input.value;
      var n1 = campoNueva1.input.value;
      var n2 = campoNueva2.input.value;
      if (!actual || !n1 || !n2) { errorEl.textContent = 'Completa los 3 campos.'; return; }
      if (n1.length < 8) { errorEl.textContent = 'La contraseña nueva debe tener al menos 8 caracteres.'; return; }
      if (n1 !== n2) { errorEl.textContent = 'Las contraseñas nuevas no coinciden.'; return; }
      if (!Seguridad || typeof Seguridad.cambiar !== 'function') {
        errorEl.textContent = 'No se pudo cambiar la contraseña en este dispositivo.';
        return;
      }
      var textoOriginalCambiar = botonCambiar.textContent;
      botonCambiar.setAttribute('disabled', 'disabled');
      botonCambiar.textContent = TEXTO_BOTON_CIFRANDO;
      Seguridad.cambiar(actual, n1).then(function (res) {
        campoActual.input.value = '';
        campoNueva1.input.value = '';
        campoNueva2.input.value = '';
        if (!res || !res.ok) {
          botonCambiar.removeAttribute('disabled');
          botonCambiar.textContent = textoOriginalCambiar;
          errorEl.textContent = (res && res.errores && res.errores.length) ? res.errores.join(' ') : 'No se pudo cambiar la contraseña.';
          return;
        }
        mensajeExitoSeguridad = 'Contraseña actualizada.';
        construirContenidoSeguridad(registro);
      });
    });
    card.appendChild(formCambiar);

    card.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Respaldo'));
    card.appendChild(construirBotonDescargarRespaldo(doc));
    card.appendChild(crear(doc, 'p', ['hz-nota'], NOTA_RESPALDO_CUSTODIA));
    card.appendChild(construirBloqueRestaurarRespaldo(doc, 'hz-seg-import-label', 'hz-seg-input-restaurar', 'hz-btn-seg-restaurar-confirmar', null));
  }

  function construirContenidoSeguridad(registro) {
    var doc = registro.dialog.ownerDocument;
    var card = registro.card;
    limpiar(card);
    var Seguridad = G.Herzon && G.Herzon.Seguridad;
    var protegido = !!(Seguridad && typeof Seguridad.activa === 'function' && Seguridad.activa());

    card.appendChild(crear(doc, 'h3', ['hz-card-title'], TITULO_SEGURIDAD));

    if (protegido) {
      construirBloqueSeguridadActiva(doc, card, registro, Seguridad);
    } else {
      // H-06: tolerancia sin protección (no debería ocurrir por H-04) --
      // el diálogo muestra el mismo contenido de H-04.
      construirBloqueActivarProteccion(doc, card, registro.cerrar);
    }

    // T-064 (H-06 fix): Cerrar va SOLO en su propio div.hz-form-acciones,
    // dentro de un div.hz-dialogo-pie, último hijo de la card -- ya no es
    // un hermano inline pegado al bloque de restauración de respaldo.
    var pieSeguridad = crear(doc, 'div', ['hz-dialogo-pie']);
    var accionesPieSeguridad = crear(doc, 'div', ['hz-form-acciones']);
    var botonCerrar = crear(doc, 'button', ['hz-btn', 'hz-btn-secundario'], 'Cerrar');
    botonCerrar.setAttribute('type', 'button');
    botonCerrar.setAttribute('id', 'hz-btn-cerrar-seguridad');
    botonCerrar.addEventListener('click', function () { registro.cerrar(); });
    accionesPieSeguridad.appendChild(botonCerrar);
    pieSeguridad.appendChild(accionesPieSeguridad);
    card.appendChild(pieSeguridad);
  }

  function abrirDialogoSeguridad() {
    var registro = crearDialogo('hz-dialogo-seguridad', { bloqueante: false });
    if (!registro) { return; }
    construirContenidoSeguridad(registro);
    registro.abrir();
  }

  // -----------------------------------------------------------------------
  // H-08: cableado del botón #hz-btn-seguridad del header (shell.html,
  // T-062) -- vive FUERA de cualquier rootEl de vista, así que se localiza
  // vía G.document (guardado: ausente/sin getElementById en TestDOM, se
  // degrada sin lanzar).
  // -----------------------------------------------------------------------
  function elementoBotonSeguridad() {
    var d = G.document;
    return (d && typeof d.getElementById === 'function') ? d.getElementById('hz-btn-seguridad') : null;
  }

  // H-08: #hz-btn-seguridad sin hidden SOLO si modo real Y desbloqueado;
  // conecta su click (una sola vez, guardado en el propio nodo) para abrir
  // H-06.
  function sincronizarBotonSeguridad() {
    var boton = elementoBotonSeguridad();
    if (!boton) { return; }
    var Almacen = obtenerAlmacen();
    var visible = !!(Almacen && typeof Almacen.modo === 'function' && Almacen.modo() === 'real' &&
      typeof Almacen.bloqueado === 'function' && !Almacen.bloqueado());
    if (visible) { boton.removeAttribute('hidden'); } else { boton.setAttribute('hidden', ''); }
    if (!boton._hzSeguridadConectado) {
      boton.addEventListener('click', function () { abrirDialogoSeguridad(); });
      boton._hzSeguridadConectado = true;
    }
  }

  // H-08: se ejecuta en herzon:modo-cambiado y herzon:clientes-actualizados
  // (registrado UNA sola vez, a nivel de módulo).
  function sincronizarYEvaluar() {
    sincronizarBotonSeguridad();
    evaluarAperturaProteger();
  }

  if (typeof G.addEventListener === 'function') {
    G.addEventListener('herzon:modo-cambiado', sincronizarYEvaluar);
    G.addEventListener('herzon:clientes-actualizados', sincronizarYEvaluar);
    // H-03 (b): el botón/selector del header despachan este evento en vez
    // de activarReal() mientras bloqueado()===true (R10, S-02).
    G.addEventListener('herzon:desbloqueo-solicitado', function () { abrirDialogoDesbloqueo(); });
  }

  // H-08: arranque -- cuando el DOM está listo (readyState !== 'loading' o
  // DOMContentLoaded), evalúa P-4 (H-03: bloqueado -> abre desbloqueo) y
  // H-04 (proteger). Tolerante si Almacen/Seguridad no existen (las
  // funciones de abajo ya guardan typeof en cada paso). En TestDOM
  // (G.document ausente) esto es un no-op inmediato: "todo degrada sin
  // lanzar" (H-08).
  function evaluarArranqueSeguridad() {
    sincronizarBotonSeguridad();
    var Almacen = obtenerAlmacen();
    if (Almacen && typeof Almacen.bloqueado === 'function' && Almacen.bloqueado()) {
      abrirDialogoDesbloqueo();
    }
    evaluarAperturaProteger();
  }

  (function arrancarSeguridad() {
    var d = G.document;
    if (!d) { return; }
    if (d.readyState === 'loading' && typeof d.addEventListener === 'function') {
      d.addEventListener('DOMContentLoaded', evaluarArranqueSeguridad);
    } else {
      evaluarArranqueSeguridad();
    }
  })();

  // -----------------------------------------------------------------------
  // Vista Resumen: UN número héroe (peso actual + delta con signo + sparkline
  // de 12 puntos), 4 stat tiles con trayectoria (DV-06), y la nota "Acerca del
  // modo demo" SOLO en modo demo (PR-04). Reparto (LY-01 piezas 2 y 4): una
  // sola .hz-grid con el héroe a data-ancho="doble" y dos wrappers de 2
  // stat tiles cada uno.
  // -----------------------------------------------------------------------
  function mountResumen(rootEl) {
    var doc = rootEl.ownerDocument;

    function render() {
      limpiar(rootEl);
      var Charts = G.Herzon.Charts || {};
      var Almacen = obtenerAlmacen();
      var data = G.HERZON_DATA || {};
      var paciente = data.paciente || {};
      var series = data.series || {};
      var pesoSerie = series.peso_kg || [];
      var grasaSerie = series.grasa_pct || [];
      var cinturaSerie = series.cintura_cm || [];
      var adherenciaSerie = series.adherenciaDieta_pct || [];
      var enReal = esModoReal(Almacen);
      var heroVacio = enReal && pesoSerie.length < 2;

      // --- LY-01 pieza 2: UNA sola .hz-grid con el héroe (data-ancho doble)
      // y dos wrappers de 2 stat tiles. ---
      var grid = crear(doc, 'div', ['hz-grid']);

      var heroCard = crear(doc, 'div', ['hz-card']);
      heroCard.setAttribute('data-ancho', 'doble');
      grid.appendChild(heroCard);

      var hero = null;
      if (heroVacio) {
        crearVacio(doc, heroCard);
      } else {
        var pesoInicial = pesoSerie.length ? pesoSerie[0] : (paciente.pesoInicial_kg || 0);
        var pesoActual = pesoSerie.length ? pesoSerie[pesoSerie.length - 1] : (paciente.pesoActual_kg || 0);
        var deltaPeso = redondear(pesoActual - pesoInicial, 1);
        hero = crear(doc, 'div', ['hz-hero']);
        hero.appendChild(crear(doc, 'div', ['hz-hero-label'], 'Peso actual'));
        hero.appendChild(crear(doc, 'div', ['hz-hero-num'], formatoNumero(pesoActual, 1) + ' kg'));
        var delta = crear(doc, 'div', ['hz-stat-delta'], conSigno(deltaPeso, 1) + ' kg desde el inicio');
        delta.classList.add(deltaPeso <= 0 ? 'hz-delta-good' : 'hz-delta-bad');
        hero.appendChild(delta);
        heroCard.appendChild(hero);
      }

      // Dos wrappers flex-column de 2 stat tiles cada uno (layout puntual,
      // sin clase congelada propia -- ver preámbulo, mismo patrón que
      // build/vista_dieta_supl.js).
      var wrapA = crear(doc, 'div');
      wrapA.style.display = 'flex';
      wrapA.style.flexDirection = 'column';
      wrapA.style.gap = '16px';
      var wrapB = crear(doc, 'div');
      wrapB.style.display = 'flex';
      wrapB.style.flexDirection = 'column';
      wrapB.style.gap = '16px';
      grid.appendChild(wrapA);
      grid.appendChild(wrapB);

      // jera-8/fini-6 (Adendum R6): el héroe se mide DESPUÉS de estar en el
      // documento (grid ya apendizado a rootEl) para que el sparkline reciba
      // el ancho real de la card, no el de respaldo desconectado.
      rootEl.appendChild(grid);

      if (!heroVacio && hero && typeof Charts.sparkline === 'function') {
        var anchoMedido = hero.clientWidth || heroCard.clientWidth || 0;
        // LY-01 pieza 4 / decisión C2: tope Math.min(ancho, 560), alto 56,
        // lineaAcento:true (deja de codificar la evidencia principal en el
        // gris más recesivo).
        Charts.sparkline(hero, {
          valores: pesoSerie,
          color: 'var(--series-1)',
          ancho: anchoMedido > 0 ? Math.min(anchoMedido, 560) : undefined,
          alto: 56,
          lineaAcento: true
        });
      }

      if (typeof Charts.statTile === 'function') {
        var deltaImcResumen;
        if (typeof paciente.imcActual === 'number' && typeof paciente.imcInicial === 'number') {
          deltaImcResumen = redondear(paciente.imcActual - paciente.imcInicial, 1);
        }
        Charts.statTile(wrapA, {
          etiqueta: 'IMC actual',
          valorFormateado: formatoOTexto(paciente.imcActual, 1),
          delta: deltaImcResumen,
          mejorSi: 'menor'
        });
        // DV-06: sparkline de trayectoria en Grasa/Cintura/Adherencia (no en
        // IMC), colorSparkline por entidad (grasa: series-2, resto:
        // series-1) y lineaAcento:true, consistente con el héroe (LY-01).
        // Nota de implementación: Charts.statTile (build/charts.js, fuera de
        // este POSEE) NO reenvía `lineaAcento` a su llamada interna de
        // Charts.sparkline (solo reenvía `color`), así que la opción
        // `lineaAcento` dentro de las opciones de statTile es no-op ahí. En
        // vez de depender de ese reenvío, este módulo monta el tile SIN
        // sparkline y agrega el sparkline con una llamada directa y pública
        // a Charts.sparkline (misma primitiva que el héroe de LY-01), que sí
        // soporta lineaAcento -- mismo resultado visual, cero cambios en
        // charts.js.
        var tileGrasa = Charts.statTile(wrapA, {
          etiqueta: 'Grasa corporal',
          valorFormateado: grasaSerie.length ? formatoNumero(grasaSerie[grasaSerie.length - 1], 1) + '%' : '—',
          delta: grasaSerie.length >= 2 ? redondear(grasaSerie[grasaSerie.length - 1] - grasaSerie[0], 1) : undefined,
          sufijoDelta: ' pp',
          mejorSi: 'menor'
        });
        if (grasaSerie.length >= 2 && typeof Charts.sparkline === 'function') {
          Charts.sparkline(tileGrasa, { valores: grasaSerie, color: 'var(--series-2)', lineaAcento: true });
        }
        var tileCintura = Charts.statTile(wrapB, {
          etiqueta: 'Cintura',
          valorFormateado: cinturaSerie.length ? formatoNumero(cinturaSerie[cinturaSerie.length - 1], 1) + ' cm' : '—',
          delta: cinturaSerie.length >= 2 ? redondear(cinturaSerie[cinturaSerie.length - 1] - cinturaSerie[0], 1) : undefined,
          sufijoDelta: ' cm',
          mejorSi: 'menor'
        });
        if (cinturaSerie.length >= 2 && typeof Charts.sparkline === 'function') {
          Charts.sparkline(tileCintura, { valores: cinturaSerie, color: 'var(--series-1)', lineaAcento: true });
        }
        var tileAdherencia = Charts.statTile(wrapB, {
          etiqueta: 'Adherencia a dieta (promedio)',
          valorFormateado: adherenciaSerie.length ? (String(Math.round(promedio(adherenciaSerie))) + '%') : '—'
        });
        if (adherenciaSerie.length >= 2 && typeof Charts.sparkline === 'function') {
          Charts.sparkline(tileAdherencia, { valores: adherenciaSerie, color: 'var(--series-1)', lineaAcento: true });
        }
      }

      // PR-04: la nota "Acerca del modo demo" vive SOLO en modo demo (Almacen
      // ausente o modo()==='demo'); no participa de la retícula (se monta
      // DESPUÉS del grid, decisión C5).
      var mostrarNotaDemo = !Almacen || (typeof Almacen.modo === 'function' && Almacen.modo() === 'demo');
      if (mostrarNotaDemo) {
        var nota = crear(doc, 'div', ['hz-nota']);
        nota.appendChild(crear(doc, 'strong', null, TITULO_NOTA_DEMO));
        var lista = crear(doc, 'ul');
        (data.supuestos || []).forEach(function (s) { lista.appendChild(crear(doc, 'li', null, s)); });
        nota.appendChild(lista);
        rootEl.appendChild(nota);
      }
    }

    render();
    // Adendum R9 punto 3: herzon:modo-cambiado cubre TODO remontaje de
    // G.HERZON_DATA (demo<->real y cliente<->cliente) -- re-renderizar
    // releyendo G.HERZON_DATA desde cero.
    if (typeof G.addEventListener === 'function') {
      G.addEventListener('herzon:modo-cambiado', function () { render(); });
    }
  }

  // -----------------------------------------------------------------------
  // D-02 (R11, hereda MC-04/BUG 1 del R9): el listener de
  // `herzon:cliente-nuevo-solicitado` NO puede vivir SOLO dentro de
  // mountPerfil(), porque Herzon.registerView monta esa vista de forma
  // PEREZOSA (plan.md 3.C) -- mountPerfil solo se ejecuta la primera vez
  // que la pestaña Perfil se activa. En una carga fresca real (pestaña
  // activa por defecto = Resumen, contrato de shell.html), si el usuario
  // nunca visitó Perfil y hace clic en "Usar mis datos" (0 clientes) o en
  // "+ Nuevo cliente..." del selector, Almacen.activarReal/
  // Almacen.crearCliente despachan este evento y, sin este listener a nivel
  // de módulo, se disparaba al vacío. Se registra aquí (nivel superior del
  // IIFE): abre el diálogo de alta directamente, SIN cambiar de pestaña
  // (R11 punto 1, D-02) -- construyéndolo bajo demanda si Perfil nunca se
  // ha montado (abrirDialogoAlta/obtenerDialogoAlta arriba, R12: usa
  // crearDialogo/rootPerfilConocido). El listener interno registrado
  // dentro de mountPerfil (más abajo) sigue cubriendo el caso "Perfil ya
  // montada"; abrirDialogoAlta es idempotente, así que no importa que
  // ambos disparen para el mismo evento.
  // -----------------------------------------------------------------------
  if (typeof G.addEventListener === 'function') {
    G.addEventListener('herzon:cliente-nuevo-solicitado', function () {
      abrirDialogoAlta();
    });
  }

  // -----------------------------------------------------------------------
  // Vista Perfil: UN número héroe (IMC actual) DENTRO del grid de 3 tarjetas
  // (LY-02), tarjeta clínica, tarjeta antropométrica, semáforos de
  // laboratorios en grid anidado (LY-02, omitida por S-05 si el cliente
  // tiene labsOcultos), edición de perfil (F-04, con la casilla S-05 y el
  // pie de eliminación F-05) y eliminación de cliente en modo real (R8
  // punto 5, MC-06), la card de desbloqueo (S-02, primera card mientras
  // Almacen.bloqueado()===true), la card de seguridad y respaldo (S-03/S-04,
  // solo real desbloqueado) y, SOLO en modo demo (D-05, R11), la card
  // #hz-card-modo-real al final. El alta de cliente (F-03, MC-04, ids
  // congelados en Adendum R9 punto 6) YA NO vive inline en esta vista -- es
  // el diálogo modal #hz-dialogo-alta (D-01, construido a nivel de módulo,
  // ver arriba). Orden real de la vista (C-3): [bloqueado: desbloqueo
  // primera] -> cards actuales -> Editar perfil (casilla labs + pie de
  // eliminación) -> seguridad -> [demo: card Modo real al final].
  // -----------------------------------------------------------------------
  function mountPerfil(rootEl) {
    var doc = rootEl.ownerDocument;

    function render() {
      // D-01/D-02/H-02: recuerda el rootEl de Perfil VIGENTE en CADA
      // render() (no solo al montar) -- los diálogos construidos a nivel
      // de módulo lo usan como fallback en TestDOM (donde no hay
      // document.body) para anclarse/reanclarse. Refrescarlo aquí (no solo
      // una vez en mountPerfil) es lo que permite que un remontaje vía
      // herzon:modo-cambiado de UN root en concreto reancle sus diálogos a
      // ESE mismo root, incluso si otro root de Perfil se montó (y quedó
      // como "el más reciente") entre medio.
      rootPerfilConocido = rootEl;
      limpiar(rootEl);
      var Almacen = obtenerAlmacen();
      var data = G.HERZON_DATA || {};
      var paciente = data.paciente || {};
      var labs = data.labs || {};
      var enReal = esModoReal(Almacen);
      var bloqueado = !!(Almacen && typeof Almacen.bloqueado === 'function' && Almacen.bloqueado());

      // --- H-07 punto 1: mientras bloqueado()===true, la vista monta
      // SIEMPRE, como PRIMERA card, #hz-card-bloqueado -- botón que abre
      // #hz-dialogo-desbloqueo (H-03), ya NO un formulario inline. ---
      if (bloqueado) {
        var cardBloqueado = crear(doc, 'div', ['hz-card', 'hz-form-card']);
        cardBloqueado.setAttribute('id', 'hz-card-bloqueado');
        cardBloqueado.appendChild(crear(doc, 'h3', ['hz-card-title'], TITULO_DESBLOQUEO));
        cardBloqueado.appendChild(crear(doc, 'p', null, 'Desbloquea con tu contraseña para ver a tus clientes.'));
        var botonAbrirDesbloqueo = crear(doc, 'button', ['hz-btn', 'hz-btn-primario'], 'Desbloquear');
        botonAbrirDesbloqueo.setAttribute('type', 'button');
        botonAbrirDesbloqueo.setAttribute('id', 'hz-btn-abrir-desbloqueo');
        botonAbrirDesbloqueo.addEventListener('click', function () { abrirDialogoDesbloqueo(); });
        cardBloqueado.appendChild(botonAbrirDesbloqueo);
        rootEl.appendChild(cardBloqueado);
      }

      // --- LY-02 pieza (a): héroe IMC como PRIMER hijo del grid de 3. ---
      var heroCard = crear(doc, 'div', ['hz-card']);
      var imcValido = typeof paciente.imcActual === 'number' && !isNaN(paciente.imcActual);
      if (enReal && !imcValido) {
        crearVacio(doc, heroCard);
      } else {
        var hero = crear(doc, 'div', ['hz-hero']);
        hero.appendChild(crear(doc, 'div', ['hz-hero-label'], 'IMC actual'));
        hero.appendChild(crear(doc, 'div', ['hz-hero-num'], formatoOTexto(paciente.imcActual, 1)));
        if (imcValido) {
          var deltaImc = redondear((paciente.imcActual || 0) - (paciente.imcInicial || 0), 1);
          var delta = crear(doc, 'div', ['hz-stat-delta'], conSigno(deltaImc, 1) + ' desde el inicio');
          delta.classList.add(deltaImc <= 0 ? 'hz-delta-good' : 'hz-delta-bad');
          hero.appendChild(delta);
        }
        heroCard.appendChild(hero);
      }

      var grid = crear(doc, 'div', ['hz-grid']);
      grid.appendChild(heroCard);

      var tarjetaClinica = crear(doc, 'div', ['hz-card']);
      tarjetaClinica.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Tarjeta clínica'));
      tarjetaClinica.appendChild(crear(doc, 'p', null,
        (paciente.nombre || '(sin nombre)') + ', ' + (paciente.edad != null ? paciente.edad : '—') + ' años, ' + (paciente.sexo || '—')));
      tarjetaClinica.appendChild(crear(doc, 'p', null, 'Objetivo: ' + (paciente.objetivo || '—')));
      var ulDiag = crear(doc, 'ul');
      (paciente.diagnosticos || []).forEach(function (d) {
        ulDiag.appendChild(crear(doc, 'li', null, d.etiqueta + ' (' + d.severidad + ')'));
      });
      tarjetaClinica.appendChild(ulDiag);
      var alergiasTexto = (paciente.alergias && paciente.alergias.length) ? paciente.alergias.join(', ') : 'ninguna registrada';
      tarjetaClinica.appendChild(crear(doc, 'p', null, 'Alergias: ' + alergiasTexto));
      grid.appendChild(tarjetaClinica);

      var tarjetaAntro = crear(doc, 'div', ['hz-card']);
      tarjetaAntro.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Tarjeta antropométrica'));
      tarjetaAntro.appendChild(crear(doc, 'p', null, 'Talla: ' + formatoOTexto(paciente.talla_cm, 0, ' cm')));
      tarjetaAntro.appendChild(crear(doc, 'p', null, 'Peso inicial: ' + formatoOTexto(paciente.pesoInicial_kg, 1, ' kg')));
      tarjetaAntro.appendChild(crear(doc, 'p', null, 'Peso actual: ' + formatoOTexto(paciente.pesoActual_kg, 1, ' kg')));
      tarjetaAntro.appendChild(crear(doc, 'p', null, 'IMC inicial: ' + formatoOTexto(paciente.imcInicial, 1)));
      tarjetaAntro.appendChild(crear(doc, 'p', null, 'IMC actual: ' + formatoOTexto(paciente.imcActual, 1)));
      var ge = paciente.gastoEnergetico || {};
      tarjetaAntro.appendChild(crear(doc, 'p', null,
        'TMB: ' + formatoOTexto(ge.tmb_kcal, 0, ' kcal') + ' - GET: ' + formatoOTexto(ge.get_kcal, 0, ' kcal')));
      grid.appendChild(tarjetaAntro);

      rootEl.appendChild(grid);

      // --- H-07 punto 3: SOLO real desbloqueado, div#hz-perfil-acciones
      // con #hz-btn-editar-perfil (abre H-05) y, si hay un mensaje
      // pendiente, p.hz-nota#hz-perfil-exito como HIJO de
      // #hz-perfil-acciones, a la derecha del botón (T-064/H-07 fix;
      // consumo-único, F-04.5 original). ---
      if (enReal && !bloqueado) {
        var accionesPerfil = crear(doc, 'div', ['hz-perfil-acciones']);
        accionesPerfil.setAttribute('id', 'hz-perfil-acciones');
        var botonEditarPerfil = crear(doc, 'button', ['hz-btn', 'hz-btn-secundario'], 'Editar perfil');
        botonEditarPerfil.setAttribute('type', 'button');
        botonEditarPerfil.setAttribute('id', 'hz-btn-editar-perfil');
        botonEditarPerfil.addEventListener('click', function () { abrirDialogoPerfil(); });
        accionesPerfil.appendChild(botonEditarPerfil);

        if (mensajeExitoPerfil) {
          var notaExitoPerfil = crear(doc, 'p', ['hz-nota'], mensajeExitoPerfil);
          notaExitoPerfil.setAttribute('id', 'hz-perfil-exito');
          notaExitoPerfil.style.color = 'var(--delta-good)';
          accionesPerfil.appendChild(notaExitoPerfil);
          mensajeExitoPerfil = '';
        }

        rootEl.appendChild(accionesPerfil);
      }

      // --- LY-02 pieza (b): 7 semáforos en grid anidado dentro de cardLabs.
      // S-05: con labsOcultos===true en modo real, la card se OMITE por
      // completo (decisión clínica del nutriólogo, no un vacío); en demo o
      // bloqueado (enReal===false) siempre se monta. ---
      var labsOcultosPerfil = enReal && !!(data.config && data.config.labsOcultos);
      if (!labsOcultosPerfil) {
        var tarjetaLabs = crear(doc, 'div', ['hz-card']);
        tarjetaLabs.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Laboratorios - estado actual'));
        var marcadores = labs.marcadores || [];
        var hayLabs = marcadores.some(function (m) { return (m.valores || []).length > 0; });
        if (enReal && !hayLabs) {
          crearVacio(doc, tarjetaLabs);
        } else {
          var cortes = labs.cortes || [];
          var ultimoCorte = cortes.length ? cortes[cortes.length - 1].etiqueta : '';
          if (ultimoCorte) { tarjetaLabs.appendChild(crear(doc, 'p', null, 'Corte más reciente: ' + ultimoCorte)); }
          var gridSemaforos = crear(doc, 'div', ['hz-grid']);
          marcadores.forEach(function (m) {
            var valores = m.valores || [];
            var valorFinal = valores.length ? valores[valores.length - 1] : null;
            var estado = (valorFinal != null) ? calcularEstadoMarcador(valorFinal, m.referencia, m.mejorSi) : 'good';
            var wrapMarcador = crear(doc, 'div');
            var punto = crear(doc, 'span', ['hz-status-dot']);
            punto.setAttribute('data-status', estado);
            var nombre = crear(doc, 'span', null, m.nombre + ': ');
            nombre.style.color = 'var(--text-secondary)';
            nombre.style.fontWeight = '400';
            var textoValor = (valorFinal != null)
              ? (formatoNumero(valorFinal, 1) + ' ' + m.unidad + ' - ' + ETIQUETAS_ESTADO[estado])
              : '—';
            var valor = crear(doc, 'span', ['hz-status-label'], textoValor);
            valor.style.fontVariantNumeric = 'tabular-nums';
            wrapMarcador.appendChild(punto);
            wrapMarcador.appendChild(nombre);
            wrapMarcador.appendChild(valor);
            gridSemaforos.appendChild(wrapMarcador);
          });
          tarjetaLabs.appendChild(gridSemaforos);
        }
        rootEl.appendChild(tarjetaLabs);
      }

      // --- H-07 punto 5 (D-05, R11): SOLO en modo demo (nunca en real ni bloqueado),
      // última card de la vista -- explica qué habilita el modo real
      // (contraseña, laboratorios ocultos, rutina editable) y ofrece el
      // mismo punto de entrada al alta que el header ("Usar mis datos"). ---
      if (!enReal && !bloqueado) {
        montarCardModoReal();
      }

      // -----------------------------------------------------------------
      // D-05 (R11): tarjeta 'Modo real' en modo demo -- feedback en vivo de
      // Mario ("no veo el checkbox / no veo la rutina ni la contraseña"):
      // en demo nada indicaba que la protección con contraseña, ocultar
      // labs y editar la rutina existen en modo real. Última card de la
      // vista (después de labs); ausente en real y en bloqueado (D-05).
      // -----------------------------------------------------------------
      function montarCardModoReal() {
        var card = crear(doc, 'div', ['hz-card', 'hz-form-card']);
        card.setAttribute('id', 'hz-card-modo-real');
        card.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Modo real: tus clientes'));
        card.appendChild(crear(doc, 'p', ['hz-nota'],
          'En modo real registras clientes reales y se habilitan estas funciones:'));
        var lista = crear(doc, 'ul');
        [
          'Contraseña obligatoria: cifra los datos de tus clientes en este dispositivo.',
          'Laboratorios ocultos: quita la sección de labs a los clientes que no se los hacen.',
          'Rutina editable: prescribe días y ejercicios e imprímela.'
        ].forEach(function (texto) {
          lista.appendChild(crear(doc, 'li', null, texto));
        });
        card.appendChild(lista);

        var acciones = crear(doc, 'div', ['hz-form-acciones']);
        var boton = crear(doc, 'button', ['hz-btn', 'hz-btn-primario'], 'Registrar un cliente');
        boton.setAttribute('type', 'button');
        boton.setAttribute('id', 'hz-btn-modo-real-perfil');
        boton.addEventListener('click', function () {
          if (typeof G.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') { return; }
          G.dispatchEvent(new CustomEvent('herzon:cliente-nuevo-solicitado', { detail: {} }));
        });
        acciones.appendChild(boton);
        card.appendChild(acciones);

        rootEl.appendChild(card);
      }

      obtenerDialogoAlta();
    }

    // R12: expone el render() vigente de este montaje de Perfil a los
    // diálogos H-04/H-05 (construidos a nivel de módulo).
    renderPerfilActual = render;
    render();

    if (typeof G.addEventListener === 'function') {
      G.addEventListener('herzon:modo-cambiado', function () { render(); });
      // D-02: cubre el caso "Perfil ya montada" (reapertura del diálogo de
      // alta tras eliminar y crear de nuevo, o tras cualquier disparo del
      // evento con esta vista ya viva). abrirDialogoAlta es idempotente
      // (guarda dialog.open), así que da igual que el listener de nivel de
      // módulo también dispare para el mismo evento -- SIN cambiar de
      // pestaña (R11 punto 1) y sin necesidad de un render().
      G.addEventListener('herzon:cliente-nuevo-solicitado', function () {
        abrirDialogoAlta();
      });
    }
  }

  // -----------------------------------------------------------------------
  // Vista Seguimiento: UN número héroe (cambio de peso EN EL RANGO activo),
  // 4 líneas de peso/composición corporal/cintura agrupadas en
  // .hz-grid.hz-grid-pares (LY-04), laboratorios en 3 cortes (DV-04) y
  // plicometría en 4 cortes, con estados vacíos en modo real (Adendum R8
  // punto 4) y el formulario de captura de mediciones en #captura-mediciones
  // (solo modo real, R8 punto 5). Se suscribe a Herzon.filters.onRangeChange
  // (redibuja SOLO hero+líneas), a herzon:mediciones-importadas (idem) y a
  // herzon:modo-cambiado (remontaje completo: hero+líneas+labs+plicometría+
  // formulario de captura, sin tocar #captura-mediciones/#doc-herramientas
  // en sí -- son estáticos, de otros dueños).
  //
  // R4 (Adendum R4 punto 3): TODO delta/porcentaje mostrado en esta vista se
  // recalcula contra el PRIMER punto del rango seleccionado (4/8/12
  // semanas), no contra el inicio absoluto de las 12 semanas.
  // -----------------------------------------------------------------------
  function mountSeguimiento(rootEl) {
    var doc = rootEl.ownerDocument;
    var Charts = G.Herzon.Charts || {};
    var Herzon = G.Herzon;

    // Adendum R8 punto 2 (T-038): #captura-mediciones es estático, al INICIO
    // de #vista-seguimiento. Puede no existir (contenedores de prueba sin
    // ese markup): en ese caso, la captura simplemente no se monta.
    var capturaEl = buscarHijoPorId(rootEl, 'captura-mediciones');

    // Nodos de nivel superior que ESTE módulo posee y remonta enteros en
    // cada remontaje completo (herzon:modo-cambiado): se desprenden de
    // rootEl (si estaban) y se reconstruyen desde cero, sin tocar
    // #captura-mediciones/#doc-herramientas (estáticos, de otros dueños).
    var heroCard, heroBody, gridPares, cardLabs, cardPlic;
    // Referencias vivas que redibujar()/actualizarHero() necesitan en cada
    // llamada -- reasignadas por montarContenido() en cada remontaje.
    var wrapPeso, wrapMusculo, wrapGrasa, wrapCintura;

    function actualizarHero(n, pesoSerieActual) {
      limpiar(heroBody);
      if (pesoSerieActual.length < 2) {
        crearVacio(doc, heroBody);
        return;
      }
      var hero = crear(doc, 'div', ['hz-hero']);
      var heroLabel = crear(doc, 'div', ['hz-hero-label']);
      var heroNum = crear(doc, 'div', ['hz-hero-num']);
      var heroDelta = crear(doc, 'div', ['hz-stat-delta']);
      hero.appendChild(heroLabel);
      hero.appendChild(heroNum);
      hero.appendChild(heroDelta);
      heroBody.appendChild(hero);

      var recorte = ultimasN(pesoSerieActual, n);
      var inicioPeriodo = recorte.length ? recorte[0] : 0;
      var pesoActual = recorte.length ? recorte[recorte.length - 1] : 0;
      var deltaPeriodo = redondear(pesoActual - inicioPeriodo, 1);
      var deltaPct = inicioPeriodo ? redondear((deltaPeriodo / inicioPeriodo) * 100, 1) : 0;
      heroLabel.textContent = 'Cambio de peso en las últimas ' + n + ' semanas';
      heroNum.textContent = conSigno(deltaPeriodo, 1) + ' kg';
      heroDelta.textContent = conSigno(deltaPct, 1) + '% respecto al inicio del periodo';
      heroDelta.classList.add(deltaPeriodo <= 0 ? 'hz-delta-good' : 'hz-delta-bad');
    }

    function etiquetasDe(semanasSlice) {
      return semanasSlice.map(function (s) { return 'S' + s; });
    }

    // prod-1 (Adendum R6 punto 4): relee G.HERZON_DATA.series en CADA
    // llamada (nunca un arreglo capturado una sola vez), así que reacciona
    // tanto a una importación (mergeMediciones reasigna el arreglo) como a
    // una captura nueva (agregarMedicion reutiliza el mismo evento).
    function redibujar(weeksRaw) {
      var seriesActual = (G.HERZON_DATA && G.HERZON_DATA.series) || {};
      var semanasActual = seriesActual.semanas || [];
      var pesoSerieActual = seriesActual.peso_kg || [];
      var musculoSerieActual = seriesActual.musculo_kg || [];
      var grasaSerieActual = seriesActual.grasa_pct || [];
      var cinturaSerieActual = seriesActual.cintura_cm || [];
      var totalSemanasActual = semanasActual.length;
      var n = Math.min((weeksRaw || totalSemanasActual), totalSemanasActual);
      var semanasSlice = ultimasN(semanasActual, n);
      var etiquetasX = etiquetasDe(semanasSlice);

      actualizarHero(n, pesoSerieActual);

      limpiar(wrapPeso);
      if (pesoSerieActual.length < 2) {
        crearVacio(doc, wrapPeso);
      } else if (typeof Charts.linea === 'function') {
        Charts.linea(wrapPeso, {
          tituloAccesible: 'Peso corporal en kilogramos a lo largo del tiempo',
          series: [{ nombre: 'Peso', datos: ultimasN(pesoSerieActual, n) }],
          etiquetasX: etiquetasX,
          yMin: 55,
          yMax: 85,
          unidad: (G.HERZON_DATA && G.HERZON_DATA.meta && G.HERZON_DATA.meta.unidades && G.HERZON_DATA.meta.unidades.peso) || 'kg',
          tabla: true
        });
      }

      limpiar(wrapMusculo);
      if (musculoSerieActual.length < 2) {
        crearVacio(doc, wrapMusculo);
      } else if (typeof Charts.linea === 'function') {
        Charts.linea(wrapMusculo, {
          tituloAccesible: 'Masa muscular corporal en kilogramos a lo largo del tiempo',
          series: [{ nombre: 'Masa muscular (kg)', datos: ultimasN(musculoSerieActual, n), color: 'var(--series-3)' }],
          etiquetasX: etiquetasX,
          yMin: 15,
          yMax: 40,
          unidad: (G.HERZON_DATA && G.HERZON_DATA.meta && G.HERZON_DATA.meta.unidades && G.HERZON_DATA.meta.unidades.peso) || 'kg',
          tabla: true
        });
      }

      limpiar(wrapGrasa);
      if (grasaSerieActual.length < 2) {
        crearVacio(doc, wrapGrasa);
      } else if (typeof Charts.linea === 'function') {
        Charts.linea(wrapGrasa, {
          tituloAccesible: 'Grasa corporal en porcentaje a lo largo del tiempo',
          series: [{ nombre: 'Grasa corporal (%)', datos: ultimasN(grasaSerieActual, n), color: 'var(--series-2)' }],
          etiquetasX: etiquetasX,
          yMin: 15,
          yMax: 45,
          unidad: '%',
          tabla: true
        });
      }

      limpiar(wrapCintura);
      if (cinturaSerieActual.length < 2) {
        crearVacio(doc, wrapCintura);
      } else if (typeof Charts.linea === 'function') {
        Charts.linea(wrapCintura, {
          tituloAccesible: 'Circunferencia de cintura en centímetros a lo largo del tiempo',
          series: [{ nombre: 'Cintura', datos: ultimasN(cinturaSerieActual, n) }],
          etiquetasX: etiquetasX,
          yMin: 70,
          yMax: 100,
          unidad: (G.HERZON_DATA && G.HERZON_DATA.meta && G.HERZON_DATA.meta.unidades && G.HERZON_DATA.meta.unidades.cintura) || 'cm',
          tabla: true
        });
      }
    }

    // -----------------------------------------------------------------
    // R8 punto 5: formulario de captura de mediciones, solo en modo real.
    // Validación patrón T-029 (var(--delta-bad), nunca guarda en silencio).
    // Plicometría opcional plegada (<details>): si se llena UN sitio hay
    // que llenar los 4 (mismo contrato que Herzon.Almacen.agregarMedicion).
    // -----------------------------------------------------------------
    function montarFormularioCaptura() {
      if (!capturaEl) { return; }
      limpiar(capturaEl);
      var Almacen = obtenerAlmacen();
      if (!esModoReal(Almacen)) { return; }

      var card = crear(doc, 'div', ['hz-card', 'hz-form-card']);
      card.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Registrar medición'));
      card.appendChild(crear(doc, 'p', ['hz-nota'], NOTA_PRIVACIDAD_CAPTURA));
      card.appendChild(crear(doc, 'p', ['hz-nota'], 'Fecha: ' + fechaHoyTexto()));

      var form = crear(doc, 'form', ['hz-form', 'hz-form-columnas']);

      var campoPeso = crearCampoInput(doc, form, 'hz-cap-peso', 'Peso (kg)', 'number', '', { min: 20, max: 400, step: 0.1 });
      var campoGrasa = crearCampoInput(doc, form, 'hz-cap-grasa', 'Grasa corporal (%)', 'number', '', { min: 3, max: 70, step: 0.1 });
      var campoMusculo = crearCampoInput(doc, form, 'hz-cap-musculo', 'Masa muscular (kg)', 'number', '', { min: 5, max: 150, step: 0.1 });
      var campoCintura = crearCampoInput(doc, form, 'hz-cap-cintura', 'Circunferencia de cintura (cm)', 'number', '', { min: 40, max: 250, step: 0.1 });

      // F-06.3: `detalles` gana hz-form-ancho; tras el summary se inserta
      // `sub` (hz-form-sub) y los 4 campos de plicometría apuntan a `sub` en
      // vez de a `detalles` directamente (summary hereda estilo/foco de
      // F-01.5, sin cambios de JS).
      var detalles = crear(doc, 'details', ['hz-form-ancho']);
      detalles.appendChild(crear(doc, 'summary', null, 'Plicometría (opcional)'));
      var sub = crear(doc, 'div', ['hz-form-sub']);
      var campoTricipital = crearCampoInput(doc, sub, 'hz-cap-plic-tricipital', 'Pliegue tricipital (mm)', 'number', '', { min: 2, max: 80, step: 0.1 });
      var campoSubescapular = crearCampoInput(doc, sub, 'hz-cap-plic-subescapular', 'Pliegue subescapular (mm)', 'number', '', { min: 2, max: 80, step: 0.1 });
      var campoSuprailiaco = crearCampoInput(doc, sub, 'hz-cap-plic-suprailiaco', 'Pliegue suprailiaco (mm)', 'number', '', { min: 2, max: 80, step: 0.1 });
      var campoAbdominal = crearCampoInput(doc, sub, 'hz-cap-plic-abdominal', 'Pliegue abdominal (mm)', 'number', '', { min: 2, max: 80, step: 0.1 });
      detalles.appendChild(sub);
      form.appendChild(detalles);

      // F-06.4: notaValidacion pasa de ['hz-nota'] a
      // ['hz-form-error','hz-form-ancho'] -- rojo, peso 600, oculta sin
      // reservar alto cuando vacía (F-01.8). Todos sus mensajes son de
      // error, ninguno neutro (validación byte-idéntica más abajo).
      var notaValidacion = crear(doc, 'p', ['hz-form-error', 'hz-form-ancho']);
      form.appendChild(notaValidacion);

      var acciones = crear(doc, 'div', ['hz-form-acciones', 'hz-form-ancho']);
      var botonGuardar = crear(doc, 'button', ['hz-btn', 'hz-btn-primario'], 'Registrar medición');
      botonGuardar.setAttribute('type', 'submit');
      acciones.appendChild(botonGuardar);
      form.appendChild(acciones);

      var CAMPOS_REQUERIDOS = [
        { input: campoPeso.input, etiqueta: 'Peso', clave: 'peso_kg' },
        { input: campoGrasa.input, etiqueta: 'Grasa corporal', clave: 'grasa_pct' },
        { input: campoMusculo.input, etiqueta: 'Masa muscular', clave: 'musculo_kg' },
        { input: campoCintura.input, etiqueta: 'Circunferencia de cintura', clave: 'cintura_cm' }
      ];
      var CAMPOS_PLIC = [
        { input: campoTricipital.input, etiqueta: 'Pliegue tricipital', clave: 'tricipital' },
        { input: campoSubescapular.input, etiqueta: 'Pliegue subescapular', clave: 'subescapular' },
        { input: campoSuprailiaco.input, etiqueta: 'Pliegue suprailiaco', clave: 'suprailiaco' },
        { input: campoAbdominal.input, etiqueta: 'Pliegue abdominal', clave: 'abdominal' }
      ];

      form.addEventListener('submit', function (ev) {
        if (ev && typeof ev.preventDefault === 'function') { ev.preventDefault(); }
        notaValidacion.textContent = '';
        limpiarBordesValidacion(CAMPOS_REQUERIDOS.concat(CAMPOS_PLIC));

        var invalidos = [];
        var valores = {};
        CAMPOS_REQUERIDOS.forEach(function (c) {
          var numero = parseFloat(c.input.value);
          if (c.input.value === '' || isNaN(numero) || numero <= 0) { invalidos.push(c); }
          else { valores[c.clave] = numero; }
        });
        if (invalidos.length) {
          invalidos.forEach(marcarBordeInvalido);
          notaValidacion.textContent = 'Revisa el campo ' + invalidos.map(function (c) { return c.etiqueta; }).join(', ') +
            ' antes de guardar: debe ser un número mayor que cero. No se guardó.';
          return;
        }

        var camposPlicLlenos = CAMPOS_PLIC.filter(function (c) { return c.input.value !== ''; });
        var plicometriaObj = null;
        if (camposPlicLlenos.length > 0) {
          if (camposPlicLlenos.length < CAMPOS_PLIC.length) {
            var faltantes = CAMPOS_PLIC.filter(function (c) { return c.input.value === ''; });
            faltantes.forEach(marcarBordeInvalido);
            notaValidacion.textContent = 'La plicometría es opcional, pero si registras un sitio debes completar los 4: revisa ' +
              faltantes.map(function (c) { return c.etiqueta; }).join(', ') + '. No se guardó.';
            return;
          }
          plicometriaObj = {};
          var plicInvalidos = [];
          CAMPOS_PLIC.forEach(function (c) {
            var numero = parseFloat(c.input.value);
            if (isNaN(numero) || numero <= 0) { plicInvalidos.push(c); }
            else { plicometriaObj[c.clave] = numero; }
          });
          if (plicInvalidos.length) {
            plicInvalidos.forEach(marcarBordeInvalido);
            notaValidacion.textContent = 'Revisa el campo ' + plicInvalidos.map(function (c) { return c.etiqueta; }).join(', ') +
              ' antes de guardar. No se guardó.';
            return;
          }
        }

        var medicion = {
          peso_kg: valores.peso_kg,
          grasa_pct: valores.grasa_pct,
          musculo_kg: valores.musculo_kg,
          cintura_cm: valores.cintura_cm
        };
        if (plicometriaObj) { medicion.plicometria = plicometriaObj; }

        if (!Almacen || typeof Almacen.agregarMedicion !== 'function') {
          notaValidacion.textContent = 'No se pudo guardar la medición en este momento.';
          return;
        }
        var res = Almacen.agregarMedicion(medicion);
        if (!res || !res.ok) {
          notaValidacion.textContent = (res && res.errores && res.errores.length) ? res.errores.join(' ') : 'No se pudo guardar la medición.';
          return;
        }

        notaValidacion.textContent = '';
        CAMPOS_REQUERIDOS.concat(CAMPOS_PLIC).forEach(function (c) { c.input.value = ''; });
        detalles.removeAttribute('open');
        // agregarMedicion ya disparó herzon:mediciones-importadas (evento
        // reutilizado, Adendum R8 punto 1): el listener registrado más
        // abajo relee la serie y redibuja hero+líneas con el rango activo.
      });

      card.appendChild(form);
      capturaEl.appendChild(card);
    }

    // -----------------------------------------------------------------
    // Remontaje completo (montaje inicial y herzon:modo-cambiado): hero +
    // grid de 4 líneas (LY-04) + laboratorios (DV-04) + plicometría +
    // formulario de captura. Desprende los nodos de nivel superior que este
    // módulo montó antes (si los hubo) y los reconstruye desde cero.
    // -----------------------------------------------------------------
    function montarContenido() {
      limpiarNodo(heroCard);
      limpiarNodo(gridPares);
      limpiarNodo(cardLabs);
      limpiarNodo(cardPlic);

      var data = G.HERZON_DATA || {};
      var labs = data.labs || {};
      var plicometria = data.plicometria || {};

      heroCard = crear(doc, 'div', ['hz-card']);
      heroBody = crear(doc, 'div');
      heroCard.appendChild(heroBody);
      rootEl.appendChild(heroCard);

      // LY-04: las 4 cards de línea en .hz-grid.hz-grid-pares (2x2 a
      // 1240px) en vez de apiladas de ancho completo sobre rootEl.
      gridPares = crear(doc, 'div', ['hz-grid', 'hz-grid-pares']);

      var cardPeso = crear(doc, 'div', ['hz-card']);
      cardPeso.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Peso corporal'));
      wrapPeso = crear(doc, 'div');
      cardPeso.appendChild(wrapPeso);
      gridPares.appendChild(cardPeso);

      var cardMusculo = crear(doc, 'div', ['hz-card']);
      cardMusculo.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Masa muscular (kg)'));
      wrapMusculo = crear(doc, 'div');
      cardMusculo.appendChild(wrapMusculo);
      gridPares.appendChild(cardMusculo);

      var cardGrasa = crear(doc, 'div', ['hz-card']);
      cardGrasa.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Grasa corporal (%)'));
      wrapGrasa = crear(doc, 'div');
      cardGrasa.appendChild(wrapGrasa);
      gridPares.appendChild(cardGrasa);

      var cardCintura = crear(doc, 'div', ['hz-card']);
      cardCintura.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Circunferencia de cintura'));
      wrapCintura = crear(doc, 'div');
      cardCintura.appendChild(wrapCintura);
      gridPares.appendChild(cardCintura);

      rootEl.appendChild(gridPares);

      // --- DV-04: laboratorios en 3 cortes -- valoresEnBarras vertical +
      // unidad, cortesEtiquetas cortas y horizontales. Vacío a nivel de
      // card cuando ningún marcador trae valores (modo real sin captura de
      // laboratorio: no hay UI de captura para esto en este alcance).
      // S-05: con labsOcultos===true en modo real, la card se OMITE por
      // completo (decisión clínica del nutriólogo, no un vacío); en demo o
      // bloqueado (enReal===false) siempre se monta -- mismo patrón que la
      // vista Perfil. ---
      var AlmacenSeg = obtenerAlmacen();
      var enRealSeg = esModoReal(AlmacenSeg);
      var labsOcultosSeg = enRealSeg && !!(data.config && data.config.labsOcultos);
      if (labsOcultosSeg) {
        cardLabs = null;
      } else {
        cardLabs = crear(doc, 'div', ['hz-card']);
        cardLabs.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Laboratorios en 3 cortes'));
        // jera-2/data-1/fini-2 (causa raíz, mismo patrón que heroCard/gridPares
        // arriba): cardLabs se adjunta a rootEl AQUÍ, antes de construir su
        // contenido, para que gridLabs y cada wrapMarcador queden conectados
        // al árbol de la vista desde el instante en que se crean -- así
        // Herzon.Charts.barras (fase 2) siempre recibe un contenedor YA
        // montado, nunca uno todavía huérfano.
        rootEl.appendChild(cardLabs);
        var marcadoresLabs = labs.marcadores || [];
        var hayDatosLabs = marcadoresLabs.some(function (m) { return (m.valores || []).length > 0; });
        if (!hayDatosLabs) {
          crearVacio(doc, cardLabs);
        } else {
          var gridLabs = crear(doc, 'div', ['hz-grid']);
          cardLabs.appendChild(gridLabs);
          var cortesEtiquetasCortas = (labs.cortes || []).map(function (c) { return acortarCorte(c.etiqueta); });

          // Fase 1 (T-033): crear y adjuntar TODOS los wrapMarcador a
          // gridLabs antes de renderizar ninguno -- el grid ya queda en su
          // geometría final antes de que Herzon.Charts.barras mida el ancho.
          var wrapsLabs = marcadoresLabs.map(function (m) {
            var wrapMarcador = crear(doc, 'div');
            gridLabs.appendChild(wrapMarcador);
            return wrapMarcador;
          });

          // Fase 2 (T-033): con gridLabs ya en su geometría final, renderizar
          // cada gráfica de laboratorio en un loop aparte.
          marcadoresLabs.forEach(function (m, indiceMarcadorLab) {
            if (typeof Charts.barras !== 'function') { return; }
            var opcionesBarras = {
              titulo: m.nombre + ' (' + m.unidad + ')',
              categorias: cortesEtiquetasCortas,
              series: [{ nombre: m.nombre, datos: m.valores }],
              valoresEnBarras: true,
              unidad: m.unidad,
              tabla: true
            };
            if (m.referencia && typeof m.referencia.min === 'number' && typeof m.referencia.max === 'number') {
              opcionesBarras.referencia = { min: m.referencia.min, max: m.referencia.max, etiqueta: 'Rango normal' };
            }
            Charts.barras(wrapsLabs[indiceMarcadorLab], opcionesBarras);
          });
        }
      }

      // --- Plicometría en 4 cortes (Adendum R4 punto 1): vacía en modo
      // real sin cortes registrados. ---
      cardPlic = crear(doc, 'div', ['hz-card']);
      cardPlic.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Plicometría en 4 cortes'));
      var cortesPlic = plicometria.cortes || [];
      if (!cortesPlic.length) {
        crearVacio(doc, cardPlic);
      } else {
        var TOKEN_POR_SITIO_PLICOMETRIA = {
          tricipital: 'var(--series-1)',
          subescapular: 'var(--series-2)',
          suprailiaco: 'var(--series-3)',
          abdominal: 'var(--series-4)'
        };
        var wrapPlic = crear(doc, 'div');
        cardPlic.appendChild(wrapPlic);
        var sitiosPlic = plicometria.sitios || [];
        var seriesPlic = sitiosPlic.map(function (sitio) {
          return { nombre: sitio.nombre, datos: sitio.valores_mm, color: TOKEN_POR_SITIO_PLICOMETRIA[sitio.clave] };
        });
        if (typeof Charts.linea === 'function') {
          Charts.linea(wrapPlic, {
            tituloAccesible: 'Pliegues cutáneos en milímetros por sitio anatómico, en los cortes fijos S1, S4, S8 y S12',
            series: seriesPlic,
            etiquetasX: cortesPlic,
            yMin: 0,
            yMax: 40,
            tabla: true
          });
        }
      }
      rootEl.appendChild(cardPlic);

      montarFormularioCaptura();
    }

    montarContenido();

    var rangoInicial = (Herzon.filters && typeof Herzon.filters.getRange === 'function') ? Herzon.filters.getRange() : 12;
    redibujar(rangoInicial);
    if (Herzon.filters && typeof Herzon.filters.onRangeChange === 'function') {
      Herzon.filters.onRangeChange(function (weeks) { redibujar(weeks); });
    }

    if (typeof G.addEventListener === 'function') {
      G.addEventListener('herzon:mediciones-importadas', function () {
        var rangoActivo = (Herzon.filters && typeof Herzon.filters.getRange === 'function') ? Herzon.filters.getRange() : 12;
        redibujar(rangoActivo);
      });
      // Adendum R9 punto 3: herzon:modo-cambiado cubre TODO remontaje
      // (demo<->real y cliente<->cliente) -- remontaje COMPLETO (hero +
      // líneas + labs + plicometría + formulario de captura), montaje en
      // dos fases donde aplique (lección T-033).
      G.addEventListener('herzon:modo-cambiado', function () {
        montarContenido();
        var rangoActivoModo = (Herzon.filters && typeof Herzon.filters.getRange === 'function') ? Herzon.filters.getRange() : 12;
        redibujar(rangoActivoModo);
      });
    }
  }

  // -----------------------------------------------------------------------
  // Publicación: SOLO Herzon.Views.resumen / .perfil / .seguimiento, vía
  // asignación directa Y vía Herzon.registerView (si ya existe -- el shell la
  // publica antes de que el ensamblador inyecte este módulo, ver plan.md 3.D).
  // -----------------------------------------------------------------------
  G.Herzon.Views.resumen = mountResumen;
  G.Herzon.Views.perfil = mountPerfil;
  G.Herzon.Views.seguimiento = mountSeguimiento;

  if (typeof G.Herzon.registerView === 'function') {
    G.Herzon.registerView('resumen', mountResumen);
    G.Herzon.registerView('perfil', mountPerfil);
    G.Herzon.registerView('seguimiento', mountSeguimiento);
  }
})();
