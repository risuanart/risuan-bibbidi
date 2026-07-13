// canvas.js —— 畫布本體：建立格子、畫上圖案、拖曳、微調位置、橡皮擦、選取框、縮放。
// 這裡只放「畫布怎麼運作」的邏輯；按鈕怎麼接上這些函式，在 main.js。

const stitchGridEl = document.getElementById("stitchGrid");
const zoomViewportEl = document.getElementById("zoomViewport");

let previewCells = [];
const PREVIEW_COLOR = "rgba(131,129,92,0.45)"; // 半透明橄欖綠
const DRAG_TARGET_COLOR = "var(--sidebar-bg)"; // 拖曳中新位置預覽，改回深色並加方框以利辨識

function clearPreview(){
  previewCells.forEach(cell => {
    cell.style.background = cell.dataset.itemId ? "var(--sidebar-bg)" : "";
  });
  previewCells = [];
}

// 把游標所在格子(r,c)當作圖案「有色範圍」的中心，回推左上角原點
function getCenteredOrigin(glyph, r, c){
  const bitmap = getGlyphBitmap(glyph);
  const bbox = getGlyphBBox(bitmap);
  if(bbox.minR === Infinity) return {originR:r, originC:c};
  const centerR = (bbox.minR + bbox.maxR) / 2;
  const centerC = (bbox.minC + bbox.maxC) / 2;
  return { originR: Math.round(r - centerR), originC: Math.round(c - centerC) };
}
function isBitmapWithinBounds(originR, originC, bitmap){
  for(let i=0;i<bitmap.length;i++){
    for(let j=0;j<bitmap[i].length;j++){
      if(!bitmap[i][j]) continue;
      const rr = originR+i, cc = originC+j;
      if(rr<0||cc<0||rr>=gridRows||cc>=gridCols) return false;
    }
  }
  return true;
}

const ERASE_PREVIEW_COLOR = "rgba(192,57,43,0.45)"; // 半透明紅色，提示橡皮擦即將擦除的格子

// 橡皮擦模式下，滑鼠/手指移到圖案上時，只標示游標所在的那一格，點下去只會擦掉這一格
function showErasePreviewAt(hoverR, hoverC){
  clearPreview();
  const cell = cellGrid[hoverR] && cellGrid[hoverR][hoverC];
  if(!cell || !cell.dataset.itemId) return;
  cell.style.background = ERASE_PREVIEW_COLOR;
  previewCells.push(cell);
}

// 把圖案在(r,c)這一格的像素擦掉（保留其他格），跟垃圾桶「整個刪除」不同
// 擦除的格子記在 item.holes（未翻轉前的座標），這樣之後翻轉時擦除的洞會跟著圖案一起翻轉
function eraseCellFromItem(id, r, c){
  const item = state.items[id];
  if(!item) return;
  const bitmap = getItemBitmap(item);
  const size = bitmap.length;
  const i = r - item.r, j = c - item.c;
  if(i<0 || j<0 || i>=size || j>=size || !bitmap[i][j]) return;
  if(!item.holes) item.holes = new Set();
  const baseI = item.flipV ? size - 1 - i : i;
  const baseJ = item.flipH ? size - 1 - j : j;
  item.holes.add(baseI + ',' + baseJ);

  if(getGlyphBBox(getItemBitmap(item)).minR === Infinity){
    deleteItem(id); // 整個圖案都被擦光了，直接移除這個圖案
    return;
  }
  paintAll();
  if(state.selectedItemId === id){
    positionToolbar(id);
    positionSelectionFrame(id);
  }
  scheduleAutosave();
}

// 橡皮擦按住拖曳：滑過去的每一格都會被擦掉，方便一次擦掉一大片
let eraseDragging = false;
function eraseAtPoint(clientX, clientY){
  const pos = getCellFromPoint(clientX, clientY);
  if(!pos) return;
  const occupantId = cellGrid[pos.r][pos.c].dataset.itemId;
  if(occupantId) eraseCellFromItem(occupantId, pos.r, pos.c);
}
function onEraseMouseMove(e){ eraseAtPoint(e.clientX, e.clientY); }
function onEraseMouseUp(){ stopEraseDrag(); }
function onEraseTouchMove(e){
  const touch = e.touches[0];
  if(!touch) return;
  e.preventDefault();
  eraseAtPoint(touch.clientX, touch.clientY);
}
function onEraseTouchEnd(){ stopEraseDrag(); }
function startEraseDrag(isTouch){
  eraseDragging = true;
  if(isTouch){
    document.addEventListener('touchmove', onEraseTouchMove, {passive:false});
    document.addEventListener('touchend', onEraseTouchEnd);
  } else {
    document.addEventListener('mousemove', onEraseMouseMove);
    document.addEventListener('mouseup', onEraseMouseUp);
  }
}
function stopEraseDrag(){
  eraseDragging = false;
  document.removeEventListener('mousemove', onEraseMouseMove);
  document.removeEventListener('mouseup', onEraseMouseUp);
  document.removeEventListener('touchmove', onEraseTouchMove);
  document.removeEventListener('touchend', onEraseTouchEnd);
}

