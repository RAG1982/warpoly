/**
 * MissionRuntime.js — F8-04: execução determinística de uma missão (`src/data/missions/<id>.json`) dentro do `simStep`.
 *
 * - Criado pelo `GameManager` (`_initMission`) quando a `MatchConfig` tem `missionId` (ou `mission` inline) e
 *   `victoryMode: 'mission'`; `step()` roda UMA vez por tick, no lugar da checagem de vitória por regra
 *   (`GameManager._updateMissionConditions`).
 * - Estado = função pura de (definição da missão, seed, comandos dos jogadores): variáveis, objetivos, gatilhos, tags,
 *   contadores de mortes/coleta e o desfecho. Entra no checksum (`hashString`), então save/replay/lockstep detectam divergência.
 * - Eventos da simulação (mortes, coleta) são acumulados por ouvintes NÃO-apresentação e consumidos no início do `step()`
 *   seguinte (o `EventBus` só despacha no fim do passo, então o atraso é sempre exatamente 1 tick).
 * - Sem Math.random / Date.now. Apresentação (diálogos, câmera, sons) sai como eventos `EVT.MISSION_*`.
 */
import { EVT } from '../events.js';
import { SIM_DT } from '../constants.js';
import { isAlive, ownerMatches, resolveOwnerId, roleOf, selectEntities } from './selectors.js';
import { evalObjective, EXACT_TYPES, POLL_TICKS } from './objectives.js';
import { TriggerEngine } from './TriggerEngine.js';
import { runAction } from './actions.js';
import { resolveMissionAnchors } from './anchors.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

/** Verificação "tudo destruído?" do jogador local (derrota por aniquilação), a cada 20 ticks. */
const WIPE_CHECK_TICKS = 20;
const NON_COUNTING_ROLES = new Set(['wall', 'platform']);

export class MissionRuntime {
  /**
   * @param {import('../GameManager.js').GameManager} gm
   * @param {object} def  missão já validada (`assertMission`)
   */
  constructor(gm, def) {
    // M2-01: âncoras viram coordenadas AQUI, antes de qualquer tick (a sim, o checksum e os saves só veem x/z). Sem âncoras: mesma `def`.
    def = resolveMissionAnchors(def, gm.terrain?.mapDef ?? null);
    this.gm = gm;
    this.def = def;
    this.id = def.id;
    this.tick = 0;
    /** @type {'victory'|'defeat'|null} */
    this.outcome = null;
    this.outcomeText = null;
    this.cutsceneSeq = 0;

    /** @type {Record<string, number|boolean|string>} */
    this.vars = { ...(def.vars || {}) };
    /** @type {Map<string, number[]>} tag → ids de entidades (ordem de inserção) */
    this.tags = new Map();
    /** @type {Map<string, object>} id → estado do objetivo (`def`, `status`, `visible`, `startTick`, `cur`, `max`) */
    this.objectives = new Map();
    /** @type {Map<string, object>} id → estado do gatilho (preenchido pelo TriggerEngine) */
    this.triggers = new Map();

    // Contadores alimentados por eventos.
    /** @type {Map<string, {kind:string,type:string,owner:number,killer:number|null,n:number}>} */
    this.deaths = new Map();
    /** @type {Set<number>} ids de entidades já mortas/destruídas */
    this.deadIds = new Set();
    /** @type {Map<string, number>} `${owner}:${resource}` → total coletado */
    this._gathered = new Map();
    /** @type {Map<string, number>} `${owner}:${unitType}` → unidades treinadas (evento UNIT_TRAINED; objetivo `train`) */
    this._trained = new Map();
    this._events = [];
    /** M3-X1: marcos (`spawnLandmark`): `{id, kind, x, z, scale, facing, tag, known, label, lit}`. `lit` = tick do brilho (0 = apagado). */
    this.landmarks = [];

    this._hasTrain = def.objectives.some((o) => o.type === 'train');
    for (const o of def.objectives) this._registerObjective(o);
    this.engine = new TriggerEngine(this, def.triggers || []);

    const bus = gm.events;
    this._offs = [
      bus.on(EVT.UNIT_DIED, (p) => this._events.push(['u', p])),
      bus.on(EVT.BUILDING_DESTROYED, (p) => this._events.push(['b', p])),
      bus.on(EVT.RESOURCE_GATHERED, (p) => this._events.push(['g', p])),
      bus.on(EVT.UNIT_TRAINED, (p) => this._events.push(['t', p]))
    ];

    // Preparação inicial (tick 0): mesmas ações dos gatilhos, antes do primeiro passo.
    for (const a of def.setup || []) runAction(this, a);
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs = [];
  }

