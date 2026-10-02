"""
repo_intelligence/js_ts_parser.py
Structural parser for JavaScript, TypeScript, JSX, and TSX files.
Utilizes tree-sitter for robust AST extraction, with an automatic, graceful
regex fallback if tree-sitter encounters unparseable syntax or is unavailable.
"""

import re
from typing import Dict, Any, List, Optional
from repo_intelligence.models import SymbolModel, RouteModel

# Safe initialization of tree-sitter parsers
_TREE_SITTER_AVAILABLE = False
_js_parser = None
_ts_parser = None
_tsx_parser = None

try:
    from tree_sitter import Language, Parser
    import tree_sitter_javascript
    import tree_sitter_typescript

    _js_lang = Language(tree_sitter_javascript.language())
    _ts_lang = Language(tree_sitter_typescript.language_typescript())
    _tsx_lang = Language(tree_sitter_typescript.language_tsx())

    _js_parser = Parser(_js_lang)
    _ts_parser = Parser(_ts_lang)
    _tsx_parser = Parser(_tsx_lang)
    _TREE_SITTER_AVAILABLE = True
except Exception:
    _TREE_SITTER_AVAILABLE = False


def _get_parser_for_path(path: str):
    if not _TREE_SITTER_AVAILABLE:
        return None
    lower = path.lower()
    if lower.endswith(".tsx"):
        return _tsx_parser
    if lower.endswith(".ts"):
        return _ts_parser
    if lower.endswith(".jsx") or lower.endswith(".js") or lower.endswith(".mjs") or lower.endswith(".cjs"):
        return _js_parser
    return None


def parse_js_ts_file(path: str, content: str) -> Dict[str, Any]:
    """
    Parse a JS/TS/JSX/TSX file content and extract structured intelligence:
    - imports
    - exports
    - classes
    - functions
    - components
    - hooks
    - routes (Express, Next.js)
    - environment variable usages
    - symbols
    """
    if not content:
        return _empty_result()

    parser = _get_parser_for_path(path)
    if parser is not None:
        try:
            return _parse_with_tree_sitter(path, content, parser)
        except Exception:
            # Fall back to regex parser on any tree-sitter exception
            pass

    return _parse_with_regex(path, content)


def _empty_result() -> Dict[str, Any]:
    return {
        "imports": [],
        "exports": [],
        "classes": [],
        "functions": [],
        "components": [],
        "hooks": [],
        "routes": [],
        "env_vars": [],
        "symbols": [],
    }


def _derive_nextjs_route(path: str, handler_name: str) -> Optional[RouteModel]:
    """Derive RouteModel for Next.js App Router or Pages Router files."""
    normalized = path.replace("\\", "/")
    # App router: app/api/users/route.ts
    app_api_match = re.search(r"app/(api/.+?)/route\.[jt]sx?$", normalized)
    if app_api_match:
        route_path = "/" + app_api_match.group(1)
        method = handler_name.upper() if handler_name.upper() in ("GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS") else "ALL"
        return RouteModel(
            method=method,
            path=route_path,
            file=path,
            handler=handler_name,
            framework="nextjs"
        )
    # Pages router: pages/api/users.ts
    pages_api_match = re.search(r"pages/(api/.+?)\.[jt]sx?$", normalized)
    if pages_api_match:
        route_path = "/" + pages_api_match.group(1)
        if route_path.endswith("/index"):
            route_path = route_path[:-6]
        return RouteModel(
            method="ALL",
            path=route_path,
            file=path,
            handler=handler_name,
            framework="nextjs"
        )
    return None


