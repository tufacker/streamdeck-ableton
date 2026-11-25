import { randomUUID } from "node:crypto";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = join(projectRoot, "io.github.tufacker.ableton-control.sdPlugin");
const pluginManifest = JSON.parse(readFileSync(join(pluginRoot, "manifest.json"), "utf8"));
const profileFile = "ableton-control";
if (!pluginManifest.Profiles?.some((profile) => profile.Name === profileFile)) {
  throw new Error(`manifest.json Profiles must list "${profileFile}"`);
}
const output = join(pluginRoot, `${profileFile}.streamDeckProfile`);
const distDirectory = join(projectRoot, "dist");
const standaloneOutput = join(distDirectory, "Ableton-Control.streamDeckProfile");
const temporaryRoot = mkdtempSync(join(tmpdir(), "ableton-control-profile-"));
// Fixed IDs, new with the io.github.tufacker.ableton-control plugin ID, so a
// reinstall updates the same profile instead of adding another.
const profileId = "4AB11F74-8D09-4B72-85BF-8E6CFC3CED4B";
const mainPageId = "B96CF2C1-68F6-4384-AAAF-4273B327BB0C";
const defaultPageId = "7BB7D521-A35E-4228-9F7C-37AE418B79E5";
const profileDirectory = join(temporaryRoot, `${profileId}.sdProfile`);
const mainPage = join(profileDirectory, "Profiles", mainPageId);
const defaultPage = join(profileDirectory, "Profiles", defaultPageId);

const keyAction = (name, uuid) => ({
  ActionID: randomUUID(),
  LinkedTitle: true,
  Name: name,
  Plugin: plugin,
  Resources: null,
  Settings: {},
  State: 0,
  States: [{
    FontFamily: "",
    FontSize: 12,
    FontStyle: "",
    FontUnderline: false,
    OutlineThickness: 2,
    ShowTitle: false,
    TitleAlignment: "bottom",
    TitleColor: "#ffffff"
  }],
  UUID: uuid
});

const encoderAction = (name, uuid) => ({
  ActionID: randomUUID(),
  LinkedTitle: true,
  Name: name,
  Plugin: plugin,
  Resources: null,
  Settings: {},
  State: 0,
  States: [{}],
  UUID: uuid
});

const prefix = "io.github.tufacker.ableton-control";
const plugin = {
  Name: pluginManifest.Name,
  UUID: prefix,
  Version: pluginManifest.Version
};
const pageManifest = {
  Controllers: [
    {
      Actions: {
        "0,0": keyAction("Arm Selected Track", `${prefix}.arm`),
        "1,0": keyAction("Solo Selected Track", `${prefix}.solo`),
        "2,0": keyAction("Mute Selected Track", `${prefix}.mute`),
        "3,0": keyAction("Arm Mode", `${prefix}.arm-mode`),
        "0,1": keyAction("Play", `${prefix}.play`),
        "1,1": keyAction("Stop", `${prefix}.stop`),
        "2,1": keyAction("Arrangement Record", `${prefix}.record`),
        "3,1": keyAction("Click", `${prefix}.click`)
      },
      Type: "Keypad"
    },
    {
      Actions: {
        "0,0": encoderAction("Selected Track", `${prefix}.track`),
        "1,0": encoderAction("Vertical Track / Session Row Control", `${prefix}.vertical-zoom`),
        "2,0": encoderAction("Horizontal Arrangement Zoom", `${prefix}.horizontal-zoom`),
        "3,0": encoderAction("Selected Track Volume", `${prefix}.volume`)
      },
      Type: "Encoder"
    }
  ],
  Icon: "",
  Name: "Mixer"
};

const blankManifest = {
  Controllers: [{ Actions: {}, Type: "Keypad" }, { Actions: {}, Type: "Encoder" }],
  Icon: "",
  Name: ""
};

const rootManifest = {
  AppIdentifier: "*",
  // A blank device UUID lets the Stream Deck app ask which Stream Deck + to use.
  Device: { Model: "20GBD9901", UUID: process.env.ABLETON_CONTROL_DEVICE_UUID ?? "" },
  Name: "Ableton Control",
  Pages: {
    Current: mainPageId.toLowerCase(),
    Default: defaultPageId.toLowerCase(),
    Pages: [mainPageId.toLowerCase()]
  },
  Version: "3.0"
};

try {
  mkdirSync(join(mainPage, "Images"), { recursive: true });
  mkdirSync(join(defaultPage, "Images"), { recursive: true });
  writeFileSync(join(profileDirectory, "manifest.json"), JSON.stringify(rootManifest));
  writeFileSync(join(mainPage, "manifest.json"), JSON.stringify(pageManifest));
  writeFileSync(join(defaultPage, "manifest.json"), JSON.stringify(blankManifest));
  rmSync(output, { force: true });
  const result = spawnSync("/usr/bin/zip", ["-X", "-q", "-r", output, "."], {
    cwd: temporaryRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) throw new Error(result.stderr || "zip failed");
  mkdirSync(distDirectory, { recursive: true });
  copyFileSync(output, standaloneOutput);
  console.log(`Built ${output}`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