  // ------------------------------------------------------------------ objetivos
  _registerObjective(def) {
    const active = def.active !== false;
    this.objectives.set(def.id, {
      def,
      id: def.id,
      status: active ? 'active' : 'inactive',
      visible: (def.priority ?? 'primary') !== 'hidden',
      startTick: this.tick,
      cur: 0,
      max: 0
    });
  }

  /** Ação `addObjective`: o objetivo nasce ativo (a menos que `active:false`). */
  addObjective(def) {
    if (this.objectives.has(def.id)) return;
    this._registerObjective({ priority: 'primary', ...def });
    const o = this.objectives.get(def.id);
    this.gm.events.emit(EVT.MISSION_OBJECTIVE, { id: o.id, status: o.status, priority: o.def.priority ?? 'primary', visible: o.visible });
  }

  revealObjective(id) {
    const o = this.objectives.get(id);
    if (!o || o.visible) return;
    o.visible = true;
    this.gm.events.emit(EVT.MISSION_OBJECTIVE, { id, status: o.status, priority: o.def.priority ?? 'primary', visible: true });
  }

  setObjectiveStatus(id, status) {
    const o = this.objectives.get(id);
    if (!o || o.status === status) return false;
    o.status = status;
    if (status === 'active') o.startTick = this.tick;
    // Objetivos ocultos aparecem quando concluídos (bônus descoberto) ou falhados.
    if ((status === 'completed' || status === 'failed') && !o.visible) o.visible = true;
    this.gm.events.emit(EVT.MISSION_OBJECTIVE, { id, status, priority: o.def.priority ?? 'primary', visible: o.visible });
    return true;
  }

  // ------------------------------------------------------------------ marcos (M3-X1)
  /** Ação `spawnLandmark`: cria um marco (id sequencial = determinístico). */
  addLandmark(a) {
    const lm = {
      id: this.landmarks.length + 1,
      kind: a.kind,
      x: a.x,
      z: a.z,
      scale: a.scale ?? 1,
      facing: a.facing ?? 0,
      tag: a.tag ?? null,
      known: a.known === true, // visível sem explorar (padrão: só aparece quando explorado pela névoa)
      label: a.label ? clone(a.label) : null, // só apresentação (fora do hash)
      lit: 0
    };
    this.landmarks.push(lm);
    return lm;
  }

  /** Ação `lightLandmark`: acende os marcos com a tag (só a primeira vez, para não redisparar o brilho). */
  lightLandmark(tag) {
    for (const lm of this.landmarks) if (lm.tag === tag && lm.lit === 0) lm.lit = this.tick + 1;
  }

  /** Estado dos marcos como dados puros (save/replay; a missão é reconstruída a partir da definição + comandos). */
  landmarkState() {
    return this.landmarks.map((lm) => ({ id: lm.id, kind: lm.kind, x: lm.x, z: lm.z, scale: lm.scale, facing: lm.facing, tag: lm.tag, known: lm.known, label: lm.label, lit: lm.lit }));
  }

  /** Restaura marcos de um `landmarkState()` (ex.: ao carregar um save). Substitui a lista atual. */
  restoreLandmarkState(list) {
    this.landmarks = (list || []).map((lm) => ({ ...lm, label: lm.label ? clone(lm.label) : null }));
  }

