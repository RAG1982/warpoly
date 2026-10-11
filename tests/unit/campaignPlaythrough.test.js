import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { getMap } from '../../src/data/maps/index.js';
import { createCampaignMissionConfig, CampaignProgress, memoryStorage } from '../../src/campaign/index.js';
import { getHeightForMap } from '../../src/world/terrainGenerators.js';
import { getUnitDef } from '../../src/data/index.js';
import { CMD } from '../../src/sim/commands.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { runTicks, teleport, statusOf, EVT } from './helpers/missionWorld.js';

/**
 * F8-05 — uma simulação headless por missão da campanha da Aliança, do tick 0 até a VITÓRIA, com comandos/ações
 * injetados (teletransporte, dano, construção direta): determinística e sem exceção. A IA de script faz o papel do jogador.
 */
const T = 20; // ticks por segundo de simulação

function boot(id) {
  const progress = new CampaignProgress(memoryStorage());
  const cfg = createCampaignMissionConfig('alliance', id, { progress, unlockAll: true });
  cfg.headless = true;
  return new GameManager(new Terrain(getMap(cfg.mapId)), null, null, cfg);
}
const hero = (gm) => gm.getUnitsOf(0).find((u) => !u.isDead);
const tagged = (gm, tag) => (gm.mission.tags.get(tag) || []).map((i) => gm.entitiesById.get(i)).filter(Boolean);
const slay = (gm, ents) => { const k = hero(gm); for (const e of ents) if (!e.isDead) e.takeDamage(1e6, k); };
const slayTag = (gm, tag) => slay(gm, tagged(gm, tag));
const slayOwner = (gm, owner) => slay(gm, gm.getUnitsOf(owner));
function build(gm, type, x, z) { const b = gm.createBuilding(type, x, z, true, 0); gm.buildings.push(b); return b; }
const settle = (gm) => runTicks(gm, 12); // objetivos de varredura rodam a cada 5 ticks

function expectWon(gm) {
  expect(gm.isGameOver).toBe(true);
  expect(gm.gameWon).toBe(true);
  expect(gm.mission.snapshot().outcome).toBe('victory');
}

