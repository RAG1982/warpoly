import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeManifest, setManifest, getManifest, resetUiSprites, onUiManifestReady, loadUiManifest, resolveIconId,
  unitIconId, buildingIconId, researchIconId, abilityIconId, commandIconId, statIconId, pickIconSize, iconUrl, portraitId, portraitUrl,
  portraitState, artUrl, spriteImgHtml, installSpriteFallback
} from '../../src/ui/uiSprites.js';
import { UNITS, BUILDINGS, RESEARCH, ABILITIES, researchIdsFor } from '../../src/data/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UI = join(ROOT, 'public', 'ui');

const RAW = {
  version: 1,
  icons: { sizes: [128, 256], ids: ['unit_knight', 'unit_tanker', 'unit_tanker_orc', 'building_castle', 'command_stop', 'research_melee_weapons', 'research_melee_weapons_orc', 'ability_fireball', 'stat_attack'] },
  aliases: { research_spell_fireball: 'ability_fireball', research_a: 'research_b', research_b: 'research_c', research_c: 'research_d', research_d: 'research_e', research_e: 'ability_fireball' },
  portraits: { size: 128, ids: ['knight', 'tanker', 'tanker_orc'] },
  art: { menu: { file: 'art/menu.webp', width: 1920, height: 1080 } }
};

beforeEach(() => resetUiSprites());

describe('uiSprites — manifesto e resolução de ids (F7-09)', () => {
  it('manifesto inválido vira null e nada resolve (a HUD usa o ícone antigo)', () => {
    expect(normalizeManifest(null)).toBeNull();
    expect(normalizeManifest('x')).toBeNull();
    expect(resolveIconId('unit_knight')).toBeNull(); // sem manifesto carregado
    expect(unitIconId('knight')).toBeNull();
    expect(portraitUrl('knight')).toBeNull();
    expect(artUrl('menu')).toBeNull();
  });

  it('resolve ids, variantes de facção e aliases (com limite de saltos)', () => {
    setManifest(RAW);
    expect(resolveIconId('unit_knight')).toBe('unit_knight');
    expect(resolveIconId('unit_inexistente')).toBeNull();
    expect(resolveIconId('research_spell_fireball')).toBe('ability_fireball'); // alias direto
    expect(resolveIconId('research_a')).toBeNull(); // 5 saltos > limite de 4: cadeia suspeita não resolve
    expect(unitIconId('tanker', 'orc')).toBe('unit_tanker_orc');
    expect(unitIconId('tanker', 'human')).toBe('unit_tanker');
    expect(unitIconId('knight', 'orc')).toBe('unit_knight'); // sem variante orc: cai no id base
    expect(buildingIconId('castle')).toBe('building_castle');
    expect(researchIconId('melee_weapons', 'orc')).toBe('research_melee_weapons_orc');
    expect(researchIconId('melee_weapons', 'human')).toBe('research_melee_weapons');
    expect(researchIconId('spell_fireball', 'human')).toBe('ability_fireball');
    expect(abilityIconId('fireball')).toBe('ability_fireball');
    expect(commandIconId('stop')).toBe('command_stop');
    expect(commandIconId('nao_existe')).toBeNull();
    expect(statIconId('attack')).toBe('stat_attack');
    expect(statIconId('nao_existe')).toBeNull();
  });

  it('escolhe 128 ou 256 pelo tamanho em pixels de dispositivo', () => {
    expect(pickIconSize(44, 1, 1)).toBe(128);
    expect(pickIconSize(56, 1.5, 1)).toBe(128);
    expect(pickIconSize(44, 1, 2)).toBe(128); // 88 px de dispositivo
    expect(pickIconSize(70, 1.5, 2)).toBe(256); // 210 px
    expect(pickIconSize(500, 1, 1)).toBe(256); // nunca passa do maior tamanho
    setManifest(RAW);
    expect(iconUrl('unit_knight', 128, getManifest(), '/')).toBe('/ui/icons/128/unit_knight.webp');
    expect(iconUrl('research_spell_fireball', 256, getManifest(), './')).toBe('./ui/icons/256/ability_fireball.webp');
    expect(iconUrl('x', 128, getManifest())).toBeNull();
  });

  it('retratos: variante de facção, estados e URL', () => {
    setManifest(RAW);
    expect(portraitId('knight')).toBe('knight');
    expect(portraitId('tanker', 'orc')).toBe('tanker_orc');
    expect(portraitId('tanker', 'human')).toBe('tanker');
    expect(portraitId('sheep')).toBeNull();
    expect(portraitUrl('knight', 'attack', 'human', getManifest(), '/')).toBe('/ui/portraits/knight_attack.webp');
    expect(portraitUrl('knight', 'qualquer', 'human', getManifest(), '/')).toBe('/ui/portraits/knight_idle.webp');
    expect(artUrl('menu', getManifest(), '/')).toBe('/ui/art/menu.webp');
    expect(artUrl('loading', getManifest(), '/')).toBeNull();
  });

  it('estado do retrato: ataque só enquanto golpeia/lança e a unidade está viva', () => {
    expect(portraitState({ anim: 'idle' })).toBe('idle');
    expect(portraitState({ anim: 'walk' })).toBe('idle');
    expect(portraitState({ anim: 'fight' })).toBe('attack');
    expect(portraitState({ anim: 'cast' })).toBe('attack');
    expect(portraitState({ anim: 'fight', isDying: true })).toBe('idle');
    expect(portraitState({ anim: 'fight', isDead: true })).toBe('idle');
    expect(portraitState(null)).toBe('idle');
  });
});