// 單格繪畫按住拖曳：滑過去的每個空格都畫上一個像素，方便一次畫一片
let paintDragging = false;
function paintAtPoint(clientX, clientY){
  const pos = getCellFromPoint(clientX, clientY);
  if(!pos) return;
  const occupantId = cellGrid[pos.r][pos.c].dataset.itemId;
  if(occupantId) return; // 已經有圖案的格子不重複疊加
  placeItem(PAINT_DOT_GLYPH, pos.r, pos.c);
}
function onPaintMouseMove(e){ paintAtPoint(e.clientX, e.clientY); }
function onPaintMouseUp(){ stopPaintDrag(); }
function onPaintTouchMove(e){
  const touch = e.touches[0];
  if(!touch) return;
  e.preventDefault();
  paintAtPoint(touch.clientX, touch.clientY);
}
function onPaintTouchEnd(){ stopPaintDrag(); }
function startPaintDrag(isTouch){
  paintDragging = true;
  if(isTouch){
    document.addEventListener('touchmove', onPaintTouchMove, {passive:false});
    document.addEventListener('touchend', onPaintTouchEnd);
  } else {
    document.addEventListener('mousemove', onPaintMouseMove);
    document.addEventListener('mouseup', onPaintMouseUp);
  }
}
function stopPaintDrag(){
  paintDragging = false;
  document.removeEventListener('mousemove', onPaintMouseMove);
  document.removeEventListener('mouseup', onPaintMouseUp);
  document.removeEventListener('touchmove', onPaintTouchMove);
  document.removeEventListener('touchend', onPaintTouchEnd);
}

function showPreviewAt(hoverR, hoverC){
  clearPreview();
  if(!state.selectedGlyph) return;
  const { originR, originC } = getCenteredOrigin(state.selectedGlyph, hoverR, hoverC);
  const bitmap = getGlyphBitmap(state.selectedGlyph);
  if(!isBitmapWithinBounds(originR, originC, bitmap)) return; // 超出畫布，不顯示預覽
  for(let i=0;i<bitmap.length;i++){
    for(let j=0;j<bitmap[i].length;j++){
      if(!bitmap[i][j]) continue;
      const rr = originR+i, cc = originC+j;
      const cell = cellGrid[rr][cc];
      cell.style.background = PREVIEW_COLOR;
      previewCells.push(cell);
    }
  }
}

function getCellFromPoint(clientX, clientY){
  const el = document.elementFromPoint(clientX, clientY);
  const cellEl = el && el.closest ? el.closest('.cell') : null;
  if(!cellEl) return null;
  const r = parseInt(cellEl.dataset.r, 10);
  const c = parseInt(cellEl.dataset.c, 10);
  if(Number.isNaN(r) || Number.isNaN(c)) return null;
  return {r, c};
}

function paintAll(){
  for(let r=0;r<gridRows;r++){
    for(let c=0;c<gridCols;c++){
      cellGrid[r][c].style.background = "";
      delete cellGrid[r][c].dataset.itemId;
    }
  }
  Object.keys(state.items).forEach(id=>{
    const item = state.items[id];
    const bitmap = getItemBitmap(item);
    for(let i=0;i<bitmap.length;i++){
      for(let j=0;j<bitmap[i].length;j++){
        if(!bitmap[i][j]) continue;
        const rr = item.r+i, cc = item.c+j;
        if(rr<0||cc<0||rr>=gridRows||cc>=gridCols) continue;
        cellGrid[rr][cc].style.background = "var(--sidebar-bg)";
        cellGrid[rr][cc].dataset.itemId = id;
      }
    }
  });
}

let dragState = null;
let dragOriginCells = [];

// 任務26追加：拖曳前(原位置)跟拖曳後(新落點)要用不同顏色區分，不是一片灰霧——
// 原位置用半透明綠(PREVIEW_COLOR)，新落點維持深色(DRAG_TARGET_COLOR)
function markDragOriginCells(id){
  const item = state.items[id];
  const bitmap = getItemBitmap(item);
  dragOriginCells = [];
  for(let i=0;i<bitmap.length;i++){
    for(let j=0;j<bitmap[i].length;j++){
      if(!bitmap[i][j]) continue;
      const rr = item.r+i, cc = item.c+j;
      if(rr<0||cc<0||rr>=gridRows||cc>=gridCols) continue;
      const cell = cellGrid[rr][cc];
      cell.style.background = PREVIEW_COLOR;
      dragOriginCells.push(cell);
    }
  }
}

function clearDragOriginMark(){
  dragOriginCells.forEach(cell => {
    cell.style.background = cell.dataset.itemId ? "var(--sidebar-bg)" : "";
  });
  dragOriginCells = [];
}

