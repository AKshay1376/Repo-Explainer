"""
repo_intelligence/engine.py
Core orchestrator for Repository Intelligence.
Constructs the complete, normalized RepositoryModel from repository file trees,
manifests, and code contents while enforcing strict performance, skipping, and safety boundaries.
"""

import os
import posixpath
import re
from typing import Dict, List, Optional, Any, Set

from repo_intelligence.models import (
    RepositoryModel,
    RepositoryMetadata,
    FileModel,
    SymbolModel,
    EntryPoint,
    RouteModel,
    DatabaseModel,
    TechnologyDetection,
)
from repo_intelligence.frameworks import detect_technologies
from repo_intelligence.js_ts_parser import parse_js_ts_file
from repo_intelligence.python_parser import parse_python_file
from repo_intelligence.classifier import classify_file
from repo_intelligence.resolver import resolve_repository_dependencies

# Directory & file skip lists for performance and safety
IGNORED_DIRS = {
    "node_modules", "dist", "build", ".next", "coverage", "vendor",
    ".git", ".github", ".husky", ".turbo", "__pycache__", ".venv",
    "venv", "env", "out", "target", "bin", "obj", ".idea", ".vscode"
}

BINARY_EXTENSIONS = {
    "png", "jpg", "jpeg", "gif", "ico", "svg", "webp", "bmp",
    "woff", "woff2", "ttf", "eot", "otf",
    "mp3", "mp4", "wav", "avi", "mov",
    "zip", "tar", "gz", "7z", "rar",
    "pdf", "doc", "docx", "xls", "xlsx",
    "exe", "dll", "so", "dylib", "wasm", "pyc"
}

MAX_FILES_TO_PARSE = 250
MAX_CONTENT_LENGTH = 350_000


def should_skip_file(path: str) -> bool:
    """Check if file should be skipped from structural code parsing."""
    norm = path.replace("\\", "/").strip("/")
    parts = norm.split("/")

    # Check ignored directories
    if any(p in IGNORED_DIRS for p in parts[:-1]):
        return True

    # Check binary extensions
    if "." in parts[-1]:
        ext = parts[-1].rsplit(".", 1)[-1].lower()
        if ext in BINARY_EXTENSIONS:
            return True

    return False


