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
      var anchoTexto = estimarAnchoTexto(formatearNumero(datos[datos.length - 1]), TAMANO_FUENTE_ETIQUETA);
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

        puntosEtiquetaPunta.push({ cx: cx, cy: cy, texto: formatearNumero(datos[ultimoI]) });
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
      crosshair.style.stroke = 'var(--axis)';
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
    var ESPACIO_PUNTO_ETIQUETA = 6;
    var anchoEtiquetaMaximo = 0;
    if (series.length === 1) {
      var datosUnicaPre = series[0].datos || [];
      var idxMaxPre = indiceDelMaximo(datosUnicaPre);
      if (idxMaxPre >= 0) {
        anchoEtiquetaMaximo = estimarAnchoTexto(formatearNumero(datosUnicaPre[idxMaxPre]), TAMANO_FUENTE_ETIQUETA);
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
    }
    var altoPlot = alto - margen.arriba - margen.abajo;

    var todosValores = [];
    series.forEach(function (s) {
      (s.datos || []).forEach(function (v) { if (typeof v === 'number' && !isNaN(v)) todosValores.push(v); });
    });
    var dataMax = todosValores.length ? Math.max.apply(null, todosValores) : 1;
    var valorMax = (typeof opciones.max === 'number') ? opciones.max : (dataMax || 1);
    if (valorMax <= 0) valorMax = 1;

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
        var idxMax = indiceDelMaximo(datosUnica);
        if (idxMax >= 0) {
          var xCentro = margen.izquierda + idxMax * anchoGrupo + anchoGrupo / 2;
          var valorMaxSel = datosUnica[idxMax];
          var yCap = alto - margen.abajo - escalaAlt(valorMaxSel);
          var etiquetaValor = crearSVG(doc, 'text', { x: xCentro, y: yCap - 6, 'text-anchor': 'middle', class: 'hz-etiqueta-valor', 'font-size': String(TAMANO_FUENTE_ETIQUETA) });
          etiquetaValor.style.fill = 'var(--text-primary)';
          etiquetaValor.textContent = formatearNumero(valorMaxSel);
          svg.appendChild(etiquetaValor);
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
        var idxMaxH = indiceDelMaximo(datosUnicaH);
        if (idxMaxH >= 0) {
          var yCentro = margen.arriba + idxMaxH * altoGrupo + altoGrupo / 2;
          var valorMaxSelH = datosUnicaH[idxMaxH];
          var xCap = margen.izquierda + escalaAncho(valorMaxSelH);
          var etiquetaValorH = crearSVG(doc, 'text', { x: xCap + ESPACIO_PUNTO_ETIQUETA, y: yCentro, 'dominant-baseline': 'middle', class: 'hz-etiqueta-valor', 'font-size': String(TAMANO_FUENTE_ETIQUETA) });
          etiquetaValorH.style.fill = 'var(--text-primary)';
          etiquetaValorH.textContent = formatearNumero(valorMaxSelH);
          svg.appendChild(etiquetaValorH);
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
    var lado = opciones.lado || 16;
    var gap = 3;
    var filas = Math.ceil(valores.length / columnas) || 1;
    var ancho = opciones.ancho || (columnas * (lado + gap) + gap);
    var alto = opciones.alto || (filas * (lado + gap) + gap);

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

    for (var i = 0; i < valores.length; i++) {
      var valor = valores[i];
      var fila = Math.floor(i / columnas);
      var col = i % columnas;
      var x = gap + col * (lado + gap);
      var y = gap + fila * (lado + gap);
      var proporcion = (valor - minV) / (maxV - minV);
      if (proporcion < 0) proporcion = 0;
      if (proporcion > 1) proporcion = 1;
      var bucket = Math.min(4, Math.floor(proporcion * 5));

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
      linea.style.stroke = 'var(--text-muted)';
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
    UMBRAL_LINEA_GUIA: UMBRAL_LINEA_GUIA
  };
})();
