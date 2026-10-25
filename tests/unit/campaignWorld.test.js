import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getCampaign } from '../../src/data/campaigns/index.js';
import { getMission } from '../../src/data/missions/index.js';
import { ensureMapLoaded } from '../../src/data/maps/index.js';
import { validateMission } from '../../src/sim/missions/schema.js';
import { availableTech, missionUnlocks } from '../../src/campaign/campaign.js';
import { playMission } from './helpers/campaignHarness.js';

/**
 * M3-01 — piso de qualidade das 24 missões do Novo Mundo (`war-alliance` e `war-horde`).
 *
 * Cada missão é conferida contra o "Template das missões" (docs/PLANO_FINAL_TAREFAS.md): validação, objetivos primário +
 * secundário + oculto, cutscene de abertura, ≥ 6 diálogos bilíngues, briefing + ≥ 2 dicas, mapa `camp-NN-…` do palco,
 * posições só por âncora, heróis só depois de liberados, `unlocks` conforme MUNDO-HISTORIA-CAMPANHA §4.2/4.3, carry-over
 * e tamanho mínimo do JSON (cheiro de esqueleto).
 *
 * `PENDING` = missões ainda esqueleto. Regra do marcador: missão em PENDING PRECISA falhar em algum item (senão o teste
 * pede para tirá-la da lista); missão fora de PENDING precisa cumprir tudo. Ao entregar uma missão (M3-02…M3-13, M4-01…M4-12):
 * tire-a daqui e acrescente o roteiro em `tests/fixtures/campaign-playthrough/<missionId>.js`.
 */
export const PENDING = new Set([
  'war-alliance-05-cerne-verde', 'war-alliance-06-a-geada', 'war-alliance-07-brejo-mudo', 'war-alliance-08-a-fornalha',
  'war-alliance-09-miragem', 'war-alliance-10-desembarque-costa-ferrugem', 'war-alliance-11-porto-albor',
  'war-alliance-12-bastiao-do-cabo-ferrugem',
  'war-horde-01-cinzas-vermelhas', 'war-horde-02-velas-brancas', 'war-horde-03-a-pedra-que-brilha', 'war-horde-04-mare-de-breu',
  'war-horde-05-madeira-de-guerra', 'war-horde-06-fogo-no-gelo', 'war-horde-07-casa-no-brejo', 'war-horde-08-o-monte-caldeira',
  'war-horde-09-o-ultimo-poco', 'war-horde-10-cabo-aurora', 'war-horde-11-brasa-alta', 'war-horde-12-cidadela-de-brasa-alta'
]);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MIN_JSON_BYTES = 6 * 1024;

/** Tabelas de liberação (MUNDO-HISTORIA-CAMPANHA §4.2 e §4.3): o que cada missão LIBERA. */
const U = (units = [], buildings = [], research = [], heroes = []) => ({ units, buildings, research, heroes });
const UNLOCKS = {
  'war-alliance': [
    U(['villager', 'knight', 'archer'], ['cottage', 'lumber_camp', 'farm', 'barracks']),
    U([], ['forge', 'watchtower'], ['melee_weapons', 'ranged_ammo', 'melee_armor']),
    U(['cavalier', 'ballista', 'sapper', 'ranger'], ['stable', 'workshop', 'wall_human'],
      ['siege_damage', 'woodcutting', 'ranged_class', 'melee_weapons@2', 'melee_armor@2', 'ranged_ammo@2', 'ranger_longbow'], ['hero_brann']),
    U(['glider', 'tanker', 'barge', 'frigate', 'dreadnought', 'submersible'], ['shipyard', 'refinery', 'foundry', 'oil_platform'],
      ['naval_cannons', 'naval_hulls', 'naval_cannons@2', 'naval_hulls@2', 'siege_damage@2']),
    U(['mage', 'templar', 'gryphon_rider'], ['arcane_tower', 'temple', 'aviary'], ['cavalry_class', 'spell_fireball', 'spell_slow', 'spell_heal', 'spell_exorcism']),
    U([], [], ['ranger_sight', 'ranger_marksman', 'spell_flameshield', 'spell_invisibility', 'spell_polymorph', 'spell_blizzard', 'spell_holy_vision']),
    U(), U(), U(), U([], [], [], ['hero_oren']), U([], [], [], ['hero_dorian']), U()
  ],
  'war-horde': [
    U(['peon', 'grunt', 'axethrower'], ['orc_house', 'orc_lumber_mill', 'pig_farm', 'orc_barracks']),
    U([], ['orc_forge', 'orc_watchtower'], ['melee_weapons', 'ranged_ammo', 'melee_armor']),
    U(['ogre', 'catapult', 'arsonist', 'berserker', 'war_balloon'], ['ogre_den', 'orc_workshop', 'wall_orc'],
      ['siege_damage', 'woodcutting', 'ranged_class', 'melee_weapons@2', 'melee_armor@2', 'ranged_ammo@2', 'berserker_range'], ['hero_drogath']),
    U(['tanker', 'barge', 'war_galley', 'iron_leviathan', 'colossal_turtle'], ['ship_dock', 'naval_forge', 'ash_cauldron', 'oil_platform'],
      ['naval_cannons', 'naval_hulls', 'naval_cannons@2', 'naval_hulls@2', 'siege_damage@2']),
    U(['necromancer', 'war_serpent', 'ogre_mage'], ['ash_sanctum', 'storm_altar', 'serpent_nest'], ['cavalry_class', 'spell_death_touch', 'spell_raise_dead', 'spell_eye', 'spell_bloodlust']),
    U([], [], ['berserker_regen', 'berserker_fury', 'spell_haste', 'spell_unholy_armor', 'spell_ash_cloud', 'spell_whirlwind', 'spell_runes']),
    U(), U(), U(), U([], [], [], ['hero_vozgul']), U([], [], [], ['hero_skarn']), U()
  ]
};