function updateDragPreview(item, hoverR, hoverC){
  clearPreview();
  const { originR, originC } = getCenteredOrigin(item.glyph, hoverR, hoverC);
  const bitmap = getItemBitmap(item);
  if(!isBitmapWithinBounds(originR, originC, bitmap)){
    dragState.validOrigin = null;
    hideSelectionFrame();
    return;
  }
  dragState.validOrigin = { originR, originC };
  for(let i=0;i<bitmap.length;i++){
    for(let j=0;j<bitmap[i].length;j++){
      if(!bitmap[i][j]) continue;
      const cell = cellGrid[originR+i][originC+j];
      // 跳過已經標成原位置(綠色)的格子，避免這裡又把它蓋成深色，導致原位置的顏色標示消失
      if(dragOriginCells.includes(cell)) continue;
      cell.style.background = DRAG_TARGET_COLOR;
      previewCells.push(cell);
    }
  }
  // 新位置加上方框，跟選取字母時的方框一樣，加強辨識新落點
  const localBBox = getGlyphBBox(bitmap);
  if(localBBox.minR !== Infinity){
    positionFrameAtBBox({
      topRow: originR + localBBox.minR,
      bottomRow: originR + localBBox.maxR,
      leftCol: originC + localBBox.minC,
      rightCol: originC + localBBox.maxC
    });
  } else {
    hideSelectionFrame();
  }
}

function startItemDrag(id, clientX, clientY, isTouch){
  dragState = { id, startX: clientX, startY: clientY, dragging:false, validOrigin:null };
  if(isTouch){
    document.addEventListener('touchmove', onDragTouchMove, {passive:false});
    document.addEventListener('touchend', onDragTouchEnd);
  } else {
    document.addEventListener('mousemove', onDragMouseMove);
    document.addEventListener('mouseup', onDragMouseUp);
  }
}

function handleDragMove(clientX, clientY){
  if(!dragState) return;
  const dx = clientX - dragState.startX, dy = clientY - dragState.startY;
  if(!dragState.dragging){
    if(Math.hypot(dx,dy) < 4) return; // 距離太短先當作點擊，避免手抖誤觸拖曳
    dragState.dragging = true;
    deselectItem();
    markDragOriginCells(dragState.id); // 任務26追加：拖曳前的原始位置標成半透明綠，跟新落點的深色區分開來
  }
  const pos = getCellFromPoint(clientX, clientY);
  const item = state.items[dragState.id];
  if(pos){
    updateDragPreview(item, pos.r, pos.c);
  } else {
    clearPreview();
    dragState.validOrigin = null;
    hideSelectionFrame();
  }
}

function finishDrag(){
  if(!dragState) return;
  const { id, dragging, validOrigin } = dragState;
  if(dragging){
    clearPreview();
    clearDragOriginMark();
    hideSelectionFrame();
    if(validOrigin){
      state.items[id].r = validOrigin.originR;
      state.items[id].c = validOrigin.originC;
      scheduleAutosave();
    }
    paintAll();
  } else {
    if(state.selectedItemId === id){
      deselectItem();
    } else {
      selectItem(id);
    }
  }
  dragState = null;
  latestDragPoint = null;
  document.removeEventListener('mousemove', onDragMouseMove);
  document.removeEventListener('mouseup', onDragMouseUp);
  document.removeEventListener('touchmove', onDragTouchMove);
  document.removeEventListener('touchend', onDragTouchEnd);
}

// 拖曳大圖案時，mousemove 觸發頻率遠高於畫面更新頻率，這裡用 requestAnimationFrame
// 把同一畫格內的多次移動事件合併成一次重繪，避免大圖案拖曳時明顯延遲、卡頓
let dragRAFPending = false;
let latestDragPoint = null;

function scheduleDragFrame(){
  if(dragRAFPending) return;
  dragRAFPending = true;
  requestAnimationFrame(()=>{
    dragRAFPending = false;
    if(latestDragPoint) handleDragMove(latestDragPoint.x, latestDragPoint.y);
  });
}

function onDragMouseMove(e){
  latestDragPoint = { x: e.clientX, y: e.clientY };
  scheduleDragFrame();
}
function onDragMouseUp(){ finishDrag(); }
function onDragTouchMove(e){
  const touch = e.touches[0];
  if(!touch) return;
  e.preventDefault();
  latestDragPoint = { x: touch.clientX, y: touch.clientY };
  scheduleDragFrame();
}
function onDragTouchEnd(){ finishDrag(); }

// ---- 復原：記錄畫布上圖案清單(state.items)的快照，讓使用者可以一步一步回到修改前的狀態 ----
// 只記錄items本身（不含paper/orientation等排版設定），因為復原的用意是「復原編輯動作」，
// 不是回到不同的紙張設定
const undoStack = [];
const MAX_UNDO_STEPS = 30;

