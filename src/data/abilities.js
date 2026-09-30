/**
 * abilities.js — F4-03: catálogo de habilidades ativas (magias) orientado a dados.
 *
 * Módulo puro (sem three.js/DOM). As unidades declaram em `src/data/units.js`
 * `maxMana`/`startMana`/`manaRegen`/`abilities: [ids]`; a lógica de lançamento vive em
 * `src/sim/abilities.js` e o comando é `CMD.CAST` (`src/sim/commands.js`).
 *
 * Schema de `ABILITIES[id]`:
 *   id            string (igual à chave)
 *   name          string | {human, orc}   nome PT-BR
 *   icon          string (caminho de imagem) ou emoji
 *   description   texto PT-BR do tooltip
 *   hotkey        letra mostrada/usada no card (ex.: 'Z')
 *   target        'none' | 'self' | 'unit' | 'ally' | 'enemy' | 'ground'
 *   range         alcance de lançamento (unidades do mapa; 0 = sem andar)
 *   castTime      segundos de animação até aplicar os efeitos
 *   manaCost      mana fixa debitada ao aplicar
 *   manaPerHp     (opcional) mana extra por PV curado (efeito `heal`)
 *   cooldown      recarga em segundos (por unidade)
 *   autocast      false (padrão) | true — suporta auto-cast (desligado por padrão, por unidade)
 *   requires      [ ... ] mesma sintaxe de `src/sim/requirements.js` (ids de construção, {hq:N}, {research,level}…)
 *   effects       [ {kind, ...} ] aplicados em ordem (ver abaixo)
 *   vfx           {kind:'burst'|'ring'|'beam'|'aura', color:'#rrggbb', radius?, duration?}
 *   debugOnly     (opcional) só existe com `?debug` na URL (ou `{debug:true}` nos testes)
 *
 * Tipos de efeito:
 *   {kind:'damage', amount, damageType='magic', radius?}  dano via `computeDamage` (1 RNG por alvo, ordem
 *        crescente de id); com `radius` atinge todos os hostis na área (`applySplashDamage`, queda 100→50 %).
 *   {kind:'heal', amount}  ou  {kind:'heal', perManaHp}  cura o alvo aliado (ou o lançador) até `maxHp`;
 *        com `manaPerHp` (na habilidade) cobra mana × PV curados; `perManaHp` = PV curados por mana gasta.
 *   {kind:'status', id, duration}  aplica um status de `STATUS_DEFS` (alvo, ou o lançador se não há alvo).
 *   {kind:'dispel'}  remove statuses removíveis do alvo (ou do lançador).
 *   {kind:'summon', unitType, count=1, lifetime}  (stub para F4-04) cria unidades temporárias ao lado do lançador.
 */

export const ABILITY_TARGETS = ['none', 'self', 'unit', 'ally', 'enemy', 'ground'];
export const EFFECT_KINDS = ['damage', 'heal', 'status', 'dispel', 'summon'];

export const ABILITIES = {
  debug_bolt: {
    id: 'debug_bolt',
    name: 'Raio de Teste',
    icon: '⚡',
    description: 'Habilidade de teste: causa dano mágico a um inimigo.',
    hotkey: 'Z',
    target: 'enemy',
    range: 12,
    castTime: 0.5,
    manaCost: 10,
    cooldown: 3,
    autocast: false,
    requires: [],
    effects: [{ kind: 'damage', amount: 30, damageType: 'magic' }],
    vfx: { kind: 'beam', color: '#60a5fa' },
    debugOnly: true
  },
  debug_heal: {
    id: 'debug_heal',
    name: 'Cura de Teste',
    icon: '✚',
    description: 'Habilidade de teste: cura um aliado.',
    hotkey: 'X',
    target: 'ally',
    range: 10,
    castTime: 0.5,
    manaCost: 5,
    cooldown: 2,
    autocast: true,
    requires: [],
    effects: [{ kind: 'heal', amount: 40 }],
    vfx: { kind: 'aura', color: '#4ade80', duration: 1 },
    debugOnly: true
  }
};

/** `?debug` na URL (só no navegador; em Node é sempre false). */
export function isDebugUrl() {
  try {
    return typeof location !== 'undefined' && /[?&]debug(=|&|$)/.test(location.search || '');
  } catch (e) {
    return false;
  }
}

/**
 * Definição da habilidade `id`, ou `null` se não existe (ou é `debugOnly` sem `debug`).
 * @param {string} id
 * @param {{debug?: boolean}} [opts]  `debug` explícito; padrão: `?debug` na URL.
 */
export function getAbility(id, opts = {}) {
  const def = ABILITIES[id];
  if (!def) return null;
  if (def.debugOnly) {
    const debug = opts.debug !== undefined ? opts.debug : isDebugUrl();
    if (!debug) return null;
  }
  return def;
}

/** Nome PT-BR da habilidade para a facção (`'human'|'orc'`). */
export function abilityName(def, factionId = 'human') {
  if (!def) return '';
  return typeof def.name === 'string' ? def.name : (def.name[factionId] || def.name.human);
}
