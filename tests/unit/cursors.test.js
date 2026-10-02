import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { classifyHover, cursorKindFor, cursorCss, CURSOR_STYLES, CURSOR_KINDS, CursorController } from '../../src/ui/cursors.js';
import { bodyBox, writeBrackets, OUTLINE_COLORS, HoverOutline } from '../../src/ui/HoverOutline.js';
import { sanitizeOverrides, mergePreset, QUALITY_PRESETS } from '../../src/core/QualitySettings.js';
import { createOptionsStore } from '../../src/ui/optionsStore.js';

const isHostile = (a, b) => a !== b && b !== 5; // 5 = aliado
const cls = (e) => classifyHover(e, { localId: 0, isHostile });
const worker = { type: 'villager' };
const soldier = { type: 'footman' };

describe('classifyHover (F6-06)', () => {
  it('classifica cada entidade em relação ao jogador local', () => {
    expect(cls(null)).toBe('none');
    expect(cls({ ownerId: 1, type: 'grunt' })).toBe('hostile');
    expect(cls({ ownerId: 1, isConstructed: true, hp: 1, maxHp: 9 })).toBe('hostile');
    expect(cls({ ownerId: 0, species: 'pig' })).toBe('critter');
    expect(cls({ resourcesRemaining: 10 })).toBe('resource');
    expect(cls({ woodRemaining: 5 })).toBe('resource');
    expect(cls({ resourcesRemaining: 0 })).toBe('depleted');
    expect(cls({ ownerId: 0, isConstructed: false, hp: 1, maxHp: 9 })).toBe('ownSite');
    expect(cls({ ownerId: 0, isConstructed: true, hp: 5, maxHp: 9 })).toBe('ownDamaged');
    expect(cls({ ownerId: 0, isConstructed: true, hp: 9, maxHp: 9 })).toBe('ownBuilding');
    expect(cls({ ownerId: 0, type: 'footman' })).toBe('ownUnit');
    expect(cls({ ownerId: 5, type: 'footman' })).toBe('ally');
    expect(cls({ ownerId: 1, isDead: true })).toBe('none');
  });
});

describe('cursorKindFor', () => {
  const base = { selectedUnits: [soldier] };
  it('sem seleção ou com a opção desligada: padrão', () => {
    expect(cursorKindFor({ hover: 'hostile', selectedUnits: [] })).toBe('default');
    expect(cursorKindFor({ ...base, hover: 'hostile', enabled: false })).toBe('default');
  });
  it('atacar: hostil e crítter', () => {
    expect(cursorKindFor({ ...base, hover: 'hostile' })).toBe('attack');
    expect(cursorKindFor({ ...base, hover: 'critter' })).toBe('attack');
  });
  it('coletar / construir / reparar exigem trabalhador', () => {
    expect(cursorKindFor({ selectedUnits: [worker], hover: 'resource' })).toBe('gather');
    expect(cursorKindFor({ selectedUnits: [soldier], hover: 'resource' })).toBe('default');
    expect(cursorKindFor({ selectedUnits: [soldier, worker], hover: 'ownSite' })).toBe('build');
    expect(cursorKindFor({ selectedUnits: [soldier], hover: 'ownSite' })).toBe('default');
    expect(cursorKindFor({ selectedUnits: [worker], hover: 'ownDamaged' })).toBe('repair');
    expect(cursorKindFor({ selectedUnits: [worker], hover: 'depleted' })).toBe('default');
  });
  it('modo magia: alvo válido = spell, inválido = invalid; chão sempre spell', () => {
    const tm = { kind: 'cast', abilityId: 'x' };
    expect(cursorKindFor({ ...base, targetMode: tm, castValid: true, hover: 'hostile' })).toBe('spell');
    expect(cursorKindFor({ ...base, targetMode: tm, castValid: false, hover: 'ownUnit' })).toBe('invalid');
    expect(cursorKindFor({ ...base, targetMode: tm, hover: 'none' })).toBe('spell');
  });
  it('o modo-alvo tem prioridade sobre a seleção; reparar/atacar-movendo/patrulhar', () => {
    expect(cursorKindFor({ selectedUnits: [worker], targetMode: { kind: 'repair' }, hover: 'ownDamaged' })).toBe('repair');
    expect(cursorKindFor({ selectedUnits: [worker], targetMode: { kind: 'repair' }, hover: 'ownBuilding' })).toBe('invalid');
    expect(cursorKindFor({ ...base, targetMode: { kind: 'attackMove' }, hover: 'none' })).toBe('attack');
    expect(cursorKindFor({ ...base, targetMode: { kind: 'patrol' }, hover: 'hostile' })).toBe('spell');
  });
  it('posicionamento de construção: válido = build, inválido = invalid', () => {
    expect(cursorKindFor({ placing: true, placeValid: true, selectedUnits: [worker] })).toBe('build');
    expect(cursorKindFor({ placing: true, placeValid: false, selectedUnits: [worker] })).toBe('invalid');
  });
});

