/**
 * ui.js - Main Application Orchestrator for LLM Playground 3D
 * 
 * Manages:
 * - Event binding & UI state
 * - Streaming chat interaction via Groq API
 * - Real-time prompt analysis & badge updates
 * - 3D scene & Tokie mascot coordination
 * - View code modal generation & copying
 * - Beginner-friendly tooltips & error flows
 */

import { groqClient, FALLBACK_MODELS } from './api.js';
import { analyzePrompt } from './analyzer.js';
import { Scene3DManager } from './scene3d.js';
import { TokieMascot } from './mascot.js';
import { marked } from 'marked';

class PlaygroundApp {
  constructor() {
    this.conversation = []; // [{role: 'user', content: '...'}, {role: 'assistant', content: '...'}]
    this.currentModel = 'llama-3.3-70b-versatile';
    this.currentModelContext = 128000;
    this.isGenerating = false;
    this.activeCodeLang = 'curl';

    this.initElements();
    this.init3D();
    this.bindEvents();
    this.initKeyAndModels();
    this.updatePromptAnalysis('');
  }

  initElements() {
    // Header
    this.modelSelect = document.getElementById('model-select');
    this.statusBadge = document.getElementById('status-badge');
    this.viewCodeBtn = document.getElementById('view-code-btn');
    this.helpTourBtn = document.getElementById('help-tour-btn');

    // Sidebar
    this.apiKeyInput = document.getElementById('api-key-input');
    this.toggleKeyVisibilityBtn = document.getElementById('toggle-key-visibility');
    this.rememberKeyCheckbox = document.getElementById('remember-key-checkbox');
    this.clearKeyBtn = document.getElementById('clear-key-btn');

    this.tempSlider = document.getElementById('temp-slider');
    this.tempNumInput = document.getElementById('temp-num-input');
    this.maxTokensSlider = document.getElementById('max-tokens-slider');
    this.maxTokensNumInput = document.getElementById('max-tokens-num-input');
    this.stopSeqInput = document.getElementById('stop-seq-input');
    this.webSearchRow = document.getElementById('web-search-row');
    this.webSearchToggle = document.getElementById('web-search-toggle');
    this.webSearchSub = document.getElementById('web-search-sub');
    this.reasoningRow = document.getElementById('reasoning-row');
    this.reasoningToggle = document.getElementById('reasoning-toggle');
    this.reasoningSub = document.getElementById('reasoning-sub');
    this.systemPromptInput = document.getElementById('system-prompt-input');
    this.resetChatBtn = document.getElementById('reset-chat-btn');

    // 3D Visualizer & Tabs
    this.canvas3dContainer = document.getElementById('canvas-3d-container');
    this.viewBadgeTitle = document.getElementById('view-badge-title');
    this.viewBadgeDesc = document.getElementById('view-badge-desc');
    this.tabButtons = document.querySelectorAll('.tab-btn');
    this.reduce3dCheckbox = document.getElementById('reduce-3d-checkbox');

    // Dashboard Metrics
    this.metricTtft = document.getElementById('metric-ttft');
    this.metricSpeed = document.getElementById('metric-speed');
    this.metricDuration = document.getElementById('metric-duration');
    this.metricTokens = document.getElementById('metric-tokens');
    this.metricReasoningCaption = document.getElementById('metric-reasoning-caption');
    this.metricQuota = document.getElementById('metric-quota');
    this.metricResetCaption = document.getElementById('metric-reset-caption');

    // Chat Console & Analyzer
    this.chatHistoryContainer = document.getElementById('chat-history-container');
    this.chatPlaceholder = document.getElementById('chat-placeholder');
    this.multiturnNotice = document.getElementById('multiturn-notice');

    this.analyzerShotBadge = document.getElementById('analyzer-shot-badge');
    this.tagCot = document.getElementById('tag-cot');
    this.tagRole = document.getElementById('tag-role');
    this.tagNeg = document.getElementById('tag-neg');
    this.tagFormat = document.getElementById('tag-format');
    this.analyzerEvidence = document.getElementById('analyzer-evidence');
    this.analyzerTip = document.getElementById('analyzer-tip');

    this.exampleChips = document.querySelectorAll('.chip-btn');
    this.promptInput = document.getElementById('prompt-input');
    this.submitPromptBtn = document.getElementById('submit-prompt-btn');
    this.stopGenerationBtn = document.getElementById('stop-generation-btn');

    // Tokie Mascot
    this.tokieCanvasWrap = document.getElementById('tokie-canvas-wrap');
    this.tokieSpeechBubble = document.getElementById('tokie-speech-bubble');

    // Code Modal
    this.codeModal = document.getElementById('code-modal');
    this.modalCloseBtn = document.getElementById('modal-close-btn');
    this.codeTabButtons = document.querySelectorAll('.code-tab-btn');
    this.copyCodeBtn = document.getElementById('copy-code-btn');
    this.copyBtnText = document.getElementById('copy-btn-text');
    this.codeSnippetBody = document.getElementById('code-snippet-body');
  }

