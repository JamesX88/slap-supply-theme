/* ============================================================
   SLAP SUPPLY — STICKER CUSTOMIZER V2
   Vanilla JS · No frameworks
   Features:
     • Upload with DPI detection
     • Server-side BG removal via Cloudflare Worker + Replicate
     • Die-cut contour tracing + 8 preset shapes
     • Live canvas preview with cut-line overlay
     • Size / material / finish / quantity configuration
     • Add to cart with R2 artwork URL as line item property
   ============================================================ */

(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────────────────────
     CONFIG  —  edit these values for your store
     ────────────────────────────────────────────────────────────────────────── */
  var CFG = {
    /** Your deployed Cloudflare Worker URL — no trailing slash */
    workerUrl: 'https://stickers-api.slap.supply',

    /** Polling interval for BG removal (ms) */
    pollInterval: 2500,

    /** Max polling attempts before giving up (~75 seconds) */
    pollMaxAttempts: 30,

    /** Pricing table: quantity → unit price (USD) */
    pricing: {
      50:   { base: 1.50 },
      100:  { base: 1.20 },
      250:  { base: 0.85 },
      500:  { base: 0.60 },
      1000: { base: 0.40 }
    },

    /** Material surcharges (multiplied on base unit price) */
    materialMult: {
      vinyl:        1.0,
      clear:        1.1,
      glitter:      1.25,
      holographic:  1.35
    },

    /** Finish surcharges */
    finishMult: {
      matte: 1.0,
      gloss: 1.05
    },

    /** Rush surcharge (flat, added to total) */
    rushSurcharge: {
      standard: 0,
      rush: 15
    }
  };

  /* ──────────────────────────────────────────────────────────────────────────
     STATE
     ────────────────────────────────────────────────────────────────────────── */
  var S = {
    step: 1,

    /* upload */
    file:            null,
    originalDataURL: null,
    processedDataURL:null,   // BG-removed PNG data URL
    processedUrl:    null,   // permanent R2 URL (returned by Worker)
    artworkKey:      null,   // R2 key
    originalImage:   null,   // HTMLImageElement (original)
    processedImage:  null,   // HTMLImageElement (BG removed)
    showOriginal:    true,
    imageDPI:        0,
    imageWidth:      0,
    imageHeight:     0,

    /* bg removal */
    bgPredictionId:  null,
    bgPollTimer:     null,
    bgAttempts:      0,
    bgDone:          false,

    /* shape */
    shape:         'die-cut',
    contourPadding: 10,
    contourPath:   null,   // [{x,y}]
    imgX: 0, imgY: 0, imgScale: 1, imgRotation: 0,
    _drag: false, _dragSX: 0, _dragSY: 0, _dragIX: 0, _dragIY: 0,

    /* configure */
    sizeW: 2, sizeH: 2, sizeLabel: '2×2',
    material: 'vinyl',
    finish:   'matte',
    quantity: 100,
    rush:     'standard',

    /* canvas */
    zoom: 1
  };

  /* ──────────────────────────────────────────────────────────────────────────
     DOM CACHE
     ────────────────────────────────────────────────────────────────────────── */
  var D = {};

  function cacheDOM() {
    D.root = document.getElementById('sv2Root');
    if (!D.root) return false;

    /* steps */
    D.stepBtns  = D.root.querySelectorAll('.sv2__step');
    D.panels    = D.root.querySelectorAll('.sv2__panel');

    /* step 1 – upload */
    D.uploadZone  = D.root.getElementById ? D.root.getElementById('sv2UploadZone') : document.getElementById('sv2UploadZone');
    D.fileInput   = document.getElementById('sv2FileInput');
    D.filePreview = document.getElementById('sv2FilePreview');
    D.fileThumb   = document.getElementById('sv2FileThumb');
    D.fileName    = document.getElementById('sv2FileName');
    D.fileMeta    = document.getElementById('sv2FileMeta');
    D.dpiBadge    = document.getElementById('sv2DpiBadge');
    D.fileRemove  = document.getElementById('sv2FileRemove');

    D.bgStatus    = document.getElementById('sv2BgStatus');
    D.bgBarFill   = document.getElementById('sv2BgBarFill');
    D.bgText      = document.getElementById('sv2BgText');
    D.bgSkipBtn   = document.getElementById('sv2BgSkip');
    D.bgToggleBtn = document.getElementById('sv2BgToggle');

    D.step1Next = document.getElementById('sv2Step1Next');

    /* step 2 – shape */
    D.shapeBtns       = document.querySelectorAll('[data-shape]');
    D.diecutOptions   = document.getElementById('sv2DiecutOptions');
    D.contourPadding  = document.getElementById('sv2ContourPadding');
    D.contourPaddingV = document.getElementById('sv2ContourPaddingVal');

    /* step 3 – configure */
    D.sizeBtns  = document.querySelectorAll('[data-size]');
    D.matBtns   = document.querySelectorAll('[data-material]');
    D.finBtns   = document.querySelectorAll('[data-finish]');
    D.qtyBtns   = document.querySelectorAll('[data-qty]');
    D.rushBtns  = document.querySelectorAll('[data-rush]');

    /* step 4 – order */
    D.addToCart   = document.getElementById('sv2AddToCart');
    D.instructions= document.getElementById('sv2Instructions');
    D.success     = document.getElementById('sv2Success');

    /* preview (right column) */
    D.canvas        = document.getElementById('sv2Canvas');
    D.canvasEmpty   = document.getElementById('sv2CanvasEmpty');
    D.canvasLoading = document.getElementById('sv2CanvasLoading');
    D.loadingBar    = document.getElementById('sv2LoadingBar');
    D.loadingText   = document.getElementById('sv2LoadingText');
    D.zoomIn      = document.getElementById('sv2ZoomIn');
    D.zoomOut     = document.getElementById('sv2ZoomOut');
    D.zoomReset   = document.getElementById('sv2ZoomReset');
    D.zoomLabel   = document.getElementById('sv2ZoomLabel');

    /* specs panel */
    D.specShape    = document.getElementById('sv2SpecShape');
    D.specSize     = document.getElementById('sv2SpecSize');
    D.specMaterial = document.getElementById('sv2SpecMaterial');
    D.specFinish   = document.getElementById('sv2SpecFinish');
    D.specQty      = document.getElementById('sv2SpecQty');
    D.specTurn     = document.getElementById('sv2SpecTurn');
    D.priceAmount  = document.getElementById('sv2PriceAmount');
    D.priceUnit    = document.getElementById('sv2PriceUnit');

    return true;
  }

  /* ──────────────────────────────────────────────────────────────────────────
     STEP NAVIGATION
     ────────────────────────────────────────────────────────────────────────── */
  function goToStep(n) {
    if (n < 1 || n > 4) return;
    S.step = n;

    D.panels.forEach(function (p) {
      var active = parseInt(p.dataset.panel) === n;
      p.classList.toggle('sv2__panel--active', active);
    });

    D.stepBtns.forEach(function (b) {
      var num = parseInt(b.dataset.step);
      b.classList.toggle('sv2__step--active', num === n);
      b.classList.toggle('sv2__step--done',   num < n);
    });

    if (n === 4) updateOrderPreview();
    renderCanvas();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function initNavigation() {
    D.root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-goto]');
      if (btn) goToStep(parseInt(btn.dataset.goto));

      var stepBtn = e.target.closest('.sv2__step');
      if (stepBtn) {
        var n = parseInt(stepBtn.dataset.step);
        if (n <= S.step + 1 && n >= 1) goToStep(n);
      }
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     STEP 1 — UPLOAD
     ────────────────────────────────────────────────────────────────────────── */
  function initUpload() {
    var zone = document.getElementById('sv2UploadZone');
    if (!zone) return;

    /* The file input covers the whole zone via CSS, so a plain click on the zone
       already triggers the native file dialog.  Adding a second fileInput.click()
       call caused the dialog to open twice (double-select bug).  We only
       programmatically open the dialog when the click did NOT originate from the
       input itself (e.g. keyboard activation or label click). */
    zone.addEventListener('click', function (e) {
      if (e.target !== D.fileInput) {
        D.fileInput && D.fileInput.click();
      }
    });
    zone.addEventListener('dragover', function (e) {
      e.preventDefault();
      zone.classList.add('sv2__upload-zone--drag');
    });
    zone.addEventListener('dragleave', function () {
      zone.classList.remove('sv2__upload-zone--drag');
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('sv2__upload-zone--drag');
      var f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    });

    if (D.fileInput) {
      D.fileInput.addEventListener('change', function () {
        if (this.files[0]) handleFile(this.files[0]);
      });
    }

    if (D.fileRemove) {
      D.fileRemove.addEventListener('click', function (e) {
        e.stopPropagation();
        resetUpload();
      });
    }

    if (D.bgSkipBtn) {
      D.bgSkipBtn.addEventListener('click', function () {
        skipBgRemoval();
      });
    }

    if (D.bgToggleBtn) {
      D.bgToggleBtn.addEventListener('click', function () {
        togglePreview();
      });
    }
  }

  function handleFile(file) {
    if (!file.type.match(/^image\//)) {
      alert('Please upload an image file (PNG, JPG, GIF, WebP).');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      alert('File must be under 25 MB.');
      return;
    }

    S.file = file;
    S.processedDataURL = null;
    S.processedUrl     = null;
    S.artworkKey       = null;
    S.processedImage   = null;
    S.bgDone           = false;
    S.showOriginal     = true;
    S.contourPath      = null;
    stopBgPoll();

    /* Use a blob URL — zero-copy reference to the file on disk.
       FileReader.readAsDataURL() base64-encodes the whole file in RAM
       which causes Chrome OOM on large print files. */
    if (S.originalDataURL && S.originalDataURL.startsWith('blob:')) {
      URL.revokeObjectURL(S.originalDataURL);
    }
    S.originalDataURL = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      S.originalImage  = img;
      S.imageWidth     = img.naturalWidth;
      S.imageHeight    = img.naturalHeight;
      S.imageDPI       = guessDPI(file, img);
      showFilePreview();
      renderCanvas();
      startBgRemoval();
    };
    img.src = S.originalDataURL;
  }

  function showFilePreview() {
    if (!D.filePreview) return;
    D.filePreview.classList.add('sv2__file-preview--show');
    if (D.fileThumb) D.fileThumb.src = S.originalDataURL;
    if (D.fileName) D.fileName.textContent = S.file.name;
    if (D.fileMeta) D.fileMeta.textContent =
      formatBytes(S.file.size) + ' · ' + S.imageWidth + '×' + S.imageHeight + 'px';

    if (D.dpiBadge) {
      var dpi = S.imageDPI;
      D.dpiBadge.className = 'sv2__dpi-badge';
      if (dpi >= 300) {
        D.dpiBadge.textContent = dpi + ' DPI — PRINT READY';
        D.dpiBadge.classList.add('sv2__dpi-badge--ok');
      } else if (dpi >= 150) {
        D.dpiBadge.textContent = dpi + ' DPI — ACCEPTABLE';
        D.dpiBadge.classList.add('sv2__dpi-badge--warn');
      } else if (dpi > 0) {
        D.dpiBadge.textContent = dpi + ' DPI — LOW RES';
        D.dpiBadge.classList.add('sv2__dpi-badge--low');
      } else {
        D.dpiBadge.textContent = 'DPI UNKNOWN — CHECK RESOLUTION';
        D.dpiBadge.classList.add('sv2__dpi-badge--warn');
      }
    }

    var zone = document.getElementById('sv2UploadZone');
    if (zone) zone.style.display = 'none';
  }

  function resetUpload() {
    if (S.originalDataURL  && S.originalDataURL.startsWith('blob:'))  URL.revokeObjectURL(S.originalDataURL);
    if (S.processedDataURL && S.processedDataURL.startsWith('blob:')) URL.revokeObjectURL(S.processedDataURL);
    S.file = S.originalDataURL = S.processedDataURL = S.processedUrl = null;
    S.originalImage = S.processedImage = null;
    S.bgDone = false; S.showOriginal = true; S.contourPath = null;
    stopBgPoll();

    if (D.filePreview) D.filePreview.classList.remove('sv2__file-preview--show');
    if (D.bgStatus)    D.bgStatus.classList.remove('sv2__bg-status--show');
    if (D.bgToggleBtn) D.bgToggleBtn.style.display = 'none';
    if (D.step1Next)   D.step1Next.disabled = true;
    var zone = document.getElementById('sv2UploadZone');
    if (zone) zone.style.display = '';
    if (D.fileInput) D.fileInput.value = '';
    renderCanvas();
  }

  function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
    return (b/1024/1024).toFixed(1) + ' MB';
  }

  function guessDPI(file, img) {
    /* Very rough estimate from file size vs pixel count.
       Accurate DPI is only in the file's EXIF/metadata — not easily readable
       without a dedicated library. We use size/pixel heuristic as a proxy. */
    var px = img.naturalWidth * img.naturalHeight;
    var kb = file.size / 1024;
    if (px === 0) return 0;
    /* JPEG at 300 DPI typically compresses to ~0.1–0.3 bytes/pixel.
       PNG at 300 DPI is ~3–4 bytes/pixel (lossless).
       We flag anything that looks very low-res. */
    var ratio = file.size / px; // bytes per pixel
    if (file.type === 'image/png' || file.type === 'image/gif') {
      if (ratio > 2)   return 300;
      if (ratio > 0.5) return 200;
      return 72;
    }
    /* JPEG */
    if (ratio > 0.15)  return 300;
    if (ratio > 0.05)  return 150;
    return 72;
  }

  /* ──────────────────────────────────────────────────────────────────────────
     CANVAS LOADING OVERLAY
     ────────────────────────────────────────────────────────────────────────── */
  var _fauxTimer  = null;
  var _fauxTarget = 0;
  var _fauxCurrent= 0;

  var LOADING_STEPS = [
    { at: 5,  text: 'Uploading image...' },
    { at: 20, text: 'Sending to AI...' },
    { at: 40, text: 'Analyzing artwork...' },
    { at: 65, text: 'Removing background...' },
    { at: 85, text: 'Finalizing...' }
  ];

  function showLoadingOverlay() {
    if (D.canvasLoading) D.canvasLoading.style.display = 'flex';
    if (D.canvasEmpty)   D.canvasEmpty.style.display   = 'none';
    _fauxCurrent = 0;
    _fauxTarget  = 0;
    setLoadingBar(0, 'Preparing...');
  }

  function hideLoadingOverlay() {
    clearTimeout(_fauxTimer);
    setLoadingBar(100, 'Done!');
    setTimeout(function () {
      if (D.canvasLoading) D.canvasLoading.style.display = 'none';
    }, 600);
  }

  function setLoadingBar(pct, text) {
    if (D.loadingBar)  D.loadingBar.style.width = pct + '%';
    if (D.loadingText) D.loadingText.textContent = text || '';
  }

  /* Drive a smooth faux progress animation toward a target % */
  function fauxProgressTo(targetPct, label) {
    clearTimeout(_fauxTimer);
    _fauxTarget = targetPct;
    var step = LOADING_STEPS.slice().reverse().find(function (s) { return s.at <= targetPct; });
    var text = label || (step ? step.text : 'Processing...');
    setLoadingBar(targetPct, text);
  }

  /* ──────────────────────────────────────────────────────────────────────────
     BACKGROUND REMOVAL — Cloudflare Worker + Replicate polling
     ────────────────────────────────────────────────────────────────────────── */
  /* Resize image to maxPx on longest side and return a Blob (JPEG).
     Used to create a Replicate-safe version — the model runs at 1024px
     internally so anything beyond 1500px is wasted GPU memory. */
  function resizeToBlob(imgEl, maxPx, quality) {
    return new Promise(function (resolve) {
      var w = imgEl.naturalWidth  || imgEl.width;
      var h = imgEl.naturalHeight || imgEl.height;
      if (Math.max(w, h) > maxPx) {
        var sc = maxPx / Math.max(w, h);
        w = Math.round(w * sc);
        h = Math.round(h * sc);
      }
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(imgEl, 0, 0, w, h);
      c.toBlob(resolve, 'image/jpeg', quality || 0.92);
    });
  }

  function uploadRaw(blob, filename, mimeType) {
    return fetch(CFG.workerUrl + '/upload', {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        'X-Filename':   encodeURIComponent(filename),
        'X-File-Type':  mimeType
      },
      body: blob
    })
    .then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('Upload ' + r.status + ': ' + t); });
      return r.json();
    })
    .then(function (data) {
      if (data.error) throw new Error(data.error);
      return data;
    });
  }

  function startBgRemoval() {
    if (!S.file || !S.originalImage) return;

    showLoadingOverlay();
    fauxProgressTo(5, 'Uploading file...');
    setBgProgress('Uploading file...', 5);
    if (D.bgStatus)   D.bgStatus.classList.add('sv2__bg-status--show');
    if (D.step1Next)  D.step1Next.disabled = true;
    S.bgAttempts = 0;

    /* Step 1: stream original full-res file to R2 — this is the print file */
    uploadRaw(S.file, S.file.name, S.file.type || 'application/octet-stream')
    .then(function (original) {
      S.artworkKey = original.key;
      S.artworkUrl = original.url;
      fauxProgressTo(18, 'Preparing for AI...');

      /* Step 2: resize to 1024px for Replicate — model processes at 1024px
         internally, anything larger is wasted GPU memory → OOM. */
      return resizeToBlob(S.originalImage, 1024, 0.92)
      .then(function (blob) {
        return uploadRaw(blob, 'preview.jpg', 'image/jpeg');
      });
    })
    .then(function (preview) {
      fauxProgressTo(28, 'Sending to AI...');
      setBgProgress('Sending to AI...', 28);

      /* Step 3: tell Replicate to process the 1500px preview */
      return fetch(CFG.workerUrl + '/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: preview.key })
      });
    })
    .then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('BG removal ' + r.status + ': ' + t); });
      return r.json();
    })
    .then(function (data) {
      if (data.error) throw new Error(data.error);
      if (!data.id)   throw new Error('Worker returned no prediction ID');
      S.bgPredictionId = data.id;
      fauxProgressTo(35, 'Removing background...');
      setBgProgress('Removing background...', 35);
      schedulePoll();
    })
    .catch(function (err) {
      hideLoadingOverlay();
      setBgProgress('Error: ' + (err.message || 'unknown') + ' — upload a transparent PNG to skip', 0);
      if (D.bgSkipBtn) D.bgSkipBtn.style.display = '';
    });
  }

  function schedulePoll() {
    S.bgPollTimer = setTimeout(pollBgStatus, CFG.pollInterval);
  }

  function stopBgPoll() {
    if (S.bgPollTimer) { clearTimeout(S.bgPollTimer); S.bgPollTimer = null; }
    S.bgPredictionId = null; S.bgAttempts = 0;
  }

  function pollBgStatus() {
    if (!S.bgPredictionId) return;
    S.bgAttempts++;

    if (S.bgAttempts > CFG.pollMaxAttempts) {
      hideLoadingOverlay();
      setBgProgress('Timed out — upload a transparent PNG to skip', 0);
      if (D.bgSkipBtn) D.bgSkipBtn.style.display = '';
      return;
    }

    /* Smoothly advance faux progress bar: 20% → 88% over all poll attempts */
    var pct = 20 + Math.min(68, S.bgAttempts * (68 / CFG.pollMaxAttempts));
    var labels = ['Analyzing artwork...', 'Removing background...', 'Removing background...', 'Finalizing...'];
    var labelIdx = Math.min(labels.length - 1, Math.floor((pct - 20) / 17));
    fauxProgressTo(Math.round(pct), labels[labelIdx]);
    setBgProgress(labels[labelIdx], pct);

    fetch(CFG.workerUrl + '/check/' + S.bgPredictionId)
    .then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('Poll ' + r.status + ': ' + t); });
      return r.json();
    })
    .then(function (data) {
      if (data.status === 'succeeded') {
        fauxProgressTo(95, 'Loading result...');
        onBgRemoved(data.url, data.key);
      } else if (data.status === 'failed') {
        hideLoadingOverlay();
        setBgProgress('Failed: ' + (data.error || 'unknown') + ' — upload a PNG with transparent background to skip', 0);
        if (D.bgSkipBtn) D.bgSkipBtn.style.display = '';
      } else {
        schedulePoll();
      }
    })
    .catch(function (err) {
      console.warn('Poll error (retrying):', err);
      schedulePoll();
    });
  }

  function onBgRemoved(url, key) {
    S.processedUrl = url;
    S.artworkKey   = key;
    S.bgDone       = true;
    stopBgPoll();

    /* Load the image from the Worker URL */
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      S.processedImage   = img;
      S.processedDataURL = null;
      S.showOriginal     = false;
      S.contourPath      = null;

      hideLoadingOverlay();
      setBgProgress('Background removed!', 100);
      setTimeout(function () {
        if (D.bgStatus) D.bgStatus.classList.remove('sv2__bg-status--show');
      }, 1500);

      if (D.bgToggleBtn) D.bgToggleBtn.style.display = '';
      if (D.fileThumb)   D.fileThumb.src = url;
      if (D.step1Next)   D.step1Next.disabled = false;

      updateContour();
      renderCanvas();
    };
    img.onerror = function () {
      /* Fallback: fetch as blob → object URL (no base64 copy) */
      fetch(url)
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        if (S.processedDataURL && S.processedDataURL.startsWith('blob:')) {
          URL.revokeObjectURL(S.processedDataURL);
        }
        var blobUrl = URL.createObjectURL(blob);
        S.processedDataURL = blobUrl;
        var img2 = new Image();
        img2.onload = function () {
          S.processedImage   = img2;
          S.showOriginal     = false;
          S.contourPath      = null;
          setBgProgress('Background removed!', 100);
          setTimeout(function () {
            if (D.bgStatus) D.bgStatus.classList.remove('sv2__bg-status--show');
          }, 1500);
          if (D.bgToggleBtn) D.bgToggleBtn.style.display = '';
          if (D.fileThumb)   D.fileThumb.src = blobUrl;
          if (D.step1Next)   D.step1Next.disabled = false;
          updateContour();
          renderCanvas();
        };
        img2.src = blobUrl;
      })
      .catch(function () {
        setBgProgress('Could not load processed image — try skipping', 0);
        if (D.bgSkipBtn) D.bgSkipBtn.style.display = '';
      });
    };
    img.src = url;
  }

  function skipBgRemoval() {
    stopBgPoll();
    hideLoadingOverlay();
    S.processedImage   = S.originalImage;
    S.processedDataURL = S.originalDataURL;
    S.processedUrl     = null; // will use originalDataURL at cart time
    S.showOriginal     = false;
    S.bgDone           = true;
    S.contourPath      = null;

    if (D.bgStatus)   D.bgStatus.classList.remove('sv2__bg-status--show');
    if (D.step1Next)  D.step1Next.disabled = false;
    if (D.bgSkipBtn)  D.bgSkipBtn.style.display = 'none';

    updateContour();
    renderCanvas();
  }

  function togglePreview() {
    S.showOriginal = !S.showOriginal;
    if (D.bgToggleBtn) D.bgToggleBtn.textContent = S.showOriginal ? 'SHOW PROCESSED' : 'SHOW ORIGINAL';
    if (D.fileThumb) {
      D.fileThumb.src = S.showOriginal
        ? S.originalDataURL
        : (S.processedUrl || S.processedDataURL || S.originalDataURL);
    }
    renderCanvas();
  }

  function setBgProgress(text, pct) {
    if (D.bgBarFill) D.bgBarFill.style.width = pct + '%';
    if (D.bgText)    D.bgText.textContent = text;
  }

  /* ──────────────────────────────────────────────────────────────────────────
     STEP 2 — SHAPE SELECTION
     ────────────────────────────────────────────────────────────────────────── */
  function initShapeSelection() {
    D.shapeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        S.shape = this.dataset.shape;
        D.shapeBtns.forEach(function (b) {
          b.classList.toggle('sv2__shape-btn--active', b.dataset.shape === S.shape);
        });
        var isDieCut = S.shape === 'die-cut';
        if (D.diecutOptions) D.diecutOptions.style.display = isDieCut ? '' : 'none';
        if (!isDieCut) {
          /* reset image transform for preset shapes */
          S.imgX = 0; S.imgY = 0; S.imgScale = 1; S.imgRotation = 0;
        }
        renderCanvas();
      });
    });

    if (D.contourPadding) {
      var debounce;
      D.contourPadding.addEventListener('input', function () {
        S.contourPadding = parseInt(this.value);
        if (D.contourPaddingV) D.contourPaddingV.textContent = this.value + 'px';
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          S.contourPath = null;
          updateContour();
          renderCanvas();
        }, 200);
      });
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────
     STEP 3 — CONFIGURE
     ────────────────────────────────────────────────────────────────────────── */
  function initConfigure() {
    D.sizeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        D.sizeBtns.forEach(function (b) { b.classList.remove('sv2__size-btn--active'); });
        this.classList.add('sv2__size-btn--active');
        var parts = this.dataset.size.split('x');
        S.sizeW     = parseFloat(parts[0]);
        S.sizeH     = parseFloat(parts[1]);
        S.sizeLabel = parts[0] + '×' + parts[1];
        updateSpecs(); renderCanvas();
      });
    });

    D.matBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        D.matBtns.forEach(function (b) { b.classList.remove('sv2__option-btn--active'); });
        this.classList.add('sv2__option-btn--active');
        S.material = this.dataset.material;
        updateSpecs();
      });
    });

    D.finBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        D.finBtns.forEach(function (b) { b.classList.remove('sv2__option-btn--active'); });
        this.classList.add('sv2__option-btn--active');
        S.finish = this.dataset.finish;
        updateSpecs();
      });
    });

    D.qtyBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        D.qtyBtns.forEach(function (b) { b.classList.remove('sv2__option-btn--active'); });
        this.classList.add('sv2__option-btn--active');
        S.quantity = parseInt(this.dataset.qty);
        updateSpecs();
      });
    });

    D.rushBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        D.rushBtns.forEach(function (b) { b.classList.remove('sv2__option-btn--active'); });
        this.classList.add('sv2__option-btn--active');
        S.rush = this.dataset.rush;
        updateSpecs();
      });
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     PRICING + SPECS
     ────────────────────────────────────────────────────────────────────────── */
  function calcPrice() {
    var row = CFG.pricing[S.quantity] || CFG.pricing[100];
    var unit = row.base
      * (CFG.materialMult[S.material] || 1)
      * (CFG.finishMult[S.finish] || 1);
    var rush  = CFG.rushSurcharge[S.rush] || 0;
    var total = unit * S.quantity + rush;
    return { unit: unit, total: total, rush: rush };
  }

  var MATERIAL_LABELS = { vinyl: 'Vinyl', clear: 'Clear', glitter: 'Glitter', holographic: 'Holographic' };
  var FINISH_LABELS   = { matte: 'Matte', gloss: 'Glossy' };
  var SHAPE_LABELS    = {
    'die-cut': 'Die-Cut', circle: 'Circle', square: 'Square',
    rectangle: 'Rectangle', oval: 'Oval', hexagon: 'Hexagon', heart: 'Heart', star: 'Star'
  };

  function updateSpecs() {
    var p = calcPrice();
    if (D.specShape)    D.specShape.textContent    = SHAPE_LABELS[S.shape] || S.shape;
    if (D.specSize)     D.specSize.textContent     = S.sizeW + '" × ' + S.sizeH + '"';
    if (D.specMaterial) D.specMaterial.textContent = MATERIAL_LABELS[S.material] || S.material;
    if (D.specFinish)   D.specFinish.textContent   = FINISH_LABELS[S.finish] || S.finish;
    if (D.specQty)      D.specQty.textContent      = S.quantity + ' pcs';
    if (D.specTurn)     D.specTurn.textContent     = S.rush === 'rush' ? '1–2 Days' : '3–5 Days';
    if (D.priceAmount)  D.priceAmount.textContent  = '$' + p.total.toFixed(2);
    if (D.priceUnit)    D.priceUnit.textContent    = '$' + p.unit.toFixed(2) + '/ea';
  }

  function updateOrderPreview() {
    updateSpecs();
  }

  /* ──────────────────────────────────────────────────────────────────────────
     CANVAS RENDERING
     ────────────────────────────────────────────────────────────────────────── */
  function renderCanvas() {
    var cv = D.canvas;
    if (!cv) return;
    var ctx = cv.getContext('2d');

    /* Size the canvas to its container */
    var wrap = cv.parentElement;
    var size = wrap ? Math.min(wrap.clientWidth, wrap.clientHeight) || 380 : 380;
    cv.width  = size;
    cv.height = size;

    ctx.clearRect(0, 0, size, size);

    var img = S.showOriginal ? S.originalImage : S.processedImage;

    if (!img) {
      if (D.canvasEmpty) D.canvasEmpty.style.display = '';
      return;
    }
    if (D.canvasEmpty) D.canvasEmpty.style.display = 'none';

    /* Draw checkerboard background */
    drawCheckerboard(ctx, size, size);

    var zoom    = S.zoom;
    var padArea = size * 0.12; /* 12% margin inside canvas */
    var maxDim  = (size - padArea * 2) * zoom;
    var iw = img.naturalWidth  || img.width;
    var ih = img.naturalHeight || img.height;

    /* Fit image within canvas, keeping aspect ratio */
    var scale = Math.min(maxDim / iw, maxDim / ih);
    var dw = iw * scale;
    var dh = ih * scale;
    var dx = (size - dw) / 2 + S.imgX;
    var dy = (size - dh) / 2 + S.imgY;

    ctx.save();
    ctx.translate(size / 2 + S.imgX, size / 2 + S.imgY);
    ctx.rotate(S.imgRotation * Math.PI / 180);
    ctx.translate(-(size / 2 + S.imgX), -(size / 2 + S.imgY));

    if (S.shape === 'die-cut') {
      drawDieCut(ctx, img, dx, dy, dw, dh, scale, size);
    } else {
      drawPresetShape(ctx, img, dx, dy, dw, dh, size);
    }

    ctx.restore();

    /* Registration marks */
    drawRegMarks(ctx, size);
  }

  function drawCheckerboard(ctx, w, h) {
    var sq = 12;
    for (var y = 0; y < h; y += sq) {
      for (var x = 0; x < w; x += sq) {
        ctx.fillStyle = ((x / sq + y / sq) % 2 === 0) ? '#e8e8e8' : '#f8f8f8';
        ctx.fillRect(x, y, sq, sq);
      }
    }
  }

  function drawRegMarks(ctx, size) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth   = 1;
    var m  = 8;
    var ln = 12;
    [[m, m], [size - m, m], [m, size - m], [size - m, size - m]].forEach(function (pt) {
      var x = pt[0], y = pt[1];
      ctx.beginPath();
      ctx.moveTo(x - ln / 2, y); ctx.lineTo(x + ln / 2, y);
      ctx.moveTo(x, y - ln / 2); ctx.lineTo(x, y + ln / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  /* Die-cut drawing */
  function drawDieCut(ctx, img, dx, dy, dw, dh, scale, canvasSize) {
    /* Trace contour if not cached */
    if (!S.contourPath || S.contourPath.length < 3) updateContour();

    /* Draw image */
    ctx.drawImage(img, dx, dy, dw, dh);

    /* Draw cut line along contour path */
    if (S.contourPath && S.contourPath.length > 2) {
      var pts = S.contourPath;
      var iw  = img.naturalWidth  || img.width;
      var ih  = img.naturalHeight || img.height;
      var imgScale = Math.min(dw / iw, dh / ih);
      var offX = dx + (dw - iw * imgScale) / 2;
      var offY = dy + (dh - ih * imgScale) / 2;

      ctx.save();
      ctx.setLineDash([5, 3]);
      ctx.lineWidth   = 1.5;
      ctx.strokeStyle = '#ff0000';
      ctx.beginPath();
      ctx.moveTo(pts[0].x * imgScale + offX, pts[0].y * imgScale + offY);
      for (var i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * imgScale + offX, pts[i].y * imgScale + offY);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  /* Preset shape drawing */
  function drawPresetShape(ctx, img, dx, dy, dw, dh, canvasSize) {
    var cx   = dx + dw / 2;
    var cy   = dy + dh / 2;
    var rw   = dw / 2;
    var rh   = dh / 2;
    var path = new Path2D();

    switch (S.shape) {
      case 'circle':
        path.arc(cx, cy, Math.min(rw, rh), 0, Math.PI * 2);
        break;
      case 'square': {
        var sq = Math.min(dw, dh);
        path.rect(cx - sq / 2, cy - sq / 2, sq, sq);
        break;
      }
      case 'rectangle':
        path.rect(dx, dy, dw, dh);
        break;
      case 'oval':
        path.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
        break;
      case 'hexagon':
        for (var i = 0; i < 6; i++) {
          var angle = (Math.PI / 3) * i - Math.PI / 6;
          var hx = cx + Math.min(rw, rh) * Math.cos(angle);
          var hy = cy + Math.min(rw, rh) * Math.sin(angle);
          if (i === 0) path.moveTo(hx, hy); else path.lineTo(hx, hy);
        }
        path.closePath();
        break;
      case 'heart': {
        var hs = Math.min(dw, dh) * 0.45;
        path.moveTo(cx, cy + hs * 0.9);
        path.bezierCurveTo(cx - hs * 1.5, cy + hs * 0.2, cx - hs * 2, cy - hs * 0.8, cx - hs, cy - hs * 0.6);
        path.bezierCurveTo(cx - hs * 0.4, cy - hs * 1.1, cx, cy - hs * 0.6, cx, cy - hs * 0.1);
        path.bezierCurveTo(cx, cy - hs * 0.6, cx + hs * 0.4, cy - hs * 1.1, cx + hs, cy - hs * 0.6);
        path.bezierCurveTo(cx + hs * 2, cy - hs * 0.8, cx + hs * 1.5, cy + hs * 0.2, cx, cy + hs * 0.9);
        path.closePath();
        break;
      }
      case 'star': {
        var outerR = Math.min(rw, rh);
        var innerR = outerR * 0.45;
        for (var i = 0; i < 10; i++) {
          var a  = (Math.PI / 5) * i - Math.PI / 2;
          var r  = (i % 2 === 0) ? outerR : innerR;
          var sx = cx + r * Math.cos(a);
          var sy = cy + r * Math.sin(a);
          if (i === 0) path.moveTo(sx, sy); else path.lineTo(sx, sy);
        }
        path.closePath();
        break;
      }
      default:
        path.rect(dx, dy, dw, dh);
    }

    /* Clip image to shape */
    ctx.save();
    ctx.clip(path);
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();

    /* Cut line */
    ctx.save();
    ctx.setLineDash([5, 3]);
    ctx.lineWidth   = 1.5;
    ctx.strokeStyle = '#ff0000';
    ctx.stroke(path);
    ctx.restore();
  }

  /* ──────────────────────────────────────────────────────────────────────────
     CONTOUR TRACING (Die-cut)
     Ported from slap-sticker-customizer v1 with minor refinements
     ────────────────────────────────────────────────────────────────────────── */
  function updateContour() {
    var src = S.processedImage || S.originalImage;
    if (!src) return;
    S.contourPath = traceContour(src, S.contourPadding);
  }

  function traceContour(imgEl, padding) {
    var maxDim = 400;
    var iw = imgEl.naturalWidth  || imgEl.width;
    var ih = imgEl.naturalHeight || imgEl.height;
    var sc = Math.min(1, maxDim / Math.max(iw, ih));
    var cw = Math.round(iw * sc);
    var ch = Math.round(ih * sc);

    var offCanvas = document.createElement('canvas');
    offCanvas.width = cw; offCanvas.height = ch;
    var ctx = offCanvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(imgEl, 0, 0, cw, ch);
    var data = ctx.getImageData(0, 0, cw, ch).data;

    /* Binary mask from alpha channel */
    var mask  = new Uint8Array(cw * ch);
    var aThresh = 128;
    var tCount  = 0;
    for (var i = 0; i < cw * ch; i++) {
      mask[i] = data[i * 4 + 3] > aThresh ? 1 : 0;
      if (!mask[i]) tCount++;
    }
    var tRatio = tCount / (cw * ch);

    /* Fallback to colour-edge detection for fully opaque images */
    if (tRatio < 0.01) {
      var bgR = data[0], bgG = data[1], bgB = data[2];
      for (var i = 0; i < cw * ch; i++) {
        var p = i * 4;
        var d = Math.abs(data[p]-bgR) + Math.abs(data[p+1]-bgG) + Math.abs(data[p+2]-bgB);
        mask[i] = d > 120 ? 1 : 0;
      }
    }

    if (tRatio >= 0.01) mask = keepLargestComponent(mask, cw, ch);

    /* Morphological close to fill gaps */
    mask = erodeMask(dilateMask(mask, cw, ch, 2), cw, ch, 2);

    /* Dilate by padding */
    var padPx = Math.max(1, Math.round(padding * sc));
    var dilated = dilateMask(mask, cw, ch, padPx);

    /* Trace boundary */
    var pts = marchingSquares(dilated, cw, ch);
    pts = douglasPeucker(pts, 2);

    /* Scale back to image coordinates */
    var inv = 1 / sc;
    return pts.map(function (p) { return { x: p.x * inv, y: p.y * inv }; });
  }

  function dilateMask(mask, w, h, r) {
    var out = new Uint8Array(w * h);
    var r2  = r * r;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        for (var dy = -r; dy <= r; dy++) {
          for (var dx = -r; dx <= r; dx++) {
            if (dx*dx + dy*dy > r2) continue;
            var nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) out[ny * w + nx] = 1;
          }
        }
      }
    }
    return out;
  }

  function erodeMask(mask, w, h, r) {
    var out = new Uint8Array(w * h);
    var r2  = r * r;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        var ok = true;
        outer: for (var dy = -r; dy <= r && ok; dy++) {
          for (var dx = -r; dx <= r && ok; dx++) {
            if (dx*dx + dy*dy > r2) continue;
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h || !mask[ny * w + nx]) ok = false;
          }
        }
        if (ok) out[y * w + x] = 1;
      }
    }
    return out;
  }

  function keepLargestComponent(mask, w, h) {
    var labels = new Int32Array(w * h);
    var next = 1, bestLabel = 0, bestSize = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = y * w + x;
        if (!mask[idx] || labels[idx]) continue;
        var label  = next++;
        var queue  = [idx];
        labels[idx]= label;
        var size   = 0;
        var head   = 0;
        while (head < queue.length) {
          var ci = queue[head++]; size++;
          var cx2 = ci % w, cy2 = (ci - cx2) / w;
          var neighbors = [ci-1, ci+1, ci-w, ci+w];
          var valid = [cx2>0, cx2<w-1, cy2>0, cy2<h-1];
          for (var k = 0; k < 4; k++) {
            if (valid[k] && mask[neighbors[k]] && !labels[neighbors[k]]) {
              labels[neighbors[k]] = label;
              queue.push(neighbors[k]);
            }
          }
        }
        if (size > bestSize) { bestSize = size; bestLabel = label; }
      }
    }
    var out = new Uint8Array(w * h);
    for (var i = 0; i < w * h; i++) out[i] = labels[i] === bestLabel ? 1 : 0;
    return out;
  }

  function marchingSquares(mask, w, h) {
    var sx = -1, sy = -1;
    outer: for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (mask[y * w + x]) { sx = x; sy = y; break outer; }
      }
    }
    if (sx === -1) return [];
    var dx8 = [-1,-1, 0, 1, 1, 1, 0,-1];
    var dy8 = [ 0,-1,-1,-1, 0, 1, 1, 1];
    function filled(x, y) { return x>=0 && x<w && y>=0 && y<h && mask[y*w+x]===1; }
    var pts = [], cx = sx, cy = sy, enterDir = 6;
    var startEnterDir = -1, started = false;
    var maxIter = w * h * 4, iter = 0;
    do {
      pts.push({ x: cx, y: cy });
      var backDir = (enterDir + 4) % 8;
      var checkStart = (backDir + 1) % 8;
      var found = false;
      for (var i = 0; i < 8; i++) {
        var d = (checkStart + i) % 8;
        var nx = cx + dx8[d], ny = cy + dy8[d];
        if (filled(nx, ny)) {
          if (!started) { startEnterDir = d; started = true; }
          cx = nx; cy = ny; enterDir = d; found = true; break;
        }
      }
      if (!found) break;
    } while (!((cx===sx && cy===sy && enterDir===startEnterDir) || ++iter>=maxIter));
    return pts;
  }

  function douglasPeucker(pts, eps) {
    if (pts.length <= 2) return pts;
    var maxD = 0, maxI = 0, end = pts.length - 1;
    for (var i = 1; i < end; i++) {
      var d = perpDist(pts[i], pts[0], pts[end]);
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > eps) {
      var L = douglasPeucker(pts.slice(0, maxI + 1), eps);
      var R = douglasPeucker(pts.slice(maxI), eps);
      return L.slice(0, -1).concat(R);
    }
    return [pts[0], pts[end]];
  }

  function perpDist(pt, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx*dx + dy*dy);
    if (!len) return Math.sqrt(Math.pow(pt.x-a.x,2) + Math.pow(pt.y-a.y,2));
    return Math.abs(dy*pt.x - dx*pt.y + b.x*a.y - b.y*a.x) / len;
  }

  /* ──────────────────────────────────────────────────────────────────────────
     CANVAS INTERACTIONS (drag to reposition image in preset shapes)
     ────────────────────────────────────────────────────────────────────────── */
  function initCanvasInteractions() {
    var cv = D.canvas;
    if (!cv) return;

    function startDrag(ex, ey) {
      if (S.shape === 'die-cut') return;
      S._drag = true;
      S._dragSX = ex; S._dragSY = ey;
      S._dragIX = S.imgX; S._dragIY = S.imgY;
      cv.style.cursor = 'grabbing';
    }
    function moveDrag(ex, ey) {
      if (!S._drag) return;
      S.imgX = S._dragIX + ex - S._dragSX;
      S.imgY = S._dragIY + ey - S._dragSY;
      renderCanvas();
    }
    function endDrag() { S._drag = false; cv.style.cursor = ''; }

    cv.addEventListener('mousedown',  function (e) { startDrag(e.offsetX, e.offsetY); });
    cv.addEventListener('mousemove',  function (e) { moveDrag(e.offsetX, e.offsetY); });
    cv.addEventListener('mouseup',    endDrag);
    cv.addEventListener('mouseleave', endDrag);

    cv.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; var r = cv.getBoundingClientRect();
      startDrag(t.clientX - r.left, t.clientY - r.top); e.preventDefault();
    }, { passive: false });
    cv.addEventListener('touchmove', function (e) {
      var t = e.touches[0]; var r = cv.getBoundingClientRect();
      moveDrag(t.clientX - r.left, t.clientY - r.top); e.preventDefault();
    }, { passive: false });
    cv.addEventListener('touchend', endDrag);
  }

  /* ──────────────────────────────────────────────────────────────────────────
     ZOOM CONTROLS
     ────────────────────────────────────────────────────────────────────────── */
  function initZoom() {
    if (D.zoomIn)    D.zoomIn.addEventListener('click',    function () { S.zoom = Math.min(3, S.zoom + 0.2); updateZoomLabel(); renderCanvas(); });
    if (D.zoomOut)   D.zoomOut.addEventListener('click',   function () { S.zoom = Math.max(0.3, S.zoom - 0.2); updateZoomLabel(); renderCanvas(); });
    if (D.zoomReset) D.zoomReset.addEventListener('click', function () { S.zoom = 1; S.imgX = 0; S.imgY = 0; updateZoomLabel(); renderCanvas(); });
    updateZoomLabel();
  }

  function updateZoomLabel() {
    if (D.zoomLabel) D.zoomLabel.textContent = Math.round(S.zoom * 100) + '%';
  }

  /* ──────────────────────────────────────────────────────────────────────────
     STEP 4 — ADD TO CART
     ────────────────────────────────────────────────────────────────────────── */
  function initCart() {
    if (D.addToCart) {
      D.addToCart.addEventListener('click', submitOrder);
    }
  }

  function submitOrder() {
    var price = calcPrice();

    var properties = {
      'Shape':       SHAPE_LABELS[S.shape] || S.shape,
      'Size':        S.sizeW + '" × ' + S.sizeH + '"',
      'Material':    MATERIAL_LABELS[S.material] || S.material,
      'Finish':      FINISH_LABELS[S.finish] || S.finish,
      'Quantity':    S.quantity + ' pcs',
      'Turnaround':  S.rush === 'rush' ? '1–2 Days (Rush)' : '3–5 Days (Standard)',
      'Unit Price':  '$' + price.unit.toFixed(2),
      'Total Price': '$' + price.total.toFixed(2),
      '_artwork_url': S.processedUrl || 'original-uploaded',
      '_artwork_filename': S.file ? S.file.name : 'unknown',
      '_artwork_dpi': S.imageDPI ? S.imageDPI + ' DPI' : 'unknown'
    };

    if (S.rush === 'rush' && price.rush > 0) {
      properties['Rush Surcharge'] = '+$' + price.rush.toFixed(2);
    }
    if (S.shape === 'die-cut') {
      properties['Contour Padding'] = S.contourPadding + 'px';
    }
    if (D.instructions && D.instructions.value.trim()) {
      properties['Special Instructions'] = D.instructions.value.trim();
    }

    D.addToCart.disabled = true;
    D.addToCart.textContent = 'ADDING...';

    /* Find a "custom sticker" product then add to cart */
    fetch('/search/suggest.json?q=custom+sticker&resources[type]=product&resources[limit]=1')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var prods = data.resources && data.resources.results && data.resources.results.products;
      if (prods && prods.length) {
        return fetch(prods[0].url + '.json').then(function (r) { return r.json(); });
      }
      return null;
    })
    .then(function (pd) {
      var variantId = pd && pd.product && pd.product.variants && pd.product.variants[0]
        ? pd.product.variants[0].id : null;

      if (!variantId) {
        /* Fallback: grab first product in store */
        return fetch('/products.json?limit=1')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          return d.products && d.products[0] && d.products[0].variants && d.products[0].variants[0]
            ? d.products[0].variants[0].id : null;
        });
      }
      return variantId;
    })
    .then(function (variantId) {
      if (!variantId) {
        showSuccess();
        alert('No "Custom Sticker" product found. Create a product with that name and cart integration will work automatically.');
        return;
      }
      return fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: variantId, quantity: 1, properties: properties }] })
      })
      .then(function (r) { if (!r.ok) throw new Error('Cart error'); return r.json(); })
      .then(function () { showSuccess(); updateCartBubble(); });
    })
    .catch(function (err) {
      console.error('Cart error:', err);
      showSuccess();
    });
  }

  function showSuccess() {
    if (D.addToCart) { D.addToCart.disabled = false; D.addToCart.textContent = 'ADD TO CART →'; }
    if (D.success)   D.success.classList.add('sv2__success--show');
    if (D.success)   D.success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function updateCartBubble() {
    fetch('/cart.js')
    .then(function (r) { return r.json(); })
    .then(function (cart) {
      document.querySelectorAll('.cart-count-bubble span, [data-cart-count]').forEach(function (el) {
        el.textContent = cart.item_count;
      });
    })
    .catch(function () {});
  }

  /* ──────────────────────────────────────────────────────────────────────────
     RESIZE HANDLER
     ────────────────────────────────────────────────────────────────────────── */
  function initResize() {
    var timer;
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(renderCanvas, 150);
    });
  }

  /* ──────────────────────────────────────────────────────────────────────────
     BOOTSTRAP
     ────────────────────────────────────────────────────────────────────────── */
  function init() {
    if (!cacheDOM()) return; /* section not on this page */

    initNavigation();
    initUpload();
    initShapeSelection();
    initConfigure();
    initCanvasInteractions();
    initZoom();
    initCart();
    initResize();
    updateSpecs();
    renderCanvas();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