function snapshotItems(){
  const items = {};
  Object.keys(state.items).forEach(id=>{
    const it = state.items[id];
    const copy = { glyph: it.glyph, r: it.r, c: it.c, flipH: it.flipH, flipV: it.flipV };
    if(it.holes && it.holes.size) copy.holes = Array.from(it.holes);
    items[id] = copy;
  });
  return { items, nextItemId: state.nextItemId }; // 一併記錄nextItemId，避免清空畫布後復原時跟新放的圖案撞ID
}

// 每個會改變畫面上圖案的動作，執行前都要呼叫這個，把「動作前」的狀態存起來
function pushUndo(){
  undoStack.push(snapshotItems());
  if(undoStack.length > MAX_UNDO_STEPS) undoStack.shift();
  updateUndoBtnState();
}

function undoLastAction(){
  if(!undoStack.length) return;
  const prev = undoStack.pop();
  state.items = {};
  Object.keys(prev.items).forEach(id=>{
    const it = prev.items[id];
    const restored = { glyph: it.glyph, r: it.r, c: it.c, flipH: it.flipH, flipV: it.flipV };
    if(it.holes && it.holes.length) restored.holes = new Set(it.holes);
    state.items[id] = restored;
  });
  state.nextItemId = prev.nextItemId;
  deselectItem();
  paintAll();
  scheduleAutosave();
  updateUndoBtnState();
}

function updateUndoBtnState(){
  const btn = document.getElementById("undoBtn");
  if(btn) btn.disabled = undoStack.length === 0;
}

function placeItem(glyph, r, c){
  const id = "item" + (state.nextItemId++);
  state.items[id] = { glyph, r, c, flipH:false, flipV:false };
  paintAll();
  scheduleAutosave();
}

function deleteItem(id){
  delete state.items[id];
  deselectItem();
  paintAll();
  scheduleAutosave();
}

function getItemGridBBox(item){
  const bitmap = getItemBitmap(item);
  const bbox = getGlyphBBox(bitmap);
  if(bbox.minR === Infinity) return null;
  return {
    topRow: item.r + bbox.minR,
    bottomRow: item.r + bbox.maxR,
    leftCol: item.c + bbox.minC,
    rightCol: item.c + bbox.maxC
  };
}

function selectItem(id){
  state.selectedItemId = id;
  positionToolbar(id);
  positionSelectionFrame(id);
  updateResizeBtnVisibility(id);
}

function updateResizeBtnVisibility(id){
  const item = state.items[id];
  const btn = document.getElementById("resizeItemBtn");
  btn.style.display = item ? "flex" : "none";
}

function deselectItem(){
  state.selectedItemId = null;
  document.getElementById('itemToolbar').style.display = 'none';
  hideSelectionFrame();
}

function positionToolbar(id){
  const item = state.items[id];
  const toolbarEl = document.getElementById('itemToolbar');
  if(!item){ deselectItem(); return; }
  const bbox = getItemGridBBox(item);
  if(!bbox){ deselectItem(); return; }
  const topLeftCell = cellGrid[bbox.topRow] && cellGrid[bbox.topRow][bbox.leftCol];
  const bottomRightCell = cellGrid[bbox.bottomRow] && cellGrid[bbox.bottomRow][bbox.rightCol];
  if(!topLeftCell || !bottomRightCell){ deselectItem(); return; }
  toolbarEl.style.display = 'flex';

  // 圖案完整的視窗座標範圍（不是只看單一格），左右都放不下時才能正確判斷要不要改貼上下方。
  // 用min/max而不是直接假設topLeftCell在視覺上一定在左上角——放大檢視橫式畫布轉向90度後，
  // 邏輯上的「左上角格子」視覺上可能變成右上/左下，直接假設會算出負的寬高，導致工具列位置跑掉
  const topLeftRect = topLeftCell.getBoundingClientRect();
  const bottomRightRect = bottomRightCell.getBoundingClientRect();
  const itemLeft = Math.min(topLeftRect.left, bottomRightRect.left);
  const itemRight = Math.max(topLeftRect.right, bottomRightRect.right);
  const itemTop = Math.min(topLeftRect.top, bottomRightRect.top);
  const itemBottom = Math.max(topLeftRect.bottom, bottomRightRect.bottom);

  // 用視窗座標定位，並確保工具列一定落在畫面可見範圍內，
  // 避免圖案太大或太靠邊時，翻轉/刪除按鍵被卡在捲軸外點不到
  const toolbarRect = toolbarEl.getBoundingClientRect();
  const toolbarWidth = toolbarRect.width || 120;
  const toolbarHeight = toolbarRect.height || 36;
  const margin = 8;

  let left = itemRight + 6;
  if(left + toolbarWidth > window.innerWidth - margin){
    left = itemLeft - toolbarWidth - 6; // 右邊放不下，改貼到圖案左側
  }
  // 圖案左右都放不下時（例如圖案偏靠螢幕中間、畫面太窄），貼左右會被強制夾回螢幕內而蓋住圖案，
  // 這種情況改貼到圖案上方/下方，才不會擋住圖案本身
  if(left < margin || left + toolbarWidth > window.innerWidth - margin){
    let top = itemBottom + 6;
    if(top + toolbarHeight > window.innerHeight - margin){
      top = itemTop - toolbarHeight - 6; // 下方放不下，改貼到圖案上方
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - toolbarHeight - margin));
    left = itemLeft + (itemRight - itemLeft) / 2 - toolbarWidth / 2; // 水平置中對齊圖案
    left = Math.max(margin, Math.min(left, window.innerWidth - toolbarWidth - margin));
    toolbarEl.style.left = left + 'px';
    toolbarEl.style.top = top + 'px';
    return;
  }

  left = Math.max(margin, Math.min(left, window.innerWidth - toolbarWidth - margin));
  let top = itemTop;
  top = Math.max(margin, Math.min(top, window.innerHeight - toolbarHeight - margin));

  toolbarEl.style.left = left + 'px';
  toolbarEl.style.top = top + 'px';
}

