/**
 * transport.js — F4-07b: embarque/desembarque da Barcaça (puro, sem three.js/DOM).
 *
 * Modelo: o passageiro (`unit.transportedBy = boat.id`) fica em `boat.cargo` (ordem de embarque), invisível
 * (`mesh.visible = false`), fora do `unitGrid` (não é alvo, seleção nem colide), não recebe ordens e acompanha a posição
 * do barco (a névoa de guerra continua enxergando por ele). Morre com o barco, sem cadáver (`killCargo`).
 * Margem = par (célula navegável, célula terrestre livre) a poucos metros — `findLandingSpot`.
 */
import { BOARD_DISTANCE } from '../data/combat.js';
import { EVT } from './events.js';

const TAU = Math.PI * 2;

/** Folga (u) da borda do barco à borda do terrestre em que se embarca/desembarca. */
export function boardEdgeDistance(boat, unit) {
  const a = boat.mesh.position;
  const b = unit.mesh.position;
  return Math.hypot(a.x - b.x, a.z - b.z) - (boat.collisionRadius || 0) - (unit.collisionRadius || 0);
}

/**
 * Margem mais próxima de (x, z): primeiro ponto terrestre livre (anel crescente, 24 ângulos, ordem fixa) que tenha água
 * navegável a ≤ 3,5. Devolve `{sea, land}` (ponto de água para o barco e ponto de terra para os passageiros) ou `null`.
 */
export function findLandingSpot(gm, x, z, maxR = 40) {
  const lpf = gm.pathfinder;
  const npf = gm.navalPathfinder;
  if (!lpf || !npf) return null;
  for (let r = 0; r <= maxR; r += 1.5) {
    const steps = r === 0 ? 1 : 24;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU;
      const lx = x + Math.cos(a) * r;
      const lz = z + Math.sin(a) * r;
      if (!lpf.isWalkableWorld(lx, lz) || !npf.nearNavigable(lx, lz, 3.5)) continue;
      const sea = nearestSea(npf, lx, lz);
      if (sea) return { sea, land: { x: lx, z: lz } };
    }
  }
  return null;
}

/** Ponto navegável livre mais próximo de (x, z) num raio curto (ou `null`). */
function nearestSea(npf, x, z) {
  for (let r = 0; r <= 6; r += 1) {
    const steps = r === 0 ? 1 : 16;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU;
      const sx = x + Math.cos(a) * r;
      const sz = z + Math.sin(a) * r;
      if (npf.isWalkableWorld(sx, sz)) return { x: sx, z: sz };
    }
  }
  return null;
}

/** Ponto terrestre livre mais próximo do barco (onde o terrestre espera para embarcar) ou `null`. */
export function findBoardingPoint(gm, boat) {
  const lpf = gm.pathfinder;
  if (!lpf) return null;
  const p = boat.mesh.position;
  for (let r = 0.75; r <= 16; r += 0.75) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (lpf.isWalkableWorld(x, z)) return { x, z };
    }
  }
  return null;
}

function notify(gm, ownerId, text) {
  if (gm && gm.events) gm.events.emit(EVT.NOTIFY, { ownerId, text });
}

/** `boat` pode receber `unit` agora? (dono, vaga, camada, vivo). */
export function canLoad(boat, unit) {
  return !!boat && !!unit && boat.transportCapacity > 0 && !boat.isDead && !boat.isDying && !unit.isDead && !unit.isDying
    && unit.layer === 'ground' && unit.transportedBy === null && boat.ownerId === unit.ownerId && boat.cargo.length < boat.transportCapacity;
}

/** Embarca `unit` em `boat` (assume que já está perto). Devolve `false` se não coube. */
export function loadUnit(gm, boat, unit) {
  if (!canLoad(boat, unit)) return false;
  unit.stop();
  unit._boardTarget = null;
  unit.transportedBy = boat.id;
  boat.cargo.push(unit);
  boat.rampT = 1.4;
  unit.mesh.visible = false;
  if (unit.setSelected) unit.setSelected(false);
  if (gm.selectedUnits) {
    const i = gm.selectedUnits.indexOf(unit);
    if (i !== -1) gm.selectedUnits.splice(i, 1);
  }
  gm._removeFromGrid(unit);
  followBoat(unit, boat);
  return true;
}

/** Passageiro acompanha o barco (posição de sim e poses interpoladas). */
export function followBoat(unit, boat) {
  const p = unit.mesh.position;
  p.x = boat.mesh.position.x;
  p.z = boat.mesh.position.z;
  unit._prevPos.copy(p);
  unit._simPos.copy(p);
}

/** Tira `unit` da carga de seu barco (sem recolocá-lo no mundo). */
export function detachFromBoat(gm, unit) {
  const boat = unit.transportedBy !== null ? gm.entitiesById.get(unit.transportedBy) : null;
  if (boat && boat.cargo) {
    const i = boat.cargo.indexOf(unit);
    if (i !== -1) boat.cargo.splice(i, 1);
  }
  unit.transportedBy = null;
}

