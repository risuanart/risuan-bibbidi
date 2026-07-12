// main.js —— 把前面所有檔案定義好的資料/函式「接上」實際的按鈕與事件，並執行最初的初始化。
// 這個檔案務必最後載入：它假設 data/state/bitmap/canvas/ui/save 都已經準備好了。

stitchGridEl.addEventListener('mousemove', (e)=>{
  if(dragState) return; // 拖曳中的預覽由 onDragMouseMove 處理
  const pos = getCellFromPoint(e.clientX, e.clientY);
  if(state.eraserMode){
    if(!pos){ clearPreview(); return; }
    showErasePreviewAt(pos.r, pos.c);
    return;
  }
  if(!state.selectedGlyph){ clearPreview(); return; }
  if(!pos){ clearPreview(); return; }
  showPreviewAt(pos.r, pos.c);
});
stitchGridEl.addEventListener('mouseleave', ()=>{ if(!dragState) clearPreview(); });

stitchGridEl.addEventListener('touchmove', (e)=>{
  if(e.touches.length > 1) return; // 雙指觸控是縮放手勢，交給 pinch 處理
  if(dragState) return; // 拖曳中的預覽由 onDragTouchMove 處理
  const touch = e.touches[0];
  if(!touch) return;
  if(state.eraserMode){
    const pos = getCellFromPoint(touch.clientX, touch.clientY);
    if(pos){
      e.preventDefault();
      showErasePreviewAt(pos.r, pos.c);
    }
    return;
  }
  if(!state.selectedGlyph) return;
  const pos = getCellFromPoint(touch.clientX, touch.clientY);
  if(pos){
    e.preventDefault();
    showPreviewAt(pos.r, pos.c);
  }
}, {passive:false});
stitchGridEl.addEventListener('touchend', ()=>{ if(!dragState) clearPreview(); }, {passive:true});

gridWrapperEl.addEventListener('scroll', refreshSelectionUI);
document.querySelector('.canvas-area').addEventListener('scroll', refreshSelectionUI);
window.addEventListener('resize', refreshSelectionUI);
window.addEventListener('resize', positionAllSegmentedSliders);

document.getElementById("flipHBtn").onclick = (e)=>{
  e.stopPropagation();
  const id = state.selectedItemId;
  if(!id) return;
  state.items[id].flipH = !state.items[id].flipH;
  paintAll();
  positionToolbar(id);
  positionSelectionFrame(id);
  scheduleAutosave();
};
document.getElementById("flipVBtn").onclick = (e)=>{
  e.stopPropagation();
  const id = state.selectedItemId;
  if(!id) return;
  state.items[id].flipV = !state.items[id].flipV;
  paintAll();
  positionToolbar(id);
  positionSelectionFrame(id);
  scheduleAutosave();
};
document.getElementById("deleteItemBtn").onclick = (e)=>{
  e.stopPropagation();
  const id = state.selectedItemId;
  if(!id) return;
  deleteItem(id);
};
document.getElementById("resizeItemBtn").onclick = (e)=>{
  e.stopPropagation();
  const id = state.selectedItemId;
  if(!id) return;
  const item = state.items[id];
  if(!item) return;
  const source = getResizeSourceForItem(item);
  if(!source) return;
  openResPicker(source, "adjust", id, getGlyphSize(item.glyph));
};

function bindNudgeBtn(btnId, dr, dc){
  document.getElementById(btnId).onclick = (e)=>{
    e.stopPropagation();
    const id = state.selectedItemId;
    if(!id) return;
    nudgeItem(id, dr, dc);
  };
}
bindNudgeBtn("nudgeUpBtn", -1, 0);
bindNudgeBtn("nudgeDownBtn", 1, 0);
bindNudgeBtn("nudgeLeftBtn", 0, -1);
bindNudgeBtn("nudgeRightBtn", 0, 1);

