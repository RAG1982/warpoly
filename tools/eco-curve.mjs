#!/usr/bin/env node
/**
 * tools/eco-curve.mjs — F3-04 item 9/10: tabela "ouro/min por nº de trabalhadores" numa
 * única mina de ouro (1 vaga — `MINE_SLOTS.gold`), medindo a saturação do gargalo. Modo
 * headless (sem navegador/DOM/WebGL — `GameManager` + `Terrain`, `ModelFactory.headless`).
 *
 * Cada trabalhador nasce já em contato com a mina; um ponto de entrega (HQ da própria
 * facção) é colocado a poucos metros dela, para que o tempo de viagem até a base não
 * mascare o gargalo medido (o slot único da mina, não a distância até o depósito).
 *
 * Uso: node --import tools/lib/register-json-loader.mjs tools/eco-curve.mjs
 *   (não precisa de safe-run — sem navegador/Blender, só Node). O `--import` é necessário porque
 *   Node 22 exige atributo `with { type: "json" }` em import de `.json`; `src/data/maps/index.js`
 *   importa os mapas sem esse atributo — funciona em Vite/Vitest (que não exigem o atributo),
 *   mas não em Node puro. `tools/lib/register-json-loader.mjs` é um hook mínimo só para este
 *   script — não altera `src/data/maps/index.js` (fora da lane desta spec).
 */
import * as THREE from 'three';
import { GameManager } from '../src/core/GameManager.js';
import { Terrain } from '../src/world/Terrain.js';
import { createMatchConfig } from '../src/sim/MatchConfig.js';
import { SIM_DT } from '../src/sim/constants.js';

const WORKER_COUNTS = [1, 3, 5, 8, 12];
const SIM_SECONDS = 180; // 3 min simulados — várias viagens completas por trabalhador

function measure(workerCount) {
  const scene = new THREE.Scene();
  const terrain = new Terrain(scene);
  const cfg = createMatchConfig({ seed: 1, headless: true });
  const gm = new GameManager(scene, terrain, null, null, cfg);

  const deposit = gm.resourceDeposits.find(d => d.type === 'gold');
  const { x, z } = deposit.mesh.position;
  const owner = gm.getPlayer(0);
  const hqType = owner.factionId === 'orc' ? 'great_hall' : 'castle';

  // Ponto de entrega colado à mina (isola o gargalo do slot único; sem viagem longa até a base).
  const dropoff = gm.createBuilding(hqType, x + 8, z, true, owner.id);
  gm.buildings.push(dropoff);

  const goldBefore = owner.resources.gold;
  const workers = Array.from({ length: workerCount }, () => gm.spawnUnit('villager', x, z, owner.id));
  workers.forEach(w => w.orderGather(deposit));

  // `gm.simStep` (não `unit.update` isolado): a viagem de volta até o depósito pode precisar do
  // pathfinder assíncrono (`processQueue`, resolvido dentro do próprio `simStep`) para contornar
  // o footprint da própria construção-alvo.
  const ticks = Math.round(SIM_SECONDS / SIM_DT);
  for (let i = 0; i < ticks; i++) {
    gm.simStep(SIM_DT);
  }

  const goldGained = owner.resources.gold - goldBefore;
  const perMin = goldGained / (SIM_SECONDS / 60);
  return { workerCount, goldGained, perMin };
}

console.log(`F3-04 — curva de economia (1 mina de ouro, 1 vaga, ${SIM_SECONDS}s simulados, seed 1)`);
console.log('trabalhadores | ouro total | ouro/min');
console.log('--------------|------------|---------');
for (const n of WORKER_COUNTS) {
  const r = measure(n);
  console.log(`${String(r.workerCount).padStart(13)} | ${String(r.goldGained).padStart(10)} | ${r.perMin.toFixed(1).padStart(7)}`);
}
