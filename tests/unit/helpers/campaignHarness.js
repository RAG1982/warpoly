/**
 * campaignHarness.js (M3-01) — harness de playthrough headless das missões do Novo Mundo (`war-alliance`, `war-horde`).
 *
 *   const run = await playMission('war-alliance', 'war-alliance-01-terra-a-vista', script, { maxSeconds: 1200 });
 *   run.outcome  // 'victory' | 'defeat' | null (estourou maxSeconds)
 *   run.ticks, run.seconds, run.checksum, run.gm
 *
 * O `script` é uma lista de PASSOS executados em sequência, um por vez, dentro do laço de simulação (20 ticks/s):
 *   { name?, wait?: segundos depois do passo anterior, when?: (c)=>bool (espera ficar verdadeira),
 *     run?: (c)=>void (roda UMA vez), each?: (c)=>void (roda a cada `every` ticks, padrão 10), until?: (c)=>bool (encerra o `each`),
 *     timeout?: segundos (padrão 600; estourar = o teste falha com o nome do passo) }
 * Um passo termina quando `run` foi executado e (se houver `each`) `until` é verdadeira. Passos sem `when`/`wait` rodam já.
 *
 * `c` (contexto) traz: `gm`, `seconds`, `issue(cmd)` (comando real do jogador 0, igual ao da HUD), `mine(type)`, `bld(type)`,
 * `anchor(nome, dx?, dz?)` (coordenadas da âncora do mapa), `tagged(tag)`, `slay(ents)`, `slayTag(tag)`, `teleport(unit, x, z)`,
 * `status(objId)`, `obj(objId)` (estado do objetivo: status/cur/max), `give({gold,wood,stone})`, `CMD`.
 * Roteiro "que perde": mesmo formato (ex.: matar tudo do jogador local) — o harness devolve `outcome: 'defeat'`.
 * Reuso: um arquivo por missão em `tests/fixtures/campaign-playthrough/<missionId>.js` exportando `{ targetMinutes, win, lose }`
 * (lido por `tests/unit/campaignWorldPlaythrough.test.js`).
 */
import { GameManager } from '../../../src/core/GameManager.js';
import { Terrain } from '../../../src/world/Terrain.js';
import { getMap, ensureMapLoaded } from '../../../src/data/maps/index.js';
import { getMission } from '../../../src/data/missions/index.js';
import { createCampaignMissionConfig, CampaignProgress, memoryStorage } from '../../../src/campaign/index.js';
import { stateChecksum } from '../../../src/sim/checksum.js';
import { CMD } from '../../../src/sim/commands.js';
import { SIM_DT } from '../../../src/sim/constants.js';
import { teleport } from './missionWorld.js';

export const TICKS_PER_SECOND = Math.round(1 / SIM_DT);

/** GameManager headless de uma missão de campanha (carrega o mapa sob demanda; tudo da árvore liberado por `unlockAll` só nas missões). */
export async function bootCampaignMission(campaignId, missionId, { seed = null } = {}) {
  const def = getMission(missionId);
  if (!def) throw new Error(`missão desconhecida "${missionId}"`);
  await ensureMapLoaded(def.mapId);
  const progress = new CampaignProgress(memoryStorage());
  const cfg = createCampaignMissionConfig(campaignId, missionId, { progress, unlockAll: true });
  if (seed !== null) cfg.seed = seed;
  cfg.headless = true;
  return new GameManager(new Terrain(getMap(cfg.mapId)), null, null, cfg);
}

function makeContext(gm) {
  const c = {
    gm,
    CMD,
    get seconds() { return gm.currentTick * SIM_DT; },
    issue: (cmd) => gm.issue({ playerId: 0, ...cmd }),
    mine: (type) => gm.getUnitsOf(0).filter((u) => !u.isDead && (type === undefined || u.type === type)),
    bld: (type, done = true) => gm.buildings.find((b) => b.ownerId === 0 && b.type === type && !b.isDead && (!done || b.isConstructed)),
    anchor(name, dx = 0, dz = 0) {
      const a = gm.terrain.mapDef.anchors?.[name];
      if (!a) throw new Error(`âncora "${name}" não existe no mapa ${gm.terrain.mapDef.id}`);
      return { x: a.x + dx, z: a.z + dz };
    },
    tagged: (tag) => (gm.mission.tags.get(tag) || []).map((i) => gm.entitiesById.get(i)).filter(Boolean),
    slay(ents) {
      const killer = gm.getUnitsOf(0).find((u) => !u.isDead);
      for (const e of ents) if (!e.isDead) e.takeDamage(1e6, killer);
    },
    slayTag(tag) { c.slay(c.tagged(tag)); },
    teleport: (unit, x, z) => teleport(gm, unit, x, z),
    obj: (id) => gm.mission.objectives.get(id),
    status: (id) => gm.mission.objectives.get(id)?.status,
    give(r) { const res = gm.getPlayer(0).resources; for (const [k, v] of Object.entries(r)) res[k] = (res[k] || 0) + v; }
  };
  return c;
}

/**
 * Roda a missão com o roteiro até o desfecho (ou `maxSeconds`).
 * @returns {Promise<{outcome:'victory'|'defeat'|null, ticks:number, seconds:number, checksum:number, gm:object, steps:string[]}>}
 */
export async function playMission(campaignId, missionId, script = [], { maxSeconds = 1800, seed = null, gm = null } = {}) {
  gm = gm || await bootCampaignMission(campaignId, missionId, { seed });
  const c = makeContext(gm);
  const maxTicks = Math.round(maxSeconds / SIM_DT);
  const done = [];
  let i = 0; // passo atual
  let st = null; // estado do passo atual
  while (!gm.isGameOver && gm.currentTick < maxTicks) {
    if (i < script.length) {
      const step = script[i];
      if (!st) st = { from: gm.currentTick, ran: false, ready: gm.currentTick + Math.round((step.wait ?? 0) / SIM_DT) };
      const name = step.name || `#${i}`;
      if (gm.currentTick >= st.ready && (!step.when || step.when(c))) {
        if (!st.ran) { st.ran = true; if (step.run) step.run(c); }
        if (!step.each) { done.push(name); i++; st = null; } else if (step.until && step.until(c)) { done.push(name); i++; st = null; } else if ((gm.currentTick - st.from) % (step.every ?? 10) === 0) step.each(c);
      }
      if (st && gm.currentTick - st.from > Math.round((step.timeout ?? 600) / SIM_DT)) {
        throw new Error(`passo "${name}" do roteiro estourou ${step.timeout ?? 600}s (t=${c.seconds.toFixed(0)}s; passos feitos: ${done.join(', ') || 'nenhum'})`);
      }
    }
    gm.simStep(SIM_DT);
  }
  const outcome = gm.mission.outcome || null;
  return { outcome, ticks: gm.currentTick, seconds: gm.currentTick * SIM_DT, checksum: stateChecksum(gm), gm, steps: done };
}