  init3D() {
    try {
      this.sceneManager = new Scene3DManager(this.canvas3dContainer);
    } catch (err) {
      console.warn('3D SceneManager initialization warning:', err);
    }

    try {
      this.tokie = new TokieMascot(this.tokieCanvasWrap, this.tokieSpeechBubble);
    } catch (err) {
      console.warn('Tokie Mascot initialization warning:', err);
    }
  }

  initKeyAndModels() {
    // Restore saved key from sessionStorage if present
    if (groqClient.apiKey) {
      this.apiKeyInput.value = groqClient.apiKey;
      this.updateStatusBadge(true);
      this.fetchModels();
    } else {
      this.updateStatusBadge(false);
    }
  }

  updateStatusBadge(hasKey) {
    if (hasKey) {
      this.statusBadge.className = 'status-badge badge-green';
      this.statusBadge.innerHTML = `<span class="status-dot"></span><span class="status-text">LIVE - real API calls</span>`;
    } else {
      this.statusBadge.className = 'status-badge badge-amber';
      this.statusBadge.innerHTML = `<span class="status-dot"></span><span class="status-text">Add a key to start</span>`;
    }
  }

  async fetchModels() {
    const models = await groqClient.fetchLiveModels();
    this.modelSelect.innerHTML = '';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} (${Math.round((m.context || 128000) / 1000)}k)`;
      if (m.id === this.currentModel) opt.selected = true;
      this.modelSelect.appendChild(opt);
    });

    this.onModelChange();
  }

  onModelChange() {
    this.currentModel = this.modelSelect.value;
    const isReasoningModel = this.currentModel.includes('r1') || this.currentModel.includes('reasoning') || this.currentModel.includes('deepseek');
    
    if (isReasoningModel) {
      this.reasoningToggle.disabled = false;
      this.reasoningToggle.checked = true;
      if (this.reasoningRow) this.reasoningRow.classList.remove('disabled');
      if (this.reasoningSub) this.reasoningSub.textContent = 'Active on this model (includes thinking tokens)';
    } else {
      this.reasoningToggle.disabled = true;
      this.reasoningToggle.checked = false;
      if (this.reasoningRow) this.reasoningRow.classList.add('disabled');
      if (this.reasoningSub) this.reasoningSub.textContent = 'Disabled on this model (reasoning unsupported)';
    }

    const isWebSearchModel = this.currentModel.includes('compound') || this.currentModel.includes('perplexity') || this.currentModel.includes('search');
    if (isWebSearchModel) {
      this.webSearchToggle.disabled = false;
      if (this.webSearchRow) this.webSearchRow.classList.remove('disabled');
      if (this.webSearchSub) this.webSearchSub.textContent = 'Active on this model (web search supported)';
    } else {
      this.webSearchToggle.disabled = true;
      this.webSearchToggle.checked = false;
      if (this.webSearchRow) this.webSearchRow.classList.add('disabled');
      if (this.webSearchSub) this.webSearchSub.textContent = 'Disabled on this model (only compound models support web)';
    }

    if (this.sceneManager) {
      this.sceneManager.setContextHistory(this.getFullMessagePayload(), this.currentModelContext);
    }
  }

  bindEvents() {
    // 1. Model select
    this.modelSelect.addEventListener('change', () => this.onModelChange());

    // 2. API Key actions
    this.apiKeyInput.addEventListener('input', () => {
      const val = this.apiKeyInput.value.trim();
      const remember = this.rememberKeyCheckbox.checked;
      groqClient.setApiKey(val, remember);
      const isValid = groqClient.hasApiKey();
      this.updateStatusBadge(isValid);
      if (isValid) {
        this.fetchModels();
        if (this.tokie) {
          this.tokie.say('🔑 Key recognized! Model list refreshed. Ready to prompt!', { mood: 'happy', duration: 4000 });
        }
      }
    });

    this.toggleKeyVisibilityBtn.addEventListener('click', () => {
      if (this.apiKeyInput.type === 'password') {
        this.apiKeyInput.type = 'text';
        this.toggleKeyVisibilityBtn.textContent = '🔒';
      } else {
        this.apiKeyInput.type = 'password';
        this.toggleKeyVisibilityBtn.textContent = '👁️';
      }
    });

    this.clearKeyBtn.addEventListener('click', () => {
      this.apiKeyInput.value = '';
      groqClient.clearApiKey();
      this.updateStatusBadge(false);
      if (this.tokie) {
        this.tokie.say('Key cleared from this session.', { mood: 'idle', duration: 3000 });
      }
    });

    // 3. Temperature controls (synchronized)
    this.tempSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value).toFixed(2);
      this.tempNumInput.value = val;
      if (this.sceneManager) this.sceneManager.setTemperature(val);
    });

    this.tempNumInput.addEventListener('input', (e) => {
      let val = Math.max(0, Math.min(2, parseFloat(e.target.value) || 0));
      this.tempSlider.value = val;
      if (this.sceneManager) this.sceneManager.setTemperature(val);
    });

    // 4. Max tokens controls (synchronized)
    this.maxTokensSlider.addEventListener('input', (e) => {
      this.maxTokensNumInput.value = e.target.value;
    });

    this.maxTokensNumInput.addEventListener('input', (e) => {
      let val = Math.max(16, Math.min(8192, parseInt(e.target.value, 10) || 1024));
      this.maxTokensSlider.value = val;
    });

    // 5. Reset conversation
    this.resetChatBtn.addEventListener('click', () => this.resetConversation());

    // 6. 3D View tabs
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.tabButtons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        const view = btn.dataset.view;
        this.switchVisualizerView(view);
      });
    });

    // 7. Reduce 3D effects checkbox
    this.reduce3dCheckbox.addEventListener('change', (e) => {
      if (this.sceneManager) this.sceneManager.setReducedMotion(e.target.checked);
    });

    // 8. Prompt analysis on input
    this.promptInput.addEventListener('input', () => {
      this.updatePromptAnalysis(this.promptInput.value);
    });

    // 9. Example preset chips
    this.exampleChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.loadExamplePreset(chip.dataset.preset);
      });
    });

    // 10. Submit & Stop buttons
    this.submitPromptBtn.addEventListener('click', () => this.submitPrompt());
    this.stopGenerationBtn.addEventListener('click', () => this.stopGeneration());

    // 11. Keyboard shortcuts: Ctrl/Cmd + Enter to submit, Esc to stop
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (!this.isGenerating && this.promptInput.value.trim()) {
          e.preventDefault();
          this.submitPrompt();
        }
      } else if (e.key === 'Escape') {
        if (this.isGenerating) {
          e.preventDefault();
          this.stopGeneration();
        } else if (this.codeModal.style.display !== 'none') {
          this.closeCodeModal();
        }
      }
    });

    // 12. Tokie Mascot interactions
    this.tokieCanvasWrap.addEventListener('click', () => {
      if (this.tokie) {
        if (!this.tokie.tourActive) {
          this.tokie.suggestPromptTip(this.analyzerTip.textContent);
        }
      }
    });

    this.helpTourBtn.addEventListener('click', () => {
      if (this.tokie) this.tokie.startTour();
    });

    // 13. View Code Modal
    this.viewCodeBtn.addEventListener('click', () => this.openCodeModal());
    this.modalCloseBtn.addEventListener('click', () => this.closeCodeModal());
    this.codeModal.addEventListener('click', (e) => {
      if (e.target === this.codeModal) this.closeCodeModal();
    });

    this.codeTabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.codeTabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeCodeLang = btn.dataset.lang;
        this.renderCodeSnippet();
      });
    });

    this.copyCodeBtn.addEventListener('click', () => this.copyCodeSnippet());
  }

  switchVisualizerView(view) {
    if (!this.sceneManager) return;
    this.sceneManager.switchView(view);

    const descriptions = {
      stream: {
        title: '3D TOKEN STREAM',
        desc: 'Watch incoming tokens fly in 3D into the response portal. Colored by word, number & punctuation!'
      },
      context: {
        title: '3D CONTEXT WINDOW TOWER',
        desc: 'Translucent stacked blocks of conversation history. Turns red warning glow as tokens approach the model limit!'
      },
      quota: {
        title: '3D RATE-LIMIT GAUGE',
        desc: 'Holographic gyroscope gauge that drains as tokens/min are consumed and refills over time.'
      },
      temperature: {
        title: '3D TEMPERATURE SPHERE',
        desc: 'Dynamic particle cloud: orderly & tightly packed at T=0, swirling & chaotic at T=2. Drag the slider to test!'
      }
    };

    const current = descriptions[view] || descriptions.stream;
    this.viewBadgeTitle.textContent = current.title;
    this.viewBadgeDesc.textContent = current.desc;
  }

  updatePromptAnalysis(text) {
    const analysis = analyzePrompt(text);

    // Shot Badge
    this.analyzerShotBadge.textContent = analysis.badgeText;
    this.analyzerShotBadge.className = `analyzer-badge ${analysis.badgeClass}`;

    // Criteria Tags
    this.updateTag(this.tagCot, analysis.chainOfThought.detected, 'CoT', analysis.chainOfThought.evidence);
    this.updateTag(this.tagRole, analysis.rolePrompting.detected, 'Role', analysis.rolePrompting.evidence);
    this.updateTag(this.tagNeg, analysis.negativeConstraints.detected, 'Negative', analysis.negativeConstraints.evidence);
    this.updateTag(this.tagFormat, analysis.formatConstraints.detected, 'Format', analysis.formatConstraints.evidence);

    // Evidence String
    const evidenceList = [];
    if (analysis.examplesEvidence.length > 0) {
      evidenceList.push(`Examples: [${analysis.examplesEvidence.slice(0, 2).join('; ')}]`);
    }
    if (analysis.rolePrompting.evidence) evidenceList.push(`Role: ${analysis.rolePrompting.evidence}`);
    if (analysis.chainOfThought.evidence) evidenceList.push(`CoT: ${analysis.chainOfThought.evidence}`);
    if (analysis.negativeConstraints.evidence) evidenceList.push(`Neg: ${analysis.negativeConstraints.evidence}`);
    if (analysis.formatConstraints.evidence) evidenceList.push(`Format: ${analysis.formatConstraints.evidence}`);

    this.analyzerEvidence.textContent = evidenceList.join(' | ');
    this.analyzerTip.textContent = analysis.tip;
  }

  updateTag(el, detected, label, evidence) {
    if (detected) {
      el.className = 'analyzer-tag detected';
      el.textContent = `✓ ${label}`;
      el.title = `Detected: ${evidence || label}`;
    } else {
      el.className = 'analyzer-tag';
      el.textContent = `✗ ${label}`;
      el.title = `Not detected in prompt`;
    }
  }

  loadExamplePreset(preset) {
    const presets = {
      'few-shot': `Review: The battery life lasts two full days and screen is gorgeous!
Sentiment: Positive

Review: Arrived broken and customer service refused to refund me.
Sentiment: Negative

Review: Great build quality, although the charging cable is a bit short.
Sentiment:`,

      'cot': `A bakery sells boxes of donuts. A small box holds 6 donuts and costs $8. A large box holds 12 donuts and costs $14.
If I need to buy exactly 30 donuts for a team party, what is the cheapest possible combination of boxes to buy?
Think step by step and explain your reasoning clearly before stating the final total cost.`,

      'role': `Act as a salty 17th-century pirate captain who is also a world-class theoretical physicist. 
Explain quantum entanglement to your crew in 3 humorous paragraphs using ship metaphors!`,

      'json': `Analyze the top 3 strengths and weaknesses of Electric Vehicles (EV) vs Hydrogen Fuel Cell Vehicles.
Respond strictly in JSON format matching this schema:
{
  "comparison": [
    { "tech": string, "strengths": string[], "weaknesses": string[] }
  ],
  "recommendation": string
}
Do not include any introductory markdown or explanation outside the valid JSON object.`
    };

    const text = presets[preset];
    if (text) {
      this.promptInput.value = text;
      this.promptInput.focus();
      this.updatePromptAnalysis(text);
      if (this.tokie) {
        this.tokie.say(`Loaded the ${preset.toUpperCase()} preset! Notice the analyzer badge update!`, { mood: 'happy', duration: 4000 });
      }
    }
  }

  resetConversation() {
    this.conversation = [];
    this.chatHistoryContainer.innerHTML = '';
    this.chatHistoryContainer.appendChild(this.chatPlaceholder);
    this.chatPlaceholder.style.display = 'block';
    this.multiturnNotice.style.display = 'none';

    // Reset dashboard numbers
    this.metricTtft.innerHTML = `0 <span class="metric-unit">ms</span>`;
    this.metricSpeed.innerHTML = `0.0 <span class="metric-unit">t/s</span>`;
    this.metricDuration.innerHTML = `0.0 <span class="metric-unit">s</span>`;
    this.metricTokens.textContent = '0 / 0 / 0';
    this.metricReasoningCaption.textContent = 'Reasoning: 0 tokens';

    if (this.sceneManager) {
      this.sceneManager.setContextHistory([], this.currentModelContext);
    }
    if (this.tokie) {
      this.tokie.say('Conversation reset! Clean slate for our next test.', { mood: 'idle', duration: 3000 });
    }
  }

  getFullMessagePayload() {
    const payload = [];
    const sysPrompt = this.systemPromptInput.value.trim();
    if (sysPrompt) {
      payload.push({ role: 'system', content: sysPrompt });
    }
    this.conversation.forEach(msg => {
      payload.push({ role: msg.role, content: msg.content });
    });
    return payload;
  }

  async submitPrompt() {
    if (this.isGenerating) return;

    const promptText = this.promptInput.value.trim();
    if (!promptText) {
      this.promptInput.focus();
      return;
    }

    if (!groqClient.hasApiKey()) {
      if (this.tokie) {
        this.tokie.showError({
          status: 401,
          type: 'missing_key',
          message: 'Please paste your Groq API key in the left sidebar to generate responses.'
        }, {
          onOpenKey: () => this.apiKeyInput.focus()
        });
      }
      this.apiKeyInput.focus();
      return;
    }

    // Hide placeholder
    this.chatPlaceholder.style.display = 'none';

    // Append user message
    this.appendMessage('user', promptText);
    this.conversation.push({ role: 'user', content: promptText });

    // Clear prompt input
    this.promptInput.value = '';
    this.updatePromptAnalysis('');

    // Prepare assistant message bubble
    const { bubbleEl, contentEl } = this.appendMessage('assistant', '');
    contentEl.innerHTML = '<span class="streaming-cursor">▍</span>';

    // Show multi-turn notice if more than 1 turn
    if (this.conversation.length > 2) {
      this.multiturnNotice.style.display = 'flex';
    }

    // UI State: Generating
    this.isGenerating = true;
    this.setButtonGenerating(true);
    if (this.tokie) this.tokie.setMood('thinking');

    // Parse stop sequences
    const stopRaw = this.stopSeqInput.value.trim();
    const stopSeqs = stopRaw ? stopRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

    const messages = this.getFullMessagePayload();
    let accumulatedContent = '';
    let accumulatedReasoning = '';

    await groqClient.streamChat({
      messages,
      model: this.currentModel,
      temperature: parseFloat(this.tempSlider.value) || 0.7,
      maxTokens: parseInt(this.maxTokensSlider.value, 10) || 1024,
      stop: stopSeqs,
      reasoning: this.reasoningToggle.checked,
      onFirstToken: (ttftMs) => {
        this.metricTtft.innerHTML = `${ttftMs} <span class="metric-unit">ms</span>`;
      },
      onToken: (tokenDelta, fullText, isReasoning) => {
        if (isReasoning) {
          accumulatedReasoning = fullText;
        } else {
          accumulatedContent = fullText;
        }

        // Render current text
        this.renderAssistantLiveStream(contentEl, accumulatedContent, accumulatedReasoning);

        // Feed 3D Stream View
        if (this.sceneManager) {
          this.sceneManager.addStreamToken(tokenDelta, isReasoning);
        }
      },
      onUsage: (usage, rateLimits) => {
        // Record assistant response
        this.conversation.push({ role: 'assistant', content: accumulatedContent });

        // Update Dashboard Metrics
        this.metricSpeed.innerHTML = `${usage.tokensPerSec} <span class="metric-unit">t/s</span>`;
        this.metricDuration.innerHTML = `${usage.durationSec} <span class="metric-unit">s</span>`;
        this.metricTokens.textContent = `${usage.promptTokens} / ${usage.completionTokens} / ${usage.totalTokens}`;
        this.metricReasoningCaption.textContent = `Reasoning: ${usage.reasoningTokens} tokens`;

        if (rateLimits && rateLimits.remainingTokens !== undefined) {
          this.metricQuota.textContent = Number(rateLimits.remainingTokens).toLocaleString();
          this.metricResetCaption.textContent = `Resets in ${rateLimits.resetTokens || '0s'}`;
        }

        // Final Markdown render for assistant bubble
        this.finalizeAssistantMessage(contentEl, accumulatedContent, accumulatedReasoning);

        // Update 3D Context Tower and Rate Gauge
        if (this.sceneManager) {
          this.sceneManager.setRateLimits(rateLimits);
          this.sceneManager.setContextHistory(this.getFullMessagePayload(), this.currentModelContext);
        }

        // Tokie explains the response
        if (this.tokie) {
          this.tokie.explainResponse(usage);
        }
      },
      onError: (friendlyErr) => {
        if (friendlyErr.status !== 0 || !friendlyErr.title.includes('Abort')) {
          contentEl.innerHTML = `<span style="color: var(--accent-danger);">⚠️ Generation stopped: ${friendlyErr.message}</span>`;
          if (this.tokie) {
            this.tokie.showError(friendlyErr, {
              onRetry: () => this.submitPrompt(),
              onOpenKey: () => this.apiKeyInput.focus()
            });
          }
        }
      }
    });

    this.isGenerating = false;
    this.setButtonGenerating(false);
  }

  stopGeneration() {
    if (this.isGenerating) {
      groqClient.abort();
      this.isGenerating = false;
      this.setButtonGenerating(false);
      if (this.tokie) {
        this.tokie.say('Generation stopped by Esc or Stop button.', { mood: 'idle', duration: 3000 });
      }
    }
  }

  setButtonGenerating(generating) {
    if (generating) {
      this.submitPromptBtn.style.display = 'none';
      this.stopGenerationBtn.style.display = 'inline-flex';
    } else {
      this.submitPromptBtn.style.display = 'inline-flex';
      this.stopGenerationBtn.style.display = 'none';
    }
  }

  appendMessage(role, content) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${role === 'user' ? 'user-msg' : 'assistant-msg'}`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = `message-avatar ${role === 'user' ? 'user-avatar' : 'assistant-avatar'}`;
    avatarDiv.textContent = role === 'user' ? '👤' : '⚡';

    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    if (role === 'user') {
      contentDiv.textContent = content;
    }

