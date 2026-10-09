import { UNIT_TRAIN_CONFIG, BUILDING_BUILD_CONFIG, WORKER_BUILD_LIST } from '../entities/Building.js';
import {
  UPGRADE_CONFIG, RESEARCH, researchIdsFor, getMaxResearchLevel,
  BUILDING_TRAINABLE_UNITS, getUnitDef, getBuildingDef
} from '../data/index.js';
import {
  missingRequirements, missingUnitRequirements, missingUpgradeRequirements
} from '../sim/requirements.js';
import {
  t, applyI18n, onLanguageChange, researchName, describeLevelText, tierName as tierNameT, resourceName,
  abilityName as abilityNameT, abilityDesc, buildingDesc
} from '../i18n/index.js';
import {
  unitLabel, buildingLabel, requirementsLine, resourceNodeName, formatClock, localizeSimText
} from './uiText.js';
import { initUiScale } from './uiScale.js';
import { drawMinimapPings } from './minimapPings.js';
import { getBuildHotkey, getTrainHotkey, getResearchHotkey } from './hotkeys.js';
import { buildCostHtml } from './Tooltip.js';
import { CMD } from '../sim/commands.js';
import { isDetectedBy } from '../sim/detection.js';
import { resolveAbility, canCast, selectionAbilityUnits } from '../sim/abilities.js';
import { buildPostGameModel } from './postGame.js';
import { PostGameScreen } from './screens/PostGameScreen.js';
import { worldToMinimap, minimapToWorld } from './minimapCoords.js';
import { NEUTRAL_HOSTILE_ID } from '../sim/EntityIds.js';
import { renderTerrainImage } from './terrainMinimapImage.js';
import { Vector3 } from 'three';
import {
  frustumGroundQuad, playerColor, pointerToCanvas, pickMinimapTarget,
  OrderFlashes, orderKindFor, drawOrderFlashes, drawCameraQuad
} from './minimapView.js';

// Quem treina o quê — derivado de src/data/buildings.js (campo `trains`)
export { BUILDING_TRAINABLE_UNITS };

/** F3-07: role de pesquisa ('forge' | 'lumber') da construção, ou null se ela não pesquisa. */
function researchRoleOf(b) {
  const role = getBuildingDef(b.type).role;
  return role === 'forge' || role === 'lumber' || role === 'arcane' || role === 'temple' || role === 'foundry' ? role : null; // F4-07b: foundry
}

export class UIManager {
  constructor(gameManager, sceneManager, inputManager, soundManager) {
    this.gm = gameManager;
    this.sm = sceneManager;
    this.im = inputManager;
    this.sound = soundManager;

    // Cache DOM Elements
    this.woodVal = document.getElementById('wood-val');
    this.goldVal = document.getElementById('gold-val');
    this.stoneVal = document.getElementById('stone-val');
    this.oilVal = document.getElementById('oil-val'); // F4-07a
    this.oilItem = document.getElementById('res-oil');
    this.popVal = document.getElementById('pop-val');

    this.selectionCard = document.getElementById('selection-card');

    // Standard Selection View (Units & Resources)
    this.standardView = document.getElementById('standard-selection-view');
    this.selectionTitle = document.getElementById('selection-title');
    this.selectionHp = document.getElementById('selection-hp');
    this.selectionHpBar = document.getElementById('selection-hp-fill');
    this.selectionStats = document.getElementById('selection-stats');
    this.selectionActions = document.getElementById('selection-actions');

    // Building Selection View (Matches dialogoBarracs.png)
    this.buildingView = document.getElementById('building-selection-view');
    this.bldSelectionTitle = document.getElementById('bld-selection-title');
    this.bldSelectionHp = document.getElementById('bld-selection-hp');
    this.bldSelectionHpFill = document.getElementById('bld-selection-hp-fill');
    this.bldExtraInfo = document.getElementById('bld-extra-info');

    // F3-06: card de nível do Centro (só role: 'hq')
    this.bldHqTierSection = document.getElementById('bld-hq-tier-section');
    this.bldCancelSection = document.getElementById('bld-cancel-section');
    this.bldHqTierLabel = document.getElementById('bld-hq-tier-label');
    this.bldHqUpgradeBtn = document.getElementById('bld-hq-upgrade-btn');
    this.bldHqUpgradeBtnLabel = document.getElementById('bld-hq-upgrade-btn-label');
    this.bldHqUpgradeProgressBar = document.getElementById('bld-hq-upgrade-progress-bar');
    this.bldHqUpgradeProgressTrack = document.getElementById('bld-hq-upgrade-progress-track');

    this.bldTrainSection = document.getElementById('bld-train-section');
    this.bldTrainLabel = this.bldTrainSection ? this.bldTrainSection.querySelector('.bld-section-label') : null;
    this.bldTrainButtons = document.getElementById('bld-train-buttons');
    this.bldQueueSection = document.getElementById('bld-queue-section');
    this.bldQueueLabel = this.bldQueueSection ? this.bldQueueSection.querySelector('.bld-section-label') : null;
    this.bldQueueSlots = document.querySelectorAll('.bld-queue-slot');
    this.bldQueueProgressBar = document.getElementById('bld-queue-progress-bar');
    this.bldQueueProgressTrack = document.querySelector('.bld-queue-progress-track');
    this.currentBuilding = null;
    this.lastResearchedCount = 0;
    this.lastResearchId = null;

    this.selectionPortraits = document.getElementById('selection-portraits');
    this.lastPortraitKey = null;

    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;

    // F6-03: --ui-scale (HUD responsiva); listener de resize removido em dispose().
    this._disposeUiScale = initUiScale();

    this.notificationBox = document.getElementById('notification-box');
    this.postGame = new PostGameScreen(document.getElementById('game-over-modal'));
    this._postGameShown = false;

    this.lastSelectionKey = null;

    // F2-04: os elementos da HUD vivem a aplicação inteira; os listeners desta instância
    // saem em dispose() (a sessão de partida é recriada sem recarregar a página).
    this._abort = new AbortController();
    this._listenOpts = { signal: this._abort.signal };
    this._notificationTimer = null;

    // F6-09: trocar o idioma refaz os textos estáticos e força o redesenho do card de seleção.
    this._offLang = onLanguageChange(() => {
      applyI18n();
      this.lastSelectionKey = null;
      this.lastPortraitKey = null;
      this.currentBuilding = null;
      this._lastPop = null;
    });

    this.initControls();
    this.initMinimapEvents();
    this.initActionsEventDelegation();
    this.initAbilityContextMenu();
    this.initBuildingEvents();
    this.initPortraitEvents();
  }

  /** F6-03: clique num retrato da grade de seleção múltipla seleciona só aquela unidade. */
  initPortraitEvents() {
    if (!this.selectionPortraits) return;
    this.selectionPortraits.addEventListener('click', (e) => {
      const el = e.target.closest('[data-portrait-id]');
      if (!el) return;
      const entity = this.gm.getEntity(Number(el.getAttribute('data-portrait-id')));
      if (entity) this.gm.selectSingle(entity);
    }, this._listenOpts);
  }

