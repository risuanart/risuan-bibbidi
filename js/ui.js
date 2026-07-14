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
// 收合鈕用絕對定位貼在 .sidebar 上，展開選單則用 position:fixed（以螢幕為基準，不會被
// .sidebar 自己的 max-height+overflow-y 裁切）。選單高度依「收合鈕下緣到側邊欄(咖啡色底)下緣」
// 之間實際剩餘的空間動態計算，這樣選單一定會留在咖啡色範圍內，不會蓋到下面的畫布區，
// 分類太多看不完時則交給選單自己的 overflow-y:auto 捲動瀏覽。
function positionTabsDropdown(){
  const toggleBtn = document.getElementById("tabsToggle");
  const sidebar = document.querySelector(".sidebar");
  const toggleRect = toggleBtn.getBoundingClientRect();
  const sidebarRect = sidebar.getBoundingClientRect();
  const top = toggleRect.bottom + 6;
  const margin = 8;
  tabsEl.style.top = top + "px";
  tabsEl.style.maxHeight = Math.max(60, sidebarRect.bottom - top - margin) + "px";
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

// ---- 任務25：手機版尺寸/方向選單收合成pill＋下拉，首次進入排版頁面時改用置中彈窗強制先選一次 ----
// 下拉模式跟首次進入的彈窗其實是同一個 #sizePanel（同一份DOM、同一套renderSizeOptions/renderOrientation），
// 差別只在CSS呈現方式（貼齊pill下緣的下拉 vs 置中+遮罩的彈窗），避免做出兩套相似但不同的選擇介面。
const sizePanelEl = document.getElementById("sizePanel");
const sizeScrimEl = document.getElementById("sizeScrim");
const sizePillToggleEl = document.getElementById("sizePillToggle");
let sizePanelFirstEntry = false; // 目前開啟的是不是「首次進入、強制選一次」模式

function positionSizePanelDropdown(){
  const toggleRect = sizePillToggleEl.getBoundingClientRect();
  sizePanelEl.style.top = (toggleRect.bottom + 6) + "px";
}

function openSizePanel(firstEntry){
  sizePanelFirstEntry = !!firstEntry;
  sizePanelEl.classList.toggle("first-entry", sizePanelFirstEntry);
  sizePanelEl.classList.add("open");
  sizeScrimEl.classList.add("open");
  sizePillToggleEl.setAttribute("aria-expanded", "true");
  document.getElementById("sizePanelConfirm").textContent = sizePanelFirstEntry ? "開始排版" : "套用";
  if(!sizePanelFirstEntry) positionSizePanelDropdown();
  // 面板平常是display:none，選中狀態的滑塊寬度在那之前量測都會是0，
  // 打開之後（元素已經看得到、量得到寬度）要重新算一次，不然選中的按鈕會變成白字沒有背景色、幾乎看不見
  positionAllSegmentedSliders();
}

function closeSizePanel(){
  // 首次進入、尚未確認過尺寸時，遮罩點擊不應該直接關閉——一定要按下確認鈕，
  // 確保使用者至少看過一次尺寸/價格才進入正式排版（見confirmSizePanel）
  if(sizePanelFirstEntry && !state.sizeConfirmed) return;
  sizePanelEl.classList.remove("open", "first-entry");
  sizeScrimEl.classList.remove("open");
  sizePillToggleEl.setAttribute("aria-expanded", "false");
  sizePanelFirstEntry = false;
}

function confirmSizePanel(){
  state.sizeConfirmed = true;
  scheduleAutosave();
  closeSizePanel();
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
    b.textContent = `${size}・NT$${paperSizes[size].price}`;
    b.onclick = ()=>{ state.paper = size; renderSizeOptions(); buildGrid(false); };
    wrap.appendChild(b);
  });
  sizeOptionsEl.appendChild(wrap);

  const note = document.createElement("span");
  note.className = "price-note";
  note.textContent = "不含畫框費用";
  sizeOptionsEl.appendChild(note);

  positionSegmentedSlider(sizeOptionsEl);
  updateCurrentPriceLabel();
}

