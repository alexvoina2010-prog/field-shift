// AI disclosure: written with Claude Code (Anthropic AI coding assistant) under the author's direction; see AI-USAGE.md.
// AI-generated images: every icon in this file was drawn as SVG code by Claude Code for this project.
// Inline SVG illustrations: crops (by plant shape), soil, terrain, irrigation, goal and scenario icons.
// Decorative only (aria-hidden): every choice they sit on also has a text label.

const svg = (body, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">${body}</svg>`;

// Plant shapes; the crop colour comes in through --c.
const SHAPES = {
  grain: '<path d="M24 42V12" stroke="var(--c)" stroke-width="2.4" stroke-linecap="round" fill="none"/>' +
    [14, 20, 26, 32].map((y) => `<ellipse cx="19.5" cy="${y}" rx="4.6" ry="2.6" transform="rotate(-35 19.5 ${y})" fill="var(--c)"/><ellipse cx="28.5" cy="${y}" rx="4.6" ry="2.6" transform="rotate(35 28.5 ${y})" fill="var(--c)"/>`).join('') +
    '<ellipse cx="24" cy="9.5" rx="2.4" ry="3.6" fill="var(--c)"/>',
  cob: '<path d="M24 43c-9-3-12-11-13-17 4 3 7 6 9 10" fill="var(--sage)"/><path d="M24 43c9-3 12-11 13-17-4 3-7 6-9 10" fill="var(--sage)"/>' +
    '<rect x="17.5" y="7" width="13" height="30" rx="6.5" fill="var(--c)"/>' +
    [12, 17, 22, 27, 32].map((y) => `<path d="M18.5 ${y}h11" stroke="rgb(255 255 255 / .55)" stroke-width="1.3"/>`).join('') +
    '<path d="M24 8v28" stroke="rgb(255 255 255 / .55)" stroke-width="1.3"/>',
  flower: '<path d="M24 29v14" stroke="var(--sage)" stroke-width="2.4" stroke-linecap="round"/>' +
    Array.from({ length: 10 }, (_, i) => `<ellipse cx="24" cy="10.5" rx="3.6" ry="7" fill="var(--c)" transform="rotate(${i * 36} 24 22)"/>`).join('') +
    '<circle cx="24" cy="22" r="7" fill="#6B4A2B"/>',
  cluster: '<path d="M24 43V20M24 30l-7-6M24 26l7-5" stroke="var(--sage)" stroke-width="2.2" stroke-linecap="round" fill="none"/>' +
    [[24, 13], [17, 18], [31, 16], [20, 9], [29, 8.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.4" fill="var(--c)"/><circle cx="${x}" cy="${y}" r="1.4" fill="#8A6A10"/>`).join(''),
  pod: '<path d="M10 33c4-14 16-22 29-22-2 13-12 24-27 25z" fill="var(--c)"/><path d="M12 34c8-3 18-11 25-21" stroke="rgb(255 255 255 / .5)" stroke-width="1.4" fill="none"/>' +
    [[19, 28], [25, 23], [31, 17.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="rgb(255 255 255 / .45)"/>`).join(''),
  trefoil: '<path d="M24 43V24" stroke="var(--sage)" stroke-width="2.4" stroke-linecap="round"/>' +
    '<ellipse cx="24" cy="13" rx="6" ry="8" fill="var(--c)"/><ellipse cx="15" cy="23" rx="6" ry="8" transform="rotate(-70 15 23)" fill="var(--c)"/><ellipse cx="33" cy="23" rx="6" ry="8" transform="rotate(70 33 23)" fill="var(--c)"/>' +
    '<circle cx="24" cy="21" r="2.4" fill="#7A4FA0"/>',
};

// crop id -> [shape, colour]. Unknown crops fall back to a grain head.
const CROP_LOOK = {
  wheat: ['grain', '#C8902E'], barley: ['grain', '#B09440'], sorghum: ['grain', '#A0522D'],
  maize: ['cob', '#E2B53B'], sunflower: ['flower', '#E9B21E'], rapeseed: ['cluster', '#E0BE10'],
  soybean: ['pod', '#7FA052'], pea: ['pod', '#5FA35A'], chickpea: ['pod', '#B79A5B'], alfalfa: ['trefoil', '#5E9C5A'],
};

/** Illustration for a crop, in a soft disc. */
export function cropIcon(id, cls = 'crop-ico') {
  const [shape, c] = CROP_LOOK[id] || ['grain', '#8C9A5B'];
  return `<span class="${cls}" style="--c:${c}">${svg(SHAPES[shape])}</span>`;
}

// Soil textures as drawn samples.
const grains = (pts, r, fill) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join('');
export const SOIL = {
  sandy: svg('<rect x="4" y="8" width="40" height="32" rx="8" fill="#E6CF9A"/>' +
    grains([[10, 14], [18, 18], [27, 13], [36, 17], [13, 25], [22, 27], [32, 24], [39, 30], [9, 33], [18, 35], [28, 34], [35, 36]], 1.7, '#B98F45')),
  loam: svg('<rect x="4" y="8" width="40" height="32" rx="8" fill="#8C6440"/>' +
    [[12, 15, 3.5], [24, 14, 2.6], [35, 17, 3.2], [16, 26, 2.8], [28, 25, 3.6], [38, 30, 2.4], [11, 34, 2.6], [24, 35, 3], [34, 36, 2]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#6B4A2E"/>`).join('')),
  clay: svg('<rect x="4" y="8" width="40" height="32" rx="8" fill="#A65E3E"/>' +
    [15, 22, 29, 35].map((y) => `<path d="M7 ${y}c8-2 14 2 20 0s10-2 14 0" stroke="#7E4129" stroke-width="1.8" fill="none"/>`).join('')),
};

export const TERRAIN = {
  flat: svg('<path d="M4 34h40v8H4z" fill="var(--pale)"/><path d="M4 34h40" stroke="var(--forest)" stroke-width="3" stroke-linecap="round"/>'),
  gentle: svg('<path d="M4 38L44 26v16H4z" fill="var(--pale)"/><path d="M4 38L44 26" stroke="var(--forest)" stroke-width="3" stroke-linecap="round"/>'),
  steep: svg('<path d="M4 42L44 12v30H4z" fill="var(--pale)"/><path d="M4 42L44 12" stroke="var(--forest)" stroke-width="3" stroke-linecap="round"/>'),
};

const DROP = 'M24 6c-8 11-12 16-12 22a12 12 0 0 0 24 0c0-6-4-11-12-22z';
export const IRRIGATION = {
  none: svg('<path d="M12 24a8 8 0 0 1 15-4 7 7 0 0 1 11 6 6 6 0 0 1-2 12H14a7 7 0 0 1-2-14z" fill="#C9D3DA"/><path d="M18 40l-2 4M26 40l-2 4M34 40l-2 4" stroke="var(--rain)" stroke-width="2" stroke-linecap="round"/>'),
  some: svg(`<clipPath id="half"><rect x="0" y="26" width="48" height="22"/></clipPath><path d="${DROP}" fill="var(--rain)" clip-path="url(#half)"/><path d="${DROP}" stroke="var(--rain)" stroke-width="2.4" fill="none"/>`),
  full: svg(`<path d="${DROP}" fill="var(--rain)"/><path d="M18 30a6 6 0 0 0 6 6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>`),
};

export const GOAL_ICONS = {
  profit: svg('<rect x="8" y="26" width="7" height="14" rx="2" fill="var(--sage)"/><rect x="20.5" y="18" width="7" height="22" rx="2" fill="var(--sage)"/><rect x="33" y="9" width="7" height="31" rx="2" fill="var(--forest)"/>'),
  steady: svg('<path d="M6 20h36" stroke="var(--gold)" stroke-width="2.4" stroke-dasharray="4 4"/><path d="M6 30c6-6 10 6 16 0s10-6 14 0 4 2 6 0" stroke="var(--forest)" stroke-width="3" fill="none" stroke-linecap="round"/>'),
  work: svg('<circle cx="24" cy="24" r="8" stroke="var(--forest)" stroke-width="3" fill="none"/>' +
    Array.from({ length: 8 }, (_, i) => `<rect x="22" y="7" width="4" height="7" rx="1.5" fill="var(--forest)" transform="rotate(${i * 45} 24 24)"/>`).join('')),
  soil: svg('<path d="M4 30h40v12H4z" fill="#8C6440"/><path d="M24 30V14" stroke="var(--sage)" stroke-width="3" stroke-linecap="round"/><path d="M24 20c-8 0-11-6-11-10 6 0 11 3 11 10zM24 17c6 0 10-5 10-9-6 0-10 3-10 9z" fill="var(--sage)"/>'),
  water: svg(`<path d="${DROP}" fill="var(--rain)"/><path d="M18 30a6 6 0 0 0 6 6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>`),
};

export const SCENARIO_ICONS = {
  now: svg('<circle cx="24" cy="24" r="9" fill="var(--gold)"/>' + Array.from({ length: 8 }, (_, i) => `<path d="M24 5v6" stroke="var(--gold)" stroke-width="3" stroke-linecap="round" transform="rotate(${i * 45} 24 24)"/>`).join('')),
  warm: svg('<rect x="20" y="5" width="8" height="27" rx="4" stroke="var(--bad)" stroke-width="2.4" fill="none"/><circle cx="24" cy="35" r="7" fill="var(--bad)"/><path d="M24 16v18" stroke="var(--bad)" stroke-width="3.5" stroke-linecap="round"/>'),
  dry: svg('<circle cx="33" cy="14" r="7" fill="var(--gold)"/><path d="M4 34h40" stroke="#8C6440" stroke-width="3" stroke-linecap="round"/><path d="M11 34l4 6 3-6 5 7 3-7 6 6 3-6" stroke="#8C6440" stroke-width="2" fill="none" stroke-linejoin="round"/>'),
};
