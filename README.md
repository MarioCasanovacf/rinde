# Rinde — CECAD

Rinde: aplicacion de entrenamiento y nutricion del CECAD para poner a la gente
saludable y ejercitada. Plan de dieta personalizado, seguimiento de metricas
con graficas, suplementos, recomendador de plantillas por calculo de
macronutrientes (Mifflin-St Jeor) y generacion de documentos (impresion a PDF,
descarga de plan y datos, importacion de mediciones CSV).

Nota tecnica: el namespace interno del codigo conserva el nombre historico
(`Herzon.*`, `HERZON_DATA`, clases `hz-`) — la marca visible es Rinde.

La aplicacion vive en la GitHub Page de este repositorio.

## Que es

- Una sola pagina autocontenida: `prototype/index.html`. Sin servidor, sin
  librerias externas, sin red. Funciona igual abierta desde disco que hosteada.
- Interfaz en español, tema claro y oscuro, datos sinteticos de demostracion
  (paciente ficticia). No sustituye valoracion clinica ni nutriologica real.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `prototype/index.html` | La aplicacion ensamblada (artefacto final) |
| `docs/index.html` | Copia publicada por GitHub Pages |
| `build/` | Fuentes por modulo + ensamblador + suite de checks |

## Desarrollo

Los fuentes se editan en `build/` (nunca directamente el HTML final):

```sh
node build/assemble.js   # regenera prototype/index.html (idempotente)
node build/checks.js     # gate mecanico: debe terminar en verde
cp prototype/index.html docs/index.html   # actualiza la copia publicada
```

Requiere Node.js. Sin dependencias (`npm install` no hace falta).
