import { describe, it, expect } from 'vitest';
import { GameManager } from '../../src/core/GameManager.js';
import { Terrain } from '../../src/world/Terrain.js';
import { createMatchConfig } from '../../src/sim/MatchConfig.js';
import { SIM_DT } from '../../src/sim/constants.js';
import { CMD } from '../../src/sim/commands.js';
import { stateChecksum } from '../../src/sim/checksum.js';
import { getMap, unregisterMap } from '../../src/data/maps/index.js';
import {
  ReplayRecorder, captureReplay, serializeReplay, parseReplay, attachReplay, playReplaySync, replaySeek,
  finishReplaySeek, verifyReplayProgress, setReplayView, checksumAt, ensureReplayMap, formatTicks,
  REPLAY_VERSION, REPLAY_FORMAT, VIEW_ALL, CHECK_EVERY
} from '../../src/replay/Replay.js';
import { ReplayStore, createMemoryReplayBackend } from '../../src/replay/ReplayStore.js';

/**
 * F9-05 — gravar uma partida (IA + jogador humano com comandos injetados), reproduzir a partir do arquivo
 * e obter o mesmo estado: checksum final, checksums intermediários, salto de tempo e troca de visão.
 */
const newGm = (cfg) => new GameManager(new Terrain(getMap(cfg.mapId)), null, null, cfg);
const baseCfg = (seed = 11) => createMatchConfig({ seed, headless: true, ffa: true }); // jogador 0 humano × 2 IAs

/** Script do jogador local: depende só do estado e do tick. */
function humanScript(gm) {
  const t = gm.currentTick;
  const me = gm.localPlayerId;
  const mine = gm.getUnitsOf(me);
  const ids = mine.map((u) => u.id);
  const hq = gm.buildings.find((b) => b.ownerId === me && (b.type === 'castle' || b.type === 'great_hall'));
  const worker = mine.find((u) => u.type === 'villager' || u.type === 'peon');
  if (t === 20) gm.issue({ type: CMD.MOVE, playerId: me, unitIds: ids, x: hq.mesh.position.x + 8, z: hq.mesh.position.z + 8 });
  if (t === 200 && worker) gm.issue({ type: CMD.TRAIN, playerId: me, buildingId: hq.id, unitType: worker.type });
  if (t === 400 && worker) gm.issue({ type: CMD.GATHER, playerId: me, unitIds: [worker.id], targetId: gm.trees[0].id, queued: true });
  if (t === 401 && worker) gm.issue({ type: CMD.TRAIN, playerId: me, buildingId: hq.id, unitType: worker.type }); // 2 comandos no mesmo tick/jogador
  if (t === 1500) gm.issue({ type: CMD.ATTACK_MOVE, playerId: me, unitIds: ids, x: 0, z: 0 });
  if (t === 2400) gm.issue({ type: CMD.STOP, playerId: me, unitIds: gm.getUnitsOf(me).map((u) => u.id) });
}

/** Joga `ticks` ticks gravando; devolve { gm, replay }. */
function record(ticks, seed = 11) {
  const gm = newGm(baseCfg(seed));
  const rec = new ReplayRecorder(gm);
  while (gm.currentTick < ticks) {
    humanScript(gm);
    gm.simStep(SIM_DT);
    if (gm.currentTick % 20 === 0) rec.poll();
  }
  return { gm, replay: parseReplay(serializeReplay(rec.snapshot({ name: 'teste' }))) };
}

