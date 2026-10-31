"""Run the project's tests in a subprocess with a stripped environment."""

from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


class ToolFailure(RuntimeError):
    pass


class RetryLimitExceeded(ToolFailure):
    pass


@dataclass
class TestRun:
    ok: bool
    exit_code: int | None
    output: str
    timed_out: bool = False

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "exit_code": self.exit_code,
            "timed_out": self.timed_out,
            "output": self.output,
        }


class ToolBudget:
    def __init__(self, max_failures: int):
        self.max_failures = max_failures
        self.failures = 0

    def fail(self, message: str) -> None:
        self.failures += 1
        if self.failures >= self.max_failures:
            raise RetryLimitExceeded(message)
        raise ToolFailure(message)


def run_pytest(
    workspace: Path,
    test_path: Path,
    pythonpath: list[Path],
    timeout: float,
    budget: ToolBudget,
    output_limit: int,
) -> TestRun:
    env = {
        "PATH": os.environ.get("PATH", ""),
        "HOME": os.environ.get("HOME", ""),
        "LANG": os.environ.get("LANG", "C.UTF-8"),
        "LC_ALL": "C.UTF-8",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONPATH": os.pathsep.join(str(path) for path in pythonpath),
        "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
    }
    command = [
        sys.executable,
        "-m",
        "pytest",
        "-q",
        "-p",
        "no:cacheprovider",
        "--color=no",
        "--import-mode=importlib",
        f"--rootdir={test_path if test_path.is_dir() else test_path.parent}",
        str(test_path),
    ]
    try:
        completed = subprocess.run(
            command,
            cwd=workspace,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        output = _clip((exc.stdout or "") + "\n" + (exc.stderr or ""), output_limit)
        budget.fail(f"pytest timed out\n{output}")
        return TestRun(ok=False, exit_code=None, output=output, timed_out=True)
    except OSError as exc:
        budget.fail(str(exc))
        return TestRun(ok=False, exit_code=None, output=str(exc))
    output = _clip((completed.stdout or "") + (completed.stderr or ""), output_limit)
    return TestRun(ok=completed.returncode == 0, exit_code=completed.returncode, output=output)


def _clip(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit // 2] + "\n...[truncated]...\n" + text[-limit // 2 :]
