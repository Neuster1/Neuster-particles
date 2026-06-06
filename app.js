/* ═══════════════════════════════════════════
   NEUSTER PARTICLES — app.js
   UPGRADES:
   #1  MediaPipe Holistic (body-anchored hand tracking)
   #3  5-frame gesture confirmation buffer
   #4  Kalman filter per landmark (replaces EMA)
   #5  8-frame hand re-entry grace period
═══════════════════════════════════════════ */

'use strict';

/* ─── GLOBAL STATE ──────────────────────── */
window.NP = {
  currentPage: 1,
  handData: { detected: false, landmarks: null, gesture: 'none' },
  recording: false,
  mediaRecorder: null,
  recordedChunks: [],
  _trackingInit: {},
};

/* ─── PAGE ROUTING ──────────────────────── */
function switchPage(num) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById('page-' + num).classList.add('active');
  document.querySelector('.nav-btn[data-page="' + num + '"]').classList.add('active');
  NP.currentPage = num;

  if (num === 1 && window.P1) P1.onActivate();
  if (num === 2 && window.P2) P2.onActivate();
  if (num === 3 && window.P3) P3.onActivate();

  if (!NP._trackingInit[num]) {
    NP._trackingInit[num] = true;
    setTimeout(function() {
      if (num === 1 && window.P1) P1.startTracking();
      if (num === 2 && window.P2) P2.startTracking();
      if (num === 3 && window.P3) P3.startTracking();
    }, 300);
  }

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
   UPGRADE #4 — KALMAN FILTER
   Per-landmark 1D Kalman on x, y, z independently.
   Predicts next position → near-zero lag, silky smooth.
═══════════════════════════════════════════ */
function KalmanFilter(R, Q) {
  // R = measurement noise (trust camera less = higher R)
  // Q = process noise  (hand moves fast = higher Q)
  this.R = R !== undefined ? R : 0.01;  // measurement noise
  this.Q = Q !== undefined ? Q : 0.001; // process noise
  this.x = null;   // estimated value
  this.P = 1;      // error covariance
  this.K = 0;      // Kalman gain
}
KalmanFilter.prototype.update = function(measurement) {
  if (this.x === null) { this.x = measurement; return measurement; }
  // Predict
  this.P = this.P + this.Q;
  // Update
  this.K = this.P / (this.P + this.R);
  this.x = this.x + this.K * (measurement - this.x);
  this.P = (1 - this.K) * this.P;
  return this.x;
};

// Build a Kalman filter bank: 21 landmarks × 3 axes × 2 hands
function buildKalmanBank() {
  var bank = [];
  for (var h = 0; h < 2; h++) {
    bank[h] = [];
    for (var lm = 0; lm < 21; lm++) {
      bank[h][lm] = {
        x: new KalmanFilter(0.008, 0.0008),
        y: new KalmanFilter(0.008, 0.0008),
        z: new KalmanFilter(0.012, 0.001),   // z is noisier
      };
    }
  }
  return bank;
}

/* ═══════════════════════════════════════════
   UPGRADE #3 — GESTURE CONFIRMATION BUFFER
   Gesture must be stable for N frames before firing.
═══════════════════════════════════════════ */
var CONFIRM_FRAMES = 5;  // frames gesture must be held

function GestureBuffer() {
  this.buffer  = [];          // rolling window of raw gestures
  this.confirmed = 'none';    // last confirmed gesture
  this.prev    = 'none';
}
GestureBuffer.prototype.push = function(raw) {
  this.buffer.push(raw);
  if (this.buffer.length > CONFIRM_FRAMES) this.buffer.shift();

  // Confirm only if all N frames agree
  if (this.buffer.length === CONFIRM_FRAMES &&
      this.buffer.every(function(g) { return g === raw; })) {
    this.prev      = this.confirmed;
    this.confirmed = raw;
  }
  return this.confirmed;
};
GestureBuffer.prototype.reset = function() {
  this.buffer    = [];
  this.confirmed = 'none';
  this.prev      = 'none';
};

