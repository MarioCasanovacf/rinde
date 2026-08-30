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
    // carbohidrato=series-2, grasa=series-3), gap de 2px via CSS.
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
    return {
      perfil: {
        sexo: paciente.sexo,
        edad: paciente.edad,
        tallaCm: paciente.talla_cm,
        pesoKg: paciente.pesoInicial_kg,
        factorClave: 'ligero',
        objetivo: objetivoMotorDesdeTexto(paciente.objetivo)
      },
      necesidades: null,      // { tmb, get, kcal, proteina_g, carbohidrato_g, grasa_g }
      ranking: null,          // [{ plan, score, razones[] }] descendente (Herzon.Motor.recomendar)
      planIdSeleccionado: null, // id elegido a mano en el ranking, o null = automático (el mejor rankeado)
      kcalManual: null,       // override manual del kcal objetivo mostrado, o null = usa el de la plantilla
      escalaPorciones: 1      // 0.8 - 1.2
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

  // Da un toque visual de botón secundario SIN hoja de estilo propia (regla
  // 3.G: ningún módulo declara bloques de estilo inline en el documento;
  // T-022 no posee build/shell.html, así que no puede registrar una clase
  // hz-reco-btn-* nueva). Estilo puntual vía element.style, colores SIEMPRE
  // con var(--token) (regla 3.H).
  function estilizarBotonSecundario(el) {
    el.style.appearance = 'none';
    el.style.border = '1px solid var(--border)';
    el.style.borderRadius = '999px';
    el.style.padding = '6px 14px';
    el.style.fontSize = '0.82rem';
    el.style.cursor = 'pointer';
    el.style.background = 'var(--surface-1)';
    el.style.color = 'var(--text-secondary)';
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
    estilizarBotonSecundario(botonCalcular);
    botonCalcular.textContent = 'Calcular necesidades';
    accionesCalculo.appendChild(botonCalcular);

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
        entrada.razones.forEach(function (razonTexto) {
          var chip = crearHTML(doc, 'span');
          chip.classList.add('hz-badge');
          chip.textContent = razonTexto;
          razones.appendChild(chip);
        });
        item.appendChild(razones);

        var accionesItem = crearHTML(doc, 'div');
        accionesItem.classList.add('hz-reco-acciones');
        var botonUsar = crearHTML(doc, 'button');
        botonUsar.setAttribute('type', 'button');
        botonUsar.setAttribute('data-plan-id', entrada.plan.id);
        botonUsar.setAttribute('data-accion', 'usar-plan');
        estilizarBotonSecundario(botonUsar);
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
          etiquetaEscala.textContent = formatoEscala(1);
          renderRanking();
          renderPlanAplicado();
          refrescarVistaPrincipal();
        });
        accionesItem.appendChild(botonUsar);
        item.appendChild(accionesItem);

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
    var campoEscala = crearCampoInput(
      doc, accionesModificar, 'hz-reco-escala', 'Escala de porciones (0.8x a 1.2x)',
      'range', '1', { min: '0.8', max: '1.2', step: '0.05' }
    );
    campoEscala.input.classList.add('hz-reco-slider');
    var etiquetaEscala = crearHTML(doc, 'span');
    etiquetaEscala.textContent = formatoEscala(1);
    campoEscala.campo.appendChild(etiquetaEscala);

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
      etiquetaEscala.textContent = formatoEscala(valorNum);
      renderPlanAplicado();
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

    var estado = {
      objetivo: opcionesObjetivo[0].valor,
      restriccion: opcionesRestriccion[0].valor,
      dia: 1
    };

    var grid = crearHTML(doc, 'div');
    grid.classList.add('hz-grid');
    rootEl.appendChild(grid);

    // --- Hero: exactamente UN número héroe por vista (regla 11) ---
    var cardHero = crearCard(doc, grid, 'Plan de dieta actual');
    var hero = crearHero(doc, cardHero, 'Calorías objetivo del plan (kcal / día)');
    var notaPlan = crearHTML(doc, 'p');
    notaPlan.classList.add('hz-nota');
    cardHero.appendChild(notaPlan);

    // --- Formulario mínimo (.hz-form): objetivo + restricción/alergia ---
    var cardForm = crearCard(doc, grid, 'Personaliza tu plan');
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
    // "Laboratorios en 3 cortes" de vista_metricas.js). Corrección R4 tras
    // rechazo del verifier (intento 1): con 4 cards sueltas + 1 fila de ancho
    // completo (hz-menu-fila), el grid superior a 1240px resuelve 3 columnas
    // y la 4ª card queda sola dejando 2 columnas de hueco muerto. Con 3 cards
    // (hero, formulario, gráficas) el grid llena la fila sin resto. ---
    var cardGraficas = crearCard(doc, grid, 'Gráficas del plan');
    var gridGraficas = crearHTML(doc, 'div');
    gridGraficas.classList.add('hz-grid');
    cardGraficas.appendChild(gridGraficas);

    var contMacros = crearHTML(doc, 'div');
    gridGraficas.appendChild(contMacros);

    var contKcal = crearHTML(doc, 'div');
    gridGraficas.appendChild(contKcal);

    // --- Menú del día (Adendum R4): fila de ancho completo, el menú como
    // protagonista de la vista (feedback ronda 4 de Mario). Corrección R4
    // (intento 2, rechazo del verifier): vive FUERA del grid superior, como
    // hermano directo de `grid` bajo rootEl (.hz-vista, ya congelado en
    // shell.html: display:flex; flex-direction:column; gap:20px). Dentro de
    // un CSS grid auto-fit, una card que abarca grid-column:1/-1 "usa" todas
    // las columnas en su propia fila, así que ninguna queda vacía en TODAS
    // las filas del grid y auto-fit no las colapsa -- eso es precisamente lo
    // que dejaba una card sola con columnas vacías al lado (hueco muerto
    // medido por el verifier). Como hermano de `grid` (no hijo), el menú no
    // participa del cálculo de columnas del grid superior en ningún ancho. ---
    var cardDetalle = crearCard(doc, rootEl, 'Menú del día');
    cardDetalle.classList.add('hz-menu-fila');
    var listaMenu = crearHTML(doc, 'div');
    listaMenu.classList.add('hz-menu-lista');
    cardDetalle.appendChild(listaMenu);

    function render() {
      // El recomendador (Adendum R5, T-022) puede fijar una plantilla a
      // mano (botón "Usar este plan" en #reco-plan); mientras esa selección
      // exista, tiene prioridad sobre el emparejamiento automático por
      // objetivo/restricción de la card "Personaliza tu plan" (así "el resto
      // de la vista refleja la selección" del Adendum R5 punto 4).
      var recoEst = obtenerRecoEstado();
      var plan = recoEst.planIdSeleccionado
        ? (planPorId(HERZON_DATA, recoEst.planIdSeleccionado) || elegirPlan(planes, estado.objetivo, estado.restriccion))
        : elegirPlan(planes, estado.objetivo, estado.restriccion);
      rootEl.setAttribute('data-plan-id', plan.id);

      hero.num.textContent = formatearEntero(plan.kcalObjetivo);
      limpiar(notaPlan);
      notaPlan.textContent = plan.nombre + ' — objetivo ' + formatearEntero(plan.kcalObjetivo) +
        ' kcal/día (proteína ' + plan.macrosObjetivo.proteina_g + ' g, carbohidrato ' +
        plan.macrosObjetivo.carbohidrato_g + ' g, grasa ' + plan.macrosObjetivo.grasa_g + ' g).';

      var diaIdx = Math.max(1, Math.min(plan.dias.length, estado.dia)) - 1;
      var diaData = plan.dias[diaIdx];
      var comidas = diaData.comidas;
      var categoriasComida = comidas.map(function (c) { return NOMBRES_MOMENTO[c.momento] || c.momento; });

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
          { nombre: 'Proteínas', color: 'var(--series-1)', datos: comidas.map(function (c) { return c.proteina_g; }) },
          { nombre: 'Carbohidratos', color: 'var(--series-2)', datos: comidas.map(function (c) { return c.carbohidrato_g; }) },
          { nombre: 'Grasas', color: 'var(--series-3)', datos: comidas.map(function (c) { return c.grasa_g; }) }
        ],
        etiquetaColumna: 'Comida',
        tabla: true
      });

      limpiar(contKcal);
      Charts.barras(contKcal, {
        // Idem: título visible propio, ya no duplica el heading de "Gráficas
        // del plan" (corrección R4).
        titulo: 'Calorías por día (semana del plan)',
        tituloAccesible: 'Calorías totales por cada día de la semana del plan ' + plan.nombre,
        categorias: plan.dias.map(function (d) { return 'Día ' + d.dia; }),
        series: [{ nombre: 'Calorías (kcal)', datos: plan.dias.map(function (d) { return d.totales.kcal; }) }],
        etiquetaColumna: 'Día',
        tabla: true
      });

      limpiar(listaMenu);
      for (var mi = 0; mi < comidas.length; mi++) {
        construirFilaMenuComida(doc, listaMenu, comidas[mi]);
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

      // Total del día, visible al pie del menú.
      var filaTotal = crearHTML(doc, 'div');
      filaTotal.classList.add('hz-menu-total');
      var totalLabel = crearHTML(doc, 'span');
      totalLabel.classList.add('hz-menu-total-label');
      totalLabel.textContent = 'Total del día';
      var totalMacros = crearHTML(doc, 'span');
      totalMacros.classList.add('hz-menu-total-macros');
      totalMacros.textContent = 'Proteína ' + diaData.totales.proteina_g + ' g · Carbohidrato ' +
        diaData.totales.carbohidrato_g + ' g · Grasa ' + diaData.totales.grasa_g + ' g';
      var totalKcal = crearHTML(doc, 'span');
      totalKcal.classList.add('hz-menu-total-kcal');
      totalKcal.textContent = formatearEntero(diaData.totales.kcal) + ' kcal';
      filaTotal.appendChild(totalLabel);
      filaTotal.appendChild(totalMacros);
      filaTotal.appendChild(totalKcal);
      listaMenu.appendChild(filaTotal);
    }

    campoObjetivo.select.addEventListener('change', function (evento) {
      estado.objetivo = evento.target.value;
      // Volver al emparejamiento automático: una elección explícita en la
      // card "Personaliza tu plan" reemplaza cualquier plantilla aplicada
      // a mano desde el recomendador.
      obtenerRecoEstado().planIdSeleccionado = null;
      render();
    });
    campoRestriccion.select.addEventListener('change', function (evento) {
      estado.restriccion = evento.target.value;
      obtenerRecoEstado().planIdSeleccionado = null;
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
    var HERZON_DATA = G.HERZON_DATA;
    var Charts = G.Herzon.Charts;
    var suplementos = HERZON_DATA.suplementos;
    var adherenciaDiaria = HERZON_DATA.series.adherenciaDiaria;

    var grid = crearHTML(doc, 'div');
    grid.classList.add('hz-grid');
    rootEl.appendChild(grid);

    // --- Hero: exactamente UN número héroe por vista (regla 11) ---
    var adherenciaPromedio = Math.round(promedio(suplementos.map(function (s) { return s.adherencia_pct; })));
    var cardHero = crearCard(doc, grid, 'Suplementos');
    var hero = crearHero(doc, cardHero, 'Adherencia promedio de suplementos (%)');
    hero.num.textContent = formatearEntero(adherenciaPromedio) + '%';
    var notaHero = crearHTML(doc, 'p');
    notaHero.classList.add('hz-nota');
    notaHero.textContent = suplementos.length + ' suplementos en el régimen actual.';
    cardHero.appendChild(notaHero);

    // --- Régimen (tabla siempre visible: dosis, horario, propósito) ---
    var cardRegimen = crearCard(doc, grid, 'Régimen de suplementos');
    var columnasRegimen = ['Suplemento', 'Dosis', 'Horario', 'Momento', 'Propósito'];
    var filasRegimen = suplementos.map(function (s) {
      return [s.nombre, s.dosis, s.horario, s.momento, s.proposito];
    });
    construirTablaSimple(doc, cardRegimen, columnasRegimen, filasRegimen);

    // --- Adherencia por suplemento (barras horizontales) ---
    var cardAdherenciaSup = crearCard(doc, grid, 'Adherencia por suplemento');
    var contAdherenciaSup = crearHTML(doc, 'div');
    cardAdherenciaSup.appendChild(contAdherenciaSup);
    Charts.barras(contAdherenciaSup, {
      // D5: sin titulo interno (duplicaria el heading de cardAdherenciaSup).
      tituloAccesible: 'Porcentaje de adherencia por cada suplemento del régimen en las últimas 12 semanas',
      orientacion: 'horizontal',
      categorias: suplementos.map(function (s) { return s.nombre; }),
      series: [{ nombre: 'Adherencia (%)', datos: suplementos.map(function (s) { return s.adherencia_pct; }) }],
      max: 100,
      etiquetaColumna: 'Suplemento',
      tabla: true
    });

    // --- Adherencia en el tiempo (heatmap, rampa var(--heat-1..5)) ---
    var cardAdherenciaTiempo = crearCard(doc, grid, 'Adherencia diaria a suplementos en el tiempo');
    var contAdherenciaTiempo = crearHTML(doc, 'div');
    cardAdherenciaTiempo.appendChild(contAdherenciaTiempo);
    Charts.heatmapCalendario(contAdherenciaTiempo, {
      // D5: sin titulo interno (duplicaria el heading de cardAdherenciaTiempo).
      valores: adherenciaDiaria.map(function (d) { return d.suplementos_pct; }),
      etiquetas: adherenciaDiaria.map(function (d) { return d.fecha; }),
      columnas: 7,
      min: 0,
      max: 100,
      nombreSerie: 'Adherencia suplementos (%)',
      etiquetaColumna: 'Fecha',
      tabla: true
    });

    rootEl.setAttribute('data-suplementos-count', String(suplementos.length));
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
  // Registro: namespaces disjuntos por tarea (plan.md 3.B). Este modulo SOLO
  // escribe Herzon.Views.plan y Herzon.Views.suplementos (nunca resumen,
  // perfil ni seguimiento: esos son de T-005).
  // -----------------------------------------------------------------------
  G.Herzon.Views.plan = montarVistaPlan;
  G.Herzon.Views.suplementos = montarVistaSuplementos;

  G.Herzon.registerView('plan', montarVistaPlan);
  G.Herzon.registerView('suplementos', montarVistaSuplementos);
})();
