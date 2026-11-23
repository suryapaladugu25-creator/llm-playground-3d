# LLM Playground 3D ⚡

A friendly, beginner-first 3D playground for exploring and understanding how Large Language Models work, powered by **Groq's LPU inference API** and **Three.js**.

![LLM Playground 3D](https://raw.githubusercontent.com/user-attachments/assets/banner.png)

---

## ✨ Features

### 1. Core Playground & Real Streaming
- **Groq API Direct Streaming (SSE)**: Ultra-fast token generation on Groq's LPUs.
- **Dynamic Model Discovery**: Starts with fallback models (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `deepseek-r1-distill-llama-70b`) and fetches live models directly from Groq once an API key is provided.
- **Beginner Controls**:
  - API Key with `sessionStorage` persistence option (keys never leave your browser).
  - Synchronized Temperature slider (0 to 2.0).
  - Max Tokens slider (16 to 8192).
  - Stop sequences (comma-separated, max 4).
  - Reasoning & web search model capability toggles.
  - Multi-turn conversation history with educational notes explaining why input tokens grow.
  - "View Code" modal exporting exact code equivalents in **cURL**, **Python (Groq SDK)**, and **JavaScript (Fetch)**.

### 2. Live Prompt Analysis Panel (Updates as You Type)
- Real-time prompt pattern detection:
  - **Shot Count**: Accurately counts examples (`Input:/Output:`, `Q:/A:`, `->`, quoted pairs, markdown blocks) while correctly ignoring trailing empty `Output:` queries.
  - **Chain-of-Thought (CoT)**: Detects reasoning triggers like "think step by step".
  - **Role Prompting**: Detects personas like "Act as..." or "You are an expert...".
  - **Negative Constraints**: Flags "do not", "never", "avoid".
  - **Format Constraints**: Identifies JSON, tables, bullet points, schema rules.
  - Displays a large status badge (`ZERO-SHOT (0)`, `ONE-SHOT (1)`, `FEW-SHOT (N)`) and dynamic improvement tips.

### 3. Speed & Token Dashboard
- **TTFT (Time To First Token)**: Instant visual metric of initial latency.
- **Generation Speed**: Real-time throughput in tokens per second.
- **Duration**: Total generation time in seconds.
- **Token Breakdown**: Input, Reasoning, and Output tokens.
- **Rate Limit Quota**: Live tokens-per-minute quota tracking parsed from Groq's `x-ratelimit-*` headers.

### 4. Interactive 3D Visualizations (Three.js)
- **⚡ 3D Token Stream**: Each streaming token becomes a floating, glowing 3D chip flying along a curved spline trajectory into a circular response portal. Color-coded by token type (word, number, punctuation, whitespace).
- **🏢 Context Window Tower**: Translucent stack of conversation blocks (system, user, assistant) that grows turn by turn. Turns red as tokens approach the context limit.
- **⏱️ Rate-Limit Gauge**: Holographic 3D gyroscope and core sphere that drains as quota is consumed and refills over time.
- **🔥 Temperature Sphere**: Dynamic 3D particle cloud that is tight and orderly at T=0 and chaotically energetic at T=2, reacting live to the slider.
- **Interactive OrbitControls**: Drag to rotate, scroll to zoom, right-click to pan.
- **Accessibility**: Includes "Reduce 3D" toggle and automatically respects system `prefers-reduced-motion`.

### 5. Friendly AI Mascot: "Tokie"
- Low-poly 3D robot head built from Three.js primitives.
- Gentle floating bob, natural blinking, smooth cursor head tracking.
- Expressive moods: `idle`, `thinking` (spinning eyes, pulsing beacon), `happy` (joyful eye arches), and `concerned` (tilted brows).
- **Interactive Speech Bubbles**:
  - 4-step guided tour on first visit.
  - Explains token metrics and speed after every generation.
  - Gentle, non-intrusive error guidance (401 key tips, 429 rate limit countdown timer with progress bar, calm retry button).

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+)
- A free Groq API key from [console.groq.com/keys](https://console.groq.com/keys)

### Local Development
```bash
# Clone or navigate to the directory
cd "llm playground"

# Start Vite dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🚢 Deploying on Vercel

### Method 1: Deploy with Vercel CLI
```bash
# Install Vercel CLI (if not already installed)
npm i -g vercel

# Deploy directly
vercel
```

### Method 2: Deploy with Git / GitHub
1. Push this repository to GitHub or GitLab.
2. In the [Vercel Dashboard](https://vercel.com), click **"Add New Project"** and import the repository.
3. Framework Preset: **Vite** (detected automatically).
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Click **Deploy**!

---

## 🔒 Security & Privacy Notice
- **Client-Side Only**: Your Groq API key is sent directly from your browser to `api.groq.com`.
- **Zero Logging**: No key or prompt data is ever sent to or stored on any third-party backend server.
- Optional `sessionStorage` keeps the key only in your current browser tab.

---

## 📁 Project Architecture
```text
llm playground/
├── index.html        # Semantic HTML5 layout, ARIA labels, header, sidebar, 3D viewport
├── style.css         # Dark theme with vibrant orange accent, glassmorphism, responsive styles
├── api.js            # Groq API client with SSE streaming, rate-limit headers, code generators
├── analyzer.js       # Live prompt analysis (few-shot counting, CoT, role, format constraints)
├── scene3d.js        # Three.js 3D engine (Token Stream, Context Tower, Quota, Temperature Cloud)
├── mascot.js         # Tokie 3D Mascot, cursor tracking, procedural animations, speech bubbles
├── ui.js             # UI orchestrator, DOM event handling, shortcuts, and modal management
├── package.json      # Vite build & preview scripts
└── README.md         # Documentation & setup guide
```

