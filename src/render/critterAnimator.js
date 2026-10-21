/**
 * M2-13: animação do javali `.glb` (`critter_boar`): andar, pastar, correr e tombado. Não usa clipes do glTF: gira os nós simples
 * do modelo (`Body`, `Head`, `Leg_FL/FR/BL/BR`; pivôs em `docs/reference/art-p0-javali.md` §4). Amplitudes testadas em
 * `critter_boar_poses.png` (rotation.x > 0 leva o pé para trás e baixa o focinho). Só visual: não toca a simulação.
 *
 * Estados: `idle` (alterna pastar e cabeça erguida), `graze` (só pastar), `walk`, `run`, `dead`.
 */
const CLAMP01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Alvos por estado: amplitude das pernas (rad), frequência (rad/s), pitch de Head/Body, bote vertical (m), modo galope. */
const POSE = {
  idle: { amp: 0, freq: 0, head: 0, body: 0, bob: 0, bound: 0 },
  graze: { amp: 0, freq: 0, head: 0.95, body: 0.03, bob: 0, bound: 0 },
  walk: { amp: 0.45, freq: 6.5, head: 0, body: 0, bob: 0.012, bound: 0 },
  run: { amp: 0.8, freq: 13, head: -0.12, body: 0.08, bob: 0.03, bound: 1 },
  dead: { amp: 0, freq: 0, head: 0.35, body: 0, bob: 0, bound: 0 }
};

export const CRITTER_ANIM_STATES = Object.freeze(Object.keys(POSE));

export class CritterAnimator {
  /** @param {import('three').Object3D} root raiz do `critter_boar` (clone) @param {number} [seed] fase inicial (0..1) */
  constructor(root, seed = 0) {
    const get = n => root.getObjectByName(n) || null;
    this.body = get('Body');
    this.head = get('Head');
    this.legs = { fl: get('Leg_FL'), fr: get('Leg_FR'), bl: get('Leg_BL'), br: get('Leg_BR') };
    this.valid = !!(this.body && this.head && this.legs.fl && this.legs.fr && this.legs.bl && this.legs.br);
    this.baseBodyY = this.body ? this.body.position.y : 0;
    this.state = 'idle';
    this.phase = seed * Math.PI * 2;
    this.idleClock = seed * 7;
    // Valores suavizados (evita saltos de pose ao trocar de estado).
    this.cur = { amp: 0, freq: 0, head: 0, body: 0, bob: 0, bound: 0 };
  }

  /** @param {'idle'|'graze'|'walk'|'run'|'dead'} state */
  setState(state) {
    this.state = POSE[state] ? state : 'idle';
  }

  /** Pose de repouso fixa (nós zerados); `update` passa a não fazer nada. Usado pela baseline visual do inspetor. */
  freeze() {
    this.frozen = true;
    if (!this.valid) return;
    for (const l of Object.values(this.legs)) l.rotation.x = 0;
    this.head.rotation.x = 0;
    this.body.rotation.x = 0;
    this.body.position.y = this.baseBodyY;
  }

  update(dt) {
    if (!this.valid || this.frozen) return;
    dt = Math.min(Math.max(dt, 0), 0.1);
    let target = POSE[this.state];
    let grazing = this.state === 'graze';
    if (this.state === 'idle') {
      // Ciclo de 6 s: 3,2 s com o focinho no chão (com mordidas leves) e 2,8 s de cabeça erguida.
      this.idleClock += dt;
      grazing = this.idleClock % 6 < 3.2;
      target = grazing ? POSE.graze : POSE.idle;
    } else if (grazing) {
      this.idleClock += dt;
    }
    const k = CLAMP01(1 - Math.exp(-dt * (this.state === 'dead' ? 14 : 8)));
    const c = this.cur;
    for (const key of Object.keys(c)) c[key] += (target[key] - c[key]) * k;
    this.phase += dt * c.freq;

    const s = Math.sin(this.phase);
    const legs = this.legs;
    if (c.bound > 0.5) {
      // Galope: dianteiras e traseiras em oposição, com leve defasagem entre as do mesmo par.
      legs.fl.rotation.x = -c.amp * s;
      legs.fr.rotation.x = -c.amp * 0.85 * Math.sin(this.phase + 0.5);
      legs.bl.rotation.x = c.amp * Math.sin(this.phase + 0.3);
      legs.br.rotation.x = c.amp * 0.85 * Math.sin(this.phase + 0.8);
    } else {
      // Passo em diagonais (FL+BR contra FR+BL).
      legs.fl.rotation.x = c.amp * s;
      legs.br.rotation.x = c.amp * s;
      legs.fr.rotation.x = -c.amp * s;
      legs.bl.rotation.x = -c.amp * s;
    }
    if (this.state === 'dead') {
      // Pernas esticadas para fora quando tombado.
      for (const l of Object.values(legs)) l.rotation.x += (0.35 - l.rotation.x) * k;
    }
    const nibble = grazing ? Math.sin(this.idleClock * 5.5) * 0.05 * CLAMP01(c.head) : 0;
    this.head.rotation.x = c.head + nibble + (c.amp ? 0.05 * Math.sin(this.phase * 2) : 0);
    this.body.rotation.x = c.body + (c.amp ? 0.02 * Math.sin(this.phase * 2) : 0);
    this.body.position.y = this.baseBodyY + c.bob * Math.abs(Math.sin(this.phase));
  }
}
