// src/booklist.js
import { db } from './firebase.js';
import { collection, getDocs } from 'firebase/firestore';
import { i18n } from './i18n.js';

let currentLangCallback = () => 'en';
let openEditModalCallback = null;
let allSavedBooks = [];

export function initBookListModule(config) {
  currentLangCallback = config.getCurrentLang;
  openEditModalCallback = config.openEditModalCallback;

  const searchInput = document.getElementById('searchInput');
  const filterRoom = document.getElementById('filterRoom');
  const filterShelf = document.getElementById('filterShelf');
  const filterLayer = document.getElementById('filterLayer');

  searchInput?.addEventListener('input', filterAndRenderBooks);
  filterRoom?.addEventListener('change', () => {
    updateShelfDropdown();
    filterAndRenderBooks();
  });
  filterShelf?.addEventListener('change', () => {
    updateLayerDropdown();
    filterAndRenderBooks();
  });
  filterLayer?.addEventListener('change', filterAndRenderBooks);
}

export async function updateRoomDropdown() {
  const filterRoom = document.getElementById('filterRoom');
  if (!filterRoom) return;
  const currentVal = filterRoom.value;
  
  try {
    const querySnapshot = await getDocs(collection(db, "books"));
    const rooms = new Set();
    allSavedBooks = [];

    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      allSavedBooks.push({ id: docSnap.id, ...data });
      if (data.room) rooms.add(data.room);
    });

    filterRoom.innerHTML = `<option value="ALL">${getTranslation('allRooms') || 'All Rooms'}</option>`;
    Array.from(rooms).sort().forEach(room => {
      const opt = document.createElement('option');
      opt.value = room;
      opt.textContent = room;
      filterRoom.appendChild(opt);
    });

    if (rooms.has(currentVal)) filterRoom.value = currentVal;
    else filterRoom.value = 'ALL';

    updateShelfDropdown();
    filterAndRenderBooks();
  } catch (error) {
    console.error("Error updating room dropdown:", error);
  }
}

function updateShelfDropdown() {
  const filterRoom = document.getElementById('filterRoom');
  const filterShelf = document.getElementById('filterShelf');
  const filterLayer = document.getElementById('filterLayer');
  if (!filterRoom || !filterShelf) return;

  const selectedRoom = filterRoom.value;
  const currentVal = filterShelf.value;
  filterShelf.innerHTML = `<option value="ALL">${getTranslation('allShelves') || 'All Bookcases'}</option>`;

  if (selectedRoom === 'ALL') {
    filterShelf.disabled = true;
    if (filterLayer) {
      filterLayer.disabled = true;
      filterLayer.innerHTML = `<option value="ALL">${getTranslation('allLayers') || 'All Layers'}</option>`;
    }
    filterAndRenderBooks();
    return;
  }

  filterShelf.disabled = false;
  const shelves = new Set();
  allSavedBooks.forEach(book => {
    if (book.room === selectedRoom && book.shelfName) {
      shelves.add(book.shelfName);
    }
  });

  Array.from(shelves).sort().forEach(shelf => {
    const opt = document.createElement('option');
    opt.value = shelf;
    opt.textContent = shelf;
    filterShelf.appendChild(opt);
  });

  if (shelves.has(currentVal)) filterShelf.value = currentVal;
  else filterShelf.value = 'ALL';

  updateLayerDropdown();
}

function updateLayerDropdown() {
  const filterRoom = document.getElementById('filterRoom');
  const filterShelf = document.getElementById('filterShelf');
  const filterLayer = document.getElementById('filterLayer');
  if (!filterRoom || !filterShelf || !filterLayer) return;

  const selectedRoom = filterRoom.value;
  const selectedShelf = filterShelf.value;
  const currentVal = filterLayer.value;
  filterLayer.innerHTML = `<option value="ALL">${getTranslation('allLayers') || 'All Layers'}</option>`;

  if (selectedShelf === 'ALL') {
    filterLayer.disabled = true;
    filterAndRenderBooks();
    return;
  }

  filterLayer.disabled = false;
  const layers = new Set();
  allSavedBooks.forEach(book => {
    if (book.room === selectedRoom && book.shelfName === selectedShelf && book.shelfLayer) {
      layers.add(Number(book.shelfLayer));
    }
  });

  Array.from(layers).sort((a, b) => a - b).forEach(layer => {
    const opt = document.createElement('option');
    opt.value = layer;
    opt.textContent = `Layer ${layer}`;
    filterLayer.appendChild(opt);
  });

  if (layers.has(Number(currentVal))) filterLayer.value = currentVal;
  else filterLayer.value = 'ALL';

  filterAndRenderBooks();
}

