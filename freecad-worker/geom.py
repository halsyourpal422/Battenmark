"""Shared geometry helpers: semantic faces, expressions, FreeCAD names."""

from __future__ import annotations

import math
import re
from typing import Any

IDENT_RE = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\b")
SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9_]+")


class GeomError(Exception):
    def __init__(self, code: str, message: str, **extra: Any):
        super().__init__(message)
        self.code = code
        self.message = message
        self.extra = extra

    def as_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, **self.extra}


def fc_name(label: str, used: set[str], fallback: str = "Obj") -> str:
    base = SAFE_NAME_RE.sub("_", label).strip("_") or fallback
    if base[0].isdigit():
        base = f"F_{base}"
    name = base
    i = 1
    while name in used:
        i += 1
        name = f"{base}_{i}"
    used.add(name)
    return name


def dim_text(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict) and "expr" in value:
        return str(value["expr"])
    return None


def extract_idents(expr: str) -> list[str]:
    return IDENT_RE.findall(expr)


def resolve_dim(value: Any, params: dict[str, float], label: str = "dimension") -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        n = float(value)
        if not math.isfinite(n):
            raise ValueError(f"{label} is not a finite number")
        return n
    if isinstance(value, dict) and "expr" in value:
        value = value["expr"]
    if not isinstance(value, str):
        raise ValueError(f"{label} must be a number or expression")
    stripped = value.strip()
    if stripped in params:
        return float(params[stripped])
    return eval_expr(stripped, params)


def eval_expr(src: str, params: dict[str, float]) -> float:
    tokens: list[tuple[str, Any]] = []
    i = 0
    s = src.strip()
    while i < len(s):
        c = s[i]
        if c in " \t\n":
            i += 1
            continue
        if c in "+-*/()":
            tokens.append(("op", c))
            i += 1
            continue
        if c.isdigit() or c == ".":
            m = re.match(r"[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?", s[i:])
            if not m:
                raise ValueError(f"Bad number in expression '{src}'")
            tokens.append(("num", float(m.group(0))))
            i += len(m.group(0))
            continue
        if c.isalpha() or c == "_":
            m = re.match(r"[A-Za-z_][A-Za-z0-9_]*", s[i:])
            tokens.append(("id", m.group(0)))
            i += len(m.group(0))
            continue
        raise ValueError(f"Unexpected character '{c}' in expression '{src}'")

    pos = 0

    def peek():
        return tokens[pos] if pos < len(tokens) else None

    def take():
        nonlocal pos
        tok = peek()
        pos += 1
        return tok

    def factor() -> float:
        tok = take()
        if tok is None:
            raise ValueError(f"Unexpected end of expression '{src}'")
        kind, val = tok
        if kind == "num":
            return float(val)
        if kind == "id":
            if val not in params:
                raise GeomError("UNKNOWN_PARAMETER", f"Unknown parameter '{val}'", expression=src)
            return float(params[val])
        if kind == "op" and val == "(":
            v = expr()
            close = take()
            if close is None or close != ("op", ")"):
                raise ValueError(f"Missing ')' in '{src}'")
            return v
        if kind == "op" and val == "-":
            return -factor()
        if kind == "op" and val == "+":
            return factor()
        raise ValueError(f"Invalid expression '{src}'")

    def term() -> float:
        v = factor()
        while peek() and peek()[0] == "op" and peek()[1] in "*/":
            op = take()[1]
            r = factor()
            if op == "/":
                if r == 0:
                    raise ValueError("Division by zero")
                v /= r
            else:
                v *= r
        return v

    def expr() -> float:
        v = term()
        while peek() and peek()[0] == "op" and peek()[1] in "+-":
            op = take()[1]
            r = term()
            v = v + r if op == "+" else v - r
        return v

    value = expr()
    if pos != len(tokens):
        raise ValueError(f"Unexpected trailing tokens in '{src}'")
    if not math.isfinite(value):
        raise ValueError(f"Expression '{src}' did not yield a finite number")
    return value


def to_freecad_expr(expr: str, param_names: set[str]) -> str:
    def repl(match: re.Match[str]) -> str:
        name = match.group(1)
        if name in param_names:
            return f"Params.{name}"
        return name

    return IDENT_RE.sub(repl, expr)


def resolve_params(parameters: list[dict[str, Any]]) -> dict[str, float]:
    by_name = {p["name"]: p for p in parameters}
    visiting: set[str] = set()
    visited: set[str] = set()
    out: dict[str, float] = {}

    def visit(name: str, stack: list[str]) -> None:
        if name in visited:
            return
        p = by_name.get(name)
        if p is None:
            raise GeomError("UNKNOWN_PARAMETER", f"Unknown parameter '{name}'")
        if name in visiting:
            cycle = stack + [name]
            raise GeomError("PARAMETER_CYCLE", f"Parameter cycle: {' → '.join(cycle)}.", parameters=cycle)
        visiting.add(name)
        expr = p.get("expression")
        if expr:
            for dep in extract_idents(expr):
                if dep in by_name:
                    visit(dep, stack + [name])
            out[name] = eval_expr(expr, out)
        else:
            out[name] = float(p["value"])
        visiting.discard(name)
        visited.add(name)

    for p in parameters:
        visit(p["name"], [])
    return out


