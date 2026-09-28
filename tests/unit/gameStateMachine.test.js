import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  GameStateMachine,
  GameState as S,
  TRANSITIONS,
  isValidTransition
} from '../../src/core/GameStateMachine.js';
import { createMatchConfig, matchConfigFromSearch, withNewSeed, validateMatchConfig } from '../../src/sim/MatchConfig.js';
import { collectSharedResources, disposeObjectTree } from '../../src/render/sceneDisposal.js';

describe('GameStateMachine: transições', () => {
  it('começa em Boot sem chamar enter', () => {
    const enter = vi.fn();
    const fsm = new GameStateMachine({ handlers: { [S.BOOT]: { enter } } });
    expect(fsm.state).toBe(S.BOOT);
    expect(enter).not.toHaveBeenCalled();
  });

  it('percorre o fluxo completo: menu → setup → loading → jogo ⇄ pausa → fim → menu/loading', () => {
    const fsm = new GameStateMachine();
    const path = [
      S.MAIN_MENU, S.MATCH_SETUP, S.MAIN_MENU, S.MATCH_SETUP, S.LOADING, S.IN_GAME,
      S.PAUSED, S.IN_GAME, S.POST_GAME, S.LOADING, S.IN_GAME, S.PAUSED, S.LOADING,
      S.IN_GAME, S.PAUSED, S.MAIN_MENU, S.MATCH_SETUP, S.LOADING, S.IN_GAME, S.POST_GAME, S.MAIN_MENU
    ];
    for (const to of path) fsm.transition(to);
    expect(fsm.state).toBe(S.MAIN_MENU);
    expect(fsm.history).toHaveLength(path.length);
    expect(fsm.history[0]).toEqual({ from: S.BOOT, to: S.MAIN_MENU });
  });

  it('Boot → Loading direto (atalhos de URL: ?play, ?skipPreload, ?bench)', () => {
    const fsm = new GameStateMachine();
    fsm.transition(S.LOADING);
    fsm.transition(S.IN_GAME);
    expect(fsm.state).toBe(S.IN_GAME);
  });

  it('Loading → MainMenu (falha ao criar a partida)', () => {
    const fsm = new GameStateMachine({ initial: S.LOADING });
    expect(fsm.can(S.MAIN_MENU)).toBe(true);
  });

  const invalid = [
    [S.BOOT, S.IN_GAME],
    [S.BOOT, S.PAUSED],
    [S.MAIN_MENU, S.IN_GAME],
    [S.MAIN_MENU, S.LOADING], // precisa passar pela configuração da partida
    [S.MATCH_SETUP, S.IN_GAME],
    [S.LOADING, S.PAUSED],
    [S.LOADING, S.POST_GAME],
    [S.IN_GAME, S.MAIN_MENU], // sair da partida só pela pausa ou pelo fim de jogo
    [S.IN_GAME, S.LOADING],
    [S.IN_GAME, S.IN_GAME],
    [S.PAUSED, S.PAUSED],
    [S.PAUSED, S.POST_GAME],
    [S.POST_GAME, S.IN_GAME],
    [S.POST_GAME, S.PAUSED],
    [S.MAIN_MENU, S.BOOT]
  ];
  it.each(invalid)('rejeita %s → %s', (from, to) => {
    const fsm = new GameStateMachine({ initial: from });
    expect(fsm.can(to)).toBe(false);
    expect(() => fsm.transition(to)).toThrow(/transição inválida/);
    expect(fsm.state).toBe(from);
    expect(fsm.tryTransition(to)).toBe(false);
    expect(fsm.state).toBe(from);
  });

  it('rejeita estados desconhecidos', () => {
    const fsm = new GameStateMachine();
    expect(() => fsm.transition('Lobby')).toThrow(/desconhecido/);
    expect(() => new GameStateMachine({ initial: 'Nada' })).toThrow(/inicial inválido/);
    expect(isValidTransition('Nada', S.MAIN_MENU)).toBe(false);
  });

  it('a tabela cobre todos os estados e só aponta para estados existentes', () => {
    const states = new Set(Object.values(S));
    expect(new Set(Object.keys(TRANSITIONS))).toEqual(states);
    for (const targets of Object.values(TRANSITIONS)) {
      for (const t of targets) expect(states.has(t)).toBe(true);
    }
    // Boot nunca é destino
    for (const targets of Object.values(TRANSITIONS)) expect(targets).not.toContain(S.BOOT);
  });
});

