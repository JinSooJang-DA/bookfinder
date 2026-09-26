// src/barcode.js
import { db } from './firebase.js';
import { 
  collection, addDoc, getDocs, query, updateDoc, 
  doc, where, serverTimestamp 
} from 'firebase/firestore';
import { fetchBookByISBN } from './api.js';
import { Html5Qrcode } from 'html5-qrcode';
import { escapeHtml } from './ui.js';
import { i18n } from './i18n.js';
import { autoFillMissingISBNs } from './enrichIsbn.js';

function t(key) {
  const lang = window.currentLang || 'en';
  return i18n[lang]?.[key] || i18n['en']?.[key] || key;
}

// DOM Elements
let barcodeView, submitIsbnBtn, isbnInput, bcRoomInput, bcShelfInput, bcLayerInput, bcPositionInput;
let bcTitleInput, bcAuthorInput, fetchIsbnBtn;
let startLiveScanBtn, stopLiveScanBtn, autoFillIsbnBtn;
let html5QrCode = null;

export function initBarcodeModule(deps) {
  barcodeView = document.getElementById('barcodeView');
  submitIsbnBtn = document.getElementById('submitIsbnBtn');
  isbnInput = document.getElementById('isbnInput');
  bcRoomInput = document.getElementById('bcRoomInput');
  bcShelfInput = document.getElementById('bcShelfInput');
  bcLayerInput = document.getElementById('bcLayerInput');
  bcPositionInput = document.getElementById('bcPositionInput');
  startLiveScanBtn = document.getElementById('startLiveScanBtn');
  stopLiveScanBtn = document.getElementById('stopLiveScanBtn');
  fetchIsbnBtn = document.getElementById('fetchIsbnBtn');
  bcTitleInput = document.getElementById('bcTitleInput');
  bcAuthorInput = document.getElementById('bcAuthorInput');

  // DOM에 입력창이 없을 경우 자동 생성 보완
  ensureBarcodeInputs();

  bcRoomInput?.addEventListener('change', loadBarcodeHierarchyOptions);
  bcShelfInput?.addEventListener('change', loadBarcodeHierarchyOptions);
  bcLayerInput?.addEventListener('change', loadBarcodeHierarchyOptions);

  if (startLiveScanBtn && stopLiveScanBtn) {
    startLiveScanBtn.addEventListener('click', startScanner);
    stopLiveScanBtn.addEventListener('click', stopScanner);
  }

  // ISBN 단독 수동 조회 버튼
  fetchIsbnBtn?.addEventListener('click', () => lookupIsbnInfo());

  // 최종 등록 버튼
  submitIsbnBtn?.addEventListener('click', handleAddIsbnBook);

  // 누락된 ISBN 일괄 자동 채우기 버튼 바인딩
  autoFillIsbnBtn = document.getElementById('autoFillIsbnBtn');
  if (!autoFillIsbnBtn && barcodeView) {
    autoFillIsbnBtn = document.createElement('button');
    autoFillIsbnBtn.id = 'autoFillIsbnBtn';
    autoFillIsbnBtn.className = 'btn btn-secondary';
    autoFillIsbnBtn.style.marginTop = '15px';
    autoFillIsbnBtn.style.backgroundColor = '#17a2b8';
    barcodeView.appendChild(autoFillIsbnBtn);
  }

  if (autoFillIsbnBtn) {
    autoFillIsbnBtn.textContent = t('btnAutoFillIsbn');
    autoFillIsbnBtn.addEventListener('click', async () => {
      autoFillIsbnBtn.disabled = true;
      await autoFillMissingISBNs((statusText) => {
        autoFillIsbnBtn.textContent = statusText;
      });
      autoFillIsbnBtn.disabled = false;
      autoFillIsbnBtn.textContent = t('btnAutoFillIsbn');
    });
  }

  const { updateRoomDropdown, loadSavedBooks } = deps;
  window._barcodeDeps = { updateRoomDropdown, loadSavedBooks };
}

