// src/dev-tools.js — Entwicklerwerkzeuge (nur npm run dev): Bibliotheks-Aufbau anlegen und prüfen
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase.js';
import { loadLibrary, seedLibrary, totalLayers, countLegacyBooks, deleteLegacyBooks } from './library.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => (n == null ? '–' : String(n).replace('.', ','));

onAuthStateChanged(auth, (user) => {
  $('authState').textContent = user ? `Angemeldet als ${user.email}` : 'Nicht angemeldet';
  $('loginRow').style.display = user ? 'none' : 'flex';
  $('seedBtn').disabled = !user;
  $('reloadBtn').disabled = !user;
  $('countOldBtn').disabled = !user;
  if (user) refresh();
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
