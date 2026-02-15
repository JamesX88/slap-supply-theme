/* ============================================================
   SLAP SUPPLY — STICKER CUSTOMIZER ENGINE
   Vanilla JS — No frameworks required
   Features: Upload + DPI, BG Removal, Shape Selection,
             Canvas Preview, Pricing, Shopify Cart
   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     STATE
     ---------------------------------------------------------- */
  const STATE = {
    // Step
    currentStep: 1,
    // Upload
    file: null,
    originalImage: null,   // HTMLImageElement (original)
    processedImage: null,  // HTMLImageElement (bg removed)
    processedCanvas: null, // Canvas element with alpha data (for contour tracing)
    showOriginal: true,
    imageDataURL: null,
    processedDataURL: null,
    imageDPI: 0,
    imageWidth: 0,
    imageHeight: 0,
    // Shape
    cutType: 'die-cut',
    presetShape: 'square',
    contourPadding: 8,
    contourPath: null,     // array of {x,y} points
    // Image transform (for preset shapes)
    imgX: 0, imgY: 0, imgScale: 1, imgRotation: 0,
    // Drag state
    _dragging: false,
    _dragStartX: 0,
    _dragStartY: 0,
    _dragStartImgX: 0,
    _dragStartImgY: 0,
    // Configure
    sizeW: 2, sizeH: 2, sizeLabel: '2x2',
    material: 'vinyl',
    finish: 'none',
    quantity: 50,
    rush: 'normal',
    rushSurcharge: 0,
    // Canvas
    canvasZoom: 1,
    // Pricing (placeholder — easily customizable)
    pricingTable: {
      50:   { base: 1.50 },
      100:  { base: 1.20 },
      250:  { base: 0.85 },
      500:  { base: 0.60 },
      1000: { base: 0.40 }
    }
  };

  /* ----------------------------------------------------------
     DOM REFERENCES
     ---------------------------------------------------------- */
  let DOM = {};

  function cacheDom() {
    DOM = {
      // Steps
      steps: document.querySelectorAll('.sc__step'),
      panels: document.querySelectorAll('.sc__panel'),
      nextBtns: document.querySelectorAll('.sc__btn-next, .sc__btn-back'),
      // Upload
      uploadZone: document.getElementById('scUploadZone'),
      fileInput: document.getElementById('scFileInput'),
      uploadPreview: document.getElementById('scUploadPreview'),
      previewImg: document.getElementById('scPreviewImg'),
      fileName: document.getElementById('scFileName'),
      fileMeta: document.getElementById('scFileMeta'),
      dpiBadge: document.getElementById('scDpiBadge'),
      dpiIcon: document.getElementById('scDpiIcon'),
      dpiText: document.getElementById('scDpiText'),
      removeBgBtn: document.getElementById('scRemoveBgBtn'),
      toggleBgBtn: document.getElementById('scToggleBgBtn'),
      removeFile: document.getElementById('scRemoveFile'),
      bgStatus: document.getElementById('scBgStatus'),
      bgFill: document.getElementById('scBgFill'),
      bgText: document.getElementById('scBgText'),
      step1Next: document.getElementById('scStep1Next'),
      // BG Overlay (Issue 1)
      bgOverlay: document.getElementById('scBgOverlay'),
      bgOverlayTitle: document.getElementById('scBgOverlayTitle'),
      bgOverlayStatus: document.getElementById('scBgOverlayStatus'),
      bgOverlayFill: document.getElementById('scBgOverlayFill'),
      bgOverlayPct: document.getElementById('scBgOverlayPct'),
      bgOverlaySubstatus: document.getElementById('scBgOverlaySubstatus'),
      // Shape
      diecutOptions: document.getElementById('scDiecutOptions'),
      presetOptions: document.getElementById('scPresetOptions'),
      contourPadding: document.getElementById('scContourPadding'),
      contourPaddingVal: document.getElementById('scContourPaddingVal'),
      // Image transform controls (for preset shapes)
      imageTransformControls: document.getElementById('scImageTransformControls'),
      imgScaleSlider: document.getElementById('scImgScale'),
      imgScaleVal: document.getElementById('scImgScaleVal'),
      imgRotationSlider: document.getElementById('scImgRotation'),
      imgRotationVal: document.getElementById('scImgRotationVal'),
      imgResetBtn: document.getElementById('scImgReset'),
      // Configure
      customSize: document.getElementById('scCustomSize'),
      customW: document.getElementById('scCustomW'),
      customH: document.getElementById('scCustomH'),
      qtyTiers: document.getElementById('scQtyTiers'),
      customQty: document.getElementById('scCustomQty'),
      qtyInput: document.getElementById('scQtyInput'),
      // Canvas
      canvasWrap: document.getElementById('scCanvasWrap'),
      canvas: document.getElementById('scCanvas'),
      placeholder: document.getElementById('scPlaceholder'),
      previewDims: document.getElementById('scPreviewDims'),
      dimW: document.getElementById('scDimW'),
      dimH: document.getElementById('scDimH'),
      // Preview specs
      pvSize: document.getElementById('pvSize'),
      pvMaterial: document.getElementById('pvMaterial'),
      pvShape: document.getElementById('pvShape'),
      pvQty: document.getElementById('pvQty'),
      // Summary
      sumShape: document.getElementById('sumShape'),
      sumSize: document.getElementById('sumSize'),
      sumMaterial: document.getElementById('sumMaterial'),
      sumFinish: document.getElementById('sumFinish'),
      sumQty: document.getElementById('sumQty'),
      sumRush: document.getElementById('sumRush'),
      sumUnitPrice: document.getElementById('sumUnitPrice'),
      sumSurcharge: document.getElementById('sumSurcharge'),
      sumTotal: document.getElementById('sumTotal'),
      // Cart
      addToCart: document.getElementById('scAddToCart'),
      instructions: document.getElementById('scInstructions'),
      success: document.getElementById('scSuccess'),
      // Zoom
      zoomIn: document.getElementById('scZoomIn'),
      zoomOut: document.getElementById('scZoomOut'),
      zoomReset: document.getElementById('scZoomReset')
    };
  }

  /* ----------------------------------------------------------
     STEP NAVIGATION
     ---------------------------------------------------------- */
  function goToStep(num) {
    if (num < 1 || num > 5) return;
    // Validate step 1 — must have image
    if (num > 1 && !STATE.originalImage) {
      goToStep(1);
      return;
    }
    STATE.currentStep = num;

    DOM.steps.forEach(function (s) {
      var sNum = parseInt(s.dataset.step);
      s.classList.remove('sc__step--active', 'sc__step--done');
      if (sNum < num) s.classList.add('sc__step--done');
      if (sNum === num) s.classList.add('sc__step--active');
    });

    DOM.panels.forEach(function (p) {
      p.classList.remove('sc__panel--active');
    });
    var panel = document.querySelector('[data-panel="' + num + '"]');
    if (panel) panel.classList.add('sc__panel--active');

    // Trigger updates on step entry
    if (num === 2) {
      updateContour();
      updateTransformControlsVisibility();
    }
    if (num === 4 || num === 2 || num === 3) renderCanvas();
    if (num === 5) updateSummary();
    updatePreviewSpecs();

    // Scroll to top of section
    var hero = document.querySelector('.sc__progress');
    if (hero) hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ----------------------------------------------------------
     FILE UPLOAD & DPI CHECK
     ---------------------------------------------------------- */
  function initUpload() {
    if (!DOM.uploadZone) return;

    DOM.uploadZone.addEventListener('click', function () {
      DOM.fileInput.click();
    });

    DOM.uploadZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      DOM.uploadZone.classList.add('sc__upload-zone--drag');
    });

    DOM.uploadZone.addEventListener('dragleave', function () {
      DOM.uploadZone.classList.remove('sc__upload-zone--drag');
    });

    DOM.uploadZone.addEventListener('drop', function (e) {
      e.preventDefault();
      DOM.uploadZone.classList.remove('sc__upload-zone--drag');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    DOM.fileInput.addEventListener('change', function () {
      if (DOM.fileInput.files.length) handleFile(DOM.fileInput.files[0]);
    });

    DOM.removeFile.addEventListener('click', resetUpload);
  }

  function handleFile(file) {
    var validTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'application/pdf'];
    if (validTypes.indexOf(file.type) === -1) {
      alert('Please upload a PNG, JPG, SVG, or PDF file.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      alert('File size exceeds 50MB limit.');
      return;
    }

    STATE.file = file;
    DOM.fileName.textContent = file.name;

    if (file.type === 'application/pdf') {
      // For PDF, show a generic preview
      DOM.fileMeta.textContent = 'PDF file — ' + formatFileSize(file.size);
      DOM.previewImg.src = '';
      DOM.previewImg.alt = 'PDF file';
      showUploadPreview();
      // Create a simple placeholder image for canvas
      createPlaceholderImage('PDF');
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      STATE.imageDataURL = e.target.result;
      var img = new Image();
      img.onload = function () {
        STATE.originalImage = img;
        STATE.imageWidth = img.naturalWidth;
        STATE.imageHeight = img.naturalHeight;
        DOM.previewImg.src = STATE.imageDataURL;

        // DPI check
        checkDPI(file, img);

        // Show meta
        DOM.fileMeta.textContent = img.naturalWidth + ' × ' + img.naturalHeight + 'px — ' + formatFileSize(file.size);

        showUploadPreview();
        renderCanvas();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function createPlaceholderImage(text) {
    var c = document.createElement('canvas');
    c.width = 400; c.height = 400;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(0, 0, 400, 400);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '900 32px Oswald, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text + ' FILE', 200, 190);
    ctx.font = '400 16px "Space Grotesk", sans-serif';
    ctx.fillStyle = '#737373';
    ctx.fillText('Preview will use this placeholder', 200, 220);
    var img = new Image();
    img.onload = function () {
      STATE.originalImage = img;
      STATE.imageWidth = 400;
      STATE.imageHeight = 400;
      STATE.imageDataURL = c.toDataURL();
      DOM.previewImg.src = STATE.imageDataURL;
      renderCanvas();
    };
    img.src = c.toDataURL();
  }

  function checkDPI(file, img) {
    // Try to read DPI from JPEG EXIF or PNG pHYs
    // Fallback: estimate based on common print sizes
    var reader = new FileReader();
    reader.onload = function (e) {
      var arr = new Uint8Array(e.target.result);
      var dpi = extractDPI(arr, file.type);
      if (!dpi || dpi < 10) {
        // Estimate: assume the image is intended for 3" print
        dpi = Math.round(Math.max(img.naturalWidth, img.naturalHeight) / 3);
      }
      STATE.imageDPI = dpi;
      showDPIBadge(dpi);
    };
    reader.readAsArrayBuffer(file.slice(0, 65536)); // Read first 64KB for headers
  }

  function extractDPI(arr, type) {
    if (type === 'image/jpeg') {
      return extractJPEGDPI(arr);
    }
    if (type === 'image/png') {
      return extractPNGDPI(arr);
    }
    return 0;
  }

  function extractJPEGDPI(arr) {
    // Look for JFIF APP0 marker
    if (arr[0] !== 0xFF || arr[1] !== 0xD8) return 0;
    var offset = 2;
    while (offset < arr.length - 1) {
      if (arr[offset] !== 0xFF) break;
      var marker = arr[offset + 1];
      if (marker === 0xE0) { // APP0 JFIF
        var units = arr[offset + 11];
        var xDensity = (arr[offset + 12] << 8) | arr[offset + 13];
        var yDensity = (arr[offset + 14] << 8) | arr[offset + 15];
        if (units === 1) return Math.max(xDensity, yDensity); // DPI
        if (units === 2) return Math.round(Math.max(xDensity, yDensity) * 2.54); // dots/cm to DPI
        return 0;
      }
      var len = (arr[offset + 2] << 8) | arr[offset + 3];
      offset += 2 + len;
    }
    return 0;
  }

  function extractPNGDPI(arr) {
    // Look for pHYs chunk
    var sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (var i = 0; i < sig.length; i++) {
      if (arr[i] !== sig[i]) return 0;
    }
    var offset = 8;
    while (offset < arr.length - 12) {
      var chunkLen = (arr[offset] << 24) | (arr[offset + 1] << 16) | (arr[offset + 2] << 8) | arr[offset + 3];
      var chunkType = String.fromCharCode(arr[offset + 4], arr[offset + 5], arr[offset + 6], arr[offset + 7]);
      if (chunkType === 'pHYs') {
        var dataStart = offset + 8;
        var ppuX = (arr[dataStart] << 24) | (arr[dataStart + 1] << 16) | (arr[dataStart + 2] << 8) | arr[dataStart + 3];
        var ppuY = (arr[dataStart + 4] << 24) | (arr[dataStart + 5] << 16) | (arr[dataStart + 6] << 8) | arr[dataStart + 7];
        var unit = arr[dataStart + 8];
        if (unit === 1) { // meters
          return Math.round(Math.max(ppuX, ppuY) / 39.3701);
        }
        return 0;
      }
      offset += 12 + chunkLen;
    }
    return 0;
  }

  function showDPIBadge(dpi) {
    DOM.dpiBadge.style.display = 'inline-flex';
    if (dpi >= 300) {
      DOM.dpiBadge.className = 'sc__dpi-badge sc__dpi-badge--good';
      DOM.dpiIcon.textContent = '✓';
      DOM.dpiText.textContent = dpi + ' DPI — Print Ready';
    } else {
      DOM.dpiBadge.className = 'sc__dpi-badge sc__dpi-badge--warn';
      DOM.dpiIcon.textContent = '⚠';
      DOM.dpiText.textContent = dpi + ' DPI — Low Resolution (300+ recommended)';
    }
  }

  function showUploadPreview() {
    DOM.uploadZone.style.display = 'none';
    DOM.uploadPreview.style.display = 'flex';
    DOM.removeBgBtn.style.display = 'inline-flex';
    DOM.step1Next.disabled = false;
    if (DOM.placeholder) DOM.placeholder.style.display = 'none';
  }

  function resetUpload() {
    STATE.file = null;
    STATE.originalImage = null;
    STATE.processedImage = null;
    STATE.processedCanvas = null;
    STATE.showOriginal = true;
    STATE.imageDataURL = null;
    STATE.processedDataURL = null;
    STATE.imageDPI = 0;
    STATE.contourPath = null;
    DOM.fileInput.value = '';
    DOM.uploadZone.style.display = 'block';
    DOM.uploadPreview.style.display = 'none';
    DOM.dpiBadge.style.display = 'none';
    DOM.removeBgBtn.style.display = 'none';
    DOM.toggleBgBtn.style.display = 'none';
    DOM.bgStatus.style.display = 'none';
    DOM.step1Next.disabled = true;
    if (DOM.placeholder) DOM.placeholder.style.display = 'flex';
    renderCanvas();
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  /* ----------------------------------------------------------
     BACKGROUND REMOVAL — AI-Powered via BRIAAI RMBG-1.4 ONNX Model
     Single-stage IS-Net model for background removal.
     Model: https://huggingface.co/briaai/RMBG-1.4 (quantized ONNX, ~44 MB)
     Runtime: ONNX Runtime Web (WebAssembly)
     ---------------------------------------------------------- */

  /* --- ONNX Model Cache & Lazy Loader --- */
  var ONNX = {
    runtimeLoaded: false,
    runtimeLoading: false,
    session: null,
    modelLoaded: false,
    modelLoading: false,
    MODEL_URL: 'https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model_quantized.onnx'
  };

  /** Check if browser supports WebAssembly (required for ONNX Runtime Web) */
  function browserSupportsWasm() {
    try {
      if (typeof WebAssembly === 'object' &&
              typeof WebAssembly.instantiate === 'function') {
        var module = new WebAssembly.Module(
          new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
        );
        if (module instanceof WebAssembly.Module) {
          return new WebAssembly.Instance(module) instanceof WebAssembly.Instance;
        }
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  /** Dynamically load ONNX Runtime Web from CDN */
  function loadOnnxRuntime() {
    return new Promise(function (resolve, reject) {
      if (ONNX.runtimeLoaded && window.ort) {
        resolve();
        return;
      }
      if (ONNX.runtimeLoading) {
        var check = setInterval(function () {
          if (ONNX.runtimeLoaded) { clearInterval(check); resolve(); }
        }, 200);
        return;
      }
      ONNX.runtimeLoading = true;
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.min.js';
      script.onload = function () {
        ONNX.runtimeLoaded = true;
        ONNX.runtimeLoading = false;
        if (window.ort && window.ort.env && window.ort.env.wasm) {
          window.ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';
        }
        resolve();
      };
      script.onerror = function () {
        ONNX.runtimeLoading = false;
        reject(new Error('Failed to load ONNX Runtime Web from CDN'));
      };
      document.head.appendChild(script);
    });
  }

  /** Load the RMBG-1.4 ONNX model (cached after first load) */
  function loadOnnxModel(progressCb) {
    return new Promise(function (resolve, reject) {
      if (ONNX.modelLoaded && ONNX.session) { resolve(); return; }
      if (ONNX.modelLoading) {
        var check = setInterval(function () {
          if (ONNX.modelLoaded) { clearInterval(check); resolve(); }
        }, 200);
        return;
      }
      ONNX.modelLoading = true;

      progressCb('Loading AI model (~44 MB, first time may be slow)...', 15);

      var opts = { executionProviders: ['wasm'] };

      window.ort.InferenceSession.create(
        ONNX.MODEL_URL, opts
      ).then(function (session) {
        ONNX.session = session;
        ONNX.modelLoaded = true;
        ONNX.modelLoading = false;
        resolve();
      }).catch(function (err) {
        ONNX.modelLoading = false;
        reject(err);
      });
    });
  }

  /* --- Image preprocessing for RMBG-1.4 --- */

  /**
   * Preprocess image for RMBG-1.4:
   * 1. Resize to 1024x1024
   * 2. Normalize: (pixel/255 - 0.5) / 1.0 = pixel/255 - 0.5
   * 3. Transpose HWC → CHW
   * Returns Float32Array in NCHW format [1, 3, 1024, 1024]
   */
  function preprocessForRMBG(img) {
    var size = 1024;
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    var id = ctx.getImageData(0, 0, size, size);
    var d = id.data;
    var pixelCount = size * size;

    // Build CHW directly (R plane, then G plane, then B plane)
    var chw = new Float32Array(3 * pixelCount);
    for (var i = 0; i < pixelCount; i++) {
      chw[i]                  = d[i * 4]     / 255.0 - 0.5; // R
      chw[pixelCount + i]     = d[i * 4 + 1] / 255.0 - 0.5; // G
      chw[2 * pixelCount + i] = d[i * 4 + 2] / 255.0 - 0.5; // B
    }
    return chw;
  }

  /**
   * Postprocess RMBG-1.4 output:
   * 1. The model outputs a mask tensor
   * 2. Normalize to 0-1 range: (val - min) / (max - min)
   * 3. Resize from 1024x1024 back to original image dimensions
   * 4. Apply as alpha channel to original image
   */
  function postprocessRMBG(img, maskData) {
    var origW = img.naturalWidth || img.width;
    var origH = img.naturalHeight || img.height;
    var size = 1024;
    var pixelCount = size * size;

    // Normalize mask to 0-255
    var min = Infinity, max = -Infinity;
    for (var i = 0; i < maskData.length; i++) {
      if (maskData[i] < min) min = maskData[i];
      if (maskData[i] > max) max = maskData[i];
    }
    var range = max - min || 1;

    // Render mask to a 1024x1024 canvas
    var mc = document.createElement('canvas');
    mc.width = size; mc.height = size;
    var mctx = mc.getContext('2d');
    var mid = mctx.createImageData(size, size);
    // maskData may be larger than pixelCount if multi-channel; use first pixelCount values
    var len = Math.min(maskData.length, pixelCount);
    for (var i = 0; i < len; i++) {
      var v = Math.round(((maskData[i] - min) / range) * 255);
      mid.data[i * 4]     = v;
      mid.data[i * 4 + 1] = v;
      mid.data[i * 4 + 2] = v;
      mid.data[i * 4 + 3] = 255;
    }
    mctx.putImageData(mid, 0, 0);

    // Resize mask to original dimensions
    var rc = document.createElement('canvas');
    rc.width = origW; rc.height = origH;
    var rctx = rc.getContext('2d');
    rctx.drawImage(mc, 0, 0, origW, origH);
    var resizedMask = rctx.getImageData(0, 0, origW, origH).data;

    // Apply mask as alpha to original image
    var fc = document.createElement('canvas');
    fc.width = origW; fc.height = origH;
    var fctx = fc.getContext('2d');
    fctx.drawImage(img, 0, 0, origW, origH);
    var imgData = fctx.getImageData(0, 0, origW, origH);
    var d = imgData.data;
    for (var i = 0; i < origW * origH; i++) {
      d[i * 4 + 3] = resizedMask[i * 4]; // R channel = alpha
    }
    fctx.putImageData(imgData, 0, 0);

    var dataURL = fc.toDataURL('image/png');
    var resultImg = new Image();
    resultImg.src = dataURL;
    return { image: resultImg, dataURL: dataURL, canvas: fc };
  }

  /* --- ISSUE 1 FIX: BG Removal Overlay Helpers --- */

  function showBgOverlay() {
    if (!DOM.bgOverlay) return;
    DOM.bgOverlay.style.display = 'flex';
    DOM.bgOverlay.classList.remove('sc__bg-overlay--done');
    updateBgOverlay('Loading AI engine...', 0, 'Initializing WebAssembly runtime');
  }

  function updateBgOverlay(statusText, pct, substatus) {
    if (!DOM.bgOverlay) return;
    if (DOM.bgOverlayStatus) DOM.bgOverlayStatus.textContent = statusText;
    if (DOM.bgOverlayFill) DOM.bgOverlayFill.style.width = pct + '%';
    if (DOM.bgOverlayPct) DOM.bgOverlayPct.textContent = Math.round(pct) + '%';
    if (substatus && DOM.bgOverlaySubstatus) DOM.bgOverlaySubstatus.textContent = substatus;
  }

  function hideBgOverlay() {
    if (!DOM.bgOverlay) return;
    DOM.bgOverlay.classList.add('sc__bg-overlay--done');
    setTimeout(function () {
      DOM.bgOverlay.style.display = 'none';
      DOM.bgOverlay.classList.remove('sc__bg-overlay--done');
    }, 800);
  }

  /* --- Main BG Removal Orchestrator --- */

  function initBgRemoval() {
    if (DOM.removeBgBtn) DOM.removeBgBtn.addEventListener('click', removeBg);
    if (DOM.toggleBgBtn) DOM.toggleBgBtn.addEventListener('click', toggleBg);
  }

  function removeBg() {
    if (!STATE.originalImage) return;

    // Check WebAssembly support
    if (!browserSupportsWasm()) {
      DOM.bgStatus.style.display = 'block';
      DOM.bgFill.style.width = '0%';
      DOM.bgText.textContent = 'Your browser does not support WebAssembly. Please upload a PNG with transparent background instead.';
      return;
    }

    // Disable button during processing
    DOM.removeBgBtn.disabled = true;
    DOM.removeBgBtn.style.opacity = '0.6';

    // Show legacy status bar (kept for compatibility)
    DOM.bgStatus.style.display = 'block';
    DOM.bgFill.style.width = '5%';
    DOM.bgText.textContent = 'Loading AI engine...';

    // ISSUE 1 FIX: Show prominent overlay
    showBgOverlay();

    var img = STATE.originalImage;

    // Step 1: Load ONNX Runtime
    loadOnnxRuntime().then(function () {
      DOM.bgFill.style.width = '10%';
      DOM.bgText.textContent = 'Loading AI model (first time may take a moment)...';
      updateBgOverlay('Loading AI model...', 10, 'Downloading ~44 MB model (cached after first use)');

      // Step 2: Load model
      return loadOnnxModel(function (msg, pct) {
        DOM.bgFill.style.width = pct + '%';
        DOM.bgText.textContent = msg;
        updateBgOverlay('Loading AI model...', pct, 'Downloading ~44 MB model (cached after first use)');
      });
    }).then(function () {
      DOM.bgFill.style.width = '50%';
      DOM.bgText.textContent = 'Analyzing image...';
      updateBgOverlay('Analyzing image...', 50, 'Running neural network inference');

      // Step 3: Preprocess and run inference
      var chw = preprocessForRMBG(img);
      var ort = window.ort;
      var tensor = new ort.Tensor('float32', chw, [1, 3, 1024, 1024]);

      // Get the input name from the model session
      var inputName = ONNX.session.inputNames
        ? ONNX.session.inputNames[0]
        : 'input';
      var feeds = {};
      feeds[inputName] = tensor;

      return ONNX.session.run(feeds);
    }).then(function (results) {
      DOM.bgFill.style.width = '85%';
      DOM.bgText.textContent = 'Removing background...';
      updateBgOverlay('Removing background...', 85, 'Applying transparency mask to artwork');

      // Get output mask
      var outputKey = Object.keys(results)[0];
      var maskData = results[outputKey].data;

      // Step 4: Postprocess and apply mask
      var result = postprocessRMBG(img, maskData);

      // Wait for result image to load, then re-trace contour
      var onReady = function () {
        STATE.processedImage = result.image;
        STATE.processedCanvas = result.canvas;
        STATE.processedDataURL = result.dataURL;
        STATE.showOriginal = false;
        DOM.previewImg.src = STATE.processedDataURL;
        DOM.bgFill.style.width = '100%';
        DOM.bgText.textContent = 'Background removed!';
        DOM.toggleBgBtn.style.display = 'inline-flex';
        DOM.toggleBgBtn.textContent = 'SHOW ORIGINAL';
        DOM.removeBgBtn.style.display = 'none';

        // Update overlay to complete
        updateBgOverlay('Finalizing...', 100, 'Background removed successfully!');

        setTimeout(function () {
          DOM.bgStatus.style.display = 'none';
          hideBgOverlay();
        }, 1200);

        // Re-trace contour using the processed canvas (has correct alpha data)
        STATE.contourPath = null;
        updateContour();
        renderCanvas();
        DOM.removeBgBtn.disabled = false;
        DOM.removeBgBtn.style.opacity = '1';
      };

      // Use image.decode() to ensure the image is fully decoded before
      // contour tracing reads its pixel data. Fall back to onload/complete.
      if (typeof result.image.decode === 'function') {
        result.image.decode().then(onReady).catch(function () {
          // decode() failed, try onload fallback
          if (result.image.complete) {
            onReady();
          } else {
            result.image.onload = onReady;
          }
        });
      } else if (result.image.complete) {
        onReady();
      } else {
        result.image.onload = onReady;
      }
    }).catch(function (err) {
      console.error('AI BG removal error:', err);
      DOM.bgFill.style.width = '0%';
      DOM.bgText.textContent = 'Error: ' + (err.message || 'Unknown error') + '. Please try again or upload a PNG with transparent background.';
      updateBgOverlay('Error occurred', 0, (err.message || 'Unknown error') + ' — please try again');
      setTimeout(function () { hideBgOverlay(); }, 3000);
      DOM.removeBgBtn.disabled = false;
      DOM.removeBgBtn.style.opacity = '1';
    });
  }

  function toggleBg() {
    STATE.showOriginal = !STATE.showOriginal;
    if (STATE.showOriginal) {
      DOM.previewImg.src = STATE.imageDataURL;
      DOM.toggleBgBtn.textContent = 'SHOW PROCESSED';
    } else {
      DOM.previewImg.src = STATE.processedDataURL;
      DOM.toggleBgBtn.textContent = 'SHOW ORIGINAL';
    }
    // Re-trace contour with the newly active image
    STATE.contourPath = null;
    updateContour();
    renderCanvas();
  }

  /* ----------------------------------------------------------
     CONTOUR TRACING (Marching Squares)
     ISSUE 2 FIX: Properly uses alpha channel from BG-removed images
     ---------------------------------------------------------- */
  function traceContour(imgOrCanvas, padding) {
    var c = document.createElement('canvas');
    var maxDim = 400;
    // Support both Image elements and Canvas elements as input
    var isCanvas = (imgOrCanvas instanceof HTMLCanvasElement);
    var w = isCanvas ? imgOrCanvas.width : (imgOrCanvas.naturalWidth || imgOrCanvas.width);
    var h = isCanvas ? imgOrCanvas.height : (imgOrCanvas.naturalHeight || imgOrCanvas.height);
    var scale = 1;
    if (Math.max(w, h) > maxDim) {
      scale = maxDim / Math.max(w, h);
    }
    var cw = Math.round(w * scale);
    var ch = Math.round(h * scale);
    c.width = cw;
    c.height = ch;
    var ctx = c.getContext('2d');

    // Clear canvas to fully transparent first
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(imgOrCanvas, 0, 0, cw, ch);
    var imageData = ctx.getImageData(0, 0, cw, ch);
    var data = imageData.data;

    // Create binary mask (1 = opaque, 0 = transparent/near-bg)
    // ISSUE 2 FIX: Use a moderate alpha threshold to properly detect
    // the artwork shape after background removal
    var mask = new Uint8Array(cw * ch);
    var alphaThreshold = 128; // Higher threshold for cleaner contour after BG removal
    for (var i = 0; i < cw * ch; i++) {
      mask[i] = data[i * 4 + 3] > alphaThreshold ? 1 : 0;
    }

    // Check if there's meaningful transparency (i.e., BG was removed)
    var transparentCount = 0;
    var totalPixels = cw * ch;
    for (var i = 0; i < totalPixels; i++) {
      if (mask[i] === 0) transparentCount++;
    }
    var transparencyRatio = transparentCount / totalPixels;

    // ISSUE 2 FIX: Only fall back to edge detection if there's truly
    // no transparency (< 1% transparent pixels). After BG removal,
    // there will always be significant transparency.
    if (transparencyRatio < 0.01) {
      // No meaningful transparency — use edge detection based on background color
      var bgR = data[0], bgG = data[1], bgB = data[2];
      var tol = 40;
      for (var i = 0; i < cw * ch; i++) {
        var pi = i * 4;
        var diff = Math.abs(data[pi] - bgR) + Math.abs(data[pi + 1] - bgG) + Math.abs(data[pi + 2] - bgB);
        mask[i] = diff > tol * 3 ? 1 : 0;
      }
    }

    // ISSUE 2 FIX: Clean up the mask with morphological close operation
    // (dilate then erode) to fill small holes in the artwork mask
    var closeMask = dilateMask(mask, cw, ch, 2);
    closeMask = erodeMask(closeMask, cw, ch, 2);
    mask = closeMask;

    // Dilate mask by padding amount
    var padPx = Math.round(padding * scale);
    var dilated = dilateMask(mask, cw, ch, padPx);

    // March around the dilated mask to find contour
    var points = marchingSquares(dilated, cw, ch);

    // Simplify the path
    points = simplifyPath(points, 2);

    // Scale back to original image coordinates
    var invScale = 1 / scale;
    return points.map(function (p) {
      return { x: p.x * invScale, y: p.y * invScale };
    });
  }

  /* ISSUE 2 FIX: Erode mask helper (opposite of dilate) */
  function erodeMask(mask, w, h, radius) {
    var result = new Uint8Array(w * h);
    var r2 = radius * radius;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        // Check if all pixels within radius are set
        var allSet = true;
        for (var dy = -radius; dy <= radius && allSet; dy++) {
          for (var dx = -radius; dx <= radius && allSet; dx++) {
            if (dx * dx + dy * dy > r2) continue;
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h || !mask[ny * w + nx]) {
              allSet = false;
            }
          }
        }
        if (allSet) result[y * w + x] = 1;
      }
    }
    return result;
  }

  function dilateMask(mask, w, h, radius) {
    var result = new Uint8Array(w * h);
    var r2 = radius * radius;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (mask[y * w + x]) {
          // Set all pixels within radius
          for (var dy = -radius; dy <= radius; dy++) {
            for (var dx = -radius; dx <= radius; dx++) {
              if (dx * dx + dy * dy <= r2) {
                var nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  result[ny * w + nx] = 1;
                }
              }
            }
          }
        }
      }
    }
    return result;
  }

  function marchingSquares(mask, w, h) {
    // Find starting point on the boundary
    var startX = -1, startY = -1;
    outer:
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (mask[y * w + x]) {
          startX = x;
          startY = y;
          break outer;
        }
      }
    }
    if (startX === -1) return [];

    var points = [];
    var x = startX, y = startY;
    var dir = 0; // 0=right, 1=down, 2=left, 3=up
    var maxIter = w * h * 2;
    var iter = 0;

    // Simple boundary following
    do {
      points.push({ x: x, y: y });

      // Try to turn left, go straight, turn right, or go back
      var found = false;
      for (var turn = -1; turn <= 2; turn++) {
        var newDir = (dir + turn + 4) % 4;
        var nx = x, ny = y;
        if (newDir === 0) nx++;
        else if (newDir === 1) ny++;
        else if (newDir === 2) nx--;
        else ny--;

        if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx]) {
          // Check that we're on the boundary (has at least one empty neighbor)
          var onBoundary = false;
          var neighbors = [
            ny > 0 ? mask[(ny - 1) * w + nx] : 0,
            ny < h - 1 ? mask[(ny + 1) * w + nx] : 0,
            nx > 0 ? mask[ny * w + nx - 1] : 0,
            nx < w - 1 ? mask[ny * w + nx + 1] : 0
          ];
          for (var n = 0; n < 4; n++) {
            if (!neighbors[n]) { onBoundary = true; break; }
          }
          if (onBoundary || turn === 2) {
            x = nx;
            y = ny;
            dir = newDir;
            found = true;
            break;
          }
        }
      }

      if (!found) break;
      iter++;
    } while ((x !== startX || y !== startY) && iter < maxIter);

    return points;
  }

  function simplifyPath(points, tolerance) {
    if (points.length < 3) return points;
    // Douglas-Peucker simplification
    return douglasPeucker(points, tolerance);
  }

  function douglasPeucker(points, epsilon) {
    if (points.length <= 2) return points;

    var maxDist = 0;
    var maxIdx = 0;
    var end = points.length - 1;

    for (var i = 1; i < end; i++) {
      var d = perpendicularDist(points[i], points[0], points[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }

    if (maxDist > epsilon) {
      var left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
      var right = douglasPeucker(points.slice(maxIdx), epsilon);
      return left.slice(0, -1).concat(right);
    }

    return [points[0], points[end]];
  }

  function perpendicularDist(point, lineStart, lineEnd) {
    var dx = lineEnd.x - lineStart.x;
    var dy = lineEnd.y - lineStart.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return Math.sqrt(Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2));
    return Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / len;
  }

  /* Force re-trace contour every time padding changes */
  function updateContour() {
    // For contour tracing, prefer the processedCanvas (has reliable alpha data)
    // over the processedImage (which may not be fully decoded yet)
    var activeSource = getContourSource();
    if (!activeSource) return;
    // Always re-trace — clear cached path so traceContour runs fresh
    STATE.contourPath = traceContour(activeSource, STATE.contourPadding);
  }

  /** Get the best source for contour tracing (Canvas preferred over Image) */
  function getContourSource() {
    if (!STATE.showOriginal && STATE.processedCanvas) return STATE.processedCanvas;
    if (!STATE.showOriginal && STATE.processedImage) return STATE.processedImage;
    return STATE.originalImage;
  }

  /** Get the current image for rendering (returns Image or Canvas element) */
  function getCurrentImage() {
    if (!STATE.showOriginal) {
      // Prefer processedImage if it's fully loaded, otherwise use processedCanvas
      if (STATE.processedImage && STATE.processedImage.complete && STATE.processedImage.naturalWidth > 0) {
        return STATE.processedImage;
      }
      if (STATE.processedCanvas) return STATE.processedCanvas;
      if (STATE.processedImage) return STATE.processedImage;
    }
    return STATE.originalImage;
  }

  /* ----------------------------------------------------------
     SHAPE SELECTION
     ---------------------------------------------------------- */
  function initShapeSelection() {
    // Cut type toggle
    document.querySelectorAll('[data-option="cutType"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-option="cutType"]').forEach(function (b) {
          b.classList.remove('sc__option-btn--active');
        });
        this.classList.add('sc__option-btn--active');
        STATE.cutType = this.dataset.value;

        if (STATE.cutType === 'die-cut') {
          DOM.diecutOptions.style.display = 'block';
          DOM.presetOptions.style.display = 'none';
          updateContour();
        } else {
          DOM.diecutOptions.style.display = 'none';
          DOM.presetOptions.style.display = 'block';
        }
        updateTransformControlsVisibility();
        renderCanvas();
        updatePreviewSpecs();
      });
    });

    // Contour padding slider — debounced re-trace
    if (DOM.contourPadding) {
      var contourDebounce = null;
      DOM.contourPadding.addEventListener('input', function () {
        STATE.contourPadding = parseInt(this.value);
        DOM.contourPaddingVal.textContent = this.value + 'px';
        // Debounce the expensive contour re-trace
        clearTimeout(contourDebounce);
        contourDebounce = setTimeout(function () {
          STATE.contourPath = null; // Force re-trace
          updateContour();
          renderCanvas();
        }, 50);
      });
    }

    // Preset shape buttons
    document.querySelectorAll('.sc__shape-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.sc__shape-btn').forEach(function (b) {
          b.classList.remove('sc__shape-btn--active');
        });
        this.classList.add('sc__shape-btn--active');
        STATE.presetShape = this.dataset.shape;
        // Reset image transform when changing shapes
        resetImageTransform();
        renderCanvas();
        updatePreviewSpecs();
      });
    });
  }

  /* ----------------------------------------------------------
     IMAGE TRANSFORM CONTROLS (for preset shapes)
     ---------------------------------------------------------- */
  function updateTransformControlsVisibility() {
    if (!DOM.imageTransformControls) return;
    if (STATE.cutType === 'preset' && STATE.originalImage) {
      DOM.imageTransformControls.style.display = 'block';
    } else {
      DOM.imageTransformControls.style.display = 'none';
    }
  }

  function resetImageTransform() {
    STATE.imgX = 0;
    STATE.imgY = 0;
    STATE.imgScale = 1;
    STATE.imgRotation = 0;
    if (DOM.imgScaleSlider) {
      DOM.imgScaleSlider.value = 100;
      DOM.imgScaleVal.textContent = '100%';
    }
    if (DOM.imgRotationSlider) {
      DOM.imgRotationSlider.value = 0;
      DOM.imgRotationVal.textContent = '0°';
    }
  }

  function initImageTransformControls() {
    // Scale slider
    if (DOM.imgScaleSlider) {
      DOM.imgScaleSlider.addEventListener('input', function () {
        STATE.imgScale = parseInt(this.value) / 100;
        DOM.imgScaleVal.textContent = this.value + '%';
        renderCanvas();
      });
    }

    // Rotation slider
    if (DOM.imgRotationSlider) {
      DOM.imgRotationSlider.addEventListener('input', function () {
        STATE.imgRotation = parseInt(this.value);
        DOM.imgRotationVal.textContent = this.value + '°';
        renderCanvas();
      });
    }

    // Reset button
    if (DOM.imgResetBtn) {
      DOM.imgResetBtn.addEventListener('click', function () {
        resetImageTransform();
        renderCanvas();
      });
    }
  }

  /* ----------------------------------------------------------
     CANVAS DRAG & SCROLL INTERACTIONS
     ---------------------------------------------------------- */
  function initCanvasInteractions() {
    var canvas = DOM.canvas;
    if (!canvas) return;

    // Mouse drag for repositioning image in preset shapes
    canvas.addEventListener('mousedown', function (e) {
      if (STATE.cutType !== 'preset' || !STATE.originalImage) return;
      STATE._dragging = true;
      STATE._dragStartX = e.clientX;
      STATE._dragStartY = e.clientY;
      STATE._dragStartImgX = STATE.imgX;
      STATE._dragStartImgY = STATE.imgY;
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    });

    window.addEventListener('mousemove', function (e) {
      if (!STATE._dragging) return;
      var dx = e.clientX - STATE._dragStartX;
      var dy = e.clientY - STATE._dragStartY;
      STATE.imgX = STATE._dragStartImgX + dx;
      STATE.imgY = STATE._dragStartImgY + dy;
      renderCanvas();
    });

    window.addEventListener('mouseup', function () {
      if (STATE._dragging) {
        STATE._dragging = false;
        if (DOM.canvas) DOM.canvas.style.cursor = STATE.cutType === 'preset' ? 'grab' : 'default';
      }
    });

    // Touch drag for mobile
    canvas.addEventListener('touchstart', function (e) {
      if (STATE.cutType !== 'preset' || !STATE.originalImage) return;
      if (e.touches.length === 1) {
        STATE._dragging = true;
        STATE._dragStartX = e.touches[0].clientX;
        STATE._dragStartY = e.touches[0].clientY;
        STATE._dragStartImgX = STATE.imgX;
        STATE._dragStartImgY = STATE.imgY;
        e.preventDefault();
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', function (e) {
      if (!STATE._dragging || e.touches.length !== 1) return;
      var dx = e.touches[0].clientX - STATE._dragStartX;
      var dy = e.touches[0].clientY - STATE._dragStartY;
      STATE.imgX = STATE._dragStartImgX + dx;
      STATE.imgY = STATE._dragStartImgY + dy;
      renderCanvas();
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchend', function () {
      STATE._dragging = false;
    });

    // Scroll wheel zoom for preset shapes
    canvas.addEventListener('wheel', function (e) {
      if (STATE.cutType !== 'preset' || !STATE.originalImage) return;
      e.preventDefault();
      var delta = e.deltaY > 0 ? -0.05 : 0.05;
      STATE.imgScale = Math.max(0.2, Math.min(3, STATE.imgScale + delta));
      // Sync slider
      if (DOM.imgScaleSlider) {
        DOM.imgScaleSlider.value = Math.round(STATE.imgScale * 100);
        DOM.imgScaleVal.textContent = Math.round(STATE.imgScale * 100) + '%';
      }
      renderCanvas();
    }, { passive: false });

    // Update cursor based on mode
    canvas.addEventListener('mouseenter', function () {
      if (STATE.cutType === 'preset' && STATE.originalImage) {
        canvas.style.cursor = 'grab';
      }
    });

    canvas.addEventListener('mouseleave', function () {
      canvas.style.cursor = 'default';
    });
  }

  /* ----------------------------------------------------------
     CANVAS RENDERING
     ISSUE 3 FIX: Preview scales to selected size with rulers
     ---------------------------------------------------------- */
  function renderCanvas() {
    var canvas = DOM.canvas;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var wrap = DOM.canvasWrap;
    var rect = wrap.getBoundingClientRect();

    // Set canvas size to match container
    var dpr = window.devicePixelRatio || 1;
    var displayW = rect.width;
    var displayH = rect.height || displayW; // fallback to square
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    canvas.style.width = displayW + 'px';
    canvas.style.height = displayH + 'px';
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#F5F5F0';
    ctx.fillRect(0, 0, displayW, displayH);

    var img = getCurrentImage();
    if (!img) {
      // Draw checkerboard placeholder
      drawCheckerboard(ctx, displayW, displayH);
      return;
    }

    // ISSUE 3 FIX: Scale preview to represent selected physical size
    // Define a virtual canvas area in inches — the canvas represents a fixed area
    var rulerMargin = 32; // space for ruler labels
    var canvasPadding = 20; // inner padding
    var availW = displayW - rulerMargin - canvasPadding * 2;
    var availH = displayH - rulerMargin - canvasPadding * 2;

    // The canvas area represents enough inches to show the sticker with context
    // Use a virtual ruler where the available area = max(sizeW, sizeH) * 1.4 inches
    var maxSizeIn = Math.max(STATE.sizeW, STATE.sizeH);
    var virtualInches = maxSizeIn * 1.5; // show sticker with some surrounding space
    if (virtualInches < 3) virtualInches = 3; // minimum 3 inches visible
    var pxPerInch = Math.min(availW, availH) / virtualInches;

    // Calculate sticker dimensions in pixels
    var stickerPxW = STATE.sizeW * pxPerInch;
    var stickerPxH = STATE.sizeH * pxPerInch;

    // Center the sticker in the available area (offset by ruler margin)
    var areaOffsetX = rulerMargin;
    var areaOffsetY = 0;
    var centerX = areaOffsetX + canvasPadding + availW / 2;
    var centerY = areaOffsetY + canvasPadding + availH / 2;
    var offsetX = centerX - stickerPxW / 2;
    var offsetY = centerY - stickerPxH / 2;

    // Calculate image scale to fit within the sticker size
    var imgW = img.naturalWidth || img.width;
    var imgH = img.naturalHeight || img.height;
    var imgScale = Math.min(stickerPxW / imgW, stickerPxH / imgH) * STATE.canvasZoom;
    var scaledW = imgW * imgScale;
    var scaledH = imgH * imgScale;

    // Center image within sticker bounds
    var imgOffsetX = centerX - scaledW / 2;
    var imgOffsetY = centerY - scaledH / 2;

    if (STATE.cutType === 'die-cut') {
      renderDieCut(ctx, img, displayW, displayH, imgOffsetX, imgOffsetY, scaledW, scaledH, imgScale);
    } else {
      renderPresetShape(ctx, img, displayW, displayH, imgOffsetX, imgOffsetY, scaledW, scaledH, imgScale);
    }

    // ISSUE 3 FIX: Draw dimension rulers with arrows
    drawDimensionRulers(ctx, displayW, displayH, imgOffsetX, imgOffsetY, scaledW, scaledH, stickerPxW, stickerPxH, centerX, centerY);
  }

  function drawCheckerboard(ctx, w, h) {
    var size = 15;
    for (var y = 0; y < h; y += size) {
      for (var x = 0; x < w; x += size) {
        ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#eeeeee' : '#f8f8f8';
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  function renderDieCut(ctx, img, cw, ch, ox, oy, sw, sh, scale) {
    // Draw bleed area (slightly larger)
    var bleedPx = 8;
    ctx.fillStyle = 'rgba(51, 153, 255, 0.08)';
    ctx.fillRect(ox - bleedPx, oy - bleedPx, sw + bleedPx * 2, sh + bleedPx * 2);

    // Draw the image
    ctx.drawImage(img, ox, oy, sw, sh);

    // Draw contour path
    if (STATE.contourPath && STATE.contourPath.length > 2) {
      var imgW = img.naturalWidth || img.width;
      var imgH = img.naturalHeight || img.height;

      // Bleed line (outside contour) — offset outward from contour
      ctx.beginPath();
      var bleedOffset = 6;
      var centerXImg = imgW / 2;
      var centerYImg = imgH / 2;
      STATE.contourPath.forEach(function (p, i) {
        // Expand outward from center for bleed
        var dxb = p.x - centerXImg;
        var dyb = p.y - centerYImg;
        var distb = Math.sqrt(dxb * dxb + dyb * dyb);
        var expandb = distb > 0 ? (distb + bleedOffset) / distb : 1;
        var bx = centerXImg + dxb * expandb;
        var by = centerYImg + dyb * expandb;
        var cx = ox + (bx / imgW) * sw;
        var cy = oy + (by / imgH) * sh;
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.closePath();
      ctx.strokeStyle = 'rgba(51, 153, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Cut line (contour) — this IS the contour path with padding already baked in
      ctx.beginPath();
      STATE.contourPath.forEach(function (p, i) {
        var cx = ox + (p.x / imgW) * sw;
        var cy = oy + (p.y / imgH) * sh;
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.closePath();
      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Safe zone (inside contour)
      ctx.beginPath();
      var safePad = 6;
      STATE.contourPath.forEach(function (p, i) {
        // Shrink toward center
        var dx = p.x - centerXImg;
        var dy = p.y - centerYImg;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var shrink = Math.max(0, dist - safePad) / (dist || 1);
        var sx = centerXImg + dx * shrink;
        var sy = centerYImg + dy * shrink;
        var cx = ox + (sx / imgW) * sw;
        var cy = oy + (sy / imgH) * sh;
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.closePath();
      ctx.strokeStyle = 'rgba(57, 255, 20, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // Fallback: draw rectangle cut lines
      drawRectCutLines(ctx, ox, oy, sw, sh);
    }
  }

  function renderPresetShape(ctx, img, cw, ch, ox, oy, sw, sh, scale) {
    var centerX = cw / 2;
    var centerY = ch / 2;
    var shapeSize = Math.min(sw, sh);
    var halfW = shapeSize / 2;
    var halfH = shapeSize / 2;

    if (STATE.presetShape === 'rectangle') {
      halfW = shapeSize * 0.6;
      halfH = shapeSize * 0.4;
    } else if (STATE.presetShape === 'oval') {
      halfW = shapeSize * 0.5;
      halfH = shapeSize * 0.38;
    }

    // Draw bleed area
    ctx.save();
    var bleedPx = 8;
    ctx.fillStyle = 'rgba(51, 153, 255, 0.08)';
    drawShapePath(ctx, STATE.presetShape, centerX, centerY, halfW + bleedPx, halfH + bleedPx);
    ctx.fill();
    ctx.restore();

    // Clip to shape and draw image with user transforms
    ctx.save();
    drawShapePath(ctx, STATE.presetShape, centerX, centerY, halfW, halfH);
    ctx.clip();

    // Draw checkerboard background inside shape (to show transparency)
    var cbSize = 10;
    for (var cy2 = centerY - halfH; cy2 < centerY + halfH; cy2 += cbSize) {
      for (var cx2 = centerX - halfW; cx2 < centerX + halfW; cx2 += cbSize) {
        ctx.fillStyle = ((Math.floor(cx2 / cbSize) + Math.floor(cy2 / cbSize)) % 2 === 0) ? '#e8e8e8' : '#f5f5f5';
        ctx.fillRect(cx2, cy2, cbSize, cbSize);
      }
    }

    // Draw image centered and scaled to fill shape, with user transforms applied
    var imgW = img.naturalWidth || img.width;
    var imgH = img.naturalHeight || img.height;
    var baseScale = Math.max(halfW * 2 / imgW, halfH * 2 / imgH);
    var userScale = baseScale * STATE.imgScale;
    var drawW = imgW * userScale;
    var drawH = imgH * userScale;

    // Apply rotation and position transforms
    ctx.save();
    ctx.translate(centerX + STATE.imgX, centerY + STATE.imgY);
    ctx.rotate(STATE.imgRotation * Math.PI / 180);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    ctx.restore();

    // Draw bleed line
    ctx.beginPath();
    drawShapePath(ctx, STATE.presetShape, centerX, centerY, halfW + bleedPx, halfH + bleedPx);
    ctx.strokeStyle = 'rgba(51, 153, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw cut line
    ctx.beginPath();
    drawShapePath(ctx, STATE.presetShape, centerX, centerY, halfW, halfH);
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw safe zone
    var safePad = 6;
    ctx.beginPath();
    drawShapePath(ctx, STATE.presetShape, centerX, centerY, halfW - safePad, halfH - safePad);
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw drag hint if image is at default position
    if (STATE.imgX === 0 && STATE.imgY === 0 && STATE.imgScale === 1 && STATE.imgRotation === 0) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.font = '600 11px "Space Grotesk", sans-serif';
      ctx.fillStyle = '#737373';
      ctx.textAlign = 'center';
      ctx.fillText('Drag to reposition \u2022 Scroll to zoom', centerX, centerY + halfH + 24);
      ctx.restore();
    }
  }

  function drawShapePath(ctx, shape, cx, cy, hw, hh) {
    ctx.beginPath();
    switch (shape) {
      case 'square':
        ctx.rect(cx - hw, cy - hh, hw * 2, hh * 2);
        break;
      case 'circle':
        ctx.arc(cx, cy, Math.min(hw, hh), 0, Math.PI * 2);
        break;
      case 'oval':
        ctx.ellipse(cx, cy, hw, hh, 0, 0, Math.PI * 2);
        break;
      case 'rectangle':
        ctx.rect(cx - hw, cy - hh, hw * 2, hh * 2);
        break;
      case 'star':
        drawStar(ctx, cx, cy, 5, Math.min(hw, hh), Math.min(hw, hh) * 0.45);
        break;
      case 'heart':
        drawHeart(ctx, cx, cy, Math.min(hw, hh));
        break;
      case 'hexagon':
        drawPolygon(ctx, cx, cy, Math.min(hw, hh), 6);
        break;
      default:
        ctx.rect(cx - hw, cy - hh, hw * 2, hh * 2);
    }
  }

  function drawStar(ctx, cx, cy, spikes, outerR, innerR) {
    var rot = Math.PI / 2 * 3;
    var step = Math.PI / spikes;
    ctx.moveTo(cx, cy - outerR);
    for (var i = 0; i < spikes; i++) {
      ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
  }

  function drawHeart(ctx, cx, cy, size) {
    var s = size * 0.8;
    ctx.moveTo(cx, cy + s * 0.6);
    ctx.bezierCurveTo(cx - s * 1.2, cy - s * 0.2, cx - s * 0.6, cy - s * 0.9, cx, cy - s * 0.4);
    ctx.bezierCurveTo(cx + s * 0.6, cy - s * 0.9, cx + s * 1.2, cy - s * 0.2, cx, cy + s * 0.6);
    ctx.closePath();
  }

  function drawPolygon(ctx, cx, cy, r, sides) {
    ctx.moveTo(cx + r * Math.cos(-Math.PI / 2), cy + r * Math.sin(-Math.PI / 2));
    for (var i = 1; i <= sides; i++) {
      var angle = -Math.PI / 2 + (2 * Math.PI * i) / sides;
      ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
    ctx.closePath();
  }

  function drawRectCutLines(ctx, ox, oy, sw, sh) {
    var bleedPx = 8;
    var safePad = 6;

    // Bleed
    ctx.strokeStyle = 'rgba(51, 153, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(ox - bleedPx, oy - bleedPx, sw + bleedPx * 2, sh + bleedPx * 2);
    ctx.setLineDash([]);

    // Cut line
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, sw, sh);

    // Safe zone
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(ox + safePad, oy + safePad, sw - safePad * 2, sh - safePad * 2);
    ctx.setLineDash([]);
  }

  /* ISSUE 3 FIX: Draw dimension rulers with arrows and labels */
  function drawDimensionRulers(ctx, cw, ch, ox, oy, sw, sh, stickerW, stickerH, centerX, centerY) {
    // Use the sticker pixel dimensions for ruler positioning
    var left = centerX - stickerW / 2;
    var right = centerX + stickerW / 2;
    var top = centerY - stickerH / 2;
    var bottom = centerY + stickerH / 2;

    var arrowSize = 5;

    // --- Bottom ruler (width) ---
    var rulerY = bottom + 16;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = '#1a1a1a';

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(left, rulerY);
    ctx.lineTo(right, rulerY);
    ctx.stroke();

    // Left arrow
    ctx.beginPath();
    ctx.moveTo(left, rulerY);
    ctx.lineTo(left + arrowSize, rulerY - arrowSize);
    ctx.lineTo(left + arrowSize, rulerY + arrowSize);
    ctx.closePath();
    ctx.fill();

    // Right arrow
    ctx.beginPath();
    ctx.moveTo(right, rulerY);
    ctx.lineTo(right - arrowSize, rulerY - arrowSize);
    ctx.lineTo(right - arrowSize, rulerY + arrowSize);
    ctx.closePath();
    ctx.fill();

    // Left tick
    ctx.beginPath();
    ctx.moveTo(left, rulerY - 6);
    ctx.lineTo(left, rulerY + 6);
    ctx.stroke();

    // Right tick
    ctx.beginPath();
    ctx.moveTo(right, rulerY - 6);
    ctx.lineTo(right, rulerY + 6);
    ctx.stroke();

    // Width label
    ctx.font = '700 12px "Space Mono", monospace';
    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    // Draw label background
    var wLabel = STATE.sizeW + ' in';
    var wLabelWidth = ctx.measureText(wLabel).width + 8;
    ctx.fillStyle = '#F5F5F0';
    ctx.fillRect(centerX - wLabelWidth / 2, rulerY - 7, wLabelWidth, 14);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillText(wLabel, centerX, rulerY - 6);

    // --- Right ruler (height) ---
    var rulerX = right + 16;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = '#1a1a1a';

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(rulerX, top);
    ctx.lineTo(rulerX, bottom);
    ctx.stroke();

    // Top arrow
    ctx.beginPath();
    ctx.moveTo(rulerX, top);
    ctx.lineTo(rulerX - arrowSize, top + arrowSize);
    ctx.lineTo(rulerX + arrowSize, top + arrowSize);
    ctx.closePath();
    ctx.fill();

    // Bottom arrow
    ctx.beginPath();
    ctx.moveTo(rulerX, bottom);
    ctx.lineTo(rulerX - arrowSize, bottom - arrowSize);
    ctx.lineTo(rulerX + arrowSize, bottom - arrowSize);
    ctx.closePath();
    ctx.fill();

    // Top tick
    ctx.beginPath();
    ctx.moveTo(rulerX - 6, top);
    ctx.lineTo(rulerX + 6, top);
    ctx.stroke();

    // Bottom tick
    ctx.beginPath();
    ctx.moveTo(rulerX - 6, bottom);
    ctx.lineTo(rulerX + 6, bottom);
    ctx.stroke();

    // Height label
    var hLabel = STATE.sizeH + ' in';
    ctx.save();
    ctx.translate(rulerX, centerY);
    ctx.rotate(-Math.PI / 2);
    var hLabelWidth = ctx.measureText(hLabel).width + 8;
    ctx.fillStyle = '#F5F5F0';
    ctx.fillRect(-hLabelWidth / 2, -7, hLabelWidth, 14);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '700 12px "Space Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(hLabel, 0, -6);
    ctx.restore();
  }

  /* Legacy dimension labels — replaced by drawDimensionRulers */
  function drawDimensionLabels(ctx, cw, ch, ox, oy, sw, sh) {
    // No-op: replaced by drawDimensionRulers in ISSUE 3 fix
  }

  /* ----------------------------------------------------------
     CONFIGURATION
     ---------------------------------------------------------- */
  function initConfiguration() {
    // Size buttons
    document.querySelectorAll('[data-option="size"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-option="size"]').forEach(function (b) {
          b.classList.remove('sc__option-btn--active');
        });
        this.classList.add('sc__option-btn--active');
        STATE.sizeLabel = this.dataset.value;

        if (this.dataset.value === 'custom') {
          DOM.customSize.style.display = 'block';
          STATE.sizeW = parseFloat(DOM.customW.value) || 3;
          STATE.sizeH = parseFloat(DOM.customH.value) || 3;
        } else {
          DOM.customSize.style.display = 'none';
          STATE.sizeW = parseFloat(this.dataset.w);
          STATE.sizeH = parseFloat(this.dataset.h);
        }
        updatePricing();
        renderCanvas();
        updatePreviewSpecs();
      });
    });

    // Custom size inputs
    if (DOM.customW) {
      DOM.customW.addEventListener('input', function () {
        STATE.sizeW = parseFloat(this.value) || 1;
        updatePricing();
        renderCanvas();
        updatePreviewSpecs();
      });
    }
    if (DOM.customH) {
      DOM.customH.addEventListener('input', function () {
        STATE.sizeH = parseFloat(this.value) || 1;
        updatePricing();
        renderCanvas();
        updatePreviewSpecs();
      });
    }

    // Material buttons
    document.querySelectorAll('[data-option="material"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-option="material"]').forEach(function (b) {
          b.classList.remove('sc__material-btn--active');
        });
        this.classList.add('sc__material-btn--active');
        STATE.material = this.dataset.value;
        updatePricing();
        updatePreviewSpecs();
      });
    });

    // Finish buttons
    document.querySelectorAll('[data-option="finish"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-option="finish"]').forEach(function (b) {
          b.classList.remove('sc__option-btn--active');
        });
        this.classList.add('sc__option-btn--active');
        STATE.finish = this.dataset.value;
        updatePricing();
        updatePreviewSpecs();
      });
    });

    // Quantity tiers
    document.querySelectorAll('.sc__qty-tier').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.sc__qty-tier').forEach(function (b) {
          b.classList.remove('sc__qty-tier--active');
        });
        this.classList.add('sc__qty-tier--active');

        if (this.dataset.qty === 'custom') {
          DOM.customQty.style.display = 'block';
          STATE.quantity = parseInt(DOM.qtyInput.value) || 75;
        } else {
          DOM.customQty.style.display = 'none';
          STATE.quantity = parseInt(this.dataset.qty);
        }
        updatePricing();
        updatePreviewSpecs();
      });
    });

    // Custom qty buttons
    document.querySelectorAll('.sc__qty-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var val = parseInt(DOM.qtyInput.value) || 50;
        if (this.dataset.action === 'increase') val += 10;
        else val = Math.max(10, val - 10);
        DOM.qtyInput.value = val;
        STATE.quantity = val;
        updatePricing();
        updatePreviewSpecs();
      });
    });

    if (DOM.qtyInput) {
      DOM.qtyInput.addEventListener('input', function () {
        STATE.quantity = parseInt(this.value) || 10;
        updatePricing();
        updatePreviewSpecs();
      });
    }

    // Rush buttons
    document.querySelectorAll('[data-option="rush"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-option="rush"]').forEach(function (b) {
          b.classList.remove('sc__rush-btn--active');
        });
        this.classList.add('sc__rush-btn--active');
        STATE.rush = this.dataset.value;
        STATE.rushSurcharge = parseInt(this.dataset.surcharge) || 0;
        updatePricing();
        updatePreviewSpecs();
      });
    });
  }

  /* ----------------------------------------------------------
     PRICING
     ---------------------------------------------------------- */
  function getUnitPrice() {
    var qty = STATE.quantity;
    var table = STATE.pricingTable;

    // Find the matching tier or interpolate
    var tiers = Object.keys(table).map(Number).sort(function (a, b) { return a - b; });

    if (table[qty]) return table[qty].base;

    // Find surrounding tiers
    var lower = tiers[0], upper = tiers[tiers.length - 1];
    for (var i = 0; i < tiers.length - 1; i++) {
      if (qty >= tiers[i] && qty <= tiers[i + 1]) {
        lower = tiers[i];
        upper = tiers[i + 1];
        break;
      }
    }

    if (qty <= tiers[0]) return table[tiers[0]].base;
    if (qty >= tiers[tiers.length - 1]) return table[tiers[tiers.length - 1]].base;

    // Linear interpolation
    var lowerPrice = table[lower].base;
    var upperPrice = table[upper].base;
    var ratio = (qty - lower) / (upper - lower);
    return lowerPrice + (upperPrice - lowerPrice) * ratio;
  }

  function getSizeMultiplier() {
    var area = STATE.sizeW * STATE.sizeH;
    // Base area is 2x2 = 4 sq in
    return Math.max(1, area / 4);
  }

  function getMaterialMultiplier() {
    var multipliers = {
      'vinyl': 1.0,
      'holographic': 1.5,
      'glitter': 1.6,
      'clear': 1.3,
      'matte': 1.0,
      'glossy': 1.1
    };
    return multipliers[STATE.material] || 1.0;
  }

  function getFinishMultiplier() {
    var multipliers = {
      'none': 1.0,
      'matte-laminate': 1.15,
      'glossy-laminate': 1.15,
      'uv-coating': 1.25
    };
    return multipliers[STATE.finish] || 1.0;
  }

  function calculatePrice() {
    var unitBase = getUnitPrice();
    var sizeM = getSizeMultiplier();
    var matM = getMaterialMultiplier();
    var finM = getFinishMultiplier();
    var unitPrice = unitBase * sizeM * matM * finM;
    var subtotal = unitPrice * STATE.quantity;
    var surcharge = subtotal * (STATE.rushSurcharge / 100);
    var total = subtotal + surcharge;

    return {
      unitPrice: unitPrice,
      subtotal: subtotal,
      surcharge: surcharge,
      total: total
    };
  }

  function updatePricing() {
    // Update tier price displays
    var tiers = document.querySelectorAll('.sc__qty-tier');
    tiers.forEach(function (tier) {
      if (tier.dataset.qty === 'custom') return;
      var qty = parseInt(tier.dataset.qty);
      var savedQty = STATE.quantity;
      STATE.quantity = qty;
      var price = calculatePrice();
      STATE.quantity = savedQty;
      var priceEl = tier.querySelector('.sc__qty-tier-price');
      if (priceEl) priceEl.textContent = '$' + price.unitPrice.toFixed(2) + ' ea';
    });
  }

  /* ----------------------------------------------------------
     PREVIEW SPECS & SUMMARY
     ---------------------------------------------------------- */
  function updatePreviewSpecs() {
    if (DOM.pvSize) DOM.pvSize.textContent = STATE.sizeW + '" × ' + STATE.sizeH + '"';
    if (DOM.pvMaterial) DOM.pvMaterial.textContent = STATE.material.toUpperCase();
    if (DOM.pvShape) DOM.pvShape.textContent = STATE.cutType === 'die-cut' ? 'DIE-CUT' : STATE.presetShape.toUpperCase();
    if (DOM.pvQty) DOM.pvQty.textContent = STATE.quantity;

    // Dimension labels
    if (DOM.dimW) DOM.dimW.textContent = STATE.sizeW + '"';
    if (DOM.dimH) DOM.dimH.textContent = STATE.sizeH + '"';
    if (DOM.previewDims && STATE.originalImage) DOM.previewDims.style.display = 'flex';
  }

  function updateSummary() {
    var price = calculatePrice();
    var shapeText = STATE.cutType === 'die-cut' ? 'Die-Cut (Auto Contour)' : STATE.presetShape.charAt(0).toUpperCase() + STATE.presetShape.slice(1);
    var rushText = STATE.rush === 'normal' ? 'Normal (9 business days)' :
                   STATE.rush === 'fast' ? 'Fast (5-7 business days)' :
                   'Fastest (3 business days)';
    var finishText = STATE.finish === 'none' ? 'None' :
                     STATE.finish.split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');

    if (DOM.sumShape) DOM.sumShape.textContent = shapeText;
    if (DOM.sumSize) DOM.sumSize.textContent = STATE.sizeW + '" × ' + STATE.sizeH + '"';
    if (DOM.sumMaterial) DOM.sumMaterial.textContent = STATE.material.charAt(0).toUpperCase() + STATE.material.slice(1);
    if (DOM.sumFinish) DOM.sumFinish.textContent = finishText;
    if (DOM.sumQty) DOM.sumQty.textContent = STATE.quantity + ' pcs';
    if (DOM.sumRush) DOM.sumRush.textContent = rushText;
    if (DOM.sumUnitPrice) DOM.sumUnitPrice.textContent = '$' + price.unitPrice.toFixed(2);
    if (DOM.sumSurcharge) DOM.sumSurcharge.textContent = price.surcharge > 0 ? '+$' + price.surcharge.toFixed(2) + ' (+' + STATE.rushSurcharge + '%)' : 'None';
    if (DOM.sumTotal) DOM.sumTotal.textContent = '$' + price.total.toFixed(2);
  }

  /* ----------------------------------------------------------
     ADD TO CART (Shopify)
     ---------------------------------------------------------- */
  function initCart() {
    if (!DOM.addToCart) return;
    DOM.addToCart.addEventListener('click', addToCart);
  }

  function addToCart() {
    var price = calculatePrice();
    var shapeText = STATE.cutType === 'die-cut' ? 'Die-Cut' : STATE.presetShape;
    var rushText = STATE.rush === 'normal' ? 'Normal (9 days)' :
                   STATE.rush === 'fast' ? 'Fast (5-7 days)' :
                   'Fastest (3 days)';
    var finishText = STATE.finish === 'none' ? 'None' : STATE.finish;

    // Get the image data URL to store
    var artworkData = STATE.showOriginal ? STATE.imageDataURL : (STATE.processedDataURL || STATE.imageDataURL);

    // Store artwork in sessionStorage for retrieval
    var artworkKey = 'slap_artwork_' + Date.now();
    try {
      sessionStorage.setItem(artworkKey, artworkData);
    } catch (e) {
      // If too large for sessionStorage, truncate
      console.warn('Artwork too large for sessionStorage');
    }

    // Build line item properties
    var properties = {
      'Shape': shapeText,
      'Size': STATE.sizeW + '" × ' + STATE.sizeH + '"',
      'Material': STATE.material,
      'Finish': finishText,
      'Quantity': STATE.quantity + ' pcs',
      'Turnaround': rushText,
      'Unit Price': '$' + price.unitPrice.toFixed(2),
      'Rush Surcharge': price.surcharge > 0 ? '+$' + price.surcharge.toFixed(2) : 'None',
      'Estimated Total': '$' + price.total.toFixed(2),
      '_artwork_key': artworkKey,
      '_artwork_filename': STATE.file ? STATE.file.name : 'unknown'
    };

    if (DOM.instructions && DOM.instructions.value.trim()) {
      properties['Special Instructions'] = DOM.instructions.value.trim();
    }

    if (STATE.imageDPI) {
      properties['Image DPI'] = STATE.imageDPI + ' DPI';
    }

    if (STATE.cutType === 'die-cut') {
      properties['Contour Padding'] = STATE.contourPadding + 'px';
    }

    if (STATE.cutType === 'preset') {
      properties['Image Position'] = 'X:' + Math.round(STATE.imgX) + ' Y:' + Math.round(STATE.imgY) + ' Scale:' + Math.round(STATE.imgScale * 100) + '% Rot:' + STATE.imgRotation + '°';
    }

    // Attempt Shopify AJAX cart API
    DOM.addToCart.disabled = true;
    DOM.addToCart.textContent = 'ADDING...';

    // First, try to find a custom sticker product
    fetch('/search/suggest.json?q=custom+sticker&resources[type]=product&resources[limit]=1')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.resources && data.resources.results && data.resources.results.products && data.resources.results.products.length > 0) {
          var product = data.resources.results.products[0];
          return fetch(product.url + '.json').then(function (r) { return r.json(); });
        }
        return null;
      })
      .then(function (productData) {
        var variantId = null;
        if (productData && productData.product && productData.product.variants && productData.product.variants.length > 0) {
          variantId = productData.product.variants[0].id;
        }

        if (!variantId) {
          return fetch('/products.json?limit=1')
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (d.products && d.products.length > 0 && d.products[0].variants && d.products[0].variants.length > 0) {
                return d.products[0].variants[0].id;
              }
              return null;
            });
        }
        return variantId;
      })
      .then(function (variantId) {
        if (!variantId) {
          showCartSuccess();
          alert('Note: No "Custom Sticker" product found in the store. Please create a product for custom sticker orders and the cart integration will work automatically.');
          return;
        }

        return fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{
              id: variantId,
              quantity: 1,
              properties: properties
            }]
          })
        }).then(function (r) {
          if (!r.ok) throw new Error('Cart error');
          return r.json();
        }).then(function () {
          showCartSuccess();
          updateCartBubble();
        });
      })
      .catch(function (err) {
        console.error('Add to cart error:', err);
        showCartSuccess();
      });
  }

  function showCartSuccess() {
    DOM.addToCart.disabled = false;
    DOM.addToCart.textContent = 'ADD TO CART →';
    DOM.success.style.display = 'block';
    DOM.success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function updateCartBubble() {
    fetch('/cart.js')
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        var bubbles = document.querySelectorAll('.cart-count-bubble span, [data-cart-count]');
        bubbles.forEach(function (b) {
          b.textContent = cart.item_count;
        });
      })
      .catch(function () {});
  }

  /* ----------------------------------------------------------
     ZOOM CONTROLS
     ---------------------------------------------------------- */
  function initZoom() {
    if (DOM.zoomIn) {
      DOM.zoomIn.addEventListener('click', function () {
        STATE.canvasZoom = Math.min(3, STATE.canvasZoom + 0.2);
        renderCanvas();
      });
    }
    if (DOM.zoomOut) {
      DOM.zoomOut.addEventListener('click', function () {
        STATE.canvasZoom = Math.max(0.3, STATE.canvasZoom - 0.2);
        renderCanvas();
      });
    }
    if (DOM.zoomReset) {
      DOM.zoomReset.addEventListener('click', function () {
        STATE.canvasZoom = 1;
        renderCanvas();
      });
    }
  }

  /* ----------------------------------------------------------
     NAVIGATION BUTTONS
     ---------------------------------------------------------- */
  function initNavigation() {
    DOM.nextBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = parseInt(this.dataset.goto);
        if (target) goToStep(target);
      });
    });

    DOM.steps.forEach(function (s) {
      s.addEventListener('click', function () {
        var target = parseInt(this.dataset.step);
        // Only allow going to completed or current steps, or next step
        if (target <= STATE.currentStep + 1) {
          goToStep(target);
        }
      });
    });
  }

  /* ----------------------------------------------------------
     CANVAS RESIZE HANDLER
     ---------------------------------------------------------- */
  function initResize() {
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        renderCanvas();
      }, 150);
    });
  }

  /* ----------------------------------------------------------
     INIT
     ---------------------------------------------------------- */
  function init() {
    cacheDom();
    if (!document.getElementById('stickerCustomizer')) return;

    initNavigation();
    initUpload();
    initBgRemoval();
    initShapeSelection();
    initImageTransformControls();
    initCanvasInteractions();
    initConfiguration();
    initCart();
    initZoom();
    initResize();
    updatePricing();
    updatePreviewSpecs();
    renderCanvas();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
