import { cadError } from "./errors";
import type { Dim, Parameter, Vec3, Vec3Expr } from "./types";

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Tok =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "(" | ")" };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const s = src.trim();
  while (i < s.length) {
    const c = s[i]!;
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if ("+-*/()".includes(c)) {
      out.push({ t: "op", v: c as "+" | "-" | "*" | "/" | "(" | ")" });
      i++;
      continue;
    }
    if (c === "." || (c >= "0" && c <= "9")) {
      const m = s.slice(i).match(/^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/);
      if (!m) {
        throw cadError("INVALID_EXPRESSION", `Bad number at '${s.slice(i)}'.`, {
          expression: src,
        });
      }
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      const ident = m?.[0];
      if (!ident) {
        throw cadError("INVALID_EXPRESSION", `Unexpected character '${c}'.`, { expression: src });
      }
      out.push({ t: "id", v: ident });
      i += ident.length;
      continue;
    }
    throw cadError("INVALID_EXPRESSION", `Unexpected character '${c}'.`, {
      expression: src,
    });
  }
  return out;
}

export function extractIdents(expr: string): string[] {
  try {
    return tokenize(expr)
      .filter((t): t is { t: "id"; v: string } => t.t === "id")
      .map((t) => t.v);
  } catch {
    return [];
  }
}

export function dimText(value: Dim | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "expr" in value) return value.expr;
  return null;
}

export function collectDimRefs(value: Dim | Vec3Expr | undefined | null): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === "number") return [];
  if (typeof value === "string") return extractIdents(value);
  if (typeof value === "object" && "expr" in value && typeof value.expr === "string") {
    return extractIdents(value.expr);
  }
  if (typeof value === "object" && ("x" in value || "y" in value || "z" in value)) {
    const v = value as Vec3Expr;
    return [...collectDimRefs(v.x), ...collectDimRefs(v.y), ...collectDimRefs(v.z)];
  }
  return [];
}

export function evaluateExpression(
  expr: string,
  vars: Record<string, number>,
): number {
  const tokens = tokenize(expr);
  let p = 0;

  const peek = () => tokens[p];
  const take = () => tokens[p++];

  const factor = (): number => {
    const tok = take();
    if (!tok) throw cadError("INVALID_EXPRESSION", "Unexpected end of expression.", { expression: expr });
    if (tok.t === "num") return tok.v;
    if (tok.t === "id") {
      if (!(tok.v in vars)) {
        throw cadError("UNKNOWN_PARAMETER", `Unknown parameter '${tok.v}'.`, {
          expression: expr,
          suggestion: `Define '${tok.v}' first with define_parameter.`,
        });
      }
      return vars[tok.v]!;
    }
    if (tok.t === "op" && tok.v === "(") {
      const v = expr_();
      const close = take();
      if (close?.t !== "op" || close.v !== ")") {
        throw cadError("INVALID_EXPRESSION", "Missing ')'.", { expression: expr });
      }
      return v;
    }
    if (tok.t === "op" && tok.v === "-") return -factor();
    if (tok.t === "op" && tok.v === "+") return factor();
    throw cadError("INVALID_EXPRESSION", "Invalid expression.", { expression: expr });
  };

  const term = (): number => {
    let v = factor();
    while (peek()?.t === "op" && (peek()!.v === "*" || peek()!.v === "/")) {
      const op = take()!.v;
      const r = factor();
      if (op === "/") {
        if (r === 0) throw cadError("INVALID_EXPRESSION", "Division by zero.", { expression: expr });
        v /= r;
      } else v *= r;
    }
    return v;
  };

  const expr_ = (): number => {
    let v = term();
    while (peek()?.t === "op" && (peek()!.v === "+" || peek()!.v === "-")) {
      const op = take()!.v;
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };

  const value = expr_();
  if (p !== tokens.length) {
    throw cadError("INVALID_EXPRESSION", "Unexpected trailing tokens.", { expression: expr });
  }
  if (!Number.isFinite(value)) {
    throw cadError("INVALID_EXPRESSION", "Expression did not yield a finite number.", { expression: expr });
  }
  return value;
}

export function isIdent(name: string) {
  return IDENT.test(name);
}

export function resolveDim(
  value: Dim | undefined | null,
  vars: Record<string, number>,
  label: string,
): number {
  if (value === undefined || value === null) {
    throw cadError("INVALID_NUMBER", `${label} is missing.`);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw cadError("INVALID_NUMBER", `${label} is not a finite number.`);
    }
    return value;
  }
  const expr = typeof value === "string" ? value : value.expr;
  return evaluateExpression(expr, vars);
}

export function resolveVec3(
  value: Partial<Vec3Expr> | Vec3 | undefined | null,
  vars: Record<string, number>,
  label = "origin",
): Vec3 {
  const v = value ?? {};
  return {
    x: resolveDim((v as Vec3Expr).x ?? 0, vars, `${label}.x`),
    y: resolveDim((v as Vec3Expr).y ?? 0, vars, `${label}.y`),
    z: resolveDim((v as Vec3Expr).z ?? 0, vars, `${label}.z`),
  };
}

export function resolveParameters(parameters: Parameter[]): Record<string, number> {
  const byName = new Map(parameters.map((p) => [p.name, p]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const out: Record<string, number> = {};

  const visit = (name: string, stack: string[]) => {
    if (visited.has(name)) return;
    const p = byName.get(name);
    if (!p) {
      throw cadError("UNKNOWN_PARAMETER", `Unknown parameter '${name}'.`);
    }
    if (visiting.has(name)) {
      const cycle = [...stack, name];
      throw cadError("PARAMETER_CYCLE", `Parameter cycle: ${cycle.join(" → ")}.`, {
        parameters: cycle,
        suggestion: "Break the cycle — a parameter cannot depend on itself, directly or indirectly.",
      });
    }
    visiting.add(name);
    if (p.expression) {
      for (const dep of extractIdents(p.expression)) {
        if (byName.has(dep)) visit(dep, [...stack, name]);
      }
      out[name] = evaluateExpression(p.expression, out);
    } else {
      out[name] = p.value;
    }
    visiting.delete(name);
    visited.add(name);
  };

  for (const p of parameters) visit(p.name, []);
  return out;
}

export function requirePositive(n: number, label: string) {
  if (n < 0) throw cadError("NEGATIVE_VALUE", `${label} cannot be negative.`, { value: n });
  if (n === 0) throw cadError("ZERO_DIMENSION", `${label} cannot be zero.`, { value: n });
  return n;
}

export function requireNonNegative(n: number, label: string) {
  if (n < 0) throw cadError("NEGATIVE_VALUE", `${label} cannot be negative.`, { value: n });
  return n;
}
