// src/main.js
import './style.css';
import { db, auth } from './firebase.js';
import { 
  collection, query, 
  doc, updateDoc, where, serverTimestamp, addDoc, getDocs, deleteDoc 
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { i18n } from './i18n.js';
import { analyzeBookshelfImage, fetchBookByISBN } from './api.js';
import { renderScannedBooks } from './ui.js';
import { saveImageToImgBB } from './storage.js';

import { initBarcodeModule, loadBarcodeHierarchyOptions, stopScanner } from './barcode.js';
import { initBookListModule, updateRoomDropdown, loadSavedBooks } from './booklist.js';
import { initGalleryModule, loadGalleryHierarchy } from './gallery.js';

const authContainer = document.getElementById('authContainer');
const appMainWrapper = document.getElementById('appMainWrapper');
const authEmailInput = document.getElementById('authEmail');
const authPasswordInput = document.getElementById('authPassword');
const btnLogin = document.getElementById('btnLogin');
const btnRegister = document.getElementById('btnRegister');
const btnLogout = document.getElementById('btnLogout');

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

const filterRoom = document.getElementById('filterRoom');
const filterShelf = document.getElementById('filterShelf');
const filterLayer = document.getElementById('filterLayer');
const deleteGroupBtn = document.getElementById('deleteGroupBtn');

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
window.currentLang = 'en'; 
let currentEditingBookId = null;

let currentShotIndex = 0;
let accumulatedBooks = [];
let accumulatedFiles = [];

initBookListModule({
  getCurrentLang: () => currentLang,
  openEditModalCallback: openEditModal
});

initGalleryModule();

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (authContainer) authContainer.style.display = 'none';
    if (appMainWrapper) appMainWrapper.style.display = 'block';
    
    updateRoomDropdown();
    loadSavedBooks();

    initBarcodeModule({
      updateRoomDropdown,
      loadSavedBooks
    });
  } else {
    if (authContainer) authContainer.style.display = 'block';
    if (appMainWrapper) appMainWrapper.style.display = 'none';
  }
});

btnLogin?.addEventListener('click', async () => {
  const email = authEmailInput?.value.trim() || '';
  const password = authPasswordInput?.value.trim() || '';
  if (!email || !password) {
    alert('Please enter both email and password.');
    return;
  }
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    alert('Login failed: ' + error.message);
  }
});

btnRegister?.addEventListener('click', async () => {
  const email = authEmailInput?.value.trim() || '';
  const password = authPasswordInput?.value.trim() || '';
  if (!email || !password) {
    alert('Please enter email and password for registration.');
    return;
  }
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    alert('Account created successfully and you are now logged in.');
  } catch (error) {
    alert('Registration failed: ' + error.message);
  }
});

btnLogout?.addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout error:', error);
  }
});

uiLanguageSelect?.addEventListener('change', (e) => {
  currentLang = e.target.value;
  window.currentLang = currentLang;
  applyUiLanguage(currentLang);
});

window.switchView = (viewId) => {
  const dashboard = document.getElementById('mainDashboard');
  const navBackBar = document.getElementById('navBackBar');
  const subViews = document.querySelectorAll('.sub-view');

  stopScanner();

  subViews.forEach(v => v.style.display = 'none');

  if (viewId === 'mainDashboard') {
    if (dashboard) dashboard.style.display = 'block';
    if (navBackBar) navBackBar.style.display = 'none';
  } else {
    if (dashboard) dashboard.style.display = 'none';
    if (navBackBar) navBackBar.style.display = 'block';
    const targetView = document.getElementById(viewId);
    if (targetView) {
      targetView.style.display = 'block';
      if (viewId === 'galleryView') {
        loadGalleryHierarchy();
      }
      if (viewId === 'barcodeView') {
        loadBarcodeHierarchyOptions();
      }
    }
  }

  const langSelect = document.getElementById('uiLanguageSelect');
  const currentLangVal = langSelect ? langSelect.value : 'en';
  applyUiLanguage(currentLangVal);
};