// 任務25：桌面版沿用原本畫布上方常駐的「目前選擇：...」提示；手機版改顯示在收合pill上（同一份資料，兩個地方一起更新）
function updateCurrentPriceLabel(){
  const price = paperSizes[state.paper].price;
  document.getElementById("currentPriceLabel").textContent = `目前選擇：${state.paper}・NT$${price}（不含畫框費用）`;
  const pillLabel = document.getElementById("sizePillLabel");
  if(pillLabel) pillLabel.textContent = `${state.paper}・NT$${price}・${orientationLabels[state.orientation]}`;
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
  const lineNameEl = document.getElementById("exportLineName");
  const errorEl = document.getElementById("exportError");

  const missing = [];
  if(!dateEl.value) missing.push("預約課程日期");
  if(!timeEl.value) missing.push("預約課程時間");
  if(!nameEl.value.trim()) missing.push("預約姓名");
  if(!lineNameEl.value.trim()) missing.push("LINE名稱");

  dateEl.classList.toggle("missing", !dateEl.value);
  timeEl.classList.toggle("missing", !timeEl.value);
  nameEl.classList.toggle("missing", !nameEl.value.trim());
  lineNameEl.classList.toggle("missing", !lineNameEl.value.trim());

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
  const operatorVal = sanitizeForFilename(document.getElementById("exportOperator").value.trim());
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const parts = ["日宣bibbidi設計台", dateVal, timeVal, nameVal];
  if(operatorVal) parts.push(operatorVal); // 有填「實際操作者」時放進檔名，避免同名時分不出是誰的檔案
  parts.push(stamp);
  return parts.join("＿") + ".png";
}

const EXPORT_INFO_BAR_HEIGHT = 160; // 輸出圖檔下方資訊列的高度(px)

function exportCanvasAsPng(){
  if(!validateExportFields()) return;

  const size = paperSizes[state.paper];
  let w = size.w, h = size.h;
  if(state.orientation==="Landscape"){ [w,h] = [h,w]; }
  const cols = Math.max(1, Math.round(w/state.gridMm));
  const rows = Math.max(1, Math.round(h/state.gridMm));
  const cellPx = 24;
  const patternHeight = rows*cellPx;

  const canvas = document.createElement("canvas");
  canvas.width = cols*cellPx;
  canvas.height = patternHeight + EXPORT_INFO_BAR_HEIGHT;
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

  drawExportInfoBar(ctx, canvas.width, patternHeight);

  // 品牌浮水印放在資訊列右下角（半透明），不會蓋到上面的設計本體；Logo 讀取失敗也不擋輸出流程
  const logo = new Image();
  logo.onload = () => {
    const logoH = EXPORT_INFO_BAR_HEIGHT * 0.55;
    const logoW = logoH * (logo.naturalWidth / logo.naturalHeight);
    const margin = 20;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.drawImage(logo, canvas.width - logoW - margin, patternHeight + (EXPORT_INFO_BAR_HEIGHT - logoH)/2, logoW, logoH);
    ctx.restore();
    finishExportCanvas(canvas);
  };
  logo.onerror = () => finishExportCanvas(canvas);
  logo.src = "assets/images/logo-risuan.png";
}

// 畫布下方獨立的白底資訊列（姓名/LINE名稱/日期/時段/尺寸），跟上面的設計本體分開，不會互相蓋到
function drawExportInfoBar(ctx, canvasWidth, infoBarY){
  ctx.strokeStyle = "#d8d3c4";
  ctx.beginPath();
  ctx.moveTo(0, infoBarY);
  ctx.lineTo(canvasWidth, infoBarY);
  ctx.stroke();

  const nameVal = document.getElementById("exportName").value.trim();
  const lineNameVal = document.getElementById("exportLineName").value.trim();
  const dateVal = document.getElementById("exportDate").value;
  const timeVal = document.getElementById("exportTime").value;

  ctx.fillStyle = "#2a2a25";
  ctx.textBaseline = "middle";
  ctx.font = "28px 'Noto Serif TC', serif";
  const line1 = `預約姓名：${nameVal}　　LINE名稱：${lineNameVal}`;
  const line2 = `日期：${dateVal}　　時段：${timeVal}　　尺寸：${state.paper}`;
  ctx.fillText(line1, 24, infoBarY + EXPORT_INFO_BAR_HEIGHT*0.35);
  ctx.fillText(line2, 24, infoBarY + EXPORT_INFO_BAR_HEIGHT*0.72);
}

function finishExportCanvas(canvas){
  const filename = buildExportFilename();

  canvas.toBlob(async (blob)=>{
    if(!blob) return;

    // 手機上優先用系統原生的分享選單，這樣使用者可以直接選「儲存影像」存進照片相簿，
    // 不像 <a download> 只會存進「檔案」App
    const file = new File([blob], filename, { type: "image/png" });
    if(navigator.canShare && navigator.canShare({ files: [file] })){
      try{
        await navigator.share({ files: [file], title: filename });
        openExportDone();
        return;
      }catch(err){
        if(err && err.name === "AbortError") return; // 使用者自己按取消，不當作失敗，也不用提醒加LINE
        // 分享失敗（例如某些瀏覽器版本問題），往下走原本的下載方式當備援
      }
    }

    // 不支援 Web Share API 的環境（例如桌面瀏覽器）：維持原本的下載方式
    const link = document.createElement("a");
    link.download = filename;
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(()=> URL.revokeObjectURL(link.href), 1000);
    openExportDone();
  }, "image/png");
}

