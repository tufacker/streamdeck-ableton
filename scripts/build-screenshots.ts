// Draws the README images of a Stream Deck + running Ableton Control, using the
// plugin's own key and touch-strip drawing with a made-up Live state.
//   npm run screenshots   ->   docs/images/stream-deck-plus*.png
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { compactNumericDisplay, splitStripSegment, toggleSvg, transportStripSegment, transportSvg } from "../src/render";
import type { ConnectionState } from "../src/types";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(projectRoot, "docs", "images");
mkdirSync(output, { recursive: true });

const stopped: ConnectionState = {
  connected: true,
  lastSeen: Date.now(),
  liveVersion: "12.4.0",
  armMode: "auto",
  viewMode: "session",
  externalInstrumentBrowser: { available: true, index: 2, count: 12, name: "Poly Synth", relativePath: "Poly Synth.adv" },
  transport: { playing: false, recording: false, metronome: true, songTime: 0, locator: "1.1.1", tempo: 120, signatureNumerator: 4, signatureDenominator: 4 },
  track: {
    index: 2, count: 8, name: "Lead", color: "#ffa62b", outputMeterLeft: 0.55, outputMeterRight: 0.62,
    kind: "track", typeLabel: "MIDI", deviceLabel: "EXT INST · Poly Synth",
    midiFromLabel: "All Ins · All Channels", midiToLabel: "Poly Synth · Ch. 1", audioFromLabel: "", audioToLabel: "",
    arm: true, armAvailable: true, armSoft: false, armLatched: false,
    solo: false, soloAvailable: true, mute: false, muteAvailable: true,
    monitor: 1, monitorLabel: "Auto", monitorAvailable: true,
    volume: 0.85, volumeNormalized: 0.85, volumeDisplay: "0.0 dB", volumeAvailable: true,
    pan: 0, panNormalized: 0.5, panDisplay: "C", panAvailable: true
  }
};
const playing: ConnectionState = {
  ...stopped,
  viewMode: "arranger",
  transport: { ...stopped.transport, playing: true, songTime: 34.5, locator: "9.3.3" }
};

// The four dial tiles as src/actions/dials.ts draws them.
function tile(state: ConnectionState, index: number): string {
  const transport = transportStripSegment(state, index);
  if (transport) return transport;
  const track = state.track!;
  const session = state.viewMode === "session";
  const tiles = [
    { label: "Track", value: `${track.index + 1}/${track.count} ${track.typeLabel}` },
    { label: session ? "Track" : "Tracks", value: session ? "Scroll/Clip" : "Height/Fold" },
    session
      ? { label: "View / Add (Hold)", value: state.externalInstrumentBrowser.name }
      : { label: "Arrange", value: "Time/View" },
    { label: "Vol", value: compactNumericDisplay(track.volumeDisplay), progress: track.volumeNormalized }
  ];
  return splitStripSegment(state, index, tiles[index]);
}

// Each key and strip segment is rendered to pixels at its own size and then
// placed, so the four 200×100 strip segments meet without seams.
const KEY = 170;
const GAP = 40;
const MARGIN = 60;
const STRIP_WIDTH = 4 * 200; // the touch strip at its real size: 800×100
const png = (svg: string, size?: number) => {
  const image = sharp(Buffer.from(svg), { density: 144 });
  return (size ? image.resize(size, size) : image).png().toBuffer();
};

async function draw(state: ConnectionState, file: string): Promise<void> {
  const layers: sharp.OverlayOptions[] = [];
  const top = [toggleSvg("arm", state), toggleSvg("solo", state), toggleSvg("mute", state), toggleSvg("armMode", state)];
  const bottom = [transportSvg("play", state), transportSvg("stop", state), transportSvg("record", state), transportSvg("click", state)];
  let y = MARGIN;
  for (const row of [top, bottom]) {
    for (const [column, svg] of row.entries()) {
      layers.push({ input: await png(svg, KEY), left: MARGIN + column * (KEY + GAP), top: y });
    }
    y += KEY + GAP;
  }
  for (let index = 0; index < 4; index += 1) {
    const segment = await sharp(Buffer.from(tile(state, index))).resize(200, 100).png().toBuffer();
    layers.push({ input: segment, left: MARGIN + index * 200, top: y });
  }
  y += 100 + GAP;
  const radius = 58;
  const knobs: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    const cx = MARGIN + 200 * index + 100;
    knobs.push(`<circle cx="${cx}" cy="${y + radius}" r="${radius}" fill="#1c232b" stroke="#2f3a45" stroke-width="4"/>`);
    knobs.push(`<rect x="${cx - 3}" y="${y + 16}" width="6" height="26" rx="3" fill="#5b6b7a"/>`);
  }
  const height = y + radius * 2 + MARGIN;
  const width = STRIP_WIDTH + MARGIN * 2;
  const base = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" rx="44" fill="#0d1116"/>
  ${knobs.join("\n  ")}
</svg>`;
  const path = join(output, file);
  await sharp(Buffer.from(base)).composite(layers).png().toFile(path);
  console.log(`Built ${path}`);
}

await draw(stopped, "stream-deck-plus.png");
await draw(playing, "stream-deck-plus-playing.png");
