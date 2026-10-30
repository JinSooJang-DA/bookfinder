// src/library.js — Aufbau der Bibliothek: Orte → Räume → Regale → Abschnitte → Fächer
// Firestore-Sammlungen (neben der bestehenden Sammlung "books", die unverändert bleibt):
//   places/{id}    { name, order, icon, hasPlan }
//   rooms/{id}     { placeId, name, order, hasBooks, plan: {x,y,w,h} in Metern }
//   bookcases/{id} { placeId, roomId, name, order, widthM, heightM, plan, sections: [{ layers }], note?, baseCabinet? }
// Fach 1 ist immer das oberste Fach eines Abschnitts.
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';
import { SEED_PLACES, SEED_ROOMS, SEED_BOOKCASES } from './library-seed.js';

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
