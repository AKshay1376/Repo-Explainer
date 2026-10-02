import os
import re
from typing import List, Dict, Any, Set, Tuple
from security import is_binary_file, is_sensitive_file


def detect_multi_module_repo(files: List[str]) -> Dict[str, Any]:
    """
    Detect whether the repository is organized into multiple independent modules or examples
    (e.g., monorepo, collections of example crews/flows, workspace packages).
    """
    subproject_roots: Set[str] = set()
    multi_module_indicators = {"crews", "flows", "examples", "integrations", "packages", "apps", "plugins"}
    
    file_set = set(files)
    
    # 1. Look for multiple nested manifests (e.g., subfolder/pyproject.toml, subfolder/package.json)
    for f in files:
        parts = f.replace("\\", "/").split("/")
        if len(parts) >= 3 and parts[-1].lower() in ("pyproject.toml", "package.json", "cargo.toml"):
            subproject_roots.add("/".join(parts[:-1]))
            
    # 2. Check for multi-module top-level directories like crews/, flows/, examples/
    grouped_by_top: Dict[str, Set[str]] = {}
    for f in files:
        parts = f.replace("\\", "/").split("/")
        if len(parts) >= 2:
            top = parts[0].lower()
            if top in multi_module_indicators:
                grouped_by_top.setdefault(top, set()).add(parts[1])
                
    has_indicator_modules = False
    for top, subdirs in grouped_by_top.items():
        if len(subdirs) >= 2:
            has_indicator_modules = True
            for sub in subdirs:
                subproject_roots.add(f"{top}/{sub}")

    is_multi_module = len(subproject_roots) >= 2 or has_indicator_modules
    
    return {
        "is_multi_module": is_multi_module,
        "modules": sorted(list(subproject_roots)),
        "description": "multiple independently structured examples/modules" if is_multi_module else "single unified application/library"
    }


