// src/api.js
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GOOGLE_BOOKS_API_KEY = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY || '';

// 브라우저 캔버스를 이용한 이미지 리사이즈 (토큰 절감)
function resizeImage(file, maxDimension = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
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
  const prompt = `Extract all visible book titles and authors from the provided image(s). Output in ${targetLang}. If author is not visible, return an empty string.`;
  
  const parts = [{ text: prompt }];

  for (const input of inputs) {
    let cleanBase64;
    if (input instanceof File || input instanceof Blob) {
      cleanBase64 = await resizeImage(input);
    } else if (typeof input === 'string') {
      cleanBase64 = input.replace(/^data:image\/(png|jpeg|webp|jpg);base64,/, '');
    }
    if (cleanBase64) {
      parts.push({ inline_data: { mime_type: "image/jpeg", data: cleanBase64 } });
    }
  }

  // 재시도 로직 없이 단 1회만 호출. 모델은 안정적인 3.6-flash 고정
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: parts }],
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
    })
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `HTTP ${response.status}`);
  }

  const text = data.candidates[0].content.parts[0].text;
  return JSON.parse(text);
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