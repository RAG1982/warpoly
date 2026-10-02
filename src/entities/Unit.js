// F2-08c: `Unit` agora é uma entidade de simulação pura em `src/sim/Unit.js`. Reexport de compatibilidade
// para quem ainda importa daqui (a malha/animador vive em `src/render/UnitView.js`).
export * from '../sim/Unit.js';
