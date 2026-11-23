/**
 * scene3d.js - Three.js Visualizations for LLM Playground 3D
 * 
 * Includes 4 interactive 3D visualizations:
 * 1. Token Stream: Floating glowing chips flying along a spline curve into a 3D tunnel
 * 2. Context Window Tower: Translucent stack of system/user/assistant blocks turning red near limit
 * 3. Rate-Limit Gauge: Holographic sphere/ring draining and refilling with quota
 * 4. Temperature Sphere: Particle cloud shifting from orderly/tight to chaotic/spread
 * 
 * Features: OrbitControls, responsive resize, reduce-motion support, tab switching,
 * proper geometry/material disposal, visibility pausing.
 */

import * as THREE_MODULE from 'three';
import { OrbitControls as OrbitControls_MODULE } from 'three/examples/jsm/controls/OrbitControls.js';

// Resolve THREE and OrbitControls from window or imported modules
const THREE = (typeof window !== 'undefined' && window.THREE) ? window.THREE : THREE_MODULE;
const OrbitControls = (typeof window !== 'undefined' && window.THREE && window.THREE.OrbitControls)
  ? window.THREE.OrbitControls
  : OrbitControls_MODULE;

if (typeof window !== 'undefined') {
  window.THREE = THREE;
  window.THREE.OrbitControls = OrbitControls;
}

export class Scene3DManager {
  constructor(containerElement) {
    this.container = containerElement;
    this.currentView = 'stream'; // 'stream' | 'context' | 'quota' | 'temperature'
    this.reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.isTabVisible = true;
    this.animationFrameId = null;
    this.lastTime = performance.now();

    // Model and quota parameters
    this.currentTemperature = 0.7;
    this.contextHistory = [];
    this.maxContextTokens = 128000;
    this.rateLimitData = {
      remaining: 30000,
      limit: 30000,
      percent: 1.0
    };

    // Active tokens flying in stream view
    this.flyingTokens = [];
    this.maxActiveChips = 40;

    this.initThree();
    this.setupViewScenes();
    this.setupEventListeners();
    this.switchView('stream');
    this.startLoop();
  }

  get THREE() {
    return THREE;
  }

  initThree() {
    if (!THREE) {
      console.error('Three.js library is not available!');
      return;
    }

    const width = this.container.clientWidth || 600;
    const height = this.container.clientHeight || 400;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x0a0c10, 0.95);
    this.container.appendChild(this.renderer.domElement);

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    this.camera.position.set(0, 2.5, 12);

