import { action, type KeyDownEvent, SingletonAction, streamDeck, type WillAppearEvent } from "@elgato/streamdeck";
import { abletonBridge } from "../bridge/udp-client";
import { svgDataUrl, toggleSvg, transportSvg } from "../render";
import { stateStore } from "../state/store";
import type { BridgeCommand, ToggleName, TransportName } from "../types";

abstract class ToggleAction extends SingletonAction {
  protected abstract readonly toggleName: ToggleName;
  protected abstract readonly command: Extract<BridgeCommand, { type: "command" }>;
  #lastImage = "";

  constructor() {
    super();
    stateStore.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> {
    streamDeck.logger.info(`Key appeared: ${this.manifestId}`);
    return event.action.setImage(svgDataUrl(toggleSvg(this.toggleName, stateStore.current)));
  }

  override async onKeyDown(event: KeyDownEvent): Promise<void> {
    if (!stateStore.current.connected) {
      await event.action.showAlert();
      return;
    }
    abletonBridge.send(this.command);
  }

  private async renderAll(): Promise<void> {
    const image = svgDataUrl(toggleSvg(this.toggleName, stateStore.current));
    if (image === this.#lastImage) return;
    this.#lastImage = image;
    streamDeck.logger.debug(`Rendering ${this.actions.length} key instance(s) for ${this.manifestId}`);
    try {
      await Promise.all(this.actions.map((instance) => instance.setImage(image)));
    } catch (error) {
      streamDeck.logger.error(`Key render failed for ${this.manifestId}: ${String(error)}`);
    }
  }
}

@action({ UUID: "io.github.tufacker.ableton-control.arm" })
export class ArmAction extends ToggleAction {
  protected override readonly toggleName = "arm" as const;
  protected override readonly command = { type: "command", command: "toggle_arm" } as const;
}

@action({ UUID: "io.github.tufacker.ableton-control.solo" })
export class SoloAction extends ToggleAction {
  protected override readonly toggleName = "solo" as const;
  protected override readonly command = { type: "command", command: "toggle_solo" } as const;
}

@action({ UUID: "io.github.tufacker.ableton-control.mute" })
export class MuteAction extends ToggleAction {
  protected override readonly toggleName = "mute" as const;
  protected override readonly command = { type: "command", command: "toggle_mute" } as const;
}

@action({ UUID: "io.github.tufacker.ableton-control.monitor" })
export class MonitorAction extends ToggleAction {
  protected override readonly toggleName = "monitor" as const;
  protected override readonly command = { type: "command", command: "cycle_monitor" } as const;
}

@action({ UUID: "io.github.tufacker.ableton-control.arm-mode" })
export class ArmModeAction extends ToggleAction {
  protected override readonly toggleName = "armMode" as const;
  protected override readonly command = { type: "command", command: "toggle_arm_mode" } as const;
}

abstract class TransportAction extends SingletonAction {
  protected abstract readonly transportName: TransportName;
  protected abstract readonly command: Extract<BridgeCommand, { type: "command" }>;
  #lastImage = "";

  constructor() {
    super();
    stateStore.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> {
    streamDeck.logger.info(`Key appeared: ${this.manifestId}`);
    return event.action.setImage(svgDataUrl(transportSvg(this.transportName, stateStore.current)));
  }

  override async onKeyDown(event: KeyDownEvent): Promise<void> {
    if (!stateStore.current.connected) {
      await event.action.showAlert();
      return;
    }
    abletonBridge.send(this.command);
  }

  private async renderAll(): Promise<void> {
    const image = svgDataUrl(transportSvg(this.transportName, stateStore.current));
    if (image === this.#lastImage) return;
    this.#lastImage = image;
    streamDeck.logger.debug(`Rendering ${this.actions.length} key instance(s) for ${this.manifestId}`);
    try {
      await Promise.all(this.actions.map((instance) => instance.setImage(image)));
    } catch (error) {
      streamDeck.logger.error(`Key render failed for ${this.manifestId}: ${String(error)}`);
    }
  }
}

@action({ UUID: "io.github.tufacker.ableton-control.play" })
export class PlayAction extends TransportAction {
  protected override readonly transportName = "play" as const;
  protected override readonly command = { type: "command", command: "play" } as const;
}

@action({ UUID: "io.github.tufacker.ableton-control.stop" })
export class StopAction extends TransportAction {
  protected override readonly transportName = "stop" as const;
  protected override readonly command = { type: "command", command: "stop" } as const;
}

@action({ UUID: "io.github.tufacker.ableton-control.record" })
export class RecordAction extends TransportAction {
  protected override readonly transportName = "record" as const;
  protected override readonly command = { type: "command", command: "toggle_record" } as const;
}

@action({ UUID: "io.github.tufacker.ableton-control.click" })
export class ClickAction extends TransportAction {
  protected override readonly transportName = "click" as const;
  protected override readonly command = { type: "command", command: "toggle_click" } as const;
}
