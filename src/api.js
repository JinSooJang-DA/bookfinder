// src/api.js
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// File 또는 Blob 객체가 전달되어도 Base64 텍스트로 자동 변환하는 함수
function ensureBase64(input) {
  if (typeof input === 'string') return Promise.resolve(input);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(input);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
  });
}

// 지정된 밀리초(ms)만큼 대기하는 지연 헬퍼 함수
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 책장 이미지를 분석하여 도서 제목과 작가명을 추출하는 함수 (재시도 로직 포함)
 */
export async function analyzeBookshelfImage(imageInput, targetLang = 'en', retryCount = 0) {
  // 문자열이든 File 객체든 안전하게 Base64 텍스트로 전환
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
        }]
      })
    });

    // 429(요청 과도) 또는 5xx(서버 에러) 발생 시 지연 후 재시도
    if ((response.status === 429 || response.status >= 500) && retryCount < 3) {
      const waitTime = (retryCount + 1) * 2000; // 2초, 4초, 6초 지연
      console.warn(`[Gemini API ${response.status}] ${waitTime / 1000}초 후 재시도합니다... (${retryCount + 1}/3)`);
      await delay(waitTime);
      return await analyzeBookshelfImage(imageInput, targetLang, retryCount + 1);
    }

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error("Gemini API Error Detail:", data.error || data);
      throw new Error(data.error?.message || `HTTP ${response.status}`);
    }

    let text = data.candidates[0].content.parts[0].text.trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
    
    return JSON.parse(text);
  } catch (error) {
    if (retryCount < 3 && !error.message?.includes('HTTP 400')) {
      const waitTime = (retryCount + 1) * 2000;
      console.warn(`[Gemini API 요청 실패] ${waitTime / 1000}초 후 재시도합니다... (${retryCount + 1}/3)`, error);
      await delay(waitTime);
      return await analyzeBookshelfImage(imageInput, targetLang, retryCount + 1);
    }
    throw error;
  }
}

/**
 * ISBN으로 OpenLibrary에서 책 정보 조회 (재시도 로직 포함)
 */
export async function fetchBookByISBN(isbn, retryCount = 0) {
  const cleanIsbn = isbn.replace(/[^0-9X]/gi, '');
  if (!cleanIsbn) {
    return { title: 'Unknown Title', author: 'Unknown', isbn: '' };
  }

  try {
    const res = await fetch(`[https://openlibrary.org/api/books?bibkeys=ISBN:$](https://openlibrary.org/api/books?bibkeys=ISBN:$){cleanIsbn}&format=json&jscmd=data`);
    
    if (res.status === 429 && retryCount < 3) {
      const waitTime = (retryCount + 1) * 2000;
      console.warn(`[OpenLibrary 429] ${waitTime / 1000}초 후 재시도합니다... (${retryCount + 1}/3)`);
      await delay(waitTime);
      return await fetchBookByISBN(isbn, retryCount + 1);
    }

    if (!res.ok) {
      return { title: `Book (${cleanIsbn})`, author: 'Unknown', isbn: cleanIsbn };
    }

    const data = await res.json();
    const book = data[`ISBN:${cleanIsbn}`];
    
    return {
      title: book?.title || `Book (${cleanIsbn})`,
      author: book?.authors?.map(a => a.name).join(', ') || 'Unknown',
      isbn: cleanIsbn
    };
  } catch (error) {
    console.error(`OpenLibrary fetch failed for ISBN ${cleanIsbn}:`, error);
    return { title: `Book (${cleanIsbn})`, author: 'Unknown', isbn: cleanIsbn };
  }
}

/**
 * 제목과 작가로 Google Books API에서 ISBN을 역검색하는 함수 (429 지연 재시도 포함)
 */
export async function fetchISBNByTitleAuthor(title, author = '', retryCount = 0) {
  if (!title) return null;

  // 특수문자 제거 및 쿼리 구성
  const cleanTitle = title.replace(/[[\]()]/g, '').trim();
  const cleanAuthor = author && author !== 'Unknown' ? author.replace(/[[\]()]/g, '').trim() : '';
  
  let query = `intitle:${encodeURIComponent(cleanTitle)}`;
  if (cleanAuthor) {
    query += `+inauthor:${encodeURIComponent(cleanAuthor)}`;
  }

  try {
    const response = await fetch(`[https://www.googleapis.com/books/v1/volumes?q=$](https://www.googleapis.com/books/v1/volumes?q=$){query}&maxResults=3`);

    // 429 Too Many Requests 발생 시 대기 후 재시도 (최대 3회)
    if (response.status === 429) {
      if (retryCount < 3) {
        const waitTime = (retryCount + 1) * 2000; // 2초, 4초, 6초 지연
        console.warn(`[Google Books 429 Too Many Requests] ${waitTime / 1000}초 후 재시도합니다... (${retryCount + 1}/3)`);
        await delay(waitTime);
        return await fetchISBNByTitleAuthor(title, author, retryCount + 1);
      } else {
        console.error(`Max retries reached for "${title}" due to rate limits.`);
        return null;
      }
    }

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.items || data.items.length === 0) return null;

    // 검색 결과 중 ISBN_13 또는 ISBN_10 추출
    for (const item of data.items) {
      const identifiers = item.volumeInfo?.industryIdentifiers || [];
      const isbnObj = identifiers.find(i => i.type === 'ISBN_13') || identifiers.find(i => i.type === 'ISBN_10');
      
      if (isbnObj && isbnObj.identifier) {
        // 숫자 및 X만 정제하여 반환
        return isbnObj.identifier.replace(/[^0-9X]/gi, '');
      }
    }
    return null;
  } catch (error) {
    console.error(`ISBN search failed for "${title}":`, error);
    return null;
  }
}