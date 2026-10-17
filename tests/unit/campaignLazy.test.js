import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  getMap, peekMap, hasMap, isMapLoaded, isLazyMap, ensureMapLoaded, loadMap, loadAllCampaignMaps, listMaps, listMapIds, registerMap
} from '../../src/data/maps/index.js';
import { CAMPAIGN_MAP_LOADERS } from '../../src/data/maps/campaignLoaders.js';
import { createMatchConfig, validateMatchConfig, matchConfigFromSearch } from '../../src/sim/MatchConfig.js';
import { validateMission } from '../../src/sim/missions/schema.js';
import { baseMission } from './helpers/missionWorld.js';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';

/**
 * M2-28: os mapas `camp-*` não entram no bundle de boot — são chunks carregados por `ensureMapLoaded`.
 * (Cada arquivo de teste tem seu próprio módulo `index.js`: aqui nenhum mapa de campanha começa carregado.)
 * Os testes abaixo são sequenciais e dependem da ordem (antes de carregar → carregar → depois).
 */
const MAPS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../src/data/maps');
const FILE_IDS = readdirSync(MAPS_DIR).filter((f) => /^camp-.*\.json$/.test(f)).map((f) => f.replace(/\.json$/, '')).sort();
const ID = 'camp-03-pedra-mae';

describe('M2-28 · registro dos mapas de campanha sob demanda', () => {
  it('a tabela de carregadores cobre exatamente os camp-*.json da pasta (acrescente o mapa novo em campaignLoaders.js)', () => {
    expect(Object.keys(CAMPAIGN_MAP_LOADERS).sort()).toEqual(FILE_IDS);
    expect(FILE_IDS.length).toBeGreaterThanOrEqual(3);
  });

  it('antes de carregar: getMap lança erro claro; peekMap/isMapLoaded não; hasMap/isLazyMap sabem que existe', () => {
    expect(() => getMap(ID)).toThrow(/ensureMapLoaded/);
    expect(() => getMap(ID)).toThrow(ID);
    expect(peekMap(ID)).toBeUndefined();
    expect(isMapLoaded(ID)).toBe(false);
    expect(hasMap(ID)).toBe(true);
    expect(isLazyMap(ID)).toBe(true);
    expect(hasMap('nao-existe')).toBe(false);
    expect(getMap('nao-existe')).toBeUndefined(); // id desconhecido continua devolvendo undefined
    expect(isLazyMap('continental-1v1')).toBe(false);
  });

  it('antes de carregar: nenhum camp-* em listMaps; todos em listMapIds({includeHidden}); fora da lista da Escaramuça', () => {
    expect(listMaps({ includeHidden: true }).some((m) => m.id.startsWith('camp-'))).toBe(false);
    expect(listMapIds({ includeHidden: true })).toEqual(expect.arrayContaining(FILE_IDS));
    expect(listMapIds().some((id) => id.startsWith('camp-'))).toBe(false);
  });

  it('antes de carregar: ?map=camp-… é aceito pela URL; validateMatchConfig lança o erro claro; missão sobre o mapa valida', () => {
    expect(matchConfigFromSearch(`?map=${ID}`).mapId).toBe(ID);
    const cfg = createMatchConfig({ mapId: ID, headless: true });
    expect(() => validateMatchConfig(cfg)).toThrow(/ensureMapLoaded/);
    const r = validateMission(baseMission({ mapId: ID }));
    expect(r.errors.filter((e) => /mapId|desconhecido/.test(e))).toEqual([]);
    expect(validateMission(baseMission({ mapId: 'camp-99-nada' })).errors.some((e) => /mapa desconhecido/.test(e))).toBe(true);
  });

  it('ensureMapLoaded/loadMap carregam o mapa; depois getMap devolve a mesma definição, hidden, e listMaps o inclui', async () => {
    const p1 = ensureMapLoaded(ID);
    const p2 = loadMap(ID);
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe(b); // um único import em andamento
    expect(a.id).toBe(ID);
    expect(a.hidden).toBe(true);
    expect(getMap(ID)).toBe(a);
    expect(isMapLoaded(ID)).toBe(true);
    expect(listMaps().map((m) => m.id)).not.toContain(ID);
    expect(listMaps({ includeHidden: true }).map((m) => m.id)).toContain(ID);
    expect(await ensureMapLoaded(ID)).toBe(a);
  });

  it('ensureMapLoaded: mapa estático resolve na hora; id desconhecido rejeita com erro claro', async () => {
    expect(await ensureMapLoaded('continental-1v1')).toBe(getMap('continental-1v1'));
    await expect(ensureMapLoaded('camp-99-nada')).rejects.toThrow(/desconhecido/);
  });

  it('registerMap não sobrescreve id de mapa de campanha', () => {
    expect(() => registerMap({ id: ID })).toThrow(/estático/);
  });

  it('loadAllCampaignMaps carrega todos; depois a partida headless num camp-* cria Terrain e GameManager', async () => {
    const defs = await loadAllCampaignMaps();
    expect(defs.map((d) => d.id).sort()).toEqual(FILE_IDS);
    for (const id of FILE_IDS) expect(getMap(id).id).toBe(id);
    const cfg = createMatchConfig({ mapId: ID, headless: true, seed: 1 });
    const gm = new GameManager(new Terrain(getMap(ID)), null, null, cfg);
    expect(gm.matchConfig.mapId).toBe(ID);
  });
});