def detect_tech_stack(files: List[str], inspected_contents: Dict[str, str] = None) -> Dict[str, Any]:
    """
    Detect and categorize technologies based on repository files, manifests, and source code.
    Tracks structured evidence and confidence levels:
      [{"technology": str, "evidence": str, "confidence": "high" | "medium" | "low"}]
    """
    file_set = {f.lower().replace("\\", "/") for f in files}
    detected_tech_records: List[Dict[str, str]] = []
    seen_tech_names: Set[str] = set()

    def add_tech(name: str, evidence: str, confidence: str = "high"):
        if name not in seen_tech_names:
            seen_tech_names.add(name)
            detected_tech_records.append({
                "technology": name,
                "evidence": evidence,
                "confidence": confidence
            })

    # 1. Count code extensions to determine primary language accurately
    code_ext_map = {
        ".py": "Python",
        ".js": "JavaScript",
        ".jsx": "JavaScript",
        ".ts": "TypeScript",
        ".tsx": "TypeScript",
        ".go": "Go",
        ".rs": "Rust",
        ".java": "Java",
        ".c": "C",
        ".h": "C",
        ".cpp": "C++",
        ".cc": "C++",
        ".hpp": "C++",
        ".cs": "C#",
        ".rb": "Ruby",
        ".php": "PHP",
        ".swift": "Swift",
        ".kt": "Kotlin",
        ".scala": "Scala",
    }
    
    lang_weights: Dict[str, int] = {}
    for f in file_set:
        if any(ign in f for ign in ("tests/", "test/", "docs/", "vendor/", "node_modules/")):
            continue
        for ext, lang in code_ext_map.items():
            if f.endswith(ext):
                lang_weights[lang] = lang_weights.get(lang, 0) + 1
                break

    primary_language = None
    languages = []
    if lang_weights:
        sorted_langs = sorted(lang_weights.items(), key=lambda item: -item[1])
        primary_language = sorted_langs[0][0]
        languages = [lang for lang, count in sorted_langs]
        add_tech(primary_language, f"Primary codebase language ({lang_weights[primary_language]} source files)", "high")
        for l in languages[1:4]:
            add_tech(l, f"Supporting language ({lang_weights[l]} source files)", "medium")

    # 2. Inspect file tree for frameworks, tooling, and infrastructure
    frameworks = set()
    build_tools = set()
    testing = set()
    docs = set()
    cicd = set()

    for f in file_set:
        parts = f.split("/")
        fname = parts[-1]

        # CI/CD
        if ".github/workflows" in f:
            cicd.add("GitHub Actions")
            add_tech("GitHub Actions", f"CI/CD workflow defined in {f}", "high")
        elif ".travis.yml" in f:
            cicd.add("Travis CI")
            add_tech("Travis CI", f"Configuration file {f}", "high")
        elif ".circleci" in f:
            cicd.add("CircleCI")
            add_tech("CircleCI", f"Configuration file {f}", "high")
        elif "jenkinsfile" in fname:
            cicd.add("Jenkins")
            add_tech("Jenkins", f"Pipeline defined in {f}", "high")

        # Documentation tooling
        if "docs/conf.py" in f or "conf.py" in parts:
            docs.add("Sphinx")
            add_tech("Sphinx", f"Documentation build config {f}", "high")
        elif "mkdocs.yml" in fname:
            docs.add("MkDocs")
            add_tech("MkDocs", f"Documentation config {f}", "high")
        elif ".readthedocs" in fname:
            docs.add("Read the Docs")
            add_tech("Read the Docs", f"Configuration file {f}", "high")
        elif "docusaurus.config" in fname:
            docs.add("Docusaurus")
            add_tech("Docusaurus", f"Documentation site config {f}", "high")

        # Testing frameworks
        if "pytest.ini" in fname or (fname.startswith("test_") and f.endswith(".py")) or "tests/" in f:
            testing.add("Pytest")
            add_tech("Pytest", "Test suite structure and configuration", "high")
        if "jest.config" in fname:
            testing.add("Jest")
            add_tech("Jest", f"Test runner configuration {f}", "high")
        elif "vitest.config" in fname:
            testing.add("Vitest")
            add_tech("Vitest", f"Test runner configuration {f}", "high")
        elif "mocha" in fname:
            testing.add("Mocha")
            add_tech("Mocha", f"Test framework reference {f}", "medium")

        # Build & Package tooling
        if fname == "pyproject.toml":
            build_tools.add("pyproject.toml (PEP 517/621)")
            add_tech("pyproject.toml", f"Standard Python packaging manifest in {f}", "high")
        elif fname in ("setup.py", "setup.cfg"):
            build_tools.add("Setuptools")
            add_tech("Setuptools", f"Python build setup in {f}", "high")
        elif fname == "poetry.lock":
            build_tools.add("Poetry")
            add_tech("Poetry", "Poetry dependency lockfile", "high")
        elif fname == "uv.lock":
            build_tools.add("uv")
            add_tech("uv", "Fast Python package installer lockfile", "high")
        elif fname == "pipfile":
            build_tools.add("Pipenv")
            add_tech("Pipenv", "Pipfile environment manifest", "high")
        elif fname == "cargo.toml":
            build_tools.add("Cargo")
            add_tech("Cargo", "Rust package manager manifest", "high")
        elif fname == "go.mod":
            build_tools.add("Go Modules")
            add_tech("Go Modules", "Go dependency manifest", "high")
        elif fname == "pom.xml":
            build_tools.add("Maven")
            add_tech("Maven", "Java project management manifest", "high")
        elif fname in ("build.gradle", "build.gradle.kts"):
            build_tools.add("Gradle")
            add_tech("Gradle", "Gradle build script", "high")
        elif fname == "package.json":
            build_tools.add("npm/Node.js")
            add_tech("npm/Node.js", f"Node.js package manifest in {f}", "high")
        elif fname == "dockerfile" or fname.startswith("dockerfile."):
            build_tools.add("Docker")
            add_tech("Docker", f"Container definition in {f}", "high")
        elif fname in ("docker-compose.yml", "docker-compose.yaml", "compose.yaml"):
            build_tools.add("Docker Compose")
            add_tech("Docker Compose", f"Multi-container orchestration in {f}", "high")
        elif fname in ("vite.config.ts", "vite.config.js"):
            build_tools.add("Vite")
            add_tech("Vite", "Frontend build tool and dev server", "high")
        elif fname == "webpack.config.js":
            build_tools.add("Webpack")
            add_tech("Webpack", "Module bundler configuration", "high")
        elif fname in ("tailwind.config.js", "tailwind.config.ts"):
            frameworks.add("Tailwind CSS")
            add_tech("Tailwind CSS", "Utility-first CSS configuration", "high")

        # Frameworks & Specialized Ecosystems
        if ("flask" in parts or "flask" in fname) and not any(ign in f for ign in ("docs/", "tests/")):
            frameworks.add("Flask")
            add_tech("Flask", "Lightweight WSGI Python web framework", "high")
        if ("django" in parts or "manage.py" in fname) and not any(ign in f for ign in ("docs/", "tests/")):
            frameworks.add("Django")
            add_tech("Django", "High-level Python web framework", "high")
        if ("fastapi" in parts or "fastapi" in fname) and not any(ign in f for ign in ("docs/", "tests/")):
            frameworks.add("FastAPI")
            add_tech("FastAPI", "Modern, high-performance async Python API framework", "high")
        if ("express" in parts or (fname == "index.js" and "express" in f)) and not any(ign in f for ign in ("docs/", "tests/")):
            frameworks.add("Express")
            add_tech("Express", "Node.js web application framework", "high")
        if ("react" in parts or fname.endswith((".jsx", ".tsx"))) and not any(ign in f for ign in ("docs/", "tests/")):
            frameworks.add("React")
            add_tech("React", "Component-based UI library", "high")
        if "next.config.js" in fname or "next.config.mjs" in fname:
            frameworks.add("Next.js")
            add_tech("Next.js", "React production framework", "high")
        if "vue" in parts or fname.endswith(".vue"):
            frameworks.add("Vue.js")
            add_tech("Vue.js", "Progressive JavaScript framework", "high")
            
        # Agentic & AI frameworks
        if "crewai" in f or "crews/" in f:
            frameworks.add("CrewAI")
            add_tech("CrewAI", "Multi-agent orchestration framework", "high")

    # 3. Specific package signatures
    if any("src/requests" in f or "requests/" in f for f in file_set):
        frameworks.add("HTTP Client Library (Requests)")
        add_tech("Requests", "Standard HTTP client library for Python", "high")
    if any("urllib3" in f for f in file_set):
        frameworks.add("urllib3")
        add_tech("urllib3", "Low-level HTTP library with connection pooling and thread safety", "high")

    # 4. Check inspected contents if available for deeper imports (e.g. pydantic, langchain, openai)
    if inspected_contents:
        for file_path, content in inspected_contents.items():
            if "crewai" in content:
                frameworks.add("CrewAI")
                add_tech("CrewAI", f"Direct import or usage in {file_path}", "high")
            if "pydantic" in content:
                frameworks.add("Pydantic")
                add_tech("Pydantic", f"Data validation and schemas in {file_path}", "high")
            if "langchain" in content:
                frameworks.add("LangChain")
                add_tech("LangChain", f"LLM application tooling imported in {file_path}", "high")
            if "openai" in content and "client" in content.lower():
                frameworks.add("OpenAI SDK")
                add_tech("OpenAI SDK", f"Model API client utilized in {file_path}", "high")
            if "torch" in content:
                frameworks.add("PyTorch")
                add_tech("PyTorch", f"Deep learning tensors and modules in {file_path}", "high")
            if "tensorflow" in content or "keras" in content:
                frameworks.add("TensorFlow / Keras")
                add_tech("TensorFlow / Keras", f"Machine learning framework in {file_path}", "high")

    # Order stack for display
    ordered_stack = []
    if primary_language:
        ordered_stack.append(primary_language)
    for l in languages:
        if l not in ordered_stack:
            ordered_stack.append(l)
    for fw in sorted(frameworks):
        if fw not in ordered_stack:
            ordered_stack.append(fw)
    for b in sorted(build_tools):
        if b not in ordered_stack:
            ordered_stack.append(b)
    for t in sorted(testing):
        if t not in ordered_stack:
            ordered_stack.append(t)
    for d in sorted(docs):
        if d not in ordered_stack:
            ordered_stack.append(d)
    for c in sorted(cicd):
        if c not in ordered_stack:
            ordered_stack.append(c)

    return {
        "primary_language": primary_language or (languages[0] if languages else "Multi-language"),
        "languages": languages,
        "frameworks": sorted(frameworks),
        "build_tools": sorted(build_tools),
        "testing": sorted(testing),
        "docs": sorted(docs),
        "cicd": sorted(cicd),
        "stack_list": ordered_stack,
        "detected_technologies": detected_tech_records,
    }


