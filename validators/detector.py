"""Inspect bounded local manifests. Discovery never grants execution trust."""

import json
import re
from pathlib import Path

from .models import ValidatorCommand
from .profiles import STACK_FILES, classify_script
from .security import safe_command


def _read(path: Path) -> str:
    if not path.is_file() or path.is_symlink() or path.stat().st_size > 200_000:
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def detect(root: Path) -> tuple[list[str], list[ValidatorCommand], list[str]]:
    stack: set[str] = set()
    commands: list[ValidatorCommand] = []
    warnings: list[str] = []
    locations = [(root, ".")]
    if (root / "frontend").is_dir() and not (root / "frontend").is_symlink():
        locations.append((root / "frontend", "frontend"))
    for directory, relative in locations:
        for name, label in STACK_FILES.items():
            if (directory / name).is_file() and not (directory / name).is_symlink():
                stack.add(label)
        package_text = _read(directory / "package.json")
        if package_text:
            stack.add("Node.js")
            try:
                package = json.loads(package_text)
                scripts = package.get("scripts", {})
                if not isinstance(scripts, dict):
                    scripts = {}
                dependencies = {**package.get("dependencies", {}), **package.get("devDependencies", {})}
                if "react" in dependencies: stack.add("React")
                if "vite" in dependencies: stack.add("Vite")
                if "next" in dependencies: stack.add("Next.js")
                if "typescript" in dependencies: stack.add("TypeScript")
                for name, body in sorted(scripts.items()):
                    kind = classify_script(name)
                    if not kind or not isinstance(body, str):
                        continue
                    if any(hook in scripts for hook in ("pre" + name, "post" + name)):
                        warnings.append(f"{relative}: {name} has lifecycle hooks; manual review required.")
                        continue
                    # npm runs script bodies through a shell. Accept only a short chain of known validators;
                    # trust is still required because dependencies and test files can execute code.
                    pieces = [part.strip() for part in body.split("&&")]
                    if not pieces or len(pieces) > 4 or any(".." in part or not re.fullmatch(r"[\w./ -]+", part) or
                        part.split()[0] not in {"tsc", "vite", "next", "eslint", "jest", "vitest", "tsx", "pytest", "ruff", "mypy", "pyright"}
                        for part in pieces):
                        warnings.append(f"{relative}: {name} script is outside the validator allowlist.")
                        continue
                    argv = ["npm", "test"] if name == "test" else ["npm", "run", name]
                    safe_command(argv)
                    commands.append(ValidatorCommand(f"{relative}:{name}", kind, name, argv, relative,
                                                     f"{relative}/package.json:scripts.{name}", "MEDIUM"))
            except (ValueError, TypeError, AttributeError):
                warnings.append(f"{relative}/package.json could not be parsed.")
        pyproject = _read(directory / "pyproject.toml")
        requirements = _read(directory / "requirements.txt")
        setup = _read(directory / "setup.cfg")
        tox = _read(directory / "tox.ini")
        pytest_ini = _read(directory / "pytest.ini")
        if any((pyproject, requirements, setup, tox, pytest_ini)) or (directory / "manage.py").is_file():
            stack.add("Python")
            corpus = "\n".join((pyproject, requirements, setup, tox, pytest_ini)).lower()
            for package, label in (("flask", "Flask"), ("fastapi", "FastAPI"), ("django", "Django")):
                if re.search(r"\b" + package + r"\b", corpus): stack.add(label)
            for package, kind, argv in (("pytest", "test", ["python", "-m", "pytest"]),
                                        ("ruff", "lint", ["ruff", "check", "."]),
                                        ("flake8", "lint", ["flake8"]),
                                        ("mypy", "typecheck", ["mypy", "."]),
                                        ("pyright", "typecheck", ["pyright"])):
                if re.search(r"\b" + package + r"\b", corpus):
                    commands.append(ValidatorCommand(f"{relative}:{package}", kind, package, argv, relative,
                                                     "Python manifests", "MEDIUM"))
            if not any(item.kind in {"test", "unit"} and item.working_directory == relative for item in commands):
                if any(directory.glob("test_*.py")) or (directory / "tests").is_dir():
                    commands.append(ValidatorCommand(f"{relative}:unittest", "test", "unittest discovery",
                                                     ["python", "-m", "unittest"], relative,
                                                     "Python test files", "LOW"))
        if (directory / "tsconfig.json").is_file() and not any(
            item.kind == "typecheck" and item.working_directory == relative for item in commands):
            commands.append(ValidatorCommand(f"{relative}:tsc", "typecheck", "TypeScript typecheck",
                                             ["npx", "tsc", "--noEmit"], relative, "tsconfig.json", "HIGH"))
    return sorted(stack), commands, warnings
