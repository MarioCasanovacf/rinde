// build/vista_dieta_supl.js
// U-VISTAS-A (T-004): vistas "Plan de dieta" y "Suplementos".
// Registra window.Herzon.Views.plan y window.Herzon.Views.suplementos, y llama
// Herzon.registerView('plan', ...) / Herzon.registerView('suplementos', ...)
// (API publicada por T-002, contrato .harness/plan.md sección 3.C).
//
// Consume window.HERZON_DATA (T-001, forma congelada en plan.md 3.I) y
// window.Herzon.Charts.* (T-003, API congelada en plan.md 3.B). No conoce ni
// modifica build/data.js ni build/charts.js.
//
// Método de gráficas: skill dataviz (marks-and-anatomy.md, interaction.md,
// anti-patterns.md) y .harness/design-contract-herzon.md secciones 2, 3 y 4.
// Reglas duras aplicadas aquí: regla 7 (leyenda >=2 series, etiqueta directa
// selectiva), regla 9 (toggle "Ver tabla" en toda .hz-chart), regla 11
// (exactamente UN .hz-hero por vista), regla 12 (n/a: esta vista no lleva el
// filtro de rango de fechas, exclusivo de Seguimiento).
//
// Preámbulo obligatorio (plan.md 3.A): script clásico, IIFE, sin
// import/export. Prohibido tocar `document` en el nivel superior del módulo:
// todo acceso al DOM ocurre dentro de las funciones `montarVistaPlan` y
// `montarVistaSuplementos`, invocadas por el shell (o por el selfcheck) con
// el contenedor ya presente.
(function () {
  var G = (typeof window !== 'undefined') ? window : globalThis;
  G.Herzon = G.Herzon || {};
  G.Herzon.Views = G.Herzon.Views || {};

  // -----------------------------------------------------------------------
  // Utilidades locales de DOM (sin document en el nivel superior: reciben
  // siempre `doc` = contenedorEl.ownerDocument, igual que build/charts.js).
  // -----------------------------------------------------------------------
  function crearHTML(doc, tag) {
    return doc.createElement(tag);
  }

  function limpiar(el) {
    el.textContent = '';
  }

  function crearCard(doc, contenedorEl, tituloTexto) {
    var card = crearHTML(doc, 'div');
    card.classList.add('hz-card');
    if (tituloTexto) {
      var titulo = crearHTML(doc, 'div');
      titulo.classList.add('hz-card-title');
      titulo.textContent = tituloTexto;
      card.appendChild(titulo);
    }
    contenedorEl.appendChild(card);
    return card;
  }

  // Número héroe manual (Herzon.Charts no publica una primitiva "hero": las
  // clases hz-hero / hz-hero-num / hz-hero-label son de chrome, congeladas en
  // plan.md 3.G y estilizadas por T-002). Regla 11: exactamente UN .hz-hero.
  function crearHero(doc, contenedorEl, etiquetaTexto) {
    var raiz = crearHTML(doc, 'div');
    raiz.classList.add('hz-hero');
    var num = crearHTML(doc, 'div');
    num.classList.add('hz-hero-num');
    var label = crearHTML(doc, 'div');
    label.classList.add('hz-hero-label');
    label.textContent = etiquetaTexto;
    raiz.appendChild(num);
    raiz.appendChild(label);
    contenedorEl.appendChild(raiz);
    return { raiz: raiz, num: num };
  }

  function crearCampoSelect(doc, formEl, idCampo, etiquetaTexto, opciones) {
    var campo = crearHTML(doc, 'div');
    campo.classList.add('hz-form-campo');

    var etiqueta = crearHTML(doc, 'label');
    etiqueta.setAttribute('for', idCampo);
    etiqueta.textContent = etiquetaTexto;

    var select = crearHTML(doc, 'select');
    select.setAttribute('id', idCampo);
    for (var i = 0; i < opciones.length; i++) {
      var opcion = crearHTML(doc, 'option');
      opcion.setAttribute('value', opciones[i].valor);
      opcion.textContent = opciones[i].etiqueta;
      select.appendChild(opcion);
    }

    campo.appendChild(etiqueta);
    campo.appendChild(select);
    formEl.appendChild(campo);
    return { campo: campo, select: select };
  }

  function construirTablaSimple(doc, contenedorEl, columnas, filas) {
    var wrap = crearHTML(doc, 'div');
    wrap.classList.add('hz-table-wrap');

    var tabla = crearHTML(doc, 'table');
    tabla.classList.add('hz-table');

    var thead = crearHTML(doc, 'thead');
    var trEncabezado = crearHTML(doc, 'tr');
    for (var c = 0; c < columnas.length; c++) {
      var th = crearHTML(doc, 'th');
      th.setAttribute('scope', 'col');
      th.textContent = columnas[c];
      trEncabezado.appendChild(th);
    }
    thead.appendChild(trEncabezado);
    tabla.appendChild(thead);

    var tbody = crearHTML(doc, 'tbody');
    for (var f = 0; f < filas.length; f++) {
      var tr = crearHTML(doc, 'tr');
      var fila = filas[f];
      for (var i = 0; i < fila.length; i++) {
        var esPrimera = i === 0;
        var celda = crearHTML(doc, esPrimera ? 'th' : 'td');
        if (esPrimera) celda.setAttribute('scope', 'row');
        else celda.style.fontVariantNumeric = 'tabular-nums';
        var valor = fila[i];
        celda.textContent = (valor === null || valor === undefined) ? '' : String(valor);
        tr.appendChild(celda);
      }
      tbody.appendChild(tr);
    }
    tabla.appendChild(tbody);
    wrap.appendChild(tabla);
    contenedorEl.appendChild(wrap);
    return wrap;
  }

  function formatearEntero(v) {
    if (typeof v !== 'number' || isNaN(v)) return '';
    var redondeado = Math.round(v);
    var negativo = redondeado < 0;
    var texto = String(Math.abs(redondeado)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (negativo ? '-' : '') + texto;
  }

  // -----------------------------------------------------------------------
  // Menú del día (Adendum R4, T-017): reemplaza la tabla apretada de
  // "Detalle del día" por una fila-card por comida (.hz-menu-item), con el
  // platillo COMPLETO (esta zona NO hereda el white-space:nowrap de
  // .hz-table: el texto envuelve) y una mini barra apilada de macros de esa
  // comida en CSS con tokens (colores por token, gap de 2px). Clases nuevas
  // SOLO con prefijo hz-menu- (plan.md Adendum R4 punto 2; estilos en
  // build/shell.html por regla 3.G).
  // -----------------------------------------------------------------------
  function construirFilaMenuComida(doc, listaEl, comida) {
    var item = crearHTML(doc, 'div');
    item.classList.add('hz-menu-item');

    var hora = crearHTML(doc, 'div');
    hora.classList.add('hz-menu-hora');
    hora.textContent = comida.hora;
    item.appendChild(hora);

    var nombreWrap = crearHTML(doc, 'div');
    nombreWrap.classList.add('hz-menu-nombre');
    var momento = crearHTML(doc, 'span');
    momento.classList.add('hz-menu-momento');
    momento.textContent = (NOMBRES_MOMENTO[comida.momento] || comida.momento) + ': ';
    var platillo = crearHTML(doc, 'span');
    platillo.classList.add('hz-menu-platillo');
    platillo.textContent = comida.nombre;
    nombreWrap.appendChild(momento);
    nombreWrap.appendChild(platillo);
    item.appendChild(nombreWrap);

    var kcal = crearHTML(doc, 'div');
    kcal.classList.add('hz-menu-kcal');
    kcal.textContent = formatearEntero(comida.kcal) + ' kcal';
    item.appendChild(kcal);

    // Mini barra apilada de macros de ESTA comida: ancho proporcional a las
    // kcal que aporta cada macro (proteína y carbohidrato 4 kcal/g, grasa
    // 9 kcal/g), asignación de color fija del contrato (proteína=series-1,
    // carbohidrato=series-2, grasa=series-3), gap de 2px vía CSS.
    var macros = crearHTML(doc, 'div');
    macros.classList.add('hz-menu-macros');
    var kcalProteina = comida.proteina_g * 4;
    var kcalCarbohidrato = comida.carbohidrato_g * 4;
    var kcalGrasa = comida.grasa_g * 9;
    var kcalMacrosTotal = kcalProteina + kcalCarbohidrato + kcalGrasa;
    if (kcalMacrosTotal <= 0) { kcalMacrosTotal = 1; }
    [
      { color: 'var(--series-1)', kcal: kcalProteina },
      { color: 'var(--series-2)', kcal: kcalCarbohidrato },
      { color: 'var(--series-3)', kcal: kcalGrasa }
    ].forEach(function (seg) {
      var segEl = crearHTML(doc, 'div');
      segEl.classList.add('hz-menu-macro-seg');
      segEl.style.width = (seg.kcal / kcalMacrosTotal * 100) + '%';
      segEl.style.backgroundColor = seg.color;
      macros.appendChild(segEl);
    });
    item.appendChild(macros);

    listaEl.appendChild(item);
    return item;
  }

  // -----------------------------------------------------------------------
  // Vista "Plan de dieta"
  // -----------------------------------------------------------------------
  var NOMBRES_MOMENTO = {
    desayuno: 'Desayuno',
    colacion_manana: 'Colación matutina',
    comida: 'Comida',
    colacion_tarde: 'Colación vespertina',
    cena: 'Cena'
  };

  var ETIQUETAS_OBJETIVO = {
    recomposicion_corporal: 'Recomposición corporal',
    control_glucemico: 'Control glucémico'
  };

  var ETIQUETAS_RESTRICCION = {
    sin_frutos_secos_de_arbol: 'Alergia a frutos secos de árbol (nuez)',
    bajo_en_carbohidratos: 'Preferencia baja en carbohidratos'
  };

  // -----------------------------------------------------------------------
  // R8 (Adendum R8 punto 4) + R9: estados vacíos en modo real. Textos
  // exactos pinneados por este mismo selfcheck (build/selfcheck_vistas_a.js);
  // si cambian, el pin se actualiza en el MISMO cambio.
  // -----------------------------------------------------------------------
  var TEXTO_VACIO_PLAN = 'Aún no tienes un plan aplicado. Usa el recomendador de aquí abajo para elegir y aplicar una plantilla a tu perfil.';
  var TEXTO_VACIO_SUPLEMENTOS = 'Sin datos aún — no hay suplementos registrados en tu régimen.';

  // -----------------------------------------------------------------------
  // C3 (síntesis R9, hallazgo LY-05): rótulos cortos de despliegue para la
  // gráfica de barras de adherencia por suplemento -- el nombre completo con
  // dosis ya vive en la tabla "Régimen de suplementos" (cardRegimen, arriba
  // de la gráfica en el DOM). Diccionario exacto para el catálogo sintético
  // de build/data.js, con un fallback data-driven (recorta el calificador
  // entre paréntesis y se queda con las 2 primeras palabras) para cualquier
  // régimen futuro fuera de ese catálogo.
  // -----------------------------------------------------------------------
  var ETIQUETAS_CORTAS_SUPLEMENTO = {
    'Omega-3 (aceite de pescado)': 'Omega-3',
    'Vitamina D3': 'Vitamina D3',
    'Magnesio quelado': 'Magnesio',
    'Probiótico multiflora': 'Probiótico'
  };

  function etiquetaCortaSuplemento(nombreCompleto) {
    if (Object.prototype.hasOwnProperty.call(ETIQUETAS_CORTAS_SUPLEMENTO, nombreCompleto)) {
      return ETIQUETAS_CORTAS_SUPLEMENTO[nombreCompleto];
    }
    var sinCalificador = String(nombreCompleto || '').replace(/\s*\([^)]*\)\s*$/, '');
    var palabras = sinCalificador.split(' ').filter(function (p) { return p.length > 0; });
    return palabras.slice(0, 2).join(' ') || sinCalificador;
  }

  // Deriva las opciones del formulario directamente de HERZON_DATA.planes
  // (plan.indicadoPara), sin lista clínica hardcodeada: P2 del coordinador
  // prohíbe un motor clínico real, y la selección "sale de plan.indicadoPara".
  function derivarOpciones(planes, campo) {
    var vistos = {};
    var orden = [];
    for (var i = 0; i < planes.length; i++) {
      var valores = (planes[i].indicadoPara && planes[i].indicadoPara[campo]) || [];
      for (var j = 0; j < valores.length; j++) {
        if (!vistos[valores[j]]) { vistos[valores[j]] = true; orden.push(valores[j]); }
      }
    }
    return orden;
  }

  // Sin motor clínico real (P2): puntaje simple a partir de plan.indicadoPara.
  // OPEN-QUESTION (registrada también en el handoff de T-004): con las 2
  // variantes actuales, ambos planes listan AMBOS objetivos en
  // indicadoPara.objetivo, así que el campo "objetivo" no alcanza por sí solo
  // a discriminar entre planes; el campo "restricción/alergia" sí lo hace,
  // porque cada plan tiene una restricción primaria distinta
  // (indicadoPara.restriccion[0]). El formulario deja ambos campos activos
  // (la fórmula usa los dos) para no cerrar la puerta si T-001 agrega un
  // tercer plan más adelante con objetivos disjuntos.
  function elegirPlan(planes, objetivoSel, restriccionSel) {
    var mejor = planes[0];
    var mejorPuntaje = -1;
    for (var i = 0; i < planes.length; i++) {
      var p = planes[i];
      var ind = p.indicadoPara || {};
      var puntaje = 0;
      if (ind.objetivo && ind.objetivo.indexOf(objetivoSel) !== -1) puntaje += 1;
      if (ind.restriccion && ind.restriccion.indexOf(restriccionSel) !== -1) puntaje += 1;
      if (ind.restriccion && ind.restriccion[0] === restriccionSel) puntaje += 1;
      if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = p; }
    }
    return mejor;
  }

  // -----------------------------------------------------------------------
  // Recomendador de plan (Adendum R5, T-022): calculadora de necesidades
  // (TMB/GET/kcal objetivo/macros vía Herzon.Motor, T-020) + ranking de
  // plantillas con razones + Herzon.planActivo() (Adendum R5 punto 4).
  // Estado a nivel de módulo (no ligado al montaje de la vista): permite que
  // Herzon.planActivo() responda incluso antes de que la pestaña "Plan de
  // dieta" se haya activado alguna vez (inicialización perezosa, ver
  // obtenerRecoEstado). Ninguna función de esta sección toca `document` en
  // el nivel superior del módulo (plan.md 3.A): todo el cálculo corre bajo
  // demanda dentro de funciones.
  // -----------------------------------------------------------------------
  function redondear(n) {
    return Math.round(n);
  }

  function formatoEscala(n) {
    return n.toFixed(2) + 'x';
  }

  // Traduce el texto legible de HERZON_DATA.paciente.objetivo (p. ej.
  // "Recomposición corporal") al vocabulario que espera Herzon.Motor
  // ('perdida' | 'recomposicion' | 'mantener' | 'ganancia'). No hay motor
  // clínico real (P2): esto es una correspondencia de texto, no un cálculo.
  function objetivoMotorDesdeTexto(texto) {
    var normalizado = String(texto || '').toLowerCase();
    if (normalizado.indexOf('recomposici') !== -1) return 'recomposicion';
    if (normalizado.indexOf('perdida') !== -1 || normalizado.indexOf('pérdida') !== -1) return 'perdida';
    if (normalizado.indexOf('ganancia') !== -1) return 'ganancia';
    return 'mantener';
  }

  var ETIQUETAS_SEXO_MOTOR = { femenino: 'Femenino', masculino: 'Masculino' };

  var ETIQUETAS_FACTOR_ACTIVIDAD = {
    sedentario: 'Sedentario (poco o nada de ejercicio)',
    ligero: 'Actividad ligera (1 a 3 días por semana)',
    moderado: 'Actividad moderada (3 a 5 días por semana)',
    intenso: 'Actividad intensa (6 a 7 días por semana)'
  };

  var ETIQUETAS_OBJETIVO_MOTOR = {
    perdida: 'Pérdida de grasa',
    recomposicion: 'Recomposición corporal',
    mantener: 'Mantenimiento',
    ganancia: 'Ganancia muscular'
  };

  function planPorId(HERZON_DATA, id) {
    var encontrados = HERZON_DATA.planes.filter(function (p) { return p.id === id; });
    return encontrados.length ? encontrados[0] : null;
  }

  // El plan activo del recomendador: el que el usuario eligió a mano en el
  // ranking (data-plan-id de un botón "Usar este plan"), o si aún no eligió
  // ninguno, la plantilla mejor rankeada (primera de est.ranking).
  function planSeleccionadoActivo(est, HERZON_DATA) {
    if (est.planIdSeleccionado) {
      var encontrado = planPorId(HERZON_DATA, est.planIdSeleccionado);
      if (encontrado) return encontrado;
    }
    // R6 (prod-2): en modo automático (sin elección explícita en el
    // recomendador) la fuente de verdad es la MISMA que usa la card
    // "Personaliza tu plan" (objetivo/restricción) -- así el resto de la
    // vista y Herzon.planActivo() nunca contradicen qué plantilla está
    // activa. Antes caía al mejor score del ranking, que podía ser una
    // plantilla distinta a la que el formulario ya mostraba.
    if (est.filtroObjetivo || est.filtroRestriccion) {
      var porFiltro = elegirPlan(HERZON_DATA.planes, est.filtroObjetivo, est.filtroRestriccion);
      if (porFiltro) return porFiltro;
    }
    if (est.ranking && est.ranking.length) return est.ranking[0].plan;
    return HERZON_DATA.planes[0];
  }

  // Perfil precargado con el perfil del paciente sintético (plan.md
  // Adendum R5 punto 4: "formulario precargado con el perfil"). El peso
  // usado es pesoInicial_kg (no pesoActual_kg): es el que reproduce
  // EXACTAMENTE el ancla de verificación del Adendum R5 (TMB 1432, GET
  // 1969 con factor 'ligero'), que además es el mismo factor con el que
  // build/data.js ya precalculó paciente.gastoEnergetico.
  function crearRecoEstadoInicial() {
    var HERZON_DATA = G.HERZON_DATA;
    var paciente = HERZON_DATA.paciente;
    // R8 (Adendum R8 punto 4): en modo real, paciente.actividad es la clave
    // ADITIVA que expone Herzon.Almacen (construirPacienteDesdePerfil) con
    // el nivel de actividad REAL capturado en el alta/edición de perfil --
    // se precarga aquí para no adivinar. En demo esa clave no existe (el
    // paciente sintético de build/data.js no la trae) y el default sigue
    // siendo 'ligero' (reproduce el ancla de verificación TMB 1432/GET 1969
    // del Adendum R5, que no cambia).
    var factorPrecargado = (paciente.actividad && HERZON_DATA.factoresActividad &&
      Object.prototype.hasOwnProperty.call(HERZON_DATA.factoresActividad, paciente.actividad))
      ? paciente.actividad
      : 'ligero';
    // MC-07 (Adendum R9 punto 3): HERZON_DATA.planAplicado es la clave
    // ADITIVA que expone Herzon.Almacen al montar un cliente real, con el
    // slot `plan` persistido de ESE cliente (null si aún no aplicó ninguna
    // plantilla). Precargar la selección aquí evita que Herzon.planActivo()
    // resuelva por accidente el plan de OTRO cliente/modo mientras el
    // usuario no ha vuelto a elegir nada en este panel. En demo esa clave no
    // existe (undefined) y planIdPrecargado cae en null -- comportamiento
    // actual, sin cambios.
    var planAplicadoPersistido = HERZON_DATA.planAplicado;
    var planIdPrecargado = (planAplicadoPersistido && planAplicadoPersistido.plantillaId &&
      planPorId(HERZON_DATA, planAplicadoPersistido.plantillaId))
      ? planAplicadoPersistido.plantillaId
      : null;
    return {
      perfil: {
        sexo: paciente.sexo,
        edad: paciente.edad,
        tallaCm: paciente.talla_cm,
        pesoKg: paciente.pesoInicial_kg,
        factorClave: factorPrecargado,
        objetivo: objetivoMotorDesdeTexto(paciente.objetivo)
      },
      necesidades: null,      // { tmb, get, kcal, proteina_g, carbohidrato_g, grasa_g }
      ranking: null,          // [{ plan, score, razones[] }] descendente (Herzon.Motor.recomendar)
      planIdSeleccionado: planIdPrecargado, // MC-07: precargado desde HERZON_DATA.planAplicado, o null = automático (el mejor rankeado)
      kcalManual: null,       // override manual del kcal objetivo mostrado, o null = usa el de la plantilla
      escalaPorciones: 1,     // 0.8 - 1.2
      // R6 (prod-2, claves ADITIVAS, plan.md Adendum R6 punto 3): la card
      // "Personaliza tu plan" (objetivo/restricción) y Herzon.planActivo()
      // deben coincidir SIEMPRE en modo automático (planIdSeleccionado nulo);
      // antes, cada uno resolvía la plantilla por su cuenta (el formulario
      // vía elegirPlan, planActivo() vía el mejor score del ranking) y podían
      // apuntar a plantillas distintas, mostrando kcal contradictorias entre
      // la vista principal y el panel del recomendador. Se comparten aquí.
      filtroObjetivo: derivarOpciones(HERZON_DATA.planes, 'objetivo')[0] || null,
      filtroRestriccion: derivarOpciones(HERZON_DATA.planes, 'restriccion')[0] || null
    };
  }

  function recalcularNecesidadesYRanking(est) {
    var Motor = G.Herzon.Motor;
    var HERZON_DATA = G.HERZON_DATA;
    var factor = HERZON_DATA.factoresActividad[est.perfil.factorClave] || HERZON_DATA.factoresActividad.ligero;
    var tmb = Motor.tmb({ sexo: est.perfil.sexo, pesoKg: est.perfil.pesoKg, tallaCm: est.perfil.tallaCm, edad: est.perfil.edad });
    var get = Motor.get(tmb, factor);
    var kcalCalculado = Motor.kcalObjetivo(get, est.perfil.objetivo);
    var macrosCalculados = Motor.macrosObjetivo({ kcal: kcalCalculado, pesoKg: est.perfil.pesoKg, objetivo: est.perfil.objetivo });
    est.necesidades = {
      tmb: tmb,
      get: get,
      kcal: kcalCalculado,
      proteina_g: macrosCalculados.proteina_g,
      carbohidrato_g: macrosCalculados.carbohidrato_g,
      grasa_g: macrosCalculados.grasa_g
    };
    est.ranking = Motor.recomendar(
      {
        kcal: est.necesidades.kcal,
        proteina_g: est.necesidades.proteina_g,
        carbohidrato_g: est.necesidades.carbohidrato_g,
        grasa_g: est.necesidades.grasa_g
      },
      HERZON_DATA.planes
    );
  }

  // Estado a nivel de módulo, inicialización perezosa (no requiere DOM ni
  // que la vista se haya montado): así Herzon.planActivo() puede llamarse
  // en cualquier momento tras cargar este script.
  var recoEstadoSingleton = null;
  function obtenerRecoEstado() {
    if (!recoEstadoSingleton) {
      recoEstadoSingleton = crearRecoEstadoInicial();
      recalcularNecesidadesYRanking(recoEstadoSingleton);
    }
    return recoEstadoSingleton;
  }

  // -----------------------------------------------------------------------
  // R9 (Adendum R9 punto 3, MC-02/MC-07): referencias de re-montaje. Cada
  // vista se monta UNA sola vez (Herzon.registerView, plan.md 3.C); toda
  // reactividad a un cambio de cliente/modo posterior pasa por
  // herzon:modo-cambiado (ver manejarRemontajeDatos, más abajo), que
  // necesita poder volver a dibujar la vista YA montada.
  // -----------------------------------------------------------------------
  var refsMontajePlan = null;
  var refsMontajeSuplementos = null;

  // R6 (fini-4): los botones del recomendador dejan de estilizarse con
  // element.style inline y pasan a la clase congelada .hz-table-toggle
  // (plan.md Adendum R6 punto 6: "botones del recomendador via clases
  // existentes tipo .hz-table-toggle"), estilizada por build/shell.html
  // (T-026), que ya hereda :hover/:focus-visible y el estado disabled
  // (opacidad + cursor) sin que este módulo declare un solo estilo propio.

  // R6 (jera-6): distingue el par "proteína suficiente"/"insuficiente" del
  // resto de las razones del ranking con el patrón punto de estatus
  // (.hz-status-dot + .hz-status-label, clases congeladas en plan.md 3.G,
  // ya usadas por build/vista_metricas.js). "insuficiente" contiene la
  // subcadena "suficiente" en medio de otra palabra, así que se prueba
  // primero para no confundirla con "suficiente" a secas.
  function estadoDesdeRazon(texto) {
    var normalizado = String(texto || '').toLowerCase();
    if (normalizado.indexOf('insuficiente') !== -1) return 'warning';
    if (normalizado.indexOf('suficiente') !== -1) return 'good';
    return null;
  }

  function capitalizarPrimeraLetra(texto) {
    if (!texto) return texto;
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  // Pinta las razones del ranking como UNA línea de texto normal (jera-6):
  // 0.85rem, sentence case (solo la primera razón capitalizada; el resto
  // conserva el texto en minúsculas que ya produce Herzon.Motor), color
  // var(--text-secondary) y razones separadas por ' · ' -- ya NO chips
  // .hz-badge (ese queda reservado a rótulos cortos reales, plan.md
  // Adendum R6 punto 6). R9 (LY-06b): .hz-reco-razones ya NO se fuerza a
  // "block" -- se deja el flex-wrap nativo de build/shell.html para que el
  // botón "Usar este plan" pueda vivir como último hijo de este mismo
  // contenedor, empujado a la derecha con margin-left:auto (ver
  // renderRanking, más abajo).
  function construirLineaRazones(doc, contenedorEl, razones) {
    limpiar(contenedorEl);
    contenedorEl.style.fontSize = '0.85rem';
    contenedorEl.style.color = 'var(--text-secondary)';
    for (var i = 0; i < razones.length; i++) {
      if (i > 0) contenedorEl.appendChild(doc.createTextNode(' · '));
      var textoRazon = i === 0 ? capitalizarPrimeraLetra(razones[i]) : razones[i];
      var estado = estadoDesdeRazon(razones[i]);
      if (estado) {
        var envoltura = crearHTML(doc, 'span');
        envoltura.style.display = 'inline-flex';
        envoltura.style.alignItems = 'center';
        var punto = crearHTML(doc, 'span');
        punto.classList.add('hz-status-dot');
        punto.setAttribute('data-status', estado);
        var etiquetaEstado = crearHTML(doc, 'span');
        etiquetaEstado.classList.add('hz-status-label');
        etiquetaEstado.textContent = textoRazon;
        envoltura.appendChild(punto);
        envoltura.appendChild(etiquetaEstado);
        contenedorEl.appendChild(envoltura);
      } else {
        contenedorEl.appendChild(doc.createTextNode(textoRazon));
      }
    }
  }

  function crearStat(doc, contenedorEl, etiquetaTexto) {
    var stat = crearHTML(doc, 'div');
    stat.classList.add('hz-stat');
    var label = crearHTML(doc, 'div');
    label.classList.add('hz-stat-label');
    label.textContent = etiquetaTexto;
    var num = crearHTML(doc, 'div');
    num.classList.add('hz-stat-num');
    stat.appendChild(label);
    stat.appendChild(num);
    contenedorEl.appendChild(stat);
    return { stat: stat, num: num };
  }

  function crearCampoInput(doc, contenedorEl, idCampo, etiquetaTexto, tipo, valorInicial, atributosExtra) {
    var campo = crearHTML(doc, 'div');
    campo.classList.add('hz-form-campo');

    var etiqueta = crearHTML(doc, 'label');
    etiqueta.setAttribute('for', idCampo);
    etiqueta.textContent = etiquetaTexto;

    var input = crearHTML(doc, 'input');
    input.setAttribute('id', idCampo);
    input.setAttribute('type', tipo);
    if (atributosExtra) {
      for (var clave in atributosExtra) {
        if (Object.prototype.hasOwnProperty.call(atributosExtra, clave)) {
          input.setAttribute(clave, String(atributosExtra[clave]));
        }
      }
    }
    input.value = valorInicial;

    campo.appendChild(etiqueta);
    campo.appendChild(input);
    contenedorEl.appendChild(campo);
    return { campo: campo, input: input };
  }

  // Busca un descendiente (o el propio nodo) por atributo id, sin depender
  // de querySelector/getElementById: build/testdom.js no los implementa
  // (solo expone consultarTodo/consultarUno por tag o por clase), así que
  // ningún módulo de este epic usa esos métodos (mismo patrón que el resto
  // del archivo, ver buscarPorId en build/selfcheck_vistas_a.js).
  function buscarHijoPorId(raizEl, id) {
    if (raizEl.getAttribute && raizEl.getAttribute('id') === id) return raizEl;
    var hijos = raizEl.children || [];
    for (var i = 0; i < hijos.length; i++) {
      var encontrado = buscarHijoPorId(hijos[i], id);
      if (encontrado) return encontrado;
    }
    return null;
  }

  // Construye y cablea el panel del recomendador dentro del contenedor
  // #reco-plan que publica build/shell.html (T-021, clases hz-reco-*
  // congeladas en plan.md Adendum R5 punto 5). Flujo #reco-plan: formulario
  // precargado -> necesidades (TMB/GET/kcal objetivo/macros en g) -> ranking
  // de plantillas con la recomendada destacada y razones -> modificable
  // (otra plantilla, kcal manual, escala de porciones 0.8x-1.2x).
  function montarPanelRecomendador(doc, contenedorReco, HERZON_DATA, refrescarVistaPrincipal) {
    limpiar(contenedorReco);
    var est = obtenerRecoEstado();

    var titulo = crearHTML(doc, 'div');
    titulo.classList.add('hz-card-title');
    titulo.textContent = 'Calculadora y recomendador de plan';
    contenedorReco.appendChild(titulo);

    var disclaimer = crearHTML(doc, 'p');
    disclaimer.classList.add('hz-nota');
    disclaimer.textContent = 'Cálculo estándar (fórmula de Mifflin-St Jeor) a partir de los datos que ingreses; ' +
      'no sustituye una valoración nutriológica o médica profesional.';
    contenedorReco.appendChild(disclaimer);

    // --- 1. Formulario precargado con el perfil ---
    var form = crearHTML(doc, 'form');
    form.classList.add('hz-reco-form');
    contenedorReco.appendChild(form);

    var opcionesSexo = Object.keys(ETIQUETAS_SEXO_MOTOR).map(function (v) {
      return { valor: v, etiqueta: ETIQUETAS_SEXO_MOTOR[v] };
    });
    var opcionesFactor = Object.keys(HERZON_DATA.factoresActividad).map(function (v) {
      return { valor: v, etiqueta: ETIQUETAS_FACTOR_ACTIVIDAD[v] || v };
    });
    var opcionesObjetivoMotor = Object.keys(ETIQUETAS_OBJETIVO_MOTOR).map(function (v) {
      return { valor: v, etiqueta: ETIQUETAS_OBJETIVO_MOTOR[v] };
    });

    var campoSexo = crearCampoSelect(doc, form, 'hz-reco-sexo', 'Sexo', opcionesSexo);
    var campoEdad = crearCampoInput(doc, form, 'hz-reco-edad', 'Edad (años)', 'number', String(est.perfil.edad), { min: 10, max: 100, step: 1 });
    var campoTalla = crearCampoInput(doc, form, 'hz-reco-talla', 'Talla (cm)', 'number', String(est.perfil.tallaCm), { min: 100, max: 220, step: 1 });
    var campoPeso = crearCampoInput(doc, form, 'hz-reco-peso', 'Peso (kg)', 'number', String(est.perfil.pesoKg), { min: 30, max: 250, step: 0.1 });
    var campoFactor = crearCampoSelect(doc, form, 'hz-reco-factor', 'Nivel de actividad', opcionesFactor);
    var campoObjetivoMotor = crearCampoSelect(doc, form, 'hz-reco-objetivo', 'Objetivo', opcionesObjetivoMotor);

    campoSexo.select.value = est.perfil.sexo;
    campoFactor.select.value = est.perfil.factorClave;
    campoObjetivoMotor.select.value = est.perfil.objetivo;

    function leerPerfilDeFormulario() {
      est.perfil.sexo = campoSexo.select.value;
      var edadLeida = parseInt(campoEdad.input.value, 10);
      if (!isNaN(edadLeida) && edadLeida > 0) est.perfil.edad = edadLeida;
      var tallaLeida = parseFloat(campoTalla.input.value);
      if (!isNaN(tallaLeida) && tallaLeida > 0) est.perfil.tallaCm = tallaLeida;
      var pesoLeido = parseFloat(campoPeso.input.value);
      if (!isNaN(pesoLeido) && pesoLeido > 0) est.perfil.pesoKg = pesoLeido;
      est.perfil.factorClave = campoFactor.select.value;
      est.perfil.objetivo = campoObjetivoMotor.select.value;
    }

    [campoSexo.select, campoFactor.select, campoObjetivoMotor.select, campoEdad.input, campoTalla.input, campoPeso.input]
      .forEach(function (el) { el.addEventListener('change', leerPerfilDeFormulario); });

    var accionesCalculo = crearHTML(doc, 'div');
    accionesCalculo.classList.add('hz-reco-acciones');
    contenedorReco.appendChild(accionesCalculo);

    var botonCalcular = crearHTML(doc, 'button');
    botonCalcular.setAttribute('type', 'button');
    botonCalcular.setAttribute('id', 'hz-reco-btn-calcular');
    botonCalcular.setAttribute('data-accion', 'calcular');
    botonCalcular.classList.add('hz-table-toggle');
    botonCalcular.textContent = 'Calcular necesidades';
    accionesCalculo.appendChild(botonCalcular);

    // R6 (prod-4): "Calcular" con campos vacíos/inválidos NO recalcula en
    // silencio -- marca el/los input(s) ofensivos (element.style con
    // var(--delta-bad), permitido por la regla 3.H) y pinta esta nota
    // indicando el campo. Los campos numéricos son los únicos que pueden
    // quedar vacíos o fuera de rango; los <select> siempre traen un valor
    // válido de sus <option>.
    var notaValidacion = crearHTML(doc, 'p');
    notaValidacion.classList.add('hz-nota');
    contenedorReco.appendChild(notaValidacion);

    var CAMPOS_NUMERICOS_VALIDABLES = [
      { input: campoEdad.input, etiqueta: 'Edad' },
      { input: campoTalla.input, etiqueta: 'Talla' },
      { input: campoPeso.input, etiqueta: 'Peso' }
    ];

    function validarCamposNumericos() {
      var invalidos = [];
      CAMPOS_NUMERICOS_VALIDABLES.forEach(function (campo) {
        var texto = campo.input.value;
        var numero = parseFloat(texto);
        if (texto === '' || texto === null || texto === undefined || isNaN(numero) || numero <= 0) {
          invalidos.push(campo);
        }
      });
      return invalidos;
    }

    // --- 2. Necesidades (TMB/GET/kcal objetivo/macros en g) ---
    var resumenNecesidades = crearHTML(doc, 'div');
    resumenNecesidades.classList.add('hz-reco-resumen');
    contenedorReco.appendChild(resumenNecesidades);

    var statTmb = crearStat(doc, resumenNecesidades, 'TMB (Mifflin-St Jeor)');
    var statGet = crearStat(doc, resumenNecesidades, 'Gasto energético total');
    var statKcalNecesidad = crearStat(doc, resumenNecesidades, 'Kcal objetivo calculado');
    var statProteinaNecesidad = crearStat(doc, resumenNecesidades, 'Proteína calculada (g)');
    var statCarbohidratoNecesidad = crearStat(doc, resumenNecesidades, 'Carbohidrato calculado (g)');
    var statGrasaNecesidad = crearStat(doc, resumenNecesidades, 'Grasa calculada (g)');

    function renderNecesidades() {
      statTmb.num.textContent = formatearEntero(est.necesidades.tmb) + ' kcal';
      statGet.num.textContent = formatearEntero(est.necesidades.get) + ' kcal';
      statKcalNecesidad.num.textContent = formatearEntero(est.necesidades.kcal) + ' kcal';
      statProteinaNecesidad.num.textContent = est.necesidades.proteina_g + ' g';
      statCarbohidratoNecesidad.num.textContent = est.necesidades.carbohidrato_g + ' g';
      statGrasaNecesidad.num.textContent = est.necesidades.grasa_g + ' g';
    }

    // --- 3. Ranking de plantillas con la recomendada destacada y razones ---
    var listaRanking = crearHTML(doc, 'div');
    listaRanking.classList.add('hz-reco-lista');
    contenedorReco.appendChild(listaRanking);

    function renderRanking() {
      limpiar(listaRanking);
      // "Aplicado" (data-seleccionado, botón deshabilitado) SOLO refleja una
      // elección EXPLÍCITA del usuario en este panel (est.planIdSeleccionado).
      // Antes de esa elección, ningún ítem se marca aplicado -- aunque
      // planSeleccionadoActivo()/Herzon.planActivo() ya devuelvan la mejor
      // plantilla como default razonable, esa suposición no debe pintarse
      // como "aplicada" mientras el resto de la vista siga gobernado por la
      // card "Personaliza tu plan" (objetivo/restricción, Adendum R4).
      for (var i = 0; i < est.ranking.length; i++) {
        var entrada = est.ranking[i];
        var esMejor = i === 0;
        var esAplicado = est.planIdSeleccionado === entrada.plan.id;

        var item = crearHTML(doc, 'div');
        item.classList.add('hz-reco-item');
        item.setAttribute('data-plan-id', entrada.plan.id);
        item.setAttribute('data-mejor', esMejor ? 'true' : 'false');
        item.setAttribute('data-seleccionado', esAplicado ? 'true' : 'false');

        var rank = crearHTML(doc, 'span');
        rank.classList.add('hz-reco-rank');
        rank.textContent = String(i + 1);
        item.appendChild(rank);

        var nombre = crearHTML(doc, 'span');
        nombre.classList.add('hz-reco-nombre');
        nombre.textContent = entrada.plan.nombre;
        item.appendChild(nombre);

        var score = crearHTML(doc, 'span');
        score.classList.add('hz-reco-score');
        score.textContent = entrada.score + ' / 100';
        item.appendChild(score);

        var barra = crearHTML(doc, 'div');
        barra.classList.add('hz-reco-score-barra');
        var relleno = crearHTML(doc, 'div');
        relleno.classList.add('hz-reco-score-fill');
        relleno.style.width = Math.max(0, Math.min(100, entrada.score)) + '%';
        barra.appendChild(relleno);
        item.appendChild(barra);

        var razones = crearHTML(doc, 'div');
        razones.classList.add('hz-reco-razones');
        construirLineaRazones(doc, razones, entrada.razones);
        item.appendChild(razones);

        // R9 (LY-06b): "Usar este plan" ya NO vive en su propio
        // .hz-reco-acciones (fila completa, banda vacía debajo de las
        // razones) -- se monta como ÚLTIMO hijo de .hz-reco-razones (ya
        // flex-wrap), empujado a la derecha con margin-left:auto, así
        // comparte fila con el texto de razones.
        var botonUsar = crearHTML(doc, 'button');
        botonUsar.setAttribute('type', 'button');
        botonUsar.setAttribute('data-plan-id', entrada.plan.id);
        botonUsar.setAttribute('data-accion', 'usar-plan');
        botonUsar.classList.add('hz-table-toggle');
        botonUsar.style.marginLeft = 'auto';
        if (esAplicado) {
          botonUsar.textContent = 'Plan aplicado';
          botonUsar.setAttribute('disabled', 'disabled');
        } else {
          botonUsar.textContent = 'Usar este plan';
        }
        botonUsar.addEventListener('click', function (evento) {
          var idElegido = evento.target.getAttribute('data-plan-id');
          est.planIdSeleccionado = idElegido;
          // Al aplicar una nueva plantilla el usuario arranca limpio: kcal
          // manual y escala de porciones se reinician a los valores propios
          // de la plantilla recién elegida.
          est.kcalManual = null;
          est.escalaPorciones = 1;
          campoKcalManual.input.value = '';
          campoEscala.input.value = '1';
          actualizarEtiquetaEscala(1);
          // MC-07 (Adendum R9 punto 3): en modo real, aplicar una plantilla
          // la persiste en el cliente activo (Herzon.Almacen.guardarPlan) y
          // expone HERZON_DATA.planAplicado de inmediato -- así el
          // documento imprimible (build/documentos.js) y el estado vacío de
          // esta misma vista (sinPlanAplicado en render(), ver
          // montarVistaPlan) nunca leen el plan de OTRO cliente. En demo,
          // Herzon.Almacen.modo() es 'demo' y este bloque no hace nada (sin
          // cambios, no-regresión).
          var AlmacenReco = G.Herzon.Almacen;
          if (AlmacenReco && typeof AlmacenReco.modo === 'function' && AlmacenReco.modo() === 'real') {
            var planElegidoParaGuardar = planPorId(HERZON_DATA, idElegido);
            AlmacenReco.guardarPlan({
              plantillaId: idElegido,
              kcalObjetivo: planElegidoParaGuardar ? planElegidoParaGuardar.kcalObjetivo : null
            });
          }
          renderRanking();
          renderPlanAplicado();
          refrescarVistaPrincipal();
        });
        razones.appendChild(botonUsar);

        listaRanking.appendChild(item);
      }
    }

    // --- 4. Modificable: kcal objetivo manual + escala de porciones ---
    var accionesModificar = crearHTML(doc, 'div');
    accionesModificar.classList.add('hz-reco-acciones');
    contenedorReco.appendChild(accionesModificar);

    var campoKcalManual = crearCampoInput(
      doc, accionesModificar, 'hz-reco-kcal-manual', 'Kcal objetivo manual (opcional)',
      'number', '', { min: 800, max: 5000, step: 10, placeholder: 'Automático' }
    );
    // R6 (prod-8): el valor vivo de la escala se muestra JUNTO a su
    // etiqueta ("Escala de porciones: 1.00x"), no como un span aparte que
    // el layout de .hz-form-campo (columna) termina separando en su propia
    // línea. La <label> del campo es el propio texto dinámico.
    var campoEscalaDiv = crearHTML(doc, 'div');
    campoEscalaDiv.classList.add('hz-form-campo');
    var etiquetaEscala = crearHTML(doc, 'label');
    etiquetaEscala.setAttribute('for', 'hz-reco-escala');
    var inputEscala = crearHTML(doc, 'input');
    inputEscala.setAttribute('id', 'hz-reco-escala');
    inputEscala.setAttribute('type', 'range');
    inputEscala.setAttribute('min', '0.8');
    inputEscala.setAttribute('max', '1.2');
    inputEscala.setAttribute('step', '0.05');
    inputEscala.value = '1';
    inputEscala.classList.add('hz-reco-slider');
    campoEscalaDiv.appendChild(etiquetaEscala);
    campoEscalaDiv.appendChild(inputEscala);
    accionesModificar.appendChild(campoEscalaDiv);
    var campoEscala = { campo: campoEscalaDiv, input: inputEscala };

    function actualizarEtiquetaEscala(valorNum) {
      etiquetaEscala.textContent = 'Escala de porciones: ' + formatoEscala(valorNum);
    }
    actualizarEtiquetaEscala(1);

    campoKcalManual.input.addEventListener('change', function (evento) {
      var valorTexto = evento.target.value;
      if (valorTexto === '' || valorTexto === null || valorTexto === undefined) {
        est.kcalManual = null;
      } else {
        var valorNum = parseFloat(valorTexto);
        est.kcalManual = isNaN(valorNum) ? null : redondear(valorNum);
      }
      renderPlanAplicado();
    });

    campoEscala.input.addEventListener('input', function (evento) {
      var valorNum = parseFloat(evento.target.value);
      if (isNaN(valorNum)) valorNum = 1;
      valorNum = Math.max(0.8, Math.min(1.2, valorNum));
      est.escalaPorciones = valorNum;
      actualizarEtiquetaEscala(valorNum);
      renderPlanAplicado();
      refrescarVistaPrincipal();
    });

    // --- 5. Plantilla aplicada: macros mostrados recalculados en vivo ---
    var notaAplicado = crearHTML(doc, 'p');
    notaAplicado.classList.add('hz-nota');
    contenedorReco.appendChild(notaAplicado);

    var resumenAplicado = crearHTML(doc, 'div');
    resumenAplicado.classList.add('hz-reco-resumen');
    contenedorReco.appendChild(resumenAplicado);

    var statPlanAplicado = crearStat(doc, resumenAplicado, 'Plantilla aplicada');
    var statKcalAplicado = crearStat(doc, resumenAplicado, 'Kcal objetivo (aplicado)');
    var statProteinaAplicada = crearStat(doc, resumenAplicado, 'Proteína (g)');
    var statCarbohidratoAplicado = crearStat(doc, resumenAplicado, 'Carbohidrato (g)');
    var statGrasaAplicada = crearStat(doc, resumenAplicado, 'Grasa (g)');

    function renderPlanAplicado() {
      var activo = G.Herzon.planActivo();
      statPlanAplicado.num.textContent = activo.plan.nombre;
      statKcalAplicado.num.textContent = formatearEntero(activo.kcalObjetivo) + ' kcal';
      statProteinaAplicada.num.textContent = activo.macros.proteina_g + ' g';
      statCarbohidratoAplicado.num.textContent = activo.macros.carbohidrato_g + ' g';
      statGrasaAplicada.num.textContent = activo.macros.grasa_g + ' g';
      notaAplicado.textContent = 'Con la escala de porciones en ' + formatoEscala(activo.escalaPorciones) +
        ', esta es la plantilla actualmente aplicada al menú del día.';
    }

    botonCalcular.addEventListener('click', function () {
      // R6 (prod-4): limpia marcas de una validación previa antes de
      // revisar de nuevo -- si el usuario ya corrigió el campo, no debe
      // quedar pintado en rojo aunque el resto siga vigente.
      CAMPOS_NUMERICOS_VALIDABLES.forEach(function (campo) {
        campo.input.style.borderColor = '';
        campo.input.removeAttribute('aria-invalid');
      });
      var invalidos = validarCamposNumericos();
      if (invalidos.length) {
        invalidos.forEach(function (campo) {
          campo.input.style.borderColor = 'var(--delta-bad)';
          campo.input.setAttribute('aria-invalid', 'true');
        });
        notaValidacion.textContent = 'Revisa el campo ' +
          invalidos.map(function (campo) { return campo.etiqueta; }).join(', ') +
          ' antes de calcular: debe ser un número mayor que cero. No se recalculó.';
        return;
      }
      notaValidacion.textContent = '';
      leerPerfilDeFormulario();
      recalcularNecesidadesYRanking(est);
      renderNecesidades();
      renderRanking();
      renderPlanAplicado();
    });

    // Primer pintado: el formulario ya viene precargado con el perfil y
    // obtenerRecoEstado() ya calculó necesidades/ranking de forma perezosa.
    renderNecesidades();
    renderRanking();
    renderPlanAplicado();
  }

  function montarVistaPlan(rootEl) {
    var doc = rootEl.ownerDocument;
    var HERZON_DATA = G.HERZON_DATA;
    var Charts = G.Herzon.Charts;
    var planes = HERZON_DATA.planes;

    var opcionesObjetivo = derivarOpciones(planes, 'objetivo').map(function (v) {
      return { valor: v, etiqueta: ETIQUETAS_OBJETIVO[v] || v };
    });
    var opcionesRestriccion = derivarOpciones(planes, 'restriccion').map(function (v) {
      return { valor: v, etiqueta: ETIQUETAS_RESTRICCION[v] || v };
    });

    // R6 (prod-2): objetivo/restricción se guardan también en el estado
    // compartido del recomendador (obtenerRecoEstado().filtroObjetivo/
    // filtroRestriccion), para que Herzon.planActivo() resuelva la MISMA
    // plantilla que esta card en modo automático (ver planSeleccionadoActivo).
    // derivarOpciones(planes, campo)[0] es la misma cuenta que usa
    // crearRecoEstadoInicial(), así que ambos arrancan coincidiendo.
    var recoEstInicial = obtenerRecoEstado();
    var estado = {
      objetivo: recoEstInicial.filtroObjetivo || opcionesObjetivo[0].valor,
      restriccion: recoEstInicial.filtroRestriccion || opcionesRestriccion[0].valor,
      dia: 1
    };
    recoEstInicial.filtroObjetivo = estado.objetivo;
    recoEstInicial.filtroRestriccion = estado.restriccion;

    var grid = crearHTML(doc, 'div');
    grid.classList.add('hz-grid');
    rootEl.appendChild(grid);

    // --- Hero: exactamente UN número héroe por vista (regla 11) ---
    var cardHero = crearCard(doc, grid, 'Plan de dieta actual');
    var hero = crearHero(doc, cardHero, 'Calorías objetivo del plan (kcal / día)');
    var notaPlan = crearHTML(doc, 'p');
    notaPlan.classList.add('hz-nota');
    cardHero.appendChild(notaPlan);
    // R8 punto 4 / R9 MC-07: estado vacío (modo real sin plantilla
    // aplicada) -- nodo oculto por defecto; render() alterna la visibilidad
    // contra notaPlan (nunca ambos visibles a la vez).
    var notaVaciaHero = crearHTML(doc, 'p');
    notaVaciaHero.classList.add('hz-vacio');
    notaVaciaHero.setAttribute('hidden', '');
    notaVaciaHero.textContent = TEXTO_VACIO_PLAN;
    cardHero.appendChild(notaVaciaHero);

    // --- Formulario mínimo (.hz-form): objetivo + restricción/alergia ---
    var cardForm = crearCard(doc, grid, 'Personaliza tu plan');
    // R6 (prod-6): mientras el recomendador tenga una plantilla fijada a
    // mano, esta nota lo deja explícito aquí mismo (textContent); se retira
    // sola en cuanto el usuario vuelve al modo automático (cambia objetivo
    // o restricción, lo que limpia planIdSeleccionado -- ver render()).
    var notaPlantillaFijada = crearHTML(doc, 'p');
    notaPlantillaFijada.classList.add('hz-nota');
    cardForm.appendChild(notaPlantillaFijada);
    var form = crearHTML(doc, 'form');
    form.classList.add('hz-form');
    cardForm.appendChild(form);

    var campoObjetivo = crearCampoSelect(doc, form, 'hz-plan-objetivo', 'Objetivo', opcionesObjetivo);
    var campoRestriccion = crearCampoSelect(doc, form, 'hz-plan-restriccion', 'Restricción o alergia', opcionesRestriccion);
    var campoDia = crearCampoSelect(doc, form, 'hz-plan-dia', 'Día del plan (detalle)', [1, 2, 3, 4, 5, 6, 7].map(function (d) {
      return { valor: String(d), etiqueta: 'Día ' + d };
    }));

    campoObjetivo.select.value = estado.objetivo;
    campoRestriccion.select.value = estado.restriccion;
    campoDia.select.value = String(estado.dia);

    // --- Gráficas: macros por comida (apilada100) y calorías por día (barras),
    // agrupadas en UNA sola card con grid anidado (mismo patrón que la card
    // "Laboratorios en 3 cortes" de vista_metricas.js). R9 (LY-03): esta
    // card sale del grid superior y se monta como HERMANA directa de `grid`
    // bajo rootEl (mismo patrón ya bendecido de #reco-plan/hz-menu-fila),
    // ANTES de "Menú del día" -- el grid superior queda con EXACTAMENTE 2
    // hijos (héroe + formulario), que a 1240px resuelven 2 columnas de
    // ~570px sin hueco muerto; el gridGraficas anidado de esta card resuelve
    // 2 columnas propias (macros por comida y calorías por día lado a lado),
    // en vez de comprimirse a 1 columna en la pista más angosta del grid
    // superior (el defecto que LY-03 corrige). ---
    var cardGraficas = crearCard(doc, rootEl, 'Gráficas del plan');
    var gridGraficas = crearHTML(doc, 'div');
    gridGraficas.classList.add('hz-grid');
    cardGraficas.appendChild(gridGraficas);

    var contMacros = crearHTML(doc, 'div');
    gridGraficas.appendChild(contMacros);

    var contKcal = crearHTML(doc, 'div');
    gridGraficas.appendChild(contKcal);

    // R8 punto 4 / R9 MC-07: estado vacío -- sustituye las 2 gráficas
    // cuando el cliente real aún no tiene una plantilla aplicada.
    var notaVaciaGraficas = crearHTML(doc, 'p');
    notaVaciaGraficas.classList.add('hz-vacio');
    notaVaciaGraficas.setAttribute('hidden', '');
    notaVaciaGraficas.textContent = TEXTO_VACIO_PLAN;
    cardGraficas.appendChild(notaVaciaGraficas);

    // --- Menú del día (Adendum R4): fila de ancho completo, el menú como
    // protagonista de la vista (feedback ronda 4 de Mario). Vive FUERA del
    // grid superior, como hermano directo de `grid` bajo rootEl (.hz-vista,
    // ya congelado en shell.html: display:flex; flex-direction:column;
    // gap:20px), DESPUÉS de "Gráficas del plan" (R9, LY-03: orden vertical
    // final de la vista: #reco-plan, grid héroe+formulario, gráficas, menú
    // del día). Dentro de un CSS grid auto-fit, una card que abarca
    // grid-column:1/-1 "usa" todas las columnas en su propia fila, así que
    // ninguna queda vacía en TODAS las filas del grid y auto-fit no las
    // colapsa -- eso es precisamente lo que dejaba una card sola con
    // columnas vacías al lado (hueco muerto medido por el verifier de R4).
    // Como hermano de `grid` (no hijo), el menú no participa del cálculo de
    // columnas del grid superior en ningún ancho. ---
    var cardDetalle = crearCard(doc, rootEl, 'Menú del día');
    cardDetalle.classList.add('hz-menu-fila');
    var listaMenu = crearHTML(doc, 'div');
    listaMenu.classList.add('hz-menu-lista');
    cardDetalle.appendChild(listaMenu);

    // R8 punto 4 / R9 MC-07: estado vacío -- sustituye el listado de comidas
    // cuando el cliente real aún no tiene una plantilla aplicada.
    var notaVaciaMenu = crearHTML(doc, 'p');
    notaVaciaMenu.classList.add('hz-vacio');
    notaVaciaMenu.setAttribute('hidden', '');
    notaVaciaMenu.textContent = TEXTO_VACIO_PLAN;
    cardDetalle.appendChild(notaVaciaMenu);

    function render() {
      // R6 (prod-2): hero, gráficas, filas del menú y total del día derivan
      // TODOS de Herzon.planActivo() -- única fuente de verdad, compartida
      // con el panel del recomendador (renderPlanAplicado), así que las
      // cifras en pantalla ya no pueden contradecirse entre secciones. El
      // recomendador (Adendum R5, T-022) puede fijar una plantilla a mano
      // (botón "Usar este plan" en #reco-plan); mientras esa selección
      // exista, planActivo() la respeta (Adendum R5 punto 4); si no, cae en
      // la MISMA plantilla que resuelve la card "Personaliza tu plan"
      // (planSeleccionadoActivo, sincronizada más abajo).
      var recoEst = obtenerRecoEstado();

      // R8 punto 4 / R9 MC-07: estado vacío -- en modo real, mientras el
      // cliente activo no tenga una plantilla APLICADA (guardada vía
      // Herzon.Almacen.guardarPlan, HERZON_DATA.planAplicado === null), no
      // se muestra un plan "automático" como si fuera el suyo: se invita al
      // recomendador (#reco-plan, que se mantiene SIEMPRE visible y
      // funcional más abajo, fuera de este gate). En demo, Herzon.Almacen no
      // existe o reporta 'demo' y HERZON_DATA.planAplicado nunca existe
      // (undefined): esta rama nunca se toma, cero cambios de comportamiento.
      var AlmacenPlan = G.Herzon.Almacen;
      var enModoRealPlan = !!(AlmacenPlan && typeof AlmacenPlan.modo === 'function' && AlmacenPlan.modo() === 'real');
      var sinPlanAplicado = enModoRealPlan && (G.HERZON_DATA.planAplicado === null || G.HERZON_DATA.planAplicado === undefined);

      if (sinPlanAplicado) {
        rootEl.removeAttribute('data-plan-id');
        hero.num.textContent = '—';
        limpiar(notaPlan);
        notaPlan.setAttribute('hidden', '');
        notaVaciaHero.removeAttribute('hidden');
        notaPlantillaFijada.textContent = '';

        gridGraficas.setAttribute('hidden', '');
        notaVaciaGraficas.removeAttribute('hidden');
        limpiar(contMacros);
        limpiar(contKcal);

        listaMenu.setAttribute('hidden', '');
        notaVaciaMenu.removeAttribute('hidden');
        limpiar(listaMenu);
        return;
      }

      notaPlan.removeAttribute('hidden');
      notaVaciaHero.setAttribute('hidden', '');
      gridGraficas.removeAttribute('hidden');
      notaVaciaGraficas.setAttribute('hidden', '');
      listaMenu.removeAttribute('hidden');
      notaVaciaMenu.setAttribute('hidden', '');

      var activo = G.Herzon.planActivo();
      var plan = activo.plan;
      var escala = activo.escalaPorciones;
      rootEl.setAttribute('data-plan-id', plan.id);

      // prod-6: nota de plantilla fijada, SOLO mientras haya una elección
      // explícita del recomendador; se retira (textContent vacío) en modo
      // automático.
      if (recoEst.planIdSeleccionado) {
        notaPlantillaFijada.textContent = 'Plantilla fijada desde el recomendador: ' + plan.nombre +
          '. Cambia objetivo o restricción aquí abajo para volver al modo automático.';
      } else {
        notaPlantillaFijada.textContent = '';
      }

      var diaIdx = Math.max(1, Math.min(plan.dias.length, estado.dia)) - 1;
      var diaData = plan.dias[diaIdx];
      // "El menú escalado" (prod-2): cada comida del día se multiplica por
      // escalaPorciones -- hero, gráficas y menú comparten estos mismos
      // números escalados, incluso con kcalManual fijado (ese override es
      // solo el objetivo mostrado en el panel del recomendador; aquí se
      // muestra lo que la comida REAL, ya escalada, realmente suma).
      var comidasEscaladas = diaData.comidas.map(function (c) {
        return {
          hora: c.hora,
          momento: c.momento,
          nombre: c.nombre,
          kcal: c.kcal * escala,
          proteina_g: c.proteina_g * escala,
          carbohidrato_g: c.carbohidrato_g * escala,
          grasa_g: c.grasa_g * escala
        };
      });
      var totalKcalEscalado = comidasEscaladas.reduce(function (acc, c) { return acc + c.kcal; }, 0);
      var totalProteinaEscalada = comidasEscaladas.reduce(function (acc, c) { return acc + c.proteina_g; }, 0);
      var totalCarbohidratoEscalado = comidasEscaladas.reduce(function (acc, c) { return acc + c.carbohidrato_g; }, 0);
      var totalGrasaEscalada = comidasEscaladas.reduce(function (acc, c) { return acc + c.grasa_g; }, 0);

      hero.num.textContent = formatearEntero(totalKcalEscalado);
      limpiar(notaPlan);
      notaPlan.textContent = plan.nombre + ' (escala ' + formatoEscala(escala) + ') — el menú del día ' + diaData.dia +
        ' suma ' + formatearEntero(totalKcalEscalado) + ' kcal/día (proteína ' + formatearEntero(totalProteinaEscalada) +
        ' g, carbohidrato ' + formatearEntero(totalCarbohidratoEscalado) + ' g, grasa ' + formatearEntero(totalGrasaEscalada) + ' g).';

      var categoriasComida = comidasEscaladas.map(function (c) { return NOMBRES_MOMENTO[c.momento] || c.momento; });
      // R9 (DV-01): índice de la comida principal ("Comida", la de mayor
      // kcal del día) dentro de categoriasComida -- la única columna que
      // conserva sus 3 etiquetas de % (saillance: una columna ejemplar en
      // vez de 15 rótulos casi idénticos; leyenda + tooltip + "Ver tabla"
      // cubren el resto).
      var indiceComidaPrincipal = categoriasComida.indexOf('Comida');

      limpiar(contMacros);
      Charts.apilada100(contMacros, {
        // La card contenedora ahora es "Gráficas del plan" (agrupa las 2
        // gráficas, corrección R4): el título visible propio de esta gráfica
        // ya NO duplica el heading de su card (D5 sigue cumplido, ver
        // selfcheck_vistas_a.js sección 3-bis).
        titulo: 'Macronutrientes por comida (día seleccionado)',
        tituloAccesible: 'Distribución de proteínas, carbohidratos y grasas por comida del día ' + diaData.dia,
        categorias: categoriasComida,
        series: [
          { nombre: 'Proteínas', color: 'var(--series-1)', datos: comidasEscaladas.map(function (c) { return c.proteina_g; }) },
          { nombre: 'Carbohidratos', color: 'var(--series-2)', datos: comidasEscaladas.map(function (c) { return c.carbohidrato_g; }) },
          { nombre: 'Grasas', color: 'var(--series-3)', datos: comidasEscaladas.map(function (c) { return c.grasa_g; }) }
        ],
        etiquetaColumna: 'Comida',
        tabla: true,
        // R6-fix (hallazgo data-7, T-035): la gráfica no mostraba ni un solo
        // valor legible sin abrir la tabla. etiquetasSegmento ya existe
        // verificada en Charts.apilada100 (T-027): % en cada segmento con
        // alto >= 14px, tinta de texto vía var(--text-primary), jamás color
        // de serie. Cableado quirúrgico: solo esta opción, nada más.
        etiquetasSegmento: true,
        // R9 (DV-01): restringe las etiquetas de % a la comida principal.
        // Ausente el índice (caso extremo sin ninguna comida "comida" en el
        // día), se omite la opción y se conserva el comportamiento actual
        // (todas las categorías elegibles).
        etiquetasSegmentoIndices: indiceComidaPrincipal !== -1 ? [indiceComidaPrincipal] : undefined
      });

      limpiar(contKcal);
      Charts.barras(contKcal, {
        // Idem: título visible propio, ya no duplica el heading de "Gráficas
        // del plan" (corrección R4). Escalado por el mismo factor que el
        // menú (prod-2): esta gráfica no puede contradecir el total de abajo.
        titulo: 'Calorías por día (semana del plan)',
        tituloAccesible: 'Calorías totales por cada día de la semana del plan ' + plan.nombre,
        categorias: plan.dias.map(function (d) { return 'Día ' + d.dia; }),
        series: [{ nombre: 'Calorías (kcal)', datos: plan.dias.map(function (d) { return d.totales.kcal * escala; }) }],
        etiquetaColumna: 'Día',
        tabla: true,
        // R9 (DV-03): dibuja el objetivo de kcal APLICADO (plantilla activa
        // ya escalada, o el override manual del recomendador) como umbral
        // explícito -- el reference exige dibujar el objetivo, no solo el
        // dato. unidad ya era una opción existente (Adendum R6 punto 2).
        referencia: { valor: activo.kcalObjetivo, etiqueta: 'Objetivo' },
        unidad: 'kcal'
      });

      limpiar(listaMenu);
      for (var mi = 0; mi < comidasEscaladas.length; mi++) {
        construirFilaMenuComida(doc, listaMenu, comidasEscaladas[mi]);
      }

      // Leyenda una sola vez (no por fila): colores por token, misma
      // asignación fija que la gráfica de macros por comida de arriba.
      Charts.leyenda(listaMenu, {
        series: [
          { nombre: 'Proteínas', color: 'var(--series-1)' },
          { nombre: 'Carbohidratos', color: 'var(--series-2)' },
          { nombre: 'Grasas', color: 'var(--series-3)' }
        ]
      });

      // Total del día, visible al pie del menú (escalado, prod-2).
      var filaTotal = crearHTML(doc, 'div');
      filaTotal.classList.add('hz-menu-total');
      var totalLabel = crearHTML(doc, 'span');
      totalLabel.classList.add('hz-menu-total-label');
      totalLabel.textContent = 'Total del día';
      var totalMacros = crearHTML(doc, 'span');
      totalMacros.classList.add('hz-menu-total-macros');
      totalMacros.textContent = 'Proteína ' + formatearEntero(totalProteinaEscalada) + ' g · Carbohidrato ' +
        formatearEntero(totalCarbohidratoEscalado) + ' g · Grasa ' + formatearEntero(totalGrasaEscalada) + ' g';
      var totalKcal = crearHTML(doc, 'span');
      totalKcal.classList.add('hz-menu-total-kcal');
      totalKcal.textContent = formatearEntero(totalKcalEscalado) + ' kcal';
      filaTotal.appendChild(totalLabel);
      filaTotal.appendChild(totalMacros);
      filaTotal.appendChild(totalKcal);
      listaMenu.appendChild(filaTotal);
    }

    campoObjetivo.select.addEventListener('change', function (evento) {
      estado.objetivo = evento.target.value;
      // Volver al emparejamiento automático: una elección explícita en la
      // card "Personaliza tu plan" reemplaza cualquier plantilla aplicada
      // a mano desde el recomendador. filtroObjetivo sincroniza esta card
      // con Herzon.planActivo() (prod-2).
      var recoEstCambio = obtenerRecoEstado();
      recoEstCambio.filtroObjetivo = estado.objetivo;
      recoEstCambio.planIdSeleccionado = null;
      render();
    });
    campoRestriccion.select.addEventListener('change', function (evento) {
      estado.restriccion = evento.target.value;
      var recoEstCambio = obtenerRecoEstado();
      recoEstCambio.filtroRestriccion = estado.restriccion;
      recoEstCambio.planIdSeleccionado = null;
      render();
    });
    campoDia.select.addEventListener('change', function (evento) {
      estado.dia = parseInt(evento.target.value, 10) || 1;
      render();
    });

    render();

    // --- Recomendador (Adendum R5, T-022): panel #reco-plan ---
    var contenedorReco = buscarHijoPorId(rootEl, 'reco-plan');
    if (!contenedorReco) {
      // Red de seguridad: en el shell real (build/shell.html, T-021) este
      // contenedor SIEMPRE está presente de forma estática dentro de
      // #vista-plan. Si no aparece (p. ej. un contenedor de prueba vacío),
      // se crea con las mismas clases congeladas para no perder la sección.
      contenedorReco = crearHTML(doc, 'div');
      contenedorReco.setAttribute('id', 'reco-plan');
      contenedorReco.classList.add('hz-card');
      contenedorReco.classList.add('hz-reco-panel');
      rootEl.appendChild(contenedorReco);
    }
    montarPanelRecomendador(doc, contenedorReco, HERZON_DATA, render);

    // R9 (Adendum R9 punto 3): referencia de re-montaje para
    // manejarRemontajeDatos (herzon:modo-cambiado), que necesita poder
    // volver a construir el panel del recomendador (perfil real) y
    // repintar esta vista sin depender de que registerView la monte de
    // nuevo (se monta UNA sola vez).
    refsMontajePlan = { doc: doc, contenedorReco: contenedorReco, render: render };
  }

  // -----------------------------------------------------------------------
  // Vista "Suplementos"
  // -----------------------------------------------------------------------
  function promedio(lista) {
    if (!lista.length) return 0;
    var total = 0;
    for (var i = 0; i < lista.length; i++) total += lista[i];
    return total / lista.length;
  }

  function montarVistaSuplementos(rootEl) {
    var doc = rootEl.ownerDocument;

    // R9 (Adendum R9 punto 3): render() propio (antes montaba una única vez
    // sin función de repintado) -- lo necesita manejarRemontajeDatos para
    // volver a dibujar esta vista ya montada cuando cambia el cliente/modo
    // (herzon:modo-cambiado), sin depender de un segundo mountFn
    // (registerView monta UNA sola vez, plan.md 3.C).
    function render() {
      var HERZON_DATA = G.HERZON_DATA;
      var Charts = G.Herzon.Charts;
      var Almacen = G.Herzon.Almacen;
      var suplementos = HERZON_DATA.suplementos || [];
      var adherenciaDiaria = (HERZON_DATA.series && HERZON_DATA.series.adherenciaDiaria) || [];
      var enModoReal = !!(Almacen && typeof Almacen.modo === 'function' && Almacen.modo() === 'real');
      var sinRegimen = enModoReal && suplementos.length === 0;

      limpiar(rootEl);
      var grid = crearHTML(doc, 'div');
      grid.classList.add('hz-grid');
      rootEl.appendChild(grid);

      // R8 punto 4: estado vacío -- un cliente real sin régimen todavía no
      // tiene NADA que graficar (ni siquiera un hero en 0%: 0% de adherencia
      // a cero suplementos sería un dato falso). Se muestra un único hero
      // con nota hz-vacio; regla 11 (exactamente un .hz-hero) se conserva.
      if (sinRegimen) {
        var cardVacio = crearCard(doc, grid, 'Suplementos');
        var heroVacio = crearHero(doc, cardVacio, 'Adherencia promedio de suplementos (%)');
        heroVacio.num.textContent = '—';
        var notaVaciaSup = crearHTML(doc, 'p');
        notaVaciaSup.classList.add('hz-vacio');
        notaVaciaSup.textContent = TEXTO_VACIO_SUPLEMENTOS;
        cardVacio.appendChild(notaVaciaSup);
        rootEl.setAttribute('data-suplementos-count', '0');
        return;
      }

      // --- Hero: exactamente UN número héroe por vista (regla 11) ---
      var adherenciaPromedio = Math.round(promedio(suplementos.map(function (s) { return s.adherencia_pct; })));
      var cardHero = crearCard(doc, grid, 'Suplementos');
      var hero = crearHero(doc, cardHero, 'Adherencia promedio de suplementos (%)');
      hero.num.textContent = formatearEntero(adherenciaPromedio) + '%';
      var notaHero = crearHTML(doc, 'p');
      notaHero.classList.add('hz-nota');
      notaHero.textContent = suplementos.length + ' suplementos en el régimen actual.';
      cardHero.appendChild(notaHero);

      // --- Adherencia por suplemento (barras horizontales). R9 (LY-05/C3):
      // 2a pista de la fila 1, ANTES del heatmap y del régimen (nuevo orden
      // vertical: héroe, barras, heatmap doble, régimen completo). Rótulos
      // cortos de despliegue (C3): el nombre completo con dosis ya vive en
      // la tabla "Régimen de suplementos" (cardRegimen, más abajo). ---
      var cardAdherenciaSup = crearCard(doc, grid, 'Adherencia por suplemento');
      var contAdherenciaSup = crearHTML(doc, 'div');
      cardAdherenciaSup.appendChild(contAdherenciaSup);
      Charts.barras(contAdherenciaSup, {
        // D5: sin título interno (duplicaria el heading de cardAdherenciaSup).
        tituloAccesible: 'Porcentaje de adherencia por cada suplemento del régimen en las últimas 12 semanas',
        orientacion: 'horizontal',
        categorias: suplementos.map(function (s) { return etiquetaCortaSuplemento(s.nombre); }),
        series: [{ nombre: 'Adherencia (%)', datos: suplementos.map(function (s) { return s.adherencia_pct; }) }],
        max: 100,
        // R6 (data-6, Adendum R6 punto 2): serie única, <=6 categorías en
        // horizontal -- unidad agrega el sufijo '%' a cada etiqueta y
        // valoresEnBarras dibuja el valor al final de CADA barra (antes solo
        // se etiquetaba la barra máxima).
        unidad: '%',
        valoresEnBarras: true,
        // R9 (LY-05/C3, corrección post-verificación): el eje usa el rótulo
        // corto (etiquetaCortaSuplemento) pero "Ver tabla" debe seguir
        // mostrando el nombre completo con dosis -- resolverEspecTabla
        // (charts.js) devuelve opciones.tabla TAL CUAL cuando trae columnas
        // y filas completas, así que se construye la espec de tabla a mano
        // con s.nombre (completo) en vez de dejar que 'tabla: true' derive
        // las filas de 'categorias' (que ya son los rótulos cortos).
        tabla: {
          columnas: ['Suplemento', 'Adherencia (%)'],
          filas: suplementos.map(function (s) { return [s.nombre, s.adherencia_pct]; })
        }
      });

      // --- Adherencia en el tiempo (heatmap TRANSPUESTO, rampa
      // var(--heat-1..5)). R9 (DV-05/LY-05/C4): 3a-4a pista de la fila 1,
      // data-ancho="doble" (~570px) para que las 12 columnas (semanas)
      // tengan celda digna. ---
      var cardAdherenciaTiempo = crearCard(doc, grid, 'Adherencia diaria a suplementos en el tiempo');
      cardAdherenciaTiempo.setAttribute('data-ancho', 'doble');
      var contAdherenciaTiempo = crearHTML(doc, 'div');
      cardAdherenciaTiempo.appendChild(contAdherenciaTiempo);

      // R9 (DV-05): transponer -- el tiempo corre a lo largo del eje x
      // (semanas en columnas), no hacia abajo. adherenciaDiaria viene en
      // orden cronológico (semana 0 días 0-6, semana 1 días 7-13, ...); se
      // reordena a orden por-día-de-semana (día 0 de cada semana, luego día
      // 1 de cada semana...) para que Charts.heatmapCalendario (fila =
      // i/columnas, columna = i%columnas, charts.js) dibuje 7 filas (L a D)
      // x 12 columnas (S1..S12) en vez de 12 filas x 7 columnas.
      var semanasHeatmap = Math.ceil(adherenciaDiaria.length / 7) || 1;
      var valoresTranspuestos = [];
      var etiquetasTranspuestas = [];
      for (var filaDia = 0; filaDia < 7; filaDia++) {
        for (var colSemana = 0; colSemana < semanasHeatmap; colSemana++) {
          var entradaDia = adherenciaDiaria[colSemana * 7 + filaDia];
          valoresTranspuestos.push(entradaDia ? entradaDia.suplementos_pct : null);
          etiquetasTranspuestas.push(entradaDia ? entradaDia.fecha : '');
        }
      }
      var encabezadosColumnaAdherenciaTiempo = [];
      for (var ecAdh = 0; ecAdh < semanasHeatmap; ecAdh++) {
        encabezadosColumnaAdherenciaTiempo.push(
          (ecAdh === 0 || ecAdh === 3 || ecAdh === 7 || ecAdh === 11) ? 'S' + (ecAdh + 1) : ''
        );
      }
      Charts.heatmapCalendario(contAdherenciaTiempo, {
        // D5: sin título interno (duplicaria el heading de cardAdherenciaTiempo).
        valores: valoresTranspuestos,
        etiquetas: etiquetasTranspuestas,
        columnas: semanasHeatmap,
        min: 0,
        max: 100,
        nombreSerie: 'Adherencia suplementos (%)',
        etiquetaColumna: 'Fecha',
        // R9 (DV-05): etiquetasFila rotula las 7 filas (un día de la semana
        // por fila, L a D); encabezadosColumna rotula S1/S4/S8/S12 sobre las
        // columnas (semanas). encabezadosDia queda retirado: los días ya no
        // son columnas, son filas.
        etiquetasFila: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
        encabezadosColumna: encabezadosColumnaAdherenciaTiempo,
        leyendaRampa: true,
        tabla: true
      });

      // --- Régimen (tabla siempre visible: dosis, horario, propósito). R9
      // (LY-05): fila 2, ANCHO completo, ÚLTIMA en el orden vertical (antes
      // era la segunda card montada). R6 (jera-1/data-3/fini-1/resp-1):
      // ancho completo (regla de T-026, plan.md Adendum R6 punto 1) -- con
      // 5 columnas, compartir fila con otra card recortaba
      // "Horario"/"Momento"/"Propósito" fuera del viewport a 1240px.
      // data-ancho="completo" la expande a las 1/-1 columnas del grid (CSS
      // de build/shell.html, este módulo solo aplica el atributo). ---
      var cardRegimen = crearCard(doc, grid, 'Régimen de suplementos');
      cardRegimen.setAttribute('data-ancho', 'completo');
      var columnasRegimen = ['Suplemento', 'Dosis', 'Horario', 'Momento', 'Propósito'];
      var filasRegimen = suplementos.map(function (s) {
        return [s.nombre, s.dosis, s.horario, s.momento, s.proposito];
      });
      construirTablaSimple(doc, cardRegimen, columnasRegimen, filasRegimen);

      rootEl.setAttribute('data-suplementos-count', String(suplementos.length));
    }

    render();

    // R9 (Adendum R9 punto 3): referencia de re-montaje para
    // manejarRemontajeDatos (herzon:modo-cambiado).
    refsMontajeSuplementos = { render: render };
  }

  // -----------------------------------------------------------------------
  // R9 (Adendum R9 punto 3, MC-02/MC-07): reactividad multi-cliente. Tanto
  // el panel del recomendador (perfil + plan aplicado) como los estados
  // vacíos de esta vista dependen del cliente/modo MONTADO en G.HERZON_DATA,
  // no del que estaba activo cuando la vista se montó por primera vez
  // (Herzon.registerView monta cada vista UNA sola vez, plan.md 3.C). Este
  // listener es el único mecanismo de repintado ante herzon:modo-cambiado
  // (semántica de remontaje: demo<->real y cliente<->cliente): descarta el
  // estado del recomendador del cliente/modo ANTERIOR (recoEstadoSingleton)
  // y lo recalcula desde cero contra el HERZON_DATA ya remontado (perfil
  // real + planIdSeleccionado precargado desde HERZON_DATA.planAplicado,
  // ver crearRecoEstadoInicial); si alguna vista ya se montó, la repinta.
  // -----------------------------------------------------------------------
  function manejarRemontajeDatos() {
    recoEstadoSingleton = null;
    obtenerRecoEstado();
    if (refsMontajePlan) {
      montarPanelRecomendador(refsMontajePlan.doc, refsMontajePlan.contenedorReco, G.HERZON_DATA, refsMontajePlan.render);
      refsMontajePlan.render();
    }
    if (refsMontajeSuplementos) {
      refsMontajeSuplementos.render();
    }
  }
  if (typeof G.addEventListener === 'function') {
    G.addEventListener('herzon:modo-cambiado', manejarRemontajeDatos);
  }

  // -----------------------------------------------------------------------
  // Herzon.planActivo() (Adendum R5 punto 4, dueño único vista_dieta_supl.js):
  // devuelve la plantilla y los ajustes actualmente seleccionados en el
  // recomendador. Funciona incluso si la vista "Plan de dieta" nunca se
  // montó (obtenerRecoEstado() calcula el default de forma perezosa), así
  // que build/documentos.js (T-023) NO necesita esperar a que la pestaña se
  // haya activado; el "fallback al plan por defecto" que le autoriza el
  // Adendum R5 aplica solo si este módulo no llegó a cargar en absoluto.
  //   plan            objeto completo de HERZON_DATA.planes (la plantilla activa)
  //   kcalObjetivo    el manual si el usuario lo fijó; si no, el de la
  //                   plantilla escalado por escalaPorciones, redondeado
  //   escalaPorciones 0.8 - 1.2 (1 = sin ajustar)
  //   macros          { proteina_g, carbohidrato_g, grasa_g } de la
  //                   plantilla activa, escalados por escalaPorciones
  // -----------------------------------------------------------------------
  G.Herzon.planActivo = function () {
    var HERZON_DATA = G.HERZON_DATA;
    var est = obtenerRecoEstado();
    var plan = planSeleccionadoActivo(est, HERZON_DATA);
    var kcalObjetivo = (est.kcalManual !== null && est.kcalManual !== undefined)
      ? est.kcalManual
      : redondear(plan.kcalObjetivo * est.escalaPorciones);
    var macros = {
      proteina_g: redondear(plan.macrosTotales.proteina * est.escalaPorciones),
      carbohidrato_g: redondear(plan.macrosTotales.carbohidrato * est.escalaPorciones),
      grasa_g: redondear(plan.macrosTotales.grasa * est.escalaPorciones)
    };
    return {
      plan: plan,
      kcalObjetivo: kcalObjetivo,
      escalaPorciones: est.escalaPorciones,
      macros: macros
    };
  };

  // -----------------------------------------------------------------------
  // Registro: namespaces disjuntos por tarea (plan.md 3.B). Este módulo SOLO
  // escribe Herzon.Views.plan y Herzon.Views.suplementos (nunca resumen,
  // perfil ni seguimiento: esos son de T-005).
  // -----------------------------------------------------------------------
  G.Herzon.Views.plan = montarVistaPlan;
  G.Herzon.Views.suplementos = montarVistaSuplementos;

  G.Herzon.registerView('plan', montarVistaPlan);
  G.Herzon.registerView('suplementos', montarVistaSuplementos);
})();
