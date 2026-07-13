// state.js —— 應用程式目前的狀態：選了哪個分類/圖案、畫布尺寸、已放置的圖案清單...等

let state = {
  category: Object.keys(categories)[0],
  selectedGlyph: null,
  paper: "A4",
  orientation: "Portrait",
  gridMm: 5,
  items: {},          // 已放置的圖案：id -> {glyph, r, c, flipH, flipV}
  nextItemId: 1,
  selectedItemId: null,
  eraserMode: false,
  paintMode: false, // 放大檢視專用的「單格繪畫」，離開放大檢視就會自動關閉，見 closeMagnify()
  sizeConfirmed: false // 任務25：使用者是否已經確認過一次尺寸/方向選擇，決定進入排版頁面時要不要強制跳出選擇彈窗
};

// 選好新圖案時，順便關閉橡皮擦模式，避免使用者以為選了圖案卻還在擦除狀態
function exitEraserMode(){
  if(!state.eraserMode) return;
  state.eraserMode = false;
  document.getElementById("eraserBtn").classList.remove("eraser-active");
  gridWrapperEl.classList.remove("eraser-mode");
  clearPreview();
}

// 單格繪畫、單格去除只能二選一，開啟其中一個就要關掉另一個，避免點格子時邏輯衝突
function exitPaintMode(){
  if(!state.paintMode) return;
  state.paintMode = false;
  document.getElementById("paintBtn").classList.remove("paint-active");
  clearPreview();
}

let cellGrid = [];
let gridRows = 0, gridCols = 0;
const CELL_PX = 22; // 每個像素格在畫面上的實際大小(px)，畫布外框要依此換算縮放後尺寸
