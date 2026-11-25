import type { ConnectionState, LiveState } from "../types";

type Listener = (state: Readonly<ConnectionState>) => void;

const initialState = (): ConnectionState => ({
  connected: false,
  lastSeen: 0,
  liveVersion: "",
  armMode: "auto",
  viewMode: "arranger",
  externalInstrumentBrowser: {
    available: false,
    index: 0,
    count: 0,
    name: "",
    relativePath: ""
  },
  transport: {
    playing: false,
    recording: false,
    metronome: false,
    songTime: 0,
    locator: "1.1.1",
    tempo: 120,
    signatureNumerator: 4
  },
  track: null
});

export class StateStore {
  #state = initialState();
  #listeners = new Set<Listener>();

  get current(): Readonly<ConnectionState> {
    return this.#projectState();
  }

  apply(message: LiveState): void {
    this.#state = {
      connected: true,
      lastSeen: Date.now(),
      liveVersion: message.liveVersion,
      armMode: message.armMode ?? "auto",
      viewMode: message.viewMode ?? "arranger",
      externalInstrumentBrowser: message.externalInstrumentBrowser ?? initialState().externalInstrumentBrowser,
      transport: message.transport ?? initialState().transport,
      track: message.track
    };
    this.#emit();
  }

  markDisconnected(): void {
    if (!this.#state.connected) return;
    this.#state = { ...this.#state, connected: false };
    this.#emit();
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  reset(): void {
    this.#state = initialState();
    this.#emit();
  }

  #emit(): void {
    const state = this.current;
    for (const listener of this.#listeners) listener(state);
  }

  #projectState(): ConnectionState {
    const { transport } = this.#state;
    if (!this.#state.connected || !transport.playing) return this.#state;

    const elapsedSeconds = Math.max(0, (Date.now() - this.#state.lastSeen) / 1000);
    const tempo = Number.isFinite(transport.tempo) && transport.tempo > 0 ? transport.tempo : 120;
    const projectedSongTime = transport.songTime + elapsedSeconds * (tempo / 60);
    return {
      ...this.#state,
      transport: {
        ...transport,
        songTime: projectedSongTime,
        locator: formatLocator(projectedSongTime, transport.signatureNumerator, transport.signatureDenominator)
      }
    };
  }
}

export const stateStore = new StateStore();

// Live's bar.beat.sixteenth position. Song time counts quarter notes; a beat is
// one denominator note (an eighth in 6/8). Matches format_locator in the Remote Script.
export function formatLocator(songTime: number, signatureNumerator: number, signatureDenominator = 4): string {
  const numerator = Math.max(1, Math.floor(signatureNumerator || 4));
  const denominator = Math.max(1, Math.floor(signatureDenominator || 4));
  const beatLength = 4 / denominator;
  const clamped = Math.max(0, songTime);
  const barLength = numerator * beatLength;
  const bar = Math.floor(clamped / barLength) + 1;
  const inBar = clamped - (bar - 1) * barLength;
  const beat = Math.min(numerator, Math.floor(inBar / beatLength) + 1);
  const sixteenths = Math.max(1, Math.round(16 / denominator));
  const inBeat = inBar - (beat - 1) * beatLength;
  const sixteenth = Math.floor((inBeat / beatLength) * sixteenths) + 1;
  return `${bar}.${beat}.${Math.max(1, Math.min(sixteenths, sixteenth))}`;
}
