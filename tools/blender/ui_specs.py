"""
ui_specs.py (F7-09) — tabelas de ícones/retratos: o que é renderizado, de qual .glb (ou glifo) e com qual câmera.

Ids (= nome do arquivo, sem extensão, em public/ui/icons/<tamanho>/):
  unit_<tipo>        tipo = chave de src/data/units.js (ou variante de facção: unit_tanker_orc)
  building_<tipo>    tipo = chave de src/data/buildings.js
  command_<ação>     ações do card (parar, reparar, desembarcar, construir…)
  stat_<nome>        atributos da linha de status do card (ataque, defesa, velocidade, alcance, carga, mana…)
  research_<id>      chave de src/data/upgrades.js (RESEARCH); `_orc` quando a arte da facção Clãs difere
  ability_<id>       chave de src/data/abilities.js
Aliases (ALIASES) deixam uma pesquisa/classe usar o ícone de outra entrada sem renderizar duas vezes.

Campos de câmera (espaço do JOGO): az = azimute (0 = de frente; + = para o lado +x), el = elevação, fov = abertura (graus),
crop = fração da altura do modelo (a partir do topo) usada para ENQUADRAR (1.0 = corpo inteiro; <1 = busto).
"""

# ---- famílias de enquadramento -----------------------------------------------------------------------------------
HUM = dict(crop=0.66, az=26, el=10, fov=22, margin=0.05)      # humanoides: do joelho para cima
BIG = dict(crop=0.62, az=26, el=10, fov=22, margin=0.05)      # ogros: um pouco mais fechado
CAV = dict(crop=0.74, az=40, el=10, fov=22, margin=0.05)      # cavalaria: cavaleiro + cabeça/peito do cavalo
SIEGE = dict(crop=1.0, az=38, el=24, fov=22, margin=0.06)
AIR = dict(crop=1.0, az=32, el=12, fov=22, margin=0.06)
SHIP = dict(crop=1.0, az=38, el=26, fov=22, margin=0.06)
BLD = dict(crop=1.0, az=32, el=30, fov=22, margin=0.06)


def S(glb, fam, **over):
    d = dict(glb=glb, pose='idle')
    d.update(fam)
    d.update(over)
    return d


# ---- unidades (chave -> .glb) ---------------------------------------------------------------------------------------
UNITS = {
    'villager': S('villager', HUM),
    'knight': S('knight', HUM),
    'cavalier': S('cavalier', CAV),
    'archer': S('archer', HUM),
    'ballista': S('ballista', SIEGE),
    'peon': S('peon', HUM),
    'grunt': S('grunt', HUM),
    'axethrower': S('axethrower', HUM),
    'ogre': S('ogre', BIG),
    'templar': S('templar', CAV),
    'ogre_mage': S('ogre_mage', BIG),
    'watching_eye': S('watching_eye', AIR, pose=None),
    'glider': S('glider', AIR),
    'war_balloon': S('war_balloon', AIR),
    'gryphon_rider': S('gryphon_rider', AIR),
    'war_serpent': S('war_serpent', AIR),
    'catapult': S('catapult', SIEGE),
    'sapper': S('sapper', HUM),
    'arsonist': S('arsonist', HUM),
    'ranger': S('archer', HUM, badge='rank'),
    'berserker': S('axethrower', HUM, badge='rank'),
    'mage': S('mage', HUM),
    'necromancer': S('necromancer', HUM),
    'skeleton': S('skeleton', HUM),
    'hero_brann': S('knight', HUM, badge='hero'),
    'hero_drogath': S('hero_drogath', HUM, badge='hero'),   # M2-22: modelo próprio do Tripo
    'hero_oren': S('hero_oren', HUM, badge='hero'),          # M2-21: modelo próprio do Tripo (hero_oren.glb)
    'bandit': S('bandit', HUM),
    # navios (a barcaça e o petroleiro têm arte própria por facção)
    'tanker': S('tanker', SHIP),
    'tanker_orc': S('orc_tanker', SHIP),
    'frigate': S('frigate', SHIP),
    'war_galley': S('orc_frigate', SHIP),
    'barge': S('barge', SHIP),
    'barge_orc': S('orc_barge', SHIP),
    'dreadnought': S('dreadnought', SHIP),
    'iron_leviathan': S('orc_dreadnought', SHIP),
}

