import { getBuildingDef, getUnitDef } from '../data/index.js';
import { missingUnitRequirements } from '../sim/requirements.js';
import { CMD } from '../sim/commands.js';
import { EVT } from '../sim/events.js';
import { canTarget } from '../sim/targeting.js';
import { adaptMix } from './AIStrategy.js';

/** F4-06: atacante terrestre genérico (não atinge aéreos) — escolha de alvo da expedição. */
const LAND_ATTACKER = { canHitAir: false, canHitGround: true };

/**
 * AIMilitaryManager (Gerenciador Militar e Ofensivo da IA)
 * 
 * Gerencia a segurança da base (defesa contra invasores), o recrutamento
 * balanceado de infantaria/arqueiros/ogros no Quartel e a montagem de esquadrões
 * de expedição militar em direção ao reino do jogador.
 * 
 * Prevenção estrita de gargalos de CPU/GC:
 * - Emissão em lote de orderAttack via loops indexados rápidos.
 * - Reutilização de buffers internos pré-alocados para evitar instanciações
 *   de novos arrays a cada ciclo de 1.0 segundo.
 */
/** Valor de um tipo de unidade = custo total (ouro + madeira + pedra). */
function unitValue(type) {
  const c = getUnitDef(type).cost;
  return c ? (c.gold || 0) + (c.wood || 0) + (c.stone || 0) : 0;
}

export class AIMilitaryManager {
  /**
   * @param {import('./AIDirector.js').AIDirector} director
   */
  constructor(director) {
    this.director = director;
    this.gm = director.gm;

    // Staging rally point outside base gates
    const baseCenter = director.baseCenter;
    this.assemblyRallyPoint = {
      x: baseCenter.x + (baseCenter.x < 0 ? 12 : -12),
      y: 0,
      z: baseCenter.y + (baseCenter.y < 0 ? 12 : -12)
    };

    // F5-03/F5-04: tamanho da onda = base da dificuldade + ajuste da estratégia (rush sai cedo, turtle tarde);
    // cresce `waveStep` por onda. Escalada anti-impasse: depois de 15 min o limite cai 1 a cada 5 min (mín. 2).
    this.strikeWaveNumber = 1;
    this.attackThreshold = this.computeThreshold();
    /** Ids da onda em marcha (não são reemitidos enquanto não ficarem ociosos). */
    this.waveIds = new Set();
    this._rallySet = new Set();
    this._comp = {};
    /** id -> {x, z, t, n}: detecção de unidades travadas da onda. */
    this._track = new Map();
    this._detourOf = new Map();
    this._detourGroups = [];
    this._detours = 0;

    // Pre-allocated squad buffers to eliminate Garbage Collector pauses
    this.readySquadBuffer = new Array(64);
    this.readySquadCount = 0;
    // Buffer reutilizado pela consulta de intrusos (F1-06: gm.unitGrid.queryRadius).
    this._intruderBuf = [];
  }

  /** Tamanho da próxima onda (ver construtor). */
  computeThreshold() {
    const d = this.director;
    const st = d.strategy;
    let n = d.profile.attackBase + st.firstWave - 4 + st.waveStep * Math.min(this.strikeWaveNumber - 1, 6);
    const t = d.simTime || 0;
    if (t > 900) n -= Math.floor((t - 900) / 300) + 1;
    return Math.max(2, Math.round(n));
  }