describe('GameStateMachine: enter/exit', () => {
  it('chama exit do estado antigo antes de enter do novo, com from/to/payload', () => {
    const calls = [];
    const fsm = new GameStateMachine({
      handlers: {
        [S.BOOT]: { exit: (c) => calls.push(['exit', c.from, c.to]) },
        [S.LOADING]: {
          enter: (c) => calls.push(['enter', c.from, c.to, c.payload]),
          exit: (c) => calls.push(['exit', c.from, c.to])
        },
        [S.IN_GAME]: { enter: (c) => calls.push(['enter', c.from, c.to]) }
      }
    });
    fsm.transition(S.LOADING, { seed: 9 });
    fsm.transition(S.IN_GAME);
    expect(calls).toEqual([
      ['exit', S.BOOT, S.LOADING],
      ['enter', S.BOOT, S.LOADING, { seed: 9 }],
      ['exit', S.LOADING, S.IN_GAME],
      ['enter', S.LOADING, S.IN_GAME]
    ]);
    expect(fsm.previous).toBe(S.LOADING);
  });

  it('transição pedida dentro de enter é enfileirada e roda depois', () => {
    const order = [];
    const fsm = new GameStateMachine({
      handlers: {
        [S.LOADING]: {
          enter: () => {
            order.push('loading:enter:start');
            expect(fsm.transition(S.IN_GAME)).toBe(false); // enfileirada
            expect(fsm.state).toBe(S.LOADING);
            order.push('loading:enter:end');
          }
        },
        [S.IN_GAME]: { enter: () => order.push('ingame:enter') }
      }
    });
    expect(fsm.transition(S.LOADING)).toBe(true);
    expect(fsm.state).toBe(S.IN_GAME);
    expect(order).toEqual(['loading:enter:start', 'loading:enter:end', 'ingame:enter']);
  });

  it('transição enfileirada inválida lança e esvazia a fila', () => {
    const fsm = new GameStateMachine({
      handlers: { [S.LOADING]: { enter: () => fsm.transition(S.PAUSED) } }
    });
    expect(() => fsm.transition(S.LOADING)).toThrow(/Loading → Paused/);
    expect(fsm.state).toBe(S.LOADING);
    fsm.transition(S.IN_GAME); // a máquina continua utilizável
    expect(fsm.state).toBe(S.IN_GAME);
  });

  it('erro em enter propaga (não é engolido por tryTransition)', () => {
    const fsm = new GameStateMachine({
      handlers: { [S.MAIN_MENU]: { enter: () => { throw new Error('boom'); } } }
    });
    expect(() => fsm.tryTransition(S.MAIN_MENU)).toThrow('boom');
  });

  it('onChange avisa cada mudança e pode ser cancelado', () => {
    const fsm = new GameStateMachine();
    const seen = [];
    const off = fsm.onChange(({ from, to }) => seen.push(`${from}>${to}`));
    fsm.transition(S.MAIN_MENU);
    fsm.transition(S.MATCH_SETUP);
    off();
    fsm.transition(S.LOADING);
    expect(seen).toEqual(['Boot>MainMenu', 'MainMenu>MatchSetup']);
  });

  it('setHandler troca o handler de um estado', () => {
    const fsm = new GameStateMachine();
    const enter = vi.fn();
    fsm.setHandler(S.MAIN_MENU, { enter });
    fsm.transition(S.MAIN_MENU);
    expect(enter).toHaveBeenCalledOnce();
    expect(() => fsm.setHandler('X', {})).toThrow();
  });
});

describe('MatchConfig (F2-04): dificuldade e nova seed', () => {
  it('guarda a dificuldade escolhida no menu (inválida → normal)', () => {
    expect(createMatchConfig({ difficulty: 'hard' }).difficulty).toBe('hard');
    expect(createMatchConfig({ difficulty: 'impossível' }).difficulty).toBe('normal');
    expect(createMatchConfig().difficulty).toBe('normal');
    expect(matchConfigFromSearch('?difficulty=brutal').difficulty).toBe('brutal');
  });

  it('withNewSeed mantém jogadores/mapa, troca a seed e não compartilha objetos', () => {
    const cfg = createMatchConfig({ localFaction: 'orc', seed: 42, difficulty: 'easy' });
    const next = withNewSeed(cfg);
    expect(next.seed).not.toBe(42);
    expect(next.mapId).toBe(cfg.mapId);
    expect(next.difficulty).toBe('easy');
    expect(next.players).toEqual(cfg.players);
    expect(next.players[0]).not.toBe(cfg.players[0]);
    expect(withNewSeed(cfg, 7).seed).toBe(7);
    expect(() => validateMatchConfig(next)).not.toThrow();
  });
});

describe('sceneDisposal: descarta só o que não é compartilhado', () => {
  it('preserva geometrias/materiais dos templates e descarta os da partida', () => {
    const sharedGeo = new THREE.BoxGeometry();
    const sharedMat = new THREE.MeshStandardMaterial();
    const template = new THREE.Group();
    template.add(new THREE.Mesh(sharedGeo, sharedMat));
    const factory = { templates: new Map([['castle', template]]), ghostCache: new Map(), materials: {} };

    const ownGeo = new THREE.PlaneGeometry();
    const ownMat = new THREE.MeshBasicMaterial();
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.add(template.clone(true)); // clone compartilha geometria/material
    root.add(new THREE.Mesh(ownGeo, ownMat));
    root.add(new THREE.Mesh(ownGeo, ownMat)); // mesmo recurso duas vezes: 1 dispose
    scene.add(root);

    const spy = { sg: vi.fn(), sm: vi.fn(), og: vi.fn(), om: vi.fn() };
    sharedGeo.addEventListener('dispose', spy.sg);
    sharedMat.addEventListener('dispose', spy.sm);
    ownGeo.addEventListener('dispose', spy.og);
    ownMat.addEventListener('dispose', spy.om);

    const shared = collectSharedResources(factory);
    const stats = disposeObjectTree(root, shared);
    expect(root.parent).toBeNull();
    expect(scene.children).toHaveLength(0);
    expect(spy.sg).not.toHaveBeenCalled();
    expect(spy.sm).not.toHaveBeenCalled();
    expect(spy.og).toHaveBeenCalledOnce();
    expect(spy.om).toHaveBeenCalledOnce();
    expect(stats).toEqual({ geometries: 1, materials: 1 });
  });
});
