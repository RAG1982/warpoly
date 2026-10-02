/** F2-08d: registra o AIDirector na sim (efeito colateral do import). Ver `src/sim/aiRegistry.js`. */
import { setAIDirectorFactory } from '../sim/aiRegistry.js';
import { AIDirector } from './AIDirector.js';

setAIDirectorFactory((gm, playerId, startPos, difficulty) => new AIDirector(gm, playerId, startPos, difficulty));