def _parse_with_tree_sitter(path: str, content: str, parser) -> Dict[str, Any]:
    source_bytes = content.encode("utf-8", errors="replace")
    tree = parser.parse(source_bytes)
    root = tree.root_node

    imports: List[str] = []
    exports: List[str] = []
    classes: List[str] = []
    functions: List[str] = []
    components: List[str] = []
    hooks: List[str] = []
    routes: List[RouteModel] = []
    env_vars: List[str] = []
    symbols: List[SymbolModel] = []

    def get_text(node) -> str:
        return source_bytes[node.start_byte:node.end_byte].decode("utf-8", errors="replace")

    def walk(node):
        ntype = node.type

        # 1. Imports
        if ntype in ("import_statement", "import_declaration"):
            # Find the source string literal
            for child in node.children:
                if child.type == "string":
                    raw_str = get_text(child).strip("'\"`")
                    if raw_str and raw_str not in imports:
                        imports.append(raw_str)

        # 2. require(...) or dynamic import(...)
        elif ntype == "call_expression":
            fn_node = node.child_by_field_name("function")
            args_node = node.child_by_field_name("arguments")
            if fn_node and args_node:
                fn_text = get_text(fn_node)
                # require('...')
                if fn_text in ("require", "import") and args_node.named_child_count > 0:
                    first_arg = args_node.named_children[0]
                    if first_arg.type == "string":
                        req_path = get_text(first_arg).strip("'\"`")
                        if req_path and req_path not in imports:
                            imports.append(req_path)

                # Express route: app.get('/users', ...), router.post(...)
                if "." in fn_text:
                    parts = fn_text.split(".")
                    obj, method = parts[0], parts[-1].lower()
                    if method in ("get", "post", "put", "delete", "patch", "all", "use"):
                        if args_node.named_child_count > 0:
                            path_arg = args_node.named_children[0]
                            if path_arg.type == "string":
                                route_path = get_text(path_arg).strip("'\"`")
                                if route_path.startswith("/") or route_path == "*":
                                    handler_name = None
                                    if args_node.named_child_count > 1:
                                        h_node = args_node.named_children[-1]
                                        handler_name = get_text(h_node).split("(")[0].strip()[:40]
                                    routes.append(RouteModel(
                                        method=method.upper(),
                                        path=route_path,
                                        file=path,
                                        handler=handler_name,
                                        framework="express"
                                    ))

        # 3. Class declarations
        elif ntype in ("class_declaration", "class"):
            name_node = node.child_by_field_name("name")
            if name_node:
                c_name = get_text(name_node)
                if c_name not in classes:
                    classes.append(c_name)
                    symbols.append(SymbolModel(
                        name=c_name,
                        type="class",
                        file=path,
                        line=node.start_point[0] + 1,
                        signature=f"class {c_name}"
                    ))

        # 4. Function declarations
        elif ntype == "function_declaration":
            name_node = node.child_by_field_name("name")
            if name_node:
                f_name = get_text(name_node)
                if f_name not in functions:
                    functions.append(f_name)
                    # Check React component or hook
                    sym_type = "function"
                    if f_name.startswith("use") and len(f_name) > 3 and f_name[3].isupper():
                        hooks.append(f_name)
                        sym_type = "hook"
                    elif f_name[0].isupper() and (path.endswith("x") or "return <" in content):
                        components.append(f_name)
                        sym_type = "component"

                    symbols.append(SymbolModel(
                        name=f_name,
                        type=sym_type,
                        file=path,
                        line=node.start_point[0] + 1,
                        signature=f"function {f_name}()"
                    ))

                    # Next.js route handler
                    next_route = _derive_nextjs_route(path, f_name)
                    if next_route:
                        routes.append(next_route)

        # 5. Variable declarations (const Foo = () => {}, const bar = function()...)
        elif ntype == "variable_declarator":
            name_node = node.child_by_field_name("name")
            val_node = node.child_by_field_name("value")
            if name_node and val_node:
                var_name = get_text(name_node)
                if val_node.type in ("arrow_function", "function"):
                    if var_name not in functions:
                        functions.append(var_name)
                        sym_type = "function"
                        if var_name.startswith("use") and len(var_name) > 3 and var_name[3].isupper():
                            hooks.append(var_name)
                            sym_type = "hook"
                        elif var_name[0].isupper() and (path.endswith("x") or "return <" in content or "=> (" in get_text(val_node)):
                            components.append(var_name)
                            sym_type = "component"

                        symbols.append(SymbolModel(
                            name=var_name,
                            type=sym_type,
                            file=path,
                            line=node.start_point[0] + 1,
                            signature=f"const {var_name} = ..."
                        ))

                        next_route = _derive_nextjs_route(path, var_name)
                        if next_route:
                            routes.append(next_route)

        # 6. Exports
        elif ntype in ("export_statement", "export_declaration"):
            export_text = get_text(node)
            for m in re.finditer(r"export\s+(?:default\s+)?(?:async\s+)?(?:function\s+|class\s+|const\s+|let\s+|var\s+)?([a-zA-Z0-9_$]+)", export_text):
                exp = m.group(1)
                if exp not in ("function", "class", "const", "let", "var", "default", "async") and exp not in exports:
                    exports.append(exp)

        # 7. Environment variable usages: process.env.XYZ
        elif ntype == "member_expression":
            m_text = get_text(node)
            if "process.env." in m_text:
                env_match = re.search(r"process\.env\.([a-zA-Z0-9_]+)", m_text)
                if env_match:
                    var = env_match.group(1)
                    if var not in env_vars:
                        env_vars.append(var)

        for child in node.children:
            walk(child)

    walk(root)

    # Secondary check for env vars via regex in case member expressions were nested
    for m in re.finditer(r"process\.env(?:\.([a-zA-Z0-9_]+)|\[['\"]([a-zA-Z0-9_]+)['\"]\])", content):
        var = m.group(1) or m.group(2)
        if var and var not in env_vars:
            env_vars.append(var)

    return {
        "imports": imports,
        "exports": exports,
        "classes": classes,
        "functions": functions,
        "components": components,
        "hooks": hooks,
        "routes": routes,
        "env_vars": env_vars,
        "symbols": symbols,
    }


