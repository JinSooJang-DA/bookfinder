// src/video-test.js — Entwicklungs-Testseite: ein Fach per Video abfilmen und auslesen (nur npm run dev)
import { analyzeShelfSweep } from './api.js';

const $ = (id) => document.getElementById(id);
const videoInput = $('videoInput');
const runBtn = $('runBtn');
const statusEl = $('status');
const framesEl = $('frames');
const resultBody = $('resultBody');
const summaryEl = $('summary');
const referenceEl = $('reference');
const missingEl = $('missing');

// Von Hand aus dem Testvideo gelesen (Arbeitszimmer › Regal 1 › Fach 1), links → rechts.
const DEFAULT_REFERENCE = [
  'James Bidgood', 'Das Tagebuch der Anne Frank', 'Mies – Ein visionärer Architekt',
  'Islam und Homosexualität Teil 3', 'Islam und Homosexualität Teil 2', 'Islam und Homosexualität Teil 1',
  'Homosexualitäten', 'Konflikt', 'Imperium', 'Mythos', 'Alexandria', 'Parthenon', 'Warenwege – Warenflüsse',
  'An den Grenzen des Reiches', 'Theater im Römischen Reich', 'Lexikon der Alten Welt A–G', 'Lexikon der Alten Welt H–Q',
  'Lexikon der Alten Welt R–Z', 'Beefcake', 'John F. Kennedy', 'James Dean – Rebell in Hollywood', 'Männer', 'Streiflichter',
  'Living Sculpture', 'Robert Mapplethorpe', 'Androgyn', 'Boys', 'Photographien', 'Das magische Auge', 'Das MännerFotoBuch',
  'Et in Arcadia Ego', 'Pierre et Gilles', "L'Amour bleu", 'Kulturgeschichte der Antike 2', 'Alltag im Alten Rom',
  'Die römischen Kaiser', 'Homosexualität in der griechischen Antike', 'Götter, Mumien und Hetären',
  'Klassische Archäologie – Grundwissen', 'Das Haus des Augustus auf dem Palatin', 'Die Sonnenuhr des Augustus',
  'Palazzo Altemps', 'Führer durch die Borghese Galerie', 'Palazzo Massimo alle Terme',
  'Hermogenes und die hochhellenistische Architektur', 'Kleopatra – Die ewige Diva', 'Caesar & Kleopatra',
  'Kleopatra und die Caesaren', 'Rom', 'Wunder Roms', 'Die neuen Bilder des Augustus',
  'Kaiser Augustus und die verlorene Republik', 'Roma Antica', 'Roman Sculpture', 'Jerusalem Revealed',
  'The Metropolitan Museum of Art Guide', 'Griechische Geschichte', 'Rom – Ein archäologischer Führer', 'Das Neue Testament',
  'Holy Bible', 'Das Buch Mormon', 'Zitate und Sprichwörter von A–Z', 'Daten der deutschen Geschichte', 'Grundgesetz',
  'Griechische Schriftsteller', 'Die blödesten Gesetze der Welt', 'Deutsche Verfassungen',
  'Das große Lexikon der Geschichte 1', 'Das große Lexikon der Geschichte 2', 'Das große Lexikon der Geschichte 3'
].join('\n');
referenceEl.value = DEFAULT_REFERENCE;

const KIND_LABEL = { book: 'Buch', film: 'Film', music: 'Musik', other: 'Sonstiges' };

videoInput.addEventListener('change', () => {
  runBtn.disabled = !videoInput.files[0];
  if (videoInput.files[0]) {
    const f = videoInput.files[0];
    statusEl.textContent = `Video: ${f.name} (${(f.size / 1048576).toFixed(1)} MB)`;
  }
});

function waitFor(el, eventName) {
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error('Video konnte nicht gelesen werden.')); };
    const cleanup = () => { el.removeEventListener(eventName, ok); el.removeEventListener('error', bad); };
    el.addEventListener(eventName, ok);
    el.addEventListener('error', bad);
  });
}

async function seek(video, t) {
  const done = waitFor(video, 'seeked');
  video.currentTime = t;
  await done;
}

// Schärfe = Varianz des Laplace-Filters auf einem kleinen Graustufenbild
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

