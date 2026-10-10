"""Small high-confidence committed-file scan; only paths are printed."""

from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
PATTERN = re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{32,}")
BAD_NAME = re.compile(r"(^|/)(\.env($|\.)|[^/]*\.(pem|key|p12|pfx)$|token\.json$|credentials\.json$)")


def main():
    paths = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode("utf-8").split("\0")
    flagged = []
    for item in paths:
        if not item:
            continue
        if item != ".env.example" and BAD_NAME.search(item):
            flagged.append(item)
            continue
        path = ROOT / item
        if path.is_file() and path.stat().st_size <= 2_000_000 and PATTERN.search(path.read_bytes()):
            flagged.append(item)
    if flagged:
        print("Potential secret material in:", ", ".join(flagged))
        return 1
    print("Committed-file secret scan passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
