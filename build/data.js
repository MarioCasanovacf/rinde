/* build/data.js
 * U-DATA (T-001): objeto sintético window.HERZON_DATA.
 * Script clásico, IIFE, sin import/export, sin acceso a document en el
 * nivel superior. Forma congelada en .harness/plan.md sección 3.I.
 * Datos sintéticos: mujer, 34 años, sobrepeso grado 1, resistencia a la
 * insulina leve, alergia a nuez, objetivo recomposición corporal.
 */
(function () {
  var G = (typeof window !== 'undefined') ? window : globalThis;
  G.Herzon = G.Herzon || {};

  // ---------------------------------------------------------------------
  // Utilidades locales (no se exponen fuera de este módulo)
  // ---------------------------------------------------------------------
  function redondear(n, decimales) {
    var f = Math.pow(10, decimales || 0);
    return Math.round(n * f) / f;
  }

  function sumarCampo(lista, campo) {
    var total = 0;
    for (var i = 0; i < lista.length; i++) {
      total += lista[i][campo];
    }
    return redondear(total, 2);
  }

  function sumarArreglo(lista) {
    var total = 0;
    for (var i = 0; i < lista.length; i++) { total += lista[i]; }
    return total;
  }

  function promedio(lista) {
    return sumarArreglo(lista) / lista.length;
  }

  function formatoFecha(fechaBase, offsetDias) {
    var d = new Date(fechaBase.getTime());
    d.setUTCDate(d.getUTCDate() + offsetDias);
    var yyyy = d.getUTCFullYear();
    var mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    var dd = String(d.getUTCDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  // Divide un total (P/C/G en gramos enteros) entre N comidas según
  // proporciones que suman 1.0. La ULTIMA comida absorbe el remanente de
  // redondeo, de modo que la suma de las comidas sea EXACTAMENTE el total
  // del día (criterio de coherencia de macros).
  function dividirEntreComidas(totalGramos, proporciones) {
    var partes = [];
    var acumulado = 0;
    for (var i = 0; i < proporciones.length - 1; i++) {
      var parte = Math.round(totalGramos * proporciones[i]);
      partes.push(parte);
      acumulado += parte;
    }
    partes.push(totalGramos - acumulado);
    return partes;
  }

  function kcalAtwater(proteina_g, carbohidrato_g, grasa_g) {
    // Enteros * enteros -> entero exacto: coherencia Atwater exacta (diff 0).
    return 4 * proteina_g + 4 * carbohidrato_g + 9 * grasa_g;
  }

  function construirComida(momento, hora, nombre, proteina_g, carbohidrato_g, grasa_g, ingredientes) {
    return {
      momento: momento,
      hora: hora,
      nombre: nombre,
      proteina_g: proteina_g,
      carbohidrato_g: carbohidrato_g,
      grasa_g: grasa_g,
      kcal: kcalAtwater(proteina_g, carbohidrato_g, grasa_g),
      ingredientes: ingredientes
    };
  }

  // Plantillas de comidas por momento y por plan; se ciclan por índice de
  // día para dar variedad sin repetir el ingrediente "nuez"/"nueces"/"nogal"
  // en ningún plan (restricción de seguridad clínica: alergia a nuez).
  var PLANTILLAS = {
    estándar: {
      desayuno: [
        { nombre: 'Avena con manzana y canela', ingredientes: ['avena en hojuelas', 'manzana', 'canela', 'leche descremada'] },
        { nombre: 'Huevo revuelto con espinaca y tortilla de maíz', ingredientes: ['huevo', 'espinaca', 'tortilla de maíz', 'jitomate'] },
        { nombre: 'Yogur griego con fresa y granola', ingredientes: ['yogur griego natural', 'fresa', 'granola sin frutos secos', 'miel'] },
        { nombre: 'Molletes de frijol con queso panela', ingredientes: ['bolillo integral', 'frijol refrito', 'queso panela', 'pico de gallo'] },
        { nombre: 'Licuado de plátano con avena y proteína', ingredientes: ['plátano', 'avena', 'leche descremada', 'proteína en polvo'] },
        { nombre: 'Chilaquiles verdes con pollo deshebrado', ingredientes: ['tortilla horneada', 'salsa verde', 'pollo deshebrado', 'queso fresco'] },
        { nombre: 'Omelette de claras con champiñones', ingredientes: ['clara de huevo', 'champiñón', 'cebolla', 'pimiento'] }
      ],
      colacion_manana: [
        { nombre: 'Fruta picada con yogur natural', ingredientes: ['papaya', 'yogur natural'] },
        { nombre: 'Barrita casera de avena y plátano', ingredientes: ['avena', 'plátano', 'canela'] },
        { nombre: 'Jícama con limón y chile piquín', ingredientes: ['jícama', 'limón', 'chile piquín'] }
      ],
      comida: [
        { nombre: 'Pechuga de pollo asada con arroz y ensalada', ingredientes: ['pechuga de pollo', 'arroz integral', 'lechuga', 'jitomate', 'pepino'] },
        { nombre: 'Pescado a la plancha con verduras al vapor', ingredientes: ['filete de pescado blanco', 'brócoli', 'zanahoria', 'calabacita'] },
        { nombre: 'Bistec de res magro con nopales y frijoles', ingredientes: ['bistec de res magro', 'nopales', 'frijol de la olla', 'cebolla'] },
        { nombre: 'Tinga de pollo con arroz y verduras salteadas', ingredientes: ['pollo deshebrado', 'jitomate', 'chipotle', 'arroz integral'] },
        { nombre: 'Salmón al horno con quinoa y ejotes', ingredientes: ['salmón', 'quinoa', 'ejotes', 'limón'] },
        { nombre: 'Milanesa de pollo horneada con ensalada de espinaca', ingredientes: ['pechuga de pollo empanizada al horno', 'espinaca', 'jitomate cherry'] },
        { nombre: 'Sopa de lentejas con verduras y pechuga', ingredientes: ['lentejas', 'zanahoria', 'apio', 'pechuga de pollo'] }
      ],
      colacion_tarde: [
        { nombre: 'Queso panela con jícama', ingredientes: ['queso panela', 'jícama'] },
        { nombre: 'Yogur griego con chía', ingredientes: ['yogur griego natural', 'semillas de chía'] },
        { nombre: 'Edamame al vapor con sal', ingredientes: ['edamame', 'sal de mar'] }
      ],
      cena: [
        { nombre: 'Ensalada de atún con verduras frescas', ingredientes: ['atún en agua', 'lechuga', 'pepino', 'jitomate'] },
        { nombre: 'Crema de calabaza con pechuga deshebrada', ingredientes: ['calabaza', 'caldo de pollo', 'pechuga deshebrada'] },
        { nombre: 'Tostadas de pollo con lechuga y aguacate', ingredientes: ['tostada horneada', 'pollo deshebrado', 'lechuga', 'aguacate'] },
        { nombre: 'Omelette de verduras con queso panela', ingredientes: ['huevo', 'pimiento', 'cebolla', 'queso panela'] },
        { nombre: 'Sopa de verduras con tofu', ingredientes: ['calabacita', 'zanahoria', 'apio', 'tofu'] },
        { nombre: 'Rollos de jícama con pollo y aguacate', ingredientes: ['jícama', 'pollo deshebrado', 'aguacate', 'limón'] },
        { nombre: 'Ensalada de garbanzo con verduras asadas', ingredientes: ['garbanzo', 'pimiento asado', 'calabacita', 'cebolla morada'] }
      ]
    },
    bajoCarbohidratos: {
      desayuno: [
        { nombre: 'Huevos revueltos con aguacate y jitomate', ingredientes: ['huevo', 'aguacate', 'jitomate'] },
        { nombre: 'Omelette de champiñones con queso panela', ingredientes: ['huevo', 'champiñón', 'queso panela'] },
        { nombre: 'Yogur griego natural con chía y canela', ingredientes: ['yogur griego natural', 'semillas de chía', 'canela'] },
        { nombre: 'Claras con espinaca y aguacate', ingredientes: ['clara de huevo', 'espinaca', 'aguacate'] },
        { nombre: 'Chapata baja en carbohidratos con jamón de pavo y queso', ingredientes: ['pan bajo en carbohidratos', 'jamón de pavo', 'queso panela'] },
        { nombre: 'Licuado de espinaca con proteína y leche de almendra', ingredientes: ['espinaca', 'proteína en polvo', 'leche de almendra sin azúcar'] },
        { nombre: 'Huevos estrellados con nopales asados', ingredientes: ['huevo', 'nopal asado', 'queso fresco'] }
      ],
      colacion_manana: [
        { nombre: 'Queso panela con pepino', ingredientes: ['queso panela', 'pepino'] },
        { nombre: 'Aceitunas y jícama', ingredientes: ['aceituna', 'jícama'] },
        { nombre: 'Yogur griego natural sin azúcar', ingredientes: ['yogur griego natural'] }
      ],
      comida: [
        { nombre: 'Pechuga de pollo a la plancha con ensalada verde', ingredientes: ['pechuga de pollo', 'lechuga', 'pepino', 'aceite de oliva'] },
        { nombre: 'Salmón al horno con espárragos', ingredientes: ['salmón', 'espárrago', 'limón'] },
        { nombre: 'Bistec de res magro con ensalada de nopales', ingredientes: ['bistec de res magro', 'nopales', 'cebolla', 'cilantro'] },
        { nombre: 'Pescado empapelado con calabacita y pimiento', ingredientes: ['filete de pescado blanco', 'calabacita', 'pimiento'] },
        { nombre: 'Ensalada de pollo con aguacate y queso panela', ingredientes: ['pollo deshebrado', 'aguacate', 'queso panela', 'lechuga'] },
        { nombre: 'Camarones salteados con brócoli', ingredientes: ['camarón', 'brócoli', 'ajo', 'aceite de oliva'] },
        { nombre: 'Milanesa de res a la plancha con ensalada de espinaca', ingredientes: ['bistec de res magro', 'espinaca', 'jitomate cherry'] }
      ],
      colacion_tarde: [
        { nombre: 'Rebanadas de pepino con queso panela', ingredientes: ['pepino', 'queso panela'] },
        { nombre: 'Guacamole con jícama', ingredientes: ['aguacate', 'jícama', 'limón'] },
        { nombre: 'Huevo cocido con sal de mar', ingredientes: ['huevo cocido', 'sal de mar'] }
      ],
      cena: [
        { nombre: 'Ensalada de atún con aguacate', ingredientes: ['atún en agua', 'aguacate', 'lechuga'] },
        { nombre: 'Crema de brócoli con pechuga deshebrada', ingredientes: ['brócoli', 'caldo de pollo', 'pechuga deshebrada'] },
        { nombre: 'Tortitas de pollo con ensalada verde', ingredientes: ['pollo molido', 'huevo', 'lechuga'] },
        { nombre: 'Omelette de queso panela con espinaca', ingredientes: ['huevo', 'queso panela', 'espinaca'] },
        { nombre: 'Sopa de verduras con tofu firme', ingredientes: ['calabacita', 'apio', 'tofu firme'] },
        { nombre: 'Rollos de jamón de pavo y queso con jitomate', ingredientes: ['jamón de pavo', 'queso panela', 'jitomate'] },
        { nombre: 'Ensalada de camarón con aguacate y pepino', ingredientes: ['camarón', 'aguacate', 'pepino', 'limón'] }
      ]
    },
    vegetariana: {
      desayuno: [
        { nombre: 'Avena con plátano y semillas de chía', ingredientes: ['avena en hojuelas', 'plátano', 'semillas de chía', 'leche descremada'] },
        { nombre: 'Huevo revuelto con champiñón y espinaca', ingredientes: ['huevo', 'champiñón', 'espinaca', 'tortilla de maíz'] },
        { nombre: 'Yogur natural con granola y fresa', ingredientes: ['yogur natural', 'granola sin frutos secos', 'fresa'] },
        { nombre: 'Molletes de frijol con queso panela', ingredientes: ['bolillo integral', 'frijol refrito', 'queso panela', 'pico de gallo'] },
        { nombre: 'Licuado de espinaca con plátano y proteína vegetal', ingredientes: ['espinaca', 'plátano', 'leche de soya', 'proteína vegetal en polvo'] },
        { nombre: 'Omelette de claras con jitomate y queso panela', ingredientes: ['clara de huevo', 'jitomate', 'queso panela'] }
      ],
      colacion_manana: [
        { nombre: 'Fruta picada con yogur natural', ingredientes: ['papaya', 'yogur natural'] },
        { nombre: 'Jícama con limón y chile piquín', ingredientes: ['jícama', 'limón', 'chile piquín'] },
        { nombre: 'Queso panela con manzana', ingredientes: ['queso panela', 'manzana'] }
      ],
      comida: [
        { nombre: 'Frijoles con arroz y verduras salteadas', ingredientes: ['frijol de la olla', 'arroz integral', 'calabacita', 'zanahoria'] },
        { nombre: 'Tacos de tofu al pastor con piña', ingredientes: ['tofu firme', 'achiote', 'piña', 'tortilla de maíz'] },
        { nombre: 'Lentejas guisadas con verduras y arroz', ingredientes: ['lentejas', 'jitomate', 'zanahoria', 'arroz integral'] },
        { nombre: 'Ensalada de garbanzo con verduras asadas', ingredientes: ['garbanzo', 'pimiento asado', 'calabacita', 'cebolla morada'] },
        { nombre: 'Enchiladas de queso panela con salsa verde', ingredientes: ['tortilla de maíz', 'queso panela', 'salsa verde', 'crema light'] },
        { nombre: 'Chile relleno de queso al horno con ensalada', ingredientes: ['chile poblano', 'queso panela', 'jitomate', 'lechuga'] }
      ],
      colacion_tarde: [
        { nombre: 'Queso panela con jícama', ingredientes: ['queso panela', 'jícama'] },
        { nombre: 'Yogur griego con chía', ingredientes: ['yogur griego natural', 'semillas de chía'] },
        { nombre: 'Edamame al vapor con sal', ingredientes: ['edamame', 'sal de mar'] }
      ],
      cena: [
        { nombre: 'Sopa de verduras con tofu', ingredientes: ['calabacita', 'zanahoria', 'apio', 'tofu'] },
        { nombre: 'Omelette de verduras con queso panela', ingredientes: ['huevo', 'pimiento', 'cebolla', 'queso panela'] },
        { nombre: 'Ensalada de garbanzo con aguacate', ingredientes: ['garbanzo', 'aguacate', 'jitomate', 'lechuga'] },
        { nombre: 'Quesadillas de champiñón con salsa', ingredientes: ['tortilla de maíz', 'champiñón', 'queso panela', 'salsa roja'] },
        { nombre: 'Crema de calabaza con crotones integrales', ingredientes: ['calabaza', 'caldo de verduras', 'pan integral'] },
        { nombre: 'Tostadas de frijol con aguacate', ingredientes: ['tostada horneada', 'frijol refrito', 'aguacate', 'lechuga'] }
      ]
    },
    altaProteina: {
      desayuno: [
        { nombre: 'Claras revueltas con queso panela y espinaca', ingredientes: ['clara de huevo', 'queso panela', 'espinaca'] },
        { nombre: 'Yogur griego con proteína en polvo y fresa', ingredientes: ['yogur griego natural', 'proteína en polvo', 'fresa'] },
        { nombre: 'Omelette de tres claras con jamón de pavo', ingredientes: ['clara de huevo', 'jamón de pavo', 'jitomate'] },
        { nombre: 'Licuado de proteína con avena y plátano', ingredientes: ['proteína en polvo', 'avena', 'plátano', 'leche descremada'] },
        { nombre: 'Huevo entero con requesón y tortilla de maíz', ingredientes: ['huevo', 'requesón', 'tortilla de maíz'] },
        { nombre: 'Panque proteico de claras y avena', ingredientes: ['clara de huevo', 'avena', 'canela'] }
      ],
      colacion_manana: [
        { nombre: 'Claras de huevo cocidas con sal de mar', ingredientes: ['clara de huevo cocida', 'sal de mar'] },
        { nombre: 'Yogur griego natural sin azúcar', ingredientes: ['yogur griego natural'] },
        { nombre: 'Queso cottage con pepino', ingredientes: ['queso cottage', 'pepino'] }
      ],
      comida: [
        { nombre: 'Pechuga de pollo a la plancha con arroz y ensalada', ingredientes: ['pechuga de pollo', 'arroz integral', 'lechuga', 'jitomate'] },
        { nombre: 'Atún sellado con quinoa y ejotes', ingredientes: ['atún fresco', 'quinoa', 'ejotes'] },
        { nombre: 'Bistec de res magro con claras revueltas y nopales', ingredientes: ['bistec de res magro', 'clara de huevo', 'nopales'] },
        { nombre: 'Milanesa de pollo horneada con puré de camote', ingredientes: ['pechuga de pollo empanizada al horno', 'camote', 'ensalada verde'] },
        { nombre: 'Salmón al horno con espárragos y arroz', ingredientes: ['salmón', 'espárrago', 'arroz integral'] },
        { nombre: 'Camarones a la plancha con verduras salteadas', ingredientes: ['camarón', 'brócoli', 'pimiento', 'ajo'] }
      ],
      colacion_tarde: [
        { nombre: 'Queso cottage con fresa', ingredientes: ['queso cottage', 'fresa'] },
        { nombre: 'Rollos de jamón de pavo con queso panela', ingredientes: ['jamón de pavo', 'queso panela'] },
        { nombre: 'Yogur griego con proteína en polvo', ingredientes: ['yogur griego natural', 'proteína en polvo'] }
      ],
      cena: [
        { nombre: 'Ensalada de atún con claras de huevo', ingredientes: ['atún en agua', 'clara de huevo', 'lechuga', 'pepino'] },
        { nombre: 'Tortitas de pollo molido con ensalada verde', ingredientes: ['pollo molido', 'huevo', 'lechuga'] },
        { nombre: 'Crema de brócoli con pechuga deshebrada', ingredientes: ['brócoli', 'caldo de pollo', 'pechuga deshebrada'] },
        { nombre: 'Omelette de claras con queso panela y jamón de pavo', ingredientes: ['clara de huevo', 'queso panela', 'jamón de pavo'] },
        { nombre: 'Filete de pescado a la plancha con verduras al vapor', ingredientes: ['filete de pescado blanco', 'calabacita', 'zanahoria'] },
        { nombre: 'Rollitos de jícama con atún y aguacate', ingredientes: ['jícama', 'atún en agua', 'aguacate'] }
      ]
    },
    sinLacteos: {
      desayuno: [
        { nombre: 'Avena con manzana y canela con leche de almendra', ingredientes: ['avena en hojuelas', 'manzana', 'canela', 'leche de almendra sin azúcar'] },
        { nombre: 'Huevo revuelto con espinaca y aguacate', ingredientes: ['huevo', 'espinaca', 'aguacate'] },
        { nombre: 'Licuado de plátano con proteína y leche de coco', ingredientes: ['plátano', 'proteína en polvo', 'leche de coco sin azúcar'] },
        { nombre: 'Tostadas de aguacate con huevo poché', ingredientes: ['pan integral', 'aguacate', 'huevo poché'] },
        { nombre: 'Chilaquiles verdes con pollo deshebrado', ingredientes: ['tortilla horneada', 'salsa verde', 'pollo deshebrado'] },
        { nombre: 'Omelette de claras con champiñón y jitomate', ingredientes: ['clara de huevo', 'champiñón', 'jitomate'] }
      ],
      colacion_manana: [
        { nombre: 'Jícama con limón y chile piquín', ingredientes: ['jícama', 'limón', 'chile piquín'] },
        { nombre: 'Barrita casera de avena y plátano', ingredientes: ['avena', 'plátano', 'canela'] },
        { nombre: 'Aceitunas con jícama', ingredientes: ['aceituna', 'jícama'] }
      ],
      comida: [
        { nombre: 'Pechuga de pollo asada con arroz y ensalada', ingredientes: ['pechuga de pollo', 'arroz integral', 'lechuga', 'jitomate'] },
        { nombre: 'Pescado a la plancha con verduras al vapor', ingredientes: ['filete de pescado blanco', 'brócoli', 'zanahoria', 'calabacita'] },
        { nombre: 'Bistec de res magro con nopales y frijoles', ingredientes: ['bistec de res magro', 'nopales', 'frijol de la olla'] },
        { nombre: 'Camarones salteados con brócoli y aceite de oliva', ingredientes: ['camarón', 'brócoli', 'ajo', 'aceite de oliva'] },
        { nombre: 'Tinga de pollo con arroz y verduras salteadas', ingredientes: ['pollo deshebrado', 'jitomate', 'chipotle', 'arroz integral'] },
        { nombre: 'Salmón al horno con quinoa y ejotes', ingredientes: ['salmón', 'quinoa', 'ejotes'] }
      ],
      colacion_tarde: [
        { nombre: 'Guacamole con jícama', ingredientes: ['aguacate', 'jícama', 'limón'] },
        { nombre: 'Edamame al vapor con sal', ingredientes: ['edamame', 'sal de mar'] },
        { nombre: 'Huevo cocido con sal de mar', ingredientes: ['huevo cocido', 'sal de mar'] }
      ],
      cena: [
        { nombre: 'Ensalada de atún con aguacate', ingredientes: ['atún en agua', 'aguacate', 'lechuga'] },
        { nombre: 'Sopa de verduras con tofu', ingredientes: ['calabacita', 'zanahoria', 'apio', 'tofu'] },
        { nombre: 'Tostadas de pollo con lechuga y aguacate', ingredientes: ['tostada horneada', 'pollo deshebrado', 'lechuga', 'aguacate'] },
        { nombre: 'Crema de calabaza con pechuga deshebrada', ingredientes: ['calabaza', 'caldo de pollo', 'pechuga deshebrada'] },
        { nombre: 'Rollos de jícama con pollo y aguacate', ingredientes: ['jícama', 'pollo deshebrado', 'aguacate', 'limón'] },
        { nombre: 'Omelette de claras con verduras', ingredientes: ['clara de huevo', 'pimiento', 'cebolla'] }
      ]
    }
  };

  var HORAS_5 = { desayuno: '07:30', colacion_manana: '10:30', comida: '14:00', colacion_tarde: '17:30', cena: '20:30' };
  var HORAS_4 = { desayuno: '08:00', comida: '14:00', colacion_tarde: '17:30', cena: '20:30' };

  // Factores diarios de variacion, promedio EXACTO 1.0, para que el
  // promedio semanal de kcal se mantenga dentro de +/-3% de kcalObjetivo.
  var FACTORES_DIA = [1.00, 0.97, 1.03, 0.99, 1.05, 0.95, 1.01];

  function construirDia(numeroDia, factor, plantillas, macrosBase, usarCincoComidas) {
    var pDia = Math.round(macrosBase.proteina_g * factor);
    var cDia = Math.round(macrosBase.carbohidrato_g * factor);
    var gDia = Math.round(macrosBase.grasa_g * factor);

    var momentos = usarCincoComidas
      ? ['desayuno', 'colacion_manana', 'comida', 'colacion_tarde', 'cena']
      : ['desayuno', 'comida', 'colacion_tarde', 'cena'];
    var proporciones = usarCincoComidas
      ? [0.25, 0.10, 0.30, 0.10, 0.25]
      : [0.30, 0.35, 0.10, 0.25];
    var horas = usarCincoComidas ? HORAS_5 : HORAS_4;

    var partesP = dividirEntreComidas(pDia, proporciones);
    var partesC = dividirEntreComidas(cDia, proporciones);
    var partesG = dividirEntreComidas(gDia, proporciones);

    var comidas = [];
    for (var i = 0; i < momentos.length; i++) {
      var momento = momentos[i];
      var lista = plantillas[momento];
      var plantilla = lista[(numeroDia - 1 + i) % lista.length];
      comidas.push(construirComida(
        momento,
        horas[momento],
        plantilla.nombre,
        partesP[i],
        partesC[i],
        partesG[i],
        plantilla.ingredientes
      ));
    }

    var totales = {
      kcal: sumarCampo(comidas, 'kcal'),
      proteina_g: sumarCampo(comidas, 'proteina_g'),
      carbohidrato_g: sumarCampo(comidas, 'carbohidrato_g'),
      grasa_g: sumarCampo(comidas, 'grasa_g')
    };

    return { dia: numeroDia, comidas: comidas, totales: totales };
  }

  // etiquetas/descripción: metadatos R5 (Adendum R5 punto 1). macrosTotales
  // es un ESPEJO de macrosBase con claves cortas (sin sufijo "_g"), pensado
  // para lectura directa en tarjetas/documentos; no introduce una segunda
  // fuente de verdad, siempre deriva de macrosBase.
  function construirPlan(id, nombre, kcalObjetivo, macrosBase, plantillas, indicadoPara, etiquetas, descripcion) {
    var dias = [];
    for (var d = 1; d <= 7; d++) {
      // Días impares (1,3,5,7): 5 comidas. Días pares (2,4,6): 4 comidas.
      var cincoComidas = (d % 2) === 1;
      dias.push(construirDia(d, FACTORES_DIA[d - 1], plantillas, macrosBase, cincoComidas));
    }
    return {
      id: id,
      nombre: nombre,
      kcalObjetivo: kcalObjetivo,
      macrosObjetivo: macrosBase,
      macrosTotales: {
        proteina: macrosBase.proteina_g,
        carbohidrato: macrosBase.carbohidrato_g,
        grasa: macrosBase.grasa_g
      },
      etiquetas: etiquetas,
      descripcion: descripcion,
      indicadoPara: indicadoPara,
      dias: dias
    };
  }

  // ---------------------------------------------------------------------
  // Fechas: 12 semanas (cadencia semanal) sobre 84 días consecutivos.
  // ---------------------------------------------------------------------
  var FECHA_INICIO = new Date(Date.UTC(2026, 2, 2)); // 2026-03-02 (lunes)

  var semanas = [];
  var fechasSemanales = [];
  for (var s = 1; s <= 12; s++) {
    semanas.push(s);
    fechasSemanales.push(formatoFecha(FECHA_INICIO, (s - 1) * 7));
  }

  // ---------------------------------------------------------------------
  // Series antropométricas (12 semanas), diseñadas para narrar una
  // tendencia clínicamente realista de recomposición corporal.
  // ---------------------------------------------------------------------
  var peso_kg = [75.0, 74.2, 73.5, 73.4, 72.7, 72.6, 72.0, 71.5, 71.4, 70.9, 70.5, 70.2];
  var grasa_pct = [34.5, 34.2, 33.8, 33.6, 33.1, 32.9, 32.4, 32.0, 31.8, 31.3, 31.0, 30.6];
  var musculo_kg = [27.0, 27.0, 27.1, 27.1, 27.2, 27.2, 27.3, 27.3, 27.4, 27.4, 27.5, 27.5];
  var cintura_cm = [92.0, 91.5, 91.0, 90.6, 90.0, 89.5, 89.0, 88.6, 88.0, 87.5, 87.0, 86.5];
  var adherenciaDieta_pct = [88, 84, 76, 60, 90, 85, 63, 79, 82, 58, 81, 87];

  // ---------------------------------------------------------------------
  // Adherencia diaria (84 días consecutivos), derivada de la adherencia
  // semanal con una oscilación diaria determinística (sin Math.random,
  // para que el dato sea reproducible entre corridas del selfcheck).
  // ---------------------------------------------------------------------
  var suplementosAdherenciaPromedio = 0; // se recalcula tras definir suplementos, ver abajo
  var ONDA = [0, 6, -4, 8, -8, 3, -3];

  function limitar(v) {
    return Math.max(0, Math.min(100, v));
  }

  // ---------------------------------------------------------------------
  // Suplementos (régimen personal, sin catálogo).
  // ---------------------------------------------------------------------
  var suplementos = [
    {
      nombre: 'Omega-3 (aceite de pescado)',
      dosis: '1000 mg',
      horario: '08:00',
      momento: 'con el desayuno',
      proposito: 'Apoyo cardiovascular y control de triglicéridos',
      adherencia_pct: 88,
      adherenciaSemanal_pct: [92, 90, 88, 85, 91, 89, 84, 87, 90, 86, 88, 91],
      desde: fechasSemanales[0]
    },
    {
      nombre: 'Vitamina D3',
      dosis: '2000 UI',
      horario: '14:00',
      momento: 'con la comida',
      proposito: 'Soporte óseo e inmunológico',
      adherencia_pct: 91,
      adherenciaSemanal_pct: [95, 94, 92, 90, 93, 91, 88, 92, 94, 89, 90, 93],
      desde: fechasSemanales[0]
    },
    {
      nombre: 'Magnesio quelado',
      dosis: '300 mg',
      horario: '21:30',
      momento: 'antes de dormir',
      proposito: 'Relajación muscular y apoyo al sueño',
      adherencia_pct: 63,
      adherenciaSemanal_pct: [70, 65, 60, 55, 68, 62, 50, 58, 66, 54, 63, 69],
      desde: fechasSemanales[0]
    },
    {
      nombre: 'Probiótico multiflora',
      dosis: '1 cápsula',
      horario: '07:00',
      momento: 'en ayunas',
      proposito: 'Salud digestiva',
      adherencia_pct: 70,
      adherenciaSemanal_pct: [75, 72, 68, 66, 74, 71, 60, 69, 73, 62, 70, 76],
      desde: fechasSemanales[0]
    }
  ];

  var adherenciaDiaria = [];
  for (var dGlobal = 0; dGlobal < 84; dGlobal++) {
    var semanaIdx = Math.floor(dGlobal / 7);
    var diaDeSemana = dGlobal % 7;
    var baseDieta = adherenciaDieta_pct[semanaIdx];
    var baseSup = promedio(suplementos.map(function (s) { return s.adherenciaSemanal_pct[semanaIdx]; }));
    adherenciaDiaria.push({
      fecha: formatoFecha(FECHA_INICIO, dGlobal),
      dieta_pct: limitar(Math.round(baseDieta + ONDA[diaDeSemana])),
      suplementos_pct: limitar(Math.round(baseSup + ONDA[(diaDeSemana + 3) % 7]))
    });
  }

  // ---------------------------------------------------------------------
  // Perfil del paciente sintético.
  // ---------------------------------------------------------------------
  var talla_cm = 162;
  var talla_m = talla_cm / 100;
  var pesoInicial_kg = peso_kg[0];
  var pesoActual_kg = peso_kg[11];
  var imcInicial = redondear(pesoInicial_kg / (talla_m * talla_m), 1);
  var imcActual = redondear(pesoActual_kg / (talla_m * talla_m), 1);
  var edad = 34;
  // Mifflin-St Jeor (mujer): TMB = 10*peso + 6.25*talla - 5*edad - 161
  var tmb_kcal = Math.round(10 * pesoInicial_kg + 6.25 * talla_cm - 5 * edad - 161);
  var get_kcal = Math.round(tmb_kcal * 1.375); // actividad ligera

  var paciente = {
    nombre: 'Daniela Reyes Cortez',
    edad: edad,
    sexo: 'femenino',
    talla_cm: talla_cm,
    pesoInicial_kg: pesoInicial_kg,
    pesoActual_kg: pesoActual_kg,
    imcInicial: imcInicial,
    imcActual: imcActual,
    objetivo: 'Recomposición corporal',
    diagnosticos: [
      { clave: 'sobrepeso_g1', etiqueta: 'Sobrepeso grado 1', severidad: 'moderada' },
      { clave: 'resistencia_insulina', etiqueta: 'Resistencia a la insulina leve', severidad: 'leve' }
    ],
    alergias: ['nuez'],
    restricciones: [],
    gastoEnergetico: { tmb_kcal: tmb_kcal, get_kcal: get_kcal },
    inicio: fechasSemanales[0]
  };

  // ---------------------------------------------------------------------
  // Laboratorios: 3 cortes (basal, seguimiento, final), alineados a las
  // semanas 1, 6 y 12 de la serie.
  // ---------------------------------------------------------------------
  var labs = {
    cortes: [
      { etiqueta: 'Basal', fecha: fechasSemanales[0] },
      { etiqueta: 'Seguimiento', fecha: fechasSemanales[5] },
      { etiqueta: 'Final', fecha: fechasSemanales[11] }
    ],
    marcadores: [
      { clave: 'glucosa_ayuno', nombre: 'Glucosa en ayuno', unidad: 'mg/dL', referencia: { min: 70, max: 99 }, valores: [104, 98, 91], mejorSi: 'menor' },
      { clave: 'hba1c', nombre: 'Hemoglobina glucosilada (HbA1c)', unidad: '%', referencia: { min: 4.0, max: 5.6 }, valores: [5.8, 5.6, 5.4], mejorSi: 'menor' },
      { clave: 'homa_ir', nombre: 'HOMA-IR', unidad: 'índice', referencia: { min: 0.5, max: 2.5 }, valores: [3.2, 2.6, 2.1], mejorSi: 'menor' },
      { clave: 'colesterol_total', nombre: 'Colesterol total', unidad: 'mg/dL', referencia: { min: 125, max: 200 }, valores: [210, 198, 185], mejorSi: 'menor' },
      { clave: 'ldl', nombre: 'Colesterol LDL', unidad: 'mg/dL', referencia: { min: 0, max: 100 }, valores: [135, 120, 105], mejorSi: 'menor' },
      { clave: 'hdl', nombre: 'Colesterol HDL', unidad: 'mg/dL', referencia: { min: 40, max: 60 }, valores: [42, 46, 50], mejorSi: 'mayor' },
      { clave: 'trigliceridos', nombre: 'Triglicéridos', unidad: 'mg/dL', referencia: { min: 0, max: 150 }, valores: [178, 155, 132], mejorSi: 'menor' }
    ]
  };

  // ---------------------------------------------------------------------
  // Plicometría (R4, feedback de Mario): clave ADITIVA. 4 cortes S1/S4/S8/
  // S12 (alineados a las semanas 1, 4, 8 y 12 de la serie), 4 sitios
  // (tricipital, subescapular, suprailíaco, abdominal) en milímetros. La
  // suma de pliegues por corte desciende de forma gradual (sin quiebres),
  // en el mismo sentido y con magnitud proporcional razonable respecto a
  // la caída de grasa_pct entre esas mismas semanas.
  // ---------------------------------------------------------------------
  var plicometriaSitios = [
    { clave: 'tricipital', nombre: 'Tricipital', valores_mm: [28, 27, 25, 23] },
    { clave: 'subescapular', nombre: 'Subescapular', valores_mm: [24, 23, 21, 20] },
    { clave: 'suprailiaco', nombre: 'Suprailíaco', valores_mm: [26, 25, 23, 21] },
    { clave: 'abdominal', nombre: 'Abdominal', valores_mm: [32, 31, 30, 28] }
  ];

  var sumaPliegues_mm = [];
  for (var pcx = 0; pcx < 4; pcx++) {
    var totalCorte = 0;
    for (var psx = 0; psx < plicometriaSitios.length; psx++) {
      totalCorte += plicometriaSitios[psx].valores_mm[pcx];
    }
    sumaPliegues_mm.push(totalCorte);
  }

  var plicometria = {
    unidad: 'mm',
    cortes: ['S1', 'S4', 'S8', 'S12'],
    sitios: plicometriaSitios,
    sumaPliegues_mm: sumaPliegues_mm
  };

  // ---------------------------------------------------------------------
  // Factores de actividad (R5, Adendum R5 punto 1): multiplicadores fijos
  // sobre la TMB para obtener el gasto energético total (GET); los usa
  // build/motor_recomendacion.js (T-020) vía su propia función get().
  // ---------------------------------------------------------------------
  var factoresActividad = {
    sedentario: 1.2,
    ligero: 1.375,
    moderado: 1.55,
    intenso: 1.725
  };

  // ---------------------------------------------------------------------
  // Planes de dieta (R5: catálogo de 5 plantillas, sin frutos secos de
  // árbol por alergia). Las 2 primeras son las plantillas originales: NO
  // cambian de forma ni de valores, solo ganan metadatos (macrosTotales,
  // etiquetas, descripción). Las 3 siguientes son plantillas nuevas.
  // ---------------------------------------------------------------------
  var planes = [
    construirPlan(
      'estandar_1600',
      'Plan Estándar',
      1600,
      { proteina_g: 120, carbohidrato_g: 160, grasa_g: 53 },
      PLANTILLAS.estándar,
      { objetivo: ['recomposicion_corporal', 'control_glucemico'], restriccion: ['sin_frutos_secos_de_arbol'] },
      ['estandar', 'equilibrado'],
      'Plan equilibrado de macronutrientes con variedad de proteína animal y vegetal, pensado como punto de partida general.'
    ),
    construirPlan(
      'bajo_carbohidratos_1550',
      'Plan Bajo en Carbohidratos',
      1550,
      { proteina_g: 132, carbohidrato_g: 92, grasa_g: 71 },
      PLANTILLAS.bajoCarbohidratos,
      { objetivo: ['control_glucemico', 'recomposicion_corporal'], restriccion: ['bajo_en_carbohidratos', 'sin_frutos_secos_de_arbol'] },
      ['bajo-carbohidrato', 'control-glucemico'],
      'Plan con carbohidratos reducidos y proteína elevada, orientado a mejorar el control glucémico.'
    ),
    construirPlan(
      'vegetariano_1550',
      'Plan Vegetariano',
      1550,
      { proteina_g: 95, carbohidrato_g: 180, grasa_g: 50 },
      PLANTILLAS.vegetariana,
      { objetivo: ['recomposicion_corporal', 'mantenimiento'], restriccion: ['vegetariano', 'sin_frutos_secos_de_arbol'] },
      ['vegetariana', 'sin-carne'],
      'Plan sin carne ni pescado, con proteína de huevo, lácteos, leguminosas y tofu, y carbohidratos moderados.'
    ),
    construirPlan(
      'alta_proteina_1650',
      'Plan Alta Proteína',
      1650,
      { proteina_g: 150, carbohidrato_g: 135, grasa_g: 56 },
      PLANTILLAS.altaProteina,
      { objetivo: ['recomposicion_corporal', 'ganancia_muscular'], restriccion: ['sin_frutos_secos_de_arbol'] },
      ['alta-proteina', 'recomposicion-corporal'],
      'Plan con aporte de proteína elevado por kilogramo de peso, orientado a preservar masa muscular durante la recomposición corporal.'
    ),
    construirPlan(
      'sin_lacteos_1600',
      'Plan Sin Lácteos',
      1600,
      { proteina_g: 125, carbohidrato_g: 150, grasa_g: 58 },
      PLANTILLAS.sinLacteos,
      { objetivo: ['recomposicion_corporal', 'control_glucemico'], restriccion: ['sin_lacteos', 'sin_frutos_secos_de_arbol'] },
      ['sin-lacteos', 'sin-frutos-secos'],
      'Plan sin lácteos, con bebidas vegetales y quesos sustituidos por otras fuentes de proteína, mismo perfil calórico que el plan estándar.'
    )
  ];

  // ---------------------------------------------------------------------
  // Rutina de entrenamiento (R10, contrato R-04): rutina demo de Daniela,
  // 4 días, tupla literal por ejercicio (nombre, series, repeticiones,
  // descanso_s, notas), copiada del documento sin parafrasear. `actualizado`
  // coincide con el inicio del seguimiento sintético (fechasSemanales[0]).
  // Es dato de la DEMO: build/almacen.js jamás escribe este slot para un
  // cliente real a partir de esta constante (R-02, MC-05).
  // ---------------------------------------------------------------------
  var rutina = {
    actualizado: fechasSemanales[0],
    dias: [
      {
        dia: 1,
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
        dia: 2,
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
        dia: 3,
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
        dia: 4,
        titulo: 'Acondicionamiento y movilidad',
        ejercicios: [
          { nombre: 'Caminata inclinada en caminadora', series: 1, repeticiones: '30 min', descanso_s: null, notas: 'Ritmo que permita hablar con frases cortas.' },
          { nombre: 'Bicicleta estática en intervalos suaves', series: 10, repeticiones: '1 min rápido / 1 min lento', descanso_s: null, notas: 'Opcional según la fatiga de la semana.' },
          { nombre: 'Movilidad de cadera y tobillo', series: 1, repeticiones: '10 min', descanso_s: null, notas: '' },
          { nombre: 'Estiramiento general', series: 1, repeticiones: '10 min', descanso_s: null, notas: '' }
        ]
      }
    ]
  };

  // ---------------------------------------------------------------------
  // Meta y supuestos.
  // ---------------------------------------------------------------------
  var meta = {
    periodoSemanas: 12,
    unidades: {
      peso: 'kg',
      talla: 'cm',
      cintura: 'cm',
      energia: 'kcal',
      proteina: 'g',
      carbohidrato: 'g',
      grasa: 'g',
      glucosa: 'mg/dL',
      hba1c: '%',
      colesterol: 'mg/dL',
      trigliceridos: 'mg/dL'
    },
    generado: 'sintetico',
    // PR-06 (R9): esta es la nota de MODO DEMO. La nota del cliente real vive
    // en build/almacen.js (NOTA_META_REAL) y sobrescribe esta en
    // montarObjetoCompleto — un documento de un cliente real del CECAD JAMÁS
    // sale firmado con este texto.
    nota: 'Documento generado en modo demo con datos de ejemplo; no representa a una paciente real ni debe usarse para decisiones clínicas.'
  };

  // PR-04 (R9): reemplazo íntegro del array anterior. Título "Acerca del
  // modo demo" lo monta build/vista_metricas.js SOLO en modo demo; el
  // supuesto 5 anterior ("esta demo no persiste información") era falso
  // desde R8 (Herzon.Almacen sí persiste en modo real) y queda corregido.
  var supuestos = [
    'Estás viendo el modo demo: un caso de ejemplo (Daniela Reyes Cortez) cuyos datos no corresponden a una paciente real.',
    'Los planes de dieta son plantillas pre-armadas; el recomendador las ordena y ajusta según los datos capturados, no genera planes nuevos.',
    'Las series de seguimiento del ejemplo (peso, composición corporal, laboratorios) ilustran una tendencia plausible de recomposición corporal; no son un caso clínico validado.',
    'El régimen de suplementos del ejemplo es ilustrativo y no constituye una recomendación médica.',
    'El modo demo no guarda cambios; con el botón Usar mis datos, la información capturada sí se guarda en este dispositivo.'
  ];

  // ---------------------------------------------------------------------
  // Publicación: SOLO window.HERZON_DATA.
  // ---------------------------------------------------------------------
  G.HERZON_DATA = {
    meta: meta,
    paciente: paciente,
    series: {
      semanas: semanas,
      fechas: fechasSemanales,
      peso_kg: peso_kg,
      grasa_pct: grasa_pct,
      musculo_kg: musculo_kg,
      cintura_cm: cintura_cm,
      adherenciaDieta_pct: adherenciaDieta_pct,
      adherenciaDiaria: adherenciaDiaria
    },
    labs: labs,
    plicometria: plicometria,
    planes: planes,
    factoresActividad: factoresActividad,
    suplementos: suplementos,
    supuestos: supuestos,
    rutina: rutina
  };
})();
