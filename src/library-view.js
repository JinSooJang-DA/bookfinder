// src/library-view.js — Bibliothek (ansehen) und Erfassen (eingeben) mit demselben Grundriss
//   Bibliothek: Gebäude → Ort → Grundriss → Raum → Regal (Vorderansicht, nur ansehen)
//   Erfassen:   Start → Ort → Grundriss → Raum → Regal (Fächer & Status) → Fach filmen → Ergebnis prüfen
// Liest den Aufbau aus Firestore (places, rooms, bookcases) über src/library.js.
// Stand 2026-10-30: Filmen, Analyse und Speichern sind nur eine VORSCHAU (keine Kamera, keine Gemini-Anfrage,
// kein Firestore-Schreiben). Sie werden nach Fertigstellung der Oberfläche angeschlossen.
import { loadLibrary, totalLayers } from './library.js';

let lib = null;
let loading = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => String(n).replace('.', ',');
const pct = (n) => `${Math.round(n * 10000) / 100}%`;

// Zwei Instanzen mit eigenem Zustand
const views = {
  libraryView: { mode: 'view', state: {} },
  captureView: { mode: 'capture', state: {} }
};

// Vorschau-Status der Fächer im Erfassen-Modus: key = `${bookcaseId}:${sectionIdx}:${fach}`
// { status: 'analysing' | 'review' | 'saved', items: [...] }
const fachStatus = {};

// Beispieldaten für die Prüfen-Vorschau (echte Titel aus dem Testvideo Arbeitszimmer › Regal 1 › Fach 1)
const PREVIEW_ITEMS = [
  { title: 'James Bidgood', author: '', kind: 'book', unsure: false },
  { title: 'Das Tagebuch der Anne Frank', author: 'Ari Folman, David Polonsky', kind: 'book', unsure: false },
  { title: 'Habt ihr wieder nur altes kaputtes Zeug gefunden?', author: 'Fischer', kind: 'book', unsure: false },
  { title: 'Mies – Ein visionärer Architekt', author: '', kind: 'book', unsure: false },
  { title: 'Islam und Homosexualität, Teil 3', author: 'Amin K. Walter', kind: 'book', unsure: false },
  { title: 'Götter & Kulte', author: '', kind: 'book', unsure: true },
  { title: '2000 Jahre Varusschlacht – Konflikt', author: '', kind: 'book', unsure: false },
  { title: 'Parthenon', author: '', kind: 'book', unsure: false }
];
const KIND_LABEL = { book: 'Buch', film: 'Film', music: 'Musik', other: 'Sonstiges' };

