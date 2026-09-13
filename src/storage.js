// src/storage.js
// 기기 로컬에 이미지 파일을 안전하게 저장하고 관리하는 유틸리티

const DB_NAME = 'BookshelfScannerLocalDB';
const STORE_NAME = 'images';
const DB_VERSION = 1;

export function openLocalDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

export async function saveImageLocally(file) {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // 파일을 Blob 형태로 로컬 저장
    const record = {
      file: file,
      createdAt: new Date().toISOString()
    };
    
    const request = store.add(record);
    request.onsuccess = (event) => resolve(event.target.result); // 생성된 ID 반환
    request.onerror = (event) => reject(event.target.error);
  });
}

export async function getImageLocally(id) {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = (event) => resolve(event.target.result ? event.target.result.file : null);
    request.onerror = (event) => reject(event.target.error);
  });
}