/* build/selfcheck_motor.js
 * Selfcheck de node puro (sin dependencias externas) para
 * build/motor_recomendacion.js. Formato de salida congelado (plan.md 3.J):
 * última línea de stdout es el literal "checks ejecutados: N"; exit 0 solo
 * si todas las aserciones pasan; en fallo, exit 1 e imprime la aserción
 * fallida antes de salir.
 *
 * El motor es PURO (sin DOM, sin HERZON_DATA): no requiere `globalThis.window`
 * ni build/testdom.js. Se limita a `require('./motor_recomendacion.js')` y a
 * exigir `globalThis.window` porque el preámbulo del módulo (plan.md 3.A) lo
 * necesita para resolver `G` igual que en navegador.
 */
'use strict';

var fs = require('fs');
var path = require('path');

globalThis.window = globalThis;
require('./motor_recomendacion.js');
var Motor = globalThis.Herzon.Motor;

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

function assertIgual(real, esperado, mensaje) {
  assert(real === esperado, mensaje + ' (esperado ' + esperado + ', obtuvo ' + real + ')');
}

var REGEX_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/u;

// ---------------------------------------------------------------------
// 0. Namespace y forma de la API (plan.md 3.B: Herzon.Motor.* es el único
//    dueño; funciones puras expuestas exactamente según Adendum R5 punto 2).
// ---------------------------------------------------------------------
assert(typeof Motor === 'object' && Motor !== null, 'window.Herzon.Motor debe existir como objeto tras require(./motor_recomendacion.js)');
assert(typeof Motor.tmb === 'function', 'Herzon.Motor.tmb debe ser una función');
assert(typeof Motor.get === 'function', 'Herzon.Motor.get debe ser una función');
assert(typeof Motor.kcalObjetivo === 'function', 'Herzon.Motor.kcalObjetivo debe ser una función');
assert(typeof Motor.macrosObjetivo === 'function', 'Herzon.Motor.macrosObjetivo debe ser una función');
assert(typeof Motor.recomendar === 'function', 'Herzon.Motor.recomendar debe ser una función');

// ---------------------------------------------------------------------
// 1. Pureza: el módulo no tocó `document` en el nivel superior (cargó sin
//    lanzar bajo `globalThis.window = globalThis` y sin navegador real), y
//    ninguna función depende de HERZON_DATA (no existe en este proceso).
// ---------------------------------------------------------------------
assert(typeof globalThis.HERZON_DATA === 'undefined', 'este selfcheck no debe requerir build/data.js: el motor es puro y recibe todo por argumentos');

// =======================================================================
// 2. ANCLA OBLIGATORIA: perfil basal de Daniela.
//    Mujer, 75 kg, 162 cm, 34 años, factor de actividad ligero 1.375.
//    Cálculo a mano (Mifflin-St Jeor, mujer):
//      tmb = 10*75 + 6.25*162 - 5*34 - 161
//          = 750 + 1012.5 - 170 - 161 = 1431.5 -> redondeado = 1432
//      get = tmb * 1.375 = 1432 * 1.375 = 1969.0 -> redondeado = 1969
//    Estos son los valores que el perfil de Daniela ya muestra en
//    HERZON_DATA.paciente.gastoEnergetico (build/data.js): tmb_kcal=1432,
//    get_kcal=1969. El motor DEBE reproducirlos exactamente.
// =======================================================================
var tmbDaniela = Motor.tmb({ sexo: 'femenino', pesoKg: 75, tallaCm: 162, edad: 34 });
assertIgual(tmbDaniela, 1432, 'ANCLA: tmb de Daniela (mujer, 75kg, 162cm, 34 años) debe ser 1432');
var getDaniela = Motor.get(tmbDaniela, 1.375);
assertIgual(getDaniela, 1969, 'ANCLA: get de Daniela con factor ligero 1.375 debe ser 1969');

// =======================================================================
// 3. Cuatro casos calculados a mano (hombre/mujer x 2 objetivos cada uno:
//    mujer "perdida"/"mantener", hombre "ganancia"/"recomposicion" — cubren
//    las 4 categorías de objetivo y ambos sexos). Aritmética mostrada en
//    cada comentario; valores confirmados con calculadora de precisión
//    doble (misma aritmética IEEE-754 que ejecuta el motor).
// =======================================================================