  /**
   * Marcadores de objetivo visíveis agora (dados puros para a view/minimapa). Objetivo `escort` ganha marcador 'goal' na
   * própria área enquanto ativo; `marker` declarado vale para qualquer tipo. Ocultos só aparecem depois de `revealObjective`.
   * `showWhen`: 'active' (padrão) = enquanto ativo; 'revealed' = desde que revelado, mesmo inativo (até concluir/falhar).
   * @returns {{id:string, style:'goal'|'discover', area:{x:number,z:number,r:number}}[]}
   */
  markers() {
    const out = [];
    for (const o of this.objectives.values()) {
      const m = o.def.marker ?? (o.def.type === 'escort' ? { area: o.def.area, style: 'goal', showWhen: 'active' } : null);
      if (!m || !m.area) continue;
      const showWhen = m.showWhen ?? 'active';
      const live = o.status === 'active' || o.status === 'inactive';
      const on = o.visible && live && (showWhen === 'revealed' || o.status === 'active');
      if (on) out.push({ id: o.id, style: m.style ?? 'goal', area: { x: m.area.x, z: m.area.z, r: m.area.r } });
    }
    return out;
  }

  // ------------------------------------------------------------------ contadores de eventos
  _drainEvents() {
    const evs = this._events;
    if (evs.length === 0) return;
    for (let i = 0; i < evs.length; i++) {
      const [k, p] = evs[i];
      if (k === 'g') {
        const key = `${p.ownerId}:${p.type}`;
        this._gathered.set(key, (this._gathered.get(key) || 0) + p.amount);
        continue;
      }
      if (k === 't') {
        const key = `${p.ownerId}:${p.unitType}`;
        this._trained.set(key, (this._trained.get(key) || 0) + 1);
        continue;
      }
      const isUnit = k === 'u';
      const id = isUnit ? p.unitId : p.buildingId;
      const type = isUnit ? p.unitType : p.buildingType;
      if (id !== undefined) this.deadIds.add(id);
      const killer = p.killerOwnerId === undefined ? null : p.killerOwnerId;
      const key = `${k}|${type}|${p.ownerId}|${killer === null ? 'x' : killer}`;
      const e = this.deaths.get(key);
      if (e) e.n++;
      else this.deaths.set(key, { kind: isUnit ? 'unit' : 'building', type, owner: p.ownerId, killer, n: 1 });
    }
    evs.length = 0;
  }

  /** Total coletado por `ownerId` do recurso `type` desde o início da missão. */
  gathered(ownerId, type) {
    return this._gathered.get(`${ownerId}:${type}`) || 0;
  }

  /** Unidades de `type` treinadas por `ownerId` desde o início da missão (objetivo `train`). */
  trainedCount(ownerId, type) {
    return this._trained.get(`${ownerId}:${type}`) || 0;
  }

  /** Mortes/destruições que casam com o seletor (`tag`: por id; senão tipo/papel/dono/`killedBy`). */
  deathCount(sel) {
    if (sel.tag !== undefined) {
      const ids = this.tags.get(sel.tag);
      if (!ids) return 0;
      let n = 0;
      for (let i = 0; i < ids.length; i++) if (this.deadIds.has(ids[i])) n++;
      return n;
    }
    const gm = this.gm;
    let n = 0;
    for (const e of this.deaths.values()) {
      if (sel.unitType !== undefined && !(e.kind === 'unit' && e.type === sel.unitType)) continue;
      if (sel.buildingType !== undefined && !(e.kind === 'building' && e.type === sel.buildingType)) continue;
      if (sel.role !== undefined && !(e.kind === 'building' && roleOf(e.type) === sel.role)) continue;
      if (sel.kind === 'unit' && e.kind !== 'unit') continue;
      if (sel.kind === 'building' && e.kind !== 'building') continue;
      if (sel.owner !== undefined && !ownerMatches(gm, sel.owner, e.owner)) continue;
      if (sel.killedBy !== undefined && !(e.killer !== null && ownerMatches(gm, sel.killedBy, e.killer))) continue;
      n += e.n;
    }
    return n;
  }

  // ------------------------------------------------------------------ passo
  /** Um tick da missão. Chamado por `GameManager._updateMissionConditions` (dentro de `simStep`). */
  step() {
    if (this.outcome) return;
    this.tick = this.gm.currentTick;
    this._drainEvents();

    // 1. Objetivos
    for (const o of this.objectives.values()) {
      if (o.status !== 'active') continue;
      if (!EXACT_TYPES.has(o.def.type) && this.tick % POLL_TICKS !== 0 && o.def.type !== 'destroy') continue;
      const r = evalObjective(this, o);
      o.cur = r.cur;
      o.max = r.max;
      if (r.status) this.setObjectiveStatus(o.id, r.status);
    }

    // 2. Gatilhos
    this.engine.step();
    if (this.outcome) return;

    // 3. Desfecho
    this._checkOutcome();
  }

