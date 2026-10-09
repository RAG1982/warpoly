import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { getMap } from '../../src/data/maps/index.js';
import { createCampaignMissionConfig, CampaignProgress, memoryStorage } from '../../src/campaign/index.js';
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

  it('03 Muralhas de Alvorada: 5 minutos de ondas e torres', () => {
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

  it('04 Ponte do Rio Turvo: bloqueio, emboscada e entrega do comboio', () => {
    const gm = boot('alliance-04-ponte-do-rio-turvo');
    runTicks(gm, 5);
    expect(tagged(gm, 'convoy').length).toBe(4);
    slayTag(gm, 'blockade');
    settle(gm);
    expect(statusOf(gm, 'break-blockade')).toBe('completed');
    for (const c of tagged(gm, 'convoy')) teleport(gm, c, -6, 6);
    settle(gm);
    expect(tagged(gm, 'ambush').length).toBe(6);
    expect(statusOf(gm, 'ambush-clear')).toBe('active');
    slayTag(gm, 'ambush');
    for (const c of tagged(gm, 'convoy')) teleport(gm, c, -22, -6);
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
