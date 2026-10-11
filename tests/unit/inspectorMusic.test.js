import { describe, it, expect } from 'vitest';
import {
  MUSIC_GROUPS, buildMusicModel, formatTime, tonicName, metaLine, describeTrack, initialEnabledSet, setEnabled, playlistFrom,
  nextInPlaylist, selectionJson, transitionPlan, minutesForIntensity
} from '../../src/inspector/musicPanelModel.js';
import { MusicPreview } from '../../src/inspector/musicPreview.js';
import { listHtml, cardHtml, countText, esc } from '../../src/inspector/musicPanelView.js';
import { MUSIC_CATALOG, MUSIC_SELECTION_KEY, enabledIds, getTrack } from '../../src/audio/music/catalog.js';
import { createFakeAudioContextClass } from './helpers/fakeAudio.js';

// Player de músicas do inspetor: modelo PURO da lista/seleção + controlador de áudio (com AudioContext falso).

const defaults = new Set(enabledIds());

describe('modelo da lista (puro)', () => {
  it('7 grupos na ordem pedida; cada faixa do catálogo aparece uma única vez', () => {
    const m = buildMusicModel(defaults);
    expect(m.groups.map((g) => g.label)).toEqual(['Abertura', 'Reino / paz', 'Reino / combate', 'Horda / paz', 'Horda / combate', 'Vitória / Derrota', 'Candidatas novas']);
    expect(MUSIC_GROUPS).toHaveLength(7);
    const ids = m.groups.flatMap((g) => g.sections.flatMap((s) => s.items.map((i) => i.id)));
    expect(ids.sort()).toEqual(MUSIC_CATALOG.map((e) => e.id).sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(m.totals.total).toBe(MUSIC_CATALOG.length);
    expect(m.totals.enabled).toBe(defaults.size);
  });

  it('as atuais ficam nos grupos da facção e as candidatas, em "Candidatas novas" separadas por família', () => {
    const m = buildMusicModel(defaults);
    const g = (id) => m.groups.find((x) => x.id === id);
    expect(g('title').total).toBe(1);
    for (const f of ['human_peace', 'human_combat', 'orc_peace', 'orc_combat']) expect(g(f).total, f).toBe(3);
    expect(g('endings').total).toBe(4);
    const cand = g('candidates');
    expect(cand.sections.map((s) => s.label)).toEqual(['Abertura', 'Reino / paz', 'Reino / combate', 'Horda / paz', 'Horda / combate']);
    expect(cand.total).toBe(2 + 5 + 6 + 5 + 6);
    expect(cand.sections.every((s) => s.items.every((i) => i.candidate && !i.checked))).toBe(true);
    // "No jogo" refletindo os padrões
    expect(g('human_peace').checked).toBe(3);
    expect(g('human_combat').checked).toBe(0);
    expect(g('title').sections[0].items[0]).toMatchObject({ id: 'title_0', checked: true });
  });

  it('textos em PT-BR: tempo, tônica, linha técnica e cartão da faixa', () => {
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(-3)).toBe('0:00');
    expect(formatTime(NaN)).toBe('0:00');
    expect(tonicName(38)).toBe('Ré');
    expect(tonicName(45)).toBe('Lá');
    expect(tonicName(null)).toBe('');
    const e = getTrack('title_0');
    expect(metaLine(e)).toBe(`96 bpm · 4/4 · Ré menor harmônico · ${formatTime(e.seconds)}`);
    const d = describeTrack(e);
    expect(d.subtitle).toBe('Abertura · Neutra');
    expect(d.details.join(' ')).toMatch(/Compasso: 4\/4/);
    expect(d.details.join(' ')).toMatch(/Instrumentos: .*(trombones|tímpanos)/);
    expect(describeTrack(getTrack('orc_peace_4')).subtitle).toBe('Paz · Horda · candidata nova');
    expect(describeTrack(getTrack('victory_human')).details[0]).toMatch(/Efeito sintetizado/);
    expect(metaLine(getTrack('defeat_orc'))).toMatch(/^fanfarra curta/);
    expect(describeTrack(undefined)).toBeNull();
    for (const x of MUSIC_CATALOG) expect(metaLine(x).length, x.id).toBeGreaterThan(5);
  });

  it('seleção: conjunto inicial (salvo ou padrão), marcar sem mutar, lista dos marcados, JSON e próxima faixa', () => {
    const mem = new Map();
    const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
    expect([...initialEnabledSet(storage)].sort()).toEqual([...defaults].sort());
    mem.set(MUSIC_SELECTION_KEY, JSON.stringify({ version: 1, enabled: ['orc_combat_5', 'human_peace_3'] }));
    expect([...initialEnabledSet(storage)].sort()).toEqual(['human_peace_3', 'orc_combat_5']);
    expect(initialEnabledSet(null).has('title_0')).toBe(true);

    const a = new Set(['human_peace_0']);
    const b = setEnabled(a, ['orc_combat_5', 'nao_existe'], true);
    expect(a.size).toBe(1);
    expect([...b].sort()).toEqual(['human_peace_0', 'orc_combat_5']);
    expect([...setEnabled(b, ['human_peace_0'], false)]).toEqual(['orc_combat_5']);

    // lista dos marcados: só músicas (sem fanfarras), na ordem do catálogo
    const sel = new Set(['orc_combat_5', 'victory_human', 'human_peace_3', 'title_0']);
    expect(playlistFrom(sel)).toEqual(MUSIC_CATALOG.filter((e) => e.kind === 'music' && sel.has(e.id)).map((e) => e.id));
    expect(playlistFrom(sel)).not.toContain('victory_human');
    expect(playlistFrom([])).toEqual([]);
    expect(nextInPlaylist(['a', 'b', 'c'], 'b')).toBe('c');
    expect(nextInPlaylist(['a', 'b', 'c'], 'c')).toBe('a');
    expect(nextInPlaylist(['a', 'b'], 'fora')).toBe('a');
    expect(nextInPlaylist([], 'a')).toBeNull();

    const json = JSON.parse(selectionJson(sel));
    expect(json.version).toBe(1);
    expect(json.enabled).toEqual(MUSIC_CATALOG.filter((e) => sel.has(e.id)).map((e) => e.id));
  });

  it('plano da transição paz → combate: usa a facção da faixa e as habilitadas (com reserva nas atuais)', () => {
    const p = transitionPlan('human_peace_3', defaults);
    expect(p.map((s) => s.label)).toEqual(['paz', 'combate', 'paz']);
    expect(p[0].id).toBe('human_peace_3');
    expect(p[1].id).toBe('human_combat_0'); // nada de combate habilitado -> reserva nas atuais
    expect(p[2].id).toBe('human_peace_3');
    const picked = transitionPlan('orc_peace_0', new Set(['orc_combat_6']));
    expect(picked[1].id).toBe('orc_combat_6');
    const fromCombat = transitionPlan('orc_combat_4', new Set());
    expect(fromCombat[1].id).toBe('orc_combat_4');
    expect(getTrack(fromCombat[0].id).category).toBe('peace');
    expect(getTrack(fromCombat[0].id).faction).toBe('orc');
    expect(transitionPlan('title_0', defaults)).toBeNull();
    expect(transitionPlan('victory_orc', defaults)).toBeNull();
    expect(transitionPlan('nao_existe', defaults)).toBeNull();
  });

  it('intensidade -> minutos equivalentes é monotônica', () => {
    expect(minutesForIntensity(0)).toBe(0);
    expect(minutesForIntensity(1)).toBe(20);
    let prev = 0;
    for (let x = 0.05; x <= 1; x += 0.05) {
      const m = minutesForIntensity(x);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });
});

describe('HTML do painel (funções puras)', () => {
  it('lista: 7 grupos, uma linha por faixa com caixa "No jogo", marcada conforme a seleção, e destaque da selecionada', () => {
    const model = buildMusicModel(defaults);
    const html = listHtml(model, 'orc_peace_4');
    expect((html.match(/class="mp-group"/g) || []).length).toBe(7);
    expect((html.match(/class="mp-row/g) || []).length).toBe(MUSIC_CATALOG.length);
    expect((html.match(/data-act="check"/g) || []).length).toBe(MUSIC_CATALOG.length);
    expect((html.match(/ checked>/g) || []).length).toBe(defaults.size);
    expect(html).toContain('mp-row selected" data-id="orc_peace_4"');
    expect(html).toContain('Candidatas novas');
    expect(html).toContain('No jogo');
    expect(html).toContain('Marcar todas deste grupo');
    expect(countText(model)).toBe(`${defaults.size} de ${MUSIC_CATALOG.length} faixas marcadas "No jogo"`);
  });

  it('cartão: descrição, transporte, progresso, volume, laço, evolução, transição, lista, copiar e restaurar; sem HTML injetado', () => {
    const desc = describeTrack(getTrack('human_peace_3'));
    const html = cardHtml({ desc, canTransition: true, volume: 0.6, loop: true, intensity: 0.25 });
    for (const piece of ['Corte de Cristal', 'id="mp-progress"', 'id="mp-volume"', 'value="60"', 'id="mp-loop" checked', 'id="mp-intensity"', 'value="25"',
      'Ouvir transição paz → combate', 'Só ouvir os marcados', 'Copiar seleção (JSON)', 'Restaurar padrões', '▶ Tocar', '⏸ Pausar', '⏹ Parar']) {
      expect(html, piece).toContain(piece);
    }
    expect(html).not.toContain('data-act="transition" disabled');
    expect(cardHtml({ desc, canTransition: false, volume: 1, loop: false, intensity: 0 })).toContain('data-act="transition" disabled');
    expect(cardHtml({ desc: null })).toContain('Selecione uma faixa');
    const evil = cardHtml({ desc: { title: '<img src=x onerror=alert(1)>', subtitle: '', meta: '', description: '"><script>', details: ['<b>'] }, canTransition: false, volume: 0, loop: false, intensity: 0 });
    expect(evil).not.toContain('<img');
    expect(evil).not.toContain('<script>');
    expect(esc(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
});

describe('controlador de áudio do player (AudioContext falso)', () => {
  const mk = () => {
    const Ctor = createFakeAudioContextClass();
    const pv = new MusicPreview({ AudioContextCtor: Ctor, timers: null });
    const run = (sec) => {
      const ctx = Ctor.made[0];
      for (let t = 0; t < sec; t += 0.1) { ctx.advance(0.1); pv.tick(); }
    };
    return { Ctor, pv, run };
  };

  it('o AudioContext só nasce ao pedir áudio (gesto) e erro de ambiente não quebra', () => {
    const { Ctor, pv } = mk();
    expect(Ctor.made).toHaveLength(0);
    expect(pv.ready).toBe(false);
    expect(pv.state().status).toBe('idle');
    expect(pv.play('human_peace_0')).toBe(true);
    expect(Ctor.made).toHaveLength(1);
    expect(pv.ready).toBe(true);
    const noAudio = new MusicPreview({ AudioContextCtor: function Boom() { throw new Error('sem som'); }, timers: null });
    expect(noAudio.play('human_peace_0')).toBe(false);
    expect(noAudio.error).toMatch(/sem som/);
    expect(new MusicPreview({ AudioContextCtor: Ctor, timers: null }).play('nao_existe')).toBe(false);
  });

  it('toca uma faixa com o MusicPlayer do jogo, mostra progresso, pausa, retoma e para', () => {
    const { Ctor, pv, run } = mk();
    expect(pv.play('human_peace_3')).toBe(true);
    expect(pv.music.currentTrackId).toBe('human_peace_3');
    run(2);
    const st = pv.state();
    expect(st.status).toBe('playing');
    expect(st.id).toBe('human_peace_3');
    expect(st.dur).toBeGreaterThan(30);
    expect(st.pos).toBeGreaterThan(1);
    expect(pv.music.stats.notes).toBeGreaterThan(0);
    expect(pv.togglePause()).toBe(true);
    expect(pv.state().status).toBe('paused');
    expect(pv.togglePause()).toBe(false);
    expect(pv.state().status).toBe('playing');
    pv.setVolume(0.3);
    expect(Ctor.made[0].nodes.some((n) => n.kind === 'gain')).toBe(true);
    expect(pv.engine.volumes.music).toBeCloseTo(0.3);
    pv.setVolume(5);
    expect(pv.volume).toBe(1);
    pv.stop();
    expect(pv.state().status).toBe('idle');
  });

  it('laço desligado: para depois de uma volta; ligado: continua', () => {
    const a = mk();
    a.pv.setLoop(false);
    a.pv.play('human_combat_6'); // ≈ 27 s
    a.run(40);
    expect(a.pv.state().status).toBe('idle');
    const b = mk();
    b.pv.setLoop(true);
    b.pv.play('human_combat_6');
    b.run(40);
    expect(b.pv.state().status).toBe('playing');
    expect(b.pv.state().loop).toBeGreaterThanOrEqual(1);
  });

  it('intensidade chega ao player e acelera o andamento da paz', () => {
    const { pv, run } = mk();
    pv.setIntensity(1);
    pv.play('orc_peace_0');
    run(1);
    expect(pv.music.intensity).toBe(1);
    const dur1 = pv.state().dur;
    pv.setIntensity(0);
    run(1);
    expect(pv.state().dur).toBeGreaterThan(dur1);
  });

  it('"só ouvir os marcados": avança de faixa a cada volta, em círculo', () => {
    const { pv, run } = mk();
    expect(pv.startPlaylist([])).toBe(false);
    expect(pv.startPlaylist(['victory_orc'])).toBe(false); // só músicas
    expect(pv.startPlaylist(['human_combat_6', 'orc_combat_6'])).toBe(true);
    expect(pv.state().mode).toBe('playlist');
    expect(pv.state().id).toBe('human_combat_6');
    run(30);
    expect(pv.state().id).toBe('orc_combat_6');
    run(24);
    expect(pv.state().id).toBe('human_combat_6');
  });

  it('transição paz → combate → paz com o crossfade do jogo, e fim limpo', () => {
    const { pv, run } = mk();
    const steps = pv.startTransition('human_peace_0', new Set());
    expect(steps.map((s) => s.label)).toEqual(['paz', 'combat'.replace('combat', 'combate'), 'paz']);
    expect(pv.state().mode).toBe('transition');
    expect(pv.state().step).toMatchObject({ index: 0, total: 3, label: 'paz' });
    run(10);
    expect(pv.state().step.label).toBe('combate');
    expect(pv.music.currentId).toBe('human_combat');
    expect(pv.music.runs.length).toBeGreaterThanOrEqual(2); // a paz ainda sai (crossfade)
    run(13);
    expect(pv.state().step.label).toBe('paz');
    run(10);
    expect(pv.state().status).toBe('idle');
    expect(pv.startTransition('title_0', new Set())).toBeNull();
  });

  it('fanfarra (efeito sintetizado) toca uma vez e termina; com laço repete', () => {
    const { Ctor, pv, run } = mk();
    pv.setLoop(false);
    expect(pv.play('victory_human')).toBe(true);
    expect(pv.state().status).toBe('playing');
    expect(Ctor.made[0].counts.osc).toBeGreaterThan(0);
    run(3);
    expect(pv.state().status).toBe('idle');
    pv.setLoop(true);
    pv.play('defeat_orc');
    run(5);
    expect(pv.state().status).toBe('playing');
    pv.dispose();
    expect(pv.ready).toBe(false);
  });
});
