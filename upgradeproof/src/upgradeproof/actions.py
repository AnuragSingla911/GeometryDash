"""Bounded repair actions. The model may select one. It does not emit source."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from upgradeproof.editing import (
    EditError,
    insert_field_before_method,
    rename_except_attribute,
    rename_keyword_calls,
    rename_name_tokens,
)


@dataclass
class Action:
    id: str
    kind: str
    summary: str
    origin: str
    candidate_text: str
    broad: bool = False
    payload: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "summary": self.summary,
            "origin": self.origin,
            "broad": self.broad,
            "candidate_text": self.candidate_text,
        }


def apply_action(workspace: Path, action: Action, failing_lines: set[int]) -> list[str]:
    """Apply an action under ``src/``. Return the files it changed."""
    changed: list[str] = []
    src = workspace / "src"
    if action.kind == "rename_keyword":
        for path in _python_files(src):
            original = path.read_text(encoding="utf-8")
            try:
                updated = rename_keyword_calls(
                    original,
                    action.payload["call_name"],
                    action.payload["old"],
                    action.payload["new"],
                )
            except EditError:
                continue
            if updated != original:
                path.write_text(updated, encoding="utf-8")
                changed.append(_rel(workspace, path))
        if not changed:
            raise EditError(action.summary)
        return changed

    if action.kind == "rename_symbol":
        for path in _python_files(src):
            original = path.read_text(encoding="utf-8")
            try:
                updated = rename_name_tokens(original, action.payload["old"], action.payload["new"])
            except EditError:
                continue
            if updated != original:
                path.write_text(updated, encoding="utf-8")
                changed.append(_rel(workspace, path))
        if not changed:
            raise EditError(action.summary)
        return changed

    if action.kind == "rename_except":
        for path in _python_files(src):
            original = path.read_text(encoding="utf-8")
            try:
                updated = rename_except_attribute(original, action.payload["old"], action.payload["new"])
            except EditError:
                continue
            if updated != original:
                path.write_text(updated, encoding="utf-8")
                changed.append(_rel(workspace, path))
        if not changed:
            raise EditError(action.summary)
        return changed

    if action.kind == "insert_field":
        for path in _python_files(src):
            original = path.read_text(encoding="utf-8")
            try:
                updated = insert_field_before_method(
                    original,
                    action.payload["method"],
                    action.payload["field"],
                    failing_lines,
                )
            except EditError:
                continue
            if updated != original:
                path.write_text(updated, encoding="utf-8")
                changed.append(_rel(workspace, path))
        if not changed:
            raise EditError(action.summary)
        return changed

    if action.kind == "write_src":
        relative = action.payload["path"]
        if not relative.startswith("src/") or relative.endswith(".."):
            raise EditError("write_src is limited to src/")
        target = workspace / relative
        if not target.resolve().is_relative_to(src.resolve()):
            raise EditError("write_src escaped src/")
        target.write_text(action.payload["source"], encoding="utf-8")
        return [relative]

    if action.kind == "touch_tests":
        relative = action.payload.get("path", "tests/test_public.py")
        target = workspace / relative
        original = target.read_text(encoding="utf-8") if target.exists() else ""
        target.write_text(action.payload.get("source", original.replace("assert ", "pass  # ")), encoding="utf-8")
        return [relative]

    if action.kind == "touch_unrelated":
        target = workspace / "README.md"
        target.write_text("unrelated change\n", encoding="utf-8")
        return ["README.md"]

    raise EditError(f"unknown action kind {action.kind}")


def _python_files(src: Path) -> list[Path]:
    return sorted(path for path in src.rglob("*.py") if path.is_file())


def _rel(workspace: Path, path: Path) -> str:
    return path.relative_to(workspace).as_posix()
