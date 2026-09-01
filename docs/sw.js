/* prototype/sw.js
 * Service worker de Rinde. Adendum R8 punto 3 (plan.md): cache 'rinde-v1';
 * network-first con fallback a cache para navegación/index (el prototipo se
 * actualiza al re-publicar y sigue funcionando sin conexión); cache-first
 * para manifest e iconos; activate borra cualquier cache con otro nombre.
 * Cero peticiones a dominios externos: el worker solo intermedia peticiones
 * de su propio origen y deja pasar el resto sin tocarlas.
 */
'use strict';

var CACHE_NAME = 'rinde-v1';

var RUTAS_PRECARGA = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-512.png',
  './icon-192.png',
  './icon-180.png',
  './favicon-32.png'
];

function esRecursoEstatico(url) {
  return /\/(manifest\.webmanifest|icon-512\.png|icon-192\.png|icon-180\.png|favicon-32\.png)(\?.*)?$/.test(url);
}

function esMismoOrigen(url) {
  try {
    return new URL(url, self.location.href).origin === self.location.origin;
  } catch (error) {
    return false;
  }
}

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(RUTAS_PRECARGA);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys()
      .then(function (nombresCache) {
        return Promise.all(
          nombresCache
            .filter(function (nombre) { return nombre !== CACHE_NAME; })
            .map(function (nombre) { return caches.delete(nombre); })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (evento) {
  var peticion = evento.request;

  if (peticion.method !== 'GET' || !esMismoOrigen(peticion.url)) {
    return;
  }

  var esNavegacion = peticion.mode === 'navigate' || peticion.destination === 'document';

  if (esNavegacion) {
    evento.respondWith(
      fetch(peticion)
        .then(function (respuestaRed) {
          var copia = respuestaRed.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(peticion, copia); });
          return respuestaRed;
        })
        .catch(function () {
          return caches.match(peticion).then(function (respuestaCache) {
            return respuestaCache || caches.match('./index.html') || caches.match('./');
          });
        })
    );
    return;
  }

  if (esRecursoEstatico(peticion.url)) {
    evento.respondWith(
      caches.match(peticion).then(function (respuestaCache) {
        if (respuestaCache) {
          return respuestaCache;
        }
        return fetch(peticion).then(function (respuestaRed) {
          var copia = respuestaRed.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(peticion, copia); });
          return respuestaRed;
        });
      })
    );
  }
});
