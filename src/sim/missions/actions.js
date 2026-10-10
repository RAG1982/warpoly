/**
 * actions.js — F8-04: execução das ações de missão (gatilhos e `setup`). Rodam DENTRO de `simStep`; mexem na
 * simulação direto (spawn, recursos, dono, time, ordens) — nunca emitem comandos (`gm.issue`), que seriam
 * regravados nos saves/replays como se fossem do jogador. Apresentação (diálogo, câmera, som) sai como eventos `MISSION_*`.
 * Sem Math.random / Date.now: posições de spawn em espiral fixa.
 */
import { EVT } from '../events.js';
import { RESOURCE_TYPES } from '../Player.js';
import { isAlive, resolveOwnerId, selectEntities } from './selectors.js';

/** Posição `i` de uma espiral de Fermat (ângulo áureo) ao redor do ponto — espalha spawns sem aleatoriedade. */
export function ringOffset(i, spread = 1.8) {
  const ang = i * 2.399963229728653;
  const r = spread * Math.sqrt(i + 0.25);
  return { dx: Math.cos(ang) * r, dz: Math.sin(ang) * r };
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

/**
 * Árvores sob a pegada de uma construção criada por script (`spawnBuilding`) somem sem animação nem toco — o equivalente
 * do que o jogador faria derrubando-as antes de construir; as vivas que encostam no modelo atravessariam as paredes.
 * Determinístico: varre `gm.trees` em ordem; o efeito na grade espacial/caminhos acontece no passo seguinte (`simStep`).
 */
function clearTreesUnder(gm, b) {
  const p = b.mesh.position;
  const reach = (b.collisionRadius || 3.0) + 0.5;
  for (const t of gm.trees) {
    if (t.isDisposed) continue;
    if (Math.hypot(t.mesh.position.x - p.x, t.mesh.position.z - p.z) >= reach + (t.collisionRadius || 0.75)) continue;
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
        if (a.guard) setGuard(unit, { x: unit.mesh.position.x, z: unit.mesh.position.z, r: a.guard === true ? null : a.guard.r });
        if (a.tag) addTag(rt, a.tag, unit.id);
        applyOrder(gm, unit, a.order);
      }
    }
  },

  /** Construção já CONCLUÍDA do dono em (x, z) — o mesmo registro das construções iniciais das bases (`_spawnStartingBase`). */
  spawnBuilding(rt, a) {
    const gm = rt.gm;
    const owner = resolveOwnerId(gm, a.owner);
    const b = gm.createBuilding(a.buildingType, a.x, a.z, true, owner);
    if (a.facing) b.mesh.rotation.y = (a.facing * Math.PI) / 180;
    if (a.markColor) b.markColor = a.markColor; // só apresentação (cor do anel de seleção): fora do checksum
    gm.buildings.push(b);
    clearTreesUnder(gm, b);
    if (a.tag) addTag(rt, a.tag, b.id);
    gm.recalculatePopCap(); // casas/castelos concedem população
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
    } else fog.revealArea(a.x, a.z, a.radius);
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

