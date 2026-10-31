"""Small source edits. Column splices assume ASCII, which these cases are."""

from __future__ import annotations

import ast
import io
import tokenize
from dataclasses import dataclass


class EditError(ValueError):
    pass


@dataclass(frozen=True)
class Replacement:
    lineno: int
    col: int
    old: str
    new: str


def apply_replacements(source: str, replacements: list[Replacement]) -> str:
    if not replacements:
        return source
    if not source.isascii():
        raise EditError("column edits require ASCII source")
    lines = source.splitlines(keepends=True)
    ordered = sorted(replacements, key=lambda item: (item.lineno, item.col), reverse=True)
    seen: set[tuple[int, int]] = set()
    for item in ordered:
        key = (item.lineno, item.col)
        if key in seen:
            continue
        seen.add(key)
        if item.lineno < 1 or item.lineno > len(lines):
            raise EditError(f"line {item.lineno} is outside the file")
        line = lines[item.lineno - 1]
        end = item.col + len(item.old)
        if line[item.col:end] != item.old:
            raise EditError(
                f"expected {item.old!r} at {item.lineno}:{item.col}, found {line[item.col:end]!r}"
            )
        lines[item.lineno - 1] = line[: item.col] + item.new + line[end:]
    return "".join(lines)


def _call_name(func: ast.AST) -> str | None:
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return None


def rename_keyword_calls(source: str, call_name: str, old: str, new: str) -> str:
    tree = ast.parse(source)
    replacements: list[Replacement] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and _call_name(node.func) == call_name:
            for keyword in node.keywords:
                if keyword.arg == old and keyword.lineno and keyword.col_offset is not None:
                    replacements.append(Replacement(keyword.lineno, keyword.col_offset, old, new))
    if not replacements:
        raise EditError(f"no {call_name}(..., {old}=) call found")
    return apply_replacements(source, replacements)


def rename_except_attribute(source: str, old: str, new: str) -> str:
    tree = ast.parse(source)
    replacements: list[Replacement] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.ExceptHandler) or not isinstance(node.type, ast.Attribute):
            continue
        if node.type.attr != old or node.type.end_lineno is None or node.type.end_col_offset is None:
            continue
        col = node.type.end_col_offset - len(old)
        replacements.append(Replacement(node.type.end_lineno, col, old, new))
    if not replacements:
        raise EditError(f"no except-clause attribute {old!r}")
    return apply_replacements(source, replacements)


def insert_field_before_method(
    source: str,
    method: str,
    field: str,
    only_lines: set[int],
) -> str:
    tree = ast.parse(source)
    replacements: list[Replacement] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Attribute) or node.attr != method:
            continue
        if node.lineno not in only_lines or node.end_col_offset is None:
            continue
        col = node.end_col_offset - len(method)
        replacements.append(Replacement(node.lineno, col, "", f"{field}."))
    if not replacements:
        raise EditError(f"no .{method} call on the failing lines")
    return apply_replacements(source, replacements)


def rename_name_tokens(source: str, old: str, new: str) -> str:
    reader = io.StringIO(source).readline
    replacements: list[Replacement] = []
    for tok in tokenize.generate_tokens(reader):
        if tok.type == tokenize.NAME and tok.string == old:
            line, col = tok.start
            replacements.append(Replacement(line, col, old, new))
    if not replacements:
        raise EditError(f"name {old!r} was not found")
    return apply_replacements(source, replacements)


STR_METHODS = frozenset(
    {
        "upper",
        "lower",
        "strip",
        "lstrip",
        "rstrip",
        "startswith",
        "endswith",
        "split",
        "replace",
        "title",
        "casefold",
        "capitalize",
    }
)
