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
 *   {kind:'summon', unitType, count=1, lifetime}  cria unidades temporárias (F4-04) em anel de raio 1,5 ao redor do
 *        ponto-alvo (ou do lançador); `unit.lifetime` decrementa em `simStep`; não consomem suprimento e somem sem cadáver.
 *   {kind:'damage', ..., lifesteal}  (F4-04) `lifesteal` = fração do dano causado que cura o lançador (Toque da Morte).
 *   {kind:'line_damage', amount, damageType, length, maxTargets, radius, projectile}  (F4-04, Bola de Fogo) projétil
 *        balístico do lançador até o alvo; no impacto atinge até `maxTargets` hostis numa linha de `length` a partir do
 *        impacto, na direção do voo (distância à linha ≤ `radius`); 1 `computeDamage` por alvo em ordem de id.
 *   {kind:'polymorph', unitType:'sheep'}  (F4-04) o alvo (não herói/cerco/construção) vira `unitType` permanentemente
 *        (mantém dono e id; perde ordens/habilidades/mana; PV ≤ PV da nova unidade).
 *   {kind:'raise_dead', unitType, radius, maxCorpses, lifetime}  (F4-04) consome os cadáveres mais antigos em `radius`
 *        do lançador e cria 1 `unitType` temporário por cadáver (até `maxCorpses`). Sem cadáver = não lança.
 *   {kind:'channel', waves, interval, wave:{kind:'damage', amount, damageType, radius}}  (F4-04) canalização: o
 *        conjurador fica em `casting` por `waves × interval` s; cada onda cobra `manaCost` (por onda) e para se faltar
 *        mana; nova ordem cancela (onda paga não é reembolsada). Alvo `ground`.
 *
 *   {kind:'reveal', radius, duration}  (F4-04b, Vista Sagrada) revela a área (`FogOfWar.revealArea(x,z,r,ttl)`) ao
 *        dono por `duration` s; só tem efeito visível no jogador local (a névoa é de apresentação).
 *   {kind:'exorcism', manaPerHp}  (F4-04b) dano mágico SÓ contra `undead`: `min(PV do alvo, mana/manaPerHp)`; cobra
 *        `manaPerHp` por PV de dano. Alvo vivo → "Alvo inválido".
 *   {kind:'runes', count, radius, lifetime, triggerRadius, blastRadius, damage, maxActive}  (F4-04b) cria `count` runas
 *        num círculo de `radius` (ver `src/sim/hazards.js`).
 *   {kind:'whirlwind', duration, wander, retarget, dps, radius, speed}  (F4-04b) cria um redemoinho errante.
 *   campos opcionais da habilidade: `autocastDefault` (auto-cast já ligado), `autocastBelow` (só cura aliados abaixo
 *        dessa fração de PV), `repeat` (a conjuração se repete no mesmo alvo enquanto ele precisar e houver mana).
 *
 * Status de `STATUS_DEFS` usados: slow, haste, invisible, flameshield (Escudo de Chamas), unholy_armor (Armadura Profana).
 */

