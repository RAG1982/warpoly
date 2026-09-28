import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        inspector: resolve(__dirname, 'inspector.html')
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('three/')) {
            return 'three-vendor';
          }
          if (id.includes('/src/models/')) {
            return 'game-models';
          }
        }
      }
    }
  }
});