/* ═══════════════════════════════════════════
   UPGRADE #5 — GRACE PERIOD
   After hand leaves frame, hold last state for
   GRACE_FRAMES before declaring "no hand".
═══════════════════════════════════════════ */
var GRACE_FRAMES = 8;

function GracePeriod(landmarks) {
  this.framesGone    = 0;
  this.lastLandmarks = landmarks || null;  // frozen landmark copy
}
GracePeriod.prototype.update = function(detected, landmarks) {
  if (detected) {
    this.framesGone    = 0;
    this.lastLandmarks = landmarks;
    return { active: true, landmarks: landmarks, grace: false };
  }
  this.framesGone++;
  if (this.framesGone <= GRACE_FRAMES && this.lastLandmarks) {
    // Still within grace — return frozen landmarks
    return { active: true, landmarks: this.lastLandmarks, grace: true };
  }
  return { active: false, landmarks: null, grace: false };
};

/* ═══════════════════════════════════════════
   UPGRADE #1 — HOLISTIC HAND TRACKING SETUP
   Uses MediaPipe Holistic instead of bare Hands.
   Body pose anchors the hand detection → far more
   stable, works at frame edges, less jitter.
   Falls back to Hands-only if Holistic fails to load.
═══════════════════════════════════════════ */
function setupHandTracking(videoId, pipCanvasId, onResults) {
  var video     = document.getElementById(videoId);
  var pipCanvas = document.getElementById(pipCanvasId);
  var pipCtx    = pipCanvas.getContext('2d');

  if (!video) { console.error('No video element: ' + videoId); return; }

  // Per-instance state for upgrades
  var kalman      = buildKalmanBank();
  var gestureBuf  = new GestureBuffer();
  var grace0      = new GracePeriod();   // hand 0
  var grace1      = new GracePeriod();   // hand 1

  /* ── Try Holistic first, fall back to Hands ── */
  var useHolistic = (typeof Holistic !== 'undefined');
  var tracker;

  function buildResultsHandler() {
    return function(results) {
      /* ─── Holistic gives leftHandLandmarks / rightHandLandmarks
             Hands  gives multiHandLandmarks
         Normalise both into the same multiHandLandmarks array    */
      if (useHolistic) {
        var hands = [];
        if (results.leftHandLandmarks)  hands.push(results.leftHandLandmarks);
        if (results.rightHandLandmarks) hands.push(results.rightHandLandmarks);
        results.multiHandLandmarks = hands.length > 0 ? hands : null;
      }

      /* ─── Kalman filter pass ─────────────────── */
      if (results.multiHandLandmarks) {
        results.multiHandLandmarks.forEach(function(lm, hi) {
          if (hi >= 2) return;
          lm.forEach(function(p, j) {
            p.x = kalman[hi][j].x.update(p.x);
            p.y = kalman[hi][j].y.update(p.y);
            p.z = kalman[hi][j].z.update(p.z);
          });
        });
      } else {
        // Reset Kalman when hand disappears so no stale state bleeds in
        kalman = buildKalmanBank();
      }

      /* ─── Grace period ───────────────────────── */
      var lm0raw = results.multiHandLandmarks && results.multiHandLandmarks[0];
      var lm1raw = results.multiHandLandmarks && results.multiHandLandmarks[1];
      var g0 = grace0.update(!!lm0raw, lm0raw || null);
      var g1 = grace1.update(!!lm1raw, lm1raw || null);

      // Rebuild multiHandLandmarks from grace state
      var gracedHands = [];
      if (g0.active && g0.landmarks) gracedHands.push(g0.landmarks);
      if (g1.active && g1.landmarks) gracedHands.push(g1.landmarks);
      results.multiHandLandmarks = gracedHands.length > 0 ? gracedHands : null;

      /* ─── Gesture confirmation buffer ─────────── */
      var rawGesture  = detectGestureRaw(results);
      var confirmed   = gestureBuf.push(rawGesture);
      // Attach confirmed gesture so page handlers can read it
      results._confirmedGesture = confirmed;
      results._prevGesture      = gestureBuf.prev;
      results._inGrace          = (g0.grace || g1.grace);

      /* ─── PIP draw ───────────────────────────── */
      var dpr = window.devicePixelRatio || 1;
      var pw  = pipCanvas.offsetWidth  || 180;
      var ph  = pipCanvas.offsetHeight || 135;
      if (pipCanvas.width !== Math.round(pw * dpr)) {
        pipCanvas.width  = Math.round(pw * dpr);
        pipCanvas.height = Math.round(ph * dpr);
      }
      // Draw video
      pipCtx.drawImage(results.image, 0, 0, pipCanvas.width, pipCanvas.height);

      // Draw skeleton
      if (results.multiHandLandmarks) {
        results.multiHandLandmarks.forEach(function(lm) {
          // Dim skeleton during grace period so user knows
          var alpha = results._inGrace ? 0.35 : 0.75;
          drawConnectors(pipCtx, lm, HAND_CONNECTIONS,
            { color: 'rgba(168,85,247,' + alpha + ')', lineWidth: 1.5 });
          drawLandmarks(pipCtx, lm,
            { color: 'rgba(34,211,238,' + (results._inGrace ? 0.5 : 0.95) + ')',
              lineWidth: 1, radius: 2 });
        });
      }

      // If Holistic: also draw pose skeleton (faint)
      if (useHolistic && results.poseLandmarks) {
        drawConnectors(pipCtx, results.poseLandmarks, POSE_CONNECTIONS,
          { color: 'rgba(255,255,255,0.08)', lineWidth: 1 });
      }

      /* ─── Nav status dot ─────────────────────── */
      var detected = !!(results.multiHandLandmarks && results.multiHandLandmarks.length > 0);
      var dot   = document.getElementById('nav-hand-dot');
      var label = document.getElementById('nav-hand-label');
      if (dot && label) {
        // Grace period → amber dot
        if (detected && results._inGrace) {
          dot.className = 'hand-dot grace';
          label.textContent = 'Grace...';
        } else {
          dot.className = 'hand-dot ' + (detected ? 'active' : 'inactive');
          label.textContent = detected
            ? results.multiHandLandmarks.length + ' hand' +
              (results.multiHandLandmarks.length > 1 ? 's' : '')
            : 'No hand';
        }
      }

      onResults(results);
    };
  }

  var resultsHandler = buildResultsHandler();

  if (useHolistic) {
    /* ── HOLISTIC path ── */
    tracker = new Holistic({
      locateFile: function(f) {
        return 'https://cdn.jsdelivr.net/npm/@mediapipe/holistic/' + f;
      }
    });
    tracker.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      refineFaceLandmarks: false,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.45,
    });
    tracker.onResults(resultsHandler);
  } else {
    /* ── HANDS fallback path ── */
    console.warn('Holistic not available — falling back to MediaPipe Hands');
    tracker = new Hands({
      locateFile: function(f) {
        return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + f;
      }
    });
    tracker.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.45,
      selfieMode: true,
    });
    tracker.onResults(resultsHandler);
  }

  var camera = new Camera(video, {
    onFrame: async function() {
      await tracker.send({ image: video });
    },
    width: 640,
    height: 480,
  });

  camera.start().catch(function(err) {
    console.error('Camera failed for ' + videoId + ':', err);
    document.querySelectorAll('.tele-msg').forEach(function(m) {
      m.textContent = '⚠️ Camera access denied — allow camera in browser settings';
    });
  });

  return { tracker: tracker, camera: camera };
}
window.setupHandTracking = setupHandTracking;

