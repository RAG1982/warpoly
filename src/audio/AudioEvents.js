/**
 * AudioEvents.js — F2-07/F7-08: ouvinte de apresentação que traduz eventos de `gm.events` (`src/sim/events.js`) em som.
 * Espelha `render/VfxEvents.js`: a decisão "o que toca" é PURA e testada (`audioMapping.js`); aqui só se coleta o contexto
 * (dono local, visibilidade na névoa, posição da câmera, tipo de habilidade, unidades selecionadas) e se executa.
 * Criado pela `MatchSession`; nunca em modo headless (`MatchConfig.headless`): não há Web Audio em Node.
 *
 *  - Efeitos: posicionais (atenuação pela distância ao alvo da câmera, pelo zoom + panorama) e com limite de vozes por
 *    prioridade; TUDO que tem posição é descartado se estiver fora da cena visível (frustum da câmera + margem; `isAudible`),
 *    e sons de unidades alheias só se a posição está visível na névoa. Sons globais (interface, alarme "sob ataque",
 *    marcos, vitória/derrota — descritores sem `pos`) não são filtrados.
 *  - Falas: ao selecionar e ao dar ordem, fala a unidade "líder" da seleção (herói > conjurador > equipagem > soldado >
 *    trabalhador), PT-BR, sintetizadas por formantes. A seleção em grupo e as ordens por tecla/menu não passam por evento: o
 *    InputManager chama `gm.soundManager.playSelect()/playOrder()`, então este módulo põe ali um adaptador (`inputSound`)
 *    que fala (ou, sem voz, toca o clique de antes) e o devolve no `dispose`.
 *  - Música adaptativa: dano/morte/explosão alimentam a intensidade de combate (`combatWeight`).
 *  - Partida: avisa o `SoundManager` (facção do jogador local e tileset do mapa → música e ambiência).
 */
import { EVT } from '../sim/events.js';
import { resolveAbility } from '../sim/abilities.js';
import { soundsForEvent, combatWeight, SFX_EVENTS, COMBAT_EVENTS } from './audioMapping.js';
import { listenerRanges, isAudible, mulMat4 } from './attenuation.js';
import { createSpeechDirector, speakerFor, leaderOf } from './speech/speechLines.js';
import { createAudioRng } from './audioConfig.js';

/**
 * @param {import('../core/GameManager.js').GameManager} gm
 * @param {*} sound  `SoundManager` (ou falso nos testes)
 * @param {{tilesetId?:string|null}} [opts]  tileset do mapa (ambiência)
 * @returns {() => void} `dispose` — remove todos os ouvintes e devolve o gancho de som do InputManager.
 */