# ---- construções --------------------------------------------------------------------------------------------------
BUILDINGS = {k: S(k, BLD, pose=None) for k in (
    'castle', 'cottage', 'lumber_camp', 'farm', 'barracks', 'forge', 'stable', 'workshop', 'aviary', 'arcane_tower',
    'temple', 'watchtower', 'shipyard', 'oil_platform', 'great_hall', 'orc_house', 'pig_farm', 'orc_lumber_mill',
    'orc_barracks', 'orc_forge', 'ogre_den', 'orc_workshop', 'serpent_nest', 'ash_sanctum', 'storm_altar',
    'orc_watchtower', 'ship_dock', 'bandit_camp')}
BUILDINGS['oil_platform_orc'] = S('orc_oil_platform', BLD, pose=None)
# muralhas: o .glb é UM bloco; o ícone mostra três em fila para ler como muralha
BUILDINGS['wall_human'] = S('wall_human', dict(BLD, el=24), pose=None, copies=[(-2.3, 0.0), (0.0, 0.0), (2.3, 0.0)])
BUILDINGS['wall_orc'] = S('wall_orc', dict(BLD, el=24), pose=None, copies=[(-2.3, 0.0), (0.0, 0.0), (2.3, 0.0)])
# jazidas (cartão de recurso) — arte de ambiente
BUILDINGS['gold_mine'] = S('gold_mine', BLD, pose=None)
BUILDINGS['stone_quarry'] = S('stone_quarry', BLD, pose=None)
# Evoluir o Centro: o castelo com a seta verde
COMMANDS_GLB = {
    'upgrade_hq': S('castle', BLD, pose=None, badge='up'),
    'upgrade_hq_orc': S('great_hall', BLD, pose=None, badge='up'),
}

# ---- glifos (comandos, pesquisas, habilidades) ----------------------------------------------------------------------
COMMANDS = ['stop', 'move', 'attack', 'attack_move', 'patrol', 'hold', 'gather', 'build', 'repair', 'cancel', 'rally',
            'train', 'research', 'unload', 'load']
COMMAND_ICONS = {c: dict(glyph=c) for c in COMMANDS}

# pesquisas não-mágicas (glifo) — as demais usam alias (classe/magia)
RESEARCH_GLYPH = {
    'melee_weapons': 'sword', 'melee_weapons_orc': 'axe',
    'melee_armor': 'shield_human', 'melee_armor_orc': 'shield_orc',
    'siege_damage': 'bomb', 'siege_damage_orc': 'boulder_fire',
    'naval_cannons': 'cannon', 'naval_cannons_orc': 'cannon',
    'naval_hulls': 'hull', 'naval_hulls_orc': 'hull',
    'ranged_ammo': 'arrows', 'ranged_ammo_orc': 'axes_throw',
    'woodcutting': 'axe_log',
    'ranger_longbow': 'longbow', 'ranger_sight': 'eye_gold', 'ranger_marksman': 'target',
    'berserker_range': 'axe_speed', 'berserker_regen': 'heart', 'berserker_fury': 'rage',
}
RESEARCH_ICONS = {f'{k}': dict(glyph=v) for k, v in RESEARCH_GLYPH.items()}
# o casco/canhão dos Clãs usa a mesma forma com a paleta escura
RESEARCH_ICONS['naval_cannons_orc'] = dict(glyph='cannon', dark=True)
RESEARCH_ICONS['naval_hulls_orc'] = dict(glyph='hull', dark=True)

# habilidades (ids de src/data/abilities.js). `glyph` = glifo procedural; `glb` = modelo existente
ABILITY_ICONS = {
    'fireball': dict(glyph='fireball'),
    'slow': dict(glyph='slow'),
    'flameshield': dict(glyph='flameshield'),
    'invisibility': dict(glb='mage', pose='idle', ghost=True, crop=0.7, az=22, el=8, fov=22, margin=0.06),
    'polymorph': dict(glyph='polymorph'),
    'blizzard': dict(glyph='blizzard'),
    'death_touch': dict(glyph='death_touch'),
    'haste_spell': dict(glyph='haste'),
    'raise_dead': dict(glb='skeleton', pose='idle', glow='#5dff7e', crop=0.78, az=24, el=10, fov=22, margin=0.07, rise=True),
    'unholy_armor': dict(glyph='unholy_armor'),
    'ash_cloud': dict(glyph='ash_cloud'),
    'whirlwind': dict(glyph='whirlwind'),
    'holy_vision': dict(glyph='eye_gold'),
    'heal': dict(glyph='heal'),
    'exorcism': dict(glyph='exorcism'),
    'eye_of_watch': dict(glb='watching_eye', pose=None, crop=1.0, az=0, el=6, fov=20, margin=0.1, glow='#b574ff'),
    'bloodlust': dict(glyph='bloodlust'),
    'hero_war_cry': dict(glyph='war_cry'),
    'hero_arcane_bolt': dict(glyph='arcane_bolt'),
    'hero_mend': dict(glyph='mend'),
    'runes': dict(glyph='runes'),
}

