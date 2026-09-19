// src/api.js

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
    const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`);
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
      // 대체 책 정보 구조 반환
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