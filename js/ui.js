// ui.js —— 畫面渲染：分類頁籤、圖案清單、紙張/方向切換、韓文組字工具、使用說明彈窗、輸出圖檔。

const tabsEl = document.getElementById("tabs");
const iconGridEl = document.getElementById("iconGrid");
const sizeOptionsEl = document.getElementById("sizeOptions");
const orientationEl = document.getElementById("orientationOptions");
const gridOptionsEl = document.getElementById("gridOptions");

function renderTabs(){
  tabsEl.innerHTML = "";
  Object.keys(categories).forEach(cat=>{
    const b = document.createElement("button");
    b.className = "tab" + (cat===state.category ? " active": "");
    b.textContent = cat;
    b.onclick = ()=>{ state.category = cat; renderTabs(); renderIcons(); closeTabsDropdown(); };
    tabsEl.appendChild(b);
  });
  document.getElementById("hangulComposer").style.display = (state.category === "韓文") ? "block" : "none";
  document.getElementById("tabsToggleLabel").textContent = `分類：${state.category}`;
}

// ---- 手機版分類收合選單：收合鈕貼在標題右側，預設收合，點擊才展開，選擇分類後自動收合 ----
// 收合鈕跟展開選單都用絕對定位貼在 .sidebar 上，這裡依收合鈕實際高度算出選單該貼在哪個高度，
// 這樣不管標題文字換行與否、鈕的實際大小是多少，選單都會準確貼在收合鈕正下方。
function positionTabsDropdown(){
  const toggleBtn = document.getElementById("tabsToggle");
  const sidebar = document.querySelector(".sidebar");
  const toggleRect = toggleBtn.getBoundingClientRect();
  const sidebarRect = sidebar.getBoundingClientRect();
  tabsEl.style.top = (toggleRect.bottom - sidebarRect.top + 6) + "px";
}

function toggleTabsDropdown(){
  const isOpen = tabsEl.classList.toggle("open");
  document.getElementById("tabsToggle").setAttribute("aria-expanded", isOpen ? "true" : "false");
  if(isOpen) positionTabsDropdown();
}
function closeTabsDropdown(){
  tabsEl.classList.remove("open");
  document.getElementById("tabsToggle").setAttribute("aria-expanded", "false");
}

// ---- 韓文組字工具：選子音/母音(/收尾子音)，即時組成完整韓文字，點一下就能拿去蓋印 ----
const choSelectEl = document.getElementById("choSelect");
const jungSelectEl = document.getElementById("jungSelect");
const jongSelectEl = document.getElementById("jongSelect");
const hangulPreviewEl = document.getElementById("hangulPreview");
const hangulPreviewLabelEl = document.getElementById("hangulPreviewLabel");
const hangulPreviewBtnEl = document.getElementById("hangulPreviewBtn");

function initHangulComposer(){
  Object.keys(HANGUL_CHO_MAP).forEach(ch=>{
    const opt = document.createElement("option");
    opt.value = ch; opt.textContent = ch;
    choSelectEl.appendChild(opt);
  });
  Object.keys(HANGUL_JUNG_MAP).forEach(ch=>{
    const opt = document.createElement("option");
    opt.value = ch; opt.textContent = ch;
    jungSelectEl.appendChild(opt);
  });
  const noneOpt = document.createElement("option");
  noneOpt.value = ""; noneOpt.textContent = "（無）";
  jongSelectEl.appendChild(noneOpt);
  Object.keys(HANGUL_JONG_MAP).filter(ch=>ch!=="").forEach(ch=>{
    const opt = document.createElement("option");
    opt.value = ch; opt.textContent = ch;
    jongSelectEl.appendChild(opt);
  });

  [choSelectEl, jungSelectEl, jongSelectEl].forEach(el=>{
    el.addEventListener("change", renderHangulPreview);
  });
  hangulPreviewBtnEl.onclick = ()=>{
    const composed = composeHangul(choSelectEl.value, jungSelectEl.value, jongSelectEl.value);
    if(!composed) return;
    if(isCommonHangulSyllable(composed)){
      selectHangulGlyph(composed);
    } else {
      openHangulWarn(composed); // 不是常見會用到的字，先跳出確認提醒
    }
  };
  renderHangulPreview();
}

