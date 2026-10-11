/**
 * campaignVictoryArt.js — ilustração de vitória PROCEDURAL (SVG inline, sem assets externos) por facção.
 * Funções puras que devolvem strings; as animações são classes CSS (campaignVictory.css), desligadas com
 * prefers-reduced-motion. A arte final (Blender) entra por `public/ui/art/victory_<faction>.webp` sem mudar código.
 * Paleta: a do menu (ouro #d4af37, azul #2f5fb3 da Aliança, vermelho #a3281c da Horda).
 */
const PAL = {
  human: {
    skyTop: '#0f1c3d', skyMid: '#5b4a8a', skyLow: '#f2a65a', sun: '#ffe9a8', far: '#2a3358', near: '#141c33',
    flag: '#2f5fb3', flagDark: '#1d3d7a', flagTrim: '#f0c84a', glow: '255,214,110'
  },
  orc: {
    skyTop: '#1a0707', skyMid: '#6e1d12', skyLow: '#ff7a2e', sun: '#ffc27a', far: '#3a1410', near: '#160807',
    flag: '#a3281c', flagDark: '#5c140c', flagTrim: '#1b1b1b', glow: '255,120,50'
  }
};

/** Faíscas/vagalumes: posições determinísticas (sem Math.random), para HTML estável e testável. */
export function buildSparks(faction, n = 28) {
  const pal = PAL[faction] || PAL.human;
  let h = faction === 'orc' ? 7919 : 104729;
  const rnd = () => { h = (Math.imul(h, 1103515245) + 12345) & 0x7fffffff; return h / 0x7fffffff; };
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = (rnd() * 100).toFixed(1);
    const s = (2 + rnd() * 4).toFixed(1);
    const d = (6 + rnd() * 9).toFixed(1);
    const dl = (-rnd() * 12).toFixed(1);
    const dx = ((rnd() - 0.5) * 80).toFixed(0);
    out += `<i class="cv-spark" style="left:${x}%;--s:${s}px;--d:${d}s;--dl:${dl}s;--dx:${dx}px;--c:${pal.glow}"></i>`;
  }
  return out;
}

const rays = (f) => {
  let g = '';
  for (let i = 0; i < 14; i++) g += `<path d="M800 520 L755 -800 L845 -800 Z" transform="rotate(${((i * 360) / 14).toFixed(1)} 800 520)"/>`;
  return `<g class="cv-rays" fill="url(#cv-ray-${f})">${g}</g>`;
};

/** Coroa de louros em arco ao redor do emblema (centro 800,372; raio 120), do pé até o alto de cada lado. */
const laurel = () => {
  let leaves = '';
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const th = (20 + i * 15) * (Math.PI / 180); // 0 = embaixo, 180 = em cima
      const x = 800 + sgn * 120 * Math.sin(th);
      const y = 372 + 120 * Math.cos(th);
      const rot = Math.atan2(-sgn * Math.cos(th), -Math.sin(th)) * 180 / Math.PI;
      leaves += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="8" ry="20" transform="rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }
  }
  return `<g class="cv-laurel" fill="#d4af37" stroke="#7a5a14" stroke-width="1.5">${leaves}</g>`;
};

const emblemHuman = `
  <path d="M800 288 L866 308 L866 372 Q866 418 800 448 Q734 418 734 372 L734 308 Z" fill="${PAL.human.flag}" stroke="#f0c84a" stroke-width="6"/>
  <circle cx="800" cy="360" r="22" fill="#ffe9a8" stroke="#f0c84a" stroke-width="3"/>
  <path d="M800 326 L800 394 M766 360 L834 360 M776 336 L824 384 M824 336 L776 384" stroke="#f0c84a" stroke-width="4" stroke-linecap="round"/>
  <path d="M756 300 L770 276 L785 292 L800 268 L815 292 L830 276 L844 300 Z" fill="#f0c84a" stroke="#7a5a14" stroke-width="2"/>`;
const emblemOrc = `
  <path d="M800 288 L868 306 L868 376 Q868 420 800 450 Q732 420 732 376 L732 306 Z" fill="${PAL.orc.flag}" stroke="#1b1b1b" stroke-width="6"/>
  <path d="M752 330 Q770 310 790 340 Q800 352 810 340 Q830 310 848 330 Q846 372 800 404 Q754 372 752 330 Z" fill="#1b1b1b"/>
  <path d="M780 372 L790 392 L800 380 L810 392 L820 372" fill="none" stroke="#d9d2c0" stroke-width="5" stroke-linejoin="round"/>
  <path d="M742 300 L728 270 L756 292 M858 300 L872 270 L844 292" fill="#1b1b1b" stroke="#1b1b1b" stroke-width="4"/>`;

