// build/documentos.js
// U-DOCUMENTOS (T-023, refinado en T-030/R6): Herzon.Docs — documento
// imprimible del plan, descargas locales (.html/.csv via Blob) e
// importación de mediciones por CSV. Ver .harness/plan.md Adendum R5
// puntos 3 y 4, y Adendum R6 punto 3 (forma real de Herzon.planActivo()).
//
// Consume window.HERZON_DATA (T-001, forma congelada en plan.md 3.I) y
// Herzon.planActivo() (T-004/vista_dieta_supl.js): la forma REAL que
// documenta la cabecera de ese módulo ES el contrato (Adendum R6 punto 3)
// — { plan, kcalObjetivo, escalaPorciones, macros:{proteina_g,
// carbohidrato_g,grasa_g} }, sin `necesidades` ni `ajustes` — con fallback
// íntegro al plan por defecto si la función no existe, lanza, o no trae
// `.plan`. No conoce ni modifica build/data.js, build/vista_dieta_supl.js
// ni build/shell.html: los ids que consulta (#documento-plan,
// #doc-herramientas y sus botones, #hz-doc-input-importar) ya existen como
// marcado estático puesto por T-021 (build/shell.html); este módulo SOLO
// los cablea, nunca los define.
//
// Preámbulo obligatorio (plan.md 3.A): script clásico, IIFE, sin
// import/export. Prohibido tocar `document` en el nivel superior del
// módulo: toda manipulación real del DOM vive dentro de `init()` y las
// funciones que llama (mismo patrón que build/vista_dieta_supl.js). La
// única excepción es el auto-inicio de abajo, que solo LEE la propiedad
// `G.document` (nunca el identificador suelto `document`) para decidir SI
// difiere a `DOMContentLoaded`; bajo el selfcheck de node
// (`globalThis.window = globalThis`, sin `document` real) esa propiedad es
// `undefined`, el bloque no se ejecuta y el módulo se carga sin lanzar,
// igual que el resto de los módulos de esta interfaz.
//
// Cero red: solo Blob/data URIs y FileReader (legítimos por ser locales,
// plan.md Adendum R5 punto 3 y criterio de aceptación T-023). Cero
// inyección cruda de marcado: todo texto entra al DOM vivo con
// textContent, incluidos los mensajes de validación del CSV importado
// (dato NO confiable).
(function () {
  var G = (typeof window !== 'undefined') ? window : globalThis;
  G.Herzon = G.Herzon || {};
  G.Herzon.Docs = G.Herzon.Docs || {};

  // -----------------------------------------------------------------------
  // Utilidades locales de DOM (sin document en el nivel superior: reciben
  // siempre `doc`, igual que build/vista_dieta_supl.js y build/charts.js).
  // -----------------------------------------------------------------------
  function crearHTML(doc, tag) {
    return doc.createElement(tag);
  }

  function limpiar(el) {
    el.textContent = '';
  }

  function crearSeccion(doc, contenedorEl, tituloTexto) {
    var seccion = crearHTML(doc, 'div');
    seccion.classList.add('hz-doc-seccion');
    var titulo = crearHTML(doc, 'h3');
    titulo.classList.add('hz-doc-seccion-titulo');
    titulo.textContent = tituloTexto;
    seccion.appendChild(titulo);
    contenedorEl.appendChild(seccion);
    return seccion;
  }

  function construirTabla(doc, contenedorEl, columnas, filas) {
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
        var celda = crearHTML(doc, i === 0 ? 'th' : 'td');
        if (i === 0) { celda.setAttribute('scope', 'row'); }
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

  var NOMBRES_MOMENTO = {
    desayuno: 'Desayuno',
    colacion_manana: 'Colación matutina',
    comida: 'Comida',
    colacion_tarde: 'Colación vespertina',
    cena: 'Cena'
  };

  // -----------------------------------------------------------------------
  // Fechas (mismo patrón UTC que build/data.js: sin dependencia de zona
  // horaria local del navegador donde se abra el prototipo).
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
  // PR-05 (R9, decisión C6): nombres de exportables por modo + slug de
  // cliente. `slugCliente(nombre)`: minúsculas, sin acentos (normalización
  // NFD + descarte de marcas diacríticas), espacios y símbolos a guiones,
  // solo `[a-z0-9-]`, sin guiones sobrantes al inicio/fin. Ej.:
  // "María José" -> "maria-jose".
  // -----------------------------------------------------------------------
  function slugCliente(nombre) {
    if (typeof nombre !== 'string') { return ''; }
    var normalizado = nombre.normalize ? nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : nombre;
    return normalizado
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // Lectura defensiva del Almacén (PR-05): `G.Herzon.Almacen && Almacen.modo()`.
  // Sin Almacén disponible, o con Almacén en modo no-real, se trata como
  // demo (el nombre de archivo nunca debe insinuar que es un cliente real
  // cuando no hay forma fiable de saberlo).
  function almacenDisponible() {
    var Almacen = G.Herzon && G.Herzon.Almacen;
    return (Almacen && typeof Almacen.modo === 'function') ? Almacen : null;
  }

  function enModoReal() {
    var Almacen = almacenDisponible();
    return !!(Almacen && Almacen.modo() === 'real');
  }

  // nombreArchivoExportable(base, fecha, extension): 'rinde-<slug>-<base>-
  // <fecha>.<extension>' en real (fallback 'rinde-<base>-<fecha>.<extension>'
  // sin nombre de cliente disponible), 'rinde-demo-<base>-<fecha>.<extension>'
  // en demo/sin Almacén.
  function nombreArchivoExportable(base, fecha, extension) {
    if (!enModoReal()) {
      return 'rinde-demo-' + base + '-' + fecha + '.' + extension;
    }
    var Almacen = almacenDisponible();
    var activo = (Almacen && typeof Almacen.clienteActivo === 'function') ? Almacen.clienteActivo() : null;
    var slug = (activo && activo.nombre) ? slugCliente(activo.nombre) : '';
    var prefijo = slug ? ('rinde-' + slug + '-') : 'rinde-';
    return prefijo + base + '-' + fecha + '.' + extension;
  }

  // -----------------------------------------------------------------------
  // Herzon.planActivo() — Adendum R5 punto 4 + Adendum R6 punto 3: "la forma
  // REAL documentada en la cabecera de vista_dieta_supl.js ES el contrato".
  // Esa forma es { plan, kcalObjetivo, escalaPorciones, macros:{proteina_g,
  // carbohidrato_g,grasa_g} } — NO trae `necesidades` ni `ajustes` (ese era
  // el bug prod-3: este módulo esperaba claves que planActivo() jamás
  // devolvió, así que kcal objetivo/macros/escala nunca llegaban al
  // documento). Consumo DEFENSIVO: si la función no existe, no es function,
  // o lanza, o no trae `.plan`, cae al plan por defecto (primer plan del
  // catálogo) con kcalObjetivo/escalaPorciones/macros en null (esa sección
  // del documento simplemente se omite).
  // -----------------------------------------------------------------------
  function obtenerPlanActivo(HERZON_DATA) {
    if (typeof G.Herzon.planActivo === 'function') {
      try {
        var resultado = G.Herzon.planActivo();
        if (resultado && resultado.plan) {
          return {
            plan: resultado.plan,
            kcalObjetivo: (resultado.kcalObjetivo === null || resultado.kcalObjetivo === undefined) ? null : resultado.kcalObjetivo,
            escalaPorciones: (resultado.escalaPorciones === null || resultado.escalaPorciones === undefined) ? null : resultado.escalaPorciones,
            macros: resultado.macros || null
          };
        }
      } catch (e) {
        // Fallback abajo: una excepción de planActivo() no debe tumbar el
        // documento (defensivo, plan.md Adendum R5 punto 4).
      }
    }
    return { plan: HERZON_DATA.planes[0], kcalObjetivo: null, escalaPorciones: null, macros: null };
  }

  function datosDocumento(HERZON_DATA, opciones) {
    opciones = opciones || {};
    var activo = obtenerPlanActivo(HERZON_DATA);
    var fechaGeneracion = opciones.fechaGeneracion || formatoFechaHoy(opciones.ahora || new Date());
    return {
      paciente: HERZON_DATA.paciente,
      plan: activo.plan,
      kcalObjetivo: activo.kcalObjetivo,
      escalaPorciones: activo.escalaPorciones,
      macros: activo.macros,
      suplementos: HERZON_DATA.suplementos,
      fechaGeneracion: fechaGeneracion,
      notaDatos: HERZON_DATA.meta.nota
    };
  }

  // -----------------------------------------------------------------------
  // Render del documento vivo (#documento-plan, oculto en pantalla y
  // visible SOLO en @media print — CSS de build/shell.html, T-021). Clases
  // usadas: TODAS ya congeladas (hz-doc-*: plan.md Adendum R5 punto 5;
  // hz-table/hz-table-wrap: plan.md 3.G). Cero clases nuevas.
  // -----------------------------------------------------------------------
  function renderDocumento(doc, contenedorEl, payload) {
    limpiar(contenedorEl);

    var titulo = crearHTML(doc, 'h2');
    titulo.classList.add('hz-doc-titulo');
    titulo.textContent = 'Documento del plan de nutrición — Rinde';
    contenedorEl.appendChild(titulo);

    var meta = crearHTML(doc, 'div');
    meta.classList.add('hz-doc-meta');
    [
      'Paciente: ' + payload.paciente.nombre,
      'Objetivo: ' + payload.paciente.objetivo,
      'Plan: ' + payload.plan.nombre,
      'Generado: ' + payload.fechaGeneracion
    ].forEach(function (texto) {
      var span = crearHTML(doc, 'span');
      span.textContent = texto;
      meta.appendChild(span);
    });
    contenedorEl.appendChild(meta);

    if (payload.kcalObjetivo != null || payload.escalaPorciones != null || payload.macros) {
      var seccionNecesidades = crearSeccion(doc, contenedorEl, 'Plan aplicado');
      var lineas = [];
      if (payload.kcalObjetivo != null) { lineas.push('Calorías objetivo aplicadas: ' + payload.kcalObjetivo + ' kcal/día.'); }
      if (payload.escalaPorciones != null) { lineas.push('Escala de porciones: ' + payload.escalaPorciones + '×.'); }
      if (payload.macros) {
        lineas.push(
          'Macronutrientes objetivo: proteína ' + payload.macros.proteina_g +
          ' g, carbohidrato ' + payload.macros.carbohidrato_g + ' g, grasa ' + payload.macros.grasa_g + ' g.'
        );
      }
      for (var li = 0; li < lineas.length; li++) {
        var p = crearHTML(doc, 'p');
        p.textContent = lineas[li];
        seccionNecesidades.appendChild(p);
      }
    }

    var seccionMenu = crearSeccion(doc, contenedorEl, 'Menú semanal completo');
    for (var d = 0; d < payload.plan.dias.length; d++) {
      var dia = payload.plan.dias[d];
      var tituloDia = crearHTML(doc, 'p');
      tituloDia.textContent = 'Día ' + dia.dia + ' — total ' + dia.totales.kcal + ' kcal';
      seccionMenu.appendChild(tituloDia);
      var filasDia = dia.comidas.map(function (comida) {
        return [
          NOMBRES_MOMENTO[comida.momento] || comida.momento,
          comida.hora,
          comida.nombre,
          comida.kcal + ' kcal'
        ];
      });
      construirTabla(doc, seccionMenu, ['Momento', 'Hora', 'Platillo', 'Calorías'], filasDia);
    }

    var seccionSuplementos = crearSeccion(doc, contenedorEl, 'Suplementos');
    var filasSuplementos = payload.suplementos.map(function (s) {
      return [s.nombre, s.dosis, s.horario, s.proposito];
    });
    construirTabla(doc, seccionSuplementos, ['Suplemento', 'Dosis', 'Horario', 'Propósito'], filasSuplementos);

    var pie = crearHTML(doc, 'p');
    pie.classList.add('hz-doc-pie');
    pie.textContent = payload.notaDatos;
    contenedorEl.appendChild(pie);

    return contenedorEl;
  }

  // -----------------------------------------------------------------------
  // Descarga .html autocontenida (Blob local). Documento SEPARADO del
  // prototipo (no se inyecta en prototype/index.html, se guarda en disco
  // del usuario): por eso trae su propio <style> mínimo — no es un módulo
  // escribiendo un <style> en el shell vivo (plan.md 3.G se refiere a ESE
  // shell). Los hexes usados aquí son literales VALIDADOS del modo claro
  // del contrato (.harness/design-contract-herzon.md sección 2:
  // --text-primary #0b0b0b, --text-secondary #52514e, --axis #c3c2b7,
  // --grid #e1e0d9), mismo precedente que el bloque @media print de T-021
  // (build/shell.html, comentario "5o bloque legítimo de tokens"): un
  // documento fuera del árbol vivo no tiene acceso a var(--token).
  // -----------------------------------------------------------------------
  function escaparHtml(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function generarHtmlDescargable(payload) {
    var partes = [];
    partes.push('<!DOCTYPE html>');
    partes.push('<html lang="es">');
    partes.push('<head>');
    partes.push('<meta charset="utf-8">');
    partes.push('<title>Documento del plan — Rinde</title>');
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
    partes.push('<h1>' + escaparHtml('Documento del plan de nutrición — Rinde') + '</h1>');
    partes.push(
      '<p>' + [
        'Paciente: ' + escaparHtml(payload.paciente.nombre),
        'Objetivo: ' + escaparHtml(payload.paciente.objetivo),
        'Plan: ' + escaparHtml(payload.plan.nombre),
        'Generado: ' + escaparHtml(payload.fechaGeneracion)
      ].join(' &middot; ') + '</p>'
    );

    if (payload.kcalObjetivo != null || payload.escalaPorciones != null || payload.macros) {
      partes.push('<h2>Plan aplicado</h2>');
      var lineas = [];
      if (payload.kcalObjetivo != null) { lineas.push('Calorías objetivo: ' + payload.kcalObjetivo + ' kcal/día'); }
      if (payload.escalaPorciones != null) { lineas.push('Escala de porciones: ' + payload.escalaPorciones + '×'); }
      if (payload.macros) {
        lineas.push(
          'Macronutrientes: proteína ' + payload.macros.proteina_g + ' g, carbohidrato ' +
          payload.macros.carbohidrato_g + ' g, grasa ' + payload.macros.grasa_g + ' g'
        );
      }
      partes.push('<p>' + escaparHtml(lineas.join(' · ')) + '</p>');
    }

    partes.push('<h2>Menú semanal completo</h2>');
    for (var d = 0; d < payload.plan.dias.length; d++) {
      var dia = payload.plan.dias[d];
      partes.push('<h3>' + escaparHtml('Día ' + dia.dia) + '</h3>');
      partes.push('<table><thead><tr><th>Momento</th><th>Hora</th><th>Platillo</th><th>Calorías</th></tr></thead><tbody>');
      for (var m = 0; m < dia.comidas.length; m++) {
        var comida = dia.comidas[m];
        partes.push(
          '<tr><td>' + escaparHtml(NOMBRES_MOMENTO[comida.momento] || comida.momento) +
          '</td><td>' + escaparHtml(comida.hora) +
          '</td><td>' + escaparHtml(comida.nombre) +
          '</td><td>' + escaparHtml(comida.kcal + ' kcal') + '</td></tr>'
        );
      }
      partes.push('</tbody></table>');
    }

    partes.push('<h2>Suplementos</h2>');
    partes.push('<table><thead><tr><th>Suplemento</th><th>Dosis</th><th>Horario</th><th>Propósito</th></tr></thead><tbody>');
    for (var s = 0; s < payload.suplementos.length; s++) {
      var sup = payload.suplementos[s];
      partes.push(
        '<tr><td>' + escaparHtml(sup.nombre) + '</td><td>' + escaparHtml(sup.dosis) +
        '</td><td>' + escaparHtml(sup.horario) + '</td><td>' + escaparHtml(sup.proposito) + '</td></tr>'
      );
    }
    partes.push('</tbody></table>');

    partes.push('<p class="hz-doc-pie">' + escaparHtml(payload.notaDatos) + '</p>');
    partes.push('</body>');
    partes.push('</html>');
    return partes.join('\n');
  }

  // -----------------------------------------------------------------------
  // Descarga .csv de series (plan.md Adendum R5 punto 3). Columnas
  // simétricas con las que acepta el importador (ver COLUMNAS_MEDICIONES),
  // más adherenciaDieta_pct al final (informativa, no se re-importa).
  // -----------------------------------------------------------------------
  function escaparCsv(valor) {
    var texto = valor === null || valor === undefined ? '' : String(valor);
    if (/[",\n]/.test(texto)) {
      return '"' + texto.replace(/"/g, '""') + '"';
    }
    return texto;
  }

  function generarCsvDatos(HERZON_DATA) {
    var series = HERZON_DATA.series;
    var columnas = ['semana', 'fecha', 'peso_kg', 'grasa_pct', 'musculo_kg', 'cintura_cm', 'adherenciaDieta_pct'];
    var lineas = [columnas.join(',')];
    for (var i = 0; i < series.semanas.length; i++) {
      lineas.push([
        series.semanas[i],
        series.fechas[i],
        series.peso_kg[i],
        series.grasa_pct[i],
        series.musculo_kg[i],
        series.cintura_cm[i],
        series.adherenciaDieta_pct[i]
      ].map(escaparCsv).join(','));
    }
    return lineas.join('\n') + '\n';
  }

  // -----------------------------------------------------------------------
  // Plantilla CSV descargable ("formato documentado con plantilla CSV
  // descargable", criterio de aceptación T-023): mismas columnas que exige
  // el parser, con una fila de ejemplo válida (se auto-verifica en el
  // selfcheck: la plantilla debe parsear sin errores).
  // -----------------------------------------------------------------------
  var COLUMNAS_MEDICIONES = ['semana', 'fecha', 'peso_kg', 'grasa_pct', 'musculo_kg', 'cintura_cm'];

  function generarPlantillaCsv() {
    var encabezado = COLUMNAS_MEDICIONES.join(',');
    var filaEjemplo = ['13', '2026-06-01', '68.4', '27.1', '24.8', '84.2'].join(',');
    return encabezado + '\n' + filaEjemplo + '\n';
  }

  // -----------------------------------------------------------------------
  // Parser CSV de mediciones importadas — TOLERANTE: nunca lanza, siempre
  // devuelve { filasValidas, errores, encabezadoValido, totalFilas }. El
  // CSV importado es dato NO CONFIABLE (Adendum R5 punto 3): todo mensaje
  // de error se arma como texto plano en español y se pinta después solo
  // con textContent (jamás inyección cruda de marcado), sin importar qué
  // caracteres traiga.
  // -----------------------------------------------------------------------
  var LIMITES_FISIOLOGICOS = {
    peso_kg: { min: 20, max: 300 },
    grasa_pct: { min: 3, max: 70 },
    musculo_kg: { min: 5, max: 150 },
    cintura_cm: { min: 40, max: 250 }
  };

  function normalizarLineas(texto) {
    return String(texto || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  }

  // Parser CSV mínimo: separa por comas respetando campos entre comillas
  // dobles (con comillas escapadas como ""); suficiente para el formato
  // tabular simple de este import (sin celdas multilínea).
  function parsearLineaCsv(linea) {
    var campos = [];
    var actual = '';
    var dentroComillas = false;
    for (var i = 0; i < linea.length; i++) {
      var c = linea.charAt(i);
      if (dentroComillas) {
        if (c === '"') {
          if (linea.charAt(i + 1) === '"') { actual += '"'; i++; }
          else { dentroComillas = false; }
        } else {
          actual += c;
        }
      } else if (c === '"') {
        dentroComillas = true;
      } else if (c === ',') {
        campos.push(actual);
        actual = '';
      } else {
        actual += c;
      }
    }
    campos.push(actual);
    return campos.map(function (v) { return v.trim(); });
  }

  function fechaValida(texto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) { return false; }
    var partes = texto.split('-');
    var anio = parseInt(partes[0], 10);
    var mes = parseInt(partes[1], 10);
    var dia = parseInt(partes[2], 10);
    if (mes < 1 || mes > 12) { return false; }
    var d = new Date(Date.UTC(anio, mes - 1, dia));
    return d.getUTCFullYear() === anio && (d.getUTCMonth() + 1) === mes && d.getUTCDate() === dia;
  }

  function numeroValido(texto) {
    return /^-?\d+(\.\d+)?$/.test(texto);
  }

  function parseCsvMediciones(texto, opciones) {
    opciones = opciones || {};
    var errores = [];
    var filasValidas = [];

    if (!texto || !String(texto).trim()) {
      errores.push({ fila: 0, mensaje: 'el archivo está vacío: no se encontraron datos' });
      return { filasValidas: filasValidas, errores: errores, encabezadoValido: false, totalFilas: 0 };
    }

    var lineas = normalizarLineas(texto).filter(function (l) { return l.trim() !== ''; });
    if (!lineas.length) {
      errores.push({ fila: 0, mensaje: 'el archivo está vacío: no se encontraron datos' });
      return { filasValidas: filasValidas, errores: errores, encabezadoValido: false, totalFilas: 0 };
    }

    var encabezado = parsearLineaCsv(lineas[0]).map(function (v) { return v.toLowerCase(); });
    var encabezadoValido = encabezado.length === COLUMNAS_MEDICIONES.length &&
      COLUMNAS_MEDICIONES.every(function (col, idx) { return encabezado[idx] === col; });

    if (!encabezadoValido) {
      errores.push({
        fila: 1,
        mensaje: 'encabezado inválido: se esperaban las columnas ' + COLUMNAS_MEDICIONES.join(', ') +
          ' (se encontró: "' + lineas[0] + '")'
      });
      return { filasValidas: filasValidas, errores: errores, encabezadoValido: false, totalFilas: lineas.length - 1 };
    }

    for (var f = 1; f < lineas.length; f++) {
      var numeroFila = f + 1; // número de línea humano (1 = encabezado)
      var campos = parsearLineaCsv(lineas[f]);
      if (campos.length !== COLUMNAS_MEDICIONES.length) {
        errores.push({
          fila: numeroFila,
          mensaje: 'fila ' + numeroFila + ': número de columnas inválido (se esperaban ' +
            COLUMNAS_MEDICIONES.length + ', se encontraron ' + campos.length + ')'
        });
        continue;
      }

      var crudo = {};
      for (var ci = 0; ci < COLUMNAS_MEDICIONES.length; ci++) { crudo[COLUMNAS_MEDICIONES[ci]] = campos[ci]; }

      var erroresFila = [];

      if (!/^\d+$/.test(crudo.semana) || parseInt(crudo.semana, 10) < 1) {
        erroresFila.push('"semana" inválida (número entero >= 1 esperado, se recibió "' + crudo.semana + '")');
      }

      if (!fechaValida(crudo.fecha)) {
        erroresFila.push('"fecha" inválida (formato AAAA-MM-DD esperado, se recibió "' + crudo.fecha + '")');
      } else if (opciones.fechaMinima && crudo.fecha < opciones.fechaMinima) {
        erroresFila.push('"fecha" fuera de rango (anterior a ' + opciones.fechaMinima + ')');
      } else if (opciones.fechaMaxima && crudo.fecha > opciones.fechaMaxima) {
        erroresFila.push('"fecha" fuera de rango (posterior a ' + opciones.fechaMaxima + ')');
      }

      ['peso_kg', 'grasa_pct', 'musculo_kg', 'cintura_cm'].forEach(function (campo) {
        var valorTexto = crudo[campo];
        if (!numeroValido(valorTexto)) {
          erroresFila.push('"' + campo + '" inválido (número esperado, se recibió "' + valorTexto + '")');
          return;
        }
        var valorNum = parseFloat(valorTexto);
        var limites = LIMITES_FISIOLOGICOS[campo];
        if (valorNum < limites.min || valorNum > limites.max) {
          erroresFila.push(
            '"' + campo + '" fuera de rango fisiológico plausible (' + limites.min + '-' + limites.max +
            ', se recibió ' + valorNum + ')'
          );
        }
      });

      if (erroresFila.length) {
        errores.push({ fila: numeroFila, mensaje: 'fila ' + numeroFila + ': ' + erroresFila.join('; ') });
        continue;
      }

      filasValidas.push({
        semana: parseInt(crudo.semana, 10),
        fecha: crudo.fecha,
        peso_kg: parseFloat(crudo.peso_kg),
        grasa_pct: parseFloat(crudo.grasa_pct),
        musculo_kg: parseFloat(crudo.musculo_kg),
        cintura_cm: parseFloat(crudo.cintura_cm)
      });
    }

    return { filasValidas: filasValidas, errores: errores, encabezadoValido: true, totalFilas: lineas.length - 1 };
  }

  // -----------------------------------------------------------------------
  // Merge EN MEMORIA (nunca persiste — plan.md Adendum R5 punto 3 y
  // criterio de aceptación T-023): actualiza semanas existentes, agrega
  // semanas nuevas y reordena cronológicamente. adherenciaDieta_pct no
  // viene en el CSV: en filas nuevas se arrastra el último valor conocido
  // como marcador sintético, documentado aquí, para no romper el largo
  // paralelo de arreglos que consumen las demás vistas (plan.md 3.I).
  // -----------------------------------------------------------------------
  function mergeMediciones(HERZON_DATA, filasValidas) {
    var series = HERZON_DATA.series;
    var agregadas = 0;
    var actualizadas = 0;
    var ultimaAdherencia = series.adherenciaDieta_pct.length ?
      series.adherenciaDieta_pct[series.adherenciaDieta_pct.length - 1] : 0;

    for (var i = 0; i < filasValidas.length; i++) {
      var fila = filasValidas[i];
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

    var orden = series.semanas.map(function (_valor, indice) { return indice; });
    orden.sort(function (a, b) { return series.semanas[a] - series.semanas[b]; });
    ['semanas', 'fechas', 'peso_kg', 'grasa_pct', 'musculo_kg', 'cintura_cm', 'adherenciaDieta_pct'].forEach(function (clave) {
      series[clave] = orden.map(function (indice) { return series[clave][indice]; });
    });

    return { agregadas: agregadas, actualizadas: actualizadas };
  }

  function rangoFechasDesdeInicio(HERZON_DATA) {
    var inicio = HERZON_DATA && HERZON_DATA.paciente && HERZON_DATA.paciente.inicio;
    if (!inicio) { return {}; }
    var fechaInicio = new Date(inicio + 'T00:00:00Z');
    var fechaMinima = new Date(fechaInicio.getTime() - 7 * 86400000);
    var fechaMaxima = new Date(fechaInicio.getTime() + 52 * 7 * 86400000);
    return { fechaMinima: formatoFechaHoy(fechaMinima), fechaMaxima: formatoFechaHoy(fechaMaxima) };
  }

  // -----------------------------------------------------------------------
  // Descarga genérica vía Blob local (cero red): crea el enlace temporal,
  // dispara la descarga y libera el object URL. `enlace.click()` es la vía
  // real de navegador; `enlace.despachar('click')` es el equivalente que
  // expone build/testdom.js para que el selfcheck ejercite la misma
  // función sin navegador.
  // -----------------------------------------------------------------------
  function descargarArchivo(doc, contenido, nombreArchivo, tipoMime) {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return false;
    }
    var blob = new Blob([contenido], { type: tipoMime });
    var url = URL.createObjectURL(blob);
    var enlace = doc.createElement('a');
    enlace.setAttribute('href', url);
    enlace.setAttribute('download', nombreArchivo);
    if (typeof enlace.click === 'function') {
      enlace.click();
    } else if (typeof enlace.despachar === 'function') {
      enlace.despachar('click');
    }
    if (typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
    return true;
  }

  // -----------------------------------------------------------------------
  // FileReader (legítimo por ser local — plan.md Adendum R5 punto 3):
  // aislado en una función propia para que el selfcheck pueda probar todo
  // el resto del flujo con un stub mínimo, sin depender de un navegador.
  // -----------------------------------------------------------------------
  function leerArchivoComoTexto(archivo, callback) {
    if (typeof FileReader === 'undefined') {
      callback(null, 'este navegador no soporta FileReader');
      return;
    }
    var lector = new FileReader();
    lector.onerror = function () { callback(null, 'error de lectura del archivo'); };
    lector.onload = function () { callback(String(lector.result || ''), null); };
    lector.readAsText(archivo);
  }

  function mostrarEstadoImportacion(elEstado, mensaje, esError) {
    if (!elEstado) { return; }
    elEstado.textContent = mensaje;
    if (esError) { elEstado.classList.add('hz-delta-bad'); } else { elEstado.classList.remove('hz-delta-bad'); }
  }

  // -----------------------------------------------------------------------
  // PR-07 (R9, decisión C8): textos EXACTOS por modo. Jamás prometer
  // guardado que no ocurre: solo el texto 'real' afirma persistencia, y
  // solo se usa cuando la importación de verdad enrutó por
  // Herzon.Almacen.mergeMediciones (contextoImportacion() === 'real').
  // -----------------------------------------------------------------------
  var TEXTO_IMPORT_GUARDADO_REAL = 'Guardado en este dispositivo.';
  var TEXTO_IMPORT_DEMO = 'En modo demo los datos importados no se guardan: se pierden al recargar la página.';
  var TEXTO_IMPORT_SIN_ALMACEN = 'Estos datos importados NO se guardan: se pierden al recargar la página.';
  var TEXTO_FORMATO_REAL = 'Los datos importados se guardan en este dispositivo.';
  var TEXTO_FORMATO_DEMO = TEXTO_IMPORT_DEMO;
  var TEXTO_FORMATO_SIN_ALMACEN = 'Los datos importados no se guardan: se pierden al recargar la página.';

  // contextoImportacion(): 'real' | 'demo' | 'sin-almacen'. Lectura
  // defensiva y EN VIVO (nunca cacheada): el modo puede cambiar dentro de
  // la misma carga de página vía el selector de cliente o el botón de modo
  // (Adendum R9 punto 3). 'sin-almacen' cubre tanto la ausencia de
  // Herzon.Almacen como una versión sin mergeMediciones -- la advertencia
  // honesta de no-persistencia de siempre.
  function contextoImportacion() {
    var Almacen = G.Herzon && G.Herzon.Almacen;
    if (!Almacen || typeof Almacen.modo !== 'function' || typeof Almacen.mergeMediciones !== 'function') {
      return 'sin-almacen';
    }
    return Almacen.modo() === 'real' ? 'real' : 'demo';
  }

  function construirMensajeImportacion(resultado, resumenMerge, contexto) {
    var partes = [];
    if (resumenMerge.agregadas || resumenMerge.actualizadas) {
      var base = 'Importación completa: ' + resumenMerge.agregadas + ' semana(s) nueva(s), ' +
        resumenMerge.actualizadas + ' actualizada(s).';
      partes.push(contexto === 'real' ? (base + ' ' + TEXTO_IMPORT_GUARDADO_REAL) : base);
    }
    if (resultado.errores.length) {
      var primeras = resultado.errores.slice(0, 3).map(function (e) { return e.mensaje; }).join(' | ');
      partes.push(
        resultado.errores.length + ' fila(s) con error, no se importaron: ' + primeras +
        (resultado.errores.length > 3 ? ' (y más)' : '')
      );
    }
    if (!partes.length) { partes.push('El archivo no contenía filas válidas para importar.'); }
    if (contexto === 'demo') {
      partes.push(TEXTO_IMPORT_DEMO);
    } else if (contexto === 'sin-almacen') {
      partes.push(TEXTO_IMPORT_SIN_ALMACEN);
    }
    return partes.join(' ');
  }

  function dispararEventoMediciones(resumenMerge, totalErrores) {
    if (typeof G.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') { return false; }
    var evento = new CustomEvent('herzon:mediciones-importadas', {
      detail: {
        agregadas: resumenMerge.agregadas,
        actualizadas: resumenMerge.actualizadas,
        errores: totalErrores
      }
    });
    G.dispatchEvent(evento);
    return true;
  }

  // Orquesta el pipeline completo (texto crudo -> parseo -> merge -> aviso
  // -> re-render -> evento), separado de FileReader para que sea testeable
  // de forma directa desde el selfcheck. PR-07 (R9, decisión C8): en modo
  // real enruta el merge por Herzon.Almacen.mergeMediciones (valida y
  // PERSISTE sobre clientes[activoId]); ese camino ya dispara
  // herzon:mediciones-importadas por su cuenta (Adendum R8 punto 1), así
  // que este módulo NO lo vuelve a disparar para no duplicarlo. En
  // demo/sin Almacén, el merge sigue siendo SOLO EN MEMORIA (Adendum R5
  // punto 3), con el evento propio de siempre.
  function procesarImportacionCsv(HERZON_DATA, texto, elEstado, actualizarDocumentoCb) {
    var opcionesRango = rangoFechasDesdeInicio(HERZON_DATA);
    var resultado = parseCsvMediciones(texto, opcionesRango);
    var contexto = contextoImportacion();
    var resumenMerge = { agregadas: 0, actualizadas: 0 };
    var eventoDisparado = false;
    if (resultado.filasValidas.length) {
      if (contexto === 'real') {
        var resAlmacen = G.Herzon.Almacen.mergeMediciones(resultado.filasValidas);
        resumenMerge = { agregadas: resAlmacen.agregadas || 0, actualizadas: resAlmacen.actualizadas || 0 };
        eventoDisparado = !!(resumenMerge.agregadas || resumenMerge.actualizadas);
      } else {
        resumenMerge = mergeMediciones(HERZON_DATA, resultado.filasValidas);
        eventoDisparado = dispararEventoMediciones(resumenMerge, resultado.errores.length);
      }
    }
    var mensaje = construirMensajeImportacion(resultado, resumenMerge, contexto);
    var esErrorTotal = resultado.filasValidas.length === 0 && resultado.errores.length > 0;
    mostrarEstadoImportacion(elEstado, mensaje, esErrorTotal);

    if (resultado.filasValidas.length && typeof actualizarDocumentoCb === 'function') {
      actualizarDocumentoCb();
    }
    return { resultado: resultado, resumenMerge: resumenMerge, eventoDisparado: eventoDisparado };
  }

  // -----------------------------------------------------------------------
  // Cableado real (init): TODO acceso al DOM vive aquí adentro, invocado
  // por el auto-inicio de más abajo (navegador real) o directamente por el
  // selfcheck con un `doc` de prueba (mismo patrón que `montarVistaPlan`
  // de build/vista_dieta_supl.js).
  // -----------------------------------------------------------------------
  function init(doc) {
    doc = doc || G.document;
    if (!doc || typeof doc.getElementById !== 'function') { return null; }
    var HERZON_DATA = G.HERZON_DATA;
    if (!HERZON_DATA) { return null; }

    var contenedorDocumento = doc.getElementById('documento-plan');
    var botonImprimir = doc.getElementById('hz-doc-btn-imprimir');
    var botonDescargarPlan = doc.getElementById('hz-doc-btn-descargar-plan');
    var botonDescargarDatos = doc.getElementById('hz-doc-btn-descargar-datos');
    var inputImportar = doc.getElementById('hz-doc-input-importar');
    var toolbar = doc.getElementById('doc-herramientas');

    if (!contenedorDocumento || !botonImprimir || !botonDescargarPlan || !botonDescargarDatos || !inputImportar) {
      return null;
    }

    function actualizarDocumento() {
      var payload = datosDocumento(HERZON_DATA);
      renderDocumento(doc, contenedorDocumento, payload);
      return payload;
    }

    actualizarDocumento();

    botonImprimir.addEventListener('click', function () {
      actualizarDocumento();
      if (typeof G.print === 'function') { G.print(); }
    });

    botonDescargarPlan.addEventListener('click', function () {
      var payload = actualizarDocumento();
      var html = generarHtmlDescargable(payload);
      descargarArchivo(doc, html, nombreArchivoExportable('plan', payload.fechaGeneracion, 'html'), 'text/html');
    });

    botonDescargarDatos.addEventListener('click', function () {
      var csv = generarCsvDatos(HERZON_DATA);
      descargarArchivo(doc, csv, nombreArchivoExportable('datos', formatoFechaHoy(new Date()), 'csv'), 'text/csv');
    });

    var elEstado = null;
    if (toolbar) {
      // Botón de plantilla + nota de formato + nota de estado: clases YA
      // congeladas (hz-doc-btn, hz-nota, hz-delta-bad — plan.md 3.G y
      // Adendum R5 punto 5), como hijos adicionales de la fila flex
      // #doc-herramientas. prod-5 (Adendum R6): la línea que documenta el
      // formato CSV vive en un <p class="hz-nota"> FIJO, propio, que nadie
      // vuelve a tocar; el estado de cada importación (éxito/error) vive en
      // OTRO <p class="hz-nota"> separado (#hz-doc-estado-importar), así
      // mostrarEstadoImportacion() nunca pisa la línea de formato.
      var botonPlantilla = crearHTML(doc, 'button');
      botonPlantilla.setAttribute('type', 'button');
      botonPlantilla.setAttribute('id', 'hz-doc-btn-plantilla-csv');
      botonPlantilla.classList.add('hz-doc-btn');
      botonPlantilla.textContent = 'Plantilla CSV de mediciones';
      toolbar.appendChild(botonPlantilla);
      botonPlantilla.addEventListener('click', function () {
        // Plantilla neutra (igual en ambos modos, decisión C6/PR-05): nunca
        // lleva prefijo demo ni slug de cliente.
        descargarArchivo(doc, generarPlantillaCsv(), 'rinde-plantilla-mediciones.csv', 'text/csv');
      });

      var elFormatoCsv = crearHTML(doc, 'p');
      elFormatoCsv.classList.add('hz-nota');
      elFormatoCsv.setAttribute('id', 'hz-doc-formato-csv');
      // actualizarNotaFormatoCsv(): relee contextoImportacion() EN VIVO y
      // reescribe el nodo -- nunca cachea el modo al montar. Necesario
      // porque el modo puede cambiar dentro de la misma carga de página
      // (selector de cliente o botón "Usar mis datos"/"Ver demo") sin
      // volver a llamar init(); jamás debe quedar prometiendo un guardado
      // que ya no aplica (PR-07, Adendum R9 punto 3 -- mismo patrón que
      // el listener herzon:modo-cambiado de vista_metricas.js/vista_dieta_supl.js).
      function actualizarNotaFormatoCsv() {
        var contextoFormato = contextoImportacion();
        var textoPersistenciaFormato = (contextoFormato === 'real') ? TEXTO_FORMATO_REAL :
          (contextoFormato === 'demo') ? TEXTO_FORMATO_DEMO : TEXTO_FORMATO_SIN_ALMACEN;
        elFormatoCsv.textContent =
          'Formato esperado del CSV: ' + COLUMNAS_MEDICIONES.join(', ') +
          ' (fecha en AAAA-MM-DD). ' + textoPersistenciaFormato;
      }
      actualizarNotaFormatoCsv();
      toolbar.appendChild(elFormatoCsv);
      if (typeof G.addEventListener === 'function') {
        G.addEventListener('herzon:modo-cambiado', function () { actualizarNotaFormatoCsv(); });
      }

      elEstado = crearHTML(doc, 'p');
      elEstado.classList.add('hz-nota');
      elEstado.setAttribute('id', 'hz-doc-estado-importar');
      toolbar.appendChild(elEstado);
    }

    inputImportar.addEventListener('change', function (evento) {
      var archivos = evento && evento.target && evento.target.files;
      var archivo = archivos && archivos[0];
      if (!archivo) { return; }
      leerArchivoComoTexto(archivo, function (texto, errorLectura) {
        // prod-5 (Adendum R6): resetear el input tras CADA importación
        // (éxito o error) para permitir reintentar el mismo archivo — el
        // navegador no dispara "change" dos veces seguidas para el mismo
        // archivo si el <input> conserva su valor anterior.
        if (errorLectura) {
          mostrarEstadoImportacion(elEstado, 'No se pudo leer el archivo: ' + errorLectura, true);
          inputImportar.value = '';
          return;
        }
        procesarImportacionCsv(HERZON_DATA, texto, elEstado, actualizarDocumento);
        inputImportar.value = '';
      });
    });

    return { actualizarDocumento: actualizarDocumento };
  }

  G.Herzon.Docs = {
    datosDocumento: datosDocumento,
    renderDocumento: renderDocumento,
    generarHtmlDescargable: generarHtmlDescargable,
    generarCsvDatos: generarCsvDatos,
    generarPlantillaCsv: generarPlantillaCsv,
    parseCsvMediciones: parseCsvMediciones,
    mergeMediciones: mergeMediciones,
    descargarArchivo: descargarArchivo,
    procesarImportacionCsv: procesarImportacionCsv,
    // Aditivas R9 (PR-05/PR-07): expuestas para que el selfcheck las
    // ejercite de forma directa además del flujo de UI completo.
    slugCliente: slugCliente,
    nombreArchivoExportable: nombreArchivoExportable,
    contextoImportacion: contextoImportacion,
    init: init
  };

  // Auto-inicio en navegador real (Adendum R5: los botones y #documento-
  // plan ya están en el marcado estático de build/shell.html, no hace
  // falta que ningún otro módulo llame Herzon.Docs.init() explícitamente).
  // `G.document` es SIEMPRE undefined bajo el selfcheck de node (que solo
  // define `globalThis.window = globalThis`), así que este bloque nunca se
  // ejecuta ahí. En el navegador, el script de este módulo corre a mitad
  // del <body> (antes de que el propio #documento-plan, último nodo del
  // documento, exista): por eso siempre se difiere a `DOMContentLoaded`
  // mientras el documento sigue en `readyState === 'loading'`, sin
  // importar en qué punto del ensamble quede inyectado este módulo.
  if (G.document && typeof G.document.getElementById === 'function') {
    if (G.document.readyState === 'loading' && typeof G.document.addEventListener === 'function') {
      G.document.addEventListener('DOMContentLoaded', function () { init(); });
    } else {
      init();
    }
  }
})();
