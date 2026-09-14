// src/api.js
import { GoogleGenAI } from '@google/genai';

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

function compressImage(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // 가로가 1200픽셀보다 크면 비율에 맞춰 줄임
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // JPEG 형식으로 압축 (quality: 0.8)
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}

export async function analyzeBookshelfImage(file, selectedLang, apiKey) {
  // 💡 원본 대신 압축된 이미지(max 1200px)를 사용하여 API 전송 오류 방지
  const base64Image = await compressImage(file, 1200, 0.8);
  const ai = new GoogleGenAI({ apiKey });

  const langInstruction = selectedLang === 'Original'
    ? 'Keep the exact original language and text as printed on the book spines.'
    : `Translate and output all book titles and authors into: ${selectedLang}.`;

  const prompt = `
  Analyze this photo of a bookshelf layer.
  Identify book spines from LEFT to RIGHT.
  ${langInstruction}

  Respond EXCLUSIVELY in valid JSON format as shown below:
  [
    {
      "position": 1,
      "title": "Book Title",
      "author": "Author Name",
      "language": "${selectedLang.toLowerCase()}"
    }
  ]
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: file.type, data: base64Image.split(',')[1] } }
        ]
      }
    ]
  });

  const cleanJson = response.text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleanJson);
}

export async function fetchBookByISBN(isbn) {
  const cleanIsbn = isbn.replace(/[^0-9X]/gi, '');
  const url = `https://openlibrary.org/isbn/${cleanIsbn}.json`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Book not found with this ISBN');
    const data = await response.json();
    
    let title = data.title || 'Unknown Title';
    let author = 'Unknown Author';

    if (data.authors && data.authors.length > 0) {
      const authorKey = data.authors[0].key;
      const authorRes = await fetch(`https://openlibrary.org${authorKey}.json`);
      if (authorRes.ok) {
        const authorData = await authorRes.json();
        author = authorData.name || 'Unknown Author';
      }
    }

    return { title, author, isbn: cleanIsbn };
  } catch (error) {
    console.error('ISBN Fetch Error:', error);
    throw error;
  }
}