import * as THREE from 'three';
import { ModelFactory } from '../entities/ModelFactory.js';
import { Building } from '../entities/Building.js';
import { getCost } from '../data/index.js';
import { CMD } from '../sim/commands.js';
import { ControlGroups, limitByBoxCenter, SELECTION_LIMIT } from './ControlGroups.js';
import { resolveKey, findCardButton } from './Hotkeys.js';

export { SELECTION_LIMIT };

const EDGE_PAN_PX = 8;
const DOUBLE_CLICK_MS = 350;
const TARGET_COMMANDS = { attackMove: CMD.ATTACK_MOVE, patrol: CMD.PATROL };

export class InputManager {
  constructor(sceneManager, gameManager, terrain) {
    this.sm = sceneManager;
    this.gm = gameManager;
    this.terrain = terrain;

    // Raycaster & Mouse
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.groundIntersection = new THREE.Vector3();
    this.hoveredEntity = null;

    // Keyboard state
    this.keys = {};
    // F3-01: teclas cujo keydown virou comando/atalho do card — não movem a câmera (WASD) até soltar.
    this._consumed = new Set();
    this.controlGroups = new ControlGroups();
    this.targetMode = null; // 'attackMove' | 'patrol' aguardando clique esquerdo
    this._idleIndex = 0;
    this._lastClick = { time: -Infinity, unitType: null };
    this._isMiddleDown = false;
    this._mouseInWindow = false;

    // F2-04: com `suspended` (menu de pausa aberto) só a câmera responde (WASD/setas);
    // cliques e atalhos são ignorados. `onPauseRequest` é chamado no Esc sem nada a cancelar.
    this.suspended = false;
    this.onPauseRequest = null;

    // Listeners de window/DOM removidos em dispose() (sessão de partida descartável).
    this._abort = new AbortController();
    const opts = { signal: this._abort.signal };
    window.addEventListener('keydown', e => this.onKeyDown(e), opts);
    window.addEventListener('keyup', e => this.onKeyUp(e), opts);
    window.addEventListener('blur', () => { this.keys = {}; this._consumed.clear(); this._mouseInWindow = false; }, opts);
    document.addEventListener('mouseleave', () => { this._mouseInWindow = false; }, opts);

    // Mouse drag / selection box
    this.isLeftDown = false;
    this.isRightDown = false;
    this.leftDownPos = { x: 0, y: 0 };
    this.currentMousePos = { x: 0, y: 0 };
    this.isDraggingBox = false;

    // Ghost building placement
    this.placingBuildingType = null;
    this.ghostMesh = null;

    // Click feedback ring on ground
    this.createClickDecal();

    // DOM events
    const dom = this.sm.renderer.domElement;
    dom.addEventListener('mousedown', e => this.onMouseDown(e), opts);
    window.addEventListener('mousemove', e => this.onMouseMove(e), opts);
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

  onKeyDown(e) {
    this.keys[e.code] = true;
    if (this.suspended) return;

    if (e.code === 'Escape') {
      // Esc: cancela modo alvo / colocação; senão limpa a seleção; senão abre o menu de pausa (F2-04).
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

    const t = e.target;
    const typing = !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
    const action = resolveKey(
      { code: e.code, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey },
      {
        typing,
        targetMode: this.targetMode,
        hasUnits: this.gm.selectedUnits.length > 0,
        hasBuilding: !!this.gm.selectedBuilding
      }
    );

    if (action && this.runKeyAction(action, e)) {
      this._consumed.add(e.code);
      return;
    }

    if (e.ctrlKey || e.metaKey || typing) return;
    if (e.code === 'KeyQ') {
      this.sm.rotateCamera(Math.PI / 8);
    } else if (e.code === 'KeyE') {
      this.sm.rotateCamera(-Math.PI / 8);
    }
  }

  /** Executa uma ação resolvida por `resolveKey`. Devolve true se a tecla foi consumida. */
  runKeyAction(action, e) {
    switch (action.type) {
      case 'group-set':
      case 'group-add': {
        e.preventDefault();
        const ids = this.gm.selectedUnits.map(u => u.id);
        if (ids.length === 0) return true;
        if (action.type === 'group-set') this.controlGroups.set(action.digit, ids);
        else this.controlGroups.add(action.digit, ids);
        return true;
      }
      case 'group-select': {
        if (e.repeat) return true;
        const units = this.controlGroups.select(action.digit, id => this.gm.getEntity(id));
        if (units.length === 0) return true;
        const isDouble = this.controlGroups.tap(action.digit, performance.now());
        this.setSelection(units);
        if (isDouble) this.centerOn(units);
        return true;
      }
      case 'unit-command':
        if (action.command === 'stop') this.issueUnitCommand(CMD.STOP);
        else if (action.command === 'hold') this.issueUnitCommand(CMD.HOLD);
        else this.setTargetMode(action.command);
        return true;
      case 'card': {
        const btn = findCardButton([this.uiManager?.selectionActions, this.uiManager?.bldTrainButtons], action.letter);
        if (!btn) return false;
        btn.click();
        return true;
      }
      case 'idle-worker':
        this.selectNextIdleWorker();
        return true;
      case 'last-alert':
        e.preventDefault();
        this.centerOnLastAlert();
        return true;
      case 'go-hq': {
        e.preventDefault();
        const hq = this.findHQ();
        if (hq) {
          this.sm.cameraTarget.copy(hq.mesh.position);
          this.gm.selectSingle(hq);
        }
        return true;
      }
      default:
        return false;
    }
  }

  // --- F3-01: seleção / câmera / ordens ---

  findHQ() {
    const id = this.gm.localPlayerId;
    return this.gm.buildings.find(b => b.ownerId === id && !b.isDead && (b.type === 'castle' || b.type === 'great_hall'));
  }

  /** Substitui a seleção por `units` (só estado de seleção local, não é comando). */
  setSelection(units) {
    this.gm.clearSelection();
    for (const u of units) {
      u.setSelected(true);
      this.gm.selectedUnits.push(u);
    }
    if (units.length > 0) this.gm.soundManager?.playSelect();
  }

  centerOn(units) {
    if (units.length === 0) return;
    let x = 0;
    let z = 0;
    for (const u of units) {
      x += u.mesh.position.x;
      z += u.mesh.position.z;
    }
    x /= units.length;
    z /= units.length;
    this.sm.cameraTarget.set(x, this.terrain.getHeight(x, z), z);
  }

  selectNextIdleWorker() {
    const workers = this.gm.getUnitsOf(this.gm.localPlayerId).filter(
      u => (u.type === 'villager' || u.type === 'peon') && u.state === 'idle' && !u.isDead && !u.isDying
    );
    if (workers.length === 0) {
      this.uiManager?.showNotification('Nenhum trabalhador ocioso.', 1500);
      return;
    }
    this._idleIndex = this._idleIndex % workers.length;
    const w = workers[this._idleIndex];
    this._idleIndex++;
    this.setSelection([w]);
    this.centerOn([w]);
  }

  centerOnLastAlert() {
    const id = this.gm.localPlayerId;
    let best = null;
    for (const b of this.gm.buildings) {
      if (b.ownerId === id && !b.isDead && b.underAttackTimer > 0 && (!best || b.underAttackTimer > best.underAttackTimer)) best = b;
    }
    const target = best || this.findHQ();
    if (target) {
      const p = target.mesh.position;
      this.sm.cameraTarget.set(p.x, this.terrain.getHeight(p.x, p.z), p.z);
    }
  }

  setTargetMode(mode) {
    this.targetMode = mode;
    this.sm.renderer.domElement.style.cursor = mode ? 'crosshair' : '';
  }

  /** Emite um comando de unidades (STOP/HOLD/ATTACK_MOVE/PATROL) para a seleção viva. */
  issueUnitCommand(type, extra = {}, queued = false) {
    const unitIds = this.gm.selectedUnits.filter(u => !u.isDead && !u.isDying).map(u => u.id);
    if (unitIds.length === 0) return;
    const cmd = { type, playerId: this.gm.localPlayerId, unitIds, ...extra };
    if (queued && (type === CMD.ATTACK_MOVE || type === CMD.PATROL)) cmd.queued = true;
    this.gm.issue(cmd);
    this.gm.soundManager?.playOrder();
  }

  /** Unidades próprias com posição em tela dentro de `rect` (coordenadas de janela). */
  unitsInRect(rect) {
    const minX = Math.min(rect.x1, rect.x2);
    const maxX = Math.max(rect.x1, rect.x2);
    const minY = Math.min(rect.y1, rect.y2);
    const maxY = Math.max(rect.y1, rect.y2);
    const out = [];
    const p = new THREE.Vector3();
    for (const u of this.gm.getUnitsOf(this.gm.localPlayerId)) {
      if (u.isDead || u.isDying || !u.mesh) continue;
      p.copy(u.mesh.position).project(this.sm.camera);
      if (p.z > 1) continue; // atrás da câmera
      const sx = ((p.x + 1) * window.innerWidth) / 2;
      const sy = ((-p.y + 1) * window.innerHeight) / 2;
      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) out.push({ unit: u, sx, sy });
    }
    return out;
  }

  selectBox(rect, additive) {
    const picked = limitByBoxCenter(this.unitsInRect(rect), rect, SELECTION_LIMIT).map(o => o.unit);
    if (additive) {
      const merged = [...this.gm.selectedUnits];
      for (const u of picked) if (!merged.includes(u)) merged.push(u);
      this.setSelection(merged.slice(0, SELECTION_LIMIT));
    } else {
      this.setSelection(picked);
    }
  }

  toggleUnit(unit) {
    const cur = this.gm.selectedUnits;
    const next = cur.includes(unit) ? cur.filter(u => u !== unit) : [...cur, unit].slice(0, SELECTION_LIMIT);
    this.setSelection(next);
  }

  /** Clique simples: seleção única, Shift alterna unidade, duplo clique pega o tipo na tela. */
  handleClickSelect(e) {
    const ent = this.hoveredEntity;
    const isOwnUnit = !!ent && ent.ownerId === this.gm.localPlayerId && this.gm.getUnitsOf(this.gm.localPlayerId).includes(ent);
    if (e.shiftKey && isOwnUnit) {
      if (this.gm.selectedBuilding || this.gm.selectedResource) this.gm.clearSelection();
      this.toggleUnit(ent);
      return;
    }
    const now = performance.now();
    if (isOwnUnit && this._lastClick.unitType === ent.type && now - this._lastClick.time < DOUBLE_CLICK_MS) {
      const screen = { x1: 0, y1: 0, x2: window.innerWidth, y2: window.innerHeight };
      const cx = screen.x2 / 2;
      const cy = screen.y2 / 2;
      const sameType = this.unitsInRect(screen).filter(o => o.unit.type === ent.type);
      this.setSelection(limitByBoxCenter(sameType, { x1: cx, y1: cy, x2: cx, y2: cy }, SELECTION_LIMIT).map(o => o.unit));
      this._lastClick = { time: -Infinity, unitType: null };
      return;
    }
    this._lastClick = { time: now, unitType: isOwnUnit ? ent.type : null };
    this.gm.selectSingle(ent);
  }

  onKeyUp(e) {
    this.keys[e.code] = false;
    this._consumed.delete(e.code);
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
      // F3-01: modo alvo (atacar-movendo / patrulhar): o clique esquerdo emite a ordem
      if (this.targetMode) {
        const h = this.hoveredEntity;
        const hostile = h?.mesh && h.ownerId !== undefined && this.gm.isHostile(this.gm.localPlayerId, h.ownerId);
        const p = hostile ? h.mesh.position : this.groundIntersection;
        this.playClickDecal(p, 0xef4444);
        this.issueUnitCommand(TARGET_COMMANDS[this.targetMode], { x: p.x, z: p.z }, e.shiftKey);
        if (!e.shiftKey) this.setTargetMode(null);
        return;
      }
      // Left Click
      this.isLeftDown = true;
      this.leftDownPos = { x: e.clientX, y: e.clientY };

      if (this.placingBuildingType) {
        this.confirmPlacement();
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
        this.issueOrderQueued(this.hoveredEntity, this.groundIntersection, e.shiftKey);
      }
    }
  }

