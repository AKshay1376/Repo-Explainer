"""
test_execution_trace.py
Comprehensive unit tests for Execution Path Tracing (Phase 7).
Tests static HTTP client extraction, frontend-backend route bridging, symbol-level calls,
cycle detection, max-depth protection, path ranking, and the Flask /api/trace endpoint.
"""

import unittest
from unittest.mock import MagicMock, patch

from execution_trace.models import (
    StepType,
    ConfidenceLevel,
    ExecutionStep,
    ExecutionEdge,
    ExecutionFlow,
)
from execution_trace.matcher import (
    extract_http_client_calls,
    match_http_client_to_routes,
    resolve_trace_start_points,
    infer_step_type,
    normalize_route_path,
)
from execution_trace.traversal import traverse_execution_paths, find_called_symbols_in_content
from execution_trace.ranking import score_path, rank_and_synthesize_flows
from execution_trace.service import ExecutionTraceService


# Synthetic Full-Stack Web App Fixture (React + Express + Prisma)
FULLSTACK_MODEL = {
    "metadata": {
        "owner": "demo",
        "repo": "fullstack-shop",
        "description": "Fullstack e-commerce demo",
        "primary_language": "TypeScript",
    },
    "files": {
        "src/components/LoginForm.tsx": {
            "path": "src/components/LoginForm.tsx",
            "category": "frontend-component",
            "dependencies": ["src/services/authService.ts"],
            "dependents": [],
            "classes": [],
            "functions": ["handleSubmit", "LoginForm"],
        },
        "src/services/authService.ts": {
            "path": "src/services/authService.ts",
            "category": "service",
            "dependencies": [],
            "dependents": ["src/components/LoginForm.tsx"],
            "classes": ["AuthService"],
            "functions": ["login", "register"],
        },
        "server/routes/auth.ts": {
            "path": "server/routes/auth.ts",
            "category": "backend-route",
            "dependencies": ["server/controllers/authController.ts"],
            "dependents": [],
            "classes": [],
            "functions": [],
        },
        "server/controllers/authController.ts": {
            "path": "server/controllers/authController.ts",
            "category": "controller",
            "dependencies": ["server/services/userService.ts"],
            "dependents": ["server/routes/auth.ts"],
            "classes": ["AuthController"],
            "functions": ["loginHandler"],
        },
        "server/services/userService.ts": {
            "path": "server/services/userService.ts",
            "category": "service",
            "dependencies": ["server/models/User.ts"],
            "dependents": ["server/controllers/authController.ts"],
            "classes": ["UserService"],
            "functions": ["validateCredentials"],
        },
        "server/models/User.ts": {
            "path": "server/models/User.ts",
            "category": "model",
            "dependencies": [],
            "dependents": ["server/services/userService.ts"],
            "classes": ["UserModel"],
            "functions": ["findUnique"],
        },
    },
    "symbols": [
        {"name": "LoginForm", "type": "component", "file": "src/components/LoginForm.tsx", "line": 5},
        {"name": "handleSubmit", "type": "function", "file": "src/components/LoginForm.tsx", "line": 12},
        {"name": "login", "type": "function", "file": "src/services/authService.ts", "line": 8},
        {"name": "loginHandler", "type": "function", "file": "server/controllers/authController.ts", "line": 15},
        {"name": "validateCredentials", "type": "function", "file": "server/services/userService.ts", "line": 20},
        {"name": "findUnique", "type": "method", "file": "server/models/User.ts", "line": 10},
    ],
    "api_routes": [
        {"method": "POST", "path": "/api/v1/login", "file": "server/routes/auth.ts", "handler": "loginHandler"},
    ],
    "database_models": [
        {"name": "User", "file": "server/models/User.ts", "framework": "prisma", "fields": [{"name": "id"}, {"name": "email"}]}
    ],
    "entry_points": [
        {"path": "server/index.ts", "type": "web-backend", "confidence": 1.0, "evidence": "Express app listener"}
    ],
}

