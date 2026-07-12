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

function clearDragOriginGhost(){
  dragOriginCells.forEach(cell => {
    cell.style.background = cell.dataset.itemId ? "var(--sidebar-bg)" : "";
  });
  dragOriginCells = [];
}

// 開始拖曳時，把該圖案原本佔用的格子改成半透明，當作「原始位置」的預覽提示
function beginDragVisuals(id){
  deselectItem();
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
      // 跳過已經是「原始位置」半透明提示的格子，避免之後 clearPreview() 誤把它們恢復成深色
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
    beginDragVisuals(dragState.id);
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
    clearDragOriginGhost();
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
  document.getElementById('selectionFrame').style.display = 'none';
}

function positionToolbar(id){
  const item = state.items[id];
  const toolbarEl = document.getElementById('itemToolbar');
  if(!item){ deselectItem(); return; }
  const bbox = getItemGridBBox(item);
  if(!bbox){ deselectItem(); return; }
  const anchorCell = (cellGrid[bbox.topRow] && cellGrid[bbox.topRow][bbox.rightCol]) || (cellGrid[item.r] && cellGrid[item.r][item.c]);
  if(!anchorCell){ deselectItem(); return; }
  const cRect = anchorCell.getBoundingClientRect();
  toolbarEl.style.display = 'flex';

  // 用視窗座標定位（跟選取框一樣），並確保工具列一定落在畫面可見範圍內，
  // 避免圖案太大或太靠邊時，翻轉/刪除按鍵被卡在捲軸外點不到
  const toolbarRect = toolbarEl.getBoundingClientRect();
  const toolbarWidth = toolbarRect.width || 120;
  const toolbarHeight = toolbarRect.height || 36;
  const margin = 8;

  let left = cRect.right + 6;
  if(left + toolbarWidth > window.innerWidth - margin){
    left = cRect.left - toolbarWidth - 6; // 右邊放不下，改貼到圖案左側
  }
  left = Math.max(margin, Math.min(left, window.innerWidth - toolbarWidth - margin));

  let top = cRect.top;
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
  frameEl.style.display = 'block';
  frameEl.style.left = topRect.left + 'px';
  frameEl.style.top = topRect.top + 'px';
  frameEl.style.width = (bottomRect.right - topRect.left) + 'px';
  frameEl.style.height = (bottomRect.bottom - topRect.top) + 'px';
}

function hideSelectionFrame(){
  document.getElementById('selectionFrame').style.display = 'none';
}

function positionSelectionFrame(id){
  const item = state.items[id];
  if(!item){ hideSelectionFrame(); return; }
  const bbox = getItemGridBBox(item);
  positionFrameAtBBox(bbox);
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
    if(occupantId) eraseCellFromItem(occupantId, r, c);
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
  placeItem(state.selectedGlyph, originR, originC);
  state.selectedGlyph = null;
  renderIcons();
};

  cell.onmousedown = (e) => {
    const occupantId = cell.dataset.itemId;
    if(state.eraserMode){
      e.preventDefault();
      if(occupantId) eraseCellFromItem(occupantId, r, c);
      startEraseDrag(false);
      return;
    }
    if(!occupantId) return;
    e.preventDefault();
    startItemDrag(occupantId, e.clientX, e.clientY, false);
  };
  cell.addEventListener('touchstart', (e) => {
    if(e.touches.length > 1) return; // 雙指觸控是縮放手勢，不要當成拖曳圖案
    const occupantId = cell.dataset.itemId;
    if(state.eraserMode){
      if(occupantId) eraseCellFromItem(occupantId, r, c);
      startEraseDrag(true);
      return;
    }
    if(!occupantId) return;
    const touch = e.touches[0];
    if(!touch) return;
    startItemDrag(occupantId, touch.clientX, touch.clientY, true);
  }, {passive:true});

    stitchGridEl.appendChild(cell);
  }
}
  paintAll(); // 重新畫上（換紙張尺寸/方向時）保留下來的圖案
  zoom = computeFitZoom(); // 每次換紙張尺寸/方向/格數，都重新算一次能完整顯示畫布的縮放比例
  applyZoom();
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
  if(naturalWidth <= 0) return MAX_ZOOM;
  // 用 grid-wrapper 目前實際所在的容器寬度來算，而不是寫死 canvasAreaEl，
  // 這樣「放大檢視」把畫布搬進彈窗時，也能照彈窗的寬度重新計算縮放比例
  const availWidth = gridWrapperEl.parentElement.clientWidth - CANVAS_FIT_MARGIN * 2;
  const fit = availWidth / naturalWidth;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit));
}

function applyZoom(){
  stitchGridEl.style.transform = `scale(${zoom})`;
  stitchGridEl.style.transformOrigin = "top left";
  zoomLabel.textContent = Math.round(zoom * 100) + "%";
  updateGridWrapperSize();
  refreshSelectionUI();
}

// transform:scale 只會讓格線視覺上縮放，格線本身的版面大小（也就是可捲動範圍）不會跟著變小，
// 所以中間加一層 zoom-viewport，明確設定成縮放後的實際大小並裁切超出範圍的內容，
// 外層 .grid-wrapper（inline-block）就會自動貼齊這層 viewport 的大小，不會多出空白可捲動。
function updateGridWrapperSize(){
  zoomViewportEl.style.width = (gridCols * CELL_PX * zoom) + "px";
  zoomViewportEl.style.height = (gridRows * CELL_PX * zoom) + "px";
}

// 手機雙指觸控縮放畫布
let pinchState = null; // {startDistance, startZoom}
function touchDistance(t1, t2){
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}
