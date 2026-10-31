"""Deterministic failure classification from pytest text."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass


@dataclass
class Classification:
    kind: str
    error_type: str | None = None
    message: str = ""
    missing_name: str | None = None
    unexpected_keyword: str | None = None
    callable_name: str | None = None
    object_type: str | None = None
    missing_attribute: str | None = None
    failing_lines: tuple[tuple[str, int], ...] = ()

    def to_dict(self) -> dict:
        data = asdict(self)
        data["failing_lines"] = [list(item) for item in self.failing_lines]
        return data


_UNEXPECTED = re.compile(
    r"(?P<callable>[\w.]+)\(\) got an unexpected keyword argument '(?P<keyword>\w+)'"
)
_IMPORT = re.compile(r"cannot import name '(?P<name>\w+)' from '(?P<module>[\w.]+)'")
_MODULE_ATTR = re.compile(r"module '(?P<module>[\w.]+)' has no attribute '(?P<name>\w+)'")
_OBJECT_ATTR = re.compile(r"'(?P<type>\w+)' object has no attribute '(?P<name>\w+)'")
_ERROR_LINE = re.compile(r"^E\s+(?P<type>[A-Za-z_][\w.]*)(?::\s*(?P<message>.*))?$", re.M)
_FRAME = re.compile(r"^(?P<file>[^\s:]+\.py):(?P<line>\d+):", re.M)


def classify_output(output: str) -> Classification:
    """Classify one pytest transcript. Unknown failures stay unknown."""
    frames = tuple((match.group("file"), int(match.group("line"))) for match in _FRAME.finditer(output))
    error_match = None
    for match in _ERROR_LINE.finditer(output):
        error_match = match
    error_type = error_match.group("type") if error_match else None
    if error_type and "." in error_type:
        error_type = error_type.rsplit(".", 1)[-1]
    message = ""
    if error_match and error_match.group("message"):
        message = error_match.group("message").strip()
    else:
        last = ""
        for line in output.splitlines():
            stripped = line.strip()
            if stripped:
                last = stripped
        message = last[:500]

    unexpected = _UNEXPECTED.search(output)
    if unexpected:
        return Classification(
            kind="unexpected_keyword",
            error_type=error_type or "TypeError",
            message=unexpected.group(0),
            unexpected_keyword=unexpected.group("keyword"),
            callable_name=unexpected.group("callable"),
            failing_lines=frames,
        )

    imported = _IMPORT.search(output)
    if imported:
        return Classification(
            kind="missing_import",
            error_type=error_type or "ImportError",
            message=imported.group(0),
            missing_name=imported.group("name"),
            callable_name=imported.group("module"),
            failing_lines=frames,
        )

    module_attr = _MODULE_ATTR.search(output)
    if module_attr:
        return Classification(
            kind="missing_module_attribute",
            error_type=error_type or "AttributeError",
            message=module_attr.group(0),
            missing_name=module_attr.group("name"),
            callable_name=module_attr.group("module"),
            failing_lines=frames,
        )

    object_attr = _OBJECT_ATTR.search(output)
    if object_attr:
        return Classification(
            kind="missing_object_attribute",
            error_type=error_type or "AttributeError",
            message=object_attr.group(0),
            object_type=object_attr.group("type"),
            missing_attribute=object_attr.group("name"),
            failing_lines=frames,
        )

    if "Could not resolve" in output or "constraint" in output.lower() and "conflict" in output.lower():
        return Classification(kind="constraint_conflict", error_type=error_type, message=message, failing_lines=frames)

    return Classification(kind="unknown", error_type=error_type, message=message, failing_lines=frames)
