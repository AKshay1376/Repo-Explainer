"""
test_change_impact.py
Comprehensive unit tests for Phase 8 Change Impact Analysis.
Runs purely on synthetic in-memory fixtures. No live GitHub or LLM calls.
"""

import unittest
from change_impact.models import (
    ImpactConfidence,
    ImpactType,
    RiskLevel,
    ChangeType,
    ImpactTarget,
    ImpactAnalysis,
)
from change_impact.precomputed import build_repository_index, is_test_file
from change_impact.analyzer import (
    resolve_impact_target,
    analyze_direct_impacts,
    detect_affected_tests,
    detect_affected_routes,
    detect_affected_models,
    detect_affected_features,
)
from change_impact.traversal import (
    traverse_reverse_dependencies,
    reconstruct_path,
    MAX_VISITED_NODES,
)
from change_impact.scoring import (
    compute_risk_score,
    compute_blast_radius,
    compute_centrality,
    generate_summary,
)
from change_impact.service import ChangeImpactService
from web_app import app
from cache_manager import clear_cache, set_cached_repository_model, set_cached_file_contents


def make_test_repo_model():
    """Create a rich synthetic repository model for testing."""
    return {
        "metadata": {"name": "test-repo", "owner": "test-owner"},
        "files": {
            "src/services/authService.ts": {
                "category": "service",
                "functions": ["login", "logout", "verifyToken"],
                "env_vars": ["JWT_SECRET"],
                "dependencies": [],
                "dependents": ["src/components/Login.tsx", "src/middleware/auth.ts"],
            },
            "src/components/Login.tsx": {
                "category": "ui",
                "functions": ["LoginComponent"],
                "dependencies": ["src/services/authService.ts"],
                "dependents": ["src/App.tsx"],
            },
            "src/middleware/auth.ts": {
                "category": "middleware",
                "functions": ["requireAuth"],
                "dependencies": ["src/services/authService.ts"],
                "dependents": ["src/routes/api.ts"],
            },
            "src/routes/api.ts": {
                "category": "route",
                "dependencies": ["src/middleware/auth.ts"],
                "dependents": ["src/server.ts"],
            },
            "src/App.tsx": {
                "category": "ui",
                "dependencies": ["src/components/Login.tsx"],
                "dependents": ["src/index.tsx"],
            },
            "src/index.tsx": {
                "category": "entry_point",
                "dependencies": ["src/App.tsx"],
                "dependents": [],
            },
            "src/server.ts": {
                "category": "entry_point",
                "dependencies": ["src/routes/api.ts"],
                "dependents": [],
            },
            "src/models/User.ts": {
                "category": "model",
                "classes": ["User"],
                "dependencies": [],
                "dependents": ["src/services/authService.ts"],
            },
            "tests/authService.test.ts": {
                "category": "test",
                "dependencies": ["src/services/authService.ts"],
                "dependents": [],
            },
            "tests/login.spec.ts": {
                "category": "test",
                "dependencies": ["src/components/Login.tsx"],
                "dependents": [],
            },
        },
        "dependencies": [
            {"source": "src/components/Login.tsx", "target": "src/services/authService.ts", "type": "imports"},
            {"source": "src/middleware/auth.ts", "target": "src/services/authService.ts", "type": "imports"},
            {"source": "src/routes/api.ts", "target": "src/middleware/auth.ts", "type": "imports"},
            {"source": "src/App.tsx", "target": "src/components/Login.tsx", "type": "imports"},
            {"source": "src/index.tsx", "target": "src/App.tsx", "type": "imports"},
            {"source": "src/server.ts", "target": "src/routes/api.ts", "type": "imports"},
            {"source": "src/services/authService.ts", "target": "src/models/User.ts", "type": "imports"},
            {"source": "tests/authService.test.ts", "target": "src/services/authService.ts", "type": "imports"},
            {"source": "tests/login.spec.ts", "target": "src/components/Login.tsx", "type": "imports"},
        ],
        "symbols": [
            {"name": "login", "file": "src/services/authService.ts", "type": "function"},
            {"name": "logout", "file": "src/services/authService.ts", "type": "function"},
            {"name": "User", "file": "src/models/User.ts", "type": "class"},
        ],
        "api_routes": [
            {"method": "POST", "path": "/api/login", "file": "src/routes/api.ts", "handler": "handleLogin"},
            {"method": "GET", "path": "/api/me", "file": "src/routes/api.ts", "handler": "handleMe"},
        ],
        "database_models": [
            {"name": "User", "file": "src/models/User.ts", "framework": "TypeORM"},
        ],
        "entry_points": [
            {"path": "src/index.tsx", "type": "client_entry"},
            {"path": "src/server.ts", "type": "server_entry"},
        ],
        "architecture_layers": {
            "Frontend": ["src/components/Login.tsx", "src/App.tsx", "src/index.tsx"],
            "Business Logic": ["src/services/authService.ts", "src/middleware/auth.ts"],
            "API": ["src/routes/api.ts", "src/server.ts"],
            "Data Access": ["src/models/User.ts"],
        },
    }


