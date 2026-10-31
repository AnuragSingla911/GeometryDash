"""Deterministic repair candidates from the failure, the new package, and migration notes."""

from __future__ import annotations

from upgradeproof.actions import Action
from upgradeproof.classify import Classification
from upgradeproof.editing import STR_METHODS
from upgradeproof.packages import PackageInfo, edit_distance, parse_exception_notes, parse_renames


def analyze(classification: Classification, package: PackageInfo) -> list[Action]:
    if classification.kind == "unexpected_keyword":
        return _keyword_actions(classification, package)
    if classification.kind == "missing_import":
        return _rename_actions(classification, package)
    if classification.kind == "missing_module_attribute":
        return _except_actions(classification, package)
    if classification.kind == "missing_object_attribute":
        return _field_actions(classification, package)
    return []


def _keyword_actions(classification: Classification, package: PackageInfo) -> list[Action]:
    keyword = classification.unexpected_keyword or ""
    callable_name = classification.callable_name or ""
    owner = callable_name.split(".")[-2] if "." in callable_name else callable_name
    params = package.signatures.get(callable_name) or package.signatures.get(f"{owner}.__init__") or []
    close = [param for param in params if param != keyword and 0 < edit_distance(keyword, param) <= 2]
    actions = []
    for param in close:
        actions.append(
            Action(
                id=f"rename_keyword:{keyword}->{param}",
                kind="rename_keyword",
                summary=f"Rename keyword {keyword!r} to {param!r} on {owner}",
                origin="deterministic",
                candidate_text=f"rename keyword {keyword} to {param} on {owner}",
                payload={"call_name": owner, "old": keyword, "new": param},
            )
        )
    return actions


def _rename_actions(classification: Classification, package: PackageInfo) -> list[Action]:
    missing = classification.missing_name or ""
    renames = [pair for pair in parse_renames(package.migration) if pair[0] == missing]
    actions = []
    for old, new in renames:
        actions.append(
            Action(
                id=f"rename_symbol:{old}->{new}",
                kind="rename_symbol",
                summary=f"Apply migration note RENAME {old} -> {new}",
                origin="deterministic",
                candidate_text=f"RENAME {old} -> {new}",
                payload={"old": old, "new": new},
            )
        )
    return actions


def _except_actions(classification: Classification, package: PackageInfo) -> list[Action]:
    missing = classification.missing_name or ""
    notes = parse_exception_notes(package.migration)
    actions: list[Action] = []
    for name, description in notes:
        actions.append(
            Action(
                id=f"except_type:{name}",
                kind="rename_except",
                summary=f"Catch {name} instead of {missing}",
                origin="analyzer",
                candidate_text=f"{name}: {description}",
                payload={"old": missing, "new": name},
            )
        )
    if notes:
        actions.append(
            Action(
                id="broad_except",
                kind="rename_except",
                summary="Catch Exception instead of the removed type",
                origin="analyzer",
                candidate_text="catch Exception to suppress every error",
                broad=True,
                payload={"old": missing, "new": "Exception"},
            )
        )
    return actions


def _field_actions(classification: Classification, package: PackageInfo) -> list[Action]:
    method = classification.missing_attribute or ""
    class_name = classification.object_type or ""
    if method not in STR_METHODS:
        return []
    fields = package.classes.get(class_name, [])
    if len(fields) != 1:
        return []
    field = fields[0]
    return [
        Action(
            id=f"insert_field:{class_name}.{field}",
            kind="insert_field",
            summary=f"Read {class_name}.{field} before calling .{method}()",
            origin="deterministic",
            candidate_text=f"{class_name} string field {field} before {method}",
            payload={"method": method, "field": field},
        )
    ]


def deterministic_choice(actions: list[Action]) -> Action | None:
    """A unique non-broad candidate can run with no model."""
    specific = [action for action in actions if not action.broad]
    if len(specific) == 1:
        return specific[0]
    return None
