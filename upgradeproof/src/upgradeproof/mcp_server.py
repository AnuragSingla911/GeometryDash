"""A small MCP-compatible stdio server over the same Python functions.

This speaks the initialize / tools/list / tools/call subset used by MCP clients.
It is intentionally not a second implementation of the investigation.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from upgradeproof.classify import classify_output
from upgradeproof.packages import load_package
from upgradeproof.policy import assess_sources

PROTOCOL = "2024-11-05"


def tools() -> list[dict]:
    return [
        _tool(
            "list_files",
            "List files inside the jailed workspace.",
            {"type": "object", "properties": {}, "additionalProperties": False},
        ),
        _tool(
            "read_file",
            "Read a UTF-8 text file inside the jailed workspace.",
            {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
                "additionalProperties": False,
            },
        ),
        _tool(
            "get_package_metadata",
            "Read signatures, migration notes, and requirements for the selected package.",
            {"type": "object", "properties": {}, "additionalProperties": False},
        ),
        _tool(
            "classify_failure",
            "Classify a pytest transcript with deterministic checks.",
            {
                "type": "object",
                "properties": {"output": {"type": "string"}},
                "required": ["output"],
                "additionalProperties": False,
            },
        ),
        _tool(
            "validate_sources",
            "Check a before/after file map against the patch policy.",
            {
                "type": "object",
                "properties": {
                    "before": {"type": "object"},
                    "after": {"type": "object"},
                },
                "required": ["before", "after"],
                "additionalProperties": False,
            },
        ),
    ]


class Session:
    def __init__(self, workspace: Path, package_dir: Path, allowed_prefixes: list[str] | None = None):
        self.workspace = workspace.resolve()
        self.package_dir = package_dir.resolve()
        self.allowed_prefixes = allowed_prefixes or ["src/"]

    def call(self, name: str, arguments: dict) -> dict:
        if name == "list_files":
            files = [
                path.relative_to(self.workspace).as_posix()
                for path in sorted(self.workspace.rglob("*"))
                if path.is_file()
            ]
            return {"files": files}
        if name == "read_file":
            return {"text": _read_jailed(self.workspace, arguments["path"])}
        if name == "get_package_metadata":
            return load_package(self.package_dir).to_public_dict()
        if name == "classify_failure":
            return classify_output(arguments["output"]).to_dict()
        if name == "validate_sources":
            return assess_sources(
                arguments["before"], arguments["after"], self.allowed_prefixes
            ).to_dict()
        raise KeyError(name)


def handle(message: dict, session: Session) -> dict | None:
    method = message.get("method")
    msg_id = message.get("id")
    if method == "notifications/initialized":
        return None
    if method == "initialize":
        return _result(
            msg_id,
            {
                "protocolVersion": PROTOCOL,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "upgradeproof", "version": "0.1.0"},
            },
        )
    if method == "tools/list":
        return _result(msg_id, {"tools": tools()})
    if method == "tools/call":
        params = message.get("params") or {}
        try:
            payload = session.call(params.get("name"), params.get("arguments") or {})
            text = json.dumps(payload, indent=2)
            return _result(msg_id, {"content": [{"type": "text", "text": text}], "isError": False})
        except Exception as exc:  # noqa: BLE001 - tool errors stay inside the MCP response
            return _result(
                msg_id,
                {"content": [{"type": "text", "text": str(exc)}], "isError": True},
            )
    return _error(msg_id, -32601, f"unknown method {method}")


def serve(workspace: Path, package_dir: Path) -> None:
    session = Session(workspace, package_dir)
    for line in sys.stdin:
        if not line.strip():
            continue
        message = json.loads(line)
        response = handle(message, session)
        if response is not None:
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()


def _read_jailed(root: Path, relative: str) -> str:
    path = (root / relative).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise PermissionError(f"path is outside the workspace: {relative}")
    text = path.read_text(encoding="utf-8")
    if len(text) > 20_000:
        return text[:20_000]
    return text


def _tool(name: str, description: str, schema: dict) -> dict:
    return {"name": name, "description": description, "inputSchema": schema}


def _result(msg_id, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _error(msg_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}
