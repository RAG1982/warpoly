import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { getMap } from '../../src/data/maps/index.js';
import { createCampaignMissionConfig, CampaignProgress, memoryStorage } from '../../src/campaign/index.js';
import { getHeightForMap } from '../../src/world/terrainGenerators.js';
import { getUnitDef, RESEARCH } from '../../src/data/index.js';
import { missingRequirements, missingUnitRequirements, missingUpgradeRequirements } from '../../src/sim/requirements.js';
import { CMD } from '../../src/sim/commands.js';
import { canTarget } from '../../src/sim/targeting.js';
import { canCast, resolveAbility } from '../../src/sim/abilities.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { runTicks, teleport, statusOf, EVT } from './helpers/missionWorld.js';
import { place } from './helpers/navalWorld.js';

/**
 * F8-05 — uma simulação headless por missão da campanha do Reino, do tick 0 até a VITÓRIA, com comandos/ações
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

describe('campanha do Reino: simulação headless até a vitória (F8-05)', () => {
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

/**
 * F8-05b — as NOVIDADES de cada missão: o roteiro treina/pesquisa/ergue o que a missão libera, usa no objetivo e vence; e o que ainda
 * não foi liberado é recusado (comando ignorado, sem debitar). Tudo em Node puro: treino, pesquisa e combate rodam de verdade na sim;
 * só a "distância" é encurtada (teletransporte) onde o mapa seria só caminhada.
 */
