// M3-14: retratos de NPC nos diálogos (arquivo existe, manifesto lista, fallback a emoji).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeManifest } from '../../src/ui/uiSprites.js';
import { NPC_SPEAKERS, npcPortraitIdForSpeaker, npcPortraitUrl, portraitInnerHtml } from '../../src/ui/npcPortraits.js';

const ROOT = path.resolve(__dirname, '../..');
const manifestRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/ui/manifest.json'), 'utf8'));
const manifest = normalizeManifest(manifestRaw);

function collectSpeakers(campaign = 'war-alliance') {
  const dir = path.join(ROOT, 'src/data/campaigns', campaign);
  const out = [];
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      if (o.speaker && o.portrait) out.push(o);
      Object.values(o).forEach(walk);
    }
  };
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) walk(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  return out;
}

describe('retratos de NPC (M3-14)', () => {
  it('todo NPC registrado tem arquivo webp e consta no manifesto', () => {
    for (const id of Object.keys(NPC_SPEAKERS)) {
      expect(fs.existsSync(path.join(ROOT, `public/ui/portraits/npc_${id}.webp`)), id).toBe(true);
      expect(manifest.npcPortraitIds.has(id), id).toBe(true);
    }
    for (const id of manifest.npcPortraitIds) expect(fs.existsSync(path.join(ROOT, `public/ui/portraits/npc_${id}.webp`)), id).toBe(true);
  });

  it('todo falante com retrato resolvido aponta para arquivo existente', () => {
    const resolved = new Set();
    for (const d of collectSpeakers()) {
      const url = npcPortraitUrl(d, manifest, '/');
      const id = npcPortraitIdForSpeaker(d.speaker);
      if (!id) { expect(url).toBeNull(); continue; }
      resolved.add(id);
      expect(url, JSON.stringify(d.speaker)).toBeTruthy();
      expect(fs.existsSync(path.join(ROOT, 'public', url)), url).toBe(true);
    }
    for (const id of ['sevelin', 'orsolo', 'lyra', 'mervane', 'tomas_rocha', 'elara', 'brumar', 'isolda', 'aurora', 'brakka', 'grok', 'orvanna']) {
      expect(resolved.has(id), id).toBe(true);
    }
  });

  it('M4-13: todo falante nomeado da Horda tem retrato (NPC ou herói); papéis genéricos ficam no emoji', () => {
    const named = ['ulma', 'hurgan', 'narga', 'rurga', 'zarruk', 'brakka', 'grok', 'orvanna', 'lyra', 'mervane',
      'hero_brann', 'hero_dorian', 'hero_oren', 'hero_drogath', 'hero_vozgul', 'hero_skarn'];
    const resolved = new Set();
    for (const d of collectSpeakers('war-horde')) {
      const id = npcPortraitIdForSpeaker(d.speaker);
      if (!id) continue;
      resolved.add(id);
      const url = npcPortraitUrl(d, manifest, '/');
      expect(url, JSON.stringify(d.speaker)).toBeTruthy();
      expect(fs.existsSync(path.join(ROOT, 'public', url)), url).toBe(true);
    }
    for (const id of named) expect(resolved.has(id), id).toBe(true);
    for (const w of ['Hurgan', 'Ulma', 'Narga', 'Rurga', 'Zarruk']) expect(npcPortraitIdForSpeaker(w + ' X')).toBeTruthy();
    expect(npcPortraitIdForSpeaker({ 'pt-BR': 'Carregador dos Marés Negras', en: 'Black Tides porter' })).toBeNull();
  });

  it('nomes pt-BR e en resolvem o mesmo NPC; papéis genéricos ficam sem retrato', () => {
    expect(npcPortraitIdForSpeaker({ 'pt-BR': 'Rainha Sevelin', en: 'Queen Sevelin' })).toBe('sevelin');
    expect(npcPortraitIdForSpeaker({ 'pt-BR': 'Sgt. Tomás Rocha', en: 'Sgt. Tomás Rocha' })).toBe('tomas_rocha');
    expect(npcPortraitIdForSpeaker({ 'pt-BR': 'Capitão Brann', en: 'Captain Brann' })).toBe('hero_brann');
    expect(npcPortraitIdForSpeaker({ 'pt-BR': 'Brumar, do Porto', en: 'Brumar of the Harbor' })).toBe('brumar');
    expect(npcPortraitIdForSpeaker({ 'pt-BR': 'Capitão de Brumar', en: 'Captain of Brumar' })).toBeNull();
    expect(npcPortraitIdForSpeaker({ 'pt-BR': 'Batedor libertado', en: 'Freed Scout' })).toBeNull();
    expect(npcPortraitIdForSpeaker(undefined)).toBeNull();
  });

  it('fallback a emoji: sem manifesto, sem arquivo listado ou sem falante', () => {
    const d = { speaker: { 'pt-BR': 'Rainha Sevelin', en: 'Queen Sevelin' }, portrait: '👑' };
    expect(portraitInnerHtml(d, '💬', null)).toBe('👑');
    const vazio = normalizeManifest({ version: 1, npcPortraits: { ids: [] }, portraits: { ids: [] } });
    expect(portraitInnerHtml(d, '💬', vazio)).toBe('👑');
    expect(portraitInnerHtml({ text: 'x' }, '💬', manifest)).toBe('💬');
    const html = portraitInnerHtml(d, '💬', manifest, '/');
    expect(html).toContain('<img');
    expect(html).toContain('/ui/portraits/npc_sevelin.webp');
    expect(html).toContain('data-fb-emoji="👑"');
  });

  it('portraitId explícito vence o nome do falante', () => {
    const d = { speaker: 'Alguém', portraitId: 'grok', portrait: '🪓' };
    expect(npcPortraitUrl(d, manifest, '/')).toBe('/ui/portraits/npc_grok.webp');
  });
});
