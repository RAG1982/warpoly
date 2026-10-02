import { t, resourceName } from '../i18n/index.js';
import * as THREE from 'three';
import { ModelFactory } from '../entities/ModelFactory.js';
import { Building } from '../entities/Building.js';
import { getCost, getBuildingDef, WALL_STEP, WALL_MAX_POINTS } from '../data/index.js';
import { CMD } from '../sim/commands.js';
import { ControlGroups } from './ControlGroups.js';
import { resolveKey, limitByDistance, SELECTION_LIMIT } from './Hotkeys.js';
import { runtime as optionsRuntime } from '../ui/optionsStore.js';
import { QualitySettings } from './QualitySettings.js';
import { classifyHover, cursorKindFor, cursorCss, CursorController } from '../ui/cursors.js';
import { HoverOutline } from '../ui/HoverOutline.js';
import { EVT } from '../sim/events.js';
import { WATER_LEVEL } from '../data/combat.js';
import { resolveAbility, needsEntityTarget, targetProblem, canCast, pickCaster, selectionAbilityUnits } from '../sim/abilities.js';

/** Distância (px) da borda da janela que ativa o pan pela borda (F3-01). */
const EDGE_PX = 8;

export class InputManager {
  constructor(sceneManager, gameManager, terrain, terrainView = null) {
    this.sm = sceneManager;
    this.gm = gameManager;
    this.terrain = terrain;
    /** F2-08c: malha do terreno (picking do ponto sob o mouse); a `Terrain` de simulação não tem malha. */
    this.terrainView = terrainView;

    // Raycaster & Mouse
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.groundIntersection = new THREE.Vector3();
    this.hoveredEntity = null;
    this._overUi = false;
    this._ghostValid = true;
    // F6-06: cursores contextuais e contorno da entidade sob o mouse.
    this.cursorController = new CursorController(this.sm && this.sm.renderer ? this.sm.renderer.domElement : null);
    this.hoverOutline = this.sm && this.sm.scene ? new HoverOutline(this.sm.scene) : null;

    // Keyboard state
    this.keys = {};

    // F2-04: com `suspended` (menu de pausa aberto) só a câmera responde (WASD/setas);
    // cliques e atalhos são ignorados. `onPauseRequest` é chamado no Esc sem nada a cancelar.
    this.suspended = false;
    this.onPauseRequest = null;

    /**
     * Modo-alvo (F3-05 Reparar, generalizado na F4-03): `{kind:'repair'}` (o próximo clique numa construção
     * própria emite REPAIR) ou `{kind:'cast', abilityId}` (o próximo clique escolhe o alvo da habilidade).
     * Botão direito/Esc cancelam; o cursor vira mira (crosshair) enquanto ativo.
     */
    this.targetMode = null;

    // F3-01: grupos de controle, alerta, trabalhador ocioso, pan pela borda, câmera arrastada.
    this.controlGroups = new ControlGroups();
    this._consumed = {};          // teclas já tratadas como atalho (não movem a câmera)
    this._lastClick = { t: -Infinity, id: -1 };
    this._idleCursor = -1;
    this.lastAlertPos = null;
    this._hasMouse = false;
    this._isMiddleDown = false;
    // F6-08: pan pela borda e velocidade de rolagem vêm de `optionsRuntime` (Opções > Controles).
    const ev = this.gm.events;
    this._offAlerts = ev ? [
      ev.on(EVT.UNDER_ATTACK, p => this._noteAlert(p)),
      ev.on(EVT.UNIT_DAMAGED, p => this._noteAlert(p)),
      ev.on(EVT.BUILDING_DAMAGED, p => this._noteAlert(p))
    ] : [];

    // Listeners de window/DOM removidos em dispose() (sessão de partida descartável).
    this._abort = new AbortController();
    const opts = { signal: this._abort.signal };
    window.addEventListener('keydown', e => this.onKeyDown(e), opts);
    window.addEventListener('keyup', e => this.onKeyUp(e), opts);
    window.addEventListener('blur', () => { this.keys = {}; this._consumed = {}; this._isMiddleDown = false; }, opts);

    // Mouse drag / selection box
    this.isLeftDown = false;
    this.isRightDown = false;
    this.leftDownPos = { x: 0, y: 0 };
    this.currentMousePos = { x: 0, y: 0 };
    this.isDraggingBox = false;

    // Ghost building placement
    this.placingBuildingType = null;
    this.ghostMesh = null;
    // F3-08: colocação de muralha por arrasto (ponto A fixado no botão pressionado).
    this.wallAnchor = null;
    this.wallGhosts = [];
    this._wallPreview = [];
    this._wallLabel = null;
    this._wallLastKey = null;

    // Click feedback ring on ground
    this.createClickDecal();

    // DOM events
    const dom = this.sm.renderer.domElement;
    dom.addEventListener('mousedown', e => this.onMouseDown(e), opts);
    window.addEventListener('mousemove', e => this.onMouseMove(e), opts);
    document.addEventListener('mouseleave', () => { this._hasMouse = false; }, opts);
    window.addEventListener('mouseup', e => this.onMouseUp(e), opts);
    dom.addEventListener('wheel', e => this.onWheel(e), { passive: false, signal: this._abort.signal });
    dom.addEventListener('contextmenu', e => e.preventDefault(), opts);

    // Selection marquee box element
    this.boxEl = document.getElementById('selection-box');

    // Buffers reutilizados pelo picking (F1-06: unitGrid/blockerGrid no lugar de montar a
    // lista de todas as meshes do jogo a cada raycast).
    this._pickUnitBuf = [];
    this._pickBlockerBuf = [];
    this._pickMeshBuf = [];
  }

