/* ═══════════════════════════════════════════
   NEUSTER PARTICLES — app.js
   Page routing · MediaPipe setup · Tutorial · Recording
═══════════════════════════════════════════ */

'use strict';

/* ─── GLOBAL STATE ──────────────────────── */
window.NP = {
  currentPage: 1,
  handData: { detected: false, landmarks: null, gesture: 'none' },
  recording: false,
  mediaRecorder: null,
  recordedChunks: [],
  // Track which pages have been initialised with hand tracking
  _trackingInit: { 1: false, 2: false, 3: false },
  // Active camera references per page so we can stop them on page leave
  _cameras: {},
};

/* ─── PAGE ROUTING ──────────────────────── */
function switchPage(num) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(`page-${num}`).classList.add('active');
  document.querySelector(`.nav-btn[data-page="${num}"]`).classList.add('active');

  NP.currentPage = num;

  // Notify each page module (resize etc.)
  if (num === 1 && window.P1) P1.onActivate();
  if (num === 2 && window.P2) P2.onActivate();
  if (num === 3 && window.P3) P3.onActivate();

  // Lazy-start hand tracking for this page on first visit
  if (!NP._trackingInit[num]) {
    NP._trackingInit[num] = true;
    if (num === 1 && window.P1) P1.startTracking();
    if (num === 2 && window.P2) P2.startTracking();
    if (num === 3 && window.P3) P3.startTracking();
  }

  // Show tutorial on first visit
  const key = `np_tutorial_p${num}`;
  if (!localStorage.getItem(key)) {
    setTimeout(() => showTutorial(num), 800);
    localStorage.setItem(key, '1');
  }
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchPage(+btn.dataset.page));
});

/* ─── SHARED HAND TRACKING SETUP ─────────── */
// Returns a { camera } object. Call only once per page.
function setupHandTracking(videoId, pipCanvasId, onResults) {
  const video = document.getElementById(videoId);
  const pipCanvas = document.getElementById(pipCanvasId);
  const pipCtx = pipCanvas.getContext('2d');

  const hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
  });

  hands.onResults(results => {
    // Resolve actual PIP canvas pixel size each frame (page may not have been
    // visible when the canvas was first created, so offsetWidth could be 0)
    const pw = pipCanvas.offsetWidth || 180;
    const ph = pipCanvas.offsetHeight || 135;
    const dpr = window.devicePixelRatio || 1;

    if (pipCanvas.width !== pw * dpr || pipCanvas.height !== ph * dpr) {
      pipCanvas.width  = pw * dpr;
      pipCanvas.height = ph * dpr;
    }

    // Draw mirrored camera feed
    pipCtx.save();
    pipCtx.scale(-1, 1);
    pipCtx.translate(-pipCanvas.width, 0);
    pipCtx.drawImage(results.image, 0, 0, pipCanvas.width, pipCanvas.height);
    pipCtx.restore();

    // Draw hand skeleton
    if (results.multiHandLandmarks) {
      for (const lm of results.multiHandLandmarks) {
        drawConnectors(pipCtx, lm, HAND_CONNECTIONS, {
          color: 'rgba(168,85,247,0.6)', lineWidth: 1.5
        });
        drawLandmarks(pipCtx, lm, {
          color: 'rgba(34,211,238,0.9)', lineWidth: 1, radius: 2
        });
      }
    }

    // Update global nav status
    const detected = !!(results.multiHandLandmarks && results.multiHandLandmarks.length > 0);
    const dot   = document.getElementById('nav-hand-dot');
    const label = document.getElementById('nav-hand-label');
    dot.className = 'hand-dot ' + (detected ? 'active' : 'inactive');
    label.textContent = detected
      ? `${results.multiHandLandmarks.length} hand${results.multiHandLandmarks.length > 1 ? 's' : ''}`
      : 'No hand';

    onResults(results);
  });

  const camera = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 640, height: 480,
  });

  camera.start();
  return { hands, camera };
}
window.setupHandTracking = setupHandTracking;

