#!/usr/bin/env node
// Consolida relatórios em lotes do soak (tools/soak-report/b*/soak-report.json) em soak-report.md.
// Uso: node tools/lib/soakConsolidate.mjs [dir=tools/soak-report]
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || 'tools/soak-report';
const batches = fs.readdirSync(dir)
  .filter((d) => fs.existsSync(path.join(dir, d, 'soak-report.json')))
  .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
const results = [];
const rechecks = [];
let wall = 0;
for (const b of batches) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, b, 'soak-report.json'), 'utf8'));
  results.push(...j.results);
  rechecks.push(...j.rechecks);
  wall += j.wallMs;
}
const ended = results.filter((r) => r.finished);
const maxT = Math.max(...ended.map((r) => r.ticks));
const avg = Math.round(ended.reduce((s, r) => s + r.ticks, 0) / ended.length);
const fails = results.filter((r) => r.issues.length);
const grp = (k) => {
  const g = {};
  for (const r of results) {
    const x = (g[r[k]] ||= { n: 0, e: 0, t: 0, f: 0, m: 0 });
    x.n++;
    if (r.finished) { x.e++; x.t += r.ticks; x.m = Math.max(x.m, r.ticks); }
    if (r.issues.length) x.f++;
  }
  return ['| chave | partidas | terminaram | ticks médios | ticks máx | com falha |', '|---|---|---|---|---|---|',
    ...Object.entries(g).map(([k2, v]) => `| ${k2} | ${v.n} | ${v.e} (${Math.round((100 * v.e) / v.n)}%) | ${v.e ? Math.round(v.t / v.e) : '—'} | ${v.m || '—'} | ${v.f} |`)].join('\n');
};
const cmd = (r) => `node tools/soak.mjs --count 1 --recheck 0 --seed-start ${r.seed} --maps ${r.map} --faction ${r.faction} --difficulty ${r.difficulty} --out /tmp/soak-repro`;
const long = ended.filter((r) => r.ticks > 40000);
const bad = rechecks.filter((x) => x.diff);
const out = ['# Soak test IA×IA (F10-02) — 100 partidas consolidadas', '',
  `- Partidas: ${results.length} (seeds ${Math.min(...results.map((r) => r.seed))}..${Math.max(...results.map((r) => r.seed))}, ${batches.length} lotes) · terminaram: ${ended.length} (${Math.round((100 * ended.length) / results.length)}%) · com falha: ${fails.length}`,
  `- Ticks até o fim (terminadas): média ${avg}, máx ${maxT} · partidas >40000 ticks: ${long.length} · determinismo: ${rechecks.length} re-checadas, ${bad.length} divergentes · tempo real ${(wall / 1000).toFixed(0)} s`, '',
  '## Por mapa', grp('map'), '', '## Por facção do slot 0', grp('faction'), '', '## Por dificuldade', grp('difficulty'), '',
  '## Falhas (reproduzir com o comando)', '',
  ...(fails.length || bad.length ? [] : ['_nenhuma_']),
  ...fails.flatMap((r) => r.issues.map((i) => `- **${i.type}** seed ${r.seed} (${r.map}/${r.faction}/${r.difficulty}) tick ${i.tick}: ${i.detail}\n  - \`${cmd(r)}\``)),
  ...bad.map((x) => `- **determinism** seed ${x.seed} (${x.map}): ${x.diff}\n  - \`${cmd(x)}\``), '',
  '## Partidas longas (>40000 ticks, terminadas)', '',
  ...(long.length ? long.map((r) => `- seed ${r.seed} (${r.map}/${r.faction}/${r.difficulty}): ${r.ticks} ticks${r.issues.length ? ' (com falha)' : ''}`) : ['_nenhuma_']), ''];
fs.writeFileSync(path.join(dir, 'soak-report.md'), out.join('\n'));
console.log(out.slice(0, 3).join('\n'));