// 選取圖案時也能直接用鍵盤方向鍵微調位置
document.addEventListener("keydown", (e)=>{
  if(!state.selectedItemId) return;
  const tag = (e.target && e.target.tagName || "").toLowerCase();
  if(tag === "input" || tag === "select" || tag === "textarea") return; // 避免跟輸入欄位的游標移動衝突
  const deltas = { ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1] };
  const delta = deltas[e.key];
  if(!delta) return;
  e.preventDefault();
  nudgeItem(state.selectedItemId, delta[0], delta[1]);
});

document.getElementById("resSlider").addEventListener("input", updateResPreview);
document.getElementById("resConfirmBtn").onclick = confirmResPicker;
document.getElementById("resPickerCloseBtn").onclick = closeResPicker;
document.getElementById("resPickerOverlay").onclick = (e)=>{
  if(e.target.id === "resPickerOverlay") closeResPicker();
};

document.getElementById("zoomInBtn").onclick = ()=>{
  zoom = Math.min(zoom + 0.1, MAX_ZOOM);
  applyZoom();
};

document.getElementById("zoomOutBtn").onclick = ()=>{
  zoom = Math.max(zoom - 0.1, MIN_ZOOM);
  applyZoom();
};

// 手機雙指觸控縮放畫布
gridWrapperEl.addEventListener('touchstart', (e)=>{
  if(e.touches.length === 2){
    pinchState = {
      startDistance: touchDistance(e.touches[0], e.touches[1]),
      startZoom: zoom
    };
  }
}, {passive:true});
gridWrapperEl.addEventListener('touchmove', (e)=>{
  if(e.touches.length === 2 && pinchState){
    e.preventDefault(); // 避免觸發手機瀏覽器自己的整頁縮放
    const newDistance = touchDistance(e.touches[0], e.touches[1]);
    const scaleFactor = newDistance / pinchState.startDistance;
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchState.startZoom * scaleFactor));
    applyZoom();
  }
}, {passive:false});
gridWrapperEl.addEventListener('touchend', (e)=>{
  if(e.touches.length < 2) pinchState = null;
}, {passive:true});
gridWrapperEl.addEventListener('touchcancel', ()=>{ pinchState = null; }, {passive:true});

document.getElementById("eraserBtn").onclick = ()=>{
  state.eraserMode = !state.eraserMode;
  document.getElementById("eraserBtn").classList.toggle("eraser-active", state.eraserMode);
  gridWrapperEl.classList.toggle("eraser-mode", state.eraserMode);
  clearPreview();
  if(state.eraserMode){
    state.selectedGlyph = null;
    deselectItem();
    renderIcons();
  }
};

document.getElementById("clearBtn").onclick = ()=>{
  openConfirmClear();
};
document.getElementById("confirmClearCancelBtn").onclick = closeConfirmClear;
document.getElementById("confirmClearOkBtn").onclick = ()=>{
  closeConfirmClear();
  buildGrid();
};
document.getElementById("confirmClearOverlay").onclick = (e)=>{
  if(e.target.id === "confirmClearOverlay") closeConfirmClear(); // 點背景霧面等同取消
};

document.getElementById("hangulWarnEditBtn").onclick = closeHangulWarn;
document.getElementById("hangulWarnUseBtn").onclick = ()=>{
  if(pendingHangulComposed) selectHangulGlyph(pendingHangulComposed);
  closeHangulWarn();
};
document.getElementById("hangulWarnOverlay").onclick = (e)=>{
  if(e.target.id === "hangulWarnOverlay") closeHangulWarn(); // 點背景霧面等同「修改」
};

document.getElementById("exportBtn").onclick = openExportForm;
document.getElementById("exportFormCancelBtn").onclick = closeExportForm;
document.getElementById("exportFormOverlay").onclick = (e)=>{
  if(e.target.id === "exportFormOverlay") closeExportForm(); // 點背景霧面等同取消
};
document.getElementById("exportFormConfirmBtn").onclick = ()=>{
  if(!validateExportFields()) return; // 保底檢查，正常情況下欄位沒填完按鈕本來就是 disabled
  closeExportForm();
  exportCanvasAsPng();
};

