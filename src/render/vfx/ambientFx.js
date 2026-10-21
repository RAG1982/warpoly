/**
 * ambientFx.js (M2-18 · ART-11) — efeitos AMBIENTAIS por bioma, escritos nos mesmos três pools da `VfxLayer` (nenhum draw call novo):
 *   deserto/estepe  poeira levada pelo vento (smoke)           vulcânico/lava  cinzas (solid) e brasas subindo (glow)
 *   fumarola        coluna de vapor (smoke)                    neve/gelo       nevasca leve (solid, caindo inclinada)
 *   lava            vapor (smoke), brasas (glow) e halos de luz quente (glow, entram no bloom)
 * Só quality ≥ med (a fachada decide; `off`/`low` nem criam esta classe), nunca em headless. 100% apresentação: RNG de render,
 * nada toca a sim nem o checksum. Os efeitos nascem em volta do ALVO DA CÂMERA (raio `AMBIENT_RADIUS`), então o custo é fixo:
 * uma taxa por segundo (× densidade do nível) e partículas de vida curta; sem varredura do mapa por quadro.
 */
import { BIOME } from '../../data/maps/biome.js';
import { LAVA_STYLE } from '../../data/lavaRender.js';
import { createRenderRng } from './vfxConfig.js';
import { rgb } from './vfxEmitters.js';

/** Raio (u) em volta do alvo da câmera em que os efeitos nascem (a tela de jogo cobre ~±35 u). */
export const AMBIENT_RADIUS = 34;

/** Vento (u/s) que leva poeira, cinzas e neve: constante, só um sotaque visual. */
const WIND = Object.freeze({ x: 1.7, z: 0.6 });

/** Taxas-base (partículas por segundo, com densidade 1) de cada efeito. */
export const AMBIENT_RATES = Object.freeze({
  dust: 16, ash: 14, ember: 10, snow: 38, steam: 4, lavaSteam: 14, lavaEmber: 16, lavaHalo: 1.4
});

const COL = {
  dust: rgb('#e0cfa6'), ash: rgb('#4a4644'), ashLight: rgb('#7a7470'), ember: rgb('#ff8a2a'), fire: rgb('#ffc24a'),
  snow: rgb('#f4f8ff'), steam: rgb('#e6e2dc'), lavaSteam: rgb('#d8c4b6'), halo: rgb('#ff5a14').map((v) => v * 0.55)
};
const SIZE_SCALE = { solid: 1.5, smoke: 1.5, glow: 2.2 }; // o mesmo de vfxEmitters.put

const DUST_BIOMES = new Set([BIOME.DESERT, BIOME.STEPPE]);
const ASH_BIOMES = new Set([BIOME.VOLCANIC, BIOME.LAVA]);
const SNOW_BIOMES = new Set([BIOME.SNOW, BIOME.ICE]);

/** Quais efeitos o mapa pode ter: de acordo com os biomas presentes, a lava e as fumarolas. */
export function ambientKinds({ biomes = new Set(), hasLava = false, fumaroles = 0 } = {}) {
  const has = (set) => [...set].some((b) => biomes.has(b));
  return {
    dust: has(DUST_BIOMES),
    ash: has(ASH_BIOMES),
    snow: has(SNOW_BIOMES),
    lava: !!hasLava,
    steam: fumaroles > 0
  };
}

export class AmbientFx {
  /**
   * @param {import('./VfxLayer.js').VfxLayer} layer  pools de partículas (nível med/high)
   * @param {{terrain:object, regions?:object|null, lava?:object|null, fumaroles?:Array<{x:number,y:number,z:number}>, biomes?:Set<number>}} o
   */
  constructor(layer, { terrain, regions = null, lava = null, fumaroles = [], biomes = new Set() }) {
    this.layer = layer;
    this.terrain = terrain;
    this.regions = regions;
    this.lava = lava;
    this.fumaroles = fumaroles;
    this.kinds = ambientKinds({ biomes, hasLava: !!lava, fumaroles: fumaroles.length });
    this.rng = createRenderRng(0x3a91c7);
    this._acc = {};
    const mapDef = terrain && terrain.mapDef;
    this.half = Math.max(8, ((mapDef && (mapDef.playable || mapDef.size)) || 140) / 2 - 3);
  }

