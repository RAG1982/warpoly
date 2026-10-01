#!/usr/bin/env node
/** NEW-38 — diagnósticos: lifesteal do Toque da Morte, expiração da Armadura Profana, dano ao aliado (fonte). Vite 5231. */
import { boot, shutdown } from '../qa-common.mjs';
let ctx;
try {
  ctx = await boot(5231);
  const { page, errors } = ctx;
  const out = await page.evaluate(async () => {
    const gm = window.game.gameManager; const id = gm.localPlayerId; const en = gm.players.find(p => p.id !== id).id;
    for (const r of ['death_touch', 'unholy_armor']) gm.getPlayer(id).researchLevels.set('spell_' + r, 1);
    const hq = gm.buildings.find(b => b.ownerId === id && b.role === 'hq');
    const bx = hq.mesh.position.x, bz = hq.mesh.position.z + 16;
    const mk = (t, dx, dz, o, hp) => { const u = gm.spawnUnit(t, bx + dx, bz + dz, o); u.isCombatUnit = () => false; u.speed = 0.0001; if (hp) { u.hp = u.maxHp = hp; } return u; };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const res = {};
    const n = mk('necromancer', 0, 0, id); n.mana = 255; n.hp = 10;
    const foe = mk('knight', 6, 0, en, 400);
    gm.issue({ type: 'cast', playerId: id, unitIds: [n.id], abilityId: 'death_touch', targetId: foe.id });
    await sleep(1500);
    res.deathTouch = { casterHp: n.hp, foeHp: foe.hp, dealt: 400 - foe.hp };
    const a = mk('knight', -3, 2, id, 400); n.mana = 255;
    gm.issue({ type: 'cast', playerId: id, unitIds: [n.id], abilityId: 'unholy_armor', targetId: a.id });
    await sleep(1200); res.armorOn = { hp: a.hp, inv: a.mods.invulnerable };
    a.takeDamage(100, null, gm.allUnits); res.armorTookDmg = a.hp;
    await sleep(6500); res.armorExpired = { hp: a.hp, inv: a.mods.invulnerable, st: a.statuses.filter(s => s.id).length };
    // fonte do dano ao aliado: observa o aliado 4 s sem magia
    const b = mk('knight', -3, -3, id, 400); const hp0 = b.hp; await sleep(4000);
    res.idleAlly = { hp0, hp: b.hp, order: b.state, enemiesNear: gm.allUnits.filter(u => u.ownerId === en && !u.isDead && Math.hypot(u.mesh.position.x - bx, u.mesh.position.z - bz) < 30).map(u => u.type) };
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('ERROS:', errors.length ? errors.join(' | ') : 'nenhum');
} catch (e) { console.error('FALHA', e); process.exitCode = 1; } finally { if (ctx) await shutdown(ctx); }
