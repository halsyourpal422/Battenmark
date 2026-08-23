import type { MeshData } from "./types";

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(6);
}

export function meshesToStl(meshes: MeshData[], name: string): string {
  const safe = name.replace(/[^\w.-]+/g, "_") || "model";
  const lines: string[] = [`solid ${safe}`];
  for (const mesh of meshes) {
    const p = mesh.positions;
    const n = mesh.normals;
    for (let i = 0; i < mesh.triangleCount; i++) {
      const o = i * 9;
      lines.push(`  facet normal ${fmt(n[o]!)} ${fmt(n[o + 1]!)} ${fmt(n[o + 2]!)}`);
      lines.push("    outer loop");
      lines.push(`      vertex ${fmt(p[o]!)} ${fmt(p[o + 1]!)} ${fmt(p[o + 2]!)}`);
      lines.push(`      vertex ${fmt(p[o + 3]!)} ${fmt(p[o + 4]!)} ${fmt(p[o + 5]!)}`);
      lines.push(`      vertex ${fmt(p[o + 6]!)} ${fmt(p[o + 7]!)} ${fmt(p[o + 8]!)}`);
      lines.push("    endloop");
      lines.push("  endfacet");
    }
  }
  lines.push(`endsolid ${safe}`);
  return lines.join("\n");
}

export function meshesToObj(meshes: MeshData[], name: string): string {
  const lines: string[] = [`# AgentCAD ${name}`, `o ${name.replace(/\s+/g, "_")}`];
  let vBase = 1;
  for (const mesh of meshes) {
    lines.push(`g ${mesh.bodyName}`);
    const p = mesh.positions;
    const nrm = mesh.normals;
    for (let i = 0; i < p.length; i += 3) {
      lines.push(`v ${fmt(p[i]!)} ${fmt(p[i + 1]!)} ${fmt(p[i + 2]!)}`);
    }
    for (let i = 0; i < nrm.length; i += 3) {
      lines.push(`vn ${fmt(nrm[i]!)} ${fmt(nrm[i + 1]!)} ${fmt(nrm[i + 2]!)}`);
    }
    for (let t = 0; t < mesh.triangleCount; t++) {
      const a = vBase + t * 3;
      lines.push(`f ${a}//${a} ${a + 1}//${a + 1} ${a + 2}//${a + 2}`);
    }
    vBase += mesh.triangleCount * 3;
  }
  return lines.join("\n");
}

export function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