  /** Algum efeito se aplica a este mapa? (a sessão só cria o objeto se sim) */
  get active() {
    const k = this.kinds;
    return k.dust || k.ash || k.snow || k.lava || k.steam;
  }

  /** Quantas partículas nascem neste quadro para `kind` (acumulador por tipo; densidade do nível aplicada). */
  _count(kind, rate, delta) {
    const a = (this._acc[kind] || 0) + rate * this.layer.density * delta;
    const n = Math.floor(a);
    this._acc[kind] = a - n;
    return n;
  }

  /** Ponto aleatório em disco de raio `AMBIENT_RADIUS` em volta de (cx, cz), dentro do mapa, que satisfaz `ok(x, z, h)`; `null` se nenhuma tentativa serviu. */
  _pick(cx, cz, ok, tries = 6) {
    const rng = this.rng;
    for (let i = 0; i < tries; i++) {
      const a = rng() * 6.283, r = Math.sqrt(rng()) * AMBIENT_RADIUS;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (Math.abs(x) > this.half || Math.abs(z) > this.half) continue;
      const h = this.terrain.getHeight(x, z);
      if (ok(x, z, h)) return { x, y: h, z };
    }
    return null;
  }

  _biomeOf(x, z) {
    return this.regions ? this.regions.biomeAt(x, z) : null;
  }

  _put(kind, life, size, g, p, vx, vy, vz, col, oy = 0) {
    const L = this.layer[kind];
    L.ring.spawn(this.layer.time, life, size * SIZE_SCALE[kind], g, p.x, p.y + oy, p.z, vx, vy, vz, col[0], col[1], col[2], p.y);
  }

