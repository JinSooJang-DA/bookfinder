// src/settings-view.js — Einstellungen: Räume & Regale bearbeiten (speichert direkt in Firestore)
import { loadLibrary, saveBookcase, deleteBookcase, saveRoom, totalLayers } from './library.js';
import { invalidateLibrary } from './library-view.js';

const ROOT = 'settingsView';
const DEPTH = 0.35; // Regaltiefe im Grundriss (m)
let lib = null;
let st = { screen: 'start', edit: null, confirmDelete: false, busy: false, msg: '' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => (n == null || n === '' ? '' : String(n).replace('.', ','));
const parseNum = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const pct = (n) => `${Math.round(n * 10000) / 100}%`;
const r2 = (n) => Math.round(n * 100) / 100;

export async function openSettingsView() {
  st = { screen: 'start', edit: null, confirmDelete: false, busy: false, msg: '' };
  const el = document.getElementById(ROOT);
  if (!el) return;
  if (!el.dataset.bound) {
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    el.addEventListener('change', onInput);
    el.dataset.bound = '1';
  }
  render();
}

async function ensureLib(force = false) {
  if (!lib || force) lib = await loadLibrary();
  return lib;
}

// ---------------------------------------------------------------- Ereignisse
async function onClick(e) {
  const btn = e.target.closest('[data-act]');
  const plan = e.target.closest('[data-plan]');
  if (plan && !btn && st.edit) { placeOnPlan(e, plan); return; }
  if (!btn || btn.disabled || st.busy) return;
  const { act, id } = btn.dataset;
  switch (act) {
    case 'structure':
      st.screen = 'structure';
      render();
      try { await ensureLib(true); } catch (err) { st.msg = 'Laden fehlgeschlagen: ' + err.message; }
      break;
    case 'old-manage': window.switchView('manageView'); return;
    case 'back':
      if (st.screen === 'edit') { st.screen = 'structure'; st.edit = null; st.confirmDelete = false; }
      else st.screen = 'start';
      st.msg = '';
      break;
    case 'edit': {
      const b = lib.bookcases.find(x => x.id === id);
      st.edit = JSON.parse(JSON.stringify(b));
      st.edit.orient = b.plan.w >= b.plan.h ? 'h' : 'v';
      st.screen = 'edit'; st.confirmDelete = false; st.msg = '';
      break;
    }
    case 'add': {
      const r = lib.rooms.find(x => x.id === id);
      const n = lib.bookcases.filter(b => b.roomId === r.id).length + 1;
      const w = 1.0;
      st.edit = {
        id: `${r.id.replace(/^.*?-/, '')}-${Date.now().toString(36)}`, isNew: true,
        placeId: r.placeId, roomId: r.id, name: `Regal ${n}`, order: n, widthM: w, heightM: 2.0, note: '', baseCabinet: false,
        sections: [{ layers: 5 }], orient: 'h',
        plan: { x: r2(r.plan.x + r.plan.w / 2 - w / 2), y: r2(r.plan.y + r.plan.h / 2 - DEPTH / 2), w, h: DEPTH }
      };
      st.screen = 'edit'; st.confirmDelete = false; st.msg = '';
      break;
    }
    case 'toggle-room': {
      const r = lib.rooms.find(x => x.id === id);
      st.busy = true; render();
      try { await saveRoom({ ...r, hasBooks: !r.hasBooks }); r.hasBooks = !r.hasBooks; invalidateLibrary(); }
      catch (err) { st.msg = 'Speichern fehlgeschlagen: ' + err.message; }
      st.busy = false;
      break;
    }
    case 'sec-add': st.edit.sections.push({ layers: st.edit.sections.at(-1)?.layers || 5 }); break;
    case 'sec-del': if (st.edit.sections.length > 1) st.edit.sections.splice(Number(id), 1); break;
    case 'orient': setOrient(id); break;
    case 'save': await save(); break;
    case 'delete':
      if (!st.confirmDelete) { st.confirmDelete = true; break; }
      st.busy = true; render();
      try {
        await deleteBookcase(st.edit.id);
        invalidateLibrary();
        await ensureLib(true);
        st = { ...st, screen: 'structure', edit: null, confirmDelete: false, msg: 'Regal gelöscht.' };
      } catch (err) { st.msg = 'Löschen fehlgeschlagen: ' + err.message; }
      st.busy = false;
      break;
    default: return;
  }
  render();
}

function onInput(e) {
  const f = e.target.closest('[data-f]');
  if (!f || !st.edit) return;
  const name = f.dataset.f;
  if (name === 'name' || name === 'note') st.edit[name] = f.value;
  if (name === 'baseCabinet') st.edit.baseCabinet = f.checked;
  if (name === 'widthM' || name === 'heightM') {
    st.edit[name] = parseNum(f.value);
    if (name === 'widthM' && st.edit.widthM) { resizePlan(); refreshPlan(); }
  }
  if (name === 'layers') {
    const v = Math.max(1, Math.min(15, parseInt(f.value, 10) || 1));
    st.edit.sections[Number(f.dataset.idx)].layers = v;
    const t = document.getElementById('settings-total');
    if (t) t.textContent = `${totalLayers(st.edit)} Fächer insgesamt`;
  }
}

// Länge im Grundriss folgt der Breite; Ausrichtung waagrecht/senkrecht
function resizePlan() {
  const p = st.edit.plan, w = st.edit.widthM || Math.max(p.w, p.h);
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  const [pw, ph] = st.edit.orient === 'h' ? [w, DEPTH] : [DEPTH, w];
  st.edit.plan = { x: r2(cx - pw / 2), y: r2(cy - ph / 2), w: r2(pw), h: r2(ph) };
}
function setOrient(o) { st.edit.orient = o; resizePlan(); }

function placeOnPlan(e, planEl) {
  const rect = planEl.getBoundingClientRect();
  const { ox, oy, W, H } = JSON.parse(planEl.dataset.plan);
  const mx = ox + ((e.clientX - rect.left) / rect.width) * W;
  const my = oy + ((e.clientY - rect.top) / rect.height) * H;
  const p = st.edit.plan;
  st.edit.plan = { ...p, x: r2(mx - p.w / 2), y: r2(my - p.h / 2) };
  refreshPlan();
}

function refreshPlan() {
  const holder = document.getElementById('settings-plan');
  if (holder) holder.innerHTML = renderPlan();
}

async function save() {
  const b = st.edit;
  if (!(b.name || '').trim()) { st.msg = 'Bitte einen Namen eingeben.'; return; }
  st.busy = true; render();
  try {
    const { isNew, orient, ...data } = b;
    data.name = data.name.trim();
    data.sections = data.sections.map(s => ({ layers: s.layers }));
    if (!data.note) delete data.note;
    await saveBookcase(data);
    invalidateLibrary();
    await ensureLib(true);
    st = { ...st, screen: 'structure', edit: null, confirmDelete: false, msg: `„${data.name}“ gespeichert.` };
  } catch (err) {
    st.msg = 'Speichern fehlgeschlagen: ' + err.message;
  }
  st.busy = false;
}

// ---------------------------------------------------------------- Darstellung
function header(title, crumb, back = true) {
  const b = back ? '<button type="button" class="lib-back" data-act="back" aria-label="Zurück"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></button>' : '';
  return `<div class="lib-head">${b}<div class="lib-head-text"><h3 class="lib-title">${esc(title)}</h3>${crumb ? `<span class="lib-crumb">${esc(crumb)}</span>` : ''}</div></div>`;
}

function render() {
  const el = document.getElementById(ROOT);
  if (!el) return;
  let html = '';
  if (st.screen === 'start') html = renderStart();
  else if (st.screen === 'structure') html = renderStructure();
  else if (st.screen === 'edit') html = renderEdit();
  const msg = st.msg ? `<p class="set-msg" role="status">${esc(st.msg)}</p>` : '';
  el.innerHTML = `<div class="card lib-card mode-settings">${html}${msg}</div>`;
}

function renderStart() {
  return header('Einstellungen', '', false) + `
    <button type="button" class="lib-choice set-choice" data-act="structure">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="1"></rect><path d="M3 12h9M12 3v18M16 7v3"></path></svg>
      <span><span class="lib-choice-title">Räume & Regale</span><span class="lib-muted">Regale anlegen, Größe, Abschnitte und Fächer ändern, im Grundriss platzieren</span></span>
    </button>
    <button type="button" class="lib-choice set-choice" data-act="old-manage">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="6" rx="8" ry="3"></ellipse><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"></path><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"></path></svg>
      <span><span class="lib-choice-title">Alte Datenverwaltung</span><span class="lib-muted">Sprache und Löschen alter Testdaten</span></span>
    </button>`;
}

function sizeText(b) { return b.widthM ? `B ${num(b.widthM)} m · H ${num(b.heightM)} m` : (b.note || ''); }
function layerText(b) {
  const s = b.sections || [];
  return s.length > 1 ? `${s.length} Abschnitte (${s.map(x => x.layers).join('/')})` : `${totalLayers(b)} Fächer`;
}

function renderStructure() {
  if (!lib) return header('Räume & Regale', 'Einstellungen') + '<p class="lib-muted">Wird geladen …</p>';
  const parts = lib.places.map(p => {
    const rooms = lib.rooms.filter(r => r.placeId === p.id);
    if (!rooms.length) return `<h4 class="set-place">${esc(p.name)}</h4><p class="lib-muted">Noch kein Grundriss.</p>`;
    const roomBlocks = rooms.map(r => {
      const cases = lib.bookcases.filter(b => b.roomId === r.id);
      const rows = cases.map(b => `
        <button type="button" class="lib-row set-row" data-act="edit" data-id="${esc(b.id)}">
          <span class="lib-row-main">${esc(b.name)}</span>
          <span class="lib-muted">${esc([sizeText(b), layerText(b)].filter(Boolean).join(' · '))} ›</span>
        </button>`).join('');
      return `
        <div class="set-room${r.hasBooks ? '' : ' is-off'}">
          <div class="set-room-head">
            <span class="set-room-name">${esc(r.name)}</span>
            <label class="set-switch"><input type="checkbox" data-act="toggle-room" data-id="${esc(r.id)}" ${r.hasBooks ? 'checked' : ''}> Bücher in diesem Raum</label>
          </div>
          ${r.hasBooks ? `${rows}<button type="button" class="set-add" data-act="add" data-id="${esc(r.id)}">+ Regal hinzufügen</button>` : ''}
        </div>`;
    }).join('');
    return `<h4 class="set-place">${esc(p.name)}</h4>${roomBlocks}`;
  }).join('');
  return header('Räume & Regale', 'Einstellungen') + parts;
}

function renderPlan() {
  const b = st.edit;
  const r = lib.rooms.find(x => x.id === b.roomId);
  const pad = 0.3;
  const ox = r.plan.x - pad, oy = r.plan.y - pad, W = r.plan.w + 2 * pad, H = r.plan.h + 2 * pad;
  const box = (p) => `left:${pct((p.x - ox) / W)};top:${pct((p.y - oy) / H)};width:${pct(p.w / W)};height:${pct(p.h / H)}`;
  const others = lib.bookcases.filter(x => x.roomId === r.id && x.id !== b.id)
    .map(x => `<div class="lib-shelf set-other" style="${box(x.plan)}" aria-hidden="true"></div>`).join('');
  return `
    <div class="lib-plan set-plan" style="aspect-ratio:${W} / ${H}" data-plan='${JSON.stringify({ ox, oy, W, H })}' role="img" aria-label="Grundriss ${esc(r.name)}: zum Platzieren antippen">
      <div class="lib-room lib-room-books lib-room-frame" style="${box(r.plan)}"></div>
      ${others}
      <div class="lib-shelf set-current" style="${box(b.plan)}"></div>
    </div>`;
}

function renderEdit() {
  const b = st.edit;
  const r = lib.rooms.find(x => x.id === b.roomId);
  const secRows = b.sections.map((s, i) => `
    <div class="set-sec">
      <label for="sec${i}">Abschnitt ${i + 1}</label>
      <input id="sec${i}" type="number" min="1" max="15" inputmode="numeric" class="lib-input set-num" data-f="layers" data-idx="${i}" value="${s.layers}">
      <span class="lib-muted">Fächer</span>
      ${b.sections.length > 1 ? `<button type="button" class="lib-del" data-act="sec-del" data-id="${i}" aria-label="Abschnitt ${i + 1} entfernen">✕</button>` : ''}
    </div>`).join('');
  return header(b.isNew ? 'Neues Regal' : b.name, `Einstellungen › ${r?.name || ''}`) + `
    <div class="set-form">
      <label for="set-name">Name</label>
      <input id="set-name" type="text" class="lib-input" data-f="name" value="${esc(b.name)}">
      <div class="set-two">
        <div><label for="set-w">Breite (m)</label><input id="set-w" type="text" inputmode="decimal" class="lib-input" data-f="widthM" value="${esc(num(b.widthM))}"></div>
        <div><label for="set-h">Höhe (m)</label><input id="set-h" type="text" inputmode="decimal" class="lib-input" data-f="heightM" value="${esc(num(b.heightM))}"></div>
      </div>
      <fieldset class="set-fieldset">
        <legend>Abschnitte und Fächer (Fach 1 = oben)</legend>
        ${secRows}
        <button type="button" class="set-add" data-act="sec-add">+ Abschnitt</button>
        <span id="settings-total" class="lib-muted">${totalLayers(b)} Fächer insgesamt</span>
      </fieldset>
      <label class="set-check"><input type="checkbox" data-f="baseCabinet" ${b.baseCabinet ? 'checked' : ''}> Unterschrank ohne Bücher</label>
      <label for="set-note">Notiz</label>
      <input id="set-note" type="text" class="lib-input" data-f="note" value="${esc(b.note || '')}" placeholder="z. B. Sammlung, ganze Wand …">
      <fieldset class="set-fieldset">
        <legend>Position im Grundriss – zum Verschieben antippen</legend>
        <div class="lib-dir" role="group" aria-label="Ausrichtung">
          <button type="button" class="lib-dir-btn${b.orient === 'h' ? ' is-on' : ''}" data-act="orient" data-id="h" aria-pressed="${b.orient === 'h'}">waagrecht ▬</button>
          <button type="button" class="lib-dir-btn${b.orient === 'v' ? ' is-on' : ''}" data-act="orient" data-id="v" aria-pressed="${b.orient === 'v'}">senkrecht ▮</button>
        </div>
        <div id="settings-plan">${renderPlan()}</div>
      </fieldset>
    </div>
    <div class="lib-actions">
      <button type="button" class="btn btn-secondary" data-act="back">Abbrechen</button>
      <button type="button" class="btn lib-gold" data-act="save" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Speichert …' : 'Speichern'}</button>
    </div>
    ${b.isNew ? '' : `<button type="button" class="set-delete${st.confirmDelete ? ' is-confirm' : ''}" data-act="delete">${st.confirmDelete ? 'Wirklich löschen? Nochmals tippen' : 'Regal löschen'}</button>`}`;
}
