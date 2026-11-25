import type { ConnectionState, ToggleName, TransportName } from "./types";

export const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;"
  })[character] ?? character);

export const svgDataUrl = (svg: string): string =>
  `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;

const safeColor = (color: string | undefined): string =>
  /^#[0-9a-f]{6}$/i.test(color ?? "") ? color! : "#5b5b5b";

const abletonFont = "futura-pt,Futura,Avenir,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,&quot;Helvetica Neue&quot;,Helvetica,Arial,sans-serif";
const trackNameFont = "futura-pt,Futura,&quot;Avenir Next Condensed&quot;,&quot;Arial Black&quot;,Avenir,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,sans-serif";

function mutedTrackBackground(accent: string): string {
  const color = safeColor(accent);
  const base = [37, 42, 49];
  const amount = 0.38;
  const channels = [1, 3, 5].map((start, index) => {
    const channel = Number.parseInt(color.slice(start, start + 2), 16);
    return Math.round(base[index] * (1 - amount) + channel * amount).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

export function compactNumericDisplay(value: string): string {
  const match = value.trim().match(/^(-?(?:\d+\.?\d*|\.\d+))(\s*.*)$/);
  if (!match) return value;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return value;
  const compact = Number(number.toPrecision(3)).toString();
  return `${compact}${match[2]}`;
}

export function displayTrackName(name: string, oneBasedIndex?: number): string {
  const trimmed = name.trim();
  if (oneBasedIndex !== undefined) {
    const escapedIndex = oneBasedIndex.toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const paddedIndex = oneBasedIndex < 10 ? `0${oneBasedIndex}` : oneBasedIndex.toString();
    const escapedPaddedIndex = paddedIndex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exactIndexPrefix = new RegExp(`^\\s*(?:${escapedIndex}|${escapedPaddedIndex})(?:\\s*[-.:]\\s*|\\s+)(.+)$`);
    const exactMatch = name.match(exactIndexPrefix);
    if (exactMatch?.[1]?.trim()) return exactMatch[1].trim();
  }
  return trimmed.replace(/^\s*\d{1,2}\s*[-.:]\s+/, "").replace(/^\s*\d{1,2}\s{2,}/, "").trim() || trimmed;
}

export function dialSvg(
  label: string,
  value: string,
  accent = "#5b5b5b",
  progress?: number,
  textOptions: { labelSize?: number; valueSize?: number; valueY?: number } = {}
): string {
  const color = safeColor(accent);
  const background = mutedTrackBackground(color);
  const normalized = Math.max(0, Math.min(1, progress ?? 0));
  const width = Math.round(180 * normalized);
  const labelSize = textOptions.labelSize ?? 15;
  const valueSize = textOptions.valueSize ?? 22;
  const valueY = textOptions.valueY ?? 65;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <rect width="200" height="100" fill="${background}"/>
  <rect x="0" y="0" width="6" height="100" fill="${color}"/>
  <text x="18" y="30" fill="#aeb5bf" font-family="${abletonFont}" font-size="${labelSize}" font-weight="700">${escapeXml(label.toUpperCase())}</text>
  <text x="18" y="${valueY}" fill="#ffffff" font-family="${abletonFont}" font-size="${valueSize}" font-weight="700">${escapeXml(value)}</text>
  ${progress === undefined ? "" : `<rect x="18" y="80" width="180" height="7" rx="3.5" fill="#2a2e34"/><rect x="18" y="80" width="${width}" height="7" rx="3.5" fill="${color}"/>`}
  </svg>`;
}

type StripTile = {
  label: string;
  value: string;
  progress?: number;
  pan?: number;
};

function armStatusText(state: Readonly<ConnectionState>): string {
  if (!state.track?.armAvailable) return state.armMode === "multi" ? "MULTI" : "SINGLE";
  if (state.armMode !== "multi") return state.track.arm ? "SINGLE · ARM" : "SINGLE";
  if (state.track.armLatched) return "MULTI · LATCH";
  if (state.track.armSoft) return "MULTI · SOFT";
  return "MULTI";
}

