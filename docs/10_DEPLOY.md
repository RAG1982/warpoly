# 10 · Empacotamento e deploy estático (F10-05)

O jogo é 100% estático (`dist/`): nenhum servidor é necessário.

## Build

```bash
npm run build                 # base relativa './' — funciona em qualquer pasta/domínio
BASE=/warpoly/ npm run build  # base absoluta (opcional); GitHub Pages usa isto no workflow
```

O que o build faz (`vite.config.js`):

- **Code-splitting**: `three-vendor` (three.js, muda raramente → cache longo entre deploys), `vendor`, `models-human`, `models-orc` (modelos procedurais) e `main`. Os `.glb` (`public/models/`) já são baixados sob demanda por `ensureGlbLoaded`, não entram em chunks. Carregar facção/modelos 100% sob demanda exige mexer no preload (`AssetPreloader`/`ModelFactory`, lane PERF) — fica como evolução.
- **Compressão**: gera `.br` (brotli 11) e `.gz` ao lado de JS/CSS/HTML/SVG (`packagingPlugin`, só `node:zlib`, sem dependência extra).
- **Service worker versionado**: `dist/sw.js` recebe o hash do conteúdo dos assets e a lista de pré-cache.
- **Caminhos de ícones** (`'/icoOuro.png'` em strings JS) são reescritos para `BASE_URL + 'icoOuro.png'`, então o jogo funciona em subpasta.

## PWA offline

`public/manifest.webmanifest` + `public/sw.js`, registrado por `src/pwa.js` **só em produção** (`import.meta.env.PROD`, HTTPS ou localhost). Estratégia: pré-cache do shell (HTML, JS/CSS com hash); cache-first em runtime para `.glb`, ícones e demais arquivos da mesma origem; navegação rede-primeiro com fallback offline. Novo deploy ⇒ novo hash ⇒ caches antigos apagados no `activate`. As fontes do Google (style.css) não são cacheadas (origem cruzada): offline cai para a fonte do sistema. `npm run dev` não registra nada.

## GitHub Pages

`.github/workflows/deploy.yml` (push em `master` ou manual): `npm ci` → lint → vitest → build com `BASE=/<nome-do-repo>/` → publica `dist/`. Ative em *Settings → Pages → Source: GitHub Actions*. Domínio próprio: troque `BASE` por `/`.

## Cloudflare Pages

1. *Workers & Pages → Create → Pages → Connect to Git*, escolha o repositório.
2. Build command: `npm run build`; output directory: `dist`; variável `NODE_VERSION=22`. Não defina `BASE` (usa './').
3. Cloudflare serve `.br` automaticamente. `public/_headers` já define cache imutável para `/assets/*` e `no-cache` para `/sw.js`.

Deploy manual: `npx wrangler pages deploy dist`.

## Verificação

```bash
BASE=/warpoly/ npm run build
BASE=/warpoly/ bash tools/safe-run.sh --mem 6G --timeout 240 -- node tools/preview-check.mjs /warpoly/
```

Sobe `vite preview`, abre `?skipPreload`, falha com qualquer erro de console/HTTP ≥ 400 e confirma o service worker ativo (e encerra servidor e navegador).

## Página de lançamento

`index.html` já abre o menu principal do jogo (F6-01); não foi criada landing separada.
