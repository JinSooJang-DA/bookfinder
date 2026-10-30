// src/api.js
import { getAI, getGenerativeModel, VertexAIBackend, Schema, ThinkingLevel } from 'firebase/ai';
import { app as firebaseApp } from './firebase.js';
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
// 앞 모델이 붐비면 다음 모델로 넘어간다.
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash'];
// 'firebase' = Firebase AI Logic + Vertex AI 백엔드 (API 키 없이, Cloud 크레딧 사용) — 기본값
// 'vertex'    = Agent Platform(Vertex AI) REST + API 키
// 'developer' = Gemini Developer API(AI Studio, 선불제) REST + API 키
const GEMINI_BACKEND = import.meta.env.VITE_GEMINI_BACKEND || 'firebase';
const VERTEX_PROJECT_ID = import.meta.env.VITE_VERTEX_PROJECT_ID || '';
const VERTEX_LOCATION = import.meta.env.VITE_VERTEX_LOCATION || 'global';

function geminiEndpoint(model) {
  if (GEMINI_BACKEND === 'vertex') {
    return `https://aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
  }
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

const BOOK_LIST_SCHEMA = Schema.array({
  items: Schema.object({
    properties: { title: Schema.string(), author: Schema.string() },
    optionalProperties: ['author']
  })
});
let firebaseAI = null;

// 마지막 분석의 단계별 시간 (개발 중 화면 표시용)
export let lastAnalysisTiming = null;

function isBusyError(status, message = '') {
  return [429, 500, 503].includes(status) || /overloaded|high demand|RESOURCE_EXHAUSTED|UNAVAILABLE|\b(429|503)\b/i.test(message);
}

// 모델 하나로 한 번 요청하고, 응답 JSON 텍스트를 돌려준다. 실패하면 err.busy(붐빔 여부)를 붙여 던진다.
async function requestBookList(model, parts, requestBody, schema = BOOK_LIST_SCHEMA, extraConfig = {}) {
  if (GEMINI_BACKEND === 'firebase') {
    try {
      if (!firebaseAI) firebaseAI = getAI(firebaseApp, { backend: new VertexAIBackend(VERTEX_LOCATION) });
      const generativeModel = getGenerativeModel(firebaseAI, {
        model,
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 1.0, ...extraConfig }
      });
      const result = await generativeModel.generateContent(parts);
      return { status: 200, text: result.response.text() };
    } catch (err) {
      const status = err?.customErrorData?.status;
      err.busy = isBusyError(status, err?.message);
      err.status = status;
      throw err;
    }
  }

  const response = await fetch(geminiEndpoint(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestBody
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const err = new Error(data.error?.message || `HTTP ${response.status}`);
    err.busy = isBusyError(response.status, err.message);
    err.status = response.status;
    throw err;
  }
  return { status: response.status, text: data.candidates[0].content.parts[0].text };
}
const GOOGLE_BOOKS_API_KEY = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY || '';

// 브라우저 캔버스를 이용한 이미지 리사이즈 (토큰 절감)
function resizeImage(file, maxDimension = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      resizeImage.lastOriginal = `${width}x${height}`;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
      resolve(base64);
    };
    img.onerror = (err) => reject(err);
  });
}

/**
 * Gemini AI 이미지 분석 (호출 무조건 1회, 다중 이미지 묶음 전송 지원)
 */
export async function analyzeBookshelfImage(imageInputs, targetLang = 'en') {
  // 단일 입력도 배열로 통일하여 다중 이미지 묶음 처리가 가능하도록 변경
  const inputs = Array.isArray(imageInputs) ? imageInputs : [imageInputs];
  const prompt = [
    'You are reading the spines of books standing on a bookshelf in the provided photo(s).',
    'List ONLY books whose spine (or cover) is actually visible in the photo(s), in order from left to right.',
    'Read the title and author from the spine text. Do not guess, do not complete a series, and do not add books that are not visible.',
    'Ignore cards, papers, flyers, DVDs, decorations and other objects that are not books.',
    'If a title is only partly readable, return the readable part. If the author is not visible, return an empty string.',
    `Output in ${targetLang}.`
  ].join('\n');
  
  const parts = [{ text: prompt }];

  const timing = { startedAt: performance.now(), images: [], attempts: [] };
  lastAnalysisTiming = timing;
  for (const input of inputs) {
    let cleanBase64;
    if (input instanceof File || input instanceof Blob) {
      const resizeStart = performance.now();
      cleanBase64 = await resizeImage(input);
      timing.images.push({
        originalMB: (input.size / 1048576).toFixed(1),
        original: resizeImage.lastOriginal,
        sentKB: Math.round(cleanBase64.length * 0.75 / 1024),
        resizeSec: ((performance.now() - resizeStart) / 1000).toFixed(1)
      });
    } else if (typeof input === 'string') {
      cleanBase64 = input.replace(/^data:image\/(png|jpeg|webp|jpg);base64,/, '');
    }
    if (cleanBase64) {
      parts.push({ inlineData: { mimeType: "image/jpeg", data: cleanBase64 } });
    }
  }

  // 기본 모델이 붐비면(503/429/500) 다음 모델로 한 번 더 시도한다.
  const requestBody = JSON.stringify({
    contents: [{ role: 'user', parts: parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            author: { type: "STRING" }
          },
          required: ["title"]
        }
      },
      temperature: 1.0
    }
  });

  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const model = GEMINI_MODELS[i];
    const startedAt = performance.now();
    const seconds = () => ((performance.now() - startedAt) / 1000).toFixed(1);
    try {
      const { status, text } = await requestBookList(model, parts, requestBody);
      console.info(`[BookFinder Gemini] ${GEMINI_BACKEND}/${model}: HTTP ${status}, ${seconds()}s`);
      timing.attempts.push({ model, status, sec: seconds() });
      timing.totalSec = ((performance.now() - timing.startedAt) / 1000).toFixed(1);
      return JSON.parse(text);
    } catch (err) {
      console.info(`[BookFinder Gemini] ${GEMINI_BACKEND}/${model}: failed (${err.status ?? '?'}), ${seconds()}s`);
      timing.attempts.push({ model, status: err.status ?? 'error', sec: seconds() });
      timing.totalSec = ((performance.now() - timing.startedAt) / 1000).toFixed(1);
      if (!err.busy || i === GEMINI_MODELS.length - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
}

/**
 * ISBN으로 책 정보 조회 (Google Books 1차 -> Open Library 2차)
 */
export async function fetchBookByISBN(isbn) {
  const cleanIsbn = isbn.replace(/[^0-9X]/gi, '').trim();
  if (!cleanIsbn) return null;

  try {
    let googleUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`;
    if (GOOGLE_BOOKS_API_KEY) {
      googleUrl += `&key=${GOOGLE_BOOKS_API_KEY}`;
    }
    const res = await fetch(googleUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.totalItems > 0 && data.items && data.items[0]?.volumeInfo) {
        const info = data.items[0].volumeInfo;
        return {
          title: info.title || '',
          author: info.authors ? info.authors.join(', ') : 'Unknown',
          isbn: cleanIsbn
        };
      }
    }
  } catch (err) {
    console.warn(`[Google Books 조회 실패]`, err);
  }

  try {
    const olRes = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`);
    if (olRes.ok) {
      const olData = await olRes.json();
      const bookKey = `ISBN:${cleanIsbn}`;
      if (olData[bookKey]) {
        const book = olData[bookKey];
        return {
          title: book.title || '',
          author: book.authors ? book.authors.map(a => a.name).join(', ') : 'Unknown',
          isbn: cleanIsbn
        };
      }
    }
  } catch (olErr) {
    console.warn(`[Open Library 조회 실패]`, olErr);
  }
  return null;
}

/**
 * Open Library Search API를 활용한 ISBN 역검색
 */
async function fetchISBNFromOpenLibrary(title, author = '') {
  try {
    const cleanTitle = title.replace(/[[\]()]/g, '').trim();
    const cleanAuthor = author && author !== 'Unknown' ? author.replace(/[[\]()]/g, '').trim() : '';
    let url = `https://openlibrary.org/search.json?title=${encodeURIComponent(cleanTitle)}`;
    if (cleanAuthor) url += `&author=${encodeURIComponent(cleanAuthor)}`;
    url += `&limit=3`;

    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.docs || data.docs.length === 0) return null;

    for (const doc of data.docs) {
      if (doc.isbn && doc.isbn.length > 0) {
        const isbn13 = doc.isbn.find(i => i.length === 13);
        const targetIsbn = isbn13 || doc.isbn[0];
        return targetIsbn.replace(/[^0-9X]/gi, '');
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * 제목과 작가로 ISBN 역검색 (Google Books -> Open Library)
 */
export async function fetchISBNByTitleAuthor(title, author = '') {
  if (!title) return null;

  const cleanTitle = title.replace(/[[\]()]/g, '').trim();
  const cleanAuthor = author && author !== 'Unknown' ? author.replace(/[[\]()]/g, '').trim() : '';
  let query = `intitle:${encodeURIComponent(cleanTitle)}`;
  if (cleanAuthor) query += `+inauthor:${encodeURIComponent(cleanAuthor)}`;

  let googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=3`;
  if (GOOGLE_BOOKS_API_KEY) googleUrl += `&key=${GOOGLE_BOOKS_API_KEY}`;

  try {
    const response = await fetch(googleUrl);
    if (!response.ok) return await fetchISBNFromOpenLibrary(title, author);

    const data = await response.json();
    if (!data.items || data.items.length === 0) return await fetchISBNFromOpenLibrary(title, author);

    for (const item of data.items) {
      const identifiers = item.volumeInfo?.industryIdentifiers || [];
      const isbnObj = identifiers.find(i => i.type === 'ISBN_13') || identifiers.find(i => i.type === 'ISBN_10');
      if (isbnObj && isbnObj.identifier) {
        return isbnObj.identifier.replace(/[^0-9X]/gi, '');
      }
    }
    return await fetchISBNFromOpenLibrary(title, author);
  } catch (error) {
    return await fetchISBNFromOpenLibrary(title, author);
  }
}


// ---------------------------------------------------------------------------
// 영상 훑기 분석 (실험 단계, 2026-10-30)
// 한 층을 영상으로 훑은 뒤 고른 장면(프레임)들을 한 번에 보내, 중복 없는 목록을 왼쪽→오른쪽 순서로 받는다.
// 현재 Firebase AI Logic 백엔드에서만 동작한다.
const SWEEP_SCHEMA = Schema.array({
  items: Schema.object({
    properties: {
      title: Schema.string(),
      author: Schema.string(),
      kind: Schema.enumString({ enum: ['book', 'film', 'music', 'other'] }),
      unsure: Schema.boolean()
    },
    optionalProperties: ['author']
  })
});

export async function analyzeShelfSweep(frameBase64List, { direction = 'rtl', thinking = '' } = {}) {
  const extraConfig = thinking && ThinkingLevel[thinking] ? { thinkingConfig: { thinkingLevel: ThinkingLevel[thinking] } } : {};
  if (GEMINI_BACKEND !== 'firebase') throw new Error('Video-Analyse geht nur mit VITE_GEMINI_BACKEND=firebase.');
  const n = frameBase64List.length;
  const dirText = direction === 'rtl'
    ? 'moving from the RIGHT end of the shelf to the LEFT end (frame 1 shows the right end)'
    : 'moving from the LEFT end of the shelf to the RIGHT end (frame 1 shows the left end)';
  const prompt = [
    `These ${n} photos are consecutive frames from a video that sweeps along ONE shelf of a bookcase, ${dirText}.`,
    'Neighbouring frames overlap heavily, so the same item appears in several frames. Count every item only once.',
    'Return ONE list of all items standing or lying on THIS shelf, in the order in which they appear in the video:',
    'start with the items seen in Frame 1 and end with the items seen in the last frame. Do not reorder or reverse the list.',
    'Read title and author exactly as printed on the spine, in the original language. Do not translate.',
    'kind: "book" for books, "film" for DVD/Blu-ray/video, "music" for CDs/records, "other" for other titled media.',
    'Ignore toys, model cars, figures, photos, papers, decorations, boxes without a title, ring binders/file folders and stamp or photo albums.',
    'Ignore items on the shelves above or below that are only partly visible at the top or bottom edge of the frames.',
    'Do not guess or invent titles. If a spine is only partly readable, return the readable part and set unsure=true.'
  ].join('\n');
  const parts = [{ text: prompt }];
  frameBase64List.forEach((data, i) => {
    parts.push({ text: `Frame ${i + 1}` });
    parts.push({ inlineData: { mimeType: 'image/jpeg', data } });
  });

  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const model = GEMINI_MODELS[i];
    const startedAt = performance.now();
    try {
      const { text } = await requestBookList(model, parts, null, SWEEP_SCHEMA, extraConfig);
      // Gemini liefert die Aufnahme-Reihenfolge; hier in Links→Rechts umwandeln (Position 1 = ganz links).
      const inSweepOrder = JSON.parse(text);
      const books = direction === 'rtl' ? inSweepOrder.reverse() : inSweepOrder;
      return { books, model, seconds: (performance.now() - startedAt) / 1000 };
    } catch (err) {
      console.info(`[BookFinder Sweep] ${model}: failed (${err.status ?? '?'})`);
      if (!err.busy || i === GEMINI_MODELS.length - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
}
