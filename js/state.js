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
  eraserMode: false
};

// 選好新圖案時，順便關閉橡皮擦模式，避免使用者以為選了圖案卻還在擦除狀態
function exitEraserMode(){
  if(!state.eraserMode) return;
  state.eraserMode = false;
  document.getElementById("eraserBtn").classList.remove("eraser-active");
  gridWrapperEl.classList.remove("eraser-mode");
  clearPreview();
}

let cellGrid = [];
let gridRows = 0, gridCols = 0;
const CELL_PX = 22; // 每個像素格在畫面上的實際大小(px)，畫布外框要依此換算縮放後尺寸