function ensureBarcodeInputs() {
  if (!barcodeView) return;

  if (!fetchIsbnBtn && isbnInput) {
    fetchIsbnBtn = document.createElement('button');
    fetchIsbnBtn.id = 'fetchIsbnBtn';
    fetchIsbnBtn.type = 'button';
    fetchIsbnBtn.className = 'btn btn-secondary btn-sm';
    fetchIsbnBtn.textContent = t('fetchIsbnBtn') || '🔄 Fetch';
    fetchIsbnBtn.style.whiteSpace = 'nowrap';
    isbnInput.parentNode?.appendChild(fetchIsbnBtn);
  }

  if (!bcTitleInput) {
    const titleGroup = document.createElement('div');
    titleGroup.style.marginTop = '8px';
    titleGroup.innerHTML = `
      <label style="display:block; margin-bottom:4px; font-weight:bold;">Book Title:</label>
      <input type="text" id="bcTitleInput" placeholder="Title will appear here after scan">
    `;
    submitIsbnBtn?.parentNode?.insertBefore(titleGroup, submitIsbnBtn);
    bcTitleInput = document.getElementById('bcTitleInput');
  }

  if (!bcAuthorInput) {
    const authorGroup = document.createElement('div');
    authorGroup.style.marginTop = '8px';
    authorGroup.innerHTML = `
      <label style="display:block; margin-bottom:4px; font-weight:bold;">Author:</label>
      <input type="text" id="bcAuthorInput" placeholder="Author name">
    `;
    submitIsbnBtn?.parentNode?.insertBefore(authorGroup, submitIsbnBtn);
    bcAuthorInput = document.getElementById('bcAuthorInput');
  }
}

// ISBN으로 책 정보 조회 후 폼에 기입
async function lookupIsbnInfo(manualIsbn = null) {
  const rawIsbn = manualIsbn || isbnInput?.value.trim() || '';
  const isbn = rawIsbn.replace(/[^0-9X]/gi, '');

  if (!isbn) {
    alert(t('enterIsbnCode'));
    return false;
  }

  if (fetchIsbnBtn) {
    fetchIsbnBtn.disabled = true;
    fetchIsbnBtn.textContent = t('fetchingIsbn');
  }

  try {
    const fetched = await fetchBookByISBN(isbn);
    if (fetched && fetched.title) {
      if (bcTitleInput) bcTitleInput.value = fetched.title;
      if (bcAuthorInput) bcAuthorInput.value = fetched.author || '';
      alert(`${t('isbnFetchSuccess')}\n\n📖 ${fetched.title} (${fetched.author || 'Unknown'})`);
      return true;
    } else {
      alert(t('isbnFetchFail'));
      if (bcTitleInput) bcTitleInput.focus();
      return false;
    }
  } catch (err) {
    console.error("ISBN Lookup Error:", err);
    alert(t('isbnFetchFail'));
    return false;
  } finally {
    if (fetchIsbnBtn) {
      fetchIsbnBtn.disabled = false;
      fetchIsbnBtn.textContent = t('fetchIsbnBtn') || '🔄 Fetch';
    }
  }
}

// 실시간 바코드 스캔 시작
async function startScanner() {
  const readerDiv = document.getElementById('reader');
  if (readerDiv) readerDiv.style.display = 'block';
  if (startLiveScanBtn) startLiveScanBtn.style.display = 'none';
  if (stopLiveScanBtn) stopLiveScanBtn.style.display = 'inline-block';

  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("reader");
  }

  const config = { fps: 10, qrbox: { width: 250, height: 100 } };

  try {
    await html5QrCode.start(
      { facingMode: "environment" }, 
      config, 
      async (decodedText) => {
        const cleanIsbn = decodedText.replace(/[^0-9X]/gi, '');
        if (isbnInput) isbnInput.value = cleanIsbn;
        
        stopScanner();
        
        // 바코드 인식 즉시 도서 정보 검색 및 입력창 자동 기입 실행
        await lookupIsbnInfo(cleanIsbn);
      },
      () => {}
    );
  } catch (err) {
    console.error("Camera start error:", err);
    alert(t('cameraError'));
    stopScanner();
  }
}

