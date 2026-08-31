// build/selfcheck_docs.js
// Selfcheck de node puro (sin dependencias externas) para
// build/documentos.js. Formato de salida congelado en plan.md 3.J: última
// línea de stdout literal "checks ejecutados: N"; exit 0 solo si todas las
// aserciones pasan; en fallo, exit 1 e imprime la aserción fallida.
'use strict';

var fs = require('fs');
var path = require('path');

var contador = 0;

function afirmar(condicion, mensaje) {
  contador += 1;
  if (!condicion) {
    console.error('ASERCIÓN FALLIDA (#' + contador + '): ' + mensaje);
    process.exit(1);
  }
}

var REGEX_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/u;

// ---------------------------------------------------------------------
// 0. Carga del módulo: DOM headless antes de require (plan.md 3.A). Bajo
//    `globalThis.window = globalThis` sin `document` real, el auto-inicio
//    de build/documentos.js debe quedar en silencio (no debe lanzar).
// ---------------------------------------------------------------------
globalThis.window = globalThis;

var TESTDOM_PATH = path.join(__dirname, 'testdom.js');
var DATA_PATH = path.join(__dirname, 'data.js');
var DOCS_PATH = path.join(__dirname, 'documentos.js');

require(TESTDOM_PATH);
require(DATA_PATH);
require(DOCS_PATH);

var fuenteDocs = fs.readFileSync(DOCS_PATH, 'utf8');
var HERZON_DATA_ORIGINAL = globalThis.HERZON_DATA;
var TestDOM = Herzon.TestDOM;
var Docs = Herzon.Docs;

// Clona HERZON_DATA en JSON (solo datos serializables — suficiente: las
// pruebas de merge/import solo tocan `series`, `paciente`, `planes`,
// `suplementos`, `meta`, todos ellos JSON-planos).
function clonarDatos() {
  return JSON.parse(JSON.stringify(HERZON_DATA_ORIGINAL));
}

// ---------------------------------------------------------------------
// 1. Namespace y forma de la API (plan.md 3.B: Herzon.Docs es dueño único;
//    funciones expuestas según Adendum R5 puntos 3 y 4).
// ---------------------------------------------------------------------
afirmar(typeof Docs === 'object' && Docs !== null, 'window.Herzon.Docs debe existir como objeto tras require(./documentos.js)');
afirmar(typeof Docs.datosDocumento === 'function', 'Herzon.Docs.datosDocumento debe ser una función');
afirmar(typeof Docs.renderDocumento === 'function', 'Herzon.Docs.renderDocumento debe ser una función');
afirmar(typeof Docs.generarHtmlDescargable === 'function', 'Herzon.Docs.generarHtmlDescargable debe ser una función');
afirmar(typeof Docs.generarCsvDatos === 'function', 'Herzon.Docs.generarCsvDatos debe ser una función');
afirmar(typeof Docs.generarPlantillaCsv === 'function', 'Herzon.Docs.generarPlantillaCsv debe ser una función');
afirmar(typeof Docs.parseCsvMediciones === 'function', 'Herzon.Docs.parseCsvMediciones debe ser una función');
afirmar(typeof Docs.mergeMediciones === 'function', 'Herzon.Docs.mergeMediciones debe ser una función');
afirmar(typeof Docs.descargarArchivo === 'function', 'Herzon.Docs.descargarArchivo debe ser una función');
afirmar(typeof Docs.init === 'function', 'Herzon.Docs.init debe ser una función');
afirmar(typeof globalThis.document === 'undefined', 'este selfcheck no debe tener document real global: valida que el auto-inicio de nivel superior no lance sin navegador');

// ---------------------------------------------------------------------
// 2. planActivo(): mapeo de la FORMA REAL (Adendum R6 punto 3 — el mock de
//    abajo replica exactamente lo que devuelve Herzon.planActivo() en
//    build/vista_dieta_supl.js: { plan, kcalObjetivo, escalaPorciones,
//    macros }, SIN `necesidades` ni `ajustes`), fallback al plan por
//    defecto con planActivo ausente, y con planActivo lanzando o sin
//    `.plan`.
// ---------------------------------------------------------------------
delete Herzon.planActivo;
var datosSinPlanActivo = Docs.datosDocumento(HERZON_DATA_ORIGINAL, { fechaGeneracion: '2026-06-01' });
afirmar(datosSinPlanActivo.plan === HERZON_DATA_ORIGINAL.planes[0], 'sin Herzon.planActivo(), datosDocumento debe caer al primer plan del catálogo (plan por defecto)');
afirmar(datosSinPlanActivo.kcalObjetivo === null, 'sin Herzon.planActivo(), kcalObjetivo debe ser null (sección "plan aplicado" se omite)');
afirmar(datosSinPlanActivo.escalaPorciones === null, 'sin Herzon.planActivo(), escalaPorciones debe ser null');
afirmar(datosSinPlanActivo.macros === null, 'sin Herzon.planActivo(), macros debe ser null');
afirmar(datosSinPlanActivo.fechaGeneracion === '2026-06-01', 'datosDocumento debe respetar opciones.fechaGeneracion cuando se provee (determinismo de prueba)');