function positionFrameAtBBox(bbox){
  const frameEl = document.getElementById('selectionFrame');
  const topCell = bbox && cellGrid[bbox.topRow] && cellGrid[bbox.topRow][bbox.leftCol];
  const bottomCell = bbox && cellGrid[bbox.bottomRow] && cellGrid[bbox.bottomRow][bbox.rightCol];
  if(!topCell || !bottomCell){ frameEl.style.display = 'none'; return; }
  const topRect = topCell.getBoundingClientRect();
  const bottomRect = bottomCell.getBoundingClientRect();
  // 用min/max而不是直接假設topRect在視覺左上、bottomRect在視覺右下——放大檢視橫式畫布
  // 轉向90度後這個假設不成立，直接相減會算出負的寬高，畫出一條變形的殘留線條
  const left = Math.min(topRect.left, bottomRect.left);
  const top = Math.min(topRect.top, bottomRect.top);
  const right = Math.max(topRect.right, bottomRect.right);
  const bottom = Math.max(topRect.bottom, bottomRect.bottom);
  frameEl.style.display = 'block';
  frameEl.style.left = left + 'px';
  frameEl.style.top = top + 'px';
  frameEl.style.width = (right - left) + 'px';
  frameEl.style.height = (bottom - top) + 'px';
}

// 任務26：毛玻璃霧面蓋在選取範圍「外面」，只蓋在畫布區塊(藍色底)裡，不能跨到深色的側邊欄圖示選取區。
// 一般排版頁面用.canvas-area的範圍當外框；如果目前在放大檢視裡選取（放大檢視也能選取/移動圖案），
// 改用.magnify-canvas-slot的範圍，因為這時候.canvas-area雖然還在DOM裡、但畫布已經被搬進彈窗，
// 拿.canvas-area的位置會完全對不上實際看到的畫面
function getGlassOverlayContainer(){
  const magnifyOverlayEl = document.getElementById('magnifyOverlay');
  if(magnifyOverlayEl && magnifyOverlayEl.classList.contains('open')){
    return document.getElementById('magnifyCanvasSlot');
  }
  return document.querySelector('.canvas-area');
}

function positionCanvasGlassOverlay(bbox){
  const overlayEl = document.getElementById('canvasGlassOverlay');
  const topCell = bbox && cellGrid[bbox.topRow] && cellGrid[bbox.topRow][bbox.leftCol];
  const bottomCell = bbox && cellGrid[bbox.bottomRow] && cellGrid[bbox.bottomRow][bbox.rightCol];
  if(!topCell || !bottomCell){ hideCanvasGlassOverlay(); return; }
  const outerRect = getGlassOverlayContainer().getBoundingClientRect();
  const topRect = topCell.getBoundingClientRect();
  const bottomRect = bottomCell.getBoundingClientRect();
  // 跟positionFrameAtBBox一樣用min/max，不假設topRect一定是視覺左上角（放大檢視轉向後會不成立）
  const itemLeft = Math.min(topRect.left, bottomRect.left) - outerRect.left;
  const itemTop = Math.min(topRect.top, bottomRect.top) - outerRect.top;
  const itemRight = Math.max(topRect.right, bottomRect.right) - outerRect.left;
  const itemBottom = Math.max(topRect.bottom, bottomRect.bottom) - outerRect.top;
  const w = outerRect.width, h = outerRect.height;
  overlayEl.style.left = outerRect.left + 'px';
  overlayEl.style.top = outerRect.top + 'px';
  overlayEl.style.width = w + 'px';
  overlayEl.style.height = h + 'px';
  // evenodd手法：外框(整個容器) 疊上 內框(選取範圍，方向相反/共用起點)，兩個框中間的環狀區域才會被填色，
  // 內框(選取的圖案本身)維持透空、不會被模糊到
  overlayEl.style.clipPath =
    `polygon(evenodd, 0 0, ${w}px 0, ${w}px ${h}px, 0 ${h}px, 0 0, ` +
    `${itemLeft}px ${itemTop}px, ${itemLeft}px ${itemBottom}px, ${itemRight}px ${itemBottom}px, ${itemRight}px ${itemTop}px, ${itemLeft}px ${itemTop}px)`;
  overlayEl.classList.add('show');
}

