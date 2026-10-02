"""
repo_intelligence/python_parser.py
Structural parser for Python files using Python's native AST engine.
Extracts classes, functions, imports, constants, routes (Flask, FastAPI, Django),
database models (SQLAlchemy, Django), environment variables, and symbols.
"""

import ast
import re
from typing import Dict, Any, List, Optional
from repo_intelligence.models import SymbolModel, RouteModel, DatabaseModel


def parse_python_file(path: str, content: str) -> Dict[str, Any]:
    """
    Parse a Python file using ast.parse and return structured code intelligence.
    """
    if not content:
        return _empty_result()

    try:
        tree = ast.parse(content)
    except SyntaxError:
        return _fallback_python_parse(path, content)

    imports: List[str] = []
    classes: List[str] = []
    functions: List[str] = []
    constants: List[str] = []
    routes: List[RouteModel] = []
    database_models: List[DatabaseModel] = []
    env_vars: List[str] = []
    symbols: List[SymbolModel] = []

    lines = content.splitlines()

    for node in tree.body:
        # 1. Imports
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            if node.level > 0:
                # relative import: e.g. from .models import User
                mod = ("." * node.level) + mod
            imports.append(mod)

        # 2. Constants (UPPERCASE assignments at module level)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id.isupper():
                    constants.append(target.id)

        # 3. Class definitions
        elif isinstance(node, ast.ClassDef):
            c_name = node.name
            classes.append(c_name)

            base_names = []
            for b in node.bases:
                if isinstance(b, ast.Name):
                    base_names.append(b.id)
                elif isinstance(b, ast.Attribute):
                    base_names.append(f"{ast.unparse(b.value)}.{b.attr}")

            symbols.append(SymbolModel(
                name=c_name,
                type="class",
                file=path,
                line=node.lineno,
                signature=f"class {c_name}({', '.join(base_names)})" if base_names else f"class {c_name}"
            ))

            # Database model detection (SQLAlchemy / Django)
            is_sqla = any(b in ("Base", "Model", "db.Model", "DeclarativeBase") for b in base_names)
            is_django = any(b in ("models.Model", "Model") for b in base_names)

            fields = []
            for item in node.body:
                # Check class attribute fields (Column(...) or mapped_column(...) or models.CharField)
                if isinstance(item, ast.Assign):
                    for target in item.targets:
                        if isinstance(target, ast.Name):
                            val_str = ast.unparse(item.value) if hasattr(ast, "unparse") else ""
                            if "Column" in val_str or "mapped_column" in val_str or "models." in val_str:
                                fields.append({"name": target.id, "definition": val_str[:60]})
                                is_sqla = is_sqla or ("Column" in val_str or "mapped_column" in val_str)
                                is_django = is_django or ("models." in val_str)
                elif isinstance(item, ast.AnnAssign):
                    if isinstance(item.target, ast.Name):
                        val_str = ast.unparse(item.value) if (item.value and hasattr(ast, "unparse")) else ""
                        if "mapped_column" in val_str or "Column" in val_str or "Mapped[" in (ast.unparse(item.annotation) if hasattr(ast, "unparse") else ""):
                            fields.append({"name": item.target.id, "definition": val_str[:60]})
                            is_sqla = True

                # Methods inside class
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    symbols.append(SymbolModel(
                        name=f"{c_name}.{item.name}",
                        type="method",
                        file=path,
                        line=item.lineno,
                        signature=f"def {item.name}(...)"
                    ))

            if is_sqla or is_django or fields:
                framework = "django" if is_django else "sqlalchemy"
                database_models.append(DatabaseModel(
                    name=c_name,
                    file=path,
                    framework=framework,
                    fields=fields,
                    relationships=[]
                ))

        # 4. Top-level Functions & Routes
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            f_name = node.name
            functions.append(f_name)

            sig = f"def {f_name}({', '.join(a.arg for a in node.args.args)})"
            symbols.append(SymbolModel(
                name=f_name,
                type="function",
                file=path,
                line=node.lineno,
                signature=sig
            ))

            # Check route decorators: Flask / FastAPI
            for dec in node.decorator_list:
                dec_str = ast.unparse(dec) if hasattr(ast, "unparse") else ""
                # Flask: @app.route('/path', methods=['GET'])
                flask_match = re.search(r"(?:app|bp|api)\.route\s*\(\s*['\"]([^'\"]+)['\"](?:.*methods=\[([^\]]+)\])?", dec_str)
                if flask_match:
                    route_path = flask_match.group(1)
                    raw_methods = flask_match.group(2)
                    methods = ["GET"]
                    if raw_methods:
                        methods = [m.strip("'\" ") for m in raw_methods.split(",") if m.strip("'\" ")]
                    for m in methods:
                        routes.append(RouteModel(
                            method=m.upper(),
                            path=route_path,
                            file=path,
                            handler=f_name,
                            framework="flask"
                        ))

                # FastAPI: @app.get('/path'), @router.post(...)
                fastapi_match = re.search(r"(?:app|router|api)\.(get|post|put|delete|patch|options|head)\s*\(\s*['\"]([^'\"]+)['\"]", dec_str, re.IGNORECASE)
                if fastapi_match:
                    method = fastapi_match.group(1).upper()
                    route_path = fastapi_match.group(2)
                    routes.append(RouteModel(
                        method=method,
                        path=route_path,
                        file=path,
                        handler=f_name,
                        framework="fastapi"
                    ))

    # Environment variables in Python
    for m in re.finditer(r"os\.(?:environ(?:\[['\"]([a-zA-Z0-9_]+)['\"]\]|\.get\(['\"]([a-zA-Z0-9_]+)['\"]))|getenv\(['\"]([a-zA-Z0-9_]+)['\"]", content):
        var = m.group(1) or m.group(2) or m.group(3)
        if var and var not in env_vars:
            env_vars.append(var)

    return {
        "imports": imports,
        "exports": functions + classes + constants,
        "classes": classes,
        "functions": functions,
        "constants": constants,
        "routes": routes,
        "database_models": database_models,
        "env_vars": env_vars,
        "symbols": symbols,
    }


def _empty_result() -> Dict[str, Any]:
    return {
        "imports": [],
        "exports": [],
        "classes": [],
        "functions": [],
        "constants": [],
        "routes": [],
        "database_models": [],
        "env_vars": [],
        "symbols": [],
    }


def _fallback_python_parse(path: str, content: str) -> Dict[str, Any]:
    """Regex fallback if ast.parse encounters syntax error."""
    imports = []
    classes = []
    functions = []
    routes = []
    symbols = []

    for idx, line in enumerate(content.splitlines()):
        # imports
        m = re.match(r"^\s*(?:import\s+([a-zA-Z0-9_., ]+)|from\s+([a-zA-Z0-9_.]+)\s+import)", line)
        if m:
            mod = m.group(1) or m.group(2)
            if mod:
                imports.append(mod.split(",")[0].strip())

        # classes
        m = re.match(r"^\s*class\s+([a-zA-Z0-9_]+)", line)
        if m:
            c = m.group(1)
            classes.append(c)
            symbols.append(SymbolModel(name=c, type="class", file=path, line=idx + 1))

        # functions
        m = re.match(r"^\s*def\s+([a-zA-Z0-9_]+)", line)
        if m:
            f = m.group(1)
            functions.append(f)
            symbols.append(SymbolModel(name=f, type="function", file=path, line=idx + 1))

    return {
        "imports": imports,
        "exports": functions + classes,
        "classes": classes,
        "functions": functions,
        "constants": [],
        "routes": routes,
        "database_models": [],
        "env_vars": [],
        "symbols": symbols,
    }
