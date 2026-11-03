import { fcos, fhypot, fsin } from '../sim/fmath.js';
import { CMD } from '../sim/commands.js';
import { canTarget } from '../sim/targeting.js';
import { missingRequirements, missingUnitRequirements } from '../sim/requirements.js';
import { getBuildingDef, getUnitDef, getHqUpgradeCost } from '../data/index.js';
import { baseRegion, pointReachable } from './AIWood.js';

/** Alcance máximo (u) da busca de local para construções costeiras ao redor do centro da base e passo radial/angular. */
const SITE_MAX_DIST = 66;
const SITE_STEP = 3;
const SITE_ANGLES = 32;
/** Folga (u) entre o fim do caminho naval e o poço para considerá-lo alcançável pelo mar. */
const REACH_SLACK = 8;
/** Pausa (s) entre buscas de local que falharam. */
const SITE_RETRY = 45;
/** Raio (u) em que inimigos perto de ativos navais próprios disparam a defesa da frota. */
const GUARD_RADIUS = 24;
/** Tempo máximo (s) de uma investida naval antes de reavaliar o alvo. */
const WAVE_MAX_AGE = 240;
/** Distância (u) do alvo a partir da qual a frota passa de ATTACK_MOVE para ATTACK direto. */
const FOCUS_DIST = 38;
/** Pausa (s) entre investidas e entre reforços. */
const WAVE_COOLDOWN = 15;
/** PV mínimo (fração) para um navio sair em investida; abaixo de `RETREAT_HP` ele recua ao cais. */
const MIN_HP = 0.35;
const RETREAT_HP = 0.3;
/** Antecedência (s) do plano naval em relação a `cfg.at`: tempo para juntar o Centro nível 2. */
const PLAN_LEAD = 90;
/** Tempo máximo (s) segurando recursos para uma mesma etapa do plano naval. */
const STAGE_PATIENCE = 360;

/** Peso de prioridade por categoria de alvo (somado à distância; menor = mais cobiçado). */
const PENALTY = { ship: 0, platform: 0, dock: 12, coastal: 30 };

/**
 * AINavalManager — AI-NAVAL. Quando o mapa tem poços de petróleo e mar acessível a partir da base, a IA:
 *  (a) ergue Estaleiro/Doca → Refinaria/Caldeirão → (Fundição/Fornalha Naval com o Centro nível 3);
 *  (b) treina Petroleiros, ergue Plataformas sobre poços alcançáveis e manda os petroleiros coletar;
 *  (c) treina a frota (Fragata/Galé; Couraçado/Leviatã) conforme `profile.naval`;
 *  (d) manda a frota caçar navios/plataformas/estaleiros do inimigo e bombardear a costa;
 *  (e) defende as próprias plataformas e petroleiros.
 * Sem poços ou sem litoral construível a classe fica inerte (o comportamento do mapa não muda).
 * Determinístico: só usa o estado da sim e `fmath`; nenhuma chamada a Math.random.
 */
export class AINavalManager {
  /** @param {import('./AIDirector.js').AIDirector} director */
  constructor(director) {
    this.director = director;
    this.gm = director.gm;
    this.cfg = director.profile.naval || null;
    const f = director.faction === 'orc' ? 'orc' : 'human';
    this.types = {
      shipyard: f === 'orc' ? 'ship_dock' : 'shipyard',
      refinery: f === 'orc' ? 'ash_cauldron' : 'refinery',
      foundry: f === 'orc' ? 'naval_forge' : 'foundry',
      platform: 'oil_platform',
      tanker: 'tanker',
      warship: f === 'orc' ? 'war_galley' : 'frigate',
      capital: f === 'orc' ? 'iron_leviathan' : 'dreadnought'
    };
    this._noSiteUntil = {};
    this._reach = new Map(); // poço/ponto de água -> alcançável pelo mar?
    this._feasible = false;
    this._feasibleRetry = 0;
    this._shipSite = null;
    this._reserve = null;
    this._reserveTick = -1;
    this._saving = false;
    this._stage = null;
    this._stageSince = 0;
    this._wave = null;
    this._nextWaveAt = 0;
    this._retreating = new Set();
    this._focused = new Set();
    this._buf = [];
  }

  /** Inventário naval próprio, calculado em um único passe (também usado por testes/diagnóstico). */
  snapshot() {
    return this._scan();
  }