function hideCanvasGlassOverlay(){
  document.getElementById('canvasGlassOverlay').classList.remove('show');
}

function hideSelectionFrame(){
  const frameEl = document.getElementById('selectionFrame');
  frameEl.style.display = 'none';
  hideCanvasGlassOverlay(); // 任務26：離開選取狀態就把霧面效果一起收掉，避免殘留到下次拖曳預覽框上
}

function positionSelectionFrame(id){
  const item = state.items[id];
  if(!item){ hideSelectionFrame(); return; }
  const bbox = getItemGridBBox(item);
  positionFrameAtBBox(bbox);
  // 任務26：只有「選取狀態」（這個函式）才顯示毛玻璃霧面，拖曳中顯示新位置的框
  // 是直接呼叫上面共用的positionFrameAtBBox（不經過這裡），畫面才能保持乾淨無干擾
  positionCanvasGlassOverlay(bbox);
}

function buildGrid(resetItems = true){
  const size = paperSizes[state.paper];
  let w = size.w, h = size.h;
  if(state.orientation==="Landscape"){ [w,h] = [h,w]; }

  const cols = Math.max(1, Math.round(w/state.gridMm));
  const rows = Math.max(1, Math.round(h/state.gridMm));
  const cellPx = CELL_PX;

  stitchGridEl.style.gridTemplateColumns = `repeat(${cols}, ${cellPx}px)`;
  stitchGridEl.style.gridTemplateRows = `repeat(${rows}, ${cellPx}px)`;
  stitchGridEl.innerHTML = "";

  if(resetItems){
    state.items = {};
    state.nextItemId = 1;
  }
  previewCells = [];
  deselectItem();


  gridRows = rows;
  gridCols = cols;
  cellGrid = [];

  for(let r=0; r<rows; r++){
  cellGrid[r] = [];
  for(let c=0; c<cols; c++){
    const cell = document.createElement("div");
    cell.className = "cell";
    if((c+1) % 5 === 0) cell.classList.add("grid-major-right");
    if((r+1) % 5 === 0) cell.classList.add("grid-major-bottom");
    cell.style.width = cellPx+"px";
    cell.style.height = cellPx+"px";
    cell.dataset.r = r;
    cell.dataset.c = c;
    cellGrid[r][c] = cell;

  cell.onclick = () => {
  const occupantId = cell.dataset.itemId;
  if(state.eraserMode){
    if(occupantId){ pushUndo(); eraseCellFromItem(occupantId, r, c); }
    clearPreview();
    return;
  }
  if(state.paintMode){
    if(!occupantId){ pushUndo(); placeItem(PAINT_DOT_GLYPH, r, c); }
    clearPreview();
    return;
  }
  if(occupantId){
    return; // 已放置的圖案改由 mousedown/touchstart 處理選取與拖曳
  }
  clearPreview();
  if(!state.selectedGlyph){
    deselectItem();
    return;
  }
  const { originR, originC } = getCenteredOrigin(state.selectedGlyph, r, c);
  const bitmap = getGlyphBitmap(state.selectedGlyph);
  if(!isBitmapWithinBounds(originR, originC, bitmap)){
    return; // 超出畫布邊界，不允許蓋章
  }
  deselectItem();
  pushUndo();
  placeItem(state.selectedGlyph, originR, originC);
  state.selectedGlyph = null;
  renderIcons();
};

  cell.onmousedown = (e) => {
    const occupantId = cell.dataset.itemId;
    if(state.eraserMode){
      e.preventDefault();
      if(occupantId){ pushUndo(); eraseCellFromItem(occupantId, r, c); }
      startEraseDrag(false);
      return;
    }
    if(state.paintMode){
      e.preventDefault();
      if(!occupantId){ pushUndo(); placeItem(PAINT_DOT_GLYPH, r, c); }
      startPaintDrag(false);
      return;
    }
    if(!occupantId) return;
    e.preventDefault();
    pushUndo();
    startItemDrag(occupantId, e.clientX, e.clientY, false);
  };
  cell.addEventListener('touchstart', (e) => {
    if(e.touches.length > 1) return; // 雙指觸控是縮放手勢，不要當成拖曳圖案
    const occupantId = cell.dataset.itemId;
    if(state.eraserMode){
      if(occupantId){ pushUndo(); eraseCellFromItem(occupantId, r, c); }
      startEraseDrag(true);
      return;
    }
    if(state.paintMode){
      if(!occupantId){ pushUndo(); placeItem(PAINT_DOT_GLYPH, r, c); }
      startPaintDrag(true);
      return;
    }
    if(!occupantId) return;
    const touch = e.touches[0];
    if(!touch) return;
    pushUndo();
    startItemDrag(occupantId, touch.clientX, touch.clientY, true);
  }, {passive:true});

    stitchGridEl.appendChild(cell);
  }
}
  paintAll(); // 重新畫上（換紙張尺寸/方向時）保留下來的圖案
  zoom = computeFitZoom(); // 每次換紙張尺寸/方向/格數，都重新算一次能完整顯示畫布的縮放比例
  applyZoom();
  updateCurrentPriceLabel(); // 紙張或方向只要有一個變動就會呼叫buildGrid，這裡統一更新不用個別呼叫端各自記得呼叫
  scheduleAutosave();
}