function applyUiLanguage(lang) {
  const t = i18n[lang] || i18n['en'];
  window.currentLang = lang;
  
  const setTxt = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setTxt('appTitle', t.appTitle);
  setTxt('mainHeading', t.mainHeading);
  setTxt('lblUiLang', t.lblUiLang);
  
  setTxt('menuScanTitle', t.menuScanTitle);
  setTxt('menuScanDesc', t.menuScanDesc);
  setTxt('menuGalleryTitle', t.menuGalleryTitle);
  setTxt('menuGalleryDesc', t.menuGalleryDesc);
  setTxt('menuSearchTitle', t.menuSearchTitle);
  setTxt('menuSearchDesc', t.menuSearchDesc);
  setTxt('menuBarcodeTitle', t.menuBarcodeTitle);
  setTxt('menuBarcodeDesc', t.menuBarcodeDesc);
  setTxt('backToMenuBtn', t.backToMenu);

  setTxt('scanViewTitle', t.scanViewTitle);
  setTxt('lblTargetLang', t.lblTargetLang);
  setTxt('roomInputLabel', t.roomInputLabel);
  setTxt('shelfNameLabel', t.shelfNameLabel);
  setTxt('lblTotalLayers', t.lblTotalLayers);
  setTxt('lblCurrentLayer', t.lblCurrentLayer);
  setTxt('lblShotsCount', t.lblShotsCount);
  if (btnPhoto) btnPhoto.textContent = t.btnPhoto;
  setTxt('loading', t.txtLoading);
  setTxt('txtDetectedBooks', t.txtDetectedBooks);
  if (saveBtn) saveBtn.textContent = t.saveBtn;

  setTxt('galleryViewTitle', t.galleryViewTitle);

  setTxt('searchViewTitle', t.searchViewTitle);
  setTxt('lblSearch', t.lblSearch);
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.placeholder = t.searchPlaceholder;
  setTxt('lblFilterGroup', t.lblFilterGroup);
  if (deleteGroupBtn) deleteGroupBtn.textContent = t.deleteGroupBtn;

  setTxt('barcodeViewTitle', t.barcodeViewTitle);
  setTxt('barcodeDesc', t.barcodeDesc);
  setTxt('bcRoomLabel', t.bcRoomLabel);
  setTxt('bcShelfLabel', t.bcShelfLabel);
  setTxt('bcLayerLabel', t.bcLayerLabel);
  setTxt('bcPositionLabel', t.bcPositionLabel);
  setTxt('isbnLabel', t.isbnLabel);
  
  const isbnInputEl = document.getElementById('isbnInput');
  if (isbnInputEl) isbnInputEl.placeholder = t.isbnPlaceholder;
  
  const submitIsbnBtnEl = document.getElementById('submitIsbnBtn');
  if (submitIsbnBtnEl) submitIsbnBtnEl.textContent = t.submitIsbnBtn;

  const fetchIsbnBtnEl = document.getElementById('fetchIsbnBtn');
  if (fetchIsbnBtnEl) fetchIsbnBtnEl.textContent = t.fetchIsbnBtn || '🔄 Fetch';

  const autoFillBtn = document.getElementById('autoFillIsbnBtn');
  if (autoFillBtn) autoFillBtn.textContent = t.btnAutoFillIsbn;

  updateLayerSelectOptions();
  updateRoomDropdown();
  loadSavedBooks();
}

targetLanguageSelect?.addEventListener('change', () => {
  if (targetLanguageSelect.value === 'CUSTOM') {
    if (customLanguageInput) {
      customLanguageInput.style.display = 'block';
      customLanguageInput.focus();
    }
  } else {
    if (customLanguageInput) customLanguageInput.style.display = 'none';
  }
});

