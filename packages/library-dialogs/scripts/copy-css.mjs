import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../src/theme.css");
const out = resolve(here, "../dist/theme.css");
mkdirSync(dirname(out), { recursive: true });
copyFileSync(src, out);

const css = readFileSync(src, "utf8");
const js = `// Auto-generated. Importing this module injects @arcana/library-dialogs theme into <head>.
const css = ${JSON.stringify(css)};
if (typeof document !== "undefined" && !document.getElementById("ld-theme-css")) {
  const style = document.createElement("style");
  style.id = "ld-theme-css";
  style.textContent = css;
  document.head.appendChild(style);
}
export default css;
`;
writeFileSync(resolve(here, "../dist/theme.css.js"), js);
console.log("[library-dialogs] theme.css copied + theme.css.js generated");