function selectHangulGlyph(composed){
  exitEraserMode();
  state.selectedGlyph = composed;
  renderIcons();
  renderHangulPreview();
}

// ---- 韓文組字防呆提醒：組出來的字不是常見會用到的字時，先跟使用者確認 ----
let pendingHangulComposed = null;
function openHangulWarn(composed){
  pendingHangulComposed = composed;
  document.getElementById("hangulWarnOverlay").style.display = "flex";
}
function closeHangulWarn(){
  document.getElementById("hangulWarnOverlay").style.display = "none";
  pendingHangulComposed = null;
}

function renderHangulPreview(){
  const composed = composeHangul(choSelectEl.value, jungSelectEl.value, jongSelectEl.value);
  hangulPreviewBtnEl.classList.toggle("selected", !!composed && state.selectedGlyph === composed);
  if(!composed){
    hangulPreviewEl.innerHTML = "";
    hangulPreviewLabelEl.textContent = "組成後點此使用";
    return;
  }
  const bitmap = charToBitmap(composed, 20);
  const visual = svgFromPattern(bitmap, {cell:1.8, color:"#f3f1ea"});
  hangulPreviewEl.innerHTML = visual;
  hangulPreviewLabelEl.textContent = composed;
}

function renderIcons(){
  iconGridEl.innerHTML = "";
  if(state.category === "上傳圖片"){
    const uploadBtn = document.createElement("button");
    uploadBtn.className = "icon-btn upload-btn";
    uploadBtn.innerHTML = `<span class="icon-preview">＋</span><span class="glyph-label">上傳圖片</span>`;
    uploadBtn.onclick = ()=>{ document.getElementById("imageUploadInput").click(); };
    iconGridEl.appendChild(uploadBtn);
  }
  categories[state.category].forEach(name=>{
    const b = document.createElement("button");
    b.className = "icon-btn" + (state.selectedGlyph===name ? " selected":"");
    const bitmap = getGlyphBitmap(name);
    const visual = svgFromPattern(bitmap, {cell:1.8, color:"#f3f1ea"});
    b.innerHTML = `<span class="icon-preview">${visual}</span><span class="glyph-label">${isCustomGlyph(name) ? "圖片" : name}</span>`;
    b.onclick = ()=>{ exitEraserMode(); state.selectedGlyph = name; renderIcons(); };
    if(state.category === "上傳圖片"){
      // 調整過解析度會不斷產生新的像素圖，這裡讓使用者可以自行清掉不需要的，只留下要用的
      const delBtn = document.createElement("span");
      delBtn.className = "icon-delete-btn";
      delBtn.title = "從清單移除這張像素圖";
      delBtn.textContent = "×";
      delBtn.onclick = (e)=>{
        e.stopPropagation();
        categories["上傳圖片"] = categories["上傳圖片"].filter(cid => cid !== name);
        if(state.selectedGlyph === name) state.selectedGlyph = null;
        renderIcons();
        scheduleAutosave();
      };
      b.appendChild(delBtn);
    }
    iconGridEl.appendChild(b);
  });
}

function renderSizeOptions(){
  sizeOptionsEl.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "segmented-control";
  const slider = document.createElement("div");
  slider.className = "segmented-slider";
  wrap.appendChild(slider);
  Object.keys(paperSizes).forEach(size=>{
    const b = document.createElement("button");
    b.className = state.paper===size ? "active" : "";
    b.textContent = size;
    b.onclick = ()=>{ state.paper = size; renderSizeOptions(); buildGrid(false); };
    wrap.appendChild(b);
  });
  sizeOptionsEl.appendChild(wrap);
  positionSegmentedSlider(sizeOptionsEl);
}

function positionSegmentedSlider(containerEl){
  const slider = containerEl.querySelector(".segmented-slider");
  const activeBtn = containerEl.querySelector("button.active");
  if(!slider || !activeBtn) return;
  slider.style.width = activeBtn.offsetWidth + "px";
  slider.style.transform = `translateX(${activeBtn.offsetLeft - 3}px)`;
}