  /**
   * Anti-travamento: unidade da onda que não avança (menos de 3 unidades em ~8 s, duas vezes seguidas) e
   * está fora do alcance do alvo é desviada: o grupo vai a um waypoint lateral (lado alterna a cada
   * tentativa) e depois volta a atacar o alvo. Obstáculos que o pathfinder não contorna (jazidas, entulho,
   * multidões) deixam de prender a onda para sempre.
   */
  unstickWave() {
    const dir = this.director;
    const now = dir.simTime;
    const stuck = [];
    for (const id of this.waveIds) {
      if (this._detourOf.has(id)) continue;
      const u = this.gm.getEntity(id);
      if (!u || u.isDead) { this._track.delete(id); continue; }
      if (u.state === 'idle' || u.state === 'casting') { this._track.delete(id); continue; }
      const p = u.mesh.position;
      const r = this._track.get(id);
      if (!r) { this._track.set(id, { x: p.x, z: p.z, t: now, n: 0 }); continue; }
      if (now - r.t < 8) continue;
      const moved = Math.hypot(p.x - r.x, p.z - r.z);
      const t = u.targetEntity;
      const inRange = t && t.mesh && Math.hypot(t.mesh.position.x - p.x, t.mesh.position.z - p.z) <= (getUnitDef(u.type).attackRange || 2) + (t.collisionRadius || 1) + 2;
      r.n = moved < 3 && !inRange ? r.n + 1 : 0;
      r.x = p.x; r.z = p.z; r.t = now;
      if (r.n >= 2) stuck.push(u);
    }
    if (stuck.length > 0) {
      // alvo e waypoint a partir do centro do grupo travado
      let cx = 0; let cz = 0;
      for (let i = 0; i < stuck.length; i++) { cx += stuck[i].mesh.position.x; cz += stuck[i].mesh.position.z; }
      cx /= stuck.length; cz /= stuck.length;
      const tgt = stuck[0].objectiveTarget || stuck[0].targetEntity;
      if (tgt && tgt.mesh && !tgt.isDead) {
        const tx = tgt.mesh.position.x; const tz = tgt.mesh.position.z;
        let dx = tx - cx; let dz = tz - cz;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len; dz /= len;
        const side = (this._detours++ % 2 === 0) ? 1 : -1;
        const wx = cx + dx * len * 0.4 - dz * side * 18;
        const wz = cz + dz * len * 0.4 + dx * side * 18;
        const ids = stuck.map(u => u.id);
        if (dir.issue({ type: CMD.MOVE, playerId: dir.playerId, unitIds: ids, x: wx, z: wz })) {
          const g = { ids: new Set(ids), wx, wz, targetId: tgt.id, since: now };
          for (let i = 0; i < ids.length; i++) { this._detourOf.set(ids[i], g); this._track.delete(ids[i]); }
          this._detourGroups.push(g);
        }
      } else {
        const rally = dir.militaryRally();
        const ids = stuck.map(u => u.id);
        if (dir.issue({ type: CMD.MOVE, playerId: dir.playerId, unitIds: ids, x: rally.x, z: rally.z })) {
          for (let i = 0; i < ids.length; i++) { this.waveIds.delete(ids[i]); this._track.delete(ids[i]); }
        }
      }
    }
    // grupos em desvio: ao chegar (ou estourar o tempo) voltam a atacar o alvo
    for (let gi = this._detourGroups.length - 1; gi >= 0; gi--) {
      const g = this._detourGroups[gi];
      let alive = 0; let arrived = 0;
      for (const id of g.ids) {
        const u = this.gm.getEntity(id);
        if (!u || u.isDead) { g.ids.delete(id); this._detourOf.delete(id); continue; }
        alive++;
        if (u.state === 'idle' || Math.hypot(u.mesh.position.x - g.wx, u.mesh.position.z - g.wz) < 8) arrived++;
      }
      const target = this.gm.getEntity(g.targetId);
      if (alive === 0 || !target || target.isDead) { for (const id of g.ids) this._detourOf.delete(id); this._detourGroups.splice(gi, 1); continue; }
      if (arrived >= alive || now - g.since > 25) {
        if (dir.issue({ type: CMD.ATTACK, playerId: dir.playerId, unitIds: Array.from(g.ids), targetId: g.targetId })) {
          for (const id of g.ids) this._detourOf.delete(id);
          this._detourGroups.splice(gi, 1);
        }
      }
    }
  }

  /**
   * F5-03: avaliação de força antes de lançar a onda (valor = custo dos combatentes; defensor ganha 25 %
   * de vantagem de terreno/torres/reforços). O inimigo é o MAIOR entre o que a percepção conhece (unidades
   * vistas há < 45 s + 120 por torre conhecida) e uma estimativa pelo tempo de partida (`assumeEnemy` da
   * dificuldade × ~400 de valor por minuto depois de 1,5 min — o inimigo investe como nós). Com a população
   * no teto, ou depois de 20 min (anti-impasse), ataca.
   */
  assessAttack(units) {
    const dir = this.director;
    const need = dir.profile.assess;
    if (!(need > 0) || (dir.simTime || 0) > 1200) return true;
    if (dir.population >= dir.maxPopulation - 1) return true;
    let known = 0;
    const per = dir.perception;
    for (const k of per.units.values()) if (k.cls !== 'worker') known += unitValue(k.type);
    for (const b of per.buildings.values()) if (getBuildingDef(b.type).tower) known += 120;
    const expected = dir.profile.assumeEnemy * 400 * Math.max(0, (dir.simTime || 0) / 60 - 1.5);
    const enemy = Math.max(known, expected) * 1.25;
    if (enemy <= 0) return true;
    let own = 0;
    for (let i = 0; i < units.length; i++) own += unitValue(units[i].type);
    return own >= need * enemy;
  }

