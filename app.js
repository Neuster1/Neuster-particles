/* ═══════════════════════════════════════════
   NEUSTER PARTICLES — app.js
   FIXES:
   1. Single shared Camera + Hands instance (no more 3 competing pipelines)
   2. selfieMode: true on Hands → correct mirroring, landmarks match screen
   3. PIP drawn mirrored (CSS scaleX(-1) was not enough — draw mirrored)
   4. Kalman filter smoothing per landmark
   5. Grace period (8 frames) so hand disappears don't cause jitter
   6. Gesture confirmation buffer (4 frames)
   7. 480x360 feed instead of 640x480 → ~40% faster inference
═══════════════════════════════════════════ */

'use strict';

/* ─── GLOBAL STATE ──────────────────────── */
window.NP = {
  currentPage: 1,
  handData:    { detected: false, gesture: 'none' },
  recording:   false,
  mediaRecorder: null,
  recordedChunks: [],
  // Single shared pipeline
  _callback: null,
  _tracking: false,
};

/* ─── PAGE ROUTING ──────────────────────── */
function switchPage(num) {
  document.querySelectorAll('.page').forEach(function(p)   { p.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function(b){ b.classList.remove('active'); });
  document.getElementById('page-' + num).classList.add('active');
  document.querySelector('.nav-btn[data-page="' + num + '"]').classList.add('active');
  NP.currentPage = num;

  if (num === 1 && window.P1) P1.onActivate();
  if (num === 2 && window.P2) P2.onActivate();
  if (num === 3 && window.P3) P3.onActivate();

  // Register the new page's callback immediately
  if (num === 1 && window.P1) NP._callback = P1.onHandResults;
  if (num === 2 && window.P2) NP._callback = P2.onHandResults;
  if (num === 3 && window.P3) NP._callback = P3.onHandResults;

  var key = 'np_tutorial_p' + num;
  if (!localStorage.getItem(key)) {
    setTimeout(function() { showTutorial(num); }, 900);
    localStorage.setItem(key, '1');
  }
}

document.querySelectorAll('.nav-btn').forEach(function(btn) {
  btn.addEventListener('click', function() { switchPage(+btn.dataset.page); });
});

/* ═══════════════════════════════════════════
   KALMAN FILTER (1D, per axis)
═══════════════════════════════════════════ */
function KalmanFilter(R, Q) {
  this.R = R !== undefined ? R : 0.01;
  this.Q = Q !== undefined ? Q : 0.001;
  this.x = null;
  this.P = 1;
  this.K = 0;
}
KalmanFilter.prototype.update = function(m) {
  if (this.x === null) { this.x = m; return m; }
  this.P += this.Q;
  this.K  = this.P / (this.P + this.R);
  this.x  = this.x + this.K * (m - this.x);
  this.P  = (1 - this.K) * this.P;
  return this.x;
};

function buildKalmanBank() {
  var bank = [];
  for (var h = 0; h < 2; h++) {
    bank[h] = [];
    for (var j = 0; j < 21; j++) {
      bank[h][j] = {
        x: new KalmanFilter(0.006, 0.0006),
        y: new KalmanFilter(0.006, 0.0006),
        z: new KalmanFilter(0.01,  0.001),
      };
    }
  }
  return bank;
}

/* ═══════════════════════════════════════════
   GESTURE CONFIRMATION BUFFER (4 frames)
═══════════════════════════════════════════ */
var CONFIRM_N = 4;
function GestureBuffer() {
  this.buf = [];
  this.confirmed = 'none';
  this.prev = 'none';
}
GestureBuffer.prototype.push = function(raw) {
  this.buf.push(raw);
  if (this.buf.length > CONFIRM_N) this.buf.shift();
  if (this.buf.length === CONFIRM_N && this.buf.every(function(g){ return g === raw; })) {
    this.prev      = this.confirmed;
    this.confirmed = raw;
  }
  return this.confirmed;
};

/* ═══════════════════════════════════════════
   GRACE PERIOD (8 frames — keeps last landmarks)
═══════════════════════════════════════════ */
var GRACE_N = 8;
function GracePeriod() {
  this.gone = 0;
  this.last = null;
}
GracePeriod.prototype.update = function(detected, lm) {
  if (detected) { this.gone = 0; this.last = lm; return { ok: true, lm: lm, grace: false }; }
  this.gone++;
  if (this.gone <= GRACE_N && this.last) return { ok: true, lm: this.last, grace: true };
  return { ok: false, lm: null, grace: false };
};

/* ═══════════════════════════════════════════
   SINGLE SHARED HAND TRACKING PIPELINE
   ONE Camera + ONE Hands instance.
   All pages share it; the active page's callback
   is stored in NP._callback.
   
   FIX — mirror:
     selfieMode: true  makes MediaPipe Hands flip
     the landmark x coords so x=0 is LEFT of screen
     (matching what the user sees in a mirror/selfie).
     We also draw the PIP with ctx.scale(-1,1) so the
     video is mirrored to match.
═══════════════════════════════════════════ */

var _kalman     = buildKalmanBank();
var _gestureBuf = new GestureBuffer();
var _grace0     = new GracePeriod();
var _grace1     = new GracePeriod();
var _pipCanvas  = null;   // drawn each frame
var _pipCtx     = null;

function _onRawResults(results) {
  /* ── 1. Kalman filter ── */
  if (results.multiHandLandmarks) {
    results.multiHandLandmarks.forEach(function(lm, hi) {
      if (hi >= 2) return;
      lm.forEach(function(p, j) {
        p.x = _kalman[hi][j].x.update(p.x);
        p.y = _kalman[hi][j].y.update(p.y);
        p.z = _kalman[hi][j].z.update(p.z);
      });
    });
  } else {
    // Reset Kalman so old state doesn't bleed into next appearance
    _kalman = buildKalmanBank();
  }

  /* ── 2. Grace period ── */
  var r0 = results.multiHandLandmarks && results.multiHandLandmarks[0];
  var r1 = results.multiHandLandmarks && results.multiHandLandmarks[1];
  var g0 = _grace0.update(!!r0, r0 || null);
  var g1 = _grace1.update(!!r1, r1 || null);
  var graced = [];
  if (g0.ok && g0.lm) graced.push(g0.lm);
  if (g1.ok && g1.lm) graced.push(g1.lm);
  results.multiHandLandmarks = graced.length > 0 ? graced : null;
  results._inGrace = g0.grace || g1.grace;

  /* ── 3. Gesture confirmation buffer ── */
  var raw       = detectGestureRaw(results);
  var confirmed = _gestureBuf.push(raw);
  results._confirmedGesture = confirmed;
  results._prevGesture      = _gestureBuf.prev;

  /* ── 4. Draw PIP for active page ── */
  var pipId = { 1: 'pip-canvas-p1', 2: 'pip-canvas-p2', 3: 'pip-canvas-p3' }[NP.currentPage];
  var pipEl = pipId ? document.getElementById(pipId) : null;
  if (pipEl && results.image) {
    if (_pipCanvas !== pipEl) {
      _pipCanvas = pipEl;
      _pipCtx    = pipEl.getContext('2d');
    }
    var dpr = window.devicePixelRatio || 1;
    var pw  = _pipCanvas.offsetWidth  || 180;
    var ph  = _pipCanvas.offsetHeight || 135;
    var tw  = Math.round(pw * dpr);
    var th  = Math.round(ph * dpr);
    if (_pipCanvas.width !== tw) { _pipCanvas.width = tw; _pipCanvas.height = th; }

    // Draw video mirrored (selfieMode landmarks are already mirrored)
    _pipCtx.save();
    _pipCtx.scale(-1, 1);
    _pipCtx.translate(-_pipCanvas.width, 0);
    _pipCtx.drawImage(results.image, 0, 0, _pipCanvas.width, _pipCanvas.height);
    _pipCtx.restore();

    if (results.multiHandLandmarks) {
      results.multiHandLandmarks.forEach(function(lm) {
        var alpha = results._inGrace ? 0.3 : 0.8;
        drawConnectors(_pipCtx, lm, HAND_CONNECTIONS, { color: 'rgba(168,85,247,' + alpha + ')', lineWidth: 1.5 });
        drawLandmarks(_pipCtx,  lm, { color: 'rgba(34,211,238,' + (results._inGrace ? 0.4 : 1.0) + ')', lineWidth: 1, radius: 2 });
      });
    }
  }

  /* ── 5. Nav status dot ── */
  var detected = !!(results.multiHandLandmarks && results.multiHandLandmarks.length > 0);
  var dot   = document.getElementById('nav-hand-dot');
  var label = document.getElementById('nav-hand-label');
  if (dot && label) {
    if (detected && results._inGrace) {
      dot.className  = 'hand-dot grace';
      label.textContent = 'Grace...';
    } else {
      dot.className  = 'hand-dot ' + (detected ? 'active' : 'inactive');
      label.textContent = detected
        ? results.multiHandLandmarks.length + ' hand' + (results.multiHandLandmarks.length > 1 ? 's' : '')
        : 'No hand';
    }
  }

  /* ── 6. Route to active page ── */
  if (typeof NP._callback === 'function') {
    NP._callback(results);
  }
}

function initSharedTracking() {
  if (NP._tracking) return;
  NP._tracking = true;

  var video = document.getElementById('video-p1');
  if (!video) { console.error('[NP] video-p1 not found'); return; }

  var hands = new Hands({
    locateFile: function(f) {
      return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + f;
    }
  });

  hands.setOptions({
    maxNumHands:           2,
    modelComplexity:       1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence:  0.5,
    selfieMode:            true,   // ← KEY FIX: flips x so landmarks match mirrored video
  });

  hands.onResults(_onRawResults);

  var camera = new Camera(video, {
    onFrame: async function() {
      await hands.send({ image: video });
    },
    width:  480,   // lower res → ~40% faster inference vs 640
    height: 360,
  });

  camera.start().catch(function(err) {
    console.error('[NP] Camera error:', err);
    document.querySelectorAll('.tele-msg').forEach(function(m) {
      m.textContent = '⚠️ Camera access denied — check browser permissions';
    });
  });

  NP._handsInstance  = hands;
  NP._cameraInstance = camera;
}

// Kept for backwards compat — ignored, single instance handles everything
function setupHandTracking(videoId, pipCanvasId, onResults) {
  return {};
}
window.setupHandTracking = setupHandTracking;

/* ═══════════════════════════════════════════
   GESTURE DETECTION
═══════════════════════════════════════════ */
function getLandmarks(results, index) {
  if (index === undefined) index = 0;
  if (!results.multiHandLandmarks || !results.multiHandLandmarks[index]) return null;
  return results.multiHandLandmarks[index];
}
window.getLandmarks = getLandmarks;

function isFist(lm) {
  if (!lm) return false;
  return [8,12,16,20].every(function(t){ return lm[t].y > lm[t-2].y; });
}
function isOpenHand(lm) {
  if (!lm) return false;
  return [8,12,16,20].every(function(t){ return lm[t].y < lm[t-2].y; });
}
function isPinch(lm, thr) {
  if (!lm) return false;
  thr = thr === undefined ? 0.07 : thr;
  var dx = lm[4].x - lm[8].x, dy = lm[4].y - lm[8].y;
  return Math.sqrt(dx*dx+dy*dy) < thr;
}
function isPointing(lm) {
  if (!lm) return false;
  return lm[8].y < lm[6].y && lm[12].y > lm[10].y && lm[16].y > lm[14].y && lm[20].y > lm[18].y;
}
function isScissors(lm) {
  if (!lm) return false;
  return lm[8].y < lm[6].y && lm[12].y < lm[10].y && lm[16].y > lm[14].y && lm[20].y > lm[18].y;
}
function isKarateChop(lm) {
  if (!lm) return false;
  var allUp = [8,12,16,20].every(function(t){ return lm[t].y < lm[t-2].y; });
  return allUp && Math.abs(lm[0].y - lm[12].y) < 0.18;
}
function isGojoSign(lm) {
  if (!lm) return false;
  var dx = lm[4].x - lm[12].x, dy = lm[4].y - lm[12].y;
  return Math.sqrt(dx*dx+dy*dy) < 0.08 && lm[8].y < lm[5].y;
}
function isClap(lm0, lm1) {
  if (!lm0 || !lm1) return false;
  var dx = lm0[9].x - lm1[9].x, dy = lm0[9].y - lm1[9].y;
  return Math.sqrt(dx*dx+dy*dy) < 0.14;
}
function getHandSize(lm) {
  if (!lm) return 0;
  var dx = lm[0].x - lm[9].x, dy = lm[0].y - lm[9].y;
  return Math.sqrt(dx*dx+dy*dy);
}
function detectGestureRaw(results) {
  var lm0 = getLandmarks(results, 0);
  var lm1 = getLandmarks(results, 1);
  if (!lm0) return 'none';
  if (isClap(lm0,lm1))    return 'clap';
  if (isFist(lm0))         return 'fist';
  if (isPinch(lm0))        return 'pinch';
  if (isPointing(lm0))     return 'pointing';
  if (isScissors(lm0))     return 'scissors';
  if (isKarateChop(lm0))   return 'karate';
  if (isGojoSign(lm0))     return 'gojo';
  if (isOpenHand(lm0))     return 'open';
  return 'neutral';
}
function detectGesture(results) {
  return results._confirmedGesture || detectGestureRaw(results);
}
window.GestureUtils = {
  getLandmarks, isFist, isOpenHand, isPinch, isPointing,
  isScissors, isKarateChop, isGojoSign, isClap,
  getHandSize, detectGesture, detectGestureRaw,
};

/* ─── RECORDING ─────────────────────────── */
function startRecording(canvasId) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || NP.recording) return;
  var stream;
  try { stream = canvas.captureStream(30); }
  catch(e) { alert('Recording not supported.'); return; }
  var mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  NP.mediaRecorder  = new MediaRecorder(stream, { mimeType: mime });
  NP.recordedChunks = [];
  NP.mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) NP.recordedChunks.push(e.data); };
  NP.mediaRecorder.onstop = function() {
    var blob = new Blob(NP.recordedChunks, { type: 'video/webm' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = 'neuster-' + Date.now() + '.webm'; a.click();
    URL.revokeObjectURL(url);
    NP.recording = false;
    document.getElementById('rec-indicator').classList.add('hidden');
  };
  NP.mediaRecorder.start();
  NP.recording = true;
  document.getElementById('rec-indicator').classList.remove('hidden');
  setTimeout(function() { if (NP.recording && NP.mediaRecorder) NP.mediaRecorder.stop(); }, 10000);
}
window.startRecording = startRecording;
document.getElementById('btn-record-p1').addEventListener('click', function() { startRecording('canvas-p1'); });
document.getElementById('btn-record-p2').addEventListener('click', function() { startRecording('canvas-p2'); });
document.getElementById('btn-record-p3').addEventListener('click', function() { startRecording('canvas-p3'); });

/* ─── TUTORIAL ──────────────────────────── */
var tutorials = {
  1: [
    { icon: '✋', title: 'Open Hand → Rotate',  desc: 'Hold your hand open and move it to rotate the particle shape.' },
    { icon: '✊', title: 'Fist → Scale',         desc: 'Close your fist — hand size controls zoom. Release to lock.' },
    { icon: '👏', title: 'Clap → Explode',       desc: 'Bring both hands together — particles explode and reform!' },
    { icon: '🤏', title: 'Pinch → Morph',        desc: 'Pinch thumb + index to cycle to the next shape.' },
    { icon: '✦',  title: 'Shape Library',        desc: 'Pick any of 18 shapes from the left panel.' },
  ],
  2: [
    { icon: '🤏🤏', title: 'Both Pinch → Rope',  desc: 'Pinch with both hands then extend apart to create a rope.' },
    { icon: '🤏',   title: 'Pinch → Drag',       desc: 'Pinch any object to grab and move it in 3D.' },
    { icon: '🥋',   title: 'Karate → Slice',     desc: 'Swift horizontal open-hand motion slices nearby objects.' },
    { icon: '🫴',   title: 'Gojo → Palette',     desc: 'Thumb + middle finger touching, index up → summons palette.' },
    { icon: '✂',   title: 'Scissors → Delete',   desc: 'Index + middle up, others curled → deletes nearest object.' },
  ],
  3: [
    { icon: '☝️', title: 'Point → Single Trail', desc: 'Extend only index finger to draw a single glowing trail.' },
    { icon: '✋', title: 'Open Hand → 5 Trails', desc: 'All 5 fingers paint 5 neon colours simultaneously.' },
    { icon: '🎨', title: 'Adjust Trails',        desc: 'Trail and Glow sliders tune persistence and brightness.' },
    { icon: '🗑️', title: 'Clear Canvas',        desc: 'Hit Clear to wipe and start fresh.' },
  ],
};
var tutStep = 0, tutPage = 1;
function showTutorial(page) { tutPage = page; tutStep = 0; renderTutStep(); document.getElementById('tutorial-overlay').classList.remove('hidden'); }
function renderTutStep() {
  var s = tutorials[tutPage][tutStep];
  document.getElementById('tutorial-content').innerHTML =
    '<span class="tut-step-icon">' + s.icon + '</span>' +
    '<div class="tut-step-title">' + s.title + '</div>' +
    '<p class="tut-step-desc">' + s.desc + '</p>';
  document.getElementById('tutorial-dots').innerHTML =
    tutorials[tutPage].map(function(_,i){ return '<div class="tut-dot '+(i===tutStep?'active':'')+'" ></div>'; }).join('');
}
document.getElementById('tutorial-close').addEventListener('click', function() { document.getElementById('tutorial-overlay').classList.add('hidden'); });
document.getElementById('tut-next').addEventListener('click', function() { if (tutStep < tutorials[tutPage].length-1) { tutStep++; renderTutStep(); } else document.getElementById('tutorial-overlay').classList.add('hidden'); });
document.getElementById('tut-prev').addEventListener('click', function() { if (tutStep > 0) { tutStep--; renderTutStep(); } });
document.getElementById('help-btn').addEventListener('click', function() { showTutorial(NP.currentPage); });

/* ─── INIT ──────────────────────────────── */
window.addEventListener('load', function() {
  initSharedTracking();
  switchPage(1);
});
