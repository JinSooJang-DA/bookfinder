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

  // ----------------------------------------------------
  // 1. UI 보완: 제목 및 작가 입력 필드/조회 버튼 동적 생성
  // ----------------------------------------------------
  ensureTitleAndAuthorInputs();

  bcRoomInput?.addEventListener('change', loadBarcodeHierarchyOptions);
  bcShelfInput?.addEventListener('change', loadBarcodeHierarchyOptions);
  bcLayerInput?.addEventListener('change', loadBarcodeHierarchyOptions);

  if (startLiveScanBtn && stopLiveScanBtn) {
    startLiveScanBtn.addEventListener('click', startScanner);
    stopLiveScanBtn.addEventListener('click', stopScanner);
  }

  // ISBN 정보 조회 버튼 이벤트
  if (fetchIsbnBtn) {
    fetchIsbnBtn.addEventListener('click', () => lookupIsbnInfo());
  }

  // 등록 버튼 이벤트
  submitIsbnBtn?.addEventListener('click', handleAddIsbnBook);

  // ----------------------------------------------------
  // 2. 누락된 ISBN 일괄 자동 채우기 버튼 바인딩
  // ----------------------------------------------------
  autoFillIsbnBtn = document.getElementById('autoFillIsbnBtn');
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

// HTML 내 제목/작가 입력 필드가 없을 경우 자동 생성하는 헬퍼 함수
function ensureTitleAndAuthorInputs() {
  if (!barcodeView) return;

  // ISBN 입력란 옆에 '조회' 버튼 추가
  fetchIsbnBtn = document.getElementById('fetchIsbnBtn');
  if (!fetchIsbnBtn && isbnInput) {
    fetchIsbnBtn = document.createElement('button');
    fetchIsbnBtn.id = 'fetchIsbnBtn';
    fetchIsbnBtn.type = 'button';
    fetchIsbnBtn.textContent = t('fetchIsbnBtn');
    fetchIsbnBtn.style.marginLeft = '8px';
    fetchIsbnBtn.style.padding = '6px 12px';
    fetchIsbnBtn.style.cursor = 'pointer';
    isbnInput.parentNode?.insertBefore(fetchIsbnBtn, isbnInput.nextSibling);
  }

  // 제목 입력 필드
  bcTitleInput = document.getElementById('bcTitleInput');
  if (!bcTitleInput) {
    const titleGroup = document.createElement('div');
    titleGroup.style.margin = '10px 0';
    titleGroup.innerHTML = `
      <label style="display:block; margin-bottom:4px; font-weight:bold;">${t('scanViewTitle') || 'Title'}:</label>
      <input type="text" id="bcTitleInput" style="width:100%; padding:8px; box-sizing:border-box;" placeholder="e.g. Harry Potter">
    `;
    submitIsbnBtn?.parentNode?.insertBefore(titleGroup, submitIsbnBtn);
    bcTitleInput = document.getElementById('bcTitleInput');
  }

  // 작가 입력 필드
  bcAuthorInput = document.getElementById('bcAuthorInput');
  if (!bcAuthorInput) {
    const authorGroup = document.createElement('div');
    authorGroup.style.margin = '10px 0';
    authorGroup.innerHTML = `
      <label style="display:block; margin-bottom:4px; font-weight:bold;">Author:</label>
      <input type="text" id="bcAuthorInput" style="width:100%; padding:8px; box-sizing:border-box;" placeholder="e.g. J.K. Rowling">
    `;
    submitIsbnBtn?.parentNode?.insertBefore(authorGroup, submitIsbnBtn);
    bcAuthorInput = document.getElementById('bcAuthorInput');
  }
}

// ISBN으로 도서 정보 조회 후 Input 필드에 자동 입력
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
    if (fetched && fetched.title && fetched.title !== 'Unknown Title') {
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
      fetchIsbnBtn.textContent = t('fetchIsbnBtn');
    }
  }
}

// 카메라 스캐너 시작
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
        
        // 바코드 읽은 후 자동으로 책 정보 조회 실행
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

// 카메라 스캐너 정지
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

// 계층 구조 옵션 및 기존 도서 표시
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

// 입력 필드의 정보로 도서 추가 및 위치 재정렬
async function handleAddIsbnBook() {
  const rawIsbn = isbnInput?.value.trim() || '';
  const isbn = rawIsbn.replace(/[^0-9X]/gi, '');
  const bookTitle = bcTitleInput?.value.trim() || '';
  const bookAuthor = bcAuthorInput?.value.trim() || 'Unknown';

  if (!bookTitle) {
    alert(t('updateTitleRoomRequired'));
    bcTitleInput?.focus();
    return;
  }

  const room = bcRoomInput?.value.trim() || 'Living Room';
  const shelfName = bcShelfInput?.value.trim() || 'Bookcase A';
  const shelfLayer = Number(bcLayerInput?.value) || 1;
  const targetPosition = Number(bcPositionInput?.value) || 1;

  try {
    submitIsbnBtn.disabled = true;

    // 위치 내 기존 도서 목록 가져오기
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

    // 새 도서 객체 생성 및 위치 재정렬
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

    // Firestore에 일괄 업데이트/추가
    for (let i = 0; i < finalBooksList.length; i++) {
      const item = finalBooksList[i];
      const newPos = i + 1;
      if (item.id) {
        await updateDoc(doc(doc(db, "books", item.id)), { position: newPos });
      } else {
        await addDoc(collection(db, "books"), {
          ...item,
          position: newPos,
          createdAt: serverTimestamp()
        });
      }
    }

    alert(`${t('saveAndReorderSuccess')}\n"${bookTitle}" - ${bookAuthor}`);

    // 입력 필드 초기화
    if (isbnInput) isbnInput.value = '';
    if (bcTitleInput) bcTitleInput.value = '';
    if (bcAuthorInput) bcAuthorInput.value = '';
    if (bcPositionInput) bcPositionInput.value = targetPosition + 1;

    // 앱 화면 및 뷰 갱신
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