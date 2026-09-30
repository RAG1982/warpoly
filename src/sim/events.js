/**
 * events.js — F2-07: catálogo de eventos da simulação (constantes + formato do payload).
 *
 * Payloads são sempre dados simples (ids numéricos, strings, números, `pos: {x,y,z}` copiada) —
 * nunca referências a entidades ou objetos three.js. `EventBus.emit` congela o payload.
 *
 * Além do catálogo pedido pela spec, `BUILDING_VFX` foi acrescentado (decisão da execução,
 * registrada em `_COMUM.md`: "escolha a opção mais simples que preserve o comportamento") para
 * cobrir o VFX ambiente das construções (fumaça de chaminé, faíscas de forja, serragem, boneco de
 * treino orc…) que antes chamava `particleSystem`/o método de VFX da subclasse direto em
 * `renderUpdate`/`updateCustomVFX` — não fazia parte do catálogo original porque é puramente
 * decorativo (não afeta estado/checksum), mas ainda vive em `Building.js`/subclasses e por isso
 * precisa sair como evento (ver "Pronto" da spec: nenhum arquivo de simulação toca
 * `particleSystem` direto).
 */
export const EVT = Object.freeze({
  UNIT_TRAINED: 'unit_trained',
  UNIT_DIED: 'unit_died',
  UNIT_DAMAGED: 'unit_damaged',

  BUILDING_PLACED: 'building_placed',
  BUILDING_COMPLETED: 'building_completed',
  BUILDING_DESTROYED: 'building_destroyed',
  BUILDING_DAMAGED: 'building_damaged',
  /** F3-05: obra cancelada pelo dono (NÃO é baixa em combate — não dispara BUILDING_DESTROYED). */
  BUILDING_CANCELLED: 'building_cancelled',
  /** VFX ambiente de construção (chaminé, faíscas, serragem…) — ver nota acima. */
  BUILDING_VFX: 'building_vfx',

  RESEARCH_DONE: 'research_done',
  /** F3-06: Centro (`role:'hq'`) concluiu upgrade de nível — ver `Building.simUpdate`. */
  HQ_TIER_CHANGED: 'hq_tier_changed',

  RESOURCE_GATHERED: 'resource_gathered',
  RESOURCE_DEPLETED: 'resource_depleted',
  /** F3-09: custo debitado de um jogador (treino, construção, pesquisa, upgrade de Centro). */
  RESOURCES_SPENT: 'resources_spent',

  WORKER_CHOP: 'worker_chop',
  WORKER_MINE: 'worker_mine',
  WORKER_HAMMER: 'worker_hammer',

  PROJECTILE_FIRED: 'projectile_fired',
  PROJECTILE_HIT: 'projectile_hit',
  MELEE_HIT: 'melee_hit',

  UNDER_ATTACK: 'under_attack',
  NOTIFY: 'notify',

  /** F3-10: último acampamento neutro de um cluster destruído (recompensa creditada). */
  CAMP_CLEARED: 'camp_cleared',

  PLAYER_DEFEATED: 'player_defeated',
  MATCH_WON: 'match_won',
  MATCH_LOST: 'match_lost'
});

/**
 * Formato do payload de cada evento (JSDoc; não é validado em runtime — ver `_COMUM.md`,
 * "opção mais simples").
 *
 * @typedef {{x:number,y:number,z:number}} Pos
 *
 * EVT.UNIT_TRAINED     {unitId:number, ownerId:number, pos:Pos, unitType:string}
 * EVT.UNIT_DIED        {unitId:number, ownerId:number, pos:Pos, unitType:string, killerOwnerId?:number|null}  (F3-09: null/ausente = causa desconhecida, não conta kill)
 * EVT.UNIT_DAMAGED     {unitId:number, ownerId:number, pos:Pos, amount:number}
 *
 * EVT.BUILDING_PLACED    {buildingId:number, ownerId:number, pos:Pos, buildingType:string}
 * EVT.BUILDING_COMPLETED {buildingId:number, ownerId:number, pos:Pos, buildingType:string}
 * EVT.BUILDING_DESTROYED {buildingId:number, ownerId:number, pos:Pos, buildingType:string, killerOwnerId?:number|null}
 * EVT.BUILDING_DAMAGED   {buildingId:number, ownerId:number, pos:Pos, amount:number}
 * EVT.BUILDING_CANCELLED {buildingId:number, ownerId:number, pos:Pos, buildingType:string}  (F3-05)
 * EVT.BUILDING_VFX       {buildingId:number, ownerId:number, pos:Pos, kind:string}
 *
 * EVT.RESEARCH_DONE    {ownerId:number, upgradeId:string, level:number}
 * EVT.HQ_TIER_CHANGED  {buildingId:number, ownerId:number, pos:Pos, tier:number}
 *
 * EVT.RESOURCE_GATHERED {type:string, amount:number, pos:Pos, ownerId:number}
 * EVT.RESOURCE_DEPLETED {resourceId:number, pos:Pos, resourceType:string}
 * EVT.RESOURCES_SPENT   {ownerId:number, cost:{gold:number,wood:number,stone:number}}  (F3-09)
 *
 * EVT.WORKER_CHOP    {pos:Pos, ownerId:number}
 * EVT.WORKER_MINE    {pos:Pos, ownerId:number, resource:'gold'|'stone'}
 * EVT.WORKER_HAMMER  {pos:Pos, ownerId:number}
 *
 * EVT.PROJECTILE_FIRED {kind:'arrow'|'axe'|'bolt'|'boulder', from:Pos, ownerId:number}
 * EVT.PROJECTILE_HIT   {kind:'arrow'|'axe'|'bolt'|'boulder', pos:Pos, ownerId:number, splashRadius?:number}  (F4-02: bolt/boulder = cerco, impacto em área)
 * EVT.MELEE_HIT        {pos:Pos, ownerId:number}
 *
 * EVT.UNDER_ATTACK  {ownerId:number, pos:Pos}
 * EVT.NOTIFY        {ownerId:number, text:string}
 *
 * EVT.CAMP_CLEARED   {campId:number, byOwnerId:number|null, pos:Pos, reward:{gold?:number,wood?:number,stone?:number}}  (F3-10; byOwnerId null = sem crédito)
 *
 * EVT.PLAYER_DEFEATED {ownerId:number, name:string}
 * EVT.MATCH_WON       {ownerId:number}
 * EVT.MATCH_LOST      {ownerId:number}
 */
