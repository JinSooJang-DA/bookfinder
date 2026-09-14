// src/barcode.js
import { db } from './firebase.js';
import { 
  collection, addDoc, getDocs, query, updateDoc, 
  doc, where, serverTimestamp 
} from 'firebase/firestore';
import { fetchBookByISBN } from './api.js';
import { Html5Qrcode } from 'html5-qrcode';
import { escapeHtml } from './ui.js';

// DOM Elements (Barcode View)
let barcodeView, submitIsbnBtn, isbnInput, bcRoomInput, bcShelfInput, bcLayerInput, bcPositionInput;
let startLiveScanBtn, stopLiveScanBtn;
let html5QrCode = null;

export function initBarcodeModule(deps) {
  // 메인에서 전달받거나 직접 DOM을 참조합니다.
  barcodeView = document.getElementById('barcodeView');
  submitIsbnBtn = document.getElementById('submitIsbnBtn');
  isbnInput = document.getElementById('isbnInput');
  bcRoomInput = document.getElementById('bcRoomInput');
  bcShelfInput = document.getElementById('bcShelfInput');
  bcLayerInput = document.getElementById('bcLayerInput');
  bcPositionInput = document.getElementById('bcPositionInput');
  startLiveScanBtn = document.getElementById('startLiveScanBtn');
  stopLiveScanBtn = document.getElementById('stopLiveScanBtn');

  // 이벤트 리스너 바인딩
  bcRoomInput?.addEventListener('change', loadBarcodeHierarchyOptions);
  bcShelfInput?.addEventListener('change', loadBarcodeHierarchyOptions);
  bcLayerInput?.addEventListener('change', loadBarcodeHierarchyOptions);

  if (startLiveScanBtn && stopLiveScanBtn) {
    startLiveScanBtn.addEventListener('click', startScanner);
    stopLiveScanBtn.addEventListener('click', stopScanner);
  }

  submitIsbnBtn?.addEventListener('click', handleAddIsbnBook);

  const { updateRoomDropdown, loadSavedBooks } = deps;
  window._barcodeDeps = { updateRoomDropdown, loadSavedBooks };
}

// 실시간 바코드 스캐너 시작
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
        if (isbnInput) isbnInput.value = decodedText;
        stopScanner();
        
        try {
          const info = await fetchBookByISBN(decodedText);
          alert(`📖 스캔 성공: ${info.title} (${info.author || 'Unknown'})`);
        } catch (e) {
          console.warn("API auto-fetch failed, but ISBN is filled:", e);
          alert(`바코드(${decodedText})가 입력되었습니다.`);
        }
      },
      () => {}
    );
  } catch (err) {
    console.error("Camera start error:", err);
    alert("Could not start camera. Please check permissions.");
    stopScanner();
  }
}

// 실시간 바코드 스캐너 중지
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

// 바코드 뷰 계층 구조(방, 책장, 레이어, 기존 도서 목록) 로드
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
      barcodeView.appendChild(barcodeInfoDiv);
    }

    if (barcodeInfoDiv) {
      if (currentBooks.length > 0) {
        let html = `<strong>📍 Existing books registered in this Fach (${currentBooks.length} items):</strong><ul style="margin: 5px 0 0 20px; padding: 0; font-size: 0.9rem;">`;
        currentBooks.forEach(b => {
          html += `<li>Pos ${b.position}: <b>${escapeHtml(b.title)}</b> (${escapeHtml(b.author || 'Unknown')})</li>`;
        });
        html += `</ul><small style="color: #666; display: block; margin-top: 5px;">💡 To insert a new book between existing books, specify the target position number.</small>`;
        barcodeInfoDiv.innerHTML = html;
      } else {
        barcodeInfoDiv.innerHTML = `<span style="color: #666; font-size: 0.9rem;">📍 No books registered in the selected room/shelf/layer.</span>`;
      }
    }
  } catch (err) {
    console.error('Load Barcode Hierarchy Error:', err);
  }
}

// ISBN 도서 추가 및 위치 재정렬 핸들러
async function handleAddIsbnBook() {
  const isbn = isbnInput?.value.trim() || '';
  if (!isbn) {
    alert('Please enter an ISBN code.');
    return;
  }

  const room = bcRoomInput?.value.trim() || 'Living Room';
  const shelfName = bcShelfInput?.value.trim() || 'Bookcase A';
  const shelfLayer = Number(bcLayerInput?.value) || 1;
  const targetPosition = Number(bcPositionInput?.value) || 1;

  try {
    submitIsbnBtn.disabled = true;
    submitIsbnBtn.textContent = 'Fetching...';

    let bookInfo = {
      title: `ISBN Book (${isbn})`,
      author: 'Unknown',
      isbn: isbn
    };

    try {
      const fetched = await fetchBookByISBN(isbn);
      if (fetched && fetched.title) {
        bookInfo = fetched;
      }
    } catch (apiErr) {
      console.warn("External ISBN fetch failed, using fallback title.", apiErr);
    }

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
      title: bookInfo.title,
      author: bookInfo.author || 'Unknown',
      isbn: bookInfo.isbn || isbn,
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

    alert(`Successfully added & reordered:\n${bookInfo.title} (${bookInfo.author})`);
    if (isbnInput) isbnInput.value = '';
    if (bcPositionInput) bcPositionInput.value = targetPosition + 1;

    // 메인 함수 콜백 실행
    if (window._barcodeDeps) {
      await window._barcodeDeps.updateRoomDropdown();
      window._barcodeDeps.loadSavedBooks();
    }
    await loadBarcodeHierarchyOptions();
  } catch (error) {
    console.error('ISBN Add & Reorder Error:', error);
    alert('Failed to save book to database.');
  } finally {
    submitIsbnBtn.disabled = false;
    submitIsbnBtn.textContent = '➕ Add Book';
  }
}