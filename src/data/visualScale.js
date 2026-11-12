/**
 * visualScale.js — escala de RENDER por tipo de unidade (só apresentação; não entra na simulação nem no checksum).
 *
 * Os .glb orcs das unidades-base saíram do Blender maiores que os humanos equivalentes. Em vez de editar os .glb,
 * multiplicamos a escala do modelo (`Unit.mesh.scale`, ver `Unit.js`) para a ALTURA FINAL (bounding box Y) igualar a da
 * contraparte humana. Ogros, cerco e demais unidades ficam como estão (maiores por design de gameplay).
 *
 * Alturas medidas nos .glb (raiz em y = 0; `tools/lib/glbBounds.mjs`, teste em `tests/unit/orcVisualScale.test.js`):
 *   villager 1.946 · peon 2.285 · knight 2.074 · grunt 2.832 · archer 1.974 · axethrower 2.743
 * Fator do peon = altura do villager ÷ altura do peon, arredondado a 4 casas (erro final ≤ 0,05 %).
 * Grunt e axethrower NÃO igualam o humano: decisão do dono (2026-11-12) — as unidades militares orcs têm de parecer pelo menos tão
 * grandes quanto o peon (a altura medida inclui o machado erguido e os chifres, então o corpo aparece menor que a caixa). Fatores
 * 0,93 / 0,95 deixam a caixa ≈ 1,35× a do peon.
 *
 * `collisionRadius` e `healthBarHeight` (src/data/units.js) NÃO derivam desta escala: o raio é regra de simulação
 * (peon = villager = 0,66; grunt 0,86 × knight 0,84; axethrower = archer = 0,66) e a barra de vida já é igual entre as
 * contrapartes (3,1 / 3,9 / 3,4); por isso não foram alterados.
 */
export const VISUAL_SCALE = Object.freeze({
  peon: 0.8516,
  grunt: 0.93,
  axethrower: 0.95
});

/** Contraparte humana usada para igualar a altura (documentação + teste). */
export const VISUAL_SCALE_REFERENCE = Object.freeze({
  peon: 'villager',
  grunt: 'knight',
  axethrower: 'archer'
});

/** Multiplicador visual do tipo (1 = sem ajuste). */
export const visualScaleOf = (type) => VISUAL_SCALE[type] || 1;
