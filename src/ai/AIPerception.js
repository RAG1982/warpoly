import { getBuildingDef, getUnitDef, FACTIONS } from '../data/index.js';
import { SIM_DT } from '../sim/constants.js';
import { CMD } from '../sim/commands.js';
import { NEUTRAL_HOSTILE_ID } from '../sim/EntityIds.js';

/**
 * AIPerception — F5-02: o que a IA "sabe" sob a névoa de guerra.
 *
 * - Fontes de visão = unidades e construções da própria IA (`visionRadius`). Só entidades hostis
 *   dentro de alguma fonte entram no conhecimento; Brutal (`cheatVision`) enxerga tudo.
 * - Memória: construções hostis vistas ficam como "fantasmas" (última posição) até a posição ser
 *   revista sem elas; unidades expiram após `UNIT_MEMORY_S`.
 * - Grade grossa de exploração própria (independente da névoa do jogador local).
 * - Scout ativo: uma unidade ociosa visita as posições iniciais do mapa e as células inexploradas.
 * Determinístico (sem RNG; varreduras na ordem de `gm.buildings`/`getHostileUnitsOf`).
 */
const UNIT_MEMORY_S = 45;
const EXPLORE_N = 16;
const RESCOUT_COOLDOWN_S = 40;

/** Classe tática de um tipo de unidade (para composição do inimigo). */
export function unitClassOf(type) {
  const d = getUnitDef(type);
  if (d.isWorker) return 'worker';
  if (d.isSiege) return 'siege';
  if (d.suicide) return 'suicide';
  if (d.maxMana > 0) return 'caster';
  if (d.layer === 'air') return 'air';
  if (d.layer === 'naval') return d.isCombat === false ? 'worker' : 'ranged'; // F4-07: a IA ainda não modela navios (F5): tratados como atiradores/trabalhadores
  if (d.isRanged) return 'ranged';
  if (type === FACTIONS.human.units.cavalry || type === FACTIONS.orc.units.cavalry) return 'cavalry';
  if (d.modelOf && (d.modelOf === FACTIONS.human.units.cavalry || d.modelOf === FACTIONS.orc.units.cavalry)) return 'cavalry';
  return 'melee';
}

export class AIPerception {
  /** @param {import('./AIDirector.js').AIDirector} director */
  constructor(director) {
    this.director = director;
    this.gm = director.gm;
    this.playerId = director.playerId;
    this.cheat = !!director.profile.cheatVision;

    /** @type {Map<number, {id:number,type:string,ownerId:number,x:number,z:number,role:string|null,radius:number,lastSeen:number}>} */
    this.buildings = new Map();
    /** @type {Map<number, {id:number,type:string,ownerId:number,x:number,z:number,cls:string,lastSeen:number}>} */
    this.units = new Map();
    /** Unidades hostis visíveis neste instante (referências; reutilizado a cada tick). */
    this.visibleUnits = [];
    this.visibleBuildings = [];

    this._src = []; // [x, z, r, x, z, r, ...]
    this._srcCount = 0;
    this.now = 0;

    const map = this.gm.terrain && this.gm.terrain.mapDef ? this.gm.terrain.mapDef : null;
    this.mapHalf = map ? (map.playable ?? map.size) / 2 : 64;
    this.explored = new Uint8Array(EXPLORE_N * EXPLORE_N);
    this.exploredCount = 0;

    // Posições iniciais plausíveis dos inimigos: slots do mapa que não são o da própria IA.
    this.slotTargets = [];
    if (map && Array.isArray(map.startSlots)) {
      const me = director.baseCenter;
      for (let i = 0; i < map.startSlots.length; i++) {
        const s = map.startSlots[i];
        if (Math.hypot(s.x - me.x, s.z - me.y) < 20) continue;
        this.slotTargets.push({ x: s.x, z: s.z });
      }
    }

    this.scoutId = null;
    this._scoutTarget = null;
    this._scoutLostAt = -Infinity;
    this._visitedSlots = new Set();
  }

  // --- Fontes de visão ---

