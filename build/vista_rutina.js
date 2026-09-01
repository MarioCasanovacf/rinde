// build/vista_rutina.js
// R10 (T-053): vista nueva "Rutina" -- lectura (R-05), editor solo en modo
// real (R-06) y documento imprimible/descargable (R-07). Registra
// window.Herzon.Views.rutina y Herzon.registerView('rutina', ...) (API
// publicada por T-002/build/shell.html, contrato .harness/plan.md 3.C).
//
// Consume window.HERZON_DATA (T-001 + claves aditivas R-02/R-03 de
// build/almacen.js), window.Herzon.Almacen (T-039/T-045, opcional -- puede
// no existir) y window.Herzon.Docs.descargarArchivo / .nombreArchivoExportable
// (T-023, YA publicados). build/documentos.js NO se modifica en esta ronda
// (.harness/justesse-r10-diseno.md C-7): este módulo solo CONSUME esas dos
// funciones; el resto de lo que necesita (render del documento vivo, HTML
// descargable autocontenido, escape de texto) lo define e implementa por su
// cuenta, mismo patrón de build/documentos.js pero SIN importarlo.
//
// Preámbulo obligatorio (plan.md 3.A): script clásico, IIFE, sin
// import/export. Prohibido tocar `document` en el nivel superior del módulo:
// todo acceso al DOM ocurre dentro de `montarVistaRutina` (invocada por el
// shell, o por el selfcheck con el contenedor ya presente) y las funciones
// que llama.
//
// Reactividad multi-cliente (R-05.6): el patrón manejarRemontajeDatos +
// listener herzon:modo-cambiado está COPIADO literalmente de
// build/vista_dieta_supl.js (ese archivo NO se toca en R10, C-7) -- Views
// solo se montan UNA vez (Herzon.registerView), así que el repintado ante
// cambio de cliente/modo depende de guardar una referencia de remontaje al
// montar y de un listener a nivel de módulo que la usa.
//
// Sistema de formularios y botones (F-01/F-02, sección 12 de shell.html):
// el editor (R-06) y sus botones son el ÚNICO vocabulario permitido (C-1);
// este módulo no define clases hz-form-*/hz-btn-* nuevas. Las clases
// hz-rutina-* (R-01.5) las define shell.html; este módulo solo las aplica.
(function () {
  var G = (typeof window !== 'undefined') ? window : globalThis;
  G.Herzon = G.Herzon || {};
  G.Herzon.Views = G.Herzon.Views || {};

  // -----------------------------------------------------------------------
  // Textos exactos (R-05/R-06, .harness/justesse-r10-diseno.md secciones
  // 2.2 y 4/C-10): literales, con acentos, fijados por el contrato.
  // -----------------------------------------------------------------------
  var TEXTO_VACIO_RUTINA = 'Aún no hay una rutina prescrita para este cliente. Ármala con el editor de abajo para poder imprimirla.';
  var TEXTO_DEMO_RUTINA = 'En modo demo la rutina es un ejemplo de solo lectura; con el botón Usar mis datos puedes prescribir y guardar la rutina de cada cliente.';
  var TITULO_CARD_LECTURA = 'Rutina de entrenamiento';
  var LABEL_HERO_RUTINA = 'Días de entrenamiento por semana';
  var TITULO_EDITOR = 'Editar rutina';
  var LABEL_TITULO_DIA = 'Título del día';
  var LABEL_EJERCICIO = 'Ejercicio';
  var LABEL_SERIES = 'Series';
  var LABEL_REPETICIONES = 'Repeticiones';
  var LABEL_DESCANSO = 'Descanso (s)';
  var LABEL_NOTAS = 'Notas';
  var TEXTO_BOTON_QUITAR = 'Quitar';
  var TEXTO_BOTON_QUITAR_DIA = 'Quitar día';
  var TEXTO_BOTON_AGREGAR_EJERCICIO = 'Agregar ejercicio';
  var TEXTO_BOTON_AGREGAR_DIA = 'Agregar día';
  var TEXTO_BOTON_GUARDAR_RUTINA = 'Guardar rutina';
  var TEXTO_BOTON_IMPRIMIR_RUTINA = 'Imprimir / PDF';
  var TEXTO_BOTON_DESCARGAR_RUTINA = 'Descargar rutina (.html)';
  var TITULO_DOCUMENTO_RUTINA = 'Rutina de entrenamiento — Rinde';
  var MSG_GUARDADO_FALLIDO = 'No se pudo guardar en este dispositivo.';
  var MAX_DIAS = 7;
  var MAX_EJERCICIOS_POR_DIA = 12;

  // -----------------------------------------------------------------------
  // Utilidades de DOM locales (patrón crear/limpiar de
  // build/vista_metricas.js -- sin `document` en el nivel superior: reciben
  // siempre `doc` = rootEl.ownerDocument).
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

  // Busca un descendiente (o el propio nodo) por atributo id, sin depender
  // de querySelector/getElementById: build/testdom.js no los implementa
  // (mismo patrón buscarHijoPorId de build/vista_metricas.js).
  function buscarHijoPorId(raizEl, id) {
    if (raizEl.getAttribute && raizEl.getAttribute('id') === id) { return raizEl; }
    var hijos = raizEl.children || [];
    for (var i = 0; i < hijos.length; i++) {
      var encontrado = buscarHijoPorId(hijos[i], id);
      if (encontrado) { return encontrado; }
    }
    return null;
  }

  function crearCard(doc, contenedorEl, tituloTexto) {
    var card = crear(doc, 'div', ['hz-card']);
    if (tituloTexto) {
      card.appendChild(crear(doc, 'div', ['hz-card-title'], tituloTexto));
    }
    contenedorEl.appendChild(card);
    return card;
  }

  // Número héroe manual (regla 11 del contrato de diseño: exactamente UN
  // .hz-hero por vista -- mismo patrón que build/vista_dieta_supl.js).
  function crearHero(doc, contenedorEl, etiquetaTexto) {
    var raiz = crear(doc, 'div', ['hz-hero']);
    var num = crear(doc, 'div', ['hz-hero-num']);
    var label = crear(doc, 'div', ['hz-hero-label'], etiquetaTexto);
    raiz.appendChild(num);
    raiz.appendChild(label);
    contenedorEl.appendChild(raiz);
    return { raiz: raiz, num: num };
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
    input.value = (valorInicial != null) ? valorInicial : '';
    campo.appendChild(etiqueta);
    campo.appendChild(input);
    contenedorEl.appendChild(campo);
    return { campo: campo, input: input };
  }

  // Documento (R-07): hz-doc-seccion/hz-table -- COPIA del patrón de
  // build/documentos.js (crearSeccion/construirTabla), no importado (C-7).
  function crearSeccionDoc(doc, contenedorEl, tituloTexto) {
    var seccion = crear(doc, 'div', ['hz-doc-seccion']);
    seccion.appendChild(crear(doc, 'h3', ['hz-doc-seccion-titulo'], tituloTexto));
    contenedorEl.appendChild(seccion);
    return seccion;
  }

  function construirTablaDoc(doc, contenedorEl, columnas, filas) {
    var wrap = crear(doc, 'div', ['hz-table-wrap']);
    var tabla = crear(doc, 'table', ['hz-table']);

    var thead = crear(doc, 'thead');
    var trEncabezado = crear(doc, 'tr');
    for (var c = 0; c < columnas.length; c++) {
      var th = crear(doc, 'th', null, columnas[c]);
      th.setAttribute('scope', 'col');
      trEncabezado.appendChild(th);
    }
    thead.appendChild(trEncabezado);
    tabla.appendChild(thead);

    var tbody = crear(doc, 'tbody');
    for (var f = 0; f < filas.length; f++) {
      var tr = crear(doc, 'tr');
      var fila = filas[f];
      for (var i = 0; i < fila.length; i++) {
        var esPrimera = i === 0;
        var valor = fila[i];
        var celda = crear(doc, esPrimera ? 'th' : 'td', null, (valor === null || valor === undefined) ? '' : String(valor));
        if (esPrimera) { celda.setAttribute('scope', 'row'); }
        tr.appendChild(celda);
      }
      tbody.appendChild(tr);
    }
    tabla.appendChild(tbody);
    wrap.appendChild(tabla);
    contenedorEl.appendChild(wrap);
    return wrap;
  }

  // -----------------------------------------------------------------------
  // Fechas (mismo patrón UTC que build/data.js/build/documentos.js: sin
  // dependencia de zona horaria local).
  // -----------------------------------------------------------------------
  function formatoFechaHoy(fecha) {
    var yyyy = fecha.getUTCFullYear();
    var mm = String(fecha.getUTCMonth() + 1);
    if (mm.length < 2) { mm = '0' + mm; }
    var dd = String(fecha.getUTCDate());
    if (dd.length < 2) { dd = '0' + dd; }
    return yyyy + '-' + mm + '-' + dd;
  }

  // -----------------------------------------------------------------------
  // Acceso a Herzon.Almacen (R8/R9): SIEMPRE opcional/defensivo -- mismo
  // patrón que build/vista_metricas.js y build/vista_dieta_supl.js.
  // -----------------------------------------------------------------------
  function obtenerAlmacen() {
    return (G.Herzon && G.Herzon.Almacen) ? G.Herzon.Almacen : null;
  }

  function esModoReal(Almacen) {
    return !!(Almacen && typeof Almacen.modo === 'function' && Almacen.modo() === 'real');
  }

  function tituloDia(dia) {
    return 'Día ' + dia.dia + (dia.titulo ? (' — ' + dia.titulo) : '');
  }

  // =========================================================================
  // R-07: documento imprimible/descargable. Fuente del payload SIEMPRE en
  // vivo (HERZON_DATA.rutina + HERZON_DATA.paciente + meta.nota), nunca
  // cacheada al montar (R-07.4) -- por eso `datosDocumentoRutina` recibe
  // HERZON_DATA como parámetro y se invoca en cada clic, no una sola vez.
  // =========================================================================
  function datosDocumentoRutina(HERZON_DATA, opciones) {
    opciones = opciones || {};
    return {
      paciente: HERZON_DATA.paciente,
      rutina: HERZON_DATA.rutina || null,
      notaDatos: HERZON_DATA.meta.nota,
      fechaGeneracion: opciones.fechaGeneracion || formatoFechaHoy(opciones.ahora || new Date())
    };
  }

  // renderDocumentoRutina(doc, contenedorEl, payload): llena #documento-rutina
  // (R-07.1) con clases congeladas hz-doc-* (build/shell.html, T-021/R-01) --
  // cero clases nuevas, todo textContent.
  function renderDocumentoRutina(doc, contenedorEl, payload) {
    limpiar(contenedorEl);
    var rutina = payload.rutina || { dias: [], actualizado: '' };

    contenedorEl.appendChild(crear(doc, 'h2', ['hz-doc-titulo'], TITULO_DOCUMENTO_RUTINA));

    var meta = crear(doc, 'div', ['hz-doc-meta']);
    [
      'Cliente: ' + payload.paciente.nombre,
      'Objetivo: ' + payload.paciente.objetivo,
      'Actualizada: ' + (rutina.actualizado || ''),
      'Generado: ' + payload.fechaGeneracion
    ].forEach(function (texto) {
      meta.appendChild(crear(doc, 'span', null, texto));
    });
    contenedorEl.appendChild(meta);

    var dias = rutina.dias || [];
    for (var d = 0; d < dias.length; d++) {
      var dia = dias[d];
      var seccion = crearSeccionDoc(doc, contenedorEl, tituloDia(dia));
      var filas = dia.ejercicios.map(function (ej) {
        return [
          ej.nombre,
          ej.series,
          ej.repeticiones,
          (ej.descanso_s != null) ? (ej.descanso_s + ' s') : '—',
          ej.notas || ''
        ];
      });
      construirTablaDoc(doc, seccion, ['Ejercicio', 'Series', 'Repeticiones', 'Descanso', 'Notas'], filas);
    }

    contenedorEl.appendChild(crear(doc, 'p', ['hz-doc-pie'], payload.notaDatos));
    return contenedorEl;
  }

  // Descarga .html autocontenida (Blob local, R-07.3): documento SEPARADO
  // del prototipo, con su propio <style> mínimo -- mismos hexes claros
  // VALIDADOS que usa generarHtmlDescargable de build/documentos.js
  // (precedente bendecido: documento fuera del árbol vivo, sin var(--token)).
  // escaparHtml propio del módulo (COPIA, no importado -- C-7).
  function escaparHtml(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function generarHtmlRutinaDescargable(payload) {
    var rutina = payload.rutina || { dias: [], actualizado: '' };
    var partes = [];
    partes.push('<!DOCTYPE html>');
    partes.push('<html lang="es">');
    partes.push('<head>');
    partes.push('<meta charset="utf-8">');
    partes.push('<title>' + escaparHtml(TITULO_DOCUMENTO_RUTINA) + '</title>');
    partes.push(
      '<style>' +
      'body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:820px;margin:32px auto;padding:0 16px;color:#0b0b0b;}' +
      'h1{font-size:1.4rem;margin-bottom:4px;}' +
      'h2{font-size:1.05rem;margin-top:28px;}' +
      'p{color:#52514e;font-size:0.9rem;}' +
      'table{border-collapse:collapse;width:100%;margin:8px 0 20px;}' +
      'th,td{border:1px solid #c3c2b7;padding:6px 8px;text-align:left;font-size:0.82rem;color:#0b0b0b;}' +
      '.hz-doc-pie{margin-top:24px;padding-top:12px;border-top:1px solid #e1e0d9;font-size:0.75rem;color:#52514e;}' +
      '</style>'
    );
    partes.push('</head>');
    partes.push('<body>');
    partes.push('<h1>' + escaparHtml(TITULO_DOCUMENTO_RUTINA) + '</h1>');
    partes.push(
      '<p>' + [
        'Cliente: ' + escaparHtml(payload.paciente.nombre),
        'Objetivo: ' + escaparHtml(payload.paciente.objetivo),
        'Actualizada: ' + escaparHtml(rutina.actualizado || ''),
        'Generado: ' + escaparHtml(payload.fechaGeneracion)
      ].join(' &middot; ') + '</p>'
    );
    var dias = rutina.dias || [];
    for (var d = 0; d < dias.length; d++) {
      var dia = dias[d];
      partes.push('<h2>' + escaparHtml(tituloDia(dia)) + '</h2>');
      partes.push('<table><thead><tr><th>Ejercicio</th><th>Series</th><th>Repeticiones</th><th>Descanso</th><th>Notas</th></tr></thead><tbody>');
      for (var e = 0; e < dia.ejercicios.length; e++) {
        var ej = dia.ejercicios[e];
        var descansoTexto = (ej.descanso_s != null) ? (ej.descanso_s + ' s') : '—';
        partes.push(
          '<tr><td>' + escaparHtml(ej.nombre) + '</td><td>' + escaparHtml(ej.series) + '</td><td>' +
          escaparHtml(ej.repeticiones) + '</td><td>' + escaparHtml(descansoTexto) + '</td><td>' +
          escaparHtml(ej.notas || '') + '</td></tr>'
        );
      }
      partes.push('</tbody></table>');
    }
    partes.push('<p class="hz-doc-pie">' + escaparHtml(payload.notaDatos) + '</p>');
    partes.push('</body>');
    partes.push('</html>');
    return partes.join('\n');
  }

  // =========================================================================
  // R-06: validación del borrador (patrón T-029, C-6: nunca guardar en
  // silencio). Función PURA -- no toca Almacen ni DOM (testeable en
  // aislamiento, expuesta como rutinaInterno.validarBorrador).
  // =========================================================================
  function nombreCampoLegible(campo) {
    if (campo === 'nombre') { return LABEL_EJERCICIO; }
    if (campo === 'series') { return LABEL_SERIES; }
    if (campo === 'repeticiones') { return LABEL_REPETICIONES; }
    if (campo === 'descanso') { return LABEL_DESCANSO; }
    return campo;
  }

  function validarBorrador(dias) {
    var errores = [];
    var invalidos = [];
    if (!Array.isArray(dias) || !dias.length) {
      errores.push('agrega al menos un día con un ejercicio');
    }
    (dias || []).forEach(function (dia, di) {
      if (!dia || !Array.isArray(dia.ejercicios) || !dia.ejercicios.length) {
        errores.push('el día ' + (di + 1) + ' necesita al menos un ejercicio');
        return;
      }
      dia.ejercicios.forEach(function (ej, ei) {
        var ubicacion = ' (día ' + (di + 1) + ', ejercicio ' + (ei + 1) + ')';
        var nombre = String((ej && ej.nombre) || '').trim();
        if (!nombre) {
          errores.push(nombreCampoLegible('nombre') + ubicacion);
          invalidos.push({ d: di, e: ei, campo: 'nombre' });
        }
        var seriesTexto = String((ej && ej.series != null) ? ej.series : '').trim();
        var series = parseInt(seriesTexto, 10);
        if (seriesTexto === '' || isNaN(series) || series < 1 || series > 10) {
          errores.push(nombreCampoLegible('series') + ubicacion);
          invalidos.push({ d: di, e: ei, campo: 'series' });
        }
        var repeticiones = String((ej && ej.repeticiones) || '').trim();
        if (!repeticiones) {
          errores.push(nombreCampoLegible('repeticiones') + ubicacion);
          invalidos.push({ d: di, e: ei, campo: 'repeticiones' });
        }
        var descansoTexto = String((ej && ej.descanso != null) ? ej.descanso : '').trim();
        if (descansoTexto !== '') {
          var descanso = parseInt(descansoTexto, 10);
          if (isNaN(descanso) || descanso < 0 || descanso > 600) {
            errores.push(nombreCampoLegible('descanso') + ubicacion);
            invalidos.push({ d: di, e: ei, campo: 'descanso' });
          }
        }
      });
    });
    return { valido: errores.length === 0, errores: errores, invalidos: invalidos };
  }

  // -----------------------------------------------------------------------
  // Estado del módulo (R-05.6/R-06.4): referencia de re-montaje para
  // herzon:modo-cambiado (patrón manejarRemontajeDatos COPIADO de
  // build/vista_dieta_supl.js), borrador del editor EN MEMORIA (se
  // reconstruye desde HERZON_DATA.rutina en cada remontaje de cliente) y
  // mensaje de éxito de consumo-único (mismo patrón que mensajeExitoPerfil
  // de build/vista_metricas.js F-04.5).
  // -----------------------------------------------------------------------
  var refsMontajeRutina = null;
  var borradorDias = [];
  var mensajeExitoRutina = '';

  function ejercicioVacio() {
    return { nombre: '', series: '', repeticiones: '', descanso: '', notas: '' };
  }

  function diaVacio() {
    return { titulo: '', ejercicios: [ejercicioVacio()] };
  }

  function reconstruirBorrador(rutina) {
    if (!rutina || !Array.isArray(rutina.dias) || !rutina.dias.length) { return []; }
    return rutina.dias.map(function (d) {
      return {
        titulo: d.titulo || '',
        ejercicios: (d.ejercicios || []).map(function (e) {
          return {
            nombre: e.nombre || '',
            series: (e.series != null) ? String(e.series) : '',
            repeticiones: e.repeticiones || '',
            descanso: (e.descanso_s != null) ? String(e.descanso_s) : '',
            notas: e.notas || ''
          };
        })
      };
    });
  }

  function idCampoDia(i) { return 'hz-rut-d' + (i + 1) + '-titulo'; }
  function idCampoEjercicio(i, j, campo) { return 'hz-rut-d' + (i + 1) + '-e' + (j + 1) + '-' + campo; }

  // Relee TODOS los valores actualmente tecleados en el DOM hacia
  // `borradorDias` ANTES de cualquier mutación estructural (agregar/quitar
  // día o ejercicio) o de validar al guardar -- así ninguna tecla se pierde
  // (R-06.4): el DOM es la fuente de verdad mientras no hay remontaje.
  function sincronizarDesdeDOM(formEl) {
    borradorDias.forEach(function (dia, i) {
      var campoTitulo = buscarHijoPorId(formEl, idCampoDia(i));
      if (campoTitulo) { dia.titulo = campoTitulo.value; }
      dia.ejercicios.forEach(function (ej, j) {
        ['nombre', 'series', 'repeticiones', 'descanso', 'notas'].forEach(function (campo) {
          var el = buscarHijoPorId(formEl, idCampoEjercicio(i, j, campo));
          if (el) { ej[campo] = el.value; }
        });
      });
    });
  }

  function limpiarInvalidos(formEl) {
    ['nombre', 'series', 'repeticiones', 'descanso'].forEach(function (campo) {
      borradorDias.forEach(function (dia, i) {
        dia.ejercicios.forEach(function (ej, j) {
          var el = buscarHijoPorId(formEl, idCampoEjercicio(i, j, campo));
          if (el) { el.removeAttribute('aria-invalid'); }
        });
      });
    });
  }

  // -----------------------------------------------------------------------
  // Montaje de la vista completa: lectura (R-05) + editor solo real (R-06).
  // Una sola función `render()` reconstruye TODO desde cero en cada llamada
  // (montaje inicial, herzon:modo-cambiado y tras un guardado exitoso) --
  // así el editor SIEMPRE arranca con un borrador fiel a HERZON_DATA.rutina
  // recién guardado/remontado (R-06.4).
  // -----------------------------------------------------------------------
  function montarVistaRutina(rootEl) {
    var doc = rootEl.ownerDocument;

    function render() {
      limpiar(rootEl);
      var HERZON_DATA = G.HERZON_DATA;
      var Almacen = obtenerAlmacen();
      var enModoReal = esModoReal(Almacen);
      var rutina = HERZON_DATA && HERZON_DATA.rutina;
      var dias = (rutina && Array.isArray(rutina.dias)) ? rutina.dias : [];

      var contenedorDocumento = (typeof doc.getElementById === 'function') ? doc.getElementById('documento-rutina') : null;

      // --- R-05.1: fila de herramientas (imprimir / descargar) ---
      var toolbar = crear(doc, 'div', ['hz-doc-herramientas']);
      var botonImprimir = crear(doc, 'button', ['hz-doc-btn'], TEXTO_BOTON_IMPRIMIR_RUTINA);
      botonImprimir.setAttribute('type', 'button');
      botonImprimir.setAttribute('id', 'hz-btn-imprimir-rutina');
      var botonDescargar = crear(doc, 'button', ['hz-doc-btn'], TEXTO_BOTON_DESCARGAR_RUTINA);
      botonDescargar.setAttribute('type', 'button');
      botonDescargar.setAttribute('id', 'hz-btn-descargar-rutina');
      var sinRutinaReal = enModoReal && !rutina;
      if (sinRutinaReal) {
        [botonImprimir, botonDescargar].forEach(function (b) {
          b.setAttribute('disabled', 'disabled');
          b.setAttribute('aria-disabled', 'true');
        });
      }
      toolbar.appendChild(botonImprimir);
      toolbar.appendChild(botonDescargar);
      rootEl.appendChild(toolbar);

      botonImprimir.addEventListener('click', function () {
        if (!G.HERZON_DATA || !G.HERZON_DATA.rutina || !contenedorDocumento) { return; }
        var payload = datosDocumentoRutina(G.HERZON_DATA);
        renderDocumentoRutina(doc, contenedorDocumento, payload);
        doc.body.setAttribute('data-imprimir', 'rutina');
        if (typeof G.print === 'function') { G.print(); }
        doc.body.removeAttribute('data-imprimir');
        if (typeof G.addEventListener === 'function') {
          var limpiarAfterPrint = function () {
            doc.body.removeAttribute('data-imprimir');
            if (typeof G.removeEventListener === 'function') { G.removeEventListener('afterprint', limpiarAfterPrint); }
          };
          G.addEventListener('afterprint', limpiarAfterPrint);
        }
      });

      botonDescargar.addEventListener('click', function () {
        if (!G.HERZON_DATA || !G.HERZON_DATA.rutina) { return; }
        var Docs = G.Herzon && G.Herzon.Docs;
        if (!Docs || typeof Docs.descargarArchivo !== 'function' || typeof Docs.nombreArchivoExportable !== 'function') { return; }
        var payload = datosDocumentoRutina(G.HERZON_DATA);
        var html = generarHtmlRutinaDescargable(payload);
        var nombre = Docs.nombreArchivoExportable('rutina', payload.fechaGeneracion, 'html');
        Docs.descargarArchivo(doc, html, nombre, 'text/html');
      });

      // --- R-05.2: card con el ÚNICO hz-hero de la vista ---
      var gridHero = crear(doc, 'div', ['hz-grid']);
      rootEl.appendChild(gridHero);
      var cardHero = crearCard(doc, gridHero, TITULO_CARD_LECTURA);
      var hero = crearHero(doc, cardHero, LABEL_HERO_RUTINA);
      hero.num.textContent = dias.length ? String(dias.length) : '—';
      if (rutina && rutina.actualizado) {
        cardHero.appendChild(crear(doc, 'p', ['hz-nota'], 'Actualizada: ' + rutina.actualizado));
      }
      if (!enModoReal) {
        cardHero.appendChild(crear(doc, 'p', ['hz-nota'], TEXTO_DEMO_RUTINA));
      }

      // --- R-05.3/R-05.4: grid de días por lectura, o estado vacío real ---
      if (dias.length) {
        var gridDias = crear(doc, 'div', ['hz-grid', 'hz-grid-pares']);
        rootEl.appendChild(gridDias);
        dias.forEach(function (dia) {
          var cardDia = crearCard(doc, gridDias, tituloDia(dia));
          var lista = crear(doc, 'div', ['hz-rutina-lista']);
          dia.ejercicios.forEach(function (ej) {
            var item = crear(doc, 'div', ['hz-rutina-item']);
            item.appendChild(crear(doc, 'span', ['hz-rutina-nombre'], ej.nombre));
            item.appendChild(crear(doc, 'span', ['hz-rutina-dosis'], ej.series + ' x ' + ej.repeticiones));
            if (ej.descanso_s != null) {
              item.appendChild(crear(doc, 'span', ['hz-rutina-descanso'], 'descanso ' + ej.descanso_s + ' s'));
            }
            if (ej.notas) {
              item.appendChild(crear(doc, 'span', ['hz-rutina-nota'], ej.notas));
            }
            lista.appendChild(item);
          });
          cardDia.appendChild(lista);
        });
      } else if (enModoReal) {
        rootEl.appendChild(crear(doc, 'p', ['hz-vacio'], TEXTO_VACIO_RUTINA));
      }

      rootEl.setAttribute('data-rutina-dias', String(dias.length));

      // --- R-06: editor, SOLO en modo real (C-1: consume F-01/F-02 tal
      // cual; la cláusula de fallback de la propuesta cruda queda ANULADA) ---
      if (enModoReal) {
        montarEditorRutina(doc, rootEl, Almacen, HERZON_DATA, render);
      }
    }

    render();
    refsMontajeRutina = { render: render };
  }

  // -----------------------------------------------------------------------
  // R-06: editor de rutina completo. Recibe `render` (la función de
  // remontaje completo de arriba) para poder re-disparar TODA la vista tras
  // un guardado exitoso (la lectura y el editor deben reflejar el nuevo
  // HERZON_DATA.rutina, R-06.3).
  // -----------------------------------------------------------------------
  function montarEditorRutina(doc, rootEl, Almacen, HERZON_DATA, render) {
    borradorDias = reconstruirBorrador(HERZON_DATA && HERZON_DATA.rutina);

    var card = crear(doc, 'div', ['hz-card', 'hz-form-card']);
    card.setAttribute('id', 'hz-rutina-editor');
    card.appendChild(crear(doc, 'h3', ['hz-card-title'], TITULO_EDITOR));

    var form = crear(doc, 'form', ['hz-form', 'hz-form-columnas']);
    var contenedorDias = crear(doc, 'div', ['hz-form-ancho']);
    form.appendChild(contenedorDias);

    var botonAgregarDia = crear(doc, 'button', ['hz-btn', 'hz-btn-secundario'], TEXTO_BOTON_AGREGAR_DIA);
    botonAgregarDia.setAttribute('type', 'button');
    botonAgregarDia.setAttribute('id', 'hz-btn-agregar-dia');
    form.appendChild(botonAgregarDia);

    var acciones = crear(doc, 'div', ['hz-form-acciones', 'hz-form-ancho']);
    var botonGuardar = crear(doc, 'button', ['hz-btn', 'hz-btn-primario'], TEXTO_BOTON_GUARDAR_RUTINA);
    botonGuardar.setAttribute('type', 'submit');
    botonGuardar.setAttribute('id', 'hz-btn-guardar-rutina');
    acciones.appendChild(botonGuardar);
    form.appendChild(acciones);

    var errorEl = crear(doc, 'p', ['hz-form-error', 'hz-form-ancho']);
    errorEl.setAttribute('id', 'hz-rutina-error');
    form.appendChild(errorEl);

    var estadoEl = crear(doc, 'p', ['hz-nota', 'hz-form-ancho']);
    estadoEl.setAttribute('id', 'hz-rutina-estado');
    // C-9 (patrón mensajeExitoPerfil de build/vista_metricas.js F-04.5):
    // consumo único -- si un guardado exitoso dejó un mensaje pendiente, se
    // pinta aquí una sola vez y se limpia la variable de módulo.
    if (mensajeExitoRutina) {
      estadoEl.textContent = mensajeExitoRutina;
      estadoEl.style.color = 'var(--delta-good)';
      mensajeExitoRutina = '';
    }
    form.appendChild(estadoEl);

    function actualizarBotonAgregarDia() {
      if (borradorDias.length >= MAX_DIAS) {
        botonAgregarDia.setAttribute('disabled', 'disabled');
        botonAgregarDia.setAttribute('aria-disabled', 'true');
      } else {
        botonAgregarDia.removeAttribute('disabled');
        botonAgregarDia.removeAttribute('aria-disabled');
      }
    }

    function construirCamposEjercicio(subGrid, ej, i, j) {
      crearCampoInput(doc, subGrid, idCampoEjercicio(i, j, 'nombre'), LABEL_EJERCICIO, 'text', ej.nombre, { maxlength: 80 });
      crearCampoInput(doc, subGrid, idCampoEjercicio(i, j, 'series'), LABEL_SERIES, 'number', ej.series, { min: 1, max: 10 });
      crearCampoInput(doc, subGrid, idCampoEjercicio(i, j, 'repeticiones'), LABEL_REPETICIONES, 'text', ej.repeticiones, { maxlength: 40 });
      crearCampoInput(doc, subGrid, idCampoEjercicio(i, j, 'descanso'), LABEL_DESCANSO, 'number', ej.descanso, { min: 0, max: 600 });
      crearCampoInput(doc, subGrid, idCampoEjercicio(i, j, 'notas'), LABEL_NOTAS, 'text', ej.notas, { maxlength: 120 });

      var botonQuitarEj = crear(doc, 'button', ['hz-btn', 'hz-btn-peligro', 'hz-form-ancho'], TEXTO_BOTON_QUITAR);
      botonQuitarEj.setAttribute('type', 'button');
      botonQuitarEj.addEventListener('click', function () {
        sincronizarDesdeDOM(form);
        var dia = borradorDias[i];
        if (!dia) { return; }
        var idxEj = dia.ejercicios.indexOf(ej);
        if (idxEj !== -1) { dia.ejercicios.splice(idxEj, 1); }
        // R-06.4: quitar el último ejercicio de un día elimina el día del
        // borrador (reversible mientras no se guarde).
        if (!dia.ejercicios.length) {
          var idxDia = borradorDias.indexOf(dia);
          if (idxDia !== -1) { borradorDias.splice(idxDia, 1); }
        }
        repintarCampos();
      });
      subGrid.appendChild(botonQuitarEj);
    }

    function construirFieldsetDia(dia, i) {
      var fieldset = crear(doc, 'fieldset', ['hz-form-ancho']);
      fieldset.appendChild(crear(doc, 'legend', null, 'Día ' + (i + 1)));

      crearCampoInput(doc, fieldset, idCampoDia(i), LABEL_TITULO_DIA, 'text', dia.titulo, { maxlength: 60 });

      var subGrid = crear(doc, 'div', ['hz-form-sub']);
      dia.ejercicios.forEach(function (ej, j) { construirCamposEjercicio(subGrid, ej, i, j); });
      fieldset.appendChild(subGrid);

      var botonAgregarEj = crear(doc, 'button', ['hz-btn', 'hz-btn-secundario'], TEXTO_BOTON_AGREGAR_EJERCICIO);
      botonAgregarEj.setAttribute('type', 'button');
      if (dia.ejercicios.length >= MAX_EJERCICIOS_POR_DIA) {
        botonAgregarEj.setAttribute('disabled', 'disabled');
        botonAgregarEj.setAttribute('aria-disabled', 'true');
      }
      botonAgregarEj.addEventListener('click', function () {
        sincronizarDesdeDOM(form);
        if (dia.ejercicios.length >= MAX_EJERCICIOS_POR_DIA) { return; }
        dia.ejercicios.push(ejercicioVacio());
        repintarCampos();
      });
      fieldset.appendChild(botonAgregarEj);

      var botonQuitarDia = crear(doc, 'button', ['hz-btn', 'hz-btn-peligro'], TEXTO_BOTON_QUITAR_DIA);
      botonQuitarDia.setAttribute('type', 'button');
      botonQuitarDia.addEventListener('click', function () {
        sincronizarDesdeDOM(form);
        var idx = borradorDias.indexOf(dia);
        if (idx !== -1) { borradorDias.splice(idx, 1); }
        repintarCampos();
      });
      fieldset.appendChild(botonQuitarDia);

      return fieldset;
    }

    function repintarCampos() {
      limpiar(contenedorDias);
      borradorDias.forEach(function (dia, i) { contenedorDias.appendChild(construirFieldsetDia(dia, i)); });
      actualizarBotonAgregarDia();
    }

    botonAgregarDia.addEventListener('click', function () {
      sincronizarDesdeDOM(form);
      if (borradorDias.length >= MAX_DIAS) { return; }
      borradorDias.push(diaVacio());
      repintarCampos();
    });

    form.addEventListener('submit', function (ev) {
      if (ev && typeof ev.preventDefault === 'function') { ev.preventDefault(); }
      sincronizarDesdeDOM(form);
      limpiarInvalidos(form);
      errorEl.textContent = '';
      estadoEl.textContent = '';

      var resultado = validarBorrador(borradorDias);
      if (!resultado.valido) {
        resultado.invalidos.forEach(function (inv) {
          var el = buscarHijoPorId(form, idCampoEjercicio(inv.d, inv.e, inv.campo));
          if (el) { el.setAttribute('aria-invalid', 'true'); }
        });
        errorEl.textContent = 'Revisa: ' + resultado.errores.join(', ') + '. No se guardó la rutina.';
        return;
      }

      var diasPayload = borradorDias.map(function (dia) {
        return {
          titulo: dia.titulo,
          ejercicios: dia.ejercicios.map(function (ej) {
            var descansoTexto = String(ej.descanso == null ? '' : ej.descanso).trim();
            return {
              nombre: ej.nombre,
              series: parseInt(ej.series, 10),
              repeticiones: ej.repeticiones,
              descanso_s: (descansoTexto === '') ? null : parseInt(descansoTexto, 10),
              notas: ej.notas
            };
          })
        };
      });
      var totalEjercicios = diasPayload.reduce(function (acc, d) { return acc + d.ejercicios.length; }, 0);

      if (!Almacen || typeof Almacen.guardarRutina !== 'function') {
        errorEl.textContent = MSG_GUARDADO_FALLIDO;
        return;
      }
      var ok = Almacen.guardarRutina({ dias: diasPayload, actualizado: formatoFechaHoy(new Date()) });
      if (!ok) {
        errorEl.textContent = MSG_GUARDADO_FALLIDO;
        return;
      }
      mensajeExitoRutina = 'Rutina guardada en este dispositivo — ' + diasPayload.length + ' día(s), ' + totalEjercicios + ' ejercicio(s).';
      render();
    });

    repintarCampos();
    card.appendChild(form);
    rootEl.appendChild(card);
  }

  // -----------------------------------------------------------------------
  // R-05.6: reactividad multi-cliente. Views se monta UNA sola vez
  // (Herzon.registerView, plan.md 3.C); este listener a nivel de módulo es
  // el único mecanismo de repintado ante herzon:modo-cambiado (demo<->real y
  // cliente<->cliente). Patrón COPIADO de build/vista_dieta_supl.js
  // (manejarRemontajeDatos); ese archivo no se toca en R10 (C-7).
  // -----------------------------------------------------------------------
  function manejarRemontajeDatos() {
    if (refsMontajeRutina) { refsMontajeRutina.render(); }
  }
  if (typeof G.addEventListener === 'function') {
    G.addEventListener('herzon:modo-cambiado', manejarRemontajeDatos);
  }

  // -----------------------------------------------------------------------
  // Registro (R-08.1): namespace propio Herzon.Views.rutina (plan.md 3.B);
  // funciones puras expuestas para prueba en Herzon.Views.rutinaInterno.
  // -----------------------------------------------------------------------
  G.Herzon.Views.rutina = montarVistaRutina;
  G.Herzon.Views.rutinaInterno = {
    renderDocumentoRutina: renderDocumentoRutina,
    generarHtmlRutinaDescargable: generarHtmlRutinaDescargable,
    validarBorrador: validarBorrador
  };

  G.Herzon.registerView('rutina', montarVistaRutina);
})();
