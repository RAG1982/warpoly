#!/usr/bin/env node
// F6-07 · checagens e capturas da tela pós-jogo. Uso:
//   bash tools/safe-run.sh --timeout 600 -- node tools/ui-captures/f6b/capture-postgame.mjs
import { OUT, SIZES, GAME_URL, startVite, withPage, waitGame } from './lib.mjs';

const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${name} ${extra}`); if (!ok) process.exitCode = 1; };
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Preenche estatísticas variadas + série de 30 pontos e força o fim da partida. */
const endMatch = (page, result) => page.evaluate((result) => {
  const gm = window.game.gameManager;
  const ms = gm.matchStats;
  const ids = [...ms.byPlayer.keys()];
  for (let t = 10; t <= 300; t += 10) {
    ids.forEach((id, i) => {
      const s = ms.byPlayer.get(id);
      s.resources.gold += 8 + i * 5; s.resources.wood += 12 - i * 3; s.unitsKilled += (t % 30 === 0 ? 1 : 0) * (i + 1);
      s.unitsTrained += t % 20 === 0 ? 1 : 0;
    });
    ms.update(t);
  }
  gm.gameTime = 305;
  const local = gm.localPlayerId;
  const victims = gm.buildings.filter((b) => (result === 'victory' ? gm.isHostile(local, b.ownerId) : b.ownerId === local));
  victims.forEach((b) => b.takeDamage(1e6, { ownerId: result === 'victory' ? local : 1 }));
  return { n: victims.length };
}, result);

const vite = await startVite();
try {
  for (const s of SIZES) {
    for (const result of s.name === '1280x720' ? ['victory', 'defeat'] : ['victory']) {
      await withPage({ width: s.w, height: s.h }, async (page, errors) => {
        await page.goto(GAME_URL, { waitUntil: 'load' });
        await waitGame(page);
        await endMatch(page, result);
        await page.waitForFunction(() => window.game.gameManager.isGameOver, null, { timeout: 30000 });
        await page.waitForSelector('#game-over-report .pg-table', { timeout: 10000 });
        await page.waitForTimeout(700);
        const tag = `[${s.name} ${result}]`;

        const info = await page.evaluate(() => {
          const gm = window.game.gameManager;
          const snap = gm.result;
          const rows = [...document.querySelectorAll('.pg-table tbody tr')];
          const card = document.querySelector('#game-over-modal .modal-card');
          const cr = card.getBoundingClientRect();
          const btn = document.getElementById('btn-play-again').getBoundingClientRect();
          return {
            players: gm.playerRegistry.players.length,
            rows: rows.length,
            first: rows.map((r) => [...r.children].map((c) => c.textContent.trim().replace(/\s+/g, ' '))),
            snap: snap.players.map((p) => ({ id: p.id, kills: p.unitsKilled, lost: p.unitsLost, trained: p.unitsTrained, gold: Math.round(p.resources.gold), score: Math.round(p.score) })),
            title: document.getElementById('game-over-title').textContent,
            msg: document.getElementById('game-over-msg').textContent,
            docOverflow: document.scrollingElement.scrollWidth - innerWidth,
            cardOverflowX: card.scrollWidth - card.clientWidth,
            cardInViewport: cr.left >= 0 && cr.right <= innerWidth && cr.top >= 0 && cr.bottom <= innerHeight,
            cardScrolls: card.scrollHeight - card.clientHeight,
            btnVisible: btn.top >= 0 && btn.bottom <= innerHeight && btn.right <= innerWidth,
            focus: document.activeElement && document.activeElement.id,
            colors: gm.playerRegistry.players.map((p) => p.color)
          };
        });
        check(`${tag} uma linha por jogador`, info.rows === info.players, `${info.rows}/${info.players}`);
        const okVals = info.snap.every((p) => {
          const row = info.first.find((r) => r[1].startsWith(`${info.snap.length ? '' : ''}`) && r[2] === String(p.score).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
          return !!row && row[3] === String(p.trained) && row[4] === String(p.kills) && row[5] === String(p.lost);
        });
        check(`${tag} valores da tabela = snapshot (pontos, treinadas, mortas, perdidas)`, okVals, JSON.stringify(info.snap));
        check(`${tag} título/mensagem PT-BR`, info.title === (result === 'victory' ? '🏆 VITÓRIA GLORIOSA 🏆' : '💀 DERROTA 💀') && /Tempo de partida: 5:05/.test(info.msg), `${info.title} | ${info.msg.replace(/\n/g, ' / ')}`);
        check(`${tag} sem overflow horizontal (página e cartão)`, info.docOverflow <= 0 && info.cardOverflowX <= 0, `doc=${info.docOverflow} card=${info.cardOverflowX}`);
        check(`${tag} cartão dentro da janela; botão Jogar novamente visível`, info.cardInViewport && info.btnVisible, `rolagem do cartão=${info.cardScrolls}`);
        check(`${tag} foco no botão Jogar novamente`, info.focus === 'btn-play-again', info.focus);

        // trocar de aba redesenha
        const before = await page.evaluate(() => document.getElementById('pg-chart').toDataURL().length + ':' + document.getElementById('pg-chart').toDataURL().slice(-80));
        await page.click('.pg-tab[data-metric="resources"]');
        await page.waitForTimeout(250);
        const after = await page.evaluate(() => document.getElementById('pg-chart').toDataURL().length + ':' + document.getElementById('pg-chart').toDataURL().slice(-80));
        check(`${tag} aba "Recursos coletados" redesenha o gráfico`, before !== after);
        // gráfico: pixels de cada cor de jogador
        for (const [i, col] of info.colors.slice(0, 2).entries()) {
          const px = await page.evaluate(({ rgb }) => {
            const c = document.getElementById('pg-chart');
            const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            let n = 0;
            for (let k = 0; k < d.length; k += 4) if (Math.abs(d[k] - rgb[0]) < 30 && Math.abs(d[k + 1] - rgb[1]) < 30 && Math.abs(d[k + 2] - rgb[2]) < 30 && d[k + 3] > 200) n++;
            return n;
          }, { rgb: hexToRgb(col) });
          check(`${tag} gráfico (Recursos coletados) tem pixels da cor do jogador ${i}`, px > 20, `px=${px}`);
        }
        await page.screenshot({ path: `${OUT}/posjogo-${result}-${s.name}.png` });

        if (s.name === '1280x720' && result === 'victory') {
          await page.evaluate(() => { window.__oldGm = window.game.gameManager; });
          await page.click('#btn-play-again');
          await page.waitForFunction(() => window.game.gameManager && window.game.gameManager !== window.__oldGm && window.game.gameManager.buildings.length > 0 && !window.game.gameManager.isGameOver, null, { timeout: 90000 });
          await page.waitForTimeout(800);
          const hidden = await page.evaluate(() => getComputedStyle(document.getElementById('game-over-modal')).display === 'none' && !document.querySelector('#game-over-report .pg-table'));
          check(`${tag} Jogar novamente inicia nova partida e esconde o relatório`, hidden);
        }
        if (s.name === '1280x720' && result === 'defeat') {
          await page.click('#btn-go-main-menu');
          await page.waitForSelector('.mm-root', { timeout: 20000 });
          const hidden = await page.evaluate(() => getComputedStyle(document.getElementById('game-over-modal')).display === 'none');
          check(`${tag} Menu principal volta ao menu`, hidden);
        }
        check(`${tag} sem erros de console`, errors.length === 0, errors.join(' | '));
      });
    }
  }
} finally {
  await vite.close();
}
