/* ═══════════════════════════════════════════
   NEUSTER PARTICLES — page2.js
   Hand Gesture 3D Builder
═══════════════════════════════════════════ */

'use strict';

window.P2 = (() => {

  const state = {
    scene: null, camera: null, renderer: null,
    objects: [],
    selectedObj: null,
    lastPinchPos: null,
    buildStart: null,
    ropePreview: null,
    ropeCreated: false,
    mirrorMode: false,
    paintMode: false,
    paletteVisible: false,
    gojoTimeout: null,
    chopCooldown: 0,
    gojoCooldown: 0,
    scissorsCooldown: 0,
    selectedColor: '#22d3ee',
    prevTwoHandDist: null,
    twoHandRotStart: null,
  };

  const PALETTE_ITEMS = [
    { icon: '●', label: 'Sphere',    fn: () => new THREE.SphereGeometry(0.4, 16, 16) },
    { icon: '■', label: 'Box',       fn: () => new THREE.BoxGeometry(0.8, 0.8, 0.8) },
    { icon: '▲', label: 'Cone',      fn: () => new THREE.ConeGeometry(0.4, 0.8, 16) },
    { icon: '⬭', label: 'Cylinder',  fn: () => new THREE.CylinderGeometry(0.3, 0.3, 1, 16) },
    { icon: '⬭', label: 'Torus',     fn: () => new THREE.TorusGeometry(0.5, 0.15, 12, 48) },
    { icon: '▬', label: 'Plane',     fn: () => new THREE.PlaneGeometry(1.5, 1.5) },
  ];

  /* ─── THREE.JS INIT ─────────────────── */
  function initThree() {
    const canvas = document.getElementById('canvas-p2');
    const w = canvas.offsetWidth  || window.innerWidth;
    const h = canvas.offsetHeight || (window.innerHeight - 56);

    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x050510);

    state.scene.add(new THREE.AmbientLight(0x334466, 0.8));
    const dir = new THREE.DirectionalLight(0xa855f7, 1.2);
    dir.position.set(5, 8, 5);
    state.scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0x22d3ee, 0.8);
    dir2.position.set(-5, -3, -5);
    state.scene.add(dir2);

    const grid = new THREE.GridHelper(12, 24, 0x222244, 0x111122);
    state.scene.add(grid);

    state.camera = new THREE.PerspectiveCamera(60, w/h, 0.1, 100);
    state.camera.position.set(0, 3, 8);
    state.camera.lookAt(0, 0, 0);

    state.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    state.renderer.setSize(w, h);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    window.addEventListener('resize', () => {
      const w2 = canvas.offsetWidth, h2 = canvas.offsetHeight;
      state.camera.aspect = w2/h2;
      state.camera.updateProjectionMatrix();
      state.renderer.setSize(w2, h2);
    });

    buildPalette();
    animate();
  }

  /* ─── ANIMATE ───────────────────────── */
  function animate() {
    requestAnimationFrame(animate);
    state.objects.forEach(o => {
      if (o !== state.selectedObj) {
        o.mesh.rotation.y += 0.003;
      }
    });
    state.renderer.render(state.scene, state.camera);
  }

  /* ─── OBJECT CREATION ───────────────── */
  function createObject(geoFn, pos = new THREE.Vector3()) {
    const geo = geoFn();
    const mat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(state.selectedColor),
      emissive: new THREE.Color(state.selectedColor).multiplyScalar(0.15),
      transparent: true,
      opacity: 0.9,
      wireframe: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    state.scene.add(mesh);

    const obj = { mesh, geo, mat };
    state.objects.push(obj);

    if (state.mirrorMode) {
      const mirrorMesh = mesh.clone();
      mirrorMesh.position.x *= -1;
      mirrorMesh.scale.x = -1;
      state.scene.add(mirrorMesh);
      obj.mirror = mirrorMesh;
    }

    return obj;
  }

  function createRope(start, end) {
    const dir = end.clone().sub(start);
    const len = dir.length();
    const mid = start.clone().add(end).multiplyScalar(0.5);

    const geo = new THREE.CylinderGeometry(0.08, 0.08, len, 8);
    const mat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(state.selectedColor),
      emissive: new THREE.Color(state.selectedColor).multiplyScalar(0.3),
      transparent: true, opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(mid);

    const axis = new THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(axis, dir.normalize());

    state.scene.add(mesh);
    const obj = { mesh, geo, mat };
    state.objects.push(obj);
    return obj;
  }

  /* ─── GESTURE → 3D COORDS ───────────── */
  function landmarkTo3D(lm, index = 9) {
    const x = (0.5 - lm[index].x) * 10;
    const y = (0.5 - lm[index].y) * 6;
    const z = 0;
    return new THREE.Vector3(x, y, z);
  }

  /* ─── SLICE ─────────────────────────── */
  function sliceObjects(handPos) {
    const toRemove = [];
    state.objects.forEach((obj, i) => {
      const d = Math.abs(obj.mesh.position.y - handPos.y);
      if (d < 0.8) toRemove.push(i);
    });
    toRemove.reverse().forEach(i => {
      state.scene.remove(state.objects[i].mesh);
      if (state.objects[i].mirror) state.scene.remove(state.objects[i].mirror);
      state.objects.splice(i, 1);
    });
    updateTelemetry('Karate ✂', '✂️ Sliced!');
  }

  /* ─── DELETE ────────────────────────── */
  function deleteNearestObject(handPos) {
    if (state.objects.length === 0) return;
    let nearest = null, minDist = Infinity, nearestIdx = -1;
    state.objects.forEach((obj, i) => {
      const d = obj.mesh.position.distanceTo(handPos);
      if (d < minDist) { minDist = d; nearest = obj; nearestIdx = i; }
    });
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
    document.getElementById('tele-msg-p2').textContent = msg || '';
  }

  /* ─── PALETTE ───────────────────────── */
  function buildPalette() {
    const grid = document.getElementById('palette-grid');
    grid.innerHTML = '';
    PALETTE_ITEMS.forEach(item => {
      const el = document.createElement('div');
      el.className = 'palette-item';
      el.innerHTML = `<span class="palette-icon">${item.icon}</span><span>${item.label}</span>`;
      el.addEventListener('click', () => {
        createObject(item.fn, new THREE.Vector3(0, 0, 0));
        hidePalette();
        updateTelemetry('Palette', `Added ${item.label}`);
      });
      grid.appendChild(el);
    });
  }

  function showPalette() {
    state.paletteVisible = true;
    const el = document.getElementById('object-palette');
    el.classList.remove('hidden');
    // Re-trigger entrance animation each time
    el.classList.remove('animating');
    void el.offsetWidth; // force reflow
    el.classList.add('animating');
  }
  function hidePalette() {
    state.paletteVisible = false;
    const el = document.getElementById('object-palette');
    el.classList.add('hidden');
    el.classList.remove('animating');
  }

  /* ─── HAND TRACKING ─────────────────── */
  function onHandResults(results) {
    if (NP.currentPage !== 2) return;

    const lm0 = GestureUtils.getLandmarks(results, 0);
    const lm1 = GestureUtils.getLandmarks(results, 1);

    if (!lm0) {
      updateTelemetry('—', 'Show your hand to build');
      state.buildStart   = null;
      state.ropeCreated  = false;
      state.selectedObj  = null;
      state.lastPinchPos = null;
      return;
    }

    const gesture  = GestureUtils.detectGesture(results);
    const handPos0 = landmarkTo3D(lm0);

    // Cooldown tick
    if (state.chopCooldown    > 0) state.chopCooldown--;
    if (state.gojoCooldown    > 0) state.gojoCooldown--;
    if (state.scissorsCooldown > 0) state.scissorsCooldown--;

    // ── GOJO DOMAIN → palette ──────────
    if (gesture === 'gojo' && state.gojoCooldown <= 0) {
      if (!state.paletteVisible) {
        showPalette();
        updateTelemetry('Gojo ∞', '🔮 Domain Expansion! Choose object');
      }
      state.gojoCooldown = 90;
    }

    // ── KARATE CHOP → slice ──────────
    if (gesture === 'karate' && state.chopCooldown <= 0) {
      sliceObjects(handPos0);
      state.chopCooldown = 45;
    }

    // ── SCISSORS → delete ────────────
    if (gesture === 'scissors' && state.scissorsCooldown <= 0) {
      deleteNearestObject(handPos0);
      state.scissorsCooldown = 45;
    }

    // ── TWO-HAND PINCH → create rope ──
    if (lm1) {
      const pinch0 = GestureUtils.isPinch(lm0);
      const pinch1 = GestureUtils.isPinch(lm1);

      if (pinch0 && pinch1) {
        const pos0 = landmarkTo3D(lm0, 4);
        const pos1 = landmarkTo3D(lm1, 4);
        const dist = pos0.distanceTo(pos1);

        if (!state.buildStart) {
          state.buildStart  = { pos0: pos0.clone(), pos1: pos1.clone(), dist };
          state.ropeCreated = false;
          updateTelemetry('Both Pinch 🤏🤏', 'Extend apart to create rope...');
        } else {
          if (dist > state.buildStart.dist + 0.8 && !state.ropeCreated) {
            createRope(pos0, pos1);
            state.ropeCreated = true;
            state.buildStart  = null;
            updateTelemetry('Created ✨', '🪢 Rope structure created!');
          }
        }
      } else {
        state.buildStart  = null;
        state.ropeCreated = false;
      }

      // Two-hand rotate (both open hands)
      const open0 = GestureUtils.isOpenHand(lm0);
      const open1 = GestureUtils.isOpenHand(lm1);
      if (open0 && open1) {
        const p0 = landmarkTo3D(lm0, 9);
        const p1 = landmarkTo3D(lm1, 9);
        const currDist = p0.distanceTo(p1);
        if (state.prevTwoHandDist !== null) {
          const delta = currDist - state.prevTwoHandDist;
          state.objects.forEach(o => { o.mesh.rotation.y += delta * 2; });
        }
        state.prevTwoHandDist = currDist;
        updateTelemetry('Two Hands 🙌', '🔄 Rotating objects');
      } else {
        state.prevTwoHandDist = null;
      }

    } else {
      state.buildStart      = null;
      state.ropeCreated     = false;
      state.prevTwoHandDist = null;
    }

    // ── ONE-HAND PINCH → drag ────────
    if (GestureUtils.isPinch(lm0) && !lm1) {
      const pinchPos = landmarkTo3D(lm0, 8);

      if (!state.selectedObj) {
        let nearest = null, minDist = Infinity;
        state.objects.forEach(obj => {
          const d = obj.mesh.position.distanceTo(pinchPos);
          if (d < minDist) { minDist = d; nearest = obj; }
        });
        if (nearest && minDist < 2.5) {
          state.selectedObj  = nearest;
          state.lastPinchPos = pinchPos.clone();
          updateTelemetry('Pinch 🤏', '✊ Dragging object...');
        }
      } else {
        const delta = pinchPos.clone().sub(state.lastPinchPos);
        state.selectedObj.mesh.position.add(delta);
        if (state.selectedObj.mirror) {
          state.selectedObj.mirror.position.x = -state.selectedObj.mesh.position.x;
          state.selectedObj.mirror.position.y =  state.selectedObj.mesh.position.y;
          state.selectedObj.mirror.position.z =  state.selectedObj.mesh.position.z;
        }
        state.lastPinchPos = pinchPos.clone();

        const hs    = GestureUtils.getHandSize(lm0);
        const scale = Math.max(0.3, Math.min(3, hs * 12));
        state.selectedObj.mesh.scale.setScalar(scale);
      }
    } else {
      state.selectedObj  = null;
      state.lastPinchPos = null;
    }

    if (gesture !== 'gojo' && gesture !== 'karate' && gesture !== 'scissors') {
      if (!GestureUtils.isPinch(lm0)) {
        updateTelemetry(gesture || '—', '');
      }
    }
  }

  /* ─── CONTROLS WIRING ───────────────── */
  function wireControls() {
    document.getElementById('btn-mirror-p2').addEventListener('click', () => {
      state.mirrorMode = !state.mirrorMode;
      document.getElementById('toggle-mirror-p2').classList.toggle('active', state.mirrorMode);
    });

    document.getElementById('btn-paint-p2').addEventListener('click', () => {
      state.paintMode = !state.paintMode;
      document.getElementById('toggle-paint-p2').classList.toggle('active', state.paintMode);
    });

    document.getElementById('btn-clear-p2').addEventListener('click', () => {
      state.objects.forEach(o => {
        state.scene.remove(o.mesh);
        if (o.mirror) state.scene.remove(o.mirror);
      });
      state.objects = [];
      updateTelemetry('—', 'Scene cleared');
    });

    document.getElementById('btn-export-p2').addEventListener('click', () => {
      alert('Export STL: In a full build, this would use the THREE.STLExporter to export all scene objects as an STL file ready for 3D printing.');
    });

    document.getElementById('canvas-p2').addEventListener('click', () => {
      if (state.paletteVisible) hidePalette();
    });
  }

  /* ─── PUBLIC API ────────────────────── */
  function init() {
    wireControls();
    initThree();
    // Hand tracking started lazily by app.js via startTracking()
  }

  function startTracking() {
    setupHandTracking('video-p2', 'pip-canvas-p2', onHandResults);
  }

  function onActivate() {
    if (state.renderer) {
      const canvas = document.getElementById('canvas-p2');
      const w = canvas.offsetWidth  || window.innerWidth;
      const h = canvas.offsetHeight || (window.innerHeight - 56);
      state.camera.aspect = w/h;
      state.camera.updateProjectionMatrix();
      state.renderer.setSize(w, h);
    }
  }

  return { init, startTracking, onActivate };

})();

document.addEventListener('DOMContentLoaded', () => P2.init());
