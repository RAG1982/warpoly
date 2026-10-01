#!/usr/bin/env node
/** NEW-38 — QA das magias do Mago e do Necromante. bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/spells/capture.mjs  (Vite 5231) */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, shutdown } from '../qa-common.mjs';
const OUT = path.dirname(fileURLToPath(import.meta.url));
let ctx;
try {
  ctx = await boot(5231);
  const { page, errors } = ctx;
  await page.evaluate(() => {
    const gm = window.game.gameManager;
    const id = gm.localPlayerId;
    const hq = gm.buildings.find(b => b.ownerId === id && b.role === 'hq');
    window.__base = { x: hq.mesh.position.x, z: hq.mesh.position.z + 16, id, enemy: gm.players.find(p => p.id !== id).id };
    window.__mk = (type, dx, dz, owner, hp) => {
      const b = window.__base; const u = gm.spawnUnit(type, b.x + dx, b.z + dz, owner);
      u.isCombatUnit = () => false; u.speed = 0.0001;
      if (hp) { u.hp = u.maxHp = hp; u.updateHealthBar(); }
      return u;
    };
    for (const r of ['fireball','slow','flameshield','invisibility','polymorph','blizzard','death_touch','haste','raise_dead','unholy_armor','ash_cloud','whirlwind']) gm.getPlayer(id).researchLevels.set('spell_' + r, 1);
    window.__snap = (u) => ({ hp: Math.round(u.hp * 10) / 10, mana: Math.round(u.mana * 10) / 10,
      cdv: u.cooldowns ? JSON.parse(JSON.stringify(u.cooldowns)) : {}, st: (u.statuses || []).filter(s => s.id).map(s => s.id + ':' + Math.round(s.remaining)),
      speedMul: u.mods && u.mods.speedMul, inv: u.mods && u.mods.invisible, type: u.type, dead: !!u.isDead, state: u.state });
  });
  const cases = [
    ['mage', 'fireball', 'enemy'], ['mage', 'slow', 'enemy'], ['mage', 'flameshield', 'ally'], ['mage', 'invisibility', 'ally'],
    ['mage', 'polymorph', 'enemy'], ['mage', 'blizzard', 'ground'], ['necromancer', 'death_touch', 'enemy'],
    ['necromancer', 'haste_spell', 'ally'], ['necromancer', 'raise_dead', 'self'], ['necromancer', 'unholy_armor', 'ally'],
    ['necromancer', 'ash_cloud', 'ground'], ['necromancer', 'whirlwind', 'ground']
  ];
  for (const [caster, ab, tgt] of cases) {
    if (process.env.ONLY && !process.env.ONLY.split(',').includes(ab)) continue;
    const errBefore = errors.length;
    await page.evaluate(({ caster, ab, tgt }) => {
      const gm = window.game.gameManager; const b = window.__base;
      gm.allUnits.filter(u => ['mage', 'necromancer', 'knight', 'grunt', 'sheep', 'skeleton'].includes(u.type) && Math.hypot(u.mesh.position.x - b.x, u.mesh.position.z - b.z) < 30)
        .forEach(u => { u.hp = 0; u.isDead = true; try { u.dispose(); } catch (e) {} });
      const c = window.__mk(caster, 0, 0, b.id); c.mana = 255;
      const foes = [window.__mk('knight', 8, 0, b.enemy, 400), window.__mk('knight', 9, 1.5, b.enemy, 400), window.__mk('knight', 9.5, -1.5, b.enemy, 400)];
      const ally = window.__mk('knight', -3, 2, b.id, 400);
      let tgtId = null, x, z;
      if (tgt === 'enemy') tgtId = foes[0].id;
      if (tgt === 'ally') tgtId = ally.id;
      if (tgt === 'ground') { x = foes[1].mesh.position.x; z = foes[1].mesh.position.z; }
      if (ab === 'raise_dead') { const v = window.__mk('grunt', 3, 3, b.enemy, 20); v.takeDamage(999, c, gm.allUnits); }
      gm.sceneManager.cameraTarget.set(b.x + 4, 1, b.z);
      window.__att = []; window.__stk = []; { let _h = ally.hp; Object.defineProperty(ally, 'hp', { get: () => _h, set: v => { if (v < _h && window.__stk.length < 2) window.__stk.push(new Error().stack.split('\n').slice(2, 7).join(' <- ')); _h = v; } }); } const _td = ally.takeDamage.bind(ally); ally.takeDamage = (a, att, ...r) => { window.__att.push((att ? att.type + '#' + att.id + '@' + att.ownerId : 'null') + ':' + a); return _td(a, att, ...r); };
      window.__s = { caster: c.id, foes: foes.map(f => f.id), ally: ally.id, tgtId, x, z };
    }, { caster, ab, tgt });
    await page.waitForTimeout(600);
    const mana0 = await page.evaluate(() => window.game.gameManager.getEntity(window.__s.caster).mana);
    await page.evaluate((ab) => { const s = window.__s; window.game.gameManager.issue({ type: 'cast', playerId: window.__base.id, unitIds: [s.caster], abilityId: ab, targetId: s.tgtId, x: s.x, z: s.z }); }, ab);
    const samples = [];
    for (let t = 0; t < 6; t++) {
      await page.waitForTimeout(t === 1 ? 700 : 900);
      if (t === 1) await page.screenshot({ path: path.join(OUT, `${caster}_${ab}.png`) });
      samples.push(await page.evaluate(() => {
        const gm = window.game.gameManager; const s = window.__s; const g = i => gm.getEntity(i);
        return { c: window.__snap(g(s.caster)), f: s.foes.map(i => g(i) ? window.__snap(g(i)) : null), a: g(s.ally) ? window.__snap(g(s.ally)) : null,
          extra: gm.allUnits.filter(u => !u.isDead && ['skeleton', 'sheep'].includes(u.type)).map(u => u.type + '@' + u.ownerId + (u.isDying ? 'x' : '')) };
      }));
    }
    const rec = { ab, mana0, mana: samples.map(s => s.c.mana).join('>'), cd: samples[0].c.cdv[ab], state: samples.map(s => s.c.state).join(','),
      foes: samples.map(s => s.f.map(f => f && (f.hp + (f.st.length ? '[' + f.st + ']' : '') + (f.type !== 'knight' ? '<' + f.type + '>' : '') + (f.inv ? 'inv' : '') + 'm' + f.speedMul)).join(' ')),
      ally: samples.map(s => s.a && (s.a.hp + (s.a.st.length ? '[' + s.a.st + ']' : '') + (s.a.inv ? 'inv' : ''))).join(' '), extra: samples.map(s => s.extra.join('+')).join(' | '), errs: errors.slice(errBefore), allyAttackers: await page.evaluate(() => window.__stk) };
    console.log(JSON.stringify(rec));
  }
  console.log('ERROS TOTAIS:', errors.length ? errors.join(' | ') : 'nenhum');
} catch (e) { console.error('FALHA', e); process.exitCode = 1; }
finally { if (ctx) await shutdown(ctx); }
