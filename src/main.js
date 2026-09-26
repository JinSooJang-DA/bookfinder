// src/main.js
import './style.css';
import { db, auth } from './firebase.js';
import { 
  collection, query, 
  doc, updateDoc, where, serverTimestamp, addDoc, getDocs, deleteDoc 
} from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
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

// Scan View Elements
const roomSelect = document.getElementById('roomSelect');
const roomInput = document.getElementById('roomInput');
const shelfSelect = document.getElementById('shelfSelect');
const shelfInput = document.getElementById('shelfInput');
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

// Setup View Elements (빠른 다중 업로드)
const setupRoomSelect = document.getElementById('setupRoomSelect');
const setupRoomInput = document.getElementById('setupRoomInput');
const setupShelfSelect = document.getElementById('setupShelfSelect');
const setupShelfInput = document.getElementById('setupShelfInput');
const setupTotalLayers = document.getElementById('setupTotalLayers');
const setupShelfLayer = document.getElementById('setupShelfLayer');
const setupCameraInput = document.getElementById('setupCameraInput');
const btnSetupPhoto = document.getElementById('btnSetupPhoto');
const setupPreviewContainer = document.getElementById('setupPreviewContainer');
const setupSaveBtn = document.getElementById('setupSaveBtn');

// Filter & Edit Elements
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
let setupFiles = []; // Setup View 용 다중 파일
let scanHierarchy = {}; 

initBookListModule({
  getCurrentLang: () => currentLang,
  openEditModalCallback: openEditModal
});

initGalleryModule();

async function updateScanOptions() {
  try {
    const querySnapshot = await getDocs(collection(db, "books"));
    scanHierarchy = {};
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      const room = data.room || 'Living Room';
      const shelf = data.shelfName || 'Bookcase A';
      if (!scanHierarchy[room]) scanHierarchy[room] = new Set();
      scanHierarchy[room].add(shelf);
    });

    const populateRoomSelect = (selectEl) => {
      if (!selectEl) return;
      const currentVal = selectEl.value;
      selectEl.innerHTML = '';
      const rooms = Object.keys(scanHierarchy);
      if (rooms.length === 0) {
        scanHierarchy['Living Room'] = new Set(['Bookcase A']);
        rooms.push('Living Room');
      }
      rooms.forEach(room => {
        const opt = document.createElement('option');
        opt.value = room; opt.textContent = room;
        selectEl.appendChild(opt);
      });
      const addNewOpt = document.createElement('option');
      addNewOpt.value = '__NEW__'; 
      addNewOpt.textContent = currentLang === 'ko' ? '➕ 새 방 추가...' : (currentLang === 'de' ? '➕ Neuer Raum...' : '➕ Add New Room...');
      selectEl.appendChild(addNewOpt);
      if (rooms.includes(currentVal)) selectEl.value = currentVal;
      else selectEl.value = rooms[0];
      selectEl.dispatchEvent(new Event('change'));
    };

    populateRoomSelect(roomSelect);
    populateRoomSelect(setupRoomSelect);
  } catch (error) {
    console.error('Scan options error:', error);
  }
}

function updateScanShelfOptions(rSelect, sSelect) {
  if (!sSelect || !rSelect) return;
  const currentRoom = rSelect.value;
  const currentVal = sSelect.value;
  sSelect.innerHTML = '';
  const shelves = scanHierarchy[currentRoom] ? Array.from(scanHierarchy[currentRoom]) : [];
  if (currentRoom !== '__NEW__' && shelves.length > 0) {
    shelves.forEach(shelf => {
      const opt = document.createElement('option');
      opt.value = shelf; opt.textContent = shelf;
      sSelect.appendChild(opt);
    });
  }
  const addNewOpt = document.createElement('option');
  addNewOpt.value = '__NEW__';
  addNewOpt.textContent = currentLang === 'ko' ? '➕ 새 책장 추가...' : (currentLang === 'de' ? '➕ Neues Regal...' : '➕ Add New Bookcase...');
  sSelect.appendChild(addNewOpt);

  if (shelves.includes(currentVal)) sSelect.value = currentVal;
  else if (shelves.length > 0) sSelect.value = shelves[0];
  else sSelect.value = '__NEW__';
  sSelect.dispatchEvent(new Event('change'));
}

