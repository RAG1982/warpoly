#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Inicia vite na porta 5199 em background
echo "[capture] Iniciando dev server na porta 5199..."
timeout 600 npx vite --port 5199 --strictPort > /tmp/vite-capture.log 2>&1 &
VITE_PID=$!

# Aguarda vite inicializar
sleep 5

# Executa captura
echo "[capture] Executando captura de telas..."
node tools/capture-terrain.mjs

# Encerra vite
echo "[capture] Encerrando vite..."
kill $VITE_PID 2>/dev/null || true
wait $VITE_PID 2>/dev/null || true

echo "[capture] Concluído!"
