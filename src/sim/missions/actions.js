/**
 * actions.js — F8-04: execução das ações de missão (gatilhos e `setup`). Rodam DENTRO de `simStep`; mexem na
 * simulação direto (spawn, recursos, dono, time, ordens) — nunca emitem comandos (`gm.issue`), que seriam
 * regravados nos saves/replays como se fossem do jogador. Apresentação (diálogo, câmera, som) sai como eventos `MISSION_*`.
 * Sem Math.random / Date.now: posições de spawn em espiral fixa.
 */
import { fcos, fhypot, fsin } from '../fmath.js';
import { EVT } from '../events.js';
import { RESOURCE_TYPES } from '../Player.js';
import { HQ_TIER_HP } from '../../data/tiers.js';
import { orderUnload, loadUnit, unloadAll } from '../transport.js';
import { isAlive, resolveOwnerId, roleOf, selectEntities } from './selectors.js';

/** Posição `i` de uma espiral de Fermat (ângulo áureo) ao redor do ponto — espalha spawns sem aleatoriedade. */
export function ringOffset(i, spread = 1.8) {
  const ang = i * 2.399963229728653;
  const r = spread * Math.sqrt(i + 0.25);
  return { dx: fcos(ang) * r, dz: fsin(ang) * r };
}

function applyOrder(gm, unit, order) {
  if (!order || !isAlive(unit)) return;
  if (order.kind === 'stop') unit.stop();
  else if (order.kind === 'attackMove') unit.orderAttackMove(order.x, order.z, gm);
  else unit.moveTo(order.x, order.z, gm);
}

function addTag(rt, tag, id) {
  let list = rt.tags.get(tag);
  if (!list) { list = []; rt.tags.set(tag, list); }
  if (!list.includes(id)) list.push(id);
}

/** F5-06: guarnição — a unidade não sai de `r` metros do ponto (leash do `Unit._updateGuardLeash`); `null` solta. */
function setGuard(unit, area) {
  if (!isAlive(unit)) return;
  if (!area) { unit.homePos = null; unit.guardRadius = null; unit._returningHome = false; return; }
  unit.homePos = { x: area.x, z: area.z };
  unit.guardRadius = area.r ?? null;
  unit._returningHome = false;
}

const clone = (v) => JSON.parse(JSON.stringify(v));

/** Folga entre a construção e as árvores vivas que `GameManager.canPlaceBuilding` exige do jogador (`minTreeGap`). */
const TREE_CLEARANCE = 3.5;

/**
 * Uma construção criada por script (`spawnBuilding`) não passa por `canPlaceBuilding`: as árvores vivas dentro da MESMA
 * folga que o jogador precisaria (`collisionRadius` + 3,5) somem sem animação nem toco — assim o ponto escolhido fica tão
 * livre quanto um ponto onde o jogador poderia construir, e nenhuma árvore atravessa o modelo.
 * Determinístico: varre `gm.trees` em ordem; a saída da grade espacial/caminhos acontece no passo seguinte (`simStep`).
 */
function clearTreesAround(gm, b) {
  const p = b.mesh.position;
  const gap = (b.collisionRadius || 3.0) + TREE_CLEARANCE;
  for (const t of gm.trees) {
    if (t.isDisposed) continue;
    if (fhypot(t.mesh.position.x - p.x, t.mesh.position.z - p.z) > gap + (t.collisionRadius || 0.75)) continue;
    t.die();
    t.fallProgress = 1;
    t.dispose();
  }
}