function positionAllSegmentedSliders(){
  positionSegmentedSlider(sizeOptionsEl);
  positionSegmentedSlider(orientationEl);
}
const orientationLabels = { "Portrait": "直式", "Landscape": "橫式" };

function renderOrientation(){
  orientationEl.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "segmented-control";
  const slider = document.createElement("div");
  slider.className = "segmented-slider";
  wrap.appendChild(slider);
  ["Portrait","Landscape"].forEach(o=>{
    const b = document.createElement("button");
    b.className = state.orientation===o ? "active" : "";
    b.textContent = orientationLabels[o];
    b.onclick = ()=>{ state.orientation = o; renderOrientation(); buildGrid(false); };
    wrap.appendChild(b);
  });
  orientationEl.appendChild(wrap);
  positionSegmentedSlider(orientationEl);
}

function renderGridOptions(){
  gridOptionsEl.innerHTML = "";
  [5].forEach(mm=>{
    const b = document.createElement("button");
    b.className = "pill-btn" + (state.gridMm===mm ? " active":"");
    b.textContent = mm+"mm";
    b.onclick = ()=>{ state.gridMm = mm; renderGridOptions(); buildGrid(); };
    gridOptionsEl.appendChild(b);
  });
}

// ---- 輸出圖檔 ----
// 檔名裡不能出現的符號，統一換成「-」，避免存檔失敗
function sanitizeForFilename(text){
  return text.replace(/[\\/:*?"<>|]/g, "-").trim();
}

// 檢查預約日期／時段／姓名是否都已填寫，沒填完就不給匯出，並標示紅字提醒
function validateExportFields(){
  const dateEl = document.getElementById("exportDate");
  const timeEl = document.getElementById("exportTime");
  const nameEl = document.getElementById("exportName");
  const errorEl = document.getElementById("exportError");

  const missing = [];
  if(!dateEl.value) missing.push("預約課程日期");
  if(!timeEl.value) missing.push("預約課程時間");
  if(!nameEl.value.trim()) missing.push("姓名");

  dateEl.classList.toggle("missing", !dateEl.value);
  timeEl.classList.toggle("missing", !timeEl.value);
  nameEl.classList.toggle("missing", !nameEl.value.trim());

  if(missing.length){
    errorEl.textContent = `請先填寫：${missing.join("、")}，才能匯出圖片`;
    return false;
  }
  errorEl.textContent = "";
  return true;
}

function buildExportFilename(){
  const dateVal = document.getElementById("exportDate").value;
  const timeVal = document.getElementById("exportTime").value.replace(/:/g, "-");
  const nameVal = sanitizeForFilename(document.getElementById("exportName").value);
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `日宣bibbidi設計台＿${dateVal}＿${timeVal}＿${nameVal}＿${stamp}.png`;
}

function exportCanvasAsPng(){
  if(!validateExportFields()) return;

  const size = paperSizes[state.paper];
  let w = size.w, h = size.h;
  if(state.orientation==="Landscape"){ [w,h] = [h,w]; }
  const cols = Math.max(1, Math.round(w/state.gridMm));
  const rows = Math.max(1, Math.round(h/state.gridMm));
  const cellPx = 24;

  const canvas = document.createElement("canvas");
  canvas.width = cols*cellPx;
  canvas.height = rows*cellPx;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = "#e6e2d6";

  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      ctx.strokeRect(c*cellPx, r*cellPx, cellPx, cellPx);
    }
  }

  ctx.fillStyle = "#1a1a18";
  Object.keys(state.items).forEach(id=>{
    const item = state.items[id];
    const bitmap = getItemBitmap(item);
    for(let i=0;i<bitmap.length;i++){
      for(let j=0;j<bitmap[i].length;j++){
        if(!bitmap[i][j]) continue;
        const rr = item.r+i, cc = item.c+j;
        if(rr<0||cc<0||rr>=rows||cc>=cols) continue;
        ctx.fillRect(cc*cellPx+2, rr*cellPx+2, cellPx-4, cellPx-4);
      }
    }
  });

  const filename = buildExportFilename();

  canvas.toBlob(async (blob)=>{
    if(!blob) return;

    // 手機上優先用系統原生的分享選單，這樣使用者可以直接選「儲存影像」存進照片相簿，
    // 不像 <a download> 只會存進「檔案」App
    const file = new File([blob], filename, { type: "image/png" });
    if(navigator.canShare && navigator.canShare({ files: [file] })){
      try{
        await navigator.share({ files: [file], title: filename });
        return;
      }catch(err){
        if(err && err.name === "AbortError") return; // 使用者自己按取消，不當作失敗
        // 分享失敗（例如某些瀏覽器版本問題），往下走原本的下載方式當備援
      }
    }

    // 不支援 Web Share API 的環境（例如桌面瀏覽器）：維持原本的下載方式
    const link = document.createElement("a");
    link.download = filename;
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(()=> URL.revokeObjectURL(link.href), 1000);
  }, "image/png");
}