/* ═══════════════════════════════════════════
   GESTURE DETECTION
   detectGestureRaw — runs every frame (pre-buffer)
   Page handlers read results._confirmedGesture
═══════════════════════════════════════════ */
function getLandmarks(results, index) {
  if (index === undefined) index = 0;
  if (!results.multiHandLandmarks || !results.multiHandLandmarks[index]) return null;
  return results.multiHandLandmarks[index];
}
window.getLandmarks = getLandmarks;

function isFist(lm) {
  if (!lm) return false;
  return [8, 12, 16, 20].every(function(tip) { return lm[tip].y > lm[tip - 2].y; });
}

function isOpenHand(lm) {
  if (!lm) return false;
  return [8, 12, 16, 20].every(function(tip) { return lm[tip].y < lm[tip - 2].y; });
}

function isPinch(lm, threshold) {
  if (!lm) return false;
  if (threshold === undefined) threshold = 0.07;
  var dx = lm[4].x - lm[8].x, dy = lm[4].y - lm[8].y;
  return Math.sqrt(dx * dx + dy * dy) < threshold;
}

function isPointing(lm) {
  if (!lm) return false;
  return lm[8].y  < lm[6].y  &&
         lm[12].y > lm[10].y &&
         lm[16].y > lm[14].y &&
         lm[20].y > lm[18].y;
}

