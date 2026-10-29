// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // 💡 추가된 부분
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const app = initializeApp(firebaseConfig);

// App Check: Firebase AI Logic(사진 분석)은 App Check 토큰이 있어야 동작한다.
// - PC 개발 서버(npm run dev)에서는 .env의 VITE_APPCHECK_DEBUG_TOKEN(디버그 토큰)을 쓴다.
//   이 토큰은 Firebase 콘솔 → App Check → 앱 → 디버그 토큰 관리에 등록해야 한다.
// - 배포용은 VITE_RECAPTCHA_SITE_KEY(reCAPTCHA v3 사이트 키)를 등록한 뒤 쓴다. (아직 미설정)
const appCheckDebugToken = import.meta.env.DEV ? import.meta.env.VITE_APPCHECK_DEBUG_TOKEN : undefined;
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (appCheckDebugToken) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
}
if (appCheckDebugToken || recaptchaSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(recaptchaSiteKey || 'debug-mode-placeholder'),
    isTokenAutoRefreshEnabled: true,
  });
}
export const db = getFirestore(app);
export const auth = getAuth(app); // 💡 추가된 부분