// ---- 使用說明：依照目前實際操作方式寫成一步一步的教學，搭配簡單的 emoji 圖示 ----
const helpSteps = [
  { icon:"🎨", title:"1. 選擇圖案", desc:"從左側選一個分類（大寫、小寫、數字、花園、森林、海洋、其他），再點選想要使用的圖案。" },
  { icon:"👆", title:"2. 放置圖案", desc:"選好圖案後，到右邊的格子畫布上點一下，圖案就會蓋印上去。" },
  { icon:"✋", title:"3. 選取與移動", desc:"點一下已經放置好的圖案可以選取它（會出現框線與霧面提示）；按住並拖曳，可以移動到新的位置。" },
  { icon:"🔄", title:"4. 翻轉與刪除", desc:"選取圖案後，旁邊會出現小工具列，可以水平翻轉、垂直翻轉，或刪除這個圖案。" },
  { icon:"🔍", title:"5. 調整畫布", desc:"可以切換 A4／A3 紙張尺寸、直式／橫式，並用 ＋／－ 按鈕（手機可用雙指）縮放畫布大小。" },
  { icon:"📤", title:"6. 輸出成品", desc:"拼貼完成後，記得填寫預約課程日期、時間與姓名，再點「輸出圖檔」下載成品圖片，方便我們依日期時間分類收件。" }
];
let helpStepIndex = 0;

function renderHelpStep(){
  const step = helpSteps[helpStepIndex];
  document.getElementById("helpIcon").textContent = step.icon;
  document.getElementById("helpTitle").textContent = step.title;
  document.getElementById("helpDesc").textContent = step.desc;
  document.getElementById("helpStepLabel").textContent = `${helpStepIndex+1} / ${helpSteps.length}`;

  document.getElementById("helpPrevBtn").disabled = (helpStepIndex === 0);
  const nextBtn = document.getElementById("helpNextBtn");
  const isLast = helpStepIndex === helpSteps.length - 1;
  nextBtn.title = isLast ? "完成" : "下一步";
  nextBtn.setAttribute("aria-label", isLast ? "Finish" : "Next");
  nextBtn.innerHTML = isLast
    ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;
}

function openHelp(){
  helpStepIndex = 0;
  renderHelpStep();
  document.getElementById("helpOverlay").style.display = "flex";
}
function closeHelp(){
  document.getElementById("helpOverlay").style.display = "none";
}

// ---- 清空畫布二次確認彈窗：避免手滑誤觸，把已排版的內容整個清掉 ----
function openConfirmClear(){
  document.getElementById("confirmClearOverlay").style.display = "flex";
}
function closeConfirmClear(){
  document.getElementById("confirmClearOverlay").style.display = "none";
}

// ---- 輸出圖檔前的預約資訊彈窗：三個欄位都填完才能繼續輸出 ----
function isExportFormComplete(){
  const dateVal = document.getElementById("exportDate").value;
  const timeVal = document.getElementById("exportTime").value;
  const nameVal = document.getElementById("exportName").value.trim();
  return !!(dateVal && timeVal && nameVal);
}

function updateExportFormConfirmState(){
  document.getElementById("exportFormConfirmBtn").disabled = !isExportFormComplete();
}

function openExportForm(){
  updateExportFormConfirmState();
  document.getElementById("exportFormOverlay").style.display = "flex";
}
function closeExportForm(){
  document.getElementById("exportFormOverlay").style.display = "none";
}