  /** A expedição já pode sair (atraso inicial da dificuldade, menor no rush)? */
  expeditionAllowed() {
    const d = this.director;
    const delay = d.profile.startDelay * (d.strategy.id === 'rush' ? 0.4 : 1);
    return (d.simTime || 0) >= delay;
  }

  /** Combatentes disponíveis para a onda: vivos, não reservados, ociosos/andando e fora da onda em marcha. */
  collectSquad() {
    const units = this.director.getOwnUnits();
    const workerType = this.director.workerType;
    // limpa ids mortos da onda
    for (const id of this.waveIds) {
      const e = this.gm.getEntity(id);
      if (!e || e.isDead) this.waveIds.delete(id);
    }
    this.readySquadCount = 0;
    for (let i = 0; i < units.length; i++) {
      const e = units[i];
      if (e.isDead || e.type === workerType || this.director.isReserved(e.id)) continue;
      if (e.state !== 'idle' && e.state !== 'moving') continue;
      if (this.director.profile.micro >= 1 && e.hp < e.maxHp * 0.35) continue; // feridos ficam em casa
      if (this.waveIds.has(e.id) && e.state !== 'idle') continue;
      if (this.readySquadCount < this.readySquadBuffer.length) this.readySquadBuffer[this.readySquadCount++] = e;
    }
    return this.readySquadCount;
  }

