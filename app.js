/* ═══════════════════════════════════════════
   NEUSTER PARTICLES — app.js
   Page routing · MediaPipe setup · Tutorial · Recording
   FIX: Single shared camera stream, lazy tracking init
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
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + num).classList.add('active');
  document.querySelector('.nav-btn[data-page="' + num + '"]').classList.add('active');
  NP.currentPage = num;

  if (num === 1 && window.P1) P1.onActivate();
  if (num === 2 && window.P2) P2.onActivate();
  if (num === 3 && window.P3) P3.onActivate();

  // Lazy-init tracking per page (only once each)
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

/* ─── SHARED HAND TRACKING SETUP ─────────── */
/*
  KEY FIX: Each page gets its own completely independent
  Hands + Camera instance so they never conflict.
  The video element is hidden (opacity:0 in CSS) — MediaPipe
  Camera handles getUserMedia internally. We just need the
  video element to exist in the DOM.
*/
function setupHandTracking(videoId, pipCanvasId, onResults) {
  var video     = document.getElementById(videoId);
  var pipCanvas = document.getElementById(pipCanvasId);
  var pipCtx    = pipCanvas.getContext('2d');

  if (!video) { console.error('No video element: ' + videoId); return; }

  var hands = new Hands({
    locateFile: function(f) {
      return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + f;
    }
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,          // 0 = fast, plenty for gestures
    minDetectionConfidence: 0.55,
    minTrackingConfidence: 0.45,
    selfieMode: true,            // FIX: mirrors input so coords match mirrored PIP
  });

  // EMA smoothing buffers
  var SMOOTH  = 0.45;
  var smoothed = [null, null];

  hands.onResults(function(results) {
    // ── PIP canvas sizing
    var dpr = window.devicePixelRatio || 1;
    var pw  = pipCanvas.offsetWidth  || 180;
    var ph  = pipCanvas.offsetHeight || 135;
    if (pipCanvas.width !== Math.round(pw * dpr)) {
      pipCanvas.width  = Math.round(pw * dpr);
      pipCanvas.height = Math.round(ph * dpr);
    }

    // ── Draw video feed (already mirrored by selfieMode)
    pipCtx.drawImage(results.image, 0, 0, pipCanvas.width, pipCanvas.height);

    // ── EMA smooth landmarks
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      results.multiHandLandmarks.forEach(function(lm, hi) {
        if (!smoothed[hi]) {
          smoothed[hi] = lm.map(function(p) { return { x: p.x, y: p.y, z: p.z }; });
        } else {
          smoothed[hi].forEach(function(s, j) {
            s.x = s.x * SMOOTH + lm[j].x * (1 - SMOOTH);
            s.y = s.y * SMOOTH + lm[j].y * (1 - SMOOTH);
            s.z = s.z * SMOOTH + lm[j].z * (1 - SMOOTH);
          });
          lm.forEach(function(p, j) {
            p.x = smoothed[hi][j].x;
            p.y = smoothed[hi][j].y;
            p.z = smoothed[hi][j].z;
          });
        }
      });
    } else {
      smoothed = [null, null];
    }

    // ── Draw skeleton on PIP
    if (results.multiHandLandmarks) {
      for (var i = 0; i < results.multiHandLandmarks.length; i++) {
        var lm = results.multiHandLandmarks[i];
        drawConnectors(pipCtx, lm, HAND_CONNECTIONS,
          { color: 'rgba(168,85,247,0.7)', lineWidth: 1.5 });
        drawLandmarks(pipCtx, lm,
          { color: 'rgba(34,211,238,0.95)', lineWidth: 1, radius: 2 });
      }
    }

    // ── Global nav status dot
    var detected = !!(results.multiHandLandmarks && results.multiHandLandmarks.length > 0);
    var dot   = document.getElementById('nav-hand-dot');
    var label = document.getElementById('nav-hand-label');
    if (dot && label) {
      dot.className = 'hand-dot ' + (detected ? 'active' : 'inactive');
      label.textContent = detected
        ? results.multiHandLandmarks.length + ' hand' + (results.multiHandLandmarks.length > 1 ? 's' : '')
        : 'No hand';
    }

    onResults(results);
  });

  // FIX: Use Camera util — it handles getUserMedia + feeds frames to MediaPipe
  var camera = new Camera(video, {
    onFrame: async function() {
      await hands.send({ image: video });
    },
    width: 640,
    height: 480,
  });

  camera.start().catch(function(err) {
    console.error('Camera start failed for ' + videoId + ':', err);
    // Show user-facing error in telemetry if present
    var msgs = document.querySelectorAll('.tele-msg');
    msgs.forEach(function(m) {
      m.textContent = '⚠️ Camera access denied — please allow camera in browser settings';
    });
  });

  return { hands: hands, camera: camera };
}
window.setupHandTracking = setupHandTracking;

