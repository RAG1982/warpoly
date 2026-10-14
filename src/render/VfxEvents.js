/**
 * VfxEvents.js — F2-07: ouvinte de apresentação que traduz eventos de `gm.events`
 * (`src/sim/events.js`) em chamadas ao `ParticleSystem` (lascas, faíscas, textos flutuantes…).
 * Criado pela `MatchSession`; nunca em modo headless.
 *
 * Preserva os gatilhos/condições de antes da F2-07: a condição de visibilidade (névoa,
 * `isLocal`) que antes vivia na simulação agora é decidida aqui, a partir do payload
 * (`pos`/`ownerId`).
 */
import { t, resourceName } from '../i18n/index.js';
import { EVT } from '../sim/events.js';
import { resolveAbility } from '../sim/abilities.js';
import { getBuildingDef, getUnitDef } from '../data/index.js';
import { effectsForEvent } from './vfx/vfxMapping.js';

const RESOURCE_COLOR = { gold: '#ffd700', wood: '#68d391', stone: '#cbd5e1' };

/**
 * @param {import('../core/GameManager.js').GameManager} gm
 * @param {*} particleSystem
 * @param {import('./vfx/VfxSystem.js').VfxSystem|null} [vfx] F7-05: partículas GPU (sangue, escombros, magia…); null = só o ParticleSystem antigo
 * @returns {() => void} `dispose` — remove todos os ouvintes registrados.
 */
