/* WarPoly — service worker simples (F10-05). Registrado só em produção (src/pwa.js).
 * os marcadores de versão e a lista de pré-cache são injetados no build (vite.config.js); em dev este arquivo nem é registrado.
 * - pré-cache: HTML, JS/CSS com hash, manifest, ícone;
 * - runtime cache-first: modelos .glb, ícones e demais arquivos estáticos da mesma origem;
 * - navegação: rede primeiro, cai para o cache offline.
 * Trocar a versão apaga os caches antigos. */
const VERSION = '__SW_VERSION__';
const PRECACHE = '__SW_PRECACHE__';
const SHELL = `warpoly-shell-${VERSION}`;
const RUNTIME = `warpoly-runtime-${VERSION}`;
const scopeUrl = (p) => new URL(p, self.registration.scope).toString();

self.addEventListener('install', (event) => {
  const list = Array.isArray(PRECACHE) ? PRECACHE : [];
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(list.map(scopeUrl)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('warpoly-') && k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.headers.has('range')) return; // respostas parciais: deixa a rede tratar

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match(scopeUrl('index.html'))))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