def summarize_folders(files: List[str]) -> Dict[str, List[str]]:
    """Group files by their top-level folder."""
    folders: Dict[str, List[str]] = {}

    for file in files:
        parts = file.replace("\\", "/").split("/")
        if len(parts) == 1:
            folder = "."
        else:
            folder = parts[0]

        folders.setdefault(folder, [])
        folders[folder].append(file)

    return folders


def pick_key_files(files: List[str]) -> List[str]:
    """
    Select up to 8 of the most architecture-defining files in the repository.
    Recognizes single-project packages, layered architectures, and multi-module repositories.
    Guarantees:
      - Ignores binary files, lockfiles, minified bundles, and sensitive files.
      - If repository is multi-module (e.g. independent examples/crews), distributes selection
        across distinct modules.
    """
    # Check multi-module status
    multi_info = detect_multi_module_repo(files)
    is_multi_module = multi_info["is_multi_module"]
    module_roots = multi_info["modules"]

    scored_files: List[Tuple[int, str]] = []

    # Architecture-defining module basenames
    architecture_modules = {
        "sessions.py": 18,
        "models.py": 18,
        "adapters.py": 18,
        "api.py": 17,
        "auth.py": 16,
        "crew.py": 18,
        "flow.py": 18,
        "tasks.py": 16,
        "agents.py": 16,
        "application.js": 18,
        "express.js": 18,
        "router.js": 17,
        "request.js": 16,
        "response.js": 16,
        "app.py": 17,
        "blueprints.py": 16,
        "views.py": 16,
        "server.py": 15,
        "main.py": 16,
        "index.js": 15,
        "main.js": 15,
        "github_client.py": 16,
        "report_builder.py": 16,
        "web_app.py": 16,
        "analyzer.py": 15,
        "security.py": 15,
    }

    # Package facades
    facade_files = {
        "__init__.py": 14,
        "index.ts": 14,
        "index.py": 14,
    }

    # Manifests
    manifests = {
        "pyproject.toml": 16,
        "package.json": 16,
        "cargo.toml": 15,
        "go.mod": 15,
        "requirements.txt": 13,
        "setup.py": 12,
        "pom.xml": 14,
    }

    core_directories = {
        "src", "lib", "core", "app", "server", "requests", "flask", "express",
    }

    ignored_directories = {
        "node_modules", ".git", "dist", "build", "coverage", "vendor",
        "__pycache__", ".tox", ".pytest_cache", "tests/certs", "fixtures",
    }

    lockfiles = {
        "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "cargo.lock", "poetry.lock", "uv.lock"
    }

    source_extensions = (
        ".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java", ".cpp", ".c",
    )

    for file in files:
        file_norm = file.replace("\\", "/")
        file_lower = file_norm.lower()
        parts = file_lower.split("/")
        filename = parts[-1]

        # Ignore sensitive files, binary files, lockfiles, and ignored directories
        if is_sensitive_file(file_norm) or is_binary_file(file_norm) or filename in lockfiles:
            continue
        if any(directory in ignored_directories for directory in parts):
            continue

        score = 0

        # Architecture-defining modules
        if filename in architecture_modules:
            score += architecture_modules[filename]
            if any(directory in core_directories for directory in parts[:-1]):
                score += 5

        # Facades (__init__.py, index.ts)
        elif filename in facade_files:
            if any(directory in core_directories for directory in parts[:-1]) and "test" not in file_lower:
                score += facade_files[filename]
            else:
                score += 2

        # Manifests
        elif filename in manifests:
            if len(parts) == 1:
                score += manifests[filename]
            else:
                score += manifests[filename] - 3

        # README
        elif filename == "readme.md":
            if len(parts) == 1:
                score += 8
            else:
                score += 2

        # General source code files
        elif file_lower.endswith(source_extensions):
            score += 6
            if any(directory in core_directories for directory in parts[:-1]):
                score += 4

        # Tests & docs penalties
        if "test" in parts or "tests" in parts or filename.startswith("test_") or filename.endswith((".test.js", ".spec.js", ".test.ts", ".spec.ts")):
            score -= 15
        if "docs" in parts or "doc" in parts:
            score -= 10
        if ".min." in filename:
            score -= 15

        # In non-multi-module repos, penalize examples.
        # But in multi-module example collections, preserve examples!
        if not is_multi_module:
            if "example" in parts or "examples" in parts or "samples" in parts:
                score -= 10
        else:
            # Multi-module bonus: favor top files inside distinct module roots
            if any(file_norm.startswith(mod) for mod in module_roots):
                score += 3

        if filename in ("__version__.py", "authors.rst", "notice", "license"):
            score -= 6

        if score > 0:
            scored_files.append((score, file_norm))

    # Sort by score descending, then by length
    scored_files.sort(key=lambda item: (-item[0], len(item[1]), item[1]))

    # Multi-module selection: round-robin or distribute across modules
    selected: List[str] = []
    seen: Set[str] = set()

    if is_multi_module and len(module_roots) >= 2:
        # Pick 2-3 files per distinct module root up to 8
        files_by_mod: Dict[str, List[str]] = {}
        top_level_files: List[str] = []

        for _, f in scored_files:
            matched_mod = None
            for mod in module_roots:
                if f.startswith(mod):
                    matched_mod = mod
                    break
            if matched_mod:
                files_by_mod.setdefault(matched_mod, []).append(f)
            else:
                top_level_files.append(f)

        # First add top manifest if exists (e.g. pyproject.toml)
        for t in top_level_files:
            if t.endswith((".toml", ".json", "readme.md")) and t not in seen:
                seen.add(t)
                selected.append(t)
                break

        # Then distribute across modules
        for round_idx in range(3):
            for mod in sorted(files_by_mod.keys()):
                mod_files = files_by_mod[mod]
                if round_idx < len(mod_files):
                    f = mod_files[round_idx]
                    if f not in seen:
                        seen.add(f)
                        selected.append(f)
                    if len(selected) >= 8:
                        break
            if len(selected) >= 8:
                break

    # Fallback / standard selection
    if len(selected) < 8:
        for _, f in scored_files:
            if f not in seen:
                seen.add(f)
                selected.append(f)
            if len(selected) >= 8:
                break

    return selected