export function createVfxEvents(gm, particleSystem, vfx = null) {
  const offs = [];
  const on = (type, fn) => offs.push(gm.events.on(type, fn, true)); // true = apresentação (F2-06)
  const toVec = pos => ({ x: pos.x, y: pos.y, z: pos.z });
  const isLocalOrExplored = (ownerId, pos) => {
    if (ownerId === gm.localPlayerId) return true;
    return !!(gm.fogOfWar && gm.fogOfWar.isExplored(pos.x, pos.z));
  };
  const buildingOf = id => gm.entitiesById.get(id);

  // --- Dano / morte ---
  on(EVT.UNIT_DAMAGED, ({ pos, amount }) => {
    particleSystem.spawnFloatingText(`-${Math.round(amount)}`, toVec(pos), '#ff4747');
    particleSystem.spawnHitSparks(toVec(pos));
  });
  on(EVT.BUILDING_DAMAGED, ({ pos, amount }) => {
    particleSystem.spawnFloatingText(`-${Math.round(amount)}`, toVec(pos), '#ff4d4d');
    particleSystem.spawnHitSparks(toVec(pos));
  });

  // --- F4-02: impacto do cerco — poeira de pedra + faíscas no ponto de queda ---
  on(EVT.PROJECTILE_HIT, ({ kind, pos }) => {
    if (kind !== 'bolt' && kind !== 'boulder') return;
    particleSystem.spawnStoneDust(toVec(pos));
    particleSystem.spawnHitSparks(toVec(pos));
  });

  // --- F4-05: explosão de sapador — clarão, anel, fagulhas, fumaça e tremor curto da câmera ---
  on(EVT.EXPLOSION, ({ pos, radius }) => {
    particleSystem.spawnExplosion(toVec(pos), radius);
    const sm = gm.sceneManager;
    if (sm && sm.shake) sm.shake(pos);
  });

  // --- F4-03: habilidades — o `vfx.kind` da definição decide (burst | ring | beam | aura) ---
  on(EVT.ABILITY_EFFECT, ({ abilityId, ownerId, pos, radius, unitId }) => {
    const ab = resolveAbility(gm, abilityId);
    if (!ab || !ab.vfx) return;
    if (!isLocalOrExplored(ownerId, pos)) return;
    const { kind, color = '#ffffff' } = ab.vfx;
    const at = toVec(pos);
    if (kind === 'ring') {
      particleSystem.spawnAbilityRing(at, color, radius || ab.vfx.radius || 2);
    } else if (kind === 'beam') {
      const caster = unitId !== undefined ? gm.entitiesById.get(unitId) : null;
      if (caster && caster.mesh) particleSystem.spawnAbilityBeam(caster.mesh.position, at, color);
      particleSystem.spawnAbilityBurst(at, color);
    } else if (kind === 'aura') {
      particleSystem.spawnAbilityAura(at, color, ab.vfx.duration || 1);
    } else {
      particleSystem.spawnAbilityBurst(at, color);
    }
  });

  // --- Coleta / renda passiva: texto só se local ou já explorado pela névoa (worker); renda
  // passiva sempre mostrava (sem condição na simulação original). ---
  on(EVT.RESOURCE_GATHERED, ({ type, amount, pos, ownerId, passive }) => {
    if (!passive && !isLocalOrExplored(ownerId, pos)) return;
    const color = RESOURCE_COLOR[type] || '#ffd700';
    const text = `+${amount} ${resourceName(type).toUpperCase()}`;
    particleSystem.spawnFloatingText(text, toVec(pos), color);
  });

  // --- Corte / mineração / martelo: lascas e poeira, sempre (sem condição de dono/névoa). ---
  on(EVT.WORKER_CHOP, ({ pos }) => particleSystem.spawnWoodChips(toVec(pos)));
  on(EVT.WORKER_HAMMER, ({ pos }) => particleSystem.spawnWoodChips(toVec(pos)));
  on(EVT.WORKER_MINE, ({ pos, resource }) => {
    if (resource === 'gold') particleSystem.spawnGoldGlitter(toVec(pos));
    else particleSystem.spawnStoneDust(toVec(pos));
  });

  // --- Construção ---
  on(EVT.BUILDING_COMPLETED, ({ pos }) => {
    particleSystem.spawnFloatingText(t('vfx.built'), toVec(pos), '#ffd700');
  });
  on(EVT.RESEARCH_DONE, ({ pos }) => {
    if (pos) particleSystem.spawnFloatingText(t('vfx.upgradeForged'), toVec(pos), '#ffd700');
  });

  // --- VFX ambiente das construções (chaminé, faíscas de forja, serragem, boneco de treino…):
  // decisão da execução (F2-07, ver `src/sim/events.js`) — o `kind` decide o efeito; alguns
  // chamam o gatilho da própria construção (mantém o cálculo de socket/posição no lugar). ---
  on(EVT.BUILDING_VFX, ({ buildingId, pos, kind }) => {
    const b = buildingOf(buildingId);
    switch (kind) {
      case 'chimney_smoke':
      case 'anvil_smoke':
        particleSystem.spawnSmokePuff(toVec(pos));
        break;
      case 'anvil_spark':
        if (b && b.strikeAnvil) b.strikeAnvil(particleSystem);
        break;
      case 'sawdust':
        if (b && b.processWoodDelivery) b.processWoodDelivery(particleSystem);
        else particleSystem.spawnWoodChips(toVec(pos));
        break;
      case 'dummy_hit':
        particleSystem.spawnWoodChips(toVec(pos));
        break;
      case 'brazier_spark':
        particleSystem.spawnHitSparks(toVec(pos));
        break;
      default:
        break;
    }
  });

  // --- F7-05: partículas GPU. O mapeamento evento -> efeito é puro (`vfx/vfxMapping.js`); aqui só se coleta o contexto
  // (flags da unidade, raio da construção, definição da habilidade, visibilidade) e se executa os descritores. ---
  if (vfx && vfx.enabled) {
    const seen = (ownerId, pos) => ownerId === gm.localPlayerId || !gm.fogOfWar || gm.fogOfWar.isVisible(pos.x, pos.z);
    const unitFlags = (type) => {
      const d = type ? getUnitDef(type) : null;
      return d ? { undead: !!d.undead, siege: !!d.isSiege, corpseless: !!d.corpseless } : {};
    };
    const run = (type, p, info) => {
      const list = effectsForEvent(type, p, info);
      for (let i = 0; i < list.length; i++) vfx.play(list[i]);
    };
    on(EVT.UNIT_DAMAGED, (p) => {
      if (!seen(p.ownerId, p.pos)) return;
      const u = gm.entitiesById.get(p.unitId);
      run(EVT.UNIT_DAMAGED, p, { unit: unitFlags(u && u.type) });
    });
    on(EVT.BUILDING_DAMAGED, (p) => { if (seen(p.ownerId, p.pos)) run(EVT.BUILDING_DAMAGED, p, {}); });
    on(EVT.UNIT_DIED, (p) => {
      if (!seen(p.ownerId, p.pos)) return;
      const owner = gm.getPlayer(p.ownerId);
      run(EVT.UNIT_DIED, p, { unit: unitFlags(p.unitType), teamColor: owner && owner.color });
    });
    for (const type of [EVT.BUILDING_DESTROYED, EVT.BUILDING_PLACED, EVT.BUILDING_COMPLETED]) {
      on(type, (p) => {
        if (!seen(p.ownerId, p.pos)) return;
        const def = getBuildingDef(p.buildingType);
        run(type, p, { radius: (def && def.collisionRadius) || 2 });
      });
    }
    on(EVT.RESOURCE_DEPLETED, (p) => {
      if (p.resourceType === 'wood') return;
      if (!seen(null, p.pos)) return;
      run(EVT.RESOURCE_DEPLETED, p, { radius: 3.4 });
    });
    on(EVT.EXPLOSION, (p) => { if (seen(p.ownerId, p.pos)) run(EVT.EXPLOSION, p, {}); });
    on(EVT.ABILITY_EFFECT, (p) => {
      const ab = resolveAbility(gm, p.abilityId);
      if (!ab || !ab.vfx || !isLocalOrExplored(p.ownerId, p.pos)) return;
      run(EVT.ABILITY_EFFECT, p, { vfx: ab.vfx });
    });
  }

  return function dispose() {
    offs.forEach(off => off());
    offs.length = 0;
  };
}
