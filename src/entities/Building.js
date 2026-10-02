// F2-08c: `Building` agora é uma entidade de simulação pura em `src/sim/Building.js`. Reexport de compatibilidade
// para UI/InputManager/ferramentas que ainda importam daqui (a malha vive em `src/render/BuildingView.js`).
export * from '../sim/Building.js';