const sorted = (a) => [...(a || [])].sort();
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const bilingual = (t) => isObj(t) && typeof t['pt-BR'] === 'string' && t['pt-BR'].trim().length > 0 && typeof t.en === 'string' && t.en.trim().length > 0;

/** Todas as falas da missão: ações `dialog` (setup/gatilhos) + diálogos dos passos de cutscene. */
export function collectDialogs(def) {
  const out = [];
  const actions = [...(def.setup || []), ...(def.triggers || []).flatMap((t) => t.actions || [])];
  for (const a of actions) {
    if (a.type === 'dialog') out.push(a);
    if (a.type === 'cutscene') for (const s of a.steps || []) if (s.dialog) out.push(s.dialog);
  }
  return out;
}

/** Coordenadas soltas: qualquer objeto com `x` e `z` numéricos (sem `anchor`) em ações, objetivos, condições, áreas ou passos. */
export function looseCoordinates(node, path = '', out = []) {
  if (Array.isArray(node)) node.forEach((v, i) => looseCoordinates(v, `${path}[${i}]`, out));
  else if (isObj(node)) {
    if (typeof node.x === 'number' && typeof node.z === 'number' && node.anchor === undefined) out.push(path || '(raiz)');
    for (const [k, v] of Object.entries(node)) looseCoordinates(v, `${path}.${k}`, out);
  }
  return out;
}

/**
 * Itens de qualidade da missão; devolve a lista de PROBLEMAS (vazia = cumpre tudo).
 * @param {object} def definição da missão (JSON)
 * @param {{campaignId:string, index:number, bytes:number}} ctx
 */
export function missionProblems(def, { campaignId, index, bytes }) {
  const bad = [];
  const camp = getCampaign(campaignId);
  const entry = camp.missions[index];
  const v = validateMission(def);
  if (!v.ok) bad.push(`validateMission: ${v.errors.slice(0, 3).join(' | ')}`);

  const prios = new Set((def.objectives || []).map((o) => o.priority ?? 'primary'));
  for (const p of ['primary', 'secondary', 'hidden']) if (!prios.has(p)) bad.push(`falta objetivo ${p}`);

  const intro = (def.triggers || []).find((t) => t.when?.type === 'time' && (t.when.at ?? 0) <= 1 && (t.actions || []).some((a) => a.type === 'cutscene'));
  if (!intro) bad.push('falta cutscene de abertura (gatilho time≤1 com ação cutscene)');

  const dialogs = collectDialogs(def);
  const good = dialogs.filter((d) => bilingual(d.text) && d.text['pt-BR'] !== d.text.en);
  if (good.length < 6) bad.push(`diálogos bilíngues: ${good.length} (mínimo 6)`);
  if (dialogs.length !== good.length) bad.push(`${dialogs.length - good.length} diálogo(s) sem pt-BR/en distintos`);

  const b = def.briefing || {};
  if (!bilingual(b.text)) bad.push('briefing sem pt-BR/en');
  if (!Array.isArray(b.hints) || b.hints.length < 2 || !b.hints.every(bilingual)) bad.push('briefing precisa de ≥ 2 dicas bilíngues');
  if (!bilingual(def.title) || !bilingual(def.subtitle)) bad.push('title/subtitle sem pt-BR/en');
  for (const o of def.objectives || []) if (!bilingual(o.title)) bad.push(`objetivo ${o.id} sem título bilíngue`);

  const stage = String(index + 1).padStart(2, '0');
  if (!new RegExp(`^camp-${stage}-`).test(def.mapId || '')) bad.push(`mapId "${def.mapId}" não é o palco camp-${stage}-…`);

  const loose = looseCoordinates({ setup: def.setup, objectives: def.objectives, triggers: def.triggers });
  if (loose.length) bad.push(`${loose.length} coordenada(s) solta(s) (use âncoras), ex.: ${loose.slice(0, 2).join(', ')}`);

  // Heróis só depois de liberados (spawn do jogador local).
  const tech = availableTech(camp, index);
  const actions = [...(def.setup || []), ...(def.triggers || []).flatMap((t) => t.actions || [])];
  for (const a of actions) {
    if (a.type !== 'spawn' || !(a.owner === 'player' || a.owner === 0)) continue;
    const types = a.units ? a.units.map((u) => u.type) : [a.unitType];
    for (const t of types) if (/^hero_/.test(t) && !tech.heroes.has(t)) bad.push(`herói ${t} criado antes de liberado`);
  }

  const want = UNLOCKS[campaignId][index];
  const got = missionUnlocks(camp, index);
  for (const k of Object.keys(want)) if (JSON.stringify(sorted(got[k])) !== JSON.stringify(sorted(want[k]))) bad.push(`unlocks.${k} difere da tabela §4`);

  if (index === 0) { if (entry.requires) bad.push('m01 não tem requires'); }
  else {
    if (JSON.stringify(entry.requires) !== JSON.stringify([camp.missions[index - 1].id])) bad.push('requires deve ser a missão anterior');
    if (!entry.carryOver?.resources || !(entry.carryOver.max > 0)) bad.push('falta carry-over de recursos');
  }
  if (bytes < MIN_JSON_BYTES) bad.push(`JSON com ${bytes} bytes (< ${MIN_JSON_BYTES}; cheiro de esqueleto)`);
  return bad;
}

