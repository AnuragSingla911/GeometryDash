"""Hard budgets for one upgrade investigation."""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Limits:
    """One candidate upgrade, two repair attempts, bounded context and time.

    ``max_tool_failures`` counts failed tool calls. The investigation stops
    when that count is reached (the failing call is not retried forever).
    ``workflow_timeout_seconds`` is the in-process deadline. GitHub Actions
    also sets a runner timeout; the in-process deadline is the tighter local
    guard for the feasibility cases.
    """

    max_upgrades: int = 1
    max_repair_attempts: int = 2
    max_tool_failures: int = 2
    test_timeout_seconds: float = 30.0
    workflow_timeout_seconds: float = 120.0
    max_context_chars: int = 8000
    max_file_bytes: int = 20_000
    max_output_chars: int = 12_000
    max_patch_lines: int = 200

    def to_dict(self) -> dict:
        return asdict(self)
