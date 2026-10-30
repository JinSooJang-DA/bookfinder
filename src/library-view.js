// src/library-view.js — Bibliothek erkunden: Gebäude → Ort → Grundriss → Raum → Regal (Vorderansicht)
// Liest den Aufbau aus Firestore (places, rooms, bookcases) über src/library.js.
import { loadLibrary, totalLayers } from './library.js';

let lib = null;          // { places, rooms, bookcases }
let loading = null;
const state = { screen: 'start', placeId: null, roomId: null, bookcaseId: null, sectionIdx: null };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => String(n).replace('.', ',');
const pct = (n) => `${Math.round(n * 10000) / 100}%`;

function root() { return document.getElementById('libraryView'); }

// Wird von switchView('libraryView') aufgerufen
export async function openLibraryView({ reset = true } = {}) {
  if (reset) Object.assign(state, { screen: 'start', placeId: null, roomId: null, bookcaseId: null, sectionIdx: null });
  const el = root();
  if (!el) return;
  if (!el.dataset.bound) {
    el.addEventListener('click', onClick);
    el.dataset.bound = '1';
  }
  if (!lib) {
    el.innerHTML = '<div class="card lib-card"><p class="lib-muted">Bibliothek wird geladen …</p></div>';
    try {
      loading = loading || loadLibrary();
      lib = await loading;
    } catch (err) {
      console.error('[BookFinder Bibliothek]', err);
      el.innerHTML = `<div class="card lib-card"><p class="lib-muted">Laden fehlgeschlagen: ${esc(err.message)}</p></div>`;
      loading = null;
      return;
    }
  }
  render();
}

function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const { act, id } = btn.dataset;
  if (act === 'enter') state.screen = 'places';
  if (act === 'place') Object.assign(state, { screen: 'place', placeId: id });
  if (act === 'room') Object.assign(state, { screen: 'room', roomId: id });
  if (act === 'case') Object.assign(state, { screen: 'case', bookcaseId: id, sectionIdx: null });
  if (act === 'back') goBack();
  if (act === 'search') { window.switchView('searchView'); return; }
  render();
  root()?.scrollIntoView({ block: 'start' });
}

function goBack() {
  if (state.screen === 'case') Object.assign(state, { screen: 'room', bookcaseId: null });
  else if (state.screen === 'room') Object.assign(state, { screen: 'place', roomId: null });
  else if (state.screen === 'place') Object.assign(state, { screen: 'places', placeId: null });
  else state.screen = 'start';
}

const place = () => lib.places.find(p => p.id === state.placeId);
const room = () => lib.rooms.find(r => r.id === state.roomId);
const bookcase = () => lib.bookcases.find(b => b.id === state.bookcaseId);
const roomsOf = (placeId) => lib.rooms.filter(r => r.placeId === placeId);
const casesOf = (roomId) => lib.bookcases.filter(b => b.roomId === roomId);

function layerText(b) {
  const s = b.sections || [];
  return s.length > 1 ? `${s.length} Abschnitte (${s.map(x => x.layers).join('/')} Fächer)` : `${totalLayers(b)} Fächer`;
}
function sizeText(b) {
  if (b.widthM) return `B ${num(b.widthM)} m · H ${num(b.heightM)} m`;
  return b.note || '';
}

function header(title, crumb) {
  const back = state.screen === 'start' ? '' :
    '<button type="button" class="lib-back" data-act="back" aria-label="Zurück"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></button>';
  return `<div class="lib-head">${back}<div class="lib-head-text"><h3 class="lib-title">${esc(title)}</h3>${crumb ? `<span class="lib-crumb">${esc(crumb)}</span>` : ''}</div></div>`;
}

function render() {
  const el = root();
  if (!el || !lib) return;
  let html = '';
  if (state.screen === 'start') html = renderStart();
  else if (state.screen === 'places') html = renderPlaces();
  else if (state.screen === 'place') html = renderPlace();
  else if (state.screen === 'room') html = renderRoom();
  else if (state.screen === 'case') html = renderCase();
  el.innerHTML = `<div class="card lib-card">${html}</div>`;
}

function renderStart() {
  return header('Meine Bibliothek', '') + `
    <button type="button" class="lib-building" data-act="enter" aria-label="Meine Bibliothek betreten">
      <svg width="200" height="210" viewBox="0 0 220 230" fill="none" stroke="#d4af37" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
        <path d="M20 92 L110 28 L200 92"></path><path d="M36 82 V170 H184 V82"></path>
        <rect x="56" y="102" width="34" height="28" rx="2"></rect><rect x="130" y="102" width="34" height="28" rx="2"></rect>
        <path d="M96 170 V138 H124 V170"></path><path d="M60 116 H86 M134 116 H160"></path>
        <path d="M8 170 H212" stroke-width="3"></path>
        <path d="M36 170 V214 H184 V170" stroke="#8c6b4a" stroke-dasharray="6 5"></path>
        <rect x="58" y="184" width="22" height="12" rx="1" stroke="#8c6b4a"></rect><rect x="140" y="184" width="22" height="12" rx="1" stroke="#8c6b4a"></rect>
        <path d="M70 50 V30 H84 V40"></path>
      </svg>
      <span class="lib-muted">Tippen zum Betreten</span>
    </button>
    <button type="button" class="btn btn-secondary lib-search" data-act="search">Buch suchen</button>`;
}

