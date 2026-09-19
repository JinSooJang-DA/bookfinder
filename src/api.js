// src/api.js
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export async function analyzeBookshelfImage(base64Image, targetLang = 'en') {
  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|webp|jpg);base64,/, '');

  const prompt = `Analyze this bookshelf image and identify visible book titles and authors. Output in ${targetLang}. Return ONLY a JSON array: [{"title": "Title", "author": "Author"}]`;

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

  const data = await response.json();

  // 구글 API 응답 에러 시 콘솔에 상세 정보 출력
  if (!response.ok || data.error) {
    console.error("Gemini API Error Detail:", data.error || data);
    throw new Error(data.error?.message || `HTTP ${response.status}`);
  }

  let text = data.candidates[0].content.parts[0].text.trim();
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  
  return JSON.parse(text);
}

export async function fetchBookByISBN(isbn) {
  const cleanIsbn = isbn.replace(/[^0-9X]/gi, '');
  const res = await fetch(`[https://openlibrary.org/api/books?bibkeys=ISBN:$](https://openlibrary.org/api/books?bibkeys=ISBN:$){cleanIsbn}&format=json&jscmd=data`);
  const data = await res.json();
  const book = data[`ISBN:${cleanIsbn}`];
  
  return {
    title: book?.title || `Book (${cleanIsbn})`,
    author: book?.authors?.map(a => a.name).join(', ') || 'Unknown',
    isbn: cleanIsbn
  };
}