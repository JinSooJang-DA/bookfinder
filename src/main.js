// src/main.js
import './style.css';
import { db, auth } from './firebase.js'; // 💡 auth 추가
import { 
  collection, addDoc, getDocs, query, orderBy, serverTimestamp, 
  doc, deleteDoc, updateDoc, where 
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth'; // 💡 인증 함수 추가
import { i18n } from './i18n.js';
import { analyzeBookshelfImage, fetchBookByISBN } from './api.js';
import { renderScannedBooks, escapeHtml } from './ui.js';
import { saveImageLocally, getImageLocally } from './storage.js';
import { Html5Qrcode } from 'html5-qrcode';

// DOM Elements (인증 관련)
const authContainer = document.getElementById('authContainer');
const appMainWrapper = document.getElementById('appMainWrapper');
const authEmailInput = document.getElementById('authEmail');
const authPasswordInput = document.getElementById('authPassword');
const btnLogin = document.getElementById('btnLogin');
const btnRegister = document.getElementById('btnRegister');
const btnLogout = document.getElementById('btnLogout');

// DOM Elements (메인 앱 관련)
const uiLanguageSelect = document.getElementById('uiLanguageSelect');
const targetLanguageSelect = document.getElementById('targetLanguage');
const customLanguageInput = document.getElementById('customLanguageInput');

const cameraInput = document.getElementById('cameraInput');
const btnPhoto = document.getElementById('btnPhoto');
const loading = document.getElementById('loading');
const resultCard = document.getElementById('resultCard');
const bookList = document.getElementById('bookList');
const saveBtn = document.getElementById('saveBtn');
const capturedImagePreview = document.getElementById('capturedImagePreview');

const totalLayersInput = document.getElementById('totalLayers');
const shelfLayerSelect = document.getElementById('shelfLayer');
const shotsPerLayerInput = document.getElementById('shotsPerLayer');

const searchInput = document.getElementById('searchInput');
const filterRoom = document.getElementById('filterRoom');
const filterShelf = document.getElementById('filterShelf');
const filterLayer = document.getElementById('filterLayer');
const deleteGroupBtn = document.getElementById('deleteGroupBtn');
const savedBookList = document.getElementById('savedBookList');

// Gallery View Elements
const galleryContainer = document.getElementById('galleryContainer');

// Barcode View Elements
const submitIsbnBtn = document.getElementById('submitIsbnBtn');
const isbnInput = document.getElementById('isbnInput');
const bcRoomInput = document.getElementById('bcRoomInput');
const bcShelfInput = document.getElementById('bcShelfInput');
const bcLayerInput = document.getElementById('bcLayerInput');
const bcPositionInput = document.getElementById('bcPositionInput');

// Live Scanner Elements
const startLiveScanBtn = document.getElementById('startLiveScanBtn');
const stopLiveScanBtn = document.getElementById('stopLiveScanBtn');

// Edit Modal Elements
const editModal = document.getElementById('editModal');
const editTitleInput = document.getElementById('editTitle');
const editAuthorInput = document.getElementById('editAuthor');
const editIsbnInput = document.getElementById('editIsbn');
const fetchIsbnInModal = document.getElementById('fetchIsbnInModal');
const editRoomInput = document.getElementById('editRoom');
const editShelfInput = document.getElementById('editShelf');
const editLayerInput = document.getElementById('editLayer');
const editPositionInput = document.getElementById('editPosition');
const saveEditBtn = document.getElementById('saveEditBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
let currentLang = 'en';
let currentEditingBookId = null;

// Multi-shot session state
let currentShotIndex = 0;
let accumulatedBooks = [];
let accumulatedFiles = [];

// Html5Qrcode 인스턴스 관리
let html5QrCode = null;

// 🔐 로그인 상태 감지 및 화면 전환 로직
onAuthStateChanged(auth, (user) => {
  if (user) {
    authContainer.style.display = 'none';
    appMainWrapper.style.display = 'block';
    
    // 로그인 직후 초기 데이터 로드
    updateRoomDropdown();
    loadSavedBooks();
  } else {
    authContainer.style.display = 'block';
    appMainWrapper.style.display = 'none';
  }
});

// 로그인 버튼 이벤트
btnLogin.addEventListener('click', async () => {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value.trim();
  if (!email || !password) {
    alert('이메일과 비밀번호를 입력해주세요.');
    return;
  }
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    alert('로그인 실패: ' + error.message);
  }
});

// 회원가입 버튼 이벤트
btnRegister.addEventListener('click', async () => {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value.trim();
  if (!email || !password) {
    alert('가입할 이메일과 비밀번호를 입력해주세요.');
    return;
  }
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    alert('계정이 생성되었으며 자동으로 로그인됩니다.');
  } catch (error) {
    alert('회원가입 실패: ' + error.message);
  }
});