function updateLayerSelectOptions() {
  if (!shelfLayerSelect || !totalLayersInput) return;
  const t = i18n[currentLang] || i18n['en'];
  const total = parseInt(totalLayersInput.value) || 1;
  shelfLayerSelect.innerHTML = '';
  for (let i = 1; i <= total; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${t.layerPrefix} ${i}` + (i === 1 ? ` ${t.top}` : i === total ? ` ${t.bottom}` : '');
    shelfLayerSelect.appendChild(opt);
  }
}
totalLayersInput?.addEventListener('input', updateLayerSelectOptions);

function resetShotSession() {
  currentShotIndex = 0;
  accumulatedBooks = [];
  accumulatedFiles = [];
  if (resultCard) resultCard.style.display = 'none';
  if (capturedImagePreview) capturedImagePreview.style.display = 'none';
}

totalLayersInput?.addEventListener('change', resetShotSession);
shelfLayerSelect?.addEventListener('change', resetShotSession);
shotsPerLayerInput?.addEventListener('change', resetShotSession);

cameraInput?.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const tStr = i18n[currentLang] || i18n['en'];

  const totalShots = parseInt(shotsPerLayerInput?.value) || 1;
  currentShotIndex++;
  accumulatedFiles.push(file);

  const previewUrl = URL.createObjectURL(file);
  if (capturedImagePreview) {
    capturedImagePreview.src = previewUrl;
    capturedImagePreview.style.display = 'block';
  }

  let selectedLang = targetLanguageSelect ? targetLanguageSelect.value : 'en';
  if (selectedLang === 'CUSTOM') {
    selectedLang = customLanguageInput?.value.trim() || 'English';
  }

  if (loading) loading.style.display = 'block';
  if (resultCard) resultCard.style.display = 'none';

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
  } catch (error) {
    console.error('Analysis Error:', error);
    // 에러 발생 시 알림만 띄우고 파일 저장 프로세스는 멈추지 않음
    alert(tStr.analyzeFailedKeepPhoto || 'Analysis failed. The photo is kept and can be saved to the gallery.');
  }

  if (loading) loading.style.display = 'none';
  
  if (currentShotIndex < totalShots) {
    alert(`${tStr.shotProgress || 'Shot saved.'} (${currentShotIndex}/${totalShots})`);
    cameraInput.value = '';
  } else {
    renderScannedBooks(accumulatedBooks, resultCard, bookList);
    // 만약 책이 0권이어도 사진이 있으면 저장할 수 있다는 안내 추가
    if (accumulatedBooks.length === 0) {
      resultCard.style.display = 'block';
      bookList.innerHTML = `<p style="text-align:center; color:#666; font-size:0.9rem; padding:10px;">${tStr.noBooksDetected || 'No books detected. You can still save the photo to the gallery.'}</p>`;
    }
  }
});

saveBtn?.addEventListener('click', async () => {
  const t = i18n[currentLang] || i18n['en'];
  // 책 배열도 비어있고, 사진 파일도 아무것도 없으면 리턴
  if (accumulatedBooks.length === 0 && accumulatedFiles.length === 0) return;

  const room = document.getElementById('roomInput')?.value.trim() || 'Living Room';
  const shelfName = document.getElementById('shelfName')?.value.trim() || 'Bookcase A';
  const shelfLayer = shelfLayerSelect ? shelfLayerSelect.value : 1;
  const totalLayers = totalLayersInput ? totalLayersInput.value : 1;

  try {
    saveBtn.disabled = true;

    const imageUrls = [];
    for (const file of accumulatedFiles) {
      const uploadedUrl = await saveImageToImgBB(file);
      if (uploadedUrl) {
        imageUrls.push(uploadedUrl);
      }
    }

    // 분석 실패/인식 불가로 책 정보가 0권이지만 사진이 있는 경우 미분석 가상 데이터 하나 생성
    let booksToSave = accumulatedBooks;
    if (booksToSave.length === 0 && imageUrls.length > 0) {
      booksToSave = [{
        title: t.unanalyzedShelf || 'Unanalyzed Shelf',
        author: '-',
        position: 1,
        language: 'original'
      }];
    }

    const savePromises = booksToSave.map(book => {
      return addDoc(collection(db, "books"), {
        title: book.title || 'Unknown Title',
        author: book.author || 'Unknown Author',
        language: book.language || 'original',
        room: room,
        shelfName: shelfName,
        shelfLayer: Number(shelfLayer),
        totalLayers: Number(totalLayers),
        position: Number(book.position) || 1,
        imageUrls: imageUrls,
        createdAt: serverTimestamp()
      });
    });

    await Promise.all(savePromises);

    alert(t.alertSuccessSave);
    if (resultCard) resultCard.style.display = 'none';
    resetShotSession();
    
    await updateRoomDropdown();
    loadSavedBooks();
  } catch (error) {
    console.error('Save Error:', error);
    alert('Failed to save books and image URLs.');
  } finally {
    saveBtn.disabled = false;
  }
});

function openEditModal(bookId, title, author, room, shelf, layer, position, isbn) {
  currentEditingBookId = bookId;
  
  if (editTitleInput) editTitleInput.value = title;
  if (editAuthorInput) editAuthorInput.value = author;
  if (editIsbnInput) editIsbnInput.value = (isbn && isbn !== 'undefined') ? isbn : '';
  if (editRoomInput) editRoomInput.value = room;
  if (editShelfInput) editShelfInput.value = shelf;
  if (editLayerInput) editLayerInput.value = layer;
  if (editPositionInput) editPositionInput.value = position;

  if (editModal) editModal.style.display = 'flex';
}

cancelEditBtn?.addEventListener('click', () => {
  if (editModal) editModal.style.display = 'none';
  currentEditingBookId = null;
});

fetchIsbnInModal?.addEventListener('click', async () => {
  const isbn = editIsbnInput ? editIsbnInput.value.trim() : '';
  if (!isbn) {
    alert('Please enter an ISBN first.');
    return;
  }
  try {
    if (fetchIsbnInModal) fetchIsbnInModal.textContent = 'Fetching...';
    const info = await fetchBookByISBN(isbn);
    if (info && info.title) {
      if (editTitleInput) editTitleInput.value = info.title;
      if (editAuthorInput) editAuthorInput.value = info.author || '';
      alert('Book info updated via ISBN!');
    } else {
      alert('Could not fetch book info for this ISBN.');
    }
  } catch (err) {
    alert('Could not fetch book info for this ISBN.');
  } finally {
    if (fetchIsbnInModal) fetchIsbnInModal.textContent = '🔄 Fetch Info via ISBN';
  }
});

saveEditBtn?.addEventListener('click', async () => {
  if (!currentEditingBookId) return;

  const t = i18n[currentLang] || i18n['en'];
  const updatedData = {
    title: editTitleInput ? editTitleInput.value.trim() : '',
    author: editAuthorInput ? editAuthorInput.value.trim() : '',
    isbn: editIsbnInput ? editIsbnInput.value.trim() : '',
    room: editRoomInput ? editRoomInput.value.trim() : '',
    shelfName: editShelfInput ? editShelfInput.value.trim() : '',
    shelfLayer: editLayerInput ? Number(editLayerInput.value) : 1,
    position: editPositionInput ? Number(editPositionInput.value) : 1
  };

  if (!updatedData.title || !updatedData.room) {
    alert("Please fill in at least the Title and Room Name.");
    return;
  }

  try {
    saveEditBtn.disabled = true;
    await updateDoc(doc(db, "books", currentEditingBookId), updatedData);
    
    alert(t.alertSuccessUpdate);
    if (editModal) editModal.style.display = 'none';
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

deleteGroupBtn?.addEventListener('click', async () => {
  const t = i18n[currentLang] || i18n['en'];
  const room = filterRoom ? filterRoom.value : 'ALL';
  const shelf = filterShelf ? filterShelf.value : 'ALL';
  const layer = filterLayer ? filterLayer.value : 'ALL';

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

window.currentLang = 'en';
applyUiLanguage('en');