"""
repo_intelligence/frameworks.py
Ecosystem, framework, and tooling detection with confidence levels and concrete evidence.
Analyzes manifests (package.json, requirements.txt, pyproject.toml, pom.xml, etc.),
config files, file extensions, and code-level imports.
"""

import json
import re
from typing import List, Dict, Any, Optional
from repo_intelligence.models import TechnologyDetection


def detect_technologies(
    file_tree: List[str],
    file_contents: Optional[Dict[str, str]] = None
) -> List[TechnologyDetection]:
    """
    Detect languages, frameworks, ORMs, and build tools with confidence and evidence.
    """
    detections: List[TechnologyDetection] = []
    tree_set = set(file_tree)
    contents = file_contents or {}

    # Helper: read manifest content from contents or return empty
    def get_content(filename: str) -> str:
        for path, text in contents.items():
            if path == filename or path.endswith(f"/{filename}"):
                return text
        return ""

    # Parse package.json if present
    pkg_json_data = {}
    pkg_content = get_content("package.json")
    if pkg_content:
        try:
            pkg_json_data = json.loads(pkg_content)
        except Exception:
            pass

    pkg_deps = set()
    if pkg_json_data:
        pkg_deps.update((pkg_json_data.get("dependencies") or {}).keys())
        pkg_deps.update((pkg_json_data.get("devDependencies") or {}).keys())

    # Parse Python dependencies
    py_deps = set()
    req_content = get_content("requirements.txt")
    if req_content:
        for line in req_content.splitlines():
            line = line.strip().lower()
            if line and not line.startswith("#"):
                pkg_name = re.split(r"[><=~;!]", line)[0].strip()
                if pkg_name:
                    py_deps.add(pkg_name)

    pyproject_content = get_content("pyproject.toml")
    if pyproject_content:
        for match in re.finditer(r'["\']([a-zA-Z0-9_\-]+)[><=~]', pyproject_content):
            py_deps.add(match.group(1).lower())

    # Count extensions
    ext_counts: Dict[str, int] = {}
    for path in file_tree:
        parts = path.rsplit(".", 1)
        if len(parts) == 2:
            ext = parts[1].lower()
            ext_counts[ext] = ext_counts.get(ext, 0) + 1

    # --- 1. FRONTEND FRAMEWORKS ---
    if "next" in pkg_deps or any("next.config" in f for f in tree_set):
        evidence_items = []
        if "next" in pkg_deps:
            evidence_items.append("'next' in package.json")
        if any("next.config" in f for f in tree_set):
            evidence_items.append("Next.js configuration file present")
        detections.append(TechnologyDetection(
            name="Next.js",
            category="frontend",
            confidence="high",
            evidence=", ".join(evidence_items)
        ))

    if "react" in pkg_deps or ext_counts.get("tsx", 0) > 0 or ext_counts.get("jsx", 0) > 0:
        evidence_items = []
        if "react" in pkg_deps:
            evidence_items.append("'react' in package.json")
        jsx_count = ext_counts.get("tsx", 0) + ext_counts.get("jsx", 0)
        if jsx_count > 0:
            evidence_items.append(f"{jsx_count} JSX/TSX component files")
        detections.append(TechnologyDetection(
            name="React",
            category="frontend",
            confidence="high",
            evidence=", ".join(evidence_items)
        ))

    if "vue" in pkg_deps or ext_counts.get("vue", 0) > 0 or any("vue.config" in f for f in tree_set):
        detections.append(TechnologyDetection(
            name="Vue",
            category="frontend",
            confidence="high",
            evidence=f"Vue dependencies or {ext_counts.get('vue', 0)} .vue component files detected"
        ))

    if "@angular/core" in pkg_deps or "angular.json" in tree_set:
        detections.append(TechnologyDetection(
            name="Angular",
            category="frontend",
            confidence="high",
            evidence="Angular core package or angular.json detected"
        ))

    if "svelte" in pkg_deps or ext_counts.get("svelte", 0) > 0:
        detections.append(TechnologyDetection(
            name="Svelte",
            category="frontend",
            confidence="high",
            evidence=f"Svelte dependencies or {ext_counts.get('svelte', 0)} .svelte files detected"
        ))

    # --- 2. BACKEND FRAMEWORKS ---
    if "express" in pkg_deps:
        detections.append(TechnologyDetection(
            name="Express",
            category="backend",
            confidence="high",
            evidence="'express' declared in package.json dependencies"
        ))
    elif any("express" in text.lower() for text in contents.values() if text):
        detections.append(TechnologyDetection(
            name="Express",
            category="backend",
            confidence="medium",
            evidence="Express imports detected in source files"
        ))

    if "@nestjs/core" in pkg_deps:
        detections.append(TechnologyDetection(
            name="NestJS",
            category="backend",
            confidence="high",
            evidence="'@nestjs/core' declared in package.json"
        ))

    if "flask" in py_deps or any("from flask import" in text or "import flask" in text for text in contents.values() if text):
        evidence_items = []
        if "flask" in py_deps:
            evidence_items.append("'flask' in requirements/manifest")
        else:
            evidence_items.append("Flask imports detected in Python code")
        detections.append(TechnologyDetection(
            name="Flask",
            category="backend",
            confidence="high",
            evidence=", ".join(evidence_items)
        ))

    if "fastapi" in py_deps or any("from fastapi import" in text or "import fastapi" in text for text in contents.values() if text):
        evidence_items = []
        if "fastapi" in py_deps:
            evidence_items.append("'fastapi' in requirements/manifest")
        else:
            evidence_items.append("FastAPI imports detected in Python code")
        detections.append(TechnologyDetection(
            name="FastAPI",
            category="backend",
            confidence="high",
            evidence=", ".join(evidence_items)
        ))

    if "django" in py_deps or "manage.py" in tree_set or any("from django" in text for text in contents.values() if text):
        evidence_items = []
        if "manage.py" in tree_set:
            evidence_items.append("manage.py root file present")
        if "django" in py_deps:
            evidence_items.append("'django' in dependencies")
        detections.append(TechnologyDetection(
            name="Django",
            category="backend",
            confidence="high",
            evidence=", ".join(evidence_items)
        ))

    pom_content = get_content("pom.xml")
    gradle_content = get_content("build.gradle") or get_content("build.gradle.kts")
    if "spring-boot" in pom_content or "spring-boot" in gradle_content or "springframework" in pom_content:
        detections.append(TechnologyDetection(
            name="Spring Boot",
            category="backend",
            confidence="high",
            evidence="Spring Boot dependencies detected in Maven/Gradle manifest"
        ))

    # --- 3. DATABASE / ORM ---
    if any(f.endswith(".prisma") or f == "schema.prisma" for f in tree_set) or "@prisma/client" in pkg_deps or "prisma" in pkg_deps:
        detections.append(TechnologyDetection(
            name="Prisma",
            category="orm",
            confidence="high",
            evidence="schema.prisma schema file or Prisma client dependency detected"
        ))

    if "sqlalchemy" in py_deps or any("sqlalchemy" in text.lower() or "db.model" in text.lower() for text in contents.values() if text):
        detections.append(TechnologyDetection(
            name="SQLAlchemy",
            category="orm",
            confidence="high",
            evidence="SQLAlchemy dependency or model definitions in Python code"
        ))

    if "mongoose" in pkg_deps or any("mongoose" in text.lower() for text in contents.values() if text):
        detections.append(TechnologyDetection(
            name="Mongoose",
            category="orm",
            confidence="high",
            evidence="'mongoose' package declared in package.json or source code"
        ))

    if "typeorm" in pkg_deps:
        detections.append(TechnologyDetection(
            name="TypeORM",
            category="orm",
            confidence="high",
            evidence="'typeorm' declared in package.json"
        ))

    if "sequelize" in pkg_deps:
        detections.append(TechnologyDetection(
            name="Sequelize",
            category="orm",
            confidence="high",
            evidence="'sequelize' declared in package.json"
        ))

    if "@supabase/supabase-js" in pkg_deps or "supabase" in py_deps:
        detections.append(TechnologyDetection(
            name="Supabase",
            category="database",
            confidence="high",
            evidence="Supabase SDK package declared in manifest"
        ))

    if "firebase" in pkg_deps or "firebase-admin" in pkg_deps or "firebase-admin" in py_deps:
        detections.append(TechnologyDetection(
            name="Firebase",
            category="database",
            confidence="high",
            evidence="Firebase SDK declared in dependencies"
        ))

    # --- 4. BUILD / TOOLING ---
    if "vite" in pkg_deps or any("vite.config" in f for f in tree_set):
        detections.append(TechnologyDetection(
            name="Vite",
            category="tooling",
            confidence="high",
            evidence="Vite configuration or package dependency detected"
        ))

    if "webpack" in pkg_deps or any("webpack.config" in f for f in tree_set):
        detections.append(TechnologyDetection(
            name="Webpack",
            category="tooling",
            confidence="high",
            evidence="Webpack configuration or package dependency detected"
        ))

    if "turbo.json" in tree_set or "turbo" in pkg_deps:
        detections.append(TechnologyDetection(
            name="Turborepo",
            category="tooling",
            confidence="high",
            evidence="turbo.json monorepo configuration present"
        ))

    if "nx.json" in tree_set or "@nrwl/workspace" in pkg_deps:
        detections.append(TechnologyDetection(
            name="Nx",
            category="tooling",
            confidence="high",
            evidence="nx.json workspace configuration present"
        ))

    # Package managers
    if "pnpm-lock.yaml" in tree_set:
        detections.append(TechnologyDetection(name="pnpm", category="tooling", confidence="high", evidence="pnpm-lock.yaml present"))
    elif "yarn.lock" in tree_set:
        detections.append(TechnologyDetection(name="yarn", category="tooling", confidence="high", evidence="yarn.lock present"))
    elif "package-lock.json" in tree_set:
        detections.append(TechnologyDetection(name="npm", category="tooling", confidence="high", evidence="package-lock.json present"))

    if "poetry.lock" in tree_set or "[tool.poetry]" in pyproject_content:
        detections.append(TechnologyDetection(name="Poetry", category="tooling", confidence="high", evidence="poetry.lock or pyproject.toml [tool.poetry] present"))
    elif "requirements.txt" in tree_set:
        detections.append(TechnologyDetection(name="pip", category="tooling", confidence="high", evidence="requirements.txt present"))

    if "pom.xml" in tree_set:
        detections.append(TechnologyDetection(name="Maven", category="tooling", confidence="high", evidence="pom.xml present"))
    if "build.gradle" in tree_set or "build.gradle.kts" in tree_set:
        detections.append(TechnologyDetection(name="Gradle", category="tooling", confidence="high", evidence="build.gradle present"))

    # --- 5. LANGUAGES ---
    if ext_counts.get("ts", 0) > 0 or ext_counts.get("tsx", 0) > 0 or "tsconfig.json" in tree_set:
        total_ts = ext_counts.get("ts", 0) + ext_counts.get("tsx", 0)
        detections.append(TechnologyDetection(
            name="TypeScript",
            category="language",
            confidence="high",
            evidence=f"{total_ts} TypeScript source files and/or tsconfig.json"
        ))

    if ext_counts.get("js", 0) > 0 or ext_counts.get("jsx", 0) > 0:
        total_js = ext_counts.get("js", 0) + ext_counts.get("jsx", 0)
        detections.append(TechnologyDetection(
            name="JavaScript",
            category="language",
            confidence="high",
            evidence=f"{total_js} JavaScript source files"
        ))

    if ext_counts.get("py", 0) > 0:
        detections.append(TechnologyDetection(
            name="Python",
            category="language",
            confidence="high",
            evidence=f"{ext_counts.get('py', 0)} Python source files"
        ))

    if ext_counts.get("java", 0) > 0:
        detections.append(TechnologyDetection(
            name="Java",
            category="language",
            confidence="high",
            evidence=f"{ext_counts.get('java', 0)} Java source files"
        ))

    if ext_counts.get("go", 0) > 0 or "go.mod" in tree_set:
        detections.append(TechnologyDetection(
            name="Go",
            category="language",
            confidence="high",
            evidence=f"{ext_counts.get('go', 0)} Go source files or go.mod present"
        ))

    if ext_counts.get("rs", 0) > 0 or "Cargo.toml" in tree_set:
        detections.append(TechnologyDetection(
            name="Rust",
            category="language",
            confidence="high",
            evidence=f"{ext_counts.get('rs', 0)} Rust source files or Cargo.toml present"
        ))

    return detections
