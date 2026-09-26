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
 * 누락된 ISBN 일괄 자동 채우기
 */
export async function autoFillMissingISBNs(statusCallback) {
  try {
    const querySnapshot = await getDocs(collection(db, "books"));
    const missingIsbnBooks = [];

    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
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

      // API Rate Limit 방지를 위한 1.5초 딜레이
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const resultMsg = `${t('isbnFillComplete')}\n- ${t('success')}: ${successCount}\n- ${t('failed')}: ${failCount}`;
    alert(resultMsg);

    if (window._barcodeDeps && window._barcodeDeps.loadSavedBooks) {
      window._barcodeDeps.loadSavedBooks();
    }
  } catch (error) {
    console.error("Error auto-filling ISBNs:", error);
    alert(t('failAutoFillIsbn'));
  }
}