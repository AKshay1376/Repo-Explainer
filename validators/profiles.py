"""Known validator names and narrowly accepted command shapes."""

SCRIPT_KINDS = {
    "test": "test", "test:unit": "unit", "test:integration": "integration",
    "typecheck": "typecheck", "type-check": "typecheck",
    "lint": "lint", "build": "build",
}
SAFE_BINS = {"pytest", "unittest", "ruff", "flake8", "mypy", "pyright",
             "eslint", "tsc", "vite", "next", "jest", "vitest", "tsx"}
STACK_FILES = {
    "tsconfig.json": "TypeScript", "vite.config.ts": "Vite", "vite.config.js": "Vite",
    "next.config.js": "Next.js", "next.config.mjs": "Next.js",
    "next.config.ts": "Next.js", "manage.py": "Django",
}


def classify_script(name: str) -> str | None:
    return SCRIPT_KINDS.get(name.lower())