describe('campanha da Aliança: simulação headless até a vitória (F8-05)', () => {
  it('01 Fumaça no Vale: quartel, vanguarda destruída, santuário oculto e acampamento', () => {
    const gm = boot('alliance-01-fumaca-no-vale');
    runTicks(gm, 5);
    expect(tagged(gm, 'vanguard').length).toBe(5);
    expect(statusOf(gm, 'crush-vanguard')).not.toBe('active');
    build(gm, 'barracks', 30, 46);
    settle(gm);
    expect(statusOf(gm, 'build-barracks')).toBe('completed');
    expect(statusOf(gm, 'crush-vanguard')).toBe('active');
    const gold = gm.getPlayer(0).resources.gold;
    teleport(gm, hero(gm), 14, 14);
    settle(gm);
    expect(statusOf(gm, 'old-shrine')).toBe('completed');
    expect(gm.getPlayer(0).resources.gold).toBe(gold + 150);
    slay(gm, gm.buildings.filter((b) => b.type === 'bandit_camp'));
    settle(gm);
    expect(statusOf(gm, 'clear-camp')).toBe('completed');
    expect(gm.isGameOver).toBe(false);
    slayTag(gm, 'vanguard');
    settle(gm);
    expectWon(gm);
  });

  it('02 Cativos da Garganta: resgate, patrulha e escolta de volta à base', () => {
    const gm = boot('alliance-02-cativos-da-garganta');
    runTicks(gm, 5);
    expect(tagged(gm, 'captives').every((u) => u.ownerId === -1)).toBe(true);
    teleport(gm, hero(gm), -26, 26);
    settle(gm);
    expect(statusOf(gm, 'free-captives')).toBe('completed');
    expect(statusOf(gm, 'bring-home')).toBe('active');
    expect(tagged(gm, 'patrol').length).toBe(6);
    slayTag(gm, 'patrol');
    for (const c of tagged(gm, 'captives')) teleport(gm, c, 26, 26);
    settle(gm);
    expect(statusOf(gm, 'break-patrol')).toBe('completed');
    expectWon(gm);
  });

  it('02b perder um cativo falha a missão', () => {
    const gm = boot('alliance-02-cativos-da-garganta');
    runTicks(gm, 5);
    teleport(gm, hero(gm), -26, 26);
    settle(gm);
    slay(gm, tagged(gm, 'captives').slice(0, 1));
    settle(gm);
    expect(gm.isGameOver).toBe(true);
    expect(gm.gameWon).toBe(false);
  });

  it('03 Muralhas de Alvorada: 5 minutos de ondas e torres', { timeout: 60000 }, () => {
    const gm = boot('alliance-03-muralhas-de-alvorada');
    build(gm, 'watchtower', -20, -6);
    build(gm, 'watchtower', -20, -18);
    // a defesa abate cada onda: injeta dano nos atacantes a cada 5 s
    for (let s = 0; s < 62 && !gm.isGameOver; s++) {
      runTicks(gm, 5 * T);
      slayOwner(gm, 1);
    }
    expect(gm.mission.vars.waves).toBeGreaterThanOrEqual(6);
    expect(statusOf(gm, 'two-towers')).toBe('completed');
    expect(statusOf(gm, 'hold-line')).toBe('completed');
    expectWon(gm);
  });

  it('04 Ponte do Rio Turvo: bloqueio, emboscada e entrega do comboio ao Forte Atalaia', () => {
    const gm = boot('alliance-04-ponte-do-rio-turvo');
    runTicks(gm, 5);
    expect(tagged(gm, 'convoy').length).toBe(4);
    expect(tagged(gm, 'fort').length).toBe(1);
    slayTag(gm, 'blockade');
    settle(gm);
    expect(statusOf(gm, 'break-blockade')).toBe('completed');
    for (const c of tagged(gm, 'convoy')) teleport(gm, c, -6, 6);
    settle(gm);
    expect(tagged(gm, 'ambush').length).toBe(7);
    expect(statusOf(gm, 'ambush-clear')).toBe('active');
    slayTag(gm, 'ambush');
    const fort = tagged(gm, 'fort')[0];
    expect(statusOf(gm, 'deliver')).toBe('active');
    for (const c of tagged(gm, 'convoy')) teleport(gm, c, fort.mesh.position.x + 7, fort.mesh.position.z); // diante do forte
    settle(gm);
    expect(statusOf(gm, 'deliver')).toBe('completed');
    expect(statusOf(gm, 'all-porters')).toBe('completed');
    expectWon(gm);
  });

  it('04b perder o comboio é derrota', () => {
    const gm = boot('alliance-04-ponte-do-rio-turvo');
    runTicks(gm, 5);
    slay(gm, tagged(gm, 'convoy').slice(0, 2));
    settle(gm);
    expect(gm.isGameOver).toBe(true);
    expect(gm.gameWon).toBe(false);
  });

  it('05 Ferro e Brasa: ferraria, economia, reforços e destruição do salão inimigo', () => {
    const gm = boot('alliance-05-ferro-e-brasa');
    runTicks(gm, 5);
    expect(tagged(gm, 'enemy-hall').length).toBe(1);
    expect(statusOf(gm, 'burn-forge')).not.toBe('active');
    build(gm, 'forge', 30, 46);
    build(gm, 'stable', 46, 30);
    gm.getPlayer(0).resources.stone = 450;
    settle(gm);
    expect(statusOf(gm, 'forge')).toBe('completed');
    expect(statusOf(gm, 'stable')).toBe('completed');
    expect(statusOf(gm, 'stone-stock')).toBe('completed');
    gm.events.emit(EVT.RESOURCE_GATHERED, { type: 'gold', amount: 1500, pos: { x: 0, y: 0, z: 0 }, ownerId: 0 });
    settle(gm);
    expect(statusOf(gm, 'economy')).toBe('completed');
    expect(statusOf(gm, 'burn-forge')).toBe('active');
    slay(gm, gm.buildings.filter((b) => b.type === 'bandit_camp').slice(0, 1));
    slayTag(gm, 'enemy-hall');
    settle(gm);
    expect(statusOf(gm, 'camp-hunter')).toBe('completed');
    expectWon(gm);
  });

  it('06 Ilhas de Brasa: dois salões orcs destruídos sem perder o forte aliado', () => {
    const gm = boot('alliance-06-ilhas-de-brasa');
    runTicks(gm, 5);
    expect(tagged(gm, 'hall-mares').length).toBe(1);
    expect(tagged(gm, 'hall-sal').length).toBe(1);
    expect(tagged(gm, 'brumar-keep').length).toBe(1);
    teleport(gm, hero(gm), 0, -15);
    settle(gm);
    expect(statusOf(gm, 'centre-bridge')).toBe('completed');
    build(gm, 'shipyard', -30, -40); // objetivo primário (F8-05b)
    settle(gm);
    expect(statusOf(gm, 'build-shipyard')).toBe('completed');
    slayTag(gm, 'hall-sal');
    settle(gm);
    expect(gm.isGameOver).toBe(false);
    slayTag(gm, 'hall-mares');
    settle(gm);
    expect(statusOf(gm, 'keep-brumar')).toBe('completed');
    expectWon(gm);
  });

  it('06b perder o forte de Brumar é derrota', () => {
    const gm = boot('alliance-06-ilhas-de-brasa');
    runTicks(gm, 5);
    slayTag(gm, 'brumar-keep');
    settle(gm);
    expect(gm.isGameOver).toBe(true);
    expect(gm.gameWon).toBe(false);
  });

  it('07 Traição do Presa-Negra: aliança, traição, sobrevivência e queda do traidor', () => {
    const gm = boot('alliance-07-traicao-presa-negra');
    runTicks(gm, 5);
    expect(gm.isHostile(0, 1)).toBe(false);
    teleport(gm, hero(gm), -30, 30);
    settle(gm);
    expect(statusOf(gm, 'sign-of-betrayal')).toBe('completed');
    build(gm, 'watchtower', 24, 24);
    build(gm, 'watchtower', 40, 24);
    build(gm, 'barracks', 24, 40);
    build(gm, 'barracks', 40, 40);
    settle(gm);
    expect(statusOf(gm, 'fortify')).toBe('completed');
    expect(statusOf(gm, 'barracks-two')).toBe('completed');
    expect(gm.isGameOver).toBe(false);
    // a traição dispara aos 330 s: pula direto habilitando o gatilho (o relógio é coberto pelo teste de gatilhos)
    gm.mission.triggers.get('betray-now').enabled = true;
    runTicks(gm, 3);
    expect(gm.mission.vars.betrayed).toBe(true);
    expect(gm.isHostile(0, 1)).toBe(true);
    expect(statusOf(gm, 'survive-betrayal')).toBe('active');
    for (let s = 0; s < 25 && statusOf(gm, 'survive-betrayal') !== 'completed'; s++) {
      runTicks(gm, 5 * T);
      slay(gm, gm.getUnitsOf(1));
    }
    expect(statusOf(gm, 'survive-betrayal')).toBe('completed');
    expect(gm.isGameOver).toBe(false);
    slayTag(gm, 'presa-hall');
    settle(gm);
    expectWon(gm);
  });

  it('07b a traição também dispara pelo relógio (330 s)', () => {
    const gm = boot('alliance-07-traicao-presa-negra');
    runTicks(gm, 330 * T + 10);
    expect(gm.mission.vars.betrayed).toBe(true);
    expect(gm.isHostile(0, 1)).toBe(true);
  }, 60000);

  it('08A Queda do Cinzal: dois salões, Skarn morto e magos resgatados', () => {
    const gm = boot('alliance-08-queda-do-cinzal');
    runTicks(gm, 5);
    expect(tagged(gm, 'skarn').length).toBe(1);
    teleport(gm, hero(gm), 4, 56);
    settle(gm);
    expect(statusOf(gm, 'free-mages')).toBe('completed');
    slayTag(gm, 'hall-lancas');
    slayTag(gm, 'hall-cinzal');
    settle(gm);
    expect(gm.isGameOver).toBe(false);
    slayTag(gm, 'skarn');
    settle(gm);
    expect(gm.mission.vars.skarn_slain).toBe(true);
    expectWon(gm);
  });

  it('é determinística: mesma missão, mesmos checksums', () => {
    const a = boot('alliance-03-muralhas-de-alvorada');
    const b = boot('alliance-03-muralhas-de-alvorada');
    runTicks(a, 1500);
    runTicks(b, 1500);
    expect(a.checksums.length).toBeGreaterThan(10);
    expect(b.checksums).toEqual(a.checksums);
  });
});

