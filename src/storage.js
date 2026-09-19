// src/storage.js

// Vite 환경 변수에서 ImgBB API 키를 가져옵니다.
// GitHub Actions 빌드 시 secrets.VITE_IMGBB_API_KEY가 주입됩니다.
const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;

/**
 * 이미지 파일(Blob/File 또는 Base64)을 ImgBB 클라우드 서버에 업로드하고 URL을 반환합니다.
 * @param {Blob|File|string} imageInput - 업로드할 이미지 바이너리 또는 Base64 문자열
 * @returns {Promise<string>} - ImgBB에서 반환된 디스플레이용 이미지 URL
 */
export async function saveImageToImgBB(imageInput) {
  if (!IMGBB_API_KEY) {
    console.warn("ImgBB API Key가 설정되지 않았습니다. .env 또는 GitHub Secrets 설정을 확인해주세요.");
    throw new Error("ImgBB API Key is missing");
  }

  const formData = new FormData();

  if (imageInput instanceof Blob || imageInput instanceof File) {
    formData.append('image', imageInput);
  } else if (typeof imageInput === 'string') {
    // Base64 문자열인 경우 prefix 제거 후 전송
    const cleanBase64 = imageInput.replace(/^data:image\/(png|jpeg|webp|jpg);base64,/, '');
    formData.append('image', cleanBase64);
  } else {
    throw new Error("유효하지 않은 이미지 형식입니다.");
  }

  try {
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result && result.success && result.data) {
      // display_url 또는 url 반환 (https://i.ibb.co/xxxxx/image.jpg)
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
 * 기존 하위 호환성을 유지하기 위한 래퍼 함수
 */
export async function saveImageLocally(imageBlob) {
  return await saveImageToImgBB(imageBlob);
}

/**
 * URL 기반 전환으로 인해 더 이상 사용되지 않는 호환용 하위 함수
 */
export async function getImageLocally(imageId) {
  console.warn("getImageLocally()는 더 이상 사용되지 않습니다. Firestore에 저장된 ImgBB URL을 직접 사용하세요.");
  return null;
}