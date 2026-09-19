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

// 언어 헬퍼 함수
function t(key) {
  const lang = window.currentLang || 'en';
  return i18n[lang]?.[key] || i18n['en']?.[key] || key;
}

// DOM Elements (Barcode View)
let barcodeView, submitIsbnBtn, isbnInput, bcRoomInput, bcShelfInput, bcLayerInput, bcPositionInput;
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

  bcRoomInput?.addEventListener('change', loadBarcodeHierarchyOptions);
  bcShelfInput?.addEventListener('change', loadBarcodeHierarchyOptions);
  bcLayerInput?.addEventListener('change', loadBarcodeHierarchyOptions);

  if (startLiveScanBtn && stopLiveScanBtn) {
    startLiveScanBtn.addEventListener('click', startScanner);
    stopLiveScanBtn.addEventListener('click', stopScanner);
  }

  submitIsbnBtn?.addEventListener('click', handleAddIsbnBook);

  // ----------------------------------------------------
  // [Step 4] 누락된 ISBN 일괄 자동 채우기 버튼 바인딩 및 동적 생성
  // ----------------------------------------------------
  autoFillIsbnBtn = document.getElementById('autoFillIsbnBtn');

  // HTML에 버튼 요소가 없으면 barcodeView 하단에 자동 생성하여 추가
  if (!autoFillIsbnBtn && barcodeView) {
    autoFillIsbnBtn = document.createElement('button');
    autoFillIsbnBtn.id = 'autoFillIsbnBtn';
    autoFillIsbnBtn.style.marginTop = '15px';
    autoFillIsbnBtn.style.padding = '10px 15px';
    autoFillIsbnBtn.style.width = '100%';
    autoFillIsbnBtn.style.backgroundColor = '#17a2b8';
    autoFillIsbnBtn.style.color = '#fff';
    autoFillIsbnBtn.style.border = 'none';
    autoFillIsbnBtn.style.borderRadius = '5px';
    autoFillIsbnBtn.style.cursor = 'pointer';
    autoFillIsbnBtn.style.fontWeight = 'bold';
    barcodeView.appendChild(autoFillIsbnBtn);
  }

  if (autoFillIsbnBtn) {
    autoFillIsbnBtn.textContent = t('btnAutoFillIsbn');
    autoFillIsbnBtn.addEventListener('click', async () => {
      autoFillIsbnBtn.disabled = true;
      
      // 일괄 자동 채우기 진행 상태를 버튼 텍스트에 실시간 표시
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

// Live Barcode Scanner Start
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
        // 숫자 및 X만 추출하여 ISBN 정제
        const cleanIsbn = decodedText.replace(/[^0-9X]/gi, '');
        if (isbnInput) isbnInput.value = cleanIsbn;
        
        stopScanner();
        
        // 스캔 완료 후 바로 도서 조회 및 등록 로직 실행
        await handleAddIsbnBook();
      },
      () => {}
    );
  } catch (err) {
    console.error("Camera start error:", err);
    alert(t('cameraError'));
    stopScanner();
  }
}

// Live Barcode Scanner Stop
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

// Load Barcode Hierarchy Options (Room, Shelf, Layer, Existing Books)
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
      
      // autoFillIsbnBtn보다 위에 위치하도록 insertBefore 적용
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

// Add ISBN Book and Reorder Handler
async function handleAddIsbnBook() {
  const rawIsbn = isbnInput?.value.trim() || '';
  const isbn = rawIsbn.replace(/[^0-9X]/gi, ''); // ISBN 정제

  if (!isbn) {
    alert(t('enterIsbnCode'));
    return;
  }

  const room = bcRoomInput?.value.trim() || 'Living Room';
  const shelfName = bcShelfInput?.value.trim() || 'Bookcase A';
  const shelfLayer = Number(bcLayerInput?.value) || 1;
  const targetPosition = Number(bcPositionInput?.value) || 1;

  try {
    submitIsbnBtn.disabled = true;
    submitIsbnBtn.textContent = t('fetchingIsbn');

    let bookTitle = '';
    let bookAuthor = '';

    // 1. 외부 API 조회 시도
    try {
      const fetched = await fetchBookByISBN(isbn);
      if (fetched && fetched.title && fetched.title !== 'Unknown Title') {
        bookTitle = fetched.title;
        bookAuthor = fetched.author || 'Unknown';
      }
    } catch (apiErr) {
      console.warn("External ISBN fetch failed, requesting manual entry.", apiErr);
    }

    // 2. API 조회 실패 시 수동 입력 팝업
    if (!bookTitle) {
      const inputTitle = prompt(t('isbnLookupFailedPromptTitle'));
      if (!inputTitle || !inputTitle.trim()) {
        alert(t('titleRequiredCancel'));
        return;
      }
      bookTitle = inputTitle.trim();

      const inputAuthor = prompt(t('promptAuthor'));
      bookAuthor = inputAuthor && inputAuthor.trim() ? inputAuthor.trim() : 'Unknown';
    }

    // 3. 선택한 위치의 기존 도서 목록 조회
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

    // 4. 새 도서 객체 생성 및 위치 재정렬 배열 생성
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

    // 5. Firestore 업데이트 및 저장
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
    if (bcPositionInput) bcPositionInput.value = targetPosition + 1;

    // 대시보드 및 콜백 업데이트
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
    submitIsbnBtn.textContent = t('submitIsbnBtn');
  }
}