    // Orbit Controls
    if (OrbitControls) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.maxDistance = 35;
      this.controls.minDistance = 3;
      this.controls.target.set(0, 0, 0);
    }

    // Master Scene
    this.scene = new THREE.Scene();

    // Ambient & Directional Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffaa44, 1.2);
    dirLight1.position.set(10, 20, 15);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x00d2ff, 0.8);
    dirLight2.position.set(-10, -10, -10);
    this.scene.add(dirLight2);

    // Groups for the 4 distinct views
    this.streamGroup = new THREE.Group();
    this.contextGroup = new THREE.Group();
    this.quotaGroup = new THREE.Group();
    this.temperatureGroup = new THREE.Group();

    this.scene.add(this.streamGroup);
    this.scene.add(this.contextGroup);
    this.scene.add(this.quotaGroup);
    this.scene.add(this.temperatureGroup);
  }

  setupEventListeners() {
    // Window Resize
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);

    // Tab visibility handling (pause loop when hidden)
    document.addEventListener('visibilitychange', () => {
      this.isTabVisible = !document.hidden;
      if (this.isTabVisible) {
        this.lastTime = performance.now();
      }
    });
  }

  onResize() {
    if (!this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  setReducedMotion(enabled) {
    this.reducedMotion = enabled;
  }

  setTemperature(temp) {
    this.currentTemperature = parseFloat(temp) || 0.7;
  }

  setRateLimits(rateLimits) {
    if (!rateLimits) return;
    const remaining = rateLimits.remainingTokens ?? 30000;
    const limit = rateLimits.limitTokens ?? 30000;
    this.rateLimitData = {
      remaining,
      limit,
      percent: limit > 0 ? Math.max(0, Math.min(1, remaining / limit)) : 1
    };
    this.updateQuotaVisuals();
  }

  setContextHistory(messages, modelContext = 128000) {
    this.contextHistory = messages || [];
    this.maxContextTokens = modelContext || 128000;
    this.rebuildContextTower();
  }

  // ==========================================
  // VIEW 1: TOKEN STREAM SETUP
  // ==========================================
  setupStreamView() {
    const THREE = this.THREE;
    if (!THREE) return;

    // Flight spline path: curved S-curve trajectory
    this.streamCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-9, 3.5, -4),
      new THREE.Vector3(-4.5, 4.2, 0),
      new THREE.Vector3(0, 2.0, 3.5),
      new THREE.Vector3(4.5, 0.5, 1.0),
      new THREE.Vector3(8.5, -1.0, -5.0)
    ]);

    // Draw visible subtle glowing trajectory curve line
    const curvePoints = this.streamCurve.getPoints(60);
    const curveGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const curveMat = new THREE.LineBasicMaterial({
      color: 0xff7700,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending
    });
    this.streamTrajectoryLine = new THREE.Line(curveGeo, curveMat);
    this.streamGroup.add(this.streamTrajectoryLine);

    // Glowing Response Tunnel at the destination
    this.tunnelRings = [];
    const tunnelGroup = new THREE.Group();
    tunnelGroup.position.set(8.5, -1.0, -5.0);
    tunnelGroup.rotation.y = -Math.PI / 4;

    const ringCount = 8;
    for (let i = 0; i < ringCount; i++) {
      const ringGeo = new THREE.TorusGeometry(1.6 + i * 0.15, 0.04, 8, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xff7700 : 0x00d2ff,
        transparent: true,
        opacity: 0.6 - (i * 0.06),
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.z = -i * 0.9;
      tunnelGroup.add(ring);
      this.tunnelRings.push(ring);
    }

    // Portal vortex core
    const vortexGeo = new THREE.CircleGeometry(1.4, 24);
    const vortexMat = new THREE.MeshBasicMaterial({
      color: 0xff5500,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const vortex = new THREE.Mesh(vortexGeo, vortexMat);
    vortex.position.z = -ringCount * 0.9;
    tunnelGroup.add(vortex);

    this.streamGroup.add(tunnelGroup);
    this.tunnelGroup = tunnelGroup;
  }

  /**
   * Called on every SSE delta token received
   */
  addStreamToken(tokenText, isReasoning = false) {
    if (this.currentView !== 'stream') return;
    const THREE = this.THREE;
    if (!THREE) return;

    // Prune oldest if too many chips flying
    if (this.flyingTokens.length >= this.maxActiveChips) {
      const oldest = this.flyingTokens.shift();
      this.disposeObject(oldest.mesh);
      this.streamGroup.remove(oldest.mesh);
    }

    // Classify token for color
    const classification = this.classifyToken(tokenText, isReasoning);

    // Create chip texture with text label
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    // Draw chip background
    ctx.fillStyle = 'rgba(18, 22, 32, 0.92)';
    this.roundRect(ctx, 4, 4, 248, 88, 16);
    ctx.fill();

    // Glowing border
    ctx.strokeStyle = classification.hexString;
    ctx.lineWidth = 4;
    this.roundRect(ctx, 4, 4, 248, 88, 16);
    ctx.stroke();

    // Type tag in corner
    ctx.fillStyle = classification.hexString;
    ctx.font = 'bold 18px monospace';
    ctx.fillText(classification.label.toUpperCase(), 16, 28);

    // Main token text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const displayStr = tokenText.replace(/\n/g, '↵ ').replace(/\t/g, '⇥ ');
    const safeStr = displayStr.length > 12 ? displayStr.slice(0, 11) + '…' : displayStr;
    ctx.fillText(safeStr || '·', 16, 68);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    // Chip Geometry & Material
    const chipGeo = new THREE.BoxGeometry(1.6, 0.6, 0.12);
    const chipMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.3,
      metalness: 0.4,
      emissive: classification.color,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.95
    });

    const chipMesh = new THREE.Mesh(chipGeo, chipMat);
    chipMesh.scale.set(0.1, 0.1, 0.1); // Spawns small and pops in

    const startPos = this.streamCurve.getPointAt(0);
    chipMesh.position.copy(startPos);

    this.streamGroup.add(chipMesh);

    this.flyingTokens.push({
      mesh: chipMesh,
      texture,
      geo: chipGeo,
      mat: chipMat,
      progress: 0,
      speed: 0.006 + Math.random() * 0.003,
      spinSpeed: (Math.random() - 0.5) * 0.05
    });
  }

  classifyToken(tokenText, isReasoning) {
    if (isReasoning) {
      return { type: 'reasoning', color: 0xa855f7, hexString: '#a855f7', label: 'think' };
    }
    if (/^\s+$/.test(tokenText)) {
      return { type: 'space', color: 0x64748b, hexString: '#64748b', label: 'space' };
    }
    if (/^\d+(\.\d+)?$/.test(tokenText.trim())) {
      return { type: 'number', color: 0x10b981, hexString: '#10b981', label: 'num' };
    }
    if (/^[.,!?;:()[\]{}'"`\-+=/*<>@#$%^&_~|\\]+$/.test(tokenText.trim())) {
      return { type: 'punct', color: 0xec4899, hexString: '#ec4899', label: 'punct' };
    }
    return { type: 'word', color: 0xff7700, hexString: '#ff7700', label: 'word' };
  }

  // ==========================================
  // VIEW 2: CONTEXT WINDOW TOWER SETUP
  // ==========================================
  setupContextView() {
    // Context Tower base platform
    const THREE = this.THREE;
    if (!THREE) return;

    const baseGeo = new THREE.CylinderGeometry(3.5, 3.8, 0.3, 32);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1a202c,
      roughness: 0.6,
      metalness: 0.5
    });
    this.contextBase = new THREE.Mesh(baseGeo, baseMat);
    this.contextBase.position.y = -3;
    this.contextGroup.add(this.contextBase);

    // Limit Ceiling Indicator (dotted ring)
    const ceilingGeo = new THREE.TorusGeometry(3.5, 0.04, 8, 32);
    const ceilingMat = new THREE.MeshBasicMaterial({
      color: 0xff3344,
      transparent: true,
      opacity: 0.45
    });
    this.contextCeiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    this.contextCeiling.rotation.x = Math.PI / 2;
    this.contextCeiling.position.y = 5.5;
    this.contextGroup.add(this.contextCeiling);

    this.towerBlocksGroup = new THREE.Group();
    this.contextGroup.add(this.towerBlocksGroup);

    this.rebuildContextTower();
  }

  rebuildContextTower() {
    if (!this.towerBlocksGroup) return;
    const THREE = this.THREE;
    if (!THREE) return;

    // Clear existing blocks
    while (this.towerBlocksGroup.children.length > 0) {
      const obj = this.towerBlocksGroup.children[0];
      this.disposeObject(obj);
      this.towerBlocksGroup.remove(obj);
    }

    if (!this.contextHistory || this.contextHistory.length === 0) {
      // Empty placeholder
      const emptyGeo = new THREE.BoxGeometry(3, 0.5, 3);
      const emptyMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        transparent: true,
        opacity: 0.3,
        wireframe: true
      });
      const placeholder = new THREE.Mesh(emptyGeo, emptyMat);
      placeholder.position.y = -2.6;
      this.towerBlocksGroup.add(placeholder);
      return;
    }

    let currentY = -2.8;
    let totalTokens = 0;
    const maxHeight = 7.5;

    // Calculate token estimates for each message
    const msgStats = this.contextHistory.map(m => {
      const charCount = (m.content || '').length;
      const tokens = Math.max(1, Math.round(charCount / 4));
      totalTokens += tokens;
      return { role: m.role, tokens, text: m.content };
    });

    // Ratio against context limit (capped visual scale)
    const contextFraction = Math.min(1.0, totalTokens / Math.min(this.maxContextTokens, 16000));
    const isNearingLimit = (totalTokens / this.maxContextTokens) > 0.75;

    msgStats.forEach((msg, idx) => {
      const blockHeight = Math.max(0.4, (msg.tokens / totalTokens) * (maxHeight * contextFraction));
      const blockGeo = new THREE.BoxGeometry(3.2, blockHeight, 3.2);

      let baseColor = 0xff7700; // User
      if (msg.role === 'system') baseColor = 0x8b5cf6; // System
      else if (msg.role === 'assistant') baseColor = 0x10b981; // Assistant

      // If nearing limit, tint towards warning red
      if (isNearingLimit) {
        baseColor = 0xef4444;
      }

      const blockMat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.2,
        metalness: 0.3,
        transparent: true,
        opacity: 0.82,
        emissive: baseColor,
        emissiveIntensity: isNearingLimit ? 0.45 : 0.2
      });

      const blockMesh = new THREE.Mesh(blockGeo, blockMat);
      blockMesh.position.y = currentY + (blockHeight / 2);
      this.towerBlocksGroup.add(blockMesh);

      // Wireframe contour around each block
      const edgeGeo = new THREE.EdgesGeometry(blockGeo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.4
      });
      const edgeMesh = new THREE.LineSegments(edgeGeo, edgeMat);
      blockMesh.add(edgeMesh);

      currentY += blockHeight + 0.08;
    });
  }

  // ==========================================
  // VIEW 3: RATE-LIMIT GAUGE SETUP
  // ==========================================
  setupQuotaView() {
    const THREE = this.THREE;
    if (!THREE) return;

    // Outer Gyroscope Rings
    this.gaugeRings = [];
    const ringRadii = [3.8, 3.4, 3.0];
    const ringColors = [0xff7700, 0x00d2ff, 0x10b981];

    ringRadii.forEach((radius, i) => {
      const torusGeo = new THREE.TorusGeometry(radius, 0.05, 12, 48);
      const torusMat = new THREE.MeshBasicMaterial({
        color: ringColors[i],
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending
      });
      const ring = new THREE.Mesh(torusGeo, torusMat);
      ring.rotation.x = (i * Math.PI) / 3;
      ring.rotation.y = (i * Math.PI) / 4;
      this.quotaGroup.add(ring);
      this.gaugeRings.push(ring);
    });

    // Holographic Core Sphere (drains as quota drops)
    const coreGeo = new THREE.SphereGeometry(2.0, 32, 32);
    this.coreMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.75,
      roughness: 0.3,
      metalness: 0.7
    });
    this.quotaCore = new THREE.Mesh(coreGeo, this.coreMat);
    this.quotaGroup.add(this.quotaCore);

    // Inner wireframe sphere
    const wireGeo = new THREE.SphereGeometry(2.2, 16, 16);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.2
    });
    this.quotaWire = new THREE.Mesh(wireGeo, wireMat);
    this.quotaGroup.add(this.quotaWire);
  }

  updateQuotaVisuals() {
    if (!this.quotaCore || !this.coreMat) return;
    const fraction = this.rateLimitData.percent; // 0 to 1

    // Scale core sphere based on quota remaining
    const targetScale = Math.max(0.2, fraction);
    this.quotaCore.scale.set(targetScale, targetScale, targetScale);

    // Dynamic color shift: Green -> Amber -> Red
    let targetColor = 0x10b981; // Emerald (safe)
    if (fraction < 0.25) {
      targetColor = 0xef4444; // Red (danger)
    } else if (fraction < 0.6) {
      targetColor = 0xf59e0b; // Amber (warning)
    }

    this.coreMat.color.setHex(targetColor);
    this.coreMat.emissive.setHex(targetColor);
  }

  // ==========================================
  // VIEW 4: TEMPERATURE SPHERE SETUP
  // ==========================================
  setupTemperatureView() {
    const THREE = this.THREE;
    if (!THREE) return;

    // Particle Cloud (600 particles for high performance)
    this.particleCount = this.reducedMotion ? 250 : 600;
    const positions = new Float32Array(this.particleCount * 3);
    const colors = new Float32Array(this.particleCount * 3);
    this.particleBasePositions = [];
    this.particleVelocities = [];

    const colorOrderly = new THREE.Color(0x00d2ff); // Cold cyan
    const colorChaotic = new THREE.Color(0xff4500); // Hot fiery orange

    for (let i = 0; i < this.particleCount; i++) {
      // Golden spiral distribution on sphere surface
      const phi = Math.acos(-1 + (2 * i) / this.particleCount);
      const theta = Math.sqrt(this.particleCount * Math.PI) * phi;
      const radius = 2.4;

      const x = radius * Math.cos(theta) * Math.sin(phi);
      const y = radius * Math.sin(theta) * Math.sin(phi);
      const z = radius * Math.cos(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      this.particleBasePositions.push(new THREE.Vector3(x, y, z));
      this.particleVelocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      ));

      // Initial color
      colors[i * 3] = colorOrderly.r;
      colors[i * 3 + 1] = colorOrderly.g;
      colors[i * 3 + 2] = colorOrderly.b;
    }

    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Particle Material
    this.particleMat = new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    this.particleCloud = new THREE.Points(this.particleGeo, this.particleMat);
    this.temperatureGroup.add(this.particleCloud);

    // Inner glowing cold/hot core
    const coreGeo = new THREE.SphereGeometry(1.2, 24, 24);
    this.tempCoreMat = new THREE.MeshStandardMaterial({
      color: 0x00d2ff,
      emissive: 0x00d2ff,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.5,
      roughness: 0.2
    });
    this.tempCoreMesh = new THREE.Mesh(coreGeo, this.tempCoreMat);
    this.temperatureGroup.add(this.tempCoreMesh);
  }

  updateTemperatureParticles(time) {
    if (!this.particleGeo || !this.particleBasePositions) return;
    const THREE = this.THREE;
    if (!THREE) return;

    const posAttr = this.particleGeo.getAttribute('position');
    const colAttr = this.particleGeo.getAttribute('color');
    const temp = this.currentTemperature; // 0 to 2

    // Color interpolation based on temperature
    const tNorm = Math.min(1.0, temp / 1.8);
    const coldColor = new THREE.Color(0x00d2ff); // Cold Cyan (T=0)
    const midColor = new THREE.Color(0xffaa00);  // Warm Gold (T=0.7)
    const hotColor = new THREE.Color(0xff2200);  // Fiery Crimson (T=2.0)

    const currentColor = new THREE.Color();
    if (tNorm < 0.5) {
      currentColor.lerpColors(coldColor, midColor, tNorm * 2);
    } else {
      currentColor.lerpColors(midColor, hotColor, (tNorm - 0.5) * 2);
    }

    // Core mesh update
    if (this.tempCoreMat) {
      this.tempCoreMat.color.copy(currentColor);
      this.tempCoreMat.emissive.copy(currentColor);
      const corePulse = 1.0 + Math.sin(time * (1 + temp * 3)) * (0.05 + temp * 0.1);
      this.tempCoreMesh.scale.set(corePulse, corePulse, corePulse);
    }

    // Jitter / chaos radius proportional to temperature
    const chaosRadius = temp * 1.8;
    const speed = 1.0 + temp * 4.0;

    for (let i = 0; i < this.particleCount; i++) {
      const base = this.particleBasePositions[i];
      const vel = this.particleVelocities[i];

      // At low temp: stay rigidly close to base sphere
      // At high temp: swirl chaotically outwards with noise
      const noise = Math.sin(time * speed + i) * chaosRadius;
      const noiseY = Math.cos(time * speed * 0.8 + i * 2) * chaosRadius;
      const noiseZ = Math.sin(time * speed * 1.2 + i * 3) * chaosRadius;

      posAttr.setXYZ(
        i,
        base.x + vel.x * (chaosRadius * 0.5) + noise * 0.4,
        base.y + vel.y * (chaosRadius * 0.5) + noiseY * 0.4,
        base.z + vel.z * (chaosRadius * 0.5) + noiseZ * 0.4
      );

      colAttr.setXYZ(i, currentColor.r, currentColor.g, currentColor.b);
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  // ==========================================
  // VIEW SWITCHER & RENDER LOOP
  // ==========================================
  setupViewScenes() {
    this.setupStreamView();
    this.setupContextView();
    this.setupQuotaView();
    this.setupTemperatureView();
  }

  switchView(viewName) {
    this.currentView = viewName;
    this.streamGroup.visible = (viewName === 'stream');
    this.contextGroup.visible = (viewName === 'context');
    this.quotaGroup.visible = (viewName === 'quota');
    this.temperatureGroup.visible = (viewName === 'temperature');

    // Smoothly reposition camera for best angle
    if (this.controls) {
      if (viewName === 'stream') {
        this.camera.position.set(0, 3, 14);
        this.controls.target.set(0, 0, 0);
      } else if (viewName === 'context') {
        this.camera.position.set(6, 4, 10);
        this.controls.target.set(0, 1, 0);
        this.rebuildContextTower();
      } else if (viewName === 'quota') {
        this.camera.position.set(0, 2, 9);
        this.controls.target.set(0, 0, 0);
        this.updateQuotaVisuals();
      } else if (viewName === 'temperature') {
        this.camera.position.set(0, 1.5, 9);
        this.controls.target.set(0, 0, 0);
      }
      this.controls.update();
    }
  }

  startLoop() {
    const loop = (now) => {
      this.animationFrameId = requestAnimationFrame(loop);
      if (!this.isTabVisible) return;

      const delta = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const time = now * 0.001;

      // Update active view animations
      if (this.currentView === 'stream') {
        this.updateStreamAnimation(delta, time);
      } else if (this.currentView === 'context') {
        this.updateContextAnimation(time);
      } else if (this.currentView === 'quota') {
        this.updateQuotaAnimation(delta);
      } else if (this.currentView === 'temperature') {
        this.updateTemperatureParticles(time);
      }

      if (this.controls) {
        this.controls.update();
      }

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  updateStreamAnimation(delta, time) {
    // Pulse tunnel rings
    if (this.tunnelRings) {
      this.tunnelRings.forEach((ring, i) => {
        ring.rotation.z += 0.01 * (i % 2 === 0 ? 1 : -1);
      });
    }

    // Animate flying token chips along the 3D spline
    const finishedIndices = [];
    this.flyingTokens.forEach((token, index) => {
      token.progress += token.speed * (this.reducedMotion ? 0.6 : 1.2);

      if (token.progress >= 1.0) {
        finishedIndices.push(index);
        return;
      }

      // Spline position
      const pos = this.streamCurve.getPointAt(token.progress);
      token.mesh.position.copy(pos);

      // Scale pop-in at start, scale pop-out at tunnel vortex
      if (token.progress < 0.1) {
        const s = token.progress / 0.1;
        token.mesh.scale.set(s, s, s);
      } else if (token.progress > 0.85) {
        const s = (1.0 - token.progress) / 0.15;
        token.mesh.scale.set(s, s, s);
      } else {
        token.mesh.scale.set(1, 1, 1);
      }

      // Gentle floating spin
      token.mesh.rotation.y += token.spinSpeed;
      token.mesh.rotation.x = Math.sin(time * 2 + index) * 0.15;
    });

    // Remove finished tokens
    for (let i = finishedIndices.length - 1; i >= 0; i--) {
      const idx = finishedIndices[i];
      const token = this.flyingTokens[idx];
      this.disposeObject(token.mesh);
      this.streamGroup.remove(token.mesh);
      this.flyingTokens.splice(idx, 1);
    }
  }

  updateContextAnimation(time) {
    // Gentle rotation of context tower
    if (this.contextGroup) {
      this.towerBlocksGroup.rotation.y += 0.005;
      if (this.contextCeiling) {
        const pulse = 1.0 + Math.sin(time * 3) * 0.05;
        this.contextCeiling.scale.set(pulse, pulse, pulse);
      }
    }
  }

  updateQuotaAnimation(delta) {
    if (this.gaugeRings) {
      this.gaugeRings.forEach((ring, i) => {
        ring.rotation.x += (0.2 + i * 0.1) * delta;
        ring.rotation.y += (0.3 - i * 0.05) * delta;
      });
    }
    if (this.quotaWire) {
      this.quotaWire.rotation.y -= 0.15 * delta;
    }
  }

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  disposeObject(obj) {
    if (!obj) return;
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      } else {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    }
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    // Clean up all groups
    [this.streamGroup, this.contextGroup, this.quotaGroup, this.temperatureGroup].forEach(grp => {
      while (grp.children.length > 0) {
        const child = grp.children[0];
        this.disposeObject(child);
        grp.remove(child);
      }
    });
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
  }
}

