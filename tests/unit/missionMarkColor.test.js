import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Unit } from '../../src/sim/Unit.js';
import { Building } from '../../src/sim/Building.js';
import { UnitView } from '../../src/render/UnitView.js';
import { BuildingView } from '../../src/render/BuildingView.js';
import { markRingMaterial, markRingMaterialCount } from '../../src/render/markRing.js';
import { ModelFactory } from '../../src/entities/ModelFactory.js';
import { stateChecksum } from '../../src/sim/checksum.js';
import { validateMission } from '../../src/sim/missions/schema.js';
import { getMission } from '../../src/data/missions/index.js';
import '../../src/data/campaigns/index.js'; // registra as missões da campanha (escondidas do menu)
import { baseMission, makeMissionGm, runTicks } from './helpers/missionWorld.js';

// Em Node o carregador de .glb falha ao buscar URLs do navegador (cai no modelo procedural); silencia só esse aviso conhecido.
vi.hoisted(() => {
  const quiet = (orig) => (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[glbModels]')) return; orig(...a); };
  console.warn = quiet(console.warn.bind(console));
  console.error = quiet(console.error.bind(console));
});

/**
 * NEW-53 — `markColor` (`#rrggbb`) nas ações `spawn`/`spawnBuilding`: cor própria do anel de seleção (ex.: carregadores do m04).
 * É só apresentação: grava `unit.markColor`/`building.markColor`, nunca entra no checksum, e o anel padrão (dourado do
 * jogador, vermelho dos demais) continua igual para quem não tem a marca.
 */
const CIANO = '#22d3ee';
const DOURADO = 0xdeb841;
const VERMELHO = 0xef4444;
const PRIMARY = (o) => ({ priority: 'primary', title: 't', ...o });
const mission = (setup) => baseMission({ autoVictory: false, objectives: [PRIMARY({ id: 'o', type: 'survive', seconds: 9999 })], setup });
const spawn = (over = {}) => ({ type: 'spawn', owner: 'player', unitType: 'villager', count: 4, x: -10, z: 10, tag: 'comboio', ...over });
const tagged = (gm, tag) => gm.mission.tags.get(tag).map((id) => gm.entitiesById.get(id));

describe('markColor na ação spawn (sim)', () => {
  it('grava unit.markColor em todas as unidades criadas; sem a marca fica null', () => {
    const gm = makeMissionGm(mission([
      spawn({ markColor: CIANO }),
      spawn({ tag: 'soldados', units: [{ type: 'knight', count: 2 }, { type: 'archer', count: 1 }], unitType: undefined, count: undefined, markColor: '#A855F7' }),
      spawn({ tag: 'comuns', count: 2, x: 5 })
    ]));
    expect(tagged(gm, 'comboio').map((u) => u.markColor)).toEqual([CIANO, CIANO, CIANO, CIANO]);
    expect(tagged(gm, 'soldados').map((u) => u.markColor)).toEqual(['#A855F7', '#A855F7', '#A855F7']); // cada lista de `units` recebe a mesma marca
    expect(tagged(gm, 'comuns').map((u) => u.markColor)).toEqual([null, null]);
    expect(gm.getUnitsOf(0).filter((u) => u.markColor).length).toBe(7);
  });

  it('também em unidades criadas por gatilho, de qualquer dono', () => {
    const gm = makeMissionGm(baseMission({
      autoVictory: false,
      objectives: [PRIMARY({ id: 'o', type: 'survive', seconds: 9999 })],
      triggers: [{ id: 'g', when: { type: 'time', at: 1 }, actions: [spawn({ owner: 'bandits', unitType: 'bandit', count: 2, tag: 'b', markColor: '#ff00ff' })] }]
    }));
    runTicks(gm, 25);
    expect(tagged(gm, 'b').map((u) => [u.ownerId, u.markColor])).toEqual([[99, '#ff00ff'], [99, '#ff00ff']]);
  });

  it('o schema só aceita #rrggbb', () => {
    expect(validateMission(mission([spawn({ markColor: CIANO })])).ok).toBe(true);
    for (const cor of ['ciano', '#22d3e', '#22d3eef', '22d3ee', 'rgb(1,2,3)', 0x22d3ee, null]) {
      const r = validateMission(mission([spawn({ markColor: cor })]));
      expect(r.errors.some((e) => e.includes('cor inválida')), String(cor)).toBe(true);
    }
  });

  it('é só render: o checksum, o estado da missão e a simulação são idênticos com e sem a marca', () => {
    const plain = makeMissionGm(mission([spawn({ count: 3 })]));
    const marked = makeMissionGm(mission([spawn({ count: 3, markColor: CIANO })]));
    for (const gm of [plain, marked]) {
      const [a, b, c] = tagged(gm, 'comboio');
      // mexe nas unidades para o checksum cobrir posição, ordens e vida
      gm.getUnitsOf(0)[0].moveTo(a.mesh.position.x + 12, a.mesh.position.z - 8, gm);
      b.takeDamage(7, c);
    }
    runTicks(plain, 200);
    runTicks(marked, 200);
    expect(plain.checksums.length).toBeGreaterThan(5);
    expect(marked.checksums).toEqual(plain.checksums);
    expect(stateChecksum(marked)).toBe(stateChecksum(plain));
    expect(marked.mission.hashString()).toBe(plain.mission.hashString());
    expect(tagged(marked, 'comboio')[0].markColor).toBe(CIANO);
    expect(tagged(plain, 'comboio')[0].markColor).toBe(null);
  });
});

describe('markColor nas missões da campanha', () => {
  it('só os carregadores do m04 recebem a cor; os cativos do m02 (resgate) continuam sem marca => anel vermelho', () => {
    const m04 = getMission('alliance-04-ponte-do-rio-turvo');
    const spawns = m04.setup.filter((a) => a.type === 'spawn');
    const convoy = spawns.find((a) => a.tag === 'convoy');
    expect(convoy.markColor).toBe(CIANO);
    expect(convoy.owner).toBe('player');
    expect(spawns.filter((a) => a !== convoy).every((a) => a.markColor === undefined)).toBe(true);
    // cor clara e distinta do dourado (anel do jogador) e do vermelho (anel dos demais)
    const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const [r, g, b] = hex(CIANO);
    expect(b).toBeGreaterThan(r + 100);
    expect(g).toBeGreaterThan(r + 100);
    // m02: nenhum spawn nem gatilho usa markColor (os cativos nascem neutros e mantêm o anel vermelho)
    const m02 = getMission('alliance-02-cativos-da-garganta');
    const all = [...m02.setup, ...m02.triggers.flatMap((t) => t.actions)];
    expect(all.filter((a) => a.type === 'spawn').length).toBeGreaterThan(0);
    expect(all.some((a) => 'markColor' in a)).toBe(false);
  });
});

describe('anel de seleção com cor própria (render)', () => {
  const ctx = { alpha: 1, camera: null, lodFrustum: null, lodTarget: null, frameIndex: 0 };
  const hexOf = (view) => view.selectionRing.material.color.getHex();
  const unitView = (ownerId, markColor) => {
    const unit = new Unit({ getHeight: () => 0 }, 'villager', 0, 0, ownerId, null);
    if (markColor) unit.markColor = markColor;
    return { unit, view: new UnitView(unit, new THREE.Scene()) };
  };
  const withHeadless = (fn) => () => {
    ModelFactory.headless = true; // malhas vazias (sem texturas em canvas), como nos demais testes de view
    try { fn(); } finally { ModelFactory.headless = false; }
  };

  it('markRingMaterial: um material por cor (sem diferenciar maiúsculas), compartilhado e igual aos anéis padrão', () => {
    const n0 = markRingMaterialCount();
    const a = markRingMaterial(CIANO);
    expect(markRingMaterial('#22D3EE')).toBe(a);
    expect(markRingMaterial(CIANO)).toBe(a);
    expect(markRingMaterialCount()).toBeLessThanOrEqual(n0 + 1);
    expect(markRingMaterial('#a855f7')).not.toBe(a);
    expect(a.color.getHex()).toBe(0x22d3ee);
    expect(a.side).toBe(THREE.DoubleSide);
    expect(a.transparent).toBe(true);
    expect(a.opacity).toBeCloseTo(0.85, 6);
  });

  it('unidade do jogador: dourado; dos demais: vermelho; com markColor: a cor própria', withHeadless(() => {
    expect(hexOf(unitView(0).view)).toBe(DOURADO);
    expect(hexOf(unitView(1).view)).toBe(VERMELHO);
    const marked = unitView(0, CIANO).view;
    expect(hexOf(marked)).toBe(0x22d3ee);
    expect(hexOf(unitView(1, CIANO).view)).toBe(0x22d3ee); // a marca vale para qualquer lado
  }));

  it('as views de mesma cor compartilham o material e o update não cria materiais', withHeadless(() => {
    const a = unitView(0, CIANO);
    const b = unitView(0, CIANO);
    expect(a.view.selectionRing.material).toBe(b.view.selectionRing.material);
    const n = markRingMaterialCount();
    a.unit.isSelected = true;
    for (let i = 0; i < 5; i++) a.view.update(0.016, ctx);
    expect(markRingMaterialCount()).toBe(n);
    expect(a.view.selectionRing.visible).toBe(true);
    expect(a.view.selectionRing.material).toBe(b.view.selectionRing.material);
  }));

  it('a cor atribuída (ou removida) depois da criação é aplicada no update seguinte', withHeadless(() => {
    const { unit, view } = unitView(0);
    expect(hexOf(view)).toBe(DOURADO);
    unit.markColor = '#10b981';
    view.update(0.016, ctx);
    expect(hexOf(view)).toBe(0x10b981);
    unit.markColor = null;
    view.update(0.016, ctx);
    expect(hexOf(view)).toBe(DOURADO);
  }));

  it('cativos resgatados (nascem neutros) mantêm o anel vermelho depois da troca de dono — comportamento do m02 preservado', withHeadless(() => {
    const { unit, view } = unitView(-1); // dono neutro => lado "demais" => vermelho
    expect(hexOf(view)).toBe(VERMELHO);
    unit.ownerId = 0; // resgate (transferUnit)
    unit.modelSeq++;
    view.update(0.016, ctx);
    expect(hexOf(view)).toBe(VERMELHO);
  }));

  it('construção: anel dourado por padrão e cor própria com building.markColor', withHeadless(() => {
    const terrain = { getHeight: () => 0 };
    const plain = new Building(terrain, 'castle', 0, 0, true, 0);
    const marked = new Building(terrain, 'castle', 20, 0, true, 0);
    marked.markColor = CIANO;
    const vPlain = new BuildingView(plain, new THREE.Scene());
    const vMarked = new BuildingView(marked, new THREE.Scene());
    expect(vPlain.selectionRing.material.color.getHex()).toBe(DOURADO);
    expect(vMarked.selectionRing.material.color.getHex()).toBe(0x22d3ee);
    expect(vMarked.selectionRing.material).toBe(markRingMaterial(CIANO));
  }));
});
