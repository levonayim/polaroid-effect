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

  const activePointers = new Map();
  let pinchStartDist = null;
  let pinchStartZoom = 1;
  let lastSingleX = null, lastSingleY = null;
  let rafPending = false;

  function recalculateCardArchitecture() {
    let baseOuterW = 720;
    let baseOuterH = 860;
    
    if (currentRatio === 'mini') baseOuterW = 540;
    if (currentRatio === 'wide') baseOuterW = 1080;

    const marginSide = 46;
    const marginTop = 46;
    const marginBottom = 190; 

    let insideW = baseOuterW - (marginSide * 2);
    let insideH = baseOuterH - marginTop - marginBottom;

    if (currentCount > 1) {
      if (currentOrient === 'vertical') {
        baseOuterH = marginTop + (insideH * currentCount) + (16 * (currentCount - 1)) + marginBottom;
      } else {
        baseOuterW = marginSide + (insideW * currentCount) + (16 * (currentCount - 1)) + marginSide;
      }
    }

    cardWidth = baseOuterW;
    cardHeight = baseOuterH;
    
    canvas.width = cardWidth;
    canvas.height = cardHeight;
    canvas.style.width = cardWidth + 'px';

    layoutSlots = [];
    let photoAreaW = cardWidth - (marginSide * 2);
    let photoAreaH = cardHeight - marginTop - marginBottom;

    if (currentOrient === 'vertical') {
      let individualH = (photoAreaH - (16 * (currentCount - 1))) / currentCount;
      for (let i = 0; i < currentCount; i++) {
        layoutSlots.push({
          x: marginSide,
          y: marginTop + i * (individualH + 16),
          w: photoAreaW,
          h: individualH
        });
      }
    } else {
      let individualW = (photoAreaW - (16 * (currentCount - 1))) / currentCount;
      for (let i = 0; i < currentCount; i++) {
        layoutSlots.push({
          x: marginSide + i * (individualW + 16),
          y: marginTop,
          w: individualW,
          h: photoAreaH
        });
      }
    }

    photoStage.style.left = (marginSide / cardWidth * 100) + '%';
    photoStage.style.top = (marginTop / cardHeight * 100) + '%';
    photoStage.style.width = ((cardWidth - marginSide * 2) / cardWidth * 100) + '%';
    photoStage.style.height = ((cardHeight - marginTop - marginBottom) / cardHeight * 100) + '%';
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
    const targetBounds = layoutSlots[activeSlotIndex];
    
    const local = toLocalDelta(dxScreen, dyScreen);
    const displayScale = canvas.clientWidth / canvas.width;
    const localCanvasDx = local.dx / displayScale;
    const localCanvasDy = local.dy / displayScale;

    const aspectImage = slotState.img.naturalWidth / slotState.img.naturalHeight;
    const aspectTarget = targetBounds.w / targetBounds.h;
    
    let baseScaleWidth, baseScaleHeight;
    if (aspectImage > aspectTarget) {
      baseScaleHeight = slotState.img.naturalHeight;
      baseScaleWidth = slotState.img.naturalHeight * aspectTarget;
    } else {
      baseScaleWidth = slotState.img.naturalWidth;
      baseScaleHeight = slotState.img.naturalWidth / aspectTarget;
    }

    const currentCropW = baseScaleWidth / slotState.zoom;
    const currentCropH = baseScaleHeight / slotState.zoom;

    slotState.cx -= localCanvasDx * (currentCropW / targetBounds.w);
    slotState.cy -= localCanvasDy * (currentCropH / targetBounds.h);
  }

  function showHint(){
    stageHint.classList.add('show');
    clearTimeout(showHint._t);
    showHint._t = setTimeout(() => stageHint.classList.remove('show'), 2600);
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
    if (sourceImages.length === 0) return;
    photoStage.setPointerCapture(e.pointerId);
    
    if (activePointers.size === 0) {
      activeSlotIndex = determineSlotIndexFromEvent(e);
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
        lastSingleX = e.clientX;
        lastSingleY = e.clientY;
        panBy(dxScreen, dyScreen);
      }
      scheduleRender();
    }
  });

  function endPointer(e){
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

  photoStage.addEventListener('dblclick', (e) => {
    const targetedSlot = determineSlotIndexFromEvent(e);
    if (sourceImages[targetedSlot]) {
      sourceImages[targetedSlot].zoom = 1;
      sourceImages[targetedSlot].cx = sourceImages[targetedSlot].img.naturalWidth / 2;
      sourceImages[targetedSlot].cy = sourceImages[targetedSlot].img.naturalHeight / 2;
      render();
    }
  });

  dropzone.addEventListener('click', () => fileInput.click());
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
    if (files && files.length > 0) loadFiles(files);
  });

  function loadFiles(files) {
    let filesArray = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, currentCount);
    if (filesArray.length === 0) return;

    sourceImages = [];
    let loadedCounter = 0;

    filesArray.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = evt => {
        const img = new Image();
        img.onload = () => {
          sourceImages[index] = {
            img: img,
            zoom: 1,
            cx: img.naturalWidth / 2,
            cy: img.naturalHeight / 2
          };
          loadedCounter++;
          if (loadedCounter === filesArray.length) {
            finalizeAssetPipeline();
          }
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function finalizeAssetPipeline() {
    for (let i = 0; i < currentCount; i++) {
      if (!sourceImages[i] && sourceImages[0]) {
        sourceImages[i] = {
          img: sourceImages[0].img,
          zoom: 1,
          cx: sourceImages[0].img.naturalWidth / 2,
          cy: sourceImages[0].img.naturalHeight / 2
        };
      }
    }
    dropzone.classList.add('hidden');
    photoStage.classList.add('active');
    saveBtn.disabled = false;
    render();
    triggerDevelop();
    showHint();
  }

  function triggerDevelop(){
    cardWrap.classList.remove('developing');
    void cardWrap.offsetWidth;
    cardWrap.classList.add('developing');
  }

  resetBtn.addEventListener('click', () => {
    sourceImages = [];
    saveBtn.disabled = true;
    dropzone.classList.remove('hidden');
    photoStage.classList.remove('active');
    stageHint.classList.remove('show');
    fileInput.value = '';
    captionInput.value = '';
    filterSelect.value = 'none';
    currentFilter = 'none';
    ctx.clearRect(0,0,canvas.width,canvas.height);
    updateTilt();
    render();
  });

  ratioSeg.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    [...ratioSeg.children].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRatio = btn.dataset.ratio;
    recalculateCardArchitecture();
    render();
  });

  countSeg.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    [...countSeg.children].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCount = parseInt(btn.dataset.count, 10);
    
    orientationField.style.display = currentCount > 1 ? 'block' : 'none';
    
    recalculateCardArchitecture();
    if (sourceImages.length > 0) {
      finalizeAssetPipeline();
    } else {
      render();
    }
  });

  orientSeg.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    [...orientSeg.children].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentOrient = btn.dataset.orient;
    recalculateCardArchitecture();
    render();
  });

  filterSelect.addEventListener('change', e => {
    currentFilter = e.target.value;
    render();
  });

  fadeSlider.addEventListener('input', () => { fadeVal.textContent = fadeSlider.value; render(); });
  hazeSlider.addEventListener('input', () => { hazeVal.textContent = hazeSlider.value; render(); });
  grainSlider.addEventListener('input', () => { grainVal.textContent = grainSlider.value; render(); });
  tiltSlider.addEventListener('input', () => { updateTilt(); });
  captionInput.addEventListener('input', render);
  dateToggle.addEventListener('click', () => {
    dateStampEnabled = !dateStampEnabled;
    dateToggle.classList.toggle('on', dateStampEnabled);
    render();
  });
  frameSeg.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    [...frameSeg.children].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    frameStyle = btn.dataset.frame;
    render();
  });

  function updateTilt(){
    const deg = parseInt(tiltSlider.value, 10);
    tiltVal.textContent = deg + '°';
    cardWrap.style.transform = `rotate(${deg}deg)`;
  }

  function getCropRect(img, zoom, cx, cy, targetW, targetH){
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const aspectImage = iw / ih;
    const aspectTarget = targetW / targetH;
    
    let baseScaleW, baseScaleH;
    if (aspectImage > aspectTarget) {
      baseScaleH = ih;
      baseScaleW = ih * aspectTarget;
    } else {
      baseScaleW = iw;
      baseScaleH = iw / aspectTarget;
    }

    const cropW = baseScaleW / zoom;
    const cropH = baseScaleH / zoom;
    
    let sx = cx - cropW / 2;
    let sy = cy - cropH / 2;
    
    sx = Math.max(0, Math.min(iw - cropW, sx));
    sy = Math.max(0, Math.min(ih - cropH, sy));
    
    return { sx, sy, sw: cropW, sh: cropH };
  }

  // ---------- Advanced LUT/Instagram Filter Shader Mapping Matrix ----------
  function processInstagramFilter(r, g, b, filterName) {
    switch (filterName) {
      case 'clarendon': // Boost highlights & deepen shadow channels
        r = r > 128 ? r + (255 - r) * 0.12 : r * 0.95;
        g = g > 128 ? g + (255 - g) * 0.15 : g * 0.98;
        b = b > 128 ? b + (255 - b) * 0.22 : b * 0.90;
        break;
      case 'juno': // Vivid red/yellow enhancements
        r *= 1.18; g *= 1.05; b *= 0.88;
        break;
      case 'lark': // Cool down greens and desaturate values
        r *= 1.02; g *= 0.92; b *= 1.12;
        break;
      case 'reyes': // Faded, low contrast, vintage warm tint
        r = r * 0.85 + 35; g = g * 0.85 + 30; b = b * 0.75 + 20;
        break;
      case 'valencia': // Antique warm yellow overlay glow
        r *= 1.12; g *= 1.08; b *= 0.82;
        r = r * 0.9 + 15;
        break;
      case 'gotham': // Stark monochrome deep blue cinematic shadow
        let lumG = 0.299 * r + 0.587 * g + 0.114 * b;
        r = lumG * 0.9; g = lumG * 0.95; b = lumG * 1.15;
        if (b > 100) b += (255 - b) * 0.1;
        break;
      case 'xpro2': // Cross processed hard vignettes and teal contrast
        r = r < 128 ? r * 0.85 : r + (255 - r) * 0.15;
        g = g * 1.05;
        b = b < 128 ? b * 1.22 : b * 0.78;
        break;
      case 'lofi': // High-saturation hard-contrast push
        r = r < 128 ? (r * r) / 128 : 255 - ((255 - r) * (255 - r)) / 128;
        g = g < 128 ? (g * g) / 128 : 255 - ((255 - g) * (255 - g)) / 128;
        b = b < 128 ? (b * b) / 128 : 255 - ((255 - b) * (255 - b)) / 128;
        r *= 1.12; g *= 1.12;
        break;
      case 'aden': // Soft cream pastel low-mid tones
        r = r * 0.9 + 25; g = g * 0.88 + 20; b = b * 0.85 + 30;
        break;
      case 'perpetua': // Earthy warm greens & deep turquoise accents
        g *= 1.06; b *= 1.04;
        break;
      case 'crema': // Warm desaturated matte look
        r = r * 0.92 + 15; g = g * 0.90 + 15; b = b * 0.82 + 25;
        let lC = 0.3 * r + 0.59 * g + 0.11 * b;
        r = r + (lC - r) * 0.2; g = g + (lC - g) * 0.2; b = b + (lC - b) * 0.2;
        break;
      case 'ludwig': // Clean flash reds pop while losing greens
        r *= 1.15; g *= 0.95; b *= 0.95;
        break;
      case 'slumber': // Dreamy retro yellow-green wash shift
        r = r * 0.9 + 20; g = g * 0.95 + 10; b = b * 0.82;
        break;
      case 'gingham': // Muted highlights with faded light grey-blue base
        r = r * 0.85 + 30; g = g * 0.85 + 32; b = b * 0.88 + 35;
        break;
      case 'mayfair': // Pink hue border balance with slight saturation drop
        r *= 1.10; g *= 0.96; b *= 1.02;
        break;
      case 'rise': // Low light warming filter emulation
        r = r < 128 ? r + (128 - r) * 0.18 : r;
        g = g < 128 ? g + (128 - g) * 0.12 : g;
        b *= 0.88;
        break;
      case 'hudson': // Icy cold tinting with high brightness
        r *= 0.88; g *= 1.02; b *= 1.15;
        break;
      case 'sierra': // Autumn morning foggy desaturated low contrast
        r = r * 0.88 + 25; g = g * 0.88 + 20; b = b * 0.82 + 15;
        break;
      case 'willow': // Soft monochrome matte with purple-grey shadow elements
        let lW = 0.299 * r + 0.587 * g + 0.114 * b;
        r = lW * 0.95 + 10; g = lW * 0.92 + 10; b = lW * 0.98 + 12;
        break;
      case 'inkwell': // Direct harsh black & white values setup
        let lI = 0.299 * r + 0.587 * g + 0.114 * b;
        r = g = b = lI < 128 ? (lI * lI) / 128 : 255 - ((255 - lI) * (255 - lI)) / 128;
        break;
    }
    return { r, g, b };
  }

  function applyFilmEffect(photoCtx, w, h, fade, grain){
    const imgData = photoCtx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const f = fade / 100;
    const g = grain / 100;
    const cx = w / 2, cy = h / 2;
    const maxDist = Math.sqrt(cx*cx + cy*cy);

    for (let py = 0; py < h; py++){
      for (let px = 0; px < w; px++){
        const i = (py * w + px) * 4;
        let r = d[i], gg = d[i+1], b = d[i+2];

        // Apply selected Instagram lookup algorithm prior to chemical processing
        if (currentFilter !== 'none') {
          const processed = processInstagramFilter(r, gg, b, currentFilter);
          r = processed.r; gg = processed.g; b = processed.b;
        }

        r = r + (252 - r) * (0.14 + 0.10*f);
        gg = gg + (226 - gg) * (0.10 + 0.09*f);
        b = b + (196 - b) * (0.05 + 0.07*f);

        const lumH = 0.299*r + 0.587*gg + 0.114*b;
        if (lumH > 150){
          const t = (lumH - 150) / 105;
          const boost = Math.min(1, t) * (0.35 + 0.35*f);
          r = r + (255 - r) * boost;
          gg = gg + (255 - gg) * boost;
          b = b + (255 - b) * boost;
        }

        const lum = 0.299*r + 0.587*gg + 0.114*b;
        r = r + (lum - r) * (0.20 + 0.14*f);
        gg = gg + (lum - gg) * (0.20 + 0.14*f);
        b = b + (lum - b) * (0.20 + 0.14*f);

        r = 128 + (r - 128) * (1 - (0.22 + 0.14*f));
        gg = 128 + (gg - 128) * (1 - (0.22 + 0.14*f));
        b = 128 + (b - 128) * (1 - (0.22 + 0.14*f));

        const dist = Math.sqrt((px-cx)*(px-cx) + (py-cy)*(py-cy)) / maxDist;
        const vig = 1 - Math.pow(dist, 2.4) * (0.22 + 0.16*f);
        r = r * vig + 8 * (1-vig);
        gg = gg * vig + 4 * (1-vig);
        b = b * vig;

        if (g > 0){
          const n = (Math.random() * 2 - 1) * 26 * g;
          r += n; gg += n; b += n;
        }

        d[i]   = Math.max(0, Math.min(255, r));
        d[i+1] = Math.max(0, Math.min(255, gg));
        d[i+2] = Math.max(0, Math.min(255, b));
      }
    }
    photoCtx.putImageData(imgData, 0, 0);
  }

  function applyHaze(photoCanvas, w, h, haze){
    const hVal = haze / 100;
    if (hVal <= 0) return;
    const pctx = photoCanvas.getContext('2d');

    const blurPx = 1.5 + hVal * 9;
    const softCanvas = document.createElement('canvas');
    softCanvas.width = w; softCanvas.height = h;
    const sctx = softCanvas.getContext('2d');
    sctx.filter = `blur(${blurPx}px)`;
    sctx.drawImage(photoCanvas, 0, 0);

    pctx.save();
    pctx.globalCompositeOperation = 'screen';
    pctx.globalAlpha = 0.30 + 0.30 * hVal;
    pctx.drawImage(softCanvas, 0, 0);
    pctx.restore();

    pctx.save();
    const grad = pctx.createRadialGradient(
      w*0.82, h*0.10, 0,
      w*0.82, h*0.10, Math.max(w,h)*0.85
    );
    grad.addColorStop(0, `rgba(255,238,214,${0.45*hVal})`);
    grad.addColorStop(1, 'rgba(255,238,214,0)');
    pctx.globalCompositeOperation = 'screen';
    pctx.fillStyle = grad;
    pctx.fillRect(0, 0, w, h);
    pctx.restore();
  }

  let paperTexture = null;
  function getPaperTexture(){
    if (paperTexture) return paperTexture;
    const t = document.createElement('canvas');
    t.width = 180; t.height = 180;
    const tctx = t.getContext('2d');
    const imgData = tctx.createImageData(180, 180);
    for (let i = 0; i < imgData.data.length; i += 4){
      const v = 232 + Math.random() * 23;
      imgData.data[i] = v;
      imgData.data[i+1] = v;
      imgData.data[i+2] = v;
      imgData.data[i+3] = 255;
    }
    tctx.putImageData(imgData, 0, 0);
    paperTexture = t;
    return t;
  }

  function render(){
    ctx.clearRect(0, 0, cardWidth, cardHeight);

    // Frame setup updated: Classic is now clean white (#ffffff)
    const frameColor = frameStyle === 'noir' ? '#171512' : '#ffffff';
    const inkColor = '#2b2622'; // Keep readable elegant black ink markers across variants
    const dateColor = '#ff8a1f';

    ctx.fillStyle = frameColor;
    roundRect(ctx, 0, 0, cardWidth, cardHeight, 6);
    ctx.fill();

    ctx.save();
    roundRect(ctx, 0, 0, cardWidth, cardHeight, 6);
    ctx.clip();
    const pattern = ctx.createPattern(getPaperTexture(), 'repeat');
    ctx.globalCompositeOperation = frameStyle === 'noir' ? 'overlay' : 'multiply';
    ctx.globalAlpha = frameStyle === 'noir' ? 0.10 : 0.25; // Lightened to keep look natural over white paper surfaces
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, cardWidth, cardHeight);
    ctx.restore();

    layoutSlots.forEach((slot, index) => {
      const slotImgState = sourceImages[index];

      if (!slotImgState) {
        ctx.fillStyle = frameStyle === 'noir' ? '#2a2622' : '#f0ebdf';
        ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
      } else {
        const photoCanvas = document.createElement('canvas');
        photoCanvas.width = slot.w;
        photoCanvas.height = slot.h;
        const pctx = photoCanvas.getContext('2d');

        const crop = getCropRect(slotImgState.img, slotImgState.zoom, slotImgState.cx, slotImgState.cy, slot.w, slot.h);
        
        slotImgState.cx = crop.sx + crop.sw / 2;
        slotImgState.cy = crop.sy + crop.sh / 2;

        pctx.drawImage(slotImgState.img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, slot.w, slot.h);

        applyFilmEffect(pctx, slot.w, slot.h, parseInt(fadeSlider.value, 10), parseInt(grainSlider.value, 10));
        applyHaze(photoCanvas, slot.w, slot.h, parseInt(hazeSlider.value, 10));

        if (dateStampEnabled && index === currentCount - 1) {
          const d = new Date();
          const stamp = String(d.getMonth()+1).padStart(2,'0') + ' ' +
                        String(d.getDate()).padStart(2,'0') + ' ' +
                        String(d.getFullYear()).slice(-2);
          pctx.font = '600 22px "IBM Plex Mono", monospace';
          pctx.textAlign = 'right';
          pctx.textBaseline = 'bottom';
          pctx.shadowColor = 'rgba(255,138,31,.55)';
          pctx.shadowBlur = 6;
          pctx.fillStyle = dateColor;
          pctx.fillText(stamp, slot.w - 22, slot.h - 20);
          pctx.shadowBlur = 0;
        }

        ctx.drawImage(photoCanvas, slot.x, slot.y);
      }

      ctx.strokeStyle = 'rgba(0,0,0,.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(slot.x + 0.5, slot.y + 0.5, slot.w - 1, slot.h - 1);
    });

    drawCaption(inkColor);
  }

  function drawCaption(inkColor){
    const text = captionInput.value.trim();
    if (!text) return;
    ctx.font = '500 46px "Caveat", cursive';
    ctx.fillStyle = inkColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const bandCenterY = cardHeight - (190 / 2) + 6;
    ctx.fillText(text, cardWidth / 2, bandCenterY, cardWidth - 92);
  }

  function roundRect(c, x, y, w, h, r){
    c.beginPath();
    c.moveTo(x+r, y);
    c.arcTo(x+w, y, x+w, y+h, r);
    c.arcTo(x+w, y+h, x, y+h, r);
    c.arcTo(x, y+h, x, y, r);
    c.arcTo(x, y, x+w, y, r);
    c.closePath();
  }

  recalculateCardArchitecture();
  updateTilt();
  render();

  saveBtn.addEventListener('click', () => {
    if (sourceImages.length === 0) return;

    const angleDeg = parseInt(tiltSlider.value, 10);
    const angle = angleDeg * Math.PI / 180;

    const w = cardWidth, h = cardHeight;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const boundW = w * cos + h * sin;
    const boundH = w * sin + h * cos;

    const shadowPad = 90;
    const outW = Math.ceil(boundW + shadowPad * 2);
    const outH = Math.ceil(boundH + shadowPad * 2);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    const octx = outCanvas.getContext('2d');

    octx.save();
    octx.translate(outW / 2, outH / 2);
    octx.rotate(angle);

    octx.shadowColor = 'rgba(0,0,0,0.55)';
    octx.shadowBlur = 42;
    octx.shadowOffsetX = 0;
    octx.shadowOffsetY = 22;

    octx.drawImage(canvas, -w / 2, -h / 2, w, h);
    octx.restore();

    const link = document.createElement('a');
    link.download = `polaroid-${currentRatio}-${currentCount}x.png`;
    link.href = outCanvas.toDataURL('image/png');
    link.click();
  });

})();