"""
test_repository_intelligence.py
Comprehensive unit tests for the Phase 3 Repository Intelligence Engine.
Tests all parsing, classification, framework detection, dependency graph resolution,
reverse dependents, API route detection, database models, and model serialization.
Uses 100% synthetic, in-memory fixtures without live network calls.
"""

import json
import unittest

from repo_intelligence.models import (
    RepositoryModel,
    RepositoryMetadata,
    FileModel,
    SymbolModel,
    DependencyEdge,
    RouteModel,
    DatabaseModel,
    EntryPoint,
    TechnologyDetection,
)
from repo_intelligence.frameworks import detect_technologies
from repo_intelligence.js_ts_parser import parse_js_ts_file, _parse_with_regex
from repo_intelligence.python_parser import parse_python_file
from repo_intelligence.classifier import classify_file
from repo_intelligence.resolver import (
    resolve_import_path,
    resolve_repository_dependencies,
    parse_tsconfig_paths,
)
from repo_intelligence.engine import build_repository_model
import cache_manager


class TestStructuralParsers(unittest.TestCase):

    def test_python_ast_parser(self):
        code = """
import os
from flask import Flask, request, jsonify
from .models import User

DEBUG_MODE = True

class UserService:
    def __init__(self, db):
        self.db = db
        
    def get_user(self, user_id: int):
        token = os.getenv("API_KEY")
        return {"id": user_id}

app = Flask(__name__)

@app.route("/api/users", methods=["GET", "POST"])
def handle_users():
    return jsonify([])

@app.route("/api/health")
def health():
    return "ok"
"""
        result = parse_python_file("services/user_service.py", code)

        self.assertIn("os", result["imports"])
        self.assertIn("flask", result["imports"])
        self.assertIn(".models", result["imports"])

        self.assertIn("UserService", result["classes"])
        self.assertIn("handle_users", result["functions"])
        self.assertIn("DEBUG_MODE", result["constants"])

        # Routes
        route_paths = [r.path for r in result["routes"]]
        self.assertIn("/api/users", route_paths)
        self.assertIn("/api/health", route_paths)

        # HTTP methods
        user_routes = [r for r in result["routes"] if r.path == "/api/users"]
        methods = {r.method for r in user_routes}
        self.assertTrue({"GET", "POST"}.issubset(methods))

        # Env vars
        self.assertIn("API_KEY", result["env_vars"])

        # Symbols
        sym_names = [s.name for s in result["symbols"]]
        self.assertIn("UserService", sym_names)
        self.assertIn("UserService.get_user", sym_names)
        self.assertIn("handle_users", sym_names)

    def test_python_sqlalchemy_model_detection(self):
        code = """
from sqlalchemy import Column, Integer, String
from database import Base

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True)
    name = Column(String(50), nullable=False)
"""
        result = parse_python_file("models/product.py", code)
        self.assertEqual(len(result["database_models"]), 1)
        model = result["database_models"][0]
        self.assertEqual(model.name, "Product")
        self.assertEqual(model.framework, "sqlalchemy")
        field_names = [f["name"] for f in model.fields]
        self.assertIn("id", field_names)
        self.assertIn("name", field_names)

    def test_javascript_typescript_parser(self):
        ts_code = """
import React, { useState, useEffect } from 'react';
import { fetchUsers } from '../services/userService';
const express = require('express');

export interface UserProps {
    id: string;
}

export function useUserStatus(userId: string) {
    const [online, setOnline] = useState(false);
    return online;
}

export const UserCard: React.FC<UserProps> = ({ id }) => {
    const isOnline = useUserStatus(id);
    const apiUrl = process.env.REACT_APP_API_URL;
    return <div className="card">User {id}</div>;
};

export default UserCard;
"""
        result = parse_js_ts_file("src/components/UserCard.tsx", ts_code)

        # Imports
        self.assertIn("react", result["imports"])
        self.assertIn("../services/userService", result["imports"])
        self.assertIn("express", result["imports"])

        # Components & Hooks
        self.assertIn("UserCard", result["components"])
        self.assertIn("useUserStatus", result["hooks"])

        # Env vars
        self.assertIn("REACT_APP_API_URL", result["env_vars"])

    def test_express_routes_detection(self):
        code = """
const express = require('express');
const router = express.Router();

router.get('/items', (req, res) => res.json([]));
router.post('/items', createItemHandler);
router.delete('/items/:id', (req, res) => res.sendStatus(204));

module.exports = router;
"""
        result = parse_js_ts_file("routes/items.js", code)
        methods = [(r.method, r.path) for r in result["routes"]]
        self.assertIn(("GET", "/items"), methods)
        self.assertIn(("POST", "/items"), methods)
        self.assertIn(("DELETE", "/items/:id"), methods)

    def test_nextjs_api_route_detection(self):
        code = """
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    return NextResponse.json({ message: 'hello' });
}

export async function POST(request: Request) {
    const body = await request.json();
    return NextResponse.json(body);
}
"""
        result = parse_js_ts_file("app/api/orders/route.ts", code)
        routes = result["routes"]
        self.assertEqual(len(routes), 2)
        methods = {r.method for r in routes}
        self.assertEqual(methods, {"GET", "POST"})
        for r in routes:
            self.assertEqual(r.path, "/api/orders")
            self.assertEqual(r.framework, "nextjs")

    def test_js_regex_fallback_matches_parser(self):
        code = """
import { helper } from './utils';
const auth = require('./auth');

export function calculateTotal(a, b) {
    return a + b;
}

const secret = process.env.JWT_SECRET;
"""
        result = _parse_with_regex("src/calc.js", code)
        self.assertIn("./utils", result["imports"])
        self.assertIn("./auth", result["imports"])
        self.assertIn("calculateTotal", result["functions"])
        self.assertIn("JWT_SECRET", result["env_vars"])