def build_repository_model(
    owner: str,
    repo: str,
    file_tree: List[str],
    file_contents: Optional[Dict[str, str]] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> RepositoryModel:
    """
    Main entry point: build the complete, normalized RepositoryModel.
    """
    meta_dict = metadata or {}
    contents = file_contents or {}

    # 1. Build Metadata
    repo_meta = RepositoryMetadata(
        owner=owner,
        repo=repo,
        description=meta_dict.get("description"),
        default_branch=meta_dict.get("default_branch", "main"),
        latest_commit_sha=meta_dict.get("latest_commit_sha") or meta_dict.get("sha"),
        primary_language=meta_dict.get("language"),
        languages=meta_dict.get("languages", []),
        stars=meta_dict.get("stars", 0),
        forks=meta_dict.get("forks", 0),
        license=meta_dict.get("license"),
    )

    # 2. Technology & Framework Detection
    technologies = detect_technologies(file_tree, contents)

    # 3. Directory Structure
    directories: Dict[str, List[str]] = {}
    for f in file_tree:
        parent = posixpath.dirname(f.replace("\\", "/")) or "."
        if parent not in directories:
            directories[parent] = []
        if len(directories[parent]) < 100:
            directories[parent].append(posixpath.basename(f))

    # 4. Parse Files & Extract Symbols
    parsed_files: Dict[str, FileModel] = {}
    all_symbols: List[SymbolModel] = []
    all_routes: List[RouteModel] = []
    all_db_models: List[DatabaseModel] = []
    warnings: List[str] = []

    # Check for Prisma schema file
    for path, code in contents.items():
        if path.endswith(".prisma") or posixpath.basename(path) == "schema.prisma":
            _extract_prisma_models(path, code, all_db_models)

    # Prioritize candidate files to parse
    candidates = []
    for path in file_tree:
        if not should_skip_file(path):
            candidates.append(path)

    # Parse candidate files (up to limit)
    parsed_count = 0
    for path in candidates:
        if parsed_count >= MAX_FILES_TO_PARSE:
            warnings.append(f"Parsing truncated at {MAX_FILES_TO_PARSE} files for performance.")
            break

        norm_path = path.replace("\\", "/")
        name = posixpath.basename(norm_path)
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        content = contents.get(path, "")

        if len(content) > MAX_CONTENT_LENGTH:
            content = content[:MAX_CONTENT_LENGTH]

        lang = _detect_file_language(ext)

        parsed_data = None
        if content:
            if lang in ("JavaScript", "TypeScript"):
                parsed_data = parse_js_ts_file(norm_path, content)
            elif lang == "Python":
                parsed_data = parse_python_file(norm_path, content)

        if parsed_data:
            parsed_count += 1
            file_routes = parsed_data.get("routes", [])
            all_routes.extend(file_routes)

            file_db_models = parsed_data.get("database_models", [])
            all_db_models.extend(file_db_models)

            file_symbols = parsed_data.get("symbols", [])
            all_symbols.extend(file_symbols)

            file_model = FileModel(
                path=norm_path,
                name=name,
                extension=ext,
                language=lang,
                size=len(content),
                category="unknown",
                purpose="",
                imports=parsed_data.get("imports", []),
                exports=parsed_data.get("exports", []),
                classes=parsed_data.get("classes", []),
                functions=parsed_data.get("functions", []),
                constants=parsed_data.get("constants", []),
                routes=file_routes,
                dependencies=[],
                dependents=[],
                env_vars=parsed_data.get("env_vars", []),
                confidence=1.0,
            )
        else:
            # File metadata without deep AST parsing
            file_model = FileModel(
                path=norm_path,
                name=name,
                extension=ext,
                language=lang,
                size=len(content),
                category="unknown",
                purpose="",
                imports=[],
                exports=[],
                classes=[],
                functions=[],
                constants=[],
                routes=[],
                dependencies=[],
                dependents=[],
                env_vars=[],
                confidence=0.8,
            )

        # Classify the file
        file_model.category = classify_file(file_model, technologies, file_tree)
        parsed_files[norm_path] = file_model

    # 5. Dependency Graph & Reverse Dependents Resolution
    tsconfig_content = contents.get("tsconfig.json") or ""
    dependency_edges = resolve_repository_dependencies(parsed_files, file_tree, tsconfig_content)

    # 6. Entry Point Detection
    entry_points = _detect_entry_points(parsed_files, contents)

    # 7. Architecture Layers Mapping
    architecture_layers = _map_architecture_layers(parsed_files)

    return RepositoryModel(
        metadata=repo_meta,
        technologies=technologies,
        directories=directories,
        files=parsed_files,
        symbols=all_symbols,
        dependencies=dependency_edges,
        entry_points=entry_points,
        api_routes=all_routes,
        database_models=all_db_models,
        architecture_layers=architecture_layers,
        warnings=warnings,
    )


def _detect_file_language(extension: str) -> str:
    ext_map = {
        "py": "Python",
        "js": "JavaScript",
        "mjs": "JavaScript",
        "cjs": "JavaScript",
        "jsx": "JavaScript",
        "ts": "TypeScript",
        "tsx": "TypeScript",
        "json": "JSON",
        "html": "HTML",
        "css": "CSS",
        "scss": "SCSS",
        "md": "Markdown",
        "sql": "SQL",
        "prisma": "Prisma",
        "sh": "Shell",
        "yaml": "YAML",
        "yml": "YAML",
    }
    return ext_map.get(extension.lower(), "Unknown")


def _extract_prisma_models(path: str, content: str, out_models: List[DatabaseModel]):
    """Extract model declarations from schema.prisma files."""
    for match in re.finditer(r"model\s+([a-zA-Z0-9_]+)\s*\{([^}]+)\}", content):
        name = match.group(1)
        body = match.group(2)
        fields = []
        for line in body.splitlines():
            line = line.strip()
            if line and not line.startswith("//") and not line.startswith("@@"):
                parts = line.split()
                if len(parts) >= 2:
                    fields.append({"name": parts[0], "type": parts[1]})
        out_models.append(DatabaseModel(
            name=name,
            file=path,
            framework="prisma",
            fields=fields,
            relationships=[]
        ))


def _detect_entry_points(
    files: Dict[str, FileModel],
    contents: Dict[str, str]
) -> List[EntryPoint]:
    """Detect application entry points with confidence and evidence."""
    entry_points: List[EntryPoint] = []
    seen: Set[str] = set()

    for path, model in files.items():
        name = model.name.lower()
        content = contents.get(path, "")

        # 1. Python CLI / Service Entrypoint
        if model.language == "Python":
            if '__name__ == "__main__"' in content or "__name__ == '__main__'" in content:
                if path not in seen:
                    seen.add(path)
                    entry_points.append(EntryPoint(
                        path=path,
                        type="cli/service",
                        confidence=0.95,
                        evidence="Contains standard '__main__' execution block"
                    ))
            elif name in ("main.py", "app.py", "manage.py", "wsgi.py"):
                if path not in seen:
                    seen.add(path)
                    entry_points.append(EntryPoint(
                        path=path,
                        type="web-backend",
                        confidence=0.90,
                        evidence=f"Standard Python root entrypoint: {name}"
                    ))

        # 2. Frontend / Next.js Entrypoint
        if model.category == "entrypoint" or name in ("main.tsx", "main.jsx", "index.tsx", "index.jsx", "layout.tsx"):
            if "createRoot(" in content or "ReactDOM.render(" in content:
                if path not in seen:
                    seen.add(path)
                    entry_points.append(EntryPoint(
                        path=path,
                        type="web-frontend",
                        confidence=0.95,
                        evidence="React DOM bootstrap call detected (createRoot / render)"
                    ))
            elif "layout.tsx" in path or "layout.jsx" in path:
                if path not in seen:
                    seen.add(path)
                    entry_points.append(EntryPoint(
                        path=path,
                        type="web-frontend",
                        confidence=0.90,
                        evidence="Next.js App Router root layout entrypoint"
                    ))
            elif path not in seen and model.category == "entrypoint":
                seen.add(path)
                entry_points.append(EntryPoint(
                    path=path,
                    type="entrypoint",
                    confidence=0.85,
                    evidence=f"Standard application entrypoint filename: {name}"
                ))

        # 3. Express / Node.js Server Entrypoint
        if model.language in ("JavaScript", "TypeScript") and (name in ("server.js", "server.ts", "index.js", "index.ts", "app.js", "app.ts")):
            if ".listen(" in content:
                if path not in seen:
                    seen.add(path)
                    entry_points.append(EntryPoint(
                        path=path,
                        type="web-backend",
                        confidence=0.95,
                        evidence="Node/Express HTTP server bootstrap (.listen call detected)"
                    ))

    return entry_points


def _map_architecture_layers(files: Dict[str, FileModel]) -> Dict[str, List[str]]:
    """Infer architecture layers from categorized files."""
    layers: Dict[str, List[str]] = {
        "UI & Components": [],
        "Pages": [],
        "API & Routes": [],
        "Controllers": [],
        "Services & Business Logic": [],
        "Models & Entities": [],
        "Database & Migrations": [],
        "Middleware": [],
        "Utilities & Helpers": [],
        "Configuration": [],
        "Testing": [],
        "Build & Deployment": [],
    }

    for path, model in files.items():
        cat = model.category
        if cat == "frontend-component":
            layers["UI & Components"].append(path)
        elif cat == "frontend-page":
            layers["Pages"].append(path)
        elif cat == "backend-route":
            layers["API & Routes"].append(path)
        elif cat == "controller":
            layers["Controllers"].append(path)
        elif cat == "service":
            layers["Services & Business Logic"].append(path)
        elif cat == "model":
            layers["Models & Entities"].append(path)
        elif cat == "database":
            layers["Database & Migrations"].append(path)
        elif cat == "middleware":
            layers["Middleware"].append(path)
        elif cat == "utility":
            layers["Utilities & Helpers"].append(path)
        elif cat == "config":
            layers["Configuration"].append(path)
        elif cat == "test":
            layers["Testing"].append(path)
        elif cat in ("build", "deployment"):
            layers["Build & Deployment"].append(path)

    # Filter out empty layers
    return {k: v for k, v in layers.items() if v}


# Alias analyze_repository_structure to build_repository_model
analyze_repository_structure = build_repository_model