describe('cursorCss / CursorController', () => {
  it('todo tipo (menos default) tem SVG embutido com hotspot e fallback', () => {
    for (const k of CURSOR_KINDS.filter((x) => x !== 'default')) {
      expect(CURSOR_STYLES[k]).toMatch(/^url\("data:image\/svg\+xml,%3Csvg.+"\) 16 16, [a-z-]+$/);
      expect(cursorCss(k)).toBe(CURSOR_STYLES[k]);
    }
    expect(cursorCss('default')).toBe('');
  });
  it('opção desligada: só a mira clássica no modo-alvo', () => {
    expect(cursorCss('attack', { enabled: false })).toBe('');
    expect(cursorCss('spell', { enabled: false, inTargetMode: true })).toBe('crosshair');
  });
  it('só escreve no elemento quando o valor muda', () => {
    let writes = 0;
    const el = { style: { set cursor(v) { writes++; this._v = v; }, get cursor() { return this._v; } } };
    const c = new CursorController(el);
    c.apply(''); c.apply(''); c.apply('crosshair'); c.apply('crosshair'); c.apply('');
    expect(writes).toBe(3);
  });
});

describe('HoverOutline', () => {
  it('writeBrackets gera 24 segmentos dentro da caixa', () => {
    const arr = new Float32Array(144);
    const n = writeBrackets(arr, new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 4, 6));
    expect(n).toBe(24);
    for (let i = 0; i < 144; i += 3) {
      expect(arr[i]).toBeGreaterThanOrEqual(0); expect(arr[i]).toBeLessThanOrEqual(2);
      expect(arr[i + 1]).toBeLessThanOrEqual(4); expect(arr[i + 2]).toBeLessThanOrEqual(6);
    }
  });
  it('bodyBox ignora anel de seleção, objetos invisíveis e mede o corpo', () => {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2));
    body.position.y = 2;
    const ring = new THREE.Mesh(new THREE.BoxGeometry(20, 0.1, 20));
    ring.name = 'SelectionRing';
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(50, 50, 50));
    hidden.visible = false;
    root.add(body, ring, hidden);
    root.position.set(10, 0, 0);
    const box = new THREE.Box3();
    expect(bodyBox(root, box)).toBe(true);
    expect(box.min.x).toBeCloseTo(9); expect(box.max.x).toBeCloseTo(11);
    expect(box.max.y).toBeCloseTo(4);
    expect(bodyBox(new THREE.Group(), box)).toBe(false);
  });
  it('show/hide: 1 objeto, cor por relação, oculto sem raiz', () => {
    const scene = new THREE.Scene();
    const ho = new HoverOutline(scene);
    expect(scene.children).toHaveLength(1);
    const root = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    scene.add(root);
    ho.show(root, 'hostile');
    expect(ho.visible).toBe(true);
    expect(ho.material.color.getHex()).toBe(OUTLINE_COLORS.hostile);
    ho.show(root, 'ally');
    expect(ho.material.color.getHex()).toBe(OUTLINE_COLORS.ally);
    ho.show(null, 'ally');
    expect(ho.visible).toBe(false);
    ho.dispose();
    expect(scene.children).toHaveLength(1);
  });
});

describe('opções (F6-06)', () => {
  it('hoverOutline: padrão por preset (low desliga) e override validado', () => {
    expect(QUALITY_PRESETS.low.hoverOutline).toBe(false);
    expect(QUALITY_PRESETS.high.hoverOutline).toBe(true);
    expect(sanitizeOverrides({ hoverOutline: 'x' })).toEqual({});
    expect(mergePreset(QUALITY_PRESETS.low, { hoverOutline: true }).hoverOutline).toBe(true);
    expect(mergePreset(QUALITY_PRESETS.med, { hoverOutline: false }).hoverOutline).toBe(false);
  });
  it('contextCursors: padrão ligado, persiste e entra no espelho runtime', () => {
    const m = new Map();
    const st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
    const store = createOptionsStore(st);
    expect(store.get('contextCursors')).toBe(true);
    store.set('contextCursors', false);
    expect(store.get('contextCursors')).toBe(false);
    store.set('contextCursors', 'lixo');
    expect(store.get('contextCursors')).toBe(true);
  });
});