class TestFrameworkDetection(unittest.TestCase):

    def test_detect_react_vite_typescript(self):
        tree = [
            "package.json",
            "tsconfig.json",
            "vite.config.ts",
            "src/main.tsx",
            "src/App.tsx",
            "src/components/Header.tsx"
        ]
        contents = {
            "package.json": json.dumps({
                "dependencies": {"react": "^18.3.1", "react-dom": "^18.3.1"},
                "devDependencies": {"vite": "^6.0.0", "typescript": "^5.0.0"}
            })
        }
        detections = detect_technologies(tree, contents)
        names = {d.name for d in detections}

        self.assertIn("React", names)
        self.assertIn("Vite", names)
        self.assertIn("TypeScript", names)

        # Check evidence & confidence
        react_det = next(d for d in detections if d.name == "React")
        self.assertEqual(react_det.confidence, "high")
        self.assertIn("package.json", react_det.evidence)

    def test_detect_flask_sqlalchemy_poetry(self):
        tree = [
            "pyproject.toml",
            "poetry.lock",
            "app.py",
            "models/user.py"
        ]
        contents = {
            "pyproject.toml": """
[tool.poetry]
name = "demo"
[tool.poetry.dependencies]
python = "^3.11"
flask = "^3.0.0"
sqlalchemy = "^2.0.0"
""",
            "app.py": "from flask import Flask\nimport sqlalchemy"
        }
        detections = detect_technologies(tree, contents)
        names = {d.name for d in detections}

        self.assertIn("Flask", names)
        self.assertIn("SQLAlchemy", names)
        self.assertIn("Poetry", names)
        self.assertIn("Python", names)


class TestFileClassification(unittest.TestCase):

    def test_classification_roles(self):
        cases = [
            (FileModel(path="src/main.tsx", name="main.tsx", extension="tsx", language="TypeScript"), "entrypoint"),
            (FileModel(path="src/components/Navbar.tsx", name="Navbar.tsx", extension="tsx", language="TypeScript"), "frontend-component"),
            (FileModel(path="pages/index.tsx", name="index.tsx", extension="tsx", language="TypeScript"), "frontend-page"),
            (FileModel(path="routes/auth.js", name="auth.js", extension="js", language="JavaScript", routes=[RouteModel("POST", "/login", "routes/auth.js")]), "backend-route"),
            (FileModel(path="controllers/userController.ts", name="userController.ts", extension="ts", language="TypeScript"), "controller"),
            (FileModel(path="services/paymentService.ts", name="paymentService.ts", extension="ts", language="TypeScript"), "service"),
            (FileModel(path="models/User.py", name="User.py", extension="py", language="Python", classes=["User"]), "model"),
            (FileModel(path="prisma/schema.prisma", name="schema.prisma", extension="prisma", language="Prisma"), "database"),
            (FileModel(path="tests/test_user.py", name="test_user.py", extension="py", language="Python"), "test"),
            (FileModel(path="tsconfig.json", name="tsconfig.json", extension="json", language="JSON"), "config"),
            (FileModel(path="package.json", name="package.json", extension="json", language="JSON"), "build"),
            (FileModel(path="README.md", name="README.md", extension="md", language="Markdown"), "documentation"),
        ]

        for model, expected_role in cases:
            role = classify_file(model)
            self.assertEqual(role, expected_role, f"Failed for {model.path}: got {role}, expected {expected_role}")


