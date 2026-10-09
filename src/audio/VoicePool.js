/**
 * VoicePool.js (F7-08) — limite de vozes simultâneas (efeitos) com PRIORIDADE. Lógica pura, sem Web Audio: o tempo
 * entra como parâmetro (`now`, em segundos), então é testável em Node e não precisa de timers (voz expirada é
 * recolhida na próxima requisição).
 *
 * Regras de `request`:
 *  1. `minGap[key]`: mesmo som não recomeça antes de N segundos (evita "metralhadora" idêntica de muitos golpes).
 *  2. `perKey[key]`: teto de vozes simultâneas do mesmo som; no teto, o novo só entra roubando uma voz mais fraca.
 *  3. Teto global (`max`): com tudo ocupado, o novo só entra se "vencer" a voz mais fraca ativa.
 *  "Mais fraca" = menor prioridade, depois menor volume (ganho já atenuado pela distância), depois a mais antiga.
 *  Vence quem tem prioridade maior, ou prioridade igual e volume não menor (som próximo vence o distante; o mais novo
 *  vence o mais velho em empate). Quem perde some sem criar nó nenhum.
 */
export class VoicePool {
  /**
   * @param {{max?:number, perKey?:Record<string,number>, minGap?:Record<string,number>}} [opts]
   */
  constructor({ max = 16, perKey = {}, minGap = {} } = {}) {
    this.max = max;
    this.perKey = perKey;
    this.minGap = minGap;
    /** @type {{id:number,key:string,priority:number,loudness:number,start:number,end:number}[]} */
    this.voices = [];
    this._lastStart = new Map();
    this._nextId = 1;
    this.stats = { granted: 0, denied: 0, evicted: 0, deniedByReason: { off: 0, gap: 0, key: 0, full: 0 } };
  }

  /** Muda o teto; se já há mais vozes que o novo teto, tira as mais fracas e devolve os ids para o chamador parar. */
  setMax(n) {
    this.max = Math.max(0, n | 0);
    const out = [];
    while (this.voices.length > this.max) {
      const v = this._weakest(this.voices);
      this._remove(v);
      out.push(v.id);
    }
    return out;
  }

  /** Remove as vozes que já terminaram. */
  purge(now) {
    const v = this.voices;
    let w = 0;
    for (let i = 0; i < v.length; i++) if (v[i].end > now) v[w++] = v[i];
    v.length = w;
  }

  /** Vozes ativas em `now`. */
  count(now) {
    this.purge(now);
    return this.voices.length;
  }

  static _weaker(a, b) {
    if (a.priority !== b.priority) return a.priority < b.priority;
    if (a.loudness !== b.loudness) return a.loudness < b.loudness;
    return a.id < b.id;
  }

  _weakest(list) {
    let w = null;
    for (let i = 0; i < list.length; i++) if (!w || VoicePool._weaker(list[i], w)) w = list[i];
    return w;
  }

  static _outranks(spec, v) {
    return spec.priority > v.priority || (spec.priority === v.priority && spec.loudness >= v.loudness);
  }

  _deny(reason) {
    this.stats.denied++;
    this.stats.deniedByReason[reason]++;
    return { ok: false, id: 0, evicted: 0, reason };
  }

  /**
   * @param {{key:string, priority?:number, loudness?:number, duration?:number}} spec
   * @param {number} now  segundos (relógio do áudio)
   * @returns {{ok:boolean, id:number, evicted:number, reason?:string}}  `evicted` = id da voz roubada (0 = nenhuma)
   */
  request(spec, now) {
    const key = spec.key;
    const priority = spec.priority ?? 1;
    const loudness = spec.loudness ?? 1;
    const duration = spec.duration ?? 0.3;
    this.purge(now);
    if (!(this.max > 0)) return this._deny('off');

    const gap = this.minGap[key];
    if (gap) {
      const last = this._lastStart.get(key);
      if (last !== undefined && now - last < gap) return this._deny('gap');
    }

    const probe = { priority, loudness };
    let evicted = 0;
    const cap = this.perKey[key];
    if (cap !== undefined) {
      const same = this.voices.filter(v => v.key === key);
      if (same.length >= cap) {
        const victim = this._weakest(same);
        if (!victim || !VoicePool._outranks(probe, victim)) return this._deny('key');
        this._remove(victim);
        evicted = victim.id;
      }
    }
    if (this.voices.length >= this.max) {
      // (Se o teto de chave acabou de roubar uma voz, a vaga já está livre e este ramo não roda: length <= max.)
      const victim = this._weakest(this.voices);
      if (!victim || !VoicePool._outranks(probe, victim)) return this._deny('full');
      this._remove(victim);
      evicted = victim.id;
    }

    const id = this._nextId++;
    this.voices.push({ id, key, priority, loudness, start: now, end: now + Math.max(0.01, duration) });
    this._lastStart.set(key, now);
    this.stats.granted++;
    if (evicted) this.stats.evicted++;
    return { ok: true, id, evicted };
  }

  _remove(v) {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  /** Libera uma voz antes do fim previsto (ex.: parada por roubo). */
  release(id) {
    const i = this.voices.findIndex(v => v.id === id);
    if (i >= 0) this.voices.splice(i, 1);
  }

  clear() {
    this.voices.length = 0;
    this._lastStart.clear();
  }
}
