// AI disclosure: written with Claude Code (Anthropic AI coding assistant) under the author's direction; see AI-USAGE.md.
// "Draw your field": tap corners on the map, drag them to adjust, see hectares live.
// No library: a Leaflet polygon plus one draggable marker per corner.
/* global L */
const R = 6378137; // WGS84 equatorial radius, m

/**
 * Area of a polygon on the sphere, m² (the same spherical-excess formula Leaflet.draw uses).
 * @param {{lat:number, lng:number}[]} pts
 */
export function geodesicArea(pts) {
  if (pts.length < 3) return 0;
  const rad = Math.PI / 180;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    a += (p2.lng - p1.lng) * rad * (2 + Math.sin(p1.lat * rad) + Math.sin(p2.lat * rad));
  }
  return Math.abs((a * R * R) / 2);
}

/**
 * @param {L.Map} map
 * @param {{onArea:(ha:number)=>void, onDone:(center:{lat:number,lng:number}, pts:object[])=>void}} hooks
 */
export function drawTool(map, hooks) {
  let pts = [], markers = [], poly = null, active = false;
  const icon = L.divIcon({ className: 'corner', iconSize: [28, 28] });
  const redraw = () => {
    if (!poly) poly = L.polygon([], { color: '#8a3b12', weight: 3, fillOpacity: 0.15 }).addTo(map);
    poly.setLatLngs(pts);
    hooks.onArea(geodesicArea(pts) / 1e4);
  };
  const addCorner = (ll) => {
    const i = pts.length;
    pts = [...pts, { lat: ll.lat, lng: ll.lng }];
    const m = L.marker(ll, { icon, draggable: true, keyboard: false }).addTo(map);
    m.on('drag', (e) => { const p = e.target.getLatLng(); pts = pts.map((q, k) => (k === i ? { lat: p.lat, lng: p.lng } : q)); redraw(); });
    markers = [...markers, m];
    redraw();
  };
  const onClick = (e) => { if (active) addCorner(e.latlng.wrap()); };
  map.on('click', onClick);
  return {
    get active() { return active; },
    get points() { return pts; },
    start() { this.clear(); active = true; map.getContainer().classList.add('drawing'); },
    finish() {
      active = false; map.getContainer().classList.remove('drawing');
      if (pts.length < 3) return false;
      const c = poly.getBounds().getCenter();
      hooks.onDone({ lat: c.lat, lng: c.lng }, pts);
      return true;
    },
    clear() {
      markers.forEach((m) => m.remove()); markers = []; pts = [];
      if (poly) { poly.remove(); poly = null; }
      active = false; map.getContainer().classList.remove('drawing');
    },
    /** Redraws a saved outline (corners stay draggable). */
    load(saved) {
      this.clear();
      for (const p of saved) if (Number.isFinite(p?.lat) && Number.isFinite(p?.lng)) addCorner(L.latLng(p.lat, p.lng));
    },
  };
}