/** Desembarca TODA a carga em anel em torno de `land` ({x, z}). Devolve quantos desembarcaram. */
export function unloadAll(gm, boat, land) {
  const list = boat.cargo.slice();
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const u = list[i];
    const a = (i / Math.max(1, n)) * TAU;
    const rr = n > 1 ? 1.4 : 0;
    let x = land.x + Math.cos(a) * rr;
    let z = land.z + Math.sin(a) * rr;
    if (gm.pathfinder && !gm.pathfinder.isWalkableWorld(x, z)) {
      const s = gm.pathfinder.findNearestWalkable(x, z, 6);
      x = s.x;
      z = s.z;
    }
    detachFromBoat(gm, u);
    u.mesh.position.set(x, gm.terrain.getHeight(x, z), z);
    u._prevPos.copy(u.mesh.position);
    u._simPos.copy(u.mesh.position);
    u.mesh.visible = true;
    u.state = 'idle';
    gm._insertIntoGrid(u);
  }
  boat.cargo.length = 0;
  boat.rampT = 1.6;
  return n;
}

/** A barcaça morreu: cada passageiro morre junto (UNIT_DIED com o matador do barco, sem cadáver). */
export function killCargo(gm, boat) {
  const list = boat.cargo.slice();
  boat.cargo.length = 0;
  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    if (u.isDead || u.isDying) continue;
    u.transportedBy = null;
    u.lastAttackerOwnerId = boat.lastAttackerOwnerId;
    u._noCorpse = true;
    u.hp = 0;
    u.mesh.position.x = boat.mesh.position.x;
    u.mesh.position.z = boat.mesh.position.z;
    u.die();
    u.deathDuration = 0;
    u.mesh.visible = false;
  }
}

/** Ordem LOAD de um terrestre: anda até a margem junto ao barco e embarca ao chegar a ≤ `BOARD_DISTANCE`. */
export function orderLoad(gm, unit, boat) {
  if (!canLoad(boat, unit)) {
    if (boat && boat.cargo && boat.cargo.length >= boat.transportCapacity) notify(gm, unit.ownerId, '⚠️ Barcaça cheia');
    return false;
  }
  if (boardEdgeDistance(boat, unit) <= BOARD_DISTANCE) return loadUnit(gm, boat, unit);
  const pt = findBoardingPoint(gm, boat);
  if (!pt) return false;
  unit.moveTo(pt.x, pt.z, gm);
  unit._boardTarget = boat;
  unit._boardAt = { x: boat.mesh.position.x, z: boat.mesh.position.z };
  unit._boardRetry = 0;
  return true;
}

/** Por tick (chamado por `Unit.update` quando há `_boardTarget`): embarca ao chegar, reroteia se o barco foi embora. */
export function updateBoarding(gm, unit, delta) {
  const boat = unit._boardTarget;
  if (!boat || boat.isDead || boat.isDying) { unit._boardTarget = null; return; }
  if (boardEdgeDistance(boat, unit) <= BOARD_DISTANCE) {
    unit._boardTarget = null;
    if (!loadUnit(gm, boat, unit)) notify(gm, unit.ownerId, '⚠️ Barcaça cheia');
    return;
  }
  unit._boardRetry += delta;
  const moved = Math.hypot(boat.mesh.position.x - unit._boardAt.x, boat.mesh.position.z - unit._boardAt.z);
  const arrived = unit.state === 'idle';
  if (unit._boardRetry < 1 || (!arrived && moved < 4)) return;
  unit._boardRetry = 0;
  if (arrived && moved < 1) { // parou na margem e o barco continua longe da costa: desiste
    unit._boardTarget = null;
    notify(gm, unit.ownerId, '⚠️ Barcaça longe da margem');
    return;
  }
  const pt = findBoardingPoint(gm, boat);
  if (!pt) { unit._boardTarget = null; return; }
  unit.moveTo(pt.x, pt.z, gm);
  unit._boardTarget = boat;
  unit._boardAt = { x: boat.mesh.position.x, z: boat.mesh.position.z };
}

/** Ordem UNLOAD da barcaça: vai à água junto da margem mais próxima de (x, z) e solta a carga. */
export function orderUnload(gm, boat, x, z) {
  if (!boat.cargo || boat.cargo.length === 0) return false;
  const px = typeof x === 'number' ? x : boat.mesh.position.x;
  const pz = typeof z === 'number' ? z : boat.mesh.position.z;
  const spot = findLandingSpot(gm, px, pz);
  if (!spot) { notify(gm, boat.ownerId, '⚠️ Sem margem para desembarcar'); return false; }
  boat.moveTo(spot.sea.x, spot.sea.z, gm);
  boat._unloadOrder = spot;
  return true;
}

/** Por tick: ao chegar à água da margem solta a carga; desiste se parar longe. */
export function updateUnloading(gm, boat) {
  const spot = boat._unloadOrder;
  if (!boat.cargo || boat.cargo.length === 0) { boat._unloadOrder = null; return; }
  const p = boat.mesh.position;
  const dSea = Math.hypot(p.x - spot.sea.x, p.z - spot.sea.z);
  const dLand = Math.hypot(p.x - spot.land.x, p.z - spot.land.z) - (boat.collisionRadius || 0);
  const near = dSea <= 2.5 || dLand <= BOARD_DISTANCE + 1;
  if (near) {
    boat._unloadOrder = null;
    unloadAll(gm, boat, spot.land);
    boat.stop();
  } else if (boat.state === 'idle') {
    boat._unloadOrder = null;
    notify(gm, boat.ownerId, '⚠️ Não foi possível chegar à margem');
  }
}