# atributos do card (exibidos a ~18 px na linha de atributos): silhuetas grossas, contorno mais forte (`outline` = multiplicador)
STAT_ICONS = {
    'attack': dict(glyph='sword', outline=1.8), 'armor': dict(glyph='shield_human', outline=1.8), 'speed': dict(glyph='boot', outline=1.8),
    'range': dict(glyph='target', outline=1.8), 'cargo': dict(glyph='sack', outline=1.8), 'mana': dict(glyph='mana', outline=1.8),
    'air': dict(glyph='wing', outline=1.8), 'naval': dict(glyph='anchor', outline=1.8), 'suicide': dict(glyph='bomb', outline=1.8),
    'area': dict(glyph='blast', outline=1.8), 'submerged': dict(glyph='bubbles', outline=1.8), 'build': dict(glyph='hammer', outline=1.8),
    'pop': dict(glyph='people', outline=1.8), 'tower': dict(glyph='longbow', outline=1.8),
}

# ---- aliases: chave -> ícone que ela reaproveita -----------------------------------------------------------------------
ALIASES = {
    # magias pesquisadas no Templo/Santuário usam o ícone da própria magia
    'research_spell_fireball': 'ability_fireball', 'research_spell_slow': 'ability_slow',
    'research_spell_flameshield': 'ability_flameshield', 'research_spell_invisibility': 'ability_invisibility',
    'research_spell_polymorph': 'ability_polymorph', 'research_spell_blizzard': 'ability_blizzard',
    'research_spell_death_touch': 'ability_death_touch', 'research_spell_haste': 'ability_haste_spell',
    'research_spell_raise_dead': 'ability_raise_dead', 'research_spell_unholy_armor': 'ability_unholy_armor',
    'research_spell_ash_cloud': 'ability_ash_cloud', 'research_spell_whirlwind': 'ability_whirlwind',
    'research_spell_holy_vision': 'ability_holy_vision', 'research_spell_heal': 'ability_heal',
    'research_spell_exorcism': 'ability_exorcism', 'research_spell_eye': 'ability_eye_of_watch',
    'research_spell_bloodlust': 'ability_bloodlust', 'research_spell_runes': 'ability_runes',
    # classes avançadas: o ícone é o da própria unidade
    'research_ranged_class': 'unit_ranger', 'research_ranged_class_orc': 'unit_berserker',
    'research_cavalry_class': 'unit_templar', 'research_cavalry_class_orc': 'unit_ogre_mage',
    # ícones de depuração
    'ability_debug_bolt': 'ability_hero_arcane_bolt', 'ability_debug_heal': 'ability_heal',
}

# ---- retratos: tipo de unidade -> (glb, enquadramento) ----------------------------------------------------------------
# `attack` = pose do estado de ataque: ('fight'|'cast', progresso). O progresso escolhe o instante do golpe
# (amostras de tools/dump-portrait-poses.mjs: fight 0.15/0.3/0.45/0.6/0.75, cast 0.5).
PORTRAIT_HUM = dict(crop=0.44, az=22, el=6, fov=20, margin=0.05)     # cabeça + tronco (o braço do golpe entra no quadro)
PORTRAIT_BIG = dict(crop=0.4, az=22, el=6, fov=20, margin=0.05)
PORTRAIT_FULL = dict(crop=1.0, az=34, el=20, fov=22, margin=0.1)


def P(glb, fam, attack=('fight', 0.45), faction='human', **over):
    d = dict(glb=glb, attack=attack, faction=faction)
    d.update(fam)
    d.update(over)
    return d