  /**
   * Gera os efeitos do quadro.
   * @param {number} delta  s de render
   * @param {{x:number, z:number}} target  alvo da câmera (centro da área com efeitos)
   */
  update(delta, target) {
    if (!this.layer.enabled || !target) return;
    delta = Math.min(delta, 0.1);
    const rng = this.rng, k = this.kinds, cx = target.x, cz = target.z;

    if (k.dust) {
      for (let n = this._count('dust', AMBIENT_RATES.dust, delta); n > 0; n--) {
        const p = this._pick(cx, cz, (x, z, h) => h > 0.8 && DUST_BIOMES.has(this._biomeOf(x, z)));
        if (p) this._put('smoke', rng.range(2.8, 4.4), rng.range(1.5, 2.6), -0.02, p, WIND.x * rng.range(1.2, 2.2), rng.range(0.05, 0.25), WIND.z * rng.range(0.6, 2), COL.dust, 0.25);
      }
    }
    if (k.ash) {
      const ok = (x, z, h) => h > 0.8 && ASH_BIOMES.has(this._biomeOf(x, z));
      for (let n = this._count('ash', AMBIENT_RATES.ash, delta); n > 0; n--) {
        const p = this._pick(cx, cz, ok);
        if (p) this._put('solid', rng.range(5, 8), rng.range(0.08, 0.14), 0.03, p, WIND.x * rng.range(0.4, 1.0), rng.range(-0.55, -0.3), WIND.z * rng.range(0.3, 0.9), rng() < 0.7 ? COL.ash : COL.ashLight, rng.range(4.5, 8));
      }
      for (let n = this._count('ember', AMBIENT_RATES.ember, delta); n > 0; n--) {
        const p = this._pick(cx, cz, ok);
        if (p) this._put('glow', rng.range(2.2, 3.8), rng.range(0.09, 0.16), -0.3, p, WIND.x * rng.range(0.3, 0.8), rng.range(0.9, 1.8), WIND.z * rng.range(0.2, 0.6), rng() < 0.6 ? COL.ember : COL.fire, rng.range(0.2, 0.8));
      }
    }
    if (k.snow) {
      for (let n = this._count('snow', AMBIENT_RATES.snow, delta); n > 0; n--) {
        const p = this._pick(cx, cz, (x, z, h) => h > 0.6 && SNOW_BIOMES.has(this._biomeOf(x, z)));
        if (p) this._put('solid', rng.range(4.2, 6.2), rng.range(0.07, 0.12), 0.02, p, WIND.x * rng.range(0.5, 1.1), rng.range(-1.5, -1.0), WIND.z * rng.range(0.2, 0.7), COL.snow, rng.range(5, 7.5));
      }
    }
    if (k.steam) {
      const near = this.fumaroles.filter((f) => Math.hypot(f.x - cx, f.z - cz) < AMBIENT_RADIUS + 6);
      if (near.length) {
        for (let n = this._count('steam', AMBIENT_RATES.steam * near.length, delta); n > 0; n--) {
          const f = near[Math.floor(rng() * near.length)];
          this._put('smoke', rng.range(2.6, 3.8), rng.range(1.1, 1.8), -0.12,
            { x: f.x + rng.signed(0.18), y: f.y, z: f.z + rng.signed(0.18) }, WIND.x * 0.45 + rng.signed(0.12), rng.range(1.0, 1.7), WIND.z * 0.45 + rng.signed(0.12), COL.steam, 0.9);
        }
      }
    }
    if (k.lava) {
      const lava = this.lava, y = LAVA_STYLE.surfaceY;
      const ok = (x, z) => lava.isLavaAt(x, z);
      const at = (p) => ({ x: p.x, y, z: p.z });
      for (let n = this._count('lavaSteam', AMBIENT_RATES.lavaSteam, delta); n > 0; n--) {
        const p = this._pick(cx, cz, ok, 10);
        if (p) this._put('smoke', rng.range(2.6, 4.0), rng.range(1.3, 2.2), -0.1, at(p), WIND.x * 0.4 + rng.signed(0.1), rng.range(1.0, 1.8), WIND.z * 0.4 + rng.signed(0.1), COL.lavaSteam, 0.15);
      }
      for (let n = this._count('lavaEmber', AMBIENT_RATES.lavaEmber, delta); n > 0; n--) {
        const p = this._pick(cx, cz, ok, 10);
        if (p) this._put('glow', rng.range(1.4, 2.8), rng.range(0.12, 0.2), -0.4, at(p), rng.signed(0.4), rng.range(1.6, 3.4), rng.signed(0.4), rng() < 0.5 ? COL.ember : COL.fire, 0.2);
      }
      for (let n = this._count('lavaHalo', AMBIENT_RATES.lavaHalo, delta); n > 0; n--) { // "luz" da lava: halo grande e fraco (entra no bloom)
        const p = this._pick(cx, cz, ok, 10);
        if (p) this._put('glow', rng.range(2.2, 3.4), rng.range(1.5, 2.4), 0, at(p), 0, 0.05, 0, COL.halo, 0.35);
      }
    }
  }

  /**
   * Pontos (x, z) para a câmera olhar os efeitos (capturas): fumarolas, lava e um ponto de cada bioma de efeito presente.
   * Determinístico (varre o mapa em passo de 4 u na ordem fixa).
   */
  focusPoints(max = 3) {
    const out = [];
    const f = this.fumaroles;
    if (f.length) out.push([f[0].x, f[0].z]);
    const want = [];
    if (this.kinds.lava) want.push((x, z) => this.lava.isLavaAt(x, z));
    if (this.kinds.ash) want.push((x, z, h) => h > 0.8 && ASH_BIOMES.has(this._biomeOf(x, z)));
    if (this.kinds.dust) want.push((x, z, h) => h > 0.8 && DUST_BIOMES.has(this._biomeOf(x, z)));
    if (this.kinds.snow) want.push((x, z, h) => h > 0.6 && SNOW_BIOMES.has(this._biomeOf(x, z)));
    for (const test of want) {
      const hits = [];
      for (let x = -this.half; x <= this.half; x += 4) for (let z = -this.half; z <= this.half; z += 4) if (test(x, z, this.terrain.getHeight(x, z))) hits.push([x, z]);
      if (hits.length) out.push(hits[Math.floor(hits.length / 2)]);
    }
    return out.slice(0, max);
  }
}