    bubbleDiv.appendChild(contentDiv);
    msgDiv.appendChild(avatarDiv);
    msgDiv.appendChild(bubbleDiv);

    this.chatHistoryContainer.appendChild(msgDiv);
    this.chatHistoryContainer.scrollTop = this.chatHistoryContainer.scrollHeight;

    return { bubbleEl: bubbleDiv, contentEl: contentDiv };
  }

  renderAssistantLiveStream(container, content, reasoning) {
    let html = '';
    if (reasoning) {
      html += `
        <div class="reasoning-box">
          <div class="reasoning-label">🧠 Reasoning / Thinking:</div>
          <div class="reasoning-body">${this.escapeHtml(reasoning)}</div>
        </div>
      `;
    }
    html += this.escapeHtml(content) + '<span class="streaming-cursor">▍</span>';
    container.innerHTML = html;
    this.chatHistoryContainer.scrollTop = this.chatHistoryContainer.scrollHeight;
  }

  finalizeAssistantMessage(container, content, reasoning) {
    let html = '';
    if (reasoning) {
      html += `
        <div class="reasoning-box">
          <div class="reasoning-label">🧠 Reasoning / Thinking:</div>
          <div class="reasoning-body">${this.escapeHtml(reasoning)}</div>
        </div>
      `;
    }

    // Parse Markdown if marked is available
    const markdownParser = (typeof marked !== 'undefined' && typeof marked.parse === 'function') 
      ? marked.parse 
      : (typeof window !== 'undefined' && window.marked && typeof window.marked.parse === 'function' ? window.marked.parse : null);

    if (markdownParser) {
      try {
        html += markdownParser(content);
      } catch (_) {
        html += `<pre style="white-space: pre-wrap;">${this.escapeHtml(content)}</pre>`;
      }
    } else {
      html += `<pre style="white-space: pre-wrap;">${this.escapeHtml(content)}</pre>`;
    }

    container.innerHTML = html;
    this.chatHistoryContainer.scrollTop = this.chatHistoryContainer.scrollHeight;
  }

  // ==========================================
  // "VIEW CODE" MODAL
  // ==========================================

  openCodeModal() {
    this.renderCodeSnippet();
    this.codeModal.style.display = 'flex';
  }

  closeCodeModal() {
    this.codeModal.style.display = 'none';
  }

  renderCodeSnippet() {
    const messages = this.getFullMessagePayload();
    if (messages.length === 0) {
      messages.push({ role: 'user', content: this.promptInput.value.trim() || 'Hello, world!' });
    }

    const stopRaw = this.stopSeqInput.value.trim();
    const stopSeqs = stopRaw ? stopRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

    const snippets = groqClient.generateCodeSnippets({
      messages,
      model: this.currentModel,
      temperature: parseFloat(this.tempSlider.value) || 0.7,
      maxTokens: parseInt(this.maxTokensSlider.value, 10) || 1024,
      stop: stopSeqs
    });

    this.codeSnippetBody.textContent = snippets[this.activeCodeLang] || snippets.curl;
    this.copyBtnText.textContent = '📋 Copy Code';
  }

  async copyCodeSnippet() {
    const code = this.codeSnippetBody.textContent;
    try {
      await navigator.clipboard.writeText(code);
      this.copyBtnText.textContent = '✓ Copied!';
      setTimeout(() => {
        this.copyBtnText.textContent = '📋 Copy Code';
      }, 2500);
    } catch (_) {
      this.copyBtnText.textContent = '✓ Selected';
    }
  }

  escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Initialize on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  window.app = new PlaygroundApp();
});

