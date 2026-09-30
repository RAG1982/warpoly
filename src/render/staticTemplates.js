import { mergeStaticTemplate } from './mergeStaticTemplate.js';

/**
 * F1-02 — Quais templates são mesclados e o que cada um preserva.
 *
 * Chave = chave do cache do ModelFactory (ou id do inspetor). Tipos ausentes (unidades, árvores,
 * flecha, seixos) NÃO são mesclados: unidades são animadas por partes pelo UnitAnimator (F1-03) e
 * árvores/grama/seixos do mapa já usam InstancedMesh.
 *
 * Levantamento dos nós acessados por nome (entities/buildings/**, Building.js, GLTFBuildingLoader):
 * - GreatHall.initCustomVFX: todo nó cujo nome contém "Banner" (gira os estandartes);
 * - OrcBarracks: `Anim_TrainingDummy` (pêndulo); OrcLumberMill: `Anim_SawBlade` (serra gira);
 * - HumanForge: filhos Cone dos grupos `FurnaceFlames` e `AnvilFlames` (chamas pulsam);
 * - GLTFBuildingLoader: prefixo `Anim_` (preservado por padrão em todos os tipos);
 * - OrcForge, OrcWatchtower, OrcHouse, PigFarm: VFX criados em tempo de execução sobre o clone
 *   (luzes, chamas, porcos) — nada do template é acessado por nome;
 * - BanditCamp: `userData.flame` (grupo de chamas com onBeforeRender) e `userData.fireLight`.
 *   As demais chaves do userData (tent, shelter, loot…) são só referências estruturais que
 *   nenhum código lê (e o `cloneModel` descarta o userData nos clones), por isso não travam a mescla.
 * Luzes pontuais dos modelos (lampiões, tochas, fogueira) nunca são mescladas.
 *
 * `mergeInside`: nós preservados que só se movem como um corpo rígido (a serra gira inteira, o
 * boneco balança inteiro, cada estandarte oscila inteiro) têm o conteúdo mesclado por material no
 * espaço do próprio nó — o nó continua existindo com o mesmo nome e a mesma transformação.
 */
export const STATIC_MERGE_CONFIG = {
  // Humanos
  castle: { keep: [] },
  barracks: { keep: [] },
  cottage: { keep: [] },
  farm: { keep: [] },
  lumber_camp: { keep: [] },
  watchtower: { keep: [] },
  forge: { keep: ['FurnaceFlames', 'AnvilFlames'] },
  stable: { keep: [] },
  ogre_den: { keep: [] },
  workshop: { keep: [] },
  orc_workshop: { keep: [] },
  // Orcs
  // Os 4 braseiros (fogo transparente) ficam em cantos distantes: mesclá-los não afeta a ordenação
  great_hall: {
    keep: [node => !!node.name && node.name.includes('Banner')],
    mergeInside: [/^Anim_WarBanner_\d+$/],
    mergeTransparent: true
  },
  orc_barracks: {
    keep: ['Anim_TrainingDummy', /^Anim_WarBanner/],
    mergeInside: ['Anim_TrainingDummy', /^Anim_WarBanner_\d+$/]
  },
  orc_lumber_mill: { keep: ['Anim_SawBlade'], mergeInside: ['Anim_SawBlade'] },
  orc_watchtower: { keep: [] },
  orc_house: { keep: [] },
  orc_forge: { keep: [] },
  pig_farm: { keep: [] },
  // Neutros / depósitos
  bandit_camp: { keep: [], userDataRefs: ['flame', 'fireLight'] },
  gold_mine: { keep: [] },
  stone_quarry: { keep: [] },
  // Decorações não instanciadas (ModelFactory; ids do inspetor em seguida)
  mushroom_stump: { keep: [] },
  water_lily: { keep: [] },
  grass_tuft: { keep: [] },
  flower_patch: { keep: [] },
  berry_bush: { keep: [] },
  boulder: { keep: [] }
};

const PREFIX_ALIASES = [
  ['flower_', 'flower_patch'],
  ['bush_', 'berry_bush'],
  ['boulder_', 'boulder']
];

/** Configuração de mescla para a chave, ou null se o tipo não deve ser mesclado. */
export function getStaticMergeConfig(key) {
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(STATIC_MERGE_CONFIG, key)) return STATIC_MERGE_CONFIG[key];
  for (const [prefix, alias] of PREFIX_ALIASES) {
    if (key.startsWith(prefix)) return STATIC_MERGE_CONFIG[alias];
  }
  return null;
}

let enabledOverride = null;

/** Flag global: `?merge=0` na URL desliga a mescla (para comparar). */
export function isStaticMergeEnabled() {
  if (enabledOverride !== null) return enabledOverride;
  try {
    const search = globalThis.location?.search;
    if (search) {
      const v = new URLSearchParams(search).get('merge');
      if (v !== null && ['0', 'false', 'off', 'no'].includes(v.toLowerCase())) return false;
    }
  } catch {
    // sem location (testes em Node): usa o padrão
  }
  return true;
}

/** Força liga/desliga (testes); `null` volta a ler a URL. */
export function setStaticMergeEnabled(value) {
  enabledOverride = value === null ? null : !!value;
}

/**
 * Ponto único de entrada: mescla o template recém-gerado se o tipo estiver configurado e a flag
 * estiver ligada. Retorna o próprio objeto (modificado ou não).
 * @param {string} key
 * @param {import('three').Object3D} template
 */
export function prepareStaticTemplate(key, template) {
  const config = getStaticMergeConfig(key);
  if (!config || !template || !isStaticMergeEnabled()) return template;
  mergeStaticTemplate(template, config);
  const stats = mergeStaticTemplate.lastStats;
  if (config.mergeInside) {
    const matchers = config.mergeInside.map(m => (m instanceof RegExp ? n => m.test(n.name || '') : n => n.name === m));
    const rigid = [];
    template.traverse(node => { if (node !== template && matchers.some(fn => fn(node))) rigid.push(node); });
    for (const node of rigid) {
      mergeStaticTemplate(node, { keepPrefixes: [], mergeTransparent: config.mergeTransparent });
      stats.mergedSources += mergeStaticTemplate.lastStats.mergedSources;
      stats.mergedMeshes += mergeStaticTemplate.lastStats.mergedMeshes;
    }
    stats.meshesAfter = 0;
    template.traverse(n => { if (n.isMesh) stats.meshesAfter++; });
  }
  mergeStaticTemplate.lastStats = stats;
  return template;
}
