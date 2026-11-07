// src/dev-tools.js — Entwicklerwerkzeuge (nur npm run dev): Bibliotheks-Aufbau anlegen und prüfen
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase.js';
import { loadLibrary, seedLibrary, totalLayers, countLegacyBooks, deleteLegacyBooks, loadShelfBooks, saveBookcase, splitBookcase, planSplit } from './library.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => (n == null ? '–' : String(n).replace('.', ','));

onAuthStateChanged(auth, (user) => {
  $('authState').textContent = user ? `Angemeldet als ${user.email}` : 'Nicht angemeldet';
  $('loginRow').style.display = user ? 'none' : 'flex';
  $('seedBtn').disabled = !user;
  $('reloadBtn').disabled = !user;
  $('countOldBtn').disabled = !user;
  $('tidyCheckBtn').disabled = !user;
  if (user) { refresh(); fillTidyRooms(); }
});

$('loginBtn').addEventListener('click', async () => {
  try {
    await signInWithEmailAndPassword(auth, $('email').value.trim(), $('password').value);
  } catch (err) {
    $('authState').textContent = 'Anmeldung fehlgeschlagen: ' + err.message;
  }
});

$('seedBtn').addEventListener('click', async () => {
  $('seedBtn').disabled = true;
  $('status').textContent = 'Startdaten werden angelegt …';
  try {
    const { written, skipped } = await seedLibrary();
    $('status').textContent = `Fertig: ${written} neu angelegt, ${skipped} schon vorhanden (unverändert).`;
    await refresh(false);
  } catch (err) {
    console.error(err);
    $('status').textContent = 'Fehler: ' + err.message;
  } finally {
    $('seedBtn').disabled = false;
  }
});

$('reloadBtn').addEventListener('click', () => refresh());

async function refresh(showStatus = true) {
  try {
    const { places, rooms, bookcases } = await loadLibrary();
    if (showStatus) {
      $('status').textContent = `In Firestore: ${places.length} Orte · ${rooms.length} Räume · ${bookcases.length} Regale`;
    }
    const roomName = Object.fromEntries(rooms.map(r => [r.id, r.name]));
    $('caseBody').innerHTML = bookcases
      .sort((a, b) => (roomName[a.roomId] || '').localeCompare(roomName[b.roomId] || '') || a.order - b.order)
      .map(b => `<tr><td>${esc(roomName[b.roomId] || b.roomId)}</td><td>${esc(b.name)}</td>` +
        `<td>${b.widthM ? `B ${num(b.widthM)} m · H ${num(b.heightM)} m` : '–'}</td>` +
        `<td>${(b.sections || []).length} · ${(b.sections || []).map(s => s.layers).join('/')} (${totalLayers(b)})</td>` +
        `<td>${esc(b.note || '')}</td></tr>`).join('');
    drawPlan(rooms.filter(r => r.placeId === 'wohnung'), bookcases.filter(b => b.placeId === 'wohnung'));
  } catch (err) {
    console.error(err);
    $('status').textContent = 'Laden fehlgeschlagen: ' + err.message;
  }
}

// Grundriss zur Kontrolle der Meter-Werte (1 m = 40 px)
function drawPlan(rooms, bookcases) {
  if (!rooms.length) { $('plan').innerHTML = ''; return; }
  const S = 40;
  const maxX = Math.max(...rooms.map(r => r.plan.x + r.plan.w));
  const maxY = Math.max(...rooms.map(r => r.plan.y + r.plan.h));
  const rect = (p, extra) => `<rect x="${p.x * S}" y="${p.y * S}" width="${p.w * S}" height="${p.h * S}" ${extra}/>`;
  const label = (p, text, size, color) =>
    `<text x="${(p.x + p.w / 2) * S}" y="${(p.y + p.h / 2) * S}" font-size="${size}" fill="${color}" text-anchor="middle" dominant-baseline="middle">${esc(text)}</text>`;
  $('plan').innerHTML =
    `<svg viewBox="-4 -4 ${maxX * S + 8} ${maxY * S + 8}" role="img" aria-label="Grundriss der Wohnung">` +
    rooms.map(r => rect(r.plan, r.hasBooks ? 'fill="rgba(201,169,110,0.06)" stroke="#c9a96e" stroke-width="1.5"' : 'fill="none" stroke="rgba(201,169,110,0.35)" stroke-dasharray="4 3"')).join('') +
    rooms.map(r => label(r.plan, r.name, r.hasBooks ? 11 : 8, r.hasBooks ? '#e2c48d' : '#8f7c60')).join('') +
    bookcases.map(b => rect(b.plan, 'fill="rgba(201,169,110,0.65)" stroke="#c9a96e"')).join('') +
    `</svg>` +
    `<div style="font-size:12px;color:#a8957a">Wohnung ca. ${num(Math.round(maxX * 10) / 10)} m × ${num(Math.round(maxY * 10) / 10)} m (aus der Skizze)</div>`;
}