/* ─── GESTURE DETECTION UTILITIES ────────── */
function getLandmarks(results, index = 0) {
  if (!results.multiHandLandmarks || !results.multiHandLandmarks[index]) return null;
  return results.multiHandLandmarks[index];
}
window.getLandmarks = getLandmarks;

function isFist(lm) {
  if (!lm) return false;
  return [8, 12, 16, 20].every(tip => lm[tip].y > lm[tip - 2].y);
}

function isOpenHand(lm) {
  if (!lm) return false;
  return [8, 12, 16, 20].every(tip => lm[tip].y < lm[tip - 2].y);
}

function isPinch(lm, threshold = 0.06) {
  if (!lm) return false;
  const dx = lm[4].x - lm[8].x;
  const dy = lm[4].y - lm[8].y;
  return Math.sqrt(dx * dx + dy * dy) < threshold;
}

function isScissors(lm) {
  if (!lm) return false;
  const indexUp  = lm[8].y  < lm[6].y;
  const middleUp = lm[12].y < lm[10].y;
  const ringDown  = lm[16].y > lm[14].y;
  const pinkyDown = lm[20].y > lm[18].y;
  return indexUp && middleUp && ringDown && pinkyDown;
}

function isKarateChop(lm) {
  if (!lm) return false;
  const allUp     = [8, 12, 16, 20].every(tip => lm[tip].y < lm[tip - 2].y);
  const horizontal = Math.abs(lm[0].y - lm[12].y) < 0.15;
  return allUp && horizontal;
}

function isGojoSign(lm) {
  if (!lm) return false;
  const dx = lm[4].x - lm[12].x;
  const dy = lm[4].y - lm[12].y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const indexUp = lm[8].y < lm[5].y;
  return dist < 0.07 && indexUp;
}

function isClap(lm0, lm1) {
  if (!lm0 || !lm1) return false;
  const dx = lm0[9].x - lm1[9].x;
  const dy = lm0[9].y - lm1[9].y;
  return Math.sqrt(dx * dx + dy * dy) < 0.12;
}

function getHandSize(lm) {
  if (!lm) return 0;
  const dx = lm[0].x - lm[9].x;
  const dy = lm[0].y - lm[9].y;
  return Math.sqrt(dx * dx + dy * dy);
}

function detectGesture(results) {
  const lm0 = getLandmarks(results, 0);
  const lm1 = getLandmarks(results, 1);
  if (!lm0) return 'none';
  if (isClap(lm0, lm1))   return 'clap';
  if (isFist(lm0))         return 'fist';
  if (isPinch(lm0))        return 'pinch';
  if (isScissors(lm0))     return 'scissors';
  if (isKarateChop(lm0))   return 'karate';
  if (isGojoSign(lm0))     return 'gojo';
  if (isOpenHand(lm0))     return 'open';
  return 'neutral';
}

window.GestureUtils = {
  getLandmarks, isFist, isOpenHand, isPinch,
  isScissors, isKarateChop, isGojoSign, isClap,
  getHandSize, detectGesture
};

