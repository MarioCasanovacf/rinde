// build/motor_recomendacion.js
// Herzon.Motor — funciones PURAS de cálculo nutricional (Adendum R5 punto 2).
// Ninguna función toca `document`, `window` ni `HERZON_DATA`: todo entra por
// argumentos y todo sale por el valor de retorno. Esto es lo que permite
// `require()` desde node sin navegador y sin stub de DOM (build/testdom.js
// no aplica aquí: no hay nada que montar).
//
// Fórmulas y redondeos (EXACTOS, congelados en .harness/plan.md Adendum R5):
//   tmb            Mifflin-St Jeor: mujer 10*peso + 6.25*talla - 5*edad - 161;
//                  hombre 10*peso + 6.25*talla - 5*edad + 5. Redondeado a entero.
//   get            tmb * factorActividad. Redondeado a entero.
//   kcalObjetivo   get * (1 + ajuste), ajuste por objetivo: 'perdida' -15%,
//                  'recomposicion' -10%, 'mantener' 0%, 'ganancia' +10%.
//                  Redondeado a entero.
//   macrosObjetivo proteina_g/kg según objetivo ('perdida'/'recomposicion'
//                  1.8, 'mantener' 1.6, 'ganancia' 2.0); grasa 27.5% de las
//                  kcal (a 9 kcal/g); carbohidrato absorbe el resto de las
//                  kcal (a 4 kcal/g), usando los gramos YA redondeados de
//                  proteína y grasa para que el reparto sea internamente
//                  consistente. Cada campo se redondea a gramo entero.
//   recomendar     distancia euclidiana normalizada entre las necesidades y
//                  cada plan, en las 4 dimensiones (kcal, proteína,
//                  carbohidrato, grasa); score = 100 / (1 + distancia),
//                  redondeado a entero; orden DESCENDENTE por score.
//
// Preámbulo obligatorio (plan.md 3.A): script clásico, IIFE, sin import/export.
(function () {
  var G = (typeof window !== 'undefined') ? window : globalThis;
  G.Herzon = G.Herzon || {};
  G.Herzon.Motor = G.Herzon.Motor || {};
  var Motor = G.Herzon.Motor;

  // -----------------------------------------------------------------------
  // Constantes internas (no se exponen: quien llama pasa `objetivo` como
  // string y el motor resuelve el ajuste/factor correspondiente).
  // Objetivos válidos: 'perdida', 'recomposicion', 'mantener', 'ganancia'.
  // -----------------------------------------------------------------------
  var AJUSTE_KCAL_POR_OBJETIVO = {
    perdida: -0.15,
    recomposicion: -0.10,
    mantener: 0,
    ganancia: 0.10
  };

  var PROTEINA_G_POR_KG_POR_OBJETIVO = {
    perdida: 1.8,
    recomposicion: 1.8,
    mantener: 1.6,
    ganancia: 2.0
  };

  var PORCENTAJE_GRASA_DE_KCAL = 0.275;
  var KCAL_POR_G_PROTEINA = 4;
  var KCAL_POR_G_CARBOHIDRATO = 4;
  var KCAL_POR_G_GRASA = 9;

  function redondear(n) {
    return Math.round(n);
  }

  function validarObjetivo(objetivo, nombreFuncion) {
    if (!Object.prototype.hasOwnProperty.call(AJUSTE_KCAL_POR_OBJETIVO, objetivo)) {
      throw new Error(
        'Herzon.Motor.' + nombreFuncion + ': objetivo inválido "' + objetivo +
        '". Valores válidos: "perdida", "recomposicion", "mantener", "ganancia".'
      );
    }
  }

  // -----------------------------------------------------------------------
  // tmb({sexo, pesoKg, tallaCm, edad}) -> número entero (kcal/día)
  // Mifflin-St Jeor. sexo: 'femenino' | 'masculino' (mismo vocabulario que
  // HERZON_DATA.paciente.sexo).
  // -----------------------------------------------------------------------
  Motor.tmb = function (perfil) {
    var sexo = perfil.sexo;
    var pesoKg = perfil.pesoKg;
    var tallaCm = perfil.tallaCm;
    var edad = perfil.edad;
    var base = 10 * pesoKg + 6.25 * tallaCm - 5 * edad;
    if (sexo === 'femenino') {
      return redondear(base - 161);
    }
    if (sexo === 'masculino') {
      return redondear(base + 5);
    }
    throw new Error('Herzon.Motor.tmb: sexo inválido "' + sexo + '". Valores válidos: "femenino", "masculino".');
  };

  // -----------------------------------------------------------------------
  // get(tmb, factor) -> número entero (kcal/día)
  // factor: factor de actividad (p.ej. 1.2 sedentario, 1.375 ligero, 1.55
  // moderado, 1.725 intenso — catálogo en HERZON_DATA.factoresActividad).
  // -----------------------------------------------------------------------
  Motor.get = function (tmb, factor) {
    return redondear(tmb * factor);
  };

  // -----------------------------------------------------------------------
  // kcalObjetivo(get, objetivo) -> número entero (kcal/día)
  // -----------------------------------------------------------------------
  Motor.kcalObjetivo = function (get, objetivo) {
    validarObjetivo(objetivo, 'kcalObjetivo');
    var ajuste = AJUSTE_KCAL_POR_OBJETIVO[objetivo];
    return redondear(get * (1 + ajuste));
  };

  // -----------------------------------------------------------------------
  // macrosObjetivo({kcal, pesoKg, objetivo}) -> {proteina_g, carbohidrato_g, grasa_g}
  // -----------------------------------------------------------------------
  Motor.macrosObjetivo = function (params) {
    var kcal = params.kcal;
    var pesoKg = params.pesoKg;
    var objetivo = params.objetivo;
    validarObjetivo(objetivo, 'macrosObjetivo');

    var proteinaGPorKg = PROTEINA_G_POR_KG_POR_OBJETIVO[objetivo];
    var proteina_g = redondear(pesoKg * proteinaGPorKg);
    var grasa_g = redondear((kcal * PORCENTAJE_GRASA_DE_KCAL) / KCAL_POR_G_GRASA);
    var kcalRestante = kcal - proteina_g * KCAL_POR_G_PROTEINA - grasa_g * KCAL_POR_G_GRASA;
    var carbohidrato_g = redondear(kcalRestante / KCAL_POR_G_CARBOHIDRATO);

    return {
      proteina_g: proteina_g,
      carbohidrato_g: carbohidrato_g,
      grasa_g: grasa_g
    };
  };

  // -----------------------------------------------------------------------
  // Formato de un delta con signo explícito: 5 -> "+5", -5 -> "-5", 0 -> "+0".
  // -----------------------------------------------------------------------
  function formatoDelta(n) {
    return (n >= 0 ? '+' + n : String(n));
  }

  // -----------------------------------------------------------------------
  // generarRazones(plan, necesidades) -> string[] en español, legibles.
  // -----------------------------------------------------------------------
  function generarRazones(plan, necesidades) {
    var deltaKcal = plan.kcalObjetivo - necesidades.kcal;
    var deltaProteina = plan.macrosTotales.proteina - necesidades.proteina_g;
    var deltaCarbohidrato = plan.macrosTotales.carbohidrato - necesidades.carbohidrato_g;
    var deltaGrasa = plan.macrosTotales.grasa - necesidades.grasa_g;

    var razones = [];
    razones.push('kcal a ' + formatoDelta(deltaKcal) + ' del objetivo');
    if (deltaProteina >= 0) {
      razones.push('proteína suficiente');
    } else {
      razones.push('proteína insuficiente (' + deltaProteina + ' g respecto al objetivo)');
    }
    razones.push('carbohidrato a ' + formatoDelta(deltaCarbohidrato) + ' g del objetivo');
    razones.push('grasa a ' + formatoDelta(deltaGrasa) + ' g del objetivo');
    return razones;
  }

  // -----------------------------------------------------------------------
  // distanciaNormalizada(necesidades, plan) -> número >= 0.
  // Euclidiana sobre las 4 dimensiones, cada una normalizada contra la
  // necesidad correspondiente (deltas relativos, no absolutos), para que
  // kcal (~1000s) y macros (~100s) pesen de forma comparable.
  // -----------------------------------------------------------------------
  function distanciaNormalizada(necesidades, plan) {
    var dKcal = (plan.kcalObjetivo - necesidades.kcal) / necesidades.kcal;
    var dProteina = (plan.macrosTotales.proteina - necesidades.proteina_g) / necesidades.proteina_g;
    var dCarbohidrato = (plan.macrosTotales.carbohidrato - necesidades.carbohidrato_g) / necesidades.carbohidrato_g;
    var dGrasa = (plan.macrosTotales.grasa - necesidades.grasa_g) / necesidades.grasa_g;
    return Math.sqrt(dKcal * dKcal + dProteina * dProteina + dCarbohidrato * dCarbohidrato + dGrasa * dGrasa);
  }

  // -----------------------------------------------------------------------
  // recomendar(necesidades, planes) -> [{plan, score, razones[]}] descendente.
  // necesidades: {kcal, proteina_g, carbohidrato_g, grasa_g} — armado por el
  // llamador combinando kcalObjetivo() y macrosObjetivo().
  // planes: arreglo de plantillas con {id, nombre, kcalObjetivo,
  // macrosTotales:{proteina, carbohidrato, grasa}} (forma de HERZON_DATA.planes,
  // Adendum R5 punto 1; nota: sin sufijo "_g" en macrosTotales).
  // score: 0-100, mayor es mejor ajuste (100 / (1 + distancia normalizada)).
  // -----------------------------------------------------------------------
  Motor.recomendar = function (necesidades, planes) {
    var resultados = [];
    for (var i = 0; i < planes.length; i++) {
      var plan = planes[i];
      var distancia = distanciaNormalizada(necesidades, plan);
      var score = redondear(100 / (1 + distancia));
      resultados.push({
        plan: plan,
        score: score,
        razones: generarRazones(plan, necesidades)
      });
    }
    resultados.sort(function (a, b) { return b.score - a.score; });
    return resultados;
  };
})();