// Gespeicherte Fächer (Vorschau, nur im Speicher): key → [{ title, author, kind }], von links nach rechts.
// Vorbelegt mit dem von Hand gelesenen Testvideo Arbeitszimmer › Regal 1 › Fach 1.
const shelfBooks = {};
const SAMPLE_FACH = [
  ['James Bidgood', ''], ['Das Tagebuch der Anne Frank', 'Ari Folman, David Polonsky'], ['Mies – Ein visionärer Architekt', ''],
  ['Islam und Homosexualität, Teil 3', 'Amin K. Walter'], ['Islam und Homosexualität, Teil 2', 'Amin K. Walter'], ['Islam und Homosexualität, Teil 1', 'Amin K. Walter'],
  ['Homosexualitäten', ''], ['2000 Jahre Varusschlacht – Konflikt', ''], ['2000 Jahre Varusschlacht – Imperium', ''], ['2000 Jahre Varusschlacht – Mythos', ''],
  ['Alexandria', 'Günter Grimm'], ['Parthenon', ''], ['Warenwege – Warenflüsse', ''], ['An den Grenzen des Reiches', ''],
  ['Theater im Römischen Reich', 'Rüdiger Gogräfe'], ['Lexikon der Alten Welt A–G', ''], ['Lexikon der Alten Welt H–Q', ''], ['Lexikon der Alten Welt R–Z', ''],
  ['Beefcake', ''], ['John F. Kennedy', ''], ['James Dean – Rebell in Hollywood', ''], ['Männer', 'Herlinde Koelbl'], ['Streiflichter', 'Dieter Bachnick'],
  ['Living Sculpture', ''], ['Robert Mapplethorpe', ''], ['Androgyn', ''], ['Boys', 'Will McBride'], ['Photographies', 'Hervé Guibert'],
  ['Das magische Auge', 'Herbert List'], ['Das MännerFotoBuch', ''], ['Et in Arcadia Ego', ''], ['Pierre et Gilles', ''], ["L'Amour bleu", ''],
  ['Kulturgeschichte der Antike 2', ''], ['Alltag im Alten Rom', 'Karl-Wilhelm Weeber'], ['Die römischen Kaiser', 'Chris Scarre'],
  ['Homosexualität in der griechischen Antike', 'Dover'], ['Götter, Mumien und Hetären', ''], ['Klassische Archäologie – Grundwissen', 'Hölscher'],
  ['Das Haus des Augustus auf dem Palatin', 'G. Carettoni'], ['Die Sonnenuhr des Augustus', 'Edmund Buchner'], ['Palazzo Altemps', ''],
  ['Führer durch die Borghese Galerie', ''], ['Palazzo Massimo alle Terme', ''], ['Hermogenes und die hochhellenistische Architektur', ''],
  ['Kleopatra – Die ewige Diva', ''], ['Caesar & Kleopatra', ''], ['Kleopatra und die Caesaren', ''], ['Rom – Monumente großer Kulturen', ''],
  ['Wunder Roms', ''], ['Die neuen Bilder des Augustus', ''], ['Kaiser Augustus und die verlorene Republik', ''], ['Roma Antica', ''],
  ['Roman Sculpture', 'Kleiner'], ['Jerusalem Revealed', ''], ['The Metropolitan Museum of Art Guide', ''], ['Griechische Geschichte', 'Schuller'],
  ['Rom – Ein archäologischer Führer', 'Filippo Coarelli'], ['Das Neue Testament', ''], ['Holy Bible', ''], ['Das Buch Mormon', ''],
  ['Zitate und Sprichwörter von A–Z', ''], ['Daten der deutschen Geschichte', 'Gerhard Hellwig'], ['Grundgesetz', ''],
  ['Griechische Schriftsteller', 'Rainer Nickel'], ['Die blödesten Gesetze der Welt', 'Roman Leuthner, Alexandra Leuthner'], ['Deutsche Verfassungen', ''],
  ['Das große Lexikon der Geschichte 1', ''], ['Das große Lexikon der Geschichte 2', ''], ['Das große Lexikon der Geschichte 3', '']
].map(([title, author]) => ({ title, author, kind: 'book' }));
shelfBooks['arbeitszimmer-1:0:1'] = SAMPLE_FACH;
fachStatus['arbeitszimmer-1:0:1'] = { status: 'saved', items: SAMPLE_FACH };

const SPINE_COLORS = ['#4f5e45', '#6e3428', '#2c445b', '#7d5f28', '#5c5852', '#463756', '#7a4e33', '#3a5853'];

export function openLibraryView() { return openView('libraryView'); }
export function openCaptureView() { return openView('captureView'); }