PORTRAITS = {
    'villager': P('villager', dict(PORTRAIT_HUM, crop=0.5), ('fight', 0.3)),
    'knight': P('knight', PORTRAIT_HUM, ('fight', 0.3)),
    'cavalier': P('cavalier', dict(PORTRAIT_FULL, crop=0.55, az=30, el=8), ('fight', 0.3)),
    'archer': P('archer', PORTRAIT_HUM, ('fight', 0.6)),
    'ballista': P('ballista', PORTRAIT_FULL, ('fight', 0.45)),
    'peon': P('peon', PORTRAIT_HUM, ('fight', 0.3), faction='orc'),
    'grunt': P('grunt', PORTRAIT_HUM, ('fight', 0.3), faction='orc'),
    'axethrower': P('axethrower', PORTRAIT_HUM, ('fight', 0.3), faction='orc'),
    'ogre': P('ogre', PORTRAIT_BIG, ('fight', 0.3), faction='orc'),
    'templar': P('templar', dict(PORTRAIT_FULL, crop=0.55, az=30, el=8), ('fight', 0.3)),
    'ogre_mage': P('ogre_mage', PORTRAIT_BIG, ('cast', 0.5), faction='orc'),
    'watching_eye': P('watching_eye', dict(PORTRAIT_FULL, az=0, el=6), ('fight', 0.45), faction='orc'),
    'glider': P('glider', PORTRAIT_FULL, ('fight', 0.45)),
    'war_balloon': P('war_balloon', PORTRAIT_FULL, ('fight', 0.45), faction='orc'),
    'gryphon_rider': P('gryphon_rider', PORTRAIT_FULL, ('fight', 0.45)),
    'war_serpent': P('war_serpent', PORTRAIT_FULL, ('fight', 0.45), faction='orc'),
    'catapult': P('catapult', PORTRAIT_FULL, ('fight', 0.6), faction='orc'),
    'sapper': P('sapper', PORTRAIT_HUM, ('fight', 0.3)),
    'arsonist': P('arsonist', PORTRAIT_HUM, ('fight', 0.3), faction='orc'),
    'mage': P('mage', dict(PORTRAIT_HUM, crop=0.58), ('cast', 0.5)),
    'necromancer': P('necromancer', dict(PORTRAIT_HUM, crop=0.58), ('cast', 0.5), faction='orc'),
    'skeleton': P('skeleton', PORTRAIT_HUM, ('fight', 0.3), faction='orc'),
    'bandit': P('bandit', PORTRAIT_HUM, ('fight', 0.3), faction='neutral'),
    'tanker': P('tanker', PORTRAIT_FULL, ('fight', 0.45), faction='neutral'),
    'frigate': P('frigate', PORTRAIT_FULL, ('fight', 0.45)),
    'barge': P('barge', PORTRAIT_FULL, ('fight', 0.45), faction='neutral'),
    'dreadnought': P('dreadnought', PORTRAIT_FULL, ('fight', 0.45)),
    'war_galley': P('orc_frigate', PORTRAIT_FULL, ('fight', 0.45), faction='orc'),
    'iron_leviathan': P('orc_dreadnought', PORTRAIT_FULL, ('fight', 0.45), faction='orc'),
    'tanker_orc': P('orc_tanker', PORTRAIT_FULL, ('fight', 0.45), faction='orc'),
    'barge_orc': P('orc_barge', PORTRAIT_FULL, ('fight', 0.45), faction='orc'),
    'ranger': P('archer', PORTRAIT_HUM, ('fight', 0.6), badge='rank'),
    'berserker': P('axethrower', PORTRAIT_HUM, ('fight', 0.3), faction='orc', badge='rank'),
    'hero_brann': P('knight', PORTRAIT_HUM, ('fight', 0.3), badge='hero'),
    'hero_drogath': P('hero_drogath', PORTRAIT_HUM, ('fight', 0.3), faction='orc', badge='hero'),
    'hero_oren': P('hero_oren', dict(PORTRAIT_HUM, crop=0.58), ('cast', 0.5), badge='hero'),
}

# Cores de fundo do retrato por facção: (centro, borda) em hex sRGB; o estado de ataque esquenta o centro.
PORTRAIT_BG = {
    'human': ('#3f6fb8', '#101c34'),
    'orc': ('#a9453a', '#2a0f10'),
    'neutral': ('#6f8f4f', '#1c2414'),
}
