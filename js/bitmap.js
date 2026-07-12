// bitmap.js —— 點陣圖產生引擎：把文字/emoji/上傳圖片轉成 20x20 的 0/1 點陣圖，
// 以及「解析度選擇彈窗」（上傳新圖片、調整已放置圖案的解析度共用同一套流程）。

const bitmapCache = {};
function charToBitmap(ch, size = 20, superSample = 6){
  const isLetter = isLetterGlyph(ch);
  const isJapanese = isJapaneseGlyph(ch);
  const isKorean = isKoreanGlyph(ch);
  const cacheKey = ch + '@' + size + (isLetter ? '@script' : isJapanese ? '@jp' : isKorean ? '@kr' : '');
  if (bitmapCache[cacheKey]) return bitmapCache[cacheKey];

  const px = size * superSample;
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  const override = GLYPH_OVERRIDES[ch];
  const scale = override ? override.scale : (isLetter ? 0.75 : (isJapanese || isKorean) ? 0.9 : 0.85);
  ctx.font = isLetter
    ? `${px * scale}px ${LETTER_FONT}`
    : isJapanese
      ? `${px * scale}px ${JAPANESE_FONT}`
      : isKorean
        ? `${px * scale}px ${KOREAN_FONT}`
        : `bold ${px * scale}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const yOffsetFactor = override ? override.yOffset : (isLetter || isJapanese || isKorean ? 0 : 0.03);
  ctx.fillText(ch, px / 2, px / 2 + px * yOffsetFactor);

  const data = ctx.getImageData(0, 0, px, px).data;
  const bitmap = [];
  for (let r = 0; r < size; r++){
    const row = [];
    for (let col = 0; col < size; col++){
      let sum = 0, count = 0;
      for (let sy = 0; sy < superSample; sy++){
        for (let sx = 0; sx < superSample; sx++){
          const x = col * superSample + sx;
          const y = r * superSample + sy;
          sum += data[(y * px + x) * 4 + 3];
          count++;
        }
      }
      row.push(sum / count > 90 ? 1 : 0);
    }
    bitmap.push(row);
  }
  bitmapCache[cacheKey] = bitmap;
  return bitmap;
}

// ---- 上傳圖片轉像素 ----
const customBitmaps = {}; // id -> 點陣圖（大小依使用者選擇的解析度而定）
const customImages = {}; // id -> 原始圖片 <img>，供之後調整解析度重新取樣用
const customSources = {}; // id -> 產生這個點陣圖的原始來源 {type:"image", img} 或 {type:"char", ch}，讓調整過的圖案還能再次調整
let nextCustomId = 1;

function isCustomGlyph(glyph){
  return typeof glyph === "string" && glyph.startsWith("custom:");
}

// 「單格繪畫」畫出來的每一格，都是一個只佔1x1的獨立圖案，跟蓋印字母/圖片共用同一套
// 圖案(item)系統，所以移動、翻轉、單格去除都直接沿用既有功能，不用另外寫一套
const PAINT_DOT_GLYPH = "__paint_dot__";

// 依照字元/自訂圖片 id 取得對應的點陣圖，統一入口讓其他函式不用分辨來源
function getGlyphBitmap(glyph){
  if(glyph === PAINT_DOT_GLYPH) return [[1]];
  if(isCustomGlyph(glyph)) return customBitmaps[glyph] || emptyBitmap(20);
  return charToBitmap(glyph, 20);
}

function getGlyphSize(glyph){
  return getGlyphBitmap(glyph).length;
}

function emptyBitmap(size){
  return Array.from({length:size}, ()=>Array(size).fill(0));
}

// 把上傳的圖片畫到跟其他圖案一樣大的 20x20 點陣格，用亮度判斷哪裡是線條(深色=有畫)
function imageToBitmap(img, size = 20, superSample = 6){
  const px = size * superSample;
  const c = document.createElement("canvas");
  c.width = px; c.height = px;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, px, px);
  const scale = Math.min(px / img.width, px / img.height);
  const w = img.width * scale, h = img.height * scale;
  const x = (px - w) / 2, y = (px - h) / 2;
  ctx.drawImage(img, x, y, w, h);

  const data = ctx.getImageData(0, 0, px, px).data;
  const bitmap = [];
  for(let r = 0; r < size; r++){
    const row = [];
    for(let col = 0; col < size; col++){
      let inkCount = 0, total = 0;
      for(let sy = 0; sy < superSample; sy++){
        for(let sx = 0; sx < superSample; sx++){
          const xx = col * superSample + sx, yy = r * superSample + sy;
          const idx = (yy * px + xx) * 4;
          const alpha = data[idx + 3];
          const luminance = 0.299*data[idx] + 0.587*data[idx+1] + 0.114*data[idx+2];
          if(alpha > 80 && luminance < 200) inkCount++;
          total++;
        }
      }
      row.push((inkCount / total) > 0.25 ? 1 : 0);
    }
    bitmap.push(row);
  }
  return bitmap;
}

function handleImageUpload(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      openResPicker({ type:"image", img }, "new", null, 20);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// 依來源（上傳的圖片 or 文字/圖案字元）在指定解析度下產生點陣圖，讓兩種來源共用同一套解析度調整流程
function generateBitmapFromSource(source, size){
  if(source.type === "image") return imageToBitmap(source.img, size);
  return charToBitmap(source.ch, size);
}

// 依照已放置的圖案，判斷它是上傳的圖片還是文字/圖案字元，回傳給解析度選擇器用的來源物件
function getResizeSourceForItem(item){
  if(isCustomGlyph(item.glyph)){
    return customSources[item.glyph] || null;
  }
  return { type:"char", ch: item.glyph };
}

// ---- 解析度選擇彈窗：上傳新圖片、調整已放置的圖片，或調整文字/圖案字元的解析度都共用這個 ----
let resPickerContext = null; // { source:{type,img|ch}, mode:"new"|"adjust", itemId }

function openResPicker(source, mode, itemId, initialRes){
  resPickerContext = { source, mode, itemId };
  document.getElementById("resSlider").value = initialRes || 20;
  updateResPreview();
  document.getElementById("resPickerOverlay").style.display = "flex";
}

function closeResPicker(){
  document.getElementById("resPickerOverlay").style.display = "none";
  resPickerContext = null;
}

function updateResPreview(){
  if(!resPickerContext) return;
  const res = parseInt(document.getElementById("resSlider").value, 10);
  document.getElementById("resSliderLabel").textContent = `${res} x ${res} 格`;
  const bitmap = generateBitmapFromSource(resPickerContext.source, res);
  const canvas = document.getElementById("resPreviewCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#222";
  const cell = canvas.width / res;
  for(let r=0;r<res;r++){
    for(let c=0;c<res;c++){
      if(bitmap[r][c]) ctx.fillRect(c*cell, r*cell, cell, cell);
    }
  }
}

function confirmResPicker(){
  if(!resPickerContext) return;
  const res = parseInt(document.getElementById("resSlider").value, 10);
  const bitmap = generateBitmapFromSource(resPickerContext.source, res);
  const id = "custom:" + (nextCustomId++);
  if(resPickerContext.source.type === "image") customImages[id] = resPickerContext.source.img;
  customSources[id] = resPickerContext.source;
  customBitmaps[id] = bitmap;

  if(resPickerContext.mode === "new"){
    categories["上傳圖片"].push(id);
    state.category = "上傳圖片";
    state.selectedGlyph = id;
    renderTabs();
    renderIcons();
  } else if(resPickerContext.mode === "adjust"){
    const item = state.items[resPickerContext.itemId];
    if(item){
      // 調整解析度後，讓圖案的中心點維持在原本的位置，不會因為格數變多變少而跳位置
      const oldBitmap = getItemBitmap(item);
      const oldBBox = getGlyphBBox(oldBitmap);
      const oldCenterR = item.r + (oldBBox.minR===Infinity ? 0 : (oldBBox.minR+oldBBox.maxR)/2);
      const oldCenterC = item.c + (oldBBox.minC===Infinity ? 0 : (oldBBox.minC+oldBBox.maxC)/2);
      item.glyph = id;
      item.flipH = false;
      item.flipV = false;
      delete item.holes; // 換了新解析度的點陣圖，座標系統不同了，舊的擦除記錄不再適用
      const newBBox = getGlyphBBox(bitmap);
      const newCenterR = newBBox.minR===Infinity ? 0 : (newBBox.minR+newBBox.maxR)/2;
      const newCenterC = newBBox.minC===Infinity ? 0 : (newBBox.minC+newBBox.maxC)/2;
      item.r = Math.round(oldCenterR - newCenterR);
      item.c = Math.round(oldCenterC - newCenterC);
      paintAll();
      positionToolbar(resPickerContext.itemId);
      positionSelectionFrame(resPickerContext.itemId);
      updateResizeBtnVisibility(resPickerContext.itemId);
    }
  }
  closeResPicker();
  scheduleAutosave();
}

function flipBitmap(bitmap, flipH, flipV){
  let b = bitmap.map(row => row.slice());
  if(flipH) b = b.map(row => row.slice().reverse());
  if(flipV) b = b.slice().reverse();
  return b;
}

function getItemBitmap(item){
  let base = getGlyphBitmap(item.glyph);
  if(item.holes && item.holes.size){
    base = base.map(row => row.slice()); // 複製一份，避免動到共用的快取點陣圖
    item.holes.forEach(key => {
      const [hi, hj] = key.split(',').map(Number);
      if(base[hi]) base[hi][hj] = 0;
    });
  }
  return flipBitmap(base, item.flipH, item.flipV);
}

function getGlyphBBox(bitmap){
  let minR=Infinity,maxR=-Infinity,minC=Infinity,maxC=-Infinity;
  for(let i=0;i<bitmap.length;i++){
    for(let j=0;j<bitmap[i].length;j++){
      if(bitmap[i][j]){
        if(i<minR)minR=i; if(i>maxR)maxR=i;
        if(j<minC)minC=j; if(j>maxC)maxC=j;
      }
    }
  }
  return {minR,maxR,minC,maxC};
}
