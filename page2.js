/* ═══════════════════════════════════════════
   NEUSTER PARTICLES — page2.js
   Hand Gesture 3D Builder
   
   FIXES / UPGRADES:
   1. VR-style 3D hand skeleton rendered in the Three.js
      scene using the same landmark data — moves 1:1 with
      your real hand like VR hand tracking
   2. Mirror/x-axis fix (selfieMode=true in app.js means
      lm.x is already correct — no extra flip needed here)
   3. Single pipeline via NP._callback (no own Camera)
   4. Expose onHandResults on the public API
═══════════════════════════════════════════ */

'use strict';

window.P2 = (() => {

  const state = {
    scene: null, camera: null, renderer: null,
    objects: [],
    selectedObj: null,
    lastPinchPos: null,
    buildStart: null,
    ropeCreated: false,
    mirrorMode: false,
    paintMode: false,
    paletteVisible: false,
    chopCooldown: 0,
    gojoCooldown: 0,
    scissorsCooldown: 0,
    selectedColor: '#22d3ee',
    prevTwoHandDist: null,
    // 3D hand meshes
    handMeshes: [null, null],   // one skeleton group per hand
    handVisible: [false, false],
  };

  const PALETTE_ITEMS = [
    { icon: '●', label: 'Sphere',   fn: () => new THREE.SphereGeometry(0.4, 16, 16) },
    { icon: '■', label: 'Box',      fn: () => new THREE.BoxGeometry(0.8, 0.8, 0.8) },
    { icon: '▲', label: 'Cone',     fn: () => new THREE.ConeGeometry(0.4, 0.8, 16) },
    { icon: '⬭', label: 'Cylinder', fn: () => new THREE.CylinderGeometry(0.3, 0.3, 1, 16) },
    { icon: '⬭', label: 'Torus',    fn: () => new THREE.TorusGeometry(0.5, 0.15, 12, 48) },
    { icon: '▬', label: 'Plane',    fn: () => new THREE.PlaneGeometry(1.5, 1.5) },
  ];

  /* ── MediaPipe hand bone connections (21 landmarks)
     Finger order: thumb(1-4), index(5-8), middle(9-12), ring(13-16), pinky(17-20)
     Each segment: [parent, child] */
  const HAND_BONES = [
    [0,1],[1,2],[2,3],[3,4],       // thumb
    [0,5],[5,6],[6,7],[7,8],       // index
    [0,9],[9,10],[10,11],[11,12],  // middle
    [0,13],[13,14],[14,15],[15,16],// ring
    [0,17],[17,18],[18,19],[19,20],// pinky
    [5,9],[9,13],[13,17],          // palm cross
  ];

  // Fingertip indices (for joint spheres highlight)
  const FINGERTIPS = [4, 8, 12, 16, 20];

  /* ─── THREE.JS INIT ─────────────────── */
  function initThree() {
    const canvas = document.getElementById('canvas-p2');
    const w = canvas.offsetWidth  || window.innerWidth;
    const h = canvas.offsetHeight || (window.innerHeight - 56);

    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x050510);

    state.scene.add(new THREE.AmbientLight(0x334466, 0.8));
    const dir1 = new THREE.DirectionalLight(0xa855f7, 1.2); dir1.position.set(5, 8, 5); state.scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x22d3ee, 0.8); dir2.position.set(-5,-3,-5); state.scene.add(dir2);
    const grid = new THREE.GridHelper(12, 24, 0x222244, 0x111122); state.scene.add(grid);

    state.camera = new THREE.PerspectiveCamera(60, w/h, 0.1, 100);
    state.camera.position.set(0, 3, 8);
    state.camera.lookAt(0, 0, 0);

    state.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    state.renderer.setSize(w, h);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    window.addEventListener('resize', () => {
      const w2 = canvas.offsetWidth, h2 = canvas.offsetHeight;
      if (!w2 || !h2) return;
      state.camera.aspect = w2/h2;
      state.camera.updateProjectionMatrix();
      state.renderer.setSize(w2, h2);
    });

    // Create hand skeleton groups (2 hands)
    for (let h = 0; h < 2; h++) {
      state.handMeshes[h] = buildHandSkeleton(h);
      state.scene.add(state.handMeshes[h]);
    }

    buildPalette();
    animate();
  }

  /* ─── BUILD HAND SKELETON (VR-STYLE) ───
     Each hand skeleton is a THREE.Group containing:
     - 21 sphere joints (landmark positions)
     - 22 bone cylinders (connections between landmarks)
     Updated every frame in updateHandSkeleton()
  ──────────────────────────────────────── */
  function buildHandSkeleton(handIdx) {
    const group = new THREE.Group();
    group.visible = false;

    const colors   = [0xa855f7, 0x22d3ee];   // purple / cyan per hand
    const color    = colors[handIdx % 2];
    const boneCol  = new THREE.Color(color);
    const tipCol   = new THREE.Color(0xffffff);

    // 21 joint spheres
    const joints = [];
    for (let j = 0; j < 21; j++) {
      const isTip = FINGERTIPS.includes(j);
      const r     = isTip ? 0.055 : 0.035;
      const mat   = new THREE.MeshPhongMaterial({
        color:    isTip ? tipCol : boneCol,
        emissive: isTip ? new THREE.Color(color).multiplyScalar(0.5) : new THREE.Color(color).multiplyScalar(0.2),
        transparent: true,
        opacity:  isTip ? 0.95 : 0.85,
      });
      const mesh  = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mat);
      mesh.position.set(0, 0, 0);
      group.add(mesh);
      joints.push(mesh);
    }

    // Bone cylinders — we'll resize/reposition them every frame
    const bones = [];
    for (let b = 0; b < HAND_BONES.length; b++) {
      const mat  = new THREE.MeshPhongMaterial({
        color:    boneCol,
        emissive: new THREE.Color(color).multiplyScalar(0.15),
        transparent: true,
        opacity: 0.75,
      });
      // Cylinder along Y axis; we'll reorient each frame
      const geo  = new THREE.CylinderGeometry(0.016, 0.016, 1, 6);
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      bones.push(mesh);
    }

    group.userData.joints = joints;
    group.userData.bones  = bones;
    return group;
  }

  /* ─── LANDMARK → 3D SCENE POSITION ────
     MediaPipe normalized coords:
       x: 0 (left) → 1 (right) — WITH selfieMode=true: matches screen
       y: 0 (top)  → 1 (bottom)
       z: depth relative to wrist (negative = toward camera)
     
     We map these into scene space so the hand appears
     in the foreground of the 3D builder scene.
  ──────────────────────────────────────── */
  const HAND_SCALE_X =  9.0;   // world width
  const HAND_SCALE_Y =  5.5;   // world height
  const HAND_SCALE_Z =  4.0;   // depth
  const HAND_Z_BASE  =  3.5;   // z-offset (toward camera, in front of objects)

  function lmToVec3(lm, idx) {
    const p = lm[idx];
    // x: selfieMode means x=0 is screen-left (left of user's view)
    // we map 0→1 to -4.5→4.5
    const x = (p.x - 0.5) * HAND_SCALE_X;
    // y: 0=top, 1=bottom → flip
    const y = -(p.y - 0.5) * HAND_SCALE_Y;
    // z: MediaPipe z is in same units as x; negative = closer to camera
    const z = HAND_Z_BASE - p.z * HAND_SCALE_Z;
    return new THREE.Vector3(x, y, z);
  }

  /* ─── UPDATE HAND SKELETON ─────────── */
  function updateHandSkeleton(handIdx, lm) {
    const group = state.handMeshes[handIdx];
    if (!group) return;

    if (!lm) {
      group.visible = false;
      return;
    }
    group.visible = true;

    const joints = group.userData.joints;
    const bones  = group.userData.bones;

    // Update joint positions
    for (let j = 0; j < 21; j++) {
      const v = lmToVec3(lm, j);
      joints[j].position.copy(v);
    }

    // Update bone cylinders
    for (let b = 0; b < HAND_BONES.length; b++) {
      const [i0, i1] = HAND_BONES[b];
      const p0 = lmToVec3(lm, i0);
      const p1 = lmToVec3(lm, i1);

      const dir = p1.clone().sub(p0);
      const len = dir.length();
      if (len < 0.001) { bones[b].visible = false; continue; }
      bones[b].visible = true;

      // Position at midpoint
      bones[b].position.copy(p0).add(p1).multiplyScalar(0.5);

      // Scale cylinder to match length
      bones[b].scale.set(1, len, 1);

      // Orient along dir
      const axis = new THREE.Vector3(0, 1, 0);
      bones[b].quaternion.setFromUnitVectors(axis, dir.normalize());
    }
  }

  /* ─── ANIMATE ───────────────────────── */
  function animate() {
    requestAnimationFrame(animate);
    state.objects.forEach(o => {
      if (o !== state.selectedObj) o.mesh.rotation.y += 0.003;
    });
    state.renderer.render(state.scene, state.camera);
  }

  /* ─── OBJECT CREATION ───────────────── */
  function createObject(geoFn, pos = new THREE.Vector3()) {
    const geo = geoFn();
    const mat = new THREE.MeshPhongMaterial({
      color:    new THREE.Color(state.selectedColor),
      emissive: new THREE.Color(state.selectedColor).multiplyScalar(0.15),
      transparent: true, opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    state.scene.add(mesh);
    const obj = { mesh, geo, mat };
    state.objects.push(obj);
    if (state.mirrorMode) {
      const m = mesh.clone(); m.position.x *= -1; m.scale.x = -1;
      state.scene.add(m); obj.mirror = m;
    }
    return obj;
  }

  function createRope(start, end) {
    const dir = end.clone().sub(start);
    const len = dir.length();
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const geo = new THREE.CylinderGeometry(0.08, 0.08, len, 8);
    const mat = new THREE.MeshPhongMaterial({ color: new THREE.Color(state.selectedColor), emissive: new THREE.Color(state.selectedColor).multiplyScalar(0.3), transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(mid);
    const axis = new THREE.Vector3(0,1,0);
    mesh.quaternion.setFromUnitVectors(axis, dir.normalize());
    state.scene.add(mesh);
    const obj = { mesh, geo, mat };
    state.objects.push(obj);
    return obj;
  }

  /* ─── COORD MAPPING (for gesture interaction) ── */
  function landmarkTo3D(lm, index = 9) {
    // Use same mapping as the skeleton for consistency
    return lmToVec3(lm, index);
  }

  /* ─── SLICE ─────────────────────────── */
  function sliceObjects(handPos) {
    const toRemove = [];
    state.objects.forEach((obj, i) => { if (Math.abs(obj.mesh.position.y - handPos.y) < 0.8) toRemove.push(i); });
    toRemove.reverse().forEach(i => {
      state.scene.remove(state.objects[i].mesh);
      if (state.objects[i].mirror) state.scene.remove(state.objects[i].mirror);
      state.objects.splice(i, 1);
    });
    updateTelemetry('Karate ✂', '✂️ Sliced!');
  }

  function deleteNearestObject(handPos) {
    if (!state.objects.length) return;
    let nearest = null, minDist = Infinity, nearestIdx = -1;
    state.objects.forEach((obj, i) => { const d = obj.mesh.position.distanceTo(handPos); if (d < minDist) { minDist = d; nearest = obj; nearestIdx = i; } });
    if (nearest && minDist < 2) {
      state.scene.remove(nearest.mesh);
      if (nearest.mirror) state.scene.remove(nearest.mirror);
      state.objects.splice(nearestIdx, 1);
      updateTelemetry('Scissors ✂', '❌ Deleted object');
    }
  }

  /* ─── TELEMETRY ─────────────────────── */
  function updateTelemetry(gesture, msg) {
    document.getElementById('tele-gesture-p2').textContent = gesture || '—';
    document.getElementById('tele-msg-p2').textContent     = msg || '';
  }

  /* ─── PALETTE ───────────────────────── */
  function buildPalette() {
    const grid = document.getElementById('palette-grid'); grid.innerHTML = '';
    PALETTE_ITEMS.forEach(item => {
      const el = document.createElement('div');
      el.className = 'palette-item';
      el.innerHTML = `<span class="palette-icon">${item.icon}</span><span>${item.label}</span>`;
      el.addEventListener('click', () => { createObject(item.fn, new THREE.Vector3(0,0,0)); hidePalette(); updateTelemetry('Palette', `Added ${item.label}`); });
      grid.appendChild(el);
    });
  }
  function showPalette() { state.paletteVisible = true; document.getElementById('object-palette').classList.remove('hidden'); }
  function hidePalette()  { state.paletteVisible = false; document.getElementById('object-palette').classList.add('hidden'); }

  /* ─── HAND TRACKING ─────────────────── */
  function onHandResults(results) {
    const lm0 = GestureUtils.getLandmarks(results, 0);
    const lm1 = GestureUtils.getLandmarks(results, 1);

    // Always update 3D hand skeletons (VR hands)
    updateHandSkeleton(0, lm0);
    updateHandSkeleton(1, lm1);

    if (!lm0) {
      updateTelemetry('—', 'Show your hand to build');
      state.buildStart = null; state.ropeCreated = false;
      state.selectedObj = null; state.lastPinchPos = null;
      return;
    }

    const gesture  = GestureUtils.detectGesture(results);
    const handPos0 = landmarkTo3D(lm0);

    if (state.chopCooldown    > 0) state.chopCooldown--;
    if (state.gojoCooldown    > 0) state.gojoCooldown--;
    if (state.scissorsCooldown > 0) state.scissorsCooldown--;

    if (gesture === 'gojo' && state.gojoCooldown <= 0) {
      if (!state.paletteVisible) { showPalette(); updateTelemetry('Gojo ∞', '🔮 Domain Expansion!'); }
      state.gojoCooldown = 90;
    }
    if (gesture === 'karate' && state.chopCooldown <= 0) { sliceObjects(handPos0); state.chopCooldown = 45; }
    if (gesture === 'scissors' && state.scissorsCooldown <= 0) { deleteNearestObject(handPos0); state.scissorsCooldown = 45; }

    if (lm1) {
      const pinch0 = GestureUtils.isPinch(lm0);
      const pinch1 = GestureUtils.isPinch(lm1);
      if (pinch0 && pinch1) {
        const pos0 = landmarkTo3D(lm0, 4), pos1 = landmarkTo3D(lm1, 4);
        const dist = pos0.distanceTo(pos1);
        if (!state.buildStart) { state.buildStart = { dist }; state.ropeCreated = false; updateTelemetry('Both Pinch 🤏🤏', 'Extend apart to create rope...'); }
        else if (dist > state.buildStart.dist + 0.8 && !state.ropeCreated) { createRope(pos0, pos1); state.ropeCreated = true; state.buildStart = null; updateTelemetry('Created ✨', '🪢 Rope created!'); }
      } else { state.buildStart = null; state.ropeCreated = false; }

      if (GestureUtils.isOpenHand(lm0) && GestureUtils.isOpenHand(lm1)) {
        const p0 = landmarkTo3D(lm0, 9), p1 = landmarkTo3D(lm1, 9);
        const d  = p0.distanceTo(p1);
        if (state.prevTwoHandDist !== null) { const delta = d - state.prevTwoHandDist; state.objects.forEach(o => { o.mesh.rotation.y += delta * 2; }); }
        state.prevTwoHandDist = d;
        updateTelemetry('Two Hands 🙌', '🔄 Rotating...');
      } else { state.prevTwoHandDist = null; }

    } else { state.buildStart = null; state.ropeCreated = false; state.prevTwoHandDist = null; }

    if (GestureUtils.isPinch(lm0) && !lm1) {
      const pinchPos = landmarkTo3D(lm0, 8);
      if (!state.selectedObj) {
        let nearest = null, minDist = Infinity;
        state.objects.forEach(obj => { const d = obj.mesh.position.distanceTo(pinchPos); if (d < minDist) { minDist = d; nearest = obj; } });
        if (nearest && minDist < 2.5) { state.selectedObj = nearest; state.lastPinchPos = pinchPos.clone(); updateTelemetry('Pinch 🤏', '✊ Dragging...'); }
      } else {
        const delta = pinchPos.clone().sub(state.lastPinchPos);
        state.selectedObj.mesh.position.add(delta);
        if (state.selectedObj.mirror) { state.selectedObj.mirror.position.x = -state.selectedObj.mesh.position.x; state.selectedObj.mirror.position.y = state.selectedObj.mesh.position.y; state.selectedObj.mirror.position.z = state.selectedObj.mesh.position.z; }
        state.lastPinchPos = pinchPos.clone();
        const hs = GestureUtils.getHandSize(lm0);
        state.selectedObj.mesh.scale.setScalar(Math.max(0.3, Math.min(3, hs * 12)));
      }
    } else { state.selectedObj = null; state.lastPinchPos = null; }

    if (gesture !== 'gojo' && gesture !== 'karate' && gesture !== 'scissors' && !GestureUtils.isPinch(lm0)) {
      updateTelemetry(gesture || '—', '');
    }
  }

  /* ─── CONTROLS ──────────────────────── */
  function wireControls() {
    document.getElementById('btn-mirror-p2').addEventListener('click', () => { state.mirrorMode=!state.mirrorMode; document.getElementById('toggle-mirror-p2').classList.toggle('active',state.mirrorMode); });
    document.getElementById('btn-paint-p2').addEventListener('click', () => { state.paintMode=!state.paintMode; document.getElementById('toggle-paint-p2').classList.toggle('active',state.paintMode); });
    document.getElementById('btn-clear-p2').addEventListener('click', () => {
      state.objects.forEach(o => { state.scene.remove(o.mesh); if(o.mirror) state.scene.remove(o.mirror); });
      state.objects = []; updateTelemetry('—', 'Scene cleared');
    });
    document.getElementById('btn-export-p2').addEventListener('click', () => { alert('Export STL: uses THREE.STLExporter in a full build.'); });
    document.getElementById('canvas-p2').addEventListener('click', () => { if (state.paletteVisible) hidePalette(); });
  }

  function init() { wireControls(); initThree(); }
  function startTracking() { /* handled by app.js */ }
  function onActivate() {
    NP._callback = onHandResults;
    if (state.renderer) {
      const canvas = document.getElementById('canvas-p2');
      const w = canvas.offsetWidth || window.innerWidth, h = canvas.offsetHeight || (window.innerHeight-56);
      state.camera.aspect = w/h; state.camera.updateProjectionMatrix(); state.renderer.setSize(w, h);
    }
  }

  return { init, startTracking, onActivate, onHandResults };
})();

document.addEventListener('DOMContentLoaded', () => P2.init());