  /**
   * F3-01: `Shift` + ordem contextual → `queued: true`. `GameManager.issueOrder` não conhece
   * `queued`, então marcamos os comandos emitidos durante a chamada (o executor só usa `queued`
   * em MOVE/ATTACK_MOVE/PATROL; nos demais é ignorado).
   */
  issueOrderQueued(entity, point, queued) {
    if (!queued) {
      this.gm.issueOrder(entity, point);
      return;
    }
    const gm = this.gm;
    const original = gm.issue;
    gm.issue = fields => original.call(gm, { ...fields, queued: true });
    try {
      gm.issueOrder(entity, point);
    } finally {
      gm.issue = original;
    }
  }

  onMouseMove(e) {
    const prev = this.currentMousePos;
    this.currentMousePos = { x: e.clientX, y: e.clientY };
    this._mouseInWindow = true;

    if (this._isMiddleDown) {
      const k = 0.05 * this.sm.zoomLevel;
      this.sm.panCamera(-(e.clientX - prev.x) * k, (e.clientY - prev.y) * k);
      return;
    }

    if (e.target && e.target.closest && e.target.closest('#ui-layer')) {
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

    // Update ghost building position and validity color (Green = OK, Red = Obstructed)
    if (this.placingBuildingType && this.ghostMesh) {
      const gx = Math.round(this.groundIntersection.x * 2) / 2;
      const gz = Math.round(this.groundIntersection.z * 2) / 2;

      if (gx !== this.lastGhostGx || gz !== this.lastGhostGz) {
        this.lastGhostGx = gx;
        this.lastGhostGz = gz;

        const h = this.terrain.getHeight(gx, gz);
        this.ghostMesh.position.set(gx, h, gz);

        const isValid = this.gm.canPlaceBuilding(this.placingBuildingType, gx, gz);
        const targetMat = isValid ? ModelFactory.ghostValidMat : ModelFactory.ghostInvalidMat;
        ModelFactory.setGhostMaterial(this.ghostMesh, targetMat);
      }
    }
  }

  onMouseUp(e) {
    if (e.button === 1) {
      this._isMiddleDown = false;
      return;
    }
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

      if (this.isDraggingBox) {
        this.isDraggingBox = false;
        if (this.boxEl) this.boxEl.style.display = 'none';
        this.selectBox({
          x1: this.leftDownPos.x,
          y1: this.leftDownPos.y,
          x2: e.clientX,
          y2: e.clientY
        }, e.shiftKey);
      } else if (!this.placingBuildingType) {
        // If military units are selected and player clicks on an enemy, issue attack command!
        if (this.gm.selectedUnits.length > 0 && this.hoveredEntity && this.hoveredEntity.faction === 'enemy') {
          this.playClickDecal(this.hoveredEntity.mesh.position, 0xef4444);
          this.gm.issueOrder(this.hoveredEntity, this.hoveredEntity.mesh.position);
        } else {
          this.handleClickSelect(e);
        }
      }
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
    const hits = this.raycaster.intersectObject(this.terrain.mesh);
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
      const m = u.mesh;
      if (!m?.parent) continue;
      if (this.gm.isHostile(localId, u.ownerId) && !m.visible) continue;
      allMeshes.push(m);
    }
    for (let i = 0; i < this._pickBlockerBuf.length; i++) {
      const e = this._pickBlockerBuf[i];
      const m = e.mesh;
      if (!m?.parent) continue;
      if (e instanceof Building && !m.visible) continue;
      allMeshes.push(m);
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

  startPlacement(buildingType) {
    this.cancelPlacement();
    this.placingBuildingType = buildingType;

    this.ghostMesh = ModelFactory.getGhost(buildingType);
    this.sm.scene.add(this.ghostMesh);

    if (this.groundIntersection && (this.groundIntersection.x !== 0 || this.groundIntersection.z !== 0)) {
      const gx = Math.round(this.groundIntersection.x * 2) / 2;
      const gz = Math.round(this.groundIntersection.z * 2) / 2;
      const h = this.terrain.getHeight(gx, gz);
      this.ghostMesh.position.set(gx, h, gz);
      this.lastGhostGx = gx;
      this.lastGhostGz = gz;

      const isValid = this.gm.canPlaceBuilding(buildingType, gx, gz);
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
      this.uiManager?.showNotification('⚠️ Recursos insuficientes!');
      return;
    }

    const gx = this.groundIntersection.x;
    const gz = this.groundIntersection.z;

    // Strict clearance check: dry terrain, distance to other buildings, trees, deposits, and fords
    if (!this.gm.canPlaceBuilding(this.placingBuildingType, gx, gz)) {
      this.uiManager?.showNotification('❌ Local obstruído! Mantenha distância de árvores e outras construções.');
      return;
    }

    const builderIds = this.gm.selectedUnits
      .filter(u => u.type === 'villager' || u.type === 'peon')
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
  }

  getCost(type) {
    return { cost: getCost(type) };
  }

  edgePanEnabled() {
    try {
      return localStorage.getItem('warpoly.edgePan') !== '0';
    } catch {
      return true;
    }
  }

  update(delta) {
    // Camera Panning via WASD / Arrow Keys
    const panSpeed = 40 * delta * this.sm.zoomLevel;
    let moveForward = 0;
    let moveRight = 0;

    const held = code => this.keys[code] && !this._consumed.has(code);
    if (held('KeyW') || this.keys['ArrowUp']) moveForward += panSpeed;
    if (held('KeyS') || this.keys['ArrowDown']) moveForward -= panSpeed;
    if (held('KeyA') || this.keys['ArrowLeft']) moveRight -= panSpeed;
    if (held('KeyD') || this.keys['ArrowRight']) moveRight += panSpeed;

    // F3-01: pan pela borda da janela (desligável: localStorage['warpoly.edgePan']='0')
    if (!this.suspended && this._mouseInWindow && !this.isDraggingBox && !this._isMiddleDown && this.edgePanEnabled()) {
      const { x, y } = this.currentMousePos;
      if (x <= EDGE_PAN_PX) moveRight -= panSpeed;
      else if (x >= window.innerWidth - EDGE_PAN_PX) moveRight += panSpeed;
      if (y <= EDGE_PAN_PX) moveForward += panSpeed;
      else if (y >= window.innerHeight - EDGE_PAN_PX) moveForward -= panSpeed;
    }

    if (moveForward !== 0 || moveRight !== 0) {
      this.sm.panCamera(moveRight, moveForward);
    }

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
    this.cancelPlacement();
    if (this.boxEl) this.boxEl.style.display = 'none';
    if (this.clickDecal) {
      this.clickDecal.removeFromParent();
      this.clickDecal.geometry.dispose();
      this.clickDecal.material.dispose();
      this.clickDecal = null;
    }
    this.keys = {};
    this._consumed.clear();
    this.controlGroups.clear();
    this.targetMode = null;
    this.hoveredEntity = null;
    this.onPauseRequest = null;
    this.uiManager = null;
  }
}
