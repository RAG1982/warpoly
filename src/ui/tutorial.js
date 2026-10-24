/**
 * tutorial.js (F6-09) — lógica pura do tutorial jogável ("missão 0"). Sem DOM nem three.js: testável em Node.
 *
 * Uma partida pequena e guiada (mapa `tutorial`, rival passivo — sem IA) cujos passos avançam por
 * eventos do `EventBus` da simulação (`EVT.*`) e, para o 1º passo, por um instantâneo da seleção:
 *
 *   select → wood → gold → house → farm → barracks → train → attack → rival
 *
 * O jogador aprende: selecionar, coletar madeira e ouro, construir casa/fazenda/quartel, treinar tropas, atacar o
 * Acampamento de Bandidos e, por fim, destruir a base do rival orc (que dá a vitória da partida).
 * `TutorialController` (DOM) mostra o painel de objetivo, setas e o botão Pular.
 *
 * Passo = `{ id, events: [{ type, match?(payload, ctx) -> número|boolean }], need, poll?(snap) -> boolean, focus,
 *            remember? }`
 *  - `need`: quantidade a atingir (quando `match` devolve número, ele é somado; `true` conta 1).
 *  - `remember`: o passo lembra os eventos ocorridos ANTES de ele virar o atual (ex.: o acampamento destruído
 *    cedo). Passos `remember` são concluídos na hora ao entrar, se já estavam satisfeitos.
 *  - `poll`: consulta o estado do mundo (`update(snapshot)`, ~4x/s) e conclui o passo quando verdadeiro.
 *  - `focus`: o que destacar — `{ kind: 'world', what }` (`worker`/`tree`/`gold`/`camp`/`barracks`/`rivalBase`) ou
 *    `{ kind: 'ui', selector }` (botão da HUD); `fallback` vale quando o botão não está na tela (nada selecionado).
 * Textos em `tut.<id>.title|text`, no i18n.
 */
import { EVT } from '../sim/events.js';
import { getBuildingDef, getUnitDef, STARTING_RESOURCES } from '../data/index.js';
import { t } from '../i18n/index.js';

export const TUTORIAL_MAP_ID = 'tutorial';
/** Semente fixa: todo mundo joga o mesmo mapa (árvores, bandidos). */
export const TUTORIAL_SEED = 1996;
/** Dono do rival passivo (`createTutorialConfig`): o passo final é destruir a base dele. */
export const TUTORIAL_RIVAL_ID = 1;

const mine = (p, ctx, key = 'ownerId') => p && p[key] === ctx.localPlayerId;

export const TUTORIAL_STEPS = Object.freeze([
  {
    id: 'select', need: 1, poll: (snap) => !!snap.selectedWorker, events: [],
    focus: { kind: 'world', what: 'worker' }
  },
  {
    id: 'wood', need: 40, unit: 'wood',
    events: [{ type: EVT.RESOURCE_GATHERED, match: (p, ctx) => (mine(p, ctx) && p.type === 'wood' ? p.amount : 0) }],
    focus: { kind: 'world', what: 'tree' }
  },
  {
    id: 'gold', need: 40, unit: 'gold',
    events: [{ type: EVT.RESOURCE_GATHERED, match: (p, ctx) => (mine(p, ctx) && p.type === 'gold' ? p.amount : 0) }],
    focus: { kind: 'world', what: 'gold' }
  },
  {
    id: 'house', need: 1,
    events: [{ type: EVT.BUILDING_COMPLETED, match: (p, ctx) => mine(p, ctx) && getBuildingDef(p.buildingType).role === 'house' }],
    focus: { kind: 'ui', selector: '.action-build-btn[data-build="cottage"]' },
    fallback: { kind: 'world', what: 'worker' }
  },
  {
    id: 'farm', need: 1,
    events: [{ type: EVT.BUILDING_COMPLETED, match: (p, ctx) => mine(p, ctx) && getBuildingDef(p.buildingType).role === 'farm' }],
    focus: { kind: 'ui', selector: '.action-build-btn[data-build="farm"]' },
    fallback: { kind: 'world', what: 'worker' }
  },
  {
    id: 'barracks', need: 1,
    events: [{ type: EVT.BUILDING_COMPLETED, match: (p, ctx) => mine(p, ctx) && getBuildingDef(p.buildingType).role === 'barracks' }],
    focus: { kind: 'ui', selector: '.action-build-btn[data-build="barracks"]' },
    fallback: { kind: 'world', what: 'worker' }
  },
  {
    id: 'train', need: 2,
    events: [{ type: EVT.UNIT_TRAINED, match: (p, ctx) => mine(p, ctx) && !!getUnitDef(p.unitType).isCombat }],
    focus: { kind: 'ui', selector: '#bld-train-buttons [data-train]' },
    fallback: { kind: 'world', what: 'barracks' }
  },
  {
    id: 'attack', need: 1, remember: true,
    events: [
      { type: EVT.CAMP_CLEARED, match: (p, ctx) => mine(p, ctx, 'byOwnerId') },
      { type: EVT.BUILDING_DESTROYED, match: (p, ctx) => p.buildingType === 'bandit_camp' && mine(p, ctx, 'killerOwnerId') }
    ],
    poll: (snap) => !!snap.campGone,
    focus: { kind: 'world', what: 'camp' }
  },
  {
    // Último passo: a vitória da partida (`victoryMode: 'conquest'`) só é liberada depois dele (ver `holdsVictory`).
    id: 'rival', need: 1, remember: true,
    events: [{ type: EVT.PLAYER_DEFEATED, match: (p) => (p.ownerId === TUTORIAL_RIVAL_ID ? 1 : 0) }],
    poll: (snap) => !!snap.rivalDefeated,
    focus: { kind: 'world', what: 'rivalBase' }
  }
]);