  _collectSources() {
    const src = this._src;
    let n = 0;
    const gm = this.gm;
    const units = gm.getUnitsOf(this.playerId);
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.isDead || u.isDying) continue;
      const p = u.mesh.position;
      src[n++] = p.x; src[n++] = p.z; src[n++] = (getUnitDef(u.type).visionRadius || 14) + (u.sightBonus || 0);
    }
    const bs = gm.buildings;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.ownerId !== this.playerId || b.isDead || !b.isConstructed) continue;
      const p = b.mesh.position;
      src[n++] = p.x; src[n++] = p.z; src[n++] = getBuildingDef(b.type).visionRadius || 14;
    }
    this._srcCount = n;
  }

  /** Alguma fonte de visão enxerga (x, z) com folga `pad`? */
  isVisible(x, z, pad = 0) {
    if (this.cheat) return true;
    const src = this._src;
    for (let i = 0; i < this._srcCount; i += 3) {
      const r = src[i + 2] + pad;
      const dx = src[i] - x;
      const dz = src[i + 1] - z;
      if (dx * dx + dz * dz <= r * r) return true;
    }
    return false;
  }

  _cellOf(x, z) {
    const n = EXPLORE_N;
    let cx = Math.floor(((x + this.mapHalf) / (this.mapHalf * 2)) * n);
    let cz = Math.floor(((z + this.mapHalf) / (this.mapHalf * 2)) * n);
    cx = cx < 0 ? 0 : cx >= n ? n - 1 : cx;
    cz = cz < 0 ? 0 : cz >= n ? n - 1 : cz;
    return cz * n + cx;
  }

  isExplored(x, z) {
    return this.cheat || this.explored[this._cellOf(x, z)] === 1;
  }

  /** NEW-42: dá a célula de (x, z) como explorada (marcha que não consegue chegar perto o bastante para vê-la). */
  markExploredAt(x, z) {
    const i = this._cellOf(x, z);
    if (!this.explored[i]) { this.explored[i] = 1; this.exploredCount++; }
  }

  _markExplored() {
    const n = EXPLORE_N;
    const size = (this.mapHalf * 2) / n;
    const src = this._src;
    for (let cz = 0; cz < n; cz++) {
      for (let cx = 0; cx < n; cx++) {
        const idx = cz * n + cx;
        if (this.explored[idx]) continue;
        const x = -this.mapHalf + (cx + 0.5) * size;
        const z = -this.mapHalf + (cz + 0.5) * size;
        for (let i = 0; i < this._srcCount; i += 3) {
          const dx = src[i] - x;
          const dz = src[i + 1] - z;
          const r = src[i + 2];
          if (dx * dx + dz * dz <= r * r) { this.explored[idx] = 1; this.exploredCount++; break; }
        }
      }
    }
  }

  // --- Atualização (1× por tick do diretor) ---

  update() {
    const gm = this.gm;
    const myId = this.playerId;
    this.now = gm.currentTick * SIM_DT;
    const now = this.now;
    this._collectSources();
    this._markExplored();

    // Construções hostis
    this.visibleBuildings.length = 0;
    const bs = gm.buildings;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.isDead || b.ownerId === NEUTRAL_HOSTILE_ID || !gm.isHostile(myId, b.ownerId)) continue;
      const p = b.mesh.position;
      const radius = b.collisionRadius || 2;
      if (!this.isVisible(p.x, p.z, radius * 0.7)) continue;
      this.visibleBuildings.push(b);
      let k = this.buildings.get(b.id);
      if (!k) {
        k = { id: b.id, type: b.type, ownerId: b.ownerId, x: p.x, z: p.z, role: getBuildingDef(b.type).role || null, radius, tier: 1, lastSeen: now };
        this.buildings.set(b.id, k);
      }
      k.lastSeen = now;
      k.tier = b.tier || 1;
    }
    // Fantasmas: posição revista sem a construção => removida da memória.
    for (const [id, k] of this.buildings) {
      if (k.lastSeen === now) continue;
      const ent = gm.getEntity(id);
      if ((!ent || ent.isDead) && this.isVisible(k.x, k.z, 0)) this.buildings.delete(id);
      else if (ent && !ent.isDead && !gm.isHostile(myId, ent.ownerId)) this.buildings.delete(id);
    }

    // Unidades hostis
    this.visibleUnits.length = 0;
    const hostile = gm.getHostileUnitsOf(myId);
    for (let i = 0; i < hostile.length; i++) {
      const u = hostile[i];
      if (u.isDead || u.isDying || u.ownerId === NEUTRAL_HOSTILE_ID) continue;
      const p = u.mesh.position;
      if (!this.isVisible(p.x, p.z, 0)) continue;
      this.visibleUnits.push(u);
      let k = this.units.get(u.id);
      if (!k) {
        k = { id: u.id, type: u.type, ownerId: u.ownerId, x: p.x, z: p.z, cls: unitClassOf(u.type), lastSeen: now };
        this.units.set(u.id, k);
      }
      k.type = u.type;
      k.x = p.x; k.z = p.z; k.lastSeen = now;
    }
    for (const [id, k] of this.units) {
      if (k.lastSeen === now) continue;
      if (now - k.lastSeen > UNIT_MEMORY_S) { this.units.delete(id); continue; }
      const ent = gm.getEntity(id);
      if (!ent || ent.isDead) this.units.delete(id);
    }
  }

  // --- Consultas ---

  knownBuildings() {
    return this.buildings.values();
  }

  /** Construção conhecida mais próxima de (x, z) que satisfaz `pred` (ou null). */
  nearestBuilding(x, z, pred = null) {
    let best = null;
    let bd = Infinity;
    for (const k of this.buildings.values()) {
      if (pred && !pred(k)) continue;
      const d = (k.x - x) * (k.x - x) + (k.z - z) * (k.z - z);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  hasIntel() {
    return this.buildings.size > 0;
  }

  /** Composição estimada do inimigo (unidades vistas recentemente + construções conhecidas). */
  composition(out = null) {
    const c = out || {};
    c.melee = 0; c.ranged = 0; c.cavalry = 0; c.siege = 0; c.caster = 0; c.worker = 0; c.suicide = 0; c.air = 0;
    c.total = 0; c.towers = 0; c.walls = 0; c.hqTier2 = false; c.buildings = this.buildings.size;
    for (const k of this.units.values()) {
      c[k.cls]++;
      if (k.cls !== 'worker') c.total++;
    }
    for (const k of this.buildings.values()) {
      if (k.role === 'hq' && k.tier >= 2) c.hqTier2 = true;
      if (k.role === 'wall') c.walls++;
      else if (getBuildingDef(k.type).tower) c.towers++;
    }
    return c;
  }

  // --- Scout ativo ---

  /** Próximo destino de exploração: slots ainda não visitados, depois a célula inexplorada mais próxima. */
  nextExploreTarget(fromX, fromZ) {
    for (let i = 0; i < this.slotTargets.length; i++) {
      const s = this.slotTargets[i];
      if (this._visitedSlots.has(i)) continue;
      if (this.isExplored(s.x, s.z) && this.isVisible(s.x, s.z, 0)) { this._visitedSlots.add(i); continue; }
      if (this.isExplored(s.x, s.z)) { this._visitedSlots.add(i); continue; }
      return { x: s.x, z: s.z, slot: i };
    }
    return this.nearestUnexploredCell(fromX, fromZ);
  }

  /** Esquece o que foi explorado (inimigos podem ter construído em áreas já vistas) e recomeça a varredura. */
  resetExplored() {
    this.explored.fill(0);
    this.exploredCount = 0;
    this._visitedSlots.clear();
    this.resets = (this.resets || 0) + 1;
  }

  /** Centro da célula inexplorada mais próxima de (fromX, fromZ) (varredura em ordem fixa), ou null. */
  nearestUnexploredCell(fromX, fromZ) {
    const n = EXPLORE_N;
    const size = (this.mapHalf * 2) / n;
    let best = null;
    let bd = Infinity;
    for (let cz = 0; cz < n; cz++) {
      for (let cx = 0; cx < n; cx++) {
        if (this.explored[cz * n + cx]) continue;
        const x = -this.mapHalf + (cx + 0.5) * size;
        const z = -this.mapHalf + (cz + 0.5) * size;
        const d = (x - fromX) * (x - fromX) + (z - fromZ) * (z - fromZ);
        if (d < bd) { bd = d; best = { x, z, slot: -1 }; }
      }
    }
    return best;
  }

  /** Slot inexplorado/inimigo mais próximo para o exército marchar quando não há alvo conhecido. */
  marchTarget() {
    const me = this.director.baseCenter;
    let best = null;
    let bd = Infinity;
    for (let i = 0; i < this.slotTargets.length; i++) {
      const s = this.slotTargets[i];
      const d = Math.hypot(s.x - me.x, s.z - me.y);
      // slots já revistos sem construções inimigas são descartados
      if (this.isExplored(s.x, s.z) && !this.cheat) {
        let has = false;
        for (const k of this.buildings.values()) if (Math.hypot(k.x - s.x, k.z - s.z) < 30) { has = true; break; }
        if (!has) continue;
      }
      if (d < bd) { bd = d; best = s; }
    }
    if (best) return best;
    // Slots esgotados sem achar nada: varre as células inexploradas; tudo visto => recomeça a varredura.
    let cell = this.nearestUnexploredCell(me.x, me.y);
    if (!cell) { this.resetExplored(); cell = this.nearestUnexploredCell(me.x, me.y); }
    return cell;
  }

  /** Gerencia o explorador (chamar 1× por tick, depois de `update`). */
  manageScout() {
    const dir = this.director;
    if (!dir.profile.scout || this.cheat) return;
    const gm = this.gm;
    let scout = this.scoutId !== null ? gm.getEntity(this.scoutId) : null;
    if (scout && (scout.isDead || scout.isDying)) scout = null;
    if (this.scoutId !== null && !scout) {
      dir.unreserve(this.scoutId);
      this.scoutId = null;
      this._scoutLostAt = this.now;
    }
    // Para de explorar quando já conhece uma base inimiga (o exército cuida do resto).
    if (this.hasIntel()) {
      if (scout) {
        dir.unreserve(scout.id);
        this.scoutId = null;
        dir.issue({ type: CMD.MOVE, playerId: this.playerId, unitIds: [scout.id], x: dir.militaryRally().x, z: dir.militaryRally().z });
      }
      return;
    }
    if (!scout) {
      if (this.now - this._scoutLostAt < RESCOUT_COOLDOWN_S || this.now < 25) return;
      scout = this._pickScout();
      if (!scout) return;
      this.scoutId = scout.id;
      dir.reserve(scout.id);
      this._scoutTarget = null;
    }
    const p = scout.mesh.position;
    const t = this._scoutTarget;
    if (!t || Math.hypot(t.x - p.x, t.z - p.z) < 10 || scout.state === 'idle') {
      if (t && t.slot >= 0 && Math.hypot(t.x - p.x, t.z - p.z) < 14) this._visitedSlots.add(t.slot);
      this._scoutTarget = this.nextExploreTarget(p.x, p.z);
      if (!this._scoutTarget) { this.resetExplored(); this._scoutTarget = this.nextExploreTarget(p.x, p.z); }
      if (this._scoutTarget) {
        dir.issue({ type: CMD.MOVE, playerId: this.playerId, unitIds: [scout.id], x: this._scoutTarget.x, z: this._scoutTarget.z });
      }
    }
  }

  _pickScout() {
    const dir = this.director;
    const units = dir.getOwnUnits();
    let best = null;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.isDead || u.isDying || u.type === dir.workerType || dir.isReserved(u.id)) continue;
      if (u.state !== 'idle') continue;
      const d = getUnitDef(u.type);
      if (d.isSiege || d.suicide || d.maxMana > 0) continue;
      const cls = unitClassOf(u.type);
      const score = (cls === 'cavalry' ? 0 : cls === 'melee' ? 1 : 2) * 1000 + u.id;
      if (!best || score < best.score) best = { u, score };
    }
    return best ? best.u : null;
  }
}