  /**
   * Evaluates base defense and commands combat units to repel invaders
   * @param {number} uDef
   */
  updateDefense(uDef) {
    if (uDef <= 0) return;

    // F1-06: gm.unitGrid.queryRadius no lugar de varrer todas as unidades hostis do mapa.
    const baseCenter = this.director.baseCenter;
    const gm = this.gm;
    const myId = this.director.playerId;
    const intruders = gm.unitGrid.queryRadius(
      baseCenter.x, baseCenter.y, 26,
      u => !u.isDead && gm.isHostile(myId, u.ownerId),
      this._intruderBuf
    );

    let closestIntruder = null;
    let minIntruderDistSq = Infinity;
    for (let i = 0; i < intruders.length; i++) {
      const u = intruders[i];
      const dx = u.mesh.position.x - baseCenter.x;
      const dz = u.mesh.position.z - baseCenter.y;
      const dSq = dx * dx + dz * dz;
      if (dSq < minIntruderDistSq) {
        minIntruderDistSq = dSq;
        closestIntruder = u;
      }
    }

    if (!closestIntruder) return;

    // Dispatch idle or moving combat troops to intercept the intruder (1 comando em lote)
    const enemies = this.director.getOwnUnits();
    const workerType = this.director.workerType;
    // F5-03 (Difícil+, micro >= 2): reação completa — se a defesa em casa é menor que a invasão, as tropas
    // da onda que está fora também voltam para defender (Normal só usa as ociosas/em marcha).
    let recall = false;
    if (this.director.profile.micro >= 2) {
      let home = 0;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.isDead || e.type === workerType) continue;
        if (Math.hypot(e.mesh.position.x - baseCenter.x, e.mesh.position.z - baseCenter.y) < 30) home++;
      }
      recall = intruders.length >= 3 && home < intruders.length * 1.5;
    }
    const ids = [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.isDead || e.type === workerType || this.director.isReserved(e.id) || e.targetEntity === closestIntruder) continue;
      const idle = e.state === 'idle' || e.state === 'moving';
      const away = recall && (e.state === 'attacking' || e.state === 'attackMoving') && !(getUnitDef(e.type).suicide);
      if (idle || away) {
        ids.push(e.id);
        if (away) { this.waveIds.delete(e.id); this._track.delete(e.id); this._detourOf.delete(e.id); }
      }
    }
    if (ids.length > 0) this.director.issue({ type: CMD.ATTACK, playerId: myId, unitIds: ids, targetId: closestIntruder.id });
  }

  /**
   * Main military update: recruits troops and coordinates strike expeditions
   * @param {number} uMil 
   */
  update(uMil) {
    // 1. Train military reinforcements at the Barracks
    this.manageTraining();

    // 2. Coordinate and dispatch military expedition squads if threshold reached
    this.attackThreshold = this.computeThreshold();
    this.unstickWave();
    if (uMil >= 0.8 && this.expeditionAllowed()) {
      this.manageMilitaryExpedition();
    }
  }

  /**
   * Recruits Grunts/Knights, Axethrowers/Archers, or Ogres at the Barracks
   */
  manageTraining() {
    if (this.director.population >= this.director.maxPopulation) return;

    // Strict Economic Protection: never starve peon recovery when workforce is critically low
    const eco = this.director.economyManager;
    if (eco) {
      if (eco.isWorkerEmergency()) {
        return; // Full recruitment freeze while recovering workforce (< 3 peons)
      }
      if (!eco.canAffordMilitaryRecruitment()) {
        return; // Hold resource reserve for peons until workforce is mature
      }
    }

    const dir = this.director;
    // F5-03: Fácil para de treinar ao atingir o limite de combatentes.
    if (dir.profile.armyCap > 0 && dir.getCombatUnitCount() >= dir.profile.armyCap) return;
    // F5-04: vários quartéis (rush) — treina no de menor fila.
    const barracksList = dir.getConstructedBarracksList();
    let barracks = null;
    for (let i = 0; i < barracksList.length; i++) {
      const q = barracksList[i].queue ? barracksList[i].queue.length : 0;
      if (q >= 2) continue;
      if (!barracks || q < (barracks.queue ? barracks.queue.length : 0)) barracks = barracksList[i];
    }
    if (!barracks) return;

    // Assess army balance
    const enemies = dir.getOwnUnits();
    const lenE = enemies.length;
    let meleeCount = 0;
    let rangedCount = 0;
    let cavalryCount = 0;
    let casterCount = 0;
    let siegeCount = 0;
    let suicideCount = 0;

    for (let i = 0; i < lenE; i++) {
      const e = enemies[i];
      if (e.isDead) continue;
      if (e.type === dir.meleeType) meleeCount++;
      else if (e.type === dir.cavalryType) cavalryCount++;
      else if (e.type === dir.siegeType) siegeCount++;
      else if (e.type === dir.suicideType) suicideCount++;
      else if (e.type === dir.casterType) casterCount++;
      // F3-07: a classe avançada (ranger/berserker, `modelOf`) conta como atirador.
      else if (e.type === dir.rangedType || getUnitDef(e.type).modelOf === dir.rangedType) rangedCount++;
    }
    const line = meleeCount + rangedCount;

    // F5-04: mistura efetiva do exército (estratégia + facção + contra-unidades pela composição conhecida).
    const comp = dir.perception.composition(this._comp);
    const mix = adaptMix(dir.strategy, dir.faction, comp);

    let recruitType = null;
    let trainAt = barracks;
    const canMelee = dir.canAfford(dir.costs.melee);
    const canRanged = dir.canAfford(dir.costs.ranged);

    // Defense priority: If base has ZERO combat units, train whatever combat unit is affordable!
    if (meleeCount === 0 && rangedCount === 0) {
      if (canMelee) recruitType = dir.meleeType;
      else if (canRanged) recruitType = dir.rangedType;
      else return;
    } else if (rangedCount < (line + 1) * mix.ranged && canRanged) {
      recruitType = dir.rangedType;
    } else if (canMelee) {
      recruitType = dir.meleeType;
    } else if (canRanged) {
      recruitType = dir.rangedType;
    } else {
      return; // Cannot afford currently
    }

    // F4-01: cavalaria no Estábulo/Covil, 1 para cada `cavalryRatio` combatentes de linha.
    const stable = dir.getConstructedStable();
    if (stable && mix.cavalryRatio > 0 && (!stable.queue || stable.queue.length < 2) &&
        dir.canAfford(dir.costs.cavalry) &&
        missingUnitRequirements(dir.playerId, dir.cavalryType, this.gm).length === 0 &&
        line >= mix.cavalryRatio * (cavalryCount + 1)) {
      recruitType = dir.cavalryType;
      trainAt = stable;
    }

    // F4-02: cerco na Oficina — 1–3 unidades vivas (mais com mais tropas de linha; +1 contra defesas) a
    // partir de `siegeAt` combatentes de linha; sai junto do exército no próximo ATTACK.
    const workshop = dir.getConstructedWorkshop();
    if (workshop && recruitType !== dir.cavalryType && (!workshop.queue || workshop.queue.length < 1)) {
      const siegeCap = Math.min(3, 1 + Math.floor(line / 6)) + mix.siegeBonus;
      if (siegeCount < siegeCap && line >= Math.min(dir.strategy.siegeAt, 8) &&
          dir.canAfford(dir.costs.siege) &&
          missingUnitRequirements(dir.playerId, dir.siegeType, this.gm).length === 0) {
        recruitType = dir.siegeType;
        trainAt = workshop;
      }
    }

    // F4-05: sapadores na Oficina (até 3 vivos) quando o inimigo tem ≥ 4 muralhas ou Centro nível ≥ 2.
    if (workshop && recruitType !== dir.cavalryType && recruitType !== dir.siegeType &&
        (!workshop.queue || workshop.queue.length < 1) && dir.suicideType) {
      if (suicideCount < 3 && line >= 3 && this._enemyFortified() &&
          dir.canAfford(dir.costs.suicide) &&
          missingUnitRequirements(dir.playerId, dir.suicideType, this.gm).length === 0) {
        recruitType = dir.suicideType;
        trainAt = workshop;
      }
    }

    // F5-05: conjuradores (Mago/Necromante) no edifício arcano — só dificuldades com `casters`, estratégias de tech.
    if (dir.profile.casters && dir.strategy.tech && line >= 6) {
      const arcane = dir.getConstructedArcane();
      const casterCap = dir.profile.micro >= 3 ? 3 : 2;
      if (arcane && (!arcane.queue || arcane.queue.length < 1) && casterCount < casterCap &&
          recruitType !== dir.siegeType && dir.canAfford(dir.costs.caster) &&
          missingUnitRequirements(dir.playerId, dir.casterType, this.gm).length === 0) {
        recruitType = dir.casterType;
        trainAt = arcane;
      }
    }

    // F2-02: TRAIN (+ RALLY uma vez por edifício) via comandos (a IA emite com o próprio playerId).
    const playerId = dir.playerId;
    dir.issue({ type: CMD.TRAIN, playerId, buildingId: trainAt.id, unitType: recruitType });
    if (!this._rallySet.has(trainAt.id) && dir.issue({
      type: CMD.RALLY,
      playerId,
      buildingId: trainAt.id,
      x: this.assemblyRallyPoint.x,
      z: this.assemblyRallyPoint.z
    })) {
      this._rallySet.add(trainAt.id);
    }
  }

  /** F4-05: o inimigo CONHECIDO tem ≥ 4 muralhas ou um Centro nível ≥ 2? (memória da percepção) */
  _enemyFortified() {
    const c = this.director.perception.composition(this._comp);
    return c.walls >= 4 || c.hqTier2;
  }

  /**
   * Reúne as tropas prontas e lança a onda. O alvo vem só da memória da percepção (F5-02); sem alvo
   * conhecido, o exército marcha em attack-move para o slot inimigo mais provável (explorando).
   */
  manageMilitaryExpedition() {
    const dir = this.director;
    // Guarda de casa: a onda nunca leva todo o exército (Normal 1 unidade; Difícil+ 20 %, mín. 2).
    const micro = dir.profile.micro;
    const guardFor = n => (micro >= 2 ? Math.max(2, Math.floor(n * 0.2)) : micro >= 1 ? 1 : 0);
    const total = this.collectSquad();
    if (total < this.attackThreshold + guardFor(total)) return;

    const guard = guardFor(total);
    const all = new Array(total);
    for (let i = 0; i < total; i++) {
      all[i] = this.readySquadBuffer[i];
      this.readySquadBuffer[i] = null; // Clear reference for GC hygiene
    }
    this.readySquadCount = 0;
    // os que ficam: atiradores primeiro (protegidos pelas torres), depois de maior id (determinístico)
    const rank = u => (getUnitDef(u.type).isRanged ? 0 : 1) * 1e6 - u.id;
    const sorted = all.slice().sort((a, b) => rank(a) - rank(b));
    const stay = new Set(sorted.slice(0, guard).map(u => u.id));
    const units = all.filter(u => !stay.has(u.id));
    const count = units.length;

    if (!this.assessAttack(units)) return;

    const target = this.selectExpeditionTarget();
    if (!target) {
      const m = dir.perception.marchTarget();
      if (!m) return;
      const ids = units.map(u => u.id);
      if (dir.issue({ type: CMD.ATTACK_MOVE, playerId: dir.playerId, unitIds: ids, x: m.x, z: m.z })) {
        for (let i = 0; i < ids.length; i++) this.waveIds.add(ids[i]);
      }
      return;
    }

    // Alarme sonoro + notificação de UI (só quando o alvo é do jogador local): F2-07, sai como
    // evento — a IA não chama `soundManager`/`uiManager` direto.
    if (this.gm.events) {
      this.gm.events.emit(EVT.UNDER_ATTACK, { ownerId: target.ownerId, pos: { x: target.x, y: 0, z: target.z } });
      const factionName = dir.faction === 'orc' ? 'Horda Orc' : 'Aliança Humana';
      this.gm.events.emit(EVT.NOTIFY, {
        ownerId: target.ownerId,
        text: `⚔️ A ${factionName} reuniu um esquadrão de guerra (${count} tropas) e avança contra sua base!`
      });
    }

    // F5-05: o micro pode separar um grupo de flanco (Brutal); o resto ataca direto.
    const mainUnits = dir.microManager.planWave(units, target);
    const unitIds = new Array(mainUnits.length);
    for (let i = 0; i < mainUnits.length; i++) unitIds[i] = mainUnits[i].id;
    // Alvo que a IA não está vendo agora é só memória (fantasma): marcha até lá em attack-move e ataca o que
    // achar. Atacar o id de uma construção que já caiu fora da visão deixava o exército parado para sempre.
    const seenNow = target.lastSeen === dir.perception.now;
    const order = seenNow
      ? { type: CMD.ATTACK, playerId: dir.playerId, unitIds, targetId: target.id }
      : { type: CMD.ATTACK_MOVE, playerId: dir.playerId, unitIds, x: target.x, z: target.z };
    if (unitIds.length > 0 && !dir.issue(order)) {
      return; // sem orçamento de APM: refaz no próximo tick (flanco já planejado é idempotente)
    }
    for (let i = 0; i < units.length; i++) this.waveIds.add(units[i].id);

    // Update threshold for subsequent wave
    this.strikeWaveNumber++;
    this.attackThreshold = this.computeThreshold();
  }

  /**
   * Alvo estratégico entre o que a IA CONHECE (F5-02):
   * 1. Torres/postos avançados (a mais próxima da base da IA) 2. Centro hostil mais próximo
   * 3. qualquer construção conhecida 4. qualquer unidade hostil vista recentemente.
   * @returns {{id:number,x:number,z:number,ownerId:number}|null}
   */
  selectExpeditionTarget() {
    const per = this.director.perception;
    const base = this.director.baseCenter;
    const tower = per.nearestBuilding(base.x, base.y, k => !!getBuildingDef(k.type).tower);
    if (tower) return tower;
    const hq = per.nearestBuilding(base.x, base.y, k => k.role === 'hq');
    if (hq) return hq;
    const any = per.nearestBuilding(base.x, base.y, k => k.role !== 'platform'); // F4-07a: plataforma no mar é inalcançável por terra
    if (any) return any;
    let best = null;
    let bd = Infinity;
    let bestLand = null;
    let bdLand = Infinity;
    for (const k of per.units.values()) {
      const d = (k.x - base.x) * (k.x - base.x) + (k.z - base.y) * (k.z - base.y);
      if (d < bd) { bd = d; best = k; }
      // F4-06: prefere alvo que o exército terrestre consegue atingir (não aéreo)
      if (d < bdLand && canTarget(LAND_ATTACKER, { layer: getUnitDef(k.type)?.layer })) { bdLand = d; bestLand = k; }
    }
    return bestLand || best;
  }
}