FULLSTACK_CONTENTS = {
    "src/components/LoginForm.tsx": """
import React from 'react';
import { login } from '../services/authService';

export const LoginForm = () => {
    const handleSubmit = async (e) => {
        e.preventDefault();
        await login({ email, password });
    };
    return <form onSubmit={handleSubmit}><button>Login</button></form>;
};
""",
    "src/services/authService.ts": """
import axios from 'axios';

export const login = async (creds) => {
    const res = await axios.post('/api/v1/login', creds);
    return res.data;
};
""",
    "server/routes/auth.ts": """
import { Router } from 'express';
import { loginHandler } from '../controllers/authController';
const router = Router();
router.post('/api/v1/login', loginHandler);
export default router;
""",
    "server/controllers/authController.ts": """
import { validateCredentials } from '../services/userService';

export const loginHandler = async (req, res) => {
    const user = await validateCredentials(req.body.email, req.body.password);
    return res.json(user);
};
""",
    "server/services/userService.ts": """
import { UserModel } from '../models/User';

export const validateCredentials = async (email, password) => {
    return await UserModel.findUnique({ where: { email } });
};
""",
}


class TestHttpClientExtraction(unittest.TestCase):
    def test_extract_axios_post(self):
        code = "const res = await axios.post('/api/v1/login', credentials);"
        calls = extract_http_client_calls("src/auth.ts", code)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["method"], "POST")
        self.assertEqual(calls[0]["path"], "/api/v1/login")

    def test_extract_fetch_post(self):
        code = "fetch('/api/checkout', { method: 'POST', body: JSON.stringify(data) });"
        calls = extract_http_client_calls("src/checkout.ts", code)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["method"], "POST")
        self.assertEqual(calls[0]["path"], "/api/checkout")

    def test_match_http_call_to_backend_route(self):
        client_call = {"method": "POST", "path": "/api/v1/login"}
        routes = [{"method": "POST", "path": "/api/v1/login", "file": "server/routes/auth.ts"}]
        matched = match_http_client_to_routes(client_call, routes)
        self.assertIsNotNone(matched)
        self.assertEqual(matched["file"], "server/routes/auth.ts")

    def test_match_parameterized_route(self):
        client_call = {"method": "GET", "path": "/api/users/:param"}
        routes = [{"method": "GET", "path": "/api/users/:id", "file": "server/routes/users.ts"}]
        matched = match_http_client_to_routes(client_call, routes)
        self.assertIsNotNone(matched)


class TestStartingPointResolution(unittest.TestCase):
    def test_resolve_from_route(self):
        starts = resolve_trace_start_points(FULLSTACK_MODEL, route="POST /api/v1/login")
        self.assertEqual(len(starts), 1)
        self.assertEqual(starts[0].type, StepType.API_ROUTE)
        self.assertIn("POST /api/v1/login", starts[0].label)

    def test_resolve_from_file_and_symbol(self):
        starts = resolve_trace_start_points(
            FULLSTACK_MODEL,
            start_file="src/components/LoginForm.tsx",
            start_symbol="handleSubmit"
        )
        self.assertEqual(len(starts), 1)
        self.assertEqual(starts[0].symbol, "handleSubmit")
        self.assertEqual(starts[0].type, StepType.EVENT_HANDLER)

    def test_resolve_from_feature_query(self):
        starts = resolve_trace_start_points(FULLSTACK_MODEL, query="login")
        self.assertTrue(len(starts) >= 1)
        labels = [s.label for s in starts]
        # Should pick up either LoginForm UI component or POST route
        self.assertTrue(any("LoginForm" in l or "POST" in l for l in labels))


