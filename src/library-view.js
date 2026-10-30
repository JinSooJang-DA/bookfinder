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

export function openLibraryView() { return openView('libraryView'); }
export function openCaptureView() { return openView('captureView'); }

async function openView(rootId, { reset = true } = {}) {
  const v = views[rootId];
  if (reset) v.state = { screen: 'start', placeId: null, roomId: null, bookcaseId: null, section: 0, fach: null, direction: 'rtl', recording: false };
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
    case 'search': window.switchView('searchView'); return;
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
      const s = fachStatus[key(st.bookcaseId, st.section, st.fach)];
      if (s) s.status = 'saved';
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
  el.innerHTML = `<div class="card lib-card${cap ? ' mode-capture' : ''}">${html}</div>`;
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
    ? `<button type="button" class="lib-room lib-room-books" style="${box(r.plan, 0, 0, w, h)}" data-act="room" data-id="${esc(r.id)}" aria-label="${esc(r.name)}, ${casesOf(r.id).length} Regale"><span class="lib-room-name">${esc(r.name)}</span><span class="lib-room-count">${casesOf(r.id).length} Regale</span></button>`
    : `<div class="lib-room" style="${box(r.plan, 0, 0, w, h)}"><span class="lib-room-small">${esc(r.name)}</span></div>`).join('');
  const caseEls = cases.map(b => `<div class="lib-shelf" style="${box(b.plan, 0, 0, w, h)}" aria-hidden="true"></div>`).join('');
  return header(st, p.name, `${cap ? 'Erfassen' : 'Meine Bibliothek'} · Raum antippen`) + `
    <div class="lib-plan" style="aspect-ratio:${w} / ${h}">${roomEls}${caseEls}</div>
    <div class="lib-legend"><span class="lib-shelf lib-legend-swatch" aria-hidden="true"></span>Schraffiert = Regal</div>`;
}

function renderRoom(st, cap) {
  const r = room(st);
  const cases = casesOf(r.id);
  const pad = 0.3;
  const ox = r.plan.x - pad, oy = r.plan.y - pad, W = r.plan.w + 2 * pad, H = r.plan.h + 2 * pad;
  const caseEls = cases.map((b, i) =>
    `<button type="button" class="lib-shelf lib-shelf-btn" style="${box(b.plan, ox, oy, W, H)}" data-act="case" data-id="${esc(b.id)}" aria-label="${esc(b.name)}"><span class="lib-badge">${i + 1}</span></button>`).join('');
  const list = cases.map((b, i) => {
    const done = cap ? allFächer(b).filter(({ sec, fach }) => fachStatus[key(b.id, sec, fach)]?.status === 'saved').length : 0;
    const extra = cap ? ` · ${done}/${totalLayers(b)} erfasst` : '';
    return `<button type="button" class="lib-row" data-act="case" data-id="${esc(b.id)}"><span class="lib-row-main"><span class="lib-badge">${i + 1}</span>${esc(b.name)}</span><span class="lib-muted">${esc(layerText(b) + extra)}</span></button>`;
  }).join('');
  return header(st, r.name, `${place(st)?.name || ''} · Regal antippen`) + `
    <div class="lib-plan" style="aspect-ratio:${W} / ${H}">
      <div class="lib-room lib-room-books lib-room-frame" style="${box(r.plan, ox, oy, W, H)}"></div>${caseEls}
    </div>
    <div class="lib-list">${list}</div>`;
}

function renderCase(st) {
  const b = bookcase(st);
  const sections = b.sections || [{ layers: 1 }];
  const info = [sizeText(b), layerText(b)].filter(Boolean).join(' · ');
  let front;
  if (sections.length > 1) {
    const cols = sections.map((s, si) => {
      const fächer = Array.from({ length: s.layers }, (_, k) => `<div class="lib-sec-fach"><span>Fach ${k + 1}</span></div>`).join('');
      return `<div class="lib-sec"><span class="lib-sec-name">Abschnitt ${si + 1}</span>${fächer}</div>`;
    }).join('');
    front = `<div class="lib-front"><div class="lib-secs">${cols}</div>${b.baseCabinet ? '<div class="lib-base">Unterschrank (keine Bücher)</div>' : ''}</div>`;
  } else {
    front = `<div class="lib-front">` + Array.from({ length: sections[0].layers }, (_, k) =>
      `<div class="lib-fach"><span class="lib-fach-label">Fach ${k + 1}${k === 0 ? ' (oben)' : ''}</span><span class="lib-muted">Noch nicht erfasst</span></div>`).join('') + `</div>`;
  }
  return header(st, b.name, `${place(st)?.name || ''} › ${room(st)?.name || ''}`) + `
    <p class="lib-info">${esc(info)}${b.note && b.widthM ? ` · ${esc(b.note)}` : ''}</p>${front}`;
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
