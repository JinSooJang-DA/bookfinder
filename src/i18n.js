// src/i18n.js
export const i18n = {
  en: {
    appTitle: "📚 Bookshelf Scanner",
    mainHeading: "📚 Bookshelf Scanner",
    lblUiLang: "🌐 Language",
    
    // 메인 대시보드 메뉴
    menuScanTitle: "📖 Book Input",
    menuScanDesc: "(Scan & Register)",
    menuGalleryTitle: "🖼️ Gallery",
    menuGalleryDesc: "(View Shelf Photos)",
    menuSearchTitle: "🔍 Search Books",
    menuSearchDesc: "(Inventory Lookup)",
    menuBarcodeTitle: "📱 Barcode Input",
    menuBarcodeDesc: "(Add Individual Book)",
    backToMenu: "⬅️ Back to Menu",

    // 1. 책 입력 뷰
    scanViewTitle: "📖 Book Input & Scan",
    lblTargetLang: "Book Title Output Language",
    roomInputLabel: "Room Name",
    shelfNameLabel: "Bookcase Name",
    lblTotalLayers: "Total Layers",
    lblCurrentLayer: "Current Layer",
    lblShotsCount: "Photos per Layer (Multi-shot)",
    btnPhoto: "📸 Photograph Shelf Layer",
    txtLoading: "🔍 Analyzing book spines... Please wait.",
    txtDetectedBooks: "Detected Books",
    saveBtn: "💾 Save to Database",

    // 2. 갤러리 뷰
    galleryViewTitle: "🖼️ Bookshelf Gallery",
    galleryPlaceholder: "Bookshelf photo gallery will be displayed here.",

    // 3. 도서 검색 뷰
    searchViewTitle: "📖 Book Search & Inventory",
    lblSearch: "🔍 Search Books",
    searchPlaceholder: "Search by title or author...",
    lblFilterGroup: "Filter & Group Operations",
    allRooms: "All Rooms",
    allShelves: "All Bookcases",
    allLayers: "All Layers",
    deleteGroupBtn: "🗑️ Delete Selected Scope",

    // 4. 바코드 입력 뷰
    barcodeViewTitle: "📷 Barcode (ISBN) Individual Book Add",
    barcodeDesc: "Specify the position where the book will be placed, then enter the ISBN.",
    bcRoomLabel: "Room Name",
    bcShelfLabel: "Bookcase Name",
    bcLayerLabel: "Layer",
    bcPositionLabel: "Position",
    isbnLabel: "ISBN Code",
    isbnPlaceholder: "Enter or scan ISBN e.g. 97838321... ",
    submitIsbnBtn: "➕ Add Book",

    // 공통 및 알림 텍스트
    layerPrefix: "Layer",
    top: "(Top)",
    bottom: "(Bottom)",
    confirmDeleteSingle: "Are you sure you want to delete this book?\n\nTitle: ",
    confirmDeleteGroup: "Are you sure you want to delete ALL books in this scope?\n\nScope: ",
    alertSuccessSave: "Successfully saved!",
    alertSuccessDelete: "Successfully deleted.",
    alertSuccessUpdate: "Successfully updated!",
    alertSelectRoomFirst: "Please select a specific room first.",
    shotProgress: "Photo captured. Please take photo ",

    // 인증 및 로그인 관련
    authEmailPasswordRequired: "Please enter both email and password.",
    authRegisterRequired: "Please enter email and password for registration.",
    loginFailed: "Login failed: ",
    registerSuccess: "Account created successfully and you are now logged in.",
    registerFailed: "Registration failed: ",

    // 도서 수정 모달 및 ISBN 관련
    enterIsbnFirst: "Please enter an ISBN first.",
    fetchingIsbn: "Fetching...",
    fetchIsbnBtn: "🔄 Fetch Info via ISBN",
    isbnFetchSuccess: "Book info updated via ISBN!",
    isbnFetchFail: "Could not fetch book info for this ISBN.",
    updateTitleRoomRequired: "Please fill in at least the Title and Room Name.",
    failUpdateBook: "Failed to update book information.",
    failSaveBook: "Failed to save books.",
    failAnalyzeImage: "Failed to analyze image.",

    // 갤러리 및 삭제 관련
    galleryLoading: "Loading bookshelf gallery...",
    galleryEmpty: "No bookshelf records found in database yet.",
    galleryError: "Failed to load gallery hierarchy.",
    shelfDeleteConfirm: "Are you sure you want to delete all books and photo records in room",
    shelfDeleteSuccess: "Bookshelf deleted successfully.",
    shelfDeleteFail: "Failed to delete bookshelf.",
    layerDeleteConfirm: "Are you sure you want to delete records in room",
    layerDeleteSuccess: "Layer data deleted successfully.",
    layerDeleteFail: "Failed to delete layer.",
    noPhoto: "No photo",
    noImageLocal: "No image files found locally."
  },
  de: {
    appTitle: "📚 Bücherregal-Scanner",
    mainHeading: "📚 Bücherregal-Scanner",
    lblUiLang: "🌐 Sprache",
    
    // 메인 대시보드 메뉴
    menuScanTitle: "📖 Bücher erfassen",
    menuScanDesc: "(Scannen & Registrieren)",
    menuGalleryTitle: "🖼️ Galerie",
    menuGalleryDesc: "(Regalfotos anzeigen)",
    menuSearchTitle: "🔍 Bücher suchen",
    menuSearchDesc: "(Bestand durchsuchen)",
    menuBarcodeTitle: "📱 Barcode-Eingabe",
    menuBarcodeDesc: "(Einzelnes Buch hinzufügen)",
    backToMenu: "⬅️ Zurück zum Menü",

    // 1. 책 입력 뷰
    scanViewTitle: "📖 Bücher erfassen & scannen",
    lblTargetLang: "Ausgabesprache für Buchtitel",
    roomInputLabel: "Raumname",
    shelfNameLabel: "Regalname",
    lblTotalLayers: "Gesamte Fächer",
    lblCurrentLayer: "Aktuelles Fach",
    lblShotsCount: "Fotos pro Fach (Multi-Aufnahme)",
    btnPhoto: "📸 Regalfach fotografieren",
    txtLoading: "🔍 Buchrücken werden analysiert... Bitte warten.",
    txtDetectedBooks: "Erkannte Bücher",
    saveBtn: "💾 In Datenbank speichern",

    // 2. 갤러리 뷰
    galleryViewTitle: "🖼️ Regalfach-Galerie",
    galleryPlaceholder: "Die Regalfoto-Galerie wird hier angezeigt.",

    // 3. 도서 검색 뷰
    searchViewTitle: "📖 Buchsuche & Bestand",
    lblSearch: "🔍 Bücher suchen",
    searchPlaceholder: "Nach Titel oder Autor suchen...",
    lblFilterGroup: "Filter & Gruppen-Aktionen",
    allRooms: "Alle Räume",
    allShelves: "Alle Regale",
    allLayers: "Alle Fächer",
    deleteGroupBtn: "🗑️ Ausgewählten Bereich löschen",

    // 4. 바코드 입력 뷰
    barcodeViewTitle: "📷 Barcode (ISBN) Einzelnes Buch hinzufügen",
    barcodeDesc: "Geben Sie den Ablageort an und scannen/tippen Sie dann die ISBN ein.",
    bcRoomLabel: "Raumname",
    bcShelfLabel: "Regalname",
    bcLayerLabel: "Fach",
    bcPositionLabel: "Position",
    isbnLabel: "ISBN-Code",
    isbnPlaceholder: "ISBN eingeben z.B. 97838321... ",
    submitIsbnBtn: "➕ Buch hinzufügen",

    // 공통 및 알림 텍스트
    layerPrefix: "Fach",
    top: "(Oben)",
    bottom: "(Unten)",
    confirmDeleteSingle: "Möchten Sie dieses Buch wirklich löschen?\n\nTitel: ",
    confirmDeleteGroup: "Möchten Sie WIRKLICH alle Bücher in diesem Bereich löschen?\n\nBereich: ",
    alertSuccessSave: "Erfolgreich gespeichert!",
    alertSuccessDelete: "Erfolgreich gelöscht.",
    alertSuccessUpdate: "Erfolgreich aktualisiert!",
    alertSelectRoomFirst: "Bitte wählen Sie zuerst einen bestimmten Raum aus.",
    shotProgress: "Foto gespeichert. Bitte machen Sie Foto ",

    // 인증 및 로그인 관련
    authEmailPasswordRequired: "Bitte geben Sie E-Mail und Passwort ein.",
    authRegisterRequired: "Bitte geben Sie E-Mail und Passwort für die Registrierung ein.",
    loginFailed: "Anmeldung fehlgeschlagen: ",
    registerSuccess: "Konto erfolgreich erstellt und Sie sind jetzt angemeldet.",
    registerFailed: "Registrierung fehlgeschlagen: ",

    // 도서 수정 모달 및 ISBN 관련
    enterIsbnFirst: "Bitte geben Sie zuerst eine ISBN ein.",
    fetchingIsbn: "Wird geladen...",
    fetchIsbnBtn: "🔄 Info via ISBN abrufen",
    isbnFetchSuccess: "Buchinfo via ISBN aktualisiert!",
    isbnFetchFail: "Buchinfo für diese ISBN konnte nicht abgerufen werden.",
    updateTitleRoomRequired: "Bitte füllen Sie mindestens Titel und Raumname aus.",
    failUpdateBook: "Aktualisierung der Buchinformationen fehlgeschlagen.",
    failSaveBook: "Speichern der Bücher fehlgeschlagen.",
    failAnalyzeImage: "Bildanalyse fehlgeschlagen.",

    // 갤러리 및 삭제 관련
    galleryLoading: "Regalgalerie wird geladen...",
    galleryEmpty: "Noch keine Regaleinträge in der Datenbank gefunden.",
    galleryError: "Fehler beim Laden der Galeriehierarchie.",
    shelfDeleteConfirm: "Möchten Sie wirklich alle Bücher und Fotodatensätze im Raum",
    shelfDeleteSuccess: "Regal erfolgreich gelöscht.",
    shelfDeleteFail: "Fehler beim Löschen des Regals.",
    layerDeleteConfirm: "Möchten Sie wirklich die Datensätze im Raum",
    layerDeleteSuccess: "Fachdaten erfolgreich gelöscht.",
    layerDeleteFail: "Fehler beim Löschen des Fachs.",
    noPhoto: "Kein Foto",
    noImageLocal: "Keine Bilddateien lokal gefunden."
  },
  ko: {
    appTitle: "📚 책장 스캐너",
    mainHeading: "📚 책장 스캐너",
    lblUiLang: "🌐 언어 설정",
    
    // 메인 대시보드 메뉴
    menuScanTitle: "📖 책 입력",
    menuScanDesc: "(스캔 및 등록)",
    menuGalleryTitle: "🖼️ 갤러리",
    menuGalleryDesc: "(책장별 사진 보기)",
    menuSearchTitle: "🔍 도서 검색",
    menuSearchDesc: "(인벤토리 조회)",
    menuBarcodeTitle: "📷 바코드 입력",
    menuBarcodeDesc: "(개별 도서 추가)",
    backToMenu: "⬅️ 메인 메뉴로 돌아가기",

    // 1. 책 입력 뷰
    scanViewTitle: "📖 책 입력 및 스캔",
    lblTargetLang: "도서 제목 출력 언어",
    roomInputLabel: "방 이름",
    shelfNameLabel: "책장 이름",
    lblTotalLayers: "총 칸 수",
    lblCurrentLayer: "현재 칸",
    lblShotsCount: "칸당 촬영 장수 (분할 촬영)",
    btnPhoto: "📸 책장 칸 촬영하기",
    txtLoading: "🔍 책 등 분석 중... 잠시만 기다려주세요.",
    txtDetectedBooks: "감지된 책 목록",
    saveBtn: "💾 데이터베이스에 저장",

    // 2. 갤러리 뷰
    galleryViewTitle: "🖼️ 책장 갤러리",
    galleryPlaceholder: "책장별 사진 갤러리가 여기에 표시됩니다.",

    // 3. 도서 검색 뷰
    searchViewTitle: "📖 도서 검색 및 인벤토리",
    lblSearch: "🔍 도서 검색",
    searchPlaceholder: "제목 또는 저자로 검색...",
    lblFilterGroup: "필터 및 그룹 삭제",
    allRooms: "모든 방",
    allShelves: "모든 책장",
    allLayers: "모든 칸",
    deleteGroupBtn: "🗑️ 선택 영역 전체 삭제",

    // 4. 바코드 입력 뷰
    barcodeViewTitle: "📷 바코드(ISBN) 개별 도서 추가",
    barcodeDesc: "먼저 책이 꽂힐 위치를 지정한 뒤 ISBN을 입력하세요.",
    bcRoomLabel: "방 이름",
    bcShelfLabel: "책장 이름",
    bcLayerLabel: "칸",
    bcPositionLabel: "위치",
    isbnLabel: "ISBN 코드",
    isbnPlaceholder: "ISBN 입력 z.B. 97838321... ",
    submitIsbnBtn: "➕ 도서 추가",

    // 공통 및 알림 텍스트
    layerPrefix: "칸",
    top: "(맨 위)",
    bottom: "(맨 아래)",
    confirmDeleteSingle: "정말로 이 도서 항목을 삭제하시겠습니까?\n\n제목: ",
    confirmDeleteGroup: "선택한 영역의 모든 도서를 정말로 삭제하시겠습니까?\n\n삭제 범위: ",
    alertSuccessSave: "성공적으로 저장되었습니다!",
    alertSuccessDelete: "성공적으로 삭제되었습니다.",
    alertSuccessUpdate: "성공적으로 수정되었습니다!",
    alertSelectRoomFirst: "먼저 특정 방을 선택해 주세요.",
    shotProgress: "사진이 저장되었습니다. 다음 사진을 촬영하세요: ",

    // 인증 및 로그인 관련
    authEmailPasswordRequired: "이메일과 비밀번호를 모두 입력해 주세요.",
    authRegisterRequired: "회원가입을 위해 이메일과 비밀번호를 입력해 주세요.",
    loginFailed: "로그인 실패: ",
    registerSuccess: "계정이 성공적으로 생성되었으며 현재 로그인되어 있습니다.",
    registerFailed: "회원가입 실패: ",

    // 도서 수정 모달 및 ISBN 관련
    enterIsbnFirst: "먼저 ISBN을 입력해 주세요.",
    fetchingIsbn: "가져오는 중...",
    fetchIsbnBtn: "🔄 ISBN으로 정보 가져오기",
    isbnFetchSuccess: "ISBN을 통해 도서 정보가 업데이트되었습니다!",
    isbnFetchFail: "이 ISBN에 대한 도서 정보를 가져올 수 없습니다.",
    updateTitleRoomRequired: "최소한 제목과 방 이름을 입력해 주세요.",
    failUpdateBook: "도서 정보 업데이트에 실패했습니다.",
    failSaveBook: "도서 저장에 실패했습니다.",
    failAnalyzeImage: "이미지 분석에 실패했습니다.",

    // 갤러리 및 삭제 관련
    galleryLoading: "책장 갤러리를 불러오는 중...",
    galleryEmpty: "데이터베이스에 등록된 책장 기록이 없습니다.",
    galleryError: "갤러리 계층 구조를 불러오는 데 실패했습니다.",
    shelfDeleteConfirm: "정말 다음 방의 모든 책장 및 사진 기록을 삭제하시겠습니까? 방: ",
    shelfDeleteSuccess: "책장이 성공적으로 삭제되었습니다.",
    shelfDeleteFail: "책장 삭제에 실패했습니다.",
    layerDeleteConfirm: "정말 다음 영역의 기록을 삭제하시겠습니까? 방 및 책장: ",
    layerDeleteSuccess: "칸 데이터가 성공적으로 삭제되었습니다.",
    layerDeleteFail: "칸 삭제에 실패했습니다.",
    noPhoto: "사진 없음",
    noImageLocal: "로컬에 저장된 이미지 파일이 없습니다."
  }
};