// Packages the plugin (dist/Ableton-Control.streamDeckPlugin) and the release
// bundle (dist/Ableton-Control-<version>.zip: install.sh, the Remote Script and
// the plugin package, laid out the way install.sh expects).
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginDirectory = "io.github.tufacker.ableton-control.sdPlugin";
const dist = join(projectRoot, "dist");
const pluginPackage = join(dist, "Ableton-Control.streamDeckPlugin");
const { version } = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const bundleName = `Ableton-Control-${version}`;
const bundle = join(dist, `${bundleName}.zip`);
const junk = ["*.DS_Store", "*/logs/*", "*CaseConflict*", "*__pycache__*", "*.pyc"];

const zip = (cwd, output, ...inputs) => {
  const result = spawnSync("/usr/bin/zip", ["-X", "-q", "-r", output, ...inputs, "-x", ...junk], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `zip failed for ${output}`);
};

mkdirSync(dist, { recursive: true });
rmSync(pluginPackage, { force: true });
zip(projectRoot, pluginPackage, pluginDirectory);
console.log(`Built ${pluginPackage}`);

const staging = mkdtempSync(join(tmpdir(), "ableton-control-release-"));
try {
  const root = join(staging, bundleName);
  mkdirSync(join(root, "dist"), { recursive: true });
  for (const file of ["install.sh", "README.md", "LICENSE", "CHANGELOG.md"]) cpSync(join(projectRoot, file), join(root, file));
  cpSync(join(projectRoot, "scripts", "user-library.zsh"), join(root, "scripts", "user-library.zsh"));
  cpSync(join(projectRoot, "docs", "images"), join(root, "docs", "images"), { recursive: true });
  cpSync(join(projectRoot, "ableton", "AbletonStreamDeckPlus"), join(root, "ableton", "AbletonStreamDeckPlus"), { recursive: true });
  cpSync(pluginPackage, join(root, "dist", "Ableton-Control.streamDeckPlugin"));
  rmSync(bundle, { force: true });
  zip(staging, bundle, bundleName);
  console.log(`Built ${bundle}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
