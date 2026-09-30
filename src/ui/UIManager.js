import { UNIT_TRAIN_CONFIG, BUILDING_BUILD_CONFIG, WORKER_BUILD_LIST } from '../entities/Building.js';
import { UPGRADE_CONFIG, FORGE_UPGRADES } from '../core/UpgradeConfig.js';
import { BUILDING_TRAINABLE_UNITS, getUnitDef, getBuildingDef } from '../data/index.js';
import { missingRequirements } from '../sim/requirements.js';
import { initUiScale } from './uiScale.js';
import { getBuildHotkey, getTrainHotkey, getResearchHotkey } from './hotkeys.js';
import { buildCostHtml } from './Tooltip.js';
import { CMD } from '../sim/commands.js';
import { worldToMinimap, minimapToWorld } from './minimapCoords.js';
import { renderTerrainImage } from './terrainMinimapImage.js';

// Quem treina o quê — derivado de src/data/buildings.js (campo `trains`)
export { BUILDING_TRAINABLE_UNITS };

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

    this.lastSelectionKey = null;

    // F2-04: os elementos da HUD vivem a aplicação inteira; os listeners desta instância
    // saem em dispose() (a sessão de partida é recriada sem recarregar a página).
    this._abort = new AbortController();
    this._listenOpts = { signal: this._abort.signal };
    this._notificationTimer = null;

    this.initControls();
    this.initMinimapEvents();
    this.initActionsEventDelegation();
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
    // --- Config Panel Toggle (hudmodelo.png) ---
    const settingsPanel = document.getElementById('settings-panel');
    document.getElementById('btn-config')?.addEventListener('click', () => {
      if (settingsPanel) {
        const isHidden = settingsPanel.style.display === 'none' || !settingsPanel.style.display;
        settingsPanel.style.display = isHidden ? 'block' : 'none';
        this.sound.playSelect();
      }
    }, this._listenOpts);

    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
      if (settingsPanel) settingsPanel.style.display = 'none';
      this.sound.playSelect();
    }, this._listenOpts);

    // Speed Controls [1X] [2X] [3X]
    const speedPills = document.querySelectorAll('.speed-pill');
    speedPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const speed = parseFloat(pill.dataset.speed || '1');
        this.gm.gameSpeed = speed;
        this.gm.isPaused = false;
        speedPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const pauseToggle = document.getElementById('toggle-pause');
        if (pauseToggle) pauseToggle.checked = false;
        this.sound.playSelect();
      }, this._listenOpts);
    });

    // Pause Switch Toggle
    document.getElementById('toggle-pause')?.addEventListener('change', (e) => {
      this.gm.isPaused = e.target.checked;
      this.sound.playSelect();
    }, this._listenOpts);

    // Volume Sliders (SFX & Music)
    const sliderSfx = document.getElementById('slider-sfx');
    const valSfx = document.getElementById('val-sfx');
    sliderSfx?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (valSfx) valSfx.innerText = `${val}%`;
      this.sound.setSfxVolume(val / 100);
    }, this._listenOpts);

    const sliderMusic = document.getElementById('slider-music');
    const valMusic = document.getElementById('val-music');
    sliderMusic?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (valMusic) valMusic.innerText = `${val}%`;
      this.sound.setMusicVolume(val / 100);
    }, this._listenOpts);

    // Atmosphere Time-of-Day Buttons (Day, Sunset, Night)
    const timePills = document.querySelectorAll('.time-pill');
    document.getElementById('btn-time-day')?.addEventListener('click', (e) => {
      this.sm.setTimeOfDay('day');
      timePills.forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      this.sound.playSelect();
    }, this._listenOpts);
    document.getElementById('btn-time-sunset')?.addEventListener('click', (e) => {
      this.sm.setTimeOfDay('sunset');
      timePills.forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      this.sound.playSelect();
    }, this._listenOpts);
    document.getElementById('btn-time-night')?.addEventListener('click', (e) => {
      this.sm.setTimeOfDay('night');
      timePills.forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
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

    const handleMinimapClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // F2-05: tamanho do mapa vem de mapDef (era 140 fixo).
      const mapSize = this.gm.terrain.mapDef.size;
      const { x: worldX, z: worldZ } = minimapToWorld(clickX, clickY, mapSize, canvas.width, canvas.height);

      this.sm.cameraTarget.set(worldX, this.gm.terrain.getHeight(worldX, worldZ), worldZ);
    };

    canvas.addEventListener('mousedown', handleMinimapClick, this._listenOpts);
  }

  showNotification(msg, duration = 4000) {
    if (!this.notificationBox) return;
    this.notificationBox.innerText = msg;
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
      this.minimapTimer = 0;
      this.drawMinimap();
    }

    // 4. Win/Loss Screen
    if (this.gm.isGameOver) {
      const modal = document.getElementById('game-over-modal');
      const title = document.getElementById('game-over-title');
      const msg = document.getElementById('game-over-msg');
      if (modal && modal.style.display !== 'flex') {
        modal.style.display = 'flex';
        if (this.gm.gameWon) {
          title.innerText = '🏆 VITÓRIA GLORIOSA 🏆';
          title.style.color = '#ffd700';
          msg.innerText = this.gm.playerFaction === 'orc'
            ? 'O posto avançado humano foi esmagado! Os clãs dominam a ilha.'
            : 'A fortaleza orc foi derrotada! Seu reino prospera em paz.';
        } else {
          title.innerText = '💀 DERROTA 💀';
          title.style.color = '#ef4444';
          msg.innerText = this.gm.playerFaction === 'orc'
            ? 'Seu Grande Salão caiu diante dos invasores...'
            : 'Seu Castelo caiu diante dos invasores...';
        }
      }
    }
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
          this.showNotification('Fila de treinamento cheia! (Máximo 6)');
          return;
        }
        if (this.gm.population >= this.gm.maxPopulation) {
          this.sound.playChop();
          const farmName = this.gm.playerFaction === 'orc' ? 'Pig Farms' : 'Cottages';
          this.showNotification(`Population limit reached! Build more ${farmName}.`);
          return;
        }
        if (cfg && !this.gm.canAfford(cfg.cost)) {
          this.sound.playChop();
          this.showNotification(`Not enough resources to train ${trainType}!`);
          return;
        }
        this.gm.issue({ type: CMD.TRAIN, playerId: this.gm.localPlayerId, buildingId: b.id, unitType: trainType });
        this.sound.playSelect();
        this.lastSelectionKey = null; // force immediate re-render of queue counters
      }
    }, this._listenOpts);
  }

  initBuildingEvents() {
    if (!this.buildingView) return;

    this.buildingView.addEventListener('click', (e) => {
      // 1. Click on forge upgrade button
      const upgradeBtn = e.target.closest('.bld-upgrade-btn');
      if (upgradeBtn && this.gm.selectedBuilding) {
        const b = this.gm.selectedBuilding;
        const upgradeId = upgradeBtn.getAttribute('data-upgrade');
        if (upgradeId) {
          const cfg = UPGRADE_CONFIG[upgradeId];
          const factionType = this.gm.playerFaction === 'orc' ? 'orc' : 'human';
          const upgName = cfg ? cfg.name[factionType] : upgradeId;

          if (this.gm.isUpgradeResearched(upgradeId, 'player')) {
            this.sound.playChop();
            this.showNotification(`Melhoria "${upgName}" já foi forjada!`);
            return;
          }

          if (b.currentResearch) {
            this.sound.playChop();
            this.showNotification('A forja já está ocupada trabalhando em uma pesquisa!');
            return;
          }

          if (this.gm.isUpgradeResearching(upgradeId, 'player')) {
            this.sound.playChop();
            this.showNotification('Esta melhoria já está sendo forjada em outra forja!');
            return;
          }

          if (!this.gm.canAfford(cfg.cost)) {
            this.sound.playChop();
            this.showNotification(`Recursos insuficientes para forjar ${upgName}!`);
            return;
          }

          // F2-02: comando RESEARCH — os checks acima (já pesquisado/ocupado/sem recursos)
          // seguem client-side para feedback imediato; a validação final é do executor.
          this.gm.issue({ type: CMD.RESEARCH, playerId: this.gm.localPlayerId, buildingId: b.id, upgradeId });
          this.sound.playHammer();
          this.showNotification(`Iniciando forjamento: ${upgName}...`);
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
            this.showNotification('Fila de treinamento cheia! (Máximo 6)');
            return;
          }
          if (this.gm.population >= this.gm.maxPopulation) {
            this.sound.playChop();
            const houseName = this.gm.playerFaction === 'orc' ? 'Tocas Orc' : 'Casas';
            this.showNotification(`Limite de população atingido! Construa mais ${houseName}.`);
            return;
          }
          if (cfg && !this.gm.canAfford(cfg.cost)) {
            this.sound.playChop();
            this.showNotification(`Recursos insuficientes para treinar ${cfg ? cfg.name : trainType}!`);
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
        if (b.type === 'forge' || b.type === 'orc_forge') {
          if (b.currentResearch) {
            this.gm.issue({ type: CMD.CANCEL_RESEARCH, playerId: this.gm.localPlayerId, buildingId: b.id });
            this.sound.playSelect();
            this.showNotification('Pesquisa cancelada. Recursos reembolsados.');
            this.renderBuildingTrainButtons(b);
            this.updateBuildingQueue(b);
          }
          return;
        }

        const slotIdx = parseInt(queueSlot.getAttribute('data-slot'), 10);
        if (!isNaN(slotIdx)) {
          this.gm.issue({ type: CMD.CANCEL_TRAIN, playerId: this.gm.localPlayerId, buildingId: b.id, slot: slotIdx });
          this.sound.playSelect();
          this.showNotification('Treinamento cancelado. Recursos reembolsados.');
          this.updateBuildingQueue(b);
        }
      }
    }, this._listenOpts);
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

      this.selectionTitle.innerText = count > 1 ? `${count}x ${u.name}s` : u.name;
      this.updateSelectionPortraits(this.gm.selectedUnits);

      // Health
      const pct = Math.max(0, u.hp / u.maxHp) * 100;
      this.selectionHpBar.style.width = `${pct}%`;
      this.selectionHp.innerText = `${Math.round(u.hp)} / ${u.maxHp} HP`;

      // Stats
      this.selectionStats.innerHTML = `
        <span>⚔️ Atk: ${u.damage.basic}+${u.damage.piercing}</span>
        <span>🛡️ Def: ${u.armor || 0}</span>
        <span>🏃 Spd: ${u.speed}</span>
        ${isWorker ? `<span>🎒 Carry: ${u.carrying.amount}/${u.carrying.max} ${u.carrying.type || ''}</span>` : ''}
      `;

      const key = isWorker ? `${u.type}_actions` : 'military_actions';
      if (this.lastSelectionKey !== key) {
        this.lastSelectionKey = key;
        this.renderSelectionActions(key);
      }
      if (isWorker) {
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
        let title = b.name.toUpperCase();
        if (!b.isConstructed) title += ' (EM CONSTRUÇÃO)';
        else if (b.faction === 'enemy') title += ' (INIMIGO)';
        this.bldSelectionTitle.innerText = title;
      }

      // Health Text & Fill Bar
      if (this.bldSelectionHp) {
        this.bldSelectionHp.innerText = `Vida: ${Math.round(b.hp)} / ${b.maxHp}`;
      }
      if (this.bldSelectionHpFill) {
        const pct = Math.max(0, Math.min(100, (b.hp / b.maxHp) * 100));
        this.bldSelectionHpFill.style.width = `${pct}%`;
      }

      // Extra Info
      if (this.bldExtraInfo) {
        if (!b.isConstructed) {
          this.bldExtraInfo.innerText = `🔨 Construindo: ${Math.round(b.buildProgress)}%`;
        } else if (b.popGranted) {
          this.bldExtraInfo.innerText = `👥 +${b.popGranted} População`;
        } else if (b.towerDamage) {
          this.bldExtraInfo.innerText = `🏹 Dano: ${b.towerDamage.basic}+${b.towerDamage.piercing} | Alcance: ${b.attackRange} | 🛡️ ${b.armor || 0}`;
        } else {
          this.bldExtraInfo.innerText = b.armor ? `🛡️ Def: ${b.armor}` : '';
        }
      }

      // Render buttons when building changes or forge research state changes
      const isForge = b.type === 'forge' || b.type === 'orc_forge';
      const playerResearchedCount = this.gm.researchedUpgrades ? (this.gm.researchedUpgrades[b.faction || 'player']?.size || 0) : 0;
      const researchId = b.currentResearch ? b.currentResearch.id : null;

      if (this.currentBuilding !== b || (isForge && (this.lastResearchedCount !== playerResearchedCount || this.lastResearchId !== researchId))) {
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
    } else if (this.gm.selectedResource) {
      this.currentBuilding = null;
      if (this.buildingView) this.buildingView.style.display = 'none';
      if (this.standardView) this.standardView.style.display = 'flex';
      this.selectionCard.style.display = 'flex';

      const r = this.gm.selectedResource;
      const isTree = r.type === 'tree';
      const isDepletedTree = isTree && (r.isDead || r.woodRemaining <= 0);

      this.selectionTitle.innerText = isDepletedTree ? 'Tronco Cortado' : (isTree ? 'Ancient Tree' : r.name);

      const remaining = isTree ? r.woodRemaining : r.resourcesRemaining;
      const max = isTree ? r.maxWood : r.maxResources;
      const pct = max > 0 ? (remaining / max) * 100 : 0;
      this.selectionHpBar.style.width = `${pct}%`;
      this.selectionHp.innerText = isDepletedTree
        ? '0 / 120 Madeira (Esgotada)'
        : `${remaining} / ${max} Available`;
      this.selectionStats.innerHTML = isDepletedTree
        ? '<span>Tronco com cogumelos &bull; Madeira esgotada</span>'
        : `<span>Assign Villagers to harvest resources</span>`;

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
        <button type="button" class="selection-portrait" data-portrait-id="${unit.id}" title="${unit.name}">
          <img src="${icon}" class="selection-portrait-icon" alt="${unit.name}" />
          <div class="selection-portrait-hp-bg"><div class="selection-portrait-hp-fill" style="width: ${pct}%"></div></div>
        </button>
      `;
    }).join('');
  }

  renderBuildingTrainButtons(building) {
    if (!this.bldTrainButtons) return;

    const isForge = building.faction === 'player' && building.isConstructed && (building.type === 'forge' || building.type === 'orc_forge');
    if (isForge) {
      if (this.bldTrainLabel) this.bldTrainLabel.innerText = 'MELHORIAS DA FORJA:';
      if (this.bldQueueLabel) this.bldQueueLabel.innerText = 'PROGRESSO DO FORJAMENTO:';
      if (this.bldTrainSection) this.bldTrainSection.style.display = 'flex';
      if (this.bldQueueSection) this.bldQueueSection.style.display = 'flex';

      const factionType = this.gm.playerFaction === 'orc' ? 'orc' : 'human';

      this.bldTrainButtons.innerHTML = FORGE_UPGRADES.map((upgId, i) => {
        const cfg = UPGRADE_CONFIG[upgId];
        if (!cfg) return '';

        const isResearched = this.gm.isUpgradeResearched(upgId, 'player');
        const isResearchingThis = building.currentResearch && building.currentResearch.id === upgId;
        const isResearchingAny = this.gm.isUpgradeResearching(upgId, 'player');
        const upgName = cfg.name[factionType] || upgId;
        const upgDesc = cfg.description[factionType] || '';
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
          <button class="${btnClass}" data-upgrade="${upgId}" title="${upgName}${hotkey ? ` (${hotkey})` : ''}" ${isResearched ? 'disabled' : ''}>
            ${hotkey ? `<span class="bld-hotkey-badge">${hotkey}</span>` : ''}
            <img src="${cfg.icon}" class="bld-train-btn-icon" alt="${upgName}" />
            ${badge}
            <div class="bld-hint-bubble">
              <div class="bld-hint-col">
                <div class="bld-hint-header">
                  <span class="bld-hint-title">${upgName}${hotkey ? ` <span class="bld-hint-hotkey">(${hotkey})</span>` : ''}</span>
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

    if (this.bldTrainLabel) this.bldTrainLabel.innerText = 'TREINAR UNIDADE:';
    if (this.bldQueueLabel) this.bldQueueLabel.innerText = 'FILA DE TREINAMENTO:';

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

    this.bldTrainButtons.innerHTML = trainable.map((unitType, i) => {
      const cfg = UNIT_TRAIN_CONFIG[unitType];
      if (!cfg) return '';
      const hotkey = getTrainHotkey(i);
      return `
        <button class="bld-train-btn" data-train="${unitType}" title="${cfg.name}${hotkey ? ` (${hotkey})` : ''}">
          ${hotkey ? `<span class="bld-hotkey-badge">${hotkey}</span>` : ''}
          <img src="${cfg.icon}" class="bld-train-btn-icon" alt="${cfg.name}" />
          <div class="bld-hint-bubble">
            <span class="bld-hint-title">${cfg.name}${hotkey ? ` <span class="bld-hint-hotkey">(${hotkey})</span>` : ''}</span> - Custo: <span class="bld-cost-items" data-cost-unit="${unitType}"></span>
          </div>
        </button>
      `;
    }).join('');

    this.updateBuildingCosts(building);
  }

  updateBuildingCosts(building) {
    if (!this.bldTrainButtons) return;

    const isForge = building.type === 'forge' || building.type === 'orc_forge';
    if (isForge) {
      FORGE_UPGRADES.forEach(upgId => {
        const cfg = UPGRADE_CONFIG[upgId];
        if (!cfg) return;
        const costContainer = this.bldTrainButtons.querySelector(`[data-cost-upgrade="${upgId}"]`);
        if (!costContainer) return;

        const isResearched = this.gm.isUpgradeResearched(upgId, 'player');
        if (isResearched) {
          costContainer.innerHTML = '<span class="bld-cost-researched">✓ Pesquisado</span>';
          return;
        }

        const isResearchingThis = building.currentResearch && building.currentResearch.id === upgId;
        const isResearchingAny = this.gm.isUpgradeResearching(upgId, 'player');
        if (isResearchingThis || isResearchingAny) {
          costContainer.innerHTML = '<span class="bld-cost-researching">🔨 Forjando...</span>';
          return;
        }

        costContainer.innerHTML = buildCostHtml(cfg.cost, this.gm.resources);
      });
      return;
    }

    const trainable = BUILDING_TRAINABLE_UNITS[building.type];
    if (!trainable) return;

    trainable.forEach(unitType => {
      const cfg = UNIT_TRAIN_CONFIG[unitType];
      if (!cfg) return;
      const costContainer = this.bldTrainButtons.querySelector(`[data-cost-unit="${unitType}"]`);
      if (!costContainer) return;

      costContainer.innerHTML = buildCostHtml(cfg.cost, this.gm.resources);
    });
  }

  updateBuildingQueue(b) {
    if (!this.bldQueueSlots || this.bldQueueSlots.length === 0) return;

    const isForge = b.type === 'forge' || b.type === 'orc_forge';
    if (isForge) {
      if (b.currentResearch) {
        const r = b.currentResearch;
        const cfg = r.cfg || UPGRADE_CONFIG[r.id];
        const factionType = this.gm.playerFaction === 'orc' ? 'orc' : 'human';
        const name = cfg ? cfg.name[factionType] : r.id;
        const iconSrc = cfg ? cfg.icon : '/icoEspada.png';

        const slot0 = this.bldQueueSlots[0];
        if (slot0) {
          slot0.className = 'bld-queue-slot filled active forge-slot';
          slot0.innerHTML = `<img src="${iconSrc}" class="bld-slot-icon" alt="${name}" />`;
          slot0.title = `${name} (Forjando...) - Clique para cancelar`;
        }

        for (let i = 1; i < 6; i++) {
          const slotEl = this.bldQueueSlots[i];
          if (!slotEl) continue;
          slotEl.className = 'bld-queue-slot empty';
          slotEl.innerHTML = '';
          slotEl.title = 'Slot vazio';
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
          slotEl.title = 'Slot vazio';
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
        const name = cfg ? cfg.name : item.type;
        slotEl.className = 'bld-queue-slot filled' + (i === 0 ? ' active' : '');
        slotEl.innerHTML = `<img src="${iconSrc}" class="bld-slot-icon" alt="${name}" />`;
        slotEl.title = `${name} (${i === 0 ? 'Treinando' : 'Na fila'}) - Clique para cancelar`;
      } else {
        slotEl.className = 'bld-queue-slot empty';
        slotEl.innerHTML = '';
        slotEl.title = 'Slot vazio';
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

  renderSelectionActions(key) {
    if (key === 'villager_actions' || key === 'peon_actions') {
      const workerType = key === 'villager_actions' ? 'villager' : 'peon';
      const buildings = WORKER_BUILD_LIST[workerType] || [];

      const buildButtonsHtml = buildings.map(bType => {
        const cfg = BUILDING_BUILD_CONFIG[bType];
        if (!cfg) return '';
        const hotkey = getBuildHotkey(bType);
        return `
          <button class="bld-train-btn action-build-btn" data-build="${bType}" title="${cfg.name}${hotkey ? ` (${hotkey})` : ''}">
            ${hotkey ? `<span class="bld-hotkey-badge">${hotkey}</span>` : ''}
            <img src="${cfg.icon}" class="bld-train-btn-icon" alt="${cfg.name}" />
            <div class="bld-hint-bubble">
              <div class="bld-hint-col">
                <div class="bld-hint-header">
                  <span class="bld-hint-title">${cfg.name}${hotkey ? ` <span class="bld-hint-hotkey">(${hotkey})</span>` : ''}</span>
                  ${cfg.description ? `<span class="bld-hint-desc">${cfg.description}</span>` : ''}
                </div>
                <div class="bld-hint-footer">
                  Custo: <span class="bld-cost-items" data-cost-build="${bType}"></span>
                </div>
              </div>
            </div>
          </button>
        `;
      }).join('');

      const stopButtonHtml = `
        <button class="bld-train-btn action-stop-btn" data-action="stop" title="Parar Unidade (S)">
          <span class="action-stop-icon">🛑</span>
          <div class="bld-hint-bubble">
            <span class="bld-hint-title">Parar</span> - Interromper ordens
          </div>
        </button>
      `;

      this.selectionActions.innerHTML = `
        <div class="worker-actions-container">
          <span class="bld-section-label">CONSTRUIR:</span>
          <div class="worker-actions-group">
            ${buildButtonsHtml}
            ${stopButtonHtml}
          </div>
        </div>
      `;
      this.updateWorkerBuildCosts(workerType);
    } else if (key === 'military_actions') {
      this.selectionActions.innerHTML = `
        <div class="worker-actions-container">
          <span class="bld-section-label">AÇÕES:</span>
          <div class="worker-actions-group">
            <button class="bld-train-btn action-stop-btn" data-action="stop" title="Parar Unidades (S)">
              <span class="action-stop-icon">🛑</span>
              <div class="bld-hint-bubble">
                <span class="bld-hint-title">Parar</span> - Interromper combate / movimento
              </div>
            </button>
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
        const names = missing.map(t => getBuildingDef(t).name).join(', ');
        btn.disabled = true;
        btn.title = `Requer: ${names}`;
        btn.classList.add('bld-requirement-missing');
      } else {
        btn.disabled = false;
        btn.classList.remove('bld-requirement-missing');
        const hotkey = getBuildHotkey(bType);
        btn.title = `${cfg.name}${hotkey ? ` (${hotkey})` : ''}`;
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
      const m = toMap(r.mesh.position.x, r.mesh.position.z);
      ctx.fillStyle = r.type === 'gold' ? '#ffd700' : '#a0aab2';
      ctx.fillRect(m.x - 2, m.y - 2, 4, 4);
    });

    // Draw Buildings (inimigas: só as já vistas — visíveis agora ou lembradas pela névoa)
    const fog = this.gm.fogOfWar;
    this.gm.buildings.forEach(b => {
      if (!b.isDead) {
        if (b.faction === 'player' || !fog || fog.isBuildingKnown(b)) {
          const m = toMap(b.mesh.position.x, b.mesh.position.z);
          ctx.fillStyle = b.faction === 'player' ? '#2563eb' : '#dc2626';
          ctx.fillRect(m.x - 3, m.y - 3, 6, 6);
        }
      }
    });
    // Fantasmas: construções inimigas destruídas fora da visão continuam na memória até a área ser revista
    if (fog) {
      ctx.fillStyle = '#dc2626';
      fog.forEachGhostBuilding((b, rec) => {
        const m = toMap(rec.x, rec.z);
        ctx.fillRect(m.x - 3, m.y - 3, 6, 6);
      });
    }

    // Draw Player Units (cyan dots)
    this.gm.units.forEach(u => {
      if (!u.isDead) {
        const m = toMap(u.mesh.position.x, u.mesh.position.z);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
      }
    });

    // Draw Enemy Units (red dots, só com visão atual)
    this.gm.enemies.forEach(e => {
      if (!e.isDead) {
        if (!fog || fog.isVisible(e.mesh.position.x, e.mesh.position.z)) {
          const m = toMap(e.mesh.position.x, e.mesh.position.z);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
        }
      }
    });

    // Névoa no minimapa: preto = não explorado, escurecido = memória, limpo = visível
    if (fog) {
      fog.drawMinimapFog(ctx, w, h);
    }

    // Camera Viewport Box on top of Fog
    const camPos = toMap(this.sm.cameraTarget.x, this.sm.cameraTarget.z);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(camPos.x - 8, camPos.y - 6, 16, 12);
  }

  /**
   * F2-04: fim da sessão de partida. Remove os listeners desta instância, cancela o timer
   * de notificação e devolve a HUD (elementos estáticos do index.html) ao estado inicial.
   */
  dispose() {
    this._abort.abort();
    if (this._disposeUiScale) this._disposeUiScale();
    clearTimeout(this._notificationTimer);
    this._notificationTimer = null;

    const hide = (id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    };
    hide('game-over-modal');
    hide('settings-panel');
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

    this.currentBuilding = null;
    this.gm = null;
    this.im = null;
  }
}