// --- Caso A: mujer, objetivo "perdida". -------------------------------
// Perfil de Daniela (tmb=1432 ya verificado en el ancla), factor
// sedentario 1.2:
//   get = round(1432 * 1.2) = round(1718.4) = 1718
//   kcalObjetivo = round(1718 * (1 - 0.15)) = round(1718 * 0.85)
//               = round(1460.3) = 1460
//   proteina_g = round(75 * 1.8) = round(135) = 135        ("perdida": 1.8 g/kg)
//   grasa_g = round(1460 * 0.275 / 9) = round(401.5 / 9)
//           = round(44.6111...) = 45
//   carbohidrato_g = round((1460 - 135*4 - 45*9) / 4)
//                  = round((1460 - 540 - 405) / 4) = round(515/4)
//                  = round(128.75) = 129
var getA = Motor.get(tmbDaniela, 1.2);
assertIgual(getA, 1718, 'Caso A (mujer, perdida): get con factor sedentario 1.2 debe ser 1718');
var kcalA = Motor.kcalObjetivo(getA, 'perdida');
assertIgual(kcalA, 1460, 'Caso A (mujer, perdida): kcalObjetivo debe ser 1460');
var macrosA = Motor.macrosObjetivo({ kcal: kcalA, pesoKg: 75, objetivo: 'perdida' });
assertIgual(macrosA.proteina_g, 135, 'Caso A (mujer, perdida): proteina_g debe ser 135');
assertIgual(macrosA.grasa_g, 45, 'Caso A (mujer, perdida): grasa_g debe ser 45');
assertIgual(macrosA.carbohidrato_g, 129, 'Caso A (mujer, perdida): carbohidrato_g debe ser 129');

// --- Caso B: mujer, objetivo "mantener". -------------------------------
// Mismo perfil (tmb=1432), factor moderado 1.55:
//   get = round(1432 * 1.55) = round(2219.6) = 2220
//   kcalObjetivo = round(2220 * (1 + 0)) = 2220
//   proteina_g = round(75 * 1.6) = round(120) = 120        ("mantener": 1.6 g/kg)
//   grasa_g = round(2220 * 0.275 / 9) = round(610.5 / 9)
//           = round(67.8333...) = 68
//   carbohidrato_g = round((2220 - 120*4 - 68*9) / 4)
//                  = round((2220 - 480 - 612) / 4) = round(1128/4)
//                  = round(282) = 282
var getB = Motor.get(tmbDaniela, 1.55);
assertIgual(getB, 2220, 'Caso B (mujer, mantener): get con factor moderado 1.55 debe ser 2220');
var kcalB = Motor.kcalObjetivo(getB, 'mantener');
assertIgual(kcalB, 2220, 'Caso B (mujer, mantener): kcalObjetivo debe ser 2220 (ajuste 0%)');
var macrosB = Motor.macrosObjetivo({ kcal: kcalB, pesoKg: 75, objetivo: 'mantener' });
assertIgual(macrosB.proteina_g, 120, 'Caso B (mujer, mantener): proteina_g debe ser 120');
assertIgual(macrosB.grasa_g, 68, 'Caso B (mujer, mantener): grasa_g debe ser 68');
assertIgual(macrosB.carbohidrato_g, 282, 'Caso B (mujer, mantener): carbohidrato_g debe ser 282');

