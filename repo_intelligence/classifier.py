"""
repo_intelligence/classifier.py
Intelligent file classification into logical architectural roles.
Uses a multi-signal approach combining file path, filename, imports, exports,
detected framework, and extracted code symbols.
"""

import re
from typing import List, Optional
from repo_intelligence.models import FileModel, TechnologyDetection

ENTRYPOINT_NAMES = {
    "main.py", "app.py", "manage.py", "wsgi.py", "asgi.py", "server.py", "cli.py",
    "index.js", "server.js", "main.js", "app.js",
    "index.ts", "server.ts", "main.ts", "app.ts",
    "index.tsx", "main.tsx", "app.tsx",
}

CONFIG_PATTERNS = [
    r"config", r"\.env", r"tsconfig", r"vite\.config", r"webpack\.config",
    r"next\.config", r"tailwind\.config", r"postcss\.config", r"babel\.config",
    r"settings\.py", r"setup\.cfg", r"pyproject\.toml"
]

TEST_PATTERNS = [
    r"^test[s]?/", r"/test[s]?/", r"/__tests__/",
    r"^test_.*\.py$", r".*_test\.py$",
    r".*\.test\.[jt]sx?$", r".*\.spec\.[jt]sx?$"
]

BUILD_NAMES = {
    "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "requirements.txt", "pipfile", "pipfile.lock", "poetry.lock",
    "dockerfile", "docker-compose.yml", "docker-compose.yaml",
    "pom.xml", "build.gradle", "build.gradle.kts", "cargo.toml"
}


def classify_file(
    file_model: FileModel,
    technologies: Optional[List[TechnologyDetection]] = None,
    all_files: Optional[List[str]] = None
) -> str:
    """
    Determine the logical architectural role of a file.
    Returns one of:
      entrypoint, frontend-component, frontend-page, backend-route,
      controller, service, model, database, config, middleware,
      utility, test, documentation, build, deployment, script, unknown
    """
    path = file_model.path.replace("\\", "/").lower()
    name = file_model.name.lower()
    ext = file_model.extension.lower()

    # 1. Documentation
    if ext in ("md", "markdown", "rst", "txt") or path.startswith("docs/") or "/docs/" in path:
        return "documentation"

    # 2. Build & Dependencies
    if name in BUILD_NAMES or path.startswith(".github/") or "/workflows/" in path:
        if path.startswith(".github/") or "/workflows/" in path or "deploy" in name:
            return "deployment"
        return "build"

    # 3. Tests
    for pat in TEST_PATTERNS:
        if re.search(pat, path):
            return "test"

    # 4. Config files
    for pat in CONFIG_PATTERNS:
        if re.search(pat, name) or re.search(pat, path):
            return "config"

    # 5. Database & Migrations
    if "/migrations/" in path or path.startswith("migrations/") or name.endswith(".prisma") or "migration" in name:
        return "database"
    if name in ("database.py", "db.py", "db.ts", "database.ts", "connection.py", "datasource.ts"):
        return "database"

    # 6. Models
    if file_model.classes and any("model" in c.lower() or "schema" in c.lower() for c in file_model.classes):
        return "model"
    if "/models/" in path or path.startswith("models/") or "/entities/" in path or path.startswith("entities/"):
        return "model"

    # 7. Backend Routes & API
    if file_model.routes or "/routes/" in path or path.startswith("routes/") or "/api/" in path or path.startswith("api/"):
        if "app/api/" in path and name.startswith("route."):
            return "backend-route"
        if file_model.routes:
            return "backend-route"
        if "/routes/" in path:
            return "backend-route"

    # 8. Controllers
    if "/controllers/" in path or path.startswith("controllers/") or name.endswith("controller.ts") or name.endswith("controller.js") or name.endswith("controller.py"):
        return "controller"

    # 9. Services
    if "/services/" in path or path.startswith("services/") or name.endswith("service.ts") or name.endswith("service.js") or name.endswith("service.py"):
        return "service"

    # 10. Middleware
    if "/middleware/" in path or path.startswith("middleware/") or "/middlewares/" in path or "middleware" in name:
        return "middleware"

    # 11. Frontend Pages vs Components
    if path.startswith("pages/") or "/pages/" in path or (path.startswith("app/") and name in ("page.tsx", "page.jsx", "page.js")):
        if path not in ("pages/_app.tsx", "pages/_app.jsx", "pages/_app.js"):
            return "frontend-page"
    if path.startswith("views/") or "/views/" in path:
        return "frontend-page"

    # 12. Entrypoint
    # Check Next.js App Router root layout/page or pages/_app
    if path in ("app/layout.tsx", "app/layout.jsx", "app/layout.js", "pages/_app.tsx", "pages/_app.js"):
        return "entrypoint"
    # Root or src entrypoints
    if name in ENTRYPOINT_NAMES:
        if path.count("/") <= 2 or path.startswith("src/"):
            return "entrypoint"

    # Frontend Components
    if ext in ("jsx", "tsx", "vue", "svelte") or "/components/" in path or path.startswith("components/") or "/ui/" in path:
        if file_model.functions or file_model.classes:
            return "frontend-component"
        return "frontend-component"

    # 13. Utilities / Helpers
    if "/utils/" in path or path.startswith("utils/") or "/helpers/" in path or path.startswith("helpers/") or "/lib/" in path or path.startswith("lib/"):
        return "utility"

    # 14. Scripts
    if path.startswith("scripts/") or "/scripts/" in path or name.endswith(".sh") or name.endswith(".bat") or name.endswith(".ps1"):
        return "script"

    # 15. Default heuristics based on symbols
    if any(c.isupper() for c in (file_model.classes + file_model.functions)):
        if ext in ("tsx", "jsx"):
            return "frontend-component"

    return "unknown"
