/** F8-04: API pública do sistema de missões (ver `src/data/missions/README.md`). */
export { MissionRuntime } from './MissionRuntime.js';
export { TriggerEngine } from './TriggerEngine.js';
export { validateMission, assertMission, MissionError, MISSION_FORMAT, MISSION_VERSION, OBJECTIVE_TYPES, CONDITION_TYPES, ACTION_TYPES } from './schema.js';
export { localize } from './text.js';
