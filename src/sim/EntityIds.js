/**
 * EntityIds.js — IDs numéricos estáveis para entidades da simulação (F2-01).
 *
 * Toda Unit, Building, Tree, ResourceDeposit e projétil recebe um `id` inteiro
 * monotônico (nunca reutilizado dentro de uma partida) e um `ownerId`
 * (id do Player dono, ou NEUTRAL_OWNER_ID para natureza/neutros).
 *
 * Base para comandos serializáveis (F2-02), determinismo/iteração por ID (F2-03),
 * replays e lockstep (F9). Sem three.js nem DOM: testável em Node.
 */

/** Dono de entidades neutras (árvores, minas, pedreiras, criaturas neutras). */
export const NEUTRAL_OWNER_ID = -1;

/**
 * F3-10: id do jogador especial "neutro hostil" (bandoleiros e acampamentos). Hostil a todos os
 * jogadores normais (`team: 99`), fora de vitória/derrota/pop/HUD/IA/estatísticas. Só existe
 * quando o mapa tem `neutrals`.
 */
export const NEUTRAL_HOSTILE_ID = 99;

/**
 * Converte o dono passado a Unit/Building em ownerId numérico. Aceita o lado legado
 * ('player' → 0, 'enemy' → 1: os ids da MatchConfig padrão) usado por chamadas antigas
 * (inspetor, bench, testes). DÍVIDA (F2-01): remover quando ninguém mais passar strings.
 */
export function legacyOwnerId(owner) {
  if (typeof owner === 'number') return owner;
  return owner === 'enemy' ? 1 : 0;
}

/** Contador monotônico. Uma instância por partida (GameManager.entityIds). */
export class EntityIdAllocator {
  constructor(start = 1) {
    this._start = start;
    this._next = start;
  }

  /** Próximo id livre (1, 2, 3, …). */
  next() {
    return this._next++;
  }

  /** Último id emitido (0 se nenhum). */
  get last() {
    return this._next - 1;
  }

  /** Reinicia a contagem (nova partida). */
  reset(start = this._start) {
    this._start = start;
    this._next = start;
  }
}

/**
 * Registro id → entidade. Mantido pelo GameManager (`gm.entitiesById`) com
 * add no spawn e remove no dispose/limpeza.
 */
export class EntityRegistry {
  constructor(allocator = new EntityIdAllocator()) {
    this.ids = allocator;
    /** @type {Map<number, object>} */
    this.byId = new Map();
  }

  /**
   * Dá `id` (se ainda não tiver) e `ownerId` à entidade e a registra.
   * @template T
   * @param {T} entity
   * @param {number} ownerId
   * @returns {T}
   */
  register(entity, ownerId = NEUTRAL_OWNER_ID) {
    if (!entity) return entity;
    if (typeof entity.id !== 'number') entity.id = this.ids.next();
    if (typeof entity.ownerId !== 'number') entity.ownerId = ownerId;
    this.byId.set(entity.id, entity);
    return entity;
  }

  /** Remove a entidade do registro (o id nunca é reaproveitado). */
  unregister(entity) {
    if (entity && typeof entity.id === 'number') this.byId.delete(entity.id);
  }

  get(id) {
    return this.byId.get(id);
  }

  has(id) {
    return this.byId.has(id);
  }

  get size() {
    return this.byId.size;
  }

  /**
   * Esvazia o registro. Por padrão o contador NÃO volta ao início: entidades
   * antigas ainda vivas (ex.: um projétil em voo durante um reset de mapa) nunca
   * colidem com ids novos. Use `{ resetIds: true }` só quando não sobrar nenhuma
   * referência antiga (ex.: partida nova num GameManager novo, replays).
   */
  clear({ resetIds = false } = {}) {
    this.byId.clear();
    if (resetIds) this.ids.reset();
  }
}