describe('replay (F9-05)', { timeout: 120000 }, () => {
  const TICKS = 3000; // 2,5 min
  let rec; // gravado uma vez (a partida é a parte cara)
  const get = () => (rec ||= record(TICKS));

  it('grava só comandos humanos e checksums periódicos, em JSON compacto', () => {
    const { replay, gm } = get();
    expect(replay.format).toBe(REPLAY_FORMAT);
    expect(replay.version).toBe(REPLAY_VERSION);
    expect(replay.ticks).toBe(TICKS);
    expect(replay.cmds.length).toBe(6);
    expect(replay.cmds.every((c) => c.playerId === 0 && c.seqNo === undefined)).toBe(true);
    expect(replay.checks.length).toBe(Math.floor(TICKS / CHECK_EVERY));
    expect(replay.final).toEqual({ tick: TICKS, hash: stateChecksum(gm) });
    expect(replay.summary.players.length).toBe(3);
    expect(serializeReplay(replay).length).toBeLessThan(20000);
  });

  it('reproduzir de um arquivo dá o mesmo checksum final e todos os intermediários', () => {
    const { replay, gm } = get();
    const g2 = newGm(replay.config);
    const res = playReplaySync(g2, replay);
    expect(res.mismatch).toBeNull();
    expect(res.ok).toBe(true);
    expect(res.finalOk).toBe(true);
    expect(res.checksum).toBe(stateChecksum(gm));
    expect(g2._replay.verified).toBe(TICKS);
  });

  it('gravar não altera a sim (mesmo checksum com e sem gravador)', () => {
    const plain = newGm(baseCfg(11));
    while (plain.currentTick < TICKS) { humanScript(plain); plain.simStep(SIM_DT); }
    expect(stateChecksum(plain)).toBe(get().replay.final.hash);
  });

  it('formato versionado: rejeita versão errada, arquivo estranho e JSON quebrado', () => {
    const { replay } = get();
    expect(() => parseReplay({ ...replay, version: REPLAY_VERSION + 1 })).toThrow(/incompatível/);
    expect(() => parseReplay({ ...replay, format: 'outro' })).toThrow(/não é um replay/);
    expect(() => parseReplay('{ quebrado')).toThrow(/corrompido/);
    expect(() => parseReplay({ ...replay, cmds: [{ type: 'move', playerId: 0, tick: 3 }] })).toThrow(/inválido/);
    expect(() => parseReplay({ ...replay, final: null })).toThrow(/inválido/);
    expect(parseReplay(serializeReplay(replay)).final.hash).toBe(replay.final.hash);
  });

  it('salto de tempo: avançar em etapas = simulação direta; recomeçar e saltar bate com o gravado', () => {
    const { replay } = get();
    const T1 = 1000;
    const T2 = 2000;
    // avanço em etapas (salto para frente a partir do ponto atual)
    const a = newGm(replay.config);
    attachReplay(a, replay);
    expect(replaySeek(a, T1, 137)).toBeGreaterThan(0); // em pedaços
    while (replaySeek(a, T1, 137) > 0);
    finishReplaySeek(a);
    expect(a.currentTick).toBe(T1);
    expect(stateChecksum(a)).toBe(checksumAt(replay, T1));
    while (replaySeek(a, T2, 500) > 0);
    finishReplaySeek(a);
    expect(stateChecksum(a)).toBe(checksumAt(replay, T2));
    // "salto para trás" = nova sim saltando direto ao tempo
    const b = newGm(replay.config);
    attachReplay(b, replay);
    replaySeek(b, T2);
    finishReplaySeek(b);
    expect(stateChecksum(b)).toBe(stateChecksum(a));
    // e prosseguir dali até o fim ainda confere
    const res = playReplaySync(b, replay);
    expect(res.ok).toBe(true);
    expect(res.finalOk).toBe(true);
  });

  it('troca de visão (jogador e visão total) não muda o estado da sim', () => {
    const { replay } = get();
    const g = newGm(replay.config);
    attachReplay(g, replay);
    playReplaySync(g, replay, 800);
    setReplayView(g, 1);
    expect(g.localPlayerId).toBe(1);
    playReplaySync(g, replay, 1600);
    setReplayView(g, VIEW_ALL);
    expect(g.fogOfWar.enabled).toBe(false);
    setReplayView(g, 2);
    expect(g.fogOfWar.enabled).toBe(true);
    const res = playReplaySync(g, replay);
    expect(res.mismatch).toBeNull();
    expect(res.finalOk).toBe(true);
  });

  it('detecta divergência (replay incompatível): checksum adulterado e comando removido', () => {
    const { replay } = get();
    const bad = JSON.parse(serializeReplay(replay));
    bad.checks[3][1] ^= 1;
    const g = newGm(bad.config);
    const res = playReplaySync(g, bad);
    expect(res.ok).toBe(false);
    expect(res.mismatch.tick).toBe(bad.checks[3][0]);

    const noCmd = JSON.parse(serializeReplay(replay));
    noCmd.cmds = noCmd.cmds.filter((c) => c.tick !== 200); // sem o treino
    const g2 = newGm(noCmd.config);
    attachReplay(g2, noCmd);
    while (g2.currentTick < TICKS && !verifyReplayProgress(g2)) g2.simStep(SIM_DT);
    expect(g2._replay.mismatch).not.toBeNull();
    expect(g2._replay.mismatch.tick).toBeLessThan(TICKS);
  });

  it('o replay do fim da partida (vitória) cobre a duração real e o resumo', () => {
    // partida curta até alguém vencer não é viável aqui; checa a captura com `isGameOver` simulado.
    const gm = newGm(baseCfg(3));
    for (let i = 0; i < 100; i++) gm.simStep(SIM_DT);
    gm.isGameOver = true;
    gm.gameWon = true;
    const r = captureReplay(gm, { name: 'x' });
    expect(r.summary.over).toBe(true);
    expect(r.summary.localWon).toBe(true);
    expect(r.ticks).toBe(100);
  });

  it('mapa gerado: o replay leva as opções e registra o mapa se faltar', () => {
    const { replay } = get();
    expect(replay.mapGen).toBeNull();
    const gen = JSON.parse(serializeReplay(replay));
    gen.config.mapId = 'gen-77-2p-128';
    gen.mapGen = { seed: 77, players: 2, size: 128 };
    expect(getMap('gen-77-2p-128')).toBeUndefined();
    ensureReplayMap(gen);
    expect(getMap('gen-77-2p-128')).toBeDefined();
    unregisterMap('gen-77-2p-128');
    gen.mapGen = null;
    expect(() => ensureReplayMap(gen)).toThrow(/desconhecido/);
  });

  it('ReplayStore: lista, lê, apaga e poda os mais antigos', async () => {
    const { replay } = get();
    const store = new ReplayStore(createMemoryReplayBackend(), { maxKeep: 3 });
    for (let i = 0; i < 5; i++) await store.put({ ...replay, id: `r${i}`, createdAt: 1000 + i, name: `n${i}` });
    const list = await store.list();
    expect(list.map((m) => m.id)).toEqual(['r4', 'r3', 'r2']);
    expect(list[0].summary.mapId).toBe(replay.config.mapId);
    expect((await store.get('r4')).final.hash).toBe(replay.final.hash);
    await store.remove('r4');
    expect(await store.get('r4')).toBeNull();
    expect((await store.list()).length).toBe(2);
  });

  it('formatTicks', () => {
    expect(formatTicks(0)).toBe('0:00');
    expect(formatTicks(1200)).toBe('1:00');
    expect(formatTicks(72000 + 20 * 65)).toBe('1:01:05');
  });
});
