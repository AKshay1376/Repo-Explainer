# 🚀 GitHub Repo Explainer

> Understand any GitHub repository in seconds.

GitHub Repo Explainer is an AI-powered developer tool that analyzes a GitHub repository and generates a structured explanation of its **architecture, technology stack, file responsibilities, and key implementation details**.

Instead of manually going through hundreds of files, you can provide a GitHub repository URL and get a concise, evidence-based explanation of how the project works.

---

## ✨ What It Does

GitHub Repo Explainer takes a public GitHub repository and:

- 🔗 Accepts a GitHub repository URL
- 📂 Analyzes the repository file structure
- 🧠 Detects the project's technology stack
- 🗂️ Summarizes folders and important files
- 🎯 Selects key source files for deeper inspection
- 🔍 Reads relevant source-code files
- 🤖 Uses AI to explain the repository
- 📊 Generates a structured technical report
- 🔐 Applies security-aware handling to repository contents

The goal is simple:

**Turn an unfamiliar codebase into something you can understand quickly.**

---

## 🧠 How It Works

The project follows a multi-stage analysis pipeline:

```text
GitHub Repository URL
        │
        ▼
   GitHub API
        │
        ├── Repository metadata
        └── Repository file tree
        │
        ▼
 Local Repository Analysis
        │
        ├── Technology detection
        ├── Folder analysis
        └── Key-file selection
        │
        ▼
 Fetch Selected Source Files
        │
        ▼
 Security / Secret Sanitization
        │
        ▼
      AI Analysis
        │
        ▼
 Structured Markdown Report
```

Only selected files are sent for deeper AI analysis instead of blindly sending an entire repository.

---

## 🏗️ Architecture

```text
React + TypeScript Frontend
             │
             ▼
          Flask API
             │
             ▼
    Python Analysis Engine
             │
       ┌─────┴─────┐
       ▼           ▼
 GitHub API      AI Model
       │
       ▼
 Repository Data
```

The Python backend remains responsible for repository analysis while the frontend provides the user-facing experience.

---

## 🛠️ Tech Stack

### Backend

- Python
- Flask
- Requests
- OpenAI API
- python-dotenv

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- UI components

### APIs

- GitHub REST API
- OpenAI API

---

## 📁 Project Structure

```text
repo-explainer/
│
├── frontend/
│   └── React frontend
│
├── main.py
│   └── Main repository analysis pipeline
│
├── github_client.py
│   └── GitHub API communication
│
├── analyzer.py
│   └── Technology detection,
│       folder analysis and key-file selection
│
├── report_builder.py
│   └── AI analysis and report generation
│
├── security.py
│   └── Secret detection and content sanitization
│
├── web_app.py
│   └── Flask web application / API layer
│
├── test_github.py
│   └── GitHub API testing
│
├── requirements.txt
│   └── Python dependencies
│
├── .env.example
│   └── Environment variable template
│
├── .gitignore
│
└── README.md
```

---

## ⚙️ Installation

### 1. Clone the repository

```bash
git clone https://github.com/AKshay1376/Repo-Explainer.git
cd Repo-Explainer
```

### 2. Create a Python virtual environment

```bash
python -m venv venv
```

Activate it on Windows:

```bash
venv\Scripts\activate
```

On macOS / Linux:

```bash
source venv/bin/activate
```

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 4. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

---

## 🔑 Environment Variables

Create a `.env` file in the project root using `.env.example` as a reference.

```env
GITHUB_TOKEN=your_github_token
OPENAI_API_KEY=your_openai_api_key
```

Use the model configuration supported by the current application code/environment.

### ⚠️ Keep secrets private

Never commit `.env`, API keys, GitHub tokens, private keys, or other credentials to the repository.

A GitHub token is recommended for avoiding the lower unauthenticated GitHub API rate limits.

---

## ▶️ Run Locally

### Start the Flask backend

From the project root:

```bash
python web_app.py
```

The backend will run on the configured local port, typically:

```text
http://127.0.0.1:5000
```

### Start the frontend

In a second terminal:

```bash
cd frontend
npm run dev
```

Open the local frontend URL shown by Vite in your browser.

---

## 🌐 Using the Application

1. Open the web application.
2. Enter a public GitHub repository URL.

Example:

```text
https://github.com/psf/requests
```

3. Click **Analyze Repository**.
4. The backend retrieves repository metadata and its file tree.
5. The local analyzer identifies important files and the technology stack.
6. Selected source files are fetched and sanitized.
7. AI generates an evidence-grounded explanation.
8. The structured report is returned to the application.

---

## 📊 Generated Analysis

The generated report is organized around several areas:

### 🧠 AI Overview

A high-level explanation of what the repository does.

### 🏗️ How It Works

A step-by-step explanation of the repository's execution flow based on the inspected code.

### 🔗 File Responsibilities

Explains the purpose of important files and how they relate to one another.

### 💡 Key Technical Insights

Highlights implementation details found in the inspected source code.

### ⚠️ Potential Improvements

Identifies observations and recommendations while avoiding unsupported claims about the repository.

---

## 🎯 Evidence-Based AI Analysis

A core design goal is to make repository explanations grounded in available evidence rather than guesses.

The analysis distinguishes between:

```text
FACT
    Directly supported by repository evidence.

INFERENCE
    A reasonable conclusion derived from available evidence.

RECOMMENDATION
    A suggested improvement or consideration.
```

The AI is instructed not to invent:

- functionality
- architecture
- APIs
- dependencies
- algorithms
- vulnerabilities

A filename alone is not treated as proof of what a file does.

---

## 🔐 Security

Repository source code is treated as **untrusted input**.

The project includes security-oriented handling such as:

- Sensitive-file filtering
- Secret-pattern detection
- Content sanitization
- Content-size limits
- Protection against accidentally sending obvious credentials to the AI
- Environment-secret separation
- Security-aware AI prompting
- Safe handling of generated report content

### Important

Never commit:

```text
.env
API keys
GitHub tokens
private keys
other credentials
```

Use `.env.example` for documenting required environment variables.

---

## 🧪 Testing

The repository analysis pipeline has been tested against public repositories including:

```text
https://github.com/psf/requests
https://github.com/pallets/flask
https://github.com/expressjs/express
```

The analyzer can also process other public GitHub repositories supported by the GitHub API.

---

## 🚧 Future Improvements

The current version is functional, with further improvements planned around:

- 📌 Deeper dependency analysis
- 🌳 Interactive repository architecture graphs
- 🔍 Advanced code navigation
- 📈 Repository complexity metrics
- 💬 Interactive follow-up questions about analyzed repositories
- 📥 Additional report export formats
- ⚡ Improved caching and performance
- 🔐 Additional security protections

---

## 👨‍💻 Author

**Akshay Kumar Niraj**

GitHub: [AKshay1376](https://github.com/AKshay1376)

---

## ⭐ Project Goal

The long-term goal of GitHub Repo Explainer is to make unfamiliar codebases easier to understand.

Whether you're:

- learning a new project,
- joining an existing codebase,
- reviewing open-source software,
- preparing for an interview, or
- trying to understand how a repository works,

**GitHub Repo Explainer gives you a clear starting point.**

---

## 📄 License

No license has been added to the repository yet.