function isScissors(lm) {
  if (!lm) return false;
  return lm[8].y < lm[6].y && lm[12].y < lm[10].y &&
         lm[16].y > lm[14].y && lm[20].y > lm[18].y;
}

function isKarateChop(lm) {
  if (!lm) return false;
  var allUp      = [8, 12, 16, 20].every(function(tip) { return lm[tip].y < lm[tip - 2].y; });
  var horizontal = Math.abs(lm[0].y - lm[12].y) < 0.18;
  return allUp && horizontal;
}

function isGojoSign(lm) {
  if (!lm) return false;
  var dx = lm[4].x - lm[12].x, dy = lm[4].y - lm[12].y;
  return Math.sqrt(dx * dx + dy * dy) < 0.08 && lm[8].y < lm[5].y;
}

function isClap(lm0, lm1) {
  if (!lm0 || !lm1) return false;
  var dx = lm0[9].x - lm1[9].x, dy = lm0[9].y - lm1[9].y;
  return Math.sqrt(dx * dx + dy * dy) < 0.14;
}

function getHandSize(lm) {
  if (!lm) return 0;
  var dx = lm[0].x - lm[9].x, dy = lm[0].y - lm[9].y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Raw detection — called every frame, result fed into GestureBuffer
function detectGestureRaw(results) {
  var lm0 = getLandmarks(results, 0);
  var lm1 = getLandmarks(results, 1);
  if (!lm0) return 'none';
  if (isClap(lm0, lm1))   return 'clap';
  if (isFist(lm0))         return 'fist';
  if (isPinch(lm0))        return 'pinch';
  if (isPointing(lm0))     return 'pointing';
  if (isScissors(lm0))     return 'scissors';
  if (isKarateChop(lm0))   return 'karate';
  if (isGojoSign(lm0))     return 'gojo';
  if (isOpenHand(lm0))     return 'open';
  return 'neutral';
}

// Public detectGesture reads the confirmed result directly from results object
function detectGesture(results) {
  return results._confirmedGesture || detectGestureRaw(results);
}

window.GestureUtils = {
  getLandmarks:    getLandmarks,
  isFist:          isFist,
  isOpenHand:      isOpenHand,
  isPinch:         isPinch,
  isPointing:      isPointing,
  isScissors:      isScissors,
  isKarateChop:    isKarateChop,
  isGojoSign:      isGojoSign,
  isClap:          isClap,
  getHandSize:     getHandSize,
  detectGesture:   detectGesture,
  detectGestureRaw: detectGestureRaw,
};

/* ─── RECORDING ─────────────────────────── */
function startRecording(canvasId) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || NP.recording) return;
  var stream;
  try { stream = canvas.captureStream(30); }
  catch(e) { alert('Recording not supported in this browser.'); return; }
  var mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
    ? 'video/webm; codecs=vp9' : 'video/webm';
  NP.mediaRecorder  = new MediaRecorder(stream, { mimeType: mimeType });
  NP.recordedChunks = [];
  NP.mediaRecorder.ondataavailable = function(e) {
    if (e.data.size > 0) NP.recordedChunks.push(e.data);
  };
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
  setTimeout(function() {
    if (NP.recording && NP.mediaRecorder) NP.mediaRecorder.stop();
  }, 10000);
}
window.startRecording = startRecording;