describe('campanha do Reino: liberação progressiva e uso das novidades (F8-05b)', () => {
  const give = (gm, r) => { const res = gm.getPlayer(0).resources; for (const [k, v] of Object.entries(r)) res[k] = Math.max(res[k] || 0, v); };
  const issue = (gm, c) => gm.issue({ playerId: 0, ...c });
  const mine = (gm, type) => gm.getUnitsOf(0).filter((u) => u.type === type && !u.isDead);
  const castle0 = (gm) => gm.buildings.find((b) => b.ownerId === 0 && b.type === 'castle');
  /** Constrói (concluída) perto do Centro do jogador; devolve a construção. */
  function at(gm, type, dx, dz) {
    const p = castle0(gm).mesh.position;
    const b = build(gm, type, p.x + dx, p.z + dz);
    gm.recalculatePopCap(); // casas concedem população
    return b;
  }
  const money = (gm) => ({ ...gm.getPlayer(0).resources });
  /** Treina `n` unidades de `unitType` em `b` e espera sair. */
  function train(gm, b, unitType, n = 1) {
    for (let i = 0; i < n; i++) issue(gm, { type: CMD.TRAIN, buildingId: b.id, unitType });
    runTicks(gm, Math.ceil((n * getUnitDef(unitType).trainTime + 2) * T));
  }
  /** Pesquisa `id` em `b` (próximo nível) e espera concluir. */
  function research(gm, b, id) {
    const lv = RESEARCH[id].levels[gm.getPlayer(0).getResearchLevel(id)];
    issue(gm, { type: CMD.RESEARCH, buildingId: b.id, upgradeId: id });
    runTicks(gm, Math.ceil((lv.time + 2) * T));
  }
  const locked = (gm, kind, id, level) => (kind === 'buildings' ? missingRequirements(0, id, gm) : kind === 'units' ? missingUnitRequirements(0, id, gm) : missingUpgradeRequirements(0, id, gm, level)).find((r) => r.locked);
  const aiKill = (gm, owners, seconds) => {
    for (let s = 0; s < seconds / 5 && !gm.isGameOver; s++) { runTicks(gm, 5 * T); for (const o of owners) slayOwner(gm, o); }
  };

  it('os limites de cada missão: o que a campanha ainda não liberou fica travado (m01 → m08)', { timeout: 30000 }, () => {
    const gm1 = boot('alliance-01-fumaca-no-vale');
    expect(locked(gm1, 'buildings', 'forge')).toMatchObject({ mission: 2 });
    expect(locked(gm1, 'buildings', 'stable')).toMatchObject({ mission: 4 });
    expect(locked(gm1, 'units', 'cavalier')).toMatchObject({ mission: 4 });
    expect(locked(gm1, 'research', 'melee_weapons')).toMatchObject({ mission: 2 });
    expect(locked(gm1, 'units', 'knight')).toBeUndefined();
    expect(locked(gm1, 'buildings', 'barracks')).toBeUndefined();
    const gm8 = boot('alliance-08-queda-do-cinzal');
    // m08 libera todo o resto: nada do que a campanha menciona fica travado
    const all = {
      units: ['knight', 'cavalier', 'ballista', 'sapper', 'mage', 'templar', 'glider', 'gryphon_rider', 'ranger', 'frigate', 'dreadnought', 'submersible', 'tanker', 'barge'],
      buildings: ['stable', 'workshop', 'arcane_tower', 'temple', 'aviary', 'shipyard', 'foundry', 'refinery']
    };
    for (const [kind, ids] of Object.entries(all)) for (const id of ids) expect(locked(gm8, kind, id), `${kind}:${id}`).toBeUndefined();
    expect(locked(gm8, 'research', 'melee_weapons', 2)).toBeUndefined();
    expect(locked(gm8, 'research', 'naval_hulls', 2)).toBeUndefined();
    // a IA inimiga não é restringida
    expect(missingUnitRequirements(2, 'war_serpent', gm8).some((r) => r.locked)).toBe(false);
    expect(gm8.matchConfig.techRestriction.players).toEqual([0]);
  });

  it('01: treina Arqueiros no Quartel (objetivo secundário e recompensa); a Ferraria está travada', { timeout: 30000 }, () => {
    const gm = boot('alliance-01-fumaca-no-vale');
    give(gm, { gold: 1000, wood: 1000 });
    const barracks = at(gm, 'barracks', 16, 4);
    const before = money(gm);
    const n0 = gm.buildings.length;
    const worker = mine(gm, 'villager')[0];
    const p = castle0(gm).mesh.position;
    issue(gm, { type: CMD.PLACE_BUILDING, buildingType: 'forge', x: p.x + 18, z: p.z - 12, unitIds: [worker.id] }); // travada (m02)
    issue(gm, { type: CMD.TRAIN, buildingId: barracks.id, unitType: 'archer' });
    runTicks(gm, 2);
    expect(gm.buildings.length).toBe(n0);
    expect(barracks.queue.length).toBe(1);
    expect(money(gm).wood).toBe(before.wood - getUnitDef('archer').cost.wood);
    runTicks(gm, 12 * T);
    expect(mine(gm, 'archer').length).toBe(2);
    train(gm, barracks, 'archer', 2);
    expect(mine(gm, 'archer').length).toBe(4);
    settle(gm);
    expect(statusOf(gm, 'archers-four')).toBe('completed');
    expect(gm.getPlayer(0).resources.gold).toBeGreaterThan(before.gold - 3 * getUnitDef('archer').cost.gold + 90); // +100 da recompensa
  });

  it('02: pesquisa Armas Forjadas na Ferraria e Flechas de Aço na Serraria (recompensas); Escudos estão travados', { timeout: 30000 }, () => {
    const gm = boot('alliance-02-cativos-da-garganta');
    give(gm, { gold: 3000, wood: 3000, stone: 1000 });
    const forge = at(gm, 'forge', 16, -6);
    const lumber = gm.buildings.find((b) => b.ownerId === 0 && b.type === 'lumber_camp');
    expect(locked(gm, 'buildings', 'stable')).toMatchObject({ mission: 4 });
    expect(locked(gm, 'research', 'melee_armor')).toMatchObject({ mission: 3 });
    issue(gm, { type: CMD.RESEARCH, buildingId: forge.id, upgradeId: 'melee_armor' }); // travada (m03): ignorada
    runTicks(gm, 2);
    expect(forge.currentResearch).toBeNull();
    const g0 = money(gm).gold;
    research(gm, forge, 'melee_weapons');
    settle(gm);
    expect(gm.getPlayer(0).getResearchLevel('melee_weapons')).toBe(1);
    expect(statusOf(gm, 'forged-arms')).toBe('completed');
    research(gm, lumber, 'ranged_ammo');
    settle(gm);
    expect(statusOf(gm, 'steel-arrows')).toBe('completed');
    expect(money(gm).gold).toBeGreaterThan(g0 - 400 + 200); // gastou 400, recebeu 150 + 100
    // segue o fluxo normal até a vitória
    teleport(gm, hero(gm), -26, 26);
    settle(gm);
    slayTag(gm, 'patrol');
    for (const c of tagged(gm, 'captives')) teleport(gm, c, 26, 26);
    settle(gm);
    expectWon(gm);
  });

  it('03: ergue Muralha de Pedra e pesquisa Escudos Reforçados; a onda final traz Incendiários e Ogros', { timeout: 90000 }, () => {
    const gm = boot('alliance-03-muralhas-de-alvorada');
    give(gm, { gold: 3000, wood: 3000, stone: 3000 });
    const forge = at(gm, 'forge', 14, 6);
    for (let i = 0; i < 6; i++) build(gm, 'wall_human', -16, -24 + i * 2.4);
    settle(gm);
    expect(statusOf(gm, 'wall-line')).toBe('completed');
    research(gm, forge, 'melee_armor');
    settle(gm);
    expect(statusOf(gm, 'iron-shields')).toBe('completed');
    expect(locked(gm, 'units', 'cavalier')).toMatchObject({ mission: 4 });
    const seen = new Set();
    build(gm, 'watchtower', -20, -6);
    build(gm, 'watchtower', -20, -18);
    for (let s = 0; s < 62 && !gm.isGameOver; s++) {
      runTicks(gm, 5 * T);
      for (const u of gm.getUnitsOf(1)) seen.add(u.type);
      slayOwner(gm, 1);
    }
    expect(seen.has('arsonist')).toBe(true);
    expect(seen.has('ogre')).toBe(true);
    expectWon(gm);
  });

  it('04: o Paço sobe ao nível 2; o Estábulo Real treina Cavaleiros (2 do forte + 2 treinados) e o comboio entrega', { timeout: 90000 }, () => {
    const gm = boot('alliance-04-ponte-do-rio-turvo');
    runTicks(gm, 5);
    expect(castle0(gm).tier).toBe(2);
    expect(tagged(gm, 'fort')[0].tier).toBe(2);
    give(gm, { gold: 3000, wood: 3000, stone: 1000 });
    const stable = at(gm, 'stable', 18, 8);
    at(gm, 'cottage', 8, 16);
    at(gm, 'cottage', 14, 16);
    expect(locked(gm, 'units', 'ballista')).toMatchObject({ mission: 5 });
    issue(gm, { type: CMD.TRAIN, buildingId: stable.id, unitType: 'cavalier' });
    runTicks(gm, 2);
    expect(stable.queue.length).toBe(1);
    runTicks(gm, 16 * T);
    expect(mine(gm, 'cavalier').length).toBe(1);
    slayTag(gm, 'blockade'); // o vau cai: o forte envia 2 Cavaleiros
    settle(gm);
    expect(mine(gm, 'cavalier').length).toBe(3);
    train(gm, stable, 'cavalier', 1);
    settle(gm);
    expect(mine(gm, 'cavalier').length).toBe(4);
    expect(statusOf(gm, 'cavalry-corps')).toBe('completed');
    // a emboscada agora traz um Ogro (cavalaria orc)
    for (const c of tagged(gm, 'convoy')) teleport(gm, c, -6, 6);
    settle(gm);
    expect(tagged(gm, 'ambush').some((u) => u.type === 'ogre')).toBe(true);
    slayTag(gm, 'ambush');
    const fort = tagged(gm, 'fort')[0];
    for (const c of tagged(gm, 'convoy')) teleport(gm, c, fort.mesh.position.x + 7, fort.mesh.position.z);
    settle(gm);
    expectWon(gm);
  });

  it('05: a Oficina rende 2 Sapadores que derrubam a torre de guarda; Balistas e o herói Brann chegam aos 8 minutos', { timeout: 120000 }, () => {
    const gm = boot('alliance-05-ferro-e-brasa');
    runTicks(gm, 5);
    expect(castle0(gm).tier).toBe(2);
    const towers = tagged(gm, 'gate-towers');
    expect(towers.length).toBe(2);
    expect(towers.every((t) => t.type === 'orc_watchtower' && t.ownerId === 1 && t.isConstructed)).toBe(true);
    expect(tagged(gm, 'siege-guard')[0].type).toBe('catapult');
    expect(locked(gm, 'buildings', 'shipyard')).toMatchObject({ mission: 6 });
    give(gm, { gold: 4000, wood: 4000, stone: 1000 });
    const forge = at(gm, 'forge', 16, -4);
    const workshop = at(gm, 'workshop', 18, 10);
    settle(gm);
    expect(statusOf(gm, 'workshop-built')).toBe('completed');
    expect(mine(gm, 'sapper').length).toBe(2); // recompensa da oficina
    research(gm, forge, 'siege_damage');
    expect(gm.getPlayer(0).getResearchLevel('siege_damage')).toBe(1);
    train(gm, workshop, 'sapper', 2);
    expect(mine(gm, 'sapper').length).toBe(4);
    // os Sapadores correm até a torre e explodem (combate de verdade; só o trajeto é encurtado)
    const tower = towers[0];
    const tp = tower.mesh.position;
    for (const s of mine(gm, 'sapper')) teleport(gm, s, tp.x + 9, tp.z + 9);
    for (let i = 0; i < 40 * T && !tower.isDead; i++) {
      if (i % 20 === 0) issue(gm, { type: CMD.ATTACK, unitIds: mine(gm, 'sapper').map((u) => u.id), targetId: tower.id });
      runTicks(gm, 1);
    }
    settle(gm);
    expect(tower.isDead).toBe(true);
    expect(statusOf(gm, 'sapper-blast')).toBe('completed');
    // as Balistas e o herói únicos chegam aos 8 minutos
    aiKill(gm, [1], 480 - gm.currentTick / T);
    runTicks(gm, 3 * T);
    expect(mine(gm, 'hero_brann').length).toBe(1);
    expect(getUnitDef('hero_brann').isHero).toBe(true);
    expect(mine(gm, 'ballista').length).toBe(2);
    expect(gm.spawnUnit('hero_brann', 30, 30, 0)).toBeNull(); // único por partida
    slayTag(gm, 'gate-towers');
    settle(gm);
    expect(statusOf(gm, 'gate-towers')).toBe('completed');
  });

  /** Posição da unidade/construção. */
  const pos = (e) => ({ x: e.mesh.position.x, z: e.mesh.position.z });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  /** Roda até `cond()` ou até `maxSec` (lógica de "espere o resultado" sem fixar o instante). */
  const runUntil = (gm, cond, maxSec, step = 10, foes = []) => {
    for (let i = 0; i < maxSec * T && !cond() && !gm.isGameOver; i += step) {
      runTicks(gm, step);
      if (foes.length && (i / step) % 10 === 0) for (const o of foes) for (const u of gm.getUnitsOf(o)) if (u.layer === 'ground' && !u.isDead) u.takeDamage(1e6, hero(gm)); // a IA terrestre não atrapalha o roteiro naval
    }
    return cond();
  };

  it('06: Estaleiro (exigido), Petroleiro, Plataforma, Couraçado/Submersível, frota inimiga afundada e desembarque pela Barcaça (06b)', { timeout: 240000 }, () => {
    const gm = boot('alliance-06-ilhas-de-brasa');
    runTicks(gm, 5);
    expect(castle0(gm).tier).toBe(3);
    // frota inimiga na água navegável, tipos navais orcs
    const fleet = tagged(gm, 'tide-fleet');
    expect(fleet.length).toBe(3);
    for (const g of fleet) {
      expect(g.type).toBe('war_galley');
      expect(g.layer).toBe('naval');
      expect(g.ownerId).toBe(2);
      expect(gm.navalPathfinder.isWalkableWorld(g.mesh.position.x, g.mesh.position.z)).toBe(true);
    }
    expect(locked(gm, 'buildings', 'arcane_tower')).toMatchObject({ mission: 7 });
    expect(locked(gm, 'units', 'mage')).toMatchObject({ mission: 7 });
    expect(locked(gm, 'buildings', 'shipyard')).toBeUndefined();
    give(gm, { gold: 8000, wood: 8000, stone: 2000 });
    expect(missingRequirements(0, 'shipyard', gm).map((r) => r.hq ?? r)).toEqual(['barracks']); // só falta o Quartel
    at(gm, 'barracks', 16, 4);
    expect(missingRequirements(0, 'shipyard', gm)).toEqual([]);
    // Estaleiro no ponto de costa válido mais próximo do Paço (regra de construção do jogador)
    const hq = pos(castle0(gm));
    let spot = null;
    for (let x = -57; x <= 57; x++) for (let z = -57; z <= 57; z++) {
      if (!gm.canPlaceBuilding('shipyard', x, z, null, 0)) continue;
      if (!spot || dist({ x, z }, hq) < dist(spot, hq)) spot = { x, z };
    }
    expect(spot).not.toBeNull();
    expect(spot.x).toBeLessThan(0); // na ilha oeste, a do jogador
    const oil0 = money(gm).oil;
    const yard = build(gm, 'shipyard', spot.x, spot.z);
    settle(gm);
    expect(statusOf(gm, 'build-shipyard')).toBe('completed');
    expect(money(gm).oil).toBe(oil0 + 150); // suprimentos de Brumar
    // Frota: 4 Fragatas treinadas no Estaleiro (custam petróleo) atacam a frota inimiga (combate naval de verdade; só o trajeto é encurtado)
    give(gm, { oil: 600 });
    const oilBefore = money(gm).oil;
    train(gm, yard, 'frigate', 4);
    expect(mine(gm, 'frigate').length).toBe(4);
    expect(money(gm).oil).toBe(oilBefore - 4 * getUnitDef('frigate').cost.oil);
    const navy = () => [...mine(gm, 'dreadnought'), ...mine(gm, 'submersible'), ...mine(gm, 'frigate')];
    navy().forEach((s, i) => place(gm, s, -4 + i * 3, -54));
    const alive = () => fleet.filter((g) => !g.isDead && !g.isDying);
    let guard = 0;
    while (alive().length > 0 && guard++ < 90 && !gm.isGameOver) {
      issue(gm, { type: CMD.ATTACK, unitIds: navy().map((u) => u.id), targetId: alive()[0].id });
      runTicks(gm, 2 * T);
    }
    expect(alive().length).toBe(0);
    settle(gm);
    expect(statusOf(gm, 'sink-fleet')).toBe('completed');
    expect(gm.isGameOver).toBe(false);
    // Petroleiro → Plataforma no poço nordeste (agora livre)
    train(gm, yard, 'tanker', 1);
    const tanker = mine(gm, 'tanker')[0];
    expect(tanker).toBeTruthy();
    expect(tanker.layer).toBe('naval');
    const well = gm.resourceDeposits.find((d) => d.type === 'oil' && d.mesh.position.z < 0);
    issue(gm, { type: CMD.PLACE_BUILDING, buildingType: 'oil_platform', x: well.mesh.position.x, z: well.mesh.position.z, unitIds: [tanker.id] });
    expect(runUntil(gm, () => statusOf(gm, 'oil-platform') === 'completed', 200, 10, [2, 3])).toBe(true);
    expect(gm.buildings.some((b) => b.type === 'oil_platform' && b.ownerId === 0 && b.isConstructed)).toBe(true);
    // recompensa: Couraçado e Submersível (navais de verdade)
    const dread = mine(gm, 'dreadnought')[0];
    const sub = mine(gm, 'submersible')[0];
    expect(dread && sub).toBeTruthy();
    expect(dread.layer).toBe('naval');
    expect(gm.navalPathfinder.isWalkableWorld(dread.mesh.position.x, dread.mesh.position.z)).toBe(true);
    expect(getUnitDef('submersible').submersible).toBe(true);
    expect(statusOf(gm, 'oil-platform')).toBe('completed');
  });

  it('06b: aos 5 minutos chegam Brann, tropas e a frota de socorro; a Barcaça leva 3 Espadachins à Praia Norte (cabeça-de-praia)', { timeout: 240000 }, () => {
    const gm = boot('alliance-06-ilhas-de-brasa');
    runTicks(gm, 5);
    runUntil(gm, () => gm.currentTick >= 300 * T + 10, 320, 10, [2, 3]);
    expect(mine(gm, 'hero_brann').length).toBe(1);
    const barge = mine(gm, 'barge')[0];
    expect(barge).toBeTruthy();
    expect(mine(gm, 'frigate').length).toBe(2);
    expect(barge.layer).toBe('naval');
    expect(barge.transportCapacity).toBe(6);
    const knights = mine(gm, 'knight').slice(-3);
    // as tropas vão à praia e a Barcaça vem buscá-las
    const shore = { x: -30, z: -42 };
    issue(gm, { type: CMD.MOVE, unitIds: knights.map((k) => k.id), x: shore.x, z: shore.z });
    runUntil(gm, () => knights.every((k) => dist(pos(k), shore) < 8), 40);
    issue(gm, { type: CMD.MOVE, unitIds: [barge.id], x: -30, z: -47 });
    runUntil(gm, () => dist(pos(barge), { x: -30, z: -47 }) < 5, 60);
    issue(gm, { type: CMD.LOAD, unitIds: knights.map((k) => k.id), targetId: barge.id });
    runUntil(gm, () => barge.cargo.length === 3, 40);
    expect(barge.cargo.length).toBe(3);
    // com a frota inimiga já no fundo (coberta em 06), a Barcaça navega e desembarca na Praia Norte
    slayTag(gm, 'tide-fleet');
    issue(gm, { type: CMD.UNLOAD, unitId: barge.id, x: 24, z: -42 });
    runUntil(gm, () => barge.cargo.length === 0, 150);
    expect(barge.cargo.length).toBe(0);
    for (const k of knights) expect(dist(pos(k), { x: 24, z: -38 })).toBeLessThan(12);
    issue(gm, { type: CMD.MOVE, unitIds: knights.map((k) => k.id), x: 24, z: -38 });
    runUntil(gm, () => statusOf(gm, 'beachhead') === 'completed', 40, 10, [2, 3]);
    expect(statusOf(gm, 'beachhead')).toBe('completed');
  });

  it('06c: aos 8 minutos o Leviatã de Ferro sai do porto inimigo (naval orc) e pode ser afundado (objetivo oculto)', { timeout: 120000 }, () => {
    const gm = boot('alliance-06-ilhas-de-brasa');
    runUntil(gm, () => gm.currentTick >= 480 * T + 10, 500, 10, [2, 3]);
    const boss = tagged(gm, 'tide-boss');
    expect(boss.length).toBe(1);
    expect(boss[0].type).toBe('iron_leviathan');
    expect(boss[0].layer).toBe('naval');
    slayTag(gm, 'tide-boss');
    settle(gm);
    expect(statusOf(gm, 'sink-leviathan')).toBe('completed');
  });

  it('07: Torre Arcana (Magos e Bola de Fogo), Templo (Ordenação → Templário), Aviário (Grifo), Oficina (Planador), pesquisas de nível 2 e o herói Oren', { timeout: 240000 }, () => {
    const gm = boot('alliance-07-traicao-presa-negra');
    runTicks(gm, 5);
    expect(castle0(gm).tier).toBe(3);
    give(gm, { gold: 12000, wood: 12000, stone: 4000 });
    expect(locked(gm, 'units', 'ranger')).toBeUndefined(); // vale pela base (Arqueiro); quem trava é a pesquisa:
    expect(locked(gm, 'research', 'ranged_class')).toMatchObject({ mission: 8 });
    expect(locked(gm, 'research', 'spell_polymorph')).toMatchObject({ mission: 8 });
    for (let i = 0; i < 4; i++) at(gm, 'cottage', 10 + i * 7, 16); // população para todas as tropas do roteiro
    // Torre Arcana: 2 Magos Arcanos (objetivo secundário) e a Bola de Fogo
    const arcane = at(gm, 'arcane_tower', 14, 8);
    train(gm, arcane, 'mage', 2);
    expect(mine(gm, 'mage').length).toBe(2);
    settle(gm);
    expect(statusOf(gm, 'mage-pair')).toBe('completed');
    // Aviário: o objetivo dá um Grifo; o próprio Aviário treina outro (aéreos de verdade)
    const aviary = at(gm, 'aviary', 24, -12);
    settle(gm);
    expect(statusOf(gm, 'aviary-built')).toBe('completed');
    expect(mine(gm, 'gryphon_rider').length).toBe(1);
    train(gm, aviary, 'gryphon_rider', 1);
    expect(mine(gm, 'gryphon_rider').length).toBe(2);
    expect(mine(gm, 'gryphon_rider').every((g) => g.layer === 'air')).toBe(true);
    // Oficina: o Planador (batedor aéreo) sobrevoa o forte do Presa-Negra
    const workshop = at(gm, 'workshop', 12, -12);
    train(gm, workshop, 'glider', 1);
    const glider = mine(gm, 'glider')[0];
    expect(glider.layer).toBe('air');
    issue(gm, { type: CMD.MOVE, unitIds: [glider.id], x: -30, z: 30 });
    expect(runUntil(gm, () => statusOf(gm, 'scout-fort') === 'completed', 60)).toBe(true);
    expect(statusOf(gm, 'sign-of-betrayal')).toBe('completed'); // o mesmo ponto: qualquer unidade vale
    expect(mine(gm, 'hero_oren').length).toBe(1); // recompensa do forte: o herói único
    expect(gm.spawnUnit('hero_oren', 28, 28, 0)).toBeNull();
    // pesquisas em paralelo: Ordenação (Templo), Bola de Fogo (Torre Arcana) e Armas Forjadas (Ferraria)
    const stable = at(gm, 'stable', 26, 6);
    const temple = at(gm, 'temple', 26, 20);
    const forge = at(gm, 'forge', 6, 20);
    for (const [b, id] of [[temple, 'cavalry_class'], [arcane, 'spell_fireball'], [forge, 'melee_weapons']]) issue(gm, { type: CMD.RESEARCH, buildingId: b.id, upgradeId: id });
    runTicks(gm, 62 * T);
    expect(statusOf(gm, 'ordination')).toBe('completed');
    expect(gm.getPlayer(0).getResearchLevel('spell_fireball')).toBe(1);
    // nível 2 de Armas Forjadas (liberado só na m07) e Cura (exige a Ordenação)
    issue(gm, { type: CMD.RESEARCH, buildingId: forge.id, upgradeId: 'melee_weapons' });
    issue(gm, { type: CMD.RESEARCH, buildingId: temple.id, upgradeId: 'spell_heal' });
    runTicks(gm, 48 * T);
    expect(gm.getPlayer(0).getResearchLevel('melee_weapons')).toBe(2);
    expect(statusOf(gm, 'forged-two')).toBe('completed');
    // a Ordenação promove o Cavaleiro a Templário (curandeiro)
    train(gm, stable, 'cavalier', 1);
    const templar = mine(gm, 'templar')[0];
    expect(templar).toBeTruthy();
    expect(mine(gm, 'cavalier').length).toBe(0);
    const heal = resolveAbility(gm, 'heal');
    expect(canCast(gm, templar, heal).ok).toBe(true);
    expect(canCast(gm, mine(gm, 'mage')[0], resolveAbility(gm, 'fireball')).ok).toBe(true);
    // a Transmutação só chega na m08
    expect(canCast(gm, mine(gm, 'mage')[0], resolveAbility(gm, 'polymorph')).ok).toBe(false);
    // a traição traz Necromantes, um Ogro e um Balão de Guerra
    gm.mission.triggers.get('betray-now').enabled = true;
    runTicks(gm, 3);
    const foes = gm.getUnitsOf(1);
    expect(foes.filter((u) => u.type === 'necromancer').length).toBe(2);
    expect(foes.filter((u) => u.type === 'ogre').length).toBeGreaterThanOrEqual(1);
    expect(foes.filter((u) => u.type === 'war_balloon').every((u) => u.layer === 'air')).toBe(true);
    expect(foes.some((u) => u.type === 'war_balloon')).toBe(true);
    // Bola de Fogo de verdade: o Mago lança no Necromante e o fere
    const necro = foes.find((u) => u.type === 'necromancer');
    const mage = mine(gm, 'mage')[0];
    const np = pos(necro);
    teleport(gm, mage, np.x + 6, np.z);
    const hp0 = necro.hp;
    issue(gm, { type: CMD.CAST, unitIds: [mage.id], abilityId: 'fireball', targetId: necro.id });
    runTicks(gm, 4 * T);
    expect(necro.isDead || necro.hp < hp0).toBe(true);
  });

  it('08: Ninho de Serpes (aéreos inimigos), Grifos e os dois heróis da Guarda Real, Patrulheiros, ondas com Necromante e Serpe', { timeout: 300000 }, () => {
    const gm = boot('alliance-08-queda-do-cinzal');
    runTicks(gm, 5);
    expect(castle0(gm).tier).toBe(3);
    // a Guarda Real (IA aliada) ficaria sozinha vencendo a missão enquanto o roteiro contém os Clãs: desliga só a IA dela
    for (const d of gm.aiDirectors.filter((x) => x.playerId === 1)) d.dispose?.();
    gm.aiDirectors = gm.aiDirectors.filter((x) => x.playerId !== 1);
    const nest = tagged(gm, 'nest')[0];
    expect(nest.type).toBe('serpent_nest');
    expect(nest.ownerId).toBe(3);
    expect(nest.isConstructed).toBe(true);
    const serpents = tagged(gm, 'serpents');
    expect(serpents.length).toBe(2);
    expect(serpents.every((s) => s.type === 'war_serpent' && s.layer === 'air')).toBe(true);
    // Espadachins não acertam aéreos; Arqueiros e Grifos, sim
    const knight = mine(gm, 'knight')[0];
    const archer = mine(gm, 'archer')[0];
    expect(canTarget(knight, serpents[0])).toBe(false);
    expect(canTarget(archer, serpents[0])).toBe(true);
    give(gm, { gold: 9000, wood: 9000, stone: 3000 });
    for (let i = 0; i < 4; i++) at(gm, 'cottage', 10 + i * 7, 18);
    // Treinamento de Patrulheiro (Serraria) → o Quartel passa a treinar Patrulheiros
    const lumber = gm.buildings.find((b) => b.ownerId === 0 && b.type === 'lumber_camp');
    const barracks = at(gm, 'barracks', 16, 4);
    research(gm, lumber, 'ranged_class');
    settle(gm);
    expect(statusOf(gm, 'ranger-class')).toBe('completed');
    train(gm, barracks, 'archer', 1);
    expect(mine(gm, 'ranger').length).toBe(2); // o Arqueiro inicial é promovido e o novo já sai Patrulheiro
    expect(mine(gm, 'archer').length).toBe(0);
    // até os 7 minutos (a IA terrestre é contida para o roteiro; Skarn e as serpes ficam)
    const skarn = tagged(gm, 'skarn')[0];
    const seen = new Set();
    const steps = Math.ceil((420 * T - gm.currentTick) / (5 * T));
    for (let s = 0; s < steps && !gm.isGameOver; s++) {
      runTicks(gm, 5 * T);
      for (const u of gm.getUnitsOf(2)) seen.add(u.type);
      for (const o of [2, 3]) for (const u of gm.getUnitsOf(o)) if (u.layer === 'ground' && u !== skarn && !u.isDead && !u.isDying) u.takeDamage(1e6, hero(gm));
    }
    runTicks(gm, 3 * T);
    expect(mine(gm, 'hero_brann').length).toBe(1);
    expect(mine(gm, 'hero_oren').length).toBe(1);
    const gryphons = mine(gm, 'gryphon_rider');
    expect(gryphons.length).toBe(2);
    // as ondas dos Clãs trouxeram um Necromante e uma Serpe (aéreo) além da infantaria
    expect(gm.mission.vars.waves).toBeGreaterThanOrEqual(1);
    expect(seen.has('necromancer')).toBe(true);
    expect(seen.has('war_serpent')).toBe(true);
    expect(seen.has('ogre')).toBe(true);
    // os Grifos derrubam o Ninho (combate aéreo/ataque a construção de verdade); as serpes são abatidas antes
    for (const s of serpents) if (!s.isDead) s.takeDamage(1e6, gryphons[0]);
    for (let i = 0; i < 240 * T && !nest.isDead && !gm.isGameOver; i++) {
      if (i % 40 === 0) issue(gm, { type: CMD.ATTACK, unitIds: mine(gm, 'gryphon_rider').map((g) => g.id), targetId: nest.id });
      runTicks(gm, 1);
    }
    settle(gm);
    expect(nest.isDead).toBe(true);
    expect(statusOf(gm, 'nest-fall')).toBe('completed');
  });

  it('é determinística com a restrição: o mesmo roteiro de treino/pesquisa repete os mesmos checksums (m07)', { timeout: 60000 }, () => {
    const play = () => {
      const gm = boot('alliance-07-traicao-presa-negra');
      runTicks(gm, 5);
      give(gm, { gold: 5000, wood: 5000, stone: 1000 });
      at(gm, 'cottage', 10, 16);
      const arcane = at(gm, 'arcane_tower', 14, 8);
      const forge = at(gm, 'forge', 6, 20);
      issue(gm, { type: CMD.TRAIN, buildingId: arcane.id, unitType: 'mage' });
      issue(gm, { type: CMD.TRAIN, buildingId: arcane.id, unitType: 'cavalier' }); // recusado: não é treinado ali
      issue(gm, { type: CMD.RESEARCH, buildingId: forge.id, upgradeId: 'melee_weapons' });
      issue(gm, { type: CMD.RESEARCH, buildingId: forge.id, upgradeId: 'melee_armor' }); // ocupada
      runTicks(gm, 40 * T);
      return gm;
    };
    const a = play();
    const b = play();
    expect(a.checksums.length).toBeGreaterThan(10);
    expect(b.checksums).toEqual(a.checksums);
    expect(a.matchConfig.techRestriction.mission).toBe(7);
    expect(mine(a, 'mage').length).toBe(1);
  });
});
