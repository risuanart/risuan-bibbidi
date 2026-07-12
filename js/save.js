// save.js —— 存檔／讀取：讓使用者編輯到一半也能離開瀏覽器，回來時自動接續上次的畫布。
// 存在瀏覽器的 localStorage，僅限同一台裝置、同一個瀏覽器；沒有雲端同步。

const SAVE_KEY = "rixuan-simulator-save-v1";
let autosaveTimer = null;

function scheduleAutosave(){
  if(autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveToStorage, 400);
}

// 只存目前實際還在使用的自訂圖片/字元點陣圖（分類清單裡的、或已放上畫布的），避免調整過多次解析度後留下的暫存資料越存越大
function getReferencedCustomIds(){
  const ids = new Set();
  categories["上傳圖片"].forEach(cid => ids.add(cid));
  Object.values(state.items).forEach(item => { if(isCustomGlyph(item.glyph)) ids.add(item.glyph); });
  return ids;
}

function serializeState(){
  const itemsOut = {};
  Object.keys(state.items).forEach(id=>{
    const item = state.items[id];
    itemsOut[id] = { glyph:item.glyph, r:item.r, c:item.c, flipH:item.flipH, flipV:item.flipV };
    if(item.holes && item.holes.size) itemsOut[id].holes = Array.from(item.holes);
  });

  const referencedIds = getReferencedCustomIds();
  const customBitmapsOut = {}, customSourcesOut = {};
  referencedIds.forEach(cid=>{
    if(customBitmaps[cid]) customBitmapsOut[cid] = customBitmaps[cid];
    const src = customSources[cid];
    if(!src) return;
    customSourcesOut[cid] = src.type === "image" ? { type:"image", dataUrl: src.img.src } : { type:"char", ch: src.ch };
  });

  return {
    version: 1,
    paper: state.paper,
    orientation: state.orientation,
    gridMm: state.gridMm,
    nextItemId: state.nextItemId,
    nextCustomId,
    uploadedIds: categories["上傳圖片"].slice(),
    items: itemsOut,
    customBitmaps: customBitmapsOut,
    customSources: customSourcesOut,
    exportDate: document.getElementById("exportDate").value,
    exportTime: document.getElementById("exportTime").value,
    exportName: document.getElementById("exportName").value,
    exportOperator: document.getElementById("exportOperator").value
  };
}

function saveToStorage(){
  try{
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializeState()));
  }catch(e){
    console.warn("自動存檔失敗（可能是瀏覽器儲存空間已滿）：", e);
  }
}

// 把存檔內容套回目前的資料結構；只負責還原資料本身，畫面渲染交給呼叫端統一處理
function restoreState(saved){
  nextCustomId = saved.nextCustomId || 1;
  categories["上傳圖片"] = saved.uploadedIds || [];

  Object.keys(saved.customBitmaps || {}).forEach(cid=>{ customBitmaps[cid] = saved.customBitmaps[cid]; });
  Object.keys(saved.customSources || {}).forEach(cid=>{
    const src = saved.customSources[cid];
    if(src.type === "image"){
      const img = new Image();
      img.src = src.dataUrl;
      customImages[cid] = img;
      customSources[cid] = { type:"image", img };
    } else {
      customSources[cid] = { type:"char", ch: src.ch };
    }
  });

  state.paper = saved.paper || state.paper;
  state.orientation = saved.orientation || state.orientation;
  state.gridMm = saved.gridMm || state.gridMm;
  state.nextItemId = saved.nextItemId || 1;
  state.items = {};
  Object.keys(saved.items || {}).forEach(id=>{
    const it = saved.items[id];
    const restored = { glyph:it.glyph, r:it.r, c:it.c, flipH:!!it.flipH, flipV:!!it.flipV };
    if(it.holes && it.holes.length) restored.holes = new Set(it.holes);
    state.items[id] = restored;
  });

  if(saved.exportDate) document.getElementById("exportDate").value = saved.exportDate;
  if(saved.exportTime) document.getElementById("exportTime").value = saved.exportTime;
  if(saved.exportName) document.getElementById("exportName").value = saved.exportName;
  if(saved.exportOperator) document.getElementById("exportOperator").value = saved.exportOperator;
}

function tryRestoreFromStorage(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return false;
    const saved = JSON.parse(raw);
    restoreState(saved);
    return true;
  }catch(e){
    console.warn("讀取上次存檔失敗，改用全新畫布：", e);
    return false;
  }
}
