# BookFinder — Claude 작업 안내

## 앱 개요 (사용자가 정한 목표 — 항상 이 방향으로 개발한다)

- BookFinder는 **집에 있는 실제 책장을 촬영하고, AI로 책을 인식해 위치 정보가 연결된 개인 도서관을 만드는 앱**이다. 이미 등록된 책 정보를 검색하는 앱이 아니다.
- 핵심 흐름:
  1. 책장을 만들고 위치를 지정한다 (방 → 책장 → 층/칸).
  2. 휴대폰 카메라로 책장(책등)을 촬영한다. 여러 장 가능.
  3. Gemini가 사진을 분석해 제목·저자·배열 순서를 추출하고, 사용자가 검토·수정한다.
  4. 분석 결과로 **책 DB**를 만들고, 사진과 함께 실제 방·책장·층에 연결해 저장한다.
  5. 그 사진들로 **가상 책장**을 다시 구성해, 내 책이 어디에 있는지 **한눈에 보고 찾을 수 있게** 한다.
- 개발 우선순위는 촬영 → 분석 → 책 DB → 위치별 저장 → 가상 책장이다. 검색, 데모 데이터, 책 정보 조회는 보조 기능이며, 이것들을 키우는 방향으로 앱을 바꾸지 않는다.
- 메인 메뉴는 책 네 권 모양: Library · Shelf Setup · Live Analysis · Barcode Input.

## 현재 상태 (2026-10-29 되돌림)

- 사용자 결정으로 `main`을 모바일 전환 시작 직전, 즉 마지막 커밋 `b126c4d`(데스크탑 웹 버전)로 되돌렸다. 그 위에 GitHub에서 한 README·헤더 수정 커밋 3개만 받아 `main` = `f2364b0` = `origin/main`이다.
- ChatGPT/Codex로 한 모바일(Capacitor) 전환 작업은 **로컬 전용 브랜치 `backup/mobile-attempt-1028`(커밋 `93621f9`)** 에 통째로 보관되어 있다. 푸시하지 않는다. 그 작업은 앱을 검색 중심으로 바꿔 놓아서 그대로 되살리지 않는다.
- 모바일 앱은 처음부터 다시, 작은 단계로 만든다. 백업 브랜치에서는 Android 빌드 환경(`scripts/android-env.ps1`, `scripts/build-android.ps1`, `capacitor.config.json`, 분석 대기 안내·타임아웃 같은 개별 아이디어)처럼 필요한 것만 사용자와 정해서 골라 가져온다.
- Linux 연결 셸에서는 Windows용 `node_modules`로 Vite가 돌지 않는다. 빌드 검사는 폴더 밖 임시 복사본(`git archive` + `npm ci`)에서 하고, 끝나면 복사본(.env 사본 포함)을 지운다.

## 기술 구성

- Vite + 일반 JavaScript (React 미사용). 패키지 이름은 `bookspot`.
- Firebase Authentication, Cloud Firestore (`src/firebase.js`, `src/storage.js`)
- 사진 저장: ImgBB URL
- AI 분석 (2026-10-29부터): **Firebase AI Logic + Vertex AI(Agent Platform) 백엔드** (`firebase/ai`). API 키 없이 Firebase 프로젝트 `bookspot-1fc6d`(Blaze 요금제)로 요청하고, 비용은 연결된 Cloud 결제 계정의 크레딧에서 나간다. 공통 분석 함수는 `src/api.js`의 `analyzeBookshelfImage()` (호출 지점: `src/main.js` `analyzeSelectedShelfPhoto()`·카메라 입력, `src/gallery.js` `reanalyzeLayer()`·`reanalyzeShelfScope()`).
  - 모델 순서 `GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash']`: 앞 모델이 붐비면(429/500/503) 다음 모델로 한 번 더 시도.
  - `.env`의 `VITE_GEMINI_BACKEND`: `firebase`(기본) | `vertex`(REST+키, 조직 정책으로 키 생성이 막혀 미사용) | `developer`(AI Studio, 선불제 — Cloud 크레딧이 적용되지 않음).
  - Gemini 3 계열은 temperature 1.0 유지(Google 권장). 지어내기는 프롬프트로 억제한다.
  - **App Check 필수**(AI Logic이 강제). 개발 서버에서는 `.env`의 `VITE_APPCHECK_DEBUG_TOKEN`(Firebase 콘솔 App Check에 등록됨)을 쓴다. 배포용 reCAPTCHA v3 키(`VITE_RECAPTCHA_SITE_KEY`)는 아직 없다 → **배포된 웹에서는 분석이 동작하지 않는다.**
  - 개발 서버에서만 결과 위에 "⏱ 분석 시간" 상자(줄이기·모델·합계 시간)를 보여준다. PC 약 5초, 휴대폰 브라우저 약 1분(원인 측정 중).
- 도서 정보: Google Books API → Open Library ISBN 대체 조회 (`src/enrichIsbn.js`), 바코드는 `html5-qrcode` (`src/barcode.js`)
- Android(재구성 예정): Capacitor 8.5.3, appId `com.jinsoojang.bookfinder`, webDir `dist` — 현재 main에는 없음, 백업 브랜치 참고. 기존 웹 앱을 버리지 않고 같은 JavaScript 코드를 재사용해 Android 앱을 만든다.

## 사용자와 작업 방식

