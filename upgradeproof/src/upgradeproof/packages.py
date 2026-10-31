"""Read the local package under investigation. No network."""

from __future__ import annotations

import ast
import json
import re
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class PackageInfo:
    name: str
    version: str
    root: Path
    requires: list[str]
    migration: str
    signatures: dict[str, list[str]]
    classes: dict[str, list[str]] = field(default_factory=dict)

    def to_public_dict(self) -> dict:
        return {
            "name": self.name,
            "version": self.version,
            "requires": list(self.requires),
            "migration": self.migration[:8000],
            "signatures": self.signatures,
            "string_fields": self.classes,
        }


def load_package(root: Path) -> PackageInfo:
    meta_path = root / "upgradeproof.meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    migration_path = root / "MIGRATION.md"
    migration = migration_path.read_text(encoding="utf-8") if migration_path.exists() else ""
    signatures: dict[str, list[str]] = {}
    classes: dict[str, list[str]] = {}
    for path in sorted(root.rglob("*.py")):
        source = path.read_text(encoding="utf-8")
        try:
            tree = ast.parse(source)
        except SyntaxError:
            continue
        for node in tree.body:
            if isinstance(node, ast.FunctionDef):
                signatures[node.name] = _args(node)
            elif isinstance(node, ast.ClassDef):
                fields = _string_fields(node)
                classes[node.name] = fields
                for child in node.body:
                    if isinstance(child, ast.FunctionDef):
                        signatures[f"{node.name}.{child.name}"] = _args(child)
                        signatures.setdefault(child.name, _args(child))
    return PackageInfo(
        name=meta["name"],
        version=str(meta["version"]),
        root=root,
        requires=list(meta.get("requires", [])),
        migration=migration,
        signatures=signatures,
        classes=classes,
    )


def _args(node: ast.FunctionDef) -> list[str]:
    args = [arg.arg for arg in node.args.args if arg.arg != "self"]
    args.extend(arg.arg for arg in node.args.kwonlyargs)
    return args


def _string_fields(node: ast.ClassDef) -> list[str]:
    fields: list[str] = []
    for child in node.body:
        if not isinstance(child, ast.FunctionDef) or child.name != "__init__":
            continue
        annotated = {arg.arg for arg in child.args.args if _is_str(arg.annotation)}
        for inner in ast.walk(child):
            if not isinstance(inner, ast.Assign) or len(inner.targets) != 1:
                continue
            target = inner.targets[0]
            if (
                isinstance(target, ast.Attribute)
                and isinstance(target.value, ast.Name)
                and target.value.id == "self"
                and isinstance(inner.value, ast.Name)
                and inner.value.id in annotated
            ):
                fields.append(target.attr)
    return fields


def _is_str(annotation: ast.AST | None) -> bool:
    return isinstance(annotation, ast.Name) and annotation.id == "str"


def unmet_requirements(package: PackageInfo) -> list[str]:
    """Requirements other than the package itself are unsatisfied in this sandbox."""
    missing: list[str] = []
    for requirement in package.requires:
        name = re.split(r"[<>=!\[]", requirement, maxsplit=1)[0].strip()
        if name and name != package.name:
            missing.append(requirement)
    return missing


def parse_renames(migration: str) -> list[tuple[str, str]]:
    return re.findall(r"(?m)^RENAME\s+(\w+)\s*->\s*(\w+)\s*$", migration)


def parse_exception_notes(migration: str) -> list[tuple[str, str]]:
    return re.findall(r"(?m)^-\s+(\w+):\s+(.+)$", migration)


def edit_distance(left: str, right: str) -> int:
    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)
    previous = list(range(len(right) + 1))
    for i, char_left in enumerate(left, start=1):
        current = [i]
        for j, char_right in enumerate(right, start=1):
            insert = current[j - 1] + 1
            delete = previous[j] + 1
            replace = previous[j - 1] + (char_left != char_right)
            current.append(min(insert, delete, replace))
        previous = current
    return previous[-1]
