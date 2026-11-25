import streamDeck from "@elgato/streamdeck";
import {
  HorizontalZoomDialAction,
  TrackDialAction,
  VerticalZoomDialAction,
  VolumeDialAction
} from "./actions/dials";
import { ArmAction, ArmModeAction, ClickAction, MonitorAction, MuteAction, PlayAction, RecordAction, SoloAction, StopAction } from "./actions/toggles";
import { abletonBridge } from "./bridge/udp-client";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new TrackDialAction());
streamDeck.actions.registerAction(new VolumeDialAction());
streamDeck.actions.registerAction(new HorizontalZoomDialAction());
streamDeck.actions.registerAction(new VerticalZoomDialAction());
streamDeck.actions.registerAction(new ArmAction());
streamDeck.actions.registerAction(new SoloAction());
streamDeck.actions.registerAction(new MuteAction());
streamDeck.actions.registerAction(new MonitorAction());
streamDeck.actions.registerAction(new ArmModeAction());
streamDeck.actions.registerAction(new PlayAction());
streamDeck.actions.registerAction(new StopAction());
streamDeck.actions.registerAction(new RecordAction());
streamDeck.actions.registerAction(new ClickAction());

abletonBridge.start();
process.once("SIGTERM", () => abletonBridge.stop());
process.once("SIGINT", () => abletonBridge.stop());

streamDeck.connect();
