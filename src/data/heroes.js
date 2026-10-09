/**
 * heroes.js — F4-08: heróis de campanha. As definições vivem em `src/data/units.js` (marcadas `unique: true` e
 * `isHero: true`; fonte única de stats); este módulo só expõe consultas. Sem three.js/DOM (roda em Node).
 *
 * Regras (aplicadas por `GameManager.spawnUnit` e `Unit`):
 * - Unicidade: cada tipo `unique` é criado no máximo UMA vez por partida/campanha. Se o herói morre, está fora da
 *   partida: um novo `spawn` do mesmo tipo é recusado (`spawnUnit` devolve `null`; a ação de missão ignora).
 * - Não treináveis (`cost: null`): entram só pela ação `spawn` de missão (F8-04).
 * - Imunes à Transmutação; usam o modelo da unidade base (`modelOf`) em escala `scaleMul` e a cor do time.
 * - HUD: barra de vida 3D ampliada (`HERO_BAR_SCALE`) e retrato com realce dourado.
 * - Habilidades: ativas simples de `src/data/abilities.js` sem pré-requisito de pesquisa (`hero_*`).
 */
import { UNITS } from './units.js';

/** Escala da barra de vida 3D de um herói (relativa à barra comum). */
export const HERO_BAR_SCALE = 1.6;

/** Unidade base equivalente (para comparar stats): o `modelOf` do herói. */
export const HEROES = Object.freeze(
  Object.fromEntries(Object.values(UNITS).filter(u => u.unique).map(u => [u.type, Object.freeze({ type: u.type, base: u.modelOf, faction: u.faction })]))
);

export const HERO_TYPES = Object.freeze(Object.keys(HEROES));

export const isHeroType = (type) => !!(UNITS[type] && UNITS[type].isHero);
export const isUniqueType = (type) => !!(UNITS[type] && UNITS[type].unique);