/* ─── GESTURE DETECTION UTILITIES ────────── */
function getLandmarks(results, index) {
  if (index === undefined) index = 0;
  if (!results.multiHandLandmarks || !results.multiHandLandmarks[index]) return null;
  return results.multiHandLandmarks[index];
}
window.getLandmarks = getLandmarks;

function isFist(lm) {
  if (!lm) return false;
  // All 4 finger tips below their PIP joints (y increases downward in image)
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
  return lm[8].y  < lm[6].y  &&   // index up
         lm[12].y > lm[10].y &&   // middle down
         lm[16].y > lm[14].y &&   // ring down
         lm[20].y > lm[18].y;     // pinky down
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

function detectGesture(results) {
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

window.GestureUtils = {
  getLandmarks: getLandmarks,
  isFist: isFist,
  isOpenHand: isOpenHand,
  isPinch: isPinch,
  isPointing: isPointing,
  isScissors: isScissors,
  isKarateChop: isKarateChop,
  isGojoSign: isGojoSign,
  isClap: isClap,
  getHandSize: getHandSize,
  detectGesture: detectGesture,
};

/* ─── RECORDING ─────────────────────────── */
function startRecording(canvasId) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || NP.recording) return;
  var stream;
  try {
    stream = canvas.captureStream(30);
  } catch(e) {
    alert('Recording not supported in this browser.');
    return;
  }
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
    { icon: '✋', title: 'Open Hand → Rotate',  desc: 'Hold your hand open and move it left/right/up/down to rotate the particle shape in 3D space.' },
    { icon: '✊', title: 'Fist → Scale',         desc: 'Close your fist. Hand size (distance from camera) = zoom level. Release to lock the scale.' },
    { icon: '👏', title: 'Clap → Explode',       desc: 'Bring both hands together quickly. Particles explode outward then reform!' },
    { icon: '🤏', title: 'Pinch → Morph',        desc: 'Pinch thumb + index to cycle to the next shape in the library.' },
    { icon: '✦',  title: 'Shape Library',        desc: 'Use the left panel to pick any of the 18 shapes. Morph is always on by default.' },
  ],
  2: [
    { icon: '🤏🤏', title: 'Both Hands Pinch → Rope', desc: 'Pinch with both hands, then extend apart to create a glowing rope structure.' },
    { icon: '🤏',   title: 'Pinch Object → Drag',     desc: 'Pinch any created object to grab it and move it in 3D space.' },
    { icon: '🥋',   title: 'Karate Chop → Slice',     desc: 'Make a swift horizontal open-hand motion to slice objects near your hand.' },
    { icon: '🫴',   title: 'Gojo Sign → Palette',     desc: 'Touch thumb to middle finger with index up — summons the object palette.' },
    { icon: '✂',   title: 'Scissors → Delete',        desc: 'Index + middle up, others curled — deletes the nearest object.' },
  ],
  3: [
    { icon: '☝️', title: 'Point → Single Trail', desc: 'Extend only your index finger to draw a single cyan trail.' },
    { icon: '✋', title: 'Open Hand → 5 Trails', desc: 'Show all 5 fingers to paint with 5 different neon colours simultaneously.' },
    { icon: '🎨', title: 'Adjust Trails',        desc: 'Use the Trail and Glow sliders at the top to tune persistence and brightness.' },
    { icon: '🗑️', title: 'Clear Canvas',        desc: 'Hit Clear to wipe everything and start fresh.' },
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
// Wait for all page scripts to be ready before switching
window.addEventListener('load', function() {
  switchPage(1);
});
