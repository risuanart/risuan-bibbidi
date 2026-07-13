// touch-fixes.js —— 集中收納「針對手機瀏覽器原生手勢行為」的修正，
// 跟畫布縮放/拖曳這些業務邏輯無關，純粹是攔截瀏覽器自己的手勢判定。
// 之後如果又發現新的手機瀏覽器手勢衝突，優先在這個檔案處理，方便統一維護。

// iOS Safari 的兩指縮放是走 webkit 專屬的 gesturestart/gesturechange 事件，
// 光靠一般的 touchmove + preventDefault（見 js/main.js 的 pinch 邏輯）不一定擋得乾淨，
// 這裡直接把這兩個事件整頁擋掉，確保不會觸發整頁縮放。
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