export function createAudioEvents(gm, sound, { tilesetId = null } = {}) {
  const offs = [];
  const on = (type, fn) => offs.push(gm.events.on(type, fn, true)); // true = apresentação (F2-06)
  const isLocal = (ownerId) => ownerId === gm.localPlayerId;

  // --- ouvinte = alvo da câmera (lido na hora do evento; objeto reutilizado, sem alocação por evento)
  const L = { x: 0, z: 0, zoom: 1, rightX: 1, rightZ: 0, viewProj: null, bounds: null };
  const vp = new Float64Array(16);
  const syncListener = () => {
    const sm = gm.sceneManager;
    if (!sm || !sm.cameraTarget) return;
    L.x = sm.cameraTarget.x;
    L.z = sm.cameraTarget.z;
    L.zoom = typeof sm.zoomLevel === 'number' ? sm.zoomLevel : 1;
    const e = sm.camera && sm.camera.matrixWorld && sm.camera.matrixWorld.elements;
    if (e) { L.rightX = e[0]; L.rightZ = e[2]; } // eixo "direita" da câmera projetado no chão
    // recorte pela cena visível: projeção × visão (a visão é a inversa do mundo da câmera, atualizada a cada quadro)
    const cam = sm.camera;
    const proj = cam && cam.projectionMatrix && cam.projectionMatrix.elements;
    const view = cam && cam.matrixWorldInverse && cam.matrixWorldInverse.elements;
    L.viewProj = proj && view ? mulMat4(vp, proj, view) : null; // sem câmera (testes): só distância
    sound.setListener(L);
  };
  const visibleAt = (pos) => {
    const f = gm.fogOfWar;
    return !pos || !f || f.isVisible(pos.x, pos.z);
  };

  // --- efeitos sonoros
  const play = (type, p) => {
    const pos = p.pos || p.from || null;
    const own = isLocal(p.ownerId);
    const info = { own, visible: own || visibleAt(pos) };
    if (type === EVT.MELEE_HIT) info.faction = factionOf({ ownerId: p.ownerId }); // aço × ferro
    if (type === EVT.ABILITY_CAST) {
      const ab = resolveAbility(gm, p.abilityId);
      info.vfxKind = ab && ab.vfx ? ab.vfx.kind : 'burst';
    }
    const list = soundsForEvent(type, p, info);
    if (list.length === 0) return;
    syncListener();
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.pos && !isAudible(d.pos, L, d.margin)) continue; // fora da cena: não soa
      sound.playSfx(d.sfx, d);
    }
  };
  for (const type of SFX_EVENTS) on(type, (p) => play(type, p));

  // --- intensidade de combate (música adaptativa)
  for (const type of COMBAT_EVENTS) {
    on(type, (p) => {
      const own = isLocal(p.ownerId);
      let near = false;
      if (!own && p.pos && visibleAt(p.pos)) {
        syncListener();
        const dx = p.pos.x - L.x;
        const dz = p.pos.z - L.z;
        near = Math.sqrt(dx * dx + dz * dz) < listenerRanges(L.zoom).max;
      }
      const w = combatWeight(type, p, { own, near });
      if (w > 0) sound.noteCombat(w);
    });
  }

  // --- falas de confirmação (seleção e ordem)
  const speech = createSpeechDirector({ rng: createAudioRng(0x5eed ^ (gm.localPlayerId | 0)) });
  const factionOf = (u) => {
    const pl = gm.getPlayer ? gm.getPlayer(u.ownerId) : null;
    return pl && pl.factionId ? pl.factionId : 'human';
  };
  /** true = tratou o som (falou ou foi limitada pela política); false = sem voz possível (toca o clique). */
  const speakUnits = (kind, units) => {
    if (!sound.canSpeak()) return false;
    const lead = leaderOf(units, factionOf);
    if (!lead) return false;
    const now = sound.now();
    const line = speech.pick(kind, lead.speaker, now);
    if (!line) return true;
    const dur = sound.speak(line);
    if (dur > 0) speech.started(now, dur);
    return true;
  };
  const selectedUnits = () => (gm.selectedUnits && gm.selectedUnits.length ? gm.selectedUnits : null);

  on(EVT.SELECTED, ({ entityId }) => {
    const e = gm.entitiesById.get(entityId);
    if (e && e.type && speakerFor(e.type, factionOf(e)) && speakUnits('select', [e])) return;
    sound.playSelect(); // construção, recurso ou unidade sem voz: o clique de sempre
  });
  on(EVT.ORDER_ISSUED, () => {
    const sel = selectedUnits();
    if (sel && speakUnits('order', sel)) return;
    sound.playOrder();
  });

  // InputManager (seleção em grupo, S/H/A/P, magias) chama `gm.soundManager.playSelect()/playOrder()` direto.
  const inputSound = {
    playSelect() {
      const sel = selectedUnits();
      if (!(sel && speakUnits('select', sel))) sound.playSelect();
    },
    playOrder() {
      const sel = selectedUnits();
      if (!(sel && speakUnits('order', sel))) sound.playOrder();
    }
  };
  const previousHook = gm.soundManager;
  gm.soundManager = inputSound;

  // --- partida: música da facção do jogador local + ambiência do tileset
  const lp = gm.localPlayer;
  sound.beginMatch({ faction: lp && lp.factionId ? lp.factionId : 'human', tilesetId });
  sound.setSceneProbe(() => {
    const sm = gm.sceneManager;
    return sm ? { timeOfDay: sm.timeOfDay, dayNight: sm.dayNight } : {};
  });

  return function dispose() {
    offs.forEach((off) => off());
    offs.length = 0;
    if (gm.soundManager === inputSound) gm.soundManager = previousHook;
    sound.endMatch();
  };
}
