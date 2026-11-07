// src/isbn-scan.js — Barcode (ISBN/EAN) mit der Handykamera lesen, für Erfassen › Bücher per Barcode
// Nutzt html5-qrcode. Start/Stopp laufen nacheinander (Kette), damit ein schnelles Neuzeichnen
// des Bildschirms keine zwei Kameras gleichzeitig öffnet.
import { Html5Qrcode, Html5QrcodeSupportedFormats as F } from 'html5-qrcode';

let scanner = null;
let chain = Promise.resolve();
let gen = 0;

const run = (fn) => (chain = chain.then(fn).catch(err => console.warn('[BookFinder Barcode]', err)));

async function stopNow() {
  const s = scanner;
  scanner = null;
  if (!s) return;
  try { if (s.isScanning) await s.stop(); } catch { /* Element evtl. schon entfernt */ }
  try { s.clear(); } catch { /* egal */ }
}

/** Kamera im Element elementId starten. onCode(text) wird beim ersten erkannten Code einmal aufgerufen. onError(msg) bei Problemen. */
export function startIsbnScan(elementId, onCode, onError) {
  const my = ++gen;
  return run(async () => {
    await stopNow();
    if (my !== gen || !document.getElementById(elementId)) return;
    const s = new Html5Qrcode(elementId, {
      formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false
    });
    scanner = s;
    let done = false;
    try {
      await s.start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: (w, h) => ({ width: Math.round(Math.min(320, w * 0.85)), height: Math.round(Math.min(140, h * 0.45)) }) },
        (text) => { if (done) return; done = true; onCode(text); },
        () => {}
      );
    } catch (err) {
      scanner = null;
      const msg = !window.isSecureContext ? 'Kamera nur über https (npm run dev:phone).' : 'Kamera nicht verfügbar: ' + (err?.message || err);
      onError?.(msg);
      return;
    }
    if (my !== gen) await stopNow(); // inzwischen neu gezeichnet oder verlassen
  });
}

export function stopIsbnScan() {
  gen++;
  return run(stopNow);
}

/** Zeichen bereinigen; true, wenn es wie eine ISBN aussieht (978/979… oder 10 Stellen). */
export function cleanCode(text) {
  const code = String(text || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  return { code, isIsbn: /^97[89]\d{10}$/.test(code) || /^\d{9}[\dX]$/.test(code) };
}
