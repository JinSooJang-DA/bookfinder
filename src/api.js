// src/api.js
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GOOGLE_BOOKS_API_KEY = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY || '';

function ensureBase64(input) {
  if (typeof input === 'string') return Promise.resolve(input);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(input);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Gemini AI 책장 이미지 분석
 * 503(서버 과부하) 및 429(속도 제한) 발생 시 최대 4회 자동 재시도 (2s -> 4s -> 8s)
 */
export async function analyzeBookshelfImage(imageInput, targetLang = 'en', retryCount = 0) {
  const base64Data = await ensureBase64(imageInput);
  const cleanBase64 = base64Data.replace(/^data:image\/(png|jpeg|webp|jpg);base64,/, '');

  const prompt = `Analyze this bookshelf image and identify visible book titles and authors. Output in ${targetLang}. Return ONLY a JSON array: [{"title": "Title", "author": "Author"}]`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: cleanBase64 } }
          ]
        }],
        generationConfig: {
          response_mime_type: "application/json"
        }
      })
    });

    // 503(서버 과부하), 429(Rate Limit), 500(내부 서버 에러) 발생 시 대기 후 재시도
    if ((response.status === 503 || response.status === 429 || response.status >= 500) && retryCount < 4) {
      const waitTime = Math.pow(2, retryCount + 1) * 1000; // 2초 -> 4초 -> 8초 -> 16초
      console.warn(`[Gemini 서버 과부하 ${response.status}] ${waitTime / 1000}초 후 자동으로 다시 시도합니다... (${retryCount + 1}/4)`);
      await delay(waitTime);
      return await analyzeBookshelfImage(imageInput, targetLang, retryCount + 1);
    }

    const data = await response.json();

    if (!response.ok || data.error) {
      // JSON 에러 응답 내부에 503 코드가 들어있는 경우 처리
      if ((data.error?.code === 503 || data.error?.status === 'UNAVAILABLE') && retryCount < 4) {
        const waitTime = Math.pow(2, retryCount + 1) * 1000;
        console.warn(`[Gemini Model Overloaded] ${waitTime / 1000}초 후 다시 시도합니다... (${retryCount + 1}/4)`);
        await delay(waitTime);
        return await analyzeBookshelfImage(imageInput, targetLang, retryCount + 1);
      }

      console.error("Gemini API Error Detail:", data.error || data);
      throw new Error(data.error?.message || `HTTP ${response.status}`);
    }

    let text = data.candidates[0].content.parts[0].text.trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
    
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
    let googleUrl = `[https://www.googleapis.com/books/v1/volumes?q=isbn:$](https://www.googleapis.com/books/v1/volumes?q=isbn:$){cleanIsbn}`;
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
    const olRes = await fetch(`[https://openlibrary.org/api/books?bibkeys=ISBN:$](https://openlibrary.org/api/books?bibkeys=ISBN:$){cleanIsbn}&format=json&jscmd=data`);
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
    
    let url = `[https://openlibrary.org/search.json?title=$](https://openlibrary.org/search.json?title=$){encodeURIComponent(cleanTitle)}`;
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

  let googleUrl = `[https://www.googleapis.com/books/v1/volumes?q=$](https://www.googleapis.com/books/v1/volumes?q=$){query}&maxResults=3`;
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