// 로그아웃 버튼 이벤트
btnLogout.addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout error:', error);
  }
});

// 1. Switch App UI Language
uiLanguageSelect.addEventListener('change', (e) => {
  currentLang = e.target.value;
  applyUiLanguage(currentLang);
});

window.switchView = (viewId) => {
  const dashboard = document.getElementById('mainDashboard');
  const navBackBar = document.getElementById('navBackBar');
  const subViews = document.querySelectorAll('.sub-view');

  stopScanner();

  subViews.forEach(v => v.style.display = 'none');

  if (viewId === 'mainDashboard') {
    dashboard.style.display = 'block';
    navBackBar.style.display = 'none';
  } else {
    dashboard.style.display = 'none';
    navBackBar.style.display = 'block';
    const targetView = document.getElementById(viewId);
    if (targetView) {
      targetView.style.display = 'block';
      if (viewId === 'galleryView') {
        loadGalleryHierarchy();
      }
    }
  }

  const currentLang = document.getElementById('uiLanguageSelect').value;
  applyUiLanguage(currentLang);
};

function applyUiLanguage(lang) {
  const t = i18n[lang];
  
  document.getElementById('appTitle').textContent = t.appTitle;
  document.getElementById('mainHeading').textContent = t.mainHeading;
  document.getElementById('lblUiLang').textContent = t.lblUiLang;
  
  document.getElementById('menuScanTitle').textContent = t.menuScanTitle;
  document.getElementById('menuScanDesc').textContent = t.menuScanDesc;
  document.getElementById('menuGalleryTitle').textContent = t.menuGalleryTitle;
  document.getElementById('menuGalleryDesc').textContent = t.menuGalleryDesc;
  document.getElementById('menuSearchTitle').textContent = t.menuSearchTitle;
  document.getElementById('menuSearchDesc').textContent = t.menuSearchDesc;
  document.getElementById('menuBarcodeTitle').textContent = t.menuBarcodeTitle;
  document.getElementById('menuBarcodeDesc').textContent = t.menuBarcodeDesc;
  document.getElementById('backToMenuBtn').textContent = t.backToMenu;

  document.getElementById('scanViewTitle').textContent = t.scanViewTitle;
  document.getElementById('lblTargetLang').textContent = t.lblTargetLang;
  document.getElementById('roomInputLabel').textContent = t.roomInputLabel;
  document.getElementById('shelfNameLabel').textContent = t.shelfNameLabel;
  document.getElementById('lblTotalLayers').textContent = t.lblTotalLayers;
  document.getElementById('lblCurrentLayer').textContent = t.lblCurrentLayer;
  document.getElementById('lblShotsCount').textContent = t.lblShotsCount;
  btnPhoto.textContent = t.btnPhoto;
  document.getElementById('loading').textContent = t.txtLoading;
  document.getElementById('txtDetectedBooks').textContent = t.txtDetectedBooks;
  document.getElementById('saveBtn').textContent = t.saveBtn;

  document.getElementById('galleryViewTitle').textContent = t.galleryViewTitle;

  document.getElementById('searchViewTitle').textContent = t.searchViewTitle;
  document.getElementById('lblSearch').textContent = t.lblSearch;
  searchInput.placeholder = t.searchPlaceholder;
  document.getElementById('lblFilterGroup').textContent = t.lblFilterGroup;
  document.getElementById('deleteGroupBtn').textContent = t.deleteGroupBtn;

  document.getElementById('barcodeViewTitle').textContent = t.barcodeViewTitle;
  document.getElementById('barcodeDesc').textContent = t.barcodeDesc;
  document.getElementById('bcRoomLabel').textContent = t.bcRoomLabel;
  document.getElementById('bcShelfLabel').textContent = t.bcShelfLabel;
  document.getElementById('bcLayerLabel').textContent = t.bcLayerLabel;
  document.getElementById('bcPositionLabel').textContent = t.bcPositionLabel;
  document.getElementById('isbnLabel').textContent = t.isbnLabel;
  isbnInput.placeholder = t.isbnPlaceholder;
  submitIsbnBtn.textContent = t.submitIsbnBtn;

  updateLayerSelectOptions();
  updateRoomDropdown();
  loadSavedBooks();
}