// ---- 使用說明：依照目前實際操作方式寫成一步一步的教學 ----
// 任務18：emoji換成線條風格SVG icon（裝在深色徽章裡），stroke用currentColor跟著.help-medallion的color走
const helpSteps = [
  { icon:`<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 100 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4c1.7 0 3.1-1.4 3.1-3.1C20.5 6.6 16.7 2 12 2z"/><circle cx="7" cy="10" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16.5" cy="10" r="1"/></svg>`, title:"選擇圖案", desc:"從左側（手機版點右上角「分類」鈕）選一個分類，再點選想要使用的圖案。" },
  { icon:`<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3-7 3 7"/><path d="M9 11a3 3 0 006 0"/><path d="M12 15v6"/><path d="M9 21h6"/></svg>`, title:"放置圖案", desc:"選好圖案後，到右邊的格子畫布上點一下，圖案就會蓋印上去。" },
  { icon:`<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V5a1.5 1.5 0 013 0v6"/><path d="M11 11V4a1.5 1.5 0 013 0v7"/><path d="M14 11.5V6a1.5 1.5 0 013 0v8"/><path d="M17 12l1.5 1a3 3 0 011.5 2.6V17a5 5 0 01-5 5h-3a5 5 0 01-4.2-2.3L5 15.5c-.6-.9-.4-1.7.3-2.2.7-.5 1.6-.4 2.2.3L9 15.5"/></svg>`, title:"選取、移動與微調", desc:"點一下已經放置好的圖案可以選取它；按住並拖曳可以移動到新的位置。選取後旁邊會出現工具列，可以上下左右微調一格、水平/垂直翻轉，或刪除這個圖案。" },
  { icon:`<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14l7.5-7.5a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11 19"/><path d="M6 14l4 4"/><path d="M5 19h6"/></svg>`, title:"單格去除與復原", desc:"開啟「單格去除」可以一格一格清掉圖案的局部，不用整個刪除重蓋；操作錯了也可以按「復原」回到上一步。" },
  { icon:`<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.35-4.35"/></svg>`, title:"放大檢視", desc:"手機排版空間有限時，可以點「放大檢視」用更大的畫面檢視、微調圖案位置，裡面也可以用單格去除，或用「單格繪畫」直接手繪單一像素。" },
  { icon:`<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M7 5v3M11 5v2M15 5v3M19 5v2"/></svg>`, title:"調整畫布尺寸", desc:"可以切換 A4／A3 紙張尺寸、直式／橫式，並用 ＋／－ 按鈕（手機可用雙指）縮放畫布大小；畫布完整顯示、不需要捲動時，旁邊會出現小標籤提醒。" },
  { icon:`<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 19h14"/></svg>`, title:"輸出成品", desc:"拼貼完成後，記得填寫預約課程日期、時間與姓名，再點「輸出圖檔」下載成品圖片，方便我們依日期時間分類收件。" }
];
let helpStepIndex = 0;

function renderHelpStep(){
  const step = helpSteps[helpStepIndex];
  document.getElementById("helpIcon").innerHTML = step.icon;
  document.getElementById("helpTitle").textContent = step.title;
  document.getElementById("helpDesc").textContent = step.desc;
  document.getElementById("helpStepLabel").textContent = `Step ${String(helpStepIndex+1).padStart(2,"0")} / ${String(helpSteps.length).padStart(2,"0")}`;

  const dotsEl = document.getElementById("helpDots");
  dotsEl.innerHTML = "";
  helpSteps.forEach((_, i)=>{
    const dot = document.createElement("span");
    if(i === helpStepIndex) dot.className = "active";
    dotsEl.appendChild(dot);
  });

  document.getElementById("helpPrevBtn").disabled = (helpStepIndex === 0);
  const nextBtn = document.getElementById("helpNextBtn");
  const isLast = helpStepIndex === helpSteps.length - 1;
  nextBtn.title = isLast ? "完成" : "下一步";
  nextBtn.setAttribute("aria-label", isLast ? "Finish" : "Next");
  nextBtn.innerHTML = isLast
    ? `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;
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
  const lineNameVal = document.getElementById("exportLineName").value.trim();
  return !!(dateVal && timeVal && nameVal && lineNameVal);
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

// ---- 輸出/分享完成後的提示：順便提醒使用者加畫室LINE好友，非必要、不擋流程 ----
function openExportDone(){
  document.getElementById("exportDoneOverlay").style.display = "flex";
}
function closeExportDone(){
  document.getElementById("exportDoneOverlay").style.display = "none";
}
