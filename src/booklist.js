// src/bookList.js
import { db } from './firebase.js';
import { 
  collection, getDocs, query, orderBy, 
  doc, deleteDoc, where 
} from 'firebase/firestore';
import { i18n } from './i18n.js';
import { escapeHtml } from './ui.js';

let filterRoom, filterShelf, filterLayer, searchInput, savedBookList;

export function initBookListModule(deps) {
  filterRoom = document.getElementById('filterRoom');
  filterShelf = document.getElementById('filterShelf');
  filterLayer = document.getElementById('filterLayer');
  searchInput = document.getElementById('searchInput');
  savedBookList = document.getElementById('savedBookList');

  const { getCurrentLang, openEditModalCallback } = deps;
  window._bookListDeps = { getCurrentLang, openEditModalCallback };

  // 이벤트 리스너 바인딩
  filterRoom?.addEventListener('change', handleRoomChange);
  filterShelf?.addEventListener('change', handleShelfChange);
  filterLayer?.addEventListener('change', loadSavedBooks);
  searchInput?.addEventListener('input', loadSavedBooks);

  // 전역 함수 등록
  window.deleteBook = deleteBook;
  window.viewCloudImage = viewCloudImage;
  window.viewCloudImages = viewCloudImages;
}

function getLang() {
  return window._bookListDeps?.getCurrentLang() || 'en';
}

// 방 드롭다운 갱신
export async function updateRoomDropdown() {
  if (!filterRoom) return;
  const lang = getLang();
  const t = i18n[lang] || i18n['en'];
  try {
    const querySnapshot = await getDocs(collection(db, "books"));
    const rooms = new Set();
    querySnapshot.forEach(docSnap => {
      if (docSnap.data().room) rooms.add(docSnap.data().room);
    });

    filterRoom.innerHTML = `<option value="ALL">${t.allRooms}</option>`;
    rooms.forEach(room => {
      filterRoom.innerHTML += `<option value="${room}">${room}</option>`;
    });
  } catch (error) {
    console.error('Room List Error:', error);
  }
}

async function updateShelfDropdown(room) {
  if (!filterShelf) return;
  const lang = getLang();
  const t = i18n[lang] || i18n['en'];
  try {
    const q = query(collection(db, "books"), where("room", "==", room));
    const querySnapshot = await getDocs(q);
    const shelves = new Set();
    
    querySnapshot.forEach(docSnap => {
      if (docSnap.data().shelfName) shelves.add(docSnap.data().shelfName);
    });

    filterShelf.innerHTML = `<option value="ALL">${t.allShelves}</option>`;
    shelves.forEach(shelf => {
      filterShelf.innerHTML += `<option value="${shelf}">${shelf}</option>`;
    });
  } catch (error) {
    console.error('Shelf List Error:', error);
  }
}

async function updateLayerFilterOptions(room, shelf) {
  if (!filterLayer) return;
  const lang = getLang();
  const t = i18n[lang] || i18n['en'];
  try {
    const q = query(collection(db, "books"), where("room", "==", room), where("shelfName", "==", shelf));
    const querySnapshot = await getDocs(q);
    
    let maxLayer = 1;
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.totalLayers && data.totalLayers > maxLayer) maxLayer = data.totalLayers;
      else if (data.shelfLayer && data.shelfLayer > maxLayer) maxLayer = data.shelfLayer;
    });

    filterLayer.innerHTML = `<option value="ALL">${t.allLayers}</option>`;
    for (let i = 1; i <= maxLayer; i++) {
      filterLayer.innerHTML += `<option value="${i}">${t.layerPrefix} ${i}</option>`;
    }
  } catch (error) {
    console.error('Layer Filter Error:', error);
  }
}

async function handleRoomChange() {
  const lang = getLang();
  const t = i18n[lang] || i18n['en'];
  const selectedRoom = filterRoom.value;
  if (selectedRoom === 'ALL') {
    if (filterShelf) {
      filterShelf.innerHTML = `<option value="ALL">${t.allShelves}</option>`;
      filterShelf.disabled = true;
    }
    if (filterLayer) {
      filterLayer.innerHTML = `<option value="ALL">${t.allLayers}</option>`;
      filterLayer.disabled = true;
    }
  } else {
    if (filterShelf) filterShelf.disabled = false;
    await updateShelfDropdown(selectedRoom);
  }
  if (filterLayer) filterLayer.value = 'ALL';
  loadSavedBooks();
}

async function handleShelfChange() {
  const lang = getLang();
  const t = i18n[lang] || i18n['en'];
  const selectedRoom = filterRoom ? filterRoom.value : 'ALL';
  const selectedShelf = filterShelf.value;

  if (selectedShelf === 'ALL') {
    if (filterLayer) {
      filterLayer.innerHTML = `<option value="ALL">${t.allLayers}</option>`;
      filterLayer.disabled = true;
    }
  } else {
    if (filterLayer) filterLayer.disabled = false;
    await updateLayerFilterOptions(selectedRoom, selectedShelf);
  }
  loadSavedBooks();
}