const fileOf = (campaignId, missionId) => {
  const dir = join(ROOT, 'src/data/campaigns', campaignId);
  const f = readdirSync(dir).find((n) => n.startsWith('m') && readFileSync(join(dir, n), 'utf8').includes(`"id": "${missionId}"`));
  return join(dir, f);
};

describe.each(['war-alliance', 'war-horde'])('M3-01 · piso de qualidade da campanha %s', (campaignId) => {
  const camp = getCampaign(campaignId);

  it('tem 12 missões e cada uma está registrada', () => {
    expect(camp.missions.length).toBe(12);
    for (const m of camp.missions) expect(getMission(m.id), m.id).toBeTruthy();
  });

  camp.missions.forEach((entry, index) => {
    const id = entry.id;
    const pending = PENDING.has(id);
    it(`${String(index + 1).padStart(2, '0')} ${id}${pending ? ' (PENDING)' : ''}`, async () => {
      const def = getMission(id);
      await ensureMapLoaded(def.mapId).catch(() => {});
      const bytes = readFileSync(fileOf(campaignId, id)).length;
      const problems = missionProblems(def, { campaignId, index, bytes });
      if (pending) {
        expect(problems.length, `"${id}" já cumpre o piso: tire-a de PENDING e acrescente o roteiro em tests/fixtures/campaign-playthrough/`).toBeGreaterThan(0);
      } else {
        expect(problems, id).toEqual([]);
        expect(existsSync(join(ROOT, 'tests/fixtures/campaign-playthrough', `${id}.js`)), `falta o roteiro de playthrough de ${id}`).toBe(true);
      }
    });
  });

  it('PENDING só cita missões que existem', () => {
    const ids = new Set(camp.missions.map((m) => m.id));
    for (const p of PENDING) if (p.startsWith(campaignId)) expect(ids.has(p), p).toBe(true);
  });
});

describe('M3-01 · harness de playthrough', () => {
  const FIXTURES = join(ROOT, 'tests/fixtures/campaign-playthrough');
  beforeAll(() => { expect(existsSync(FIXTURES)).toBe(true); });

  it('roda uma missão de campanha headless, com os passos do roteiro, e é determinístico', async () => {
    const id = 'war-alliance-02-pouso-do-encontro'; // (esqueleto: o harness só precisa de uma missão carregável)
    const seen = [];
    const script = [{ name: 'espera', wait: 2, run: (c) => seen.push(c.seconds) }, { name: 'ancora', run: (c) => seen.push(c.mine().length) }];
    const a = await playMission('war-alliance', id, script, { maxSeconds: 20 });
    const b = await playMission('war-alliance', id, script, { maxSeconds: 20 });
    expect(a.outcome).toBeNull();
    expect(a.ticks).toBe(400);
    expect(a.steps).toEqual(['espera', 'ancora']);
    expect(seen[0]).toBeGreaterThanOrEqual(2);
    expect(seen[1]).toBeGreaterThan(0);
    expect(a.checksum).toBe(b.checksum);
  });

  it('um passo que nunca fica pronto estoura com o nome do passo', async () => {
    await expect(playMission('war-alliance', 'war-alliance-02-pouso-do-encontro', [{ name: 'nunca', when: () => false, timeout: 3 }], { maxSeconds: 10 }))
      .rejects.toThrow(/nunca/);
  });
});
