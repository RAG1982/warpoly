/**
 * aiRegistry.js — F2-08d: a sim não importa `src/ai/`; a fábrica do AIDirector é injetada por quem monta a partida
 * (`src/ai/registerAI.js`, importado por `src/core/GameManager.js`, `MatchSession` e `tools/headless-match.js`).
 * Mesma ordem de criação/atualização de antes: o GameManager cria um diretor por jogador de IA em `_spawnStartingBase`.
 */
let factory = null;

/** @param {(gm:object, playerId:number, startPos:{x:number,y:number}, difficulty:string) => object} fn */
export function setAIDirectorFactory(fn) {
  factory = fn;
}

export function createAIDirector(gm, playerId, startPos, difficulty) {
  if (!factory) throw new Error('AIDirector não registrado: importe src/ai/registerAI.js antes de criar a partida com IA.');
  return factory(gm, playerId, startPos, difficulty);
}