async function extractFrames(file, stepSec, maxWidth) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = URL.createObjectURL(file);
  await waitFor(video, 'loadedmetadata');
  const duration = video.duration;
  const vw = video.videoWidth, vh = video.videoHeight;

  // 1) alle 0,2 s Schärfe messen
  const sw = 320, sh = Math.round(320 * vh / vw);
  const small = document.createElement('canvas');
  small.width = sw; small.height = sh;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  const samples = [];
  for (let t = 0.1; t < duration - 0.05; t += 0.2) {
    await seek(video, t);
    sctx.drawImage(video, 0, 0, sw, sh);
    samples.push({ t, sharp: sharpness(sctx, sw, sh) });
    statusEl.textContent = `Schärfe messen … ${Math.round((t / duration) * 100)} %`;
  }
  const sorted = samples.map(s => s.sharp).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;

  // 2) pro Zeitfenster das schärfste Bild wählen
  const picks = [];
  for (let w = 0; w < duration; w += stepSec) {
    const inWin = samples.filter(s => s.t >= w && s.t < w + stepSec);
    if (!inWin.length) continue;
    picks.push(inWin.reduce((a, b) => (b.sharp > a.sharp ? b : a)));
  }

  // 3) gewählte Bilder in voller Breite (bis maxWidth) als JPEG holen
  const outW = Math.min(maxWidth, vw), outH = Math.round(outW * vh / vw);
  const big = document.createElement('canvas');
  big.width = outW; big.height = outH;
  const bctx = big.getContext('2d');
  const frames = [];
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    await seek(video, p.t);
    bctx.drawImage(video, 0, 0, outW, outH);
    const dataUrl = big.toDataURL('image/jpeg', 0.9);
    frames.push({ t: p.t, sharp: p.sharp, blurry: p.sharp < median * 0.6, dataUrl, base64: dataUrl.split(',')[1] });
    statusEl.textContent = `Bilder holen … ${i + 1}/${picks.length}`;
  }
  URL.revokeObjectURL(video.src);
  return { frames, duration, size: `${vw}×${vh}`, out: `${outW}×${outH}` };
}

// Vergleich: normalisierte Titel, Treffer wenn einer den anderen enthält oder viele Wörter gemeinsam sind
function norm(s) {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ß]+/g, ' ').trim();
}
function similar(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const xs = new Set(x.split(' ')), ys = new Set(y.split(' '));
  const inter = [...xs].filter(w => ys.has(w)).length;
  return inter / Math.max(xs.size, ys.size) >= 0.6;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

runBtn.addEventListener('click', async () => {
  const file = videoInput.files[0];
  if (!file) return;
  runBtn.disabled = true;
  framesEl.innerHTML = '';
  resultBody.innerHTML = '';
  summaryEl.textContent = '';
  missingEl.textContent = '';
  try {
    const t0 = performance.now();
    const { frames, duration, size, out } = await extractFrames(file, Number($('step').value), Number($('maxWidth').value));
    const extractSec = (performance.now() - t0) / 1000;
    framesEl.innerHTML = frames.map((f, i) =>
      `<figure class="${f.blurry ? 'blurry' : ''}"><img src="${f.dataUrl}" alt="Bild ${i + 1}"><figcaption>Bild ${i + 1} · ${f.t.toFixed(1)} s · Schärfe ${Math.round(f.sharp)}${f.blurry ? ' · unscharf' : ''}</figcaption></figure>`
    ).join('');

    statusEl.textContent = `${frames.length} Bilder an Gemini senden …`;
    const { books, model, seconds } = await analyzeShelfSweep(frames.map(f => f.base64), { direction: $('direction').value, thinking: $('thinking').value });

    const refs = referenceEl.value.split('\n').map(s => s.trim()).filter(Boolean);
    const found = refs.map(r => books.some(b => similar(b.title, r)));
    resultBody.innerHTML = books.map((b, i) => {
      const inRef = refs.some(r => similar(b.title, r));
      return `<tr><td>${i + 1}</td><td class="${b.unsure ? 'unsure' : ''}">${escapeHtml(b.title)}${b.unsure ? ' (?)' : ''}</td><td>${escapeHtml(b.author || '')}</td><td>${KIND_LABEL[b.kind] || ''}</td><td class="${inRef ? 'ok' : 'miss'}">${inRef ? 'ja' : 'neu'}</td></tr>`;
    }).join('');
    const hit = found.filter(Boolean).length;
    const unsure = books.filter(b => b.unsure).length;
    summaryEl.innerHTML =
      `Video ${size}, ${duration.toFixed(1)} s → ${frames.length} Bilder (${out}), davon ${frames.filter(f => f.blurry).length} unscharf<br>` +
      `Bilder auswählen: <b>${extractSec.toFixed(1)} s</b> · Gemini (${model}): <b>${seconds.toFixed(1)} s</b><br>` +
      `Erkannt: <b>${books.length}</b> Einträge (${unsure} unsicher) · Referenz gefunden: <b>${hit}/${refs.length}</b>`;
    const extra = books.filter(b => !refs.some(r => similar(b.title, r)));
    const missing = refs.filter((r, i) => !found[i]);
    missingEl.innerHTML = missing.length
      ? `<span class="miss">Nicht gefunden (${missing.length}):</span> ${missing.map(escapeHtml).join(' · ')}`
      : '<span class="ok">Alle Referenztitel gefunden.</span>';
    missingEl.innerHTML += `<br><span class="unsure">Nicht in der Referenz (${extra.length}):</span> ` +
      extra.map(b => escapeHtml(b.title) + (b.author ? ' – ' + escapeHtml(b.author) : '') + (b.unsure ? ' (?)' : '')).join(' · ');
    statusEl.textContent = 'Fertig.';
  } catch (err) {
    console.error('[BookFinder Video-Test]', err);
    statusEl.textContent = 'Fehler: ' + (err?.message || err);
  } finally {
    runBtn.disabled = false;
  }
});