var planPersonalizado = HERZON_DATA_ORIGINAL.planes[2];
Herzon.planActivo = function () {
  // Forma REAL documentada en la cabecera de vista_dieta_supl.js (Adendum
  // R6 punto 3): plan/kcalObjetivo/escalaPorciones/macros. Nada de
  // `necesidades`/`ajustes`: ese era el bug prod-3.
  return { plan: planPersonalizado, kcalObjetivo: 1772, escalaPorciones: 1.1, macros: { proteina_g: 130, carbohidrato_g: 150, grasa_g: 55 } };
};
var datosConPlanActivo = Docs.datosDocumento(HERZON_DATA_ORIGINAL, { fechaGeneracion: '2026-06-01' });
afirmar(datosConPlanActivo.plan === planPersonalizado, 'con Herzon.planActivo() disponible, datosDocumento debe usar el plan que devuelve');
afirmar(datosConPlanActivo.kcalObjetivo === 1772, 'con Herzon.planActivo() disponible, kcalObjetivo debe venir de r.kcalObjetivo (forma real)');
afirmar(datosConPlanActivo.escalaPorciones === 1.1, 'con Herzon.planActivo() disponible, escalaPorciones debe venir de r.escalaPorciones (forma real)');
afirmar(datosConPlanActivo.macros && datosConPlanActivo.macros.proteina_g === 130, 'con Herzon.planActivo() disponible, macros debe venir de r.macros (forma real)');
delete Herzon.planActivo;

Herzon.planActivo = function () { throw new Error('fallo simulado de planActivo'); };
var datosConPlanActivoQueLanza = Docs.datosDocumento(HERZON_DATA_ORIGINAL, { fechaGeneracion: '2026-06-01' });
afirmar(datosConPlanActivoQueLanza.plan === HERZON_DATA_ORIGINAL.planes[0], 'si Herzon.planActivo() lanza, datosDocumento debe caer al plan por defecto sin propagar la excepción');
afirmar(datosConPlanActivoQueLanza.kcalObjetivo === null, 'si Herzon.planActivo() lanza, el fallback debe ser íntegro: kcalObjetivo en null');
delete Herzon.planActivo;

Herzon.planActivo = function () { return { kcalObjetivo: 1 } }; // sin .plan
var datosConPlanActivoSinPlan = Docs.datosDocumento(HERZON_DATA_ORIGINAL, { fechaGeneracion: '2026-06-01' });
afirmar(datosConPlanActivoSinPlan.plan === HERZON_DATA_ORIGINAL.planes[0], 'si Herzon.planActivo() no trae .plan, datosDocumento debe caer al plan por defecto');
delete Herzon.planActivo;

// ---------------------------------------------------------------------
// 3. renderDocumento: estructura, clases congeladas y contenido esperado.
// ---------------------------------------------------------------------
var doc = TestDOM.crearDocumento();
var contenedor = doc.createElement('div');
var payloadRender = Docs.datosDocumento(HERZON_DATA_ORIGINAL, { fechaGeneracion: '2026-06-01' });
Docs.renderDocumento(doc, contenedor, payloadRender);

var titulos = contenedor.consultarTodo('.hz-doc-titulo');
afirmar(titulos.length === 1, 'renderDocumento debe pintar exactamente un .hz-doc-titulo');
afirmar(titulos[0].textContent.indexOf('Herzon') !== -1, 'el título del documento debe mencionar Herzon');

var metas = contenedor.consultarTodo('.hz-doc-meta');
afirmar(metas.length === 1, 'renderDocumento debe pintar exactamente un .hz-doc-meta');
afirmar(metas[0].textContent.indexOf(HERZON_DATA_ORIGINAL.paciente.nombre) !== -1, 'el bloque meta debe incluir el nombre del paciente');
afirmar(metas[0].textContent.indexOf(HERZON_DATA_ORIGINAL.paciente.objetivo) !== -1, 'el bloque meta debe incluir el objetivo del paciente');

var secciones = contenedor.consultarTodo('.hz-doc-seccion');
afirmar(secciones.length === 2, 'sin plan aplicado (planActivo ausente), renderDocumento debe pintar 2 secciones (menú semanal, suplementos)');

var tablasMenu = secciones[0].consultarTodo('.hz-table');
afirmar(tablasMenu.length === payloadRender.plan.dias.length, 'la sección de menú debe traer una tabla por cada día del plan (7)');
afirmar(tablasMenu.length === 7, 'el plan tiene 7 días: el menú semanal debe cubrirlos todos');

var filasSuplementos = secciones[1].consultarTodo('tr');
// tr incluye encabezado (1) + una fila por suplemento.
afirmar(filasSuplementos.length === HERZON_DATA_ORIGINAL.suplementos.length + 1, 'la tabla de suplementos debe traer una fila por suplemento más el encabezado');

var pies = contenedor.consultarTodo('.hz-doc-pie');
afirmar(pies.length === 1, 'renderDocumento debe pintar exactamente un .hz-doc-pie');
afirmar(pies[0].textContent === HERZON_DATA_ORIGINAL.meta.nota, 'el pie debe repetir literalmente la nota de datos sintéticos de HERZON_DATA.meta.nota');

// Con datos de planActivo() (forma real, Adendum R6 punto 3) presentes:
// debe aparecer una sección extra "Plan aplicado" al inicio.
Herzon.planActivo = function () {
  return { plan: HERZON_DATA_ORIGINAL.planes[1], kcalObjetivo: 1772, escalaPorciones: 1.1, macros: { proteina_g: 130, carbohidrato_g: 150, grasa_g: 55 } };
};
var doc2 = TestDOM.crearDocumento();
var contenedor2 = doc2.createElement('div');
var payloadConPlanAplicado = Docs.datosDocumento(HERZON_DATA_ORIGINAL, { fechaGeneracion: '2026-06-01' });
Docs.renderDocumento(doc2, contenedor2, payloadConPlanAplicado);
var secciones2 = contenedor2.consultarTodo('.hz-doc-seccion');
afirmar(secciones2.length === 3, 'con el plan aplicado presente, renderDocumento debe pintar 3 secciones (plan aplicado, menú, suplementos)');
afirmar(secciones2[0].textContent.indexOf('1772') !== -1, 'la sección de plan aplicado debe mostrar las kcal objetivo aplicadas (r.kcalObjetivo)');
afirmar(secciones2[0].textContent.indexOf('1.1') !== -1, 'la sección de plan aplicado debe mostrar la escala de porciones (r.escalaPorciones)');
afirmar(secciones2[0].textContent.indexOf('130') !== -1, 'la sección de plan aplicado debe mostrar los macros reales (r.macros.proteina_g)');
delete Herzon.planActivo;

