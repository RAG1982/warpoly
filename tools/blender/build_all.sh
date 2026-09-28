#!/usr/bin/env bash
# Gera todos os modelos do pipeline Blender (public/models/*.glb) e os renders
# de pré-visualização (tools/blender/renders/). Cada Blender roda via safe-run
# (trava global, teto de memória e timeout).
#
# Uso: tools/blender/build_all.sh [--no-render]
# Variáveis: BLENDER=/caminho/blender  BAKE_SAMPLES=32  RENDER_RES=800  ATLAS=1024 (castelo)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BLENDER="${BLENDER:-/home/rafael/Downloads/blender-5.2.1-linux-x64/blender}"
SAFE="/home/rafael/warpoly/tools/safe-run.sh"
RUN=()
[[ -x "$SAFE" ]] && RUN=("$SAFE" --timeout 900 --)

for script in build_grunt.py build_castle.py; do
  echo "== $script"
  (cd "$REPO" && "${RUN[@]}" "$BLENDER" -b --factory-startup --python "$HERE/$script" -- "$@" \
     | grep -E "STATS|tris |Error|Traceback" || true)
done

# renders mais leves para o git (opcional, precisa do Pillow no Python do sistema)
python3 "$HERE/shrink_renders.py" || true
ls -la "$REPO/public/models"