  initControls() {
    // F6-08: a engrenagem abre o OptionsPanel (velocidade, volumes, iluminação, escala… estão lá).
    document.getElementById('btn-config')?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('warpoly:open-options'));
      this.sound.playSelect();
    }, this._listenOpts);

    // Help / Game Guide Modal
    const helpModal = document.getElementById('help-modal');
    document.getElementById('btn-open-guide')?.addEventListener('click', () => {
      if (helpModal) helpModal.style.display = 'flex';
      this.sound.playSelect();
    }, this._listenOpts);
    document.getElementById('btn-close-help')?.addEventListener('click', () => {
      if (helpModal) helpModal.style.display = 'none';
      this.sound.resume();
    }, this._listenOpts);

    // Fim de jogo: "Jogar novamente" / "Menu principal" são ligados pela aplicação (main.js, F2-04).
  }

  initMinimapEvents() {
    if (!this.minimapCanvas) return;
    const canvas = this.minimapCanvas;
    canvas.title = t('minimap.label');
    this.minimapOrders = new OrderFlashes();

    /** Ponto do mundo sob o ponteiro (respeita a escala CSS do canvas). */
    const worldAt = (e) => {
      const p = pointerToCanvas(e.clientX, e.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height);
      return minimapToWorld(p.x, p.y, this.gm.terrain.mapDef.size, canvas.width, canvas.height);
    };
    const moveCamera = (e) => {
      const { x, z } = worldAt(e);
      this.sm.cameraTarget.set(x, this.gm.terrain.getHeight(x, z), z);
    };

    // Clique esquerdo move a câmera; segurar e arrastar acompanha o ponteiro (F6-04).
    let dragging = false;
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // o direito envia ordens (abaixo)
      if (e.altKey && this.onMapPingRequest) { // F9-04: Alt+clique = ping para os aliados (partida online)
        const { x, z } = worldAt(e);
        this.onMapPingRequest({ x, z }, e.shiftKey ? 'attack' : 'attention');
        return;
      }
      dragging = true;
      moveCamera(e);
    }, this._listenOpts);
    window.addEventListener('mousemove', (e) => { if (dragging) moveCamera(e); }, this._listenOpts);
    window.addEventListener('mouseup', (e) => { if (e.button === 0) dragging = false; }, this._listenOpts);

    // Clique direito: mesma ordem contextual do clique direito no mundo (atacar, coletar, construir,
    // reparar, mover; sem unidades e com construção própria selecionada = ponto de reunião). Shift enfileira.
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const { x, z } = worldAt(e);
      const gm = this.gm;
      const noUnits = gm.selectedUnits.every(u => u.isDead || u.isDying);
      const rallying = noUnits && !!gm.selectedBuilding && gm.selectedBuilding.ownerId === gm.localPlayerId;
      if (noUnits && !rallying) return;
      const mapSize = gm.terrain.mapDef.size;
      const target = rallying ? null : pickMinimapTarget(gm, x, z, Math.max(3, 5 * mapSize / canvas.width));
      const at = target && target.mesh ? target.mesh.position : { x, z };
      gm.issueOrder(target, { x: at.x, y: gm.terrain.getHeight(at.x, at.z), z: at.z }, { queued: e.shiftKey });
      this.minimapOrders.add(at.x, at.z, rallying ? 'rally' : orderKindFor(gm, target));
    }, this._listenOpts);
  }

  /** `severity` (F6-05): 'danger' | 'warn' | 'good' colore a borda do banner. */
  showNotification(msg, duration = 4000, severity = null) {
    if (!this.notificationBox) return;
    this.notificationBox.innerText = localizeSimText(msg);
    this.notificationBox.dataset.severity = severity || '';
    this.notificationBox.style.opacity = '1';
    this.notificationBox.style.transform = 'translateX(-50%) translateY(0)';

    clearTimeout(this._notificationTimer);
    this._notificationTimer = setTimeout(() => {
      this._notificationTimer = null;
      this.notificationBox.style.opacity = '0';
      this.notificationBox.style.transform = 'translateX(-50%) translateY(-20px)';
    }, duration);
  }

  update(delta = 0.016) {
    // 1. Update Resources Bar (dirty-checked to prevent layout thrashing and string allocations)
    const wood = Math.floor(this.gm.resources.wood);
    if (this._lastWood !== wood) {
      this._lastWood = wood;
      if (this.woodVal) this.woodVal.innerText = wood;
    }
    const gold = Math.floor(this.gm.resources.gold);
    if (this._lastGold !== gold) {
      this._lastGold = gold;
      if (this.goldVal) this.goldVal.innerText = gold;
    }
    const stone = Math.floor(this.gm.resources.stone);
    if (this._lastStone !== stone) {
      this._lastStone = stone;
      if (this.stoneVal) this.stoneVal.innerText = stone;
    }
    // F4-07a: petróleo (aparece só quando a partida tem poços no mapa ou o jogador tem > 0)
    const oil = Math.floor(this.gm.resources.oil || 0);
    if (this._lastOil !== oil) {
      this._lastOil = oil;
      if (this.oilVal) this.oilVal.innerText = oil;
    }
    if (this.oilItem) {
      const showOil = oil > 0 || this.gm.hasOilWells;
      if (this._oilShown !== showOil) {
        this._oilShown = showOil;
        this.oilItem.style.display = showOil ? '' : 'none';
      }
    }
    const pop = this.gm.population;
    const maxPop = this.gm.maxPopulation;
    if (this._lastPop !== pop || this._lastMaxPop !== maxPop) {
      this._lastPop = pop;
      this._lastMaxPop = maxPop;
      if (this.popVal) {
        // F6-03: "/ maxPop" num <span> à parte para poder escondê-lo em telas estreitas (<1100px).
        this.popVal.innerHTML = `${pop} <span class="pop-secondary">/ ${maxPop}</span>`;
        if (pop >= maxPop) {
          this.popVal.style.color = '#f87171'; // Red warning when population cap is reached
        } else if (pop >= maxPop - 1) {
          this.popVal.style.color = '#fb923c'; // Orange notice when nearly capped
        } else {
          this.popVal.style.color = '#fef08a'; // Normal golden color
        }
      }
    }

    // 2. Selection Card
    this.updateSelectionCard();

    // 3. Minimap (throttled to ~12.5 FPS to preserve CPU cycles during large battles)
    this.minimapTimer = (this.minimapTimer || 0) + delta;
    if (this.minimapTimer >= 0.08) {
      if (this.minimapOrders) this.minimapOrders.update(this.minimapTimer);
      this.minimapTimer = 0;
      this.drawMinimap();
    }

    // 4. Tela pós-jogo (F6-07): pontuação, ranking e gráficos
    // F8-04: em missões a tela de fim é a do MissionController (que chama `showPostGame` pelo botão Estatísticas).
    if (this.gm.isGameOver && !this._postGameShown && !this.gm.mission) {
      this.showPostGame();
    }
  }

  /** Mostra a tela pós-jogo (pontuação e gráficos). */
  showPostGame() {
    this._postGameShown = true;
    this.postGame.show(this._postGameModel());
  }

  initActionsEventDelegation() {
    if (!this.selectionActions) return;
    this.selectionActions.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      // 1. Building placement
      const buildType = btn.getAttribute('data-build');
      if (buildType) {
        this.im.startPlacement(buildType);
        this.sound.playSelect();
        return;
      }

      // 2. Unit stop command (F2-02: comando STOP)
      const action = btn.getAttribute('data-action');
      if (action === 'repair') {
        this.im.startRepairMode();
        this.sound.playSelect();
        return;
      }
      // F4-03: habilidade do card (modo-alvo ou lançamento imediato — ver InputManager.beginAbility)
      const abilityId = btn.getAttribute('data-ability');
      if (abilityId) {
        this.im.beginAbility(abilityId);
        this.sound.playSelect();
        return;
      }
      if (action === 'unload') { // F4-07b
        const boats = this.gm.selectedUnits.filter(u => u.transportCapacity > 0 && u.cargo && u.cargo.length > 0);
        if (boats.length === 0) {
          this.showNotification(t('hud.noCargo'));
          return;
        }
        for (const b of boats) this.gm.issue({ type: CMD.UNLOAD, playerId: this.gm.localPlayerId, unitId: b.id });
        this.sound.playSelect();
        return;
      }
      if (action === 'stop') {
        this.gm.issue({
          type: CMD.STOP,
          playerId: this.gm.localPlayerId,
          unitIds: this.gm.selectedUnits.map(u => u.id)
        });
        return;
      }

      // 3. Train units (F2-02: comando TRAIN — pré-checks aqui só dão feedback imediato de
      // UI; a validação autoritativa (custo/fila/pop) acontece no CommandExecutor no tick).
      const trainType = btn.getAttribute('data-train');
      if (trainType && this.gm.selectedBuilding) {
        const b = this.gm.selectedBuilding;
        const cfg = UNIT_TRAIN_CONFIG[trainType];
        if (b.queue.length >= 6) {
          this.sound.playChop();
          this.showNotification(t('hud.queueFull'));
          return;
        }
        if (this.gm.population >= this.gm.maxPopulation) {
          this.alerts ? this.alerts.raise('food') : this.showNotification(t('alert.food'));
          return;
        }
        if (cfg && !this.gm.canAfford(cfg.cost)) {
          this.sound.playChop();
          this.showNotification(t('hud.cantAffordTrain', { name: unitLabel(trainType) }));
          return;
        }
        this.gm.issue({ type: CMD.TRAIN, playerId: this.gm.localPlayerId, buildingId: b.id, unitType: trainType });
        this.sound.playSelect();
        this.lastSelectionKey = null; // force immediate re-render of queue counters
      }
    }, this._listenOpts);
  }

  /** F4-03: clique direito num botão de habilidade liga/desliga o auto-cast (quando suportado). */
  initAbilityContextMenu() {
    if (!this.selectionActions) return;
    this.selectionActions.addEventListener('contextmenu', (e) => {
      const btn = e.target.closest('button[data-ability]');
      if (!btn) return;
      e.preventDefault();
      const id = btn.getAttribute('data-ability');
      const ab = resolveAbility(this.gm, id);
      if (!ab || !ab.autocast) return;
      const units = selectionAbilityUnits(this.gm.selectedUnits).filter(u => u.abilities.includes(id));
      if (units.length === 0) return;
      const enable = !units[0].autocast[id];
      this.gm.issue({ type: CMD.SET_AUTOCAST, playerId: this.gm.localPlayerId, unitIds: units.map(u => u.id), abilityId: id, enabled: enable });
      btn.classList.toggle('ability-autocast-on', enable); // feedback imediato (o comando roda no próximo tick)
      this.sound.playSelect();
    }, this._listenOpts);
  }

  /**
   * F4-03: HTML dos botões de habilidade (até 4) das unidades do card. O estado dinâmico (mana, recarga,
   * desabilitado, auto-cast) é atualizado por `updateAbilityButtons` sem recriar o DOM.
   */
  renderAbilityButtons(abilityIds) {
    return abilityIds.map(id => {
      const ab = resolveAbility(this.gm, id);
      if (!ab) return '';
      const name = abilityNameT(ab.id, ab);
      const icon = typeof ab.icon === 'string' && ab.icon.startsWith('/')
        ? `<img src="${ab.icon}" class="bld-train-btn-icon" alt="${name}" />`
        : `<span class="action-stop-icon">${ab.icon}</span>`;
      const cost = (ab.manaCost || 0) + (ab.manaPerHp > 0 ? ` +${ab.manaPerHp}${t('hud.perHp')}` : '');
      return `
        <button class="bld-train-btn ability-btn" data-ability="${id}" title="${name}${ab.hotkey ? ` (${ab.hotkey})` : ''}">
          ${ab.hotkey ? `<span class="bld-hotkey-badge">${ab.hotkey}</span>` : ''}
          ${icon}
          <span class="ability-mana">${cost}</span>
          <span class="ability-cd" data-cd="${id}"></span>
          <div class="bld-hint-bubble">
            <div class="bld-hint-col">
              <div class="bld-hint-header">
                <span class="bld-hint-title">${name}${ab.hotkey ? ` <span class="bld-hint-hotkey">(${ab.hotkey})</span>` : ''}</span>
                <span class="bld-hint-desc">${abilityDesc(ab.id, ab)}</span>
              </div>
              <div class="bld-hint-footer">
                ${t('hud.abilityFooter', { mana: cost, range: ab.range || 0, cd: ab.cooldown || 0 })}${ab.autocast ? ` &bull; ${t('hud.autocastHint')}` : ''}
                <span class="ability-req" data-req="${id}"></span>
              </div>
            </div>
          </div>
        </button>
      `;
    }).join('');
  }

  /** F4-03: atualiza desabilitado/recarga/auto-cast dos botões de habilidade (dirty-checked por botão). */
  updateAbilityButtons() {
    if (!this.selectionActions) return;
    const units = selectionAbilityUnits(this.gm.selectedUnits);
    if (units.length === 0) return;
    const buttons = this.selectionActions.querySelectorAll('button[data-ability]');
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const id = btn.getAttribute('data-ability');
      const ab = resolveAbility(this.gm, id);
      if (!ab) continue;
      let ready = false;
      let minCd = Infinity;
      let reason = '';
      for (let k = 0; k < units.length; k++) {
        const u = units[k];
        if (!u.abilities.includes(id)) continue;
        const r = canCast(this.gm, u, ab);
        if (r.ok) ready = true;
        else if (!reason) reason = r.code === 'requires' ? requirementsLine(r.missing, r.factionId) : localizeSimText(r.reason.replace('⚠️ ', ''));
        const cd = u.cooldowns[id] || 0;
        if (cd < minCd) minCd = cd;
      }
      if (minCd === Infinity) minCd = 0;
      const pct = ab.cooldown > 0 ? Math.round(Math.min(1, minCd / ab.cooldown) * 100) : 0;
      const sig = `${ready ? 1 : 0}|${pct}|${units[0].autocast[id] ? 1 : 0}|${reason}`;
      if (btn._abSig === sig) continue;
      btn._abSig = sig;
      btn.disabled = !ready;
      btn.classList.toggle('ability-autocast-on', !!units[0].autocast[id]);
      const cd = btn.querySelector('.ability-cd');
      if (cd) cd.style.height = `${pct}%`;
      const req = btn.querySelector('.ability-req');
      if (req) req.innerHTML = !ready && reason ? `<br>${reason}` : '';
      btn.title = `${abilityNameT(ab.id, ab)}${ab.hotkey ? ` (${ab.hotkey})` : ''}`;
    }
  }

  initBuildingEvents() {
    if (!this.buildingView) return;

    this.buildingView.addEventListener('click', (e) => {
      // F3-05: cancelar obra em andamento (reembolsa 75 %)
      if (e.target.closest('#bld-cancel-construction-btn') && this.gm.selectedBuilding) {
        const b = this.gm.selectedBuilding;
        if (!b.isConstructed && b.ownerId === this.gm.localPlayerId) {
          this.gm.issue({ type: CMD.CANCEL_CONSTRUCTION, playerId: this.gm.localPlayerId, buildingId: b.id });
          this.sound.playSelect();
          this.showNotification(t('hud.buildCancelled'));
        }
        return;
      }

      // 0. Click on the HQ tier-upgrade button (F3-06)
      const hqUpgradeBtn = e.target.closest('#bld-hq-upgrade-btn');
      if (hqUpgradeBtn && this.gm.selectedBuilding) {
        const b = this.gm.selectedBuilding;
        if (b.tierUpgrade) {
          // Upgrade em andamento: clique cancela e reembolsa 100%.
          this.gm.issue({ type: CMD.CANCEL_UPGRADE_HQ, playerId: this.gm.localPlayerId, buildingId: b.id });
          this.sound.playSelect();
          this.showNotification(t('hud.upgradeCancelled'));
          return;
        }
        if (b.tier >= 3) return;
        const cost = this.gm.hqUpgradeCost(b.tier + 1); // F4-07a: inclui o petróleo do nível 3 (dispensado em mapas sem poços)
        if (cost && !this.gm.canAfford(cost)) {
          this.sound.playChop();
          this.showNotification(`⚠️ ${t('sim.noResources')}`);
          return;
        }
        this.gm.issue({ type: CMD.UPGRADE_HQ, playerId: this.gm.localPlayerId, buildingId: b.id });
        this.sound.playHammer();
        return;
      }

      // 1. Click on forge upgrade button
      const upgradeBtn = e.target.closest('.bld-upgrade-btn');
      if (upgradeBtn && this.gm.selectedBuilding) {
        const b = this.gm.selectedBuilding;
        const upgradeId = upgradeBtn.getAttribute('data-upgrade');
        if (upgradeId) {
          const cfg = UPGRADE_CONFIG[upgradeId];
          const factionType = this.gm.playerFaction === 'orc' ? 'orc' : 'human';
          const upgName = researchName(upgradeId, factionType, cfg);

          if (this.gm.isUpgradeResearched(upgradeId, 'player')) {
            this.sound.playChop();
            this.showNotification(t('hud.researchMaxed', { name: upgName }));
            return;
          }

          if (b.currentResearch) {
            this.sound.playChop();
            this.showNotification(t('hud.buildingBusy'));
            return;
          }

          if (this.gm.isUpgradeResearching(upgradeId, 'player')) {
            this.sound.playChop();
            this.showNotification(t('hud.researchElsewhere'));
            return;
          }

          const nextLv = this.gm.getResearchLevel(upgradeId, 'player') + 1;
          const nextCost = RESEARCH[upgradeId].levels[nextLv - 1].cost;
          if (!this.gm.canAfford(nextCost)) {
            this.sound.playChop();
            this.showNotification(t('hud.cantAffordResearch', { name: upgName }));
            return;
          }

          // F2-02: comando RESEARCH — os checks acima (já pesquisado/ocupado/sem recursos)
          // seguem client-side para feedback imediato; a validação final é do executor.
          this.gm.issue({ type: CMD.RESEARCH, playerId: this.gm.localPlayerId, buildingId: b.id, upgradeId });
          this.sound.playHammer();
          this.showNotification(t('hud.researchStarted', { name: upgName }));
          this.renderBuildingTrainButtons(b);
          this.updateBuildingQueue(b);
        }
        return;
      }

      // 2. Click on unit train button
      const trainBtn = e.target.closest('.bld-train-btn');
      if (trainBtn && this.gm.selectedBuilding) {
        const b = this.gm.selectedBuilding;
        const trainType = trainBtn.getAttribute('data-train');
        if (trainType) {
          const cfg = UNIT_TRAIN_CONFIG[trainType];
          if (b.queue.length >= 6) {
            this.sound.playChop();
            this.showNotification(t('hud.queueFull'));
            return;
          }
          if (this.gm.population >= this.gm.maxPopulation) {
            this.alerts ? this.alerts.raise('food') : this.showNotification(t('alert.food'));
            return;
          }
          if (cfg && !this.gm.canAfford(cfg.cost)) {
            this.sound.playChop();
            this.showNotification(t('hud.cantAffordTrain', { name: unitLabel(trainType) }));
            return;
          }
          // F2-02: comando TRAIN — validação autoritativa (custo/fila/pop) no CommandExecutor.
          this.gm.issue({ type: CMD.TRAIN, playerId: this.gm.localPlayerId, buildingId: b.id, unitType: trainType });
          this.sound.playSelect();
          this.updateBuildingQueue(b);
        }
        return;
      }

      // 3. Click on a filled slot in the queue to cancel and refund
      const queueSlot = e.target.closest('.bld-queue-slot.filled');
      if (queueSlot && this.gm.selectedBuilding) {
        const b = this.gm.selectedBuilding;
        if (researchRoleOf(b)) {
          if (b.currentResearch) {
            this.gm.issue({ type: CMD.CANCEL_RESEARCH, playerId: this.gm.localPlayerId, buildingId: b.id });
            this.sound.playSelect();
            this.showNotification(t('hud.researchCancelled'));
            this.renderBuildingTrainButtons(b);
            this.updateBuildingQueue(b);
          }
          return;
        }

        const slotIdx = parseInt(queueSlot.getAttribute('data-slot'), 10);
        if (!isNaN(slotIdx)) {
          this.gm.issue({ type: CMD.CANCEL_TRAIN, playerId: this.gm.localPlayerId, buildingId: b.id, slot: slotIdx });
          this.sound.playSelect();
          this.showNotification(t('hud.trainCancelled'));
          this.updateBuildingQueue(b);
        }
      }
    }, this._listenOpts);
  }

  /** F6-07: modelo da tela pós-jogo a partir do snapshot congelado (`gm.result`) ou do atual. */
  _postGameModel() {
    const gm = this.gm;
    const colors = {};
    for (const p of gm.playerRegistry.players) colors[p.id] = p.color;
    return buildPostGameModel(gm.result || gm.matchStats.snapshot(), { localId: gm.localPlayerId, victory: !!gm.gameWon, colors });
  }

  updateSelectionCard() {
    if (!this.selectionCard) return;

    if (this.gm.selectedUnits.length > 0) {
      this.currentBuilding = null;
      if (this.buildingView) this.buildingView.style.display = 'none';
      if (this.standardView) this.standardView.style.display = 'flex';
      this.selectionCard.style.display = 'flex';

      const u = this.gm.selectedUnits[0];
      const count = this.gm.selectedUnits.length;
      const isWorker = u.type === 'villager' || u.type === 'peon';
      const isTanker = !!u.isTanker; // F4-07a: petroleiro (constrói a plataforma; coleta petróleo)

      const heroMark = getUnitDef(u.type).isHero ? '★ ' : ''; // F4-08
      this.selectionTitle.innerText = heroMark + (count > 1 ? t('hud.multiSelect', { count, name: unitLabel(u.type) }) : unitLabel(u.type));
      this.updateSelectionPortraits(this.gm.selectedUnits);

      // Health
      const pct = Math.max(0, u.hp / u.maxHp) * 100;
      this.selectionHpBar.style.width = `${pct}%`;
      this.selectionHp.innerText = `${Math.round(u.hp)} / ${u.maxHp} HP`;

      // Stats
      this.selectionStats.innerHTML = `
        <span>⚔️ ${t('hud.stat.attack')}: ${u.damage.basic}+${u.damage.piercing}</span>
        <span>🛡️ ${t('hud.stat.defense')}: ${u.armor || 0}</span>
        <span>🏃 ${t('hud.stat.speed')}: ${u.speed}</span>
        ${u.minAttackRange > 0 ? `<span>🎯 ${t('hud.stat.range')}: ${u.minAttackRange}–${u.attackRange}</span>` : (u.layer === 'naval' && u.attackRange > 0 ? `<span>🎯 ${t('hud.stat.range')}: ${u.attackRange}</span>` : '')}
        ${u.transportCapacity > 0 ? `<span data-cargo-count>📦 ${t('hud.stat.cargo')}: ${u.cargo.length}/${u.transportCapacity}</span>` : ''}
        ${u.submersible ? `<span>🫥 ${t('hud.stat.submerged')}</span>` : ''}
        ${u.layer === 'air' ? `<span>🪽 ${t('hud.stat.air')}</span>` : ''}
        ${u.layer === 'naval' ? `<span>⚓ ${t('hud.stat.naval')}</span>` : ''}
        ${u.suicide ? `<span>💣 ${t('hud.stat.suicide')}</span>` : ''}
        ${u.splashRadius > 0 ? `<span>💥 ${t('hud.stat.area')}: ${u.splashRadius}</span>` : ''}
        ${u.maxMana > 0 ? `<span>💧 ${t('hud.stat.mana')}: ${Math.floor(u.mana)} / ${u.maxMana}</span>` : ''}
        ${isWorker || isTanker ? `<span>🎒 ${t('hud.stat.carry')}: ${u.carrying.amount}/${u.carrying.max} ${resourceName(isTanker ? 'oil' : u.carrying.type)}</span>` : ''}
      `;

      // F4-03: o card de habilidades muda a chave (recria o DOM só quando o conjunto muda)
      const abUnits = isWorker || isTanker ? [] : selectionAbilityUnits(this.gm.selectedUnits);
      const isTransport = u.transportCapacity > 0; // F4-07b: barcaça
      const key = isWorker
        ? `${u.type}_actions`
        : isTanker ? 'tanker_actions'
        : isTransport ? 'transport_actions'
        : (abUnits.length > 0 ? `military_actions|${abUnits[0].abilities.join(',')}|${abUnits[0].type}` : 'military_actions');
      if (this.lastSelectionKey !== key) {
        this.lastSelectionKey = key;
        this.renderSelectionActions(key);
      }
      if (abUnits.length > 0) this.updateAbilityButtons();
      if (isWorker || isTanker) {
        this.updateWorkerBuildCosts(u.type);
      }
    } else if (this.gm.selectedBuilding) {
      const b = this.gm.selectedBuilding;
      if (this.standardView) this.standardView.style.display = 'none';
      if (this.buildingView) this.buildingView.style.display = 'flex';
      this.selectionCard.style.display = 'flex';
      this.updateSelectionPortraits([]);

      // Header Title
      if (this.bldSelectionTitle) {
        let title = buildingLabel(b.type).toUpperCase();
        if (!b.isConstructed) title += ` (${t('hud.underConstruction')})`;
        else if (b.faction === 'enemy') title += ` (${t('hud.enemy')})`;
        this.bldSelectionTitle.innerText = title;
      }

      // Health Text & Fill Bar
      if (this.bldSelectionHp) {
        this.bldSelectionHp.innerText = t('hud.life', { hp: Math.round(b.hp), max: b.maxHp });
      }
      if (this.bldSelectionHpFill) {
        const pct = Math.max(0, Math.min(100, (b.hp / b.maxHp) * 100));
        this.bldSelectionHpFill.style.width = `${pct}%`;
      }

      // Extra Info
      if (this.bldExtraInfo) {
        if (!b.isConstructed) {
          this.bldExtraInfo.innerText = `🔨 ${t('hud.building', { pct: Math.round(b.buildProgress) })}`;
        } else if (b.popGranted) {
          this.bldExtraInfo.innerText = `👥 ${t('hud.popGranted', { n: b.popGranted })}`;
        } else if (b.towerDamage) {
          this.bldExtraInfo.innerText = `🏹 ${t('hud.towerInfo', { dmg: `${b.towerDamage.basic}+${b.towerDamage.piercing}`, range: b.attackRange })} | 🛡️ ${b.armor || 0}`;
        } else {
          this.bldExtraInfo.innerText = b.armor ? `🛡️ ${t('hud.defShort', { n: b.armor })}` : '';
        }
      }

      // Render buttons when building changes or forge research state changes
      const isForge = !!researchRoleOf(b);
      // F3-07: assinatura dos níveis concluídos (muda a cada nível, não só a cada pesquisa nova).
      let playerResearchedCount = 0;
      if (this.gm.localPlayer) for (const lv of this.gm.localPlayer.researchLevels.values()) playerResearchedCount += lv;
      const researchId = b.currentResearch ? b.currentResearch.id : null;

      if (this.currentBuilding !== b || (this.lastResearchedCount !== playerResearchedCount || (isForge && this.lastResearchId !== researchId))) {
        this.currentBuilding = b;
        this.lastResearchedCount = playerResearchedCount;
        this.lastResearchId = researchId;
        this.renderBuildingTrainButtons(b);
      }

      // Dynamic cost colors check every frame
      if (b.faction === 'player' && b.isConstructed) {
        this.updateBuildingCosts(b);
      }

      // Queue slots and horizontal progress bar
      this.updateBuildingQueue(b);

      // F3-05: botão "Cancelar obra" só em construção própria em obra
      if (this.bldCancelSection) {
        this.bldCancelSection.style.display = (!b.isConstructed && b.ownerId === this.gm.localPlayerId) ? 'flex' : 'none';
      }

      // F3-06: card de nível do Centro (`role: 'hq'`)
      this.updateHqTierCard(b);
    } else if (this.gm.selectedResource) {
      this.currentBuilding = null;
      if (this.buildingView) this.buildingView.style.display = 'none';
      if (this.standardView) this.standardView.style.display = 'flex';
      this.selectionCard.style.display = 'flex';

      const r = this.gm.selectedResource;
      const isTree = r.type === 'tree';
      const isDepletedTree = isTree && (r.isDead || r.woodRemaining <= 0);

      this.selectionTitle.innerText = isDepletedTree ? t('hud.stump') : (isTree ? t('hud.oldTree') : resourceNodeName(r.type));

      const remaining = isTree ? r.woodRemaining : r.resourcesRemaining;
      const max = isTree ? r.maxWood : r.maxResources;
      const pct = max > 0 ? (remaining / max) * 100 : 0;
      this.selectionHpBar.style.width = `${pct}%`;
      this.selectionHp.innerText = isDepletedTree
        ? t('hud.woodDepleted')
        : t('hud.available', { remaining, max });
      this.selectionStats.innerHTML = isDepletedTree
        ? `<span>${t('hud.stumpHint')}</span>`
        : `<span>${t('hud.assignWorkers')}</span>`;

      if (this.lastSelectionKey !== 'resource') {
        this.lastSelectionKey = 'resource';
        this.selectionActions.innerHTML = '';
      }
      this.updateSelectionPortraits([]);
    } else {
      this.currentBuilding = null;
      this.selectionCard.style.display = 'none';
      this.lastSelectionKey = 'none';
      this.updateSelectionPortraits([]);
    }
  }

  /**
   * F6-03: grade de retratos da seleção múltipla (`gm.selectedUnits.length > 1`, até 24),
   * ícone do tipo + barra de vida; clique seleciona só aquela unidade (`initPortraitEvents`).
   */
  updateSelectionPortraits(units) {
    if (!this.selectionPortraits) return;

    if (units.length <= 1) {
      this.selectionPortraits.style.display = 'none';
      this.lastPortraitKey = null;
      return;
    }

    const shown = units.slice(0, 24);
    const key = shown.map(u => u.id).join(',');

    if (this.lastPortraitKey === key) {
      // Mesmo conjunto de unidades: só atualiza as barras de vida.
      this.selectionPortraits.querySelectorAll('[data-portrait-id]').forEach((el) => {
        const unit = shown.find(u => String(u.id) === el.getAttribute('data-portrait-id'));
        if (!unit) return;
        const fill = el.querySelector('.selection-portrait-hp-fill');
        if (fill) fill.style.width = `${Math.max(0, unit.hp / unit.maxHp) * 100}%`;
      });
      return;
    }

    this.lastPortraitKey = key;
    this.selectionPortraits.style.display = 'grid';
    this.selectionPortraits.innerHTML = shown.map(unit => {
      const icon = getUnitDef(unit.type).icon;
      const pct = Math.max(0, unit.hp / unit.maxHp) * 100;
      return `
        <button type="button" class="selection-portrait${getUnitDef(unit.type).isHero ? ' hero' : ''}" data-portrait-id="${unit.id}" title="${unitLabel(unit.type)}">
          <img src="${icon}" class="selection-portrait-icon" alt="${unitLabel(unit.type)}" />
          <div class="selection-portrait-hp-bg"><div class="selection-portrait-hp-fill" style="width: ${pct}%"></div></div>
        </button>
      `;
    }).join('');
  }

  renderBuildingTrainButtons(building) {
    if (!this.bldTrainButtons) return;

    const researchRole = researchRoleOf(building);
    const isForge = building.faction === 'player' && building.isConstructed && !!researchRole;
    if (isForge) {
      if (this.bldTrainLabel) this.bldTrainLabel.innerText = t(`hud.section.research.${researchRole}`);
      if (this.bldQueueLabel) this.bldQueueLabel.innerText = t('hud.section.researchProgress');
      if (this.bldTrainSection) this.bldTrainSection.style.display = 'flex';
      if (this.bldQueueSection) this.bldQueueSection.style.display = 'flex';

      const factionType = this.gm.playerFaction === 'orc' ? 'orc' : 'human';

      this.bldTrainButtons.innerHTML = researchIdsFor(researchRole, factionType).map((upgId, i) => {
        const cfg = UPGRADE_CONFIG[upgId];
        if (!cfg) return '';

        const isResearched = this.gm.isUpgradeResearched(upgId, 'player');
        const isResearchingThis = building.currentResearch && building.currentResearch.id === upgId;
        const isResearchingAny = this.gm.isUpgradeResearching(upgId, 'player');
        const upgName = researchName(upgId, factionType, cfg);
        const curLv = this.gm.getResearchLevel(upgId, 'player');
        const maxLv = getMaxResearchLevel(upgId);
        const nextLv = Math.min(curLv + 1, maxLv);
        const upgDesc = describeLevelText(RESEARCH[upgId] && RESEARCH[upgId].levels[nextLv - 1]);
        const lvLabel = maxLv > 1 ? ` ${curLv}/${maxLv}` : '';
        const hotkey = getResearchHotkey(i);

        let btnClass = 'bld-train-btn bld-upgrade-btn';
        let badge = '';
        if (isResearched) {
          btnClass += ' researched';
          badge = '<span class="bld-upgrade-badge-check">✓</span>';
        } else if (isResearchingThis || isResearchingAny) {
          btnClass += ' researching';
          badge = '<span class="bld-upgrade-badge-researching">🔨</span>';
        }

        return `
          <button class="${btnClass}" data-upgrade="${upgId}" title="${upgName}${lvLabel}${hotkey ? ` (${hotkey})` : ''}" ${isResearched ? 'disabled' : ''}>
            ${hotkey ? `<span class="bld-hotkey-badge">${hotkey}</span>` : ''}
            <img src="${cfg.icon}" class="bld-train-btn-icon" alt="${upgName}" />
            ${badge}
            <div class="bld-hint-bubble">
              <div class="bld-hint-col">
                <div class="bld-hint-header">
                  <span class="bld-hint-title">${upgName}${lvLabel}${hotkey ? ` <span class="bld-hint-hotkey">(${hotkey})</span>` : ''}</span>
                  <span class="bld-hint-desc">${upgDesc}</span>
                </div>
                <div class="bld-hint-footer">
                  <span class="bld-cost-items" data-cost-upgrade="${upgId}"></span>
                </div>
              </div>
            </div>
          </button>
        `;
      }).join('');

      this.updateBuildingCosts(building);
      return;
    }

    if (this.bldTrainLabel) this.bldTrainLabel.innerText = t('hud.section.train');
    if (this.bldQueueLabel) this.bldQueueLabel.innerText = t('hud.section.queue');

    const trainable = (building.faction === 'player' && building.isConstructed)
      ? BUILDING_TRAINABLE_UNITS[building.type]
      : null;

    if (!trainable || trainable.length === 0) {
      if (this.bldTrainSection) this.bldTrainSection.style.display = 'none';
      if (this.bldQueueSection) this.bldQueueSection.style.display = 'none';
      this.bldTrainButtons.innerHTML = '';
      return;
    }

    if (this.bldTrainSection) this.bldTrainSection.style.display = 'flex';
    if (this.bldQueueSection) this.bldQueueSection.style.display = 'flex';

    this.bldTrainButtons.innerHTML = trainable.map((baseType, i) => {
      const unitType = this.gm.resolveTrainType(baseType, 'player');
      const cfg = UNIT_TRAIN_CONFIG[unitType];
      if (!cfg) return '';
      const hotkey = getTrainHotkey(i);
      return `
        <button class="bld-train-btn" data-train="${unitType}" title="${unitLabel(unitType)}${hotkey ? ` (${hotkey})` : ''}">
          ${hotkey ? `<span class="bld-hotkey-badge">${hotkey}</span>` : ''}
          <img src="${cfg.icon}" class="bld-train-btn-icon" alt="${unitLabel(unitType)}" />
          <div class="bld-hint-bubble">
            <span class="bld-hint-title">${unitLabel(unitType)}${hotkey ? ` <span class="bld-hint-hotkey">(${hotkey})</span>` : ''}</span> - ${t('hud.cost')}: <span class="bld-cost-items" data-cost-unit="${unitType}"></span>
          </div>
        </button>
      `;
    }).join('');

    this.updateBuildingCosts(building);
  }

  updateBuildingCosts(building) {
    if (!this.bldTrainButtons) return;
    const ownerId = building.ownerId;

    const researchRole = researchRoleOf(building);
    if (researchRole) {
      const factionId = this.gm.playerFaction === 'orc' ? 'orc' : 'human';
      researchIdsFor(researchRole, factionId).forEach(upgId => {
        const cfg = UPGRADE_CONFIG[upgId];
        if (!cfg) return;
        const costContainer = this.bldTrainButtons.querySelector(`[data-cost-upgrade="${upgId}"]`);
        const btn = this.bldTrainButtons.querySelector(`[data-upgrade="${upgId}"]`);

        const isResearched = this.gm.isUpgradeResearched(upgId, 'player');
        if (isResearched) {
          if (costContainer) costContainer.innerHTML = `<span class="bld-cost-researched">✓ ${t('hud.maxLevel')}</span>`;
          return;
        }

        const isResearchingThis = building.currentResearch && building.currentResearch.id === upgId;
        const isResearchingAny = this.gm.isUpgradeResearching(upgId, 'player');
        if (isResearchingThis || isResearchingAny) {
          if (costContainer) costContainer.innerHTML = `<span class="bld-cost-researching">🔨 ${t('hud.researching')}</span>`;
          return;
        }

        // F3-06: requisitos generalizados (ex.: {hq:2}) — botão desabilitado com o motivo.
        const missing = missingUpgradeRequirements(ownerId, upgId, this.gm);
        if (btn) {
          if (missing.length > 0) {
            btn.disabled = true;
            btn.classList.add('bld-requirement-missing');
            btn.title = requirementsLine(missing, factionId);
          } else {
            btn.disabled = false;
            btn.classList.remove('bld-requirement-missing');
          }
        }

        const nextCost = RESEARCH[upgId].levels[Math.min(this.gm.getResearchLevel(upgId, 'player'), getMaxResearchLevel(upgId) - 1)].cost;
        if (costContainer) costContainer.innerHTML = buildCostHtml(nextCost, this.gm.resources);
      });
      return;
    }

    const trainable = BUILDING_TRAINABLE_UNITS[building.type];
    if (!trainable) return;

    trainable.forEach(baseType => {
      const unitType = this.gm.resolveTrainType(baseType, 'player');
      const cfg = UNIT_TRAIN_CONFIG[unitType];
      if (!cfg) return;
      const costContainer = this.bldTrainButtons.querySelector(`[data-cost-unit="${unitType}"]`);
      const btn = this.bldTrainButtons.querySelector(`[data-train="${unitType}"]`);

      // F3-06: requisitos generalizados de treino (`UNITS[type].requires`) — botão desabilitado
      // com o motivo no tooltip (mudança mínima: cada construção existente segue sem `requires`).
      const missing = missingUnitRequirements(ownerId, unitType, this.gm);
      if (btn) {
        if (missing.length > 0) {
          btn.disabled = true;
          btn.classList.add('bld-requirement-missing');
          btn.title = requirementsLine(missing, this.gm.playerFaction === 'orc' ? 'orc' : 'human');
        } else {
          btn.disabled = false;
          btn.classList.remove('bld-requirement-missing');
        }
      }

      if (costContainer) costContainer.innerHTML = buildCostHtml(cfg.cost, this.gm.resources);
    });
  }

  updateBuildingQueue(b) {
    if (!this.bldQueueSlots || this.bldQueueSlots.length === 0) return;

    if (researchRoleOf(b)) {
      if (b.currentResearch) {
        const r = b.currentResearch;
        const cfg = r.cfg || UPGRADE_CONFIG[r.id];
        const factionType = this.gm.playerFaction === 'orc' ? 'orc' : 'human';
        const name = researchName(r.id, factionType, cfg);
        const iconSrc = cfg ? cfg.icon : '/icoEspada.png';

        const slot0 = this.bldQueueSlots[0];
        if (slot0) {
          slot0.className = 'bld-queue-slot filled active forge-slot';
          slot0.innerHTML = `<img src="${iconSrc}" class="bld-slot-icon" alt="${name}" />`;
          slot0.title = `${name}${r.level && getMaxResearchLevel(r.id) > 1 ? ` ${r.level}/${getMaxResearchLevel(r.id)}` : ''} (${t('hud.researching')}) - ${t('hud.clickCancel')}`;
        }

        for (let i = 1; i < 6; i++) {
          const slotEl = this.bldQueueSlots[i];
          if (!slotEl) continue;
          slotEl.className = 'bld-queue-slot empty';
          slotEl.innerHTML = '';
          slotEl.title = t('hud.emptySlot');
        }

        const pct = Math.min(100, Math.max(0, (r.progress / r.totalTime) * 100));
        if (this.bldQueueProgressBar) this.bldQueueProgressBar.style.width = `${pct}%`;
        if (this.bldQueueProgressTrack) this.bldQueueProgressTrack.style.opacity = '1';
      } else {
        for (let i = 0; i < 6; i++) {
          const slotEl = this.bldQueueSlots[i];
          if (!slotEl) continue;
          slotEl.className = 'bld-queue-slot empty';
          slotEl.innerHTML = '';
          slotEl.title = t('hud.emptySlot');
        }
        if (this.bldQueueProgressBar) this.bldQueueProgressBar.style.width = '0%';
        if (this.bldQueueProgressTrack) this.bldQueueProgressTrack.style.opacity = '0.35';
      }
      return;
    }

    for (let i = 0; i < 6; i++) {
      const slotEl = this.bldQueueSlots[i];
      if (!slotEl) continue;

      if (i < b.queue.length) {
        const item = b.queue[i];
        const cfg = UNIT_TRAIN_CONFIG[item.type];
        const iconSrc = cfg ? cfg.icon : '/icoEspada.png';
        const name = unitLabel(item.type);
        slotEl.className = 'bld-queue-slot filled' + (i === 0 ? ' active' : '');
        slotEl.innerHTML = `<img src="${iconSrc}" class="bld-slot-icon" alt="${name}" />`;
        slotEl.title = `${name} (${i === 0 ? t('hud.training') : t('hud.queued')}) - ${t('hud.clickCancel')}`;
      } else {
        slotEl.className = 'bld-queue-slot empty';
        slotEl.innerHTML = '';
        slotEl.title = t('hud.emptySlot');
      }
    }

    if (b.queue.length > 0) {
      const cur = b.queue[0];
      const pct = Math.min(100, Math.max(0, (cur.progress / cur.totalTime) * 100));
      if (this.bldQueueProgressBar) this.bldQueueProgressBar.style.width = `${pct}%`;
      if (this.bldQueueProgressTrack) this.bldQueueProgressTrack.style.opacity = '1';
    } else {
      if (this.bldQueueProgressBar) this.bldQueueProgressBar.style.width = '0%';
      if (this.bldQueueProgressTrack) this.bldQueueProgressTrack.style.opacity = '0.35';
    }
  }

  /**
   * F3-06: card de nível do Centro (`role: 'hq'`) — nome do nível atual, botão "Evoluir para
   * <próximo nome>" (custo no tooltip, desabilitado com o motivo) e barra de progresso do
   * upgrade. Escondido para qualquer outra construção.
   */
  updateHqTierCard(b) {
    if (!this.bldHqTierSection) return;
    const isHq = getBuildingDef(b.type).role === 'hq';
    if (!isHq || !b.isConstructed) {
      this.bldHqTierSection.style.display = 'none';
      return;
    }
    this.bldHqTierSection.style.display = 'flex';

    const factionType = this.gm.playerFaction === 'orc' ? 'orc' : 'human';
    const curTierName = tierNameT(factionType, b.tier);
    if (this.bldHqTierLabel) this.bldHqTierLabel.innerText = t('hud.tierLabel', { n: b.tier, name: curTierName.toUpperCase() });

    const btn = this.bldHqUpgradeBtn;
    if (!btn) return;

    if (b.tierUpgrade) {
      // Upgrade em andamento: botão vira "cancelar", barra mostra o progresso.
      btn.disabled = false;
      btn.classList.remove('bld-requirement-missing');
      if (this.bldHqUpgradeBtnLabel) this.bldHqUpgradeBtnLabel.innerText = t('hud.cancel');
      btn.title = t('hud.cancelUpgrade');
      const pct = Math.min(100, Math.max(0, (b.tierUpgrade.progress / b.tierUpgrade.totalTime) * 100));
      if (this.bldHqUpgradeProgressBar) this.bldHqUpgradeProgressBar.style.width = `${pct}%`;
      if (this.bldHqUpgradeProgressTrack) this.bldHqUpgradeProgressTrack.style.opacity = '1';
      return;
    }

    if (this.bldHqUpgradeProgressBar) this.bldHqUpgradeProgressBar.style.width = '0%';
    if (this.bldHqUpgradeProgressTrack) this.bldHqUpgradeProgressTrack.style.opacity = '0.35';

    if (b.tier >= 3) {
      btn.disabled = true;
      btn.classList.remove('bld-requirement-missing');
      if (this.bldHqUpgradeBtnLabel) this.bldHqUpgradeBtnLabel.innerText = t('hud.maxLevel');
      btn.title = t('hud.maxLevelReached');
      return;
    }

    const nextTier = b.tier + 1;
    const nextName = tierNameT(factionType, nextTier);
    const cost = this.gm.hqUpgradeCost(nextTier);
    const canAfford = !cost || this.gm.canAfford(cost);
    if (this.bldHqUpgradeBtnLabel) this.bldHqUpgradeBtnLabel.innerText = t('hud.upgradeTo', { name: nextName });

    if (!canAfford) {
      btn.disabled = true;
      btn.classList.add('bld-requirement-missing');
      const costTxt = cost ? buildCostHtml(cost, this.gm.resources).replace(/<[^>]+>/g, ' ').trim() : '';
      btn.title = t('hud.cantAffordCost', { cost: costTxt });
    } else {
      btn.disabled = false;
      btn.classList.remove('bld-requirement-missing');
      btn.title = t(cost.oil ? 'hud.upgradeToCostOil' : 'hud.upgradeToCost', { name: nextName, gold: cost.gold, wood: cost.wood, stone: cost.stone, oil: cost.oil || 0, time: cost.time });
    }
  }

  renderSelectionActions(key) {
    if (key === 'villager_actions' || key === 'peon_actions' || key === 'tanker_actions') {
      const workerType = key === 'villager_actions' ? 'villager' : (key === 'peon_actions' ? 'peon' : 'tanker');
      const buildings = WORKER_BUILD_LIST[workerType] || [];

      const buildButtonsHtml = buildings.map(bType => {
        const cfg = BUILDING_BUILD_CONFIG[bType];
        if (!cfg) return '';
        const hotkey = getBuildHotkey(bType);
        return `
          <button class="bld-train-btn action-build-btn" data-build="${bType}" title="${buildingLabel(bType)}${hotkey ? ` (${hotkey})` : ''}">
            ${hotkey ? `<span class="bld-hotkey-badge">${hotkey}</span>` : ''}
            <img src="${cfg.icon}" class="bld-train-btn-icon" alt="${buildingLabel(bType)}" />
            <div class="bld-hint-bubble">
              <div class="bld-hint-col">
                <div class="bld-hint-header">
                  <span class="bld-hint-title">${buildingLabel(bType)}${hotkey ? ` <span class="bld-hint-hotkey">(${hotkey})</span>` : ''}</span>
                  ${cfg.description ? `<span class="bld-hint-desc">${buildingDesc(bType, cfg)}</span>` : ''}
                </div>
                <div class="bld-hint-footer">
                  ${t('hud.cost')}: <span class="bld-cost-items" data-cost-build="${bType}"></span>
                </div>
              </div>
            </div>
          </button>
        `;
      }).join('');

      const stopButtonHtml = `
        <button class="bld-train-btn action-stop-btn" data-action="stop" title="${t('hud.stopUnit')} (S)">
          <span class="action-stop-icon">🛑</span>
          <div class="bld-hint-bubble">
            <span class="bld-hint-title">${t('hud.stop')}</span> - ${t('hud.stopOrders')}
          </div>
        </button>
      `;

      const repairButtonHtml = workerType === 'tanker' ? '' : `
        <button class="bld-train-btn action-stop-btn" data-action="repair" title="${t('hud.repair')} (R)">
          <span class="bld-hotkey-badge">R</span>
          <span class="action-stop-icon">🔧</span>
          <div class="bld-hint-bubble">
            <span class="bld-hint-title">${t('hud.repair')} <span class="bld-hint-hotkey">(R)</span></span> - ${t('hud.repairDesc')}
          </div>
        </button>
      `;

      this.selectionActions.innerHTML = `
        <div class="worker-actions-container">
          <span class="bld-section-label">${t('hud.section.build')}</span>
          <div class="worker-actions-group">
            ${buildButtonsHtml}
            ${repairButtonHtml}
            ${stopButtonHtml}
          </div>
        </div>
      `;
      this.updateWorkerBuildCosts(workerType);
    } else if (key === 'transport_actions') {
      // F4-07b: barcaça — Parar e Desembarcar (todos na margem mais próxima; clique direito em terra desembarca no ponto).
      this.selectionActions.innerHTML = `
        <div class="worker-actions-container">
          <span class="bld-section-label">${t('hud.section.actions')}</span>
          <div class="worker-actions-group">
            <button class="bld-train-btn action-stop-btn" data-action="stop" title="${t('hud.stopUnits')} (S)">
              <span class="action-stop-icon">🛑</span>
              <div class="bld-hint-bubble">
                <span class="bld-hint-title">${t('hud.stop')}</span> - ${t('hud.stopOrders')}
              </div>
            </button>
            <button class="bld-train-btn action-stop-btn" data-action="unload" title="${t('hud.unload')}">
              <span class="action-stop-icon">⚓</span>
              <div class="bld-hint-bubble">
                <span class="bld-hint-title">${t('hud.unload')}</span> - ${t('hud.unloadDesc')}
              </div>
            </button>
          </div>
        </div>
      `;
    } else if (key.startsWith('military_actions')) {
      const abilityIds = key.includes('|') ? key.split('|')[1].split(',').filter(Boolean) : [];
      this.selectionActions.innerHTML = `
        <div class="worker-actions-container">
          <span class="bld-section-label">${t('hud.section.actions')}</span>
          <div class="worker-actions-group">
            <button class="bld-train-btn action-stop-btn" data-action="stop" title="${t('hud.stopUnits')} (S)">
              <span class="action-stop-icon">🛑</span>
              <div class="bld-hint-bubble">
                <span class="bld-hint-title">${t('hud.stop')}</span> - ${t('hud.stopCombat')}
              </div>
            </button>
            ${this.renderAbilityButtons(abilityIds)}
          </div>
        </div>
      `;
    } else {
      this.selectionActions.innerHTML = '';
    }
  }

  updateWorkerBuildCosts(workerType) {
    if (!this.selectionActions) return;
    const buildings = WORKER_BUILD_LIST[workerType];
    if (!buildings) return;

    const ownerId = this.gm.localPlayerId;
    buildings.forEach(bType => {
      const cfg = BUILDING_BUILD_CONFIG[bType];
      if (!cfg || !cfg.cost) return;
      const costContainer = this.selectionActions.querySelector(`[data-cost-build="${bType}"]`);
      if (costContainer) costContainer.innerHTML = buildCostHtml(cfg.cost, this.gm.resources);

      // F3-04: requisito de construção (ex.: Quartel exige Fazenda) — botão desabilitado com
      // tooltip listando o que falta, sem UI nova (reaproveita o próprio botão/hint bubble).
      const btn = this.selectionActions.querySelector(`[data-build="${bType}"]`);
      if (!btn) return;
      const missing = missingRequirements(ownerId, bType, this.gm);
      if (missing.length > 0) {
        btn.disabled = true;
        btn.title = requirementsLine(missing, this.gm.playerFaction === 'orc' ? 'orc' : 'human');
        btn.classList.add('bld-requirement-missing');
      } else {
        btn.disabled = false;
        btn.classList.remove('bld-requirement-missing');
        const hotkey = getBuildHotkey(bType);
        btn.title = `${buildingLabel(bType)}${hotkey ? ` (${hotkey})` : ''}`;
      }
    });
  }

  drawMinimap() {
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const mapDef = this.gm.terrain.mapDef;

    // F2-05: o terreno (água/areia/grama/rocha) é renderizado uma única vez por partida, num
    // canvas offscreen (ver src/ui/terrainMinimapImage.js); por quadro só desenhamos essa
    // imagem + entidades + névoa + câmera (era tudo redesenhado à mão, com o rio/vaus fixos).
    if (!this._minimapTerrainImage || this._minimapTerrainMapId !== mapDef.id) {
      this._minimapTerrainImage = renderTerrainImage(mapDef, w, h, (x, z) => this.gm.terrain.getHeight(x, z));
      this._minimapTerrainMapId = mapDef.id;
    }
    ctx.drawImage(this._minimapTerrainImage, 0, 0);

    const toMap = (x, z) => worldToMinimap(x, z, mapDef.size, w, h);

    // Draw Trees (dark green dots)
    ctx.fillStyle = '#2d5e24';
    this.gm.trees.forEach(t => {
      if (!t.isDead) {
        const m = toMap(t.mesh.position.x, t.mesh.position.z);
        ctx.fillRect(m.x - 1, m.y - 1, 2, 2);
      }
    });

    // Draw Resource Deposits (gold & gray)
    this.gm.resourceDeposits.forEach(r => {
      if (r.type === 'oil' && r.resourcesRemaining <= 0) return; // F4-07a: poço esgotado some do minimapa
      const m = toMap(r.mesh.position.x, r.mesh.position.z);
      ctx.fillStyle = r.type === 'gold' ? '#ffd700' : (r.type === 'oil' ? '#0b0f14' : '#a0aab2'); // F4-07a: poço = ponto escuro
      ctx.fillRect(m.x - 2, m.y - 2, 4, 4);
      if (r.type === 'oil') {
        ctx.strokeStyle = 'rgba(148,163,184,0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(m.x - 2.5, m.y - 2.5, 5, 5);
      }
    });

    // Cores por jogador (F6-04): cada dono usa a cor escolhida na partida.
    const registry = this.gm.playerRegistry;
    const colorOf = (id) => playerColor(registry, id, NEUTRAL_HOSTILE_ID);

    // Draw Buildings (inimigas: só as já vistas — visíveis agora ou lembradas pela névoa)
    const fog = this.gm.fogOfWar;
    const localId = this.gm.localPlayerId;
    this.gm.buildings.forEach(b => {
      if (!b.isDead) {
        if (!this.gm.isHostile(localId, b.ownerId) || !fog || fog.isBuildingKnown(b)) {
          const m = toMap(b.mesh.position.x, b.mesh.position.z);
          ctx.fillStyle = colorOf(b.ownerId);
          ctx.fillRect(m.x - 3, m.y - 3, 6, 6);
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.lineWidth = 1;
          ctx.strokeRect(m.x - 3, m.y - 3, 6, 6);
        }
      }
    });
    // Fantasmas: construções inimigas destruídas fora da visão continuam na memória até a área ser revista
    if (fog) {
      ctx.fillStyle = '#dc2626';
      fog.forEachGhostBuilding((b, rec) => {
        const m = toMap(rec.x, rec.z);
        ctx.fillStyle = colorOf(b.ownerId);
        ctx.fillRect(m.x - 3, m.y - 3, 6, 6);
      });
    }

    // Unidades: próprias e aliadas sempre; hostis só com visão atual.
    const all = this.gm.allUnits;
    for (let i = 0; i < all.length; i++) {
      const u = all[i];
      if (u.isDead || u.isDying || u.transportedBy !== null) continue;
      if (u.mods.invisible && !isDetectedBy(this.gm, u, localId)) continue; // F4-07b: submersível não detectado não aparece no minimapa
      const px = u.mesh.position.x;
      const pz = u.mesh.position.z;
      if (this.gm.isHostile(localId, u.ownerId) && fog && !fog.isVisible(px, pz)) continue;
      const m = toMap(px, pz);
      ctx.fillStyle = colorOf(u.ownerId);
      ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
    }

    // Névoa no minimapa: preto = não explorado, escurecido = memória, limpo = visível
    if (fog && this.gm.fogView) {
      this.gm.fogView.drawMinimapFog(ctx, w, h);
    }

    // F6-05: pings de alerta (ataque, mina esgotada) sobre a névoa
    if (this.alerts) drawMinimapPings(ctx, this.alerts.activePings(), toMap);
    if (this.allyPings) drawMinimapPings(ctx, this.allyPings.active(performance.now()), toMap); // F9-04: pings de aliados

    // F6-04: flashes das ordens dadas pelo minimapa e trapézio do frustum da câmera (sobre a névoa)
    if (this.minimapOrders) drawOrderFlashes(ctx, this.minimapOrders.items, toMap);
    drawCameraQuad(ctx, frustumGroundQuad(this.sm.camera, Vector3, mapDef.size, { groundY: this.sm.cameraTarget.y }), toMap);
  }

  /**
   * F2-04: fim da sessão de partida. Remove os listeners desta instância, cancela o timer
   * de notificação e devolve a HUD (elementos estáticos do index.html) ao estado inicial.
   */
  dispose() {
    this._abort.abort();
    if (this._offLang) this._offLang();
    if (this._disposeUiScale) this._disposeUiScale();
    clearTimeout(this._notificationTimer);
    this._notificationTimer = null;

    const hide = (id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    };
    if (this.postGame) { this.postGame.dispose(); this.postGame = null; }
    hide('game-over-modal');
    hide('help-modal');
    if (this.notificationBox) {
      this.notificationBox.style.opacity = '0';
      this.notificationBox.innerText = '';
    }
    if (this.selectionCard) this.selectionCard.style.display = 'none';
    document.querySelectorAll('.speed-pill').forEach(p => p.classList.toggle('active', p.dataset.speed === '1'));
    const pauseToggle = document.getElementById('toggle-pause');
    if (pauseToggle) pauseToggle.checked = false;
    document.querySelectorAll('.time-pill').forEach(p => p.classList.toggle('active', p.id === 'btn-time-day'));
    if (this.minimapCtx) this.minimapCtx.clearRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);
    if (this.minimapOrders) this.minimapOrders.clear();

    this.currentBuilding = null;
    this.gm = null;
    this.im = null;
  }
}
