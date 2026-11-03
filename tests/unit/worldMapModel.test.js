import { describe, it, expect } from 'vitest';
import { listCampaigns } from '../../src/data/campaigns/index.js';
import { getMission } from '../../src/data/missions/index.js';
import { CampaignProgress, memoryStorage } from '../../src/campaign/progress.js';
import { nextMission } from '../../src/campaign/index.js';
import { buildWorldMapModel, worldMapArtCandidates, nextMarkerIndex, MARKER_STATES } from '../../src/ui/worldMapModel.js';
import { worldMapHtml } from '../../src/ui/worldMap.js';
import { localize } from '../../src/sim/missions/text.js';
import pt from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';
import data from '../../src/data/campaigns/world-map.json';

const camps = listCampaigns();
const tt = (d) => (k, p = {}) => String(d[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => p[n]);
const build = (def, progress, lang = 'pt-BR', extra = {}) => buildWorldMapModel({
  campaignDef: def, progress, lang, t: tt(lang === 'en' ? en : pt),
  currentId: nextMission(def, progress.completed(def.id), {}), titleOf: (id) => localize(getMission(id).title, lang), ...extra
});

describe('Mapa-múndi da campanha (M2-08)', () => {
  for (const id of ['war-alliance', 'war-horde']) {
    it(`${id}: 12 marcadores dentro da arte, sem sobreposição e na ordem das missões`, () => {
      const def = camps.find((c) => c.id === id);
      const m = build(def, new CampaignProgress(memoryStorage()));
      expect(m.count).toBe(12);
      expect(m.markers.map((k) => k.id)).toEqual(def.missions.map((e) => e.id));
      for (const k of m.markers) {
        expect(k.x).toBeGreaterThan(0); expect(k.x).toBeLessThan(100);
        expect(k.y).toBeGreaterThan(0); expect(k.y).toBeLessThan(100);
        expect(k.place).toBeTruthy(); expect(k.title).toBeTruthy();
      }
      for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) {
        const dx = (m.markers[i].x - m.markers[j].x) * m.aspect; const dy = m.markers[i].y - m.markers[j].y;
        expect(Math.hypot(dx, dy), `${i + 1} x ${j + 1}`).toBeGreaterThan(4);
      }
      expect(m.route).toHaveLength(11);
    });
  }

  it('estados: nova tentativa = 1 atual + 11 bloqueadas; vitória conclui e libera a próxima', () => {
    const def = camps.find((c) => c.id === 'war-alliance');
    const progress = new CampaignProgress(memoryStorage());
    let m = build(def, progress);
    expect(m.markers.map((k) => k.state)).toEqual(['current', ...Array(11).fill('locked')]);
    progress.recordVictory(def.id, def.missions[0].id, { seconds: 90 });
    m = build(def, progress);
    expect(m.markers[0].state).toBe('completed');
    expect(m.markers[1].state).toBe('current');
    expect(m.markers[2].state).toBe('locked');
    expect(m.route.filter((r) => r.done).length).toBe(1);
    expect(m.markers.every((k) => MARKER_STATES.includes(k.state))).toBe(true);
    const all = build(def, progress, 'pt-BR', { unlockAll: true, currentId: null });
    expect(all.markers.filter((k) => k.state === 'locked')).toHaveLength(0);
  });

  it('nomes: ilha para os palcos 2-9, continente para 1 e 10-12 (espelhado na Horda); pt-BR e en', () => {
    const al = build(camps.find((c) => c.id === 'war-alliance'), new CampaignProgress(memoryStorage()));
    const hd = build(camps.find((c) => c.id === 'war-horde'), new CampaignProgress(memoryStorage()), 'en');
    expect(al.markers[0].place).toBe('Velmara');
    expect(al.markers[9].place).toBe('Cinzara');
    expect(al.markers[1].place).toBe('Pouso do Encontro');
    expect(al.markers[7].place).toBe('A Fornalha');
    expect(hd.markers[0].place).toBe('Cinzara');
    expect(hd.markers[11].place).toBe('Velmara');
    expect(hd.markers[1].place).toBe("Encounter's Landing");
    expect(al.markers[3].label).toMatch(/^Missão 4: .+\. Baixio do Breu\. bloqueada$/);
    expect(hd.markers[0].label).toMatch(/^Mission 1: .+\. Cinzara\. current mission$/);
  });

  it('arte: prefere a "clean"; sem ela cai na antiga (com cartela); respeita BASE_URL', () => {
    expect(worldMapArtCandidates('/warpoly/', ['mapa-mundi-clean.jpg', 'mapa-mundi.jpg'])[0]).toEqual({ url: '/warpoly/art/world/mapa-mundi-clean.jpg', clean: true });
    expect(worldMapArtCandidates('/', ['mapa-mundi-clean.webp', 'mapa-mundi-clean.jpg'])[0].url).toBe('/art/world/mapa-mundi-clean.webp');
    expect(worldMapArtCandidates('/', ['mapa-mundi.jpg'])[0]).toEqual({ url: '/art/world/mapa-mundi.jpg', clean: false });
    expect(worldMapArtCandidates('/', [])).toEqual([]);
  });

  it('markup: 12 botões acessíveis, 1 com tabindex 0, cartela só na arte antiga', () => {
    const def = camps.find((c) => c.id === 'war-horde');
    const progress = new CampaignProgress(memoryStorage());
    const common = { campaignDef: def, progress, currentId: def.missions[0].id, selectedId: def.missions[0].id, titleOf: (id) => getMission(id).title['pt-BR'] };
    const clean = worldMapHtml({ ...common, art: { url: '/warpoly/art/world/mapa-mundi-clean.jpg', clean: true } });
    expect((clean.match(/<button/g) || []).length).toBe(12);
    expect((clean.match(/tabindex="0"/g) || []).length).toBe(1);
    expect(clean).toContain('src="/warpoly/art/world/mapa-mundi-clean.jpg"');
    expect(clean).toContain('data-art="clean"');
    expect(clean).toContain('wm-title--scroll');
    const legacy = worldMapHtml({ ...common, art: { url: '/art/world/mapa-mundi.jpg', clean: false } });
    expect(legacy).toContain('wm-title--cartela');
  });

  it('teclado: setas/Home/End circulam', () => {
    expect(nextMarkerIndex(0, 'ArrowLeft', 12)).toBe(11);
    expect(nextMarkerIndex(11, 'ArrowRight', 12)).toBe(0);
    expect(nextMarkerIndex(5, 'Home', 12)).toBe(0);
    expect(nextMarkerIndex(5, 'End', 12)).toBe(11);
    expect(nextMarkerIndex(5, 'a', 12)).toBe(5);
  });

  it('dados e i18n: caixas de título dentro da arte; chaves pt-BR e en', () => {
    const a = data.art;
    for (const r of [a.titleScroll, a.cartela]) { expect(r.x + r.w).toBeLessThanOrEqual(a.width); expect(r.y + r.h).toBeLessThanOrEqual(a.height); }
    for (const k of ['worldmap.aria', 'worldmap.state.completed', 'worldmap.state.current', 'worldmap.state.available', 'worldmap.state.locked', 'campaign.list']) {
      expect(pt[k], k).toBeTruthy(); expect(en[k], k).toBeTruthy();
    }
    for (const id of ['war-alliance', 'war-horde']) expect(a.stages[id]).toHaveLength(12);
  });
});
