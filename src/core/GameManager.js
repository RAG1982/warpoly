// F2-08c: o `GameManager` (simulação pura) vive em `src/sim/GameManager.js`; reexport de compatibilidade.
export * from '../sim/GameManager.js';
import '../ai/registerAI.js'; // F2-08d: injeta a fábrica do AIDirector na sim
