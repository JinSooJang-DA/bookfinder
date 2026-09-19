// src/api.js

/**
 * Gemini API 키 설정
 */
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Google Gemini AI API를 호출하여 책장 이미지 내 도서 정보를 분석합니다.
 * @param {string} base64Image - Base64 인코딩된 이미지 데이터
 * @param {string} targetLang - 책 제목 및 정보 출력 언어 (ko, en, de 등)
 * @returns {Promise<Array<{title: string, author: string}>>} - 감지된 책 목록
 */
export async function analyzeBookshelfImage(base64Image, targetLang = 'en') {
  if (!GEMINI_API_KEY) {
    console.error("Gemini API Key가 설정되지 않았습니다. GitHub Secrets를 확인해주세요.");
    throw new Error("Gemini API Key가 누락되었습니다.");
  }

  // Base64 헤더 및 데이터 정리
  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|webp|jpg);base64,/, '');

  const promptText = `
Analyze this bookshelf image and identify all visible book titles and their authors.
Output language requirement: Provide the titles in ${targetLang} if translation is applicable, or keep original title.
Return ONLY a valid JSON array of objects with the following structure:
[
  { "title": "Book Title", "author": "Author Name" }
]
Do not include markdown code block tags (\`\`\`json) or any extra conversational text.
`;

  try {
    // 말씀하신 Gemini 3.6 Flash 모델로 정확히 고정
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: cleanBase64
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('Gemini API HTTP Error Response:', errData);
      throw new Error(`Gemini API 통신 실패 (${response.status})`);
    }

    const result = await response.json();

    if (!result.candidates || result.candidates.length === 0 || !result.candidates[0].content?.parts?.[0]?.text) {
      throw new Error("Gemini 응답 데이터가 올바르지 않습니다.");
    }

    let responseText = result.candidates[0].content.parts[0].text.trim();
    
    // 마크다운 문법(```json ... ```) 제거 처리로 파싱 에러 방지
    responseText = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');

    const books = JSON.parse(responseText);
    return Array.isArray(books) ? books : [];
  } catch (error) {
    console.error('Gemini Image Analysis Error:', error);
    throw error;
  }
}

/**
 * Open Library API 또는 외부 API를 이용해 ISBN 기반 도서 정보 검색
 * @param {string} isbn - 조회할 ISBN 번호
 * @returns {Promise<{title: string, author: string, isbn: string}>}
 */
export async function fetchBookByISBN(isbn) {
  const cleanIsbn = isbn.replace(/[^0-9X]/gi, '');
  if (!cleanIsbn) {
    throw new Error('Invalid ISBN format.');
  }

  try {
    const response = await fetch(`[https://openlibrary.org/api/books?bibkeys=ISBN:$](https://openlibrary.org/api/books?bibkeys=ISBN:$){cleanIsbn}&format=json&jscmd=data`);
    const data = await response.json();
    const key = `ISBN:${cleanIsbn}`;

    if (data && data[key]) {
      const bookData = data[key];
      const title = bookData.title || `ISBN Book (${cleanIsbn})`;
      
      let author = 'Unknown';
      if (bookData.authors && bookData.authors.length > 0) {
        author = bookData.authors.map(a => a.name).join(', ');
      }

      return {
        title: title,
        author: author,
        isbn: cleanIsbn
      };
    } else {
      return {
        title: `Book (${cleanIsbn})`,
        author: 'Unknown',
        isbn: cleanIsbn
      };
    }
  } catch (error) {
    console.error('Fetch Book By ISBN Error:', error);
    return {
      title: `Book (${cleanIsbn})`,
      author: 'Unknown',
      isbn: cleanIsbn
    };
  }
}