def _parse_with_regex(path: str, content: str) -> Dict[str, Any]:
    """Graceful, resilient regex fallback parser for JS/TS."""
    imports: List[str] = []
    exports: List[str] = []
    classes: List[str] = []
    functions: List[str] = []
    components: List[str] = []
    hooks: List[str] = []
    routes: List[RouteModel] = []
    env_vars: List[str] = []
    symbols: List[SymbolModel] = []

    lines = content.splitlines()

    # 1. Imports: import ... from '...' or require('...')
    for line in lines:
        for m in re.finditer(r"(?:import\s+(?:.*?\s+from\s+)?|require\s*\(\s*)['\"]([^'\"]+)['\"]", line):
            imp = m.group(1)
            if imp and imp not in imports:
                imports.append(imp)

    # 2. Exports
    for line in lines:
        for m in re.finditer(r"export\s+(?:default\s+)?(?:async\s+)?(?:function\s+|class\s+|const\s+|let\s+|var\s+)?([a-zA-Z0-9_$]+)", line):
            exp = m.group(1)
            if exp not in ("function", "class", "const", "let", "var", "default", "async") and exp not in exports:
                exports.append(exp)

    # 3. Classes
    for idx, line in enumerate(lines):
        for m in re.finditer(r"class\s+([a-zA-Z0-9_$]+)", line):
            c_name = m.group(1)
            if c_name not in classes:
                classes.append(c_name)
                symbols.append(SymbolModel(name=c_name, type="class", file=path, line=idx + 1))

    # 4. Functions & components & hooks
    for idx, line in enumerate(lines):
        # function foo()
        for m in re.finditer(r"(?:function\s+|const\s+|let\s+)([a-zA-Z0-9_$]+)\s*(?:=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>|\()", line):
            f_name = m.group(1)
            if f_name not in functions:
                functions.append(f_name)
                sym_type = "function"
                if f_name.startswith("use") and len(f_name) > 3 and f_name[3].isupper():
                    hooks.append(f_name)
                    sym_type = "hook"
                elif f_name[0].isupper() and (path.endswith("x") or "return <" in content):
                    components.append(f_name)
                    sym_type = "component"
                symbols.append(SymbolModel(name=f_name, type=sym_type, file=path, line=idx + 1))

                next_route = _derive_nextjs_route(path, f_name)
                if next_route:
                    routes.append(next_route)

    # 5. Express routes
    for line in lines:
        for m in re.finditer(r"(?:app|router)\.(get|post|put|delete|patch|all|use)\s*\(\s*['\"]([^'\"]+)['\"]", line, re.IGNORECASE):
            method = m.group(1).upper()
            route_path = m.group(2)
            routes.append(RouteModel(
                method=method,
                path=route_path,
                file=path,
                framework="express"
            ))

    # 6. Environment variables
    for m in re.finditer(r"process\.env(?:\.([a-zA-Z0-9_]+)|\[['\"]([a-zA-Z0-9_]+)['\"]\])", content):
        var = m.group(1) or m.group(2)
        if var and var not in env_vars:
            env_vars.append(var)

    return {
        "imports": imports,
        "exports": exports,
        "classes": classes,
        "functions": functions,
        "components": components,
        "hooks": hooks,
        "routes": routes,
        "env_vars": env_vars,
        "symbols": symbols,
    }