const handleRoomChange = (rSelect, rInput, sSelect) => {
  if (rSelect.value === '__NEW__') {
    if(rInput) { rInput.style.display = 'block'; rInput.focus(); }
    if(sSelect) {
      sSelect.innerHTML = `<option value="__NEW__">${currentLang === 'ko' ? '➕ 새 책장 추가...' : '➕ Add New Bookcase...'}</option>`;
      sSelect.value = '__NEW__';
      sSelect.dispatchEvent(new Event('change'));
    }
  } else {
    if(rInput) { rInput.style.display = 'none'; rInput.value = ''; }
    updateScanShelfOptions(rSelect, sSelect);
  }
};

const handleShelfChange = (sSelect, sInput) => {
  if (sSelect.value === '__NEW__') {
    if(sInput) { sInput.style.display = 'block'; sInput.focus(); }
  } else {
    if(sInput) { sInput.style.display = 'none'; sInput.value = ''; }
  }
};

roomSelect?.addEventListener('change', () => handleRoomChange(roomSelect, roomInput, shelfSelect));
shelfSelect?.addEventListener('change', () => handleShelfChange(shelfSelect, shelfInput));
setupRoomSelect?.addEventListener('change', () => handleRoomChange(setupRoomSelect, setupRoomInput, setupShelfSelect));
setupShelfSelect?.addEventListener('change', () => handleShelfChange(setupShelfSelect, setupShelfInput));

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (authContainer) authContainer.style.display = 'none';
    if (appMainWrapper) appMainWrapper.style.display = 'block';
    updateRoomDropdown();
    loadSavedBooks();
    updateScanOptions(); 
    initBarcodeModule({ updateRoomDropdown, loadSavedBooks });
  } else {
    if (authContainer) authContainer.style.display = 'block';
    if (appMainWrapper) appMainWrapper.style.display = 'none';
  }
});

btnLogin?.addEventListener('click', async () => {
  const email = authEmailInput?.value.trim() || '';
  const password = authPasswordInput?.value.trim() || '';
  if (!email || !password) return alert('Please enter both email and password.');
  try { await signInWithEmailAndPassword(auth, email, password); } 
  catch (error) { alert('Login failed: ' + error.message); }
});

btnRegister?.addEventListener('click', async () => {
  const email = authEmailInput?.value.trim() || '';
  const password = authPasswordInput?.value.trim() || '';
  if (!email || !password) return alert('Please enter email and password for registration.');
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    alert('Account created successfully and you are now logged in.');
  } catch (error) { alert('Registration failed: ' + error.message); }
});

btnLogout?.addEventListener('click', async () => {
  try { await signOut(auth); } catch (error) {}
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
      if (viewId === 'galleryView') loadGalleryHierarchy();
      if (viewId === 'barcodeView') loadBarcodeHierarchyOptions();
      if (viewId === 'scanView' || viewId === 'setupView') updateScanOptions();
    }
  }
  applyUiLanguage(currentLang);
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
  
  setTxt('menuSetupTitle', t.menuSetupTitle);
  setTxt('menuSetupDesc', t.menuSetupDesc);
  setTxt('menuScanTitle', t.menuScanTitle);
  setTxt('menuScanDesc', t.menuScanDesc);
  setTxt('menuGalleryTitle', t.menuGalleryTitle);
  setTxt('menuGalleryDesc', t.menuGalleryDesc);
  setTxt('menuSearchTitle', t.menuSearchTitle);
  setTxt('menuSearchDesc', t.menuSearchDesc);
  setTxt('menuBarcodeTitle', t.menuBarcodeTitle);
  setTxt('menuBarcodeDesc', t.menuBarcodeDesc);
  setTxt('backToMenuBtn', t.backToMenu);

  setTxt('setupViewTitle', t.setupViewTitle);
  setTxt('setupViewDesc', t.setupViewDesc);
  setTxt('setupRoomLabel', t.roomInputLabel);
  setTxt('setupShelfLabel', t.shelfNameLabel);
  setTxt('setupLblTotalLayers', t.lblTotalLayers);
  setTxt('setupLblCurrentLayer', t.lblCurrentLayer);
  if (btnSetupPhoto) btnSetupPhoto.textContent = t.btnSetupPhoto || '📸 Take / Upload Photo';
  if (setupSaveBtn) setupSaveBtn.textContent = t.saveBtn;

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
  
  if (roomInput) roomInput.placeholder = currentLang === 'ko' ? '새 방 이름' : 'New room';
  if (shelfInput) shelfInput.placeholder = currentLang === 'ko' ? '새 책장 이름' : 'New shelf';
  if (setupRoomInput) setupRoomInput.placeholder = currentLang === 'ko' ? '새 방 이름' : 'New room';
  if (setupShelfInput) setupShelfInput.placeholder = currentLang === 'ko' ? '새 책장 이름' : 'New shelf';

  updateLayerSelectOptions(totalLayersInput, shelfLayerSelect);
  updateLayerSelectOptions(setupTotalLayers, setupShelfLayer);
  updateRoomDropdown();
  updateScanOptions();
  loadSavedBooks();
}

