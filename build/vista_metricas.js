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
  var SUBTITULO_ALTA_PRIMER_USO = 'Registra a tu primer cliente para empezar a capturar mediciones.';
  var TITULO_ALTA = 'Nuevo cliente';
  var TITULO_NOTA_DEMO = 'Acerca del modo demo';
  var TEXTO_BOTON_ELIMINAR_NORMAL = 'Eliminar este cliente';
  var MS_REVERSION_CONFIRMAR = 6000;

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
  // MC-04 (corrección ronda 9, hallazgo del verifier en verificación real:
  // BUG 1): el listener de `herzon:cliente-nuevo-solicitado` NO puede vivir
  // SOLO dentro de mountPerfil(), porque Herzon.registerView monta esa
  // vista de forma PEREZOSA (plan.md 3.C) -- mountPerfil solo se ejecuta la
  // primera vez que la pestaña Perfil se activa. En una carga fresca real
  // (pestaña activa por defecto = Resumen, contrato de shell.html), si el
  // usuario nunca visitó Perfil y hace clic en "Usar mis datos" (0
  // clientes) o en "+ Nuevo cliente..." del selector, Almacen.activarReal /
  // Almacen.crearCliente despachan este evento y, sin este listener a nivel
  // de módulo, se disparaba al vacío. Se registra aquí (nivel superior del
  // IIFE: se ejecuta siempre al cargar el script, antes de cualquier
  // montaje perezoso, sin tocar `document` de forma síncrona en la carga --
  // solo dentro del cuerpo diferido del manejador): deja la intención
  // marcada en `altaPendienteAlMontar` y activa la pestaña Perfil (lo que
  // dispara su primer montaje si aún no ocurrió). El listener interno
  // registrado dentro de mountPerfil (más abajo) sigue cubriendo el caso
  // "Perfil ya montada" (reapertura tras eliminar y crear de nuevo).
  // -----------------------------------------------------------------------
  var altaPendienteAlMontar = false;
  if (typeof G.addEventListener === 'function') {
    G.addEventListener('herzon:cliente-nuevo-solicitado', function () {
      altaPendienteAlMontar = true;
      if (G.document && typeof G.document.getElementById === 'function') {
        var tabPerfil = G.document.getElementById('tab-perfil');
        if (tabPerfil && typeof tabPerfil.click === 'function') { tabPerfil.click(); }
      }
    });
  }

  // -----------------------------------------------------------------------
  // Vista Perfil: UN número héroe (IMC actual) DENTRO del grid de 3 tarjetas
  // (LY-02), tarjeta clínica, tarjeta antropométrica, semáforos de
  // laboratorios en grid anidado (LY-02), edición de perfil y eliminación de
  // cliente en modo real (R8 punto 5, MC-06), y el formulario de alta de
  // cliente (MC-04, ids congelados en Adendum R9 punto 6).
  // -----------------------------------------------------------------------
  function mountPerfil(rootEl) {
    var doc = rootEl.ownerDocument;
    // El primer montaje puede nacer con el formulario de alta ya abierto si
    // el listener de módulo de arriba marcó la intención antes de que este
    // montaje perezoso ocurriera (fix BUG 1); se consume una sola vez.
    var mostrarAlta = altaPendienteAlMontar;
    altaPendienteAlMontar = false;

    function render() {
      limpiar(rootEl);
      var Almacen = obtenerAlmacen();
      var data = G.HERZON_DATA || {};
      var paciente = data.paciente || {};
      var labs = data.labs || {};
      var enReal = esModoReal(Almacen);

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

      // --- LY-02 pieza (b): 7 semáforos en grid anidado dentro de cardLabs. ---
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

      // --- R8 punto 5 + MC-06: edición de perfil y eliminación de cliente,
      // SOLO en modo real. ---
      if (enReal) {
        montarFormularioEdicionPerfil();
        montarBotonEliminarCliente();
      }

      // --- MC-04: formulario de alta de cliente (ids congelados en Adendum
      // R9 punto 6). Siempre presente en el DOM; oculto salvo que
      // `mostrarAlta` esté activo (herzon:cliente-nuevo-solicitado). ---
      montarFormularioAlta();

      // -----------------------------------------------------------------
      // R8 punto 5: edición de perfil (nombre/sexo/edad/talla/peso
      // inicial/actividad/objetivo) -> Herzon.Almacen.actualizarPerfil.
      // -----------------------------------------------------------------
      function montarFormularioEdicionPerfil() {
        var card = crear(doc, 'div', ['hz-card']);
        card.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Editar perfil'));
        var form = crear(doc, 'form', ['hz-form']);

        var campoNombre = crearCampoInput(doc, form, 'hz-editar-nombre', 'Nombre', 'text', paciente.nombre || '');
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

        var notaEstado = crear(doc, 'p', ['hz-nota']);
        form.appendChild(notaEstado);

        var botonGuardar = crear(doc, 'button', null, 'Guardar cambios');
        botonGuardar.setAttribute('type', 'submit');
        form.appendChild(botonGuardar);

        form.addEventListener('submit', function (ev) {
          if (ev && typeof ev.preventDefault === 'function') { ev.preventDefault(); }
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
          var ok = Almacen && typeof Almacen.actualizarPerfil === 'function' && Almacen.actualizarPerfil(perfilObj);
          if (!ok) {
            notaEstado.textContent = 'No se pudo guardar el perfil.';
            notaEstado.style.color = 'var(--delta-bad)';
            return;
          }
          // actualizarPerfil NO emite herzon:modo-cambiado (no es un
          // remontaje de cliente): esta vista se refresca a sí misma,
          // llamando de nuevo a la MISMA render() que la montó.
          render();
        });

        card.appendChild(form);
        rootEl.appendChild(card);
      }

      // -----------------------------------------------------------------
      // MC-06: eliminación individual con confirmación en dos pasos (texto
      // en el botón, reversión automática a los 6s).
      // -----------------------------------------------------------------
      function montarBotonEliminarCliente() {
        var clienteActual = (Almacen && typeof Almacen.clienteActivo === 'function') ? Almacen.clienteActivo() : null;
        if (!clienteActual) { return; }
        var boton = crear(doc, 'button', ['hz-doc-btn'], TEXTO_BOTON_ELIMINAR_NORMAL);
        boton.setAttribute('type', 'button');
        boton.setAttribute('id', 'hz-btn-eliminar-cliente');
        boton.setAttribute('data-confirmar', 'false');
        var temporizador = null;
        boton.addEventListener('click', function () {
          if (boton.getAttribute('data-confirmar') === 'true') {
            var temporizadorClear = (typeof G.clearTimeout === 'function') ? G.clearTimeout : clearTimeout;
            if (temporizador !== null) { temporizadorClear(temporizador); temporizador = null; }
            if (Almacen && typeof Almacen.eliminarCliente === 'function') {
              Almacen.eliminarCliente(clienteActual.id);
            }
            return;
          }
          boton.setAttribute('data-confirmar', 'true');
          boton.textContent = '¿Eliminar a ' + clienteActual.nombre + '? Confirmar';
          var temporizadorFn = (typeof G.setTimeout === 'function') ? G.setTimeout : setTimeout;
          temporizador = temporizadorFn(function () {
            boton.setAttribute('data-confirmar', 'false');
            boton.textContent = TEXTO_BOTON_ELIMINAR_NORMAL;
            temporizador = null;
          }, MS_REVERSION_CONFIRMAR);
        });
        rootEl.appendChild(boton);
      }

      // -----------------------------------------------------------------
      // MC-04: formulario de alta de cliente. Ids congelados (Adendum R9
      // punto 6). Oculto por default; `herzon:cliente-nuevo-solicitado` lo
      // muestra (ver el listener de abajo, fuera de render()).
      // -----------------------------------------------------------------
      function montarFormularioAlta() {
        var form = crear(doc, 'form', ['hz-form']);
        form.setAttribute('id', 'hz-form-alta-cliente');
        if (!mostrarAlta) {
          form.setAttribute('hidden', '');
          // build/shell.html (fuera de este POSEE) declara `.hz-form {
          // display: flex; ... }` como regla de AUTOR, que en la cascada de
          // CSS gana sobre `[hidden] { display: none; }` del navegador
          // (origen user-agent) sin importar especificidad -- el mismo
          // patrón que shell.html ya resuelve para .hz-vista con la regla
          // aditiva `.hz-vista[hidden] { display: none; }`, pero que NO
          // existe para .hz-form. Verificado visualmente en Chrome headless
          // (scratchpad/r9/full-t040.png intento 1: el formulario de alta
          // se veía SIEMPRE, con o sin `hidden`). En vez de depender de un
          // cambio en shell.html, se fija el display inline (mayor
          // precedencia que cualquier regla de hoja de estilos) -- oculta
          // de forma robusta sin importar el CSS externo.
          form.style.display = 'none';
        }

        form.appendChild(crear(doc, 'h3', ['hz-card-title'], TITULO_ALTA));

        var clientesCount = (Almacen && typeof Almacen.clientes === 'function') ? Almacen.clientes().length : 0;
        if (clientesCount === 0) {
          form.appendChild(crear(doc, 'p', ['hz-nota'], SUBTITULO_ALTA_PRIMER_USO));
        }
        form.appendChild(crear(doc, 'p', ['hz-nota'], NOTA_PRIVACIDAD_ALTA));

        var campoNombre = crearCampoInput(doc, form, 'hz-alta-nombre', 'Nombre', 'text', '');
        var campoSexo = crearCampoSelect(doc, form, 'hz-alta-sexo', 'Sexo', OPCIONES_SEXO);
        var campoEdad = crearCampoInput(doc, form, 'hz-alta-edad', 'Edad (años)', 'number', '', { min: 1, max: 120, step: 1 });
        var campoTalla = crearCampoInput(doc, form, 'hz-alta-talla', 'Talla (cm)', 'number', '', { min: 50, max: 250, step: 1 });
        var campoPeso = crearCampoInput(doc, form, 'hz-alta-peso', 'Peso (kg)', 'number', '', { min: 20, max: 400, step: 0.1 });
        var campoActividad = crearCampoSelect(doc, form, 'hz-alta-actividad', 'Nivel de actividad',
          opcionesActividad(data.factoresActividad));
        var campoObjetivo = crearCampoInput(doc, form, 'hz-alta-objetivo', 'Objetivo', 'text', '');

        var errorEl = crear(doc, 'p');
        errorEl.setAttribute('id', 'hz-alta-error');
        errorEl.style.color = 'var(--delta-bad)';
        form.appendChild(errorEl);

        var acciones = crear(doc, 'div');
        var botonCrear = crear(doc, 'button', null, 'Crear cliente');
        botonCrear.setAttribute('type', 'submit');
        botonCrear.setAttribute('id', 'hz-btn-crear-cliente');
        acciones.appendChild(botonCrear);

        // MC-04: "Cancelar" visible solo si ya existe al menos un cliente o
        // se está en demo.
        if (clientesCount >= 1 || !enReal) {
          var botonCancelar = crear(doc, 'button', null, 'Cancelar');
          botonCancelar.setAttribute('type', 'button');
          botonCancelar.setAttribute('id', 'hz-btn-cancelar-alta');
          botonCancelar.addEventListener('click', function (ev) {
            if (ev && typeof ev.preventDefault === 'function') { ev.preventDefault(); }
            mostrarAlta = false;
            render();
          });
          acciones.appendChild(botonCancelar);
        }
        form.appendChild(acciones);

        form.addEventListener('submit', function (ev) {
          if (ev && typeof ev.preventDefault === 'function') { ev.preventDefault(); }
          errorEl.textContent = '';
          campoNombre.input.style.borderColor = '';
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
            campoNombre.input.style.borderColor = 'var(--delta-bad)';
            errorEl.textContent = (res && res.errores && res.errores.length) ? res.errores.join(' ') : 'No se pudo crear el cliente.';
            return;
          }
          mostrarAlta = false;
          // Éxito (corrección ronda 9, hallazgo del verifier en
          // verificación real: BUG 2): crearCliente ya disparó
          // herzon:modo-cambiado de forma SÍNCRONA (Adendum R9 punto 3)
          // DENTRO de esta misma llamada -- ese render intermedio ocurrió
          // con `mostrarAlta` todavía en `true` (el valor de ANTES de esta
          // línea), así que reconstruyó el formulario visible. Se fuerza
          // aquí un segundo render explícito, ya con `mostrarAlta` en
          // `false`, que cierra el formulario y deja el perfil vacío del
          // nuevo cliente ya montado (mismo patrón que
          // montarFormularioEdicionPerfil usa tras actualizarPerfil).
          render();
        });

        rootEl.appendChild(form);
      }
    }

    render();

    if (typeof G.addEventListener === 'function') {
      G.addEventListener('herzon:modo-cambiado', function () { render(); });
      // MC-04: activa la pestaña Perfil (solo DOM real -- TestDOM no
      // implementa getElementById/click, así que este bloque no-opera en el
      // selfcheck) y muestra el formulario de alta.
      G.addEventListener('herzon:cliente-nuevo-solicitado', function () {
        var docReal = rootEl.ownerDocument;
        if (docReal && typeof docReal.getElementById === 'function') {
          var tabPerfil = docReal.getElementById('tab-perfil');
          if (tabPerfil && typeof tabPerfil.click === 'function') { tabPerfil.click(); }
        }
        mostrarAlta = true;
        render();
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

      var card = crear(doc, 'div', ['hz-card']);
      card.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Registrar medición'));
      card.appendChild(crear(doc, 'p', ['hz-nota'], NOTA_PRIVACIDAD_CAPTURA));
      card.appendChild(crear(doc, 'p', ['hz-nota'], 'Fecha: ' + fechaHoyTexto()));

      var form = crear(doc, 'form', ['hz-form']);

      var campoPeso = crearCampoInput(doc, form, 'hz-cap-peso', 'Peso (kg)', 'number', '', { min: 20, max: 400, step: 0.1 });
      var campoGrasa = crearCampoInput(doc, form, 'hz-cap-grasa', 'Grasa corporal (%)', 'number', '', { min: 3, max: 70, step: 0.1 });
      var campoMusculo = crearCampoInput(doc, form, 'hz-cap-musculo', 'Masa muscular (kg)', 'number', '', { min: 5, max: 150, step: 0.1 });
      var campoCintura = crearCampoInput(doc, form, 'hz-cap-cintura', 'Circunferencia de cintura (cm)', 'number', '', { min: 40, max: 250, step: 0.1 });

      var detalles = crear(doc, 'details');
      detalles.appendChild(crear(doc, 'summary', null, 'Plicometría (opcional)'));
      var campoTricipital = crearCampoInput(doc, detalles, 'hz-cap-plic-tricipital', 'Pliegue tricipital (mm)', 'number', '', { min: 2, max: 80, step: 0.1 });
      var campoSubescapular = crearCampoInput(doc, detalles, 'hz-cap-plic-subescapular', 'Pliegue subescapular (mm)', 'number', '', { min: 2, max: 80, step: 0.1 });
      var campoSuprailiaco = crearCampoInput(doc, detalles, 'hz-cap-plic-suprailiaco', 'Pliegue suprailiaco (mm)', 'number', '', { min: 2, max: 80, step: 0.1 });
      var campoAbdominal = crearCampoInput(doc, detalles, 'hz-cap-plic-abdominal', 'Pliegue abdominal (mm)', 'number', '', { min: 2, max: 80, step: 0.1 });
      form.appendChild(detalles);

      var notaValidacion = crear(doc, 'p', ['hz-nota']);
      form.appendChild(notaValidacion);

      var botonGuardar = crear(doc, 'button', null, 'Registrar medición');
      botonGuardar.setAttribute('type', 'submit');
      form.appendChild(botonGuardar);

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
      // laboratorio: no hay UI de captura para esto en este alcance). ---
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
