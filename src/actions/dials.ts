import {
  action,
  type DialDownEvent,
  type DialRotateEvent,
  type DialUpEvent,
  SingletonAction,
  streamDeck,
  type TouchTapEvent,
  type WillAppearEvent
} from "@elgato/streamdeck";
import { abletonBridge } from "../bridge/udp-client";
import { compactNumericDisplay, splitStripSegment, svgDataUrl, transportStripSegment } from "../render";
import { stateStore } from "../state/store";
import type { ConnectionState } from "../types";

abstract class DialAction extends SingletonAction {
  protected abstract readonly stripIndex: number;
  #clock: NodeJS.Timeout | undefined;

  constructor() {
    super();
    stateStore.subscribe((state) => {
      this.updateClock(state.transport.playing);
      void this.renderAll();
    });
  }

  override async onWillAppear(event: WillAppearEvent): Promise<void> {
    if (!event.action.isDial()) return;
    streamDeck.logger.info(`Dial appeared: ${this.manifestId}`);
    await event.action.setFeedbackLayout("layouts/dial.json");
    await event.action.setFeedback({ canvas: svgDataUrl(this.renderDisplay(stateStore.current)) });
  }

  override onDialRotate(event: DialRotateEvent): void {
    this.rotate(event.payload.ticks, event.payload.pressed);
  }

  protected abstract rotate(ticks: number, pressed: boolean): void;
  protected abstract render(state: Readonly<ConnectionState>): string;

  private updateClock(playing: boolean): void {
    if (playing && !this.#clock) {
      this.#clock = setInterval(() => void this.renderAll(), 50);
      this.#clock.unref();
    } else if (!playing && this.#clock) {
      clearInterval(this.#clock);
      this.#clock = undefined;
    }
  }

  private renderDisplay(state: Readonly<ConnectionState>): string {
    return transportStripSegment(state, this.stripIndex) ?? this.render(state);
  }

  protected async renderAll(): Promise<void> {
    const image = svgDataUrl(this.renderDisplay(stateStore.current));
    const updates: Array<Promise<void>> = [];
    for (const instance of this.actions) {
      if (instance.isDial()) updates.push(instance.setFeedback({ canvas: image }));
    }
    streamDeck.logger.debug(`Rendering ${updates.length} dial instance(s) for ${this.manifestId}`);
    try {
      await Promise.all(updates);
    } catch (error) {
      streamDeck.logger.error(`Dial render failed for ${this.manifestId}: ${String(error)}`);
    }
  }
}

@action({ UUID: "io.github.tufacker.ableton-control.track" })
export class TrackDialAction extends DialAction {
  protected override readonly stripIndex = 0;

  override onDialDown(_event: DialDownEvent): void {
    abletonBridge.send({ type: "command", command: "toggle_selected_device_editor" });
  }

  protected override rotate(ticks: number): void {
    abletonBridge.send({ type: "command", command: "select_track", ticks });
  }
  protected override render(state: Readonly<ConnectionState>): string {
    const track = state.track;
    return splitStripSegment(state, this.stripIndex, {
      label: "Track",
      value: track ? `${track.index + 1}/${track.count} ${(track.typeLabel ?? track.kind).toUpperCase()}`.slice(0, 18) : "NO TRACK"
    });
  }
}

@action({ UUID: "io.github.tufacker.ableton-control.volume" })
export class VolumeDialAction extends DialAction {
  protected override readonly stripIndex = 3;
  #mode: "volume" | "pan" = "volume";

  override onDialDown(_event: DialDownEvent): void {
    this.toggleMode();
  }

  override onTouchTap(_event: TouchTapEvent): void {
    this.toggleMode();
  }

  private toggleMode(): void {
    this.#mode = this.#mode === "volume" ? "pan" : "volume";
    void this.renderAll();
  }

  protected override rotate(ticks: number, pressed: boolean): void {
    abletonBridge.send({ type: "command", command: this.#mode === "volume" ? "set_volume" : "set_pan", ticks, pressed });
  }
  protected override render(state: Readonly<ConnectionState>): string {
    if (this.#mode === "pan") {
      return splitStripSegment(state, this.stripIndex, {
        label: "Pan",
        value: state.track?.panAvailable ? compactNumericDisplay(state.track.panDisplay) : "N/A",
        pan: state.track?.panAvailable ? state.track.panNormalized : undefined
      });
    }
    return splitStripSegment(state, this.stripIndex, {
      label: "Vol",
      value: state.track?.volumeAvailable ? compactNumericDisplay(state.track.volumeDisplay) : "N/A",
      progress: state.track?.volumeAvailable ? state.track.volumeNormalized : undefined
    });
  }
}

@action({ UUID: "io.github.tufacker.ableton-control.horizontal-zoom" })
export class HorizontalZoomDialAction extends DialAction {
  protected override readonly stripIndex = 2;
  #dialDownAt = 0;

  override onDialDown(_event: DialDownEvent): void {
    this.#dialDownAt = Date.now();
  }

  override onDialUp(_event: DialUpEvent): void {
    const heldMs = Date.now() - this.#dialDownAt;
    const longPress = heldMs >= 650;
    if (stateStore.current.viewMode !== "session") {
      abletonBridge.send({ type: "command", command: "toggle_session_arrangement_view" });
      return;
    }
    if (longPress && stateStore.current.externalInstrumentBrowser.available) {
      abletonBridge.send({ type: "command", command: "load_external_instrument" });
      return;
    }
    abletonBridge.send({ type: "command", command: "toggle_session_arrangement_view" });
  }

  protected override rotate(ticks: number): void {
    if (stateStore.current.viewMode === "session") {
      abletonBridge.send({ type: "command", command: "browse_external_instrument", ticks });
      return;
    }
    abletonBridge.send({ type: "command", command: "zoom_horizontal", ticks });
  }
  protected override render(state: Readonly<ConnectionState>): string {
    if (!state.connected) return splitStripSegment(state, this.stripIndex, { label: "View", value: "OFFLINE" });
    const session = state.viewMode === "session";
    if (session) {
      const browser = state.externalInstrumentBrowser;
      return splitStripSegment(state, this.stripIndex, {
        label: "View / Add (Hold)",
        value: browser.available ? browser.name.slice(0, 18) : "HOLD ADD"
      });
    }
    return splitStripSegment(state, this.stripIndex, {
      label: "Arrange",
      value: "Time/View"
    });
  }
}

@action({ UUID: "io.github.tufacker.ableton-control.vertical-zoom" })
export class VerticalZoomDialAction extends DialAction {
  protected override readonly stripIndex = 1;

  override onDialDown(_event: DialDownEvent): void {
    abletonBridge.send({ type: "command", command: "vertical_knob_press" });
  }

  protected override rotate(ticks: number, pressed: boolean): void {
    abletonBridge.send({ type: "command", command: "zoom_vertical", ticks: -ticks, pressed });
  }
  protected override render(state: Readonly<ConnectionState>): string {
    if (!state.connected) return splitStripSegment(state, this.stripIndex, { label: "Track", value: "OFFLINE" });
    const session = state.viewMode === "session";
    return splitStripSegment(state, this.stripIndex, {
      label: session ? "Track" : "Tracks",
      value: session ? "Scroll/Clip" : "Height/Fold"
    });
  }
}