// --- Caso C: hombre, objetivo "ganancia". -------------------------------
// Perfil: 80 kg, 178 cm, 28 años, factor intenso 1.725.
//   tmb = 10*80 + 6.25*178 - 5*28 + 5
//       = 800 + 1112.5 - 140 + 5 = 1777.5 -> redondeado = 1778
//   get = round(1778 * 1.725) = round(3067.05) = 3067
//   kcalObjetivo = round(3067 * (1 + 0.10)) = round(3373.7) = 3374
//   proteina_g = round(80 * 2.0) = round(160) = 160        ("ganancia": 2.0 g/kg)
//   grasa_g = round(3374 * 0.275 / 9) = round(927.85 / 9)
//           = round(103.0944...) = 103
//   carbohidrato_g = round((3374 - 160*4 - 103*9) / 4)
//                  = round((3374 - 640 - 927) / 4) = round(1807/4)
//                  = round(451.75) = 452
var tmbC = Motor.tmb({ sexo: 'masculino', pesoKg: 80, tallaCm: 178, edad: 28 });
assertIgual(tmbC, 1778, 'Caso C (hombre, ganancia): tmb debe ser 1778');
var getC = Motor.get(tmbC, 1.725);
assertIgual(getC, 3067, 'Caso C (hombre, ganancia): get con factor intenso 1.725 debe ser 3067');
var kcalC = Motor.kcalObjetivo(getC, 'ganancia');
assertIgual(kcalC, 3374, 'Caso C (hombre, ganancia): kcalObjetivo debe ser 3374');
var macrosC = Motor.macrosObjetivo({ kcal: kcalC, pesoKg: 80, objetivo: 'ganancia' });
assertIgual(macrosC.proteina_g, 160, 'Caso C (hombre, ganancia): proteina_g debe ser 160');
assertIgual(macrosC.grasa_g, 103, 'Caso C (hombre, ganancia): grasa_g debe ser 103');
assertIgual(macrosC.carbohidrato_g, 452, 'Caso C (hombre, ganancia): carbohidrato_g debe ser 452');

// --- Caso D: hombre, objetivo "recomposicion". ---------------------------
// Perfil: 85 kg, 175 cm, 40 años, factor ligero 1.375.
//   tmb = 10*85 + 6.25*175 - 5*40 + 5
//       = 850 + 1093.75 - 200 + 5 = 1748.75 -> redondeado = 1749
//   get = round(1749 * 1.375). 1749 * 0.375 = 655.875 -> get = round(2404.875) = 2405
//   kcalObjetivo = round(2405 * (1 - 0.10)) = round(2164.5) = 2165
//   proteina_g = round(85 * 1.8) = round(153) = 153        ("recomposicion": 1.8 g/kg)
//   grasa_g = round(2165 * 0.275 / 9) = round(595.375 / 9)
//           = round(66.1527...) = 66
//   carbohidrato_g = round((2165 - 153*4 - 66*9) / 4)
//                  = round((2165 - 612 - 594) / 4) = round(959/4)
//                  = round(239.75) = 240
var tmbD = Motor.tmb({ sexo: 'masculino', pesoKg: 85, tallaCm: 175, edad: 40 });
assertIgual(tmbD, 1749, 'Caso D (hombre, recomposicion): tmb debe ser 1749');
var getD = Motor.get(tmbD, 1.375);
assertIgual(getD, 2405, 'Caso D (hombre, recomposicion): get con factor ligero 1.375 debe ser 2405');
var kcalD = Motor.kcalObjetivo(getD, 'recomposicion');
assertIgual(kcalD, 2165, 'Caso D (hombre, recomposicion): kcalObjetivo debe ser 2165');
var macrosD = Motor.macrosObjetivo({ kcal: kcalD, pesoKg: 85, objetivo: 'recomposicion' });
assertIgual(macrosD.proteina_g, 153, 'Caso D (hombre, recomposicion): proteina_g debe ser 153');
assertIgual(macrosD.grasa_g, 66, 'Caso D (hombre, recomposicion): grasa_g debe ser 66');
assertIgual(macrosD.carbohidrato_g, 240, 'Caso D (hombre, recomposicion): carbohidrato_g debe ser 240');

// ---------------------------------------------------------------------
// 4. kcalObjetivo / objetivo inválido lanza error explícito (función pura
//    no debe fallar en silencio ni devolver NaN sin avisar).
// ---------------------------------------------------------------------
var lanzoKcal = false;
try {
  Motor.kcalObjetivo(2000, 'volar');
} catch (e) {
  lanzoKcal = true;
}
assert(lanzoKcal, 'Herzon.Motor.kcalObjetivo debe lanzar con un objetivo inválido');

var lanzoTmb = false;
try {
  Motor.tmb({ sexo: 'otro', pesoKg: 70, tallaCm: 170, edad: 30 });
} catch (e) {
  lanzoTmb = true;
}
assert(lanzoTmb, 'Herzon.Motor.tmb debe lanzar con un sexo inválido');

