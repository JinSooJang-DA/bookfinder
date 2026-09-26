// src/gallery.js
import { db } from './firebase.js';
import { collection, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';
import { escapeHtml } from './ui.js';
import { updateRoomDropdown, loadSavedBooks } from './booklist.js';
import { i18n } from './i18n.js';

let galleryContainer = null;

function t(key) {
  const lang = window.currentLang || 'en';
  return i18n[lang]?.[key] || i18n['en']?.[key] || key;
}

export function initGalleryModule(options = {}) {
  galleryContainer = document.getElementById('galleryContainer');
}

export async function loadGalleryHierarchy() {
  if (!galleryContainer) return;
  galleryContainer.innerHTML = `<p style="color: #666; text-align: center; padding: 20px;">${t('galleryLoading') || 'Loading bookshelf gallery...'}</p>`;

  try {
    const querySnapshot = await getDocs(collection(db, "books"));
    const hierarchy = {};

    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      const room = data.room || 'Living Room';
      const shelfName = data.shelfName || 'Bookcase A';
      const layer = data.shelfLayer || 1;

      if (!hierarchy[room]) hierarchy[room] = {};
      if (!hierarchy[room][shelfName]) hierarchy[room][shelfName] = {};
      if (!hierarchy[room][shelfName][layer]) {
        hierarchy[room][shelfName][layer] = {
          imageUrls: new Set(),
          books: []
        };
      }

      // 호환 필드명에서 이미지 URL 추출
      const arrayFields = ['imageUrls', 'photoUrls', 'photos', 'images', 'urls'];
      const singleFields = ['imageUrl', 'photoUrl', 'photo', 'image', 'url', 'imgUrl'];

      arrayFields.forEach(field => {
        if (data[field] && Array.isArray(data[field])) {
          data[field].forEach(url => {
            if (url && typeof url === 'string' && url.trim() !== '') {
              hierarchy[room][shelfName][layer].imageUrls.add(url.trim());
            }
          });
        }
      });

      singleFields.forEach(field => {
        if (data[field] && typeof data[field] === 'string' && data[field].trim() !== '') {
          hierarchy[room][shelfName][layer].imageUrls.add(data[field].trim());
        }
      });

      hierarchy[room][shelfName][layer].books.push({
        id: docSnap.id,
        title: data.title || 'Unknown Title',
        author: data.author || 'Unknown',
        position: Number(data.position) || 1,
        isbn: data.isbn || ''
      });
    });

    const rooms = Object.keys(hierarchy);
    if (rooms.length === 0) {
      galleryContainer.innerHTML = `<p style="color: #666; text-align: center; padding: 20px;">${t('galleryEmpty') || 'No bookshelf records found in database yet.'}</p>`;
      return;
    }

    galleryContainer.innerHTML = '';

    rooms.forEach(room => {
      const roomCard = document.createElement('div');
      roomCard.className = 'gallery-room-card';

      let roomHtml = `
        <div class="gallery-room-header">
          <h3>🏠 Room: ${escapeHtml(room)}</h3>
        </div>
      `;

      Object.keys(hierarchy[room]).forEach(shelfName => {
        const shelfData = hierarchy[room][shelfName];
        const layers = Object.keys(shelfData).sort((a, b) => Number(a) - Number(b));
        const totalBooksCount = layers.reduce((acc, l) => acc + shelfData[l].books.length, 0);

        roomHtml += `
          <div class="gallery-shelf-wrapper">
            <div class="gallery-shelf-header">
              <div class="shelf-title-box">
                <h4>📚 ${escapeHtml(shelfName)}</h4>
                <span class="shelf-stats-badge">${layers.length} Layers · ${totalBooksCount} Books</span>
              </div>
              <button class="btn btn-danger btn-sm" onclick="window.deleteShelfScope('${escapeHtml(room)}', '${escapeHtml(shelfName)}')">🗑️ Shelf</button>
            </div>

            <!-- 책장 프레임 및 아코디언 스택 -->
            <div class="shelf-board-rack">
        `;

        layers.forEach(layer => {
          const layerItem = shelfData[layer];
          const imageUrlsArr = Array.from(layerItem.imageUrls);
          const sortedBooks = [...layerItem.books].sort((a, b) => a.position - b.position);
          const firstThumb = imageUrlsArr.length > 0 ? imageUrlsArr[0] : null;

          roomHtml += `
            <div class="accordion-layer-card" id="layerCard_${escapeHtml(room)}_${escapeHtml(shelfName)}_${layer}">
              <!-- 아코디언 헤더 (클릭 시 토글) -->
              <div class="accordion-layer-header" onclick="window.toggleLayerAccordion('${escapeHtml(room)}', '${escapeHtml(shelfName)}', '${layer}')">
                <div class="layer-header-left">
                  <span class="accordion-arrow">▶</span>
                  <strong class="layer-name">Layer ${layer}</strong>
                  <span class="layer-badge">${sortedBooks.length} items</span>
                </div>

                <div class="layer-header-right">
                  ${firstThumb 
                    ? `<img src="${firstThumb}" class="layer-mini-thumb" alt="Layer ${layer} preview" />` 
                    : `<span class="no-photo-badge">No photo</span>`}
                  <button class="btn btn-danger btn-sm btn-delete-layer-tight" onclick="event.stopPropagation(); window.deleteLayerScope('${escapeHtml(room)}', '${escapeHtml(shelfName)}', ${layer})">🗑️</button>
                </div>
              </div>

              <!-- 아코디언 확장 영역 (사진 트랙 & 도서 칩 리스트) -->
              <div class="accordion-layer-body" style="display: none;">
                <!-- 1. 사진 파노라마 스크롤 트랙 (Multi-shot Sequence) -->
                ${imageUrlsArr.length > 0 ? `
                  <div class="photo-panorama-scroll">
                    ${imageUrlsArr.map((url, idx) => `
                      <div class="photo-slide-item">
                        <span class="photo-shot-tag">📸 Shot #${idx + 1}</span>
                        <a href="${url}" target="_blank">
                          <img src="${url}" class="shelf-photo-view" alt="Layer ${layer} Shot ${idx + 1}" loading="lazy" />
                        </a>
                      </div>
                    `).join('')}
                  </div>
                ` : `
                  <div class="no-photo-alert">No photos registered for this layer.</div>
                `}

                <!-- 2. 도서 순서별 매핑 칩 목록 -->
                <div class="layer-books-mapping-box">
                  <div class="mapping-title">📖 Shelf Order (Left ➔ Right):</div>
                  <div class="books-chip-grid">
                    ${sortedBooks.map(b => `
                      <div class="book-pos-chip">
                        <span class="chip-pos">Pos ${b.position}</span>
                        <span class="chip-title" title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</span>
                        <span class="chip-author">${escapeHtml(b.author)}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>
            </div>
            <!-- 선반 판자 시각 효과 -->
            <div class="shelf-plank-separator"></div>
          `;
        });

        roomHtml += `
            </div> <!-- // shelf-board-rack -->
          </div> <!-- // gallery-shelf-wrapper -->
        `;
      });

      roomCard.innerHTML = roomHtml;
      galleryContainer.appendChild(roomCard);
    });

  } catch (error) {
    console.error('Gallery Load Error:', error);
    galleryContainer.innerHTML = `<p style="color: #d9534f; text-align: center;">${t('galleryError') || 'Failed to load gallery hierarchy.'}</p>`;
  }
}

// 아코디언 토글 인터랙션
window.toggleLayerAccordion = (room, shelfName, layer) => {
  const cardId = `layerCard_${room}_${shelfName}_${layer}`;
  const card = document.getElementById(cardId);
  if (!card) return;

  const body = card.querySelector('.accordion-layer-body');
  const arrow = card.querySelector('.accordion-arrow');

  if (body.style.display === 'none' || !body.style.display) {
    body.style.display = 'block';
    if (arrow) arrow.textContent = '▼';
    card.classList.add('is-expanded');
  } else {
    body.style.display = 'none';
    if (arrow) arrow.textContent = '▶';
    card.classList.remove('is-expanded');
  }
};

// 방/책장 전체 삭제
window.deleteShelfScope = async (room, shelfName) => {
  if (confirm(`Are you sure you want to delete all books and photo records in room "${room}", bookshelf "${shelfName}"?`)) {
    try {
      const q = query(collection(db, "books"), where("room", "==", room), where("shelfName", "==", shelfName));
      const querySnapshot = await getDocs(q);
      const deletePromises = [];
      querySnapshot.forEach((docSnap) => deletePromises.push(deleteDoc(doc(db, "books", docSnap.id))));

      await Promise.all(deletePromises);
      alert('Bookshelf deleted successfully.');
      await updateRoomDropdown();
      loadGalleryHierarchy();
      loadSavedBooks();
    } catch (error) {
      console.error('Shelf Delete Error:', error);
      alert('Failed to delete bookshelf.');
    }
  }
};

// 특정 레이어 삭제
window.deleteLayerScope = async (room, shelfName, layer) => {
  if (confirm(`Are you sure you want to delete records in room "${room}" - "${shelfName}", Layer ${layer}?`)) {
    try {
      const q = query(collection(db, "books"), where("room", "==", room), where("shelfName", "==", shelfName), where("shelfLayer", "==", Number(layer)));
      const querySnapshot = await getDocs(q);
      const deletePromises = [];
      querySnapshot.forEach((docSnap) => deletePromises.push(deleteDoc(doc(db, "books", docSnap.id))));

      await Promise.all(deletePromises);
      alert('Layer data deleted successfully.');
      await updateRoomDropdown();
      loadGalleryHierarchy();
      loadSavedBooks();
    } catch (error) {
      console.error('Layer Delete Error:', error);
      alert('Failed to delete layer.');
    }
  }
};