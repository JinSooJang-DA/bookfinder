// src/storage.js

// ImgBB API Key 설정
const IMGBB_API_KEY = 'YOUR_IMGBB_API_KEY'; // 👈 여기에 사용하시는 ImgBB API 키를 넣으세요.

/**
 * 이미지 파일(Blob/File)을 ImgBB 클라우드 서버에 업로드합니다.
 * @param {Blob|File} imageBlob - 업로드할 이미지 바이너리 객체
 * @returns {Promise<string>} - ImgBB에서 반환된 디스플레이용 이미지 URL
 */
export async function saveImageToImgBB(imageBlob) {
  if (!IMGBB_API_KEY || IMGBB_API_KEY === 'adfede58cdda859e14bc443b22b6aab0') {
    console.warn("ImgBB API Key가 설정되지 않았습니다. API 키를 확인해주세요.");
  }

  const formData = new FormData();
  formData.append('image', imageBlob);

  try {
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result && result.success) {
      // display_url 또는 url 반환
      return result.data.display_url || result.data.url;
    } else {
      const errorMsg = result?.error?.message || 'ImgBB upload failed';
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error('ImgBB Image Upload Error:', error);
    throw error;
  }
}

/**
 * 기존 IndexedDB 호환성을 유지하기 위한 레거시 래퍼 함수
 */
export async function saveImageLocally(imageBlob) {
  return await saveImageToImgBB(imageBlob);
}

/**
 * URL 기반으로 전환됨에 따라 더 이상 로컬 IndexedDB 조회가 필요하지 않습니다.
 */
export async function getImageLocally(imageId) {
  console.warn("getImageLocally()는 더 이상 사용되지 않습니다. Firestore에 저장된 ImgBB URL을 직접 사용하세요.");
  return null;
}