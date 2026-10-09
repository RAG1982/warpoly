/**
 * bloomTag.js (F7-03) — "seleção" do bloom: o brilho é por limiar em HDR (o EffectComposer usa HalfFloat), então só entra
 * no bloom o que passa de ~1,15 de luminância linear. Superfícies iluminadas ficam abaixo disso; fogo/magia/brasa não.
 * Este módulo eleva (uma vez por material) emissivos FORTES sem mapa de emissão e materiais aditivos, para ultrapassarem o limiar.
 * Ao desligar o bloom, `restore()` devolve os valores originais.
 *
 * Convenção para quem cria VFX (F7-05): material com `userData.bloom = true` é elevado mesmo se o emissivo for fraco;
 * `userData.noBloom = true` exclui.
 */
import * as THREE from 'three';

/** Luminância-alvo (linear) do emissivo elevado. */
export const BLOOM_TARGET = 1.9;
/** Emissivo (intensidade × luminância) abaixo disso é "decoração", não fogo: não entra. */
export const BLOOM_MIN_EMISSIVE = 0.3;
const MAX_FACTOR = 3.5;

/** Fator de elevação para um emissivo de luminância `luma` (0 = não elevar). Pura. */
export function boostFactor(luma, forced = false) {
  if (!(luma > 0)) return 0;
  if (!forced && luma < BLOOM_MIN_EMISSIVE) return 0;
  if (luma >= BLOOM_TARGET) return 0;
  return Math.min(MAX_FACTOR, BLOOM_TARGET / luma);
}

const lumaOf = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export class BloomTagger {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this._seen = new WeakSet();
    this._boosted = []; // { m, kind, orig }
    this._active = false;
    this._frame = 0;
  }

  /** Ativa/desativa; ao desativar restaura os materiais. */
  setActive(on) {
    if (on === this._active) return;
    this._active = on;
    if (on) { this._seen = new WeakSet(); this.scan(); } else this.restore();
  }

  /** Chame por frame: varre filhos novos da cena a cada ~20 quadros (barato: um `WeakSet.has` por filho). */
  tick() {
    if (!this._active) return;
    if (++this._frame % 20 === 0) this.scan();
  }

  scan() {
    const ch = this.scene.children;
    for (let i = 0; i < ch.length; i++) {
      const o = ch[i];
      if (this._seen.has(o)) continue;
      this._seen.add(o);
      o.traverse((n) => {
        const mats = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : null;
        if (mats) for (const m of mats) this._tag(m);
      });
    }
  }

  _tag(m) {
    if (!m || m.userData.bloomBoost || m.userData.noBloom) return;
    const forced = !!m.userData.bloom;
    if (m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial || m.isMeshPhysicalMaterial) {
      if (m.emissiveMap) return; // janelas/texturas de emissão: não brilham de dia
      const f = boostFactor(lumaOf(m.emissive) * m.emissiveIntensity, forced);
      if (f > 1) {
        m.userData.bloomBoost = { kind: 'emissive', orig: m.emissiveIntensity };
        m.emissiveIntensity *= f;
        this._boosted.push(m);
      }
    } else if ((m.isMeshBasicMaterial || m.isPointsMaterial || m.isSpriteMaterial) && m.blending === THREE.AdditiveBlending && !m.map) {
      const f = boostFactor(lumaOf(m.color), true);
      if (f > 1) {
        m.userData.bloomBoost = { kind: 'color', orig: m.color.clone() };
        m.color.multiplyScalar(Math.min(f, 2));
        this._boosted.push(m);
      }
    }
  }

  restore() {
    for (const m of this._boosted) {
      const b = m.userData.bloomBoost;
      if (!b) continue;
      if (b.kind === 'emissive') m.emissiveIntensity = b.orig; else m.color.copy(b.orig);
      delete m.userData.bloomBoost;
    }
    this._boosted.length = 0;
  }
}
