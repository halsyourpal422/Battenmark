export function uid(prefix: string) {
  const n = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${n}`;
}

export function nextName(existing: string[], base: string) {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let i = 1; i < 10000; i++) {
    const n = `${base}${String(i).padStart(3, "0")}`;
    if (!taken.has(n)) return n;
  }
  return `${base}_${uid("x")}`;
}
