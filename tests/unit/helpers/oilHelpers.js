/** Plataforma do poço: concluída, viva e ligada ao poço nos dois sentidos. */
export function isPlatformOk(gm, well) {
  const p = well.platform;
  return !!p && p.isConstructed && !p.isDead && p.deposit === well && gm.buildings.includes(p);
}
