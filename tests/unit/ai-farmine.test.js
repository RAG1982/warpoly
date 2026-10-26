import { describe, it, expect } from 'vitest';
import { makeGm } from './helpers/aiWorld.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { getAIProfile } from '../../src/ai/AIProfile.js';
import { STRATEGIES } from '../../src/ai/AIStrategy.js';

/**
 * AI-FARMINE — a distância da mina de ouro ao Centro NÃO pode encolher nem antecipar a 1ª leva de ataque.
 * Mina longe = economia mais lenta = leva igual (limiar do perfil) e igual/mais tarde, nunca menor/mais cedo.
 */
function waves(mineDist, seconds = 130) {
  const gm = makeGm({ seed: 1, difficulties: ['hard', 'hard'] });
  if (mineDist) {
    for (const d of gm.aiDirectors) {
      const hq = gm.buildings.find(b => b.ownerId === d.playerId);
      const hx = hq.mesh.position.x; const hz = hq.mesh.position.z;
      let best = null; let bd = Infinity;
      for (const g of gm.resourceDeposits) {
        if (g.type !== 'gold') continue;
        const dd = Math.hypot(g.mesh.position.x - hx, g.mesh.position.z - hz);
        if (dd < bd) { bd = dd; best = g; }
      }
      const dx = best.mesh.position.x - hx; const dz = best.mesh.position.z - hz; const L = Math.hypot(dx, dz) || 1;
      best.mesh.position.set(hx + dx / L * mineDist, best.mesh.position.y, hz + dz / L * mineDist);
    }
  }
  const out = [];
  const last = gm.aiDirectors.map(d => d.militaryManager.strikeWaveNumber);
  const thr = gm.aiDirectors.map(d => d.militaryManager.attackThreshold);
  for (let t = 0; t < seconds * 20; t++) {
    gm.simStep(SIM_DT);
    gm.aiDirectors.forEach((d, i) => {
      const m = d.militaryManager;
      if (m.strikeWaveNumber !== last[i]) {
        last[i] = m.strikeWaveNumber;
        out.push({ ai: i, t: t * SIM_DT, size: m.waveIds.size, threshold: thr[i], strategy: d.strategy.id });
      }
      thr[i] = m.attackThreshold;
    });
  }
  gm.dispose();
  return out;
}

describe('AI-FARMINE: mina de ouro longe do Centro', () => {
  for (const dist of [0, 30, 60]) {
    it(`mina a ${dist || 'distância original'}: leva >= limiar do perfil e depois do atraso mínimo`, () => {
      const ws = waves(dist);
      const p = getAIProfile('hard');
      expect(ws.length).toBeGreaterThan(0);
      for (const w of ws) {
        const st = STRATEGIES[w.strategy];
        expect(w.size).toBeGreaterThanOrEqual(p.attackBase + st.firstWave - 4);
        expect(w.size).toBeGreaterThanOrEqual(w.threshold);
        expect(w.t).toBeGreaterThanOrEqual(p.startDelay * (st.id === 'rush' ? p.rushDelayScale : 1));
      }
    }, 120000);
  }

  it('perto x longe: a 1a leva da mina longe não é menor nem mais cedo', () => {
    const near = waves(0).filter(w => w.ai === 0)[0];
    const far = waves(60).filter(w => w.ai === 0)[0];
    expect(near && far).toBeTruthy();
    expect(far.size).toBeGreaterThanOrEqual(near.size);
    expect(far.t).toBeGreaterThanOrEqual(near.t);
  }, 240000);
});
