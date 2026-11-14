// Bundles the extension into extension/dist and zips it to public/splitsafe-extension.zip
// so the live site can offer it as a download. Run: npm run build:extension
import AdmZip from "adm-zip";
import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
const zipPath = join(here, "..", "public", "splitsafe-extension.zip");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: { content: join(here, "src/content.ts"), sync: join(here, "src/sync.ts"), popup: join(here, "src/popup.ts") },
  bundle: true,
  format: "iife",
  target: "chrome110",
  minify: true,
  outdir: dist,
  tsconfig: join(here, "..", "tsconfig.json"),
  logLevel: "warning",
});
for (const f of ["manifest.json", "popup.html"]) copyFileSync(join(here, f), join(dist, f));

const zip = new AdmZip();
zip.addLocalFolder(dist);
zip.writeZip(zipPath);
console.log(`Extension built → ${dist}\nZip → ${zipPath}`);