async function openView(rootId, { reset = true } = {}) {
  const v = views[rootId];
  if (reset) v.state = { screen: 'start', placeId: null, roomId: null, bookcaseId: null, section: 0, fach: null, direction: 'rtl', recording: false, query: '', book: null, hl: null };
  const el = document.getElementById(rootId);
  if (!el) return;
  if (!el.dataset.bound) {
    el.addEventListener('click', (e) => onClick(rootId, e));
    el.addEventListener('input', (e) => onInput(rootId, e));
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
  render(rootId);
}

// ---------------------------------------------------------------- Ereignisse
function onClick(rootId, e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const v = views[rootId], st = v.state;
  const { act, id } = btn.dataset;
  switch (act) {
    case 'enter': st.screen = 'places'; break;
    case 'film-shelf': st.screen = 'places'; break;
    case 'barcode': window.switchView('barcodeView'); return;
    case 'search': Object.assign(st, { screen: 'search', hl: null }); break;
    case 'open-fach': {
      const [sec, fach] = id.split(':').map(Number);
      Object.assign(st, { section: sec, fach, screen: 'fach' });
      break;
    }
    case 'book': {
      const [k, idx] = id.split('|');
      st.book = { k, idx: Number(idx) };
      break;
    }
    case 'close-book': st.book = null; break;
    case 'locate': {
      // Buch im Grundriss zeigen: zum Ort springen, Raum/Regal/Fach/Buch hervorheben
      const { k, idx } = st.book;
      const [caseId, sec, fach] = k.split(':');
      const b = lib.bookcases.find(x => x.id === caseId);
      Object.assign(st, { screen: 'place', placeId: b.placeId, roomId: b.roomId, bookcaseId: caseId, section: Number(sec), fach: Number(fach), book: null,
        hl: { roomId: b.roomId, caseId, k, idx } });
      break;
    }
    case 'place': Object.assign(st, { screen: 'place', placeId: id }); break;
    case 'room': Object.assign(st, { screen: 'room', roomId: id }); break;
    case 'case': Object.assign(st, { screen: 'case', bookcaseId: id }); break;
    case 'back': goBack(st); break;
    case 'fach': {
      const [sec, fach] = id.split(':').map(Number);
      const s = fachStatus[key(st.bookcaseId, sec, fach)];
      Object.assign(st, { section: sec, fach, screen: s?.status === 'review' ? 'review' : 'film', recording: false });
      break;
    }
    case 'next': {
      const next = nextOpenFach(st.bookcaseId);
      if (!next) return;
      Object.assign(st, { section: next.sec, fach: next.fach, screen: 'film', recording: false });
      break;
    }
    case 'dir': st.direction = id; break;
    case 'rec-start': startRecording(rootId); return;
    case 'rec-stop': stopRecording(rootId); return;
    case 'del': {
      const s = fachStatus[key(st.bookcaseId, st.section, st.fach)];
      s?.items.splice(Number(id), 1);
      break;
    }
    case 'save': {
      const k = key(st.bookcaseId, st.section, st.fach);
      const s = fachStatus[k];
      if (s) { s.status = 'saved'; shelfBooks[k] = s.items.filter(x => (x.title || '').trim()); }
      st.screen = 'case';
      toast(rootId, `Fach ${st.fach} gespeichert (Vorschau – noch nicht in der Datenbank).`);
      break;
    }
    case 'discard': {
      delete fachStatus[key(st.bookcaseId, st.section, st.fach)];
      st.screen = 'case';
      break;
    }
    default: return;
  }
  render(rootId);
  document.getElementById(rootId)?.scrollIntoView({ block: 'start' });
}

function onInput(rootId, e) {
  if (e.target.id === `${rootId}-q`) {
    views[rootId].state.query = e.target.value;
    const out = document.getElementById(`${rootId}-results`);
    if (out) out.innerHTML = renderResults(views[rootId].state.query);
    return;
  }
  const f = e.target.closest('[data-field]');
  if (!f) return;
  const st = views[rootId].state;
  const s = fachStatus[key(st.bookcaseId, st.section, st.fach)];
  const item = s?.items[Number(f.dataset.idx)];
  if (!item) return;
  item[f.dataset.field] = f.value;
  if (f.dataset.field === 'title') item.unsure = false;
}

function goBack(st) {
  if (st.book) { st.book = null; return; }
  if (st.screen === 'search') { st.screen = 'start'; return; }
  if (st.screen === 'fach') { st.screen = 'case'; return; }
  if (st.screen === 'film' || st.screen === 'review') { st.recording = false; st.screen = 'case'; }
  else if (st.screen === 'case') Object.assign(st, { screen: 'room', bookcaseId: null });
  else if (st.screen === 'room') Object.assign(st, { screen: 'place', roomId: null });
  else if (st.screen === 'place') Object.assign(st, { screen: 'places', placeId: null });
  else st.screen = 'start';
}

// ---------------------------------------------------------------- Vorschau: Aufnahme & Analyse
let recTimer = null;
function startRecording(rootId) {
  const st = views[rootId].state;
  st.recording = true;
  st.recStart = Date.now();
  render(rootId);
  clearInterval(recTimer);
  recTimer = setInterval(() => {
    const t = document.getElementById(`${rootId}-rec-time`);
    if (!t || !views[rootId].state.recording) { clearInterval(recTimer); return; }
    t.textContent = `${Math.floor((Date.now() - st.recStart) / 1000)} s`;
  }, 250);
}

function stopRecording(rootId) {
  clearInterval(recTimer);
  const st = views[rootId].state;
  const k = key(st.bookcaseId, st.section, st.fach);
  fachStatus[k] = { status: 'analysing', items: [] };
  const fach = st.fach;
  Object.assign(st, { recording: false, screen: 'case' });
  render(rootId);
  toast(rootId, `Fach ${fach} wird analysiert. Du kannst schon das nächste Fach filmen.`);
  setTimeout(() => {
    if (fachStatus[k]?.status !== 'analysing') return;
    fachStatus[k] = { status: 'review', items: PREVIEW_ITEMS.map(x => ({ ...x })) };
    if (views[rootId].state.screen === 'case') render(rootId);
  }, 4000);
}

function toast(rootId, text) {
  const el = document.getElementById(rootId);
  if (!el) return;
  const t = document.createElement('div');
  t.className = 'lib-toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  el.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ---------------------------------------------------------------- Hilfen
const key = (caseId, sec, fach) => `${caseId}:${sec}:${fach}`;
const place = (st) => lib.places.find(p => p.id === st.placeId);
const room = (st) => lib.rooms.find(r => r.id === st.roomId);
const bookcase = (st) => lib.bookcases.find(b => b.id === st.bookcaseId);
const roomsOf = (placeId) => lib.rooms.filter(r => r.placeId === placeId);
const casesOf = (roomId) => lib.bookcases.filter(b => b.roomId === roomId);

function layerText(b) {
  const s = b.sections || [];
  return s.length > 1 ? `${s.length} Abschnitte (${s.map(x => x.layers).join('/')} Fächer)` : `${totalLayers(b)} Fächer`;
}
function sizeText(b) { return b.widthM ? `B ${num(b.widthM)} m · H ${num(b.heightM)} m` : (b.note || ''); }
function fachName(b, sec, fach) {
  return (b.sections || []).length > 1 ? `Abschnitt ${sec + 1} · Fach ${fach}` : `Fach ${fach}`;
}
function allFächer(b) {
  const out = [];
  (b.sections || []).forEach((s, sec) => { for (let f = 1; f <= s.layers; f++) out.push({ sec, fach: f }); });
  return out;
}
function nextOpenFach(caseId) {
  const b = lib.bookcases.find(x => x.id === caseId);
  return allFächer(b).find(({ sec, fach }) => !fachStatus[key(caseId, sec, fach)]);
}
function bounds(rooms) {
  return { w: Math.max(...rooms.map(r => r.plan.x + r.plan.w)), h: Math.max(...rooms.map(r => r.plan.y + r.plan.h)) };
}
function box(p, ox, oy, W, H) {
  return `left:${pct((p.x - ox) / W)};top:${pct((p.y - oy) / H)};width:${pct(p.w / W)};height:${pct(p.h / H)}`;
}

function header(st, title, crumb) {
  const back = st.screen === 'start' ? '' :
    '<button type="button" class="lib-back" data-act="back" aria-label="Zurück"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></button>';
  return `<div class="lib-head">${back}<div class="lib-head-text"><h3 class="lib-title">${esc(title)}</h3>${crumb ? `<span class="lib-crumb">${esc(crumb)}</span>` : ''}</div></div>`;
}

// ---------------------------------------------------------------- Darstellung
function render(rootId) {
  const el = document.getElementById(rootId);
  const v = views[rootId];
  if (!el || !lib) return;
  const st = v.state;
  const cap = v.mode === 'capture';
  let html = '';
  if (st.screen === 'start') html = cap ? renderCaptureStart(st) : renderStart(st);
  else if (st.screen === 'places') html = renderPlaces(st, cap);
  else if (st.screen === 'place') html = renderPlace(st, cap);
  else if (st.screen === 'room') html = renderRoom(st, cap);
  else if (st.screen === 'case') html = cap ? renderCaptureCase(st) : renderCase(st);
  else if (st.screen === 'film') html = renderFilm(st, rootId);
  else if (st.screen === 'review') html = renderReview(st);
  else if (st.screen === 'fach') html = renderFach(st);
  else if (st.screen === 'search') html = renderSearch(st, rootId);
  if (st.book) html += renderBookSheet(st);
  el.innerHTML = `<div class="card lib-card${cap ? ' mode-capture' : ''}">${html}</div>`;
  if (st.screen === 'search' && !st.book) document.getElementById(`${rootId}-q`)?.focus();
  el.querySelector('.is-hl-book')?.scrollIntoView({ block: 'center' });
}

function renderStart(st) {
  return header(st, 'Meine Bibliothek', '') + `
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

function renderCaptureStart(st) {
  return header(st, 'Erfassen', 'Bücher aufnehmen') + `
    <button type="button" class="lib-choice" data-act="film-shelf">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="14" height="12" rx="2"></rect><path d="M16 10l6-3v10l-6-3z"></path></svg>
      <span><span class="lib-choice-title">Regal filmen</span><span class="lib-muted">Regal wählen, Fach für Fach abfilmen, Ergebnis prüfen</span></span>
    </button>
    <button type="button" class="lib-choice" data-act="barcode">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 5v14M7 5v14M10 5v14M14 5v14M16 5v14M20 5v14"></path></svg>
      <span><span class="lib-choice-title">Einzelnes Buch per Barcode</span><span class="lib-muted">Für ein neues Buch: ISBN scannen</span></span>
    </button>`;
}

function renderPlaces(st, cap) {
  const parts = lib.places.map(p => {
    const nCases = lib.bookcases.filter(b => b.placeId === p.id).length;
    const nRooms = roomsOf(p.id).filter(r => r.hasBooks).length;
    if (!p.hasPlan) {
      return `<button type="button" class="lib-floor lib-floor-off" disabled><span class="lib-floor-name">${esc(p.name)}</span><span class="lib-muted">Noch kein Grundriss</span></button>`;
    }
    return `<button type="button" class="lib-floor" data-act="place" data-id="${esc(p.id)}"><span class="lib-floor-name">${esc(p.name)}</span><span class="lib-muted">${nRooms} Räume mit Büchern · ${nCases} Regale</span></button>`;
  });
  const [first, ...rest] = parts;
  return header(st, 'Wohin?', cap ? 'Erfassen' : 'Meine Bibliothek') + `
    <div class="lib-house">
      <svg class="lib-roof" viewBox="0 0 330 70" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 68 L165 4 L324 68"></path></svg>
      ${first || ''}
      <div class="lib-ground" aria-hidden="true"></div>
      ${rest.join('')}
    </div>`;
}

function renderPlace(st, cap) {
  const p = place(st);
  const rooms = roomsOf(p.id);
  if (!rooms.length) return header(st, p.name, '') + '<p class="lib-muted">Noch kein Grundriss.</p>';
  const { w, h } = bounds(rooms);
  const cases = lib.bookcases.filter(b => b.placeId === p.id);
  const roomEls = rooms.map(r => r.hasBooks
    ? `<button type="button" class="lib-room lib-room-books${st.hl?.roomId === r.id ? ' is-hl' : ''}" style="${box(r.plan, 0, 0, w, h)}" data-act="room" data-id="${esc(r.id)}" aria-label="${esc(r.name)}, ${casesOf(r.id).length} Regale"><span class="lib-room-name">${esc(r.name)}</span><span class="lib-room-count">${casesOf(r.id).length} Regale</span></button>`
    : `<div class="lib-room" style="${box(r.plan, 0, 0, w, h)}"><span class="lib-room-small">${esc(r.name)}</span></div>`).join('');
  const caseEls = cases.map(b => `<div class="lib-shelf${st.hl?.caseId === b.id ? ' is-hl' : ''}" style="${box(b.plan, 0, 0, w, h)}" aria-hidden="true"></div>`).join('');
  const hlNote = st.hl ? `<p class="lib-hl-note">Das Buch steht im Raum <b>${esc(lib.rooms.find(r => r.id === st.hl.roomId)?.name)}</b>, ${esc(lib.bookcases.find(b => b.id === st.hl.caseId)?.name)}. Raum antippen.</p>` : '';
  return header(st, p.name, `${cap ? 'Erfassen' : 'Meine Bibliothek'} · Raum antippen`) + hlNote + `
    <div class="lib-plan" style="aspect-ratio:${w} / ${h}">${roomEls}${caseEls}</div>
    <div class="lib-legend"><span class="lib-shelf lib-legend-swatch" aria-hidden="true"></span>Schraffiert = Regal</div>`;
}

function renderRoom(st, cap) {
  const r = room(st);
  const cases = casesOf(r.id);
  const pad = 0.3;
  const ox = r.plan.x - pad, oy = r.plan.y - pad, W = r.plan.w + 2 * pad, H = r.plan.h + 2 * pad;
  const caseEls = cases.map((b, i) =>
    `<button type="button" class="lib-shelf lib-shelf-btn${st.hl?.caseId === b.id ? ' is-hl' : ''}" style="${box(b.plan, ox, oy, W, H)}" data-act="case" data-id="${esc(b.id)}" aria-label="${esc(b.name)}"><span class="lib-badge">${i + 1}</span></button>`).join('');
  const list = cases.map((b, i) => {
    const done = cap ? allFächer(b).filter(({ sec, fach }) => fachStatus[key(b.id, sec, fach)]?.status === 'saved').length : 0;
    const extra = cap ? ` · ${done}/${totalLayers(b)} erfasst` : '';
    return `<button type="button" class="lib-row${st.hl?.caseId === b.id ? ' is-hl' : ''}" data-act="case" data-id="${esc(b.id)}"><span class="lib-row-main"><span class="lib-badge">${i + 1}</span>${esc(b.name)}</span><span class="lib-muted">${esc(layerText(b) + extra)}</span></button>`;
  }).join('');
  return header(st, r.name, `${place(st)?.name || ''} · Regal antippen`) + `
    <div class="lib-plan" style="aspect-ratio:${W} / ${H}">
      <div class="lib-room lib-room-books lib-room-frame" style="${box(r.plan, ox, oy, W, H)}"></div>${caseEls}
    </div>
    <div class="lib-list">${list}</div>`;
}

function spines(items, limit = 60) {
  return items.slice(0, limit).map((it, i) => {
    const w = 10 + (it.title.length % 5) * 3, h = 70 + (it.title.length * 7 % 30);
    return `<span class="lib-spine" style="width:${w}px;height:${h}%;background:${SPINE_COLORS[i % SPINE_COLORS.length]}"></span>`;
  }).join('');
}

function renderCase(st) {
  const b = bookcase(st);
  const sections = b.sections || [{ layers: 1 }];
  const info = [sizeText(b), layerText(b)].filter(Boolean).join(' · ');
  const total = allFächer(b).reduce((n, { sec, fach }) => n + (shelfBooks[key(b.id, sec, fach)]?.length || 0), 0);
  let front;
  if (sections.length > 1) {
    const cols = sections.map((s, si) => {
      const fächer = Array.from({ length: s.layers }, (_, k) => {
        const items = shelfBooks[key(b.id, si, k + 1)] || [];
        return `<button type="button" class="lib-sec-fach${items.length ? ' has-books' : ''}" data-act="open-fach" data-id="${si}:${k + 1}" aria-label="Abschnitt ${si + 1}, Fach ${k + 1}: ${items.length} Bücher"><span>Fach ${k + 1}</span>${items.length ? `<b>${items.length}</b>` : ''}</button>`;
      }).join('');
      return `<div class="lib-sec"><span class="lib-sec-name">Abschnitt ${si + 1}</span>${fächer}</div>`;
    }).join('');
    front = `<div class="lib-front"><div class="lib-secs">${cols}</div>${b.baseCabinet ? '<div class="lib-base">Unterschrank (keine Bücher)</div>' : ''}</div>`;
  } else {
    front = `<div class="lib-front">` + Array.from({ length: sections[0].layers }, (_, k) => {
      const kk = key(b.id, 0, k + 1);
      const items = shelfBooks[kk] || [];
      const hl = st.hl?.k === kk ? ' is-hl' : '';
      if (!items.length) {
        return `<div class="lib-fach"><span class="lib-fach-label">Fach ${k + 1}${k === 0 ? ' (oben)' : ''}</span><span class="lib-muted">Noch nicht erfasst</span></div>`;
      }
      return `<button type="button" class="lib-fach lib-fach-books${hl}" data-act="open-fach" data-id="0:${k + 1}" aria-label="Fach ${k + 1}: ${items.length} Bücher anzeigen">
        <span class="lib-fach-top"><span class="lib-fach-label">Fach ${k + 1}${k === 0 ? ' (oben)' : ''}</span><span class="lib-muted">${items.length} Bücher ›</span></span>
        <span class="lib-spines" aria-hidden="true">${spines(items)}</span></button>`;
    }).join('') + `</div>`;
  }
  return header(st, b.name, `${place(st)?.name || ''} › ${room(st)?.name || ''}`) + `
    <p class="lib-info">${esc(info)} · ${total} Bücher${b.note && b.widthM ? ` · ${esc(b.note)}` : ''}</p>${front}`;
}

function renderFach(st) {
  const b = bookcase(st);
  const k = key(b.id, st.section, st.fach);
  const items = shelfBooks[k] || [];
  const rows = items.map((it, i) => `
    <button type="button" class="lib-book${st.hl?.k === k && st.hl?.idx === i ? ' is-hl is-hl-book' : ''}" data-act="book" data-id="${k}|${i}">
      <span class="lib-book-pos">${i + 1}</span>
      <span class="lib-book-text"><span class="lib-book-title">${esc(it.title)}</span>${it.author ? `<span class="lib-muted">${esc(it.author)}</span>` : ''}</span>
      ${it.kind && it.kind !== 'book' ? `<span class="lib-kind">${KIND_LABEL[it.kind]}</span>` : ''}
    </button>`).join('');
  return header(st, fachName(b, st.section, st.fach), `${room(st)?.name || ''} › ${b.name}`) + `
    <p class="lib-info">${items.length} Bücher · von links nach rechts</p>
    <div class="lib-books">${rows || '<p class="lib-muted">Noch nicht erfasst.</p>'}</div>`;
}

function whereText(k, idx) {
  const [caseId, sec, fach] = k.split(':');
  const b = lib.bookcases.find(x => x.id === caseId);
  const r = lib.rooms.find(x => x.id === b?.roomId);
  return `${r?.name || ''} › ${b?.name || ''} › ${fachName(b, Number(sec), Number(fach))} · ${idx + 1}. von links`;
}

function renderBookSheet(st) {
  const { k, idx } = st.book;
  const it = shelfBooks[k]?.[idx];
  if (!it) return '';
  return `
    <div class="lib-sheet-bg">
      <div class="lib-sheet" role="dialog" aria-label="Buchdetails">
        <span class="lib-sheet-title">${esc(it.title)}</span>
        <span class="lib-muted">${esc(it.author || 'Autor unbekannt')}${it.kind && it.kind !== 'book' ? ` · ${KIND_LABEL[it.kind]}` : ''}</span>
        <span class="lib-where"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>${esc(whereText(k, idx))}</span>
        <div class="lib-actions">
          <button type="button" class="btn btn-secondary" data-act="close-book">Schließen</button>
          <button type="button" class="btn lib-gold" data-act="locate">Im Grundriss zeigen</button>
        </div>
      </div>
    </div>`;
}

function renderResults(query) {
  const q = (query || '').trim().toLowerCase();
  if (q.length < 2) return '<p class="lib-muted">Mindestens 2 Buchstaben eingeben.</p>';
  const hits = [];
  for (const [k, items] of Object.entries(shelfBooks)) {
    items.forEach((it, idx) => {
      if (`${it.title} ${it.author}`.toLowerCase().includes(q)) hits.push({ k, idx, it });
    });
  }
  if (!hits.length) return '<p class="lib-muted">Nichts gefunden.</p>';
  return `<p class="lib-muted">${hits.length} Treffer</p>` + hits.slice(0, 50).map(({ k, idx, it }) => `
    <button type="button" class="lib-book" data-act="book" data-id="${k}|${idx}">
      <span class="lib-book-text"><span class="lib-book-title">${esc(it.title)}</span>
      ${it.author ? `<span class="lib-muted">${esc(it.author)}</span>` : ''}
      <span class="lib-where-small">${esc(whereText(k, idx))}</span></span>
    </button>`).join('');
}

function renderSearch(st, rootId) {
  return header(st, 'Buch suchen', 'Meine Bibliothek') + `
    <label class="lib-sr" for="${rootId}-q">Titel oder Autor</label>
    <input id="${rootId}-q" type="search" class="lib-input lib-search-input" placeholder="Titel oder Autor" value="${esc(st.query)}" autocomplete="off">
    <div id="${rootId}-results" class="lib-books">${renderResults(st.query)}</div>
    <p class="lib-muted lib-small">Vorschau: durchsucht die Beispieldaten und die in „Erfassen“ gespeicherten Fächer.</p>`;
}

const STATUS = {
  none: { label: 'Noch nicht erfasst', cls: '', action: 'Filmen' },
  analysing: { label: 'Wird analysiert …', cls: 'is-busy', action: '' },
  review: { label: 'Bitte prüfen', cls: 'is-review', action: 'Prüfen' },
  saved: { label: 'Gespeichert', cls: 'is-saved', action: 'Neu filmen' }
};

function renderCaptureCase(st) {
  const b = bookcase(st);
  const list = allFächer(b);
  const saved = list.filter(({ sec, fach }) => fachStatus[key(b.id, sec, fach)]?.status === 'saved').length;
  const next = nextOpenFach(b.id);
  const rows = list.map(({ sec, fach }) => {
    const s = fachStatus[key(b.id, sec, fach)];
    const S = STATUS[s?.status || 'none'];
    const count = s?.status === 'review' || s?.status === 'saved' ? ` · ${s.items.length} Einträge` : '';
    const btn = S.action ? `<button type="button" class="lib-film" data-act="fach" data-id="${sec}:${fach}">${S.action}</button>` : '<span class="lib-spinner" aria-hidden="true"></span>';
    return `<div class="lib-fach lib-fach-cap ${S.cls}"><span class="lib-fach-label">${esc(fachName(b, sec, fach))}${fach === 1 ? ' (oben)' : ''}</span><span class="lib-status">${S.label}${count}</span>${btn}</div>`;
  }).join('');
  return header(st, b.name, `Erfassen · ${room(st)?.name || ''}`) + `
    <p class="lib-info">${esc([sizeText(b), layerText(b)].filter(Boolean).join(' · '))} · ${saved}/${list.length} Fächer gespeichert</p>
    ${next ? `<button type="button" class="btn lib-primary" data-act="next">Nächstes Fach filmen: ${esc(fachName(b, next.sec, next.fach))}</button>` : ''}
    <div class="lib-front">${rows}</div>`;
}

function renderFilm(st, rootId) {
  const b = bookcase(st);
  const rtl = st.direction === 'rtl';
  const arrow = rtl
    ? '<path d="M44 12 H6 M14 4 L6 12 L14 20"></path>'
    : '<path d="M4 12 H42 M34 4 L42 12 L34 20"></path>';
  return header(st, `${fachName(b, st.section, st.fach)} filmen`, `${b.name} · ${room(st)?.name || ''}`) + `
    <div class="lib-cam${st.recording ? ' is-rec' : ''}">
      <div class="lib-cam-line lib-cam-top"><span>oberes Brett</span></div>
      <div class="lib-cam-line lib-cam-bottom"><span>unteres Brett</span></div>
      <svg class="lib-cam-arrow" width="48" height="24" viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${arrow}</svg>
      ${st.recording ? `<span class="lib-cam-rec"><span class="lib-rec-dot"></span><span id="${rootId}-rec-time">0 s</span></span>` : '<span class="lib-cam-note">Vorschau – Kamera folgt</span>'}
    </div>
    <ul class="lib-tips">
      <li>Handy <b>quer</b> halten.</li>
      <li>Abstand so wählen, dass oberes und unteres Brett an den Linien liegen.</li>
      <li>Zügig und gleichmäßig ${rtl ? '<b>von rechts nach links</b>' : '<b>von links nach rechts</b>'} am Fach entlang.</li>
      <li>Licht einschalten – dann werden die Bilder schärfer.</li>
    </ul>
    <div class="lib-dir" role="group" aria-label="Richtung">
      <button type="button" class="lib-dir-btn${rtl ? ' is-on' : ''}" data-act="dir" data-id="rtl" aria-pressed="${rtl}">← von rechts</button>
      <button type="button" class="lib-dir-btn${rtl ? '' : ' is-on'}" data-act="dir" data-id="ltr" aria-pressed="${!rtl}">von links →</button>
    </div>
    ${st.recording
      ? '<button type="button" class="btn lib-rec-btn is-stop" data-act="rec-stop">Aufnahme beenden</button>'
      : '<button type="button" class="btn lib-rec-btn" data-act="rec-start">Aufnahme starten</button>'}`;
}

function renderReview(st) {
  const b = bookcase(st);
  const s = fachStatus[key(st.bookcaseId, st.section, st.fach)] || { items: [] };
  const unsure = s.items.filter(x => x.unsure).length;
  const rows = s.items.map((it, i) => `
    <div class="lib-item${it.unsure ? ' is-unsure' : ''}">
      <span class="lib-item-pos">${i + 1}</span>
      <div class="lib-item-fields">
        <label class="lib-sr" for="t${i}">Titel ${i + 1}</label>
        <input id="t${i}" class="lib-input" data-field="title" data-idx="${i}" value="${esc(it.title)}">
        <label class="lib-sr" for="a${i}">Autor ${i + 1}</label>
        <input id="a${i}" class="lib-input lib-input-small" data-field="author" data-idx="${i}" value="${esc(it.author)}" placeholder="Autor">
        <span class="lib-muted">${KIND_LABEL[it.kind] || ''}${it.unsure ? ' · bitte prüfen' : ''}</span>
      </div>
      <button type="button" class="lib-del" data-act="del" data-id="${i}" aria-label="Eintrag ${i + 1} entfernen">✕</button>
    </div>`).join('');
  return header(st, `${fachName(b, st.section, st.fach)} prüfen`, `${b.name} · ${room(st)?.name || ''}`) + `
    <p class="lib-info">${s.items.length} Einträge · ${unsure} unsicher · von links nach rechts · <i>Beispieldaten (Vorschau)</i></p>
    <div class="lib-items">${rows}</div>
    <div class="lib-actions">
      <button type="button" class="btn btn-secondary" data-act="discard">Verwerfen</button>
      <button type="button" class="btn lib-primary" data-act="save">Speichern</button>
    </div>`;
}