// =======================================================================
// 5. recomendar(): ranking esperado verificado a mano contra 3 plantillas
//    fabricadas (independientes de HERZON_DATA), usando las necesidades del
//    Caso A (kcal=1460, proteina_g=135, carbohidrato_g=129, grasa_g=45).
//
//    Deltas plan-necesidad (planValor - necesidad):
//      Plan X: kcal +10, proteína +5, carbohidrato -9, grasa +5
//      Plan Y: kcal +440, proteína -25, carbohidrato +91, grasa +15
//      Plan Z: kcal -10, proteína -5, carbohidrato +6, grasa -1
//
//    Distancia normalizada (cada delta / necesidad correspondiente, raíz de
//    la suma de cuadrados) y score = round(100 / (1 + distancia)):
//      Plan X: dKcal=10/1460=0.006849, dProt=5/135=0.037037,
//              dCarb=-9/129=-0.069767, dGrasa=5/45=0.111111
//              distancia=sqrt(0.006849^2+0.037037^2+0.069767^2+0.111111^2)
//                       = sqrt(0.018632) = 0.136498 -> score=round(88.0)=88
//      Plan Y: dKcal=440/1460=0.301370, dProt=-25/135=-0.185185,
//              dCarb=91/129=0.705426, dGrasa=15/45=0.333333
//              distancia=sqrt(0.733855)=0.856653 -> score=round(53.86)=54
//      Plan Z: dKcal=-10/1460=-0.006849, dProt=-5/135=-0.037037,
//              dCarb=6/129=0.046512, dGrasa=-1/45=-0.022222
//              distancia=sqrt(0.004076)=0.063842 -> score=round(93.998)=94
//
//    Ranking esperado (descendente por score): Z (94) > X (88) > Y (54).
// =======================================================================
var necesidadesReco = { kcal: 1460, proteina_g: 135, carbohidrato_g: 129, grasa_g: 45 };
var planX = { id: 'plan_x', nombre: 'Plan X de prueba', kcalObjetivo: 1470, macrosTotales: { proteina: 140, carbohidrato: 120, grasa: 50 } };
var planY = { id: 'plan_y', nombre: 'Plan Y de prueba', kcalObjetivo: 1900, macrosTotales: { proteina: 110, carbohidrato: 220, grasa: 60 } };
var planZ = { id: 'plan_z', nombre: 'Plan Z de prueba', kcalObjetivo: 1450, macrosTotales: { proteina: 130, carbohidrato: 135, grasa: 44 } };

var ranking = Motor.recomendar(necesidadesReco, [planX, planY, planZ]);
assert(Array.isArray(ranking) && ranking.length === 3, 'recomendar debe devolver un arreglo con 3 entradas (una por plan)');

assertIgual(ranking[0].plan.id, 'plan_z', 'recomendar: 1er lugar del ranking debe ser plan_z (mejor ajuste)');
assertIgual(ranking[1].plan.id, 'plan_x', 'recomendar: 2do lugar del ranking debe ser plan_x');
assertIgual(ranking[2].plan.id, 'plan_y', 'recomendar: 3er lugar del ranking debe ser plan_y (peor ajuste)');

assertIgual(ranking[0].score, 94, 'recomendar: score de plan_z debe ser 94');
assertIgual(ranking[1].score, 88, 'recomendar: score de plan_x debe ser 88');
assertIgual(ranking[2].score, 54, 'recomendar: score de plan_y debe ser 54');

assert(ranking[0].score > ranking[1].score && ranking[1].score > ranking[2].score, 'recomendar: el ranking debe venir en orden ESTRICTAMENTE descendente por score');

// razones[] legibles en español: forma, contenido mínimo y el patrón de los
// 2 ejemplos del criterio de aceptación (delta de kcal con signo, y
// "proteína suficiente" cuando el plan cubre el objetivo) deben tener
// equivalente exacto en este formato.
for (var ri = 0; ri < ranking.length; ri++) {
  assert(Array.isArray(ranking[ri].razones) && ranking[ri].razones.length === 4, 'recomendar: razones[] de "' + ranking[ri].plan.id + '" debe tener 4 elementos (kcal, proteína, carbohidrato, grasa)');
  for (var rj = 0; rj < ranking[ri].razones.length; rj++) {
    assert(typeof ranking[ri].razones[rj] === 'string' && ranking[ri].razones[rj].length > 0, 'recomendar: cada razón debe ser un string no vacío');
  }
}

