// AI disclosure: written with Claude Code (Anthropic AI coding assistant) under the author's direction; see AI-USAGE.md.
// Loads data/crops.json (the one crop table) and flattens it for the model.
// CROPS[id].kc is the plain value; CROPS[id].src.kc is { source, confidence, note } for the UI.
const url = new URL('../../data/crops.json', import.meta.url);
const raw = typeof window === 'undefined'
  ? JSON.parse(await (await import('node:fs/promises')).readFile(url, 'utf8'))
  : await (await fetch(url)).json();

const flatten = (entry) => {
  const out = { src: {} };
  for (const [k, v] of Object.entries(entry)) {
    if (v && typeof v === 'object' && 'value' in v) { out[k] = v.value; out.src[k] = v; } else out[k] = v;
  }
  return out;
};

export const SOURCES = raw.sources;
export const CROPS = Object.fromEntries(Object.entries(raw.crops).map(([id, c]) => [id, flatten(c)]));
export const COVER = flatten(raw.cover);
