// src/gallery.js
import { db } from './firebase.js';
import { collection, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';
import { escapeHtml } from './ui.js';
import { getImageLocally } from './storage.js';
import { updateRoomDropdown, loadSavedBooks } from './booklist.js';

let galleryContainer = null;

export function initGalleryModule(options = {}) {
  galleryContainer = document.getElementById('galleryContainer');
}

export async function loadGalleryHierarchy() {
  if (!galleryContainer) return;
  galleryContainer.innerHTML = '<p style="color: #666;">Loading bookshelf gallery...</p>';

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
          imageIds: new Set(),
          booksCount: 0
        };
      }

      if (data.localImageIds && Array.isArray(data.localImageIds)) {
        data.localImageIds.forEach(id => hierarchy[room][shelfName][layer].imageIds.add(id));
      } else if (data.localImageId) {
        hierarchy[room][shelfName][layer].imageIds.add(data.localImageId);
      }
      hierarchy[room][shelfName][layer].booksCount++;
    });

    const rooms = Object.keys(hierarchy);
    if (rooms.length === 0) {
      galleryContainer.innerHTML = '<p style="color: #666;">No bookshelf records found in database yet.</p>';
      return;
    }

    galleryContainer.innerHTML = '';

    for (const room of rooms) {
      const roomDiv = document.createElement('div');
      roomDiv.className = 'card';
      roomDiv.style.marginBottom = '20px';
      roomDiv.style.backgroundColor = '#fdfdfe';
      
      let roomHtml = `<h3 style="margin-top: 0; color: #0d6efd; display: flex; align-items: center; gap: 8px;">🏠 Room: ${escapeHtml(room)}</h3>`;

      for (const shelfName of Object.keys(hierarchy[room])) {
        roomHtml += `
          <div style="margin-top: 12px; padding: 12px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <h4 style="margin: 0; color: #333; display: flex; align-items: center; gap: 6px;">
                📚 Bookcase: ${escapeHtml(shelfName)}
              </h4>
              <button class="btn btn-danger btn-sm" onclick="window.deleteShelfScope('${escapeHtml(room)}', '${escapeHtml(shelfName)}')">🗑️ Delete Entire Shelf</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
        `;

        for (const layer of Object.keys(hierarchy[room][shelfName]).sort((a,b) => a - b)) {
          const layerData = hierarchy[room][shelfName][layer];
          const imageIdsArr = Array.from(layerData.imageIds);

          roomHtml += `
            <div style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; padding: 10px 14px; border-radius: 6px; border: 1px solid #dee2e6;">
              <div>
                <strong style="font-size: 0.95rem; color: #495057;">Layer ${layer}</strong>
                <span style="font-size: 0.85rem; color: #6c757d; margin-left: 8px;">(${layerData.booksCount} items)</span>
              </div>
              <div style="display: flex; gap: 6px;">
          `;

          if (imageIdsArr.length > 0) {
            roomHtml += `<button class="btn btn-secondary btn-sm" onclick='window.viewLayerGalleryPhotos("${escapeHtml(room)}", "${escapeHtml(shelfName)}", ${layer}, ${JSON.stringify(imageIdsArr)})'>📷 View Photos (${imageIdsArr.length})</button>`;
          } else {
            roomHtml += `<span style="font-size: 0.8rem; color: #adb5bd; align-self: center;">No photo</span>`;
          }

          roomHtml += `
                <button class="btn btn-danger btn-sm" onclick="window.deleteLayerScope('${escapeHtml(room)}', '${escapeHtml(shelfName)}', ${layer})">🗑️ Layer</button>
              </div>
            </div>
          `;
        }

        roomHtml += `</div></div>`;
      }

      roomDiv.innerHTML = roomHtml;
      galleryContainer.appendChild(roomDiv);
    }

  } catch (error) {
    console.error('Gallery Load Error:', error);
    galleryContainer.innerHTML = '<p style="color: #d9534f;">Failed to load gallery hierarchy.</p>';
  }
}

// 전역 윈도우 스코프 함수 등록 (HTML onclick 지원용)
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

window.viewLayerGalleryPhotos = async (room, shelfName, layer, imageIds) => {
  const newWindow = window.open('', '_blank', 'width=800,height=900');
  newWindow.document.write(`
    <html>
      <head>
        <title>${room} - ${shelfName} (Layer ${layer}) Photos</title>
        <style>
          body { font-family: sans-serif; padding: 20px; background: #f4f6f9; color: #333; }
          h2 { color: #0d6efd; margin-bottom: 5px; }
          .subtitle { color: #666; margin-bottom: 20px; font-size: 0.95rem; }
          .photo-container { background: #fff; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
          img { max-width: 100%; height: auto; border-radius: 4px; border: 1px solid #ddd; display: block; margin-top: 10px; }
          .shot-label { font-weight: bold; color: #495057; font-size: 1.1rem; }
        </style>
      </head>
      <body>
        <h2>📚 ${escapeHtml(shelfName)}</h2>
        <div class="subtitle">📍 Room: ${escapeHtml(room)} | Layer ${layer} (Total Shots: ${imageIds.length})</div>
        <div id="photos">Loading captured sequence...</div>
      </body>
    </html>
  `);

  let contentHtml = '';
  for (let i = 0; i < imageIds.length; i++) {
    const id = imageIds[i];
    const file = await getImageLocally(id);
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      contentHtml += `
        <div class="photo-container">
          <div class="shot-label">📸 Shot Sequence #${i + 1}</div>
          <img src="${imageUrl}" alt="Shelf Shot ${i + 1}"/>
        </div>
      `;
    }
  }

  const photosDiv = newWindow.document.getElementById('photos');
  if (photosDiv) {
    photosDiv.innerHTML = contentHtml || '<p>No image files found locally.</p>';
  }
};