const HANDLERS = {
  spawn(rt, a) {
    const gm = rt.gm;
    const owner = resolveOwnerId(gm, a.owner);
    const list = a.units ?? [{ type: a.unitType, count: a.count ?? 1 }];
    let i = 0;
    for (const entry of list) {
      for (let k = 0; k < entry.count; k++) {
        const { dx, dz } = ringOffset(i++, a.spread ?? 1.8);
        const unit = gm.spawnUnit(entry.type, a.x + dx, a.z + dz, owner);
        if (!unit) continue; // F4-08: herói único já criado nesta partida
        if (a.markColor) unit.markColor = a.markColor; // só apresentação (cor do anel de seleção): fora do checksum
        if (a.displayName) unit.displayName = clone(a.displayName); // M3-X1: nome no painel de seleção (só apresentação)
        if (a.guard) setGuard(unit, { x: unit.mesh.position.x, z: unit.mesh.position.z, r: a.guard === true ? null : a.guard.r });
        if (a.tag) addTag(rt, a.tag, unit.id);
        applyOrder(gm, unit, a.order);
      }
    }
  },

  /**
   * NAVAL-LANDING: desembarque anfíbio. A barcaça nasce na água (x, z) com a tropa JÁ embarcada (mesmas APIs de `transport.js`),
   * a escolta de navios nasce junto; a barcaça navega até a margem de `unloadAt` (`orderUnload`), solta a carga e a tropa recebe
   * `order` (`Unit.update` → `updateUnloading`). Barcaça morta antes do desembarque = carga afogada (`killCargo`, sem cadáver).
   * Sem margem navegável perto de `unloadAt`, a tropa é posta em terra direto ali (nunca fica presa a bordo).
   */
  spawnLanding(rt, a) {
    const gm = rt.gm;
    const owner = resolveOwnerId(gm, a.owner);
    const boat = gm.spawnUnit(a.bargeType ?? 'barge', a.x, a.z, owner);
    if (!boat) return;
    if (a.bargeTag) addTag(rt, a.bargeTag, boat.id);
    if (a.markColor) boat.markColor = a.markColor;
    let i = 0;
    for (const entry of a.units) {
      for (let k = 0; k < entry.count; k++) {
        const u = gm.spawnUnit(entry.type, a.unloadAt.x, a.unloadAt.z, owner);
        if (!u) continue;
        if (a.markColor) u.markColor = a.markColor;
        if (a.tag) addTag(rt, a.tag, u.id);
        if (!loadUnit(gm, boat, u)) { u.moveTo(a.unloadAt.x, a.unloadAt.z, gm); applyOrder(gm, u, a.order); }
        i++;
      }
    }
    boat._landingOrder = a.order ? { kind: a.order.kind, x: a.order.x, z: a.order.z } : null;
    if (!orderUnload(gm, boat, a.unloadAt.x, a.unloadAt.z) && boat.cargo.length) {
      const list = boat.cargo.slice();
      unloadAll(gm, boat, a.unloadAt);
      for (const u of list) applyOrder(gm, u, a.order);
    }
    // escolta: navios de ataque ao lado da barcaça, avançando para o ponto de desembarque (atacam quem aparecer pelo caminho)
    const goal = boat._unloadOrder ? boat._unloadOrder.sea : { x: a.unloadAt.x, z: a.unloadAt.z };
    let j = 1;
    for (const entry of a.escort ?? []) {
      for (let k = 0; k < entry.count; k++) {
        const { dx, dz } = ringOffset(j++, 3.2);
        const ship = gm.spawnUnit(entry.type, a.x + dx, a.z + dz, owner);
        if (!ship) continue;
        if (a.markColor) ship.markColor = a.markColor;
        addTag(rt, a.escortTag ?? 'escort', ship.id);
        ship.orderAttackMove(goal.x, goal.z, gm);
      }
    }
    void i;
  },

  /** Construção já CONCLUÍDA do dono em (x, z) — o mesmo registro das construções iniciais das bases (`_spawnStartingBase`). */
  spawnBuilding(rt, a) {
    const gm = rt.gm;
    const owner = resolveOwnerId(gm, a.owner);
    const b = gm.createBuilding(a.buildingType, a.x, a.z, true, owner);
    if (a.facing) b.mesh.rotation.y = (a.facing * Math.PI) / 180;
    if (a.markColor) b.markColor = a.markColor; // só apresentação (cor do anel de seleção): fora do checksum
    gm.buildings.push(b);
    clearTreesAround(gm, b);
    if (a.tag) addTag(rt, a.tag, b.id);
    gm.recalculatePopCap(); // casas/castelos concedem população
  },

  /** M3-X1: marco visual (ruína, posto de trégua, altar). Estado no `MissionRuntime`; a view só desenha. */
  spawnLandmark(rt, a) {
    rt.addLandmark(a);
  },

  /** M3-X1: acende os marcos com a tag (brilho de descoberta). Entra no estado da missão (save/replay). */
  lightLandmark(rt, a) {
    rt.lightLandmark(a.tag);
  },

  /**
   * F8-05b: eleva o(s) Centro(s) CONCLUÍDO(s) do dono ao nível `tier` (2 ou 3) na hora — a campanha concede o nível que a nova
   * tecnologia exige (estábulo/oficina/estaleiro pedem nível 2; magos, aviário e couraçado, nível 3). Não rebaixa; PV na mesma proporção.
   */
  setTier(rt, a) {
    const gm = rt.gm;
    const owner = resolveOwnerId(gm, a.owner ?? 'player');
    for (const b of gm.buildings) {
      if (b.ownerId !== owner || !isAlive(b) || b.isConstructed === false || roleOf(b.type) !== 'hq' || (b.tier || 1) >= a.tier) continue;
      const pct = b.maxHp > 0 ? b.hp / b.maxHp : 1;
      b.tier = a.tier;
      b.tierUpgrade = null;
      b.maxHp = HQ_TIER_HP[a.tier] || b.maxHp;
      b.hp = Math.min(b.maxHp, Math.round(b.maxHp * pct));
      gm.events.emit(EVT.HQ_TIER_CHANGED, { buildingId: b.id, ownerId: b.ownerId, pos: { x: b.mesh.position.x, y: b.mesh.position.y, z: b.mesh.position.z }, tier: a.tier });
    }
  },

  giveResources(rt, a) {
    const p = rt.gm.getPlayer(resolveOwnerId(rt.gm, a.owner ?? 'player'));
    if (!p) return;
    for (const r of RESOURCE_TYPES) if (a[r]) p.resources[r] += a[r];
  },

  takeResources(rt, a) {
    const p = rt.gm.getPlayer(resolveOwnerId(rt.gm, a.owner ?? 'player'));
    if (!p) return;
    for (const r of RESOURCE_TYPES) if (a[r]) p.resources[r] = Math.max(0, p.resources[r] - a[r]);
  },

  setObjective(rt, a) {
    rt.setObjectiveStatus(a.id, a.status);
  },

  addObjective(rt, a) {
    rt.addObjective(clone(a.objective));
  },

  revealObjective(rt, a) {
    rt.revealObjective(a.id);
  },

  reveal(rt, a) {
    const fog = rt.gm.fogOfWar;
    if (!fog) return;
    if (a.all) {
      const size = fog.worldWidth;
      fog.revealArea(0, 0, size);
    } else fog.revealArea(a.x, a.z, a.radius, a.ttl || 0); // `ttl` (s): a visão atual persiste por esse tempo (cutscenes)
  },

  setTeam(rt, a) {
    const gm = rt.gm;
    const p = gm.getPlayer(resolveOwnerId(gm, a.player));
    if (!p || p.team === a.team) return;
    p.team = a.team;
    gm.playerRegistry.rebuildDiplomacy();
    gm._markUnitListsDirty();
  },

  transfer(rt, a) {
    const gm = rt.gm;
    const to = resolveOwnerId(gm, a.to);
    const found = selectEntities(rt, a.select);
    for (let i = 0; i < found.length; i++) {
      const e = found[i];
      if (e.type !== undefined && gm.allUnits.includes(e)) gm.transferUnit(e, to);
      if (a.tag) addTag(rt, a.tag, e.id);
    }
  },

  dialog(rt, a) {
    rt.gm.events.emit(EVT.MISSION_DIALOG, { speaker: a.speaker, portrait: a.portrait, text: a.text, duration: a.duration });
  },

  message(rt, a) {
    rt.gm.events.emit(EVT.MISSION_MESSAGE, { text: a.text });
  },

  victory(rt, a) {
    rt.finish('victory', a.text);
  },

  defeat(rt, a) {
    rt.finish('defeat', a.text);
  },

  music(rt, a) {
    rt.gm.events.emit(EVT.MISSION_MUSIC, { id: a.id });
  },

  sound(rt, a) {
    rt.gm.events.emit(EVT.MISSION_SOUND, { id: a.id });
  },

  camera(rt, a) {
    rt.gm.events.emit(EVT.MISSION_CAMERA, { x: a.x, z: a.z, zoom: a.zoom });
  },

  cutscene(rt, a) {
    rt.cutsceneSeq++;
    rt.gm.events.emit(EVT.MISSION_CUTSCENE, { id: a.id || `cutscene-${rt.cutsceneSeq}`, duration: a.duration, skippable: a.skippable !== false, steps: clone(a.steps) });
  },

  setVar(rt, a) {
    rt.vars[a.name] = a.value;
  },

  incVar(rt, a) {
    const cur = rt.vars[a.name];
    rt.vars[a.name] = (typeof cur === 'number' ? cur : 0) + (a.by ?? 1);
  },

  enableTrigger(rt, a) {
    const t = rt.triggers.get(a.id);
    if (t) t.enabled = true;
  },

  disableTrigger(rt, a) {
    const t = rt.triggers.get(a.id);
    if (t) t.enabled = false;
  },

  tag(rt, a) {
    const found = selectEntities(rt, a.select);
    for (let i = 0; i < found.length; i++) addTag(rt, a.tag, found[i].id);
  },

  order(rt, a) {
    const found = selectEntities(rt, { kind: 'unit', ...a.select });
    for (let i = 0; i < found.length; i++) {
      if (a.release) setGuard(found[i], null); // F5-06: ataque programado solta a guarnição antes da ordem
      applyOrder(rt.gm, found[i], { kind: a.kind, x: a.x, z: a.z });
    }
  },

  /** F5-06: `guard {select, area?{x,z,r}}` prende as unidades à área (padrão: posição atual, raio padrão); `release:true` solta. */
  guard(rt, a) {
    const found = selectEntities(rt, { kind: 'unit', ...a.select });
    for (let i = 0; i < found.length; i++) {
      const u = found[i];
      if (a.release) setGuard(u, null);
      else setGuard(u, a.area ? { x: a.area.x, z: a.area.z, r: a.area.r } : { x: u.mesh.position.x, z: u.mesh.position.z, r: a.radius ?? null });
    }
  }
};

/** Executa uma ação (`{type, …}`). */
export function runAction(rt, action) {
  const h = HANDLERS[action.type];
  if (h) h(rt, action);
}