/** Tipos de evento que o tutorial escuta (para o controlador se inscrever no `EventBus`). */
export const TUTORIAL_EVENT_TYPES = Object.freeze([...new Set(TUTORIAL_STEPS.flatMap((s) => s.events.map((e) => e.type)))]);

/**
 * MatchConfig do tutorial: humano local × rival passivo (não-IA, não-local) em outro canto do mapa. O rival
 * existe só para a partida ter dois times; nunca ataca. Recursos iniciais suficientes para a 1ª construção.
 * Textos (nome do rival) saem no idioma atual.
 */
export function createTutorialConfig({ seed = TUTORIAL_SEED } = {}) {
  return {
    mapId: TUTORIAL_MAP_ID,
    seed,
    difficulty: 'easy',
    victoryMode: 'conquest',
    headless: false,
    tutorial: true,
    startingResources: { ...STARTING_RESOURCES, wood: 330, gold: 260 },
    players: [
      { id: 0, name: t('player.you'), factionId: 'human', team: 0, color: '#2563eb', isAI: false, isLocal: true, startSlot: 0 },
      { id: TUTORIAL_RIVAL_ID, name: t('tutorial.rival'), factionId: 'orc', team: 1, color: '#dc2626', isAI: false, isLocal: false, startSlot: 1 }
    ]
  };
}

/** Quanto um evento vale para um passo (soma dos `match`; `true` conta 1). */
function gainOf(step, type, payload, ctx) {
  let gained = 0;
  for (const e of step.events) {
    if (e.type !== type) continue;
    const r = e.match ? e.match(payload, ctx) : true;
    gained += typeof r === 'number' ? r : (r ? 1 : 0);
  }
  return gained;
}

export class Tutorial {
  /**
   * @param {object} [opts]
   * @param {number} [opts.localPlayerId]
   * @param {ReadonlyArray<object>} [opts.steps]
   * @param {(state: object) => void} [opts.onChange]  chamado a cada mudança (progresso, passo, fim, pulo)
   */
  constructor({ localPlayerId = 0, steps = TUTORIAL_STEPS, onChange = null } = {}) {
    this.localPlayerId = localPlayerId;
    this.steps = steps;
    this.onChange = onChange;
    this.reset();
  }

  reset() {
    this.index = 0;
    this.count = 0;
    /** Progresso dos passos `remember` (acumulado desde o início da partida, mesmo antes de virarem o atual). */
    this.memo = {};
    /** Último instantâneo recebido por `update` (usado ao concluir passos por eventos, ex.: entrar em `attack` já com o acampamento caído). */
    this._snap = {};
    this.skipped = false;
    this.finished = false;
    this._notify();
  }

  /** Passo atual (`null` ao terminar ou pular). */
  get step() {
    return this.finished || this.skipped ? null : this.steps[this.index] || null;
  }

  get active() { return !this.finished && !this.skipped; }

  /**
   * Enquanto o tutorial está em curso, a partida não pode terminar por vitória por conquista (o rival pode cair
   * antes do passo final). Terminado ou pulado, a regra normal volta a valer.
   */
  get holdsVictory() { return this.active; }

  /** `{ done, total }` — passos concluídos / total. */
  get progress() {
    return { done: this.finished ? this.steps.length : this.index, total: this.steps.length };
  }

  /** Eventos do barramento da simulação: `handleEvent(EVT.X, payload)`. */
  handleEvent(type, payload) {
    if (!this.active) return false;
    const ctx = { localPlayerId: this.localPlayerId };
    let changed = false;
    for (const s of this.steps) {
      if (!s.remember) continue;
      const g = gainOf(s, type, payload, ctx);
      if (g > 0) {
        this.memo[s.id] = Math.min(s.need, (this.memo[s.id] || 0) + g);
        changed = true;
      }
    }
    const step = this.step;
    if (step && !step.remember) {
      const g = gainOf(step, type, payload, ctx);
      if (g > 0) {
        this.count = Math.min(step.need, this.count + g);
        changed = true;
      }
    }
    if (!changed) return false;
    this._settle(this._snap);
    this._notify();
    return true;
  }

  /** Instantâneo do estado (`{ selectedWorker, campGone, rivalDefeated }`), chamado ~4x/s: passos por `poll`. */
  update(snapshot) {
    this._snap = snapshot || {};
    if (!this.active) return;
    if (this._settle(this._snap)) this._notify();
  }

  /** Botão Pular: encerra o tutorial (a partida segue livre). */
  skip() {
    if (!this.active) return;
    this.skipped = true;
    this._notify();
  }

  /**
   * Conclui em sequência os passos já satisfeitos (por eventos lembrados, contagem ou `poll`).
   * Devolve true se algum passo foi concluído.
   */
  _settle(snapshot) {
    let moved = false;
    while (this.active && this.step) {
      const s = this.step;
      const have = s.remember ? (this.memo[s.id] || 0) : this.count;
      const done = have >= s.need || (!!snapshot && !!s.poll && s.poll(snapshot));
      if (!done) break;
      this._advance();
      moved = true;
    }
    return moved;
  }

  _advance() {
    this.index++;
    this.count = 0;
    if (this.index >= this.steps.length) this.finished = true;
  }

  _notify() {
    if (this.onChange) this.onChange(this.state());
  }

  /** Estado serializável para a UI. */
  state() {
    const s = this.step;
    return {
      index: this.index,
      total: this.steps.length,
      stepId: s ? s.id : null,
      count: s ? (s.remember ? (this.memo[s.id] || 0) : this.count) : 0,
      need: s ? s.need : 0,
      unit: s ? s.unit || null : null,
      finished: this.finished,
      skipped: this.skipped
    };
  }
}