// 저장된 도서 목록 불러오기 및 렌더링
export async function loadSavedBooks() {
  if (!savedBookList) return;
  const lang = getLang();
  const t = i18n[lang] || i18n['en'];
  savedBookList.innerHTML = '<small>Loading books...</small>';
  try {
    const room = filterRoom ? filterRoom.value : 'ALL';
    const shelf = filterShelf ? filterShelf.value : 'ALL';
    const layer = filterLayer ? filterLayer.value : 'ALL';
    const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';

    let q;
    if (room === 'ALL') {
      q = query(collection(db, "books"), orderBy("createdAt", "desc"));
    } else {
      let conditions = [where("room", "==", room)];
      if (shelf !== 'ALL') conditions.push(where("shelfName", "==", shelf));
      if (layer !== 'ALL') conditions.push(where("shelfLayer", "==", Number(layer)));
      q = query(collection(db, "books"), ...conditions);
    }

    const querySnapshot = await getDocs(q);
    savedBookList.innerHTML = '';

    let hasResults = false;

    querySnapshot.forEach((docSnap) => {
      const book = docSnap.data();
      const bookId = docSnap.id;

      const titleMatch = book.title && book.title.toLowerCase().includes(keyword);
      const authorMatch = book.author && book.author.toLowerCase().includes(keyword);

      if (keyword !== '' && !titleMatch && !authorMatch) {
        return;
      }

      hasResults = true;

      let photoBtnHtml = '';
      if (book.imageUrls && book.imageUrls.length > 0) {
        photoBtnHtml = `<button class="btn btn-secondary btn-sm" onclick='viewCloudImages(${JSON.stringify(book.imageUrls)})'>📷 View Photos (${book.imageUrls.length})</button>`;
      } else if (book.imageUrl) {
        photoBtnHtml = `<button class="btn btn-secondary btn-sm" onclick="viewCloudImage('${book.imageUrl}')">📷 View Photo</button>`;
      }

      const item = document.createElement('div');
      item.className = 'book-item';
      item.innerHTML = `
        <div class="book-title">${escapeHtml(book.title)}</div>
        <div class="book-meta">
          Author: ${escapeHtml(book.author)} ${book.isbn ? `<br>ISBN: ${escapeHtml(book.isbn)}` : ''}<br>
          📍 <strong>${escapeHtml(book.room)}</strong> ➔ ${escapeHtml(book.shelfName)} (${t.layerPrefix} ${book.shelfLayer}, Pos. ${book.position})
        </div>
        <div class="action-btns" style="margin-top: 5px; display: flex; gap: 5px; flex-wrap: wrap;">
          ${photoBtnHtml}
          <button class="btn btn-secondary btn-sm" id="edit-btn-${bookId}">✏️ Edit / ISBN</button>
          <button class="btn btn-danger btn-sm" onclick="deleteBook('${bookId}', '${escapeHtml(book.title)}')">🗑️ Delete</button>
        </div>
      `;
      
      const editBtn = item.querySelector(`#edit-btn-${bookId}`);
      editBtn?.addEventListener('click', () => {
        if (window._bookListDeps?.openEditModalCallback) {
          window._bookListDeps.openEditModalCallback(
            bookId, 
            book.title, 
            book.author || '', 
            book.room || '', 
            book.shelfName || '', 
            book.shelfLayer || 1, 
            book.position || 1,
            book.isbn || ''
          );
        }
      });

      savedBookList.appendChild(item);
    });

    if (!hasResults) {
      savedBookList.innerHTML = '<small>No matching books found.</small>';
    }
  } catch (error) {
    console.error('Load Error:', error);
    savedBookList.innerHTML = '<small>Failed to load books.</small>';
  }
}

function viewCloudImage(imageUrl) {
  if (imageUrl) {
    const newWindow = window.open();
    newWindow.document.write(`<img src="${imageUrl}" style="max-width:100%;" alt="Shelf Photo"/>`);
  } else {
    alert("Image URL not found.");
  }
}

function viewCloudImages(imageUrls) {
  const newWindow = window.open();
  newWindow.document.write(`<h3>Shelf Segment Photos</h3>`);
  for (const url of imageUrls) {
    newWindow.document.write(`<div style="margin-bottom:15px;"><img src="${url}" style="max-width:100%; border:1px solid #ccc;" alt="Segment Photo"/></div>`);
  }
}

async function deleteBook(bookId, title) {
  const lang = getLang();
  const t = i18n[lang] || i18n['en'];
  if (confirm(`${t.confirmDeleteSingle}"${title}"`)) {
    try {
      await deleteDoc(doc(db, "books", bookId));
      alert(t.alertSuccessDelete);
      await updateRoomDropdown();
      loadSavedBooks();
    } catch (error) {
      alert('Failed to delete.');
    }
  }
}