// src/back-nav.js — Zurück-Taste des Handys (Android) bzw. des Browsers innerhalb der App
// Statt die Seite zu verlassen, geht "Zurück" einen Schritt in der App zurück:
// offenes Buch-Blatt / Unterbildschirm → vorheriger Bildschirm → Hauptmenü. Erst im Hauptmenü verlässt "Zurück" die Seite.
//
// Technik: ein zusätzlicher Verlaufseintrag ("Falle"). Drückt man Zurück, landet der Browser auf dem
// Eintrag davor (popstate); die App macht ihren eigenen Schritt zurück und legt die Falle wieder an.

let trapped = false;

function pushTrap() {
  if (trapped) return;
  history.pushState({ bookfinder: 'trap' }, '');
  trapped = true;
}

/** onBack() → true, wenn die App selbst zurückgegangen ist; false = im Hauptmenü, Seite darf verlassen werden. */
export function initBackNav(onBack) {
  history.replaceState({ bookfinder: 'base' }, '');
  // Chrome überspringt Verlaufseinträge ohne vorherige Berührung – daher Falle erst nach einer Berührung anlegen.
  const arm = () => pushTrap();
  window.addEventListener('pointerdown', arm, { capture: true });
  window.addEventListener('keydown', arm, { capture: true });

  window.addEventListener('popstate', () => {
    trapped = false;
    let handled = false;
    try { handled = onBack(); } catch (err) { console.error('[BookFinder Zurück]', err); }
    if (handled) pushTrap();
    else history.back(); // im Hauptmenü: Seite wirklich verlassen
  });
}

/** Schritt zurück in der sichtbaren Ansicht: deren eigenen Zurück-Knopf benutzen. */
export function clickVisibleBack(view) {
  if (!view) return false;
  const btn = view.querySelector('.lib-back') || view.querySelector('[data-act="back"]');
  if (!btn || btn.disabled) return false;
  btn.click();
  return true;
}
