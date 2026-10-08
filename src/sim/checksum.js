/**
 * checksum.js — Checksum de estado da simulação (F2-03).
 *
 * `stateChecksum(gm)`: hash FNV-1a de 32 bits sobre o estado de jogo relevante à simulação, em
 * ordem de `id` (arrays já mantidos em ordem de criação — ver GameManager): unidades
 * (`id, type, ownerId, x, z` arredondados a 1e-3, `hp`, `state`, e — F4-03 — `mana` e `statuses`), construções (`id, type,
 * ownerId, hp, buildProgress, tamanho da fila`), recursos de cada jogador (F4-07a: + petróleo, só se > 0) e `currentTick`. F9-03: + ordens, árvores tocadas, jazidas, flechas em voo e estado dos RNGs
 * (ver `stateChecksumDetail`, que devolve o hash por categoria para o relatório de desync).
 *
 * Não inclui nada puramente visual (rotação de malha, partículas, som, animação): duas
 * execuções com a mesma seed e o mesmo log de comandos devem produzir o mesmo checksum a cada
 * chamada, em qualquer máquina/motor JS (aritmética de inteiros de 32 bits é determinística).
 */

/** Hash FNV-1a de 32 bits, alimentado incrementalmente por `hashStr`. */
function fnv1aStep(h, str) {
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Arredonda para 1e-3 (evita que ruído de ponto flutuante de renderização mude o checksum). */
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

const PARTS = ['core', 'units', 'orders', 'hazards', 'buildings', 'players', 'trees', 'deposits', 'projectiles', 'rng'];

/** Hash FNV-1a de um array de partes (combina as categorias no total). */
function combine(parts) {
  let h = 0x811c9dc5;
  for (let i = 0; i < PARTS.length; i++) h = fnv1aStep(h, `${PARTS[i]}=${parts[PARTS[i]]}|`);
  return h >>> 0;
}

/**
 * F9-03: checksum por categoria (para o relatório de desync). `wantUnits` devolve também
 * `[id, hash]` de cada unidade (depuração: aponta a primeira entidade divergente). O custo é
 * O(entidades); `stateChecksum` usa o mesmo cálculo sem a lista.
 *
 * Ampliação F9-03: `orders` (alvo/ordem/fila de cada unidade), `trees` (só as já tocadas),
 * `deposits` (restante, ocupação e fila das jazidas), `projectiles` (flechas em voo) e `rng`
 * (estado de `gm.rng`/`rngMap`/`combatRng` e das IAs). `corpses`/`fog` ficam de fora de
 * propósito: só apresentação ou derivados.
 *
 * @returns {{total: number, parts: Record<string, number>, units: Array<[number, number]>|null}}
 */
export function stateChecksumDetail(gm, wantUnits = false) {
  const parts = {};
  const unitList = wantUnits ? [] : null;

  let h = fnv1aStep(0x811c9dc5, `tick:${gm.currentTick}|`);
  parts.core = h >>> 0;

  h = 0x811c9dc5;
  let ho = 0x811c9dc5;
  const units = gm.allUnits;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const p = u.mesh.position;
    let us = `u:${u.id}:${u.type}:${u.ownerId}:${round3(p.x)}:${round3(p.z)}:${round3(u.hp)}:${u.state}|`;
    // F4-03: mana e status (só unidades que os têm, para não custar string por unidade comum).
    if (u.lifetime > 0) us += `l:${round3(u.lifetime)}|`; // F4-04
    if (u.maxMana > 0) us += `m:${round3(u.mana)}|`;
    const st = u.statuses;
    for (let k = 0; k < st.length; k++) {
      if (st[k].id !== null) us += `s:${st[k].id}:${round3(st[k].remaining)}|`;
    }
    h = fnv1aStep(h, us);
    // F9-03: ordens — alvo (por id), destino de caminho e tamanho/tipos da fila.
    const te = u.targetEntity ? u.targetEntity.id : -1;
    const at = u.attackTarget ? u.attackTarget.id : -1;
    const pd = u.pathDestination;
    let os = `o:${u.id}:${te}:${at}:${pd ? round3(pd.x) + ',' + round3(pd.z) : '-'}`;
    const oq = u.orderQueue;
    if (oq && oq.length > 0) {
      os += ':q';
      for (let k = 0; k < oq.length; k++) os += `${oq[k].type}@${round3(oq[k].x || 0)},${round3(oq[k].z || 0)}${oq[k].target ? '#' + oq[k].target.id : ''};`;
    }
    ho = fnv1aStep(ho, os + '|');
    if (unitList) unitList.push([u.id, fnv1aStep(0x811c9dc5, us + os)]);
  }
  parts.units = h >>> 0;
  parts.orders = ho >>> 0;

  // F4-04b: runas/redemoinhos
  h = 0x811c9dc5;
  const hz = gm.hazards ? gm.hazards.items : [];
  for (let i = 0; i < hz.length; i++) {
    const hh = hz[i];
    h = fnv1aStep(h, `z:${hh.id}:${hh.kind}:${hh.ownerId}:${round3(hh.x)}:${round3(hh.z)}:${round3(hh.life)}|`);
  }
  parts.hazards = h >>> 0;

  h = 0x811c9dc5;
  const buildings = gm.buildings;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    h = fnv1aStep(
      h,
      `b:${b.id}:${b.type}:${b.ownerId}:${round3(b.hp)}:${round3(b.buildProgress)}:${b.queue.length}|`
    );
  }
  parts.buildings = h >>> 0;

  h = 0x811c9dc5;
  const players = gm.players;
  for (let i = 0; i < players.length; i++) {
    const pl = players[i];
    h = fnv1aStep(h, `p:${pl.id}:${pl.resources.wood}:${pl.resources.gold}:${pl.resources.stone}|`);
    if (pl.resources.oil) h = fnv1aStep(h, `o:${pl.resources.oil}|`); // F4-07a: só quando há petróleo (mapas sem poços mantêm o checksum)
  }
  parts.players = h >>> 0;

  // F9-03: árvores já tocadas (cortadas ou mortas) — as intactas não custam string.
  h = 0x811c9dc5;
  const trees = gm.trees || [];
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    if (t.isDead || t.woodRemaining !== t.maxWood) h = fnv1aStep(h, `t:${t.id}:${round3(t.woodRemaining)}:${t.isDead ? 1 : 0}|`);
  }
  parts.trees = h >>> 0;

  h = 0x811c9dc5;
  const deps = gm.resourceDeposits || [];
  for (let i = 0; i < deps.length; i++) {
    const d = deps[i];
    h = fnv1aStep(h, `d:${d.id}:${round3(d.resourcesRemaining)}:${d.inside.length}:${d.queue.length}|`);
  }
  parts.deposits = h >>> 0;

  h = 0x811c9dc5;
  const arrows = gm.arrows || [];
  for (let i = 0; i < arrows.length; i++) {
    const a = arrows[i];
    h = fnv1aStep(h, `a:${a.id}:${round3(a.pos.x)}:${round3(a.pos.z)}:${round3(a.progress)}|`);
  }
  parts.projectiles = h >>> 0;

  h = 0x811c9dc5;
  const rs = [gm.rng, gm.rngMap, gm.combatRng];
  const dirs = gm.aiDirectors || [];
  for (let i = 0; i < dirs.length; i++) rs.push(dirs[i].rng);
  for (let i = 0; i < rs.length; i++) h = fnv1aStep(h, `r${i}:${rs[i] && rs[i].state ? rs[i].state() : '-'}|`);
  parts.rng = h >>> 0;

  return { total: combine(parts), parts, units: unitList };
}

/**
 * @param {import('../core/GameManager.js').GameManager} gm
 * @returns {number}  hash de 32 bits (unsigned)
 */
export function stateChecksum(gm) {
  return stateChecksumDetail(gm, false).total;
}

/**
 * Registra o checksum atual em `gm.checksums` (mantém os últimos `limit`). Chamado a cada 20
 * ticks pelo `simStep` — ver GameManager.
 */
export function recordChecksum(gm, limit = 100) {
  if (!gm.checksums) gm.checksums = [];
  gm.checksums.push({ tick: gm.currentTick, hash: stateChecksum(gm) });
  if (gm.checksums.length > limit) gm.checksums.shift();
}
