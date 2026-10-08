// F10-05: registro do service worker (PWA offline). Só em produção; no `npm run dev` nada é registrado.
export function registerServiceWorker() {
  if (!import.meta.env || !import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!/^https:|^http:\/\/(localhost|127\.0\.0\.1)/.test(location.origin)) return;
  const url = new URL(`${import.meta.env.BASE_URL}sw.js`, location.href);
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url.href).catch((e) => console.warn('[pwa] SW não registrado:', e));
  });
}
