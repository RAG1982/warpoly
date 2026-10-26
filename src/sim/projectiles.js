import { fhypot, fsin } from './fmath.js';
/**
 * projectiles.js — F2-08: projéteis como DADOS de simulação (sem three.js/DOM).
 *
 * `Projectile` guarda só estado numérico (posição `pos`, posição do passo anterior `prev`, ponto de
 * mira `aim`, `spin`) e roda a lógica (progresso, acerto, callback de dano) em `simStep`. A malha
 * vive em `src/render/ProjectileViews.js`, que lê `gm.arrows` (lista legada; contém `Projectile`s) a
 * cada quadro e interpola `prev → pos` com o `alpha` do tick fixo (F1-09).
 *
 * Dois tipos:
 *  - homing (`'arrow'`, `'axe'`): persegue o alvo (rastreia `target.mesh.position + 1 u`), parábola de
 *    altura `min(4,5; dist × 0,25)`; ao chegar chama `onHit(target, damage, hitPos)`.
 *  - balístico (`'bolt'`, `'boulder'` — cerco, F4-02): voa até um ponto FIXO (previsto no disparo) numa parábola de
 *    pico `clamp(dist × 0,35; 2; 9)`; ao chegar chama `onImpact(impactPos)` (dano em área no chamador).
 */

/** Velocidade total (u/s) dos projéteis balísticos: a Balista atira mais rápido e mais raso. */
export const BALLISTIC_SPEED = { bolt: 22, boulder: 14, cannonball: 20 };
/** Velocidade (u/s) dos projéteis que perseguem o alvo. */
export const HOMING_SPEED = { arrow: 18, axe: 16, cannonball: 24 };

/** Tempo de voo (s) para uma distância 3D `dist` — usado também na previsão de mira. */
export function ballisticFlightTime(dist, kind) {
  return Math.max(0.3, dist / (BALLISTIC_SPEED[kind] || 14));
}

/** Altura do pico da parábola balística para a distância `dist`. */
export function ballisticPeak(dist) {
  return Math.min(9, Math.max(2, dist * 0.35));
}

const dist3 = (a, b) => fhypot(a.x - b.x, a.y - b.y, a.z - b.z);

export class Projectile {
  /**
   * @param {object} o
   * @param {'arrow'|'axe'|'bolt'|'boulder'} o.kind
   * @param {{x:number,y:number,z:number}} o.from  origem (copiada)
   * @param {{x:number,y:number,z:number}} [o.impact]  ponto fixo (balístico)
   * @param {object} [o.target]  alvo perseguido (homing): precisa de `mesh.position` e `hp`
   * @param {*} [o.damage]  repassado a `onHit`
   * @param {Function} o.onHit  homing: `(target, damage, hitPos)`; balístico: `(impactPos)`
   */
  constructor({ kind, from, impact = null, target = null, damage = null, onHit = null }) {
    this.kind = kind;
    this.homing = !!target && !impact;
    this.target = target;
    this.damage = damage;
    this.onHit = onHit;
    this.isDead = false;
    this.progress = 0;
    this.spin = 0;

    this.start = { x: from.x, y: from.y, z: from.z };
    this.pos = { x: from.x, y: from.y, z: from.z };
    this.prev = { x: from.x, y: from.y, z: from.z };
    this.aim = { x: from.x, y: from.y, z: from.z };

    if (this.homing) {
      const tp = target.mesh.position;
      this.end = { x: tp.x, y: tp.y, z: tp.z };
      this.dist = dist3(this.start, this.end);
      this.duration = Math.max(0.3, this.dist / (HOMING_SPEED[kind] || 18));
      this.arc = Math.min(4.5, this.dist * 0.25);
    } else {
      this.end = { x: impact.x, y: impact.y, z: impact.z };
      this.dist = dist3(this.start, this.end);
      this.duration = ballisticFlightTime(this.dist, kind);
      this.arc = ballisticPeak(this.dist);
    }
  }

  /** Ponto da trajetória em t ∈ [0,1] (escreve em `out`). */
  _pointAt(t, out) {
    const s = this.start;
    const e = this.end;
    out.x = s.x + (e.x - s.x) * t;
    out.y = s.y + (e.y - s.y) * t + fsin(t * Math.PI) * this.arc;
    out.z = s.z + (e.z - s.z) * t;
    return out;
  }

  /** Um passo de simulação de `delta` s (tick fixo). */
  simStep(delta) {
    if (this.isDead) return;
    this.prev.x = this.pos.x;
    this.prev.y = this.pos.y;
    this.prev.z = this.pos.z;

    this.progress += delta / this.duration;

    if (this.homing && this.target && this.target.mesh && this.target.hp > 0) {
      const tp = this.target.mesh.position;
      this.end.x = tp.x;
      this.end.y = tp.y + 1.0; // mira no tronco
      this.end.z = tp.z;
    }

    if (this.progress >= 1) {
      this.progress = 1;
      this._hit();
      return;
    }

    this._pointAt(this.progress, this.pos);
    this._pointAt(Math.min(1, this.progress + 0.05), this.aim);
    if (this.kind === 'axe') this.spin = this.progress * Math.PI * 8; // gira de ponta a ponta
    else if (this.kind === 'boulder') this.spin += delta * 6;
  }

  _hit() {
    this.isDead = true;
    if (this.homing) {
      // posição do último passo (como a antiga `Arrow`): o callback recebe de onde a flecha veio, não o alvo.
      if (this.onHit) this.onHit(this.target, this.damage, { x: this.pos.x, y: this.pos.y, z: this.pos.z });
    } else {
      this.pos.x = this.end.x;
      this.pos.y = this.end.y;
      this.pos.z = this.end.z;
      if (this.onHit) this.onHit(this.end);
    }
  }
}
