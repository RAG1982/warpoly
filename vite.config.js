import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { gzipSync, brotliCompressSync, constants } from 'zlib';
import { createHash } from 'crypto';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Caminhos absolutos de ícones em strings JS (`'/icoOuro.png'`) quebram quando o jogo é servido numa subpasta
 * (GitHub Pages). Reescreve para `BASE_URL + 'icoOuro.png'` (equivale a no-op com base '/').
 */
function publicBasePlugin() {
  return {
    name: 'warpoly-public-base',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/src/') || !id.endsWith('.js')) return null;
      const out = code.replace(/(['"`])\/(ico[A-Za-z]+\.(?:png|svg))\1/g, "(import.meta.env.BASE_URL + '$2')");
      return out === code ? null : { code: out, map: null };
    }
  };
}

/** Percorre `dir` recursivamente e devolve caminhos relativos (separador `/`). */
function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(full.slice(base.length + 1).split('\\').join('/'));
  }
  return out;
}

/**
 * F10-05: pós-build (só `vite build`).
 *  - versiona `dist/sw.js` (hash do conteúdo => cache versionado) e injeta a lista de pré-cache;
 *  - gera `.br` e `.gz` ao lado de JS/CSS/HTML/SVG (servidores com pré-compressão: Cloudflare/nginx).
 * Os .glb não são recomprimidos (binário já denso; o SW os cacheia em runtime).
 */
function packagingPlugin() {
  let outDir = 'dist';
  return {
    name: 'warpoly-packaging',
    apply: 'build',
    configResolved(cfg) {
      outDir = resolve(cfg.root, cfg.build.outDir);
    },
    closeBundle() {
      const files = walk(outDir);
      const precache = files
        .filter((f) => /^(assets\/.*\.(js|css)|index\.html|manifest\.webmanifest|icon\.svg)$/.test(f))
        .sort();
      const hash = createHash('sha1');
      for (const f of precache) hash.update(f).update(readFileSync(join(outDir, f)));
      const swPath = join(outDir, 'sw.js');
      let sw = readFileSync(swPath, 'utf8');
      sw = sw.replace("'__SW_VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 10))).replace("'__SW_PRECACHE__'", JSON.stringify(precache));
      writeFileSync(swPath, sw);
      let n = 0;
      for (const f of walk(outDir)) {
        if (!/\.(js|css|html|svg|json|webmanifest|mjs)$/.test(f)) continue;
        const buf = readFileSync(join(outDir, f));
        if (buf.length < 1024) continue;
        writeFileSync(join(outDir, f + '.gz'), gzipSync(buf, { level: 9 }));
        writeFileSync(
          join(outDir, f + '.br'),
          brotliCompressSync(buf, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length }
          })
        );
        n++;
      }
      console.log(`[packaging] sw.js versionado (${precache.length} arquivos pré-cacheados); ${n} arquivos com .br/.gz`);
    }
  };
}

// BASE configurável: `BASE=/warpoly/ npm run build` (GitHub Pages em subpasta); padrão './' (relativo, funciona em qualquer pasta).
export default defineConfig({
  base: process.env.BASE || './',
  plugins: [publicBasePlugin(), packagingPlugin()],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        inspector: resolve(__dirname, 'inspector.html'),
        netPoc: resolve(__dirname, 'net-poc.html'),
        lobby: resolve(__dirname, 'lobby.html'),
        terrainPreview: resolve(__dirname, 'terrain-preview.html'),
        editor: resolve(__dirname, 'editor.html')
      },
      output: {
        codeSplitting: {
          groups: [
            { name: 'three-vendor', test: /node_modules[\\/]three[\\/]/, priority: 30 },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 20 },
            { name: 'models-orc', test: /src[\\/]models[\\/].*Orc[^\\/]*$/, priority: 10 },
            { name: 'models-human', test: /src[\\/]models[\\/]/, priority: 5 }
          ]
        }
      }
    }
  }
});