export const ABILITY_TARGETS = ['none', 'self', 'unit', 'ally', 'enemy', 'ground'];
export const EFFECT_KINDS = ['damage', 'heal', 'status', 'dispel', 'summon', 'line_damage', 'polymorph', 'raise_dead', 'channel', 'reveal', 'exorcism', 'runes', 'whirlwind'];

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
  },
  // ===== F4-04: magias do Mago Arcano (humano) — pesquisadas na Torre Arcana =====
  fireball: {
    id: 'fireball',
    name: 'Bola de Fogo',
    icon: '🔥',
    description: 'Lança uma bola de fogo que atravessa e queima até 3 inimigos em linha.',
    hotkey: 'Z',
    target: 'enemy',
    range: 14,
    castTime: 0.6,
    manaCost: 25,
    cooldown: 2,
    autocast: false,
    requires: [{ research: 'spell_fireball' }],
    effects: [{ kind: 'line_damage', amount: 45, damageType: 'magic', length: 4, maxTargets: 3, radius: 1.5, projectile: 'bolt' }],
    vfx: { kind: 'burst', color: '#fb923c' }
  },
  slow: {
    id: 'slow',
    name: 'Lentidão',
    icon: '🐌',
    description: 'Reduz pela metade a velocidade de um inimigo por 30 s.',
    hotkey: 'X',
    target: 'enemy',
    range: 12,
    castTime: 0.5,
    manaCost: 50,
    cooldown: 1,
    autocast: false,
    requires: [{ research: 'spell_slow' }],
    effects: [{ kind: 'status', id: 'slow', duration: 30 }],
    vfx: { kind: 'beam', color: '#38bdf8' }
  },
  flameshield: {
    id: 'flameshield',
    name: 'Escudo de Chamas',
    icon: '🛡️',
    description: 'Envolve um aliado em chamas por 30 s: quem o atacar corpo a corpo sofre 8 de dano mágico por golpe.',
    hotkey: 'C',
    target: 'ally',
    range: 10,
    castTime: 0.5,
    manaCost: 80,
    cooldown: 1,
    autocast: false,
    requires: [{ research: 'spell_flameshield' }],
    effects: [{ kind: 'status', id: 'flameshield', duration: 30 }],
    vfx: { kind: 'aura', color: '#f97316', duration: 1.2 }
  },
  invisibility: {
    id: 'invisibility',
    name: 'Invisibilidade',
    icon: '👻',
    description: 'Torna um aliado invisível até atacar, lançar ou sofrer dano. Inimigos só o veem de perto ou com detectores.',
    hotkey: 'V',
    target: 'ally',
    range: 10,
    castTime: 0.5,
    manaCost: 200,
    cooldown: 1,
    autocast: false,
    requires: [{ research: 'spell_invisibility' }],
    effects: [{ kind: 'status', id: 'invisible', duration: 600 }],
    vfx: { kind: 'aura', color: '#c4b5fd', duration: 1.2 }
  },
  polymorph: {
    id: 'polymorph',
    name: 'Transmutação',
    icon: '🐑',
    description: 'Transforma um inimigo (exceto heróis, cerco e construções) numa ovelha indefesa, para sempre.',
    hotkey: 'B',
    target: 'enemy',
    range: 10,
    castTime: 0.8,
    manaCost: 200,
    cooldown: 1,
    autocast: false,
    requires: [{ research: 'spell_polymorph' }],
    effects: [{ kind: 'polymorph', unitType: 'sheep' }],
    vfx: { kind: 'burst', color: '#f9a8d4' }
  },
  blizzard: {
    id: 'blizzard',
    name: 'Nevasca',
    icon: '❄️',
    description: 'Canaliza uma tempestade de gelo numa área: 8 ondas de dano mágico, 25 de mana por onda. Nova ordem interrompe.',
    hotkey: 'N',
    target: 'ground',
    range: 12,
    castTime: 0.6,
    manaCost: 25,
    cooldown: 4,
    autocast: false,
    requires: [{ research: 'spell_blizzard' }],
    effects: [{ kind: 'channel', waves: 8, interval: 1, wave: { kind: 'damage', amount: 8, damageType: 'magic', radius: 3.5 } }],
    vfx: { kind: 'ring', color: '#bae6fd', radius: 3.5 }
  },

  // ===== F4-04: magias do Necromante das Cinzas (orc) — pesquisadas no Santuário das Cinzas =====
  death_touch: {
    id: 'death_touch',
    name: 'Toque da Morte',
    icon: '💀',
    description: 'Drena a vida de um inimigo; o necromante recupera 50% do dano causado.',
    hotkey: 'Z',
    target: 'enemy',
    range: 9,
    castTime: 0.6,
    manaCost: 100,
    cooldown: 1,
    autocast: false,
    requires: [{ research: 'spell_death_touch' }],
    effects: [{ kind: 'damage', amount: 60, damageType: 'magic', lifesteal: 0.5 }],
    vfx: { kind: 'beam', color: '#a855f7' }
  },
  haste_spell: {
    id: 'haste_spell',
    name: 'Pressa',
    icon: '⚡',
    description: 'Acelera um aliado (movimento e ataque +50%) por 30 s.',
    hotkey: 'X',
    target: 'ally',
    range: 10,
    castTime: 0.5,
    manaCost: 50,
    cooldown: 1,
    autocast: false,
    requires: [{ research: 'spell_haste' }],
    effects: [{ kind: 'status', id: 'haste', duration: 30 }],
    vfx: { kind: 'aura', color: '#facc15', duration: 1 }
  },
  raise_dead: {
    id: 'raise_dead',
    name: 'Erguer Mortos',
    icon: '🦴',
    description: 'Consome até 2 cadáveres num raio de 6 e ergue 1 esqueleto por cadáver (dura 60 s).',
    hotkey: 'C',
    target: 'self',
    range: 0,
    castTime: 0.8,
    manaCost: 50,
    cooldown: 2,
    autocast: false,
    requires: [{ research: 'spell_raise_dead' }],
    effects: [{ kind: 'raise_dead', unitType: 'skeleton', radius: 6, maxCorpses: 2, lifetime: 60 }],
    vfx: { kind: 'ring', color: '#84cc16', radius: 3 }
  },
  unholy_armor: {
    id: 'unholy_armor',
    name: 'Armadura Profana',
    icon: '🛡️',
    description: 'Torna um aliado invulnerável por 6 s; ao final ele perde 50% da vida atual.',
    hotkey: 'V',
    target: 'ally',
    range: 10,
    castTime: 0.5,
    manaCost: 100,
    cooldown: 1,
    autocast: false,
    requires: [{ research: 'spell_unholy_armor' }],
    effects: [{ kind: 'status', id: 'unholy_armor', duration: 6 }],
    vfx: { kind: 'aura', color: '#7c3aed', duration: 1.2 }
  },
  ash_cloud: {
    id: 'ash_cloud',
    name: 'Nuvem de Cinzas',
    icon: '🌫️',
    description: 'Canaliza uma nuvem de cinzas numa área: 8 ondas de dano mágico, 25 de mana por onda. Nova ordem interrompe.',
    hotkey: 'B',
    target: 'ground',
    range: 12,
    castTime: 0.6,
    manaCost: 25,
    cooldown: 4,
    autocast: false,
    requires: [{ research: 'spell_ash_cloud' }],
    effects: [{ kind: 'channel', waves: 8, interval: 1, wave: { kind: 'damage', amount: 8, damageType: 'magic', radius: 3.5 } }],
    vfx: { kind: 'ring', color: '#9ca3af', radius: 3.5 }
  },

  // ===== F4-04b: Necromante — Redemoinho (Santuário das Cinzas) =====
  whirlwind: {
    id: 'whirlwind',
    name: 'Redemoinho',
    icon: '🌪️',
    description: 'Invoca um redemoinho que vaga por 12 s causando 12 de dano mágico por segundo a unidades terrestres (amigas também).',
    hotkey: 'N',
    target: 'ground',
    range: 10,
    castTime: 0.7,
    manaCost: 100,
    cooldown: 2,
    autocast: false,
    requires: [{ research: 'spell_whirlwind' }],
    effects: [{ kind: 'whirlwind', duration: 12, wander: 6, retarget: 2, dps: 12, radius: 2, speed: 3 }],
    vfx: { kind: 'ring', color: '#a8a29e', radius: 2 }
  },

  // ===== F4-04b: Templário (humano) — pesquisadas no Templo da Luz, exigem `cavalry_class` =====
  holy_vision: {
    id: 'holy_vision',
    name: 'Vista Sagrada',
    icon: '👁️',
    description: 'Revela uma área (raio 10) do mapa por 20 s, mostrando unidades e construções ali.',
    hotkey: 'Z',
    target: 'ground',
    range: 40,
    castTime: 0.6,
    manaCost: 70,
    cooldown: 2,
    autocast: false,
    requires: [{ research: 'spell_holy_vision' }],
    effects: [{ kind: 'reveal', radius: 10, duration: 20 }],
    vfx: { kind: 'ring', color: '#fde68a', radius: 10 }
  },
  heal: {
    id: 'heal',
    name: 'Cura',
    icon: '✚',
    description: 'Cura um aliado (5 PV por segundo, 6 de mana por PV) enquanto ele estiver ferido e houver mana. Auto-cast: cura aliados abaixo de 60% de PV.',
    hotkey: 'X',
    target: 'ally',
    range: 8,
    castTime: 1,
    manaCost: 0,
    manaPerHp: 6,
    cooldown: 0,
    autocast: true,
    autocastDefault: true,
    autocastBelow: 0.6,
    repeat: true,
    requires: [{ research: 'spell_heal' }],
    effects: [{ kind: 'heal', amount: 5 }],
    vfx: { kind: 'aura', color: '#4ade80', duration: 1 }
  },
  exorcism: {
    id: 'exorcism',
    name: 'Exorcismo',
    icon: '☀️',
    description: 'Fere só mortos-vivos: causa até o PV do alvo em dano mágico, 4 de mana por PV.',
    hotkey: 'C',
    target: 'enemy',
    range: 8,
    castTime: 0.6,
    manaCost: 0,
    manaPerHp: 4,
    cooldown: 1,
    autocast: false,
    requires: [{ research: 'spell_exorcism' }],
    effects: [{ kind: 'exorcism', manaPerHp: 4 }],
    vfx: { kind: 'beam', color: '#fef08a' }
  },

  // ===== F4-04b: Ogro Feiticeiro (orc) — pesquisadas no Altar das Tempestades, exigem `cavalry_class` =====
  eye_of_watch: {
    id: 'eye_of_watch',
    name: 'Olho Vigia',
    icon: '👁️',
    description: 'Invoca um olho voador (60 s): enxerga longe e revela unidades invisíveis. Imune a dano; controlável.',
    hotkey: 'Z',
    target: 'ground',
    range: 20,
    castTime: 0.6,
    manaCost: 70,
    cooldown: 2,
    autocast: false,
    requires: [{ research: 'spell_eye' }],
    effects: [{ kind: 'summon', unitType: 'watching_eye', count: 1, lifetime: 60 }],
    vfx: { kind: 'burst', color: '#a78bfa' }
  },
  bloodlust: {
    id: 'bloodlust',
    name: 'Sede de Batalha',
    icon: '🩸',
    description: 'Enfurece um aliado por 20 s: dano +50%, velocidade de ataque +50% e movimento +25%.',
    hotkey: 'X',
    target: 'ally',
    range: 10,
    castTime: 0.5,
    manaCost: 50,
    cooldown: 1,
    autocast: false,
    requires: [{ research: 'spell_bloodlust' }],
    effects: [{ kind: 'status', id: 'bloodlust', duration: 20 }],
    vfx: { kind: 'aura', color: '#ef4444', duration: 1 }
  },
  runes: {
    id: 'runes',
    name: 'Runas Explosivas',
    icon: '🔣',
    description: 'Espalha 6 runas (invisíveis para inimigos) num círculo; cada uma explode ao ser pisada (60 de dano mágico em área). Duram 60 s; máx. 12 ativas.',
    hotkey: 'C',
    target: 'ground',
    range: 10,
    castTime: 0.8,
    manaCost: 200,
    cooldown: 2,
    autocast: false,
    requires: [{ research: 'spell_runes' }],
    effects: [{ kind: 'runes', count: 6, radius: 2.5, lifetime: 60, triggerRadius: 1.2, blastRadius: 1.5, damage: 60, maxActive: 12 }],
    vfx: { kind: 'ring', color: '#c084fc', radius: 2.5 }
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
