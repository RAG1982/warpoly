import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';
import ptBR from '../../src/i18n/pt-BR.json';
import en from '../../src/i18n/en.json';
import {
  createI18n, detectLanguage, LANG_STORAGE_KEY, translateSimText
} from '../../src/i18n/index.js';
import { localizeSimText, requirementText, playerDisplayName } from '../../src/ui/uiText.js';
import { UNITS, BUILDINGS, ABILITIES, RESEARCH, TIER_NAMES, FACTIONS } from '../../src/data/index.js';
import { listMaps } from '../../src/data/maps/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fakeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('i18n — dicionários (F6-09)', () => {
  it('pt-BR e en têm exatamente as mesmas chaves', () => {
    const a = Object.keys(ptBR).sort();
    const b = Object.keys(en).sort();
    expect(a.filter((k) => !(k in en)), 'chaves só em pt-BR').toEqual([]);
    expect(b.filter((k) => !(k in ptBR)), 'chaves só em en').toEqual([]);
  });

  it('os parâmetros {x} de cada chave são os mesmos nos dois idiomas', () => {
    for (const k of Object.keys(ptBR)) expect(placeholders(en[k]), k).toBe(placeholders(ptBR[k]));
  });

  it('nenhum valor vazio (exceto descrições sem texto) e en sem acentuação portuguesa', () => {
    for (const [k, v] of Object.entries(ptBR)) if (!k.endsWith('.desc')) expect(v.trim(), `pt-BR ${k}`).not.toBe('');
    for (const [k, v] of Object.entries(en)) {
      if (!k.endsWith('.desc')) expect(v.trim(), `en ${k}`).not.toBe('');
      expect(v, `en ${k}`).not.toMatch(/[ãõçáàâéêíóôúÃÕÇÁÉÍÓÚ]/);
    }
  });

  it('todo id de dados tem nome/descrição nos dois idiomas, e o pt-BR espelha o def', () => {
    for (const [id, u] of Object.entries(UNITS)) {
      expect(ptBR[`unit.${id}.name`], id).toBe(u.entityName || u.name);
      expect(en[`unit.${id}.name`], id).toBeTruthy();
      expect(ptBR[`unit.${id}.desc`]).toBe(u.description || '');
    }
    for (const [id, b] of Object.entries(BUILDINGS)) {
      expect(ptBR[`building.${id}.name`], id).toBe(b.entityName || b.name);
      expect(en[`building.${id}.name`], id).toBeTruthy();
      expect(ptBR[`building.${id}.desc`]).toBe(b.description || '');
    }
    for (const [id, a] of Object.entries(ABILITIES)) {
      expect(ptBR[`ability.${id}.name`], id).toBe(typeof a.name === 'string' ? a.name : a.name.human);
      expect(en[`ability.${id}.desc`], id).toBeTruthy();
    }
    for (const id of Object.keys(RESEARCH)) {
      expect(ptBR[`research.${id}.human`], id).toBeTruthy();
      expect(en[`research.${id}.orc`], id).toBeTruthy();
    }
    for (const f of Object.keys(TIER_NAMES)) for (const n of [1, 2, 3]) expect(ptBR[`tier.${f}.${n}`]).toBe(TIER_NAMES[f][n]);
    for (const f of Object.keys(FACTIONS)) {
      expect(ptBR[`faction.${f}.name`]).toBe(FACTIONS[f].name);
      expect(en[`faction.${f}.name`]).toBeTruthy();
    }
    for (const m of listMaps()) {
      expect(ptBR[`map.${m.id}.name`], m.id).toBe(m.name);
      expect(en[`map.${m.id}.name`], m.id).toBeTruthy();
    }
  });

  it('en não usa nomes/lore da Blizzard nos nomes de unidade/construção', () => {
    const banned = /\b(grunt|peon|horde|alliance|footman|thrall|stormwind|orgrimmar|archmage|death knight)\b/i;
    for (const [k, v] of Object.entries(en)) if (/^(unit|building|faction|ability|research)\./.test(k)) expect(v, k).not.toMatch(banned);
  });

  it('toda chave estática t(\'…\') / data-i18n usada no código existe em pt-BR', () => {
    const files = walk(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js')).concat([path.join(ROOT, 'index.html')]);
    const missing = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const re = /(?:\bt\(\s*|data-i18n[a-z-]*=")'?"?([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)['"]/g;
      let m;
      while ((m = re.exec(src))) {
        const k = m[1];
        if (!(k in ptBR) && !(`${k}.one` in ptBR) && !(`${k}.other` in ptBR)) missing.push(`${path.relative(ROOT, f)}: ${k}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('i18n — t(), idioma e fallback', () => {
  const dicts = {
    'pt-BR': { 'a.b': 'Olá {name}', 'only.pt': 'só pt', 'n.one': '{count} item', 'n.other': '{count} itens' },
    en: { 'a.b': 'Hello {name}', 'n.one': '{count} item', 'n.other': '{count} items' }
  };
  it('detecta o idioma do navegador no primeiro uso e respeita o salvo', () => {
    expect(detectLanguage('pt-BR')).toBe('pt-BR');
    expect(detectLanguage('pt-PT')).toBe('pt-BR');
    expect(detectLanguage('en-US')).toBe('en');
    expect(detectLanguage('fr')).toBe('en');
    expect(detectLanguage('')).toBe('pt-BR');
    expect(createI18n({ dicts, storage: fakeStorage(), navLang: 'en-GB' }).getLanguage()).toBe('en');
    expect(createI18n({ dicts, storage: fakeStorage(), navLang: 'pt-BR' }).getLanguage()).toBe('pt-BR');
    expect(createI18n({ dicts, storage: fakeStorage({ [LANG_STORAGE_KEY]: 'pt-BR' }), navLang: 'en-US' }).getLanguage()).toBe('pt-BR');
    expect(createI18n({ dicts, storage: fakeStorage({ [LANG_STORAGE_KEY]: 'xx' }), navLang: 'en-US' }).getLanguage()).toBe('en');
  });
  it('setLanguage persiste, notifica e ignora idioma desconhecido', () => {
    const st = fakeStorage();
    const i = createI18n({ dicts, storage: st, navLang: 'pt-BR' });
    const seen = [];
    i.onLanguageChange((l) => seen.push(l));
    i.setLanguage('xx');
    expect(i.getLanguage()).toBe('pt-BR');
    i.setLanguage('en');
    expect(st._m.get(LANG_STORAGE_KEY)).toBe('en');
    expect(seen).toEqual(['en']);
  });
  it('interpola, cai no pt-BR e depois na chave; plural por count', () => {
    const i = createI18n({ dicts, storage: fakeStorage(), navLang: 'en-US' });
    expect(i.t('a.b', { name: 'Rafa' })).toBe('Hello Rafa');
    expect(i.t('only.pt')).toBe('só pt');
    expect(i.t('nada.disso')).toBe('nada.disso');
    expect(i.t('nada.disso', { fallback: 'x' })).toBe('x');
    expect(i.t('n', { count: 1 })).toBe('1 item');
    expect(i.t('n', { count: 3 })).toBe('3 items');
    expect(i.t('a.b')).toBe('Hello {name}');
  });
});

describe('i18n — mensagens da simulação (PT literal) traduzidas na exibição', () => {
  it('textos fixos casam com as chaves sim.* (com ou sem emoji), o resto passa intacto', () => {
    expect(translateSimText('⚠️ Recursos insuficientes!')).toBe('⚠️ Recursos insuficientes!'); // idioma de teste = pt-BR
    expect(translateSimText('Texto desconhecido')).toBe('Texto desconhecido');
    for (const [k, v] of Object.entries(ptBR)) if (k.startsWith('sim.') && !v.includes('{')) expect(translateSimText(v), k).toBe(v);
  });
  it('"Requer: …", recompensa do acampamento e onda da IA são reconhecidos', () => {
    expect(localizeSimText('⚠️ Requer: Fazenda de Trigo')).toBe('⚠️ Requer: Fazenda de Trigo');
    expect(localizeSimText('Acampamento de bandidos destruído! +300 de ouro')).toBe('Acampamento de bandidos destruído! +300 ouro');
    expect(localizeSimText('⚔️ A Horda Orc reuniu um esquadrão de guerra (7 tropas) e avança contra sua base!')).toContain('Clãs Orcs');
    expect(requirementText({ hq: 2 }, 'human')).toBe('Centro nível 2 (Fortaleza)');
    expect(playerDisplayName('IA 3')).toBe('IA 3');
    expect(playerDisplayName('Você')).toBe('Você');
  });
});

// ---------------------------------------------------------------------------------------------
// Heurística "nenhuma string PT-BR literal na UI"
//  - lê os arquivos de UI, extrai literais de string/template (comentários e código ficam de fora);
//  - uma string é "PT-BR" se tem letra acentuada do português OU uma palavra típica do português
//    (lista abaixo) — chaves i18n, ids, classes CSS e logs de console não contam;
//  - exceções legítimas vão para ALLOW (arquivo → trechos), com o motivo.
// Para novos arquivos de UI: o teste os pega sozinho (src/ui/**). Texto novo = chave em src/i18n.
// ---------------------------------------------------------------------------------------------
const UI_GLOBS = ['src/ui', 'src/i18n'];
const UI_FILES_EXTRA = ['src/core/InputManager.js', 'src/render/VfxEvents.js', 'src/main.js'];
const PT_WORDS = /\b(não|para|uma|você|seu|sua|dos|das|nos|nas|pelo|pela|com|sem|mais|muito|cada|esta|este|isso|clique|ouro|madeira|pedra|vida|jogo|partida|opções|voltar|fechar|iniciar|cancelar|salvar|carregar|sair|recursos|construção|unidades|treinar|nível|jogador|oponente|vitória|derrota|requer|custo|alcance|ataque|defesa)\b/i;
const PT_ACCENT = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/;
/** Strings que são dados do código, não texto para o jogador. `file` = fim do caminho; `text` = trecho exato. */
const ALLOW = [
  { file: 'src/ui/UiEvents.js', text: '⚔️', why: 'emoji de ícone' },
  // Chaves de armazenamento / dados de domínio legados em PT que não são exibidos:
  { file: 'src/ui/uiText.js', text: 'Oficina', why: 'busca reversa: nome PT literal emitido pela simulação (src/sim/requirements.js)' },
  { file: 'src/ui/uiText.js', text: 'Centro nível', why: 'regex de mensagens PT da simulação' },
  { file: 'src/ui/uiText.js', text: 'Requer:', why: 'regex de mensagens PT da simulação' },
  { file: 'src/ui/uiText.js', text: 'Acampamento de bandidos', why: 'regex de mensagens PT da simulação' },
  { file: 'src/ui/uiText.js', text: 'Horda Orc', why: 'regex de mensagens PT da simulação' },
  { file: 'src/ui/uiText.js', text: 'Aliança Humana', why: 'regex de mensagens PT da simulação' },
  { file: 'src/ui/uiText.js', text: 'reuniu um esquadrão', why: 'regex de mensagens PT da simulação' },
  { file: 'src/ui/uiText.js', text: 'de (ouro|madeira|pedra)', why: 'regex de mensagens PT da simulação' },
  { file: 'src/ui/uiText.js', text: 'Você', why: 'nome padrão do jogador na simulação (MatchConfig)' },
  { file: 'src/ui/uiText.js', text: 'IA', why: 'nome padrão da IA na simulação (MatchConfig)' },
  { file: 'src/ui/uiText.js', text: 'ouro', why: 'tabela de mapeamento PT → id de recurso' },
  { file: 'src/ui/uiText.js', text: 'madeira', why: 'tabela de mapeamento PT → id de recurso' },
  { file: 'src/ui/uiText.js', text: 'pedra', why: 'tabela de mapeamento PT → id de recurso' },
  { file: 'src/ui/optionsStore.js', text: 'Opção desconhecida', why: 'erro de programação (não exibido ao jogador)' },
  { file: 'src/i18n/index.js', text: 'Português (Brasil)', why: 'nome do idioma, sempre na própria língua' },
  { file: 'src/ui/screens/OptionsPanel.js', text: 'Português', why: 'nome do idioma, sempre na própria língua' }
];

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function stringLiterals(src) {
  const ast = espree.parse(src, { ecmaVersion: 2023, sourceType: 'module', loc: true });
  const out = [];
  (function visit(node, parent) {
    if (!node || typeof node.type !== 'string') return;
    const isConsole = parent && parent.type === 'CallExpression' && parent.callee && parent.callee.type === 'MemberExpression'
      && parent.callee.object && parent.callee.object.name === 'console';
    if (node.type === 'Literal' && typeof node.value === 'string' && !isConsole) out.push({ line: node.loc.start.line, text: node.value });
    else if (node.type === 'TemplateLiteral' && !(parent && parent.type === 'TaggedTemplateExpression')) {
      for (const q of node.quasis) if (!isConsole) out.push({ line: q.loc.start.line, text: q.value.cooked || '' });
    }
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (key === 'loc' || key === 'type') continue;
      if (Array.isArray(v)) v.forEach((c) => visit(c, node));
      else if (v && typeof v.type === 'string') visit(v, node);
    }
  })(ast, null);
  return out;
}

/** Comentários HTML dentro de templates não são renderizados — ficam de fora. */
const stripHtmlComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');
const looksPortuguese = (s) => PT_ACCENT.test(stripHtmlComments(s)) || PT_WORDS.test(stripHtmlComments(s));
const isAllowed = (rel, text) => ALLOW.some((a) => rel.endsWith(a.file) && text.includes(a.text));

describe('i18n — sem texto PT-BR hardcoded na UI (heurística documentada acima)', () => {
  const files = UI_GLOBS.flatMap((d) => walk(path.join(ROOT, d))).filter((f) => f.endsWith('.js'))
    .concat(UI_FILES_EXTRA.map((f) => path.join(ROOT, f)));

  it('a heurística realmente pega texto PT (anti-regressão do próprio teste)', () => {
    const sample = stringLiterals("const a = 'Recursos insuficientes'; const b = `Fila cheia: ${x}`; const c = 'idle'; console.warn('Não carregou');");
    expect(sample.filter((s) => looksPortuguese(s.text)).map((s) => s.text)).toEqual(['Recursos insuficientes']);
    expect(stringLiterals('const t = `Construção ${n}`;').some((s) => looksPortuguese(s.text))).toBe(true);
  });

  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    it(rel, () => {
      const offenders = stringLiterals(fs.readFileSync(file, 'utf8'))
        .filter((s) => looksPortuguese(s.text) && !isAllowed(rel, s.text))
        .map((s) => `${rel}:${s.line}: ${JSON.stringify(s.text).slice(0, 90)}`);
      expect(offenders, 'texto PT-BR literal — mova para src/i18n/*.json (ou justifique em ALLOW)').toEqual([]);
    });
  }

  it('index.html: todo texto visível/atributo traduzível passa por data-i18n*', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    // Remove o conteúdo de elementos com data-i18n / data-i18n-html (o texto interno é só fallback do HTML estático).
    let rest = html.replace(/<(\w+)\b[^>]*\bdata-i18n(?:-html)?="[^"]*"[^>]*>[\s\S]*?<\/\1>/g, '');
    // Atributos title/alt/aria-label cobertos por data-i18n-title/-alt/-aria na mesma tag.
    rest = rest.replace(/<[^>]*>/g, (tag) => tag
      .replace(/\btitle="[^"]*"(?=[^>]*data-i18n-title)|(?<=data-i18n-title="[^"]*"[^>]*)\btitle="[^"]*"/g, '')
      .replace(/\balt="[^"]*"(?=[^>]*data-i18n-alt)|(?<=data-i18n-alt="[^"]*"[^>]*)\balt="[^"]*"/g, '')
      .replace(/\baria-label="[^"]*"(?=[^>]*data-i18n-aria)|(?<=data-i18n-aria="[^"]*"[^>]*)\baria-label="[^"]*"/g, ''));
    const withoutScripts = rest.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
    const hits = [];
    for (const m of withoutScripts.matchAll(/>([^<>]+)</g)) if (m[1].trim() && looksPortuguese(m[1])) hits.push(m[1].trim());
    for (const m of withoutScripts.matchAll(/\b(?:title|alt|aria-label|placeholder)="([^"]*)"/g)) if (looksPortuguese(m[1])) hits.push(m[1]);
    expect(hits).toEqual([]);
  });
});