// Alte Testdaten: erst zählen, dann zweimal bestätigen
let oldCount = null, confirmDelete = false;
$('countOldBtn').addEventListener('click', async () => {
  $('oldStatus').textContent = 'Zähle …';
  try {
    oldCount = await countLegacyBooks();
    confirmDelete = false;
    $('oldStatus').textContent = `${oldCount} alte Bücher gefunden.`;
    $('deleteOldBtn').disabled = oldCount === 0;
    $('deleteOldBtn').textContent = `Alle ${oldCount} alten Bücher löschen`;
  } catch (err) {
    $('oldStatus').textContent = 'Fehler: ' + err.message;
  }
});
$('deleteOldBtn').addEventListener('click', async () => {
  if (!confirmDelete) {
    confirmDelete = true;
    $('deleteOldBtn').textContent = `Wirklich ${oldCount} Bücher löschen? Nochmals klicken`;
    return;
  }
  $('deleteOldBtn').disabled = true;
  $('oldStatus').textContent = 'Lösche …';
  try {
    const n = await deleteLegacyBooks();
    $('oldStatus').textContent = `Fertig: ${n} alte Bücher gelöscht.`;
    $('deleteOldBtn').textContent = 'Alte Bücher löschen';
  } catch (err) {
    $('oldStatus').textContent = 'Fehler: ' + err.message;
    $('deleteOldBtn').disabled = false;
  }
  confirmDelete = false;
});

// ---------------------------------------------------------------- Regale prüfen & ordnen
// Nur Name, Reihenfolge (order) und Notiz-Verweise werden geändert. Alles andere am Regal bleibt.
let tidy = null; // { room, cases: [...], proposal: [{ id, name, order, note }] }

const GENERIC = /^\s*regal\s*\d+\s*[a-z]?\s*$/i;

async function fillTidyRooms() {
  try {
    const { rooms, bookcases } = await loadLibrary();
    const withCases = rooms.filter(r => bookcases.some(b => b.roomId === r.id))
      .sort((a, b) => (a.placeId || '').localeCompare(b.placeId || '') || (a.order || 0) - (b.order || 0));
    $('tidyRoom').innerHTML = withCases.map(r => {
      const n = bookcases.filter(b => b.roomId === r.id).length;
      return `<option value="${esc(r.id)}"${/schlaf/i.test(r.id) ? ' selected' : ''}>${esc(r.name)} (${n} Regale)</option>`;
    }).join('');
  } catch (err) {
    $('tidyStatus').textContent = 'Räume laden fehlgeschlagen: ' + err.message;
  }
}

// Nummerierung als Weg durch den Raum: Start in der gewählten Ecke (z. B. bei der Tür),
// dann immer zum nächstgelegenen noch nicht nummerierten Regal (Mittelpunkte im Grundriss).
function propose(cases, start = 'tl') {
  const center = (c) => c.plan ? { x: c.plan.x + c.plan.w / 2, y: c.plan.y + c.plan.h / 2 } : { x: 1e3, y: 1e3 };
  const corner = (pt) => ({ tl: pt.x + pt.y, tr: -pt.x + pt.y, bl: pt.x - pt.y, br: -pt.x - pt.y }[start]);
  const left = cases.slice();
  const ordered = [];
  left.sort((a, b) => corner(center(a)) - corner(center(b)));
  let cur = left.shift();
  while (cur) {
    ordered.push(cur);
    const c0 = center(cur);
    left.sort((a, b) => Math.hypot(center(a).x - c0.x, center(a).y - c0.y) - Math.hypot(center(b).x - c0.x, center(b).y - c0.y));
    cur = left.shift();
  }
  let n = 0;
  const rename = {};
  const out = ordered.map((c, i) => {
    // Eigene Namen ohne Zahl (z. B. "James-Bond-Regal") bleiben; nummerierte Namen werden neu durchgezählt
    const numbered = /\d/.test(c.name || '') || !(c.name || '').trim();
    const name = numbered ? `Regal ${++n}` : c.name.trim();
    if (numbered && (c.name || '').trim()) rename[c.name.trim().replace(/\s+/g, ' ')] = name;
    return { id: c.id, name, order: i + 1 };
  });
  // Verweise in Notizen ("unter Abschnitt 1 von Regal 2") an die neuen Namen anpassen
  out.forEach(p => {
    const c = cases.find(x => x.id === p.id);
    p.note = (c.note || '').replace(/Regal\s*\d+[a-z]?\b/gi, m => rename[m.trim().replace(/\s+/g, ' ')] || m);
  });
  return { out };
}