  createClickDecal() {
    const geo = new THREE.RingGeometry(0.5, 0.75, 24);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x68d391, side: THREE.DoubleSide, transparent: true, opacity: 0 });
    mat.userData.noFog = true; // F1-05: marcador de clique não recebe névoa
    this.clickDecal = new THREE.Mesh(geo, mat);
    this.clickDecal.position.y = 0.1;
    this.sm.scene.add(this.clickDecal);
    this.decalLife = 0;
  }

  playClickDecal(pos, color = 0x68d391) {
    this.clickDecal.position.copy(pos);
    this.clickDecal.position.y += 0.12;
    this.clickDecal.material.color.setHex(color);
    this.clickDecal.material.opacity = 0.9;
    this.clickDecal.scale.set(1, 1, 1);
    this.decalLife = 0.35;
  }

  _noteAlert(p) {
    if (p && p.ownerId === this.gm.localPlayerId && p.pos) this.lastAlertPos = { x: p.pos.x, z: p.pos.z };
  }

  onKeyDown(e) {
    this.keys[e.code] = true;
    if (this.suspended) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;

    if (e.code === 'Escape') {
      // Esc: cancela a colocação; senão limpa a seleção; senão abre o menu de pausa (F2-04).
      if (this.targetMode) {
        this.setTargetMode(null);
      } else if (this.placingBuildingType) {
        this.cancelPlacement();
      } else if (this.gm.selectedUnits.length > 0 || this.gm.selectedBuilding || this.gm.selectedResource) {
        this.gm.clearSelection();
      } else if (this.onPauseRequest) {
        e.preventDefault();
        this.onPauseRequest();
      }
      return;
    }
    if (this._handleHotkey(e)) {
      this._consumed[e.code] = true;
      if (e.code === 'Space' || e.code === 'Backspace') e.preventDefault();
    } else if (this._tryAbilityHotkey(e)) {
      this._consumed[e.code] = true; // F4-03: atalho de habilidade do card (consumido)
    } else if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.startRepairMode();
    } else if (e.code === 'KeyQ') {
      this.sm.rotateCamera(Math.PI / 8);
    } else if (e.code === 'KeyE') {
      this.sm.rotateCamera(-Math.PI / 8);
    }
  }

  /** Botões visíveis do card (letra → botão), lidos do badge de atalho (`.bld-hotkey-badge`). */
  _cardButtons() {
    const map = new Map();
    const ui = this.uiManager;
    if (!ui) return map;
    for (const root of [ui.selectionActions, ui.bldTrainButtons]) {
      if (!root) continue;
      for (const btn of root.querySelectorAll('button')) {
        const badge = btn.querySelector('.bld-hotkey-badge');
        const letter = badge ? badge.textContent.trim().toUpperCase() : '';
        if (letter && !map.has(letter) && btn.offsetParent !== null) map.set(letter, btn);
      }
    }
    return map;
  }

  /** F3-01: atalhos do RTS (ver `Hotkeys.resolveKey`). Devolve true se a tecla foi consumida. */
  _handleHotkey(e) {
    const gm = this.gm;
    const cards = this._cardButtons();
    const action = resolveKey(
      { code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey },
      {
        hasUnits: gm.selectedUnits.length > 0,
        hasBuilding: !!gm.selectedBuilding,
        targetMode: this.targetMode || this.placingBuildingType,
        cardLetters: new Set(cards.keys())
      }
    );
    if (!action) return false;
    if (e.repeat) return true; // atalho consumido, mas não repete ao segurar
    switch (action.type) {
      case 'group': this._groupAction(action); break;
      case 'order': this._orderAction(action.order); break;
      case 'card': {
        const btn = cards.get(action.letter);
        if (btn) btn.click();
        break;
      }
      case 'idleWorker': this.selectNextIdleWorker(); break;
      case 'lastAlert': this.centerOnLastAlert(); break;
      case 'hq': this.centerOnHq(); break;
      default: return false;
    }
    return true;
  }

  _isAlive(id) {
    const u = this.gm.entitiesById.get(id);
    return !!u && !u.isDead && !u.isDying && u.state !== 'dying' && u.ownerId === this.gm.localPlayerId;
  }

  _groupAction({ op, n }) {
    const gm = this.gm;
    const cg = this.controlGroups;
    const ids = gm.selectedUnits.filter(u => !u.isDead).map(u => u.id);
    if (ids.length === 0 && gm.selectedBuilding && gm.selectedBuilding.ownerId === gm.localPlayerId) ids.push(gm.selectedBuilding.id);
    if (op === 'set') { cg.set(n, ids); return; }
    if (op === 'add') { cg.add(n, ids); return; }
    const { ids: members, center } = cg.recall(n, performance.now(), id => this._isAlive(id));
    const ents = members.map(id => gm.entitiesById.get(id));
    if (ents.length === 0) return;
    const units = ents.filter(en => !('isConstructed' in en)); // construções têm isConstructed
    if (units.length > 0) this.selectUnits(units.slice(0, SELECTION_LIMIT), { additive: false });
    else gm.selectSingle(ents[0]);
    if (center) this._centerOn(ents);
  }

  _centerOn(ents) {
    let x = 0, z = 0, n = 0;
    for (const en of ents) {
      if (!en.mesh) continue;
      x += en.mesh.position.x; z += en.mesh.position.z; n++;
    }
    if (n === 0) return;
    this.sm.cameraTarget.set(x / n, this.terrain.getHeight(x / n, z / n), z / n);
  }

  _orderAction(order) {
    const gm = this.gm;
    gm.selectedUnits = gm.selectedUnits.filter(u => !u.isDead && !u.isDying && u.state !== 'dying');
    const unitIds = gm.selectedUnits.map(u => u.id);
    if (unitIds.length === 0) return;
    const playerId = gm.localPlayerId;
    if (order === 'stop') {
      gm.issue({ type: CMD.STOP, playerId, unitIds });
      gm.soundManager.playOrder();
    } else if (order === 'hold') {
      gm.issue({ type: CMD.HOLD, playerId, unitIds });
      gm.soundManager.playOrder();
    } else {
      this.setTargetMode({ kind: order });
      gm.events.emit(EVT.NOTIFY, { ownerId: playerId, text: order === 'attackMove' ? t('input.attackMove') : t('input.patrol') });
    }
  }

  /** `.`: seleciona o próximo trabalhador ocioso do jogador local e centraliza a câmera. */
  selectNextIdleWorker() {
    const gm = this.gm;
    const idle = gm.getUnitsOf(gm.localPlayerId)
      .filter(u => (u.type === 'villager' || u.type === 'peon') && u.state === 'idle' && !u.isDead && !u.isDying)
      .sort((a, b) => a.id - b.id);
    if (idle.length === 0) {
      gm.events.emit(EVT.NOTIFY, { ownerId: gm.localPlayerId, text: t('input.noIdle') });
      return null;
    }
    this._idleCursor = idle.findIndex(u => u.id > this._idleCursor);
    if (this._idleCursor < 0) this._idleCursor = 0;
    const u = idle[this._idleCursor];
    this._idleCursor = u.id;
    this.selectUnits([u], { additive: false });
    this._centerOn([u]);
    return u;
  }

  centerOnLastAlert() {
    // F6-05: histórico do AlertCenter (Espaço novo → antigo); sem ele, o último dano sofrido.
    const a = this.uiManager?.alerts?.jump();
    const p = a ? a.pos : this.lastAlertPos;
    if (p) this.sm.cameraTarget.set(p.x, this.terrain.getHeight(p.x, p.z), p.z);
    else this.centerOnHq();
  }

  centerOnHq() {
    const hq = this.gm.buildings.find(b => (b.type === 'castle' || b.type === 'great_hall') && b.ownerId === this.gm.localPlayerId);
    if (hq) {
      this.sm.cameraTarget.copy(hq.mesh.position);
      this.gm.selectSingle(hq);
    }
  }

  _screenPos(u) {
    const p = new THREE.Vector3().copy(this.gm.entityViews?.rootOf(u)?.position ?? u.mesh.position).project(this.sm.camera);
    return { id: u.id, u, x: ((p.x + 1) * window.innerWidth) / 2, y: ((-p.y + 1) * window.innerHeight) / 2 };
  }

  /** Seleciona `units` (próprias). `additive` mantém a seleção atual (sem passar de SELECTION_LIMIT). */
  selectUnits(units, { additive = false } = {}) {
    const gm = this.gm;
    if (!additive || gm.selectedBuilding) gm.clearSelection();
    gm.selectedResource = null;
    for (const u of units) {
      if (gm.selectedUnits.length >= SELECTION_LIMIT) break;
      if (gm.selectedUnits.includes(u)) continue;
      u.setSelected(true);
      gm.selectedUnits.push(u);
    }
    if (gm.selectedUnits.length > 0) gm.soundManager.playSelect();
  }

  /** Caixa de seleção (F3-01): limite de 24 (mais próximas do centro da caixa); `additive` com Shift. */
  selectInBox(rect, additive) {
    const gm = this.gm;
    const minX = Math.min(rect.x1, rect.x2), maxX = Math.max(rect.x1, rect.x2);
    const minY = Math.min(rect.y1, rect.y2), maxY = Math.max(rect.y1, rect.y2);
    const inside = [];
    for (const u of gm.getUnitsOf(gm.localPlayerId)) {
      if (u.isDead || u.isDying || u.ownerId !== gm.localPlayerId) continue;
      const s = this._screenPos(u);
      if (s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY) inside.push(s);
    }
    const picked = limitByDistance(inside, { x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
    if (!additive) gm.clearSelection();
    this.selectUnits(picked.map(s => s.u), { additive: true });
  }

  /** Duplo clique: todas as unidades próprias do mesmo tipo visíveis na tela (até o limite). */
  selectSameTypeOnScreen(unit, additive) {
    const gm = this.gm;
    const found = [];
    for (const u of gm.getUnitsOf(gm.localPlayerId)) {
      if (u.isDead || u.isDying || u.type !== unit.type) continue;
      const s = this._screenPos(u);
      if (s.x >= 0 && s.x <= window.innerWidth && s.y >= 0 && s.y <= window.innerHeight) found.push(s);
    }
    const origin = this._screenPos(unit);
    const picked = limitByDistance(found, origin);
    this.selectUnits(picked.map(s => s.u), { additive });
  }

  /** F3-05: arma o modo "Reparar" (só com trabalhadores próprios selecionados). */
  startRepairMode() {
    const workers = this.gm.selectedUnits.filter(u => !u.isDead && (u.type === 'villager' || u.type === 'peon'));
    if (workers.length === 0) return;
    this.setTargetMode({ kind: 'repair' });
    this.gm.events.emit(EVT.NOTIFY, { ownerId: this.gm.localPlayerId, text: t('input.repairHint') });
  }

  /** F4-03: liga/desliga o modo-alvo e ajusta o cursor (mira). */
  setTargetMode(mode) {
    this.targetMode = mode;
    this._updateCursor(); // F6-06: o cursor (mira ou contextual) é decidido em `_updateCursor`
  }

  /** F6-06: escolhe o cursor (e o contorno sob o mouse) a partir do estado atual. */
  _updateCursor() {
    if (!this.cursorController) return;
    const gm = this.gm;
    const e = this.hoveredEntity;
    const hover = this._overUi ? 'none' : classifyHover(e, { localId: gm.localPlayerId, isHostile: (a, b) => gm.isHostile(a, b) });
    const tm = this.targetMode;
    let castValid = true;
    if (tm && tm.kind === 'cast') {
      const ab = resolveAbility(gm, tm.abilityId);
      const units = ab ? selectionAbilityUnits(gm.selectedUnits).filter(u => u.abilities.includes(ab.id)) : [];
      if (ab && units.length > 0 && needsEntityTarget(ab)) castValid = hover !== 'none' && !targetProblem(units[0], ab, e);
    }
    const kind = cursorKindFor({
      enabled: optionsRuntime.contextCursors,
      targetMode: tm,
      castValid,
      placing: !!this.placingBuildingType,
      placeValid: this._ghostValid,
      selectedUnits: gm.selectedUnits,
      hover
    });
    this.cursorController.apply(cursorCss(kind, { enabled: optionsRuntime.contextCursors, inTargetMode: !!tm }));

    const ho = this.hoverOutline;
    if (ho) {
      const show = QualitySettings.current.hoverOutline && !this.suspended && !this._overUi && !this.placingBuildingType && !this.isDraggingBox && hover !== 'none';
      if (show) ho.show(gm.entityViews?.rootOf(e) ?? e.mesh, hover);
      else ho.hide();
    }
  }

  /** F4-03: atalho de teclado de uma habilidade do card atual (letra de `ABILITIES[id].hotkey`). */
  _tryAbilityHotkey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const units = selectionAbilityUnits(this.gm.selectedUnits);
    if (units.length === 0 || !e.code.startsWith('Key')) return false;
    const letter = e.code.slice(3);
    for (const id of units[0].abilities) {
      const ab = resolveAbility(this.gm, id);
      if (ab && ab.hotkey === letter) {
        this.beginAbility(id);
        return true;
      }
    }
    return false;
  }

  /**
   * F4-03: clique no botão/atalho de uma habilidade. `none`/`self` lançam já (todas as unidades capazes);
   * as demais entram em modo-alvo. Sem ninguém pronto para lançar: avisa o motivo e não entra no modo.
   */
  beginAbility(abilityId) {
    const gm = this.gm;
    const ab = resolveAbility(gm, abilityId);
    if (!ab) return;
    const units = selectionAbilityUnits(gm.selectedUnits).filter(u => u.abilities.includes(abilityId));
    if (units.length === 0) return;
    const local = gm.localPlayerId;
    if (!pickCaster(gm, units, ab)) {
      const why = canCast(gm, units[0], ab);
      gm.events.emit(EVT.NOTIFY, { ownerId: local, text: why.ok ? `⚠️ ${t('sim.cooldown')}` : why.reason });
      return;
    }
    if (ab.target === 'none' || ab.target === 'self') {
      gm.issue({ type: CMD.CAST, playerId: local, unitIds: units.map(u => u.id), abilityId });
      return;
    }
    this.setTargetMode({ kind: 'cast', abilityId });
    gm.events.emit(EVT.NOTIFY, { ownerId: local, text: ab.target === 'ground' ? t('input.castGround') : t('input.castTarget') });
  }

  /** F4-03: clique esquerdo em modo-alvo de habilidade. Alvo inválido: avisa e mantém o modo. */
  _handleCastClick() {
    const gm = this.gm;
    const local = gm.localPlayerId;
    const ab = resolveAbility(gm, this.targetMode.abilityId);
    const units = selectionAbilityUnits(gm.selectedUnits).filter(u => ab && u.abilities.includes(ab.id));
    if (!ab || units.length === 0) { this.setTargetMode(null); return true; }
    const cmd = { type: CMD.CAST, playerId: local, unitIds: units.map(u => u.id), abilityId: ab.id };
    let markPos = this.groundIntersection;
    if (needsEntityTarget(ab)) {
      const e = this.hoveredEntity;
      const problem = targetProblem(units[0], ab, e);
      if (problem) {
        gm.events.emit(EVT.NOTIFY, { ownerId: local, text: problem });
        return true;
      }
      cmd.targetId = e.id;
      markPos = e.mesh.position;
    } else {
      cmd.x = this.groundIntersection.x;
      cmd.z = this.groundIntersection.z;
    }
    this.playClickDecal(markPos, 0x60a5fa);
    gm.issue(cmd);
    gm.soundManager.playOrder();
    this.setTargetMode(null);
    return true;
  }

  /** F3-05/F4-03: consome o clique esquerdo em modo-alvo. Retorna true se tratou o clique. */
  _handleTargetClick() {
    if (!this.targetMode) return false;
    if (this.targetMode.kind === 'cast') return this._handleCastClick();
    if (this.targetMode.kind === 'attackMove' || this.targetMode.kind === 'patrol') return this._handleOrderClick(this._lastShift);
    return this._handleRepairClick();
  }

  /** F3-01: clique esquerdo em modo Atacar-movendo (A) ou Patrulhar (P). Shift enfileira. */
  _handleOrderClick(shift) {
    const gm = this.gm;
    const kind = this.targetMode.kind;
    const local = gm.localPlayerId;
    this.setTargetMode(null);
    gm.selectedUnits = gm.selectedUnits.filter(u => !u.isDead && !u.isDying && u.state !== 'dying');
    const unitIds = gm.selectedUnits.map(u => u.id);
    if (unitIds.length === 0) return true;
    const e = this.hoveredEntity;
    const g = this.groundIntersection;
    if (kind === 'attackMove' && e && e.id !== undefined && gm.isHostile(local, e.ownerId) && e.mesh) {
      this.playClickDecal(e.mesh.position, 0xef4444);
      gm.issue({ type: CMD.ATTACK, playerId: local, unitIds, targetId: e.id });
    } else if (kind === 'attackMove') {
      this.playClickDecal(g, 0xef4444);
      gm.issue({ type: CMD.ATTACK_MOVE, playerId: local, unitIds, x: g.x, z: g.z, ...(shift ? { queued: true } : {}) });
    } else {
      this.playClickDecal(g, 0x60a5fa);
      gm.issue({ type: CMD.PATROL, playerId: local, unitIds, x: g.x, z: g.z });
    }
    gm.soundManager.playOrder();
    return true;
  }

  /** F3-05: clique esquerdo em modo Reparar. */
  _handleRepairClick() {
    this.setTargetMode(null);
    const e = this.hoveredEntity;
    const local = this.gm.localPlayerId;
    if (!(e instanceof Building) || e.ownerId !== local) return true;
    if (!e.isConstructed || e.hp >= e.maxHp) {
      this.gm.events.emit(EVT.NOTIFY, { ownerId: local, text: t('input.noRepairNeeded') });
      return true;
    }
    const unitIds = this.gm.selectedUnits.filter(u => u.type === 'villager' || u.type === 'peon').map(u => u.id);
    if (unitIds.length === 0) return true;
    this.playClickDecal(e.mesh.position, 0xdeb841);
    this.gm.issue({ type: CMD.REPAIR, playerId: local, unitIds, buildingId: e.id });
    this.gm.soundManager.playOrder();
    return true;
  }

  onKeyUp(e) {
    this.keys[e.code] = false;
    this._consumed[e.code] = false;
  }

  onWheel(e) {
    e.preventDefault();
    if (this.suspended) return;
    const zoomDir = Math.sign(e.deltaY) * 0.12;
    this.sm.zoomCamera(zoomDir);
  }

  onMouseDown(e) {
    if (this.suspended) return;
    if (e.target && e.target.closest && e.target.closest('#ui-layer')) {
      return;
    }

    this.updateMouseCoords(e);
    this.raycastScene();

    if (e.button === 1) {
      // F3-01: botão do meio arrasta a câmera
      e.preventDefault();
      this._isMiddleDown = true;
      return;
    }
    if (e.button === 0) {
      // Left Click
      this.isLeftDown = true;
      this.leftDownPos = { x: e.clientX, y: e.clientY };

      if (this.placingBuildingType) {
        if (this.isWallType(this.placingBuildingType)) {
          this.beginWallDrag();
        } else {
          this.confirmPlacement();
        }
      }
    } else if (e.button === 2) {
      // Right Click
      this.isRightDown = true;
      if (this.targetMode) {
        this.setTargetMode(null);
      } else if (this.placingBuildingType) {
        this.cancelPlacement();
      } else {
        const targetColor = (this.hoveredEntity && this.hoveredEntity.faction === 'enemy') ? 0xef4444 : 0xdeb841;
        this.playClickDecal(this.groundIntersection, targetColor);
        this.gm.issueOrder(this.hoveredEntity, this.groundIntersection, { queued: e.shiftKey });
      }
    }
  }

  onMouseMove(e) {
    // F3-01: arrastar a câmera com o botão do meio (px → unidades de mundo, escala pelo zoom).
    if (this._isMiddleDown && !this.suspended) {
      const dx = e.clientX - this.currentMousePos.x;
      const dy = e.clientY - this.currentMousePos.y;
      const k = 0.06 * this.sm.zoomLevel;
      this.sm.panCamera(-dx * k, dy * k);
    }
    this._hasMouse = true;
    this.currentMousePos = { x: e.clientX, y: e.clientY };

    this._overUi = !!(e.target && e.target.closest && e.target.closest('#ui-layer'));
    if (this._overUi) {
      return;
    }

    // Skip redundant raycasting on tiny sub-pixel mouse jitter
    if (this.lastMoveX !== undefined && !this.isLeftDown && !this.placingBuildingType) {
      const distSq = (e.clientX - this.lastMoveX) ** 2 + (e.clientY - this.lastMoveY) ** 2;
      if (distSq < 9) return;
    }
    this.lastMoveX = e.clientX;
    this.lastMoveY = e.clientY;

    this.updateMouseCoords(e);
    this.raycastScene();

    // Selection box dragging
    if (this.isLeftDown && !this.placingBuildingType) {
      const dx = Math.abs(e.clientX - this.leftDownPos.x);
      const dy = Math.abs(e.clientY - this.leftDownPos.y);

      if (dx > 6 || dy > 6) {
        this.isDraggingBox = true;
        this.updateSelectionBoxEl();
      }
    }

    // F3-08: muralha — pré-visualização em linha A→B (ou 1 segmento seguindo o cursor).
    if (this.placingBuildingType && this.isWallType(this.placingBuildingType)) {
      this.updateWallPreview();
      return;
    }

    // Update ghost building position and validity color (Green = OK, Red = Obstructed)
    if (this.placingBuildingType && this.ghostMesh) {
      const gx = Math.round(this.groundIntersection.x * 2) / 2;
      const gz = Math.round(this.groundIntersection.z * 2) / 2;

      if (gx !== this.lastGhostGx || gz !== this.lastGhostGz) {
        this.lastGhostGx = gx;
        this.lastGhostGz = gz;

        const pp = this._placePoint(this.placingBuildingType, gx, gz);
        this.ghostMesh.position.set(pp.x, pp.y, pp.z);

        const isValid = this.gm.canPlaceBuilding(this.placingBuildingType, pp.x, pp.z);
        this._ghostValid = isValid;
        const targetMat = isValid ? ModelFactory.ghostValidMat : ModelFactory.ghostInvalidMat;
        ModelFactory.setGhostMaterial(this.ghostMesh, targetMat);
      }
    }
  }

  onMouseUp(e) {
    if (e.button === 0) {
      if (!this.isLeftDown) return;
      this.isLeftDown = false;

      // If mouseup is over UI element, do not perform 3D scene selection or raycasting
      if (e.target && e.target.closest && e.target.closest('#ui-layer')) {
        if (this.isDraggingBox) {
          this.isDraggingBox = false;
          if (this.boxEl) this.boxEl.style.display = 'none';
        }
        return;
      }

      if (this.placingBuildingType && this.isWallType(this.placingBuildingType)) {
        // Soltar o botão confirma os segmentos válidos (F3-08); soltar sem ter começado
        // (ex.: o mousedown caiu na UI) não faz nada.
        if (this.wallAnchor) this.confirmWall();
        return;
      }

      if (this.targetMode) {
        this.isDraggingBox = false;
        if (this.boxEl) this.boxEl.style.display = 'none';
        this._lastShift = e.shiftKey;
        this._handleTargetClick();
        return;
      }

      if (this.isDraggingBox) {
        this.isDraggingBox = false;
        if (this.boxEl) this.boxEl.style.display = 'none';
        this.selectInBox({
          x1: this.leftDownPos.x,
          y1: this.leftDownPos.y,
          x2: e.clientX,
          y2: e.clientY
        }, e.shiftKey);
      } else if (!this.placingBuildingType) {
        const ent = this.hoveredEntity;
        const local = this.gm.localPlayerId;
        const own = ent && ent.ownerId === local && !('isConstructed' in ent) && ent.mesh && ent.setSelected && ent.type !== undefined && this.gm.selectedResource !== ent;
        const now = performance.now();
        const dbl = own && this._lastClick.id === ent.id && now - this._lastClick.t < 350;
        this._lastClick = { t: own ? now : -Infinity, id: own ? ent.id : -1 };
        if (dbl) {
          // F3-01: duplo clique — todas as unidades do mesmo tipo na tela
          this.selectSameTypeOnScreen(ent, e.shiftKey);
          this._lastClick = { t: -Infinity, id: -1 };
        } else if (e.shiftKey && own) {
          // F3-01: Shift+clique alterna a unidade na seleção
          const sel = this.gm.selectedUnits;
          if (sel.includes(ent)) {
            ent.setSelected(false);
            this.gm.selectedUnits = sel.filter(u => u !== ent);
          } else {
            this.selectUnits([ent], { additive: true });
          }
        } else if (this.gm.selectedUnits.length > 0 && ent && ent.faction === 'enemy') {
          // Unidades selecionadas e clique num inimigo: ataca
          this.playClickDecal(ent.mesh.position, 0xef4444);
          this.gm.issueOrder(ent, ent.mesh.position, { queued: e.shiftKey });
        } else {
          // Seleção simples
          this.gm.selectSingle(ent);
        }
      }
    } else if (e.button === 1) {
      this._isMiddleDown = false;
    } else if (e.button === 2) {
      if (!this.isRightDown) return;
      this.isRightDown = false;
    }
  }

  updateMouseCoords(e) {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  updateSelectionBoxEl() {
    if (!this.boxEl) return;
    const x1 = Math.min(this.leftDownPos.x, this.currentMousePos.x);
    const y1 = Math.min(this.leftDownPos.y, this.currentMousePos.y);
    const w = Math.abs(this.currentMousePos.x - this.leftDownPos.x);
    const h = Math.abs(this.currentMousePos.y - this.leftDownPos.y);

    this.boxEl.style.display = 'block';
    this.boxEl.style.left = `${x1}px`;
    this.boxEl.style.top = `${y1}px`;
    this.boxEl.style.width = `${w}px`;
    this.boxEl.style.height = `${h}px`;
  }

  raycastScene() {
    this.raycaster.setFromCamera(this.mouse, this.sm.camera);

    // Test terrain intersection. Sem terreno sob o mouse (céu): nenhuma entidade sob o cursor.
    const hits = this.raycaster.intersectObject(this.terrainView.mesh);
    if (hits.length === 0) {
      this.hoveredEntity = null;
      return;
    }
    this.groundIntersection.copy(hits[0].point);

    // F1-06: só as entidades perto do ponto do chão (unitGrid/blockerGrid), em vez de montar a
    // lista de todas as meshes do jogo. Raio maior em construções/árvores/depósitos (12) para
    // acertar o clique em alvos altos (torre) quando o ponto do chão fica longe do topo do modelo.
    // F1-05 (preservado): unidade/construção hostil sob a névoa não é alvo de clique.
    const gx = this.groundIntersection.x;
    const gz = this.groundIntersection.z;
    const localId = this.gm.localPlayerId;
    this.gm.unitGrid.queryRadius(gx, gz, 6, null, this._pickUnitBuf);
    this.gm.blockerGrid.queryRadius(gx, gz, 12, null, this._pickBlockerBuf);

    const allMeshes = this._pickMeshBuf;
    allMeshes.length = 0;
    for (let i = 0; i < this._pickUnitBuf.length; i++) {
      const u = this._pickUnitBuf[i];
      const m = this.gm.entityViews?.rootOf(u); // malha na view (F2-08c)
      if (!m?.parent) continue;
      if (this.gm.isHostile(localId, u.ownerId) && !m.visible) continue;
      allMeshes.push(m);
    }
    for (let i = 0; i < this._pickBlockerBuf.length; i++) {
      const e = this._pickBlockerBuf[i];
      const m = this.gm.entityViews?.rootOf(e) ?? e.mesh; // árvores/minas: malha na view (F2-08b)
      if (!m?.parent) continue;
      if (e instanceof Building && !m.visible) continue;
      allMeshes.push(m);
    }

    // F3-10: critters (≤ 40, fora das grades espaciais) também são clicáveis (alvo de ordem).
    const critters = this.gm.critters;
    for (let i = 0; i < critters.length; i++) {
      const m = this.gm.entityViews?.rootOf(critters[i]);
      if (m?.parent && m.visible) allMeshes.push(m);
    }

    const entityHits = this.raycaster.intersectObjects(allMeshes, true);
    if (entityHits.length > 0) {
      let cur = entityHits[0].object;
      while (cur && !cur.userData?.entity && cur.parent) {
        cur = cur.parent;
      }
      this.hoveredEntity = cur?.userData?.entity || null;
    } else {
      this.hoveredEntity = null;
    }
  }

  // --- GHOST BUILDING PLACEMENT ---

  isWallType(type) {
    return getBuildingDef(type).role === 'wall';
  }

  /** Ponto do chão sob o cursor, encaixado na grade de 0,5. */
  _snappedGround() {
    return {
      x: Math.round(this.groundIntersection.x * 2) / 2,
      z: Math.round(this.groundIntersection.z * 2) / 2
    };
  }

  /**
   * F3-08: pontos dos segmentos ao longo de A→B — snap a 8 direções, passo `WALL_STEP`,
   * no máximo `WALL_MAX_POINTS`. Clique simples (B ≈ A) = 1 ponto.
   */
  computeWallPoints(a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < WALL_STEP * 0.5) return [{ x: a.x, z: a.z }];
    const ang = Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const ux = Math.cos(ang);
    const uz = Math.sin(ang);
    const proj = Math.max(0, dx * ux + dz * uz);
    const n = Math.min(WALL_MAX_POINTS, Math.floor(proj / WALL_STEP + 0.0001) + 1);
    const pts = [];
    for (let i = 0; i < n; i++) {
      pts.push({
        x: Math.round((a.x + ux * WALL_STEP * i) * 100) / 100,
        z: Math.round((a.z + uz * WALL_STEP * i) * 100) / 100
      });
    }
    return pts;
  }

  beginWallDrag() {
    this.wallAnchor = this._snappedGround();
    this._wallLastKey = null;
    this.updateWallPreview();
  }

  updateWallPreview() {
    if (!this.placingBuildingType || !this.groundIntersection) return;
    const c = this._snappedGround();
    const key = `${c.x},${c.z},${this.wallAnchor ? 'a' : 'n'}`;
    if (key === this._wallLastKey) return;
    this._wallLastKey = key;

    const type = this.placingBuildingType;
    const pts = this.wallAnchor ? this.computeWallPoints(this.wallAnchor, c) : [c];
    const owner = this.gm.localPlayerId;
    const preview = [];
    let validCount = 0;
    for (let i = 0; i < pts.length; i++) {
      const ok = this.gm.canPlaceBuilding(type, pts[i].x, pts[i].z, null, owner);
      if (ok) validCount++;
      preview.push({ x: pts[i].x, z: pts[i].z, valid: ok });
    }
    this._wallPreview = preview;

    while (this.wallGhosts.length < preview.length) {
      const g = ModelFactory.createGhost(type, ModelFactory.ghostValidMat);
      this.sm.scene.add(g);
      this.wallGhosts.push(g);
    }
    for (let i = 0; i < this.wallGhosts.length; i++) {
      const g = this.wallGhosts[i];
      if (i >= preview.length) {
        g.visible = false;
        continue;
      }
      const p = preview[i];
      g.visible = true;
      g.position.set(p.x, this.terrain.getHeight(p.x, p.z), p.z);
      ModelFactory.setGhostMaterial(g, p.valid ? ModelFactory.ghostValidMat : ModelFactory.ghostInvalidMat);
    }

    // Total do arrasto (só os segmentos válidos), no rótulo que segue o cursor.
    if (!this._wallLabel) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;z-index:60;pointer-events:none;padding:2px 8px;border-radius:6px;' +
        'background:rgba(15,23,42,.85);color:#e2e8f0;font:600 12px sans-serif;white-space:nowrap;display:none;';
      document.body.appendChild(el);
      this._wallLabel = el;
    }
    const unit = getCost(type);
    const parts = [];
    if (unit.wood) parts.push(`${unit.wood * validCount} ${resourceName('wood').toLowerCase()}`);
    if (unit.stone) parts.push(`${unit.stone * validCount} ${resourceName('stone').toLowerCase()}`);
    if (unit.gold) parts.push(`${unit.gold * validCount} ${resourceName('gold').toLowerCase()}`);
    this._wallLabel.textContent = `${t('input.wallSegments', { count: validCount })} — ${parts.join(', ')}`;
    this._wallLabel.style.display = 'block';
    this._wallLabel.style.left = `${this.currentMousePos.x + 16}px`;
    this._wallLabel.style.top = `${this.currentMousePos.y + 16}px`;
  }

  /** F3-08: solta o botão — emite PLACE_WALL com os segmentos válidos do arrasto. */
  confirmWall() {
    const type = this.placingBuildingType;
    this._wallLastKey = null;
    this.updateWallPreview(); // garante o traço no ponto final do mouseup
    const points = this._wallPreview.filter(p => p.valid).map(p => ({ x: p.x, z: p.z }));
    if (points.length === 0) {
      this.uiManager?.showNotification(`⚠️ ${t('sim.wallNoPoints')}`);
      this.wallAnchor = null;
      this._wallLastKey = null;
      this.updateWallPreview();
      return;
    }
    const unit = getCost(type);
    const total = {};
    for (const k of Object.keys(unit)) total[k] = unit[k] * points.length;
    if (!this.gm.canAfford(total)) {
      this.uiManager?.showNotification(`⚠️ ${t('sim.noResources')}`);
      this.wallAnchor = null;
      this._wallLastKey = null;
      this.updateWallPreview();
      return;
    }
    const builderIds = this.gm.selectedUnits
      .filter(u => u.type === 'villager' || u.type === 'peon')
      .map(u => u.id);
    this.gm.issue({
      type: CMD.PLACE_WALL,
      playerId: this.gm.localPlayerId,
      buildingType: type,
      points,
      unitIds: builderIds
    });
    this.cancelPlacement();
  }

  /**
   * F4-07a: ponto de colocação da construção sob o cursor — a plataforma encaixa no poço livre mais próximo (≤ 4 u) e fica no
   * nível da água; as demais usam o ponto dado, na altura do terreno.
   */
  _placePoint(type, gx, gz) {
    if (getBuildingDef(type).role === 'platform') {
      const dep = this.gm.findFreeOilDeposit(gx, gz, 4);
      return { x: dep ? dep.mesh.position.x : gx, y: WATER_LEVEL, z: dep ? dep.mesh.position.z : gz };
    }
    return { x: gx, y: this.terrain.getHeight(gx, gz), z: gz };
  }

  startPlacement(buildingType) {
    this.cancelPlacement();
    this.placingBuildingType = buildingType;
    this._ghostValid = true;

    if (this.isWallType(buildingType)) {
      this.wallAnchor = null;
      this._wallLastKey = null;
      if (this.groundIntersection && (this.groundIntersection.x !== 0 || this.groundIntersection.z !== 0)) {
        this.updateWallPreview();
      }
      return;
    }

    this.ghostMesh = ModelFactory.getGhost(buildingType);
    this.sm.scene.add(this.ghostMesh);

    if (this.groundIntersection && (this.groundIntersection.x !== 0 || this.groundIntersection.z !== 0)) {
      const gx = Math.round(this.groundIntersection.x * 2) / 2;
      const gz = Math.round(this.groundIntersection.z * 2) / 2;
      const pp = this._placePoint(buildingType, gx, gz);
      this.ghostMesh.position.set(pp.x, pp.y, pp.z);
      this.lastGhostGx = gx;
      this.lastGhostGz = gz;

      const isValid = this.gm.canPlaceBuilding(buildingType, pp.x, pp.z);
      this._ghostValid = isValid;
      const targetMat = isValid ? ModelFactory.ghostValidMat : ModelFactory.ghostInvalidMat;
      ModelFactory.setGhostMaterial(this.ghostMesh, targetMat);
    } else {
      ModelFactory.setGhostMaterial(this.ghostMesh, ModelFactory.ghostValidMat);
      this.ghostMesh.position.set(0, -100, 0);
      this.lastGhostGx = null;
      this.lastGhostGz = null;
    }
  }

  /**
   * F2-02: emite PLACE_BUILDING em vez de construir direto — a dedução de recursos e a
   * criação da construção acontecem no `CommandExecutor`/`GameManager.placeBuilding`, no
   * tick de execução. Os checks abaixo (custo/obstrução) são só feedback imediato de UI;
   * o executor valida o custo de novo (autoritativo) antes de gastar.
   */
  confirmPlacement() {
    if (!this.placingBuildingType) return;
    const stats = this.getCost(this.placingBuildingType);
    if (!this.gm.canAfford(stats.cost)) {
      this.uiManager?.showNotification(`⚠️ ${t('sim.noResources')}`);
      return;
    }

    let gx = this.groundIntersection.x;
    let gz = this.groundIntersection.z;
    const isPlatform = getBuildingDef(this.placingBuildingType).role === 'platform';
    if (isPlatform) { // F4-07a: a plataforma encaixa no poço de petróleo livre mais próximo do cursor
      const pp = this._placePoint(this.placingBuildingType, gx, gz);
      gx = pp.x;
      gz = pp.z;
    }

    // Strict clearance check: dry terrain, distance to other buildings, trees, deposits, and fords
    if (!this.gm.canPlaceBuilding(this.placingBuildingType, gx, gz)) {
      this.uiManager?.showNotification(`❌ ${t('input.blocked')}`);
      return;
    }

    const builderIds = this.gm.selectedUnits
      .filter(u => isPlatform ? u.isTanker : (u.type === 'villager' || u.type === 'peon'))
      .map(u => u.id);

    this.gm.issue({
      type: CMD.PLACE_BUILDING,
      playerId: this.gm.localPlayerId,
      buildingType: this.placingBuildingType,
      x: gx,
      z: gz,
      unitIds: builderIds
    });
    this.cancelPlacement();
  }

  cancelPlacement() {
    if (this.ghostMesh) {
      this.sm.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }
    this.lastGhostGx = null;
    this.lastGhostGz = null;
    this.placingBuildingType = null;
    // F3-08: limpa o traço de muralha (fantasmas em pool, âncora e rótulo).
    this.wallAnchor = null;
    this._wallPreview = [];
    this._wallLastKey = null;
    if (this.wallGhosts.length > 0) {
      for (const g of this.wallGhosts) this.sm.scene.remove(g);
      this.wallGhosts = [];
    }
    if (this._wallLabel) this._wallLabel.style.display = 'none';
  }

  getCost(type) {
    return { cost: getCost(type) };
  }

  update(delta) {
    // Camera Panning via WASD / Arrow Keys
    const panSpeed = 40 * delta * this.sm.zoomLevel * optionsRuntime.panSpeed;
    let moveForward = 0;
    let moveRight = 0;

    const k = (code) => this.keys[code] && !this._consumed[code];
    if (k('KeyW') || this.keys['ArrowUp']) moveForward += panSpeed;
    if (k('KeyS') || this.keys['ArrowDown']) moveForward -= panSpeed;
    if (k('KeyA') || this.keys['ArrowLeft']) moveRight -= panSpeed;
    if (k('KeyD') || this.keys['ArrowRight']) moveRight += panSpeed;

    // F3-01: pan pela borda da janela (≤ 8 px), mesma velocidade do WASD.
    if (optionsRuntime.edgePan && this._hasMouse && !this.suspended && !this._isMiddleDown && document.hasFocus()) {
      const { x, y } = this.currentMousePos;
      if (x <= EDGE_PX) moveRight -= panSpeed;
      else if (x >= window.innerWidth - EDGE_PX) moveRight += panSpeed;
      if (y <= EDGE_PX) moveForward += panSpeed;
      else if (y >= window.innerHeight - EDGE_PX) moveForward -= panSpeed;
    }

    if (moveForward !== 0 || moveRight !== 0) {
      this.sm.panCamera(moveRight, moveForward);
    }

    this._updateCursor();

    // Update click decal animation
    if (this.decalLife > 0) {
      this.decalLife -= delta;
      this.clickDecal.scale.addScalar(delta * 2.5);
      this.clickDecal.material.opacity = Math.max(0, this.decalLife / 0.35);
    }
  }

  /** F2-04: remove listeners, fantasma de construção e o anel de clique (fim da sessão). */
  dispose() {
    this._abort.abort();
    for (const off of this._offAlerts || []) if (typeof off === 'function') off();
    this._offAlerts = [];
    this.cancelPlacement();
    if (this.boxEl) this.boxEl.style.display = 'none';
    if (this.clickDecal) {
      this.clickDecal.removeFromParent();
      this.clickDecal.geometry.dispose();
      this.clickDecal.material.dispose();
      this.clickDecal = null;
    }
    if (this._wallLabel) {
      this._wallLabel.remove();
      this._wallLabel = null;
    }
    this.keys = {};
    this.hoveredEntity = null;
    if (this.hoverOutline) { this.hoverOutline.dispose(); this.hoverOutline = null; }
    if (this.cursorController) { this.cursorController.dispose(); this.cursorController = null; }
    this.onPauseRequest = null;
    this.uiManager = null;
  }
}