document.getElementById("joinLineBtn").href = STUDIO_LINE_URL;
document.getElementById("exportDoneCloseBtn").onclick = closeExportDone;
document.getElementById("exportDoneOverlay").onclick = (e)=>{
  if(e.target.id === "exportDoneOverlay") closeExportDone(); // 點背景霧面也可以關閉
};

document.getElementById("tabsToggle").onclick = toggleTabsDropdown;
document.addEventListener("click", (e)=>{
  const wrap = document.getElementById("tabsWrap");
  if(!wrap.contains(e.target)) closeTabsDropdown(); // 點選單以外的地方也收合
});

document.querySelector(".help-btn").onclick = openHelp;
document.getElementById("helpCloseBtn").onclick = closeHelp;
document.getElementById("helpOverlay").onclick = (e)=>{
  if(e.target.id === "helpOverlay") closeHelp(); // 點背景霧面也可以關閉
};
document.getElementById("helpPrevBtn").onclick = ()=>{
  if(helpStepIndex > 0){ helpStepIndex--; renderHelpStep(); }
};
document.getElementById("helpNextBtn").onclick = ()=>{
  if(helpStepIndex < helpSteps.length - 1){
    helpStepIndex++;
    renderHelpStep();
  } else {
    closeHelp(); // 最後一步按下去就直接關閉
  }
};

document.getElementById("imageUploadInput").addEventListener("change", (e)=>{
  const file = e.target.files && e.target.files[0];
  handleImageUpload(file);
  e.target.value = ""; // 清空，允許重複選同一個檔案再上傳一次
});

// 日期／時段／姓名填寫後，清除對應欄位的紅字提醒，並一併存檔
["exportDate","exportTime","exportName","exportLineName","exportOperator"].forEach(id=>{
  const el = document.getElementById(id);
  const handler = ()=>{
    const hasValue = (id==="exportName" || id==="exportLineName") ? el.value.trim() : el.value;
    if(hasValue) el.classList.remove("missing");
    updateExportFormConfirmState();
    scheduleAutosave();
  };
  el.addEventListener("input", handler);
  el.addEventListener("change", handler);
});

// 離開頁面前，確保還沒存到 localStorage 的最新變動也存進去（避免剛好卡在 debounce 期間就關閉分頁）
window.addEventListener("beforeunload", saveToStorage);
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState === "hidden") saveToStorage();
});

// Allura／Noto Sans JP／Noto Sans KR 都是透過網路載入的，字型就緒前畫出來的點陣圖會先用備用字體。
// 字型載入完成後，清掉對應的快取並重新畫一次，讓正確的字型生效。
if (document.fonts && document.fonts.load){
  Promise.all([
    document.fonts.load(`20px "Allura"`),
    document.fonts.load(`20px "Noto Sans JP"`),
    document.fonts.load(`20px "Noto Sans KR"`),
    document.fonts.load(`20px "LXGW WenKai TC"`)
  ]).then(()=>{
    Object.keys(bitmapCache).forEach(key=>{
      if (key.endsWith('@script') || key.endsWith('@jp') || key.endsWith('@kr')) delete bitmapCache[key];
    });
    renderIcons();
    paintAll();
    positionAllSegmentedSliders();
  }).catch(()=>{});
}

// 初始化：先嘗試從瀏覽器裡讀取上次的存檔，讀到就接續編輯，讀不到才從全新畫布開始
const restoredFromSave = tryRestoreFromStorage();
renderTabs();
renderIcons();
renderSizeOptions();
renderOrientation();
initHangulComposer();
buildGrid(!restoredFromSave);

// ---- 簡介頁（首頁）↔ 排版頁 切換：同一個網頁內用顯示/隱藏切換，避免整頁 reload 閃爍 ----
// 排版頁在還沒點「開始」前是 hidden 狀態，量到的寬度都會是 0，
// 所以顯示出來的當下要重新跑一次 buildGrid() 把縮放比例、版面都重新算一次。
const introScreenEl = document.getElementById("introScreen");
const appScreenEl = document.getElementById("appScreen");