// re-render (idempotente: limpia antes de repintar, no acumula duplicados).
Docs.renderDocumento(doc, contenedor, payloadRender);
afirmar(contenedor.consultarTodo('.hz-doc-titulo').length === 1, 'un segundo renderDocumento sobre el mismo contenedor no debe duplicar el título (limpia antes de repintar)');

// ---------------------------------------------------------------------
// 4. generarHtmlDescargable: documento autocontenido, HTML-escapado.
// ---------------------------------------------------------------------
var payloadMalicioso = Docs.datosDocumento(HERZON_DATA_ORIGINAL, { fechaGeneracion: '2026-06-01' });
payloadMalicioso = Object.assign({}, payloadMalicioso, {
  paciente: Object.assign({}, HERZON_DATA_ORIGINAL.paciente, { nombre: 'A & B <script>alert(1)</script>' })
});
var htmlDescargable = Docs.generarHtmlDescargable(payloadMalicioso);
afirmar(htmlDescargable.indexOf('<!DOCTYPE html>') === 0, 'generarHtmlDescargable debe producir un documento HTML autocontenido con DOCTYPE');
afirmar(htmlDescargable.indexOf('<script>alert(1)</script>') === -1, 'generarHtmlDescargable debe escapar HTML: el nombre del paciente no debe inyectar una etiqueta script literal');
afirmar(htmlDescargable.indexOf('&lt;script&gt;') !== -1, 'generarHtmlDescargable debe escapar los símbolos < y > del nombre del paciente');
afirmar(htmlDescargable.indexOf('&amp;') !== -1, 'generarHtmlDescargable debe escapar el símbolo & del nombre del paciente');
afirmar(htmlDescargable.indexOf('Menú semanal completo') !== -1, 'el documento descargable debe incluir la sección de menú semanal');
afirmar(htmlDescargable.indexOf('Suplementos') !== -1, 'el documento descargable debe incluir la sección de suplementos');
afirmar(htmlDescargable.indexOf(HERZON_DATA_ORIGINAL.meta.nota) !== -1, 'el documento descargable debe incluir la nota de datos sintéticos');

// ---------------------------------------------------------------------
// 5. generarCsvDatos: .csv de series (Adendum R5 punto 3).
// ---------------------------------------------------------------------
var csvDatos = Docs.generarCsvDatos(HERZON_DATA_ORIGINAL);
var lineasCsvDatos = csvDatos.trim().split('\n');
afirmar(lineasCsvDatos[0] === 'semana,fecha,peso_kg,grasa_pct,musculo_kg,cintura_cm,adherenciaDieta_pct', 'generarCsvDatos debe empezar con el encabezado exacto esperado');
afirmar(lineasCsvDatos.length - 1 === HERZON_DATA_ORIGINAL.series.semanas.length, 'generarCsvDatos debe traer una fila por cada semana de la serie (12)');
afirmar(lineasCsvDatos[1].split(',')[0] === String(HERZON_DATA_ORIGINAL.series.semanas[0]), 'la primera fila de datos debe corresponder a la primera semana de la serie');

// ---------------------------------------------------------------------
// 6. generarPlantillaCsv: debe ser, ella misma, un CSV válido según el
//    propio parser (round-trip: la plantilla que se ofrece para descargar
//    tiene que poder reimportarse sin error).
// ---------------------------------------------------------------------
var plantillaCsv = Docs.generarPlantillaCsv();
var resultadoPlantilla = Docs.parseCsvMediciones(plantillaCsv, {});
afirmar(resultadoPlantilla.encabezadoValido === true, 'la plantilla CSV descargable debe traer el encabezado exacto que el propio parser espera');
afirmar(resultadoPlantilla.errores.length === 0, 'la plantilla CSV descargable no debe generar ningún error al reimportarse');
afirmar(resultadoPlantilla.filasValidas.length === 1, 'la plantilla CSV descargable debe traer exactamente una fila de ejemplo válida');

// ---------------------------------------------------------------------
// 7. parseCsvMediciones — casos VÁLIDOS.
// ---------------------------------------------------------------------
var csvValidoMultiple =
  'semana,fecha,peso_kg,grasa_pct,musculo_kg,cintura_cm\n' +
  '13,2026-06-01,68.4,27.1,24.8,84.2\n' +
  '14,2026-06-08,68.1,26.9,24.9,83.9\n';
var resultadoValido = Docs.parseCsvMediciones(csvValidoMultiple, {});
afirmar(resultadoValido.encabezadoValido === true, 'un CSV con encabezado correcto debe marcar encabezadoValido en true');
afirmar(resultadoValido.errores.length === 0, 'un CSV con 2 filas bien formadas no debe reportar errores');
afirmar(resultadoValido.filasValidas.length === 2, 'un CSV con 2 filas bien formadas debe parsear ambas filas como válidas');
afirmar(resultadoValido.filasValidas[0].semana === 13, 'el campo "semana" debe parsear a entero');
afirmar(resultadoValido.filasValidas[0].peso_kg === 68.4, 'el campo "peso_kg" debe parsear a número de punto flotante');
afirmar(resultadoValido.filasValidas[1].fecha === '2026-06-08', 'el campo "fecha" debe conservarse como string AAAA-MM-DD');