function ellipsize(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function compactMidiRoute(value: string): string {
  return value
    .replace(/\bAll Ins\b/g, "ALL")
    .replace(/\bAll Channels\b/g, "ALL")
    .replace(/\bCh\. ([0-9]+)\b/g, "CH$1")
    .replace(/\s+·\s+/g, "/");
}

function compactLongMidiRoute(value: string): string {
  return compactMidiRoute(value)
    .replace(/\s+\([^)]*\)/g, "")
    .replace(/[()]/g, "")
    .replace(/_mk3\b/g, "")
    .replace(/\bOutput\b/g, "Out")
    .replace(/\bInput\b/g, "In");
}

function compactMidiRouteConditionally(value: string): string {
  const compact = compactMidiRoute(value);
  return value.length > 34 || compact.length > 30 ? compactLongMidiRoute(value) : compact;
}

function compactAudioRoute(value: string): string {
  return value
    .replace(/\bExt\. In\b/g, "EXT")
    .replace(/\bExt\. Out\b/g, "EXT")
    .replace(/\bMaster\b/g, "MAIN")
    .replace(/\s+·\s+/g, " ");
}

function trackStatusText(state: Readonly<ConnectionState>): string {
  const track = state.track;
  if (!track) return armStatusText(state);
  const isExternalInstrument = track.deviceLabel?.startsWith("EXT INST");
  const details: string[] = [];
  if (track.deviceLabel) details.push(track.deviceLabel);
  if (track.typeLabel === "MIDI" && track.midiFromLabel) details.push(`MIDI In · ${compactMidiRouteConditionally(track.midiFromLabel)}`);
  if (track.typeLabel === "MIDI" && track.midiToLabel) details.push(`${isExternalInstrument ? "Output" : "MIDI Out"} · ${compactMidiRouteConditionally(track.midiToLabel)}`);
  if (track.typeLabel === "AUDIO" && track.audioFromLabel) details.push(`Audio In · ${compactAudioRoute(track.audioFromLabel)}`);
  if (track.typeLabel === "AUDIO" && track.audioToLabel) details.push(`Audio Out · ${compactAudioRoute(track.audioToLabel)}`);
  return details.length > 0 ? ellipsize(details.join(" · "), 90) : "";
}