function showLayoutScreen(pushHistory){
  introScreenEl.style.display = "none";
  appScreenEl.hidden = false;
  buildGrid(false);
  positionAllSegmentedSliders();
  if(pushHistory) history.pushState({ screen: "layout" }, "", "#layout");
}
function showIntroScreen(){
  appScreenEl.hidden = true;
  introScreenEl.style.display = "flex";
}

document.getElementById("introStartBtn").onclick = ()=> showLayoutScreen(true);

window.addEventListener("popstate", (e)=>{
  if(e.state && e.state.screen === "layout") showLayoutScreen(false);
  else showIntroScreen();
});

// 一律先從簡介頁開始，並把這個狀態記錄進瀏覽器歷史堆疊，這樣使用者按上一頁才有地方可以回
history.replaceState({ screen: "intro" }, "", location.pathname + location.search);

// ---- 任務19方向B：手機版「放大檢視」----
// 把選圖案面板（.sidebar）跟畫布相關元素直接搬進彈窗（不是複製一份新的），
// 操作的還是同一份DOM/同一個state，關閉時搬回原本位置，不會有彈窗內外資料兜不起來的問題。
const magnifyBtnEl = document.getElementById("magnifyBtn");
const magnifyCloseBtnEl = document.getElementById("magnifyCloseBtn");
const magnifyOverlayEl = document.getElementById("magnifyOverlay");
const magnifyPanelSlotEl = document.getElementById("magnifyPanelSlot");
const magnifyToolsSlotEl = document.getElementById("magnifyToolsSlot");
const magnifyCanvasSlotEl = document.getElementById("magnifyCanvasSlot");

const sidebarEl = document.querySelector(".sidebar");
const appEl = document.querySelector(".app");
const canvasAreaEl = document.querySelector(".canvas-area");
const orientationRowEl = document.getElementById("orientationRow");
const zoomControlEl = document.querySelector(".zoom-control");
const eraserBtnEl = document.getElementById("eraserBtn");
const clearBtnEl = document.getElementById("clearBtn");
const exportBtnEl = document.getElementById("exportBtn");

function openMagnify(){
  magnifyPanelSlotEl.appendChild(sidebarEl);
  magnifyToolsSlotEl.appendChild(zoomControlEl);
  magnifyToolsSlotEl.appendChild(eraserBtnEl);
  magnifyToolsSlotEl.appendChild(clearBtnEl);
  magnifyCanvasSlotEl.appendChild(gridWrapperEl);
  magnifyOverlayEl.classList.add("open");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(()=>{
    zoom = computeFitZoom();
    applyZoom();
  });
}

function closeMagnify(){
  appEl.insertBefore(sidebarEl, canvasAreaEl); // 面板搬回畫布區前面，恢復原本左右並排的順序
  orientationRowEl.appendChild(zoomControlEl); // 縮放控制搬回尺寸/方向那一列的最後面
  exportBtnEl.parentElement.insertBefore(eraserBtnEl, exportBtnEl); // 單格去除、清空畫布搬回輸出圖檔按鈕前面，維持原本順序
  exportBtnEl.parentElement.insertBefore(clearBtnEl, exportBtnEl);
  canvasAreaEl.appendChild(gridWrapperEl); // 畫布搬回畫布區最後面
  magnifyOverlayEl.classList.remove("open");
  document.body.style.overflow = "";
  requestAnimationFrame(()=>{
    zoom = computeFitZoom();
    applyZoom();
  });
}

magnifyBtnEl.onclick = openMagnify;
magnifyCloseBtnEl.onclick = closeMagnify;
magnifyOverlayEl.addEventListener("click", (e)=>{
  if(e.target.id === "magnifyOverlay") closeMagnify(); // 點背景霧面等同關閉
});