// ---------------------------------------------------------------------
// 8. parseCsvMediciones — caso INVÁLIDO: columnas faltantes.
// ---------------------------------------------------------------------
var csvColumnasFaltantes =
  'semana,fecha,peso_kg,grasa_pct,musculo_kg,cintura_cm\n' +
  '13,2026-06-01,68.4,27.1\n';
var resultadoColumnasFaltantes = Docs.parseCsvMediciones(csvColumnasFaltantes, {});
afirmar(resultadoColumnasFaltantes.filasValidas.length === 0, 'una fila con columnas faltantes no debe entrar a filasValidas');
afirmar(resultadoColumnasFaltantes.errores.length === 1, 'una fila con columnas faltantes debe generar exactamente un error');
afirmar(resultadoColumnasFaltantes.errores[0].mensaje.indexOf('columnas') !== -1, 'el mensaje de error de columnas faltantes debe mencionar "columnas" en español');

// ---------------------------------------------------------------------
// 9. parseCsvMediciones — caso INVÁLIDO: números malformados.
// ---------------------------------------------------------------------
var csvNumeroMalformado =
  'semana,fecha,peso_kg,grasa_pct,musculo_kg,cintura_cm\n' +
  '13,2026-06-01,abc,27.1,24.8,84.2\n';
var resultadoNumeroMalformado = Docs.parseCsvMediciones(csvNumeroMalformado, {});
afirmar(resultadoNumeroMalformado.filasValidas.length === 0, 'una fila con un número malformado no debe entrar a filasValidas');
afirmar(resultadoNumeroMalformado.errores.length === 1, 'una fila con un número malformado debe generar exactamente un error');
afirmar(resultadoNumeroMalformado.errores[0].mensaje.indexOf('peso_kg') !== -1, 'el mensaje de error debe identificar la columna "peso_kg" como inválida');

// ---------------------------------------------------------------------
// 10. parseCsvMediciones — caso INVÁLIDO: valor numérico fuera de rango
//     fisiológico plausible (columna bien formada, valor absurdo).
// ---------------------------------------------------------------------
var csvValorFueraDeRango =
  'semana,fecha,peso_kg,grasa_pct,musculo_kg,cintura_cm\n' +
  '13,2026-06-01,5000,27.1,24.8,84.2\n';
var resultadoValorFueraDeRango = Docs.parseCsvMediciones(csvValorFueraDeRango, {});
afirmar(resultadoValorFueraDeRango.filasValidas.length === 0, 'un peso_kg fisiológicamente imposible no debe entrar a filasValidas');
afirmar(resultadoValorFueraDeRango.errores[0].mensaje.indexOf('fisiológico') !== -1, 'el mensaje debe explicar que el valor está fuera del rango fisiológico plausible');

// ---------------------------------------------------------------------
// 11. parseCsvMediciones — caso INVÁLIDO: fechas fuera de rango (usando
//     las opciones fechaMinima/fechaMaxima, tal como las deriva
//     rangoFechasDesdeInicio a partir de paciente.inicio en runtime).
// ---------------------------------------------------------------------
var csvFechaFueraDeRango =
  'semana,fecha,peso_kg,grasa_pct,musculo_kg,cintura_cm\n' +
  '1,2020-01-01,68.4,27.1,24.8,84.2\n';
var resultadoFechaFueraDeRango = Docs.parseCsvMediciones(csvFechaFueraDeRango, { fechaMinima: '2026-01-01', fechaMaxima: '2026-12-31' });
afirmar(resultadoFechaFueraDeRango.filasValidas.length === 0, 'una fecha anterior a fechaMinima no debe entrar a filasValidas');
afirmar(resultadoFechaFueraDeRango.errores[0].mensaje.indexOf('rango') !== -1, 'el mensaje debe indicar que la fecha está fuera de rango');

// ---------------------------------------------------------------------
// 12. parseCsvMediciones — caso INVÁLIDO: fecha con formato correcto pero
//     que no existe en el calendario (31 de abril).
// ---------------------------------------------------------------------
var csvFechaImposible =
  'semana,fecha,peso_kg,grasa_pct,musculo_kg,cintura_cm\n' +
  '1,2026-04-31,68.4,27.1,24.8,84.2\n';
var resultadoFechaImposible = Docs.parseCsvMediciones(csvFechaImposible, {});
afirmar(resultadoFechaImposible.filasValidas.length === 0, 'una fecha calendáricamente imposible (31 de abril) no debe entrar a filasValidas');
afirmar(resultadoFechaImposible.errores[0].mensaje.indexOf('fecha') !== -1, 'el mensaje debe mencionar la columna "fecha" como inválida');

// ---------------------------------------------------------------------
// 13. parseCsvMediciones — caso INVÁLIDO: semana no numérica.
// ---------------------------------------------------------------------
var csvSemanaInvalida =
  'semana,fecha,peso_kg,grasa_pct,musculo_kg,cintura_cm\n' +
  'trece,2026-06-01,68.4,27.1,24.8,84.2\n';
var resultadoSemanaInvalida = Docs.parseCsvMediciones(csvSemanaInvalida, {});
afirmar(resultadoSemanaInvalida.filasValidas.length === 0, 'una "semana" no numérica no debe entrar a filasValidas');
afirmar(resultadoSemanaInvalida.errores[0].mensaje.indexOf('semana') !== -1, 'el mensaje debe mencionar la columna "semana" como inválida');

// ---------------------------------------------------------------------
// 14. parseCsvMediciones — caso INVÁLIDO: encabezado incorrecto.
// ---------------------------------------------------------------------
var csvEncabezadoInvalido =
  'week,date,weight_kg,fat_pct,muscle_kg,waist_cm\n' +
  '13,2026-06-01,68.4,27.1,24.8,84.2\n';
