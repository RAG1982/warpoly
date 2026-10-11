/**
 * missionPresentation.js — F8-04: lógica PURA da apresentação de missões (sem DOM/three.js; testável em Node):
 * caminho de câmera por keyframes (cutscene), fila de diálogos e modelos de painel de objetivos / fim de missão.
 * A câmera é render (fora do checksum): nada aqui toca a simulação.
 */
import { localize } from '../sim/missions/text.js';

/** Suavização (smoothstep) de 0..1. */
export const ease = (u) => { const x = Math.min(1, Math.max(0, u)); return x * x * (3 - 2 * x); };

/**
 * Pose da câmera `{x, z, zoom}` no instante `t` (s) de uma cutscene. Só os passos com `x,z` são keyframes de câmera;
 * entre dois keyframes a interpolação é suavizada. Antes do primeiro / depois do último a pose é a do extremo.
 * @returns {{x:number,z:number,zoom:number}|null}  `null` se nenhum passo tem posição.
 */
export function cutscenePose(steps, t, defaultZoom = 1) {
  const keys = steps.filter((s) => typeof s.x === 'number' && typeof s.z === 'number');
  if (keys.length === 0) return null;
  const pose = (k) => ({ x: k.x, z: k.z, zoom: k.zoom ?? defaultZoom });
  if (t <= keys[0].at) return pose(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (t <= b.at) {
      const span = Math.max(1e-6, b.at - a.at);
      const u = ease((t - a.at) / span);
      const pa = pose(a);
      const pb = pose(b);
      return { x: pa.x + (pb.x - pa.x) * u, z: pa.z + (pb.z - pa.z) * u, zoom: pa.zoom + (pb.zoom - pa.zoom) * u };
    }
  }
  return pose(keys[keys.length - 1]);
}

/** Diálogos dos passos cujo `at` está em `(t0, t1]` (primeira chamada: use `t0 = -Infinity`). */
export function cutsceneDialogs(steps, t0, t1) {
  return steps.filter((s) => s.dialog && s.at > t0 && s.at <= t1).map((s) => s.dialog);
}

/** Tempo (s) que um diálogo fica na tela: `duration` ou proporcional ao texto (mín. 3 s, máx. 12 s). */
export function dialogDuration(d, lang = 'pt-BR') {
  if (d.duration) return d.duration;
  const n = localize(d.text, lang).length;
  return Math.min(12, Math.max(3, n * 0.06));
}

/** Fila de diálogos: um por vez, avança sozinho pelo tempo ou com `dismiss()`. */
export class DialogQueue {
  constructor({ max = 12, lang = () => 'pt-BR' } = {}) {
    this.max = max;
    this.lang = lang;
    this.items = [];
    this.current = null;
    this._left = 0;
  }

  push(d) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push(d);
    if (!this.current) this._next();
  }

  /** @returns {boolean} mudou o diálogo atual? */
  tick(dt) {
    if (!this.current) return false;
    this._left -= dt;
    if (this._left > 0) return false;
    this._next();
    return true;
  }

  dismiss() {
    if (this.current) this._next();
  }

  clear() {
    this.items.length = 0;
    this.current = null;
  }

  _next() {
    this.current = this.items.shift() || null;
    this._left = this.current ? dialogDuration(this.current, this.lang()) : 0;
  }
}

/** Formata segundos como m:ss. */
export function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Modelo do painel de objetivos a partir de `gm.mission.snapshot()`: grupos (primários, secundários, bônus/ocultos
 * revelados), cada linha com título localizado, estado e texto de progresso.
 * @param {ReturnType<import('../sim/missions/MissionRuntime.js').MissionRuntime['snapshot']>} snap
 * @param {string} lang
 */
export function buildObjectivesModel(snap, lang = 'pt-BR') {
  const group = { primary: [], secondary: [], bonus: [] };
  for (const o of snap.objectives) {
    let progress = '';
    if (o.status === 'active' && o.max > 1) {
      progress = o.unit === 'seconds' ? `${formatClock(o.cur)} / ${formatClock(o.max)}` : `${o.cur}/${o.max}`;
    }
    const row = { id: o.id, status: o.status, title: localize(o.title, lang), description: o.description ? localize(o.description, lang) : '', progress };
    const key = o.priority === 'hidden' ? 'bonus' : o.priority;
    (group[key] || group.secondary).push(row);
  }
  return group;
}

/**
 * Modelo da tela de fim de missão.
 * @returns {{outcome:'victory'|'defeat', title:string, text:string, time:string, rows:Array<{title:string,status:string,priority:string}>, completed:number, total:number}}
 */
export function buildMissionEndModel(snap, elapsedSeconds, lang = 'pt-BR', plan = null) {
  const rows = snap.objectives.map((o) => ({ title: localize(o.title, lang), status: o.status, priority: o.priority === 'hidden' ? 'bonus' : o.priority }));
  const counted = rows.filter((r) => r.priority !== 'bonus');
  return {
    outcome: snap.outcome === 'victory' ? 'victory' : 'defeat',
    title: localize(snap.title, lang),
    text: snap.outcomeText ? localize(snap.outcomeText, lang) : '',
    time: formatClock(elapsedSeconds),
    rows,
    completed: counted.filter((r) => r.status === 'completed').length,
    total: counted.length,
    ...missionEndActions(snap.outcome === 'victory' ? 'victory' : 'defeat', plan)
  };
}

/**
 * Botões da tela de fim (puro). `plan` = `campaignEndPlan` (ou null fora da campanha).
 * Vitória de campanha com próxima: [Próxima missão (primário), Repetir missão, Estatísticas, Menu principal];
 * derrota de campanha: [Tentar novamente (primário), Estatísticas, Menu principal]. Ids: next|retry|stats|menu.
 * `campaignDoneKey`: chave i18n da mensagem de campanha concluída (ou null).
 */
export function missionEndActions(outcome, plan = null) {
  const won = outcome === 'victory';
  const camp = !!(plan && plan.inCampaign);
  const actions = [];
  if (camp && won && plan.hasNext) actions.push({ id: 'next', labelKey: 'campaign.end.next', primary: true });
  if (camp) actions.push({ id: 'retry', labelKey: won ? 'campaign.end.repeat' : 'campaign.end.tryAgain', primary: !(won && plan.hasNext) });
  else actions.push({ id: 'retry', labelKey: won ? 'mission.replay' : 'mission.retry', primary: true });
  actions.push({ id: 'stats', labelKey: 'mission.stats', primary: false }, { id: 'menu', labelKey: 'mission.menu', primary: false });
  return { actions, campaignDoneKey: camp && won && plan.campaignComplete && !plan.hasNext ? 'campaign.end.complete' : null };
}
