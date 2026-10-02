# GitHub Repo Explainer 🚀

> **"Understand any GitHub repository in seconds."**

**GitHub Repo Explainer** is a production-grade developer tool that transforms public GitHub repositories into structured, evidence-grounded technical reports. It analyzes architecture, technology stacks, entry points, and component responsibilities using compact, secret-sanitized repository evidence synthesized by an LLM.

---

## 🌟 Key Features

* **Grounded AI Explanations**: Generates architecture breakdowns, execution workflows, file responsibilities, and key insights strictly categorized as **FACT**, **INFERENCE**, or **RECOMMENDATION**.
* **Evidence-Grounded Fallback**: If OpenAI API quota is exhausted or temporarily unavailable, automatically synthesizes a structured, evidence-grounded report directly from inspected source files without failing or showing a blank page.
* **Warp Stripes WebGL Hero**: Custom, high-performance WebGL shader canvas with DPR limiting, reduced-motion awareness, viewport pausing via `IntersectionObserver`, and graceful CSS gradient fallbacks.
* **Architecture-Aware Scoring**: Automatically pinpoints entry points (`main.py`, `app.js`, `package.json`, etc.) and core source folders while filtering out test fixtures, examples, and minified bundles.
* **Zero-Leakage Security Engine**:
  * Strips sensitive files (`.env`, `*.pem`, `id_rsa`, etc.) before analysis.
  * Redacts secret keys, API tokens, and passwords (`[REDACTED SECRET]`).
  * Enforces strict character quotas (max 6,000 chars per file) to prevent prompt overflows.
  * Treats all repository content strictly as **untrusted data** to prevent prompt injection and SSRF.
  * Sanitizes Markdown rendering with strict XSS protections.
* **Developer-Focused Dashboard**:
  * Real-time metadata cards (stars, primary language, branch).
  * Detected tech stack badges and inspected file pills.
  * Interactive project structure viewer.
  * One-click clipboard copying and clean Markdown report downloads.

---

## 🏛️ System Architecture

The application adopts a decoupled architecture: a modern React + TypeScript single-page application served directly by an environment-aware Flask REST API, preserving the working Python analysis engine.

```
                    ┌────────────────────────────┐
                    │   React 18 + TypeScript    │
                    │   (Tailwind CSS + Shader)  │
                    └─────────────┬──────────────┘
                                  │ HTTP / JSON
                                  ▼
                    ┌────────────────────────────┐
                    │      web_app.py (Flask)    │
                    │    (/api/analyze, /api/dl) │
                    └─────────────┬──────────────┘
                                  │
                                  ▼
                    ┌────────────────────────────┐
                    │      main.py (Pipeline)    │
                    └─────────────┬──────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ github_client.py │    │   analyzer.py    │    │   security.py    │
│ (GitHub REST API)│    │(Stack & Scoring) │    │ (Redact & Limits)│
└──────────────────┘    └──────────────────┘    └──────────────────┘
                                  │
                                  ▼
                    ┌────────────────────────────┐
                    │     report_builder.py      │
                    │ (Evidence Prompt + OpenAI) │
                    └────────────────────────────┘
```

---

## 🔄 Analysis Pipeline

```
GitHub URL
    │
    ▼
Strict Regex & Domain Validation (security.py)
    │
    ▼
Repository Metadata & Git Tree (github_client.py)
    │
    ▼
Technology Detection & Heuristic Key File Scoring (analyzer.py)
    │
    ▼
Selective File Fetching (github_client.py)
    │
    ▼
Secret Redaction & Size Limiting (security.py)
    │
    ▼
Evidence-Grounded Prompting (report_builder.py)
    │
    ▼
OpenAI LLM Synthesis
    │
    ▼
Markdown Report Generation & Dashboard Rendering
```

---

## 📁 Project Structure

```
repo-explainer/
├── analyzer.py               # Tech detection, folder summary & key-file scoring
├── github_client.py          # GitHub REST API client (metadata, tree, file content)
├── main.py                   # Analysis pipeline orchestrator & CLI entry point
├── report_builder.py         # Evidence-based prompt crafting & OpenAI client
├── security.py               # Secret redaction, sensitive file filtering & URL validation
├── web_app.py                # Flask web server, JSON REST API & static SPA server
├── requirements.txt          # Python dependencies
├── .env.example              # Environment variables template
├── .gitignore                # Git exclusions
├── README.md                 # Project documentation
│
└── frontend/                 # React + TypeScript + Tailwind CSS application
    ├── package.json          # Node dependencies & scripts
    ├── tsconfig.json         # TypeScript configuration
    ├── vite.config.ts        # Vite configuration with API proxy
    ├── tailwind.config.js    # Tailwind developer dark aesthetic palette
    ├── index.html            # SPA HTML entry point
    └── src/
        ├── main.tsx          # React application root
        ├── App.tsx           # State coordinator
        ├── index.css         # Tailwind base and report typography
        └── components/
            ├── Navbar.tsx             # Header bar
            ├── Hero.tsx               # Landing hero with Warp Stripes shader
            ├── LoadingState.tsx       # Truthful animated pipeline execution view
            ├── Dashboard.tsx          # Repository metrics, tech badges & actions
            ├── ReportView.tsx         # Safe Markdown renderer with evidence badges
            ├── ErrorBanner.tsx        # Sanitized user-friendly error banners
            └── ui/
                ├── warp-stripes-shader.tsx  # WebGL Warp Stripes Shader component
                └── icons.tsx                # Developer interface icons
```

