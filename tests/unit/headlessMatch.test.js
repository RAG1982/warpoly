import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

/**
 * F2-08 — aceite: `node tools/headless-match.js --seed 1` roda uma partida IA×IA até o fim em Node puro
 * (processo separado, sem Vite/vitest transform), e duas execuções dão o mesmo checksum final (determinismo).
 */
const SCRIPT = new URL('../../tools/headless-match.js', import.meta.url).pathname;

function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 120000 });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

describe('tools/headless-match.js (F2-08)', () => {
  it('partida IA×IA termina em Node puro e é determinística entre processos', () => {
    const a = run(['--seed', '1', '--json']);
    expect(a.err).not.toMatch(/Error/);
    expect(a.status).toBe(0);
    const sa = JSON.parse(a.out.trim().split('\n').pop());
    expect(sa.finished).toBe(true);
    expect(sa.ticks).toBeGreaterThan(1000);
    expect(sa.winnerTeam).not.toBeNull();
    const b = run(['--seed', '1', '--json']);
    const sb = JSON.parse(b.out.trim().split('\n').pop());
    expect(sb.checksum).toBe(sa.checksum);
    expect(sb.ticks).toBe(sa.ticks);
  }, 150000);

  it('argumento inválido sai com erro (código 1)', () => {
    expect(run(['--nao-existe']).status).toBe(1);
  });

  it('estourar o limite de tempo sai com código 2', () => {
    expect(run(['--seed', '1', '--max-minutes', '1', '--quiet']).status).toBe(2);
  }, 60000);
});