def resolve_vec3(partial: dict[str, Any] | None, params: dict[str, float], label: str = "origin") -> dict[str, float]:
    partial = partial or {}
    return {
        "x": resolve_dim(partial.get("x", 0), params, f"{label}.x"),
        "y": resolve_dim(partial.get("y", 0), params, f"{label}.y"),
        "z": resolve_dim(partial.get("z", 0), params, f"{label}.z"),
    }


def vec(partial: dict[str, Any] | None, params: dict[str, float] | None = None) -> dict[str, float]:
    """Backward-compatible origin resolver. Prefer resolve_vec3 when params are available."""
    if params is not None:
        return resolve_vec3(partial, params)
    partial = partial or {}

    def _num(v: Any) -> float:
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                return float(v)
            except ValueError:
                return 0.0
        return 0.0

    return {"x": _num(partial.get("x") or 0), "y": _num(partial.get("y") or 0), "z": _num(partial.get("z") or 0)}


def add_vec(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    return {"x": a["x"] + b["x"], "y": a["y"] + b["y"], "z": a["z"] + b["z"]}


def scale_vec(a: dict[str, float], s: float) -> dict[str, float]:
    return {"x": a["x"] * s, "y": a["y"] * s, "z": a["z"] * s}


def box_faces(origin: dict[str, float], L: float, W: float, H: float) -> list[dict[str, Any]]:
    ox, oy, oz = origin["x"], origin["y"], origin["z"]
    return [
        {
            "name": "bottom_face",
            "origin": {"x": ox, "y": oy, "z": oz},
            "uDir": {"x": 1, "y": 0, "z": 0},
            "vDir": {"x": 0, "y": 1, "z": 0},
            "normal": {"x": 0, "y": 0, "z": -1},
            "width": L,
            "height": W,
            "thickness": H,
        },
        {
            "name": "top_face",
            "origin": {"x": ox, "y": oy, "z": oz + H},
            "uDir": {"x": 1, "y": 0, "z": 0},
            "vDir": {"x": 0, "y": 1, "z": 0},
            "normal": {"x": 0, "y": 0, "z": 1},
            "width": L,
            "height": W,
            "thickness": H,
        },
        {
            "name": "back_face",
            "origin": {"x": ox, "y": oy, "z": oz},
            "uDir": {"x": 1, "y": 0, "z": 0},
            "vDir": {"x": 0, "y": 0, "z": 1},
            "normal": {"x": 0, "y": -1, "z": 0},
            "width": L,
            "height": H,
            "thickness": W,
        },
        {
            "name": "front_face",
            "origin": {"x": ox, "y": oy + W, "z": oz},
            "uDir": {"x": 1, "y": 0, "z": 0},
            "vDir": {"x": 0, "y": 0, "z": 1},
            "normal": {"x": 0, "y": 1, "z": 0},
            "width": L,
            "height": H,
            "thickness": W,
        },
        {
            "name": "left_face",
            "origin": {"x": ox, "y": oy, "z": oz},
            "uDir": {"x": 0, "y": 1, "z": 0},
            "vDir": {"x": 0, "y": 0, "z": 1},
            "normal": {"x": -1, "y": 0, "z": 0},
            "width": W,
            "height": H,
            "thickness": L,
        },
        {
            "name": "right_face",
            "origin": {"x": ox + L, "y": oy, "z": oz},
            "uDir": {"x": 0, "y": 1, "z": 0},
            "vDir": {"x": 0, "y": 0, "z": 1},
            "normal": {"x": 1, "y": 0, "z": 0},
            "width": W,
            "height": H,
            "thickness": L,
        },
    ]


def hole_uv(feat: dict[str, Any], face: dict[str, Any], params: dict[str, float]) -> tuple[float, float]:
    """Face-local (u, v) for a hole. Min-corner by default; from_right/from_front measured from max edges."""
    width = float(face["width"])
    height = float(face["height"])
    if feat.get("centered"):
        return width / 2.0, height / 2.0
    if feat.get("fromRight") is not None:
        u = width - resolve_dim(feat.get("fromRight"), params, "from_right")
    elif feat.get("fromLeft") is not None:
        u = resolve_dim(feat.get("fromLeft"), params, "from_left")
    else:
        u = resolve_dim(feat.get("u") or 0, params, "x")
    if feat.get("fromFront") is not None:
        v = height - resolve_dim(feat.get("fromFront"), params, "from_front")
    elif feat.get("fromBack") is not None:
        v = resolve_dim(feat.get("fromBack"), params, "from_back")
    else:
        v = resolve_dim(feat.get("v") or 0, params, "y")
    return u, v
