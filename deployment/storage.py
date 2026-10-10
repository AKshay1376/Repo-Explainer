"""Conservative temporary storage setup; cleanup never recurses."""

import os
import tempfile
import time


def configure_temp(settings):
    path = settings.temp_dir
    if path.is_symlink():
        raise ValueError("Temporary directory must not be a symbolic link.")
    path.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        raise ValueError("Temporary directory must not be a symbolic link.")
    with tempfile.NamedTemporaryFile(dir=path, prefix="repo-explainer-check-", delete=True):
        pass
    tempfile.tempdir = str(path)
    os.environ["TMPDIR"] = str(path)
    if os.name == "nt":
        os.environ["TMP"] = str(path)
        os.environ["TEMP"] = str(path)
    cutoff = time.time() - 86400
    for candidate in path.glob("repo-explainer-*"):
        if candidate.is_file() and not candidate.is_symlink() and candidate.stat().st_mtime < cutoff:
            candidate.unlink()