  _checkOutcome() {
    const def = this.def;
    if (def.autoVictory !== false) {
      let primaries = 0;
      let done = 0;
      for (const o of this.objectives.values()) {
        if ((o.def.priority ?? 'primary') !== 'primary') continue;
        primaries++;
        if (o.status === 'failed') return this.finish('defeat', o.def.failText);
        if (o.status === 'completed') done++;
      }
      if (primaries > 0 && done === primaries) return this.finish('victory');
    }
    if (def.defeatWhenWiped !== false && this.tick % WIPE_CHECK_TICKS === 0 && this._localWiped()) {
      this.finish('defeat');
    }
  }

  /** O jogador local não tem mais nenhuma unidade nem construção (exceto muralhas/plataformas)? */
  _localWiped() {
    const gm = this.gm;
    const id = gm.localPlayerId;
    for (let i = 0; i < gm.allUnits.length; i++) {
      const u = gm.allUnits[i];
      if (u.ownerId === id && isAlive(u)) return false;
    }
    for (let i = 0; i < gm.buildings.length; i++) {
      const b = gm.buildings[i];
      if (b.ownerId === id && isAlive(b) && !NON_COUNTING_ROLES.has(roleOf(b.type))) return false;
    }
    return true;
  }

  /** Encerra a missão (idempotente). `GameManager._updateMissionConditions` converte em fim de partida. */
  finish(outcome, text = null) {
    if (this.outcome) return;
    this.outcome = outcome;
    this.outcomeText = text;
    this.gm.events.emit(EVT.MISSION_ENDED, { outcome, text: text || undefined });
  }

  // ------------------------------------------------------------------ leitura (HUD) e checksum
  /** Tempo decorrido (s) da missão. */
  get elapsed() {
    return this.gm.currentTick * SIM_DT;
  }

  /** Objetivos visíveis, para o painel in-game e a tela de fim (dados puros, textos ainda localizáveis). */
  snapshot() {
    const objectives = [];
    for (const o of this.objectives.values()) {
      if (!o.visible || o.status === 'inactive') continue;
      objectives.push({
        id: o.id,
        priority: o.def.priority ?? 'primary',
        status: o.status,
        title: o.def.title,
        description: o.def.description,
        cur: o.cur,
        max: o.max,
        unit: o.def.type === 'survive' ? 'seconds' : (o.def.type === 'collect' ? o.def.resource : null)
      });
    }
    return { id: this.id, title: this.def.title, outcome: this.outcome, outcomeText: this.outcomeText, objectives };
  }

  /** Texto estável do estado da missão, somado ao checksum (`checksum.js`). */
  hashString() {
    let s = `${this.outcome || '-'}|`;
    for (const o of this.objectives.values()) s += `o:${o.id}:${o.status}:${o.visible ? 1 : 0}:${o.startTick};`;
    s += '|';
    for (const k of Object.keys(this.vars)) s += `v:${k}=${this.vars[k]};`;
    s += `|${this.engine.hashString()}|`;
    for (const [tag, ids] of this.tags) s += `t:${tag}=${ids.join(',')};`;
    s += '|';
    for (const [k, e] of this.deaths) s += `d:${k}=${e.n};`;
    for (const [k, n] of this._gathered) s += `g:${k}=${n};`;
    if (this._hasTrain) for (const [k, n] of this._trained) s += `tr:${k}=${n};`; // só com objetivo `train` (checksums antigos intactos)
    // M3-X1: marcos entram no hash só quando existem (missões sem marcos mantêm o checksum)
    for (const lm of this.landmarks) s += `lm:${lm.id}:${lm.kind}:${lm.x}:${lm.z}:${lm.scale}:${lm.facing}:${lm.tag ?? ''}:${lm.known ? 1 : 0}:${lm.lit};`;
    return s;
  }

  /** Entidades vivas de um seletor (atalho para testes/UI). */
  select(sel) {
    return selectEntities(this, sel);
  }

  resolveOwner(spec) {
    return resolveOwnerId(this.gm, spec);
  }
}