export function splitStripSegment(state: Readonly<ConnectionState>, segmentIndex: number, tile: StripTile): string {
  const clampedSegment = Math.max(0, Math.min(3, segmentIndex));
  const color = safeColor(state.track?.color);
  const background = mutedTrackBackground(color);
  const status = trackStatusText(state);
  const showMeters = Boolean(state.track);
  const trackNameLimit = status.length > 38 ? 14 : 24;
  const trackName = state.track ? displayTrackName(state.track.name, state.track.index + 1).slice(0, trackNameLimit) : "No Track";
  const tileX = clampedSegment * 200;
  const fillWidth = Math.round(86 * Math.max(0, Math.min(1, tile.progress ?? 0)));
  const panX = Math.round(tileX + 94 + 86 * Math.max(0, Math.min(1, tile.pan ?? 0.5)));
  const meterLeft = Math.max(0, Math.min(1, state.track?.outputMeterLeft ?? 0));
  const meterRight = Math.max(0, Math.min(1, state.track?.outputMeterRight ?? meterLeft));
  const meterLeftHeight = Math.round(27 * meterLeft);
  const meterRightHeight = Math.round(27 * meterRight);
  const meters = showMeters ? `
  <rect x="4" y="12" width="5" height="27" rx="2.5" fill="#15191f" opacity="0.78"/>
  <rect x="12" y="12" width="5" height="27" rx="2.5" fill="#15191f" opacity="0.78"/>
  <rect x="4" y="${39 - meterLeftHeight}" width="5" height="${meterLeftHeight}" rx="2.5" fill="${color}"/>
  <rect x="12" y="${39 - meterRightHeight}" width="5" height="${meterRightHeight}" rx="2.5" fill="${color}"/>` : "";
  const progressBar = tile.progress === undefined ? "" : `
  <rect x="${tileX + 94}" y="80" width="86" height="8" rx="4" fill="#2a2e34"/>
  <rect x="${tileX + 94}" y="80" width="${fillWidth}" height="8" rx="4" fill="${color}"/>`;
  const panBar = tile.pan === undefined ? "" : `
  <rect x="${tileX + 94}" y="83" width="86" height="3" rx="1.5" fill="#2a2e34"/>
  <rect x="${tileX + 136}" y="78" width="2" height="13" rx="1" fill="#aeb5bf" opacity="0.55"/>
  <circle cx="${panX}" cy="84.5" r="5.5" fill="${color}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="${tileX} 0 200 100">
  <rect x="0" y="0" width="800" height="100" fill="${background}"/>
  ${meters}
  <text x="${showMeters ? 25 : 18}" y="39" fill="#ffffff" font-family="${trackNameFont}" font-size="37" font-weight="800">${escapeXml(trackName)}</text>
  <text x="782" y="34" text-anchor="end" fill="#aeb5bf" font-family="${abletonFont}" font-size="15" font-weight="700">${escapeXml(status)}</text>
  <rect x="200" y="55" width="1" height="35" fill="#ffffff" opacity="0.11"/>
  <rect x="400" y="55" width="1" height="35" fill="#ffffff" opacity="0.11"/>
  <rect x="600" y="55" width="1" height="35" fill="#ffffff" opacity="0.11"/>
  <rect x="${tileX}" y="54" width="6" height="38" fill="${color}"/>
  <text x="${tileX + 18}" y="63" fill="#aeb5bf" font-family="${abletonFont}" font-size="13" font-weight="700">${escapeXml(tile.label.toUpperCase())}</text>
  <text x="${tileX + 18}" y="88" fill="#ffffff" font-family="${abletonFont}" font-size="19" font-weight="700">${escapeXml(tile.value)}</text>${progressBar}
  ${panBar}
  </svg>`;
}

export function fixedCellLocatorText(locator: string, foreground: string): string {
  const cells = locator.slice(-8).split("");
  const cellWidth = 44;
  const startX = 400 - ((cells.length - 1) * cellWidth) / 2;
  return cells.map((character, index) => {
    const x = startX + index * cellWidth;
    return `<text x="${x}" y="68" text-anchor="middle" fill="${foreground}" font-family="${abletonFont}" font-size="52" font-weight="700">${escapeXml(character)}</text>`;
  }).join("");
}

