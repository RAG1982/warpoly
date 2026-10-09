// F7-06: capturas da animação de produção (inspetor: ataque v0/v1, idle variado, carga, morte por dano, cross-fade; jogo: partida curta,
// variantes/idle/morte por dano no jogo real).
//   bash tools/safe-run.sh --timeout 500 -- node tools/capture-anim.mjs
// ANIM_ONLY=idle,crossfade,carga,jogo-dados  -> só essas seções (padrão: todas: poses, idle, carga, crossfade, jogo, jogo-dados).
// Saídas em tools/ui-captures/anim/: PNGs + crossfade.json, carga.json, jogo-dados.json (números das checagens).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertHardwareGpu } from './lib/assertGpu.mjs';

const PORT = Number(process.env.CAPTURE_PORT || 5216);
const OUT = 'tools/ui-captures/anim';
const ONLY = (process.env.ANIM_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const want = (s) => ONLY.length === 0 || ONLY.includes(s);
const inspectorSections = ['poses', 'idle', 'carga', 'crossfade'].some(want);
mkdirSync(OUT, { recursive: true });

// Instala (por modelo) o controle manual dos quadros: o laço do inspetor passa a NÃO avançar este animador; os quadros são dados à mão com dt fixo de 1/60 s.
const installFrameControl = () => {
  const A = window.inspectorApp.animator;
  if (!A.__realUpdate) { A.__realUpdate = Object.getPrototypeOf(A).update; A.update = () => {}; }
  const objs = A._blendObjs;
  const N = objs.length * 9;
  window.__xf = {
    A,
    snap() {
      const o = new Float32Array(N);
      for (let i = 0, k = 0; i < objs.length; i++, k += 9) {
        const b = objs[i];
        o[k] = b.position.x; o[k + 1] = b.position.y; o[k + 2] = b.position.z;
        o[k + 3] = b.rotation.x; o[k + 4] = b.rotation.y; o[k + 5] = b.rotation.z;
        o[k + 6] = b.scale.x; o[k + 7] = b.scale.y; o[k + 8] = b.scale.z;
      }
      return o;
    },
    dist(a, b) { let m = 0; for (let i = 0; i < N; i++) { const d = Math.abs(a[i] - b[i]); if (d > m) m = d; } return m; },
    frame(n = 1) { for (let i = 0; i < n; i++) A.__realUpdate.call(A, 1 / 60); },
    // estado estável "no meio" do estado `from` (sem blend pendente): t = t0 + `frames`/60 s
    reset(from, t0 = 0.35, frames = 20) { A.play(); A.setCarrying(false); A.setAnimation(from, true); A._blendT = 99; A.setTime(t0); this.frame(frames); }
  };
};
const removeFrameControl = () => {
  const A = window.inspectorApp.animator;
  if (A && A.__realUpdate) { delete A.update; delete A.__realUpdate; }
};

// Sonda numérica do cross-fade: troca de estado `from` -> `to` e confere (a) a continuidade na troca (o 1º quadro não salta como um corte seco),
// (b) o salto máximo por quadro, (c) que a pose exibida é exatamente (1-w)·pose_antiga + w·pose_crua_nova com w = smoothstep(t/0,14 s) e (d) a convergência.
const crossfadeProbe = ([from, to]) => {
  const X = window.__xf;
  const A = X.A;
  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  X.reset(from);
  for (let i = 0; i < 6; i++) X.frame();
  const pre = X.snap();
  A.setAnimation(to); // captura a pose atual para o cross-fade; os quadros seguintes saem misturados
  const raw0 = X.snap(); // pose crua do início do novo estado (o que um corte seco mostraria)
  const hard = X.dist(pre, raw0);
  const P = [pre];
  for (let k = 1; k <= 14; k++) { X.frame(); P.push(X.snap()); }
  // pose crua do novo estado em cada instante k/60 (o que apareceria sem blend)
  const raw = [];
  for (let k = 0; k <= 14; k++) { A._applyPoseRaw(k / 60); raw.push(X.snap()); }
  const w = (k) => { const x = Math.min(1, (k / 60) / 0.14); return x * x * (3 - 2 * x); };
  let formulaErr = 0;
  for (let k = 1; k <= 14; k++) for (let i = 0; i < pre.length; i++) formulaErr = Math.max(formulaErr, Math.abs(P[k][i] - ((1 - w(k)) * pre[i] + w(k) * raw[k][i])));
  const steps = [];
  for (let k = 1; k <= 14; k++) steps.push({ k, t: Math.round((k / 60) * 1000) / 1000, w: r5(w(k)), passo: r5(X.dist(P[k - 1], P[k])), passoCru: r5(X.dist(raw[k - 1], raw[k])), deNovaParaAntiga: r5(X.dist(pre, P[k])) });
  const convergiu = X.dist(P[14], raw[14]);
  return { corteSeco: r5(hard), saltoQuadro1: steps[0].passo, saltoMaximo: Math.max(...steps.map((s) => s.passo)), erroFormula: formulaErr, convergiu, steps };
};

let vite;
let browser;
try {
  vite = await createServer({ server: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', clearScreen: false });
  await vite.listen();
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--js-flags=--max-old-space-size=2048', '--renderer-process-limit=1', '--disable-dev-shm-usage']
  });
  const base = `http://127.0.0.1:${PORT}`;
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const fails = [];
  const check = (ok, label, extra = '') => { if (!ok) fails.push(label); console.log(ok ? 'OK  ' : 'FALHA', label, extra); };

  if (inspectorSections) {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.goto(`${base}/inspector.html?skipPreload&texq=low`);
    await page.waitForFunction('window.inspectorApp', null, { timeout: 90000 });
    await assertHardwareGpu(page);
    const clip = { x: 340, y: 60, width: 640, height: 600 };
    const models = ['villager', 'peon', 'knight', 'grunt', 'archer', 'axethrower'];
    const select = async (id) => {
      await page.evaluate((mid) => { window.inspectorApp.selectModel(mid); }, id);
      await page.waitForTimeout(900);
    };
    const shotOf = (id) => async (name) => { await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/${id}-${name}.png`, clip }); };
    // `idle` é aplicado DEPOIS de setAnimation (que zera a variante de idle); `rotY` gira o modelo (vista de costas = Math.PI)
    const pose = (anim, t, opts = {}) => page.evaluate(([a, tt, o]) => {
      const an = window.inspectorApp.animator;
      an.pause();
      if (an.__rotY0 === undefined) an.__rotY0 = an.model.rotation.y; // vista base do inspetor; `rotY` gira a partir dela
      an.model.rotation.y = an.__rotY0 + (o.rotY || 0);
      an.setAttackVariant(o.variant || 0);
      an.setCarrying(!!o.carry);
      an.setDeathStyle(o.death || 'cut', 1);
      an.setAnimation(a, true);
      an._idleVar = o.idle || 0;
      an._blendT = 99;
      an.setTime(tt);
    }, [anim, t, opts]);
    const setCargo = (c) => page.evaluate((cc) => { window.inspectorApp.animator.setVillagerCargo(cc); }, c);

    const carga = [];
    const crossfade = [];
    const TRANSITIONS = [['idle', 'walk'], ['walk', 'idle'], ['walk', 'fight'], ['fight', 'walk'], ['fight', 'idle'], ['idle', 'fight']];
    for (const id of models) {
      await select(id);
      const shot = shotOf(id);
      if (want('poses')) {
        await pose('fight', 0.5, { variant: 0 }); await shot('ataque-v0');
        await pose('fight', 0.5, { variant: 1 }); await shot('ataque-v1');
        if (id === 'villager' || id === 'peon') {
          await setCargo('gold');
          await pose('walk', 0.2, { carry: true }); await shot('carga-ouro');
          await setCargo('wood');
          await pose('walk', 0.2, { carry: true }); await shot('carga-madeira');
          await setCargo(null);
        }
        for (const d of ['cut', 'projectile', 'crush', 'magic']) {
          await pose('die', 1.4, { death: d }); await shot(`morte-${d}`);
        }
      }
      if (want('idle')) {
        // olhar em volta: p = 0,25 do ciclo (pescoço no pico); alongar: p = 0,5 (pico do envelope); base = mesmo instante sem variante
        await pose('idle', 0.5, { idle: 0 }); await shot('idle-base-t0.5');
        await pose('idle', 0.5, { idle: 1 }); await shot('idle-olhar');
        await pose('idle', 1.0, { idle: 0 }); await shot('idle-base-t1.0');
        await pose('idle', 1.0, { idle: 2 }); await shot('idle-alongar');
      }
      if (want('carga') && (id === 'villager' || id === 'peon')) {
        const rot = Math.PI;
        await setCargo(null);
        await pose('walk', 0.2, { carry: false }); await shot('andar-sem-carga');
        await pose('walk', 0.2, { carry: false, rotY: rot }); await shot('andar-sem-carga-costas');
        await setCargo('gold');
        await pose('walk', 0.2, { carry: true, rotY: rot }); await shot('carga-ouro-costas');
        await setCargo('wood');
        await pose('walk', 0.2, { carry: true, rotY: rot }); await shot('carga-madeira-costas');
        // números: com carga o braço balança 0,45× e o tronco inclina +0,16 rad
        const num = await page.evaluate(() => {
          const an = window.inspectorApp.animator;
          const read = (carry) => { an.pause(); an.setCarrying(carry); an.setAnimation('walk', true); an._blendT = 99; an.setTime(0.2); return { armR: an.meshParts.armR.rotation.x, armL: an.meshParts.armL.rotation.x, torso: an.meshParts.torso.rotation.x, pack: an.meshParts.pack ? an.meshParts.pack.rotation.x : null, packVisible: an.meshParts.pack ? an.meshParts.pack.visible : null }; };
          return { sem: read(false), com: read(true) };
        });
        carga.push({ modelo: id, ...num, razaoBraco: num.com.armR / num.sem.armR, inclinacaoTronco: num.com.torso - num.sem.torso });
        await setCargo(null);
        await pose('idle', 0, {});
      }
      if (want('crossfade')) {
        await page.evaluate(installFrameControl);
        for (const [from, to] of TRANSITIONS) {
          const r = await page.evaluate(crossfadeProbe, [from, to]);
          // sem pop: (1) pose exibida = (1-w)·antiga + w·crua com w smoothstep (derivada 0 nas pontas: sem salto de posição nem de velocidade na troca/no fim);
          // (2) convergiu à pose crua; (3) quando o corte seco seria visível (>= 0,2 rad), o 1º quadro fica em <= 10 % dele e o pico por quadro em <= 35 %
          const visivel = r.corteSeco >= 0.2;
          const ok = r.erroFormula < 1e-5 && r.convergiu < 1e-5 && (!visivel || (r.saltoQuadro1 <= 0.1 * r.corteSeco && r.saltoMaximo <= 0.35 * r.corteSeco));
          crossfade.push({ modelo: id, de: from, para: to, corteSeco: r.corteSeco, corteVisivel: visivel, saltoQuadro1: r.saltoQuadro1, razaoQuadro1: r.corteSeco > 0 ? Math.round((r.saltoQuadro1 / r.corteSeco) * 1000) / 1000 : 0, saltoMaximo: r.saltoMaximo, razaoMaximo: r.corteSeco > 0 ? Math.round((r.saltoMaximo / r.corteSeco) * 1000) / 1000 : 0, erroFormula: r.erroFormula, convergiu: r.convergiu, ok, passos: r.steps });
        }
        if (id === 'knight' || id === 'grunt') {
          // sequência visual: golpe em andamento -> idle (o corte seco seria um salto de braço/arma)
          await page.evaluate(() => { window.__xf.reset('fight', 0.35, 9); }); // golpe a 0,5 s (meio do ataque)
          await shot('crossfade-0-antes');
          await page.evaluate(() => { window.__xf.A.setAnimation('idle'); window.__xf.frame(1); });
          await shot('crossfade-1-quadro1');
          await page.evaluate(() => { window.__xf.frame(3); });
          await shot('crossfade-2-meio');
          await page.evaluate(() => { window.__xf.frame(5); });
          await shot('crossfade-3-fim');
          await page.evaluate(() => { const X = window.__xf; X.reset('fight', 0.35, 9); X.A.pause(); X.A.setAnimation('idle'); X.A.play(); });
          await shot('crossfade-4-corte-seco');
        }
        await page.evaluate(removeFrameControl);
      }
    }
    if (want('crossfade')) {
      writeFileSync(`${OUT}/crossfade.json`, JSON.stringify({ dtQuadro: '1/60 s', blend: '0,14 s smoothstep', transicoes: crossfade }, null, 1) + '\n');
      const bad = crossfade.filter((c) => !c.ok);
      const vis = crossfade.filter((c) => c.corteVisivel);
      const maxQ1 = Math.max(...vis.map((c) => c.razaoQuadro1));
      const maxPico = Math.max(...vis.map((c) => c.razaoMaximo));
      const maxErro = Math.max(...crossfade.map((c) => c.erroFormula));
      const maxCorte = Math.max(...crossfade.map((c) => c.corteSeco));
      check(bad.length === 0, `cross-fade sem pop (${crossfade.length} transições em ${models.length} modelos; ${vis.length} com corte seco visível)`, `corte seco até ${maxCorte} rad num quadro; cross-fade: 1º quadro <= ${maxQ1} do corte, pico por quadro <= ${maxPico} do corte, erro da fórmula <= ${maxErro}; falhas: ${bad.map((b) => `${b.modelo} ${b.de}->${b.para}`).join(', ') || 'nenhuma'}`);
    }
    if (want('carga')) {
      writeFileSync(`${OUT}/carga.json`, JSON.stringify(carga, null, 1) + '\n');
      check(carga.length === 2 && carga.every((c) => Math.abs(c.razaoBraco - 0.45) < 0.02 && c.inclinacaoTronco > 0.15 && c.com.packVisible), 'carregar recurso: braços 0,45x, tronco +0,16 rad, mochila visível', JSON.stringify(carga.map((c) => [c.modelo, Math.round(c.razaoBraco * 100) / 100, Math.round(c.inclinacaoTronco * 100) / 100])));
    }
    await page.close();
  }

  // --- jogo: partida curta (combate) ---
  if (want('jogo')) {
    const game = await ctx.newPage();
    game.on('pageerror', (e) => errors.push(`jogo: ${e.message}`));
    await game.goto(`${base}/?skipPreload&texq=low&play`);
    await game.waitForFunction('window.game && window.game.gameManager', null, { timeout: 90000 });
    await assertHardwareGpu(game);
    await game.evaluate(() => {
      const gm = window.game.gameManager;
      const hq = gm.buildings.find((b) => b.ownerId === 0);
      const cx = hq.mesh.position.x + 14, cz = hq.mesh.position.z + 14;
      gm.sceneManager.cameraTarget.set(cx, 0, cz);
      const hu = gm.playerFaction === 'orc' ? ['grunt', 'axethrower'] : ['knight', 'archer'];
      const en = gm.playerFaction === 'orc' ? ['knight', 'archer'] : ['grunt', 'axethrower'];
      const mine = [], theirs = [];
      for (let i = 0; i < 8; i++) {
        mine.push(gm.spawnUnit(hu[i % 2], cx - 2, cz - 6 + i * 1.6, 0).id);
        theirs.push(gm.spawnUnit(en[i % 2], cx + 2, cz - 6 + i * 1.6, 1).id);
      }
      gm.issue({ type: 'attackMove', playerId: 0, unitIds: mine, x: cx + 3, z: cz });
      gm.issue({ type: 'attackMove', playerId: 1, unitIds: theirs, x: cx - 3, z: cz });
    });
    await game.waitForTimeout(3500);
    await game.screenshot({ path: `${OUT}/jogo-1-combate.png` });
    await game.waitForTimeout(3500);
    await game.screenshot({ path: `${OUT}/jogo-2-mortes.png` });
    await game.close();
  }

  // --- jogo real: morte por tipo de dano (estilo + quadros em 4 instantes), variantes de ataque por id e idle variado ao longo do tempo ---
  if (want('jogo-dados')) {
    const game = await ctx.newPage();
    game.on('pageerror', (e) => errors.push(`jogo-dados: ${e.message}`));
    await game.goto(`${base}/?skipPreload&texq=low&play`);
    await game.waitForFunction('window.game && window.game.gameManager && window.game.session && window.game.session.entityViews', null, { timeout: 90000 });
    await assertHardwareGpu(game);
    const dados = {};
    // 1. morte por tipo de dano: 4 vítimas iguais, 4 atacantes diferentes (cut/projectile/crush/magic) no mesmo terreno conhecido (HQ + 14);
    //    a sim fica pausada para criar as views e depois bem lenta (o cadáver, 1,6 s de sim, dura ~40 s de relógio)
    await game.evaluate(() => {
      const gm = window.game.gameManager;
      const hq = gm.buildings.find((b) => b.ownerId === 0);
      // o mapa é sorteado a cada carga: procura em anéis em volta do HQ uma área de terra firme livre de árvores, construções e jazidas
      // (centro da grade 2x2 das vítimas em (cx+1, cz+1)); sem achar, usa HQ + 14
      const posOf = (e) => (e.mesh ? e.mesh.position : e.position);
      const obstacles = [];
      for (const t of gm.trees) if (!t.isDead) obstacles.push([posOf(t).x, posOf(t).z, 8]);
      for (const b of gm.buildings) obstacles.push([posOf(b).x, posOf(b).z, 11]);
      for (const d of gm.resourceDeposits) obstacles.push([posOf(d).x, posOf(d).z, 10]);
      const spots = [[-1.5, -1.5], [3.5, -1.5], [-1.5, 3.5], [3.5, 3.5], [1, 1]];
      const clear = (x, z) => spots.every(([dx, dz]) => gm.pathfinder.isWalkableWorld(x + dx, z + dz)) && obstacles.every(([ox, oz, r]) => Math.hypot(ox - (x + 1), oz - (z + 1)) >= r);
      let cx = hq.mesh.position.x + 14, cz = hq.mesh.position.z + 14;
      search: for (let r = 12; r <= 40; r += 4) {
        for (let a = 0; a < 12; a++) {
          const x = hq.mesh.position.x + r * Math.cos((a * Math.PI) / 6), z = hq.mesh.position.z + r * Math.sin((a * Math.PI) / 6);
          if (clear(x, z)) { cx = x; cz = z; break search; }
        }
      }
      const sm = gm.sceneManager;
      sm.cameraTarget.set(cx + 1, 0, cz + 1);
      sm.zoomLevel = sm.targetZoomLevel = 0.5;
      const melee = gm.playerFaction === 'orc' ? 'grunt' : 'knight';
      window.__area = { cx, cz, melee };
      gm.isPaused = true;
      const attackers = [['cut', 'knight'], ['projectile', 'archer'], ['crush', 'catapult'], ['magic', 'mage']];
      window.__death = attackers.map(([tag, atype], i) => {
        // vítimas numa grade 2x2 com 5 u de folga (cadáveres não se sobrepõem); atacantes longe do quadro (o tipo de dano vem do objeto `attacker`)
        const vx = cx - 1.5 + (i % 2) * 5, vz = cz - 1.5 + Math.floor(i / 2) * 5;
        return { tag, atype, attacker: gm.spawnUnit(atype, cx - 6 + i * 4, cz - 12, 1), victim: gm.spawnUnit(melee, vx, vz, 0) };
      });
    });
    await game.waitForTimeout(1200);
    const death = await game.evaluate(async () => {
      const gm = window.game.gameManager;
      const views = window.game.session.entityViews;
      gm.isPaused = false;
      gm.gameSpeed = 0.04;
      for (const r of window.__death) r.victim.takeDamage(r.victim.hp + 1000, r.attacker, gm.allUnits);
      await new Promise((res) => setTimeout(res, 400));
      // a partir daqui os quadros da morte são dados à mão (t fixo) para as 4 vítimas ao mesmo tempo
      for (const r of window.__death) { const v = views.viewOf(r.victim); r.animator = v.animator; v.animator.__realUpdate = v.animator.update; v.animator.update = () => {}; }
      return window.__death.map((r) => ({ esperado: r.tag, atacante: r.atype, lastHitTag: r.victim.lastHitTag, estiloNoAnimador: r.animator.deathStyle, anim: r.animator.currentAnim, morrendo: !!r.victim.isDying }));
    });
    dados.mortes = death;
    check(death.every((d) => d.lastHitTag === d.esperado && d.estiloNoAnimador === d.esperado && d.anim === 'die' && d.morrendo), 'jogo real: o tipo de dano do atacante define o estilo de morte (cut/projectile/crush/magic)', JSON.stringify(death.map((d) => `${d.atacante}->${d.estiloNoAnimador}`)));
    for (const [i, t] of [0.35, 0.7, 1.05, 1.4].entries()) {
      await game.evaluate((tt) => { for (const r of window.__death) r.animator.setTime(tt); }, t);
      await game.waitForTimeout(250);
      await game.screenshot({ path: `${OUT}/jogo-morte-${i + 1}-t${t.toFixed(2)}s.png` });
    }
    // os cadáveres terminam normalmente (sim em velocidade normal) antes da checagem de idle
    await game.evaluate(() => { window.game.gameManager.gameSpeed = 1; });
    await game.waitForTimeout(2500);

    // 2. idle + variante de ataque: 10 unidades paradas por ~17 s com a sim em tempo real; cada uma deve ter trocado de variante de idle,
    //    e a variante de ataque (por id) deve ter os valores 0 e 1
    await game.evaluate(() => {
      const gm = window.game.gameManager;
      const { cx, cz, melee } = window.__area;
      window.__idle = [];
      for (let i = 0; i < 10; i++) window.__idle.push(gm.spawnUnit(melee, cx - 6 + (i % 5) * 3, cz + 3 + Math.floor(i / 5) * 3, 0));
    });
    dados.idle = await game.evaluate(async () => {
      const views = window.game.session.entityViews;
      const units = window.__idle;
      const seen = units.map(() => new Set());
      const changes = units.map(() => 0);
      const last = units.map(() => 0);
      const t0 = performance.now();
      while (performance.now() - t0 < 17000) {
        units.forEach((u, i) => {
          const v = views.viewOf(u);
          if (!v) return;
          const iv = v.animator._idleVar;
          seen[i].add(iv);
          if (iv !== last[i]) { changes[i]++; last[i] = iv; }
        });
        await new Promise((r) => setTimeout(r, 60));
      }
      const attackVariants = units.map((u) => views.viewOf(u).animator.attackVariant);
      return {
        unidades: units.length,
        variantesVistas: seen.map((s) => [...s].sort()),
        trocas: changes,
        todasTrocaram: seen.every((s) => s.size > 1),
        ataqueV0: attackVariants.filter((v) => v === 0).length,
        ataqueV1: attackVariants.filter((v) => v === 1).length
      };
    });
    check(dados.idle.todasTrocaram, 'jogo real: as 10 unidades paradas trocaram de variante de idle em 17 s', `variantes vistas ${JSON.stringify(dados.idle.variantesVistas)}; trocas ${JSON.stringify(dados.idle.trocas)}`);
    check(dados.idle.ataqueV0 > 0 && dados.idle.ataqueV1 > 0, 'jogo real: as duas variantes de ataque ocorrem por id (estáveis)', `v0=${dados.idle.ataqueV0} v1=${dados.idle.ataqueV1}`);
    writeFileSync(`${OUT}/jogo-dados.json`, JSON.stringify(dados, null, 1) + '\n');
    await game.close();
  }

  const real = errors.filter((e) => !/Failed to load resource/.test(e));
  console.log(real.length ? `ERROS: ${real.join(' | ')}` : 'sem erros');
  if (fails.length || real.length) process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}
