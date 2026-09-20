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
    this.raidTimerVal = document.getElementById('raid-timer-val');

    this.selectionCard = document.getElementById('selection-card');
    this.selectionTitle = document.getElementById('selection-title');
    this.selectionHp = document.getElementById('selection-hp');
    this.selectionHpBar = document.getElementById('selection-hp-fill');
    this.selectionStats = document.getElementById('selection-stats');
    this.selectionActions = document.getElementById('selection-actions');

    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;

    this.notificationBox = document.getElementById('notification-box');

    this.lastSelectionKey = null;
    this.initControls();
    this.initMinimapEvents();
    this.initActionsEventDelegation();
  }

  initControls() {
    // Atmosphere buttons
    document.getElementById('btn-time-day')?.addEventListener('click', () => {
      this.sm.setTimeOfDay('day');
      this.sound.playSelect();
    });
    document.getElementById('btn-time-sunset')?.addEventListener('click', () => {
      this.sm.setTimeOfDay('sunset');
      this.sound.playSelect();
    });
    document.getElementById('btn-time-night')?.addEventListener('click', () => {
      this.sm.setTimeOfDay('night');
      this.sound.playSelect();
    });

    // Sound and Music toggles
    document.getElementById('btn-toggle-sound')?.addEventListener('click', (e) => {
      const active = this.sound.toggleSound();
      e.target.innerText = active ? '🔊 SFX' : '🔇 SFX';
    });
    document.getElementById('btn-toggle-music')?.addEventListener('click', (e) => {
      const active = this.sound.toggleMusic();
      e.target.innerText = active ? '🎵 Music' : '🎵 Off';
    });

    // Speed Controls
    document.getElementById('btn-speed-1x')?.addEventListener('click', () => {
      this.gm.gameSpeed = 1.0;
      this.gm.isPaused = false;
    });
    document.getElementById('btn-speed-2x')?.addEventListener('click', () => {
      this.gm.gameSpeed = 2.0;
      this.gm.isPaused = false;
    });
    document.getElementById('btn-pause')?.addEventListener('click', () => {
      this.gm.isPaused = !this.gm.isPaused;
    });

    // Help Modal
    const helpModal = document.getElementById('help-modal');
    document.getElementById('btn-help')?.addEventListener('click', () => {
      helpModal.style.display = 'flex';
      this.sound.playSelect();
    });
    document.getElementById('btn-close-help')?.addEventListener('click', () => {
      helpModal.style.display = 'none';
      this.sound.resume();
    });

    // Victory/Defeat restart
    document.getElementById('btn-restart')?.addEventListener('click', () => {
      window.location.reload();
    });
  }

  initMinimapEvents() {
    if (!this.minimapCanvas) return;
    const canvas = this.minimapCanvas;

    const handleMinimapClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Map canvas coords (0 to 140) to world coordinates (-55 to 55)
      const worldX = ((clickX / canvas.width) - 0.5) * 110;
      const worldZ = ((clickY / canvas.height) - 0.5) * 110;

      this.sm.cameraTarget.set(worldX, this.gm.terrain.getHeight(worldX, worldZ), worldZ);
    };

    canvas.addEventListener('mousedown', handleMinimapClick);
  }

  showNotification(msg, duration = 4000) {
    if (!this.notificationBox) return;
    this.notificationBox.innerText = msg;
    this.notificationBox.style.opacity = '1';
    this.notificationBox.style.transform = 'translateX(-50%) translateY(0)';

    setTimeout(() => {
      this.notificationBox.style.opacity = '0';
      this.notificationBox.style.transform = 'translateX(-50%) translateY(-20px)';
    }, duration);
  }

  update() {
    // 1. Update Resources Bar
    if (this.woodVal) this.woodVal.innerText = Math.floor(this.gm.resources.wood);
    if (this.goldVal) this.goldVal.innerText = Math.floor(this.gm.resources.gold);
    if (this.stoneVal) this.stoneVal.innerText = Math.floor(this.gm.resources.stone);
    if (this.popVal) this.popVal.innerText = `${this.gm.population} / ${this.gm.maxPopulation}`;

    // Raid Countdown
    if (this.raidTimerVal) {
      const sec = Math.max(0, Math.ceil(this.gm.raidTimer));
      this.raidTimerVal.innerText = `Raid in ${sec}s`;
    }

    // 2. Selection Card
    this.updateSelectionCard();

    // 3. Minimap
    this.drawMinimap();

    // 4. Win/Loss Screen
    if (this.gm.isGameOver) {
      const modal = document.getElementById('game-over-modal');
      const title = document.getElementById('game-over-title');
      const msg = document.getElementById('game-over-msg');
      if (modal && modal.style.display !== 'flex') {
        modal.style.display = 'flex';
        if (this.gm.gameWon) {
          title.innerText = '🏆 GLORIOUS VICTORY 🏆';
          title.style.color = '#ffd700';
          msg.innerText = 'The Bandit Outpost has been destroyed! Your kingdom thrives in peace and prosperity.';
        } else {
          title.innerText = '💀 DEFEAT 💀';
          title.style.color = '#ef4444';
          msg.innerText = 'Your Castle has fallen to the enemy raiders...';
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

      // 2. Unit stop command
      const action = btn.getAttribute('data-action');
      if (action === 'stop') {
        this.gm.selectedUnits.forEach(u => u.stop());
        return;
      }

      // 3. Train units
      const trainType = btn.getAttribute('data-train');
      if (trainType && this.gm.selectedBuilding) {
        const b = this.gm.selectedBuilding;
        const ok = b.queueUnit(trainType, this.gm);
        if (ok) {
          this.sound.playSelect();
          this.lastSelectionKey = null; // force immediate re-render of queue counters
        } else {
          this.sound.playChop(); // buzz error
          if (this.gm.population >= this.gm.maxPopulation) {
            this.showNotification('Population limit reached! Build more Cottages.');
          } else {
            this.showNotification(`Not enough resources to train ${trainType}!`);
          }
        }
      }
    });
  }

  updateSelectionCard() {
    if (!this.selectionCard) return;

    if (this.gm.selectedUnits.length > 0) {
      const u = this.gm.selectedUnits[0];
      const count = this.gm.selectedUnits.length;

      this.selectionCard.style.display = 'flex';
      this.selectionTitle.innerText = count > 1 ? `${count}x ${u.name}s` : u.name;

      // Health
      const pct = Math.max(0, u.hp / u.maxHp) * 100;
      this.selectionHpBar.style.width = `${pct}%`;
      this.selectionHp.innerText = `${Math.round(u.hp)} / ${u.maxHp} HP`;

      // Stats
      this.selectionStats.innerHTML = `
        <span>⚔️ Atk: ${u.attack}</span>
        <span>🛡️ Def: ${u.armor || 0}</span>
        <span>🏃 Spd: ${u.speed}</span>
        ${u.type === 'villager' ? `<span>🎒 Carry: ${u.carrying.amount}/${u.carrying.max} ${u.carrying.type || ''}</span>` : ''}
      `;

      const key = u.type === 'villager' ? 'villager_actions' : 'military_actions';
      if (this.lastSelectionKey !== key) {
        this.lastSelectionKey = key;
        this.renderSelectionActions(key);
      }
    } else if (this.gm.selectedBuilding) {
      const b = this.gm.selectedBuilding;
      this.selectionCard.style.display = 'flex';
      this.selectionTitle.innerText = b.name + (!b.isConstructed ? ' (Under Construction)' : '');

      const pct = Math.max(0, b.hp / b.maxHp) * 100;
      this.selectionHpBar.style.width = `${pct}%`;
      this.selectionHp.innerText = `${Math.round(b.hp)} / ${b.maxHp} HP`;

      const currentTraining = (b.queue && b.queue.length > 0) ? b.queue[0] : null;
      let trainingInfo = '';
      if (currentTraining) {
        const trainPct = Math.min(100, Math.round((currentTraining.progress / currentTraining.totalTime) * 100));
        const remSec = Math.max(1, Math.ceil(currentTraining.totalTime - currentTraining.progress));
        const trainIcon = currentTraining.type === 'villager' ? '👨‍🌾' : currentTraining.type === 'knight' ? '🛡️' : '🏹';
        trainingInfo = `<span style="color: #ffd700; font-weight: bold;">${trainIcon} Training ${currentTraining.type.toUpperCase()}: ${trainPct}% (${remSec}s)</span>`;
      }

      this.selectionStats.innerHTML = `
        ${!b.isConstructed ? `<span>🔨 Build: ${Math.round(b.buildProgress)}%</span>` : ''}
        ${b.popGranted ? `<span>👥 Pop: +${b.popGranted}</span>` : ''}
        ${b.attackDamage ? `<span>🏹 Damage: ${b.attackDamage}</span>` : ''}
        ${trainingInfo}
      `;

      const qLen = b.queue ? b.queue.length : 0;
      const key = `bld_${b.type}_${b.isConstructed}_${qLen}`;
      if (this.lastSelectionKey !== key) {
        this.lastSelectionKey = key;
        this.renderSelectionActions(key, b);
      }
    } else if (this.gm.selectedResource) {
      const r = this.gm.selectedResource;
      this.selectionCard.style.display = 'flex';
      const isTree = r.type === 'tree';
      this.selectionTitle.innerText = isTree ? 'Ancient Tree' : r.name;

      const remaining = isTree ? r.woodRemaining : r.resourcesRemaining;
      const max = isTree ? r.maxWood : r.maxResources;
      const pct = (remaining / max) * 100;
      this.selectionHpBar.style.width = `${pct}%`;
      this.selectionHp.innerText = `${remaining} / ${max} Available`;
      this.selectionStats.innerHTML = `<span>Assign Villagers to harvest resources</span>`;

      if (this.lastSelectionKey !== 'resource') {
        this.lastSelectionKey = 'resource';
        this.selectionActions.innerHTML = '';
      }
    } else {
      this.selectionCard.style.display = 'none';
      this.lastSelectionKey = 'none';
    }
  }

  renderSelectionActions(key, building = null) {
    if (key === 'villager_actions') {
      this.selectionActions.innerHTML = `
        <button class="gold-btn action-btn" data-build="cottage" title="Provides +5 population capacity">🏠 House (50W)</button>
        <button class="gold-btn action-btn" data-build="lumber_camp" title="Wood drop-off camp">🌲 Lumber (80W)</button>
        <button class="gold-btn action-btn" data-build="barracks" title="Trains military warriors">⚔️ Barracks (120W, 60S)</button>
        <button class="gold-btn action-btn" data-build="watchtower" title="Defensive arrow turret">🏹 Tower (80W, 40S)</button>
        <button class="gold-btn action-btn" data-build="farm" title="Generates food/gold income">🌾 Farm (60W)</button>
        <button class="gold-btn action-btn secondary" data-action="stop">🛑 Stop</button>
      `;
    } else if (key === 'military_actions') {
      this.selectionActions.innerHTML = `
        <button class="gold-btn action-btn secondary" data-action="stop">🛑 Stop</button>
      `;
    } else if (building && building.isConstructed) {
      if (building.type === 'castle') {
        const vCount = building.queue ? building.queue.filter(q => q.type === 'villager').length : 0;
        const kCount = building.queue ? building.queue.filter(q => q.type === 'knight').length : 0;
        const aCount = building.queue ? building.queue.filter(q => q.type === 'archer').length : 0;
        const vText = vCount > 0 ? ` (${vCount})` : '';
        const kText = kCount > 0 ? ` (${kCount})` : '';
        const aText = aCount > 0 ? ` (${aCount})` : '';
        this.selectionActions.innerHTML = `
          <button class="gold-btn action-btn" data-train="villager" title="Gatherer & Builder">👨‍🌾 Train Villager (50W, 20G)${vText}</button>
          <button class="gold-btn action-btn" data-train="knight" title="Armored Swordsman">🛡️ Train Knight (70W, 50G, 20S)${kText}</button>
          <button class="gold-btn action-btn" data-train="archer" title="Ranged Bow Marksman">🏹 Train Archer (60W, 35G)${aText}</button>
        `;
      } else if (building.type === 'barracks') {
        const kCount = building.queue ? building.queue.filter(q => q.type === 'knight').length : 0;
        const aCount = building.queue ? building.queue.filter(q => q.type === 'archer').length : 0;
        const kText = kCount > 0 ? ` (${kCount})` : '';
        const aText = aCount > 0 ? ` (${aCount})` : '';
        this.selectionActions.innerHTML = `
          <button class="gold-btn action-btn" data-train="knight" title="Armored Swordsman">🛡️ Train Knight (70W, 50G, 20S)${kText}</button>
          <button class="gold-btn action-btn" data-train="archer" title="Ranged Bow Marksman">🏹 Train Archer (60W, 35G)${aText}</button>
        `;
      } else {
        this.selectionActions.innerHTML = `<span>Right-click ground to set rally point</span>`;
      }
    } else if (building && !building.isConstructed) {
      this.selectionActions.innerHTML = `<span>Select a Villager and right-click to build</span>`;
    } else {
      this.selectionActions.innerHTML = '';
    }
  }

  drawMinimap() {
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    // Water background
    ctx.fillStyle = '#3d94bd';
    ctx.fillRect(0, 0, w, h);

    // Island landmass (circle approximation)
    ctx.fillStyle = '#65ab55';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 42, 0, Math.PI * 2);
    ctx.fill();

    // Sand rim
    ctx.strokeStyle = '#ebd49c';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Mini-island (bottom-left)
    ctx.fillStyle = '#65ab55';
    ctx.beginPath();
    ctx.arc(28, 98, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const toMap = (x, z) => ({
      x: ((x / 110) + 0.5) * w,
      y: ((z / 110) + 0.5) * h
    });

    // Draw Trees (green dots)
    ctx.fillStyle = '#366e2c';
    this.gm.trees.forEach(t => {
      if (!t.isDead) {
        const m = toMap(t.mesh.position.x, t.mesh.position.z);
        ctx.fillRect(m.x - 1, m.y - 1, 2, 2);
      }
    });

    // Draw Resource Deposits (gold & gray)
    this.gm.resourceDeposits.forEach(r => {
      const m = toMap(r.mesh.position.x, r.mesh.position.z);
      ctx.fillStyle = r.type === 'gold' ? '#f5b81a' : '#8c9194';
      ctx.fillRect(m.x - 2, m.y - 2, 4, 4);
    });

    // Draw Buildings
    this.gm.buildings.forEach(b => {
      const m = toMap(b.mesh.position.x, b.mesh.position.z);
      ctx.fillStyle = b.faction === 'player' ? '#2563eb' : '#dc2626';
      ctx.fillRect(m.x - 3, m.y - 3, 6, 6);
    });

    // Draw Units
    this.gm.units.forEach(u => {
      if (!u.isDead) {
        const m = toMap(u.mesh.position.x, u.mesh.position.z);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
      }
    });

    // Draw Enemies
    this.gm.enemies.forEach(e => {
      if (!e.isDead) {
        const m = toMap(e.mesh.position.x, e.mesh.position.z);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
      }
    });

    // Camera Viewport Box
    const camPos = toMap(this.sm.cameraTarget.x, this.sm.cameraTarget.z);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(camPos.x - 8, camPos.y - 6, 16, 12);
  }
}