// 실시간 바코드 스캔 중지
export function stopScanner() {
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

// 계층 구조 옵션 로드
export async function loadBarcodeHierarchyOptions() {
  try {
    const querySnapshot = await getDocs(collection(db, "books"));
    const rooms = new Set();
    const shelvesByRoom = {};
    const booksByLocation = {};

    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      const room = data.room || 'Living Room';
      const shelf = data.shelfName || 'Bookcase A';
      const layer = data.shelfLayer || 1;

      rooms.add(room);
      if (!shelvesByRoom[room]) shelvesByRoom[room] = new Set();
      shelvesByRoom[room].add(shelf);

      const key = `${room}_${shelf}_${layer}`;
      if (!booksByLocation[key]) booksByLocation[key] = [];
      booksByLocation[key].push(data);
    });

    if (bcRoomInput) {
      const currentRoomVal = bcRoomInput.value;
      bcRoomInput.innerHTML = '';
      rooms.forEach(room => {
        const opt = document.createElement('option');
        opt.value = room;
        opt.textContent = room;
        bcRoomInput.appendChild(opt);
      });
      if (rooms.size === 0) {
        const opt = document.createElement('option');
        opt.value = 'Living Room';
        opt.textContent = 'Living Room';
        bcRoomInput.appendChild(opt);
      }
      if (currentRoomVal && (rooms.has(currentRoomVal) || currentRoomVal === 'Living Room')) {
        bcRoomInput.value = currentRoomVal;
      } else if (rooms.size > 0) {
        bcRoomInput.value = Array.from(rooms)[0];
      }
    }

    const selectedRoom = bcRoomInput?.value || 'Living Room';

    if (bcShelfInput) {
      const currentShelfVal = bcShelfInput.value;
      bcShelfInput.innerHTML = '';
      const shelves = shelvesByRoom[selectedRoom] || new Set();
      shelves.forEach(shelf => {
        const opt = document.createElement('option');
        opt.value = shelf;
        opt.textContent = shelf;
        bcShelfInput.appendChild(opt);
      });
      if (shelves.size === 0) {
        const opt = document.createElement('option');
        opt.value = 'Bookcase A';
        opt.textContent = 'Bookcase A';
        bcShelfInput.appendChild(opt);
      }
      if (currentShelfVal && (shelves.has(currentShelfVal) || currentShelfVal === 'Bookcase A')) {
        bcShelfInput.value = currentShelfVal;
      } else if (shelves.size > 0) {
        bcShelfInput.value = Array.from(shelves)[0];
      }
    }

    const selectedShelf = bcShelfInput?.value || 'Bookcase A';
    const selectedLayer = Number(bcLayerInput?.value) || 1;

    const currentKey = `${selectedRoom}_${selectedShelf}_${selectedLayer}`;
    const currentBooks = booksByLocation[currentKey] || [];
    currentBooks.sort((a, b) => (a.position || 0) - (b.position || 0));

    if (bcPositionInput) {
      bcPositionInput.value = currentBooks.length + 1;
    }

    let barcodeInfoDiv = document.getElementById('barcodeExistingBooksInfo');
    if (!barcodeInfoDiv && barcodeView) {
      barcodeInfoDiv = document.createElement('div');
      barcodeInfoDiv.id = 'barcodeExistingBooksInfo';
      barcodeInfoDiv.style.margin = '15px 0';
      barcodeInfoDiv.style.padding = '12px';
      barcodeInfoDiv.style.background = '#f8f9fa';
      barcodeInfoDiv.style.borderRadius = '8px';
      barcodeInfoDiv.style.border = '1px solid #e9ecef';
      
      if (autoFillIsbnBtn) {
        barcodeView.insertBefore(barcodeInfoDiv, autoFillIsbnBtn);
      } else {
        barcodeView.appendChild(barcodeInfoDiv);
      }
    }

    if (barcodeInfoDiv) {
      if (currentBooks.length > 0) {
        let html = `<strong>${t('existingBooksHeader')} (${currentBooks.length}):</strong><ul style="margin: 5px 0 0 20px; padding: 0; font-size: 0.9rem;">`;
        currentBooks.forEach(b => {
          html += `<li>Pos ${b.position}: <b>${escapeHtml(b.title)}</b> (${escapeHtml(b.author || 'Unknown')})</li>`;
        });
        html += `</ul><small style="color: #666; display: block; margin-top: 5px;">${t('reorderTip')}</small>`;
        barcodeInfoDiv.innerHTML = html;
      } else {
        barcodeInfoDiv.innerHTML = `<span style="color: #666; font-size: 0.9rem;">${t('noBooksInFach')}</span>`;
      }
    }
  } catch (err) {
    console.error('Load Barcode Hierarchy Error:', err);
  }
}