/* ─── RECORDING ─────────────────────────── */
function startRecording(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || NP.recording) return;

  const stream = canvas.captureStream(30);
  NP.mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
  NP.recordedChunks = [];

  NP.mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) NP.recordedChunks.push(e.data);
  };

  NP.mediaRecorder.onstop = () => {
    const blob = new Blob(NP.recordedChunks, { type: 'video/webm' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `neuster-particles-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
    NP.recording = false;
    document.getElementById('rec-indicator').classList.add('hidden');
  };

  NP.mediaRecorder.start();
  NP.recording = true;
  document.getElementById('rec-indicator').classList.remove('hidden');

  setTimeout(() => {
    if (NP.recording && NP.mediaRecorder) NP.mediaRecorder.stop();
  }, 10000);
}
window.startRecording = startRecording;

// Wire record buttons
document.getElementById('btn-record-p1').addEventListener('click', () => startRecording('canvas-p1'));
document.getElementById('btn-record-p2').addEventListener('click', () => startRecording('canvas-p2'));
document.getElementById('btn-record-p3').addEventListener('click', () => startRecording('canvas-p3'));

/* ─── TUTORIAL SYSTEM ───────────────────── */
const tutorials = {
  1: [
    { icon: '✋', title: 'Open Hand → Rotate',   desc: 'Hold your hand open and move it left/right/up/down to rotate the particle shape in 3D space.' },
    { icon: '✊', title: 'Fist → Scale',          desc: 'Close your hand into a fist. Move closer to the camera to zoom in, further away to zoom out.' },
    { icon: '👏', title: 'Clap → Explode',        desc: 'Bring both hands together in a clap. Watch the particles explode outward and reform!' },
    { icon: '🤏', title: 'Pinch + Pull → Morph',  desc: 'Pinch your fingers and pull apart to trigger a morph to the next shape in the library.' },
    { icon: '✦',  title: 'Shape Library',         desc: 'Use the left panel to pick any shape. Try Saturn, Gyroscope, or DNA Helix for something spectacular.' },
  ],
  2: [
    { icon: '🤏🤏', title: 'Both Hands Pinch → Create', desc: 'Pinch with both hands and extend them apart to create a glowing 3D rope structure between them.' },
    { icon: '🤏',   title: 'Pinch Object → Drag',       desc: 'Pinch any created structure to grab it and drag it around the 3D space.' },
    { icon: '↔',   title: 'Hand Depth → Resize',       desc: 'Move your hand closer to or further from the camera while holding a structure to resize it.' },
    { icon: '🥋',   title: 'Karate Chop → Slice',       desc: 'Make a swift horizontal karate chop motion to slice any structure in half.' },
    { icon: '🫴',   title: 'Gojo Domain → Palette',     desc: 'Form the Gojo Satoru domain sign (thumb touching middle finger, index extended) to summon the object palette.' },
  ],
  3: [
    { icon: '☝️', title: 'Move Fingertips → Paint', desc: 'Raise your hand and move your fingertips across the screen. Each finger leaves a glowing coloured trail.' },
    { icon: '✋', title: '5 Fingers = 5 Colours',   desc: 'Each fingertip has its own unique neon colour. Use all five fingers to paint with five colours at once.' },
    { icon: '🎨', title: 'Controls',                desc: 'Use the Trail and Glow sliders at the top to adjust how long and how bright your trails are.' },
    { icon: '🗑️', title: 'Clear Canvas',            desc: 'Hit the Clear button to wipe the canvas and start a new piece of particle art.' },
  ],
};

let tutStep = 0;
let tutPage = 1;

function showTutorial(page) {
  tutPage = page;
  tutStep = 0;
  renderTutStep();
  document.getElementById('tutorial-overlay').classList.remove('hidden');
}

function renderTutStep() {
  const steps = tutorials[tutPage];
  const step  = steps[tutStep];
  document.getElementById('tutorial-content').innerHTML = `
    <span class="tut-step-icon">${step.icon}</span>
    <div class="tut-step-title">${step.title}</div>
    <p class="tut-step-desc">${step.desc}</p>
  `;
  const dotsEl = document.getElementById('tutorial-dots');
  dotsEl.innerHTML = steps.map((_, i) =>
    `<div class="tut-dot ${i === tutStep ? 'active' : ''}"></div>`
  ).join('');
}

document.getElementById('tutorial-close').addEventListener('click', () => {
  document.getElementById('tutorial-overlay').classList.add('hidden');
});

document.getElementById('tut-next').addEventListener('click', () => {
  const steps = tutorials[tutPage];
  if (tutStep < steps.length - 1) { tutStep++; renderTutStep(); }
  else document.getElementById('tutorial-overlay').classList.add('hidden');
});

document.getElementById('tut-prev').addEventListener('click', () => {
  if (tutStep > 0) { tutStep--; renderTutStep(); }
});

document.getElementById('help-btn').addEventListener('click', () => {
  showTutorial(NP.currentPage);
});

/* ─── INIT ──────────────────────────────── */
// Activate page 1 after all page scripts have loaded and DOM is ready.
// We defer with setTimeout(0) so that DOMContentLoaded handlers in
// page1/2/3.js (which call init()) have already executed.
window.addEventListener('load', () => {
  setTimeout(() => switchPage(1), 0);
});
