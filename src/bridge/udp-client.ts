import dgram from "node:dgram";
import streamDeck from "@elgato/streamdeck";
import { stateStore } from "../state/store";
import type { BridgeCommand, LiveState } from "../types";

const HOST = "127.0.0.1";
const PLUGIN_PORT = 10000;
const LIVE_PORT = 10001;
const STALE_AFTER_MS = 3_000;
const RETRY_BIND_MS = 3_000;

export class AbletonBridgeClient {
  #socket: dgram.Socket | undefined;
  #bound = false;
  #heartbeat: NodeJS.Timeout | undefined;
  #retry: NodeJS.Timeout | undefined;
  #started = false;

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#open();

    this.#heartbeat = setInterval(() => {
      this.send({ type: "ping", protocol: 1 });
      const { connected, lastSeen } = stateStore.current;
      if (connected && Date.now() - lastSeen > STALE_AFTER_MS) stateStore.markDisconnected();
    }, 1_000);
    this.#heartbeat.unref();
  }

  send(command: BridgeCommand): void {
    const socket = this.#socket;
    if (!this.#started || !socket || !this.#bound) return;
    const payload = Buffer.from(JSON.stringify(command), "utf8");
    socket.send(payload, LIVE_PORT, HOST, (error) => {
      if (error) streamDeck.logger.warn(`Could not send Ableton command: ${error.message}`);
    });
  }

  stop(): void {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    if (this.#retry) clearTimeout(this.#retry);
    this.#heartbeat = undefined;
    this.#retry = undefined;
    this.#close();
    this.#started = false;
    stateStore.markDisconnected();
  }

  // Binds the state port. If that fails (another copy of the plugin still holds
  // it, say), close the socket and try again rather than staying deaf for good.
  #open(): void {
    const socket = dgram.createSocket("udp4");
    this.#socket = socket;
    this.#bound = false;
    socket.on("message", (buffer) => this.#onMessage(buffer));
    socket.on("error", (error) => {
      streamDeck.logger.error(`Ableton UDP bridge error: ${error.message}`);
      stateStore.markDisconnected();
      if (this.#socket !== socket) return;
      this.#close();
      if (this.#started && !this.#retry) {
        this.#retry = setTimeout(() => {
          this.#retry = undefined;
          if (this.#started) this.#open();
        }, RETRY_BIND_MS);
        this.#retry.unref();
      }
    });
    socket.bind(PLUGIN_PORT, HOST, () => {
      this.#bound = true;
      streamDeck.logger.info(`Listening for Ableton on udp://${HOST}:${PLUGIN_PORT}`);
      this.send({ type: "hello", protocol: 1 });
    });
  }

  #close(): void {
    const socket = this.#socket;
    this.#socket = undefined;
    this.#bound = false;
    try {
      socket?.close();
    } catch {
      // Already closed.
    }
  }

  #onMessage(buffer: Buffer): void {
    try {
      const message = JSON.parse(buffer.toString("utf8")) as LiveState | { type: "error"; message: string };
      if (message.type === "state" && message.protocol === 1) {
        streamDeck.logger.debug(`Ableton state received: ${message.track?.name ?? "no track"}`);
        stateStore.apply(message);
      } else if (message.type === "error") {
        streamDeck.logger.warn(`Ableton rejected a command: ${message.message}`);
      }
    } catch (error) {
      streamDeck.logger.warn(`Ignored malformed Ableton bridge packet: ${String(error)}`);
    }
  }
}

export const abletonBridge = new AbletonBridgeClient();
