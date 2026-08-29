/* Pokédex Definitiva — trabajador de servicio
   Objetivo: que los sprites se descarguen UNA vez y luego salgan del disco.
   - La app (HTML, manifiesto, iconos): primero la red, con la copia como respaldo,
     para que al subir una versión nueva la recibas sin trucos raros.
   - Los sprites: primero la copia. Nunca cambian, así que no hay que revalidar. */
const V     = 'v1';
const APP   = 'pokedex-app-' + V;
const SPR   = 'pokedex-sprites-' + V;
const SPRITE_HOSTS = ['raw.githubusercontent.com','img.pokemondb.net'];

self.addEventListener('install', e => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('pokedex-') && k !== APP && k !== SPR)
                          .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function guardar(cache, req, res){
  // una respuesta opaca ocupa mucho más de lo que pesa; si no cabe, seguimos sin caché
  try { await cache.put(req, res); } catch (err) { /* cuota llena: da igual */ }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // ---- sprites: primero la copia guardada
  if (SPRITE_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(SPR);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        // con CORS la respuesta se guarda tal cual y ocupa lo que pesa;
        // si el servidor no lo permite, caemos a la petición normal
        let res = await fetch(url.href, { mode: 'cors', credentials: 'omit' })
                        .catch(() => null);
        if (!res || !res.ok) res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) guardar(cache, req, res.clone());
        return res;
      } catch (err) {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // ---- la app: primero la red, copia de respaldo
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(APP);
      try {
        const res = await fetch(req);
        if (res && res.ok) guardar(cache, req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req) ||
                    (req.mode === 'navigate' ? await cache.match('./index.html') : null);
        if (hit) return hit;
        throw err;
      }
    })());
  }
});

// mensajes desde la app: contar y vaciar la caché de sprites
self.addEventListener('message', async e => {
  const d = e.data || {};
  if (d.tipo === 'sprites:contar') {
    const c = await caches.open(SPR);
    const k = await c.keys();
    e.source && e.source.postMessage({ tipo: 'sprites:total', total: k.length });
  }
  if (d.tipo === 'sprites:vaciar') {
    await caches.delete(SPR);
    e.source && e.source.postMessage({ tipo: 'sprites:total', total: 0 });
  }
});