document.getElementById('btn-record-p1').addEventListener('click', function() { startRecording('canvas-p1'); });
document.getElementById('btn-record-p2').addEventListener('click', function() { startRecording('canvas-p2'); });
document.getElementById('btn-record-p3').addEventListener('click', function() { startRecording('canvas-p3'); });

/* ─── TUTORIAL SYSTEM ───────────────────── */
var tutorials = {
  1: [
    { icon: '✋', title: 'Open Hand → Rotate',  desc: 'Hold your hand open and move it to rotate the particle shape.' },
    { icon: '✊', title: 'Fist → Scale',         desc: 'Close your fist. Hand size = zoom. Release to lock the scale.' },
    { icon: '👏', title: 'Clap → Explode',       desc: 'Bring both hands together — particles explode and reform!' },
    { icon: '🤏', title: 'Pinch → Morph',        desc: 'Pinch thumb + index to cycle to the next shape.' },
    { icon: '✦',  title: 'Shape Library',        desc: 'Pick any of 18 shapes from the left panel.' },
  ],
  2: [
    { icon: '🤏🤏', title: 'Both Pinch → Rope',  desc: 'Pinch with both hands then extend apart to create a rope.' },
    { icon: '🤏',   title: 'Pinch → Drag',       desc: 'Pinch any object to grab and move it.' },
    { icon: '🥋',   title: 'Karate → Slice',     desc: 'Swift horizontal open-hand motion slices nearby objects.' },
    { icon: '🫴',   title: 'Gojo → Palette',     desc: 'Thumb + middle finger touching, index up — summons palette.' },
    { icon: '✂',   title: 'Scissors → Delete',   desc: 'Index + middle up, others curled — deletes nearest object.' },
  ],
  3: [
    { icon: '☝️', title: 'Point → Single Trail', desc: 'Extend only index finger to draw one cyan trail.' },
    { icon: '✋', title: 'Open Hand → 5 Trails', desc: 'All 5 fingers paint 5 neon colours simultaneously.' },
    { icon: '🎨', title: 'Adjust Trails',        desc: 'Trail and Glow sliders tune persistence and brightness.' },
    { icon: '🗑️', title: 'Clear Canvas',        desc: 'Hit Clear to wipe and start fresh.' },
  ],
};

var tutStep = 0, tutPage = 1;

function showTutorial(page) {
  tutPage = page; tutStep = 0;
  renderTutStep();
  document.getElementById('tutorial-overlay').classList.remove('hidden');
}
function renderTutStep() {
  var steps = tutorials[tutPage], step = steps[tutStep];
  document.getElementById('tutorial-content').innerHTML =
    '<span class="tut-step-icon">' + step.icon + '</span>' +
    '<div class="tut-step-title">' + step.title + '</div>' +
    '<p class="tut-step-desc">' + step.desc + '</p>';
  document.getElementById('tutorial-dots').innerHTML =
    steps.map(function(_, i) {
      return '<div class="tut-dot ' + (i === tutStep ? 'active' : '') + '"></div>';
    }).join('');
}
document.getElementById('tutorial-close').addEventListener('click', function() {
  document.getElementById('tutorial-overlay').classList.add('hidden');
});
document.getElementById('tut-next').addEventListener('click', function() {
  if (tutStep < tutorials[tutPage].length - 1) { tutStep++; renderTutStep(); }
  else document.getElementById('tutorial-overlay').classList.add('hidden');
});
document.getElementById('tut-prev').addEventListener('click', function() {
  if (tutStep > 0) { tutStep--; renderTutStep(); }
});
document.getElementById('help-btn').addEventListener('click', function() {
  showTutorial(NP.currentPage);
});

/* ─── INIT ──────────────────────────────── */
window.addEventListener('load', function() { switchPage(1); });