---

## ⚙️ Prerequisites

1. **Python 3.10+**
2. **Node.js 18+** & **npm** (for building the frontend)
3. **OpenAI API Key** (required for AI report generation)
4. **GitHub Personal Access Token** *(Optional, recommended to raise rate limits from 60 to 5,000 requests/hour)*

---

## 🚀 Getting Started

### 1. Clone & Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and configure your credentials (**CRITICAL**: Never commit or push `.env` to Git; it is strictly excluded by `.gitignore`):

```env
# OpenAI API Key (Required for AI explanations)
OPENAI_API_KEY=your_openai_api_key_here

# GitHub Personal Access Token (Optional, increases rate limit from 60 to 5,000 requests/hr)
GITHUB_TOKEN=your_github_token_here

# Model Selection (Default is gpt-4o-mini with gpt-4o fallback)
OPENAI_MODEL=gpt-4o-mini
OPENAI_CHAT_MODEL=gpt-4o

# Server Configuration
FLASK_ENV=production
FLASK_DEBUG=0
PORT=5000
```

### 2. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 3. Build the Frontend

```bash
cd frontend
npm install
npm run build
cd ..
```

The compiled assets will be placed in `frontend/dist/`. Flask automatically serves these static assets on `http://127.0.0.1:5000`.

### 4. Run the Application

Start the production server:

```bash
python web_app.py
```

Open your browser and navigate to:
```
http://127.0.0.1:5000
```

---

## 💻 CLI Usage

You can also run the analysis directly from the command line:

```bash
python main.py https://github.com/psf/requests
```

The report will be output to your terminal and saved to `report.md`.

---

## 🧑‍💻 Frontend Development Mode

To work on the frontend with live Hot Module Replacement (HMR):

1. Start the Flask backend on port 5000:
   ```bash
   FLASK_ENV=development python web_app.py
   ```
2. In a separate terminal, start the Vite development server:
   ```bash
   cd frontend
   npm run dev
   ```
3. Open `http://localhost:5173`. Vite is pre-configured to proxy all `/api/*` requests to the Flask server at `http://127.0.0.1:5000`.

---

## 🔌 API Reference

### `POST /api/analyze`
Analyzes a GitHub repository and returns metadata, architecture insights, and Markdown report.

* **Request Body**:
  ```json
  {
    "url": "https://github.com/psf/requests"
  }
  ```
* **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "info": {
      "name": "requests",
      "description": "A simple, yet elegant, HTTP library.",
      "stars": 54301,
      "language": "Python",
      "default_branch": "main"
    },
    "tech_stack": ["CSS", "HTML", "Python"],
    "folder_summary": { ... },
    "key_files": ["src/requests/utils.py", "pyproject.toml", ...],
    "report": "# requests — Repository Explanation\n..."
  }
  ```
* **Error Response (`400 / 404 / 429 / 500`)**:
  ```json
  {
    "success": false,
    "error": "Human-readable error description"
  }
  ```

### `GET /api/health`
Health check endpoint returning service status.

* **Response (`200 OK`)**:
  ```json
  {
    "status": "ok",
    "product": "GitHub Repo Explainer",
    "tagline": "Understand any GitHub repository in seconds."
  }
  ```

### `POST /api/download`
Streams the generated Markdown report as a downloadable `.md` file attachment.

* **Request Body**:
  ```json
  {
    "name": "requests",
    "report": "# requests — Repository Explanation\n..."
  }
  ```
* **Response**: Markdown file attachment (`Content-Disposition: attachment; filename="requests-explanation.md"`).

---

## 🔒 Security Principles

* **Untrusted Code Execution Prevention**: Repository contents are treated strictly as data evidence. System prompts contain explicit instructions forbidding execution or compliance with instructions contained within repository files.
* **Secret Protection**: API keys, tokens, `.env` entries, and private SSH keys are identified and redacted before prompt assembly.
* **XSS Neutralization**: Markdown rendering strictly sanitizes link protocols and parses HTML elements safely without arbitrary JavaScript execution.
* **SSRF Mitigation**: Input URLs are strictly validated against GitHub's official domain and standard repository slug pattern before issuing network requests.
* **Production Error Masking**: Internal stack traces and credential-leaking errors are confined to server logs; user-facing responses contain sanitized status messages.

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:
1. Preserve existing scoring heuristics and secret-redaction rules.
2. Ensure any new dependencies are justified and minimal.
3. Test with both small and large public repositories before submitting pull requests.

---

## 📄 License

MIT License. See `LICENSE` for details.
