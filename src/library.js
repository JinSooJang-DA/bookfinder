// src/library.js — Aufbau der Bibliothek: Orte → Räume → Regale → Abschnitte → Fächer
// Firestore-Sammlungen (neben der bestehenden Sammlung "books", die unverändert bleibt):
//   places/{id}    { name, order, icon, hasPlan }
//   rooms/{id}     { placeId, name, order, hasBooks, plan: {x,y,w,h} in Metern }
//   bookcases/{id} { placeId, roomId, name, order, widthM, heightM, plan, sections: [{ layers }], note?, baseCabinet? }
//   books/{id}     neues Format v: 2 { v, title, author, kind, unsure, placeId, roomId, bookcaseId, section, fach, position, source }
//                  position = 1, 2, 3 … von links. Alte Testdaten in "books" haben kein Feld v.
// Fach 1 ist immer das oberste Fach eines Abschnitts.
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp, query, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase.js';
import { SEED_PLACES, SEED_ROOMS, SEED_BOOKCASES, KELLER_ROOMS, KELLER_BOOKCASES } from './library-seed.js';

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

export async function loadLibrary() {
  const [p, r, b] = await Promise.all([
    getDocs(collection(db, 'places')),
    getDocs(collection(db, 'rooms')),
    getDocs(collection(db, 'bookcases'))
  ]);
  const list = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byOrder);
  return { places: list(p), rooms: list(r), bookcases: list(b) };
}

// Legt die Startdaten an. Vorhandene Dokumente bleiben unverändert, außer overwrite = true.
// Gibt zurück, wie viele Dokumente neu geschrieben bzw. übersprungen wurden.
export async function seedLibrary({ overwrite = false } = {}) {
  const groups = [['places', SEED_PLACES], ['rooms', SEED_ROOMS], ['bookcases', SEED_BOOKCASES]];
  let written = 0, skipped = 0;
  for (const [name, items] of groups) {
    for (const { id, ...data } of items) {
      const ref = doc(db, name, id);
      if (!overwrite && (await getDoc(ref)).exists()) { skipped++; continue; }
      await setDoc(ref, { ...data, updatedAt: serverTimestamp() });
      written++;
    }
  }
  return { written, skipped };
}

// Keller anlegen: Raum und Regale nur, wenn sie noch fehlen; der Ort "Keller" bekommt hasPlan = true.
export async function seedKeller() {
  await setDoc(doc(db, 'places', 'keller'), { hasPlan: true, updatedAt: serverTimestamp() }, { merge: true });
  let written = 0, skipped = 0;
  for (const [name, items] of [['rooms', KELLER_ROOMS], ['bookcases', KELLER_BOOKCASES]]) {
    for (const { id, ...data } of items) {
      const ref = doc(db, name, id);
      if ((await getDoc(ref)).exists()) { skipped++; continue; }
      await setDoc(ref, { ...data, updatedAt: serverTimestamp() });
      written++;
    }
  }
  return { written, skipped };
}

export function totalLayers(bookcase) {
  return (bookcase.sections || []).reduce((sum, s) => sum + (s.layers || 0), 0);
}

