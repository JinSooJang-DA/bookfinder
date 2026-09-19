// src/enrichIsbn.js
import { db } from './firebase.js';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { fetchISBNByTitleAuthor } from './api.js';
import { i18n } from './i18n.js';

function t(key) {
  const lang = window.currentLang || 'en';
  return i18n[lang]?.[key] || i18n['en']?.[key] || key;
}

/**
 * ISBN이 누락된 모든 책을 찾아 역추적으로 ISBN을 업데이트하는 일괄 작업 함수
 */
export async function autoFillMissingISBNs(statusCallback) {
  try {
    const querySnapshot = await getDocs(collection(db, "books"));
    const missingIsbnBooks = [];

    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      // isbn 필드가 없거나 빈 문자열인 경우 대상에 추가
      if (!data.isbn || data.isbn.trim() === '') {
        missingIsbnBooks.push({ id: docSnap.id, ...data });
      }
    });

    if (missingIsbnBooks.length === 0) {
      alert(t('noMissingIsbnFound'));
      return;
    }

    const confirmRun = confirm(`${missingIsbnBooks.length}${t('confirmAutoFillIsbn')}`);
    if (!confirmRun) return;

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < missingIsbnBooks.length; i++) {
      const book = missingIsbnBooks[i];
      const currentNum = i + 1;
      const totalNum = missingIsbnBooks.length;

      if (statusCallback) {
        statusCallback(`[${currentNum}/${totalNum}] "${book.title}" ${t('searchingIsbn')}`);
      }

      const foundIsbn = await fetchISBNByTitleAuthor(book.title, book.author);

      if (foundIsbn) {
        await updateDoc(doc(db, "books", book.id), { isbn: foundIsbn });
        successCount++;
      } else {
        failCount++;
      }

      // API Rate Limit 방지용 딜레이 (0.3초)
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const resultMsg = `${t('isbnFillComplete')}\n- ${t('success')}: ${successCount}\n- ${t('failed')}: ${failCount}`;
    alert(resultMsg);

    // 변경된 데이터를UI에 반영하기 위해 새로고침 콜백 호출
    if (window._barcodeDeps && window._barcodeDeps.loadSavedBooks) {
      window._barcodeDeps.loadSavedBooks();
    }
  } catch (error) {
    console.error("Error auto-filling ISBNs:", error);
    alert(t('failAutoFillIsbn'));
  }
}