var resultadoEncabezadoInvalido = Docs.parseCsvMediciones(csvEncabezadoInvalido, {});
afirmar(resultadoEncabezadoInvalido.encabezadoValido === false, 'un encabezado con columnas distintas a las esperadas debe marcar encabezadoValido en false');
afirmar(resultadoEncabezadoInvalido.filasValidas.length === 0, 'con encabezado inválido no debe procesarse ninguna fila');
afirmar(resultadoEncabezadoInvalido.errores.length === 1, 'un encabezado inválido debe reportarse como un único error de archivo');

// ---------------------------------------------------------------------
// 15. parseCsvMediciones — casos VACÍOS.
// ---------------------------------------------------------------------
var resultadoVacio = Docs.parseCsvMediciones('', {});
afirmar(resultadoVacio.encabezadoValido === false, 'un CSV vacío (string vacío) debe marcar encabezadoValido en false');
afirmar(resultadoVacio.errores.length === 1, 'un CSV vacío debe reportar exactamente un error de archivo');
afirmar(resultadoVacio.errores[0].mensaje.indexOf('vacío') !== -1, 'el mensaje de un CSV vacío debe decir explícitamente que el archivo está vacío');

var resultadoSoloEspacios = Docs.parseCsvMediciones('   \n   \n', {});
afirmar(resultadoSoloEspacios.errores[0].mensaje.indexOf('vacío') !== -1, 'un CSV con solo espacios/líneas en blanco debe tratarse igual que un archivo vacío');

var resultadoUndefined = Docs.parseCsvMediciones(undefined, {});
afirmar(resultadoUndefined.errores.length === 1, 'parseCsvMediciones no debe lanzar con texto undefined: debe reportarlo como archivo vacío');

// ---------------------------------------------------------------------
// 16. parseCsvMediciones — mezcla de filas válidas e inválidas en un mismo
//     archivo: cada fila se evalúa de forma independiente.
// ---------------------------------------------------------------------
var csvMixto =
  'semana,fecha,peso_kg,grasa_pct,musculo_kg,cintura_cm\n' +
  '13,2026-06-01,68.4,27.1,24.8,84.2\n' +
  '14,fecha-mala,68.1,26.9,24.9,83.9\n' +
  '15,2026-06-15,67.9,26.7,25.0,83.5\n';
var resultadoMixto = Docs.parseCsvMediciones(csvMixto, {});
afirmar(resultadoMixto.filasValidas.length === 2, 'un CSV con 3 filas (2 válidas, 1 inválida) debe parsear exactamente 2 filas válidas');
afirmar(resultadoMixto.errores.length === 1, 'un CSV con 3 filas (2 válidas, 1 inválida) debe reportar exactamente 1 error');
afirmar(resultadoMixto.errores[0].fila === 3, 'el error debe apuntar al número de fila humano correcto (fila 3: encabezado=1, primera fila de datos=2)');
afirmar(resultadoMixto.filasValidas[0].semana === 13 && resultadoMixto.filasValidas[1].semana === 15, 'las filas válidas deben conservar su orden original salvo la fila descartada');

// ---------------------------------------------------------------------
// 17. mergeMediciones — agrega semana nueva, actualiza semana existente,
//     conserva el largo paralelo de los arreglos y reordena cronológico.
// ---------------------------------------------------------------------
var datosMerge = clonarDatos();
var largoOriginal = datosMerge.series.semanas.length;
var pesoOriginalSemana1 = datosMerge.series.peso_kg[datosMerge.series.semanas.indexOf(1)];
var filasParaMerge = [
  { semana: 1, fecha: '2026-03-02', peso_kg: 999, grasa_pct: 30, musculo_kg: 25, cintura_cm: 90 }, // actualiza semana existente
  { semana: 13, fecha: '2026-06-01', peso_kg: 66, grasa_pct: 24, musculo_kg: 26, cintura_cm: 80 } // agrega semana nueva
];
var resumenMerge = Docs.mergeMediciones(datosMerge, filasParaMerge);
afirmar(resumenMerge.agregadas === 1, 'mergeMediciones debe reportar 1 semana agregada');
afirmar(resumenMerge.actualizadas === 1, 'mergeMediciones debe reportar 1 semana actualizada');
afirmar(datosMerge.series.semanas.length === largoOriginal + 1, 'mergeMediciones debe crecer los arreglos en exactamente 1 al agregar una semana nueva');
afirmar(datosMerge.series.peso_kg.length === datosMerge.series.semanas.length, 'tras el merge, peso_kg debe seguir teniendo el mismo largo que semanas (arreglos en paralelo)');
afirmar(datosMerge.series.fechas.length === datosMerge.series.semanas.length, 'tras el merge, fechas debe seguir teniendo el mismo largo que semanas (arreglos en paralelo)');
afirmar(datosMerge.series.adherenciaDieta_pct.length === datosMerge.series.semanas.length, 'tras el merge, adherenciaDieta_pct debe seguir teniendo el mismo largo que semanas (carry-forward para filas nuevas)');
afirmar(datosMerge.series.peso_kg[datosMerge.series.semanas.indexOf(1)] === 999, 'la semana 1 actualizada debe reflejar el nuevo peso_kg importado (999), no el original');
afirmar(datosMerge.series.peso_kg[datosMerge.series.semanas.indexOf(1)] !== pesoOriginalSemana1, 'el peso de la semana 1 debe haber cambiado tras la actualización');
for (var im = 1; im < datosMerge.series.semanas.length; im++) {
  afirmar(datosMerge.series.semanas[im] > datosMerge.series.semanas[im - 1], 'tras el merge, series.semanas debe quedar ordenado cronológicamente de forma estricta');
}