function renderPlaces() {
  const parts = lib.places.map(p => {
    const rooms = roomsOf(p.id);
    const nCases = lib.bookcases.filter(b => b.placeId === p.id).length;
    const nRooms = rooms.filter(r => r.hasBooks).length;
    if (!p.hasPlan) {
      return `<button type="button" class="lib-floor lib-floor-off" disabled><span class="lib-floor-name">${esc(p.name)}</span><span class="lib-muted">Noch kein Grundriss</span></button>`;
    }
    return `<button type="button" class="lib-floor" data-act="place" data-id="${esc(p.id)}"><span class="lib-floor-name">${esc(p.name)}</span><span class="lib-muted">${nRooms} Räume mit Büchern · ${nCases} Regale</span></button>`;
  });
  const [first, ...rest] = parts;
  return header('Wohin?', 'Meine Bibliothek') + `
    <div class="lib-house">
      <svg class="lib-roof" viewBox="0 0 330 70" preserveAspectRatio="none" fill="none" stroke="#d4af37" stroke-width="2.2" aria-hidden="true"><path d="M6 68 L165 4 L324 68"></path></svg>
      ${first || ''}
      <div class="lib-ground" aria-hidden="true"></div>
      ${rest.join('')}
    </div>`;
}

function bounds(rooms) {
  return {
    w: Math.max(...rooms.map(r => r.plan.x + r.plan.w)),
    h: Math.max(...rooms.map(r => r.plan.y + r.plan.h))
  };
}

// Rechteck in Prozent innerhalb eines Rahmens (ox, oy, W, H in Metern)
function box(p, ox, oy, W, H) {
  return `left:${pct((p.x - ox) / W)};top:${pct((p.y - oy) / H)};width:${pct(p.w / W)};height:${pct(p.h / H)}`;
}

function renderPlace() {
  const p = place();
  const rooms = roomsOf(p.id);
  if (!rooms.length) return header(p.name, 'Meine Bibliothek') + '<p class="lib-muted">Noch kein Grundriss.</p>';
  const { w, h } = bounds(rooms);
  const cases = lib.bookcases.filter(b => b.placeId === p.id);
  const roomEls = rooms.map(r => r.hasBooks
    ? `<button type="button" class="lib-room lib-room-books" style="${box(r.plan, 0, 0, w, h)}" data-act="room" data-id="${esc(r.id)}" aria-label="${esc(r.name)}, ${casesOf(r.id).length} Regale"><span class="lib-room-name">${esc(r.name)}</span><span class="lib-room-count">${casesOf(r.id).length} Regale</span></button>`
    : `<div class="lib-room" style="${box(r.plan, 0, 0, w, h)}"><span class="lib-room-small">${esc(r.name)}</span></div>`).join('');
  const caseEls = cases.map(b => `<div class="lib-shelf" style="${box(b.plan, 0, 0, w, h)}" aria-hidden="true"></div>`).join('');
  return header(p.name, 'Meine Bibliothek · Raum antippen') + `
    <div class="lib-plan" style="aspect-ratio:${w} / ${h}">${roomEls}${caseEls}</div>
    <div class="lib-legend"><span class="lib-shelf lib-legend-swatch" aria-hidden="true"></span>Schraffiert = Regal</div>`;
}

function renderRoom() {
  const r = room();
  const cases = casesOf(r.id);
  // Raum mit Rand einpassen
  const pad = 0.3;
  const ox = r.plan.x - pad, oy = r.plan.y - pad, W = r.plan.w + 2 * pad, H = r.plan.h + 2 * pad;
  const caseEls = cases.map((b, i) =>
    `<button type="button" class="lib-shelf lib-shelf-btn" style="${box(b.plan, ox, oy, W, H)}" data-act="case" data-id="${esc(b.id)}" aria-label="${esc(b.name)}"><span class="lib-badge">${i + 1}</span></button>`).join('');
  const list = cases.map((b, i) =>
    `<button type="button" class="lib-row" data-act="case" data-id="${esc(b.id)}"><span class="lib-row-main"><span class="lib-badge">${i + 1}</span>${esc(b.name)}</span><span class="lib-muted">${esc(layerText(b))}</span></button>`).join('');
  return header(r.name, `${place()?.name || ''} · Regal antippen`) + `
    <div class="lib-plan lib-plan-room" style="aspect-ratio:${W} / ${H}">
      <div class="lib-room lib-room-books lib-room-frame" style="${box(r.plan, ox, oy, W, H)}"></div>${caseEls}
    </div>
    <div class="lib-list">${list}</div>`;
}

function renderCase() {
  const b = bookcase();
  const sections = b.sections || [{ layers: 1 }];
  const crumb = `${place()?.name || ''} › ${room()?.name || ''}`;
  const info = [sizeText(b), layerText(b), b.widthM ? '' : ''].filter(Boolean).join(' · ');
  let front;
  if (sections.length > 1) {
    const cols = sections.map((s, si) => {
      const fächer = Array.from({ length: s.layers }, (_, k) =>
        `<div class="lib-sec-fach"><span>Fach ${k + 1}</span></div>`).join('');
      return `<div class="lib-sec"><span class="lib-sec-name">Abschnitt ${si + 1}</span>${fächer}</div>`;
    }).join('');
    front = `<div class="lib-front"><div class="lib-secs">${cols}</div>${b.baseCabinet ? '<div class="lib-base">Unterschrank (keine Bücher)</div>' : ''}</div>`;
  } else {
    const n = sections[0].layers;
    front = `<div class="lib-front">` + Array.from({ length: n }, (_, k) =>
      `<div class="lib-fach"><span class="lib-fach-label">Fach ${k + 1}${k === 0 ? ' (oben)' : ''}</span><span class="lib-muted">Noch nicht erfasst</span></div>`
    ).join('') + `</div>`;
  }
  return header(b.name, crumb) + `
    <p class="lib-info">${esc(info)}${b.note && b.widthM ? ` · ${esc(b.note)}` : ''}</p>
    ${front}`;
}
