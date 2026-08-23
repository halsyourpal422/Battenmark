import { applyOperation } from "../operations";
import { emptyDocument } from "../document";
import { renderDocumentPreview } from "./render";
import { isPng, pngHasIdat, readPngSize } from "./png";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function boxDoc() {
  let doc = emptyDocument("preview-box");
  doc = applyOperation(doc, { op: "create_box", length_mm: 80, width_mm: 50, height_mm: 12 }).document;
  return doc;
}

function pngHasContent(buf: Buffer): boolean {
  let color = 0;
  for (let i = 8; i < Math.min(buf.length, 200); i++) if (buf[i] !== 0) color++;
  return buf.length > 200 && color > 0;
}

async function main() {
  const doc = boxDoc();
  const iso = renderDocumentPreview(doc, "isometric")[0]!;
  assert(isPng(iso.png), "isometric is not a PNG");
  assert(pngHasIdat(iso.png), "isometric PNG missing IDAT");
  const size = readPngSize(iso.png);
  assert(size && size.width === 640 && size.height === 480, `iso size ${JSON.stringify(size)}`);
  assert(iso.triangleCount > 0, "no triangles");
  assert(pngHasContent(iso.png), "png looks empty");
  console.log(`PASS  isometric  ${iso.width}x${iso.height}  ${iso.bytes} bytes  ${iso.triangleCount} tri`);

  for (const view of ["front", "top", "right", "thumbnail"] as const) {
    const r = renderDocumentPreview(doc, view)[0]!;
    assert(isPng(r.png), `${view} not png`);
    const s = readPngSize(r.png)!;
    assert(s.width >= 64 && s.height >= 64, `${view} size`);
    console.log(`PASS  ${view}  ${s.width}x${s.height}  ${r.bytes} bytes`);
  }

  const all = renderDocumentPreview(doc, "all");
  assert(all.length === 4, `all views ${all.length}`);
  console.log("PASS  all-views");

  let emptyFailed = false;
  try {
    renderDocumentPreview(emptyDocument("empty"), "isometric");
  } catch (err) {
    emptyFailed = (err as { code?: string }).code === "PREVIEW_FAILED";
  }
  assert(emptyFailed, "empty document should fail PREVIEW_FAILED");
  console.log("PASS  empty-document error");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