describe('uiSprites — HTML com fallback sprite -> ícone antigo -> emoji', () => {
  it('sem manifesto: ícone antigo; sem ícone antigo: emoji', () => {
    const legacy = spriteImgHtml({ id: 'unit_knight', cls: 'ic', alt: 'A"B', fallbackSrc: '/icoEspada.png', fallbackEmoji: '⚔️' });
    expect(legacy).toContain('src="/icoEspada.png"');
    expect(legacy).toContain('alt="A&quot;B"');
    expect(legacy).toContain('data-ui-sprite=""');
    expect(legacy).toContain('data-fb-emoji="⚔️"');
    const emoji = spriteImgHtml({ id: 'command_stop', cls: 'ic', fallbackEmoji: '🛑' });
    expect(emoji).toContain('<span class="ic ui-sprite-emoji"');
    expect(emoji).toContain('🛑');
  });

  it('com manifesto: <img> do sprite com os dados do fallback e o tamanho certo', () => {
    setManifest(RAW);
    const a = spriteImgHtml({ id: 'unit_knight', cssPx: 44, cls: 'ic', alt: 'Espadachim', fallbackSrc: '/icoEspada.png', fallbackEmoji: '⚔️', base: '/' });
    expect(a).toContain('src="/ui/icons/128/unit_knight.webp"');
    expect(a).toContain('data-ui-sprite="unit_knight"');
    expect(a).toContain('data-fb-src="/icoEspada.png"');
    const big = spriteImgHtml({ id: 'unit_knight', cssPx: 100, uiScale: 1.5, dpr: 2, base: '/' });
    expect(big).toContain('/ui/icons/256/unit_knight.webp');
    // id que não existe no manifesto -> volta ao ícone antigo (e o emoji padrão do tipo se não houver nada)
    expect(spriteImgHtml({ id: 'unit_xyz', fallbackSrc: '/a.png' })).toContain('src="/a.png"');
    expect(spriteImgHtml({ id: 'building_xyz' })).toContain('🏠');
  });

  it('instalador: 1º erro troca para o ícone antigo, 2º troca a imagem por um <span> com o emoji', () => {
    let handler = null;
    let removed = false;
    const doc = {
      addEventListener: (type, fn, capture) => { expect(type).toBe('error'); expect(capture).toBe(true); handler = fn; },
      removeEventListener: () => { removed = true; },
      createElement: () => ({ className: '', textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } })
    };
    const attrs = { 'data-ui-sprite': 'unit_knight', 'data-fb-src': '/icoEspada.png', 'data-fb-emoji': '⚔️' };
    let replacement = null;
    const img = {
      tagName: 'IMG', className: 'bld-train-btn-icon', src: '/ui/icons/128/unit_knight.webp',
      hasAttribute: (k) => k in attrs, getAttribute: (k) => attrs[k] ?? null, setAttribute: (k, v) => { attrs[k] = v; },
      replaceWith: (n) => { replacement = n; }
    };
    const off = installSpriteFallback(doc);
    expect(typeof handler).toBe('function');
    handler({ target: img });
    expect(img.src).toBe('/icoEspada.png');
    expect(replacement).toBeNull();
    handler({ target: img });
    expect(replacement.textContent).toBe('⚔️');
    expect(replacement.className).toBe('bld-train-btn-icon ui-sprite-emoji');
    // não é <img data-ui-sprite>: ignorado
    replacement = null;
    handler({ target: { tagName: 'IMG', hasAttribute: () => false } });
    handler({ target: { tagName: 'DIV', hasAttribute: () => true } });
    expect(replacement).toBeNull();
    // idempotente: a segunda instalação no mesmo documento não registra outro ouvinte
    expect(installSpriteFallback(doc)).toBeTypeOf('function');
    off();
    expect(removed).toBe(true);
  });

  it('instalador: trata <img> estáticas que já falharam ANTES da instalação (o evento de erro já passou)', () => {
    const attrs = { 'data-ui-sprite': 'command_cancel', 'data-fb-emoji': '✖️' };
    let replacement = null;
    const mkImg = (complete, naturalWidth) => ({
      tagName: 'IMG', className: 'bld-btn-icon', complete, naturalWidth,
      hasAttribute: (k) => k in attrs, getAttribute: (k) => attrs[k] ?? null, setAttribute: (k, v) => { attrs[k] = v; },
      replaceWith: (n) => { replacement = n; }
    });
    const doc = {
      addEventListener: () => {}, removeEventListener: () => {},
      createElement: () => ({ className: '', textContent: '', setAttribute() {} }),
      querySelectorAll: () => [mkImg(true, 64), mkImg(false, 0), mkImg(true, 0)] // carregada, carregando, quebrada
    };
    installSpriteFallback(doc);
    expect(replacement).not.toBeNull(); // só a quebrada (complete + largura 0) é trocada
    expect(replacement.textContent).toBe('✖️');
    expect(replacement.className).toBe('bld-btn-icon ui-sprite-emoji');
  });

  it('loadUiManifest: memoiza, avisa os inscritos e nunca rejeita (falha => null)', async () => {
    let calls = 0;
    const ok = async () => { calls++; return { ok: true, json: async () => RAW }; };
    let notified = 0;
    onUiManifestReady(() => { notified++; });
    const m = await loadUiManifest(ok, '/');
    expect(m.iconIds.has('unit_knight')).toBe(true);
    expect(notified).toBe(1);
    await loadUiManifest(ok, '/');
    expect(calls).toBe(1);
    resetUiSprites();
    expect(await loadUiManifest(async () => { throw new Error('offline'); }, '/')).toBeNull();
    resetUiSprites();
    expect(await loadUiManifest(async () => ({ ok: false, json: async () => ({}) }), '/')).toBeNull();
    resetUiSprites();
    expect(await loadUiManifest(async () => ({ ok: true, json: async () => { throw new Error('json ruim'); } }), '/')).toBeNull();
    expect(getManifest()).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Os arquivos reais de public/ui/ (saída do Blender): consistentes com o manifesto, com o jogo e dentro do orçamento
// ---------------------------------------------------------------------------------------------------------------------
/** Dimensões/alfa de um .webp (VP8, VP8L ou VP8X) lidas direto do cabeçalho RIFF. */
function webpInfo(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`${file}: não é WebP`);
  const fmt = b.toString('ascii', 12, 16);
  if (fmt === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, alpha: false };
  if (fmt === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1, alpha: !!((v >> 28) & 1) }; }
  if (fmt === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)), alpha: !!(b[20] & 0x10) };
  throw new Error(`${file}: formato WebP ${fmt}`);
}

