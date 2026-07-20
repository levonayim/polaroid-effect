(function(){
  const canvas = document.getElementById('cardCanvas');
  const ctx = canvas.getContext('2d');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const cardWrap = document.getElementById('cardWrap');
  const flash = document.getElementById('flash');
  const photoStage = document.getElementById('photoStage');
  const stageHint = document.getElementById('stageHint');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');

  const fadeSlider = document.getElementById('fadeSlider');
  const hazeSlider = document.getElementById('hazeSlider');
  const grainSlider = document.getElementById('grainSlider');
  const tiltSlider = document.getElementById('tiltSlider');
  const fadeVal = document.getElementById('fadeVal');
  const hazeVal = document.getElementById('hazeVal');
  const grainVal = document.getElementById('grainVal');
  const tiltVal = document.getElementById('tiltVal');
  const captionInput = document.getElementById('captionInput');
  const dateToggle = document.getElementById('dateToggle');
  const frameSeg = document.getElementById('frameSeg');
  
  const ratioSeg = document.getElementById('ratioSeg');
  const countSeg = document.getElementById('countSeg');
  const orientSeg = document.getElementById('orientSeg');
  const orientationField = document.getElementById('orientationField');
  const filterSelect = document.getElementById('filterSelect');

  // ---- Mobile UI Hardware Connectors ----
  const camRatioBtn = document.getElementById('camRatioBtn');
  const camRatioLabel = document.getElementById('camRatioLabel');
  const camCountBtn = document.getElementById('camCountBtn');
  const camCountLabel = document.getElementById('camCountLabel');
  const camOrientBtn = document.getElementById('camOrientBtn');
  const camFilterBtn = document.getElementById('camFilterBtn');
  const camFrameBtn = document.getElementById('camFrameBtn');
  const camDateBtn = document.getElementById('camDateBtn');
  const filterToast = document.getElementById('filterToast');
  
  const mobileSaveBtn = document.getElementById('mobileSaveBtn');
  const mobileResetBtn = document.getElementById('mobileResetBtn');
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const controlsRail = document.getElementById('controlsRail');
  const closeRailBtn = document.getElementById('closeRailBtn');

  // ---------- Configurable Layout States ----------
  let currentRatio = 'square'; 
  let currentCount = 1;        
  let currentOrient = 'vertical'; 
  let currentFilter = 'none';
  
  let sourceImages = []; 
  let dateStampEnabled = true;
  let frameStyle = 'classic';

  let cardWidth = 760;
  let cardHeight = 904;
  let layoutSlots = []; 
  let activeSlotIndex = null; 
  let uploadTargetIndex = null; 

  const activePointers = new Map();
  let pinchStartDist = null;
  let pinchStartZoom = 1;
  let lastSingleX = null, lastSingleY = null;
  let dragDistance = 0; 
  let rafPending = false;

  const filtersList = [
    'none', 'clarendon', 'juno', 'lark', 'reyes', 'valencia', 'gotham', 
    'xpro2', 'lofi', 'aden', 'perpetua', 'crema', 'ludwig', 'slumber', 
    'gingham', 'mayfair', 'rise', 'hudson', 'sierra', 'willow', 'inkwell'
  ];

  function recalculateCardArchitecture() {
    let baseSlotW = 628; 
    let baseSlotH = 628; 

    if (currentRatio === 'mini') {
      baseSlotW = 448;
      baseSlotH = 628; 
    } else if (currentRatio === 'wide') {
      baseSlotW = 988;
      baseSlotH = 628; 
    }

    const marginSide = 46;
    const marginTop = 46;
    const marginBottom = 190; 
    const gap = 16; 

    let photoAreaW = baseSlotW;
    let photoAreaH = baseSlotH;

    if (currentCount > 1) {
      if (currentOrient === 'vertical') {
        photoAreaH = (baseSlotH * currentCount) + (gap * (currentCount - 1));
      } else {
        photoAreaW = (baseSlotW * currentCount) + (gap * (currentCount - 1));
      }
    }

    cardWidth = photoAreaW + (marginSide * 2);
    cardHeight = marginTop + photoAreaH + marginBottom;
    
    canvas.width = cardWidth;
    canvas.height = cardHeight;
    canvas.style.width = cardWidth + 'px';

    layoutSlots = [];
    for (let i = 0; i < currentCount; i++) {
      if (currentOrient === 'vertical') {
        layoutSlots.push({
          x: marginSide,
          y: marginTop + i * (baseSlotH + gap),
          w: baseSlotW,
          h: baseSlotH
        });
      } else {
        layoutSlots.push({
          x: marginSide + i * (baseSlotW + gap),
          y: marginTop,
          w: baseSlotW,
          h: baseSlotH
        });
      }
    }

    photoStage.style.left = (marginSide / cardWidth * 100) + '%';
    photoStage.style.top = (marginTop / cardHeight * 100) + '%';
    photoStage.style.width = (photoAreaW / cardWidth * 100) + '%';
    photoStage.style.height = (photoAreaH / cardHeight * 100) + '%';
    
    if (currentRatio === 'square') camRatioLabel.textContent = "1:1";
    if (currentRatio === 'mini') camRatioLabel.textContent = "3:4";
    if (currentRatio === 'wide') camRatioLabel.textContent = "16:9";
    camCountLabel.textContent = currentCount + "P";
  }

  function scheduleRender(){
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; render(); });
  }

  function currentAngleRad(){
    return parseInt(tiltSlider.value, 10) * Math.PI / 180;
  }

  function toLocalDelta(dx, dy){
    const a = -currentAngleRad();
    return {
      dx: dx * Math.cos(a) - dy * Math.sin(a),
      dy: dx * Math.sin(a) + dy * Math.cos(a)
    };
  }

  function panBy(dxScreen, dyScreen){
    if (activeSlotIndex === null || !sourceImages[activeSlotIndex]) return;
    const slotState = sourceImages[activeSlotIndex];
    const local = toLocalDelta(dxScreen, dyScreen);
    const displayScale = canvas.clientWidth / canvas.width;

    slotState.cx += local.dx / displayScale;
    slotState.cy += local.dy / displayScale;
  }

  function determineSlotIndexFromEvent(e) {
    const rect = photoStage.getBoundingClientRect();
    const relativeX = (e.clientX - rect.left) / rect.width * (cardWidth - 92); 
    const relativeY = (e.clientY - rect.top) / rect.height * (cardHeight - 46 - 190);
    const absoluteCanvasX = relativeX + 46;
    const absoluteCanvasY = relativeY + 46;

    for (let i = 0; i < layoutSlots.length; i++) {
      const box = layoutSlots[i];
      if (absoluteCanvasX >= box.x && absoluteCanvasX <= box.x + box.w &&
          absoluteCanvasY >= box.y && absoluteCanvasY <= box.y + box.h) {
        return i;
      }
    }
    return 0; 
  }

  photoStage.addEventListener('pointerdown', e => {
    photoStage.setPointerCapture(e.pointerId);
    if (activePointers.size === 0) {
      activeSlotIndex = determineSlotIndexFromEvent(e);
      dragDistance = 0;
    }
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2){
      const pts = [...activePointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartZoom = sourceImages[activeSlotIndex] ? sourceImages[activeSlotIndex].zoom : 1;
    } else if (activePointers.size === 1){
      lastSingleX = e.clientX;
      lastSingleY = e.clientY;
    }
  });

  photoStage.addEventListener('pointermove', e => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activeSlotIndex !== null && sourceImages[activeSlotIndex]) {
      if (activePointers.size === 2){
        const pts = [...activePointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchStartDist){
          sourceImages[activeSlotIndex].zoom = Math.max(1, Math.min(8, pinchStartZoom * (dist / pinchStartDist)));
        }
      } else if (activePointers.size === 1){
        const dxScreen = e.clientX - lastSingleX;
        const dyScreen = e.clientY - lastSingleY;
        dragDistance += Math.hypot(dxScreen, dyScreen);
        lastSingleX = e.clientX;
        lastSingleY = e.clientY;
        panBy(dxScreen, dyScreen);
      }
      scheduleRender();
    }
  });

  function endPointer(e){
    if (activePointers.size === 1 && dragDistance < 6) {
      uploadTargetIndex = activeSlotIndex;
      fileInput.removeAttribute('multiple');
      fileInput.removeAttribute('capture');
      
      // Native system camera capture dialog trigger option setup
      if (window.innerWidth <= 920) {
        fileInput.setAttribute('capture', 'environment');
      }
      fileInput.click();
    }

    activePointers.delete(e.pointerId);
    if (activePointers.size === 1){
      const p = [...activePointers.values()][0];
      lastSingleX = p.x;
      lastSingleY = p.y;
    }
    if (activePointers.size === 0) {
      pinchStartDist = null;
      activeSlotIndex = null;
    }
  }
  photoStage.addEventListener('pointerup', endPointer);
  photoStage.addEventListener('pointercancel', endPointer);
  photoStage.addEventListener('pointerleave', e => { if (e.buttons === 0) endPointer(e); });

  photoStage.addEventListener('wheel', e => {
    if (sourceImages.length === 0) return;
    e.preventDefault();
    const targetedSlot = determineSlotIndexFromEvent(e);
    if (sourceImages[targetedSlot]) {
      const factor = Math.exp(-e.deltaY * 0.0015);
      sourceImages[targetedSlot].zoom = Math.max(1, Math.min(8, sourceImages[targetedSlot].zoom * factor));
      scheduleRender();
    }
  }, { passive: false });

  dropzone.addEventListener('click', () => {
    uploadTargetIndex = null; 
    fileInput.removeAttribute('capture');
    fileInput.setAttribute('multiple', 'multiple');
    fileInput.click();
  });
  
  fileInput.addEventListener('change', e => {
    if (e.target.files && e.target.files.length > 0) loadFiles(e.target.files);
  });
  
  ['dragenter','dragover'].forEach(evt=>{
    dropzone.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.add('drag-over');
    });
  });
  ['dragleave','drop'].forEach(evt=>{
    dropzone.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      dropzone.classList.remove('drag-over');
    });
  });
  dropzone.addEventListener('drop', e => {
    const files = e.dataTransfer.files;
    uploadTargetIndex = null;
    fileInput.removeAttribute('capture');
    fileInput.setAttribute('multiple', 'multiple');
    if (files && files.length > 0) loadFiles(files);
  });

  function loadFiles(files) {
    let filesArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (filesArray.length === 0) return;

    if (uploadTargetIndex !== null) {
      const reader = new FileReader();
      reader.onload = evt => {
        const img = new Image();
        img.onload = () => {
          sourceImages[uploadTargetIndex] = {
            img: img,
            zoom: 1,
            cx: 0,
            cy: 0
          };
          dropzone.classList.add('hidden');
          photoStage.classList.add('active');
          saveBtn.disabled = false;
          mobileSaveBtn.disabled = false;
          render();
          triggerDevelop();
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(filesArray[0]);
    } else {
      let loadedCounter = 0;
      let limit = Math.min(filesArray.length, currentCount);

      filesArray.slice(0, limit).forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = evt => {
          const img = new Image();
          img.onload = () => {
            sourceImages[index] = {
              img: img,
              zoom: 1,
              cx: 0,
              cy: 0
            };
            loadedCounter++;
            if (loadedCounter === limit) finalizeAssetPipeline();
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
      });
    }
  }

  function finalizeAssetPipeline() {
    for (let i = 0; i < currentCount; i++) {
      if (!sourceImages[i] && sourceImages[0]) {
        sourceImages[i] = {
          img: sourceImages[0].img,
          zoom: 1,
          cx: 0,
          cy: 0
        };
      }
    }
    dropzone.classList.add('hidden');
    photoStage.classList.add('active');
    saveBtn.disabled = false;
    mobileSaveBtn.disabled = false;
    render();
    triggerDevelop();
  }

  function triggerDevelop(){
    cardWrap.classList.remove('developing');
    void cardWrap.offsetWidth;
    cardWrap.classList.add('developing');
  }

  function runGlobalReset() {
    sourceImages = [];
    saveBtn.disabled = true;
    mobileSaveBtn.disabled = true;
    dropzone.classList.remove('hidden');
    photoStage.classList.remove('active');
    fileInput.value = '';
    captionInput.value = '';
    filterSelect.value = 'none';
    currentFilter = 'none';
    ctx.clearRect(0,0,canvas.width,canvas.height);
    updateTilt();
    render();
  }
  resetBtn.addEventListener('click', runGlobalReset);
  mobileResetBtn.addEventListener('click', runGlobalReset);

  camRatioBtn.addEventListener('click', () => {
    const ratios = ['square', 'mini', 'wide'];
    let nextIdx = (ratios.indexOf(currentRatio) + 1) % ratios.length;
    currentRatio = ratios[nextIdx];
    [...ratioSeg.children].forEach(b => b.classList.toggle('active', b.dataset.ratio === currentRatio));
    recalculateCardArchitecture();
    render();
  });

  camCountBtn.addEventListener('click', () => {
    currentCount = (currentCount % 3) + 1;
    camOrientBtn.style.display = currentCount > 1 ? 'flex' : 'none';
    orientationField.style.display = currentCount > 1 ? 'block' : 'none';
    [...countSeg.children].forEach(b => b.classList.toggle('active', parseInt(b.dataset.count, 10) === currentCount));
    recalculateCardArchitecture();
    if (sourceImages.length > 0) finalizeAssetPipeline();
    else render();
  });

  camOrientBtn.addEventListener('click', () => {
    currentOrient = currentOrient === 'vertical' ? 'horizontal' : 'vertical';
    [...orientSeg.children].forEach(b => b.classList.toggle('active', b.dataset.orient === currentOrient));
    recalculateCardArchitecture();
    render();
  });

  camFilterBtn.addEventListener('click', () => {
    let nextIdx = (filtersList.indexOf(currentFilter) + 1) % filtersList.length;
    currentFilter = filtersList[nextIdx];
    filterSelect.value = currentFilter;
    const prettyName = filterSelect.options[filterSelect.selectedIndex].text.split(' (')[0];
    filterToast.textContent = prettyName;
    filterToast.classList.add('show');
    clearTimeout(window._toastT);
    window._toastT = setTimeout(() => filterToast.classList.remove('show'), 1000);
    render();
  });

  camFrameBtn.addEventListener('click', () => {
    frameStyle = frameStyle === 'classic' ? 'noir' : 'classic';
    [...frameSeg.children].forEach(b => b.classList.toggle('active', b.dataset.frame === frameStyle));
    camFrameBtn.classList.toggle('active', frameStyle === 'noir');
    render();
  });

  camDateBtn.addEventListener('click', () => {
    dateStampEnabled = !dateStampEnabled;
    dateToggle.classList.toggle('on', dateStampEnabled);
    camDateBtn.classList.toggle('active', dateStampEnabled);
    render();
  });

  mobileMenuToggle.addEventListener('click', () => controlsRail.classList.add('open'));
  closeRailBtn.addEventListener('click', () => controlsRail.classList.remove('open'));

  ratioSeg.addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn) return;
    [...ratioSeg.children].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRatio = btn.dataset.ratio;
    recalculateCardArchitecture();
    render();
  });

  countSeg.addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn) return;
    [...countSeg.children].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCount = parseInt(btn.dataset.count, 10);
    orientationField.style.display = currentCount > 1 ? 'block' : 'none';
    camOrientBtn.style.display = currentCount > 1 ? 'flex' : 'none';
    recalculateCardArchitecture();
    if (sourceImages.length > 0) finalizeAssetPipeline();
    else render();
  });

  orientSeg.addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn) return;
    [...orientSeg.children].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentOrient = btn.dataset.orient;
    recalculateCardArchitecture();
    render();
  });

  filterSelect.addEventListener('change', e => { currentFilter = e.target.value; render(); });
  fadeSlider.addEventListener('input', () => { fadeVal.textContent = fadeSlider.value; render(); });
  hazeSlider.addEventListener('input', () => { hazeVal.textContent = hazeSlider.value; render(); });
  grainSlider.addEventListener('input', () => { grainVal.textContent = grainSlider.value; render(); });
  tiltSlider.addEventListener('input', updateTilt);
  captionInput.addEventListener('input', render);
  
  dateToggle.addEventListener('click', () => {
    dateStampEnabled = !dateStampEnabled;
    dateToggle.classList.toggle('on', dateStampEnabled);
    camDateBtn.classList.toggle('active', dateStampEnabled);
    render();
  });
  frameSeg.addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn) return;
    [...frameSeg.children].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    frameStyle = btn.dataset.frame;
    camFrameBtn.classList.toggle('active', frameStyle === 'noir');
    render();
  });

  function updateTilt(){
    const deg = parseInt(tiltSlider.value, 10);
    tiltVal.textContent = deg + '°';
    cardWrap.style.transform = `rotate(${deg}deg)`;
  }

  function photoStageDblClick(e) {
    const targetedSlot = determineSlotIndexFromEvent(e);
    if (sourceImages[targetedSlot]) {
      sourceImages[targetedSlot].zoom = 1;
      sourceImages[targetedSlot].cx = 0;
      sourceImages[targetedSlot].cy = 0;
      render();
    }
  }
  photoStage.addEventListener('dblclick', photoStageDblClick);

  function processInstagramFilter(r, g, b, filterName) {
    switch (filterName) {
      case 'clarendon': r = r > 128 ? r + (255 - r) * 0.12 : r * 0.95; g = g > 128 ? g + (255 - g) * 0.15 : g * 0.98; b = b > 128 ? b + (255 - b) * 0.22 : b * 0.90; break;
      case 'juno': r *= 1.18; g *= 1.05; b *= 0.88; break;
      case 'lark': r *= 1.02; g *= 0.92; b *= 1.12; break;
      case 'reyes': r = r * 0.85 + 35; g = g * 0.85 + 30; b = b * 0.75 + 20; break;
      case 'valencia': r *= 1.12; g *= 1.08; b *= 0.82; r = r * 0.9 + 15; break;
      case 'gotham': let lg = 0.299 * r + 0.587 * g + 0.114 * b; r = lg * 0.9; g = lg * 0.95; b = lg * 1.15; if (b > 100) b += (255 - b) * 0.1; break;
      case 'xpro2': r = r < 128 ? r * 0.85 : r + (255 - r) * 0.15; g = g * 1.05; b = b < 128 ? b * 1.22 : b * 0.78; break;
      case 'lofi': r = r < 128 ? (r * r) / 128 : 255 - ((255 - r) * (255 - r)) / 128; g = g < 128 ? (g * g) / 128 : 255 - ((255 - g) * (255 - g)) / 128; b = b < 128 ? (b * b) / 128 : 255 - ((255 - b) * (255 - b)) / 128; r *= 1.12; g *= 1.12; break;
      case 'aden': r = r * 0.9 + 25; g = g * 0.88 + 20; b = b * 0.85 + 30; break;
      case 'perpetua': g *= 1.06; b *= 1.04; break;
      case 'crema': r = r * 0.92 + 15; g = g * 0.90 + 15; b = b * 0.82 + 25; let lc = 0.3 * r + 0.59 * g + 0.11 * b; r = r + (lc - r) * 0.2; g = g + (lc - g) * 0.2; b = b + (lc - b) * 0.2; break;
      case 'ludwig': r *= 1.15; g *= 0.95; b *= 0.95; break;
      case 'slumber': r = r * 0.9 + 20; g = g * 0.95 + 10; b = b * 0.82; break;
      case 'gingham': r = r * 0.85 + 30; g = g * 0.85 + 32; b = b * 0.88 + 35; break;
      case 'mayfair': r *= 1.10; g *= 0.96; b *= 1.02; break;
      case 'rise': r = r < 128 ? r + (128 - r) * 0.18 : r; g = g < 128 ? g + (128 - g) * 0.12 : g; b *= 0.88; break;
      case 'hudson': r *= 0.88; g *= 1.02; b *= 1.15; break;
      case 'sierra': r = r * 0.88 + 25; g = g * 0.88 + 20; b = b * 0.82 + 15; break;
      case 'willow': let lw = 0.299 * r + 0.587 * g + 0.114 * b; r = lw * 0.95 + 10; g = lw * 0.92 + 10; b = lw * 0.98 + 12; break;
      case 'inkwell': let li = 0.299 * r + 0.587 * g + 0.114 * b; r = g = b = li < 128 ? (li * li) / 128 : 255 - ((255 - li) * (255 - li)) / 128; break;
    }
    return { r, g, b };
  }

  function applyFilmEffect(photoCtx, w, h, fade, grain){
    const imgData = photoCtx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const f = fade / 100; const g = grain / 100;
    const cx = w / 2, cy = h / 2; const maxDist = Math.sqrt(cx*cx + cy*cy);

    for (let py = 0; py < h; py++){
      for (let px = 0; px < w; px++){
        const i = (py * w + px) * 4;
        let r = d[i], gg = d[i+1], b = d[i+2];
        if (currentFilter !== 'none') {
          const pr = processInstagramFilter(r, gg, b, currentFilter);
          r = pr.r; gg = pr.g; b = pr.b;
        }
        r = r + (252 - r) * (0.14 + 0.10*f); gg = gg + (226 - gg) * (0.10 + 0.09*f); b = b + (196 - b) * (0.05 + 0.07*f);
        const lumH = 0.299*r + 0.587*gg + 0.114*b;
        if (lumH > 150){
          const t = (lumH - 150) / 105; const boost = Math.min(1, t) * (0.35 + 0.35*f);
          r = r + (255 - r) * boost; gg = gg + (255 - gg) * boost; b = b + (255 - b) * boost;
        }
        const lum = 0.299*r + 0.587*gg + 0.114*b;
        r = r + (lum - r) * (0.20 + 0.14*f); gg = gg + (lum - gg) * (0.20 + 0.14*f); b = b + (lum - b) * (0.20 + 0.14*f);
        r = 128 + (r - 128) * (1 - (0.22 + 0.14*f)); gg = 128 + (gg - 128) * (1 - (0.22 + 0.14*f)); b = 128 + (b - 128) * (1 - (0.22 + 0.14*f));
        const dist = Math.sqrt((px-cx)*(px-cx) + (py-cy)*(py-cy)) / maxDist;
        const vig = 1 - Math.pow(dist, 2.4) * (0.22 + 0.16*f);
        r = r * vig + 8 * (1-vig); gg = gg * vig + 4 * (1-vig); b = b * vig;
        if (g > 0){ const n = (Math.random() * 2 - 1) * 26 * g; r += n; gg += n; b += n; }
        d[i] = Math.max(0, Math.min(255, r)); d[i+1] = Math.max(0, Math.min(255, gg)); d[i+2] = Math.max(0, Math.min(255, b));
      }
    }
    photoCtx.putImageData(imgData, 0, 0);
  }

  function applyHaze(photoCanvas, w, h, haze){
    const hVal = haze / 100; if (hVal <= 0) return;
    const pctx = photoCanvas.getContext('2d');
    const blurPx = 1.5 + hVal * 9;
    const softCanvas = document.createElement('canvas');
    softCanvas.width = w; softCanvas.height = h;
    const sctx = softCanvas.getContext('2d');
    sctx.filter = `blur(${blurPx}px)`; sctx.drawImage(photoCanvas, 0, 0);
    pctx.save(); pctx.globalCompositeOperation = 'screen'; pctx.globalAlpha = 0.30 + 0.30 * hVal; pctx.drawImage(softCanvas, 0, 0); pctx.restore();
    pctx.save();
    const grad = pctx.createRadialGradient(w*0.82, h*0.10, 0, w*0.82, h*0.10, Math.max(w,h)*0.85);
    grad.addColorStop(0, `rgba(255,238,214,${0.45*hVal})`); grad.addColorStop(1, 'rgba(255,238,214,0)');
    pctx.globalCompositeOperation = 'screen'; pctx.fillStyle = grad; pctx.fillRect(0, 0, w, h); pctx.restore();
  }

  let paperTexture = null;
  function getPaperTexture(){
    if (paperTexture) return paperTexture;
    const t = document.createElement('canvas'); t.width = 180; t.height = 180;
    const tctx = t.getContext('2d'); const imgData = tctx.createImageData(180, 180);
    for (let i = 0; i < imgData.data.length; i += 4){
      const v = 232 + Math.random() * 23;
      imgData.data[i] = v; imgData.data[i+1] = v; imgData.data[i+2] = v; imgData.data[i+3] = 255;
    }
    tctx.putImageData(imgData, 0, 0); paperTexture = t; return t;
  }

  function render(){
    ctx.clearRect(0, 0, cardWidth, cardHeight);
    const frameColor = frameStyle === 'noir' ? '#171512' : '#ffffff';
    const inkColor = '#2b2622'; const dateColor = '#ff8a1f';

    ctx.fillStyle = frameColor; roundRect(ctx, 0, 0, cardWidth, cardHeight, 6); ctx.fill();
    ctx.save(); roundRect(ctx, 0, 0, cardWidth, cardHeight, 6); ctx.clip();
    const pattern = ctx.createPattern(getPaperTexture(), 'repeat');
    ctx.globalCompositeOperation = frameStyle === 'noir' ? 'overlay' : 'multiply';
    ctx.globalAlpha = frameStyle === 'noir' ? 0.10 : 0.25;
    ctx.fillStyle = pattern; ctx.fillRect(0, 0, cardWidth, cardHeight); ctx.restore();

    layoutSlots.forEach((slot, index) => {
      const slotImgState = sourceImages[index];
      if (!slotImgState) {
        ctx.fillStyle = frameStyle === 'noir' ? '#2a2622' : '#f0ebdf'; ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
      } else {
        const photoCanvas = document.createElement('canvas'); 
        photoCanvas.width = slot.w; 
        photoCanvas.height = slot.h;
        const pctx = photoCanvas.getContext('2d');

        const imgW = slotImgState.img.naturalWidth;
        const imgH = slotImgState.img.naturalHeight;
        const imgAspect = imgW / imgH;
        const slotAspect = slot.w / slot.h;

        let drawW, drawH;
        if (imgAspect > slotAspect) {
          drawH = slot.h * slotImgState.zoom;
          drawW = drawH * imgAspect;
        } else {
          drawW = slot.w * slotImgState.zoom;
          drawH = drawW / imgAspect;
        }

        const xOffset = (slot.w - drawW) / 2 + slotImgState.cx;
        const yOffset = (slot.h - drawH) / 2 + slotImgState.cy;

        pctx.drawImage(slotImgState.img, xOffset, yOffset, drawW, drawH);

        applyFilmEffect(pctx, slot.w, slot.h, parseInt(fadeSlider.value, 10), parseInt(grainSlider.value, 10));
        applyHaze(photoCanvas, slot.w, slot.h, parseInt(hazeSlider.value, 10));

        if (dateStampEnabled && index === currentCount - 1) {
          const d = new Date();
          const stamp = String(d.getMonth()+1).padStart(2,'0') + ' ' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getFullYear()).slice(-2);
          pctx.font = '600 22px "IBM Plex Mono", monospace'; pctx.textAlign = 'right'; pctx.textBaseline = 'bottom';
          pctx.shadowColor = 'rgba(255,138,31,.55)'; pctx.shadowBlur = 6; pctx.fillStyle = dateColor;
          pctx.fillText(stamp, slot.w - 22, slot.h - 20); pctx.shadowBlur = 0;
        }
        ctx.drawImage(photoCanvas, slot.x, slot.y);
      }
      ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1; ctx.strokeRect(slot.x + 0.5, slot.y + 0.5, slot.w - 1, slot.h - 1);
    });
    drawCaption(inkColor);
  }

  function drawCaption(inkColor){
    const text = captionInput.value.trim(); if (!text) return;
    ctx.font = '500 46px "Caveat", cursive'; ctx.fillStyle = inkColor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const bandCenterY = cardHeight - (190 / 2) + 6; ctx.fillText(text, cardWidth / 2, bandCenterY, cardWidth - 92);
  }

  function roundRect(c, x, y, w, h, r){
    c.beginPath(); c.moveTo(x+r, y); c.arcTo(x+w, y, x+w, y+h, r); c.arcTo(x+w, y+h, x, y+h, r); c.arcTo(x, y+h, x, y, r); c.arcTo(x, y, x+w, y, r); c.closePath();
  }

  recalculateCardArchitecture();
  updateTilt();
  render();

  function executeTriggerExport() {
    if (sourceImages.length === 0) return;
    const angleDeg = parseInt(tiltSlider.value, 10);
    const angle = angleDeg * Math.PI / 180;
    const w = cardWidth, h = cardHeight;
    const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
    const boundW = w * cos + h * sin, boundH = w * sin + h * cos;
    const shadowPad = 90;
    const outW = Math.ceil(boundW + shadowPad * 2), outH = Math.ceil(boundH + shadowPad * 2);

    const outCanvas = document.createElement('canvas'); outCanvas.width = outW; outCanvas.height = outH;
    const octx = outCanvas.getContext('2d');
    octx.save(); octx.translate(outW / 2, outH / 2); octx.rotate(angle);
    octx.shadowColor = 'rgba(0,0,0,0.55)'; octx.shadowBlur = 42; octx.shadowOffsetX = 0; octx.shadowOffsetY = 22;
    octx.drawImage(canvas, -w / 2, -h / 2, w, h); octx.restore();

    const link = document.createElement('a');
    link.download = `polaroid-${currentRatio}-${currentCount}x.png`;
    link.href = outCanvas.toDataURL('image/png');
    link.click();
  }
  saveBtn.addEventListener('click', executeTriggerExport);
  mobileSaveBtn.addEventListener('click', executeTriggerExport);

})();