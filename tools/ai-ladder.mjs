#!/usr/bin/env node
/**
 * F5-03 — escada de dificuldades da IA: partidas 1v1 IA×IA headless entre dificuldades.
 *
 *   /home/rafael/warpoly/tools/safe-run.sh --timeout 3000 -- node tools/ai-ladder.mjs [--seeds 10] [--first 1] [--max-minutes 30] [--pairs hard:normal,normal:easy]
 *
 * Para cada seed roda DUAS partidas com a mesma seed e o mesmo mapa, trocando de lado as dificuldades (A como
 * jogador 0 e depois A como jogador 1): o viés de posição/facção (a base SW/orc tem menos árvores próximas)
 * cancela por construção. Cada partida é um processo filho de `tools/headless-match.js --json`.
 * Taxa de vitória de A = (vitórias + ½ empates) / partidas. Empate = ninguém venceu em --max-minutes.
 * Saída: código 0 se todas as partidas terminaram e cada par cumpriu a meta (>= 60 %), 3 se alguma
 * partida travou (estourou o tempo), 4 se a meta falhou.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const seeds = Number(opt('--seeds', 10));
const first = Number(opt('--first', 1));
const maxMinutes = Number(opt('--max-minutes', 30));
const pairs = opt('--pairs', 'hard:normal,normal:easy').split(',').map(p => p.split(':'));
const GOAL = 0.6;
const match = fileURLToPath(new URL('./headless-match.js', import.meta.url));

let unfinished = 0;
let failed = 0;
for (const [a, b] of pairs) {
  let win = 0; let loss = 0; let draw = 0; let simMin = 0; let games = 0;
  for (let s = first; s < first + seeds; s++) {
    for (const aIsP0 of [true, false]) {
      const diffs = aIsP0 ? [a, b] : [b, a];
      const r = spawnSync(process.execPath, [match, '--seed', String(s), '--difficulties', diffs.join(','), '--json', '--max-minutes', String(maxMinutes)], { encoding: 'utf8', maxBuffer: 1 << 26 });
      const line = (r.stdout || '').trim().split('\n').filter(l => l.startsWith('{')).pop();
      if (!line) { console.log(`  seed ${s}: ERRO ${(r.stderr || '').slice(0, 200)}`); unfinished++; games++; continue; }
      const m = JSON.parse(line);
      games++;
      simMin += m.simMinutes;
      let res = 'E';
      if (m.finished && m.winnerTeam !== null) res = (m.winnerTeam === 0) === aIsP0 ? 'V' : 'D';
      else if (!m.finished) unfinished++;
      if (res === 'V') win++; else if (res === 'D') loss++; else draw++;
      console.log(`  ${a}×${b} seed ${s} (${diffs.join(' vs ')}): ${res} ${m.finished ? '' : '[NÃO TERMINOU] '}${m.simMinutes} min, ${m.ai.map(x => x.strategy).join('/')}, checksum ${m.checksum}`);
    }
  }
  const rate = (win + draw / 2) / games;
  const ok = rate >= GOAL;
  if (!ok) failed++;
  console.log(`${a} × ${b}: ${win}V ${loss}D ${draw}E em ${games} partidas (${seeds} seeds × 2 lados) — taxa de vitória de ${a}: ${(rate * 100).toFixed(0)} % ${ok ? 'OK' : 'ABAIXO DA META'} (média ${(simMin / games).toFixed(1)} min simulados)`);
}
if (unfinished) console.log(`ATENÇÃO: ${unfinished} partida(s) não terminaram`);
process.exit(unfinished ? 3 : failed ? 4 : 0);