// 選取框是用 position:fixed 定位，捲動或縮放畫布時要重新計算位置
const gridWrapperEl = document.querySelector('.grid-wrapper');
function refreshSelectionUI(){
  if(!state.selectedItemId) return;
  positionToolbar(state.selectedItemId);
  positionSelectionFrame(state.selectedItemId);
}

// 微調位置：把整個圖案往上/下/左/右移動一格，方便大圖案不用整個重新拖曳
function nudgeItem(id, dr, dc){
  const item = state.items[id];
  if(!item) return;
  const newR = item.r + dr, newC = item.c + dc;
  const bitmap = getItemBitmap(item);
  if(!isBitmapWithinBounds(newR, newC, bitmap)) return; // 移出畫布邊界就不動作
  item.r = newR;
  item.c = newC;
  paintAll();
  positionToolbar(id);
  positionSelectionFrame(id);
  scheduleAutosave();
}

let zoom = 1;
const zoomLabel = document.getElementById("zoomLabel");
const CANVAS_FIT_MARGIN = 16; // 可視區域左右各留的安全邊距(px)
const MIN_ZOOM = 0.15; // 手動 -/+ 縮放的下限，放寬到能容納 A3 橫式在窄螢幕手機也能縮到完整顯示
const MAX_ZOOM = 1;

// 依照畫布目前的實際格數(gridCols)，算出一個能讓畫布寬度完整塞進可視區域的縮放比例，
// 讓手機版切換到格數較多的尺寸（例如 A3 橫式）時，不用使用者自己手動縮小就能看到全貌。
function computeFitZoom(){
  const naturalWidth = gridCols * CELL_PX;
  const naturalHeight = gridRows * CELL_PX;
  if(naturalWidth <= 0) return MAX_ZOOM;
  // 用 grid-wrapper 目前實際所在的容器寬度來算，而不是寫死 canvasAreaEl，
  // 這樣「放大檢視」把畫布搬進彈窗時，也能照彈窗的寬度重新計算縮放比例
  const availWidth = gridWrapperEl.parentElement.clientWidth - CANVAS_FIT_MARGIN * 2;
  // 任務23：橫式畫布在放大檢視裡轉向90度後，畫布的寬對應到容器的高、畫布的高對應到容器的寬，
  // 兩個方向都要能塞下（取較小值），才能讓轉向後的畫布完整顯示、不用捲動就佔滿手機螢幕長邊
  if(gridWrapperEl.classList.contains("rotated")){
    const availHeight = gridWrapperEl.parentElement.clientHeight - CANVAS_FIT_MARGIN * 2;
    const fit = Math.min(availHeight / naturalWidth, availWidth / naturalHeight);
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit));
  }
  const fit = availWidth / naturalWidth;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit));
}

function applyZoom(){
  stitchGridEl.style.transform = `scale(${zoom})`;
  stitchGridEl.style.transformOrigin = "top left";
  zoomLabel.textContent = Math.round(zoom * 100) + "%";
  updateGridWrapperSize();
  refreshSelectionUI();
  updateCanvasFitBadge();
}

// 畫布是否完整顯示（不用捲動就能看到全部）：比較 grid-wrapper 實際內容大小跟目前可視框大小，
// 完整顯示才出現小提示，沒出現代表目前有裁切，擺放圖案時要注意可能超出可視範圍
function updateCanvasFitBadge(){
  // 轉向時 grid-wrapper 本身改成 overflow:visible（捲動交給外層.magnify-canvas-slot負責，
  // 見css.grid-wrapper.rotated的註解），所以「是否完整顯示」要改看外層容器的捲動狀態
  const measureEl = gridWrapperEl.classList.contains("rotated") ? gridWrapperEl.parentElement : gridWrapperEl;
  const fullyVisible = measureEl.scrollWidth <= measureEl.clientWidth + 1 &&
                        measureEl.scrollHeight <= measureEl.clientHeight + 1;
  // 一般畫布跟放大檢視各有自己的一份提示（放大檢視開啟時畫布會搬進去，
  // 兩者不會同時顯示，但兩個都要跟著同一個判斷結果切換）
  ["canvasFitBadge", "canvasFitBadgeMagnify"].forEach(elId=>{
    const badge = document.getElementById(elId);
    if(badge) badge.classList.toggle("show", fullyVisible);
  });
  positionCanvasFitBadge();
}