function problems(cases) {
  const list = [];
  const names = {};
  cases.forEach(c => { const k = (c.name || '').trim().toLowerCase(); (names[k] = names[k] || []).push(c); });
  Object.values(names).filter(v => v.length > 1).forEach(v => list.push(`Gleicher Name mehrfach: „${v[0].name}“ (${v.length}×)`));
  const orders = cases.map(c => c.order).sort((a, b) => a - b);
  if (orders.some((o, i) => o !== i + 1)) list.push(`Reihenfolge lückenhaft oder doppelt: ${orders.join(', ')}`);
  cases.forEach(c => {
    if (!(c.name || '').trim()) list.push(`Regal ${c.id} hat keinen Namen`);
    else if (c.name !== c.name.trim() || /\s{2,}/.test(c.name)) list.push(`Überflüssige Leerzeichen: „${c.name}“`);
    else if (!GENERIC.test(c.name) && /regal|teil|part|\d/i.test(c.name)) list.push(`Uneinheitlicher Name: „${c.name}“`);
    if (!c.plan) list.push(`${c.name}: keine Position im Grundriss`);
    if (!totalLayers(c)) list.push(`${c.name}: keine Fächer`);
  });
  return list;
}

$('tidyCheckBtn').addEventListener('click', async () => {
  $('tidyStatus').textContent = 'Prüfe …';
  $('tidySaveBtn').disabled = true;
  try {
    const [{ rooms, bookcases }, byFach] = await Promise.all([loadLibrary(), loadShelfBooks()]);
    const room = rooms.find(r => r.id === $('tidyRoom').value);
    const cases = bookcases.filter(b => b.roomId === room.id);
    const count = (id) => Object.entries(byFach).filter(([k]) => k.startsWith(id + ':')).reduce((n, [, v]) => n + v.length, 0);
    const { out } = propose(cases, $('tidyStart').value);
    tidy = { room, cases, proposal: out };
    const probs = problems(cases);
    const rows = out.map(p => {
      const c = cases.find(x => x.id === p.id);
      const changed = c.name !== p.name || c.order !== p.order || (c.note || '') !== p.note;
      return `<tr class="${changed ? 'changed' : ''}">
        <td>${esc(c.name)}<br><span style="color:#8f7c60;font-size:11px">${esc(c.id)} · Nr. ${c.order ?? '–'}</span></td>
        <td>${c.widthM ? `B ${num(c.widthM)} · H ${num(c.heightM)} m` : '–'}<br>${(c.sections || []).map(s => s.layers).join('/')} Fächer · ${count(c.id)} Bücher</td>
        <td><input data-tidy="name" data-id="${esc(p.id)}" value="${esc(p.name)}" aria-label="Neuer Name für ${esc(c.name)}"></td>
        <td style="width:56px"><input data-tidy="order" data-id="${esc(p.id)}" value="${p.order}" inputmode="numeric" aria-label="Neue Nummer"></td>
        <td>${p.note ? `<input data-tidy="note" data-id="${esc(p.id)}" value="${esc(p.note)}" aria-label="Notiz">` : ''}</td>
      </tr>`;
    }).join('');
    $('tidyOut').innerHTML =
      `<p class="${probs.length ? 'warn' : 'ok'}" style="margin:0">${probs.length ? 'Gefunden:<br>• ' + probs.map(esc).join('<br>• ') : 'Keine Probleme gefunden.'}</p>` +
      cases.filter(c => (c.sections || []).length > 1).map(c => `<p style="margin:0;font-size:13px;color:#c7b598">„${esc(c.name)}“ hat ${(c.sections || []).length} Abschnitte (${(c.sections || []).map(s => s.layers).join('/')} Fächer). <button type="button" class="secondary" data-split="${esc(c.id)}">In ${(c.sections || []).length} einzelne Regale aufteilen</button></p>`).join('') +
      tidyPlan(room, cases, out) +
      `<table><thead><tr><th>Jetzt</th><th>Größe</th><th>Neuer Name</th><th>Nr.</th><th>Notiz</th></tr></thead><tbody>${rows}</tbody></table>`;
    const changes = out.filter(p => { const c = cases.find(x => x.id === p.id); return c.name !== p.name || c.order !== p.order || (c.note || '') !== p.note; }).length;
    $('tidyStatus').textContent = changes ? `${changes} Regale würden geändert (orange markiert). Bitte prüfen, dann speichern.` : 'Alles schon einheitlich.';
    $('tidySaveBtn').disabled = !changes;
  } catch (err) {
    console.error(err);
    $('tidyStatus').textContent = 'Prüfen fehlgeschlagen: ' + err.message;
  }
});