class TestDependencyResolutionAndReverseDependents(unittest.TestCase):

    def test_relative_and_alias_resolution(self):
        tree = [
            "src/components/Navbar.tsx",
            "src/components/ui/icons.tsx",
            "src/services/authService.ts",
            "src/models/user.ts",
            "tsconfig.json"
        ]
        tsconfig = json.dumps({
            "compilerOptions": {
                "paths": {
                    "@/*": ["src/*"]
                }
            }
        })

        # Test relative import resolution
        res1 = resolve_import_path("./ui/icons", "src/components/Navbar.tsx", set(tree))
        self.assertEqual(res1, "src/components/ui/icons.tsx")

        # Test alias resolution
        res2 = resolve_import_path("@/models/user", "src/services/authService.ts", set(tree), parse_tsconfig_paths(tsconfig))
        self.assertEqual(res2, "src/models/user.ts")

    def test_dependency_graph_and_reverse_dependents(self):
        files = {
            "src/pages/Login.tsx": FileModel(
                path="src/pages/Login.tsx",
                name="Login.tsx",
                extension="tsx",
                language="TypeScript",
                category="frontend-page",
                imports=["../services/authService"]
            ),
            "src/pages/Register.tsx": FileModel(
                path="src/pages/Register.tsx",
                name="Register.tsx",
                extension="tsx",
                language="TypeScript",
                category="frontend-page",
                imports=["../services/authService"]
            ),
            "src/services/authService.ts": FileModel(
                path="src/services/authService.ts",
                name="authService.ts",
                extension="ts",
                language="TypeScript",
                category="service",
                imports=["../models/user"]
            ),
            "src/models/user.ts": FileModel(
                path="src/models/user.ts",
                name="user.ts",
                extension="ts",
                language="TypeScript",
                category="model",
                imports=[]
            ),
        }
        tree = list(files.keys())

        edges = resolve_repository_dependencies(files, tree)

        # Verify edges
        edge_pairs = [(e.source, e.target, e.type) for e in edges]
        self.assertIn(("src/pages/Login.tsx", "src/services/authService.ts", "component -> service"), edge_pairs)
        self.assertIn(("src/pages/Register.tsx", "src/services/authService.ts", "component -> service"), edge_pairs)
        self.assertIn(("src/services/authService.ts", "src/models/user.ts", "service -> model"), edge_pairs)

        # Verify reverse dependents: authService used by Login and Register
        auth_model = files["src/services/authService.ts"]
        self.assertIn("src/pages/Login.tsx", auth_model.dependents)
        self.assertIn("src/pages/Register.tsx", auth_model.dependents)

        # user.ts used by authService
        user_model = files["src/models/user.ts"]
        self.assertIn("src/services/authService.ts", user_model.dependents)


class TestRepositoryModelIntegrationAndCache(unittest.TestCase):

    def setUp(self):
        cache_manager.clear_cache()

    def test_build_repository_model_end_to_end(self):
        tree = [
            "package.json",
            "src/main.tsx",
            "src/App.tsx",
            "src/components/Header.tsx",
            "src/services/api.ts",
            "README.md"
        ]
        contents = {
            "package.json": json.dumps({"dependencies": {"react": "^18.0.0"}}),
            "src/main.tsx": """
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
createRoot(document.getElementById('root')!).render(<App />);
""",
            "src/App.tsx": """
import React from 'react';
import Header from './components/Header';
export default function App() { return <div><Header /></div>; }
""",
            "src/components/Header.tsx": """
import React from 'react';
export function Header() { return <header>Logo</header>; }
""",
            "src/services/api.ts": """
export function getApiUrl() { return process.env.API_URL || 'http://localhost'; }
""",
            "README.md": "# Demo Repository"
        }

        repo_model = build_repository_model(
            owner="demo-owner",
            repo="demo-repo",
            file_tree=tree,
            file_contents=contents,
            metadata={"stars": 50, "default_branch": "main"}
        )

        # Check metadata
        self.assertEqual(repo_model.metadata.owner, "demo-owner")
        self.assertEqual(repo_model.metadata.repo, "demo-repo")
        self.assertEqual(repo_model.metadata.stars, 50)

        # Check technologies
        tech_names = {t.name for t in repo_model.technologies}
        self.assertIn("React", tech_names)
        self.assertIn("TypeScript", tech_names)

        # Check entry points
        entry_paths = [e.path for e in repo_model.entry_points]
        self.assertIn("src/main.tsx", entry_paths)

        # Check architecture layers
        self.assertIn("UI & Components", repo_model.architecture_layers)
        self.assertIn("src/components/Header.tsx", repo_model.architecture_layers["UI & Components"])

        # Check JSON serialization
        as_dict = repo_model.to_dict()
        serialized = json.dumps(as_dict)
        self.assertTrue(len(serialized) > 0)
        self.assertEqual(as_dict["metadata"]["owner"], "demo-owner")

        # Check caching
        cache_manager.set_cached_repository_model("demo-owner", "demo-repo", as_dict, commit_sha="abc123")
        cached = cache_manager.get_cached_repository_model("demo-owner", "demo-repo", commit_sha="abc123")
        self.assertIsNotNone(cached)
        self.assertEqual(cached["metadata"]["repo"], "demo-repo")

        # Stats
        stats = cache_manager.get_cache_stats()
        self.assertEqual(stats["repository_model_count"], 1)


if __name__ == "__main__":
    unittest.main()