export async function loadSavedBooks() {
  await updateRoomDropdown();
}

function filterAndRenderBooks() {
  const searchInput = document.getElementById('searchInput');
  const filterRoom = document.getElementById('filterRoom');
  const filterShelf = document.getElementById('filterShelf');
  const filterLayer = document.getElementById('filterLayer');
  const savedBookListContainer = document.getElementById('savedBookList');

  if (!savedBookListContainer) return;

  const searchTerm = (searchInput?.value || '').toLowerCase().trim();
  const roomVal = filterRoom?.value || 'ALL';
  const shelfVal = filterShelf?.value || 'ALL';
  const layerVal = filterLayer?.value || 'ALL';

  const filtered = allSavedBooks.filter(book => {
    const title = (book.title || '').toLowerCase();
    const author = (book.author || '').toLowerCase();
    const matchesSearch = !searchTerm || title.includes(searchTerm) || author.includes(searchTerm);
    const matchesRoom = roomVal === 'ALL' || book.room === roomVal;
    const matchesShelf = shelfVal === 'ALL' || book.shelfName === shelfVal;
    const matchesLayer = layerVal === 'ALL' || Number(book.shelfLayer) === Number(layerVal);
    return matchesSearch && matchesRoom && matchesShelf && matchesLayer;
  });

  filtered.sort((a, b) => {
    if (a.room !== b.room) return (a.room || '').localeCompare(b.room || '');
    if (a.shelfName !== b.shelfName) return (a.shelfName || '').localeCompare(b.shelfName || '');
    if (a.shelfLayer !== b.shelfLayer) return (Number(a.shelfLayer) || 1) - (Number(b.shelfLayer) || 1);
    return (Number(a.position) || 1) - (Number(b.position) || 1);
  });

  renderBookItems(filtered, savedBookListContainer);
}

function renderBookItems(books, container) {
  container.innerHTML = '';
  if (books.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: #8c6b4a; padding: 20px;">No books found.</p>`;
    return;
  }

  books.forEach(book => {
    const itemEl = document.createElement('div');
    itemEl.style.cssText = `
      position: relative;
      background: #231a15;
      border: 1px solid #4a3a2f;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 15px;
    `;

    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'flex: 1; min-width: 0;';

    const titleEl = document.createElement('div');
    titleEl.textContent = book.title || 'Unknown Title';
    titleEl.style.cssText = `
      font-size: 1.15rem;
      font-weight: 500;
      color: #d4af37;
      margin-bottom: 6px;
      word-break: break-word;
    `;

    const authorEl = document.createElement('div');
    authorEl.textContent = `Author: ${book.author || 'Unknown'}`;
    authorEl.style.cssText = `
      font-size: 0.95rem;
      color: #c1a88a;
      margin-bottom: 4px;
    `;

    const locationEl = document.createElement('div');
    locationEl.innerHTML = `📍 <span style="color: #e8dcc4; font-weight: 600;">${book.room || 'Room'}</span> ➔ ${book.shelfName || 'Shelf'} (Layer ${book.shelfLayer || 1}, Pos. ${book.position || 1})`;
    locationEl.style.cssText = `
      font-size: 0.85rem;
      color: #a68153;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    infoDiv.appendChild(titleEl);
    infoDiv.appendChild(authorEl);
    infoDiv.appendChild(locationEl);

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'flex-shrink: 0;';

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.style.cssText = `
      padding: 6px 14px;
      font-size: 0.85rem;
      font-weight: 400;
      background: linear-gradient(145deg, #4a3a2f, #2a2019);
      border: 1px solid #5c4a3d;
      color: #f8f1e4;
      border-radius: 6px;
      cursor: pointer;
    `;
    editBtn.addEventListener('click', () => {
      if (openEditModalCallback) {
        openEditModalCallback(
          book.id,
          book.title,
          book.author,
          book.room,
          book.shelfName,
          book.shelfLayer,
          book.position,
          book.isbn
        );
      }
    });

    btnContainer.appendChild(editBtn);
    itemEl.appendChild(infoDiv);
    itemEl.appendChild(btnContainer);
    container.appendChild(itemEl);
  });
}

function getTranslation(key) {
  const lang = currentLangCallback ? currentLangCallback() : 'en';
  return (i18n[lang] && i18n[lang][key]) || (i18n['en'] && i18n['en'][key]) || key;
}