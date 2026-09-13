// src/ui.js
export function escapeHtml(str) {
  return str ? String(str).replace(/'/g, "\\'").replace(/"/g, "&quot;") : '';
}

export function renderScannedBooks(books, resultCardEl, bookListEl) {
  resultCardEl.style.display = 'block';
  bookListEl.innerHTML = '';
  books.forEach(book => {
    const item = document.createElement('div');
    item.className = 'book-item';
    item.innerHTML = `
      <div class="book-title">Pos ${book.position}: ${escapeHtml(book.title)}</div>
      <div class="book-meta">Author: ${escapeHtml(book.author || 'Unknown')}</div>
    `;
    bookListEl.appendChild(item);
  });
}