const fortressHuman = `
  <g fill="#1a2440" stroke="#0b1226" stroke-width="2">
    <rect x="80" y="650" width="460" height="260"/>
    <rect x="100" y="560" width="70" height="120"/><path d="M92 560 L135 500 L178 560 Z" fill="#2f5fb3"/>
    <rect x="300" y="590" width="80" height="100"/><path d="M290 590 L340 530 L390 590 Z" fill="#2f5fb3"/>
    <rect x="440" y="570" width="70" height="120"/><path d="M432 570 L475 510 L518 570 Z" fill="#2f5fb3"/>
    <rect x="1060" y="650" width="460" height="260"/>
    <rect x="1090" y="580" width="76" height="110"/><path d="M1082 580 L1128 520 L1174 580 Z" fill="#2f5fb3"/>
    <rect x="1250" y="560" width="84" height="130"/><path d="M1240 560 L1292 494 L1344 560 Z" fill="#2f5fb3"/>
    <rect x="1430" y="600" width="70" height="90"/><path d="M1422 600 L1465 546 L1508 600 Z" fill="#2f5fb3"/>
  </g>
  <g fill="#ffd877" class="cv-windows"><rect x="126" y="590" width="9" height="16"/><rect x="334" y="618" width="9" height="16"/><rect x="468" y="600" width="9" height="16"/><rect x="1120" y="610" width="9" height="16"/><rect x="1286" y="592" width="9" height="16"/><rect x="1458" y="626" width="9" height="16"/></g>
  <g class="cv-flags" fill="#2f5fb3" stroke="#f0c84a" stroke-width="1.5">
    <path class="cv-flag" d="M135 500 L135 452 L186 462 L172 474 L186 486 L135 480 Z"/>
    <path class="cv-flag" d="M1292 494 L1292 440 L1346 452 L1332 466 L1346 480 L1292 472 Z"/>
    <path class="cv-flag" d="M340 530 L340 492 L384 500 L372 510 L384 520 L340 516 Z"/>
  </g>`;
const fortressOrc = `
  <g fill="#24100c" stroke="#0a0403" stroke-width="2">
    <path d="M40 910 L40 640 L70 600 L100 640 L130 590 L160 640 L190 596 L220 640 L250 600 L280 640 L310 592 L340 640 L370 600 L400 640 L430 596 L460 640 L490 600 L520 640 L520 910 Z"/>
    <path d="M1080 910 L1080 640 L1110 596 L1140 640 L1170 590 L1200 640 L1230 600 L1260 640 L1290 592 L1320 640 L1350 598 L1380 640 L1410 594 L1440 640 L1470 600 L1500 640 L1560 640 L1560 910 Z"/>
    <path d="M220 640 L250 520 L280 640 Z M1290 640 L1320 510 L1350 640 Z M400 640 L420 560 L440 640 Z"/>
  </g>
  <g fill="#ff7a2e" class="cv-windows"><rect x="236" y="590" width="10" height="14"/><rect x="1304" y="580" width="10" height="14"/><rect x="132" y="680" width="10" height="14"/><rect x="1400" y="690" width="10" height="14"/></g>
  <g class="cv-flags" fill="#a3281c" stroke="#1b1b1b" stroke-width="1.5">
    <path class="cv-flag" d="M250 520 L250 462 L304 474 L290 488 L304 502 L250 494 Z"/>
    <path class="cv-flag" d="M1320 510 L1320 452 L1376 466 L1360 480 L1376 494 L1320 486 Z"/>
    <path class="cv-flag" d="M420 560 L420 522 L462 530 L450 540 L462 550 L420 546 Z"/>
  </g>`;

/**
 * SVG da ilustração de vitória (viewBox 1600x900, `slice`). Ids com sufixo da facção.
 * @param {'human'|'orc'} faction
 * @returns {string}
 */
export function buildVictorySvg(faction) {
  const f = faction === 'orc' ? 'orc' : 'human';
  const p = PAL[f];
  return `<svg class="cv-svg cv-svg--${f}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="cv-sky-${f}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.skyTop}"/><stop offset="0.5" stop-color="${p.skyMid}"/><stop offset="0.82" stop-color="${p.skyLow}"/><stop offset="1" stop-color="${p.sun}"/>
    </linearGradient>
    <radialGradient id="cv-sun-${f}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff6d8" stop-opacity="0.95"/><stop offset="0.35" stop-color="${p.sun}" stop-opacity="0.65"/><stop offset="1" stop-color="${p.skyLow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cv-ray-${f}" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="${p.sun}" stop-opacity="0.34"/><stop offset="1" stop-color="${p.sun}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="cv-ground-${f}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.near}"/><stop offset="1" stop-color="#050608"/></linearGradient>
    <linearGradient id="cv-banner-${f}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.flag}"/><stop offset="1" stop-color="${p.flagDark}"/></linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#cv-sky-${f})"/>
  <circle class="cv-sun" cx="800" cy="520" r="420" fill="url(#cv-sun-${f})"/>
  ${rays(f)}
  <g class="cv-far" fill="${p.far}"><path d="M0 640 L120 520 L220 600 L360 470 L520 610 L700 500 L860 620 L1020 480 L1190 600 L1350 490 L1480 590 L1600 520 L1600 900 L0 900 Z"/></g>
  <g class="cv-mid" fill="${p.near}" opacity="0.92"><path d="M0 720 L160 620 L300 700 L470 600 L640 710 L800 650 L960 710 L1130 610 L1300 700 L1460 630 L1600 700 L1600 900 L0 900 Z"/></g>
  ${f === 'orc' ? fortressOrc : fortressHuman}
  <rect x="0" y="790" width="1600" height="110" fill="url(#cv-ground-${f})"/>
  <g class="cv-hero">
    ${laurel()}
    <rect x="794" y="236" width="12" height="560" fill="#c8b27a" stroke="#6b5a2e" stroke-width="2"/>
    <circle cx="800" cy="228" r="12" fill="#f0c84a" stroke="#7a5a14" stroke-width="2"/>
    <g class="cv-banner">
      <path d="M700 250 L900 250 L900 440 L800 480 L700 440 Z" fill="url(#cv-banner-${f})" stroke="${p.flagTrim}" stroke-width="5"/>
      ${f === 'orc' ? emblemOrc : emblemHuman}
    </g>
  </g>
</svg>`;
}
