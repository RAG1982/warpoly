import { fhypot } from '../sim/fmath.js';
import { CMD } from '../sim/commands.js';
import { getUnitDef } from '../data/index.js';
import { hasStatus } from '../sim/statuses.js';
import { canCast, resolveAbility, canPolymorph } from '../sim/abilities.js';
import { unitClassOf } from './AIPerception.js';

/**
 * AIMicroManager — F5-05: micro tático da IA. Todas as ações saem como comandos (`director.issue`)
 * e só enxergam o que a percepção (F5-02) conhece (`perception.visibleUnits`).
 * Nível de micro (`profile.micro`): 1 recuar feridos · 2 + focar fogo, kiting (só contra alvos mais lentos),
 * escolta de cerco, assédio a trabalhadores, magias · 3 + flanquear.
 */
const RETREAT_HP = 0.3;
const KITE_TRIGGER = 3.2;
const KITE_STEP = 5;
const MAX_KITERS_PER_TICK = 4;
const SIEGE_THREAT_RADIUS = 11;
const FLANK_OFFSET = 22;
const HARASS_MIN_TIME = 240;

const PRIORITY = { caster: 0, suicide: 0, siege: 1, ranged: 1, air: 1, melee: 2, cavalry: 2, worker: 3 };

export class AIMicroManager {
  /** @param {import('./AIDirector.js').AIDirector} director */
  constructor(director) {
    this.director = director;
    this.gm = director.gm;
    this.retreating = new Set();
    /** id -> simTime em que recuou (kiting) */
    this.kiting = new Map();
    this.harass = new Set();
    /** grupo de flanco: { ids:Set, wx, wz, targetId, until } */
    this.flank = null;
    this.stats = { retreats: 0, focus: 0, kites: 0, escorts: 0, harass: 0, flanks: 0, casts: 0 };
    this._army = [];
  }

  get level() {
    return this.director.profile.micro;
  }

  // --- utilidades ---

  _isArmy(u) {
    if (u.isDead || u.isDying || u.type === this.director.workerType) return false;
    const d = getUnitDef(u.type);
    return !d.isWorker && d.isCombat !== false;
  }

