/* build/selfcheck_data.js
 * Selfcheck de node puro (sin dependencias externas) para build/data.js.
 * Formato de salida congelado (plan.md 3.J): última línea de stdout es el
 * literal "checks ejecutados: N"; exit 0 solo si todas las aserciones
 * pasan; en fallo, exit 1 e imprime la aserción fallida antes de salir.
 */
'use strict';

var fs = require('fs');
var path = require('path');

globalThis.window = globalThis;
require('./data.js');
var DATA = globalThis.HERZON_DATA;

var checks = 0;

function falla(mensaje) {
  console.error('ASERCIÓN FALLIDA: ' + mensaje);
  process.exit(1);
}

function assert(condicion, mensaje) {
  checks++;
  if (!condicion) {
    falla(mensaje);
  }
}

function quitarAcentos(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizar(s) {
  return quitarAcentos(s).toLowerCase();
}

var REGEX_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/u;

function recorrerStrings(valor, visitante) {
  if (valor === null || valor === undefined) { return; }
  if (typeof valor === 'string') {
    visitante(valor);
  } else if (Array.isArray(valor)) {
    for (var i = 0; i < valor.length; i++) { recorrerStrings(valor[i], visitante); }
  } else if (typeof valor === 'object') {
    var claves = Object.keys(valor);
    for (var j = 0; j < claves.length; j++) { recorrerStrings(valor[claves[j]], visitante); }
  }
}

// -----------------------------------------------------------------------
// 0. HERZON_DATA existe y no tocó document en el nivel superior (el
//    módulo cargó sin lanzar y sin requerir document global).
// -----------------------------------------------------------------------
assert(typeof DATA === 'object' && DATA !== null, 'window.HERZON_DATA debe existir como objeto tras require(./data.js)');

// -----------------------------------------------------------------------
// 1. Forma: exactamente las claves de primer nivel de plan.md 3.I.
// -----------------------------------------------------------------------
var CLAVES_ESPERADAS = ['meta', 'paciente', 'series', 'labs', 'plicometria', 'planes', 'factoresActividad', 'suplementos', 'supuestos', 'rutina'];
var clavesReales = Object.keys(DATA).sort();
assert(clavesReales.length === CLAVES_ESPERADAS.length, 'HERZON_DATA debe tener exactamente 10 claves de primer nivel, tiene ' + clavesReales.length);
for (var ci = 0; ci < CLAVES_ESPERADAS.length; ci++) {
  assert(Object.prototype.hasOwnProperty.call(DATA, CLAVES_ESPERADAS[ci]), 'falta la clave de primer nivel "' + CLAVES_ESPERADAS[ci] + '"');
}

// -----------------------------------------------------------------------
// 2. Longitudes de series.
// -----------------------------------------------------------------------
var series = DATA.series;
assert(series.semanas.length === 12, 'series.semanas debe tener 12 elementos');
assert(series.fechas.length === 12, 'series.fechas debe tener 12 elementos');
assert(series.peso_kg.length === 12, 'series.peso_kg debe tener 12 elementos');
assert(series.grasa_pct.length === 12, 'series.grasa_pct debe tener 12 elementos');
assert(series.musculo_kg.length === 12, 'series.musculo_kg debe tener 12 elementos');
assert(series.cintura_cm.length === 12, 'series.cintura_cm debe tener 12 elementos');
assert(series.adherenciaDieta_pct.length === 12, 'series.adherenciaDieta_pct debe tener 12 elementos');
assert(series.adherenciaDiaria.length === 84, 'series.adherenciaDiaria debe tener 84 elementos');

// -----------------------------------------------------------------------
// 3. Longitudes de labs.
// -----------------------------------------------------------------------
assert(DATA.labs.cortes.length === 3, 'labs.cortes debe tener 3 elementos');
for (var mi = 0; mi < DATA.labs.marcadores.length; mi++) {
  assert(DATA.labs.marcadores[mi].valores.length === 3, 'labs.marcadores[' + mi + '] (' + DATA.labs.marcadores[mi].clave + ') debe tener 3 valores');
}

// -----------------------------------------------------------------------
// 3B. Plicometría (R4, feedback de Mario): clave ADITIVA. Forma, nombres
//     acentuados, plausibilidad de valores y coherencia dura contra la
//     serie existente de grasa_pct (mismo sentido, magnitud proporcional
//     razonable, descenso gradual sin quiebres).
// -----------------------------------------------------------------------
var plicometria = DATA.plicometria;
assert(typeof plicometria === 'object' && plicometria !== null, 'HERZON_DATA.plicometria debe existir como objeto');
assert(plicometria.unidad === 'mm', 'plicometria.unidad debe ser "mm", es "' + plicometria.unidad + '"');

var CORTES_ESPERADOS = ['S1', 'S4', 'S8', 'S12'];
assert(Array.isArray(plicometria.cortes) && plicometria.cortes.length === 4, 'plicometria.cortes debe ser un arreglo de 4 elementos');
for (var pcz = 0; pcz < CORTES_ESPERADOS.length; pcz++) {
  assert(plicometria.cortes[pcz] === CORTES_ESPERADOS[pcz], 'plicometria.cortes[' + pcz + '] debe ser "' + CORTES_ESPERADOS[pcz] + '", es "' + plicometria.cortes[pcz] + '"');
}

var SITIOS_ESPERADOS = [
  { clave: 'tricipital', nombre: 'Tricipital' },
  { clave: 'subescapular', nombre: 'Subescapular' },
  { clave: 'suprailiaco', nombre: 'Suprailíaco' },
  { clave: 'abdominal', nombre: 'Abdominal' }
];
assert(Array.isArray(plicometria.sitios) && plicometria.sitios.length === 4, 'plicometria.sitios debe ser un arreglo de 4 elementos (tricipital, subescapular, suprailíaco, abdominal)');
for (var psz = 0; psz < SITIOS_ESPERADOS.length; psz++) {
  var sitioReal = plicometria.sitios[psz];
  assert(sitioReal.clave === SITIOS_ESPERADOS[psz].clave, 'plicometria.sitios[' + psz + '].clave debe ser "' + SITIOS_ESPERADOS[psz].clave + '", es "' + sitioReal.clave + '"');
  assert(sitioReal.nombre === SITIOS_ESPERADOS[psz].nombre, 'plicometria.sitios[' + psz + '].nombre debe ser "' + SITIOS_ESPERADOS[psz].nombre + '" (acentuado), es "' + sitioReal.nombre + '"');
  assert(Array.isArray(sitioReal.valores_mm) && sitioReal.valores_mm.length === 4, 'plicometria.sitios[' + psz + '] (' + sitioReal.clave + ').valores_mm debe tener 4 elementos, uno por corte');
  for (var vmi = 0; vmi < sitioReal.valores_mm.length; vmi++) {
    var valorMm = sitioReal.valores_mm[vmi];
    assert(typeof valorMm === 'number' && valorMm >= 8 && valorMm <= 50, 'plicometria.sitios[' + psz + '] (' + sitioReal.clave + ').valores_mm[' + vmi + '] (' + valorMm + ') debe ser un valor plausible en mm (entre 8 y 50)');
  }
  for (var vmj = 1; vmj < sitioReal.valores_mm.length; vmj++) {
    var deltaSitio = sitioReal.valores_mm[vmj] - sitioReal.valores_mm[vmj - 1];
    assert(deltaSitio <= 0 && deltaSitio >= -5, 'plicometria.sitios[' + psz + '] (' + sitioReal.clave + '): el pliegue de corte a corte debe descender de forma gradual sin quiebres (delta ' + deltaSitio + ' entre "' + plicometria.cortes[vmj - 1] + '" y "' + plicometria.cortes[vmj] + '" fuera del rango [-5,0])');
  }
}

// sumaPliegues_mm: recalculada a partir de los 4 sitios, EXACTA por corte.
assert(Array.isArray(plicometria.sumaPliegues_mm) && plicometria.sumaPliegues_mm.length === 4, 'plicometria.sumaPliegues_mm debe tener 4 elementos');
for (var scz = 0; scz < 4; scz++) {
  var sumaRecalculada = 0;
  for (var ssz = 0; ssz < plicometria.sitios.length; ssz++) {
    sumaRecalculada += plicometria.sitios[ssz].valores_mm[scz];
  }
  assert(plicometria.sumaPliegues_mm[scz] === sumaRecalculada, 'plicometria.sumaPliegues_mm[' + scz + '] (' + plicometria.sumaPliegues_mm[scz] + ') debe ser EXACTAMENTE la suma de los 4 sitios en ese corte (' + sumaRecalculada + ')');
}

// La suma de pliegues por corte debe descender de forma monótona y
// consistente (sin quiebres) a lo largo de los 4 cortes.
for (var smz = 1; smz < plicometria.sumaPliegues_mm.length; smz++) {
  assert(plicometria.sumaPliegues_mm[smz] < plicometria.sumaPliegues_mm[smz - 1], 'plicometria.sumaPliegues_mm debe descender de corte a corte: "' + plicometria.cortes[smz - 1] + '" (' + plicometria.sumaPliegues_mm[smz - 1] + ') debe ser mayor que "' + plicometria.cortes[smz] + '" (' + plicometria.sumaPliegues_mm[smz] + ')');
}
assert(plicometria.sumaPliegues_mm[0] >= 90 && plicometria.sumaPliegues_mm[0] <= 140, 'la suma de pliegues del primer corte (' + plicometria.sumaPliegues_mm[0] + ') debe ser plausible para mujer 34 años con sobrepeso (entre 90 y 140 mm)');
assert(plicometria.sumaPliegues_mm[3] >= 70 && plicometria.sumaPliegues_mm[3] <= 120, 'la suma de pliegues del último corte (' + plicometria.sumaPliegues_mm[3] + ') debe ser plausible tras la recomposición (entre 70 y 120 mm)');

// Coherencia dura con la serie EXISTENTE de grasa_pct: cada corte "S<n>"
// mapea a la semana n (índice n-1) de series.grasa_pct. La caída de la
// suma de pliegues entre cortes consecutivos debe compartir el sentido
// (misma dirección, ambas a la baja) de la caída de grasa_pct entre esas
// mismas semanas, y la magnitud total debe ser proporcional razonable.
function semanaDeCorte(etiquetaCorte) {
  return parseInt(etiquetaCorte.replace('S', ''), 10);
}
for (var coz = 1; coz < plicometria.cortes.length; coz++) {
  var semanaAnterior = semanaDeCorte(plicometria.cortes[coz - 1]);
  var semanaActual = semanaDeCorte(plicometria.cortes[coz]);
  var grasaAnterior = series.grasa_pct[semanaAnterior - 1];
  var grasaActual = series.grasa_pct[semanaActual - 1];
  var deltaGrasa = grasaActual - grasaAnterior;
  var deltaPliegues = plicometria.sumaPliegues_mm[coz] - plicometria.sumaPliegues_mm[coz - 1];
  assert(deltaGrasa < 0, 'series.grasa_pct debe bajar entre la semana ' + semanaAnterior + ' y la semana ' + semanaActual + ' para poder narrar coherencia con plicometría (delta ' + deltaGrasa + ')');
  assert(deltaPliegues < 0, 'plicometria.sumaPliegues_mm debe bajar entre "' + plicometria.cortes[coz - 1] + '" y "' + plicometria.cortes[coz] + '", mismo sentido que la caída de grasa_pct (delta ' + deltaPliegues + ')');
}
var deltaGrasaTotal = series.grasa_pct[0] - series.grasa_pct[11];
var deltaPliegesTotal = plicometria.sumaPliegues_mm[0] - plicometria.sumaPliegues_mm[3];
assert(deltaGrasaTotal > 0, 'series.grasa_pct[0]-series.grasa_pct[11] debe ser positivo (la grasa corporal baja en la serie)');
assert(deltaPliegesTotal > 0, 'plicometria.sumaPliegues_mm[0]-sumaPliegues_mm[3] debe ser positivo (los pliegues bajan de S1 a S12)');
var razonMmPorPuntoGrasa = deltaPliegesTotal / deltaGrasaTotal;
assert(razonMmPorPuntoGrasa >= 1 && razonMmPorPuntoGrasa <= 10, 'la magnitud del descenso de plicometría (' + deltaPliegesTotal + ' mm) debe ser proporcional razonable a la caída de grasa_pct (' + deltaGrasaTotal + ' pp): razón ' + razonMmPorPuntoGrasa + ' mm/pp fuera del rango [1,10]');

// -----------------------------------------------------------------------
// 4. Longitudes de planes (R5: catálogo de ~5 plantillas).
// -----------------------------------------------------------------------
assert(DATA.planes.length === 5, 'planes debe tener 5 elementos (catálogo R5), tiene ' + DATA.planes.length);
for (var pi = 0; pi < DATA.planes.length; pi++) {
  var plan = DATA.planes[pi];
  assert(plan.dias.length === 7, 'plan "' + plan.id + '" debe tener 7 días');
  for (var di = 0; di < plan.dias.length; di++) {
    var dia = plan.dias[di];
    assert(dia.comidas.length >= 4 && dia.comidas.length <= 5, 'plan "' + plan.id + '" día ' + dia.dia + ' debe tener entre 4 y 5 comidas, tiene ' + dia.comidas.length);
  }
}

// -----------------------------------------------------------------------
// 5. Suplementos: longitud de adherenciaSemanal_pct == 12, y al menos 4
//    suplementos.
// -----------------------------------------------------------------------
assert(DATA.suplementos.length >= 4, 'suplementos debe tener al menos 4 elementos, tiene ' + DATA.suplementos.length);
for (var si = 0; si < DATA.suplementos.length; si++) {
  assert(DATA.suplementos[si].adherenciaSemanal_pct.length === 12, 'suplemento "' + DATA.suplementos[si].nombre + '" debe tener adherenciaSemanal_pct de 12 elementos');
}

// -----------------------------------------------------------------------
// 6. Coherencia de macros: suma de comidas == totales del día, EXACTA.
//    Coherencia de Atwater: |4P+4C+9G - kcal| <= 5% de kcal, por comida y
//    por día.
// -----------------------------------------------------------------------
var CAMPOS_MACRO = ['kcal', 'proteina_g', 'carbohidrato_g', 'grasa_g'];
for (var pj = 0; pj < DATA.planes.length; pj++) {
  var planJ = DATA.planes[pj];
  for (var dj = 0; dj < planJ.dias.length; dj++) {
    var diaJ = planJ.dias[dj];

    // Suma de comidas == totales, exacta, por campo.
    for (var cf = 0; cf < CAMPOS_MACRO.length; cf++) {
      var campo = CAMPOS_MACRO[cf];
      var sumaComidas = 0;
      for (var mj = 0; mj < diaJ.comidas.length; mj++) { sumaComidas += diaJ.comidas[mj][campo]; }
      assert(sumaComidas === diaJ.totales[campo], 'plan "' + planJ.id + '" día ' + diaJ.dia + ': suma de comidas.' + campo + ' (' + sumaComidas + ') debe ser EXACTAMENTE igual a totales.' + campo + ' (' + diaJ.totales[campo] + ')');
    }

    // Atwater por comida.
    for (var mk = 0; mk < diaJ.comidas.length; mk++) {
      var comida = diaJ.comidas[mk];
      var atwaterComida = 4 * comida.proteina_g + 4 * comida.carbohidrato_g + 9 * comida.grasa_g;
      var diffComida = Math.abs(atwaterComida - comida.kcal);
      assert(diffComida <= 0.05 * comida.kcal, 'plan "' + planJ.id + '" día ' + diaJ.dia + ' comida "' + comida.nombre + '": diferencia Atwater ' + diffComida + ' excede 5% de ' + comida.kcal + ' kcal');
    }

    // Atwater por día.
    var atwaterDia = 4 * diaJ.totales.proteina_g + 4 * diaJ.totales.carbohidrato_g + 9 * diaJ.totales.grasa_g;
    var diffDia = Math.abs(atwaterDia - diaJ.totales.kcal);
    assert(diffDia <= 0.05 * diaJ.totales.kcal, 'plan "' + planJ.id + '" día ' + diaJ.dia + ': diferencia Atwater diaria ' + diffDia + ' excede 5% de ' + diaJ.totales.kcal + ' kcal');
  }

  // Objetivo calórico: promedio de 7 días dentro de +/-3% de kcalObjetivo.
  var kcalsSemana = planJ.dias.map(function (d) { return d.totales.kcal; });
  var promedioKcal = kcalsSemana.reduce(function (a, b) { return a + b; }, 0) / kcalsSemana.length;
  var toleranciaObj = 0.03 * planJ.kcalObjetivo;
  assert(Math.abs(promedioKcal - planJ.kcalObjetivo) <= toleranciaObj, 'plan "' + planJ.id + '": promedio semanal de kcal (' + promedioKcal + ') debe caer dentro de +/-3% de kcalObjetivo (' + planJ.kcalObjetivo + ')');
}

// -----------------------------------------------------------------------
// 7. Los 5 planes distintos entre si (id, nombre) y con indicadoPara.
// -----------------------------------------------------------------------
for (var pIdx = 0; pIdx < DATA.planes.length; pIdx++) {
  for (var pIdx2 = pIdx + 1; pIdx2 < DATA.planes.length; pIdx2++) {
    assert(DATA.planes[pIdx].id !== DATA.planes[pIdx2].id, 'plan "' + DATA.planes[pIdx].id + '" y plan "' + DATA.planes[pIdx2].id + '" deben tener id distinto');
    assert(DATA.planes[pIdx].nombre !== DATA.planes[pIdx2].nombre, 'plan "' + DATA.planes[pIdx].id + '" y plan "' + DATA.planes[pIdx2].id + '" deben tener nombre distinto');
  }
}
for (var pk = 0; pk < DATA.planes.length; pk++) {
  assert(typeof DATA.planes[pk].indicadoPara === 'object' && DATA.planes[pk].indicadoPara !== null, 'plan "' + DATA.planes[pk].id + '" debe declarar indicadoPara');
  assert(Array.isArray(DATA.planes[pk].indicadoPara.objetivo), 'plan "' + DATA.planes[pk].id + '" indicadoPara.objetivo debe ser arreglo');
  assert(Array.isArray(DATA.planes[pk].indicadoPara.restriccion), 'plan "' + DATA.planes[pk].id + '" indicadoPara.restriccion debe ser arreglo');
}

// -----------------------------------------------------------------------
// 8. Tendencia de peso realista.
// -----------------------------------------------------------------------
var pesoSerie = series.peso_kg;
var perdidaTotal = pesoSerie[0] - pesoSerie[11];
assert(perdidaTotal >= 4.0 && perdidaTotal <= 5.5, 'peso_kg[0]-peso_kg[11] (' + perdidaTotal + ') debe estar entre 4.0 y 5.5 kg');
var semanasMeseta = 0;
for (var wi = 1; wi < pesoSerie.length; wi++) {
  var deltaSemana = pesoSerie[wi] - pesoSerie[wi - 1];
  assert(Math.abs(deltaSemana) <= 1.2, 'peso_kg: delta semanal entre semana ' + wi + ' y ' + (wi + 1) + ' (' + deltaSemana + ') supera 1.2 kg en valor absoluto');
  if (Math.abs(deltaSemana) <= 0.15) { semanasMeseta++; }
}
assert(semanasMeseta >= 2, 'debe haber al menos 2 semanas de meseta (|delta| <= 0.15) en peso_kg, hay ' + semanasMeseta);

// -----------------------------------------------------------------------
// 9. Composición corporal.
// -----------------------------------------------------------------------
assert(series.grasa_pct[0] - series.grasa_pct[11] >= 2, 'grasa_pct debe bajar al menos 2 puntos entre semana 1 y 12');
assert(Math.abs(series.musculo_kg[11] - series.musculo_kg[0]) <= 0.8, 'musculo_kg debe permanecer casi plano (|delta| <= 0.8) entre semana 1 y 12');
assert(series.cintura_cm[11] < series.cintura_cm[0], 'cintura_cm[11] debe ser menor que cintura_cm[0]');

// -----------------------------------------------------------------------
// 10. Labs: dirección de mejora y cobertura mínima.
// -----------------------------------------------------------------------
for (var li = 0; li < DATA.labs.marcadores.length; li++) {
  var marcador = DATA.labs.marcadores[li];
  assert(typeof marcador.unidad === 'string' && marcador.unidad.length > 0, 'marcador "' + marcador.clave + '" debe declarar unidad');
  assert(typeof marcador.referencia === 'object' && marcador.referencia !== null && typeof marcador.referencia.min === 'number' && typeof marcador.referencia.max === 'number', 'marcador "' + marcador.clave + '" debe declarar referencia {min,max}');
  if (marcador.mejorSi === 'menor') {
    assert(marcador.valores[2] < marcador.valores[0], 'marcador "' + marcador.clave + '" (mejorSi=menor) debe tener valores[2] < valores[0]');
  } else if (marcador.mejorSi === 'mayor') {
    assert(marcador.valores[2] > marcador.valores[0], 'marcador "' + marcador.clave + '" (mejorSi=mayor) debe tener valores[2] > valores[0]');
  } else {
    falla('marcador "' + marcador.clave + '" tiene mejorSi inválido: ' + marcador.mejorSi);
  }
}
var CLAVES_COBERTURA_MINIMA = ['glucosa_ayuno', 'hba1c', 'colesterol_total', 'ldl', 'hdl', 'trigliceridos'];
var clavesLabs = DATA.labs.marcadores.map(function (m) { return m.clave; });
for (var cm = 0; cm < CLAVES_COBERTURA_MINIMA.length; cm++) {
  assert(clavesLabs.indexOf(CLAVES_COBERTURA_MINIMA[cm]) !== -1, 'labs.marcadores debe cubrir la clave "' + CLAVES_COBERTURA_MINIMA[cm] + '"');
}
assert(clavesLabs.indexOf('homa_ir') !== -1 || clavesLabs.indexOf('insulina') !== -1, 'labs.marcadores debe cubrir insulina u HOMA-IR');

// -----------------------------------------------------------------------
// 11. Adherencia.
// -----------------------------------------------------------------------
var promedioAdherencia = series.adherenciaDieta_pct.reduce(function (a, b) { return a + b; }, 0) / series.adherenciaDieta_pct.length;
assert(promedioAdherencia >= 75 && promedioAdherencia <= 85, 'la media de adherenciaDieta_pct (' + promedioAdherencia + ') debe caer entre 75 y 85');
var semanasBajoUmbral = series.adherenciaDieta_pct.filter(function (v) { return v < 65; }).length;
assert(semanasBajoUmbral >= 2, 'debe haber al menos 2 semanas de adherenciaDieta_pct por debajo de 65, hay ' + semanasBajoUmbral);
var adherenciasSuplementos = DATA.suplementos.map(function (s) { return s.adherencia_pct; });
var rangoAdherenciaSup = Math.max.apply(null, adherenciasSuplementos) - Math.min.apply(null, adherenciasSuplementos);
assert(rangoAdherenciaSup >= 25, 'el rango entre adherencia_pct máxima y mínima de suplementos (' + rangoAdherenciaSup + ') debe ser de al menos 25 puntos');

// -----------------------------------------------------------------------
// 12. Seguridad clínica: alergia a nuez y ningún ingrediente/nombre de
//     ninguno de los 2 planes contiene nuez/nueces/nogal (sin acentos,
//     sin distinguir mayúsculas).
// -----------------------------------------------------------------------
assert(DATA.paciente.alergias.indexOf('nuez') !== -1, 'paciente.alergias debe declarar "nuez"');
var PALABRAS_PROHIBIDAS = ['nuez', 'nueces', 'nogal'];
for (var pp = 0; pp < DATA.planes.length; pp++) {
  var planP = DATA.planes[pp];
  for (var dp = 0; dp < planP.dias.length; dp++) {
    var diaP = planP.dias[dp];
    for (var mp = 0; mp < diaP.comidas.length; mp++) {
      var comidaP = diaP.comidas[mp];
      var nombreNorm = normalizar(comidaP.nombre);
      for (var w1 = 0; w1 < PALABRAS_PROHIBIDAS.length; w1++) {
        assert(nombreNorm.indexOf(PALABRAS_PROHIBIDAS[w1]) === -1, 'plan "' + planP.id + '" día ' + diaP.dia + ' comida "' + comidaP.nombre + '": el nombre contiene la cadena prohibida "' + PALABRAS_PROHIBIDAS[w1] + '"');
      }
      for (var ig = 0; ig < comidaP.ingredientes.length; ig++) {
        var ingredienteNorm = normalizar(comidaP.ingredientes[ig]);
        for (var w2 = 0; w2 < PALABRAS_PROHIBIDAS.length; w2++) {
          assert(ingredienteNorm.indexOf(PALABRAS_PROHIBIDAS[w2]) === -1, 'plan "' + planP.id + '" día ' + diaP.dia + ' ingrediente "' + comidaP.ingredientes[ig] + '": contiene la cadena prohibida "' + PALABRAS_PROHIBIDAS[w2] + '"');
        }
      }
    }
  }
}

// -----------------------------------------------------------------------
// 13. Consistencia interna del perfil.
// -----------------------------------------------------------------------
var tallaM = DATA.paciente.talla_cm / 100;
var imcInicialCalculado = DATA.paciente.pesoInicial_kg / (tallaM * tallaM);
var imcActualCalculado = DATA.paciente.pesoActual_kg / (tallaM * tallaM);
assert(Math.abs(DATA.paciente.imcInicial - imcInicialCalculado) <= 0.1, '|imcInicial - peso/(talla_m^2)| debe ser <= 0.1');
assert(Math.abs(DATA.paciente.imcActual - imcActualCalculado) <= 0.1, '|imcActual - peso/(talla_m^2)| debe ser <= 0.1');
assert(DATA.paciente.pesoInicial_kg === series.peso_kg[0], 'paciente.pesoInicial_kg debe ser igual a series.peso_kg[0]');
assert(DATA.paciente.pesoActual_kg === series.peso_kg[11], 'paciente.pesoActual_kg debe ser igual a series.peso_kg[11]');
assert(DATA.meta.periodoSemanas === 12, 'meta.periodoSemanas debe ser 12');

for (var fi = 1; fi < series.fechas.length; fi++) {
  var fechaAnterior = new Date(series.fechas[fi - 1] + 'T00:00:00Z');
  var fechaActual = new Date(series.fechas[fi] + 'T00:00:00Z');
  var diffDias = Math.round((fechaActual.getTime() - fechaAnterior.getTime()) / 86400000);
  assert(diffDias === 7, 'series.fechas debe avanzar de 7 en 7 días, entre índice ' + (fi - 1) + ' y ' + fi + ' hay ' + diffDias + ' días');
}

assert(series.adherenciaDiaria.length === 84, 'series.adherenciaDiaria debe cubrir 84 días');
for (var ai = 1; ai < series.adherenciaDiaria.length; ai++) {
  var fA = new Date(series.adherenciaDiaria[ai - 1].fecha + 'T00:00:00Z');
  var fB = new Date(series.adherenciaDiaria[ai].fecha + 'T00:00:00Z');
  var diffAd = Math.round((fB.getTime() - fA.getTime()) / 86400000);
  assert(diffAd === 1, 'series.adherenciaDiaria debe ser consecutiva sin huecos, entre índice ' + (ai - 1) + ' y ' + ai + ' hay ' + diffAd + ' días');
}

// -----------------------------------------------------------------------
// 14. supuestos: arreglo no vacío de strings en español.
// -----------------------------------------------------------------------
assert(Array.isArray(DATA.supuestos) && DATA.supuestos.length > 0, 'supuestos debe ser un arreglo no vacío');
for (var su = 0; su < DATA.supuestos.length; su++) {
  assert(typeof DATA.supuestos[su] === 'string' && DATA.supuestos[su].length > 0, 'supuestos[' + su + '] debe ser un string no vacío');
}

// -----------------------------------------------------------------------
// 14-bis. PR-04 (R9): los 5 supuestos EXACTOS de "Acerca del modo demo"
//         reemplazan el array anterior íntegro (el título lo monta la
//         vista, T-040; aquí solo se pinnea el contenido de data.js). El
//         supuesto 5 anterior ("esta demo no persiste información") era
//         falso desde R8 y no puede reaparecer.
// -----------------------------------------------------------------------
var SUPUESTOS_DEMO_R9_ESPERADOS = [
  'Estás viendo el modo demo: un caso de ejemplo (Daniela Reyes Cortez) cuyos datos no corresponden a una paciente real.',
  'Los planes de dieta son plantillas pre-armadas; el recomendador las ordena y ajusta según los datos capturados, no genera planes nuevos.',
  'Las series de seguimiento del ejemplo (peso, composición corporal, laboratorios) ilustran una tendencia plausible de recomposición corporal; no son un caso clínico validado.',
  'El régimen de suplementos del ejemplo es ilustrativo y no constituye una recomendación médica.',
  'El modo demo no guarda cambios; con el botón Usar mis datos, la información capturada sí se guarda en este dispositivo.'
];
assert(DATA.supuestos.length === SUPUESTOS_DEMO_R9_ESPERADOS.length, 'PR-04: supuestos debe traer EXACTAMENTE ' + SUPUESTOS_DEMO_R9_ESPERADOS.length + ' entradas (el array nuevo de R9), tiene ' + DATA.supuestos.length);
for (var sd = 0; sd < SUPUESTOS_DEMO_R9_ESPERADOS.length; sd++) {
  assert(DATA.supuestos[sd] === SUPUESTOS_DEMO_R9_ESPERADOS[sd], 'PR-04: supuestos[' + sd + '] debe ser EXACTAMENTE el texto nuevo de R9, es: "' + DATA.supuestos[sd] + '"');
}
assert(DATA.supuestos.join(' ').indexOf('Esta demo no persiste') === -1, 'PR-04: el supuesto falso anterior ("esta demo no persiste información") no debe reaparecer -- Herzon.Almacen sí persiste en modo real desde R8');

// -----------------------------------------------------------------------
// 14-ter. PR-06 (R9): meta.nota/meta.generado de MODO DEMO, textos EXACTOS.
//         La nota del cliente real vive en build/almacen.js (NOTA_META_REAL,
//         verificada en T-045) y sobrescribe esta al montar un cliente
//         real -- fuera del alcance de este archivo.
// -----------------------------------------------------------------------
assert(DATA.meta.generado === 'sintetico', "PR-06: meta.generado del catálogo demo debe seguir siendo 'sintetico' (solo el cliente real, en almacen.js, lo sobrescribe a 'real')");
assert(
  DATA.meta.nota === 'Documento generado en modo demo con datos de ejemplo; no representa a una paciente real ni debe usarse para decisiones clínicas.',
  'PR-06: meta.nota del catálogo demo debe ser EXACTAMENTE el texto nuevo de modo demo, es: "' + DATA.meta.nota + '"'
);
assert(DATA.meta.nota.indexOf('sintetic') === -1, 'PR-06: la nueva meta.nota de modo demo no debe repetir la palabra "sintetico(s)" del texto anterior');
assert(DATA.meta.nota.indexOf('clínica') !== -1, 'PR-06: la nueva meta.nota de modo demo debe conservar el disclaimer clínico (nunca debe usarse para decisiones clínicas)');

// -----------------------------------------------------------------------
// 15. Sin emojis en ningún string del objeto completo.
// -----------------------------------------------------------------------
var totalStringsRevisados = 0;
recorrerStrings(DATA, function (texto) {
  totalStringsRevisados++;
  assert(!REGEX_EMOJI.test(texto), 'se encontró un carácter de emoji en el string: "' + texto + '"');
});
assert(totalStringsRevisados > 0, 'el recorrido recursivo de strings debe visitar al menos un string');

// -----------------------------------------------------------------------
// 16. Anti-regresión D1 (QA ronda 1): ninguna de estas palabras en español
//     sin acento/eñe puede reaparecer en el CÓDIGO FUENTE de este módulo
//     (comentarios incluidos). Coincidencia con límite de palabra, para no
//     disparar sobre subcadenas de otras palabras.
// -----------------------------------------------------------------------
var fuenteDataJs = fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8');
var PALABRAS_SIN_ACENTO_PROHIBIDAS = [
  'anos', 'Composicion', 'Calorias', 'Regimen', 'Probiotico', 'clinica',
  'demostracion', 'sinteticos', 'ultimas', 'capsula'
];
for (var pa = 0; pa < PALABRAS_SIN_ACENTO_PROHIBIDAS.length; pa++) {
  var palabra = PALABRAS_SIN_ACENTO_PROHIBIDAS[pa];
  var regexPalabra = new RegExp('\\b' + palabra + '\\b');
  assert(!regexPalabra.test(fuenteDataJs), 'build/data.js contiene la palabra sin acento "' + palabra + '" (D1, QA ronda 1): revisar y corregir a español con acentos/eñe');
}

// -----------------------------------------------------------------------
// 17. R5 (Adendum R5 punto 1): catálogo de ~5 plantillas con metadatos.
//     17.a Presencia de metadatos en las 5: macrosTotales{proteina,
//          carbohidrato,grasa}, etiquetas (arreglo no vacío de strings) y
//          descripción (string no vacío), sin alterar macrosObjetivo.
// -----------------------------------------------------------------------
var CAMPOS_MACROS_TOTALES = ['proteina', 'carbohidrato', 'grasa'];
for (var mpi = 0; mpi < DATA.planes.length; mpi++) {
  var planMeta = DATA.planes[mpi];
  assert(typeof planMeta.macrosTotales === 'object' && planMeta.macrosTotales !== null, 'plan "' + planMeta.id + '" debe declarar macrosTotales');
  for (var mtf = 0; mtf < CAMPOS_MACROS_TOTALES.length; mtf++) {
    var campoMt = CAMPOS_MACROS_TOTALES[mtf];
    assert(typeof planMeta.macrosTotales[campoMt] === 'number' && planMeta.macrosTotales[campoMt] > 0, 'plan "' + planMeta.id + '" macrosTotales.' + campoMt + ' debe ser un número positivo');
  }
  assert(Array.isArray(planMeta.etiquetas) && planMeta.etiquetas.length > 0, 'plan "' + planMeta.id + '" debe declarar etiquetas (arreglo no vacío)');
  for (var eti = 0; eti < planMeta.etiquetas.length; eti++) {
    assert(typeof planMeta.etiquetas[eti] === 'string' && planMeta.etiquetas[eti].length > 0, 'plan "' + planMeta.id + '" etiquetas[' + eti + '] debe ser un string no vacío');
  }
  assert(typeof planMeta.descripcion === 'string' && planMeta.descripcion.length > 0, 'plan "' + planMeta.id + '" debe declarar descripción (string no vacío)');
  assert(typeof planMeta.kcalObjetivo === 'number' && planMeta.kcalObjetivo > 0, 'plan "' + planMeta.id + '" debe conservar kcalObjetivo (número positivo)');
}

// -----------------------------------------------------------------------
// 17.b Consistencia kcal<->macros por plantilla: Atwater de macrosTotales
//      (4P+4C+9G) debe caer dentro de +/-5% de kcalObjetivo (tolerancia
//      razonable, criterio de aceptación T-019), para las 5 plantillas.
// -----------------------------------------------------------------------
for (var mki = 0; mki < DATA.planes.length; mki++) {
  var planMk = DATA.planes[mki];
  var mt = planMk.macrosTotales;
  var atwaterTotales = 4 * mt.proteina + 4 * mt.carbohidrato + 9 * mt.grasa;
  var diffTotales = Math.abs(atwaterTotales - planMk.kcalObjetivo);
  assert(diffTotales <= 0.05 * planMk.kcalObjetivo, 'plan "' + planMk.id + '": Atwater de macrosTotales (' + atwaterTotales + ') debe caer dentro de +/-5% de kcalObjetivo (' + planMk.kcalObjetivo + '), diferencia ' + diffTotales);
  // macrosTotales es espejo fiel de macrosObjetivo (misma fuente de verdad,
  // solo claves sin sufijo "_g"): nunca puede divergir.
  assert(mt.proteina === planMk.macrosObjetivo.proteina_g, 'plan "' + planMk.id + '": macrosTotales.proteina debe ser igual a macrosObjetivo.proteina_g');
  assert(mt.carbohidrato === planMk.macrosObjetivo.carbohidrato_g, 'plan "' + planMk.id + '": macrosTotales.carbohidrato debe ser igual a macrosObjetivo.carbohidrato_g');
  assert(mt.grasa === planMk.macrosObjetivo.grasa_g, 'plan "' + planMk.id + '": macrosTotales.grasa debe ser igual a macrosObjetivo.grasa_g');
}

// -----------------------------------------------------------------------
// 17.c factoresActividad: claves y valores EXACTOS (Adendum R5 punto 1),
//      consumidos por build/motor_recomendacion.js (T-020).
// -----------------------------------------------------------------------
var FACTORES_ESPERADOS = { sedentario: 1.2, ligero: 1.375, moderado: 1.55, intenso: 1.725 };
assert(typeof DATA.factoresActividad === 'object' && DATA.factoresActividad !== null, 'HERZON_DATA.factoresActividad debe existir como objeto');
var clavesFactores = Object.keys(DATA.factoresActividad).sort();
var clavesFactoresEsperadas = Object.keys(FACTORES_ESPERADOS).sort();
assert(clavesFactores.length === clavesFactoresEsperadas.length, 'factoresActividad debe tener exactamente ' + clavesFactoresEsperadas.length + ' claves, tiene ' + clavesFactores.length);
for (var fci = 0; fci < clavesFactoresEsperadas.length; fci++) {
  var claveFactor = clavesFactoresEsperadas[fci];
  assert(Object.prototype.hasOwnProperty.call(DATA.factoresActividad, claveFactor), 'factoresActividad debe tener la clave "' + claveFactor + '"');
  assert(DATA.factoresActividad[claveFactor] === FACTORES_ESPERADOS[claveFactor], 'factoresActividad.' + claveFactor + ' debe ser EXACTAMENTE ' + FACTORES_ESPERADOS[claveFactor] + ', es ' + DATA.factoresActividad[claveFactor]);
}

// -----------------------------------------------------------------------
// 17.d Etiquetas del catálogo cubren las 5 categorías sugeridas por el
//      Adendum R5 (estandar, bajo-carbohidrato, vegetariana, alta-proteina,
//      sin-lacteos), una por plantilla como mínimo.
// -----------------------------------------------------------------------
var ETIQUETAS_CATALOGO_ESPERADAS = ['estandar', 'bajo-carbohidrato', 'vegetariana', 'alta-proteina', 'sin-lacteos'];
var todasLasEtiquetas = [];
for (var tei = 0; tei < DATA.planes.length; tei++) {
  todasLasEtiquetas = todasLasEtiquetas.concat(DATA.planes[tei].etiquetas);
}
for (var tej = 0; tej < ETIQUETAS_CATALOGO_ESPERADAS.length; tej++) {
  assert(todasLasEtiquetas.indexOf(ETIQUETAS_CATALOGO_ESPERADAS[tej]) !== -1, 'el catálogo de planes debe cubrir la etiqueta "' + ETIQUETAS_CATALOGO_ESPERADAS[tej] + '" (Adendum R5) en al menos una plantilla');
}

// -----------------------------------------------------------------------
// 18. R-04 (R10, contrato justesse-r10-diseno.md): rutina demo de Daniela.
//     18.a Forma: existe, actualizado === series.fechas[0], 4 días
//          secuenciales 1..4, con la tupla literal exacta del contrato
//          por ejercicio (nombre, series, repeticiones, descanso_s, notas).
// -----------------------------------------------------------------------
var rutina = DATA.rutina;
assert(typeof rutina === 'object' && rutina !== null, 'HERZON_DATA.rutina debe existir como objeto');
assert(rutina.actualizado === series.fechas[0], 'rutina.actualizado debe ser EXACTAMENTE series.fechas[0] (' + series.fechas[0] + '), es "' + rutina.actualizado + '"');
assert(Array.isArray(rutina.dias) && rutina.dias.length === 4, 'rutina.dias debe ser un arreglo de 4 días, tiene ' + (rutina.dias && rutina.dias.length));
for (var rdi = 0; rdi < rutina.dias.length; rdi++) {
  assert(rutina.dias[rdi].dia === rdi + 1, 'rutina.dias[' + rdi + '].dia debe ser secuencial (' + (rdi + 1) + '), es ' + rutina.dias[rdi].dia);
}

var RUTINA_ESPERADA = [
  {
    titulo: 'Tren inferior y core',
    ejercicios: [
      { nombre: 'Sentadilla goblet con mancuerna', series: 4, repeticiones: '10-12', descanso_s: 90, notas: 'Bajada controlada en 2 segundos; peso moderado.' },
      { nombre: 'Peso muerto rumano con mancuernas', series: 3, repeticiones: '10-12', descanso_s: 90, notas: 'Espalda neutra; sentir isquiotibiales.' },
      { nombre: 'Zancada caminando', series: 3, repeticiones: '10 por pierna', descanso_s: 60, notas: '' },
      { nombre: 'Elevación de talones de pie', series: 3, repeticiones: '15', descanso_s: 45, notas: '' },
      { nombre: 'Plancha abdominal', series: 3, repeticiones: '30-45 s', descanso_s: 45, notas: 'Cadera alineada, sin arquear la zona lumbar.' }
    ]
  },
  {
    titulo: 'Tren superior (empuje y jalón)',
    ejercicios: [
      { nombre: 'Press de banca con mancuernas', series: 4, repeticiones: '8-10', descanso_s: 90, notas: '' },
      { nombre: 'Remo con mancuerna a una mano', series: 3, repeticiones: '10-12 por lado', descanso_s: 75, notas: 'Apoyo en banco; sin girar el tronco.' },
      { nombre: 'Press militar sentado con mancuernas', series: 3, repeticiones: '10', descanso_s: 75, notas: '' },
      { nombre: 'Jalón al pecho en polea', series: 3, repeticiones: '10-12', descanso_s: 75, notas: '' },
      { nombre: 'Curl de bíceps alterno', series: 2, repeticiones: '12', descanso_s: 45, notas: '' },
      { nombre: 'Extensión de tríceps en polea', series: 2, repeticiones: '12', descanso_s: 45, notas: '' }
    ]
  },
  {
    titulo: 'Cuerpo completo en circuito',
    ejercicios: [
      { nombre: 'Empuje de cadera con barra', series: 3, repeticiones: '12', descanso_s: 60, notas: 'Pausa de 1 segundo arriba.' },
      { nombre: 'Sentadilla con peso corporal a ritmo', series: 3, repeticiones: '15', descanso_s: 30, notas: '' },
      { nombre: 'Remo invertido en barra baja', series: 3, repeticiones: '8-10', descanso_s: 60, notas: 'Ajustar la altura de la barra según la fuerza.' },
      { nombre: 'Caminata del granjero con mancuernas', series: 3, repeticiones: '30 metros', descanso_s: 60, notas: 'Hombros atrás, paso corto.' },
      { nombre: 'Escaladores', series: 3, repeticiones: '20 por lado', descanso_s: 30, notas: '' }
    ]
  },
  {
    titulo: 'Acondicionamiento y movilidad',
    ejercicios: [
      { nombre: 'Caminata inclinada en caminadora', series: 1, repeticiones: '30 min', descanso_s: null, notas: 'Ritmo que permita hablar con frases cortas.' },
      { nombre: 'Bicicleta estática en intervalos suaves', series: 10, repeticiones: '1 min rápido / 1 min lento', descanso_s: null, notas: 'Opcional según la fatiga de la semana.' },
      { nombre: 'Movilidad de cadera y tobillo', series: 1, repeticiones: '10 min', descanso_s: null, notas: '' },
      { nombre: 'Estiramiento general', series: 1, repeticiones: '10 min', descanso_s: null, notas: '' }
    ]
  }
];
var CAMPOS_EJERCICIO = ['nombre', 'series', 'repeticiones', 'descanso_s', 'notas'];
for (var rei = 0; rei < RUTINA_ESPERADA.length; rei++) {
  var diaEsperado = RUTINA_ESPERADA[rei];
  var diaReal = rutina.dias[rei];
  assert(diaReal.titulo === diaEsperado.titulo, 'rutina.dias[' + rei + '].titulo debe ser EXACTAMENTE "' + diaEsperado.titulo + '", es "' + diaReal.titulo + '"');
  assert(Array.isArray(diaReal.ejercicios) && diaReal.ejercicios.length === diaEsperado.ejercicios.length, 'rutina.dias[' + rei + '] (' + diaEsperado.titulo + ') debe tener ' + diaEsperado.ejercicios.length + ' ejercicios, tiene ' + (diaReal.ejercicios && diaReal.ejercicios.length));
  for (var rej = 0; rej < diaEsperado.ejercicios.length; rej++) {
    var ejEsperado = diaEsperado.ejercicios[rej];
    var ejReal = diaReal.ejercicios[rej];
    for (var rck = 0; rck < CAMPOS_EJERCICIO.length; rck++) {
      var campoEj = CAMPOS_EJERCICIO[rck];
      assert(ejReal[campoEj] === ejEsperado[campoEj], 'rutina.dias[' + rei + '].ejercicios[' + rej + '].' + campoEj + ' debe ser EXACTAMENTE ' + JSON.stringify(ejEsperado[campoEj]) + ' (tupla literal del contrato R-04), es ' + JSON.stringify(ejReal[campoEj]));
    }
  }
}

// -----------------------------------------------------------------------
// 18.b Formas y rangos generales del contrato R-02 (independiente de los
//      valores exactos, por si la tupla cambia en una ronda futura): dia
//      secuencial, nombre no vacío, series entero 1..10, repeticiones
//      string no vacío, descanso_s entero 0..600 o null, notas string.
// -----------------------------------------------------------------------
for (var rgi = 0; rgi < rutina.dias.length; rgi++) {
  var diaRango = rutina.dias[rgi];
  assert(typeof diaRango.titulo === 'string', 'rutina.dias[' + rgi + '].titulo debe ser string');
  assert(Array.isArray(diaRango.ejercicios) && diaRango.ejercicios.length >= 1 && diaRango.ejercicios.length <= 12, 'rutina.dias[' + rgi + '].ejercicios debe tener entre 1 y 12 ejercicios (R-02), tiene ' + diaRango.ejercicios.length);
  for (var rgj = 0; rgj < diaRango.ejercicios.length; rgj++) {
    var ejRango = diaRango.ejercicios[rgj];
    assert(typeof ejRango.nombre === 'string' && ejRango.nombre.length > 0 && ejRango.nombre.length <= 80, 'rutina.dias[' + rgi + '].ejercicios[' + rgj + '].nombre debe ser string no vacío de <=80 caracteres (R-02)');
    assert(Number.isInteger(ejRango.series) && ejRango.series >= 1 && ejRango.series <= 10, 'rutina.dias[' + rgi + '].ejercicios[' + rgj + '].series debe ser entero 1..10 (R-02), es ' + ejRango.series);
    assert(typeof ejRango.repeticiones === 'string' && ejRango.repeticiones.length > 0 && ejRango.repeticiones.length <= 40, 'rutina.dias[' + rgi + '].ejercicios[' + rgj + '].repeticiones debe ser string no vacío de <=40 caracteres (R-02)');
    assert(ejRango.descanso_s === null || (Number.isInteger(ejRango.descanso_s) && ejRango.descanso_s >= 0 && ejRango.descanso_s <= 600), 'rutina.dias[' + rgi + '].ejercicios[' + rgj + '].descanso_s debe ser entero 0..600 o null (R-02), es ' + ejRango.descanso_s);
    assert(typeof ejRango.notas === 'string' && ejRango.notas.length <= 120, 'rutina.dias[' + rgi + '].ejercicios[' + rgj + '].notas debe ser string de <=120 caracteres (R-02)');
  }
}

// -----------------------------------------------------------------------
// 18.c Acentos presentes en la rutina (deben sobrevivir, no parafrasearse
//      a una forma sin acento) y ausencia de la palabra "nuez" (alergia
//      de la paciente: una rutina no debe mencionar alimentos, pero se
//      verifica de todas formas como cinturón).
// -----------------------------------------------------------------------
var textoRutinaCompleto = JSON.stringify(rutina);
var ACENTOS_RUTINA_ESPERADOS = ['Elevación', 'Extensión', 'rápido'];
for (var rac = 0; rac < ACENTOS_RUTINA_ESPERADOS.length; rac++) {
  assert(textoRutinaCompleto.indexOf(ACENTOS_RUTINA_ESPERADOS[rac]) !== -1, 'la rutina debe conservar el texto acentuado "' + ACENTOS_RUTINA_ESPERADOS[rac] + '" (R-04), copiado literal del contrato');
}
var textoRutinaNorm = normalizar(textoRutinaCompleto);
for (var rnu = 0; rnu < PALABRAS_PROHIBIDAS.length; rnu++) {
  assert(textoRutinaNorm.indexOf(PALABRAS_PROHIBIDAS[rnu]) === -1, 'la rutina no debe contener la cadena prohibida "' + PALABRAS_PROHIBIDAS[rnu] + '"');
}
var totalStringsRutina = 0;
recorrerStrings(rutina, function (texto) {
  totalStringsRutina++;
  assert(!REGEX_EMOJI.test(texto), 'se encontró un carácter de emoji en un string de rutina: "' + texto + '"');
});
assert(totalStringsRutina > 0, 'el recorrido recursivo de strings de rutina debe visitar al menos un string');

// -----------------------------------------------------------------------
// 18.d El resto de data.js (supuestos y meta.nota de R9) queda intacto:
//      re-afirmación explícita para que una regresión de R-04 no los toque.
// -----------------------------------------------------------------------
assert(DATA.supuestos.length === SUPUESTOS_DEMO_R9_ESPERADOS.length, 'R-04 no debe alterar el número de supuestos de R9 (' + SUPUESTOS_DEMO_R9_ESPERADOS.length + '), tiene ' + DATA.supuestos.length);
assert(DATA.meta.nota === 'Documento generado en modo demo con datos de ejemplo; no representa a una paciente real ni debe usarse para decisiones clínicas.', 'R-04 no debe alterar meta.nota de R9 (PR-06)');

// -----------------------------------------------------------------------
// Cierre.
// -----------------------------------------------------------------------
console.log('checks ejecutados: ' + checks);
process.exit(0);
