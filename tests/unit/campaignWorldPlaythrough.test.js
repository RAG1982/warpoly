import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { playMission } from './helpers/campaignHarness.js';

/**
 * M3-01 — playthroughs headless das missões do Novo Mundo. Um arquivo por missão em
 * `tests/fixtures/campaign-playthrough/<missionId>.js` exportando:
 *   { campaignId, targetMinutes, win: [passos], lose: [passos], maxMinutes? }
 * (formato dos passos: `tests/unit/helpers/campaignHarness.js`). Para cada um: o roteiro `win` VENCE em ≤ 2× a duração-alvo,
 * o roteiro `lose` DERROTA, e duas execuções do `win` dão o mesmo checksum.
 */
const DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/campaign-playthrough');
const files = readdirSync(DIR).filter((f) => f.endsWith('.js')).sort();

describe('M3-01 · playthroughs das missões do Novo Mundo', () => {
  it('há roteiros cadastrados (ou nenhuma missão foi entregue ainda)', () => {
    expect(Array.isArray(files)).toBe(true);
  });

  for (const f of files) {
    const id = f.replace(/\.js$/, '');
    describe(id, () => {
      let fx;
      const load = async () => (fx ||= await import(pathToFileURL(join(DIR, f)).href));

      it('o roteiro de vitória vence dentro de 2× a duração-alvo', async () => {
        const { campaignId, targetMinutes, win, maxMinutes } = await load();
        const run = await playMission(campaignId, id, win, { maxSeconds: (maxMinutes ?? targetMinutes * 2) * 60 });
        expect(run.outcome).toBe('victory');
        expect(run.seconds).toBeLessThanOrEqual(targetMinutes * 2 * 60);
      }, 300000); // M3-07: a m06 (4 jogadores, mapa 320) leva ~2 min de relógio

      it('o roteiro de derrota perde', async () => {
        const { campaignId, lose, targetMinutes } = await load();
        const run = await playMission(campaignId, id, lose, { maxSeconds: targetMinutes * 2 * 60 });
        expect(run.outcome).toBe('defeat');
      }, 120000);

      it('é determinístico (checksum igual em 2 execuções)', async () => {
        const { campaignId, targetMinutes, win } = await load();
        const a = await playMission(campaignId, id, win, { maxSeconds: targetMinutes * 2 * 60 });
        const b = await playMission(campaignId, id, win, { maxSeconds: targetMinutes * 2 * 60 });
        expect(a.checksum).toBe(b.checksum);
        expect(a.ticks).toBe(b.ticks);
      }, 600000);
    });
  }
});