export function transportStripSegment(state: Readonly<ConnectionState>, segmentIndex: number): string | null {
  if (state.connected && !state.transport.playing) return null;
  const offline = !state.connected;
  const recording = state.transport.recording;
  const background = offline ? "#101318" : recording ? "#ff3156" : "#32c786";
  const shadow = offline ? "#000000" : recording ? "#a30f2c" : "#14764d";
  const foreground = offline ? "#d59b3b" : recording ? "#ffffff" : "#07140f";
  const value = offline ? "Waiting for Ableton Live" : state.transport.locator;
  const clampedSegment = Math.max(0, Math.min(3, segmentIndex));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="${clampedSegment * 200} 0 200 100">
  <rect x="0" y="0" width="800" height="100" fill="${background}"/>
  <rect x="0" y="0" width="800" height="9" fill="${foreground}" opacity="0.35"/>
  ${offline ? `<text x="400" y="68" text-anchor="middle" fill="${foreground}" font-family="${abletonFont}" font-size="42" font-weight="normal">${escapeXml(value)}</text>` : fixedCellLocatorText(value, foreground)}
  <rect x="0" y="92" width="800" height="8" fill="${shadow}" opacity="0.45"/>
  </svg>`;
}

const toggleConfig: Record<ToggleName, { label: string; active: string }> = {
  arm: { label: "ARM", active: "#ff3156" },
  solo: { label: "SOLO", active: "#ffd23f" },
  mute: { label: "MUTE", active: "#ff8a34" },
  monitor: { label: "MONITOR", active: "#43a5ff" },
  armMode: { label: "ARM", active: "#8f48ff" }
};

export function toggleSvg(name: ToggleName, state: Readonly<ConnectionState>): string {
  if (!state.connected) return blankKeySvg();
  if (name === "armMode") return armModeSvg(state);
  if (name === "arm") return armSvg(state);
  const config = toggleConfig[name];
  const track = state.track;
  const availability: Record<ToggleName, boolean> = {
    arm: Boolean(track?.armAvailable),
    solo: Boolean(track?.soloAvailable),
    mute: Boolean(track?.muteAvailable),
    monitor: Boolean(track?.monitorAvailable),
    armMode: true
  };
  const activity: Record<ToggleName, boolean> = {
    arm: Boolean(track?.arm),
    solo: Boolean(track?.solo),
    mute: Boolean(track?.mute),
    monitor: Boolean(track && track.monitor !== 2),
    armMode: state.armMode === "multi"
  };
  const available = availability[name];
  const active = activity[name];
  const accent = state.connected && track ? safeColor(track.color) : "#343941";
  const background = !state.connected ? "#171a1f" : !available ? "#14171b" : active ? config.active : "#252a31";
  const foreground = active && name === "solo" ? "#151515" : available ? "#ffffff" : "#707781";
  const subtitle = !state.connected ? "LIVE OFFLINE" : !available ? "N/A" : name === "monitor" ? track!.monitorLabel.toUpperCase() : active ? "ON" : "OFF";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="16" fill="${background}"/>
  <rect x="0" y="0" width="144" height="9" rx="4.5" fill="${accent}"/>
  <text x="72" y="69" text-anchor="middle" fill="${foreground}" font-family="${abletonFont}" font-size="25" font-weight="800">${config.label}</text>
  <text x="72" y="98" text-anchor="middle" fill="${foreground}" opacity="0.82" font-family="${abletonFont}" font-size="14" font-weight="650">${escapeXml(subtitle)}</text>
  </svg>`;
}

function armSvg(state: Readonly<ConnectionState>): string {
  if (!state.connected) return blankKeySvg();
  const track = state.track;
  const available = Boolean(track?.armAvailable);
  const latched = Boolean(track?.armLatched);
  const soft = Boolean(track?.armSoft);
  const active = Boolean(track?.arm);
  const background = !available ? "#14171b" : latched ? "#ff3156" : soft ? "#9b2036" : active ? "#ff3156" : "#6d2938";
  const foreground = available ? "#ffffff" : "#707781";
  const subtitle = !available ? "N/A" : state.armMode === "multi" ? latched ? "LATCH" : soft ? "SOFT" : "OFF" : active ? "ON" : "OFF";
  const accent = track ? safeColor(track.color) : "#343941";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="16" fill="${background}"/>
  <rect x="0" y="0" width="144" height="9" rx="4.5" fill="${accent}"/>
  <text x="72" y="69" text-anchor="middle" fill="${foreground}" font-family="${abletonFont}" font-size="25" font-weight="800">ARM</text>
  <text x="72" y="98" text-anchor="middle" fill="${foreground}" opacity="0.82" font-family="${abletonFont}" font-size="14" font-weight="650">${subtitle}</text>
  </svg>`;
}

function armModeSvg(state: Readonly<ConnectionState>): string {
  if (!state.connected) return blankKeySvg();
  const multi = state.armMode === "multi";
  const background = multi ? "#8f48ff" : "#252a31";
  const foreground = "#ffffff";
  const accent = state.track ? safeColor(state.track.color) : "#343941";
  const subtitle = multi ? "MULTI" : "SINGLE";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="16" fill="${background}"/>
  <rect x="0" y="0" width="144" height="9" rx="4.5" fill="${accent}"/>
  <text x="72" y="62" text-anchor="middle" fill="${foreground}" font-family="${abletonFont}" font-size="23" font-weight="800">ARM</text>
  <text x="72" y="89" text-anchor="middle" fill="${foreground}" font-family="${abletonFont}" font-size="20" font-weight="800">MODE</text>
  <text x="72" y="116" text-anchor="middle" fill="${foreground}" opacity="0.82" font-family="${abletonFont}" font-size="13" font-weight="650">${subtitle}</text>
  </svg>`;
}