// 貼著畫布外側邊緣，完全不蓋到畫布本身，像布標籤縫在邊邊上。
// 桌面版貼在畫布下緣靠右；手機版（螢幕較窄，下面通常沒有太多版面可以再放東西）鎖定在畫布左側正中間。
// 用 offsetLeft/offsetTop（相對於最近的定位祖先.canvas-area或.magnify-inner）而不是
// getBoundingClientRect()，這樣搭配CSS的position:absolute，捲動頁面時會自然跟著版面捲動，
// 不需要額外監聽scroll事件重算位置，才不會有跟不上、視覺上滑動的落差感
function positionCanvasFitBadge(){
  const isMobile = window.innerWidth <= 900;
  ["canvasFitBadge", "canvasFitBadgeMagnify"].forEach(elId=>{
    const badge = document.getElementById(elId);
    if(!badge) return;
    badge.classList.toggle("badge-side", isMobile);
    if(isMobile){
      const badgeWidth = badge.offsetWidth || 28;
      badge.style.top = (gridWrapperEl.offsetTop + gridWrapperEl.offsetHeight/2) + "px";
      // 放大檢視裡橫式畫布轉向後，畫布左側可能只剩很窄的留白（不夠放下標籤寬度），
      // 這裡夾住不讓它變成負值，避免被彈窗的overflow:hidden裁掉、標籤消失看不到
      badge.style.left = Math.max(0, gridWrapperEl.offsetLeft - badgeWidth) + "px";
    } else {
      const badgeWidth = badge.offsetWidth || 112;
      badge.style.top = (gridWrapperEl.offsetTop + gridWrapperEl.offsetHeight) + "px"; // 緊貼畫布下緣，完全不重疊
      badge.style.left = (gridWrapperEl.offsetLeft + gridWrapperEl.offsetWidth - badgeWidth - 16) + "px";
    }
  });
}

// transform:scale 只會讓格線視覺上縮放，格線本身的版面大小（也就是可捲動範圍）不會跟著變小，
// 所以中間加一層 zoom-viewport，明確設定成縮放後的實際大小並裁切超出範圍的內容，
// 外層 .grid-wrapper（inline-block）就會自動貼齊這層 viewport 的大小，不會多出空白可捲動。
function updateGridWrapperSize(){
  // 四捨五入成整數px：轉向時#zoomViewport靠(-50%,-50%)置中，如果寬高是小數，換算出來的
  // 置中位移也會是小數，導致旋轉後的內容沒有對齊到整數像素格線，瀏覽器會做次像素模糊處理，
  // 視覺上看起來就像整個畫布蒙上一層灰、對比度變低（手機Safari上特別明顯）
  const w = Math.round(gridCols * CELL_PX * zoom);
  const h = Math.round(gridRows * CELL_PX * zoom);
  zoomViewportEl.style.width = w + "px";
  zoomViewportEl.style.height = h + "px";
  // 任務23：轉向時 #zoomViewport 靠CSS轉90度置中撐滿，但它本身脫離了正常版面流（position:absolute），
  // 外層.grid-wrapper不會自動撐出正確尺寸，所以這裡手動把grid-wrapper設成「轉向後」的寬高（寬高互換），
  // 這樣.magnify-canvas-slot（overflow:auto）才能量到正確的、跟畫面看起來一致的捲動範圍
  if(gridWrapperEl.classList.contains("rotated")){
    gridWrapperEl.style.width = h + "px";
    gridWrapperEl.style.height = w + "px";
    // #zoomViewport轉90度後自己的視覺中心不會因為旋轉而移動，所以只要讓它「旋轉前」的中心
    // 對齊grid-wrapper（已經是轉向後的h×w）的中心即可，兩式相減算出對齊需要的left/top，
    // 全部四捨五入成整數px，避免次像素模糊（見上面updateGridWrapperSize開頭的說明）
    zoomViewportEl.style.left = Math.round((h - w) / 2) + "px";
    zoomViewportEl.style.top = Math.round((w - h) / 2) + "px";
  } else {
    gridWrapperEl.style.width = "";
    gridWrapperEl.style.height = "";
    zoomViewportEl.style.left = "";
    zoomViewportEl.style.top = "";
  }
}

// 手機雙指觸控縮放畫布
let pinchState = null; // {startDistance, startZoom}
function touchDistance(t1, t2){
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}
