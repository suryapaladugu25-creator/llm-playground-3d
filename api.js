/**
 * api.js - Groq API Client & Streaming Engine
 * 
 * Handles:
 * - Groq API communication with Server-Sent Events (SSE) streaming
 * - Key management (sessionStorage or in-memory)
 * - Rate-limit header parsing (x-ratelimit-*)
 * - Model list discovery (/models endpoint)
 * - Code generation for Curl, Python, and JavaScript Fetch
 * - Friendly error translation
 */

export const FALLBACK_MODELS = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', context: 128000, desc: 'Flagship open model, exceptional reasoning & coding' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', context: 128000, desc: 'Ultra-fast, budget friendly for quick tasks' },
  { id: 'openai/gpt-oss-20b', name: 'OpenAI GPT-OSS 20B', context: 8192, desc: 'Open architecture balanced performance' },
  { id: 'openai/gpt-oss-120b', name: 'OpenAI GPT-OSS 120B', context: 8192, desc: 'Heavyweight frontier open weights model' },
  { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B', context: 128000, desc: 'Advanced reasoning model with chain-of-thought tokens' },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B MoE', context: 32768, desc: 'Mixture-of-Experts high throughput' }
];

const STORAGE_KEY = 'groq_api_key_playground';

class GroqApiClient {
  constructor() {
    this.apiKey = typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem(STORAGE_KEY) || '') : '';
    this.currentAbortController = null;
    this.rateLimits = {
      remainingTokens: 30000,
      limitTokens: 30000,
      resetTokens: '0s',
      remainingRequests: 30,
      limitRequests: 30,
      resetRequests: '0s',
      lastUpdated: Date.now()
    };
  }

  setApiKey(key, rememberInSession = true) {
    this.apiKey = (key || '').trim();
    if (typeof sessionStorage !== 'undefined') {
      if (rememberInSession && this.apiKey) {
        sessionStorage.setItem(STORAGE_KEY, this.apiKey);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }

  clearApiKey() {
    this.apiKey = '';
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  hasApiKey() {
    return Boolean(this.apiKey && this.apiKey.startsWith('gsk_'));
  }

  getMaskedKey() {
    if (!this.apiKey) return '';
    if (this.apiKey.length <= 8) return '••••••••';
    return this.apiKey.substring(0, 4) + '••••' + this.apiKey.substring(this.apiKey.length - 4);
  }

  /**
   * Parse Groq reset time string (e.g. "12m34.5s", "4.2s", "150ms") into seconds
   */
  parseResetDuration(str) {
    if (!str) return 0;
    let totalSeconds = 0;
    const msMatch = str.match(/(\d+(?:\.\d+)?)ms/);
    const mMatch = str.match(/(\d+(?:\.\d+)?)m(?!s)/);
    const sMatch = str.match(/(\d+(?:\.\d+)?)s(?![a-z])/);

    if (mMatch) totalSeconds += parseFloat(mMatch[1]) * 60;
    if (msMatch) {
      totalSeconds += parseFloat(msMatch[1]) / 1000;
    } else if (sMatch) {
      totalSeconds += parseFloat(sMatch[1]);
    }
    
    if (totalSeconds === 0 && !isNaN(Number(str))) {
      totalSeconds = Number(str);
    }
    return totalSeconds;
  }

  /**
   * Extract rate-limit headers from Groq response
   */
  extractRateLimits(headers) {
    if (!headers) return;
    const remTokens = headers.get('x-ratelimit-remaining-tokens');
    const limTokens = headers.get('x-ratelimit-limit-tokens');
    const resTokens = headers.get('x-ratelimit-reset-tokens');
    const remReqs = headers.get('x-ratelimit-remaining-requests');
    const limReqs = headers.get('x-ratelimit-limit-requests');
    const resReqs = headers.get('x-ratelimit-reset-requests');

    if (remTokens !== null) this.rateLimits.remainingTokens = parseInt(remTokens, 10);
    if (limTokens !== null) this.rateLimits.limitTokens = parseInt(limTokens, 10);
    if (resTokens !== null) this.rateLimits.resetTokens = resTokens;
    if (remReqs !== null) this.rateLimits.remainingRequests = parseInt(remReqs, 10);
    if (limReqs !== null) this.rateLimits.limitRequests = parseInt(limReqs, 10);
    if (resReqs !== null) this.rateLimits.resetRequests = resReqs;
    this.rateLimits.lastUpdated = Date.now();

    return { ...this.rateLimits };
  }

  /**
   * Fetch available models from Groq
   */
  async fetchLiveModels() {
    if (!this.apiKey) {
      return FALLBACK_MODELS;
    }
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      if (!response.ok) {
        console.warn('Could not fetch live models, using fallback list');
        return FALLBACK_MODELS;
      }
      const data = await response.json();
      if (!data.data || !Array.isArray(data.data)) {
        return FALLBACK_MODELS;
      }

      // Filter and format models
      const activeModels = data.data
        .filter(m => m.active !== false && !m.id.includes('whisper'))
        .map(m => {
          const isReasoning = m.id.includes('r1') || m.id.includes('reasoning');
          return {
            id: m.id,
            name: m.id,
            context: m.context_window || 128000,
            desc: isReasoning ? 'Reasoning model with thinking tokens' : `Context: ${m.context_window || 128000} tokens`,
            isReasoning
          };
        });

      return activeModels.length > 0 ? activeModels : FALLBACK_MODELS;
    } catch (err) {
      console.warn('Network error fetching models:', err);
      return FALLBACK_MODELS;
    }
  }

  /**
   * Abort the active generation
   */
  abort() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
      return true;
    }
    return false;
  }

  /**
   * Send a streaming chat completion request
   * @param {Object} options
   * @param {Array} options.messages - [{role: 'user', content: '...'}]
   * @param {string} options.model - model id
   * @param {number} options.temperature - 0 to 2
   * @param {number} options.maxTokens - integer
   * @param {Array<string>} options.stop - array of stop sequences
   * @param {boolean} options.reasoning - whether reasoning is requested
   * @param {Function} onToken - callback(tokenText, fullText, isReasoning)
   * @param {Function} onFirstToken - callback(msToFirstToken)
   * @param {Function} onUsage - callback(usageObj, rateLimitsObj)
   * @param {Function} onError - callback(friendlyErrorObj)
   */
  async streamChat({
    messages,
    model = 'llama-3.3-70b-versatile',
    temperature = 0.7,
    maxTokens = 1024,
    stop = [],
    reasoning = false,
    onToken = () => {},
    onFirstToken = () => {},
    onUsage = () => {},
    onError = () => {}
  }) {
    if (!this.apiKey) {
      onError({
        type: 'missing_key',
        title: 'API Key Required',
        message: 'Please paste your Groq API key in the left sidebar to start generating.',
        status: 401
      });
      return;
    }

    this.abort();
    this.currentAbortController = new AbortController();

    const startTime = performance.now();
    let firstTokenReported = false;
    let fullOutput = '';
    let reasoningOutput = '';
    let totalOutputTokens = 0;
    let finalUsage = null;

    const payload = {
      model,
      messages,
      temperature: Number(temperature),
      max_tokens: Number(maxTokens),
      stream: true,
      stream_options: { include_usage: true }
    };

    if (stop && stop.length > 0) {
      payload.stop = stop.slice(0, 4);
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload),
        signal: this.currentAbortController.signal
      });

      // Extract and update rate limits
      const currentRateLimits = this.extractRateLimits(response.headers);

      if (!response.ok) {
        let errJson = {};
        try {
          errJson = await response.json();
        } catch (_) {}

        const friendlyError = this.translateError(response.status, errJson, currentRateLimits);
        onError(friendlyError);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const dataContent = trimmed.slice(6);
          if (dataContent === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataContent);

            // Handle usage if present in chunk
            if (parsed.usage) {
              finalUsage = parsed.usage;
            }

            const choice = parsed.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;
            if (!delta) continue;

            // Handle reasoning delta if present (DeepSeek-R1 / thinking models)
            if (delta.reasoning) {
              if (!firstTokenReported) {
                firstTokenReported = true;
                onFirstToken(Math.round(performance.now() - startTime));
              }
              reasoningOutput += delta.reasoning;
              totalOutputTokens++;
              onToken(delta.reasoning, reasoningOutput, true);
            }

            if (delta.content) {
              if (!firstTokenReported) {
                firstTokenReported = true;
                onFirstToken(Math.round(performance.now() - startTime));
              }
              fullOutput += delta.content;
              totalOutputTokens++;
              onToken(delta.content, fullOutput, false);
            }
          } catch (e) {
            // Ignore partial SSE line parsing errors
          }
        }
      }

      const totalTimeMs = performance.now() - startTime;
      const totalSeconds = totalTimeMs / 1000;
      const tokensPerSec = totalSeconds > 0 ? (totalOutputTokens / totalSeconds).toFixed(1) : '0';

      // If usage wasn't emitted directly in SSE, estimate tokens
      const promptChars = messages.reduce((acc, m) => acc + (m.content || '').length, 0);
      const estPromptTokens = Math.max(1, Math.round(promptChars / 4));

      const usageResult = {
        promptTokens: finalUsage?.prompt_tokens ?? estPromptTokens,
        completionTokens: finalUsage?.completion_tokens ?? totalOutputTokens,
        totalTokens: finalUsage?.total_tokens ?? (estPromptTokens + totalOutputTokens),
        reasoningTokens: finalUsage?.completion_tokens_details?.reasoning_tokens ?? (reasoningOutput ? Math.round(reasoningOutput.length / 4) : 0),
        durationSec: totalSeconds.toFixed(2),
        tokensPerSec: tokensPerSec,
        ttftMs: firstTokenReported ? Math.round(performance.now() - startTime) : 0
      };

      onUsage(usageResult, this.rateLimits);
    } catch (err) {
      if (err.name === 'AbortError') {
        // Generation stopped by user
        return;
      }
      onError(this.translateError(0, { error: { message: err.message } }, this.rateLimits));
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Convert raw API errors to friendly beginner-friendly messages
   */
  translateError(status, rawError, rateLimits) {
    const rawMsg = rawError?.error?.message || '';

    if (status === 401) {
      return {
        type: 'auth_error',
        status: 401,
        title: 'API Key Not Recognized',
        message: 'Hmm, that Groq key doesn\'t look right. Keys typically start with "gsk_". Want to double-check it at console.groq.com?',
        action: 'check_key'
      };
    }

    if (status === 429) {
      const resetSec = this.parseResetDuration(rateLimits?.resetTokens || '10s');
      return {
        type: 'rate_limit',
        status: 429,
        title: 'Rate Limit Reached',
        message: `We hit the free-tier rate limit! Let's take a quick breather. Free quota will reset soon.`,
        resetSeconds: Math.max(3, Math.round(resetSec)),
        action: 'countdown'
      };
    }

    if (status === 400) {
      if (rawMsg.toLowerCase().includes('context') || rawMsg.toLowerCase().includes('too long')) {
        return {
          type: 'context_limit',
          status: 400,
          title: 'Context Window Full',
          message: 'The conversation history is longer than the model\'s context window. Click "Reset conversation" to clear past turns and start fresh!',
          action: 'reset'
        };
      }
      return {
        type: 'bad_request',
        status: 400,
        title: 'Prompt Issue',
        message: rawMsg || 'The request could not be processed with these parameters.',
        action: 'adjust'
      };
    }

    if (status === 0 || rawMsg.toLowerCase().includes('network') || rawMsg.toLowerCase().includes('failed to fetch')) {
      return {
        type: 'network_error',
        status: 0,
        title: 'Connection Hiccup',
        message: 'Could not reach the Groq API. Check your internet connection or try again in a moment.',
        action: 'retry'
      };
    }

    return {
      type: 'generic_error',
      status: status || 500,
      title: 'Groq Service Notice',
      message: rawMsg || 'Something unexpected happened while talking to Groq. Let\'s try again.',
      action: 'retry'
    };
  }

  /**
   * Generate executable code snippets for the current playground state
   */
  generateCodeSnippets({ messages, model, temperature, maxTokens, stop }) {
    const cleanStop = (stop || []).filter(Boolean);
    const escapedMessages = JSON.stringify(messages, null, 2);

    // 1. Curl
    const curlPayload = {
      model,
      messages,
      temperature: Number(temperature),
      max_tokens: Number(maxTokens)
    };
    if (cleanStop.length > 0) curlPayload.stop = cleanStop;

    const curlCode = `curl https://api.groq.com/openai/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $GROQ_API_KEY" \\
  -d '${JSON.stringify(curlPayload, null, 2).replace(/'/g, `'\\''`)}'`;

    // 2. Python (Groq SDK)
    const pythonCode = `import os
from groq import Groq

client = Groq(
    api_key=os.environ.get("GROQ_API_KEY"),
)

completion = client.chat.completions.create(
    model="${model}",
    messages=${escapedMessages},
    temperature=${temperature},
    max_tokens=${maxTokens}${cleanStop.length > 0 ? `,\n    stop=${JSON.stringify(cleanStop)}` : ''},
    stream=True
)

for chunk in completion:
    content = chunk.choices[0].delta.content or ""
    print(content, end="", flush=True)
`;

    // 3. JavaScript / Fetch
    const jsCode = `const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": \`Bearer \${process.env.GROQ_API_KEY}\`
  },
  body: JSON.stringify({
    model: "${model}",
    messages: ${escapedMessages},
    temperature: ${temperature},
    max_tokens: ${maxTokens}${cleanStop.length > 0 ? `,\n    stop: ${JSON.stringify(cleanStop)}` : ''},
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  console.log(chunk);
}`;

    return {
      curl: curlCode,
      python: pythonCode,
      javascript: jsCode
    };
  }
}

export const groqClient = new GroqApiClient();

