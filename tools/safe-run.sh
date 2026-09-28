#!/usr/bin/env bash
# safe-run.sh — executa um processo PESADO (navegador/Playwright, Blender, bench) com proteção:
#   - trava global: apenas UM processo pesado por vez na máquina (/tmp/warpoly-heavy.lock)
#   - teto rígido de memória (padrão 6G, sem swap) via systemd-run --user --scope
#   - prioridade baixa de CPU e disco (nice/ionice)
#   - tempo máximo (padrão 300 s)
# Motivo: em 2026-09-28 um chrome-headless chegou a 10,8 GB e travou a máquina (OOM + swap).
#
# Uso: tools/safe-run.sh [--mem 6G] [--timeout 300] -- <comando> [args...]
set -euo pipefail
MEM="6G"; TMO="300"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mem) MEM="$2"; shift 2 ;;
    --timeout) TMO="$2"; shift 2 ;;
    --) shift; break ;;
    *) break ;;
  esac
done
[[ $# -gt 0 ]] || { echo "uso: $0 [--mem 6G] [--timeout 300] -- comando..." >&2; exit 2; }
exec 9>/tmp/warpoly-heavy.lock
echo "[safe-run] aguardando trava global…" >&2
flock 9
echo "[safe-run] executando (mem=$MEM, timeout=${TMO}s): $*" >&2
systemd-run --user --scope -q -p MemoryMax="$MEM" -p MemorySwapMax=0 \
  nice -n 10 ionice -c3 timeout --kill-after=10 "$TMO" "$@"