// 최종 도서 추가 및 위치 재정렬
async function handleAddIsbnBook() {
  const rawIsbn = isbnInput?.value.trim() || '';
  const isbn = rawIsbn.replace(/[^0-9X]/gi, '');
  let bookTitle = bcTitleInput?.value.trim() || '';
  let bookAuthor = bcAuthorInput?.value.trim() || 'Unknown';

  if (!isbn) {
    alert(t('enterIsbnCode'));
    return;
  }

  // 제목이 비어 있는 경우 다시 한 번 조회를 시도
  if (!bookTitle) {
    const fetched = await fetchBookByISBN(isbn);
    if (fetched && fetched.title) {
      bookTitle = fetched.title;
      bookAuthor = fetched.author || 'Unknown';
      if (bcTitleInput) bcTitleInput.value = bookTitle;
      if (bcAuthorInput) bcAuthorInput.value = bookAuthor;
    } else {
      // 조회되지 않는 경우 수동 입력 요구
      const inputTitle = prompt(t('isbnLookupFailedPromptTitle'));
      if (!inputTitle || !inputTitle.trim()) {
        alert(t('titleRequiredCancel'));
        return;
      }
      bookTitle = inputTitle.trim();
      const inputAuthor = prompt(t('promptAuthor'));
      bookAuthor = inputAuthor && inputAuthor.trim() ? inputAuthor.trim() : 'Unknown';
    }
  }

  const room = bcRoomInput?.value.trim() || 'Living Room';
  const shelfName = bcShelfInput?.value.trim() || 'Bookcase A';
  const shelfLayer = Number(bcLayerInput?.value) || 1;
  const targetPosition = Number(bcPositionInput?.value) || 1;

  try {
    submitIsbnBtn.disabled = true;

    const q = query(
      collection(db, "books"),
      where("room", "==", room),
      where("shelfName", "==", shelfName),
      where("shelfLayer", "==", shelfLayer)
    );
    const querySnapshot = await getDocs(q);
    const existingBooks = [];
    querySnapshot.forEach(docSnap => {
      existingBooks.push({ id: docSnap.id, ...docSnap.data() });
    });

    existingBooks.sort((a, b) => (a.position || 0) - (b.position || 0));

    const newBookData = {
      title: bookTitle,
      author: bookAuthor,
      isbn: isbn,
      room: room,
      shelfName: shelfName,
      shelfLayer: shelfLayer,
      createdAt: serverTimestamp()
    };

    let inserted = false;
    const finalBooksList = [];
    
    for (const b of existingBooks) {
      if (!inserted && (b.position || 1) >= targetPosition) {
        finalBooksList.push({ ...newBookData, position: targetPosition });
        inserted = true;
      }
      finalBooksList.push(b);
    }
    if (!inserted) {
      finalBooksList.push({ ...newBookData, position: targetPosition });
    }

    for (let i = 0; i < finalBooksList.length; i++) {
      const item = finalBooksList[i];
      const newPos = i + 1;
      if (item.id) {
        await updateDoc(doc(db, "books", item.id), { position: newPos });
      } else {
        await addDoc(collection(db, "books"), {
          ...item,
          position: newPos,
          createdAt: serverTimestamp()
        });
      }
    }

    alert(`${t('saveAndReorderSuccess')}\n"${bookTitle}" - ${bookAuthor}`);

    if (isbnInput) isbnInput.value = '';
    if (bcTitleInput) bcTitleInput.value = '';
    if (bcAuthorInput) bcAuthorInput.value = '';
    if (bcPositionInput) bcPositionInput.value = targetPosition + 1;

    if (window._barcodeDeps) {
      await window._barcodeDeps.updateRoomDropdown();
      window._barcodeDeps.loadSavedBooks();
    }
    await loadBarcodeHierarchyOptions();
  } catch (error) {
    console.error('ISBN Add & Reorder Error:', error);
    alert(t('failSaveDatabase'));
  } finally {
    submitIsbnBtn.disabled = false;
  }
}