targetLanguageSelect.addEventListener('change', () => {
  if (targetLanguageSelect.value === 'CUSTOM') {
    customLanguageInput.style.display = 'block';
    customLanguageInput.focus();
  } else {
    customLanguageInput.style.display = 'none';
  }
});

function updateLayerSelectOptions() {
  const t = i18n[currentLang];
  const total = parseInt(totalLayersInput.value) || 1;
  shelfLayerSelect.innerHTML = '';
  for (let i = 1; i <= total; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${t.layerPrefix} ${i}` + (i === 1 ? ` ${t.top}` : i === total ? ` ${t.bottom}` : '');
    shelfLayerSelect.appendChild(opt);
  }
}
totalLayersInput.addEventListener('input', updateLayerSelectOptions);

function resetShotSession() {
  currentShotIndex = 0;
  accumulatedBooks = [];
  accumulatedFiles = [];
  resultCard.style.display = 'none';
  capturedImagePreview.style.display = 'none';
}

totalLayersInput.addEventListener('change', resetShotSession);
shelfLayerSelect.addEventListener('change', resetShotSession);
shotsPerLayerInput.addEventListener('change', resetShotSession);

cameraInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const totalShots = parseInt(shotsPerLayerInput.value) || 1;
  currentShotIndex++;
  accumulatedFiles.push(file);

  const previewUrl = URL.createObjectURL(file);
  capturedImagePreview.src = previewUrl;
  capturedImagePreview.style.display = 'block';

  let selectedLang = targetLanguageSelect.value;
  if (selectedLang === 'CUSTOM') {
    selectedLang = customLanguageInput.value.trim() || 'English';
  }

  loading.style.display = 'block';
  resultCard.style.display = 'none';

  try {
    const newDetectedBooks = await analyzeBookshelfImage(file, selectedLang, apiKey);

    newDetectedBooks.forEach(newBook => {
      const cleanTitle = (newBook.title || '').trim().toLowerCase();
      const cleanAuthor = (newBook.author || '').trim().toLowerCase();

      const isDuplicate = accumulatedBooks.some(existing => {
        const exTitle = (existing.title || '').trim().toLowerCase();
        const exAuthor = (existing.author || '').trim().toLowerCase();
        return exTitle === cleanTitle && (exAuthor === cleanAuthor || cleanAuthor === 'unknown' || exAuthor === 'unbekannt');
      });

      if (!isDuplicate) {
        accumulatedBooks.push(newBook);
      }
    });

    accumulatedBooks.forEach((book, idx) => {
      book.position = idx + 1;
    });

    if (currentShotIndex < totalShots) {
      alert(`${i18n[currentLang].shotProgress} (${currentShotIndex + 1}/${totalShots})`);
      loading.style.display = 'none';
      cameraInput.value = '';
    } else {
      loading.style.display = 'none';
      renderScannedBooks(accumulatedBooks, resultCard, bookList);
    }

  } catch (error) {
    console.error('Analysis Error:', error);
    alert('Failed to analyze image.');
    loading.style.display = 'none';
  }
});

saveBtn.addEventListener('click', async () => {
  const t = i18n[currentLang];
  if (accumulatedBooks.length === 0) return;

  const room = document.getElementById('roomInput').value.trim() || 'Living Room';
  const shelfName = document.getElementById('shelfName').value.trim() || 'Bookcase A';
  const shelfLayer = shelfLayerSelect.value;
  const totalLayers = totalLayersInput.value;

  try {
    saveBtn.disabled = true;

    const localImageIds = [];
    for (const file of accumulatedFiles) {
      const imgId = await saveImageLocally(file);
      localImageIds.push(imgId);
    }

    for (const book of accumulatedBooks) {
      await addDoc(collection(db, "books"), {
        title: book.title,
        author: book.author || 'Unknown',
        language: book.language || 'original',
        room: room,
        shelfName: shelfName,
        shelfLayer: Number(shelfLayer),
        totalLayers: Number(totalLayers),
        position: book.position,
        localImageIds: localImageIds,
        createdAt: serverTimestamp()
      });
    }

    alert(t.alertSuccessSave);
    resultCard.style.display = 'none';
    resetShotSession();
    
    await updateRoomDropdown();
    loadSavedBooks();
  } catch (error) {
    console.error('Save Error:', error);
    alert('Failed to save books.');
  } finally {
    saveBtn.disabled = false;
  }
});

// 실시간 바코드 스캐너 시작 및 제어 로직
if (startLiveScanBtn && stopLiveScanBtn) {
  startLiveScanBtn.addEventListener('click', async () => {
    const readerDiv = document.getElementById('reader');
    readerDiv.style.display = 'block';
    startLiveScanBtn.style.display = 'none';
    stopLiveScanBtn.style.display = 'inline-block';

    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("reader");
    }

    const config = { fps: 10, qrbox: { width: 250, height: 100 } };

    try {
      await html5QrCode.start(
        { facingMode: "environment" }, 
        config, 
        (decodedText) => {
          isbnInput.value = decodedText;
          alert(`바코드가 스캔되었습니다: ${decodedText}`);
          stopScanner();
        },
        () => {}
      );
    } catch (err) {
      console.error("Camera start error:", err);
      alert("카메라를 시작할 수 없습니다. 권한을 확인해주세요.");
      stopScanner();
    }
  });

  stopLiveScanBtn.addEventListener('click', () => {
    stopScanner();
  });
}

function stopScanner() {
  if (html5QrCode && html5QrCode.isScanning) {
    html5QrCode.stop().then(() => {}).catch(err => {
      console.error("Failed to stop scanner.", err);
    });
  }
  const readerDiv = document.getElementById('reader');
  if (readerDiv) readerDiv.style.display = 'none';
  if (startLiveScanBtn) startLiveScanBtn.style.display = 'inline-block';
  if (stopLiveScanBtn) stopLiveScanBtn.style.display = 'none';
}

async function loadGalleryHierarchy() {
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
              <button class="btn btn-danger btn-sm" onclick="deleteShelfScope('${escapeHtml(room)}', '${escapeHtml(shelfName)}')">🗑️ Delete Entire Shelf</button>
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
            roomHtml += `<button class="btn btn-secondary btn-sm" onclick='viewLayerGalleryPhotos("${escapeHtml(room)}", "${escapeHtml(shelfName)}", ${layer}, ${JSON.stringify(imageIdsArr)})'>📷 View Photos (${imageIdsArr.length})</button>`;
          } else {
            roomHtml += `<span style="font-size: 0.8rem; color: #adb5bd; align-self: center;">No photo</span>`;
          }

          roomHtml += `
                <button class="btn btn-danger btn-sm" onclick="deleteLayerScope('${escapeHtml(room)}', '${escapeHtml(shelfName)}', ${layer})">🗑️ Layer</button>
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

window.deleteShelfScope = async (room, shelfName) => {
  if (confirm(`정말 "${room}" 방의 "${shelfName}" 책장에 속한 모든 도서와 사진 기록을 삭제하시겠습니까?`)) {
    try {
      const q = query(collection(db, "books"), where("room", "==", room), where("shelfName", "==", shelfName));
      const querySnapshot = await getDocs(q);
      const deletePromises = [];
      querySnapshot.forEach((docSnap) => deletePromises.push(deleteDoc(doc(db, "books", docSnap.id))));

      await Promise.all(deletePromises);
      alert('책장이 성공적으로 삭제되었습니다.');
      await updateRoomDropdown();
      loadGalleryHierarchy();
      loadSavedBooks();
    } catch (error) {
      console.error('Shelf Delete Error:', error);
      alert('책장 삭제에 실패했습니다.');
    }
  }
};

window.deleteLayerScope = async (room, shelfName, layer) => {
  if (confirm(`정말 "${room}" - "${shelfName}"의 ${layer}층에 속한 기록들을 삭제하시겠습니까?`)) {
    try {
      const q = query(collection(db, "books"), where("room", "==", room), where("shelfName", "==", shelfName), where("shelfLayer", "==", Number(layer)));
      const querySnapshot = await getDocs(q);
      const deletePromises = [];
      querySnapshot.forEach((docSnap) => deletePromises.push(deleteDoc(doc(db, "books", docSnap.id))));

      await Promise.all(deletePromises);
      alert('해당 층 데이터가 성공적으로 삭제되었습니다.');
      await updateRoomDropdown();
      loadGalleryHierarchy();
      loadSavedBooks();
    } catch (error) {
      console.error('Layer Delete Error:', error);
      alert('층 삭제에 실패했습니다.');
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

submitIsbnBtn.addEventListener('click', async () => {
  const isbn = isbnInput.value.trim();
  if (!isbn) {
    alert('Please enter an ISBN code.');
    return;
  }

  const room = bcRoomInput.value.trim() || 'Living Room';
  const shelfName = bcShelfInput.value.trim() || 'Bookcase A';
  const shelfLayer = Number(bcLayerInput.value) || 1;
  const position = Number(bcPositionInput.value) || 1;

  try {
    submitIsbnBtn.disabled = true;
    submitIsbnBtn.textContent = 'Fetching...';

    const bookInfo = await fetchBookByISBN(isbn);

    await addDoc(collection(db, "books"), {
      title: bookInfo.title,
      author: bookInfo.author,
      isbn: bookInfo.isbn,
      room: room,
      shelfName: shelfName,
      shelfLayer: shelfLayer,
      position: position,
      createdAt: serverTimestamp()
    });

    alert(`Successfully added:\n${bookInfo.title} (${bookInfo.author})`);
    isbnInput.value = '';
    bcPositionInput.value = position + 1;
    await updateRoomDropdown();
    loadSavedBooks();
  } catch (error) {
    console.error('ISBN Add Error:', error);
    alert('Failed to fetch or save book via ISBN. Please check the code.');
  } finally {
    submitIsbnBtn.disabled = false;
    submitIsbnBtn.textContent = '➕ Add Book';
  }
});

async function updateRoomDropdown() {
  const t = i18n[currentLang];
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
  const t = i18n[currentLang];
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
  const t = i18n[currentLang];
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

filterRoom.addEventListener('change', async () => {
  const t = i18n[currentLang];
  const selectedRoom = filterRoom.value;
  if (selectedRoom === 'ALL') {
    filterShelf.innerHTML = `<option value="ALL">${t.allShelves}</option>`;
    filterShelf.disabled = true;
    filterLayer.innerHTML = `<option value="ALL">${t.allLayers}</option>`;
    filterLayer.disabled = true;
  } else {
    filterShelf.disabled = false;
    await updateShelfDropdown(selectedRoom);
  }
  filterLayer.value = 'ALL';
  loadSavedBooks();
});

filterShelf.addEventListener('change', async () => {
  const t = i18n[currentLang];
  const selectedRoom = filterRoom.value;
  const selectedShelf = filterShelf.value;

  if (selectedShelf === 'ALL') {
    filterLayer.innerHTML = `<option value="ALL">${t.allLayers}</option>`;
    filterLayer.disabled = true;
  } else {
    filterLayer.disabled = false;
    await updateLayerFilterOptions(selectedRoom, selectedShelf);
  }
  loadSavedBooks();
});

filterLayer.addEventListener('change', loadSavedBooks);
searchInput.addEventListener('input', loadSavedBooks);

async function loadSavedBooks() {
  const t = i18n[currentLang];
  savedBookList.innerHTML = '<small>Loading books...</small>';
  try {
    const room = filterRoom.value;
    const shelf = filterShelf.value;
    const layer = filterLayer.value;
    const keyword = searchInput.value.trim().toLowerCase();

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
      if (book.localImageIds && book.localImageIds.length > 0) {
        photoBtnHtml = `<button class="btn btn-secondary btn-sm" onclick="viewLocalImages(${JSON.stringify(book.localImageIds)})">📷 View Photos (${book.localImageIds.length})</button>`;
      } else if (book.localImageId) {
        photoBtnHtml = `<button class="btn btn-secondary btn-sm" onclick="viewLocalImage(${book.localImageId})">📷 View Photo</button>`;
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
          <button class="btn btn-secondary btn-sm" onclick="openEditModal(
            '${bookId}', 
            '${escapeHtml(book.title)}', 
            '${escapeHtml(book.author || '')}', 
            '${escapeHtml(book.room || '')}', 
            '${escapeHtml(book.shelfName || '')}', 
            ${book.shelfLayer || 1}, 
            ${book.position || 1},
            '${book.isbn || ''}'
          )">✏️ Edit / ISBN</button>
          <button class="btn btn-danger btn-sm" onclick="deleteBook('${bookId}', '${escapeHtml(book.title)}')">🗑️ Delete</button>
        </div>
      `;
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

window.viewLocalImage = async (imageId) => {
  const file = await getImageLocally(imageId);
  if (file) {
    const imageUrl = URL.createObjectURL(file);
    const newWindow = window.open();
    newWindow.document.write(`<img src="${imageUrl}" style="max-width:100%;" alt="Shelf Photo"/>`);
  } else {
    alert("Local image not found on this device.");
  }
};

window.viewLocalImages = async (imageIds) => {
  const newWindow = window.open();
  newWindow.document.write(`<h3>Shelf Segment Photos</h3>`);
  for (const id of imageIds) {
    const file = await getImageLocally(id);
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      newWindow.document.write(`<div style="margin-bottom:15px;"><img src="${imageUrl}" style="max-width:100%; border:1px solid #ccc;" alt="Segment Photo"/></div>`);
    }
  }
};

window.deleteBook = async (bookId, title) => {
  const t = i18n[currentLang];
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
};

window.openEditModal = (bookId, title, author, room, shelf, layer, position, isbn) => {
  currentEditingBookId = bookId;
  
  editTitleInput.value = title;
  editAuthorInput.value = author;
  if (editIsbnInput) editIsbnInput.value = (isbn && isbn !== 'undefined') ? isbn : '';
  editRoomInput.value = room;
  editShelfInput.value = shelf;
  editLayerInput.value = layer;
  editPositionInput.value = position;

  editModal.style.display = 'flex';
};

cancelEditBtn.addEventListener('click', () => {
  editModal.style.display = 'none';
  currentEditingBookId = null;
});

fetchIsbnInModal.addEventListener('click', async () => {
  const isbn = editIsbnInput.value.trim();
  if (!isbn) {
    alert('Please enter an ISBN first.');
    return;
  }
  try {
    fetchIsbnInModal.textContent = 'Fetching...';
    const info = await fetchBookByISBN(isbn);
    editTitleInput.value = info.title;
    editAuthorInput.value = info.author;
    alert('Book info updated via ISBN!');
  } catch (err) {
    alert('Could not fetch book info for this ISBN.');
  } finally {
    fetchIsbnInModal.textContent = '🔄 Fetch Info via ISBN';
  }
});

saveEditBtn.addEventListener('click', async () => {
  if (!currentEditingBookId) return;

  const t = i18n[currentLang];
  const updatedData = {
    title: editTitleInput.value.trim(),
    author: editAuthorInput.value.trim(),
    isbn: editIsbnInput ? editIsbnInput.value.trim() : '',
    room: editRoomInput.value.trim(),
    shelfName: editShelfInput.value.trim(),
    shelfLayer: Number(editLayerInput.value),
    position: Number(editPositionInput.value)
  };

  if (!updatedData.title || !updatedData.room) {
    alert("Please fill in at least the Title and Room Name.");
    return;
  }

  try {
    saveEditBtn.disabled = true;
    await updateDoc(doc(db, "books", currentEditingBookId), updatedData);
    
    alert(t.alertSuccessUpdate);
    editModal.style.display = 'none';
    currentEditingBookId = null;

    await updateRoomDropdown();
    loadSavedBooks();
  } catch (error) {
    console.error('Update Error:', error);
    alert('Failed to update book information.');
  } finally {
    saveEditBtn.disabled = false;
  }
});

deleteGroupBtn.addEventListener('click', async () => {
  const t = i18n[currentLang];
  const room = filterRoom.value;
  const shelf = filterShelf.value;
  const layer = filterLayer.value;

  if (room === 'ALL') {
    alert(t.alertSelectRoomFirst);
    return;
  }

  let scopeText = `[${room}]`;
  if (shelf !== 'ALL') scopeText += ` -> [${shelf}]`;
  if (layer !== 'ALL') scopeText += ` -> [${t.layerPrefix} ${layer}]`;

  if (confirm(`${t.confirmDeleteGroup}${scopeText}`)) {
    try {
      let conditions = [where("room", "==", room)];
      if (shelf !== 'ALL') conditions.push(where("shelfName", "==", shelf));
      if (layer !== 'ALL') conditions.push(where("shelfLayer", "==", Number(layer)));

      const q = query(collection(db, "books"), ...conditions);
      const querySnapshot = await getDocs(q);
      
      const deletePromises = [];
      querySnapshot.forEach((docSnap) => deletePromises.push(deleteDoc(doc(db, "books", docSnap.id))));

      await Promise.all(deletePromises);
      alert(t.alertSuccessDelete);
      
      await updateRoomDropdown();
      loadSavedBooks();
    } catch (error) {
      console.error('Group Delete Error:', error);
      alert('Failed to delete group.');
    }
  }
});

applyUiLanguage('en');