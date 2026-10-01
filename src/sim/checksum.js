/**
 * checksum.js — Checksum de estado da simulação (F2-03).
 *
 * `stateChecksum(gm)`: hash FNV-1a de 32 bits sobre o estado de jogo relevante à simulação, em
 * ordem de `id` (arrays já mantidos em ordem de criação — ver GameManager): unidades
 * (`id, type, ownerId, x, z` arredondados a 1e-3, `hp`, `state`, e — F4-03 — `mana` e `statuses`), construções (`id, type,
 * ownerId, hp, buildProgress, tamanho da fila`), recursos de cada jogador e `currentTick`.
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

/**
 * @param {import('../core/GameManager.js').GameManager} gm
 * @returns {number}  hash de 32 bits (unsigned)
 */
export function stateChecksum(gm) {
  let h = 0x811c9dc5;

  h = fnv1aStep(h, `tick:${gm.currentTick}|`);

  const units = gm.allUnits;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const p = u.mesh.position;
    h = fnv1aStep(
      h,
      `u:${u.id}:${u.type}:${u.ownerId}:${round3(p.x)}:${round3(p.z)}:${round3(u.hp)}:${u.state}|`
    );
    // F4-03: mana e status (só unidades que os têm, para não custar string por unidade comum).
    if (u.lifetime > 0) h = fnv1aStep(h, `l:${round3(u.lifetime)}|`); // F4-04
    if (u.maxMana > 0) h = fnv1aStep(h, `m:${round3(u.mana)}|`);
    const st = u.statuses;
    for (let k = 0; k < st.length; k++) {
      if (st[k].id !== null) h = fnv1aStep(h, `s:${st[k].id}:${round3(st[k].remaining)}|`);
    }
  }

  // F4-04b: runas/redemoinhos
  const hz = gm.hazards ? gm.hazards.items : [];
  for (let i = 0; i < hz.length; i++) {
    const hh = hz[i];
    h = fnv1aStep(h, `z:${hh.id}:${hh.kind}:${hh.ownerId}:${round3(hh.x)}:${round3(hh.z)}:${round3(hh.life)}|`);
  }

  const buildings = gm.buildings;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    h = fnv1aStep(
      h,
      `b:${b.id}:${b.type}:${b.ownerId}:${round3(b.hp)}:${round3(b.buildProgress)}:${b.queue.length}|`
    );
  }

  const players = gm.players;
  for (let i = 0; i < players.length; i++) {
    const pl = players[i];
    h = fnv1aStep(h, `p:${pl.id}:${pl.resources.wood}:${pl.resources.gold}:${pl.resources.stone}|`);
  }

  return h >>> 0;
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
