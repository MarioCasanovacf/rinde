# Rinde — CECAD

Rinde: aplicación de entrenamiento y nutrición del CECAD para poner a la gente
saludable y ejercitada. Plan de dieta personalizado, rutinas de entrenamiento
por cliente, seguimiento de métricas con gráficas, suplementos, recomendador
de plantillas por cálculo de macronutrientes (Mifflin-St Jeor), protección
con contraseña y respaldo del dispositivo, y generación de documentos
(impresión a PDF, descarga de plan, rutina y datos, importación de
mediciones CSV).

Nota técnica: el namespace interno del código conserva el nombre histórico
(`Herzon.*`, `HERZON_DATA`, clases `hz-`) — la marca visible es Rinde.

La aplicación vive en la GitHub Page de este repositorio.

## Qué es

- Una sola página autocontenida: `prototype/index.html`. Sin servidor, sin
  librerías externas, sin red. Funciona igual abierta desde disco que
  hosteada.
- Interfaz en español, tema claro y oscuro, datos sintéticos de demostración
  (paciente ficticia). No sustituye valoración clínica ni nutriológica real.
- Seis pestañas: Resumen, Perfil, Plan de dieta, Rutina, Seguimiento y
  Suplementos. La pestaña Rutina prescribe e imprime la rutina de
  entrenamiento de cada cliente (sin registro de sesiones, igual que el plan
  de dieta).
- Modo demo (datos sintéticos, de solo lectura, nunca se guarda ni se cifra)
  y modo real (datos de clientes verdaderos, capturados y editables en el
  dispositivo, protegidos con una contraseña obligatoria). Ver la sección de
  seguridad más abajo.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `prototype/index.html` | La aplicación ensamblada (artefacto final) |
| `docs/index.html` | Copia publicada por GitHub Pages |
| `build/` | Fuentes por módulo + ensamblador + suite de checks |

Módulos principales dentro de `build/`:

- `data.js` — datos sintéticos de la demo.
- `almacen.js` — persistencia en `localStorage`, esquema versionado por
  cliente y el embudo único de escritura que enruta hacia el cifrado cuando
  la protección está activa.
- `seguridad.js` — cifrado puro (AES-GCM + PBKDF2, ver más abajo); no conoce
  clientes ni toca la interfaz.
- `vista_metricas.js`, `vista_dieta_supl.js`, `vista_rutina.js` — las vistas
  de Perfil/Seguimiento, Plan/Suplementos y Rutina respectivamente.
- `motor_recomendacion.js` — cálculo de necesidades y plantillas sugeridas.
- `documentos.js` — impresión y descarga de documentos y datos.
- `assemble.js` — ensamblador que produce `prototype/index.html`.
- `checks.js` — gate mecánico que corre todos los `selfcheck_*.js`.

## Desarrollo

Los fuentes se editan en `build/` (nunca directamente el HTML final):

```sh
node build/assemble.js   # regenera prototype/index.html (idempotente)
node build/checks.js     # gate mecánico: debe terminar en verde
cp prototype/index.html docs/index.html   # actualiza la copia publicada
```

Requiere Node.js. Sin dependencias (`npm install` no hace falta).

## Protección con contraseña: alcance y límites

En modo real la contraseña es obligatoria: no existe la opción de omitirla.
Rinde la exige mediante un diálogo bloqueante en cuanto hay algo real que
proteger, ya sea al crear el primer cliente o al abrir la aplicación con
datos reales previos que todavía no estaban cifrados (por ejemplo, tras una
actualización), y ese diálogo no se puede cerrar sin fijarla. A partir de
ahí, la aplicación pide la contraseña en cada apertura mientras exista el
sobre cifrado: sin ella sólo se ve la demo sintética, nunca los datos ni los
nombres de los clientes reales. Esta sección enumera, sin adornos, qué cubre
esa protección y qué no cubre, para que quien la usa sepa exactamente qué
está obteniendo.

### Qué sí protege

- Robo o copia del almacenamiento del dispositivo: quien copie el perfil del
  navegador, el `localStorage` o un archivo de respaldo cifrado del disco
  encuentra un bloque AES-GCM-256 con clave derivada por PBKDF2-SHA-256 con
  600,000 iteraciones; sin la contraseña ese bloque es ilegible.