targetLanguageSelect?.addEventListener('change', () => {
  if (targetLanguageSelect.value === 'CUSTOM') {
    if (customLanguageInput) { customLanguageInput.style.display = 'block'; customLanguageInput.focus(); }
  } else {
    if (customLanguageInput) customLanguageInput.style.display = 'none';
  }
});

function updateLayerSelectOptions(totEl, selEl) {
  if (!selEl || !totEl) return;
  const t = i18n[currentLang] || i18n['en'];
  const total = parseInt(totEl.value) || 1;
  selEl.innerHTML = '';
  for (let i = 1; i <= total; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${t.layerPrefix} ${i}` + (i === 1 ? ` ${t.top}` : i === total ? ` ${t.bottom}` : '');
    selEl.appendChild(opt);
  }
}
totalLayersInput?.addEventListener('input', () => updateLayerSelectOptions(totalLayersInput, shelfLayerSelect));
setupTotalLayers?.addEventListener('input', () => updateLayerSelectOptions(setupTotalLayers, setupShelfLayer));

// --- 💡 Setup View (빠른 업로드) 로직 ---
setupCameraInput?.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;
  setupFiles = setupFiles.concat(files);
  
  setupPreviewContainer.innerHTML = '';
  setupFiles.forEach(f => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f);
    img.style.height = '80px';
    img.style.borderRadius = '4px';
    img.style.border = '1px solid #ccc';
    setupPreviewContainer.appendChild(img);
  });
  if (setupSaveBtn) setupSaveBtn.style.display = 'block';
  setupCameraInput.value = '';
});

setupSaveBtn?.addEventListener('click', async () => {
  if (setupFiles.length === 0) return;
  const t = i18n[currentLang] || i18n['en'];

  const room = setupRoomSelect?.value === '__NEW__' ? setupRoomInput?.value.trim() : setupRoomSelect?.value;
  const shelfName = setupShelfSelect?.value === '__NEW__' ? setupShelfInput?.value.trim() : setupShelfSelect?.value;
  const shelfLayer = setupShelfLayer ? setupShelfLayer.value : 1;
  const totalLayers = setupTotalLayers ? setupTotalLayers.value : 1;

  try {
    setupSaveBtn.disabled = true;
    setupSaveBtn.textContent = 'Uploading...';

    const imageUrls = [];
    for (const file of setupFiles) {
      const url = await saveImageToImgBB(file);
      if (url) imageUrls.push(url);
    }

    await addDoc(collection(db, "books"), {
      title: t.unanalyzedShelf || 'Unanalyzed Shelf',
      author: '-',
      language: 'original',
      room: room || 'Living Room',
      shelfName: shelfName || 'Bookcase A',
      shelfLayer: Number(shelfLayer),
      totalLayers: Number(totalLayers),
      position: 1,
      imageUrls: imageUrls,
      createdAt: serverTimestamp()
    });

    alert(t.alertSuccessSave);
    setupFiles = [];
    setupPreviewContainer.innerHTML = '';
    setupSaveBtn.style.display = 'none';
    
    await updateRoomDropdown();
    updateScanOptions(); 
    loadSavedBooks();
  } catch (error) {
    alert('Upload failed.');
  } finally {
    setupSaveBtn.disabled = false;
    setupSaveBtn.textContent = t.saveBtn;
  }
});

// --- 기존 Scan View 로직 ---
function resetShotSession() {
  currentShotIndex = 0; accumulatedBooks = []; accumulatedFiles = [];
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
  if (selectedLang === 'CUSTOM') selectedLang = customLanguageInput?.value.trim() || 'English';

  if (loading) loading.style.display = 'block';
  if (resultCard) resultCard.style.display = 'none';

  try {
    const newDetectedBooks = await analyzeBookshelfImage(file, selectedLang);
    newDetectedBooks.forEach(newBook => {
      const cleanTitle = (newBook.title || '').trim().toLowerCase();
      const cleanAuthor = (newBook.author || '').trim().toLowerCase();
      const isDuplicate = accumulatedBooks.some(existing => {
        const exTitle = (existing.title || '').trim().toLowerCase();
        const exAuthor = (existing.author || '').trim().toLowerCase();
        return exTitle === cleanTitle && (exAuthor === cleanAuthor || cleanAuthor === 'unknown');
      });
      if (!isDuplicate) accumulatedBooks.push(newBook);
    });
    accumulatedBooks.forEach((book, idx) => book.position = idx + 1);
  } catch (error) {
    alert(tStr.analyzeFailedKeepPhoto || 'Analysis failed. The photo is kept.');
  }

  if (loading) loading.style.display = 'none';
  
  if (currentShotIndex < totalShots) {
    alert(`${tStr.shotProgress || 'Shot saved.'} (${currentShotIndex}/${totalShots})`);
    cameraInput.value = '';
  } else {
    renderScannedBooks(accumulatedBooks, resultCard, bookList);
    if (accumulatedBooks.length === 0) {
      resultCard.style.display = 'block';
      bookList.innerHTML = `<p style="text-align:center; color:#666;">${tStr.noBooksDetected}</p>`;
    }
  }
});

saveBtn?.addEventListener('click', async () => {
  const t = i18n[currentLang] || i18n['en'];
  if (accumulatedBooks.length === 0 && accumulatedFiles.length === 0) return;

  const room = roomSelect?.value === '__NEW__' ? roomInput?.value.trim() : roomSelect?.value;
  const shelfName = shelfSelect?.value === '__NEW__' ? shelfInput?.value.trim() : shelfSelect?.value;
  const shelfLayer = shelfLayerSelect ? shelfLayerSelect.value : 1;
  const totalLayers = totalLayersInput ? totalLayersInput.value : 1;

  try {
    saveBtn.disabled = true;
    const imageUrls = [];
    for (const file of accumulatedFiles) {
      const uploadedUrl = await saveImageToImgBB(file);
      if (uploadedUrl) imageUrls.push(uploadedUrl);
    }

    let booksToSave = accumulatedBooks;
    if (booksToSave.length === 0 && imageUrls.length > 0) {
      booksToSave = [{ title: t.unanalyzedShelf, author: '-', position: 1, language: 'original' }];
    }

    const savePromises = booksToSave.map(book => {
      return addDoc(collection(db, "books"), {
        title: book.title || 'Unknown Title',
        author: book.author || 'Unknown Author',
        language: book.language || 'original',
        room: room || 'Living Room',
        shelfName: shelfName || 'Bookcase A',
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
    updateScanOptions(); 
    loadSavedBooks();
  } catch (error) {
    alert('Failed to save books.');
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
  if (!isbn) return alert('Please enter an ISBN first.');
  try {
    if (fetchIsbnInModal) fetchIsbnInModal.textContent = 'Fetching...';
    const info = await fetchBookByISBN(isbn);
    if (info && info.title) {
      if (editTitleInput) editTitleInput.value = info.title;
      if (editAuthorInput) editAuthorInput.value = info.author || '';
      alert('Book info updated via ISBN!');
    } else alert('Could not fetch book info.');
  } catch (err) {
    alert('Could not fetch book info.');
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

  if (!updatedData.title || !updatedData.room) return alert("Please fill in Title and Room.");

  try {
    saveEditBtn.disabled = true;
    await updateDoc(doc(db, "books", currentEditingBookId), updatedData);
    alert(t.alertSuccessUpdate);
    if (editModal) editModal.style.display = 'none';
    currentEditingBookId = null;
    await updateRoomDropdown();
    updateScanOptions();
    loadSavedBooks();
  } catch (error) {
    alert('Failed to update book.');
  } finally {
    saveEditBtn.disabled = false;
  }
});

deleteGroupBtn?.addEventListener('click', async () => {
  const t = i18n[currentLang] || i18n['en'];
  const room = filterRoom ? filterRoom.value : 'ALL';
  const shelf = filterShelf ? filterShelf.value : 'ALL';
  const layer = filterLayer ? filterLayer.value : 'ALL';

  if (room === 'ALL') return alert(t.alertSelectRoomFirst);

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
      updateScanOptions();
      loadSavedBooks();
    } catch (error) {
      alert('Failed to delete group.');
    }
  }
});

window.currentLang = 'en';
applyUiLanguage('en');