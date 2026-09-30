// F3-09: 5 partidas IA×IA por modo de vitória, imprime o snapshot resumido. Uso: npx vite-node tools/headless-victory.mjs
import * as THREE from 'three';
import { GameManager } from '../src/core/GameManager.js';
import { Terrain } from '../src/world/Terrain.js';
import { createMatchConfig } from '../src/sim/MatchConfig.js';
import { SIM_DT } from '../src/sim/constants.js';

const MAX_TICKS = 72000; // 1 h simulada
for (const mode of ['conquest', 'regicide']) {
  for (let seed = 1; seed <= 5; seed++) {
    const scene = new THREE.Scene();
    const cfg = createMatchConfig({ seed, headless: true, victoryMode: mode });
    cfg.players.forEach((p) => { p.isAI = true; });
    const gm = new GameManager(scene, new Terrain(scene), null, null, cfg);
    let t = 0;
    while (!gm.isGameOver && t < MAX_TICKS) { gm.simStep(SIM_DT); t++; }
    const r = gm.result || gm.matchStats.snapshot();
    const pl = r.players.map((p) => `P${p.id}${p.defeated ? '(x)' : ''} k${p.unitsKilled}/l${p.unitsLost} bd${p.buildingsDestroyed}/bl${p.buildingsLost} sc${p.score.toFixed(0)}`).join(' | ');
    console.log(`${mode} seed=${seed} fim=${gm.isGameOver} t=${(r.elapsed / 60).toFixed(1)}min win=${r.winnerTeam} pts=${r.series.length} :: ${pl}`);
  }
}