// plan_x: kcal +10 (dentro de tolerancia, formato "kcal a +10 del objetivo")
// y proteína +5 (>=0, formato exacto "proteína suficiente").
assertIgual(ranking[1].razones[0], 'kcal a +10 del objetivo', 'recomendar: razón de kcal de plan_x debe ser literal "kcal a +10 del objetivo"');
assertIgual(ranking[1].razones[1], 'proteína suficiente', 'recomendar: razón de proteína de plan_x debe ser literal "proteína suficiente" (inspirado en el ejemplo del criterio de aceptación)');
assertIgual(ranking[1].razones[2], 'carbohidrato a -9 g del objetivo', 'recomendar: razón de carbohidrato de plan_x debe ser literal "carbohidrato a -9 g del objetivo"');
assertIgual(ranking[1].razones[3], 'grasa a +5 g del objetivo', 'recomendar: razón de grasa de plan_x debe ser literal "grasa a +5 g del objetivo"');

// plan_z: kcal -10 (formato "kcal a -10 del objetivo", mismo patrón que el
// ejemplo "kcal a -40 del objetivo" del criterio de aceptación) y proteína
// -5 (<0, formato "proteína insuficiente (-5 g respecto al objetivo)").
assertIgual(ranking[0].razones[0], 'kcal a -10 del objetivo', 'recomendar: razón de kcal de plan_z debe ser literal "kcal a -10 del objetivo"');
assertIgual(ranking[0].razones[1], 'proteína insuficiente (-5 g respecto al objetivo)', 'recomendar: razón de proteína de plan_z debe reflejar el déficit exacto');

// recomendar con un solo plan: debe devolver 1 entrada, score válido y no
// lanzar (caso borde razonable para un catálogo reducido).
var rankingUnico = Motor.recomendar(necesidadesReco, [planZ]);
assertIgual(rankingUnico.length, 1, 'recomendar con un solo plan debe devolver 1 entrada');
assertIgual(rankingUnico[0].score, 94, 'recomendar con un solo plan (plan_z) debe reproducir el mismo score (94) que en el ranking de 3');

// ---------------------------------------------------------------------
// 6. Sin emojis en ningún mensaje de error ni en ninguna razón generada.
// ---------------------------------------------------------------------
var totalTextosRevisados = 0;
for (var ei = 0; ei < ranking.length; ei++) {
  for (var ej = 0; ej < ranking[ei].razones.length; ej++) {
    totalTextosRevisados++;
    assert(!REGEX_EMOJI.test(ranking[ei].razones[ej]), 'se encontró un carácter de emoji en una razón generada: "' + ranking[ei].razones[ej] + '"');
  }
}
assert(totalTextosRevisados > 0, 'el recorrido de razones generadas debe revisar al menos un string');

// ---------------------------------------------------------------------
// 7. Anti-regresión de acentos: ninguna de estas palabras en español sin
//    acento/eñe puede reaparecer en el CÓDIGO FUENTE del módulo (prosa de
//    comentarios y mensajes; los identificadores y claves como "proteina_g"
//    o "recomposicion" quedan fuera de esta lista a propósito porque el
//    Adendum R5 los congela sin tilde). Coincidencia con límite de palabra
//    para no disparar sobre subcadenas.
// ---------------------------------------------------------------------
var fuenteMotorJs = fs.readFileSync(path.join(__dirname, 'motor_recomendacion.js'), 'utf8');
var PALABRAS_SIN_ACENTO_PROHIBIDAS = [
  'funcion', 'preambulo', 'formulas', 'catalogo', 'numero', 'segun',
  'explicito', 'espanol', 'anios', 'invalido', 'invalida'
];
for (var pa = 0; pa < PALABRAS_SIN_ACENTO_PROHIBIDAS.length; pa++) {
  var palabra = PALABRAS_SIN_ACENTO_PROHIBIDAS[pa];
  var regexPalabra = new RegExp('\\b' + palabra + '\\b');
  assert(!regexPalabra.test(fuenteMotorJs), 'build/motor_recomendacion.js contiene la palabra sin acento "' + palabra + '" en su prosa: revisar y corregir a español con acentos/eñe');
}

// ---------------------------------------------------------------------
// Cierre.
// ---------------------------------------------------------------------
console.log('checks ejecutados: ' + checks);
process.exit(0);
