// build/vista_metricas.js
// U-VISTAS-B (T-005): vistas Resumen, Perfil y Seguimiento del prototipo Herzon.
// Namespaces (plan.md 3.B, disjuntos): SOLO window.Herzon.Views.resumen, .perfil y
// .seguimiento. NO toca .plan ni .suplementos (dueño T-004). Consume Herzon.Charts.*
// (T-003, API congelada en plan.md 3.B) y HERZON_DATA (T-001, forma congelada en
// plan.md 3.I).
//
// Preámbulo obligatorio (plan.md 3.A): script clásico, IIFE, sin import/export,
// idempotente. Prohibido tocar `document` en el nivel superior del módulo: todo
// acceso al DOM ocurre dentro de las funciones de montaje, usando
// `rootEl.ownerDocument`.
//
// Color (contrato sección H): cero hexes literales en este módulo. Las gráficas
// asignan su propio color vía Herzon.Charts (que internamente usa
// el.style.fill / el.style.stroke con var(--token)); este módulo solo PASA
// nombres de token como string en las opciones de Herzon.Charts.*. El único
// estilo puntual que este módulo escribe directo es element.style con un
// token de color, o con un valor tipográfico sin color (font-weight,
// font-variant-numeric) para jerarquía de texto fuera de la lista de clases
// congeladas (contrato sección G, mismo patrón que build/vista_dieta_supl.js);
// jamás un hex y jamás una etiqueta de hoja de estilos HTML propia.
(function () {
  var G = (typeof window !== 'undefined') ? window : globalThis;
  G.Herzon = G.Herzon || {};
  G.Herzon.Views = G.Herzon.Views || {};

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

  // -----------------------------------------------------------------------
  // Vista Resumen: UN número héroe (peso actual + delta con signo + sparkline
  // de 12 puntos), al menos 3 stat tiles, y la nota "Acerca de este prototipo"
  // con los supuestos declarados de HERZON_DATA.
  // -----------------------------------------------------------------------
  function mountResumen(rootEl) {
    var doc = rootEl.ownerDocument;
    var Charts = G.Herzon.Charts || {};
    var data = G.HERZON_DATA || {};
    var paciente = data.paciente || {};
    var series = data.series || {};
    var pesoSerie = series.peso_kg || [];
    var pesoInicial = pesoSerie.length ? pesoSerie[0] : (paciente.pesoInicial_kg || 0);
    var pesoActual = pesoSerie.length ? pesoSerie[pesoSerie.length - 1] : (paciente.pesoActual_kg || 0);
    var deltaPeso = redondear(pesoActual - pesoInicial, 1);

    var heroCard = crear(doc, 'div', ['hz-card']);
    var hero = crear(doc, 'div', ['hz-hero']);
    hero.appendChild(crear(doc, 'div', ['hz-hero-label'], 'Peso actual'));
    hero.appendChild(crear(doc, 'div', ['hz-hero-num'], formatoNumero(pesoActual, 1) + ' kg'));
    var delta = crear(doc, 'div', ['hz-stat-delta'], conSigno(deltaPeso, 1) + ' kg desde el inicio');
    delta.classList.add(deltaPeso <= 0 ? 'hz-delta-good' : 'hz-delta-bad');
    hero.appendChild(delta);
    heroCard.appendChild(hero);
    rootEl.appendChild(heroCard);

    // jera-8/fini-6 (Adendum R6, misma causa raíz que los labs de
    // Seguimiento): la card se monta en el documento PRIMERO; recién
    // entonces se mide su ancho real y se dibuja el sparkline con ese
    // ancho (opciones.ancho), para que recorra la card junto al número
    // héroe en vez de quedarse en el ancho de respaldo fijo (120px) de
    // Herzon.Charts.sparkline cuando el contenedor está desconectado del
    // documento en el momento de la llamada.
    if (typeof Charts.sparkline === 'function') {
      var anchoSparkResumen = hero.clientWidth || heroCard.clientWidth || 0;
      Charts.sparkline(hero, {
        valores: pesoSerie,
        color: 'var(--series-1)',
        ancho: anchoSparkResumen > 0 ? anchoSparkResumen : undefined
      });
    }

    var statsGrid = crear(doc, 'div', ['hz-grid']);
    var grasaSerie = series.grasa_pct || [];
    var cinturaSerie = series.cintura_cm || [];
    var adherenciaSerie = series.adherenciaDieta_pct || [];

    if (typeof Charts.statTile === 'function') {
      Charts.statTile(statsGrid, {
        etiqueta: 'IMC actual',
        valor: paciente.imcActual,
        delta: redondear((paciente.imcActual || 0) - (paciente.imcInicial || 0), 1),
        mejorSi: 'menor'
      });
      Charts.statTile(statsGrid, {
        etiqueta: 'Grasa corporal',
        valorFormateado: formatoNumero(grasaSerie[grasaSerie.length - 1], 1) + '%',
        delta: redondear(grasaSerie[grasaSerie.length - 1] - grasaSerie[0], 1),
        sufijoDelta: ' pp',
        mejorSi: 'menor'
      });
      Charts.statTile(statsGrid, {
        etiqueta: 'Cintura',
        valorFormateado: formatoNumero(cinturaSerie[cinturaSerie.length - 1], 1) + ' cm',
        delta: redondear(cinturaSerie[cinturaSerie.length - 1] - cinturaSerie[0], 1),
        sufijoDelta: ' cm',
        mejorSi: 'menor'
      });
      Charts.statTile(statsGrid, {
        etiqueta: 'Adherencia a dieta (promedio)',
        valorFormateado: String(Math.round(promedio(adherenciaSerie))) + '%'
      });
    }
    rootEl.appendChild(statsGrid);

    var nota = crear(doc, 'div', ['hz-nota']);
    nota.appendChild(crear(doc, 'strong', null, 'Acerca de este prototipo'));
    var lista = crear(doc, 'ul');
    (data.supuestos || []).forEach(function (s) {
      lista.appendChild(crear(doc, 'li', null, s));
    });
    nota.appendChild(lista);
    rootEl.appendChild(nota);
  }

  // -----------------------------------------------------------------------
  // Vista Perfil: UN número héroe (IMC actual), tarjeta clínica, tarjeta
  // antropométrica, y semáforos de laboratorios (punto de color MÁS etiqueta
  // de texto, nunca color solo).
  // -----------------------------------------------------------------------
  function mountPerfil(rootEl) {
    var doc = rootEl.ownerDocument;
    var data = G.HERZON_DATA || {};
    var paciente = data.paciente || {};
    var labs = data.labs || {};

    var heroCard = crear(doc, 'div', ['hz-card']);
    var hero = crear(doc, 'div', ['hz-hero']);
    hero.appendChild(crear(doc, 'div', ['hz-hero-label'], 'IMC actual'));
    hero.appendChild(crear(doc, 'div', ['hz-hero-num'], formatoNumero(paciente.imcActual, 1)));
    var deltaImc = redondear((paciente.imcActual || 0) - (paciente.imcInicial || 0), 1);
    var delta = crear(doc, 'div', ['hz-stat-delta'], conSigno(deltaImc, 1) + ' desde el inicio');
    delta.classList.add(deltaImc <= 0 ? 'hz-delta-good' : 'hz-delta-bad');
    hero.appendChild(delta);
    heroCard.appendChild(hero);
    rootEl.appendChild(heroCard);

    var grid = crear(doc, 'div', ['hz-grid']);

    var tarjetaClinica = crear(doc, 'div', ['hz-card']);
    tarjetaClinica.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Tarjeta clínica'));
    tarjetaClinica.appendChild(crear(doc, 'p', null, (paciente.nombre || '') + ', ' + (paciente.edad || '') + ' años, ' + (paciente.sexo || '')));
    tarjetaClinica.appendChild(crear(doc, 'p', null, 'Objetivo: ' + (paciente.objetivo || '')));
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
    tarjetaAntro.appendChild(crear(doc, 'p', null, 'Talla: ' + paciente.talla_cm + ' cm'));
    tarjetaAntro.appendChild(crear(doc, 'p', null, 'Peso inicial: ' + formatoNumero(paciente.pesoInicial_kg, 1) + ' kg'));
    tarjetaAntro.appendChild(crear(doc, 'p', null, 'Peso actual: ' + formatoNumero(paciente.pesoActual_kg, 1) + ' kg'));
    tarjetaAntro.appendChild(crear(doc, 'p', null, 'IMC inicial: ' + formatoNumero(paciente.imcInicial, 1)));
    tarjetaAntro.appendChild(crear(doc, 'p', null, 'IMC actual: ' + formatoNumero(paciente.imcActual, 1)));
    var ge = paciente.gastoEnergetico || {};
    tarjetaAntro.appendChild(crear(doc, 'p', null, 'TMB: ' + ge.tmb_kcal + ' kcal - GET: ' + ge.get_kcal + ' kcal'));
    grid.appendChild(tarjetaAntro);

    rootEl.appendChild(grid);

    var tarjetaLabs = crear(doc, 'div', ['hz-card']);
    tarjetaLabs.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Laboratorios - estado actual'));
    var cortes = labs.cortes || [];
    var ultimoCorte = cortes.length ? cortes[cortes.length - 1].etiqueta : '';
    tarjetaLabs.appendChild(crear(doc, 'p', null, 'Corte más reciente: ' + ultimoCorte));
    // jera-7 (Adendum R6): jerarquía interna dentro de cada fila -- el
    // nombre del marcador va en peso regular / --text-secondary (dato de
    // apoyo) y el valor va en 600 / --text-primary / tabular-nums (el dato
    // que importa), sin tocar el punto de estatus. Estilo puntual vía
    // element.style con tokens (contrato sección G), no clases nuevas: el
    // valor conserva la clase congelada hz-status-label (ya trae 600 +
    // --text-primary) y solo se le suma tabular-nums; el nombre es un span
    // aparte, sin esa clase. 6-8px de separación vertical entre filas.
    (labs.marcadores || []).forEach(function (m, indiceMarcador) {
      var valores = m.valores || [];
      var valorFinal = valores[valores.length - 1];
      var estado = calcularEstadoMarcador(valorFinal, m.referencia, m.mejorSi);
      var fila = crear(doc, 'div');
      if (indiceMarcador > 0) { fila.style.marginTop = '7px'; }
      var punto = crear(doc, 'span', ['hz-status-dot']);
      punto.setAttribute('data-status', estado);
      var nombre = crear(doc, 'span', null, m.nombre + ': ');
      nombre.style.color = 'var(--text-secondary)';
      nombre.style.fontWeight = '400';
      var valor = crear(doc, 'span', ['hz-status-label'],
        formatoNumero(valorFinal, 1) + ' ' + m.unidad + ' - ' + ETIQUETAS_ESTADO[estado]);
      valor.style.fontVariantNumeric = 'tabular-nums';
      fila.appendChild(punto);
      fila.appendChild(nombre);
      fila.appendChild(valor);
      tarjetaLabs.appendChild(fila);
    });
    rootEl.appendChild(tarjetaLabs);
  }

  // -----------------------------------------------------------------------
  // Vista Seguimiento: UN número héroe (cambio de peso EN EL RANGO activo),
  // líneas de peso / composición corporal / cintura (eje Y de peso FORZADO,
  // regla de Mario y contrato regla 3), laboratorios en 3 cortes y
  // plicometría en 4 cortes. Se suscribe a Herzon.filters.onRangeChange y
  // re-renderiza TODAS sus gráficas semanales contra el mismo corte de
  // 4/8/12 semanas.
  //
  // R4 (Adendum R4 punto 3): TODO delta/porcentaje mostrado en esta vista se
  // recalcula contra el PRIMER punto del rango seleccionado (4/8/12
  // semanas), no contra el inicio absoluto de las 12 semanas. Las etiquetas
  // nombran el periodo explícitamente ("en las últimas N semanas",
  // "respecto al inicio del periodo"). El único delta mostrado en esta
  // vista es el del héroe de peso (composición corporal y cintura no
  // imprimen delta propio, solo la línea); por eso solo el héroe se
  // recalcula en `actualizarHero`.
  // -----------------------------------------------------------------------
  function mountSeguimiento(rootEl) {
    var doc = rootEl.ownerDocument;
    var Charts = G.Herzon.Charts || {};
    var Herzon = G.Herzon;
    var data = G.HERZON_DATA || {};
    var labs = data.labs || {};
    var plicometria = data.plicometria || {};
    var unidades = (data.meta && data.meta.unidades) || {};
    var unidadPeso = unidades.peso || 'kg';
    var unidadCintura = unidades.cintura || 'cm';

    var heroCard = crear(doc, 'div', ['hz-card']);
    var hero = crear(doc, 'div', ['hz-hero']);
    var heroLabel = crear(doc, 'div', ['hz-hero-label']);
    var heroNum = crear(doc, 'div', ['hz-hero-num']);
    var heroDelta = crear(doc, 'div', ['hz-stat-delta']);
    hero.appendChild(heroLabel);
    hero.appendChild(heroNum);
    hero.appendChild(heroDelta);
    heroCard.appendChild(hero);
    rootEl.appendChild(heroCard);

    // R4: recalcula el héroe contra el primer punto del rango `n` activo
    // (no contra el inicio absoluto de las 12 semanas -- esa lectura es la
    // de Resumen, que no tiene filtro y sigue "desde el inicio"). prod-1
    // (Adendum R6 punto 4): recibe la serie de peso YA releída en la
    // llamada de `redibujar` que la invoca -- nunca una referencia vieja.
    function actualizarHero(n, pesoSerieActual) {
      var recorte = ultimasN(pesoSerieActual, n);
      var inicioPeriodo = recorte.length ? recorte[0] : 0;
      var pesoActual = recorte.length ? recorte[recorte.length - 1] : 0;
      var deltaPeriodo = redondear(pesoActual - inicioPeriodo, 1);
      var deltaPct = inicioPeriodo ? redondear((deltaPeriodo / inicioPeriodo) * 100, 1) : 0;
      heroLabel.textContent = 'Cambio de peso en las últimas ' + n + ' semanas';
      heroNum.textContent = conSigno(deltaPeriodo, 1) + ' kg';
      heroDelta.textContent = conSigno(deltaPct, 1) + '% respecto al inicio del periodo';
      heroDelta.classList.remove('hz-delta-good', 'hz-delta-bad');
      heroDelta.classList.add(deltaPeriodo <= 0 ? 'hz-delta-good' : 'hz-delta-bad');
    }

    var cardPeso = crear(doc, 'div', ['hz-card']);
    cardPeso.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Peso corporal'));
    var wrapPeso = crear(doc, 'div');
    cardPeso.appendChild(wrapPeso);
    rootEl.appendChild(cardPeso);

    // data-2 (Adendum R6 punto 7): Composición corporal partida en DOS
    // gráficas de una serie y un eje cada una -- kg y % nunca comparten
    // escala (regla "un eje" del contrato). El token de serie se conserva
    // por entidad: masa muscular series-3, grasa corporal series-2. Con
    // una sola serie por gráfica, Herzon.Charts.linea ya NO dibuja caja de
    // leyenda (regla 7 del contrato): el título nombra la serie única.
    var cardMusculo = crear(doc, 'div', ['hz-card']);
    cardMusculo.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Masa muscular (kg)'));
    var wrapMusculo = crear(doc, 'div');
    cardMusculo.appendChild(wrapMusculo);
    rootEl.appendChild(cardMusculo);

    var cardGrasa = crear(doc, 'div', ['hz-card']);
    cardGrasa.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Grasa corporal (%)'));
    var wrapGrasa = crear(doc, 'div');
    cardGrasa.appendChild(wrapGrasa);
    rootEl.appendChild(cardGrasa);

    var cardCintura = crear(doc, 'div', ['hz-card']);
    cardCintura.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Circunferencia de cintura'));
    var wrapCintura = crear(doc, 'div');
    cardCintura.appendChild(wrapCintura);
    rootEl.appendChild(cardCintura);

    function etiquetasDe(semanasSlice) {
      return semanasSlice.map(function (s) { return 'S' + s; });
    }

    // prod-1 (Adendum R6 punto 4, causa raíz): `redibujar` releía arreglos
    // capturados UNA sola vez al montar (`pesoSerie`, `musculoSerie`, ...).
    // build/documentos.js hace merge de mediciones REASIGNANDO
    // `HERZON_DATA.series.<clave> = arregloNuevo` (nunca in-place), así que
    // esa referencia vieja quedaba huérfana y la vista jamás reflejaba una
    // importación. Ahora cada llamada relee `G.HERZON_DATA.series` desde
    // cero: no hay arreglo de serie capturado fuera de esta función.
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
      if (typeof Charts.linea === 'function') {
        Charts.linea(wrapPeso, {
          // D5: sin título interno (duplicaría el heading de cardPeso);
          // se conserva el título accesible para lector de pantalla.
          tituloAccesible: 'Peso corporal en kilogramos a lo largo del tiempo',
          series: [{ nombre: 'Peso', datos: ultimasN(pesoSerieActual, n) }],
          etiquetasX: etiquetasX,
          yMin: 55,
          yMax: 85,
          // data-4 (Adendum R6 punto 2/consumo): unidad de HERZON_DATA.meta
          // en la etiqueta de punta ("70.2 kg"), ticks del eje intactos.
          unidad: unidadPeso,
          tabla: true
        });
      }

      limpiar(wrapMusculo);
      if (typeof Charts.linea === 'function') {
        Charts.linea(wrapMusculo, {
          // D5: sin título interno (duplicaría el heading de cardMusculo).
          tituloAccesible: 'Masa muscular corporal en kilogramos a lo largo del tiempo',
          series: [{ nombre: 'Masa muscular (kg)', datos: ultimasN(musculoSerieActual, n), color: 'var(--series-3)' }],
          etiquetasX: etiquetasX,
          yMin: 15,
          yMax: 40,
          unidad: unidadPeso,
          tabla: true
        });
      }

      limpiar(wrapGrasa);
      if (typeof Charts.linea === 'function') {
        Charts.linea(wrapGrasa, {
          // D5: sin título interno (duplicaría el heading de cardGrasa).
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
      if (typeof Charts.linea === 'function') {
        Charts.linea(wrapCintura, {
          // D5: sin título interno (duplicaría el heading de cardCintura).
          tituloAccesible: 'Circunferencia de cintura en centímetros a lo largo del tiempo',
          series: [{ nombre: 'Cintura', datos: ultimasN(cinturaSerieActual, n) }],
          etiquetasX: etiquetasX,
          yMin: 70,
          yMax: 100,
          unidad: unidadCintura,
          tabla: true
        });
      }
    }

    var rangoInicial = (Herzon.filters && typeof Herzon.filters.getRange === 'function') ? Herzon.filters.getRange() : 12;
    redibujar(rangoInicial);
    if (Herzon.filters && typeof Herzon.filters.onRangeChange === 'function') {
      Herzon.filters.onRangeChange(function (weeks) { redibujar(weeks); });
    }

    // prod-1 (Adendum R6 punto 4): al importar mediciones desde
    // build/documentos.js, esa función dispara `herzon:mediciones-importadas`
    // en el objeto global tras hacer merge sobre HERZON_DATA.series. Esta
    // vista escucha ese evento y vuelve a dibujar el rango actualmente
    // activo (no el absoluto): como `redibujar` relee la serie completa en
    // cada llamada, la semana importada aparece sin recargar la página.
    if (typeof G.addEventListener === 'function') {
      G.addEventListener('herzon:mediciones-importadas', function () {
        var rangoActivo = (Herzon.filters && typeof Herzon.filters.getRange === 'function') ? Herzon.filters.getRange() : 12;
        redibujar(rangoActivo);
      });
    }

    // jera-2/data-1/fini-2 (Adendum R6 fix, T-033, CAUSA RAÍZ REAL): montar
    // cardLabs/gridLabs en el documento ANTES del loop no bastaba, porque el
    // loop anterior seguía haciendo append+render POR ITEM: en la primera
    // vuelta, gridLabs tenía UN solo hijo (el auto-fit de la grilla le daba
    // la fila completa, ~1130px) y Charts.barras medía `clientWidth` en ESE
    // instante y horneaba el viewBox a ese ancho; recién en la vuelta
    // siguiente el grid reflowaba a columnas y esa primera celda se
    // comprimía a ~356px, quedando a escala ~0.31 (texto microscópico y una
    // altura distinta a sus 6 hermanas). El fix real es en DOS FASES
    // separadas: fase 1 crea y adjunta TODOS los wrapMarcador a gridLabs
    // (el grid ya queda en su geometría final de 7 columnas); solo
    // entonces arranca la fase 2, en un loop aparte, que llama
    // Charts.barras sobre cada wrap ya con esa geometría estable -- las 7
    // miden el mismo ancho de celda y salen con la misma altura. Mismo
    // patrón ya correcto en la card de plicometría, más abajo (una sola
    // gráfica, sin este riesgo de reflow intermedio). Laboratorios en 3
    // cortes: son puntos clínicos fijos (Basal / Seguimiento / Final), no
    // muestras semanales -- no se re-cortan con el filtro de rango
    // (DECISION registrada en el hand-off de la tarea original).
    var cardLabs = crear(doc, 'div', ['hz-card']);
    cardLabs.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Laboratorios en 3 cortes'));
    var gridLabs = crear(doc, 'div', ['hz-grid']);
    cardLabs.appendChild(gridLabs);
    rootEl.appendChild(cardLabs);

    var cortesEtiquetas = (labs.cortes || []).map(function (c) { return c.etiqueta; });
    var marcadoresLabs = labs.marcadores || [];

    // Fase 1 (T-033): crear y adjuntar TODOS los wrapMarcador a gridLabs
    // antes de renderizar ninguno. Ningún Charts.* se invoca en este loop.
    var wrapsLabs = marcadoresLabs.map(function (m) {
      var wrapMarcador = crear(doc, 'div');
      gridLabs.appendChild(wrapMarcador);
      return wrapMarcador;
    });

    // Fase 2 (T-033): con gridLabs ya en su geometría final (7 hijos
    // adjuntos), renderizar cada gráfica de laboratorio en un loop
    // separado -- todas miden el mismo clientWidth de celda.
    marcadoresLabs.forEach(function (m, indiceMarcadorLab) {
      if (typeof Charts.barras !== 'function') { return; }
      var opcionesBarras = {
        titulo: m.nombre + ' (' + m.unidad + ')',
        categorias: cortesEtiquetas,
        series: [{ nombre: m.nombre, datos: m.valores }],
        tabla: true
      };
      // data-8 (Adendum R6 punto 2/consumo): referencia clínica {min,max}
      // SOLO para los marcadores que la traen en HERZON_DATA.
      if (m.referencia && typeof m.referencia.min === 'number' && typeof m.referencia.max === 'number') {
        opcionesBarras.referencia = { min: m.referencia.min, max: m.referencia.max, etiqueta: 'Rango normal' };
      }
      Charts.barras(wrapsLabs[indiceMarcadorLab], opcionesBarras);
    });

    // -------------------------------------------------------------------
    // Card de plicometría (Adendum R4 punto 1 + esta tarea): 4 series (una
    // por sitio anatómico), colores fijos del contrato (el color sigue al
    // SITIO, no a la posición en el arreglo), etiquetado directo en cada
    // serie, leyenda, tooltip y "Ver tabla" -- todo eso ya lo produce
    // Herzon.Charts.linea para cada serie sin importar cuántas haya (a
    // diferencia de Herzon.Charts.barras, que solo etiqueta el máximo
    // cuando hay una única serie). Eje Y único en mm, forzado al rango
    // clínico plausible de un pliegue cutáneo (regla 3 del contrato: nunca
    // autoescalar sobre 4 puntos de variación).
    //
    // DECISION (T-016): la plicometría se reporta en cortes clínicos fijos
    // S1/S4/S8/S12 -- igual que Laboratorios en 3 cortes -- así que NO se
    // suscribe a Herzon.filters.onRangeChange y NO se recorta con el filtro
    // de 4/8/12 semanas. El filtro de rango opera sobre la cadencia
    // SEMANAL de peso/composición/cintura (12 puntos); los cortes de
    // plicometría y de laboratorios son mediciones puntuales espaciadas en
    // el tiempo, no una serie semanal, por lo que "filtrar a 4 semanas" no
    // tiene una lectura correcta sobre ellos (mismo razonamiento ya
    // registrado arriba para la card de Laboratorios).
    var TOKEN_POR_SITIO_PLICOMETRIA = {
      tricipital: 'var(--series-1)',
      subescapular: 'var(--series-2)',
      suprailiaco: 'var(--series-3)',
      abdominal: 'var(--series-4)'
    };
    var cardPlic = crear(doc, 'div', ['hz-card']);
    cardPlic.appendChild(crear(doc, 'h3', ['hz-card-title'], 'Plicometría en 4 cortes'));
    var wrapPlic = crear(doc, 'div');
    cardPlic.appendChild(wrapPlic);
    rootEl.appendChild(cardPlic);

    var cortesPlic = plicometria.cortes || [];
    var sitiosPlic = plicometria.sitios || [];
    var seriesPlic = sitiosPlic.map(function (sitio) {
      return {
        nombre: sitio.nombre,
        datos: sitio.valores_mm,
        color: TOKEN_POR_SITIO_PLICOMETRIA[sitio.clave]
      };
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