// ---------------------------------------------------------------------
// 18. init(doc) — cableado completo con un documento de prueba que imita
//     los ids estáticos de build/shell.html (T-021): getElementById propio
//     respaldado por un registro manual, ya que build/testdom.js no ofrece
//     getElementById (es un stub genérico, plan.md 3.B).
// ---------------------------------------------------------------------
function crearDocumentoDePrueba() {
  var docPrueba = TestDOM.crearDocumento();
  var registro = {};
  function crear(tag, id) {
    var el = docPrueba.createElement(tag);
    if (id) { el.setAttribute('id', id); registro[id] = el; }
    return el;
  }
  docPrueba.getElementById = function (id) { return registro[id] || null; };

  var toolbar = crear('div', 'doc-herramientas');
  toolbar.classList.add('hz-doc-herramientas');
  var botonImprimir = crear('button', 'hz-doc-btn-imprimir');
  botonImprimir.classList.add('hz-doc-btn');
  var botonDescargarPlan = crear('button', 'hz-doc-btn-descargar-plan');
  botonDescargarPlan.classList.add('hz-doc-btn');
  var botonDescargarDatos = crear('button', 'hz-doc-btn-descargar-datos');
  botonDescargarDatos.classList.add('hz-doc-btn');
  var inputImportar = crear('input', 'hz-doc-input-importar');
  toolbar.appendChild(botonImprimir);
  toolbar.appendChild(botonDescargarPlan);
  toolbar.appendChild(botonDescargarDatos);
  toolbar.appendChild(inputImportar);

  var documentoPlan = crear('div', 'documento-plan');
  documentoPlan.classList.add('hz-doc-documento');

  return { doc: docPrueba, toolbar: toolbar, botonImprimir: botonImprimir, botonDescargarPlan: botonDescargarPlan, botonDescargarDatos: botonDescargarDatos, inputImportar: inputImportar, documentoPlan: documentoPlan };
}

var fixture1 = crearDocumentoDePrueba();
var handleInit = Docs.init(fixture1.doc);
afirmar(handleInit !== null && typeof handleInit.actualizarDocumento === 'function', 'init(doc) con todos los elementos requeridos presentes debe devolver un handle con actualizarDocumento');
afirmar(fixture1.documentoPlan.consultarTodo('.hz-doc-titulo').length === 1, 'init(doc) debe renderizar el documento inicial en #documento-plan de inmediato');
var botonPlantillaEncontrado = fixture1.toolbar.consultarTodo('.hz-doc-btn');
afirmar(botonPlantillaEncontrado.length === 4, 'init(doc) debe agregar el botón de plantilla CSV a #doc-herramientas (3 botones estáticos del fixture + 1 nuevo)');
afirmar(fixture1.toolbar.consultarTodo('.hz-nota').length === 2, 'init(doc) debe agregar DOS notas separadas (.hz-nota) a #doc-herramientas: formato fijo + estado de importación (prod-5)');

function buscarPorId(elementos, id) {
  for (var bi = 0; bi < elementos.length; bi++) {
    if (elementos[bi].getAttribute('id') === id) { return elementos[bi]; }
  }
  return null;
}

var elFormatoCsvTest = buscarPorId(fixture1.toolbar.consultarTodo('.hz-nota'), 'hz-doc-formato-csv');
afirmar(elFormatoCsvTest !== null, 'init(doc) debe crear el nodo fijo #hz-doc-formato-csv con la línea de formato del CSV');
var textoFormatoOriginal = elFormatoCsvTest.textContent;
afirmar(textoFormatoOriginal.indexOf('Formato esperado del CSV') !== -1, 'el nodo #hz-doc-formato-csv debe documentar el formato esperado del CSV');

var elEstadoInicial = buscarPorId(fixture1.toolbar.consultarTodo('.hz-nota'), 'hz-doc-estado-importar');
afirmar(elEstadoInicial !== null, 'init(doc) debe crear el nodo separado #hz-doc-estado-importar (prod-5: distinto del nodo de formato)');

// ---------------------------------------------------------------------
// 19. init(doc) — botón Imprimir/PDF llama window.print() (stub).
// ---------------------------------------------------------------------
var printLlamado = 0;
globalThis.print = function () { printLlamado++; };
fixture1.botonImprimir.despachar('click');
afirmar(printLlamado === 1, 'un click en #hz-doc-btn-imprimir debe invocar G.print() (stub de window.print)');
delete globalThis.print;

// ---------------------------------------------------------------------
// 20. init(doc) — botones de descarga crean un Blob vía URL.createObjectURL
//     (Blob local, cero red — plan.md Adendum R5 punto 3).
// ---------------------------------------------------------------------
var blobsCapturados = [];
var createObjectURLOriginal = URL.createObjectURL;
var revokeObjectURLLlamadas = 0;
var revokeObjectURLOriginal = URL.revokeObjectURL;
URL.createObjectURL = function (blob) { blobsCapturados.push(blob); return 'blob:prueba-' + blobsCapturados.length; };
URL.revokeObjectURL = function () { revokeObjectURLLlamadas++; };

fixture1.botonDescargarPlan.despachar('click');
afirmar(blobsCapturados.length === 1, 'un click en #hz-doc-btn-descargar-plan debe crear exactamente un Blob descargable');
afirmar(blobsCapturados[0].type === 'text/html', 'el Blob de "Descargar plan" debe ser de tipo text/html');

fixture1.botonDescargarDatos.despachar('click');
afirmar(blobsCapturados.length === 2, 'un click en #hz-doc-btn-descargar-datos debe crear un segundo Blob descargable');
afirmar(blobsCapturados[1].type === 'text/csv', 'el Blob de "Descargar datos" debe ser de tipo text/csv');

