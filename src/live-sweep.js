// src/live-sweep.js — Während der Aufnahme direkt scharfe Bilder sammeln (ohne Videodatei)
// Alle ~100 ms wird die Schärfe gemessen (Laplace-Varianz auf kleinem Graustufenbild).
// Pro Zeitfenster (Standard 0,5 s) wird das schärfste Bild in voller Auflösung behalten und als JPEG gespeichert.
// Ergebnis: Liste von Base64-JPEGs in Aufnahme-Reihenfolge, bereit für analyzeShelfSweep().

function sharpness(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h);
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      sum += v; sumSq += v * v; n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

const toBlob = (canvas) => new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9));
const blobToBase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

/**
 * Startet das Sammeln. onState({ frames, blurry, seconds }) wird laufend aufgerufen (für die Anzeige).
 * Gibt { stop } zurück; stop() liefert Promise<{ frames: string[], seconds, size }>.
 */
export function startSweepCapture(video, { windowSec = 0.5, maxWidth = 1920, sampleMs = 100, onState } = {}) {
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  const sw = 240, sh = Math.max(2, Math.round(sw * vh / vw));
  const small = document.createElement('canvas');
  small.width = sw; small.height = sh;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  const outW = Math.min(maxWidth, vw), outH = Math.round(outW * vh / vw);
  const best = document.createElement('canvas');
  best.width = outW; best.height = outH;
  const bctx = best.getContext('2d');

  const started = performance.now();
  const pending = []; // Promise<Blob> in Aufnahme-Reihenfolge (toBlob kopiert das Bild sofort)
  let winStart = started, winBest = -1;
  let ema = null, lowCount = 0, blurry = false;

  function closeWindow() {
    if (winBest >= 0) pending.push(toBlob(best));
    winBest = -1;
  }

  const timer = setInterval(() => {
    if (video.readyState < 2) return;
    const now = performance.now();
    if (now - winStart >= windowSec * 1000) { closeWindow(); winStart = now; }
    sctx.drawImage(video, 0, 0, sw, sh);
    const s = sharpness(sctx, sw, sh);
    if (s > winBest) { winBest = s; bctx.drawImage(video, 0, 0, outW, outH); }
    // "Langsamer!": deutlich unschärfer als der gleitende Durchschnitt
    ema = ema == null ? s : ema * 0.9 + s * 0.1;
    lowCount = s < ema * 0.55 ? lowCount + 1 : 0;
    blurry = lowCount >= 3;
    onState?.({ frames: pending.length, blurry, seconds: (now - started) / 1000 });
  }, sampleMs);

  return {
    async stop() {
      clearInterval(timer);
      closeWindow();
      const blobs = (await Promise.all(pending)).filter(Boolean);
      const frames = await Promise.all(blobs.map(blobToBase64));
      return { frames, seconds: (performance.now() - started) / 1000, size: `${outW}×${outH}` };
    }
  };
}