$('tidyOut').addEventListener('input', (e) => {
  const f = e.target.closest('[data-tidy]');
  if (!f || !tidy) return;
  const p = tidy.proposal.find(x => x.id === f.dataset.id);
  if (!p) return;
  p[f.dataset.tidy] = f.dataset.tidy === 'order' ? Number(f.value) : f.value;
  $('tidySaveBtn').disabled = false;
});

$('tidySaveBtn').addEventListener('click', async () => {
  if (!tidy) return;
  const names = tidy.proposal.map(p => p.name.trim().toLowerCase());
  if (names.some(n => !n)) { $('tidyStatus').textContent = 'Jedes Regal braucht einen Namen.'; return; }
  if (new Set(names).size !== names.length) { $('tidyStatus').textContent = 'Zwei Regale haben denselben Namen. Bitte ändern.'; return; }
  $('tidySaveBtn').disabled = true;
  $('tidyStatus').textContent = 'Speichere …';
  try {
    let n = 0;
    for (const p of tidy.proposal) {
      const c = tidy.cases.find(x => x.id === p.id);
      if (c.name === p.name.trim() && c.order === p.order && (c.note || '') === p.note) continue;
      const { updatedAt, ...rest } = c;
      await saveBookcase({ ...rest, name: p.name.trim(), order: p.order, note: p.note });
      n++;
    }
    $('tidyStatus').textContent = `Fertig: ${n} Regale gespeichert. In der App einmal neu laden.`;
    await refresh(false);
    $('tidyCheckBtn').click();
  } catch (err) {
    console.error(err);
    $('tidyStatus').textContent = 'Speichern fehlgeschlagen: ' + err.message;
    $('tidySaveBtn').disabled = false;
  }
});

function tidyPlan(room, cases, out) {
  if (!room.plan) return '';
  const S = 70, P = room.plan;
  const label = (c) => out.find(p => p.id === c.id)?.name || c.name;
  return `<svg viewBox="${P.x * S - 6} ${P.y * S - 6} ${P.w * S + 12} ${P.h * S + 12}" role="img" aria-label="Grundriss ${esc(room.name)} mit neuen Namen">` +
    `<rect x="${P.x * S}" y="${P.y * S}" width="${P.w * S}" height="${P.h * S}" fill="rgba(201,169,110,0.05)" stroke="#c9a96e"/>` +
    cases.filter(c => c.plan).map(c => {
      const p = c.plan;
      return `<rect x="${p.x * S}" y="${p.y * S}" width="${p.w * S}" height="${p.h * S}" fill="rgba(201,169,110,0.55)" stroke="#e2c48d"/>` +
        `<text x="${(p.x + p.w / 2) * S}" y="${(p.y + p.h / 2) * S}" font-size="10" fill="#fff" text-anchor="middle" dominant-baseline="middle" stroke="#17120d" stroke-width="3" paint-order="stroke">${esc(label(c))}</text>`;
    }).join('') + '</svg>';
}

// Regal mit mehreren Abschnitten aufteilen: erst Vorschau im Grundriss, beim zweiten Klick ausführen
let splitArmed = null;
$('tidyOut').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-split]');
  if (!btn || !tidy) return;
  const bc = tidy.cases.find(c => c.id === btn.dataset.split);
  if (!bc) return;
  if (splitArmed !== bc.id) {
    splitArmed = bc.id;
    const pieces = planSplit(bc, tidy.room);
    const preview = pieces.map(p => ({ ...bc, id: p.id, name: `Abschn. ${p.section + 1}`, plan: p.plan }));
    const others = tidy.cases.filter(c => c.id !== bc.id);
    btn.insertAdjacentHTML('afterend', `<span class="warn"> Vorschau unten im Grundriss. Abschnitt 1 = links, wenn man davor steht. Nochmals klicken zum Ausführen.</span>` +
      tidyPlan(tidy.room, [...others, ...preview], [...others.map(c => ({ id: c.id, name: c.name })), ...preview.map(c => ({ id: c.id, name: c.name }))]));
    btn.textContent = 'Wirklich aufteilen';
    return;
  }
  btn.disabled = true;
  $('tidyStatus').textContent = 'Teile auf …';
  try {
    const { pieces, moved } = await splitBookcase(bc, tidy.room);
    splitArmed = null;
    $('tidyStatus').textContent = `Aufgeteilt in ${pieces} Regale, ${moved} Bücher umgezogen (Abschnitt 1 behält seine Bücher). Jetzt Nummerierung prüfen und speichern.`;
    await refresh(false);
    $('tidyCheckBtn').click();
  } catch (err) {
    console.error(err);
    $('tidyStatus').textContent = 'Aufteilen fehlgeschlagen: ' + err.message;
    btn.disabled = false;
  }
});
$('tidyStart').addEventListener('change', () => { if (tidy) $('tidyCheckBtn').click(); });