  _collectArmy() {
    const out = this._army;
    out.length = 0;
    const units = this.director.getOwnUnits();
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (this._isArmy(u) && !this.director.isReserved(u.id)) out.push(u);
    }
    return out;
  }

  _enemiesNear(x, z, r, out = []) {
    const vis = this.director.perception.visibleUnits;
    const r2 = r * r;
    for (let i = 0; i < vis.length; i++) {
      const e = vis[i];
      if (e.isDead || e.isDying) continue;
      const p = e.mesh.position;
      if ((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) <= r2) out.push(e);
    }
    return out;
  }

  // --- ciclo ---

  update() {
    const lvl = this.level;
    if (lvl <= 0) return;
    const army = this._collectArmy();
    this._manageRetreat(army);
    if (lvl >= 2 && this.director.perception.visibleUnits.length > 0) {
      this._focusFire(army);
      this._kite(army);
      this._protectSiege(army);
    }
    if (lvl >= 2) {
      this._manageHarass(army);
      this._castSpells(army);
    }
    if (lvl >= 3) this._manageFlank();
  }

  // --- 1. recuar feridos ---

  _manageRetreat(army) {
    const dir = this.director;
    const base = dir.baseCenter;
    const rally = dir.militaryRally();
    // libera quem chegou à base
    for (const id of this.retreating) {
      const u = this.gm.getEntity(id);
      if (!u || u.isDead || (u.state === 'idle' && fhypot(u.mesh.position.x - base.x, u.mesh.position.z - base.y) < 40)) {
        this.retreating.delete(id);
        dir.unreserve(id);
      }
    }
    const ids = [];
    for (let i = 0; i < army.length; i++) {
      const u = army[i];
      if (u.hp >= u.maxHp * RETREAT_HP || this.retreating.has(u.id)) continue;
      if (u.state !== 'attacking' && u.state !== 'attackMoving' && u.state !== 'moving') continue;
      const p = u.mesh.position;
      if (fhypot(p.x - base.x, p.z - base.y) < 35) continue; // perto de casa luta até o fim
      if (this._enemiesNear(p.x, p.z, 14).length === 0) continue;
      ids.push(u.id);
    }
    if (ids.length > 0 && dir.issue({ type: CMD.MOVE, playerId: dir.playerId, unitIds: ids, x: rally.x, z: rally.z })) {
      for (let i = 0; i < ids.length; i++) { this.retreating.add(ids[i]); dir.reserve(ids[i]); }
      this.stats.retreats += ids.length;
    }
  }

  // --- 2. focar fogo ---

  _focusFire(army) {
    const dir = this.director;
    // unidades em combate
    let cx = 0;
    let cz = 0;
    let n = 0;
    const fighters = [];
    for (let i = 0; i < army.length; i++) {
      const u = army[i];
      if (u.state !== 'attacking' && u.state !== 'attackMoving') continue;
      if (this.kiting.has(u.id)) continue;
      const p = u.mesh.position;
      cx += p.x; cz += p.z; n++;
      fighters.push(u);
    }
    if (n < 2) return;
    cx /= n; cz /= n;
    const near = this._enemiesNear(cx, cz, 16);
    if (near.length < 2) return;
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      const cls = unitClassOf(e.type);
      const score = (PRIORITY[cls] ?? 2) * 10000 + e.hp * (1 + Math.max(0, getUnitDef(e.type).armor || 0) / 20) + e.id * 1e-6;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (!best) return;
    const bp = best.mesh.position;
    const ids = [];
    for (let i = 0; i < fighters.length; i++) {
      const u = fighters[i];
      if (u.targetEntity === best) continue;
      const def = getUnitDef(u.type);
      if (def.isSiege) continue;
      const p = u.mesh.position;
      if (fhypot(p.x - bp.x, p.z - bp.z) > (def.attackRange || 2) + 7) continue;
      // só redireciona quem já luta contra unidade (não atrapalha cerco/construção)
      const t = u.targetEntity;
      if (t && (t.fullMesh || t.isConstructed !== undefined) && !def.isRanged) continue;
      ids.push(u.id);
    }
    if (ids.length >= 2 && dir.issue({ type: CMD.ATTACK, playerId: dir.playerId, unitIds: ids, targetId: best.id })) {
      this.stats.focus++;
    }
  }

  // --- 3. kiting de ranged ---

  _kite(army) {
    const dir = this.director;
    const now = dir.simTime;
    // reengaja quem já recuou
    for (const [id, t] of this.kiting) {
      const u = this.gm.getEntity(id);
      if (!u || u.isDead) { this.kiting.delete(id); continue; }
      if (now - t < 0.45) continue;
      const p = u.mesh.position;
      const range = (getUnitDef(u.type).attackRange || 6) + 2;
      const foes = this._enemiesNear(p.x, p.z, range);
      this.kiting.delete(id);
      if (foes.length === 0) continue;
      let tgt = null;
      let bd = Infinity;
      for (let i = 0; i < foes.length; i++) {
        const q = foes[i].mesh.position;
        const d = (q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z);
        if (d < bd) { bd = d; tgt = foes[i]; }
      }
      dir.issue({ type: CMD.ATTACK, playerId: dir.playerId, unitIds: [id], targetId: tgt.id });
    }
    let kiters = 0;
    for (let i = 0; i < army.length && kiters < MAX_KITERS_PER_TICK; i++) {
      const u = army[i];
      const def = getUnitDef(u.type);
      if (!def.isRanged || def.isSiege || def.maxMana > 0 || u.state !== 'attacking' || this.kiting.has(u.id)) continue;
      const p = u.mesh.position;
      const close = this._enemiesNear(p.x, p.z, KITE_TRIGGER);
      // Só vale fugir de quem é mais lento (cerco, alvo sob Lentidão…): as infantarias/montarias são mais rápidas
      // que os atiradores, e correr deles só perde dano.
      const mySpeed = (def.speed || 4) * ((u.mods && u.mods.speedMul) || 1);
      let melee = null;
      for (let j = 0; j < close.length; j++) {
        const c = unitClassOf(close[j].type);
        if (c !== 'melee' && c !== 'cavalry' && c !== 'siege' && c !== 'suicide') continue;
        const hisSpeed = (getUnitDef(close[j].type).speed || 4) * ((close[j].mods && close[j].mods.speedMul) || 1);
        if (mySpeed > hisSpeed * 1.05) { melee = close[j]; break; }
      }
      if (!melee) continue;
      // escudo: se há aliado de corpo a corpo colado no atacante, o atirador fica
      let screened = false;
      for (let j = 0; j < army.length; j++) {
        const a = army[j];
        if (a === u || getUnitDef(a.type).isRanged) continue;
        const q = a.mesh.position;
        if ((q.x - melee.mesh.position.x) ** 2 + (q.z - melee.mesh.position.z) ** 2 < 9) { screened = true; break; }
      }
      if (screened) continue;
      const m = melee.mesh.position;
      let dx = p.x - m.x;
      let dz = p.z - m.z;
      const len = fhypot(dx, dz) || 1;
      dx /= len; dz /= len;
      // foge em direção à base quando o vetor aponta para fora do mapa
      const home = dir.baseCenter;
      const toHome = fhypot(home.x - p.x, home.y - p.z) || 1;
      dx = dx * 0.7 + ((home.x - p.x) / toHome) * 0.3;
      dz = dz * 0.7 + ((home.y - p.z) / toHome) * 0.3;
      const l2 = fhypot(dx, dz) || 1;
      if (dir.issue({ type: CMD.MOVE, playerId: dir.playerId, unitIds: [u.id], x: p.x + (dx / l2) * KITE_STEP, z: p.z + (dz / l2) * KITE_STEP })) {
        this.kiting.set(u.id, now);
        this.stats.kites++;
        kiters++;
      }
    }
  }

  // --- 4. proteger cerco ---

  _protectSiege(army) {
    const dir = this.director;
    let worst = null;
    let worstThreat = null;
    for (let i = 0; i < army.length; i++) {
      const s = army[i];
      if (!getUnitDef(s.type).isSiege) continue;
      const p = s.mesh.position;
      const threats = this._enemiesNear(p.x, p.z, SIEGE_THREAT_RADIUS).filter(e => unitClassOf(e.type) !== 'worker');
      if (threats.length === 0) continue;
      if (!worst || threats.length > worstThreat.length) { worst = s; worstThreat = threats; }
    }
    if (!worst) return;
    const sp = worst.mesh.position;
    let t = null;
    let bd = Infinity;
    for (let i = 0; i < worstThreat.length; i++) {
      const q = worstThreat[i].mesh.position;
      const d = (q.x - sp.x) ** 2 + (q.z - sp.z) ** 2;
      if (d < bd) { bd = d; t = worstThreat[i]; }
    }
    const escorts = [];
    for (let i = 0; i < army.length; i++) {
      const u = army[i];
      const def = getUnitDef(u.type);
      if (def.isSiege || def.suicide || def.maxMana > 0) continue;
      if (u.targetEntity === t) continue;
      const p = u.mesh.position;
      if (fhypot(p.x - sp.x, p.z - sp.z) > 26) continue;
      const tg = u.targetEntity;
      const onBuilding = tg && (tg.fullMesh || tg.isConstructed !== undefined);
      if (u.state === 'idle' || u.state === 'moving' || onBuilding) escorts.push(u.id);
    }
    if (escorts.length > 0 && dir.issue({ type: CMD.ATTACK, playerId: dir.playerId, unitIds: escorts, targetId: t.id })) {
      this.stats.escorts++;
    }
  }

  // --- 5. assédio a trabalhadores ---

  _manageHarass(army) {
    const dir = this.director;
    const per = dir.perception;
    // limpa mortos
    const alive = [];
    for (const id of this.harass) {
      const u = this.gm.getEntity(id);
      if (!u || u.isDead || u.isDying) { this.harass.delete(id); dir.unreserve(id); } else alive.push(u);
    }
    // formação do grupo: 2 montarias ociosas, depois de HARASS_MIN_TIME, com base inimiga conhecida
    if (this.harass.size === 0) {
      if (dir.simTime < HARASS_MIN_TIME || !per.hasIntel()) return;
      const waveIds = dir.militaryManager.waveIds;
      const cav = [];
      for (let i = 0; i < army.length; i++) {
        const u = army[i];
        if (u.type === dir.cavalryType && u.state === 'idle' && !waveIds.has(u.id) && u.hp >= u.maxHp * 0.7) cav.push(u);
      }
      if (cav.length < 3) return; // mantém ao menos 1 em casa
      for (let i = 0; i < 2; i++) { this.harass.add(cav[i].id); dir.reserve(cav[i].id); alive.push(cav[i]); }
      this.stats.harass++;
    }
    if (alive.length === 0) return;
    let cx = 0;
    let cz = 0;
    let hp = 0;
    let mx = 0;
    for (let i = 0; i < alive.length; i++) {
      cx += alive[i].mesh.position.x; cz += alive[i].mesh.position.z;
      hp += alive[i].hp; mx += alive[i].maxHp;
    }
    cx /= alive.length; cz /= alive.length;
    const rally = dir.militaryRally();
    // perigo: soldados inimigos por perto ou PV baixo => volta
    const soldiers = this._enemiesNear(cx, cz, 13).filter(e => unitClassOf(e.type) !== 'worker');
    if (soldiers.length >= 3 || hp < mx * 0.4) {
      const ids = alive.map(u => u.id);
      dir.issue({ type: CMD.MOVE, playerId: dir.playerId, unitIds: ids, x: rally.x, z: rally.z });
      for (let i = 0; i < ids.length; i++) dir.unreserve(ids[i]);
      this.harass.clear();
      return;
    }
    // alvo: trabalhador visível mais próximo; senão marcha ao Centro conhecido
    let tgt = null;
    let bd = Infinity;
    const vis = per.visibleUnits;
    for (let i = 0; i < vis.length; i++) {
      const e = vis[i];
      if (e.isDead || unitClassOf(e.type) !== 'worker') continue;
      const q = e.mesh.position;
      const d = (q.x - cx) ** 2 + (q.z - cz) ** 2;
      if (d < bd) { bd = d; tgt = e; }
    }
    const needOrder = [];
    for (let i = 0; i < alive.length; i++) {
      const u = alive[i];
      if (tgt) { if (u.targetEntity !== tgt) needOrder.push(u.id); } else if (u.state === 'idle') needOrder.push(u.id);
    }
    if (needOrder.length === 0) return;
    if (tgt) {
      dir.issue({ type: CMD.ATTACK, playerId: dir.playerId, unitIds: needOrder, targetId: tgt.id });
    } else {
      const hq = per.nearestBuilding(cx, cz, k => k.role === 'hq');
      if (hq) dir.issue({ type: CMD.ATTACK_MOVE, playerId: dir.playerId, unitIds: needOrder, x: hq.x, z: hq.z });
    }
  }

  // --- 6. flanquear ---

  /**
   * Separa o grupo de flanco da onda (Brutal): montarias dão a volta por um waypoint lateral e só
   * então atacam o mesmo alvo. Devolve as unidades que atacam já (o resto do exército).
   */
  planWave(units, target) {
    if (this.level < 3 || this.flank) return units;
    const cav = [];
    const main = [];
    const cavType = this.director.cavalryType;
    for (let i = 0; i < units.length; i++) (units[i].type === cavType ? cav : main).push(units[i]);
    if (cav.length < 2 || main.length < 3) return units;
    const base = this.director.baseCenter;
    let dx = target.x - base.x;
    let dz = target.z - base.y;
    const len = fhypot(dx, dz) || 1;
    dx /= len; dz /= len;
    // lado: o que ficar dentro do mapa (determinístico: sinal da coordenada X do alvo)
    const side = target.x >= 0 ? 1 : -1;
    const wx = target.x - dx * 14 + -dz * side * FLANK_OFFSET;
    const wz = target.z - dz * 14 + dx * side * FLANK_OFFSET;
    const ids = cav.map(u => u.id);
    if (!this.director.issue({ type: CMD.MOVE, playerId: this.director.playerId, unitIds: ids, x: wx, z: wz })) return units;
    this.flank = { ids: new Set(ids), wx, wz, targetId: target.id, since: this.director.simTime };
    this.stats.flanks++;
    return main;
  }

  _manageFlank() {
    const f = this.flank;
    if (!f) return;
    const dir = this.director;
    let alive = 0;
    let arrived = 0;
    for (const id of f.ids) {
      const u = this.gm.getEntity(id);
      if (!u || u.isDead) { f.ids.delete(id); continue; }
      alive++;
      const p = u.mesh.position;
      if (fhypot(p.x - f.wx, p.z - f.wz) < 9 || u.state === 'idle') arrived++;
    }
    const target = this.gm.getEntity(f.targetId);
    const timeout = dir.simTime - f.since > 40;
    if (alive === 0 || !target || target.isDead) { this.flank = null; return; }
    if (arrived >= alive || timeout) {
      dir.issue({ type: CMD.ATTACK, playerId: dir.playerId, unitIds: Array.from(f.ids), targetId: f.targetId });
      this.flank = null;
    }
  }

  // --- 7. magias ---

  _castSpells(army) {
    const dir = this.director;
    const gm = this.gm;
    for (let i = 0; i < army.length; i++) {
      const c = army[i];
      if (!(c.maxMana > 0) || !c.abilities || c.abilities.length === 0 || c.state === 'casting') continue;
      const cp = c.mesh.position;
      // só conjura com inimigos à vista perto do conjurador
      const foes = this._enemiesNear(cp.x, cp.z, 20);
      if (foes.length === 0) continue;
      const plan = this._planCast(c, foes, army, gm);
      if (!plan) continue;
      const cmd = { type: CMD.CAST, playerId: dir.playerId, unitIds: [c.id], abilityId: plan.id };
      if (plan.targetId !== undefined) cmd.targetId = plan.targetId;
      if (plan.x !== undefined) { cmd.x = plan.x; cmd.z = plan.z; }
      if (dir.issue(cmd)) { this.stats.casts++; }
    }
  }

  _planCast(c, foes, army, gm) {
    const cp = c.mesh.position;
    for (let a = 0; a < c.abilities.length; a++) {
      const ab = resolveAbility(gm, c.abilities[a]);
      if (!ab || !canCast(gm, c, ab).ok) continue;
      const range = ab.range || 0;
      const inRange = (e, extra = 4) => fhypot(e.mesh.position.x - cp.x, e.mesh.position.z - cp.z) <= range + extra;
      const clusterAt = (e, r) => {
        let n = 0;
        for (let k = 0; k < foes.length; k++) {
          const q = foes[k].mesh.position;
          if (fhypot(q.x - e.mesh.position.x, q.z - e.mesh.position.z) <= r) n++;
        }
        return n;
      };
      switch (ab.id) {
        case 'fireball': {
          let best = null; let bs = 0;
          for (const e of foes) {
            if (!inRange(e)) continue;
            const s = clusterAt(e, 4) * 100 + (unitClassOf(e.type) === 'caster' ? 150 : 0) + Math.min(e.hp, 99);
            if (s > bs) { bs = s; best = e; }
          }
          if (best && (bs >= 200 || best.hp >= 40)) return { id: ab.id, targetId: best.id };
          break;
        }
        case 'slow': {
          let best = null;
          for (const e of foes) {
            if (!inRange(e) || hasStatus(e, 'slow')) continue;
            const cls = unitClassOf(e.type);
            if ((cls === 'melee' || cls === 'cavalry') && (!best || e.hp > best.hp)) best = e;
          }
          if (best && best.hp >= 100) return { id: ab.id, targetId: best.id };
          break;
        }
        case 'polymorph': {
          let best = null;
          for (const e of foes) {
            if (!inRange(e) || !canPolymorph(e) || unitClassOf(e.type) === 'worker') continue;
            if (!best || e.hp > best.hp) best = e;
          }
          if (best && best.hp >= 160) return { id: ab.id, targetId: best.id };
          break;
        }
        case 'death_touch': {
          let best = null;
          for (const e of foes) {
            if (!inRange(e, 2)) continue;
            if (!best || e.hp < best.hp) best = e;
          }
          if (best && best.hp <= 160) return { id: ab.id, targetId: best.id };
          break;
        }
        case 'blizzard': case 'ash_cloud': case 'whirlwind': {
          let best = null; let bn = 0;
          for (const e of foes) {
            if (!inRange(e, 0)) continue;
            const n = clusterAt(e, 5);
            if (n > bn) { bn = n; best = e; }
          }
          if (best && bn >= (ab.id === 'whirlwind' ? 3 : 3)) return { id: ab.id, x: best.mesh.position.x, z: best.mesh.position.z };
          break;
        }
        case 'flameshield': case 'haste_spell': case 'unholy_armor': {
          const status = ab.id === 'haste_spell' ? 'haste' : ab.id;
          let best = null;
          for (const u of army) {
            if (u === c || u.state !== 'attacking' || hasStatus(u, status)) continue;
            const def = getUnitDef(u.type);
            if (def.isRanged || def.isSiege) continue;
            if (fhypot(u.mesh.position.x - cp.x, u.mesh.position.z - cp.z) > range) continue;
            if (!best || u.hp > best.hp) best = u;
          }
          if (best) return { id: ab.id, targetId: best.id };
          break;
        }
        case 'raise_dead':
          return { id: ab.id };
        default: {
          // M2-11: habilidades de herói (`hero_*`), cada uma com a sua condição de uso
          if (ab.id.startsWith('hero_')) {
            const plan = this._planHeroCast(ab, c, foes, army, gm);
            if (plan) return plan;
          }
          break;
        }
      }
    }
    return null;
  }

  /**
   * M2-11: planejamento das habilidades de herói (as 18 de `src/data/units.js` `hero_*`, mais as 5 duplicatas
   * de `abilities.js`). Determinístico (sem RNG; empates pela ordem de `foes`/`army`). `canCast` (mana, recarga,
   * cadáveres) já foi checado por `_planCast`. Tabela herói → habilidade → condição: `docs/01_ARQUITETURA.md`.
   * @returns {{id:string, targetId?:number, x?:number, z?:number}|null}
   */
  _planHeroCast(ab, c, foes, army, gm) {
    const cp = c.mesh.position;
    const range = ab.range || 0;
    const distTo = e => fhypot(e.mesh.position.x - cp.x, e.mesh.position.z - cp.z);
    const foesWithin = r => {
      let n = 0;
      for (let k = 0; k < foes.length; k++) if (distTo(foes[k]) <= r) n++;
      return n;
    };
    const clusterAt = (e, r) => {
      let n = 0;
      for (let k = 0; k < foes.length; k++) {
        const q = foes[k].mesh.position;
        if (fhypot(q.x - e.mesh.position.x, q.z - e.mesh.position.z) <= r) n++;
      }
      return n;
    };
    /** aliados do exército (sem o herói) em combate a até `r` do herói, sem o status `st` */
    const fightersWithout = (r, st) => {
      let n = 0;
      for (let k = 0; k < army.length; k++) {
        const u = army[k];
        if (u === c || u.state !== 'attacking' || hasStatus(u, st)) continue;
        if (fhypot(u.mesh.position.x - cp.x, u.mesh.position.z - cp.z) <= r) n++;
      }
      return n;
    };
    const fighting = c.state === 'attacking' || foesWithin(8) > 0;

    switch (ab.id) {
      // buff pessoal ofensivo: só em combate (inimigo a ≤ 10) e sem o buff ativo
      case 'hero_war_cry':
        if (!hasStatus(c, 'bloodlust') && foesWithin(10) > 0 && (c.state === 'attacking' || foesWithin(6) > 0)) return { id: ab.id };
        break;
      // buff pessoal defensivo: ≥ 1 inimigo corpo a corpo colado no herói (≤ 5), sem o status
      case 'hero_defensive_stance': case 'hero_revide_stance': {
        if (hasStatus(c, 'flameshield')) break;
        for (let k = 0; k < foes.length; k++) {
          const cls = unitClassOf(foes[k].type);
          if ((cls === 'melee' || cls === 'cavalry') && distTo(foes[k]) <= 5) return { id: ab.id };
        }
        break;
      }
      // dano em área com alvo inimigo: melhor aglomerado; vale com ≥ 2 inimigos no raio ou 1 alvo com PV ≥ 1,5× o dano
      case 'hero_cleave_strike': case 'hero_shield_bash': case 'hero_ground_slam': case 'hero_crown_hammer':
      case 'hero_ember_strike': case 'hero_marshal_charge': case 'hero_arcane_bolt': {
        const fx = ab.effects.find(e => e.kind === 'damage');
        const r = fx.radius || 2;
        let best = null;
        let bs = 0;
        for (let k = 0; k < foes.length; k++) {
          const e = foes[k];
          if (distTo(e) > range + 1.5) continue;
          const n = clusterAt(e, r);
          const worth = n >= 2 || e.hp >= fx.amount * 1.5;
          if (!worth) continue;
          const s = n * 1000 + Math.min(e.hp, 999);
          if (s > bs) { bs = s; best = e; }
        }
        if (best) return { id: ab.id, targetId: best.id };
        break;
      }
      // cura própria (150 PV): falta ≥ 120 PV
      case 'hero_clan_fire':
        if (c.maxHp - c.hp >= 120) return { id: ab.id };
        break;
      // cura de aliado (repeat): o aliado mais ferido (< 60 % PV) dentro do alcance, herói incluído
      case 'hero_mend': {
        const below = ab.autocastBelow || 0.6;
        const own = this.director.getOwnUnits();
        let best = null;
        let br = below;
        for (let k = 0; k < own.length; k++) {
          const u = own[k];
          if (u.isDead || u.isDying || u.hp <= 0) continue;
          if (fhypot(u.mesh.position.x - cp.x, u.mesh.position.z - cp.z) > range) continue;
          const ratio = u.hp / u.maxHp;
          if (ratio < br) { br = ratio; best = u; }
        }
        if (best) return { id: ab.id, targetId: best.id };
        break;
      }
      // canalização (Tempestade Arcana): aglomerado de ≥ 3 inimigos a ≤ alcance e NENHUM inimigo adjacente ao herói (≤ 3)
      case 'hero_blizzard': case 'hero_arcane_storm': {
        if (foesWithin(3) > 0) break;
        let best = null;
        let bn = 0;
        for (let k = 0; k < foes.length; k++) {
          const e = foes[k];
          if (distTo(e) > range) continue;
          const n = clusterAt(e, 5);
          if (n > bn) { bn = n; best = e; }
        }
        if (best && bn >= 3) return { id: ab.id, x: best.mesh.position.x, z: best.mesh.position.z };
        break;
      }
      // buffs em área aliada (herói + aliados): ≥ 3 aliados em combate no raio, sem o status, e o herói em combate
      case 'hero_banner':
        if (fighting && fightersWithout(9, 'haste') >= 3) return { id: ab.id };
        break;
      case 'hero_shield_line':
        if (fighting && fightersWithout(7, 'flameshield') >= 3) return { id: ab.id };
        break;
      case 'hero_horde_roar':
        if (fighting && fightersWithout(8, 'bloodlust') >= 3) return { id: ab.id };
        break;
      // invulnerabilidade pessoal (custa metade da vida atual ao fim): só com < 50 % de PV, em combate e sem o status
      case 'hero_blood_pact': case 'hero_ash_pact':
        if (!hasStatus(c, 'unholy_armor') && c.hp < c.maxHp * 0.5 && foesWithin(8) > 0) return { id: ab.id };
        break;
      // dreno de vida: mata alvo com PV ≤ dano (70) ou, com o herói ≥ 15 % ferido, o inimigo de mais PV no alcance
      case 'hero_soul_drain': {
        const fx = ab.effects.find(e => e.kind === 'damage');
        let kill = null;
        let tank = null;
        for (let k = 0; k < foes.length; k++) {
          const e = foes[k];
          if (distTo(e) > range + 2) continue;
          if (e.hp <= fx.amount && (!kill || e.hp > kill.hp)) kill = e;
          if (!tank || e.hp > tank.hp) tank = e;
        }
        if (kill) return { id: ab.id, targetId: kill.id };
        if (tank && c.hp <= c.maxHp * 0.85) return { id: ab.id, targetId: tank.id };
        break;
      }
      // erguer esqueletos (canCast já garante ≥ 1 cadáver): com ≥ 2 cadáveres no raio
      case 'hero_ancestors': {
        const rd = ab.effects.find(e => e.kind === 'raise_dead');
        if (gm.corpses && gm.corpses.countNear(cp.x, cp.z, rd.radius) >= 2) return { id: ab.id };
        break;
      }
      // invisibilidade em aliado: o aliado em combate mais ferido (< 40 % PV), ainda visível, no alcance
      case 'hero_ash_veil': {
        let best = null;
        let br = 0.4;
        for (let k = 0; k < army.length; k++) {
          const u = army[k];
          if (u === c || u.state !== 'attacking' || hasStatus(u, 'invisible')) continue;
          if (fhypot(u.mesh.position.x - cp.x, u.mesh.position.z - cp.z) > range) continue;
          const ratio = u.hp / u.maxHp;
          if (ratio < br) { br = ratio; best = u; }
        }
        if (best) return { id: ab.id, targetId: best.id };
        break;
      }
      default:
        break;
    }
    return null;
  }
}
