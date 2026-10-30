// src/library-seed.js — Startdaten der Bibliothek (Stand 2026-10-30, vom Nutzer angegeben)
// Grundriss: Skizze des Nutzers, umgerechnet in Meter (1 m ≈ 133,5 Skizzen-Einheiten,
// Maßstab aus Arbeitszimmer Regal 1 = 2,5 m und Schlafzimmer Regal 1 = 3 m).
// plan = { x, y, w, h } in Metern, Ursprung oben links im Grundriss der Wohnung.

const U = 133.5;          // Skizzen-Einheiten pro Meter
const X0 = 180, Y0 = 100; // Ursprung der Skizze
const r2 = (n) => Math.round(n * 100) / 100;
function plan(x0, y0, x1, y1) {
  return { x: r2((x0 - X0) / U), y: r2((y0 - Y0) / U), w: r2((x1 - x0) / U), h: r2((y1 - y0) / U) };
}

export const SEED_PLACES = [
  { id: 'wohnung', name: 'Wohnung', order: 1, icon: 'home', hasPlan: true },
  { id: 'keller', name: 'Keller', order: 2, icon: 'basement', hasPlan: false }
];

export const SEED_ROOMS = [
  { id: 'wohnung-balkon-1', placeId: 'wohnung', name: 'Balkon 1', order: 1, hasBooks: false, plan: plan(725, 100, 1410, 200) },
  { id: 'wohnung-arbeitszimmer', placeId: 'wohnung', name: 'Arbeitszimmer', order: 2, hasBooks: true, plan: plan(205, 180, 690, 875) },
  { id: 'wohnung-wohnzimmer', placeId: 'wohnung', name: 'Wohnzimmer', order: 3, hasBooks: true, plan: plan(690, 200, 1395, 875) },
  { id: 'wohnung-flur', placeId: 'wohnung', name: 'Flur', order: 4, hasBooks: true, plan: plan(185, 875, 990, 1170) },
  { id: 'wohnung-wc', placeId: 'wohnung', name: 'WC', order: 5, hasBooks: false, plan: plan(990, 880, 1160, 1035) },
  { id: 'wohnung-bad', placeId: 'wohnung', name: 'Bad', order: 6, hasBooks: false, plan: plan(1160, 880, 1340, 1035) },
  { id: 'wohnung-gaeste-wc', placeId: 'wohnung', name: 'Gäste-WC', order: 7, hasBooks: false, plan: plan(990, 1035, 1380, 1150) },
  { id: 'wohnung-diele', placeId: 'wohnung', name: 'Diele', order: 8, hasBooks: false, plan: plan(190, 1170, 320, 1700) },
  { id: 'wohnung-kueche', placeId: 'wohnung', name: 'Küche', order: 9, hasBooks: false, plan: plan(320, 1170, 785, 1700) },
  { id: 'wohnung-schlafzimmer', placeId: 'wohnung', name: 'Schlafzimmer', order: 10, hasBooks: true, plan: plan(785, 1170, 1340, 1690) },
  { id: 'wohnung-balkon-2', placeId: 'wohnung', name: 'Balkon 2', order: 11, hasBooks: false, plan: plan(320, 1700, 770, 1830) }
];

// sections: ein Eintrag pro Abschnitt (von links nach rechts); layers = Anzahl Fächer, Fach 1 ist oben.
// Normale Regale haben genau einen Abschnitt.
export const SEED_BOOKCASES = [
  { id: 'arbeitszimmer-1', placeId: 'wohnung', roomId: 'wohnung-arbeitszimmer', name: 'Regal 1', order: 1, widthM: 2.5, heightM: 1.7,
    plan: plan(262, 185, 322, 520), sections: [{ layers: 5 }] },
  { id: 'arbeitszimmer-2', placeId: 'wohnung', roomId: 'wohnung-arbeitszimmer', name: 'Regal 2', order: 2, widthM: 1.8, heightM: 1.8,
    plan: plan(612, 470, 688, 711), sections: [{ layers: 4 }] },
  { id: 'arbeitszimmer-3', placeId: 'wohnung', roomId: 'wohnung-arbeitszimmer', name: 'Regal 3', order: 3, widthM: 0.7, heightM: 1.1,
    plan: plan(262, 540, 300, 634), sections: [{ layers: 4 }] },
  { id: 'wohnzimmer-1', placeId: 'wohnung', roomId: 'wohnung-wohnzimmer', name: 'Regal 1', order: 1, widthM: 0.8, heightM: 1.2,
    plan: plan(1325, 690, 1370, 797), sections: [{ layers: 4 }] },
  { id: 'wohnzimmer-2', placeId: 'wohnung', roomId: 'wohnung-wohnzimmer', name: 'Regal 2', order: 2, widthM: 0.6, heightM: 1.7,
    plan: plan(690, 790, 718, 870), sections: [{ layers: 5 }] },
  { id: 'flur-1', placeId: 'wohnung', roomId: 'wohnung-flur', name: 'James-Bond-Regal', order: 1, widthM: 0.9, heightM: 2.0,
    plan: plan(345, 1085, 466, 1165), sections: [{ layers: 7 }], note: 'Sammlung: Bücher, DVDs, CDs und Objekte' },
  { id: 'flur-2', placeId: 'wohnung', roomId: 'wohnung-flur', name: 'Regal 2', order: 2, widthM: 1.1, heightM: 2.0,
    plan: plan(655, 1085, 802, 1165), sections: [{ layers: 7 }] },
  { id: 'schlafzimmer-1', placeId: 'wohnung', roomId: 'wohnung-schlafzimmer', name: 'Regal 1', order: 1, widthM: 3.0, heightM: 2.0,
    plan: plan(788, 1208, 848, 1610), sections: [{ layers: 5 }] },
  { id: 'schlafzimmer-2', placeId: 'wohnung', roomId: 'wohnung-schlafzimmer', name: 'Regal 2', order: 2, widthM: null, heightM: null,
    plan: plan(788, 1610, 1335, 1688), note: 'ganze Wand · Bretter über Unterschränken', baseCabinet: true,
    sections: [{ layers: 3 }, { layers: 5 }, { layers: 5 }, { layers: 5 }, { layers: 4 }] },
  // unter Abschnitt 1 (3 Fächer, an der Decke) von Regal 2 — Abschnitt 1 liegt im Grundriss am rechten Ende der Wand
  { id: 'schlafzimmer-3', placeId: 'wohnung', roomId: 'wohnung-schlafzimmer', name: 'Regal 3', order: 3, widthM: 1.0, heightM: 1.0,
    plan: plan(1201, 1610, 1335, 1660), sections: [{ layers: 3 }], note: 'unter Abschnitt 1 von Regal 2' }
];
