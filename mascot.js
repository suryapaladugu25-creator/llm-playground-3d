/**
 * mascot.js - Tokie 3D Mascot & AI Personality
 * 
 * Features:
 * - 3D low-poly robot head built from Three.js primitives
 * - Procedural floating bob, natural blinking, smooth cursor head tracking
 * - Emotional states: 'idle', 'thinking', 'happy', 'concerned'
 * - Animated eye expressions (happy curves, thinking spirals, concerned slant)
 * - Pulsing antenna beacon
 * - Interactive speech bubble system:
 *   - 4-step guided tour for first-time visitors (with replay)
 *   - Post-generation token/speed educational explanations
 *   - Live prompt tips based on analyzer
 *   - Friendly error handling (401 key hint, 429 live countdown, calm retry)
 */

import * as THREE_MODULE from 'three';

const THREE = (typeof window !== 'undefined' && window.THREE) ? window.THREE : THREE_MODULE;
if (typeof window !== 'undefined') {
  window.THREE = THREE;
}

export class TokieMascot {
  constructor(canvasContainer, bubbleContainer) {
    this.canvasContainer = canvasContainer;
    this.bubbleContainer = bubbleContainer;

    this.mood = 'idle'; // 'idle' | 'thinking' | 'happy' | 'concerned'
    this.targetRotation = { x: 0, y: 0 };
    this.currentRotation = { x: 0, y: 0 };
    this.blinkTimer = 0;
    this.isBlinking = false;
    this.nextBlinkTime = 3.0;
    this.animationFrameId = null;
    this.isTabVisible = true;
    this.countdownTimerId = null;

    // Tour state
    this.tourStep = 0;
    this.tourActive = false;

    this.initThree();
    this.buildMascot();
    this.setupTracking();
    this.setupVisibility();
    this.startLoop();

    // Check if first visit for tour
    const hasSeenTour = typeof localStorage !== 'undefined' ? localStorage.getItem('tokie_tour_completed') : null;
    if (!hasSeenTour) {
      setTimeout(() => this.startTour(), 900);
    } else {
      this.say("👋 Welcome back! I'm Tokie, your 3D LLM guide. Ready to experiment?", { duration: 6000 });
    }
  }

  get THREE() {
    return THREE;
  }

  initThree() {
    const THREE = this.THREE;
    if (!THREE) return;

    const size = 120;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(size, size);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvasContainer.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(0, 0, 5.2);

    // Soft lights
    const ambLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambLight);