function walkSize(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    total += statSync(full).isDirectory() ? walkSize(full) : statSync(full).size;
  }
  return total;
}

const manifestPath = join(UI, 'manifest.json');
const hasManifest = existsSync(manifestPath);
const real = hasManifest ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;

// Tipos que ainda não têm .glb (o jogo usa modelo procedural): ficam com o ícone antigo — ver docs/TASKS.md F7-09.
const NO_GLB_UNITS = ['sheep', 'submersible', 'colossal_turtle'];
const NO_GLB_BUILDINGS = ['refinery', 'foundry', 'naval_forge', 'ash_cauldron'];

describe.skipIf(!hasManifest)('public/ui — sprites reais (F7-09)', () => {
  const m = hasManifest ? normalizeManifest(real) : null;

  it('todo ícone do manifesto existe em 128 e 256, com transparência e o tamanho certo', () => {
    expect(m.iconIds.size).toBeGreaterThan(100);
    for (const id of m.iconIds) {
      for (const size of m.iconSizes) {
        const f = join(UI, 'icons', String(size), `${id}.webp`);
        expect(existsSync(f), f).toBe(true);
        const info = webpInfo(f);
        expect([info.w, info.h], f).toEqual([size, size]);
        expect(info.alpha, `${f}: fundo transparente`).toBe(true);
      }
    }
  });

  it('todo retrato tem o quadro idle e o de ataque (128x128)', () => {
    expect(m.portraitIds.size).toBeGreaterThan(25);
    for (const id of m.portraitIds) {
      for (const st of ['idle', 'attack']) {
        const f = join(UI, 'portraits', `${id}_${st}.webp`);
        expect(existsSync(f), f).toBe(true);
        const info = webpInfo(f);
        expect([info.w, info.h], f).toEqual([128, 128]);
      }
    }
  });

  it('artes do menu e do loading existem e cabem em 1920x1080', () => {
    for (const name of ['menu', 'loading']) {
      const a = real.art[name];
      expect(a, name).toBeTruthy();
      const info = webpInfo(join(UI, a.file));
      expect(info.w).toBeLessThanOrEqual(1920);
      expect(info.h).toBeLessThanOrEqual(1080);
      expect([info.w, info.h]).toEqual([a.width, a.height]);
    }
  });

  it('public/ui fica abaixo de 15 MB e o manifesto registra o total real', () => {
    const total = walkSize(UI) - statSync(manifestPath).size;
    expect(total).toBeLessThanOrEqual(15 * 1024 * 1024);
    expect(real.bytes.total).toBe(total);
  });

  it('aliases apontam para ícones que existem', () => {
    for (const [from, to] of Object.entries(m.aliases)) {
      expect(resolveIconId(from, m), `${from} -> ${to}`).not.toBeNull();
    }
  });

  it('as unidades, construções, pesquisas e magias do jogo têm sprite (exceto os tipos sem .glb)', () => {
    for (const type of Object.keys(UNITS)) {
      if (NO_GLB_UNITS.includes(type)) continue;
      expect(unitIconId(type, 'human', m), `ícone de unidade ${type}`).not.toBeNull();
      expect(portraitId(type, 'human', m), `retrato de ${type}`).not.toBeNull();
    }
    for (const type of Object.keys(BUILDINGS)) {
      if (NO_GLB_BUILDINGS.includes(type)) continue;
      expect(buildingIconId(type, 'human', m), `ícone de construção ${type}`).not.toBeNull();
    }
    for (const faction of ['human', 'orc']) {
      for (const role of ['forge', 'lumber', 'arcane', 'temple', 'foundry']) {
        for (const id of researchIdsFor(role, faction)) {
          expect(researchIconId(id, faction, m), `pesquisa ${id} (${faction})`).not.toBeNull();
        }
      }
    }
    for (const id of Object.keys(RESEARCH)) expect(researchIconId(id, 'human', m) || researchIconId(id, 'orc', m), `pesquisa ${id}`).not.toBeNull();
    for (const id of Object.keys(ABILITIES)) expect(abilityIconId(id, m), `habilidade ${id}`).not.toBeNull();
    for (const cmd of ['stop', 'repair', 'unload', 'cancel', 'upgrade_hq']) expect(commandIconId(cmd, 'human', m), cmd).not.toBeNull();
    // atributos da linha de status do card (UIManager._stat)
    for (const n of ['attack', 'armor', 'speed', 'range', 'cargo', 'mana', 'air', 'naval', 'suicide', 'area', 'submerged', 'build', 'pop', 'tower']) {
      expect(statIconId(n, m), `atributo ${n}`).not.toBeNull();
    }
    expect(commandIconId('upgrade_hq', 'orc', m)).toBe('command_upgrade_hq_orc');
    // variantes de facção dos navios neutros
    expect(unitIconId('tanker', 'orc', m)).toBe('unit_tanker_orc');
    expect(unitIconId('barge', 'orc', m)).toBe('unit_barge_orc');
  });
});
