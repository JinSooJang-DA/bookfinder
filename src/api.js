// src/api.js
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GOOGLE_BOOKS_API_KEY = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY || '';

// 1. 브라우저 캔버스를 이용한 이미지 리사이즈 (토큰 및 전송량 대폭 절감)
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

      // base64 문자열 추출 (data:image/jpeg;base64, 접두사 제거 후 반환)
      const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
      resolve(base64);
    };
    img.onerror = (err) => reject(err);
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Gemini AI 책장 이미지 분석 (토큰 최적화 및 503 자동 재시도 적용)
 */
export async function analyzeBookshelfImage(imageInput, targetLang = 'en', retryCount = 0) {
  let cleanBase64;
  
  // File 객체인 경우 리사이징 수행, 문자열인 경우 기존 처리
  if (imageInput instanceof File || imageInput instanceof Blob) {
    cleanBase64 = await resizeImage(imageInput);
  } else if (typeof imageInput === 'string') {
    cleanBase64 = imageInput.replace(/^data:image\/(png|jpeg|webp|jpg);base64,/, '');
  }

  // 간결한 단답형 프롬프트
  const prompt = `Extract all visible book titles and authors from this image. Output in ${targetLang}. If author is not visible, return an empty string.`;

  try {
    // 2. 모델 업데이트: gemini-3.8-flash 적용
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: cleanBase64 } }
          ]
        }],
        config: {
          // 3. 내부 추론 토큰 최소화 (REST API 형식)
          thinking_config: {
            thinking_level: "low"
          },
          response_mime_type: "application/json",
          // 4. 순수 JSON 배열만 반환하도록 스키마 강제
          response_schema: {
            type: "ARRAY",
            description: "List of identified books",
            items: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING", description: "Title of the book" },
                author: { type: "STRING", description: "Author name or empty string if not visible" }
              },
              required: ["title"]
            }
          },
          temperature: 1.0
        }
      })
    });

    if ((response.status === 503 || response.status === 429 || response.status >= 500) && retryCount < 4) {
      const waitTime = Math.pow(2, retryCount + 1) * 1000;
      console.warn(`[Gemini 서버 과부하 ${response.status}] ${waitTime / 1000}초 후 자동으로 다시 시도합니다... (${retryCount + 1}/4)`);
      await delay(waitTime);
      return await analyzeBookshelfImage(imageInput, targetLang, retryCount + 1);
    }

    const data = await response.json();

    if (!response.ok || data.error) {
      if ((data.error?.code === 503 || data.error?.status === 'UNAVAILABLE') && retryCount < 4) {
        const waitTime = Math.pow(2, retryCount + 1) * 1000;
        console.warn(`[Gemini Model Overloaded] ${waitTime / 1000}초 후 다시 시도합니다... (${retryCount + 1}/4)`);
        await delay(waitTime);
        return await analyzeBookshelfImage(imageInput, targetLang, retryCount + 1);
      }
      throw new Error(data.error?.message || `HTTP ${response.status}`);
    }

    // response_schema 적용으로 마크다운 백틱 정규식 처리 없이 바로 객체 변환 가능
    const text = data.candidates[0].content.parts[0].text;
    return JSON.parse(text);

  } catch (error) {
    if (retryCount < 4 && (error.message?.includes('503') || error.message?.includes('high demand') || error.message?.includes('UNAVAILABLE'))) {
      const waitTime = Math.pow(2, retryCount + 1) * 1000;
      console.warn(`[Gemini 일시적 에러] ${waitTime / 1000}초 후 다시 시도합니다... (${retryCount + 1}/4)`);
      await delay(waitTime);
      return await analyzeBookshelfImage(imageInput, targetLang, retryCount + 1);
    }
    throw error;
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
    console.warn(`[Google Books 조회 실패] ISBN: ${cleanIsbn}`, err);
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
    console.warn(`[Open Library 조회 실패] ISBN: ${cleanIsbn}`, olErr);
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
    if (cleanAuthor) {
      url += `&author=${encodeURIComponent(cleanAuthor)}`;
    }
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
    console.error(`OpenLibrary Search failed for "${title}":`, err);
    return null;
  }
}

/**
 * 제목과 작가로 ISBN 역검색 (Google Books -> Open Library)
 */
export async function fetchISBNByTitleAuthor(title, author = '', retryCount = 0) {
  if (!title) return null;

  const cleanTitle = title.replace(/[[\]()]/g, '').trim();
  const cleanAuthor = author && author !== 'Unknown' ? author.replace(/[[\]()]/g, '').trim() : '';
  
  let query = `intitle:${encodeURIComponent(cleanTitle)}`;
  if (cleanAuthor) {
    query += `+inauthor:${encodeURIComponent(cleanAuthor)}`;
  }

  let googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=3`;
  if (GOOGLE_BOOKS_API_KEY) {
    googleUrl += `&key=${GOOGLE_BOOKS_API_KEY}`;
  }

  try {
    const response = await fetch(googleUrl);

    if (response.status === 429 || response.status === 403) {
      if (retryCount < 1) {
        await delay(1500);
        return await fetchISBNByTitleAuthor(title, author, retryCount + 1);
      }
      return await fetchISBNFromOpenLibrary(title, author);
    }

    if (!response.ok) {
      return await fetchISBNFromOpenLibrary(title, author);
    }

    const data = await response.json();
    if (!data.items || data.items.length === 0) {
      return await fetchISBNFromOpenLibrary(title, author);
    }

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