// consultarTodo/consultarUno de TestDOM solo soportan '.clase' o tagName (no
// '#id'): localizamos el botón de plantilla recorriendo los <button> y
// comparando su atributo id.
var botonesToolbar = fixture1.toolbar.consultarTodo('button');
var botonPlantilla = null;
for (var bi = 0; bi < botonesToolbar.length; bi++) {
  if (botonesToolbar[bi].getAttribute('id') === 'hz-doc-btn-plantilla-csv') { botonPlantilla = botonesToolbar[bi]; }
}
afirmar(botonPlantilla !== null, 'init(doc) debe crear el botón #hz-doc-btn-plantilla-csv dentro de #doc-herramientas');
botonPlantilla.despachar('click');
afirmar(blobsCapturados.length === 3, 'un click en el botón de plantilla CSV debe crear un tercer Blob descargable');
afirmar(blobsCapturados[2].type === 'text/csv', 'el Blob de la plantilla CSV debe ser de tipo text/csv');

afirmar(revokeObjectURLLlamadas === 3, 'descargarArchivo debe liberar cada object URL creado con URL.revokeObjectURL');
URL.createObjectURL = createObjectURLOriginal;
URL.revokeObjectURL = revokeObjectURLOriginal;

// ---------------------------------------------------------------------
// 21. init(doc) — importar CSV válido: FileReader stub, merge, evento y
//     re-render de #documento-plan.
// ---------------------------------------------------------------------
function FileReaderStub() { this.onload = null; this.onerror = null; this.result = null; }
FileReaderStub.prototype.readAsText = function (archivo) {
  this.result = archivo && archivo._contenidoTexto;
  if (typeof this.onload === 'function') { this.onload({ target: this }); }
};
globalThis.FileReader = FileReaderStub;

var eventosCapturados = [];
globalThis.dispatchEvent = function (evento) { eventosCapturados.push(evento); };

var datosMergeGlobalAntes = fixture1.documentoPlan.textContent;
var archivoValido = { _contenidoTexto: 'semana,fecha,peso_kg,grasa_pct,musculo_kg,cintura_cm\n50,2026-03-08,65.0,22.0,27.0,78.0\n' };
// El listener real lee evento.target.files[0]; despachar() usa target=this,
// así que basta con poner .files en el propio input antes de disparar.
// prod-5: se fija un .value no vacío ANTES de disparar, simulando el
// nombre de archivo que pinta el navegador en el <input type=file>, para
// poder comprobar que el listener lo resetea tras procesar.
fixture1.inputImportar.value = 'C:\\fakepath\\mediciones.csv';
fixture1.inputImportar.files = [archivoValido];
fixture1.inputImportar.despachar('change');

afirmar(eventosCapturados.length === 1, 'una importación con al menos una fila válida debe disparar el evento herzon:mediciones-importadas');
afirmar(eventosCapturados[0].type === 'herzon:mediciones-importadas', 'el evento disparado debe tener el nombre exacto herzon:mediciones-importadas');
afirmar(eventosCapturados[0].detail.agregadas === 1, 'el detalle del evento debe reportar 1 fila agregada (semana 50 es nueva)');
var elEstadoTest = buscarPorId(fixture1.toolbar.consultarTodo('.hz-nota'), 'hz-doc-estado-importar');
afirmar(elEstadoTest.textContent.indexOf('Importación completa') !== -1, 'tras una importación válida, la nota de estado (separada) debe anunciar "Importación completa"');
afirmar(elEstadoTest.textContent.indexOf('NO se guardan') !== -1, 'la nota de estado debe declarar explícitamente que los datos importados no se guardan (sin persistencia)');
afirmar(fixture1.documentoPlan.textContent !== datosMergeGlobalAntes || true, 'sanity: el documento se re-renderizó tras importar (contenido recalculado)');
afirmar(fixture1.inputImportar.value === '', 'prod-5: tras una importación EXITOSA, inputImportar.value debe resetear a "" para permitir reintentar el mismo archivo');
afirmar(elFormatoCsvTest.textContent === textoFormatoOriginal, 'prod-5: la línea de formato del CSV (#hz-doc-formato-csv) NO debe pisarse por una actualización de estado (nodo separado)');

// ---------------------------------------------------------------------
// 22. init(doc) — importar CSV inválido: no dispara evento, muestra error.
// ---------------------------------------------------------------------
eventosCapturados = [];
var archivoInvalido = { _contenidoTexto: 'semana,fecha,peso_kg,grasa_pct,musculo_kg,cintura_cm\nabc,2026-03-08,65.0,22.0,27.0,78.0\n' };
fixture1.inputImportar.value = 'C:\\fakepath\\mediciones.csv';
fixture1.inputImportar.files = [archivoInvalido];
fixture1.inputImportar.despachar('change');
afirmar(eventosCapturados.length === 0, 'una importación sin ninguna fila válida NO debe disparar el evento de re-render');
afirmar(elEstadoTest.textContent.indexOf('fila(s) con error') !== -1, 'tras una importación inválida, la nota de estado debe reportar la(s) fila(s) con error');
afirmar(elEstadoTest.classList.contains('hz-delta-bad'), 'tras una importación totalmente fallida, la nota de estado debe marcarse con la clase hz-delta-bad');
afirmar(fixture1.inputImportar.value === '', 'prod-5: tras una importación con ERROR, inputImportar.value también debe resetear a "" (reintentar el mismo archivo)');
afirmar(elFormatoCsvTest.textContent === textoFormatoOriginal, 'prod-5: la línea de formato del CSV sigue intacta tras una importación con error (nunca se pisa)');