class TestPathTraversalAndBridges(unittest.TestCase):
    def test_end_to_end_fullstack_traversal(self):
        start_step = ExecutionStep(
            id="step-src/components/LoginForm.tsx-handleSubmit",
            file="src/components/LoginForm.tsx",
            symbol="handleSubmit",
            type=StepType.EVENT_HANDLER,
            label="handleSubmit()",
            architecture_layer="presentation",
            confidence=ConfidenceLevel.HIGH
        )

        paths = traverse_execution_paths(start_step, FULLSTACK_MODEL, FULLSTACK_CONTENTS)
        self.assertTrue(len(paths) >= 1)
        steps, edges, cycle, warnings = paths[0]

        files_in_path = [s.file for s in steps]
        # Must traverse across frontend -> HTTP call -> backend route -> controller -> service -> model
        self.assertIn("src/components/LoginForm.tsx", files_in_path)
        self.assertIn("src/services/authService.ts", files_in_path)
        self.assertIn("server/routes/auth.ts", files_in_path)
        self.assertIn("server/controllers/authController.ts", files_in_path)
        self.assertIn("server/services/userService.ts", files_in_path)
        self.assertIn("server/models/User.ts", files_in_path)

        # Check HTTP Request relationship
        http_edges = [e for e in edges if e.relationship == "HTTP Request"]
        self.assertEqual(len(http_edges), 1)
        self.assertEqual(http_edges[0].confidence, ConfidenceLevel.HIGH)

    def test_cycle_detection(self):
        cyclic_model = {
            "files": {
                "a.ts": {"dependencies": ["b.ts"], "category": "service"},
                "b.ts": {"dependencies": ["a.ts"], "category": "service"},
            },
            "symbols": [],
            "api_routes": [],
            "database_models": [],
        }
        start = ExecutionStep(id="step-a", file="a.ts", label="a.ts", type=StepType.SERVICE)
        paths = traverse_execution_paths(start, cyclic_model, {})
        self.assertTrue(len(paths) >= 1)
        steps, edges, cycle_detected, warnings = paths[0]
        self.assertTrue(cycle_detected)
        self.assertTrue(any("Dependency cycle detected" in w for w in warnings))

    def test_max_depth_bounding(self):
        # Build 15-node linear graph
        deep_files = {}
        for i in range(15):
            next_f = f"f_{i+1}.ts" if i < 14 else ""
            deep_files[f"f_{i}.ts"] = {
                "dependencies": [next_f] if next_f else [],
                "category": "service"
            }
        deep_model = {"files": deep_files, "symbols": [], "api_routes": [], "database_models": []}
        start = ExecutionStep(id="step-f_0", file="f_0.ts", label="f_0.ts", type=StepType.SERVICE)
        paths = traverse_execution_paths(start, deep_model, {})
        steps = paths[0][0]
        self.assertLessEqual(len(steps), 10)


class TestPathRankingAndFlowSynthesis(unittest.TestCase):
    def test_rank_and_synthesize_flows(self):
        step1 = ExecutionStep(id="s1", file="Login.tsx", type=StepType.UI_COMPONENT, label="Login")
        step2 = ExecutionStep(id="s2", file="auth.ts", type=StepType.SERVICE, label="login()")
        edge = ExecutionEdge(id="e1", source_step="s1", target_step="s2", relationship="calls", evidence="calls")

        raw_paths = [([step1, step2], [edge], False, [])]
        flows = rank_and_synthesize_flows(raw_paths, query="login")

        self.assertEqual(len(flows), 1)
        self.assertTrue(flows[0].is_primary)
        self.assertEqual(flows[0].title, "Login User Action Flow")
        self.assertIn("Execution Steps:", flows[0].description)


class TestExecutionTraceServiceAndAPI(unittest.TestCase):
    def setUp(self):
        from web_app import app
        from cache_manager import set_cached_repository_model, set_cached_file_contents
        app.config["TESTING"] = True
        self.client = app.test_client()
        set_cached_repository_model("demo", "fullstack-shop", FULLSTACK_MODEL)
        set_cached_file_contents("demo", "fullstack-shop", FULLSTACK_CONTENTS)

    def test_service_trace(self):
        service = ExecutionTraceService()
        res = service.trace_execution(FULLSTACK_MODEL, query="login", file_contents=FULLSTACK_CONTENTS)
        self.assertTrue(res["success"])
        self.assertGreaterEqual(res["total_flows"], 1)
        self.assertIsNotNone(res["primary_flow_id"])

    def test_api_trace_endpoint_success(self):
        res = self.client.post("/api/trace", json={
            "repo_url": "https://github.com/demo/fullstack-shop",
            "query": "login",
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertGreaterEqual(len(data["flows"]), 1)

    def test_api_trace_endpoint_missing_url(self):
        res = self.client.post("/api/trace", json={"query": "login"})
        self.assertEqual(res.status_code, 400)


if __name__ == "__main__":
    unittest.main()
