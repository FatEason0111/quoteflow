#!/usr/bin/env python3
"""Parse-check JS/JSX snippets that come back from Figma design context."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
LOCAL_DEPS = REPO_ROOT / ".codex_pydeps"
if str(LOCAL_DEPS) not in sys.path:
    sys.path.insert(0, str(LOCAL_DEPS))

try:
    import esprima
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Missing parser dependency. Install esprima into .codex_pydeps before running this script."
    ) from exc


FENCED_BLOCK_RE = re.compile(r"```(?:[a-zA-Z0-9_-]+)?\n(.*?)```", re.DOTALL)


def read_input(path: str | None) -> str:
    if path:
        return Path(path).read_text(encoding="utf-8")

    return sys.stdin.read()


def extract_source(payload: str, explicit_field: str | None) -> str:
    stripped = payload.strip()
    if not stripped:
        raise ValueError("No input provided.")

    if explicit_field:
        data = json.loads(stripped)
        value = data[explicit_field]
        if not isinstance(value, str):
            raise ValueError(f"JSON field '{explicit_field}' is not a string.")
        return value

    try:
        data = json.loads(stripped)
    except json.JSONDecodeError:
        data = None

    if isinstance(data, dict):
        for candidate in ("code", "jsx", "source"):
            value = data.get(candidate)
            if isinstance(value, str) and value.strip():
                return value

    fenced = FENCED_BLOCK_RE.search(payload)
    if fenced:
        return fenced.group(1).strip("\n")

    return payload


def format_context_line(source: str, line_number: int) -> str:
    lines = source.splitlines()
    if 1 <= line_number <= len(lines):
        return lines[line_number - 1]
    return ""


def parse_source(source: str, mode: str) -> None:
    parser = esprima.parseModule if mode == "module" else esprima.parseScript
    parser(source, jsx=True)


def main() -> int:
    arg_parser = argparse.ArgumentParser(
        description="Run parser-level validation for JS/JSX code returned by Figma."
    )
    arg_parser.add_argument(
        "path",
        nargs="?",
        help="Optional file to read. If omitted, the script reads from stdin.",
    )
    arg_parser.add_argument(
        "--field",
        help="Explicit JSON field to parse, for example --field code.",
    )
    arg_parser.add_argument(
        "--mode",
        choices=("module", "script"),
        default="module",
        help="Parse mode. Defaults to module because Figma snippets often use exports.",
    )
    args = arg_parser.parse_args()

    try:
        payload = read_input(args.path)
        source = extract_source(payload, args.field)
        parse_source(source, args.mode)
    except Exception as exc:
        line_number = getattr(exc, "lineNumber", None)
        column = getattr(exc, "column", None)
        print("Parse failed", file=sys.stderr)
        print(f"Error: {exc}", file=sys.stderr)
        if line_number is not None:
            print(f"Location: line {line_number}, column {column or 0}", file=sys.stderr)
            context_line = format_context_line(source, line_number)
            if context_line:
                print(context_line, file=sys.stderr)
                if column and column > 0:
                    print(" " * (column - 1) + "^", file=sys.stderr)
        return 1

    line_count = source.count("\n") + 1
    print(
        f"Parse OK ({args.mode}, jsx enabled) - {line_count} line(s), {len(source)} char(s)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
