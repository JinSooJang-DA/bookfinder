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
    shotProgress: "Photo captured. Please take photo "
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
    shotProgress: "Foto gespeichert. Bitte machen Sie Foto "
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
    shotProgress: "사진이 저장되었습니다. 다음 사진을 촬영하세요: "
  }
};