  _scan() {
    const dir = this.director;
    const pid = dir.playerId;
    const t = this.types;
    const s = {
      shipyard: null, refinery: null, foundry: null, platforms: [], platformsPending: 0,
      tankers: [], warships: [], capitals: 0, queued: { tanker: 0, warship: 0, capital: 0 }, hq: null
    };
    const bs = this.gm.buildings;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.ownerId !== pid || b.isDead) continue;
      if (b.type === dir.hqType && b.isConstructed && (!s.hq || b.tier > s.hq.tier)) s.hq = b;
      if (b.type === t.platform) {
        if (b.isConstructed) s.platforms.push(b); else s.platformsPending++;
      } else if (b.type === t.shipyard || b.type === t.refinery || b.type === t.foundry) {
        const key = b.type === t.shipyard ? 'shipyard' : b.type === t.refinery ? 'refinery' : 'foundry';
        if (!s[key] || (b.isConstructed && !s[key].isConstructed)) s[key] = b;
      }
    }
    const us = dir.getOwnUnits();
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      if (u.isDead || u.isDying) continue;
      if (u.isTanker) s.tankers.push(u);
      else if (u.layer === 'naval' && getUnitDef(u.type).isCombat) {
        s.warships.push(u);
        if (u.type === t.capital) s.capitals++;
      }
    }
    if (s.shipyard) {
      const q = s.shipyard.queue || [];
      for (let i = 0; i < q.length; i++) {
        if (q[i].type === t.tanker) s.queued.tanker++;
        else if (q[i].type === t.capital) { s.queued.capital++; s.queued.warship++; } else s.queued.warship++;
      }
    }
    return s;
  }

  /** Ponto navegável junto de (x, z) ou null. */
  _water(x, z, r = 14) {
    const npf = this.gm.navalPathfinder;
    return npf ? npf.findNearestWalkable(x, z, r) : null;
  }

  /**
   * Comprimento (u) da rota naval de (wx, wz) até perto do poço, ou `Infinity` se o mar não chega lá.
   * Cacheado por par poço/ponto arredondado (a rota por mar pode ser muito mais longa que a reta).
   */
  _routeLen(wx, wz, deposit) {
    const npf = this.gm.navalPathfinder;
    const dp = deposit.mesh.position;
    const key = `${deposit.id}:${Math.round(wx / 6)}:${Math.round(wz / 6)}`;
    let v = this._reach.get(key);
    if (v === undefined) {
      const path = npf.findPath(wx, wz, dp.x, dp.z);
      v = Infinity;
      if (path && path.length > 0 && fhypot(path[path.length - 1].x - dp.x, path[path.length - 1].z - dp.z) <= (deposit.collisionRadius || 2) + REACH_SLACK) {
        v = 0;
        let px = wx; let pz = wz;
        for (let i = 0; i < path.length; i++) { v += fhypot(path[i].x - px, path[i].z - pz); px = path[i].x; pz = path[i].z; }
      }
      this._reach.set(key, v);
    }
    return v;
  }

  /** Poços de petróleo utilizáveis pela IA: livres ou com plataforma própria. */
  _wells() {
    const out = [];
    const list = this.gm.resourceDeposits;
    const pid = this.director.playerId;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.type !== 'oil' || d.resourcesRemaining <= 0) continue;
      const p = d.platform && !d.platform.isDead ? d.platform : null;
      if (p && p.ownerId !== pid) continue;
      out.push(d);
    }
    return out;
  }

  /**
   * Local para uma construção costeira: varre anéis ao redor da base; devolve o primeiro (por distância, ou o mais próximo
   * de `focus`) cujo mar leve a um poço alcançável. `null` se nada serve (nova tentativa após `SITE_RETRY`).
   */
  findCoastalSite(type, focus) {
    const dir = this.director;
    const gm = this.gm;
    const now = dir.simTime || 0;
    if ((this._noSiteUntil[type] || 0) > now) return null;
    const wells = this._wells();
    if (wells.length === 0) return null;
    const bc = dir.baseCenter;
    const region = baseRegion(dir); // os peões precisam chegar ao local por terra (ilhas separadas da base não servem)
    const lpf = gm.pathfinder;
    const cands = [];
    for (let d = 9; d <= SITE_MAX_DIST; d += SITE_STEP) {
      for (let k = 0; k < SITE_ANGLES; k++) {
        const a = (k / SITE_ANGLES) * Math.PI * 2;
        const x = bc.x + fcos(a) * d;
        const z = bc.y + fsin(a) * d;
        if (!gm.canPlaceBuilding(type, x, z, null, dir.playerId)) continue;
        if (lpf && !pointReachable(lpf, region, x, z)) continue;
        if (lpf) { // o construtor precisa de terra firme encostada na obra: anel de 16 pontos, sem penhasco e ao menos 6 caminháveis
          const rr = (getBuildingDef(type).collisionRadius || 3.5) + 2.5;
          let ok = 0; let cliff = false;
          for (let q = 0; q < 16; q++) {
            const aa = (q / 16) * Math.PI * 2;
            const qx = x + fcos(aa) * rr; const qz = z + fsin(aa) * rr;
            if (gm.terrain.isCliff && gm.terrain.isCliff(qx, qz)) cliff = true;
            if (lpf.isWalkableWorld(qx, qz)) ok++;
          }
          if (cliff || ok < 6) continue;
        }
        cands.push({ x, z, d });
      }
    }
    if (focus) cands.sort((p, q) => fhypot(p.x - focus.x, p.z - focus.z) - fhypot(q.x - focus.x, q.z - focus.z));
    // sem foco: o 1º local (mais perto da base) cujo mar leva a algum poço; com foco (`Refinaria`): entre os 8 mais próximos
    // do poço, o de MENOR rota por mar até ele (a rota pode contornar a ilha inteira).
    let tried = 0;
    let found = 0;
    let best = null;
    let bestLen = Infinity;
    for (let i = 0; i < cands.length && tried < 40 && found < (focus ? 6 : 1); i++) {
      const c = cands[i];
      const w = this._water(c.x, c.z, 12);
      if (!w) continue;
      tried++;
      for (let j = 0; j < wells.length; j++) {
        if (focus && wells[j].mesh.position !== focus) continue; // `focus` = posição (objeto) do poço-alvo
        const len = this._routeLen(w.x, w.z, wells[j]);
        if (len === Infinity) continue;
        found++;
        if (len < bestLen) { bestLen = len; best = { x: c.x, z: c.z }; }
        break;
      }
    }
    if (best) return best;
    this._noSiteUntil[type] = now + SITE_RETRY;
    return null;
  }

  /** Emite PLACE_BUILDING de uma construção costeira com o trabalhador mais próximo (preferindo ociosos). */
  _placeCoastal(type, site) {
    const dir = this.director;
    const us = dir.getOwnUnits();
    let best = null;
    let bd = Infinity;
    for (let i = 0; i < us.length; i++) {
      const w = us[i];
      if (w.isDead || w.type !== dir.workerType) continue;
      const d = fhypot(w.mesh.position.x - site.x, w.mesh.position.z - site.z) + (w.state === 'idle' ? 0 : 50);
      if (d < bd) { bd = d; best = w; }
    }
    return dir.issue({ type: CMD.PLACE_BUILDING, playerId: dir.playerId, buildingType: type, x: site.x, z: site.z, unitIds: best ? [best.id] : [] });
  }

  /** Tamanho-alvo da frota de combate: base da dificuldade + frota inimiga conhecida, limitado por `maxFleet`. */
  fleetTarget() {
    const cfg = this.cfg;
    let enemy = 0;
    for (const k of this.director.perception.units.values()) {
      const d = getUnitDef(k.type);
      if (d && d.layer === 'naval' && d.isCombat) enemy++;
    }
    const late = (this.director.simTime || 0) > 900 ? 1 : 0;
    return Math.min(cfg.maxFleet, cfg.fleet + late + enemy);
  }

  // --- Plano naval: integração com a economia/exército terrestres ---

  /**
   * Esta IA comanda os próprios navios (o mapa tem poços de petróleo e mar)? Sem isso o navio (ex.: escolta de desembarque de missão)
   * continua sendo tropa comum do exército terrestre, como antes do AI-NAVAL.
   */
  managesFleet() {
    if (this._manages === undefined) this._manages = !!this.cfg && !!this.gm.navalPathfinder && this.gm.hasOilWells;
    return this._manages;
  }

  /** Há mar acessível + poço de petróleo alcançável a partir da base? (busca de local do Estaleiro, cacheada) */
  feasible() {
    const cfg = this.cfg;
    const gm = this.gm;
    if (!cfg || !gm.navalPathfinder || !gm.hasOilWells) return false;
    if (this._feasible) return true;
    const now = this.director.simTime || 0;
    if (now < this._feasibleRetry) return false;
    const site = this.findCoastalSite(this.types.shipyard, null);
    if (site) { this._feasible = true; this._shipSite = site; return true; }
    this._feasibleRetry = now + SITE_RETRY;
    return false;
  }

  /** O plano naval está ativo (já na hora de se preparar e o mapa permite)? Antecede `cfg.at` para juntar o Centro nível 2. */
  planActive() {
    const cfg = this.cfg;
    if (!cfg || (this.director.simTime || 0) < cfg.at - PLAN_LEAD) return false;
    return this.feasible();
  }

  /**
   * Recursos que o exército terrestre e as obras opcionais devem deixar intactos para o próximo passo naval
   * ({gold, wood, stone}) ou null. Cacheado por tick de simulação.
   */
  planReserve() {
    const tick = this.gm.currentTick;
    if (this._reserveTick === tick) return this._reserve;
    this._reserveTick = tick;
    this._reserve = null;
    this._saving = false;
    if (!this.planActive()) return null;
    const s = this._scan();
    if (!s.hq) return null;
    const pick = c => (c ? { gold: c.gold || 0, wood: c.wood || 0, stone: c.stone || 0 } : null);
    let stage = null;
    let cost = null;
    if (s.hq.tier < 2) { stage = 'hq2'; cost = getHqUpgradeCost(2); }
    else if (!s.shipyard) { stage = 'yard'; cost = getBuildingDef(this.types.shipyard).cost; }
    else if (s.shipyard.isConstructed && s.platforms.length === 0 && s.platformsPending === 0) { stage = 'plat'; cost = getBuildingDef(this.types.platform).cost; }
    else if (s.shipyard.isConstructed && !s.refinery && s.platforms.length > 0) { stage = 'ref'; cost = getBuildingDef(this.types.refinery).cost; }
    else if (s.shipyard.isConstructed && s.warships.length + s.queued.warship < this.fleetTarget()) { stage = 'ship'; cost = getUnitDef(this.types.warship).cost; }
    if (stage !== this._stage) { this._stage = stage; this._stageSince = this.director.simTime || 0; }
    // desiste da reserva de uma etapa que não anda (ex.: falta pedra/madeira que o ouro guardado não resolve)
    if (stage && (this.director.simTime || 0) - this._stageSince < STAGE_PATIENCE) this._reserve = pick(cost);
    this._saving = !!this._reserve && (s.hq.tier < 2 || !s.shipyard);
    return this._reserve;
  }

  /** Está juntando recursos para o Centro nível 2 / Estaleiro (obras e pesquisas opcionais esperam)? */
  saving() {
    this.planReserve();
    return this._saving;
  }

  /** Trabalhadores extras que o plano naval pede (o Centro nível 2 e o Estaleiro custam caro). */
  extraWorkers() {
    return this.planActive() ? 2 : 0;
  }

  update() {
    const cfg = this.cfg;
    const gm = this.gm;
    if (!cfg || !gm.navalPathfinder || !gm.hasOilWells) return;
    const s = this._scan();
    if (!s.hq) return;
    this._economy(s);
    this._training(s);
    this._fleet(s);
  }

  // --- (a)/(b) Construções, plataformas e coleta ---

  _economy(s) {
    const dir = this.director;
    const gm = this.gm;
    const cfg = this.cfg;
    const t = this.types;
    const eco = dir.economyManager;
    const now = dir.simTime || 0;
    const pid = dir.playerId;

    // Coleta: petroleiros ociosos vão para a plataforma pronta com menos petroleiros (precisa de Refinaria).
    if (s.refinery && s.refinery.isConstructed && s.platforms.length > 0) {
      const load = new Map();
      for (let i = 0; i < s.tankers.length; i++) {
        const g = s.tankers[i].gatherTarget;
        if (g) load.set(g.id, (load.get(g.id) || 0) + 1);
      }
      for (let i = 0; i < s.tankers.length; i++) {
        const tk = s.tankers[i];
        if (tk.state !== 'idle') continue;
        let best = null;
        let bl = Infinity;
        for (let j = 0; j < s.platforms.length; j++) {
          const d = s.platforms[j].deposit;
          if (!d || d.resourcesRemaining <= 0 || !gm.platformReady(d, pid)) continue;
          const l = load.get(d.id) || 0;
          if (l < bl) { bl = l; best = d; }
        }
        if (best && dir.issue({ type: CMD.GATHER, playerId: pid, unitIds: [tk.id], targetId: best.id })) {
          load.set(best.id, (load.get(best.id) || 0) + 1);
        }
      }
    }

    // Plataforma: um petroleiro ocioso ergue sobre o poço alcançável mais próximo.
    if (s.platforms.length + s.platformsPending < cfg.platforms && s.platformsPending === 0 && s.tankers.length > 0) {
      const pdef = getBuildingDef(t.platform);
      if (dir.canAfford(pdef.cost) && missingRequirements(pid, t.platform, gm).length === 0) {
        const builder = s.tankers.find(u => u.state === 'idle');
        if (builder) {
          const ow = this._water(builder.mesh.position.x, builder.mesh.position.z, 6) || builder.mesh.position;
          const wells = this._wells();
          let best = null;
          let bd = Infinity;
          for (let i = 0; i < wells.length; i++) {
            const d = wells[i];
            if (d.platform && !d.platform.isDead) continue;
            const len = this._routeLen(ow.x, ow.z, d);
            if (len < bd) { bd = len; best = d; }
          }
          if (best) {
            dir.issue({ type: CMD.PLACE_BUILDING, playerId: pid, buildingType: t.platform, x: best.mesh.position.x, z: best.mesh.position.z, unitIds: [builder.id] });
          }
        }
      }
    }

    // Construções costeiras (exigem Centro nível 2 e Quartel; ver `missingRequirements`).
    if (now < cfg.at || eco.isWorkerEmergency() || eco.getLivingWorkerCount() < 5 || !dir.getConstructedBarracks()) return;
    const want = type => dir.canAfford(getBuildingDef(type).cost) && missingRequirements(pid, type, gm).length === 0;
    if (!s.shipyard) {
      if (want(t.shipyard)) {
        let site = this._shipSite;
        if (!site || !gm.canPlaceBuilding(t.shipyard, site.x, site.z, null, pid)) site = this.findCoastalSite(t.shipyard, null);
        if (site) this._placeCoastal(t.shipyard, site);
      }
      return;
    }
    if (!s.shipyard.isConstructed) return;
    if (!s.refinery && s.tankers.length > 0 && s.platforms.length + s.platformsPending > 0 && want(t.refinery)) {
      const w = this._wells().find(d => d.platform && d.platform.ownerId === pid);
      const site = w ? this.findCoastalSite(t.refinery, w.mesh.position) : null;
      if (site) this._placeCoastal(t.refinery, site);
      return;
    }
    if (!s.foundry && cfg.capital > 0 && s.hq.tier >= 3 && s.warships.length >= 2 && want(t.foundry)) {
      const site = this.findCoastalSite(t.foundry, null);
      if (site) this._placeCoastal(t.foundry, site);
    }
  }

  // --- (c) Treino ---

  _training(s) {
    const dir = this.director;
    const gm = this.gm;
    const cfg = this.cfg;
    const t = this.types;
    const pid = dir.playerId;
    const sy = s.shipyard;
    if (!sy || !sy.isConstructed || sy.isDead || (sy.queue && sy.queue.length >= 2)) return;
    if (dir.population >= dir.maxPopulation) return;
    const eco = dir.economyManager;
    if (eco.isWorkerEmergency() || !eco.canAffordMilitaryRecruitment()) return;
    const train = type => {
      if (missingUnitRequirements(pid, type, gm).length > 0) return false;
      if (!dir.canAfford(getUnitDef(type).cost)) return false;
      return !!dir.issue({ type: CMD.TRAIN, playerId: pid, buildingId: sy.id, unitType: type });
    };

    // petroleiros: 1 para abrir a economia, depois conforme as plataformas prontas (até `cfg.tankers`)
    const haveT = s.tankers.length + s.queued.tanker;
    const wantT = s.platforms.length === 0 ? 1 : Math.min(cfg.tankers, 1 + 2 * s.platforms.length);
    if (haveT < wantT) { train(t.tanker); return; }

    // Frota de guerra: só depois que o exército terrestre mínimo existe.
    if (dir.getCombatUnitCount() < 3) return;
    const haveW = s.warships.length + s.queued.warship;
    if (haveW >= this.fleetTarget()) return;
    const haveC = s.capitals + s.queued.capital;
    if (cfg.capital > 0 && haveC < cfg.capital && s.warships.length >= 2 && train(t.capital)) return;
    train(t.warship);
  }

  // --- (d)/(e) Frota ---

  _fleet(s) {
    const dir = this.director;
    const gm = this.gm;
    const cfg = this.cfg;
    const now = dir.simTime || 0;
    const pid = dir.playerId;
    const ships = s.warships;
    if (ships.length === 0) { this._wave = null; return; }
    const shipSet = new Set(ships.map(u => u.id));
    for (const id of this._retreating) if (!shipSet.has(id)) this._retreating.delete(id);

    // (e) defesa: inimigos que a frota alcança junto de plataformas, petroleiros ou do cais
    const guards = [];
    for (const b of s.platforms) guards.push(b.mesh.position);
    for (const u of s.tankers) guards.push(u.mesh.position);
    if (s.shipyard) guards.push(s.shipyard.mesh.position);
    if (s.refinery) guards.push(s.refinery.mesh.position);
    let threat = null;
    let td = Infinity;
    let threats = 0;
    const probe = ships[0];
    for (let i = 0; i < guards.length; i++) {
      const g = guards[i];
      const hits = gm.unitGrid.queryRadius(g.x, g.z, GUARD_RADIUS,
        u => !u.isDead && !u.isDying && gm.isHostile(pid, u.ownerId) && canTarget(probe, u) && u.transportedBy == null, this._buf);
      for (let j = 0; j < hits.length; j++) {
        threats++;
        const d = fhypot(hits[j].mesh.position.x - g.x, hits[j].mesh.position.z - g.z);
        if (d < td || (d === td && hits[j].id < threat.id)) { td = d; threat = hits[j]; }
      }
    }
    if (threat) {
      const ids = [];
      for (const u of ships) {
        if (this._retreating.has(u.id) || u.targetEntity === threat) continue;
        const away = (u.state === 'attackMoving' || u.state === 'attacking') && dir.profile.micro >= 2 && threats >= 2;
        if (u.state === 'idle' || u.state === 'moving' || away) ids.push(u.id);
      }
      if (ids.length > 0 && dir.issue({ type: CMD.ATTACK, playerId: pid, unitIds: ids, targetId: threat.id })) {
        if (this._wave) for (const id of ids) { this._wave.ids.delete(id); this._focused.delete(id); }
      }
      return;
    }

    // recuo dos feridos (micro >= 1): voltam ao cais e saem da investida
    if (dir.profile.micro >= 1 && s.shipyard) {
      const dock = gm.getDockPoint(s.shipyard);
      if (dock) {
        for (const u of ships) {
          if (u.hp >= u.maxHp * RETREAT_HP || this._retreating.has(u.id) || (u.state !== 'attackMoving' && u.state !== 'attacking')) continue;
          if (dir.issue({ type: CMD.MOVE, playerId: pid, unitIds: [u.id], x: dock.x, z: dock.z })) {
            this._retreating.add(u.id);
            if (this._wave) this._wave.ids.delete(u.id);
          }
        }
      }
    }
    for (const u of ships) if (this._retreating.has(u.id) && u.state === 'idle' && u.hp >= u.maxHp * 0.9) this._retreating.delete(u.id);

    // investida em curso
    const wave = this._wave;
    if (wave) {
      for (const id of wave.ids) if (!shipSet.has(id)) wave.ids.delete(id);
      const per = dir.perception;
      if (wave.id === null) { // varredura: termina quando a frota chega (ociosa) ou depois de um tempo
        let moving = false;
        for (const id of wave.ids) { const u = gm.getEntity(id); if (u && u.state !== 'idle') moving = true; }
        if (wave.ids.size === 0 || !moving || now - wave.since > 120) {
          per.markExploredAt(wave.sx, wave.sz);
          this._wave = null;
          this._nextWaveAt = now + WAVE_COOLDOWN;
        }
        return;
      }
      const k = wave.isUnit ? per.units.get(wave.id) : per.buildings.get(wave.id);
      const ent = gm.getEntity(wave.id);
      const gone = !ent || ent.isDead || !k;
      if (wave.ids.size === 0 || gone || now - wave.since > WAVE_MAX_AGE) {
        this._wave = null;
        this._focused.clear();
        this._nextWaveAt = now + WAVE_COOLDOWN;
      } else {
        // perto e visível: passa de ATTACK_MOVE para ATTACK direto no alvo
        if (k.lastSeen === per.now) {
          const focus = [];
          for (const id of wave.ids) {
            if (this._focused.has(id)) continue;
            const u = gm.getEntity(id);
            if (!u || (u.state !== 'attackMoving' && u.state !== 'idle')) continue;
            if (fhypot(u.mesh.position.x - k.x, u.mesh.position.z - k.z) <= FOCUS_DIST) focus.push(id);
          }
          if (focus.length > 0 && dir.issue({ type: CMD.ATTACK, playerId: pid, unitIds: focus, targetId: wave.id })) {
            for (const id of focus) this._focused.add(id);
          }
        }
        // reforços: navios ociosos juntam-se à investida
        const idle = ships.filter(u => u.state === 'idle' && !wave.ids.has(u.id) && !this._retreating.has(u.id) && u.hp >= u.maxHp * MIN_HP);
        if (idle.length >= 2 && now >= this._nextWaveAt) {
          const ids = idle.map(u => u.id);
          if (dir.issue({ type: CMD.ATTACK_MOVE, playerId: pid, unitIds: ids, x: wave.sx, z: wave.sz })) {
            for (const id of ids) wave.ids.add(id);
            this._nextWaveAt = now + WAVE_COOLDOWN;
          }
        }
        return;
      }
    }

    // nova investida
    if (now < this._nextWaveAt || now < cfg.at) return;
    const ready = ships.filter(u => u.state === 'idle' && !this._retreating.has(u.id) && u.hp >= u.maxHp * MIN_HP);
    if (ready.length < cfg.attackAt) return;
    let cx = 0; let cz = 0;
    for (const u of ready) { cx += u.mesh.position.x; cz += u.mesh.position.z; }
    cx /= ready.length; cz /= ready.length;
    const target = this.pickTarget(cx, cz);
    const ids = ready.map(u => u.id);
    if (!target) { // nada conhecido: varre rumo ao slot inimigo mais provável / célula não explorada (só ponto de água)
      const m = dir.perception.marchTarget();
      const w = m && this._water(m.x, m.z, 40);
      this._nextWaveAt = now + WAVE_COOLDOWN;
      if (!w) { if (m) dir.perception.markExploredAt(m.x, m.z); return; }
      if (dir.issue({ type: CMD.ATTACK_MOVE, playerId: pid, unitIds: ids, x: w.x, z: w.z })) {
        this._wave = { id: null, isUnit: false, sx: w.x, sz: w.z, since: now, ids: new Set(ids) };
      }
      return;
    }
    if (!dir.issue({ type: CMD.ATTACK_MOVE, playerId: pid, unitIds: ids, x: target.sx, z: target.sz })) return;
    this._wave = { id: target.id, isUnit: target.isUnit, sx: target.sx, sz: target.sz, since: now, ids: new Set(ids) };
    this._focused.clear();
    this._nextWaveAt = now + WAVE_COOLDOWN;
  }

  /**
   * Alvo da investida entre o que a IA CONHECE: navios inimigos e plataformas primeiro, depois cais/refinarias/fundições,
   * depois qualquer construção a tiro do mar.
   * @returns {{id:number,isUnit:boolean,sx:number,sz:number}|null}  `sx/sz`: ponto de água de onde a frota ataca.
   */
  pickTarget(fx, fz) {
    const per = this.director.perception;
    const npf = this.gm.navalPathfinder;
    let best = null;
    let bs = Infinity;
    for (const k of per.units.values()) {
      const d = getUnitDef(k.type);
      if (!d || d.layer !== 'naval' || per.now - k.lastSeen > 45) continue;
      const sc = fhypot(k.x - fx, k.z - fz) + PENALTY.ship - (d.isTanker ? 15 : 0);
      if (sc < bs) { bs = sc; best = { id: k.id, isUnit: true, sx: k.x, sz: k.z }; }
    }
    for (const k of per.buildings.values()) {
      let pen;
      if (k.role === 'platform') pen = PENALTY.platform;
      else if (k.role === 'shipyard' || k.role === 'refinery' || k.role === 'foundry') pen = PENALTY.dock;
      else if (npf.nearNavigable(k.x, k.z, 14)) pen = PENALTY.coastal;
      else continue;
      const sc = fhypot(k.x - fx, k.z - fz) + pen;
      if (sc >= bs) continue;
      const w = this._water(k.x, k.z, 18);
      if (!w) continue;
      bs = sc; best = { id: k.id, isUnit: false, sx: w.x, sz: w.z };
    }
    return best;
  }
}
