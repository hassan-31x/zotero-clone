import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, cpSync } from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const reactPdfRequire = createRequire(require.resolve("react-pdf"));
const root = path.dirname(reactPdfRequire.resolve("pdfjs-dist/package.json"));
mkdirSync("public/pdf", { recursive: true });
copyFileSync(
  path.join(root, "build/pdf.worker.min.mjs"),
  "public/pdf/pdf.worker.min.mjs",
);
for (const dir of ["cmaps", "standard_fonts", "wasm"])
  cpSync(path.join(root, dir), `public/pdf/${dir}`, { recursive: true });
