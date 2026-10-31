"""Diff policy: allowed paths, protected tests, and patch size."""

from __future__ import annotations

import ast
import io
import tokenize
from dataclasses import dataclass, field


@dataclass
class Assessment:
    ok: bool
    reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"ok": self.ok, "reasons": list(self.reasons)}


def _assert_count(source: str) -> int:
    count = 0
    try:
        tokens = tokenize.generate_tokens(io.StringIO(source).readline)
        for tok in tokens:
            if tok.type == tokenize.NAME and tok.string == "assert":
                count += 1
    except tokenize.TokenizeError:
        count = source.count("assert ")
    return count


def _is_test_path(path: str) -> bool:
    name = path.replace("\\", "/")
    return "/tests/" in f"/{name}" or name.startswith("tests/") or name.endswith("_test.py")


def assess_sources(
    before: dict[str, str],
    after: dict[str, str],
    allowed_prefixes: list[str],
    pin_file: str | None = None,
    dependency: str | None = None,
    version_to: str | None = None,
) -> Assessment:
    """Accept source edits under allowed prefixes. Tests are protected."""
    reasons: list[str] = []
    paths = set(before) | set(after)
    for path in sorted(paths):
        old = before.get(path)
        new = after.get(path)
        if old == new:
            continue
        normal = path.replace("\\", "/")
        if _is_test_path(normal):
            if old is None or new is None or _assert_count(new) < _assert_count(old):
                reasons.append("protected_test_modification")
            else:
                reasons.append("protected_test_modification")
            continue
        if pin_file and normal == pin_file.replace("\\", "/"):
            if not _pin_only_change(old or "", new or "", dependency, version_to):
                reasons.append("patch_scope")
            continue
        if not any(normal.startswith(prefix) for prefix in allowed_prefixes):
            reasons.append("patch_scope")
            continue
        if new is None:
            reasons.append("patch_scope")
    unique = []
    for reason in reasons:
        if reason not in unique:
            unique.append(reason)
    return Assessment(ok=not unique, reasons=unique)


def _pin_only_change(old: str, new: str, dependency: str | None, version_to: str | None) -> bool:
    if not dependency or not version_to:
        return False
    old_lines = [line.strip() for line in old.splitlines() if line.strip() and not line.strip().startswith("#")]
    new_lines = [line.strip() for line in new.splitlines() if line.strip() and not line.strip().startswith("#")]
    if len(old_lines) != len(new_lines):
        return False
    changed = [pair for pair in zip(old_lines, new_lines) if pair[0] != pair[1]]
    if len(changed) != 1:
        return False
    before, after = changed[0]
    return after == f"{dependency}=={version_to}" and before.startswith(f"{dependency}==")


def unified_diff(before: dict[str, str], after: dict[str, str]) -> str:
    import difflib

    chunks: list[str] = []
    for path in sorted(set(before) | set(after)):
        old = before.get(path, "")
        new = after.get(path, "")
        if old == new:
            continue
        diff = difflib.unified_diff(
            old.splitlines(keepends=True),
            new.splitlines(keepends=True),
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
        )
        chunks.extend(diff)
        if chunks and not chunks[-1].endswith("\n"):
            chunks.append("\n")
    return "".join(chunks)


def syntax_ok(source: str) -> bool:
    try:
        ast.parse(source)
    except SyntaxError:
        return False
    return True