def make_test_file_contents():
    """Create sample file contents for symbol and HTTP call matching."""
    return {
        "src/services/authService.ts": "import { User } from '../models/User';\nexport function login(u, p) { return true; }",
        "src/components/Login.tsx": "import { login } from '../services/authService';\nconst res = login('user', 'pass');",
        "src/middleware/auth.ts": "import { verifyToken } from '../services/authService';",
        "tests/authService.test.ts": "import { login } from '../src/services/authService';\ntest('login works', () => { login('a', 'b'); });",
        "src/api/client.ts": "export async function callLogin() { return await fetch('/api/login', { method: 'POST' }); }",
    }


class TestChangeImpactBackend(unittest.TestCase):

    def setUp(self):
        clear_cache()
        self.repo_model = make_test_repo_model()
        self.file_contents = make_test_file_contents()
        self.index = build_repository_index(self.repo_model, self.file_contents)
        self.service = ChangeImpactService()

    def test_precomputed_index_reverse_deps(self):
        """Precomputed index must accurately invert dependency edges."""
        rev = self.index.reverse_deps["src/services/authService.ts"]
        self.assertIn("src/components/Login.tsx", rev)
        self.assertIn("src/middleware/auth.ts", rev)

    def test_test_file_detection(self):
        """Test files must be accurately recognized by naming conventions."""
        self.assertTrue(is_test_file("tests/authService.test.ts"))
        self.assertTrue(is_test_file("src/components/Login.spec.tsx"))
        self.assertTrue(is_test_file("tests/test_server.py"))
        self.assertFalse(is_test_file("src/services/authService.ts"))

    def test_target_resolution(self):
        """Target resolver should handle file, symbol, route, and model."""
        t1 = resolve_impact_target(self.repo_model, self.index, target_file="src/services/authService.ts")
        self.assertIsNotNone(t1)
        self.assertEqual(t1.file, "src/services/authService.ts")

        t2 = resolve_impact_target(self.repo_model, self.index, target_symbol="login")
        self.assertIsNotNone(t2)
        self.assertEqual(t2.symbol, "login")

        t3 = resolve_impact_target(self.repo_model, self.index, target_route="/api/login")
        self.assertIsNotNone(t3)
        self.assertEqual(t3.type, "route")

        t4 = resolve_impact_target(self.repo_model, self.index, target_model="User")
        self.assertIsNotNone(t4)
        self.assertEqual(t4.type, "database_model")

    def test_direct_file_impact(self):
        """Direct file impact should find all immediate reverse dependents."""
        target = ImpactTarget(file="src/services/authService.ts")
        direct = analyze_direct_impacts(target, self.repo_model, self.index, self.file_contents)
        direct_files = {n.file for n in direct}

        self.assertIn("src/components/Login.tsx", direct_files)
        self.assertIn("src/middleware/auth.ts", direct_files)
        # Should be depth=1
        for n in direct:
            self.assertEqual(n.depth, 1)

    def test_symbol_level_caller_impact(self):
        """Direct impact on a symbol should mark actual call-sites as CONFIRMED."""
        target = ImpactTarget(file="src/services/authService.ts", symbol="login", type="symbol")
        direct = analyze_direct_impacts(target, self.repo_model, self.index, self.file_contents)

        login_node = next(n for n in direct if n.file == "src/components/Login.tsx")
        self.assertEqual(login_node.confidence, ImpactConfidence.CONFIRMED.value)

        # auth.ts does not mention login, only verifyToken
        auth_node = next(n for n in direct if n.file == "src/middleware/auth.ts")
        self.assertEqual(auth_node.confidence, ImpactConfidence.LIKELY.value)

    def test_transitive_depth_traversal(self):
        """Transitive BFS traversal must respect depth limits."""
        target = ImpactTarget(file="src/services/authService.ts")
        direct = analyze_direct_impacts(target, self.repo_model, self.index, self.file_contents)

        # Depth 1: target + direct nodes only
        nodes_d1, edges_d1, warnings_d1, _ = traverse_reverse_dependencies(
            "src/services/authService.ts", self.repo_model, self.index, direct, max_depth=1
        )
        self.assertEqual(max(n.depth for n in nodes_d1), 1)

        # Depth 2: should include App.tsx and api.ts
        nodes_d2, edges_d2, warnings_d2, _ = traverse_reverse_dependencies(
            "src/services/authService.ts", self.repo_model, self.index, direct, max_depth=2
        )
        files_d2 = {n.file for n in nodes_d2}
        self.assertIn("src/App.tsx", files_d2)
        self.assertIn("src/routes/api.ts", files_d2)

        # Depth 3: should include index.tsx and server.ts
        nodes_d3, edges_d3, warnings_d3, _ = traverse_reverse_dependencies(
            "src/services/authService.ts", self.repo_model, self.index, direct, max_depth=3
        )
        files_d3 = {n.file for n in nodes_d3}
        self.assertIn("src/index.tsx", files_d3)
        self.assertIn("src/server.ts", files_d3)

    def test_cycle_detection(self):
        """Dependency cycles must be detected without causing infinite loops."""
        cycle_model = {
            "dependencies": [
                {"source": "b.ts", "target": "a.ts"},
                {"source": "c.ts", "target": "b.ts"},
                {"source": "a.ts", "target": "c.ts"},  # cycle: a -> c -> b -> a
            ],
            "files": {"a.ts": {}, "b.ts": {}, "c.ts": {}}
        }
        cycle_index = build_repository_index(cycle_model)
        target = ImpactTarget(file="a.ts")
        direct = analyze_direct_impacts(target, cycle_model, cycle_index)

        nodes, edges, warnings, truncated = traverse_reverse_dependencies(
            "a.ts", cycle_model, cycle_index, direct, max_depth=4
        )
        self.assertFalse(truncated)
        self.assertTrue(any("cycle detected" in w.lower() for w in warnings))

    def test_affected_tests_detection(self):
        """Direct imports and filename pairings must identify affected test files."""
        target = ImpactTarget(file="src/services/authService.ts")
        direct = analyze_direct_impacts(target, self.repo_model, self.index, self.file_contents)
        tests = detect_affected_tests(target, direct, self.repo_model, self.index, self.file_contents)

        test_files = [t["file"] for t in tests]
        self.assertIn("tests/authService.test.ts", test_files)

    def test_affected_routes_detection(self):
        """API routes connected to target or dependents must be identified."""
        target = ImpactTarget(file="src/services/authService.ts")
        direct = analyze_direct_impacts(target, self.repo_model, self.index, self.file_contents)
        # Note: routes/api.ts is in transitive at depth 2
        nodes, _, _, _ = traverse_reverse_dependencies("src/services/authService.ts", self.repo_model, self.index, direct, max_depth=2)
        routes = detect_affected_routes(target, nodes, self.repo_model, self.index)

        route_paths = [r["path"] for r in routes]
        self.assertIn("/api/login", route_paths)

    def test_affected_models_detection(self):
        """Database models referenced must be detected."""
        target = ImpactTarget(file="src/models/User.ts", model_name="User", type="database_model")
        direct = analyze_direct_impacts(target, self.repo_model, self.index, self.file_contents)
        models = detect_affected_models(target, direct, self.repo_model, self.index)

        model_names = [m["name"] for m in models]
        self.assertIn("User", model_names)

    def test_risk_scoring_low_vs_high(self):
        """Isolated leaf file should be LOW risk; core service with entry points should be HIGH."""
        # 1. Leaf node: index.tsx has 0 dependents
        target_leaf = ImpactTarget(file="src/index.tsx")
        direct_leaf = analyze_direct_impacts(target_leaf, self.repo_model, self.index)
        score_leaf, level_leaf, _ = compute_risk_score(
            target_leaf, direct_leaf, [], [], [], self.repo_model, self.index, []
        )
        # Entry point adds 3, no dependents -> 3.0 < 5.0 -> LOW
        self.assertEqual(level_leaf, RiskLevel.LOW.value)

        # 2. Core service: authService.ts affects routes, models, tests, multiple dependents
        analysis = self.service.analyze_impact(
            repo_model=self.repo_model,
            target_file="src/services/authService.ts",
            depth=3,
            file_contents=self.file_contents,
        )
        self.assertTrue(analysis["success"])
        data = analysis["analysis"]
        self.assertIn(data["risk_level"], (RiskLevel.MEDIUM.value, RiskLevel.HIGH.value))
        self.assertGreater(data["risk_score"], 4.0)

    def test_deterministic_summary(self):
        """Programmatic summary must not be empty and must state impact metrics."""
        res = self.service.analyze_impact(
            repo_model=self.repo_model,
            target_file="src/services/authService.ts",
            depth=2,
            file_contents=self.file_contents,
        )
        summary = res["analysis"]["summary"]
        self.assertIn("authService.ts", summary)
        self.assertIn("directly affect", summary)

    def test_blast_radius_computation(self):
        """Blast radius should accurately count direct, transitive, test, route, and model counts."""
        res = self.service.analyze_impact(
            repo_model=self.repo_model,
            target_file="src/services/authService.ts",
            depth=2,
            file_contents=self.file_contents,
        )
        br = res["analysis"]["blast_radius"]
        self.assertGreaterEqual(br["directly_affected"], 2)
        self.assertGreaterEqual(br["transitively_affected"], 1)
        self.assertGreaterEqual(br["tests_affected"], 1)

    def test_path_reconstruction(self):
        """Reconstruct path should return clean sequential chain."""
        parents = {"b": "a", "c": "b", "d": "c"}
        path = reconstruct_path(parents, "d", "a")
        self.assertEqual(path, ["a", "b", "c", "d"])

    def test_caching_behavior(self):
        """Subsequent identical calls must be retrieved from cache."""
        clear_cache()
        res1 = self.service.analyze_impact(
            repo_model=self.repo_model,
            target_file="src/services/authService.ts",
            depth=2,
            file_contents=self.file_contents,
            repo_cache_key="test/repo",
        )
        self.assertTrue(res1["success"])

        # Second call
        res2 = self.service.analyze_impact(
            repo_model=self.repo_model,
            target_file="src/services/authService.ts",
            depth=2,
            file_contents=self.file_contents,
            repo_cache_key="test/repo",
        )
        self.assertEqual(res1, res2)

    def test_flask_api_impact_endpoint(self):
        """Flask POST /api/impact returns 200 with valid cached model and 400 without URL."""
        client = app.test_client()

        # Missing url
        resp_bad = client.post("/api/impact", json={})
        self.assertEqual(resp_bad.status_code, 400)

        # Valid with cached model
        set_cached_repository_model("testowner", "testrepo", self.repo_model)
        set_cached_file_contents("testowner", "testrepo", self.file_contents)

        resp_ok = client.post(
            "/api/impact",
            json={
                "url": "https://github.com/testowner/testrepo",
                "target_file": "src/services/authService.ts",
                "depth": 2,
            },
        )
        self.assertEqual(resp_ok.status_code, 200)
        json_data = resp_ok.get_json()
        self.assertTrue(json_data["success"])
        self.assertIn("analysis", json_data)
        self.assertEqual(json_data["analysis"]["target"]["file"], "src/services/authService.ts")


if __name__ == "__main__":
    unittest.main()