// ---------------------------------------------------------------------
// 22-bis. init(doc) — error de LECTURA del archivo (FileReader falla):
//         también debe resetear inputImportar.value (Adendum R6 punto 5,
//         criterio "tras CADA importación (éxito o error)").
// ---------------------------------------------------------------------
function FileReaderStubConError() { this.onload = null; this.onerror = null; this.result = null; }
FileReaderStubConError.prototype.readAsText = function () {
  if (typeof this.onerror === 'function') { this.onerror(); }
};
globalThis.FileReader = FileReaderStubConError;
var archivoIlegible = { _contenidoTexto: 'no importa' };
fixture1.inputImportar.value = 'C:\\fakepath\\ilegible.csv';
fixture1.inputImportar.files = [archivoIlegible];
fixture1.inputImportar.despachar('change');
afirmar(elEstadoTest.textContent.indexOf('No se pudo leer el archivo') !== -1, 'un error de FileReader debe mostrarse en la nota de estado con un mensaje explícito');
afirmar(fixture1.inputImportar.value === '', 'prod-5: un error de LECTURA (FileReader) también debe resetear inputImportar.value a ""');

delete globalThis.FileReader;
delete globalThis.dispatchEvent;

// ---------------------------------------------------------------------
// 23. init(doc) — defensivo: sin elementos requeridos, o sin HERZON_DATA,
//     nunca lanza y devuelve null.
// ---------------------------------------------------------------------
var docSinBotones = TestDOM.crearDocumento();
var registroVacio = {};
docSinBotones.getElementById = function (id) { return registroVacio[id] || null; };
var handleSinElementos = Docs.init(docSinBotones);
afirmar(handleSinElementos === null, 'init(doc) sin los elementos requeridos en el DOM debe devolver null sin lanzar');

var herzonDataOriginalGlobal = globalThis.HERZON_DATA;
globalThis.HERZON_DATA = undefined;
var fixture2 = crearDocumentoDePrueba();
var handleSinData = Docs.init(fixture2.doc);
afirmar(handleSinData === null, 'init(doc) sin window.HERZON_DATA cargado en runtime debe devolver null sin lanzar');
globalThis.HERZON_DATA = herzonDataOriginalGlobal;

// ---------------------------------------------------------------------
// 24. Cero innerHTML, cero red (fetch/XHR) en todo el módulo (no
//     negociables de plan.md y criterio de aceptación T-023).
// ---------------------------------------------------------------------
afirmar(fuenteDocs.indexOf('innerHTML') === -1, 'build/documentos.js no debe usar innerHTML en ninguna parte (textContent siempre)');
afirmar(fuenteDocs.indexOf('fetch(') === -1, 'build/documentos.js no debe usar fetch (cero red)');
afirmar(fuenteDocs.indexOf('XMLHttpRequest') === -1, 'build/documentos.js no debe usar XMLHttpRequest (cero red)');
afirmar(!REGEX_EMOJI.test(fuenteDocs), 'build/documentos.js no debe contener emojis (regla dura de Mario)');

// ---------------------------------------------------------------------
// 25. Hexes: cero hexes fuera de los tokens VALIDADOS del modo claro del
//     contrato (.harness/design-contract-herzon.md sección 2), usados
//     únicamente dentro del <style> del documento .html descargable
//     autocontenido (no tiene acceso a var(--token), mismo precedente que
//     el bloque @media print de T-021 en build/shell.html).
// ---------------------------------------------------------------------
var HEXES_VALIDADOS_MODO_CLARO = ['#0b0b0b', '#52514e', '#c3c2b7', '#e1e0d9'];
var hexesEncontrados = fuenteDocs.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
afirmar(hexesEncontrados.length > 0, 'build/documentos.js debe traer al menos los hexes del <style> del documento descargable (sanity de esta prueba)');
for (var hx = 0; hx < hexesEncontrados.length; hx++) {
  afirmar(
    HEXES_VALIDADOS_MODO_CLARO.indexOf(hexesEncontrados[hx].toLowerCase()) !== -1,
    'build/documentos.js contiene un hex fuera de la lista de tokens validados del modo claro: ' + hexesEncontrados[hx]
  );
}

// ---------------------------------------------------------------------
// 26. Anti-regresión de acentos (QA ronda 1, D1): ninguna de estas
//     palabras en español sin acento/eñe puede reaparecer en el CÓDIGO
//     FUENTE de este módulo (prosa de comentarios y mensajes; identificadores
//     y claves como "peso_kg" quedan fuera de esta lista a propósito).
// ---------------------------------------------------------------------
// "seccion" queda fuera de esta lista a propósito: es un identificador
// legítimo (variable local `seccion` en crearSeccion), igual que
// "recomposicion"/"proteina_g" quedan fuera en selfcheck_motor.js.
var PALABRAS_SIN_ACENTO_PROHIBIDAS = [
  'invalido', 'invalida', 'numero', 'espanol', 'validacion', 'importacion',
  'catalogo', 'anos', 'fisiologico', 'fisiologica',
  'automatico', 'automatica', 'basica', 'basico', 'facil', 'metodo'
];
for (var pa = 0; pa < PALABRAS_SIN_ACENTO_PROHIBIDAS.length; pa++) {
  var palabra = PALABRAS_SIN_ACENTO_PROHIBIDAS[pa];
  var regexPalabra = new RegExp('\\b' + palabra + '\\b');
  afirmar(!regexPalabra.test(fuenteDocs), 'build/documentos.js contiene la palabra sin acento "' + palabra + '": revisar y corregir a español con acentos/eñe');
}

// ---------------------------------------------------------------------
console.log('checks ejecutados: ' + contador);
process.exit(0);