    const keyLight = new THREE.DirectionalLight(0xffaa44, 1.4);
    keyLight.position.set(3, 4, 4);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x00d2ff, 1.0);
    rimLight.position.set(-3, -2, -2);
    this.scene.add(rimLight);
  }

  buildMascot() {
    const THREE = this.THREE;
    if (!THREE) return;

    this.mascotRoot = new THREE.Group();
    this.scene.add(this.mascotRoot);

    // 1. Robot Head Shell (chubby rounded box)
    const headGeo = new THREE.BoxGeometry(1.7, 1.4, 1.4);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x1e2638,
      roughness: 0.3,
      metalness: 0.6
    });
    this.headMesh = new THREE.Mesh(headGeo, headMat);
    this.mascotRoot.add(this.headMesh);

    // Head Edge bevel contour
    const headEdgeGeo = new THREE.EdgesGeometry(headGeo);
    const headEdgeMat = new THREE.LineBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.4 });
    const headEdges = new THREE.LineSegments(headEdgeGeo, headEdgeMat);
    this.headMesh.add(headEdges);

    // 2. Visor / Glass Screen (Front Face)
    const visorGeo = new THREE.PlaneGeometry(1.4, 1.0);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x090c15,
      roughness: 0.1,
      metalness: 0.9
    });
    this.visorMesh = new THREE.Mesh(visorGeo, visorMat);
    this.visorMesh.position.set(0, 0, 0.71);
    this.headMesh.add(this.visorMesh);

    // 3. Expressive LED Eyes (Canvas Texture)
    this.eyesCanvas = document.createElement('canvas');
    this.eyesCanvas.width = 256;
    this.eyesCanvas.height = 128;
    this.eyesCtx = this.eyesCanvas.getContext('2d');
    this.eyesTexture = new THREE.CanvasTexture(this.eyesCanvas);

    const eyesPlaneGeo = new THREE.PlaneGeometry(1.3, 0.65);
    const eyesPlaneMat = new THREE.MeshBasicMaterial({
      map: this.eyesTexture,
      transparent: true,
      blending: THREE.AdditiveBlending
    });
    this.eyesMesh = new THREE.Mesh(eyesPlaneGeo, eyesPlaneMat);
    this.eyesMesh.position.set(0, 0.05, 0.72);
    this.headMesh.add(this.eyesMesh);

    this.drawEyes();

    // 4. Antenna Rod & Glowing Beacon Bulb
    const antennaStemGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 12);
    const antennaStemMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8 });
    const stem = new THREE.Mesh(antennaStemGeo, antennaStemMat);
    stem.position.set(0, 0.95, 0);
    this.headMesh.add(stem);

    const beaconGeo = new THREE.SphereGeometry(0.18, 16, 16);
    this.beaconMat = new THREE.MeshStandardMaterial({
      color: 0xff7700,
      emissive: 0xff7700,
      emissiveIntensity: 0.9
    });
    this.beaconMesh = new THREE.Mesh(beaconGeo, this.beaconMat);
    this.beaconMesh.position.set(0, 1.3, 0);
    this.headMesh.add(this.beaconMesh);

    // 5. Cute Ear-Pads / Headphones
    const earGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
    const earMat = new THREE.MeshStandardMaterial({ color: 0xff7700, roughness: 0.4, metalness: 0.5 });

    const leftEar = new THREE.Mesh(earGeo, earMat);
    leftEar.rotation.z = Math.PI / 2;
    leftEar.position.set(-0.95, 0, 0);
    this.headMesh.add(leftEar);

    const rightEar = new THREE.Mesh(earGeo, earMat);
    rightEar.rotation.z = Math.PI / 2;
    rightEar.position.set(0.95, 0, 0);
    this.headMesh.add(rightEar);

    // 6. Floating Hover Thruster Ring (Underneath)
    const ringGeo = new THREE.TorusGeometry(0.65, 0.06, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });
    this.thrusterRing = new THREE.Mesh(ringGeo, ringMat);
    this.thrusterRing.rotation.x = Math.PI / 2;
    this.thrusterRing.position.set(0, -0.9, 0);
    this.mascotRoot.add(this.thrusterRing);
  }

  drawEyes() {
    const ctx = this.eyesCtx;
    if (!ctx) return;

    ctx.clearRect(0, 0, 256, 128);

    let eyeColor = '#00d2ff'; // Default vibrant cyan
    let glowColor = 'rgba(0, 210, 255, 0.4)';

    if (this.mood === 'thinking') {
      eyeColor = '#ff8800';
      glowColor = 'rgba(255, 136, 0, 0.5)';
    } else if (this.mood === 'happy') {
      eyeColor = '#10b981';
      glowColor = 'rgba(16, 185, 129, 0.5)';
    } else if (this.mood === 'concerned') {
      eyeColor = '#ef4444';
      glowColor = 'rgba(239, 68, 68, 0.5)';
    }

    ctx.fillStyle = eyeColor;
    ctx.strokeStyle = eyeColor;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';

    const leftCenter = { x: 74, y: 64 };
    const rightCenter = { x: 182, y: 64 };

    if (this.isBlinking) {
      // Blinking: narrow horizontal slits
      ctx.beginPath();
      ctx.moveTo(leftCenter.x - 24, leftCenter.y);
      ctx.lineTo(leftCenter.x + 24, leftCenter.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rightCenter.x - 24, rightCenter.y);
      ctx.lineTo(rightCenter.x + 24, rightCenter.y);
      ctx.stroke();
    } else if (this.mood === 'happy') {
      // Happy: Joyful curved arches ^ ^
      ctx.beginPath();
      ctx.arc(leftCenter.x, leftCenter.y + 12, 24, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(rightCenter.x, rightCenter.y + 12, 24, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();

      // Cheerful pink cheeks
      ctx.fillStyle = 'rgba(255, 105, 180, 0.6)';
      ctx.beginPath();
      ctx.arc(leftCenter.x - 15, leftCenter.y + 36, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(rightCenter.x + 15, rightCenter.y + 36, 12, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.mood === 'thinking') {
      // Thinking: rotating animated concentric rings / pulse
      const now = performance.now() * 0.005;
      [leftCenter, rightCenter].forEach(c => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 22, now, now + Math.PI * 1.4);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(c.x, c.y, 10, -now, -now + Math.PI * 1.4);
        ctx.stroke();
      });
    } else if (this.mood === 'concerned') {
      // Concerned: tilted downward worried look o_o
      ctx.beginPath();
      ctx.arc(leftCenter.x, leftCenter.y, 20, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(rightCenter.x, rightCenter.y, 20, 0, Math.PI * 2);
      ctx.stroke();

      // Tilted worried eyebrows
      ctx.beginPath();
      ctx.moveTo(leftCenter.x - 26, leftCenter.y - 32);
      ctx.lineTo(leftCenter.x + 22, leftCenter.y - 20);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rightCenter.x - 22, rightCenter.y - 20);
      ctx.lineTo(rightCenter.x + 26, rightCenter.y - 32);
      ctx.stroke();
    } else {
      // Default idle: friendly rounded glowing ovals with little reflections
      [leftCenter, rightCenter].forEach(c => {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 22, 28, 0, 0, Math.PI * 2);
        ctx.fill();

        // White reflection highlight
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(c.x + 7, c.y - 9, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = eyeColor;
      });
    }

    if (this.eyesTexture) {
      this.eyesTexture.needsUpdate = true;
    }
  }

  setMood(mood) {
    if (this.mood === mood) return;
    this.mood = mood;

    if (this.beaconMat) {
      if (mood === 'thinking') {
        this.beaconMat.color.setHex(0xff7700);
        this.beaconMat.emissive.setHex(0xff7700);
      } else if (mood === 'happy') {
        this.beaconMat.color.setHex(0x10b981);
        this.beaconMat.emissive.setHex(0x10b981);
      } else if (mood === 'concerned') {
        this.beaconMat.color.setHex(0xef4444);
        this.beaconMat.emissive.setHex(0xef4444);
      } else {
        this.beaconMat.color.setHex(0x00d2ff);
        this.beaconMat.emissive.setHex(0x00d2ff);
      }
    }

    this.drawEyes();
  }

  setupTracking() {
    window.addEventListener('pointermove', (e) => {
      // Calculate normalized mouse coords relative to window center
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = -(e.clientY / window.innerHeight) * 2 + 1;

      // Limit max turn angle for cute subtle head-turn
      this.targetRotation.y = nx * 0.45;
      this.targetRotation.x = -ny * 0.35;
    });
  }

  setupVisibility() {
    document.addEventListener('visibilitychange', () => {
      this.isTabVisible = !document.hidden;
    });
  }

  startLoop() {
    let lastTime = performance.now();

    const loop = (now) => {
      this.animationFrameId = requestAnimationFrame(loop);
      if (!this.isTabVisible) return;

      const delta = (now - lastTime) / 1000;
      lastTime = now;
      const time = now * 0.001;

      // 1. Smooth head rotation towards target mouse
      this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * 0.08;
      this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * 0.08;

      if (this.headMesh) {
        this.headMesh.rotation.x = this.currentRotation.x;
        this.headMesh.rotation.y = this.currentRotation.y;

        // Joyful head tilt when happy
        if (this.mood === 'happy') {
          this.headMesh.rotation.z = Math.sin(time * 4) * 0.12;
        } else {
          this.headMesh.rotation.z = 0;
        }
      }

      // 2. Floating hovering bob
      if (this.mascotRoot) {
        this.mascotRoot.position.y = Math.sin(time * 2.4) * 0.12;
      }

      // 3. Thruster ring spin & pulse
      if (this.thrusterRing) {
        this.thrusterRing.rotation.z += 0.03;
        const pulse = 0.65 + Math.sin(time * 6) * 0.15;
        this.thrusterRing.material.opacity = pulse;
      }

      // 4. Antenna beacon glow pulse
      if (this.beaconMat) {
        const pulseSpeed = this.mood === 'thinking' ? 12 : 3;
        this.beaconMat.emissiveIntensity = 0.5 + Math.sin(time * pulseSpeed) * 0.45;
      }

      // 5. Blinking logic (every 3-5 seconds)
      this.blinkTimer += delta;
      if (!this.isBlinking && this.blinkTimer >= this.nextBlinkTime) {
        this.isBlinking = true;
        this.blinkTimer = 0;
        this.drawEyes();
        setTimeout(() => {
          this.isBlinking = false;
          this.nextBlinkTime = 2.5 + Math.random() * 3.5;
          this.drawEyes();
        }, 140);
      }

      // If thinking, redraw eyes for ring spin animation
      if (this.mood === 'thinking') {
        this.drawEyes();
      }

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  // ==========================================
  // SPEECH BUBBLE & AI PERSONALITY MESSAGES
  // ==========================================

  say(text, options = {}) {
    if (!this.bubbleContainer) return;
    const {
      duration = 0,
      mood = 'idle',
      actionBtn = null,
      customHtml = null,
      onAction = null
    } = options;

    this.setMood(mood);

    // Cancel existing timeout/countdown
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    let html = `
      <div class="tokie-bubble-content">
        <div class="tokie-avatar-badge">🤖 Tokie</div>
        <p class="tokie-text">${text}</p>
        ${customHtml || ''}
        ${actionBtn ? `<button class="tokie-action-btn" id="tokie-action-btn">${actionBtn}</button>` : ''}
      </div>
    `;

    this.bubbleContainer.innerHTML = html;
    this.bubbleContainer.classList.add('visible');

    if (actionBtn && onAction) {
      const btn = this.bubbleContainer.querySelector('#tokie-action-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          onAction();
        });
      }
    }

    if (duration > 0) {
      this.dismissTimer = setTimeout(() => {
        this.hideBubble();
      }, duration);
    }
  }

  hideBubble() {
    if (this.bubbleContainer) {
      this.bubbleContainer.classList.remove('visible');
    }
    this.setMood('idle');
  }

  /**
   * Explains post-generation speed and tokens in beginner-friendly terms
   */
  explainResponse({ promptTokens, completionTokens, totalTokens, durationSec, tokensPerSec, ttftMs }) {
    const isUltraFast = parseFloat(tokensPerSec) > 100;
    const speedComment = isUltraFast
      ? `That was screaming fast on Groq (${tokensPerSec} tokens/sec)!`
      : `Generated at ${tokensPerSec} tokens/sec.`;

    const text = `✨ Done! We used <strong>${completionTokens} output tokens</strong> (plus ${promptTokens} input tokens = ${totalTokens} total) in <strong>${durationSec}s</strong>. ${speedComment} TTFT was ${ttftMs}ms.`;
    this.say(text, { mood: 'happy', duration: 8000 });
  }

  /**
   * Offers dynamic prompt improvement tips
   */
  suggestPromptTip(tipText) {
    if (this.mood === 'thinking') return;
    this.say(tipText, { mood: 'idle', duration: 7000 });
  }

  /**
   * Friendly error presentation
   */
  showError(errorObj, { onRetry = null, onOpenKey = null } = {}) {
    this.setMood('concerned');

    if (errorObj.status === 401 || errorObj.type === 'auth_error' || errorObj.type === 'missing_key') {
      this.say(
        `🔑 <strong>Key issue:</strong> ${errorObj.message}`,
        {
          mood: 'concerned',
          actionBtn: 'Focus API Key Input',
          onAction: () => {
            if (onOpenKey) onOpenKey();
          }
        }
      );
      return;
    }

    if (errorObj.status === 429 || errorObj.type === 'rate_limit') {
      let secondsLeft = errorObj.resetSeconds || 10;
      const renderCountdown = () => {
        const customHtml = `
          <div class="tokie-countdown-bar-wrap">
            <div class="tokie-countdown-timer">Resuming in: <strong id="tokie-cd-num">${secondsLeft}s</strong></div>
            <div class="tokie-countdown-bar" style="width: ${(secondsLeft / (errorObj.resetSeconds || 10)) * 100}%"></div>
          </div>
        `;
        this.say(
          `⏳ <strong>Free-tier breather!</strong> We reached the Groq token/minute rate limit. Tokens refill every 60s!`,
          {
            mood: 'concerned',
            customHtml,
            actionBtn: 'Try Now',
            onAction: () => {
              clearInterval(this.countdownInterval);
              if (onRetry) onRetry();
            }
          }
        );
      };

      renderCountdown();
      this.countdownInterval = setInterval(() => {
        secondsLeft--;
        const numEl = document.getElementById('tokie-cd-num');
        if (numEl) numEl.textContent = `${secondsLeft}s`;
        if (secondsLeft <= 0) {
          clearInterval(this.countdownInterval);
          this.say('✅ Rate limit window refreshed! Ready to run your prompt!', { mood: 'happy', duration: 5000 });
          if (onRetry) onRetry();
        }
      }, 1000);
      return;
    }

    // Network / generic error
    this.say(
      `📡 <strong>Notice:</strong> ${errorObj.message}`,
      {
        mood: 'concerned',
        actionBtn: 'Retry Generation',
        onAction: () => {
          if (onRetry) onRetry();
        }
      }
    );
  }

  // ==========================================
  // 4-STEP GUIDED TOUR
  // ==========================================

  startTour() {
    this.tourActive = true;
    this.tourStep = 1;
    this.renderTourStep();
  }

  renderTourStep() {
    const steps = [
      {
        title: 'Step 1/4: Groq API Key',
        body: 'Paste your free Groq API key in the left sidebar. It goes directly from your browser to Groq — never stored on any third-party server!',
        highlight: '#api-key-input',
        nextText: 'Next: Prompts ➔'
      },
      {
        title: 'Step 2/4: Smart Prompting',
        body: 'Type in the prompt box or try 1-click example chips (few-shot, chain-of-thought, role prompt). Notice how the live analyzer updates as you type!',
        highlight: '#prompt-input',
        nextText: 'Next: Settings ➔'
      },
      {
        title: 'Step 3/4: Playground Settings',
        body: 'Adjust Temperature to control creativity (0 = strictly deterministic, 2 = wild) and Max Tokens. Watch the 3D Temperature Sphere react live!',
        highlight: '#temp-slider',
        nextText: 'Next: 3D Views ➔'
      },
      {
        title: 'Step 4/4: 3D Visualizer',
        body: 'Click through 3D tabs (Token Stream, Context Tower, Quota Gauge, Temperature Cloud). Drag with your mouse to orbit, rotate and inspect tokens flying in 3D!',
        highlight: '#canvas-3d-container',
        nextText: "Let's Go! 🚀"
      }
    ];

    const current = steps[this.tourStep - 1];
    if (!current) {
      this.endTour();
      return;
    }

    // Highlight target element if present
    document.querySelectorAll('.tour-highlight-glow').forEach(el => el.classList.remove('tour-highlight-glow'));
    const targetEl = document.querySelector(current.highlight);
    if (targetEl) {
      targetEl.classList.add('tour-highlight-glow');
    }

    const customHtml = `
      <div class="tokie-tour-step">
        <span class="tokie-tour-step-badge">${current.title}</span>
        <div class="tokie-tour-nav">
          ${this.tourStep > 1 ? `<button class="tokie-tour-btn secondary" id="tokie-tour-back">Back</button>` : ''}
          <button class="tokie-tour-btn primary" id="tokie-tour-next">${current.nextText}</button>
          <button class="tokie-tour-skip" id="tokie-tour-skip">Skip tour</button>
        </div>
      </div>
    `;

    this.say(current.body, {
      mood: 'happy',
      customHtml
    });

    // Attach tour button listeners
    const nextBtn = document.getElementById('tokie-tour-next');
    const backBtn = document.getElementById('tokie-tour-back');
    const skipBtn = document.getElementById('tokie-tour-skip');

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.tourStep < steps.length) {
          this.tourStep++;
          this.renderTourStep();
        } else {
          this.endTour();
        }
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (this.tourStep > 1) {
          this.tourStep--;
          this.renderTourStep();
        }
      });
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        this.endTour();
      });
    }
  }

  endTour() {
    this.tourActive = false;
    document.querySelectorAll('.tour-highlight-glow').forEach(el => el.classList.remove('tour-highlight-glow'));
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('tokie_tour_completed', 'true');
    }
    this.say("🎉 You're all set! Have fun exploring the 3D playground. Click me anytime if you need help!", {
      mood: 'happy',
      duration: 5000
    });
  }
}

