/**
 * ParticleRing.js (F7-05) — pool circular de partículas em arrays tipados (SoA), SEM three e sem alocação por
 * spawn/frame. É o "lado CPU" das partículas GPU: cada partícula é escrita uma vez ao nascer; a trajetória
 * (balística, queda com chão, fade) é calculada no vertex shader a partir de `uTime`.
 *
 * Layout por partícula i:
 *   start[3i..]  posição inicial        vel[3i..]  velocidade inicial
 *   par[4i..]    t0 (nascimento, s de render; futuro = atraso), vida, tamanho, gravidade (negativa = flutua)
 *   cg[4i..]     r, g, b (linear), y do chão
 * Ao lotar, o slot mais antigo é reciclado (teto fixo configurável).
 */
export class ParticleRing {
  /** @param {number} cap teto de partículas simultâneas (0 = pool desligado) */
  constructor(cap) {
    this.cap = Math.max(0, cap | 0);
    this.start = new Float32Array(this.cap * 3);
    this.vel = new Float32Array(this.cap * 3);
    this.par = new Float32Array(this.cap * 4);
    this.cg = new Float32Array(this.cap * 4);
    this.head = 0;
    /** quantos slots já foram escritos alguma vez (usado como `instanceCount`) */
    this.used = 0;
    /** mudou desde o último upload para a GPU */
    this.dirty = false;
    this.totalSpawned = 0;
  }

  /** Escreve uma partícula; devolve o índice usado (ou -1 se o pool tem teto 0). Sem alocação. */
  spawn(t0, life, size, gravity, px, py, pz, vx, vy, vz, r, g, b, ground) {
    if (this.cap === 0) return -1;
    const i = this.head;
    this.head = i + 1 === this.cap ? 0 : i + 1;
    if (this.used < this.cap) this.used++;
    const j3 = i * 3, j4 = i * 4;
    this.start[j3] = px; this.start[j3 + 1] = py; this.start[j3 + 2] = pz;
    this.vel[j3] = vx; this.vel[j3 + 1] = vy; this.vel[j3 + 2] = vz;
    this.par[j4] = t0; this.par[j4 + 1] = life; this.par[j4 + 2] = size; this.par[j4 + 3] = gravity;
    this.cg[j4] = r; this.cg[j4 + 1] = g; this.cg[j4 + 2] = b; this.cg[j4 + 3] = ground;
    this.dirty = true;
    this.totalSpawned++;
    return i;
  }

  /** Partículas vivas (incluindo as com atraso ainda não nascidas) no tempo `now`. */
  aliveCount(now) {
    let n = 0;
    for (let i = 0; i < this.used; i++) {
      const t0 = this.par[i * 4], life = this.par[i * 4 + 1];
      if (life > 0 && now <= t0 + life) n++;
    }
    return n;
  }

  /** Desloca todos os nascimentos (evita perda de precisão de float no shader em partidas longas). */
  rebase(delta) {
    for (let i = 0; i < this.used; i++) this.par[i * 4] -= delta;
    this.dirty = true;
  }

  clear() {
    this.par.fill(0);
    this.head = 0;
    this.used = 0;
    this.dirty = true;
  }
}