// Regal anlegen oder ändern (ganzes Dokument). Bücher in "books" werden nicht verändert.
export async function saveBookcase({ id, ...data }) {
  await setDoc(doc(db, 'bookcases', id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteBookcase(id) {
  await deleteDoc(doc(db, 'bookcases', id));
}

export async function saveRoom({ id, ...data }) {
  await setDoc(doc(db, 'rooms', id), { ...data, updatedAt: serverTimestamp() });
}

// ---------------------------------------------------------------- Bücher (neues Format v: 2)
export const fachKey = (bookcaseId, section, fach) => `${bookcaseId}:${section}:${fach}`;
const BATCH_MAX = 450;

async function commitInChunks(ops) {
  for (let i = 0; i < ops.length; i += BATCH_MAX) {
    const batch = writeBatch(db);
    ops.slice(i, i + BATCH_MAX).forEach(op => op(batch));
    await batch.commit();
  }
}

// Alle Bücher im neuen Format, gruppiert nach Fach, sortiert nach Position
export async function loadShelfBooks() {
  const snap = await getDocs(query(collection(db, 'books'), where('v', '==', 2)));
  const byFach = {};
  snap.docs.forEach(d => {
    const b = { id: d.id, ...d.data() };
    (byFach[fachKey(b.bookcaseId, b.section, b.fach)] ||= []).push(b);
  });
  Object.values(byFach).forEach(list => list.sort((a, b) => a.position - b.position));
  return byFach;
}

async function loadFach(bookcaseId, section, fach) {
  const snap = await getDocs(query(collection(db, 'books'),
    where('v', '==', 2), where('bookcaseId', '==', bookcaseId), where('section', '==', section), where('fach', '==', fach)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.position - b.position);
}

function bookData(b, where_, position, source) {
  return {
    v: 2, title: (b.title || '').trim(), author: (b.author || '').trim(), kind: b.kind || 'book', unsure: !!b.unsure,
    placeId: where_.placeId, roomId: where_.roomId, bookcaseId: where_.bookcaseId, section: where_.section, fach: where_.fach,
    position, source: b.source || source, updatedAt: serverTimestamp(),
    ...(b.isbn ? { isbn: String(b.isbn) } : {})
  };
}

// Ein Fach komplett ersetzen (Ergebnis einer Aufnahme): alte Einträge des Fachs löschen, neue mit Position 1…n schreiben.
// where_ = { placeId, roomId, bookcaseId, section, fach }
export async function saveFach(where_, items, source = 'video') {
  const old = await loadFach(where_.bookcaseId, where_.section, where_.fach);
  const col = collection(db, 'books');
  // Auch Einträge ohne lesbaren Titel behalten: sie belegen einen Platz, sonst stimmen die Positionen nicht.
  const fresh = items.map((b, i) => ({ ref: doc(col), data: { ...bookData(b, where_, i + 1, source), createdAt: serverTimestamp() } }));
  await commitInChunks([
    ...old.map(o => (batch) => batch.delete(doc(db, 'books', o.id))),
    ...fresh.map(f => (batch) => batch.set(f.ref, f.data))
  ]);
  return loadFach(where_.bookcaseId, where_.section, where_.fach);
}

// Ein Buch an Stelle index (0 = ganz links) einfügen; alle Bücher rechts davon rücken um 1 weiter (in einem Batch).
export async function insertBook(where_, index, book) {
  const list = await loadFach(where_.bookcaseId, where_.section, where_.fach);
  const ops = list.filter(b => b.position >= index + 1)
    .map(b => (batch) => batch.update(doc(db, 'books', b.id), { position: b.position + 1, updatedAt: serverTimestamp() }));
  const ref = doc(collection(db, 'books'));
  ops.push((batch) => batch.set(ref, { ...bookData(book, where_, index + 1, 'manual'), createdAt: serverTimestamp() }));
  await commitInChunks(ops);
  return loadFach(where_.bookcaseId, where_.section, where_.fach);
}

// Ein gespeichertes Buch bearbeiten (Titel, Autor, Art). Platz und Position bleiben gleich.
export async function updateBook(id, { title, author, kind }) {
  const data = { title: (title || '').trim(), author: (author || '').trim(), kind: kind || 'book', unsure: false, updatedAt: serverTimestamp() };
  await updateDoc(doc(db, 'books', id), data);
  return data;
}

// Ein Buch endgültig löschen; alle Bücher rechts davon rücken um 1 nach links (in einem Batch).
export async function deleteBook(book) {
  const list = await loadFach(book.bookcaseId, book.section, book.fach);
  const ops = [(batch) => batch.delete(doc(db, 'books', book.id))];
  list.filter(b => b.id !== book.id && b.position > book.position)
    .forEach(b => ops.push((batch) => batch.update(doc(db, 'books', b.id), { position: b.position - 1, updatedAt: serverTimestamp() })));
  await commitInChunks(ops);
  return loadFach(book.bookcaseId, book.section, book.fach);
}

// Ein Regal mit mehreren Abschnitten in einzelne Regale aufteilen (ein Regal pro Abschnitt).
// Abschnitt 1 behält die alte ID; die anderen bekommen neue IDs, ihre Bücher ziehen mit (Abschnitt → 0).
// Grundriss: das Rechteck wird gleichmäßig geteilt. Abschnitt 1 liegt an dem Ende, das man von vorn
// gesehen links hat (Wand unten im Grundriss → rechtes Ende, oben → links, linke Wand → unten, rechte Wand → oben).
export function planSplit(bc, room) {
  const n = (bc.sections || []).length;
  const p = bc.plan, R = room?.plan;
  if (!p || n < 2) return [];
  const horizontal = p.w >= p.h;
  let firstAtEnd; // true = Abschnitt 1 am Ende mit größerem x bzw. y
  if (horizontal) firstAtEnd = R ? ((R.y + R.h) - (p.y + p.h)) < (p.y - R.y) : true;   // Wand unten → rechts
  else firstAtEnd = R ? (p.x - R.x) < ((R.x + R.w) - (p.x + p.w)) : true;                 // linke Wand → unten
  const r2 = (v) => Math.round(v * 1000) / 1000;
  return bc.sections.map((s, i) => {
    const slot = firstAtEnd ? n - 1 - i : i;
    const piece = horizontal
      ? { x: r2(p.x + p.w * slot / n), y: p.y, w: r2(p.w / n), h: p.h }
      : { x: p.x, y: r2(p.y + p.h * slot / n), w: p.w, h: r2(p.h / n) };
    return { id: i === 0 ? bc.id : `${bc.id}-a${i + 1}`, section: i, layers: s.layers, plan: piece };
  });
}

export async function splitBookcase(bc, room) {
  const pieces = planSplit(bc, room);
  if (!pieces.length) throw new Error('Dieses Regal hat nur einen Abschnitt.');
  const snap = await getDocs(query(collection(db, 'books'), where('bookcaseId', '==', bc.id)));
  const { id, updatedAt, ...base } = bc;
  const n = pieces.length;
  const ops = pieces.map(pc => (batch) => batch.set(doc(db, 'bookcases', pc.id), {
    ...base,
    name: `${bc.name} · Abschnitt ${pc.section + 1}`,
    sections: [{ layers: pc.layers }],
    plan: pc.plan,
    widthM: bc.widthM ? Math.round(bc.widthM / n * 100) / 100 : null,
    splitFrom: bc.id,
    updatedAt: serverTimestamp()
  }));
  let moved = 0;
  snap.docs.forEach(d => {
    const sec = d.data().section || 0;
    if (sec === 0) return;
    const pc = pieces[sec];
    if (!pc) return;
    moved++;
    ops.push((batch) => batch.update(d.ref, { bookcaseId: pc.id, section: 0, updatedAt: serverTimestamp() }));
  });
  await commitInChunks(ops);
  return { pieces: n, moved };
}

// Alte Testdaten (ohne v: 2) zählen bzw. löschen — nur über dev-tools.html
export async function countLegacyBooks() {
  const snap = await getDocs(collection(db, 'books'));
  return snap.docs.filter(d => d.data().v !== 2).length;
}

export async function deleteLegacyBooks() {
  const snap = await getDocs(collection(db, 'books'));
  const old = snap.docs.filter(d => d.data().v !== 2);
  await commitInChunks(old.map(d => (batch) => batch.delete(d.ref)));
  return old.length;
}