const transportConfig: Record<TransportName, { label: string; active: string; inactive: string; top: string; activeWhen: (state: Readonly<ConnectionState>) => boolean; subtitle: (state: Readonly<ConnectionState>) => string }> = {
  play: {
    label: "PLAY",
    active: "#32c786",
    inactive: "#1d5a42",
    top: "#7af0b7",
    activeWhen: (state) => state.transport.playing,
    subtitle: (state) => state.transport.playing ? "RUNNING" : "READY"
  },
  stop: {
    label: "STOP",
    active: "#ff9f43",
    inactive: "#6a4526",
    top: "#ffd1a1",
    activeWhen: (state) => !state.transport.playing,
    subtitle: (state) => state.transport.playing ? "PRESS" : "STOPPED"
  },
  record: {
    label: "REC",
    active: "#ff3156",
    inactive: "#6d2938",
    top: "#ff96a9",
    activeWhen: (state) => state.transport.recording,
    subtitle: (state) => state.transport.recording ? "ON" : "OFF"
  },
  click: {
    label: "CLICK",
    active: "#43a5ff",
    inactive: "#252a31",
    top: "#a2d3ff",
    activeWhen: (state) => state.transport.metronome,
    subtitle: (state) => state.transport.metronome ? "ON" : "OFF"
  }
};

export function transportSvg(name: TransportName, state: Readonly<ConnectionState>): string {
  if (!state.connected) return blankKeySvg();
  const config = transportConfig[name];
  const active = state.connected && config.activeWhen(state);
  const background = !state.connected ? "#171a1f" : active ? config.active : config.inactive;
  const foreground = active && name === "play" ? "#07140f" : "#ffffff";
  const subtitle = !state.connected ? "LIVE OFFLINE" : config.subtitle(state);
  const accent = !state.connected ? "#343941" : name === "click" && state.track ? safeColor(state.track.color) : config.top;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="16" fill="${background}"/>
  <rect x="0" y="0" width="144" height="9" rx="4.5" fill="${accent}"/>
  <text x="72" y="69" text-anchor="middle" fill="${foreground}" font-family="${abletonFont}" font-size="25" font-weight="800">${config.label}</text>
  <text x="72" y="98" text-anchor="middle" fill="${foreground}" opacity="0.82" font-family="${abletonFont}" font-size="14" font-weight="650">${escapeXml(subtitle)}</text>
  </svg>`;
}

export function blankKeySvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="#000000"/>
  </svg>`;
}

export function trackDial(state: Readonly<ConnectionState>): string {
  if (!state.connected) return dialSvg("Track", "LIVE OFFLINE");
  if (!state.track) return dialSvg("Track", "NO TRACK");
  const { track } = state;
  return dialSvg(`TRACK ${track.index + 1}/${track.count}`, displayTrackName(track.name, track.index + 1).slice(0, 14), track.color, undefined, { valueSize: 29, valueY: 70 });
}

export function volumeDial(state: Readonly<ConnectionState>): string {
  if (!state.connected) return dialSvg("Volume", "LIVE OFFLINE");
  if (!state.track?.volumeAvailable) return dialSvg("Volume", "N/A", state.track?.color);
  return dialSvg("Volume", compactNumericDisplay(state.track.volumeDisplay), state.track.color, state.track.volumeNormalized);
}

export function panDial(state: Readonly<ConnectionState>): string {
  if (!state.connected) return dialSvg("Pan", "LIVE OFFLINE");
  if (!state.track?.panAvailable) return dialSvg("Pan", "N/A", state.track?.color);
  return dialSvg("Pan", compactNumericDisplay(state.track.panDisplay), state.track.color, state.track.panNormalized);
}
