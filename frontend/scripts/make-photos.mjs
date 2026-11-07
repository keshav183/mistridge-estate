// Generates lightweight illustrated stand-ins for resort photography (≈2–5 KB each, vector, instant on slow networks).
// Swap /public/photos/* for real WebP/AVIF photographs at launch; nothing else in the app changes.
import fs from 'node:fs';

const W = 1600, H = 1000;
const PAL = {
  mist: { sky: ['#e3edea', '#f6f4ea'], ridges: ['#c5d6cf', '#9db9ae', '#6f9585', '#3f6b57', '#244b3a'], sun: '#fff6dc' },
  dusk: { sky: ['#c9d3e0', '#f1d9c6'], ridges: ['#b4bccb', '#8a97ad', '#5d6f80', '#38505a', '#1e3a37'], sun: '#ffe2bd' },
  noon: { sky: ['#cfe3ea', '#eef5ef'], ridges: ['#bfd8d3', '#8ebdb1', '#559683', '#2f705a', '#194a39'], sun: '#ffffff' },
  rain: { sky: ['#b8c4c4', '#dfe5e1'], ridges: ['#a9b9b5', '#82978f', '#5a7469', '#375a4c', '#1f3f33'], sun: null },
};
const rng = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

function ridge(r, base, amp, color, x0 = 0, x1 = W, bottom = H) {
  const f1 = 0.003 + r() * 0.004, f2 = 0.008 + r() * 0.01, p1 = r() * 6, p2 = r() * 6;
  let d = `M${x0} ${bottom} L${x0} ${base}`;
  for (let x = x0; x <= x1; x += 20) d += ` L${x} ${(base + Math.sin(x * f1 + p1) * amp + Math.sin(x * f2 + p2) * amp * 0.35).toFixed(1)}`;
  return `<path d="${d} L${x1} ${bottom}Z" fill="${color}"/>`;
}
const defs = (id, p) => `<defs><linearGradient id="s${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient><linearGradient id="m${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;

function landscape(seed, p, { x0 = 0, x1 = W, y0 = 0, y1 = H, terraces = true } = {}) {
  const r = rng(seed), h = y1 - y0;
  let s = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${h}" fill="url(#s${seed})"/>`;
  if (p.sun) s += `<circle cx="${x0 + (x1 - x0) * (0.25 + r() * 0.5)}" cy="${y0 + h * 0.3}" r="${h * 0.09}" fill="${p.sun}" opacity=".9"/>`;
  p.ridges.forEach((c, i) => {
    const base = y0 + h * (0.38 + i * 0.1);
    s += ridge(r, base, h * (0.07 - i * 0.008), c, x0, x1, y1);
    if (i < 3) s += `<rect x="${x0}" y="${base - h * 0.05}" width="${x1 - x0}" height="${h * 0.16}" fill="url(#m${seed})"/>`;
  });
  if (terraces) for (let i = 0; i < 9; i++) {
    const y = y0 + h * (0.78 + i * 0.026);
    s += `<path d="M${x0} ${y} Q${x0 + (x1 - x0) / 2} ${y - 26 + r() * 20} ${x1} ${y + 8}" stroke="#2a5a43" stroke-opacity=".35" stroke-width="${3 + i}" fill="none"/>`;
  }
  return s;
}

function interior(seed, p, variant) {
  const r = rng(seed);
  const wall = ['#ece9e0', '#e4e8e2', '#efeae1'][variant % 3];
  let s = `<rect width="${W}" height="${H}" fill="${wall}"/><rect y="760" width="${W}" height="240" fill="#cfc6b6"/>`;
  const wx = 380 + variant * 40, wy = 110, ww = 840, wh = 520;
  s += `<clipPath id="w${seed}"><rect x="${wx}" y="${wy}" width="${ww}" height="${wh}"/></clipPath><g clip-path="url(#w${seed})">${landscape(seed, p, { x0: wx, x1: wx + ww, y0: wy, y1: wy + wh, terraces: false })}</g>`;
  s += `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" fill="none" stroke="#f9f8f3" stroke-width="18"/><path d="M${wx + ww / 2} ${wy}V${wy + wh}M${wx} ${wy + wh / 2}H${wx + ww}" stroke="#f9f8f3" stroke-width="10"/>`;
  s += `<rect x="${wx - 120}" y="560" width="${ww + 240}" height="230" rx="18" fill="#fbfaf6"/><rect x="${wx - 120}" y="500" width="${ww + 240}" height="90" rx="14" fill="#244b3a"/>`;
  s += `<rect x="${wx - 70}" y="530" width="270" height="76" rx="30" fill="#fff"/><rect x="${wx + 230}" y="530" width="270" height="76" rx="30" fill="#fff"/><rect x="${wx - 120}" y="690" width="${ww + 240}" height="100" rx="12" fill="#e6e1d4"/>`;
  s += `<rect x="${wx - 280}" y="560" width="90" height="230" rx="8" fill="#a98a63"/><circle cx="${wx - 235}" cy="540" r="${50 + r() * 14}" fill="#3f6b57"/><rect x="${wx + ww + 200}" y="600" width="110" height="190" rx="6" fill="#a98a63"/>`;
  return s;
}

function lawn(seed, p) {
  const r = rng(seed);
  let s = landscape(seed, p, { terraces: false, y1: 640 });
  s += `<rect y="600" width="${W}" height="400" fill="#3d7255"/><rect y="600" width="${W}" height="60" fill="#5b8f6f" opacity=".5"/>`;
  s += `<g stroke="#fbfaf6" stroke-width="10" fill="none"><path d="M560 760V430M1040 760V430M540 440Q800 330 1060 440"/></g><path d="M565 440Q800 350 1035 440L1000 640Q800 580 600 640Z" fill="#f1d2d8" opacity=".85"/>`;
  for (let row = 0; row < 5; row++) for (let i = 0; i < 12; i++) {
    const x = 250 + i * 100 + (row % 2) * 20, y = 800 + row * 40;
    if (x > 700 && x < 900) continue;
    s += `<rect x="${x}" y="${y}" width="44" height="34" rx="6" fill="#fbfaf6" opacity="${0.55 + row * 0.09}"/>`;
  }
  return s;
}

const wrap = (id, p, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" role="img">${defs(id, p)}${body}</svg>`;
const out = (name, id, p, body) => fs.writeFileSync(new URL(`../public/photos/${name}.svg`, import.meta.url), wrap(id, p, body));

out('hero', 11, PAL.mist, landscape(11, PAL.mist));
out('estate', 12, PAL.dusk, landscape(12, PAL.dusk));
out('events', 13, PAL.noon, lawn(13, PAL.noon));
const sets = { 'valley-deluxe': 20, 'canopy-suite': 30, 'planters-villa': 40, 'ridge-pool-villa': 50 };
const pals = [PAL.mist, PAL.noon, PAL.dusk, PAL.rain];
for (const [slug, base] of Object.entries(sets)) {
  [0, 1, 2].forEach((v) => {
    const id = base + v, p = pals[(base / 10 + v) % 4];
    out(`${slug}-${v + 1}`, id, p, v === 2 ? landscape(id, p) : interior(id, p, v));
  });
}
console.log('photos written');