- 사용자(Komfact)는 직접 코딩하지 않는다. 방향과 디자인을 결정하고 **실제 휴대폰에서 테스트**하는 역할이다. 설명은 한국어로, 코드 지식 없이도 이해할 수 있게 한다.
- 순서: 기존 코드 조사와 문제 보고 → 기존 코드 재사용 → 필요한 부분만 작게 수정 → 자동 검증 → 실기기 검증 → 사용자 승인 후 Git 작업.
- 작업이 끝나면 **휴대폰에서 무엇을 어떻게 확인하면 되는지** 짧은 체크리스트를 준다.
- 조사한 것과 실제로 동작하는 것은 다르다. 테스트 통과나 APK 빌드 성공만으로 촬영부터 저장까지 검증됐다고 말하지 않는다.

## 반드시 지킬 원칙

- 사용자의 미커밋 변경을 보존한다. 관련 없는 변경을 덮어쓰지 않는다.
- Firebase 데이터 구조를 불필요하게 바꾸지 않는다. 재분석할 때 기존 책 데이터와 위치 정보를 잃지 않게 한다.
- 잘자자(KWALA) 앱의 Android 개발 환경(JDK 17 등)은 건드리지 않는다. BookFinder는 전용 JDK 21을 쓴다.
- `.env`(API 키)는 절대 커밋하거나 출력하지 않는다.

## 검사

```bash
npm run build            # Vite 웹 빌드 (현재 main에는 npm test 없음)
git diff --check
```

## Android APK 빌드와 설치

- 현재 `main`에는 Android 프로젝트가 없다. 모바일을 다시 시작할 때 `backup/mobile-attempt-1028`의 빌드 스크립트를 참고해 다시 구성한다.
- 기존 환경: JDK 21(`D:/Android/Jdk/temurin-21/...`, BookFinder 전용), SDK `D:/Android/Sdk`(android/local.properties에 `sdk.dir=D:/Android/Sdk`), Gradle 8.14.3, Capacitor 8.5.3. APK 빌드·설치는 사용자의 Windows PowerShell에서 실행하고 명령을 정확히 안내한다.
- 테스트 기기: Redmi Note 9S (Android 12, API 31, MIUI 14). **Wi-Fi 무선 ADB**로 설치한다. 에뮬레이터나 USB를 기본 경로로 쓰지 않는다.

## 커밋, 푸시, 배포

- **사용자 승인 없이 커밋·푸시·배포하지 않는다.**
- `main`에 푸시하면 `.github/workflows/deploy.yml`이 **웹 앱을 GitHub Pages에 자동 배포**한다. 푸시는 곧 배포라는 점을 사용자에게 알리고 승인을 받는다.

## 다음 계획 (2026-10-29 사용자와 정함)

- **도서관 구성 저장:** 지금은 Firestore에 `books`만 있고 방·책장 목록은 책에서 모아 만든다 → 책 없이 만든 책장은 사라진다. `books`는 그대로 두고 장소 → 방(도면 위치) → 책장(방 안 위치, 층 수, 사진)을 따로 저장한다.
- **도식화된 탐색:** 장소 아이콘 → 집 평면도(위에서 본 청사진) → 방 평면도(책장 위치) → 책장 정면(층별 칸 사진). 시안: claude.ai Design 아티팩트 "BookFinder 도서관 탐색 시안". 집: 서재 2 · 거실 2 · Flur 2 · 침실 2(ㄱ자) = 책장 8.
- **촬영 흐름:** 책장 선택(유지) → 세로 촬영 → 선택적 메모(키보드 음성 입력) → AI가 칸을 찾아 칸별로 잘라 다시 읽기 → 확인 화면 → 저장.

## 남은 과제 (2026-10-28 기준, 모바일 재시작 전 기록 — 되돌린 뒤 다시 확인 필요)

1. **Gemini 분석 성능과 정확도:** 실제 분석 한 번에 183초가 걸린 기록이 있다. 사진 리사이즈·인코딩 시간, Gemini 응답 시간, 실패와 재시도, 책 수·이미지 크기별 응답 시간, 제목·저자·순서 정확도를 측정한 뒤 개선한다. (현재 20초 후 지연 안내, 4분 제한, 실패 시 사진 유지는 구현됨)
   - 사용자 기록: ChatGPT/Codex 작업 전(마지막 커밋)에는 촬영 → Gemini Flash 분석 → 책 DB 생성이 빠르고 잘 동작했다.
   - 2026-10-28 비교 결과: `src/api.js`의 Gemini 요청은 마지막 커밋과 거의 같다(같은 모델, 최대 1600px·JPEG 0.85 축소, 같은 응답 스키마). 추가된 것은 `thinkingLevel: LOW`, `maxOutputTokens: 8192`, 240초 타임아웃, `[BookFinder Gemini]` 시간 측정 로그뿐이다. 따라서 지연 원인은 요청 밖(휴대폰 촬영·파일 처리 흐름, 분석 전 업로드 순서, 휴대폰 네트워크, 모델 응답 지연)일 가능성이 높다. 먼저 `[BookFinder Gemini]` 로그로 단계별 시간을 측정하고, 같은 사진을 데스크탑 웹에서 분석한 시간과 비교한다.
2. **촬영부터 저장까지 전체 흐름 완성:** 실제 사진 → 분석 → 결과 수정 → 올바른 책장·층에 Firebase 저장. 결과 수정 후 저장은 아직 실기기에서 검증되지 않았다.
3. **데이터 신뢰성:** 여러 사진 추가, 기존 책과의 연결, 중복 등록 방지, 위치 정보 보존.
4. **보안:** 브라우저 번들에 들어가는 `VITE_GEMINI_API_KEY`와 ImgBB 키 노출 위험, Firebase 보안 규칙 점검. 실제 개인 도서관 데이터를 본격적으로 저장하기 전에 해결한다.
