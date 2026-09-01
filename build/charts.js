// build/charts.js
// Herzon.Charts — librería SVG genérica hecha a mano, AGNOSTICA de datos: cada función
// recibe (contenedorEl, opciones) y devuelve el elemento raiz que creo. No conoce el
// objeto de datos global del prototipo en ninguna forma; el llamador decide que
// arrays y valores le pasa.
//
// Método: skill dataviz (marks-and-anatomy.md, interaction.md, anti-patterns.md) y
// .harness/design-contract-herzon.md secciones 2 y 3 (13 reglas duras). Namespaces y
// convenciones congeladas en .harness/plan.md sección 3.
//
// Preámbulo obligatorio (plan.md 3.A): script clásico, IIFE, sin import/export.
// Prohibido tocar `document` en el nivel superior del módulo: todo acceso al DOM ocurre
// dentro de funciones, usando `contenedorEl.ownerDocument` (funciona igual en el navegador
// real y contra el TestDOM headless de build/testdom.js).
//
// Color (contrato sección H): jamás un hex literal, jamás por atributo de presentación.
// Todo color se asigna con `elemento.style.fill = 'var(--token)'` o
// `elemento.style.stroke = 'var(--token)'`.
(function () {
  var G = (typeof window !== 'undefined') ? window : globalThis;
  G.Herzon = G.Herzon || {};
  G.Herzon.Charts = G.Herzon.Charts || {};
  var Charts = G.Herzon.Charts;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var GAP_SEPARADOR = 2;      // regla 5: gap de 2px color superficie
  var GROSOR_MAX_BARRA = 24;  // regla 4: barra <= 24px de grosor
  var RADIO_ESQUINA = 4;      // regla 4: punta redondeada 4px
  var HIT_MINIMO = 24;        // regla 10: zona de hit >= 24px

  // QA ronda 1 (D2/D3): tamaños de fuente físicos mínimos y factor de estimación
  // de ancho de texto. Se fijan por atributo SVG (no son color: no violan la
  // regla de color-solo-por-token) para que el mínimo de 11px se cumpla sin
  // depender de que el CSS del ensamble defina la clase correcta.
  var TAMANO_FUENTE_EJE = 11;       // ticks y categorías de eje
  var TAMANO_FUENTE_ETIQUETA = 12;  // etiquetas de valor de punta
  var FACTOR_ANCHO_CARACTER = 0.62; // D2: ancho estimado por carácter, sin medición real de DOM

  // QA ronda 3 (a): colisión de labels de categoría en el eje X de apilada100/barras
  // verticales (macros por comida: "Colación vespertina" encimada con sus vecinas).
  var ROTACION_ETIQUETA_X_GRADOS = 35;   // rotación cuando el label no cabe horizontal
  var MARGEN_ABAJO_CATEGORIA_BASE = 40;  // margen inferior sin rotar (comportamiento previo)
  var PADDING_ETIQUETA_CATEGORIA = 6;    // aire mínimo entre etiquetas de categoría vecinas

  // QA ronda 3 (b): recorte por el INICIO del label izquierdo en barras horizontales
  // ("Omega-3 (aceite de pescado)" se veía como "3 (aceite de pescado)").
  var GUTTER_IZQUIERDO_PROPORCION_MAX = 0.40; // tope: hasta ~40% del ancho del chart
  var GUTTER_IZQUIERDO_MIN = 60;               // piso razonable para el gutter de labels
  var PADDING_GUTTER_IZQUIERDO = 16;           // aire entre el texto del gutter y el eje

  // T-025: anti-colisión de labels de punta en linea() cuando 2+ series terminan a
  // menos de una linea de texto de distancia vertical (caso real: plicometria S12,
  // Subescapular 20mm vs Suprailiaco 21mm en escala 0-40, ~5.8px entre centros --
  // root cause del triple rechazo de T-018, ver nota REJECTED de las 11:26 en
  // .harness/tasks/T-018.json). ALTURA_MINIMA_ETIQUETA_PUNTA es la separación
  // vertical mínima entre labels; UMBRAL_LINEA_GUIA es el desplazamiento a partir
  // del cual el label queda visualmente desconectado de su punto y se traza una
  // linea guia (marks-and-anatomy.md, sección "Labels & legend": "When end-labels
  // collide ... use leader lines").
  var ALTURA_MINIMA_ETIQUETA_PUNTA = 12;
  var UMBRAL_LINEA_GUIA = 4;

  // R6 (Adendum 2): opciones aditivas default-apagadas del refinamiento Justesse.
  // Umbral mínimo de alto de segmento (apilada100) para dibujar su etiqueta de
  // porcentaje; segmentos más angostos quedan sin etiqueta (los cubre la tabla).
  var ALTURA_MINIMA_ETIQUETA_SEGMENTO = 14;
  // Aire entre el texto de etiquetasFila (heatmapCalendario) y el borde
  // izquierdo del grid de celdas.
  var PADDING_GUTTER_FILA_HEATMAP = 10;
  // Iniciales de día en español: orden que devuelve Date.prototype.getUTCDay()
  // (0 = domingo) y orden canónico de semana que empieza en lunes (fallback
  // cuando la etiqueta no es una fecha ISO parseable, p.ej. fixtures sintéticos).
  var INICIALES_DIA_POR_GETDAY = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  var INICIALES_DIA_CANONICA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  // R9 (DV-05 pieza 3): lado por defecto de celda del heatmap, usado también
  // como la referencia autoconsistente para que anchoDeRenderizado reproduzca
  // EXACTO el mismo ancho por defecto de antes cuando no hay layout real ni
  // opciones.ancho/opciones.lado (ver derivarLadoCeldaHeatmap más abajo).
  var LADO_HEATMAP_POR_DEFECTO = 16;

  // ---------------------------------------------------------------------
  // Utilidades internas puras (sin DOM)
  // ---------------------------------------------------------------------

  function tokenSerie(indice) {
    var i = (indice % 5) + 1;
    return 'var(--series-' + i + ')';
  }

  function formatearNumero(v) {
    if (typeof v !== 'number' || isNaN(v)) return '';
    var redondeado = Math.round(v * 10) / 10;
    var negativo = redondeado < 0;
    var abs = Math.abs(redondeado);
    var partes = String(abs).split('.');
    var entero = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var resultado = entero + (partes[1] ? '.' + partes[1] : '');
    return (negativo ? '-' : '') + resultado;
  }

  // Genera `cantidad` ticks equiespaciados entre yMin y yMax. Por construcción,
  // ticks[0] === yMin y ticks[último] === yMax exactamente (regla 3: eje forzable).
  function generarTicksY(yMin, yMax, cantidad) {
    cantidad = cantidad || 5;
    if (cantidad < 2) cantidad = 2;
    var ticks = [];
    for (var i = 0; i < cantidad; i++) {
      ticks.push(yMin + (yMax - yMin) * (i / (cantidad - 1)));
    }
    return ticks;
  }

  // Etiquetado directo selectivo (regla 7 / marks-and-anatomy.md): nunca todas las
  // marcas. Con <=6 puntos se muestran todas las etiquetas de eje; si hay más, solo
  // primero / medio / último.
  function seleccionarIndicesEtiquetas(n) {
    if (n <= 0) return [];
    if (n <= 6) {
      var todos = [];
      for (var i = 0; i < n; i++) todos.push(i);
      return todos;
    }
    var vistos = {};
    var resultado = [];
    [0, Math.floor((n - 1) / 2), n - 1].forEach(function (v) {
      if (!vistos[v]) { vistos[v] = true; resultado.push(v); }
    });
    resultado.sort(function (a, b) { return a - b; });
    return resultado;
  }

  function indiceDelMaximo(arr) {
    if (!arr || !arr.length) return -1;
    var idx = 0;
    for (var i = 1; i < arr.length; i++) {
      if (typeof arr[i] === 'number' && arr[i] > arr[idx]) idx = i;
    }
    return idx;
  }

  // R6: sufijo de unidad SOLO para etiquetas de valor (nunca para ticks de eje,
  // que siempre quedan limpios via formatearNumero directo).
  function etiquetaConUnidad(valor, unidad) {
    var base = formatearNumero(valor);
    return unidad ? (base + ' ' + unidad) : base;
  }

  // R6 (heatmapCalendario): bucket ordinal 0..pasos-1 de un valor dentro del
  // rango [minV, maxV]; mismo cómputo que antes vivía inline en el render.
  function calcularBucketRampa(valor, minV, maxV, pasos) {
    pasos = pasos || 5;
    if (maxV === minV) return 0;
    var proporcion = (valor - minV) / (maxV - minV);
    if (proporcion < 0) proporcion = 0;
    if (proporcion > 1) proporcion = 1;
    return Math.min(pasos - 1, Math.floor(proporcion * pasos));
  }

  // R6 (heatmapCalendario, leyendaRampa): rango numérico [desde, hasta) de cada
  // bucket ordinal, para rotular cada swatch de la leyenda con su cota.
  function calcularRangosBucketsRampa(minV, maxV, pasos) {
    pasos = pasos || 5;
    var rangos = [];
    for (var i = 0; i < pasos; i++) {
      rangos.push({
        desde: minV + (maxV - minV) * (i / pasos),
        hasta: minV + (maxV - minV) * ((i + 1) / pasos)
      });
    }
    return rangos;
  }

  // R9 (DV-05 pieza 3, fix interno sin API): deriva el lado de celda del
  // heatmap a partir del ancho DISPONIBLE para celdas (ancho total del
  // contenedor menos el gutter de etiquetasFila y los gaps fijos), en vez de
  // un `lado` constante que el CSS width:100% del SVG termina reescalando de
  // forma impredecible según la card (misma causa raíz que D3, ya corregida
  // en las demás primitivas vía anchoDeRenderizado). Álgebra exacta: como
  // ancho = margenIzquierdaFilas + columnas*(lado+gap) + gap, despejar lado
  // de ese mismo ancho da anchoDisponibleCeldas/columnas === lado — así que
  // sin layout real (TestDOM headless) y sin opciones.ancho/opciones.lado,
  // donde anchoDeRenderizado devuelve el ancho por defecto calculado con
  // LADO_HEATMAP_POR_DEFECTO, esta función recupera EXACTO ese mismo valor
  // (no regresión). Piso de 8px para que la celda no colapse a 0 o negativo
  // en contenedores extremadamente angostos.
  function derivarLadoCeldaHeatmap(anchoTotal, margenIzquierdaFilas, gap, columnas) {
    if (!(columnas > 0)) return LADO_HEATMAP_POR_DEFECTO;
    var anchoDisponibleCeldas = anchoTotal - margenIzquierdaFilas - gap * (columnas + 1);
    return Math.max(8, anchoDisponibleCeldas / columnas);
  }

  // R6 (heatmapCalendario, encabezadosDia): inicial de día derivada de
  // opciones.etiquetas cuando es una fecha ISO parseable (YYYY-MM-DD...); si no,
  // cae al orden canónico de semana (lunes-primero) por posición de columna, para
  // que la función nunca lance con etiquetas sintéticas no fechables.
  function derivarInicialDiaSemana(etiquetaFecha, indiceColumna) {
    var cadena = etiquetaFecha == null ? '' : String(etiquetaFecha);
    if (/^\d{4}-\d{2}-\d{2}/.test(cadena)) {
      var fecha = new Date(cadena.slice(0, 10) + 'T00:00:00Z');
      if (!isNaN(fecha.getTime())) return INICIALES_DIA_POR_GETDAY[fecha.getUTCDay()];
    }
    return INICIALES_DIA_CANONICA[indiceColumna % 7];
  }

  function construirTablaAutomatica(etiquetas, series, etiquetaColumna) {
    var columnas = [etiquetaColumna || 'Categoría'];
    for (var i = 0; i < series.length; i++) columnas.push(series[i].nombre || ('Serie ' + (i + 1)));
    var filas = [];
    for (var f = 0; f < etiquetas.length; f++) {
      var fila = [etiquetas[f]];
      for (var s = 0; s < series.length; s++) {
        var datos = series[s].datos || [];
        fila.push(datos[f]);
      }
      filas.push(fila);
    }
    return { columnas: columnas, filas: filas };
  }

  var _contadorId = 0;
  function idUnico(prefijo) {
    _contadorId += 1;
    return (prefijo || 'hz') + '-' + _contadorId;
  }

  // D3 (QA ronda 1): usar el ancho real del contenedor (clientWidth al momento
  // del render) en vez de un viewBox fijo escalado por CSS width:100%, que es la
  // causa raíz de que las fuentes en unidades de viewBox se vean microscópicas en
  // contenedores angostos (small multiples, cards de 4 columnas): si el viewBox
  // declara 640 y el navegador lo comprime a ~285px reales, todo texto interno
  // se encoge por el mismo factor sin importar el font-size declarado. Igualando
  // el ancho del viewBox al ancho real renderizado, la escala queda en 1:1 y el
  // font-size en unidades SVG equivale a px físicos. Si no hay layout real
  // (TestDOM headless de los selfchecks no implementa clientWidth) se conserva
  // el comportamiento previo: opciones.ancho o el valor por defecto.
  function anchoDeRenderizado(contenedorEl, anchoOpciones, porDefecto) {
    var medido = contenedorEl && contenedorEl.clientWidth;
    if (typeof medido === 'number' && medido > 0) return Math.round(medido);
    if (typeof anchoOpciones === 'number' && anchoOpciones > 0) return anchoOpciones;
    return porDefecto;
  }

  // D2 (QA ronda 1): estimación pura (sin DOM, sin medición real de texto) del
  // ancho físico de una etiqueta, para poder reservar margen suficiente y no
  // recortar el label de punta contra el borde del viewBox. Calibrada para
  // digitos tabulares en tipografia sans-serif (deliberadamente conservadora:
  // sobreestimar el margen es preferible a recortar texto).
  function estimarAnchoTexto(texto, tamanoFuente) {
    var cadena = texto == null ? '' : String(texto);
    var tamano = tamanoFuente || TAMANO_FUENTE_ETIQUETA;
    return cadena.length * tamano * FACTOR_ANCHO_CARACTER;
  }

  // QA-R3 (a): cuando el ancho estimado de las etiquetas de categoría del eje X no cabe
  // horizontalmente en el espacio de su propia banda, se rotan ~35 grados (text-anchor end)
  // en vez de quedar encimadas contra la banda vecina. La decisión es GLOBAL a la gráfica
  // (todas rotan o ninguna) para que el eje quede legible de forma consistente, y nunca se
  // dibuja un número encima de cada punto como alternativa.
  function calcularRotacionEtiquetasX(categorias, anchoBanda) {
    var anchoMaximo = 0;
    for (var i = 0; i < categorias.length; i++) {
      var w = estimarAnchoTexto(categorias[i], TAMANO_FUENTE_EJE);
      if (w > anchoMaximo) anchoMaximo = w;
    }
    var rotar = anchoBanda > 0 && anchoMaximo > (anchoBanda - PADDING_ETIQUETA_CATEGORIA);
    var margenAbajo = MARGEN_ABAJO_CATEGORIA_BASE;
    if (rotar) {
      var radianes = ROTACION_ETIQUETA_X_GRADOS * Math.PI / 180;
      var extensionVertical = anchoMaximo * Math.sin(radianes);
      margenAbajo = Math.max(MARGEN_ABAJO_CATEGORIA_BASE, Math.min(130, Math.round(extensionVertical + 26)));
    }
    return { rotar: rotar, margenAbajo: margenAbajo };
  }

  // R9 (DV-02, fix interno sin API — mismo estatus que D2/D3/T-034): cuando
  // calcularRotacionEtiquetasX decide rotar, la PRIMERA banda (xCentro más
  // chico) es la más expuesta a que su etiqueta (text-anchor end, rotada)
  // desborde hacia x negativa fuera del viewBox. El sobrante horizontal de
  // esa etiqueta es su ancho estimado proyectado por cos(35°); si ese
  // sobrante excede el margen izquierdo actual, se amplía el margen para
  // cubrirlo exactamente (con tope proporcional al ancho total, mismo patrón
  // que GUTTER_IZQUIERDO_PROPORCION_MAX de QA-R3 b). Con el margen igualado
  // al sobrante, el borde izquierdo de la etiqueta rotada queda a
  // anchoGrupo/2 del borde del viewBox — siempre > 0 — así que el resultado
  // es seguro incluso sin resolver la geometría de anchoGrupo de forma
  // exacta (que cambia al crecer el margen).
  function calcularMargenIzquierdoRotado(categorias, anchoTotal, margenIzquierdaBase) {
    if (!categorias || !categorias.length) return margenIzquierdaBase;
    var radianes = ROTACION_ETIQUETA_X_GRADOS * Math.PI / 180;
    var anchoPrimeraEtiqueta = estimarAnchoTexto(categorias[0], TAMANO_FUENTE_EJE);
    var proyeccionHorizontal = anchoPrimeraEtiqueta * Math.cos(radianes);
    var deseado = Math.max(margenIzquierdaBase, proyeccionHorizontal);
    var tope = Math.max(margenIzquierdaBase, anchoTotal * GUTTER_IZQUIERDO_PROPORCION_MAX);
    return Math.min(deseado, tope);
  }

  // Dibuja una etiqueta de categoría del eje X: centrada y horizontal cuando cabe; si no,
  // rotada ~35 grados con text-anchor end (regla dura QA-R3 a: prohibido dejarlas encimadas).
  function dibujarEtiquetaCategoriaX(doc, svg, xCentro, yBase, texto, rotar) {
    var cadena = texto == null ? '' : String(texto);
    var attrs = rotar
      ? {
          x: xCentro, y: yBase, 'text-anchor': 'end', 'font-size': String(TAMANO_FUENTE_EJE),
          transform: 'rotate(-' + ROTACION_ETIQUETA_X_GRADOS + ' ' + xCentro + ' ' + yBase + ')'
        }
      : { x: xCentro, y: yBase, 'text-anchor': 'middle', 'font-size': String(TAMANO_FUENTE_EJE) };
    var etiqueta = crearSVG(doc, 'text', attrs);
    etiqueta.style.fill = 'var(--text-muted)';
    etiqueta.textContent = cadena;
    if (rotar) etiqueta.setAttribute('data-etiqueta-rotada', '1');
    svg.appendChild(etiqueta);
    return etiqueta;
  }

  // QA-R3 (b): trunca con elipsis SIEMPRE al final del texto (nunca por el inicio) cuando
  // ni el gutter máximo alcanza para el label completo. Estimación pura de caracteres,
  // consistente con estimarAnchoTexto (D2): mismo método, sin medición real de DOM.
  function truncarConElipsisFinal(texto, anchoDisponible, tamanoFuente) {
    var cadena = texto == null ? '' : String(texto);
    if (estimarAnchoTexto(cadena, tamanoFuente) <= anchoDisponible) return cadena;
    var ELIPSIS = '…';
    var anchoPorCaracter = tamanoFuente * FACTOR_ANCHO_CARACTER;
    var anchoDisponibleTexto = anchoDisponible - estimarAnchoTexto(ELIPSIS, tamanoFuente);
    if (anchoDisponibleTexto <= 0) return ELIPSIS;
    var maxCaracteres = Math.max(1, Math.floor(anchoDisponibleTexto / anchoPorCaracter));
    if (maxCaracteres >= cadena.length) return cadena;
    return cadena.slice(0, maxCaracteres) + ELIPSIS;
  }

  // T-025: recibe una lista de puntos `{cx, cy, ...}` de labels de punta EN
  // CUALQUIER orden y devuelve la MISMA lista con la propiedad `yEtiqueta`
  // anadida a cada objeto (mutación in-place, para que el llamador conserve las
  // demas propiedades del punto). Algoritmo: se agrupan en clusters de colisión
  // por adyacencia en Y (ordenados ascendente); cada cluster de 2+ se reparte
  // simetricamente centrado en el promedio de sus valores originales -- el label
  // superior sube, el inferior baja, en cascada si son 3+ -- separados
  // exactamente `alturaMinima`, y el cluster completo se acota al area vertical
  // disponible (`limiteArriba`..`limiteAbajo`) sin romper el espaciado interno. Un
  // punto sin colisión (cluster de tamaño 1) conserva `yEtiqueta === cy` (cero
  // desplazamiento).
  function resolverColisionesEtiquetasPunta(puntos, limiteArriba, limiteAbajo, alturaMinima) {
    var orden = puntos.slice().sort(function (a, b) { return a.cy - b.cy; });
    var n = orden.length;
    if (!n) return puntos;

    var clusters = [[orden[0]]];
    for (var i = 1; i < n; i++) {
      if (orden[i].cy - orden[i - 1].cy < alturaMinima) {
        clusters[clusters.length - 1].push(orden[i]);
      } else {
        clusters.push([orden[i]]);
      }
    }

    clusters.forEach(function (cluster) {
      if (cluster.length === 1) {
        cluster[0].yEtiqueta = cluster[0].cy;
        return;
      }
      var suma = 0;
      for (var k = 0; k < cluster.length; k++) suma += cluster[k].cy;
      var centro = suma / cluster.length;
      var extension = (cluster.length - 1) * alturaMinima;
      var inicio = centro - extension / 2;
      if (limiteArriba != null && inicio < limiteArriba) inicio = limiteArriba;
      if (limiteAbajo != null && inicio + extension > limiteAbajo) inicio = limiteAbajo - extension;
      if (limiteArriba != null && inicio < limiteArriba) inicio = limiteArriba;
      for (var j = 0; j < cluster.length; j++) cluster[j].yEtiqueta = inicio + j * alturaMinima;
    });

    return puntos;
  }

  // T-034 (R6-fix): colisión rectangular estimada entre dos cajas de texto/marca.
  // Cajas siempre en el mismo sistema de coordenadas del SVG (x0<x1, y0<y1, "y"
  // crece hacia abajo). Reutilizada por la etiqueta de opciones.referencia de
  // barras() para no reinventar el cómputo de intersección en cada llamador.
  function cajasIntersectan(a, b) {
    return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  }

  // T-034 (R6-fix, barras verticales): posiciona la etiqueta corta de
  // opciones.referencia. Por defecto se ancla al extremo IZQUIERDO de la
  // hairline (`xEtiqueta`, típicamente margen.izquierda): el extremo derecho es
  // SIEMPRE de la etiqueta de valor del último elemento (R6 data-4), que nunca
  // cede esa posición. Si la caja estimada de la etiqueta en su posición por
  // defecto (medida con estimarAnchoTexto, igual que el resto del módulo)
  // colisiona con alguna de `obstaculos` (cajas de barra y/o de etiqueta de
  // valor final que el llamador ya calculó con las posiciones reales del
  // render), se desplaza verticalmente por encima de la hairline: al menos
  // `separacionMinima` px por encima del borde superior del obstáculo más alto
  // que la toca (nunca menos que `separacionMinima` respecto de la propia
  // hairline, que es la separación de la posición por defecto). Función pura
  // (sin DOM) para que el render y el selfcheck compartan el mismo cómputo.
  // R9 (DV-03 + DV-04 combinados, fix de colisión): `limiteArriba` es
  // OPCIONAL (backward-compatible: ausente, comportamiento idéntico a
  // T-034). Con valoresEnBarras activo la primera categoría también es un
  // obstáculo real (evidencia: "Laboratorios en 3 cortes" con referencia
  // {min,max} Y valoresEnBarras a la vez, Basal cerca del techo del rango) —
  // sin este piso, empujar la etiqueta por encima del obstáculo puede
  // sacarla del área de trazo (y hasta del viewBox) y dejarla invisible, que
  // es peor que la colisión que se quería evitar (texto ilegible = falla
  // dura, mismo principio que D2/D3). Si el desplazamiento por colisión la
  // deja por encima de `limiteArriba`, se re-ancla ahí como piso. Fix
  // post-rechazo del verifier: el piso solo no basta — puede volver a caer
  // sobre el propio obstáculo (mismo caso real), así que tras anclar al
  // piso se revalida contra `obstaculos` y, si persiste la colisión, la
  // etiqueta se corre en X más allá del obstáculo más ancho que la toca
  // (nunca queda una caja final que intersecte una barra).
  function resolverPosicionEtiquetaReferencia(xEtiqueta, yHairline, texto, tamanoFuente, separacionMinima, obstaculos, limiteArriba) {
    var anchoTexto = estimarAnchoTexto(texto, tamanoFuente);
    var y = yHairline - separacionMinima;
    var caja = { x0: xEtiqueta, x1: xEtiqueta + anchoTexto, y0: y - tamanoFuente, y1: y };
    var listaObstaculos = obstaculos || [];
    listaObstaculos.forEach(function (o) {
      if (cajasIntersectan(caja, o)) {
        var yTecho = o.y0 - separacionMinima;
        if (yTecho < caja.y1) {
          var delta = caja.y1 - yTecho;
          caja.y0 -= delta;
          caja.y1 -= delta;
        }
      }
    });
    if (typeof limiteArriba === 'number' && caja.y0 < limiteArriba) {
      var deltaPiso = limiteArriba - caja.y0;
      caja.y0 += deltaPiso;
      caja.y1 += deltaPiso;
      // R9 (fix post-rechazo verifier, evidencia "Laboratorios en 3 cortes"):
      // el piso puede volver a caer sobre el MISMO obstáculo que la evasión
      // vertical intentaba esquivar (ya no hay margen hacia arriba: está en
      // el piso). La única salida sin dejar la etiqueta invisible ni tapada
      // es correrla en X más allá del obstáculo más ancho que sigue
      // tocándola, y repetir por si el nuevo sitio choca con otro obstáculo
      // (p.ej. la barra Basal y luego la de Seguimiento). Cota dura: nunca
      // más iteraciones que obstáculos hay, así que siempre termina.
      var iteraciones = 0;
      var colisionPersiste = true;
      while (colisionPersiste && iteraciones < listaObstaculos.length) {
        colisionPersiste = false;
        var maxX1Colisionando = null;
        listaObstaculos.forEach(function (o2) {
          if (cajasIntersectan(caja, o2)) {
            colisionPersiste = true;
            if (maxX1Colisionando === null || o2.x1 > maxX1Colisionando) maxX1Colisionando = o2.x1;
          }
        });
        if (colisionPersiste && maxX1Colisionando !== null) {
          var nuevoX0 = maxX1Colisionando + separacionMinima;
          caja.x0 = nuevoX0;
          caja.x1 = nuevoX0 + anchoTexto;
        }
        iteraciones += 1;
      }
    }
    return { x: caja.x0, y: caja.y1, ancho: anchoTexto, caja: caja };
  }

  // ---------------------------------------------------------------------
  // Utilidades internas de DOM (SVG y HTML)
  // ---------------------------------------------------------------------

  function crearSVG(doc, tag, attrs) {
    var elemento = doc.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          elemento.setAttribute(k, attrs[k]);
        }
      }
    }
    return elemento;
  }

  function crearHTML(doc, tag, attrs) {
    var elemento = doc.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          elemento.setAttribute(k, attrs[k]);
        }
      }
    }
    return elemento;
  }

  // Marca de barra vertical: crece desde la linea base (abajo, cuadrada), con las
  // dos esquinas superiores redondeadas (regla 4: "punta redondeada, base cuadrada").
  function construirBarraVertical(doc, x, y, ancho, alturaBarra, radio) {
    var r = Math.max(0, Math.min(radio, ancho / 2, alturaBarra));
    var d = 'M ' + x + ',' + (y + alturaBarra) +
      ' L ' + x + ',' + (y + r) +
      ' Q ' + x + ',' + y + ' ' + (x + r) + ',' + y +
      ' L ' + (x + ancho - r) + ',' + y +
      ' Q ' + (x + ancho) + ',' + y + ' ' + (x + ancho) + ',' + (y + r) +
      ' L ' + (x + ancho) + ',' + (y + alturaBarra) +
      ' Z';
    var path = crearSVG(doc, 'path', { d: d, 'data-grosor': String(Math.round(ancho * 100) / 100) });
    path.style.stroke = 'none';
    return path;
  }

  // Marca de barra horizontal: crece desde la linea base (izquierda, cuadrada), con
  // las dos esquinas del extremo derecho (data-end) redondeadas.
  function construirBarraHorizontal(doc, x, y, anchoBarra, alto, radio) {
    var r = Math.max(0, Math.min(radio, alto / 2, anchoBarra));
    var d = 'M ' + x + ',' + y +
      ' L ' + (x + anchoBarra - r) + ',' + y +
      ' Q ' + (x + anchoBarra) + ',' + y + ' ' + (x + anchoBarra) + ',' + (y + r) +
      ' L ' + (x + anchoBarra) + ',' + (y + alto - r) +
      ' Q ' + (x + anchoBarra) + ',' + (y + alto) + ' ' + (x + anchoBarra - r) + ',' + (y + alto) +
      ' L ' + x + ',' + (y + alto) +
      ' Z';
    var path = crearSVG(doc, 'path', { d: d, 'data-grosor': String(Math.round(alto * 100) / 100) });
    path.style.stroke = 'none';
    return path;
  }

  // Leyenda: identidad de color siempre por swatch, nunca por texto coloreado
  // (regla 8). Usada como primitiva pública y como pieza interna de otras gráficas.
  function construirLeyenda(doc, contenedorEl, series) {
    var raiz = crearHTML(doc, 'div');
    raiz.classList.add('hz-legend');
    raiz.setAttribute('role', 'list');
    for (var i = 0; i < series.length; i++) {
      var item = crearHTML(doc, 'div');
      item.classList.add('hz-legend-item');
      item.setAttribute('role', 'listitem');

      var swatch = crearHTML(doc, 'span');
      swatch.classList.add('hz-legend-swatch');
      swatch.style.backgroundColor = series[i].color || tokenSerie(i);

      var etiqueta = crearHTML(doc, 'span');
      etiqueta.textContent = series[i].nombre || '';

      item.appendChild(swatch);
      item.appendChild(etiqueta);
      raiz.appendChild(item);
    }
    contenedorEl.appendChild(raiz);
    return raiz;
  }

  // Toggle "Ver tabla" + tabla equivalente (regla 9, regla de relieve del contrato).
  function construirTablaToggle(doc, contenedorEl, especTabla) {
    var columnas = especTabla.columnas || [];
    var filas = especTabla.filas || [];
    var idWrap = idUnico('hz-tabla');

    var raiz = crearHTML(doc, 'div');

    var boton = crearHTML(doc, 'button');
    boton.classList.add('hz-table-toggle');
    boton.setAttribute('type', 'button');
    boton.setAttribute('aria-expanded', 'false');
    boton.setAttribute('aria-controls', idWrap);
    boton.textContent = especTabla.etiquetaBoton || 'Ver tabla';

    var wrap = crearHTML(doc, 'div');
    wrap.classList.add('hz-table-wrap');
    wrap.setAttribute('id', idWrap);
    wrap.setAttribute('hidden', '');
    wrap.style.display = 'none';

    var tabla = crearHTML(doc, 'table');
    tabla.classList.add('hz-table');

    var thead = crearHTML(doc, 'thead');
    var trEncabezado = crearHTML(doc, 'tr');
    for (var c = 0; c < columnas.length; c++) {
      var th = crearHTML(doc, 'th');
      th.setAttribute('scope', 'col');
      th.textContent = columnas[c] == null ? '' : String(columnas[c]);
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

    boton.addEventListener('click', function () {
      var expandidoAhora = boton.getAttribute('aria-expanded') === 'true';
      var nuevoExpandido = !expandidoAhora;
      boton.setAttribute('aria-expanded', nuevoExpandido ? 'true' : 'false');
      if (nuevoExpandido) {
        wrap.removeAttribute('hidden');
        wrap.style.display = '';
      } else {
        wrap.setAttribute('hidden', '');
        wrap.style.display = 'none';
      }
    });

    raiz.appendChild(boton);
    raiz.appendChild(wrap);
    contenedorEl.appendChild(raiz);
    return raiz;
  }

  function resolverEspecTabla(opcionesTabla, etiquetas, series, etiquetaColumna) {
    if (opcionesTabla && opcionesTabla.columnas && opcionesTabla.filas) return opcionesTabla;
    var auto = construirTablaAutomatica(etiquetas, series, etiquetaColumna);
    if (opcionesTabla && opcionesTabla.etiquetaBoton) auto.etiquetaBoton = opcionesTabla.etiquetaBoton;
    return auto;
  }

  // ---------------------------------------------------------------------
  // Herzon.Charts.linea — multi-serie, crosshair + tooltip único, eje Y forzable
  // ---------------------------------------------------------------------
  Charts.linea = function (contenedorEl, opciones) {
    opciones = opciones || {};
    var doc = contenedorEl.ownerDocument;
    var series = opciones.series || [];
    var etiquetasX = opciones.etiquetasX || [];
    var ancho = anchoDeRenderizado(contenedorEl, opciones.ancho, 640);
    var alto = opciones.alto || 280;

    // D2: reservar margen derecho según el ancho estimado del label de punta más
    // ancho entre todas las series (el último punto de cada una), en vez del
    // margen fijo de 20px que lo recortaba contra el borde del viewBox.
    var ESPACIO_PUNTO_ETIQUETA = 8; // separación entre el punto y el inicio del texto
    var anchoEtiquetaFinalMax = 0;
    series.forEach(function (s) {
      var datos = s.datos || [];
      if (!datos.length) return;
      var anchoTexto = estimarAnchoTexto(etiquetaConUnidad(datos[datos.length - 1], opciones.unidad), TAMANO_FUENTE_ETIQUETA);
      if (anchoTexto > anchoEtiquetaFinalMax) anchoEtiquetaFinalMax = anchoTexto;
    });
    var margenDerecho = Math.max(20, ESPACIO_PUNTO_ETIQUETA + anchoEtiquetaFinalMax + 6);
    var margen = { arriba: 16, derecha: margenDerecho, abajo: 32, izquierda: 52 };
    var anchoPlot = ancho - margen.izquierda - margen.derecha;
    var altoPlot = alto - margen.arriba - margen.abajo;

    var todosValores = [];
    series.forEach(function (s) {
      (s.datos || []).forEach(function (v) {
        if (typeof v === 'number' && !isNaN(v)) todosValores.push(v);
      });
    });
    var dataMin = todosValores.length ? Math.min.apply(null, todosValores) : 0;
    var dataMax = todosValores.length ? Math.max.apply(null, todosValores) : 1;
    var yMin = (typeof opciones.yMin === 'number') ? opciones.yMin : dataMin;
    var yMax = (typeof opciones.yMax === 'number') ? opciones.yMax : dataMax;
    if (yMax === yMin) yMax = yMin + 1;

    var ticksY = generarTicksY(yMin, yMax, opciones.pasosY || 5);
    var escalaY = function (v) { return margen.arriba + altoPlot - ((v - yMin) / (yMax - yMin)) * altoPlot; };
    var n = etiquetasX.length;
    var escalaX = function (i) { return margen.izquierda + (n <= 1 ? anchoPlot / 2 : (i / (n - 1)) * anchoPlot); };

    var raiz = crearHTML(doc, 'div');
    raiz.classList.add('hz-chart');

    if (opciones.titulo) {
      var tit = crearHTML(doc, 'div');
      tit.classList.add('hz-chart-title');
      tit.textContent = opciones.titulo;
      raiz.appendChild(tit);
    }

    var envoltura = crearHTML(doc, 'div');
    envoltura.style.position = 'relative';
    raiz.appendChild(envoltura);

    var svg = crearSVG(doc, 'svg', { viewBox: '0 0 ' + ancho + ' ' + alto, role: 'img', 'data-eje-y': '1' });
    if (opciones.tituloAccesible) svg.setAttribute('aria-label', opciones.tituloAccesible);
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.display = 'block';
    envoltura.appendChild(svg);

    // grid horizontal + ticks Y (regla 6: hairline 1px sólida)
    ticksY.forEach(function (t) {
      var y = escalaY(t);
      var linGrid = crearSVG(doc, 'line', { x1: margen.izquierda, x2: ancho - margen.derecha, y1: y, y2: y, 'stroke-width': '1' });
      linGrid.style.stroke = 'var(--grid)';
      svg.appendChild(linGrid);

      var etiquetaY = crearSVG(doc, 'text', { x: margen.izquierda - 8, y: y, 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'hz-eje-tick', 'font-size': String(TAMANO_FUENTE_EJE) });
      etiquetaY.style.fill = 'var(--text-muted)';
      etiquetaY.textContent = formatearNumero(t);
      svg.appendChild(etiquetaY);
    });

    var ejeX = crearSVG(doc, 'line', { x1: margen.izquierda, x2: ancho - margen.derecha, y1: alto - margen.abajo, y2: alto - margen.abajo, 'stroke-width': '1' });
    ejeX.style.stroke = 'var(--axis)';
    svg.appendChild(ejeX);

    seleccionarIndicesEtiquetas(n).forEach(function (i) {
      var etiquetaX = crearSVG(doc, 'text', { x: escalaX(i), y: alto - margen.abajo + 18, 'text-anchor': 'middle', 'font-size': String(TAMANO_FUENTE_EJE) });
      etiquetaX.style.fill = 'var(--text-muted)';
      etiquetaX.textContent = String(etiquetasX[i] != null ? etiquetasX[i] : '');
      svg.appendChild(etiquetaX);
    });

    if (opciones.meta && typeof opciones.meta.valor === 'number') {
      var yMeta = escalaY(opciones.meta.valor);
      var linMeta = crearSVG(doc, 'line', { x1: margen.izquierda, x2: ancho - margen.derecha, y1: yMeta, y2: yMeta, 'stroke-width': '1' });
      linMeta.style.stroke = 'var(--text-muted)';
      svg.appendChild(linMeta);
      var etiquetaMeta = crearSVG(doc, 'text', { x: ancho - margen.derecha, y: yMeta - 4, 'text-anchor': 'end', 'font-size': String(TAMANO_FUENTE_EJE) });
      etiquetaMeta.style.fill = 'var(--text-muted)';
      etiquetaMeta.textContent = opciones.meta.etiqueta || 'Meta';
      svg.appendChild(etiquetaMeta);
    }

    // T-025: se dibujan area/polilinea/marcador de cada serie de inmediato (sin
    // cambios); las etiquetas de punta se DIFIEREN a un segundo paso para poder
    // resolver colisiones verticales entre TODAS las series antes de fijar la 'y'
    // de cada texto (ver resolverColisionesEtiquetasPunta más arriba).
    var puntosEtiquetaPunta = [];
    series.forEach(function (s, idx) {
      var color = s.color || tokenSerie(idx);
      var datos = s.datos || [];

      if (opciones.area) {
        var puntosArea = [];
        for (var k = 0; k < datos.length; k++) puntosArea.push(escalaX(k) + ',' + escalaY(datos[k]));
        var baseY = escalaY(yMin);
        var poligono = crearSVG(doc, 'polygon', {
          points: margen.izquierda + ',' + baseY + ' ' + puntosArea.join(' ') + ' ' + escalaX(Math.max(datos.length - 1, 0)) + ',' + baseY,
          'fill-opacity': '0.1'
        });
        poligono.style.fill = color;
        poligono.style.stroke = 'none';
        svg.appendChild(poligono);
      }

      var puntosLinea = [];
      for (var j = 0; j < datos.length; j++) puntosLinea.push(escalaX(j) + ',' + escalaY(datos[j]));
      var polilinea = crearSVG(doc, 'polyline', {
        points: puntosLinea.join(' '),
        'stroke-width': '2',
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round'
      });
      polilinea.style.fill = 'none';
      polilinea.style.stroke = color;
      svg.appendChild(polilinea);

      if (datos.length) {
        var ultimoI = datos.length - 1;
        var cx = escalaX(ultimoI), cy = escalaY(datos[ultimoI]);
        var anillo = crearSVG(doc, 'circle', { cx: cx, cy: cy, r: 6, 'stroke-width': '2' });
        anillo.style.fill = color;
        anillo.style.stroke = 'var(--surface-1)';
        svg.appendChild(anillo);

        puntosEtiquetaPunta.push({ cx: cx, cy: cy, texto: etiquetaConUnidad(datos[ultimoI], opciones.unidad) });
      }
    });

    // T-025: separar labels de punta que colisionan (< ALTURA_MINIMA_ETIQUETA_PUNTA
    // px verticales) antes de dibujarlos; un par sin colisión no se toca. Cuando un
    // label termina desplazado > UMBRAL_LINEA_GUIA px de su punto se traza una
    // linea guia hairline (1px, var(--axis)) del punto al label.
    var limiteEtiquetaArriba = margen.arriba + TAMANO_FUENTE_ETIQUETA / 2;
    var limiteEtiquetaAbajo = alto - margen.abajo - TAMANO_FUENTE_ETIQUETA / 2;
    resolverColisionesEtiquetasPunta(puntosEtiquetaPunta, limiteEtiquetaArriba, limiteEtiquetaAbajo, ALTURA_MINIMA_ETIQUETA_PUNTA);

    puntosEtiquetaPunta.forEach(function (p) {
      var desplazamiento = p.yEtiqueta - p.cy;
      var desplazadaMasDelUmbral = Math.abs(desplazamiento) > UMBRAL_LINEA_GUIA;

      if (desplazadaMasDelUmbral) {
        var lineaGuia = crearSVG(doc, 'line', {
          x1: p.cx, y1: p.cy, x2: p.cx + ESPACIO_PUNTO_ETIQUETA, y2: p.yEtiqueta,
          'stroke-width': '1', class: 'hz-etiqueta-guia'
        });
        lineaGuia.style.stroke = 'var(--axis)';
        svg.appendChild(lineaGuia);
      }

      var etiquetaValor = crearSVG(doc, 'text', { x: p.cx + ESPACIO_PUNTO_ETIQUETA, y: p.yEtiqueta, 'dominant-baseline': 'middle', class: 'hz-etiqueta-valor', 'font-size': String(TAMANO_FUENTE_ETIQUETA) });
      if (desplazadaMasDelUmbral) etiquetaValor.setAttribute('data-etiqueta-desplazada', '1');
      etiquetaValor.style.fill = 'var(--text-primary)';
      etiquetaValor.textContent = p.texto;
      svg.appendChild(etiquetaValor);
    });

    // crosshair + tooltip único de todas las series (regla 10)
    var tooltip = crearHTML(doc, 'div');
    tooltip.classList.add('hz-tooltip');
    tooltip.style.position = 'absolute';
    tooltip.style.display = 'none';
    tooltip.setAttribute('role', 'status');
    envoltura.appendChild(tooltip);

    if (n > 0) {
      var crosshair = crearSVG(doc, 'line', { x1: escalaX(0), x2: escalaX(0), y1: margen.arriba, y2: alto - margen.abajo, 'stroke-width': '1' });
      crosshair.classList.add('hz-crosshair');
      // R6 punto 5 / Adendum R6.5: el crosshair de hover pasa de var(--axis) a
      // var(--text-muted); gridlines y ejes conservan var(--axis) (sin tocar).
      crosshair.style.stroke = 'var(--text-muted)';
      crosshair.style.display = 'none';
      svg.appendChild(crosshair);

      var anchoHit = Math.max(HIT_MINIMO, anchoPlot / Math.max(n, 1));
      var _makeManejador = function (indice, x) {
        return function () {
          crosshair.setAttribute('x1', String(x));
          crosshair.setAttribute('x2', String(x));
          crosshair.style.display = '';
          tooltip.textContent = '';
          var titTooltip = crearHTML(doc, 'div');
          titTooltip.textContent = String(etiquetasX[indice] != null ? etiquetasX[indice] : '');
          tooltip.appendChild(titTooltip);
          series.forEach(function (s) {
            var fila = crearHTML(doc, 'div');
            var valorFuerte = crearHTML(doc, 'strong');
            valorFuerte.textContent = formatearNumero((s.datos || [])[indice]);
            var nombreSpan = crearHTML(doc, 'span');
            nombreSpan.textContent = ' ' + (s.nombre || '');
            fila.appendChild(valorFuerte);
            fila.appendChild(nombreSpan);
            tooltip.appendChild(fila);
          });
          tooltip.style.display = '';
          tooltip.style.left = x + 'px';
        };
      };
      var ocultar = function () { crosshair.style.display = 'none'; tooltip.style.display = 'none'; };

      for (var h = 0; h < n; h++) {
        var x = escalaX(h);
        var zonaHit = crearSVG(doc, 'rect', {
          x: x - anchoHit / 2, y: margen.arriba, width: anchoHit, height: altoPlot,
          tabindex: '0', role: 'button', 'aria-label': String(etiquetasX[h] != null ? etiquetasX[h] : '')
        });
        zonaHit.style.fill = 'var(--surface-1)';
        zonaHit.setAttribute('fill-opacity', '0');
        var manejador = _makeManejador(h, x);
        zonaHit.addEventListener('pointermove', manejador);
        zonaHit.addEventListener('focus', manejador);
        zonaHit.addEventListener('pointerleave', ocultar);
        zonaHit.addEventListener('blur', ocultar);
        svg.appendChild(zonaHit);
      }
    }

    if (series.length >= 2) {
      construirLeyenda(doc, raiz, series.map(function (s, idx) { return { nombre: s.nombre, color: s.color || tokenSerie(idx) }; }));
    }

    if (opciones.tabla) {
      var especTabla = resolverEspecTabla(opciones.tabla, etiquetasX, series, opciones.etiquetaColumna);
      construirTablaToggle(doc, raiz, especTabla);
    }

    contenedorEl.appendChild(raiz);
    return raiz;
  };

  // ---------------------------------------------------------------------
  // Herzon.Charts.barras — verticales u horizontales, tooltip por marca + lift
  // ---------------------------------------------------------------------
  Charts.barras = function (contenedorEl, opciones) {
    opciones = opciones || {};
    var doc = contenedorEl.ownerDocument;
    var categorias = opciones.categorias || [];
    var series = opciones.series || [];
    var orientacion = opciones.orientacion === 'horizontal' ? 'horizontal' : 'vertical';
    var ancho = anchoDeRenderizado(contenedorEl, opciones.ancho, 640);
    var alto = opciones.alto || (orientacion === 'horizontal' ? Math.max(160, categorias.length * 34 + 40) : 280);

    // D2: con una única serie se dibuja el valor de la barra máxima al final de
    // la marca (véase más abajo, "series.length === 1"); reservar margen según
    // su ancho estimado en vez de un margen fijo que lo recorta contra el borde
    // del viewBox (regla explícita del QA para barras horizontales).
    // R6 (data-4): en vertical el label directo por default va en el ÚLTIMO
    // valor, no en el máximo; el margen se reserva según ESE valor. R6
    // (valoresEnBarras): en horizontal con <=6 categorías y serie única, se
    // reserva margen según el valor MÁS ANCHO de TODAS las barras etiquetadas.
    // Ambos casos incluyen el sufijo de unidad (opciones.unidad) si viene.
    var ESPACIO_PUNTO_ETIQUETA = 6;
    var anchoEtiquetaMaximo = 0;
    if (series.length === 1) {
      var datosUnicaPre = series[0].datos || [];
      if (orientacion === 'vertical') {
        var idxUltimoPre = datosUnicaPre.length - 1;
        if (idxUltimoPre >= 0) {
          anchoEtiquetaMaximo = estimarAnchoTexto(etiquetaConUnidad(datosUnicaPre[idxUltimoPre], opciones.unidad), TAMANO_FUENTE_ETIQUETA);
        }
      } else if (opciones.valoresEnBarras && categorias.length <= 6) {
        for (var ivp = 0; ivp < datosUnicaPre.length; ivp++) {
          var wvp = estimarAnchoTexto(etiquetaConUnidad(datosUnicaPre[ivp], opciones.unidad), TAMANO_FUENTE_ETIQUETA);
          if (wvp > anchoEtiquetaMaximo) anchoEtiquetaMaximo = wvp;
        }
      } else {
        var idxMaxPre = indiceDelMaximo(datosUnicaPre);
        if (idxMaxPre >= 0) {
          anchoEtiquetaMaximo = estimarAnchoTexto(etiquetaConUnidad(datosUnicaPre[idxMaxPre], opciones.unidad), TAMANO_FUENTE_ETIQUETA);
        }
      }
    }
    // QA-R3 (b): el gutter izquierdo de barras horizontales se dimensiona según el label de
    // categoría más largo, hasta un tope de ~40% del ancho del chart (nunca fijo en 120px:
    // eso es lo que recortaba "Omega-3 (aceite de pescado)" por el INICIO al desbordar hacia
    // x negativo con text-anchor end contra el borde izquierdo del viewBox).
    var anchoMaximoEtiquetaCategoria = 0;
    if (orientacion === 'horizontal') {
      for (var iCat = 0; iCat < categorias.length; iCat++) {
        var wCat = estimarAnchoTexto(categorias[iCat], TAMANO_FUENTE_EJE);
        if (wCat > anchoMaximoEtiquetaCategoria) anchoMaximoEtiquetaCategoria = wCat;
      }
    }
    var gutterIzquierdoMaximo = ancho * GUTTER_IZQUIERDO_PROPORCION_MAX;
    var gutterIzquierdoDeseado = anchoMaximoEtiquetaCategoria + PADDING_GUTTER_IZQUIERDO + 8;
    var gutterIzquierdoCalculado = Math.max(GUTTER_IZQUIERDO_MIN, Math.min(gutterIzquierdoMaximo, gutterIzquierdoDeseado));

    var margen = orientacion === 'horizontal'
      ? { arriba: 12, derecha: Math.max(40, ESPACIO_PUNTO_ETIQUETA + anchoEtiquetaMaximo + 8), abajo: 24, izquierda: gutterIzquierdoCalculado }
      : { arriba: 16, derecha: Math.max(16, anchoEtiquetaMaximo / 2 + 6), abajo: 40, izquierda: 52 };
    var anchoPlot = ancho - margen.izquierda - margen.derecha;

    // QA-R3 (a): en barras verticales, si el label de categoría más ancho no cabe en su
    // banda, se rotan TODAS las etiquetas del eje X y se reserva el margen inferior
    // correspondiente ANTES de calcular altoPlot.
    var rotacionEtiquetasX = { rotar: false, margenAbajo: margen.abajo };
    if (orientacion === 'vertical') {
      var anchoGrupoPreVertical = categorias.length > 0 ? anchoPlot / categorias.length : anchoPlot;
      rotacionEtiquetasX = calcularRotacionEtiquetasX(categorias, anchoGrupoPreVertical);
      margen.abajo = rotacionEtiquetasX.margenAbajo;
      // R9 (DV-02): al rotar, ampliar el margen izquierdo para que la
      // primera etiqueta no se recorte contra el borde del viewBox (mismo
      // fix que apilada100; aquí el margen base ya es 52 por el eje Y, así
      // que solo crece si un label de categoría particularmente largo lo
      // exige).
      if (rotacionEtiquetasX.rotar) {
        margen.izquierda = calcularMargenIzquierdoRotado(categorias, ancho, margen.izquierda);
        anchoPlot = ancho - margen.izquierda - margen.derecha;
      }
    }
    var altoPlot = alto - margen.arriba - margen.abajo;

    var todosValores = [];
    series.forEach(function (s) {
      (s.datos || []).forEach(function (v) { if (typeof v === 'number' && !isNaN(v)) todosValores.push(v); });
    });
    var dataMax = todosValores.length ? Math.max.apply(null, todosValores) : 1;
    // R6: opciones.referencia.max amplía la escala automática (solo cuando
    // opciones.max no viene fijado explícitamente) para que la línea de
    // referencia nunca quede fuera del área de trazo.
    if (opciones.referencia && typeof opciones.referencia.max === 'number') {
      dataMax = Math.max(dataMax, opciones.referencia.max);
    }
    // R9 (DV-03): mismo propósito para la variante {valor} — el umbral nunca
    // debe quedar fuera del área de trazo aunque supere el dato más alto.
    if (opciones.referencia && typeof opciones.referencia.valor === 'number') {
      dataMax = Math.max(dataMax, opciones.referencia.valor);
    }
    var valorMax = (typeof opciones.max === 'number') ? opciones.max : (dataMax || 1);
    if (valorMax <= 0) valorMax = 1;
    var tieneReferencia = !!(opciones.referencia && typeof opciones.referencia.min === 'number' && typeof opciones.referencia.max === 'number');
    // R9 (DV-03): opciones.referencia { valor, etiqueta } — variante aditiva
    // default-apagada de un UMBRAL de valor único (p.ej. el objetivo de
    // kcal/día), distinta del rango {min,max} ya existente. Se dibuja UNA
    // sola hairline en vez de dos; reutiliza resolverPosicionEtiquetaReferencia
    // (T-034) para no colisionar con barras ni con la etiqueta de valor. Solo
    // aplica cuando NO viene {min,max} (tieneReferencia gana si ambas formas
    // llegaran a coexistir, para no ambigüar el contrato existente).
    var tieneReferenciaValor = !!(opciones.referencia && !tieneReferencia && typeof opciones.referencia.valor === 'number');

    // R6: hairline 1px var(--text-muted) + etiqueta corta, misma anatomia que
    // la linea Meta de linea() (contrato Adendum R6 punto 2). Dibuja las DOS
    // fronteras (min y max) del rango de referencia sobre el eje recibido
    // (perpendicular a las barras) y una sola etiqueta junto a la frontera max.
    // R9 (DV-03): con la variante {valor}, dibuja UNA sola hairline+etiqueta.
    function dibujarReferencia(esVertical, escalaValor, obstaculosEtiqueta) {
      if (!tieneReferencia && !tieneReferenciaValor) return;
      var yMin, yMax, xMin, xMax, yValor, xValor;
      if (esVertical) {
        if (tieneReferenciaValor) {
          yValor = alto - margen.abajo - escalaValor(opciones.referencia.valor);
          var lineaRefValor = crearSVG(doc, 'line', { x1: margen.izquierda, x2: ancho - margen.derecha, y1: yValor, y2: yValor, 'stroke-width': '1', class: 'hz-referencia-linea' });
          lineaRefValor.style.stroke = 'var(--text-muted)';
          svg.appendChild(lineaRefValor);
          var textoRefValor = opciones.referencia.etiqueta || 'Referencia';
          var posicionRefValor = resolverPosicionEtiquetaReferencia(margen.izquierda, yValor, textoRefValor, TAMANO_FUENTE_EJE, 4, obstaculosEtiqueta, margen.arriba);
          var etiquetaRefValor = crearSVG(doc, 'text', { x: posicionRefValor.x, y: posicionRefValor.y, 'text-anchor': 'start', 'font-size': String(TAMANO_FUENTE_EJE), class: 'hz-referencia-etiqueta' });
          etiquetaRefValor.style.fill = 'var(--text-muted)';
          etiquetaRefValor.textContent = textoRefValor;
          svg.appendChild(etiquetaRefValor);
          return;
        }
        yMin = alto - margen.abajo - escalaValor(opciones.referencia.min);
        yMax = alto - margen.abajo - escalaValor(opciones.referencia.max);
        [yMin, yMax].forEach(function (yRef) {
          var lineaRef = crearSVG(doc, 'line', { x1: margen.izquierda, x2: ancho - margen.derecha, y1: yRef, y2: yRef, 'stroke-width': '1', class: 'hz-referencia-linea' });
          lineaRef.style.stroke = 'var(--text-muted)';
          svg.appendChild(lineaRef);
        });
        // T-034 (R6-fix): la etiqueta ya NO se ancla al extremo derecho (ahí
        // colisionaba con la barra Final y con su etiqueta de valor — evidencia
        // LDL/HbA1c del coordinador). Se ancla al extremo IZQUIERDO de la
        // hairline (inicio del eje); si aun así colisiona con una barra o con
        // la etiqueta de valor del último elemento (que SIEMPRE gana la
        // posición derecha, R6 data-4), se desplaza verticalmente por encima
        // de la hairline con separación >= 4px del obstáculo más alto.
        var textoRef = opciones.referencia.etiqueta || 'Referencia';
        var posicionRef = resolverPosicionEtiquetaReferencia(margen.izquierda, yMax, textoRef, TAMANO_FUENTE_EJE, 4, obstaculosEtiqueta, margen.arriba);
        var etiquetaRef = crearSVG(doc, 'text', { x: posicionRef.x, y: posicionRef.y, 'text-anchor': 'start', 'font-size': String(TAMANO_FUENTE_EJE), class: 'hz-referencia-etiqueta' });
        etiquetaRef.style.fill = 'var(--text-muted)';
        etiquetaRef.textContent = textoRef;
        svg.appendChild(etiquetaRef);
      } else {
        if (tieneReferenciaValor) {
          xValor = margen.izquierda + escalaValor(opciones.referencia.valor);
          var lineaRefValorH = crearSVG(doc, 'line', { x1: xValor, x2: xValor, y1: margen.arriba, y2: alto - margen.abajo, 'stroke-width': '1', class: 'hz-referencia-linea' });
          lineaRefValorH.style.stroke = 'var(--text-muted)';
          svg.appendChild(lineaRefValorH);
          var etiquetaRefValorH = crearSVG(doc, 'text', { x: xValor, y: margen.arriba - 4, 'text-anchor': 'middle', 'font-size': String(TAMANO_FUENTE_EJE), class: 'hz-referencia-etiqueta' });
          etiquetaRefValorH.style.fill = 'var(--text-muted)';
          etiquetaRefValorH.textContent = opciones.referencia.etiqueta || 'Referencia';
          svg.appendChild(etiquetaRefValorH);
          return;
        }
        xMin = margen.izquierda + escalaValor(opciones.referencia.min);
        xMax = margen.izquierda + escalaValor(opciones.referencia.max);
        [xMin, xMax].forEach(function (xRef) {
          var lineaRefH = crearSVG(doc, 'line', { x1: xRef, x2: xRef, y1: margen.arriba, y2: alto - margen.abajo, 'stroke-width': '1', class: 'hz-referencia-linea' });
          lineaRefH.style.stroke = 'var(--text-muted)';
          svg.appendChild(lineaRefH);
        });
        var etiquetaRefH = crearSVG(doc, 'text', { x: xMax, y: margen.arriba - 4, 'text-anchor': 'middle', 'font-size': String(TAMANO_FUENTE_EJE), class: 'hz-referencia-etiqueta' });
        etiquetaRefH.style.fill = 'var(--text-muted)';
        etiquetaRefH.textContent = opciones.referencia.etiqueta || 'Referencia';
        svg.appendChild(etiquetaRefH);
      }
    }

    var nCat = categorias.length;
    var nSer = Math.max(series.length, 1);

    var raiz = crearHTML(doc, 'div');
    raiz.classList.add('hz-chart');
    if (opciones.titulo) {
      var tit = crearHTML(doc, 'div');
      tit.classList.add('hz-chart-title');
      tit.textContent = opciones.titulo;
      raiz.appendChild(tit);
    }
    var envoltura = crearHTML(doc, 'div');
    envoltura.style.position = 'relative';
    raiz.appendChild(envoltura);

    var svg = crearSVG(doc, 'svg', { viewBox: '0 0 ' + ancho + ' ' + alto, role: 'img', 'data-eje-y': '1' });
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.display = 'block';
    envoltura.appendChild(svg);

    var tooltip = crearHTML(doc, 'div');
    tooltip.classList.add('hz-tooltip');
    tooltip.style.position = 'absolute';
    tooltip.style.display = 'none';
    tooltip.setAttribute('role', 'status');
    envoltura.appendChild(tooltip);

    function mostrarTooltip(x, y, etiqueta, valor) {
      tooltip.textContent = '';
      var fuerte = crearHTML(doc, 'strong');
      fuerte.textContent = formatearNumero(valor);
      var span = crearHTML(doc, 'span');
      span.textContent = ' ' + etiqueta;
      tooltip.appendChild(fuerte);
      tooltip.appendChild(span);
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
      tooltip.style.display = '';
    }
    function ocultarTooltip() { tooltip.style.display = 'none'; }

    if (orientacion === 'vertical') {
      var ejeBase = crearSVG(doc, 'line', { x1: margen.izquierda, x2: ancho - margen.derecha, y1: alto - margen.abajo, y2: alto - margen.abajo, 'stroke-width': '1' });
      ejeBase.style.stroke = 'var(--axis)';
      svg.appendChild(ejeBase);

      var anchoGrupo = nCat > 0 ? anchoPlot / nCat : anchoPlot;
      var grosorBarra = Math.min(GROSOR_MAX_BARRA, (anchoGrupo - GAP_SEPARADOR * (nSer + 1)) / nSer);
      if (grosorBarra < 2) grosorBarra = 2;
      var escalaAlt = function (v) { return (v / valorMax) * altoPlot; };

      // R6: la referencia se dibuja ANTES que las barras (misma capa que la
      // línea Meta de linea(), detrás de las marcas de datos). T-034: para que
      // la etiqueta de referencia sepa si colisiona, se calculan de antemano
      // las cajas estimadas de CADA barra (valor máximo entre series por
      // categoría) y, con serie única, la de la etiqueta de valor del último
      // elemento — la misma geometría que este mismo bloque dibuja más abajo.
      // R9 (fix post-rechazo verifier): la caja en X usa el ancho REALMENTE
      // ocupado por las marcas (anchoOcupado, igual fórmula que el render de
      // abajo), no el ancho completo del grupo (anchoGrupo, que incluye el
      // padding entre categorías) — con la caja de grupo completa, una
      // categoría con etiquetas largas (ancho de grupo grande) declaraba
      // "ocupado" hasta el borde izquierdo del SIGUIENTE grupo aunque la
      // barra real terminara mucho antes, y la evasión horizontal nueva (ver
      // resolverPosicionEtiquetaReferencia) saltaba de más sin necesidad
      // (evidencia: fixture 22.4d, Basal/Seguimiento/Final, la barra real
      // termina en x=159.14 pero la caja de grupo llegaba hasta x=218.28).
      var anchoOcupadoObstaculo = grosorBarra * nSer + GAP_SEPARADOR * (nSer - 1);
      var obstaculosEtiquetaRef = [];
      for (var oc = 0; oc < nCat; oc++) {
        var valorMaxCategoriaRef = null;
        for (var os = 0; os < series.length; os++) {
          var vObstaculo = (series[os].datos || [])[oc];
          if (typeof vObstaculo === 'number' && !isNaN(vObstaculo) && (valorMaxCategoriaRef === null || vObstaculo > valorMaxCategoriaRef)) {
            valorMaxCategoriaRef = vObstaculo;
          }
        }
        if (valorMaxCategoriaRef === null) continue;
        var inicioGrupoRef = margen.izquierda + oc * anchoGrupo;
        var xCategoriaRef = inicioGrupoRef + (anchoGrupo - anchoOcupadoObstaculo) / 2;
        obstaculosEtiquetaRef.push({
          x0: xCategoriaRef, x1: xCategoriaRef + anchoOcupadoObstaculo,
          y0: (alto - margen.abajo) - escalaAlt(valorMaxCategoriaRef), y1: alto - margen.abajo
        });
      }
      if (series.length === 1) {
        var datosUnicaRefPre = series[0].datos || [];
        // R9 (DV-04 + DV-03 combinados, evidencia real: "Laboratorios en 3
        // cortes" ya trae referencia {min,max} y ahora valoresEnBarras): con
        // valoresEnBarras activo, CADA barra dibuja su propia etiqueta de
        // valor (no solo la última), así que la primera categoría —la más
        // cercana al ancla izquierda de "Rango normal"— también es un
        // obstáculo real. Fuera de esa condición se conserva intacto el
        // único obstáculo previo (el de la etiqueta del ÚLTIMO valor, R6
        // data-4), mismo comportamiento de siempre.
        if (opciones.valoresEnBarras && categorias.length <= 6) {
          for (var ivbRef = 0; ivbRef < datosUnicaRefPre.length; ivbRef++) {
            var valorVBRef = datosUnicaRefPre[ivbRef];
            if (typeof valorVBRef !== 'number' || isNaN(valorVBRef)) continue;
            var xCentroVBRef = margen.izquierda + ivbRef * anchoGrupo + anchoGrupo / 2;
            var anchoValorVBRef = estimarAnchoTexto(etiquetaConUnidad(valorVBRef, opciones.unidad), TAMANO_FUENTE_ETIQUETA);
            var yCapVBRef = (alto - margen.abajo) - escalaAlt(valorVBRef);
            obstaculosEtiquetaRef.push({
              x0: xCentroVBRef - anchoValorVBRef / 2, x1: xCentroVBRef + anchoValorVBRef / 2,
              y0: (yCapVBRef - 6) - TAMANO_FUENTE_ETIQUETA, y1: yCapVBRef - 6
            });
          }
        } else {
          var idxUltimoRefPre = datosUnicaRefPre.length - 1;
          if (idxUltimoRefPre >= 0 && typeof datosUnicaRefPre[idxUltimoRefPre] === 'number' && !isNaN(datosUnicaRefPre[idxUltimoRefPre])) {
            var xCentroRefPre = margen.izquierda + idxUltimoRefPre * anchoGrupo + anchoGrupo / 2;
            var anchoValorRefPre = estimarAnchoTexto(etiquetaConUnidad(datosUnicaRefPre[idxUltimoRefPre], opciones.unidad), TAMANO_FUENTE_ETIQUETA);
            var yCapRefPre = (alto - margen.abajo) - escalaAlt(datosUnicaRefPre[idxUltimoRefPre]);
            obstaculosEtiquetaRef.push({
              x0: xCentroRefPre - anchoValorRefPre / 2, x1: xCentroRefPre + anchoValorRefPre / 2,
              y0: (yCapRefPre - 6) - TAMANO_FUENTE_ETIQUETA, y1: yCapRefPre - 6
            });
          }
        }
      }
      dibujarReferencia(true, escalaAlt, obstaculosEtiquetaRef);

      for (var c = 0; c < nCat; c++) {
        var inicioGrupo = margen.izquierda + c * anchoGrupo;
        var anchoOcupado = grosorBarra * nSer + GAP_SEPARADOR * (nSer - 1);
        var inicioBarras = inicioGrupo + (anchoGrupo - anchoOcupado) / 2;

        for (var s = 0; s < series.length; s++) {
          var valor = (series[s].datos || [])[c] || 0;
          var h = escalaAlt(valor);
          var xBar = inicioBarras + s * (grosorBarra + GAP_SEPARADOR);
          var yBar = alto - margen.abajo - h;
          var color = series[s].color || tokenSerie(s);
          var radio = Math.min(RADIO_ESQUINA, grosorBarra / 2, h);

          var path = construirBarraVertical(doc, xBar, yBar, grosorBarra, h, radio);
          path.style.fill = color;
          svg.appendChild(path);

          (function (xB, yTop, hBar, catIdx, serIdx, val, pathBar) {
            var zonaHit = crearSVG(doc, 'rect', {
              x: xB - GAP_SEPARADOR, y: margen.arriba, width: Math.max(HIT_MINIMO, grosorBarra + GAP_SEPARADOR * 2), height: altoPlot,
              tabindex: '0', role: 'button',
              'aria-label': String(categorias[catIdx] != null ? categorias[catIdx] : '') + ' ' + (series[serIdx].nombre || '')
            });
            zonaHit.style.fill = 'var(--surface-1)';
            zonaHit.setAttribute('fill-opacity', '0');
            var etiquetaCat = String(categorias[catIdx] != null ? categorias[catIdx] : '');
            var elevar = function () { pathBar.setAttribute('fill-opacity', '0.85'); mostrarTooltip(xB, yTop, etiquetaCat + ' - ' + (series[serIdx].nombre || ''), val); };
            var bajar = function () { pathBar.removeAttribute('fill-opacity'); ocultarTooltip(); };
            zonaHit.addEventListener('pointerenter', elevar);
            zonaHit.addEventListener('focus', elevar);
            zonaHit.addEventListener('pointerleave', bajar);
            zonaHit.addEventListener('blur', bajar);
            svg.appendChild(zonaHit);
          })(xBar, yBar, h, c, s, valor, path);
        }

        var yBaseEtiquetaX = rotacionEtiquetasX.rotar ? (alto - margen.abajo + 12) : (alto - margen.abajo + 16);
        dibujarEtiquetaCategoriaX(doc, svg, inicioGrupo + anchoGrupo / 2, yBaseEtiquetaX, categorias[c], rotacionEtiquetasX.rotar);
      }

      if (series.length === 1) {
        var datosUnica = series[0].datos || [];
        // R9 (DV-04): valoresEnBarras extendido a orientación vertical (hoy
        // no-op ahí, opción ya existente en horizontal) — con serie única y
        // <=6 categorías, valor encima de CADA barra (mismo guard que la
        // rama horizontal, 22.6). Fuera de esas condiciones se conserva
        // intacto el comportamiento default previo (R6 data-4: una sola
        // etiqueta, la del ÚLTIMO valor).
        if (opciones.valoresEnBarras && categorias.length <= 6) {
          for (var vbV = 0; vbV < datosUnica.length; vbV++) {
            var valorVBV = datosUnica[vbV];
            if (typeof valorVBV !== 'number' || isNaN(valorVBV)) continue;
            var xCentroVBV = margen.izquierda + vbV * anchoGrupo + anchoGrupo / 2;
            var yCapVBV = alto - margen.abajo - escalaAlt(valorVBV);
            var etiquetaVBV = crearSVG(doc, 'text', { x: xCentroVBV, y: yCapVBV - 6, 'text-anchor': 'middle', class: 'hz-etiqueta-valor', 'font-size': String(TAMANO_FUENTE_ETIQUETA) });
            etiquetaVBV.style.fill = 'var(--text-primary)';
            etiquetaVBV.textContent = etiquetaConUnidad(valorVBV, opciones.unidad);
            svg.appendChild(etiquetaVBV);
          }
        } else {
          // R6 (data-4): el label directo por default va en el ÚLTIMO valor (el
          // actual), no en el máximo — antes de R6 aquí vivía indiceDelMaximo().
          var idxUltimo = datosUnica.length - 1;
          if (idxUltimo >= 0 && typeof datosUnica[idxUltimo] === 'number' && !isNaN(datosUnica[idxUltimo])) {
            var xCentro = margen.izquierda + idxUltimo * anchoGrupo + anchoGrupo / 2;
            var valorUltimoSel = datosUnica[idxUltimo];
            var yCap = alto - margen.abajo - escalaAlt(valorUltimoSel);
            var etiquetaValor = crearSVG(doc, 'text', { x: xCentro, y: yCap - 6, 'text-anchor': 'middle', class: 'hz-etiqueta-valor', 'font-size': String(TAMANO_FUENTE_ETIQUETA) });
            etiquetaValor.style.fill = 'var(--text-primary)';
            etiquetaValor.textContent = etiquetaConUnidad(valorUltimoSel, opciones.unidad);
            svg.appendChild(etiquetaValor);
          }
        }
      }
    } else {
      var ejeBaseH = crearSVG(doc, 'line', { x1: margen.izquierda, x2: margen.izquierda, y1: margen.arriba, y2: alto - margen.abajo, 'stroke-width': '1' });
      ejeBaseH.style.stroke = 'var(--axis)';
      svg.appendChild(ejeBaseH);

      var altoGrupo = nCat > 0 ? altoPlot / nCat : altoPlot;
      var grosorBarraH = Math.min(GROSOR_MAX_BARRA, (altoGrupo - GAP_SEPARADOR * (nSer + 1)) / nSer);
      if (grosorBarraH < 2) grosorBarraH = 2;
      var escalaAncho = function (v) { return (v / valorMax) * anchoPlot; };

      dibujarReferencia(false, escalaAncho);

      for (var c2 = 0; c2 < nCat; c2++) {
        var inicioGrupoH = margen.arriba + c2 * altoGrupo;
        var ocupadoH = grosorBarraH * nSer + GAP_SEPARADOR * (nSer - 1);
        var inicioBarrasH = inicioGrupoH + (altoGrupo - ocupadoH) / 2;

        for (var s2 = 0; s2 < series.length; s2++) {
          var valorH = (series[s2].datos || [])[c2] || 0;
          var w = escalaAncho(valorH);
          var yBarH = inicioBarrasH + s2 * (grosorBarraH + GAP_SEPARADOR);
          var xBarH = margen.izquierda;
          var colorH = series[s2].color || tokenSerie(s2);
          var radioH = Math.min(RADIO_ESQUINA, grosorBarraH / 2, w);

          var pathH = construirBarraHorizontal(doc, xBarH, yBarH, w, grosorBarraH, radioH);
          pathH.style.fill = colorH;
          svg.appendChild(pathH);

          (function (yB, wBar, catIdx, serIdx, val, pathBarH) {
            var zonaHit = crearSVG(doc, 'rect', {
              x: margen.izquierda, y: yB - GAP_SEPARADOR, width: anchoPlot, height: Math.max(HIT_MINIMO, grosorBarraH + GAP_SEPARADOR * 2),
              tabindex: '0', role: 'button',
              'aria-label': String(categorias[catIdx] != null ? categorias[catIdx] : '') + ' ' + (series[serIdx].nombre || '')
            });
            zonaHit.style.fill = 'var(--surface-1)';
            zonaHit.setAttribute('fill-opacity', '0');
            var etiquetaCat = String(categorias[catIdx] != null ? categorias[catIdx] : '');
            var elevar = function () { pathBarH.setAttribute('fill-opacity', '0.85'); mostrarTooltip(margen.izquierda + wBar, yB, etiquetaCat + ' - ' + (series[serIdx].nombre || ''), val); };
            var bajar = function () { pathBarH.removeAttribute('fill-opacity'); ocultarTooltip(); };
            zonaHit.addEventListener('pointerenter', elevar);
            zonaHit.addEventListener('focus', elevar);
            zonaHit.addEventListener('pointerleave', bajar);
            zonaHit.addEventListener('blur', bajar);
            svg.appendChild(zonaHit);
          })(yBarH, w, c2, s2, valorH, pathH);
        }

        // QA-R3 (b): nunca recortar por el INICIO. El gutter ya crecio hasta ~40% del ancho
        // del chart (arriba); si aun así el label no cabe, se trunca con elipsis al FINAL,
        // con el texto completo disponible via aria-label (el tooltip de la barra y la
        // tabla ya usan siempre `categorias[c2]` sin truncar).
        var anchoDisponibleGutter = margen.izquierda - 8 - 4;
        var etiquetaCategoriaOriginal = String(categorias[c2] != null ? categorias[c2] : '');
        var etiquetaCategoriaMostrada = truncarConElipsisFinal(etiquetaCategoriaOriginal, anchoDisponibleGutter, TAMANO_FUENTE_EJE);
        var etiquetaY2 = crearSVG(doc, 'text', { x: margen.izquierda - 8, y: inicioGrupoH + altoGrupo / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': String(TAMANO_FUENTE_EJE) });
        etiquetaY2.style.fill = 'var(--text-muted)';
        etiquetaY2.textContent = etiquetaCategoriaMostrada;
        if (etiquetaCategoriaMostrada !== etiquetaCategoriaOriginal) {
          // aria-label (no un <title> anidado: SVGTextElement.textContent concatenaria el
          // texto visible con el del <title>, ensuciando el valor que consumen lectores de
          // pantalla y el propio DOM) conserva el texto completo para accesibilidad; el
          // tooltip de la barra y la tabla ("Ver tabla") ya muestran siempre el original.
          etiquetaY2.setAttribute('data-etiqueta-truncada', '1');
          etiquetaY2.setAttribute('aria-label', etiquetaCategoriaOriginal);
        }
        svg.appendChild(etiquetaY2);
      }

      if (series.length === 1) {
        var datosUnicaH = series[0].datos || [];
        // R6: valoresEnBarras (horizontal, serie única, <=6 categorías) dibuja
        // el valor al final de CADA barra; fuera de esas condiciones se
        // conserva el comportamiento previo (solo la barra máxima).
        if (opciones.valoresEnBarras && categorias.length <= 6) {
          for (var vb = 0; vb < datosUnicaH.length; vb++) {
            var valorVB = datosUnicaH[vb];
            if (typeof valorVB !== 'number' || isNaN(valorVB)) continue;
            var yCentroVB = margen.arriba + vb * altoGrupo + altoGrupo / 2;
            var xCapVB = margen.izquierda + escalaAncho(valorVB);
            var etiquetaVB = crearSVG(doc, 'text', { x: xCapVB + ESPACIO_PUNTO_ETIQUETA, y: yCentroVB, 'dominant-baseline': 'middle', class: 'hz-etiqueta-valor', 'font-size': String(TAMANO_FUENTE_ETIQUETA) });
            etiquetaVB.style.fill = 'var(--text-primary)';
            etiquetaVB.textContent = etiquetaConUnidad(valorVB, opciones.unidad);
            svg.appendChild(etiquetaVB);
          }
        } else {
          var idxMaxH = indiceDelMaximo(datosUnicaH);
          if (idxMaxH >= 0) {
            var yCentro = margen.arriba + idxMaxH * altoGrupo + altoGrupo / 2;
            var valorMaxSelH = datosUnicaH[idxMaxH];
            var xCap = margen.izquierda + escalaAncho(valorMaxSelH);
            var etiquetaValorH = crearSVG(doc, 'text', { x: xCap + ESPACIO_PUNTO_ETIQUETA, y: yCentro, 'dominant-baseline': 'middle', class: 'hz-etiqueta-valor', 'font-size': String(TAMANO_FUENTE_ETIQUETA) });
            etiquetaValorH.style.fill = 'var(--text-primary)';
            etiquetaValorH.textContent = etiquetaConUnidad(valorMaxSelH, opciones.unidad);
            svg.appendChild(etiquetaValorH);
          }
        }
      }
    }

    if (series.length >= 2) {
      construirLeyenda(doc, raiz, series.map(function (s, idx) { return { nombre: s.nombre, color: s.color || tokenSerie(idx) }; }));
    }
    if (opciones.tabla) {
      var especTabla = resolverEspecTabla(opciones.tabla, categorias, series, opciones.etiquetaColumna);
      construirTablaToggle(doc, raiz, especTabla);
    }

    contenedorEl.appendChild(raiz);
    return raiz;
  };

  // ---------------------------------------------------------------------
  // Herzon.Charts.apilada100 — barra apilada 100%, gaps de 2px
  // ---------------------------------------------------------------------
  Charts.apilada100 = function (contenedorEl, opciones) {
    opciones = opciones || {};
    var doc = contenedorEl.ownerDocument;
    var categorias = opciones.categorias || [];
    var series = opciones.series || [];
    var ancho = anchoDeRenderizado(contenedorEl, opciones.ancho, 640);
    var alto = opciones.alto || 280;
    var margen = { arriba: 16, derecha: 16, abajo: 40, izquierda: 16 };
    var anchoPlot = ancho - margen.izquierda - margen.derecha;
    var nCat = categorias.length;

    // QA-R3 (a): igual que en barras verticales, si el label de categoría más ancho no cabe
    // en su banda se rotan TODAS las etiquetas del eje X (nunca un número encima de cada
    // punto como alternativa) y se reserva el margen inferior correspondiente.
    var anchoGrupo = nCat > 0 ? anchoPlot / nCat : anchoPlot;
    var rotacionEtiquetasX = calcularRotacionEtiquetasX(categorias, anchoGrupo);
    margen.abajo = rotacionEtiquetasX.margenAbajo;
    // R9 (DV-02, fix interno sin API): al rotar, ampliar el margen izquierdo
    // según la primera etiqueta (la más expuesta a desbordar hacia x
    // negativa con text-anchor end) y recalcular anchoPlot/anchoGrupo con el
    // margen ya corregido antes de posicionar ninguna columna.
    if (rotacionEtiquetasX.rotar) {
      margen.izquierda = calcularMargenIzquierdoRotado(categorias, ancho, margen.izquierda);
      anchoPlot = ancho - margen.izquierda - margen.derecha;
      anchoGrupo = nCat > 0 ? anchoPlot / nCat : anchoPlot;
    }
    var altoPlot = alto - margen.arriba - margen.abajo;

    var raiz = crearHTML(doc, 'div');
    raiz.classList.add('hz-chart');
    if (opciones.titulo) {
      var tit = crearHTML(doc, 'div');
      tit.classList.add('hz-chart-title');
      tit.textContent = opciones.titulo;
      raiz.appendChild(tit);
    }
    var envoltura = crearHTML(doc, 'div');
    envoltura.style.position = 'relative';
    raiz.appendChild(envoltura);

    var svg = crearSVG(doc, 'svg', { viewBox: '0 0 ' + ancho + ' ' + alto, role: 'img' });
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.display = 'block';
    envoltura.appendChild(svg);

    var tooltip = crearHTML(doc, 'div');
    tooltip.classList.add('hz-tooltip');
    tooltip.style.position = 'absolute';
    tooltip.style.display = 'none';
    tooltip.setAttribute('role', 'status');
    envoltura.appendChild(tooltip);

    function mostrarTooltipSegmento(x, y, etiqueta) {
      tooltip.textContent = '';
      var texto = crearHTML(doc, 'span');
      texto.textContent = etiqueta;
      tooltip.appendChild(texto);
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
      tooltip.style.display = '';
    }
    function ocultarTooltipSegmento() { tooltip.style.display = 'none'; }

    // grosor calculado para que el hueco entre columnas adyacentes sea exactamente
    // GAP_SEPARADOR cuando no aplica el tope de 24px (regla 5), sin exceder el tope (regla 4).
    var grosorBarra = Math.min(GROSOR_MAX_BARRA, Math.max(4, anchoGrupo - GAP_SEPARADOR));

    for (var c = 0; c < nCat; c++) {
      var total = 0;
      for (var s0 = 0; s0 < series.length; s0++) total += ((series[s0].datos || [])[c] || 0);
      if (total <= 0) total = 1;

      var xCentro = margen.izquierda + c * anchoGrupo + anchoGrupo / 2;
      var xBarra = xCentro - grosorBarra / 2;
      var nSeries = series.length;
      var alturaDisponible = altoPlot - GAP_SEPARADOR * Math.max(nSeries - 1, 0);
      var yAcumulado = margen.arriba;

      for (var s = 0; s < series.length; s++) {
        var valor = (series[s].datos || [])[c] || 0;
        var proporcion = valor / total;
        var hSeg = Math.max(proporcion * alturaDisponible, 0);
        var y = yAcumulado;
        var color = series[s].color || tokenSerie(s);

        var rect = crearSVG(doc, 'rect', { x: xBarra, y: y, width: grosorBarra, height: hSeg });
        rect.style.fill = color;
        rect.style.stroke = 'none';
        svg.appendChild(rect);

        (function (xB, yTop, hSegmento, catIdx, serIdx, prop, rectSegmento) {
          var zonaHit = crearSVG(doc, 'rect', {
            x: xB - GAP_SEPARADOR, y: yTop, width: Math.max(HIT_MINIMO, grosorBarra + GAP_SEPARADOR * 2), height: Math.max(hSegmento, 1),
            tabindex: '0', role: 'button'
          });
          zonaHit.style.fill = 'var(--surface-1)';
          zonaHit.setAttribute('fill-opacity', '0');
          var etiquetaCat = String(categorias[catIdx] != null ? categorias[catIdx] : '');
          var pct = Math.round(prop * 1000) / 10;
          zonaHit.setAttribute('aria-label', etiquetaCat + ' ' + (series[serIdx].nombre || '') + ' ' + pct + '%');
          var elevar = function () { rectSegmento.setAttribute('fill-opacity', '0.85'); mostrarTooltipSegmento(xB + grosorBarra, yTop, (series[serIdx].nombre || '') + ' ' + pct + '% - ' + etiquetaCat); };
          var bajar = function () { rectSegmento.removeAttribute('fill-opacity'); ocultarTooltipSegmento(); };
          zonaHit.addEventListener('pointerenter', elevar);
          zonaHit.addEventListener('focus', elevar);
          zonaHit.addEventListener('pointerleave', bajar);
          zonaHit.addEventListener('blur', bajar);
          svg.appendChild(zonaHit);
        })(xBarra, y, hSeg, c, s, proporcion, rect);

        // R6: etiquetasSegmento — % SOLO en segmentos con alto >= 14px (regla
        // "segmentos angostos sin etiqueta, los cubre la tabla"). Tinta de
        // texto via tokens de texto, jamás color de serie (regla 8).
        // R9 (DV-01): etiquetasSegmentoIndices — opción aditiva
        // default-apagada que restringe el % a las CATEGORÍAS (columnas)
        // cuyo índice está en la lista (saillance: una columna ejemplar en
        // vez de 15 rótulos casi idénticos). Ausente, se conserva el
        // comportamiento actual: todas las categorías son elegibles.
        var categoriaElegibleSegmento = !opciones.etiquetasSegmentoIndices || opciones.etiquetasSegmentoIndices.indexOf(c) !== -1;
        if (opciones.etiquetasSegmento && categoriaElegibleSegmento && hSeg >= ALTURA_MINIMA_ETIQUETA_SEGMENTO) {
          var etiquetaSegmento = crearSVG(doc, 'text', {
            x: xCentro, y: y + hSeg / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
            class: 'hz-etiqueta-segmento', 'font-size': String(TAMANO_FUENTE_ETIQUETA)
          });
          etiquetaSegmento.style.fill = 'var(--text-primary)';
          etiquetaSegmento.textContent = formatearNumero(Math.round(proporcion * 1000) / 10) + '%';
          svg.appendChild(etiquetaSegmento);
        }

        yAcumulado = y + hSeg + GAP_SEPARADOR;
      }

      var yBaseEtiquetaX = rotacionEtiquetasX.rotar ? (alto - margen.abajo + 12) : (alto - margen.abajo + 16);
      dibujarEtiquetaCategoriaX(doc, svg, xCentro, yBaseEtiquetaX, categorias[c], rotacionEtiquetasX.rotar);
    }

    if (series.length >= 2) {
      construirLeyenda(doc, raiz, series.map(function (s, idx) { return { nombre: s.nombre, color: s.color || tokenSerie(idx) }; }));
    }
    if (opciones.tabla) {
      var especTabla = resolverEspecTabla(opciones.tabla, categorias, series, opciones.etiquetaColumna);
      construirTablaToggle(doc, raiz, especTabla);
    }

    contenedorEl.appendChild(raiz);
    return raiz;
  };

  // ---------------------------------------------------------------------
  // Herzon.Charts.heatmapCalendario — rampa secuencial var(--heat-1..5)
  // ---------------------------------------------------------------------
  Charts.heatmapCalendario = function (contenedorEl, opciones) {
    opciones = opciones || {};
    var doc = contenedorEl.ownerDocument;
    var valores = opciones.valores || [];
    var etiquetas = opciones.etiquetas || [];
    var columnas = opciones.columnas || 7;
    var gap = 3;
    var filas = Math.ceil(valores.length / columnas) || 1;

    // R6: encabezadosDia reserva una fila superior para las iniciales de día.
    // R9 (DV-05 pieza 1): encabezadosColumna reserva la MISMA fila superior
    // para rótulos de texto libre por columna (p.ej. S1/S4/S8/S12 cuando las
    // columnas son semanas en vez de días — heatmap transpuesto). Ambas
    // opciones son mutuamente excluyentes en uso normal (el llamador elige
    // una según qué representa la columna); si llegaran a coexistir, ambas
    // se dibujan sobre la misma fila. etiquetasFila reserva una columna
    // izquierda para las etiquetas de fila (p.ej. L, M, X...). Las tres
    // empiezan en 0 (sin cambio de render) y solo crecen cuando la opción
    // viene activada, de modo que el viewBox por default sea exactamente el
    // mismo de antes de R6/R9.
    var margenArribaEncabezados = (opciones.encabezadosDia || opciones.encabezadosColumna) ? (TAMANO_FUENTE_EJE + 6) : 0;
    var margenIzquierdaFilas = 0;
    if (opciones.etiquetasFila) {
      for (var mf = 0; mf < opciones.etiquetasFila.length; mf++) {
        if (opciones.etiquetasFila[mf]) {
          var wf = estimarAnchoTexto(opciones.etiquetasFila[mf], TAMANO_FUENTE_EJE);
          if (wf > margenIzquierdaFilas) margenIzquierdaFilas = wf;
        }
      }
      if (margenIzquierdaFilas > 0) margenIzquierdaFilas += PADDING_GUTTER_FILA_HEATMAP;
    }

    // R9 (DV-05 pieza 3, fix interno sin API — mismo estatus que D3 en las
    // demás primitivas): el ancho real usa anchoDeRenderizado (clientWidth
    // del contenedor si hay layout real; si no, opciones.ancho o el cálculo
    // por defecto que asume LADO_HEATMAP_POR_DEFECTO). `lado` se deriva del
    // ancho disponible para celdas cuando opciones.lado no viene explícito;
    // si viene, se respeta tal cual (sin cambio de API). Sin layout real y
    // sin opciones.ancho/opciones.lado (TestDOM headless), el resultado es
    // idéntico al de siempre — ver derivarLadoCeldaHeatmap.
    var anchoPorDefecto = margenIzquierdaFilas + columnas * (LADO_HEATMAP_POR_DEFECTO + gap) + gap;
    var ancho = anchoDeRenderizado(contenedorEl, opciones.ancho, anchoPorDefecto);
    var lado = (typeof opciones.lado === 'number') ? opciones.lado : derivarLadoCeldaHeatmap(ancho, margenIzquierdaFilas, gap, columnas);
    var alto = opciones.alto || (margenArribaEncabezados + filas * (lado + gap) + gap);

    var todos = valores.filter(function (v) { return typeof v === 'number' && !isNaN(v); });
    var minV = (typeof opciones.min === 'number') ? opciones.min : (todos.length ? Math.min.apply(null, todos) : 0);
    var maxV = (typeof opciones.max === 'number') ? opciones.max : (todos.length ? Math.max.apply(null, todos) : 1);
    if (maxV === minV) maxV = minV + 1;

    var raiz = crearHTML(doc, 'div');
    raiz.classList.add('hz-chart');
    if (opciones.titulo) {
      var tit = crearHTML(doc, 'div');
      tit.classList.add('hz-chart-title');
      tit.textContent = opciones.titulo;
      raiz.appendChild(tit);
    }
    var envoltura = crearHTML(doc, 'div');
    envoltura.style.position = 'relative';
    raiz.appendChild(envoltura);

    var svg = crearSVG(doc, 'svg', { viewBox: '0 0 ' + ancho + ' ' + alto, role: 'img' });
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.display = 'block';
    envoltura.appendChild(svg);

    var tooltip = crearHTML(doc, 'div');
    tooltip.classList.add('hz-tooltip');
    tooltip.style.position = 'absolute';
    tooltip.style.display = 'none';
    tooltip.setAttribute('role', 'status');
    envoltura.appendChild(tooltip);

    function mostrarTooltipCelda(x, y, etiqueta, valor) {
      tooltip.textContent = '';
      var fuerte = crearHTML(doc, 'strong');
      fuerte.textContent = formatearNumero(valor);
      var span = crearHTML(doc, 'span');
      span.textContent = ' ' + etiqueta;
      tooltip.appendChild(fuerte);
      tooltip.appendChild(span);
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
      tooltip.style.display = '';
    }
    function ocultarTooltipCelda() { tooltip.style.display = 'none'; }

    var TOKENS_RAMPA = ['var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)', 'var(--heat-5)'];

    // R6: encabezadosDia — iniciales L M X J V S D derivadas de opciones.etiquetas
    // (una por columna, tomadas de la primera fila), reutilizando derivarInicialDiaSemana.
    if (opciones.encabezadosDia) {
      for (var hc = 0; hc < columnas; hc++) {
        var inicialDia = derivarInicialDiaSemana(etiquetas[hc], hc);
        var xEncabezado = margenIzquierdaFilas + gap + hc * (lado + gap) + lado / 2;
        var etiquetaEncabezado = crearSVG(doc, 'text', {
          x: xEncabezado, y: margenArribaEncabezados - 4, 'text-anchor': 'middle',
          'font-size': String(TAMANO_FUENTE_EJE), class: 'hz-heat-encabezado-dia'
        });
        etiquetaEncabezado.style.fill = 'var(--text-muted)';
        etiquetaEncabezado.textContent = inicialDia;
        svg.appendChild(etiquetaEncabezado);
      }
    }

    // R9 (DV-05 pieza 1): encabezadosColumna — texto libre por columna (p.ej.
    // 'S1','','','S4' cuando el heatmap va transpuesto y las columnas son
    // semanas). Mismo patrón que etiquetasFila: SOLO se dibuja el rótulo de
    // las entradas no vacías (el llamador decide qué columnas rotular).
    if (opciones.encabezadosColumna) {
      for (var ec = 0; ec < columnas; ec++) {
        if (!opciones.encabezadosColumna[ec]) continue;
        var xEncColumna = margenIzquierdaFilas + gap + ec * (lado + gap) + lado / 2;
        var etiquetaEncColumna = crearSVG(doc, 'text', {
          x: xEncColumna, y: margenArribaEncabezados - 4, 'text-anchor': 'middle',
          'font-size': String(TAMANO_FUENTE_EJE), class: 'hz-heat-encabezado-columna'
        });
        etiquetaEncColumna.style.fill = 'var(--text-muted)';
        etiquetaEncColumna.textContent = String(opciones.encabezadosColumna[ec]);
        svg.appendChild(etiquetaEncColumna);
      }
    }

    // R6: etiquetasFila — un rotulo por fila SOLO cuando la entrada correspondiente
    // del arreglo recibido es no vacia (el llamador decide que filas rotular, p.ej.
    // S1, S4, S8, S12 de 12 semanas).
    if (opciones.etiquetasFila) {
      for (var rf = 0; rf < filas; rf++) {
        if (!opciones.etiquetasFila[rf]) continue;
        var yFila = margenArribaEncabezados + gap + rf * (lado + gap) + lado / 2;
        var etiquetaFila = crearSVG(doc, 'text', {
          x: margenIzquierdaFilas - PADDING_GUTTER_FILA_HEATMAP + 4, y: yFila,
          'text-anchor': 'end', 'dominant-baseline': 'middle',
          'font-size': String(TAMANO_FUENTE_EJE), class: 'hz-heat-fila-etiqueta'
        });
        etiquetaFila.style.fill = 'var(--text-muted)';
        etiquetaFila.textContent = String(opciones.etiquetasFila[rf]);
        svg.appendChild(etiquetaFila);
      }
    }

    for (var i = 0; i < valores.length; i++) {
      var valor = valores[i];
      var fila = Math.floor(i / columnas);
      var col = i % columnas;
      var x = margenIzquierdaFilas + gap + col * (lado + gap);
      var y = margenArribaEncabezados + gap + fila * (lado + gap);
      var bucket = calcularBucketRampa(valor, minV, maxV, 5);

      var celda = crearSVG(doc, 'rect', { x: x, y: y, width: lado, height: lado, rx: 2, class: 'hz-heat-celda' });
      celda.style.fill = TOKENS_RAMPA[bucket];
      celda.style.stroke = 'none';
      svg.appendChild(celda);

      (function (xC, yC, catIdx, val, celdaMarca) {
        var zonaHit = crearSVG(doc, 'rect', {
          x: xC - 4, y: yC - 4, width: Math.max(HIT_MINIMO, lado + 8), height: Math.max(HIT_MINIMO, lado + 8),
          tabindex: '0', role: 'button'
        });
        zonaHit.style.fill = 'var(--surface-1)';
        zonaHit.setAttribute('fill-opacity', '0');
        var etiquetaTexto = String(etiquetas[catIdx] != null ? etiquetas[catIdx] : '');
        zonaHit.setAttribute('aria-label', etiquetaTexto + ' ' + formatearNumero(val));
        var elevar = function () { celdaMarca.setAttribute('rx', '3'); mostrarTooltipCelda(xC + lado, yC, etiquetaTexto, val); };
        var bajar = function () { celdaMarca.setAttribute('rx', '2'); ocultarTooltipCelda(); };
        zonaHit.addEventListener('pointerenter', elevar);
        zonaHit.addEventListener('focus', elevar);
        zonaHit.addEventListener('pointerleave', bajar);
        zonaHit.addEventListener('blur', bajar);
        svg.appendChild(zonaHit);
      })(x, y, i, valor, celda);
    }

    // R6: leyendaRampa — 5 swatches --heat-1..5 con el rango numérico de cada
    // bucket; reutiliza construirLeyenda (contrato Adendum R6 punto 2).
    if (opciones.leyendaRampa) {
      var rangosRampa = calcularRangosBucketsRampa(minV, maxV, 5);
      var entradasLeyendaRampa = rangosRampa.map(function (r, idx) {
        return { nombre: formatearNumero(r.desde) + '-' + formatearNumero(r.hasta), color: TOKENS_RAMPA[idx] };
      });
      construirLeyenda(doc, raiz, entradasLeyendaRampa);
    }

    if (opciones.tabla) {
      var especTabla = resolverEspecTabla(opciones.tabla, etiquetas, [{ nombre: opciones.nombreSerie || 'Valor', datos: valores }], opciones.etiquetaColumna);
      construirTablaToggle(doc, raiz, especTabla);
    }

    contenedorEl.appendChild(raiz);
    return raiz;
  };

  // ---------------------------------------------------------------------
  // Herzon.Charts.sparkline — exactamente N puntos para N valores
  // ---------------------------------------------------------------------
  Charts.sparkline = function (contenedorEl, opciones) {
    opciones = opciones || {};
    var doc = contenedorEl.ownerDocument;
    var valores = opciones.valores || [];
    var ancho = opciones.ancho || 120;
    var alto = opciones.alto || 32;
    var colorAcento = opciones.color || 'var(--series-1)';
    var margen = 3;

    var svg = crearSVG(doc, 'svg', { viewBox: '0 0 ' + ancho + ' ' + alto, role: 'img', 'aria-hidden': 'true' });
    svg.classList.add('hz-spark');
    svg.style.width = ancho + 'px';
    svg.style.height = alto + 'px';
    svg.style.display = 'inline-block';

    var n = valores.length;
    if (n > 0) {
      var minV = Math.min.apply(null, valores);
      var maxV = Math.max.apply(null, valores);
      if (maxV === minV) maxV = minV + 1;
      var escalaX = function (i) { return margen + (n <= 1 ? 0 : (i / (n - 1)) * (ancho - margen * 2)); };
      var escalaY = function (v) { return alto - margen - ((v - minV) / (maxV - minV)) * (alto - margen * 2); };

      var puntos = [];
      for (var i = 0; i < n; i++) puntos.push(escalaX(i) + ',' + escalaY(valores[i]));
      var linea = crearSVG(doc, 'polyline', { points: puntos.join(' '), 'stroke-width': '2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      linea.style.fill = 'none';
      // LY-01 pieza 3 (R9): opciones.lineaAcento — opción aditiva
      // default-apagada. La polilínea completa usa colorAcento (mismo
      // opciones.color que ya tiñe el punto final) en vez de
      // var(--text-muted); apagada, render idéntico al actual (la evidencia
      // principal deja de codificarse en el gris más recesivo).
      linea.style.stroke = opciones.lineaAcento ? colorAcento : 'var(--text-muted)';
      svg.appendChild(linea);

      for (var j = 0; j < n; j++) {
        var esUltimo = j === n - 1;
        var punto = crearSVG(doc, 'circle', { cx: escalaX(j), cy: escalaY(valores[j]), r: esUltimo ? 2.5 : 1.3, class: 'hz-spark-punto' });
        punto.style.fill = esUltimo ? colorAcento : 'var(--text-muted)';
        svg.appendChild(punto);
      }
    }

    contenedorEl.appendChild(svg);
    return svg;
  };

  // ---------------------------------------------------------------------
  // Herzon.Charts.statTile — número + delta con signo y clase de bondad
  // ---------------------------------------------------------------------
  Charts.statTile = function (contenedorEl, opciones) {
    opciones = opciones || {};
    var doc = contenedorEl.ownerDocument;

    var raiz = crearHTML(doc, 'div');
    raiz.classList.add('hz-stat');

    var etiqueta = crearHTML(doc, 'div');
    etiqueta.classList.add('hz-stat-label');
    etiqueta.textContent = opciones.etiqueta || '';
    raiz.appendChild(etiqueta);

    var numero = crearHTML(doc, 'div');
    numero.classList.add('hz-stat-num');
    numero.textContent = (opciones.valorFormateado != null) ? opciones.valorFormateado : formatearNumero(opciones.valor);
    raiz.appendChild(numero);

    if (typeof opciones.delta === 'number' && !isNaN(opciones.delta)) {
      var delta = crearHTML(doc, 'div');
      delta.classList.add('hz-stat-delta');
      var esMejora = opciones.mejorSi === 'menor' ? (opciones.delta <= 0) : (opciones.delta >= 0);
      delta.classList.add(esMejora ? 'hz-delta-good' : 'hz-delta-bad');
      var signo = opciones.delta > 0 ? '+' : '';
      delta.textContent = signo + formatearNumero(opciones.delta) + (opciones.sufijoDelta || '');
      raiz.appendChild(delta);
    }

    if (opciones.sparkline && opciones.sparkline.length) {
      Charts.sparkline(raiz, { valores: opciones.sparkline, color: opciones.colorSparkline });
    }

    contenedorEl.appendChild(raiz);
    return raiz;
  };

  // ---------------------------------------------------------------------
  // Herzon.Charts.leyenda / Herzon.Charts.tablaToggle — primitivas públicas
  // (también reutilizadas internamente por linea/barras/apilada100/heatmap)
  // ---------------------------------------------------------------------
  Charts.leyenda = function (contenedorEl, opciones) {
    opciones = opciones || {};
    var doc = contenedorEl.ownerDocument;
    return construirLeyenda(doc, contenedorEl, opciones.series || []);
  };

  Charts.tablaToggle = function (contenedorEl, opciones) {
    opciones = opciones || {};
    var doc = contenedorEl.ownerDocument;
    var espec = (opciones.columnas && opciones.filas) ? opciones : { columnas: opciones.columnas || [], filas: opciones.filas || [], etiquetaBoton: opciones.etiquetaBoton };
    return construirTablaToggle(doc, contenedorEl, espec);
  };

  // Exportes de solo-lectura para verificación mecánica (selfcheck de esta misma
  // tarea). No forman parte de la API congelada de plan.md 3.B; son utilidades
  // puras (sin DOM, sin datos de aplicación) para poder aseverar sobre el mismo
  // cómputo que usan las 8 primitivas, en vez de reinventar el cálculo en el test.
  Charts._debug = {
    generarTicksY: generarTicksY,
    tokenSerie: tokenSerie,
    formatearNumero: formatearNumero,
    seleccionarIndicesEtiquetas: seleccionarIndicesEtiquetas,
    GROSOR_MAX_BARRA: GROSOR_MAX_BARRA,
    GAP_SEPARADOR: GAP_SEPARADOR,
    HIT_MINIMO: HIT_MINIMO,
    // QA ronda 1 (D2/D3): expuestas para que el selfcheck asevere sobre el mismo
    // cómputo de layout/tamaño de fuente que usan las primitivas, en vez de
    // reinventarlo en el test.
    anchoDeRenderizado: anchoDeRenderizado,
    estimarAnchoTexto: estimarAnchoTexto,
    TAMANO_FUENTE_EJE: TAMANO_FUENTE_EJE,
    TAMANO_FUENTE_ETIQUETA: TAMANO_FUENTE_ETIQUETA,
    // QA ronda 3 (a/b): expuestas para que el selfcheck asevere anti-regresión sobre el
    // mismo cómputo de rotación/gutter/truncado que usan apilada100 y barras.
    calcularRotacionEtiquetasX: calcularRotacionEtiquetasX,
    truncarConElipsisFinal: truncarConElipsisFinal,
    ROTACION_ETIQUETA_X_GRADOS: ROTACION_ETIQUETA_X_GRADOS,
    GUTTER_IZQUIERDO_PROPORCION_MAX: GUTTER_IZQUIERDO_PROPORCION_MAX,
    GUTTER_IZQUIERDO_MIN: GUTTER_IZQUIERDO_MIN,
    // T-025: expuestas para que el selfcheck asevere sobre el mismo algoritmo de
    // anti-colisión de labels de punta que usa linea(), en vez de reinventarlo.
    resolverColisionesEtiquetasPunta: resolverColisionesEtiquetasPunta,
    ALTURA_MINIMA_ETIQUETA_PUNTA: ALTURA_MINIMA_ETIQUETA_PUNTA,
    UMBRAL_LINEA_GUIA: UMBRAL_LINEA_GUIA,
    // R6 (Adendum 2): expuestas para que el selfcheck asevere sobre el mismo
    // cómputo puro que usan las opciones aditivas nuevas, en vez de reinventarlo.
    etiquetaConUnidad: etiquetaConUnidad,
    calcularBucketRampa: calcularBucketRampa,
    calcularRangosBucketsRampa: calcularRangosBucketsRampa,
    derivarInicialDiaSemana: derivarInicialDiaSemana,
    ALTURA_MINIMA_ETIQUETA_SEGMENTO: ALTURA_MINIMA_ETIQUETA_SEGMENTO,
    PADDING_GUTTER_FILA_HEATMAP: PADDING_GUTTER_FILA_HEATMAP,
    // T-034 (R6-fix): expuestas para que el selfcheck asevere sobre el mismo
    // cómputo de colisión/posición que usa la etiqueta de opciones.referencia
    // en barras(), en vez de reinventarlo.
    cajasIntersectan: cajasIntersectan,
    resolverPosicionEtiquetaReferencia: resolverPosicionEtiquetaReferencia,
    // R9: expuestas para que el selfcheck asevere sobre el mismo cómputo
    // puro que usan los fixes internos DV-02 y DV-05 (pieza 3), en vez de
    // reinventarlo.
    calcularMargenIzquierdoRotado: calcularMargenIzquierdoRotado,
    derivarLadoCeldaHeatmap: derivarLadoCeldaHeatmap,
    LADO_HEATMAP_POR_DEFECTO: LADO_HEATMAP_POR_DEFECTO
  };
})();
