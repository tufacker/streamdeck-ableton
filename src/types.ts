export type ArmMode = "auto" | "multi";
export type ViewMode = "arranger" | "session";
export type ToggleName = "arm" | "solo" | "mute" | "monitor" | "armMode";
export type TransportName = "play" | "stop" | "record" | "click";

export interface TrackState {
  index: number;
  count: number;
  name: string;
  color: string;
  rawColor?: number;
  colorIndex?: number | null;
  outputMeterLeft?: number;
  outputMeterRight?: number;
  kind: "track" | "return" | "master";
  typeLabel?: string;
  deviceLabel?: string;
  midiFromLabel?: string;
  midiToLabel?: string;
  audioFromLabel?: string;
  audioToLabel?: string;
  arm: boolean;
  armAvailable: boolean;
  armSoft: boolean;
  armLatched: boolean;
  solo: boolean;
  soloAvailable: boolean;
  mute: boolean;
  muteAvailable: boolean;
  monitor: number;
  monitorLabel: string;
  monitorAvailable: boolean;
  volume: number;
  volumeNormalized: number;
  volumeDisplay: string;
  volumeAvailable: boolean;
  pan: number;
  panNormalized: number;
  panDisplay: string;
  panAvailable: boolean;
}

export interface LiveState {
  type: "state";
  protocol: 1;
  liveVersion: string;
  armMode: ArmMode;
  viewMode?: ViewMode;
  externalInstrumentBrowser?: ExternalInstrumentBrowserState;
  transport: {
    playing: boolean;
    recording: boolean;
    metronome: boolean;
    songTime: number;
    locator: string;
    tempo: number;
    signatureNumerator: number;
    signatureDenominator?: number;
  };
  track: TrackState | null;
}

export interface ExternalInstrumentBrowserState {
  available: boolean;
  index: number;
  count: number;
  name: string;
  relativePath: string;
}

export type BridgeCommand =
  | { type: "hello"; protocol: 1 }
  | { type: "ping"; protocol: 1 }
  | { type: "command"; command: "select_track" | "set_volume" | "set_pan" | "zoom_horizontal" | "zoom_vertical"; ticks: number; pressed?: boolean }
  | { type: "command"; command: "browse_external_instrument"; ticks: number }
  | { type: "command"; command: "reset_volume" | "toggle_selected_device_editor" | "toggle_selected_track_fold" | "vertical_knob_press" | "toggle_session_arrangement_view" | "load_external_instrument" }
  | { type: "command"; command: "toggle_arm" | "toggle_solo" | "toggle_mute" | "cycle_monitor" | "toggle_arm_mode" }
  | { type: "command"; command: "play" | "stop" | "toggle_record" | "toggle_click" }
  | { type: "command"; command: "inspect_tracks"; indices: number[] };

export interface ConnectionState {
  connected: boolean;
  lastSeen: number;
  liveVersion: string;
  armMode: ArmMode;
  viewMode: ViewMode;
  externalInstrumentBrowser: ExternalInstrumentBrowserState;
  transport: LiveState["transport"];
  track: TrackState | null;
}