- Apertura del dispositivo compartido sin la contraseña: quien abra Rinde sin
  conocerla ve únicamente la demo sintética, y no puede leer, editar ni
  siquiera enumerar los nombres de los clientes reales, porque la lista de
  clientes también queda dentro del cifrado.
- Manipulación del bloque cifrado: AES-GCM autentica el contenido, así que si
  alguien altera un solo byte del archivo cifrado el descifrado falla en vez
  de devolver datos corruptos o mezclados; Rinde nunca monta información
  manipulada en silencio.

### Qué no protege, y por qué

- Malware o keylogger en el dispositivo: un programa que capture las teclas
  ve la contraseña en el momento en que se escribe, antes de que el cifrado
  entre en juego; el cifrado local no defiende un sistema operativo ya
  comprometido.
- La propia página comprometida: si alguien modifica `index.html` o el
  hospedaje, ese código corre dentro de la sesión ya desbloqueada y ve todo
  lo que esa sesión ve. La aplicación misma es el límite de confianza, no
  algo que se protege a sí misma.
- La sesión abierta: con Rinde desbloqueado, cualquiera frente al
  dispositivo ve los mismos datos que el usuario legítimo; para eso existen
  el botón "Bloquear ahora" y el hábito de cerrar la pestaña.
- El respaldo exportado: el archivo de respaldo se descarga sin cifrar, a
  propósito, porque es la vía de recuperación cuando la contraseña se
  pierde; su custodia pasa a ser responsabilidad de quien lo descarga.
- Contraseñas débiles: PBKDF2 encarece adivinar la contraseña por fuerza
  bruta, no lo vuelve imposible; una contraseña corta o predecible sigue
  siendo adivinable fuera de línea.
- El olvido de la contraseña: no existe recuperación ni puerta trasera.
  Perder la contraseña significa perder el acceso a los datos cifrados,
  salvo que exista un respaldo previo. Esto es una propiedad deliberada del
  diseño, no una falla.

### Formato del sobre cifrado (`cifrado-1`)

Cuando la protección está activa, la misma clave `rinde.datos.v1` de
`localStorage` guarda un sobre con esta forma:

```json
{
  "version": "cifrado-1",
  "kdf": {
    "algoritmo": "PBKDF2",
    "sal": "<base64, 16 bytes aleatorios>",
    "iteraciones": 600000,
    "hash": "SHA-256"
  },
  "cifrado": {
    "algoritmo": "AES-GCM",
    "iv": "<base64, 12 bytes aleatorios>",
    "datos": "<base64 del texto cifrado más la etiqueta de autenticación GCM>"
  }
}
```

El texto plano cifrado es el `JSON.stringify` del payload completo
`{version:2, activoId, clientes}` (el mismo esquema que hoy se guarda sin
cifrar), codificado en UTF-8. La sal y las iteraciones se leen siempre del
sobre, nunca de una constante fija, para que un futuro aumento de
iteraciones no rompa sobres ya existentes.

### Formato del respaldo exportable (`rinde-respaldo-1`)

El botón "Descargar respaldo" genera un archivo `rinde-respaldo-<fecha>.json`
con esta forma:

```json
{
  "formato": "rinde-respaldo-1",
  "exportado": "YYYY-MM-DD",
  "datos": { "version": 2, "activoId": "...", "clientes": { "...": "..." } }
}
```

El respaldo se exporta siempre sin cifrar (ver "Qué no protege" arriba): es
la vía de recuperación cuando la contraseña se pierde. Al restaurar un
respaldo, su contenido reemplaza por completo los datos del dispositivo — no
se combina ni se fusiona con lo que ya hubiera, para evitar duplicar
personas o mezclar información de dos copias divergentes.

### La demo nunca se cifra

Los datos de demostración son sintéticos y de solo lectura: el modo demo
nunca escribe en `localStorage`, así que no hay nada que cifrar. La
protección con contraseña sólo entra en juego en modo real, con datos de
clientes verdaderos capturados en el dispositivo.