/**
 * NEW-53 — m04 "A Ponte do Rio Turvo": o objetivo de entrega agora tem um forte de verdade (castelo do jogador criado pela
 * ação `spawnBuilding`), do outro lado do rio e DEPOIS do acampamento neutro hostil (-40,-20) em relação à base. Os testes
 * conferem a posição (terra firme, fora do rio, fora do alcance dos bandoleiros) e que o comboio CHEGA ANDANDO (sem teletransporte)
 * pelos dois caminhos — vau central (bloqueio + emboscada) e vau noroeste (acampamento no caminho) —, de forma determinística.
 */
describe('m04 Ponte do Rio Turvo: Forte Atalaia (NEW-53)', () => {
  const M04 = 'alliance-04-ponte-do-rio-turvo';
  const BASE = { x: 24, z: -22 }; // onde o comboio nasce (base do jogador)
  const alive = (arr) => arr.filter((u) => !u.isDead && !u.isDying);
  const westBandits = (gm) => alive(gm.getUnitsOf(99)).filter((u) => u.mesh.position.x < 0); // guardas do acampamento (-40,-20)
  const escortOf = (gm) => gm.getUnitsOf(0).filter((u) => (u.type === 'knight' || u.type === 'archer') && !(gm.mission.tags.get('convoy') || []).includes(u.id));
  const order = (gm, units, x, z, type = CMD.MOVE) => {
    const ids = alive(units).map((u) => u.id);
    if (ids.length) gm.issue({ type, playerId: 0, unitIds: ids, x, z });
  };
  /** Como o jogador: manda de novo quem ficou parado longe do forte (golpe sofrido desfaz a ordem de movimento). */
  const nudge = (gm, convoy, goal, fort) => {
    const idle = alive(convoy).filter((u) => u.state === 'idle' && Math.hypot(u.mesh.position.x - fort.x, u.mesh.position.z - fort.z) > 11);
    order(gm, idle, goal.x, goal.z);
  };

  it('é um castelo do jogador, pronto, marcado "fort", no centro da área de entrega', () => {
    const gm = boot(M04);
    const forts = tagged(gm, 'fort');
    expect(forts.length).toBe(1);
    const fort = forts[0];
    expect(fort.type).toBe('castle');
    expect(fort.ownerId).toBe(0);
    expect(fort.isConstructed).toBe(true);
    expect(fort.hp).toBe(fort.maxHp);
    expect(gm.buildings).toContain(fort);
    const area = gm.mission.objectives.get('deliver').def.area;
    expect(area.x).toBe(fort.mesh.position.x);
    expect(area.z).toBe(fort.mesh.position.z);
    expect(area.r).toBeGreaterThan(fort.collisionRadius + 3); // dá espaço para os carregadores ficarem ao redor do castelo
    expect(area.r).toBeLessThanOrEqual(15);
    // o castelo do forte não vira a base do jogador: o primeiro castelo continua sendo o da base inicial
    const castles = gm.buildings.filter((b) => b.type === 'castle' && b.ownerId === 0);
    expect(castles.length).toBe(2);
    expect(castles[0]).not.toBe(fort);
  });

  it('fica DEPOIS do acampamento neutro em relação à base e fora do alcance dos bandoleiros', () => {
    const gm = boot(M04);
    const fort = tagged(gm, 'fort')[0];
    const f = fort.mesh.position;
    const camp = gm.buildings.find((b) => b.type === 'bandit_camp' && b.mesh.position.x < 0);
    expect(camp.mesh.position.x).toBe(-40);
    expect(camp.mesh.position.z).toBe(-20);
    const away = (p) => Math.hypot(p.x - BASE.x, p.z - BASE.z);
    expect(away(f)).toBeGreaterThan(away(camp.mesh.position) + 8); // mais longe da base que o acampamento
    expect(f.x).toBeLessThan(camp.mesh.position.x); // mais a oeste
    // os guardas só atacam construções a `aggroRange` (11) de si: o forte fica bem além disso
    const guards = westBandits(gm);
    expect(guards.length).toBe(4);
    const aggro = getUnitDef('bandit').aggroRange;
    for (const g of guards) expect(Math.hypot(g.mesh.position.x - f.x, g.mesh.position.z - f.z) - fort.collisionRadius).toBeGreaterThan(aggro + 3);
    // ... e na prática: 2 minutos sem ninguém por perto e o forte segue intacto
    runTicks(gm, 120 * T);
    expect(fort.hp).toBe(fort.maxHp);
    expect(gm.isGameOver).toBe(false);
    expect(westBandits(gm).length).toBe(4);
  }, 60000);

  it('está em terra firme dentro da área jogável, fora do rio e dos vaus, e passa na regra de construção do jogador', () => {
    const gm = boot(M04);
    const fort = tagged(gm, 'fort')[0];
    const { x, z } = fort.mesh.position;
    const map = getMap('continental-1v1');
    const half = map.playable / 2;
    const R = fort.collisionRadius;
    expect(Math.abs(x) + R).toBeLessThanOrEqual(half);
    expect(Math.abs(z) + R).toBeLessThanOrEqual(half);
    // centro e quatro amostras da pegada acima da água (as mesmas de GameManager.canPlaceBuilding)
    const so = R * 0.75;
    for (const [dx, dz] of [[0, 0], [so, so], [-so, so], [so, -so], [-so, -so]]) expect(getHeightForMap(map, x + dx, z + dz)).toBeGreaterThanOrEqual(1.8);
    for (const f of map.fords) expect(Math.hypot(x - f.x, z - f.z)).toBeGreaterThan(10);
    // sem construção, jazida nem árvore viva sobre a pegada: o jogador poderia construir um castelo aqui (ignorando o próprio forte)
    expect(gm.canPlaceBuilding('castle', x, z, fort, 0)).toBe(true);
    expect(gm.trees.filter((t) => !t.isDisposed && Math.hypot(t.mesh.position.x - x, t.mesh.position.z - z) < R + 3.5).length).toBe(0);
    expect(gm.trees.filter((t) => t.isDisposed).length).toBeGreaterThan(0); // a ação abriu a clareira
  });

  it('o acampamento neutro do mapa continua exatamente como era (guardas, recompensa e jazida)', () => {
    const map = getMap('continental-1v1');
    const camp = map.neutrals.find((n) => n.kind === 'camp' && n.x === -40 && n.z === -20);
    expect(camp).toEqual({ kind: 'camp', x: -40, z: -20, guards: 4, reward: { gold: 300 }, deposit: { type: 'gold', amount: 3000 } });
  });

  /**
   * Roteiro do comboio pelo vau CENTRAL: bloqueio e emboscada abatidos pela escolta (dano direto); o resto é caminhada de verdade.
   * A escolta vai à frente até `across` (margem oeste do vau, dentro da área do gatilho da emboscada) e só então solta o comboio
   * — o ponto de passagem fixa o caminho, qualquer que seja o desempate do A* entre os vaus, e evita o engarrafamento de 14 unidades
   * no corredor entre a mina (8,-6) e o rio.
   */
  function walkCentral() {
    const gm = boot(M04);
    runTicks(gm, 5);
    const convoy = tagged(gm, 'convoy');
    const escort = escortOf(gm);
    const fort = tagged(gm, 'fort')[0].mesh.position;
    const goal = { x: fort.x + 7, z: fort.z };
    const across = { x: -10, z: 4 };
    const near = (arr, p, r) => alive(arr).filter((u) => Math.hypot(u.mesh.position.x - p.x, u.mesh.position.z - p.z) < r);
    slayTag(gm, 'blockade');
    order(gm, escort, across.x, across.z, CMD.ATTACK_MOVE);
    const start = convoy.map((u) => ({ x: u.mesh.position.x, z: u.mesh.position.z }));
    let phase = 'escort';
    let sawAmbush = false;
    let crossed = false;
    while (!gm.isGameOver && gm.currentTick < 150 * T) {
      runTicks(gm, 1);
      if (alive(tagged(gm, 'ambush')).length > 0) { sawAmbush = true; slayTag(gm, 'ambush'); }
      if (phase === 'escort' && near(escort, across, 8).length >= 8) {
        phase = 'convoy';
        order(gm, convoy, across.x, across.z);
      } else if (phase === 'convoy' && near(convoy, across, 7).length >= 3) {
        phase = 'fort';
        crossed = true;
        order(gm, convoy, goal.x, goal.z);
        order(gm, escort, goal.x, goal.z, CMD.ATTACK_MOVE);
      } else if (phase !== 'escort' && gm.currentTick % 100 === 0) nudge(gm, convoy, phase === 'convoy' ? across : goal, phase === 'convoy' ? across : fort);
    }
    return { gm, convoy, fort, start, sawAmbush, crossed };
  }

  it('o comboio chega ANDANDO ao forte pelo vau central (bloqueio e emboscada abatidos)', () => {
    const { gm, convoy, fort, start, sawAmbush, crossed } = walkCentral();
    expect(crossed).toBe(true); // atravessou o vau central (bloqueio já abatido)
    expect(sawAmbush).toBe(true); // ... e disparou a emboscada da outra margem
    expectWon(gm);
    expect(statusOf(gm, 'deliver')).toBe('completed');
    expect(alive(convoy).length).toBeGreaterThanOrEqual(3);
    expect(alive(convoy).filter((u) => Math.hypot(u.mesh.position.x - fort.x, u.mesh.position.z - fort.z) <= 12).length).toBeGreaterThanOrEqual(3);
    // andaram de verdade (sem teletransporte): o tempo decorrido não é menor que o da reta da base até a borda da área de entrega à velocidade do camponês
    const area = gm.mission.objectives.get('deliver').def.area;
    const straight = Math.hypot(start[0].x - fort.x, start[0].z - fort.z) - area.r;
    expect(straight).toBeGreaterThan(50);
    expect(gm.currentTick * SIM_DT).toBeGreaterThanOrEqual(straight / getUnitDef('villager').speed);
    expect(gm.currentTick).toBeLessThan(150 * T);
    expect(tagged(gm, 'fort')[0].hp).toBe(tagged(gm, 'fort')[0].maxHp);
  }, 60000);

  /**
   * Roteiro pelo vau NOROESTE, com o acampamento no caminho (combate de verdade, sem dano direto): `lead` = a escolta segue na
   * frente em ataque-movimento e o comboio logo atrás; `clear` = a escolta limpa o acampamento primeiro.
   */
  function walkNorthwest(mode) {
    const gm = boot(M04);
    runTicks(gm, 5);
    const convoy = tagged(gm, 'convoy');
    const escort = escortOf(gm);
    const fort = tagged(gm, 'fort')[0].mesh.position;
    const goal = { x: fort.x + 7, z: fort.z };
    const bend = { x: -24, z: -14 }; // logo a oeste do vau noroeste, antes do acampamento
    slayTag(gm, 'blockade'); // o bloqueio do vau central é outro teste
    let phase;
    if (mode === 'clear') {
      order(gm, escort, -40, -20, CMD.ATTACK_MOVE);
      phase = 'clearing';
    } else {
      order(gm, convoy, bend.x, bend.z);
      order(gm, escort, bend.x, bend.z, CMD.ATTACK_MOVE);
      phase = 'bend';
    }
    const guards0 = westBandits(gm).length;
    while (!gm.isGameOver && gm.currentTick < 150 * T) {
      runTicks(gm, 1);
      if (phase === 'clearing' && westBandits(gm).length === 0) {
        order(gm, convoy, bend.x, bend.z);
        order(gm, escort, bend.x, bend.z, CMD.ATTACK_MOVE);
        phase = 'bend';
      } else if (phase === 'bend' && alive(convoy).every((u) => Math.hypot(u.mesh.position.x - bend.x, u.mesh.position.z - bend.z) < 4)) {
        order(gm, convoy, goal.x, goal.z);
        order(gm, escort, goal.x, goal.z, CMD.ATTACK_MOVE);
        phase = 'fort';
      } else if (phase === 'fort' && gm.currentTick % 100 === 0) nudge(gm, convoy, goal, fort);
    }
    return { gm, convoy, escort, fort, guards0, phase };
  }

  it.each(['clear', 'lead'])('o comboio chega ANDANDO ao forte pelo vau noroeste passando pelo acampamento (escolta: %s)', (mode) => {
    const { gm, convoy, fort, guards0, phase } = walkNorthwest(mode);
    expect(guards0).toBe(4);
    expect(phase).toBe('fort'); // chegou ao vau e seguiu para o forte
    expectWon(gm);
    expect(statusOf(gm, 'deliver')).toBe('completed');
    expect(alive(convoy).length).toBeGreaterThanOrEqual(3);
    expect(alive(convoy).filter((u) => Math.hypot(u.mesh.position.x - fort.x, u.mesh.position.z - fort.z) <= 12).length).toBeGreaterThanOrEqual(3);
    expect(westBandits(gm).length).toBe(0); // a escolta limpou os guardas no caminho
    expect(gm.currentTick).toBeLessThan(150 * T);
    // a emboscada do vau central não participou deste caminho
    expect(tagged(gm, 'ambush').length).toBe(0);
  }, 60000);

  it('é determinística: o mesmo roteiro repete os mesmos checksums e o mesmo instante de vitória', () => {
    const a = walkNorthwest('lead');
    const b = walkNorthwest('lead');
    expect(a.gm.checksums.length).toBeGreaterThan(5);
    expect(b.gm.checksums).toEqual(a.gm.checksums);
    expect(b.gm.currentTick).toBe(a.gm.currentTick);
    expect(b.gm.mission.hashString()).toBe(a.gm.mission.hashString());
    const c = walkCentral();
    const d = walkCentral();
    expect(d.gm.checksums).toEqual(c.gm.checksums);
    expect(d.gm.currentTick).toBe(c.gm.currentTick);
  }, 120000);
});
