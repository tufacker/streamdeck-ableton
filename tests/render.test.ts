import assert from "node:assert/strict";
import test from "node:test";
import { compactNumericDisplay, dialSvg, displayTrackName, escapeXml, fixedCellLocatorText, panDial, splitStripSegment, toggleSvg, trackDial, transportStripSegment, transportSvg, volumeDial } from "../src/render";
import { formatLocator, StateStore } from "../src/state/store";
import type { ConnectionState, LiveState } from "../src/types";

const connected: ConnectionState = {
  connected: true,
  lastSeen: Date.now(),
  liveVersion: "12.1.0",
  armMode: "multi",
  viewMode: "session",
  externalInstrumentBrowser: {
    available: true,
    index: 18,
    count: 39,
    name: "Synth A",
    relativePath: "Synth A.adv"
  },
  transport: {
    playing: true,
    recording: false,
    metronome: true,
    songTime: 42.5,
    locator: "11.3.3",
    tempo: 120,
    signatureNumerator: 4
  },
  track: {
    index: 1,
    count: 8,
    name: "Bass & Lead",
    color: "#ff3156",
    outputMeterLeft: 0.33,
    outputMeterRight: 0.82,
    kind: "track",
    typeLabel: "AUDIO",
    deviceLabel: "PLUGIN · Wavetable 1",
    midiFromLabel: "",
    midiToLabel: "",
    audioFromLabel: "Ext. In · 1/2",
    audioToLabel: "Master",
    arm: true,
    armAvailable: true,
    armSoft: true,
    armLatched: false,
    solo: false,
    soloAvailable: true,
    mute: false,
    muteAvailable: true,
    monitor: 1,
    monitorLabel: "Auto",
    monitorAvailable: true,
    volume: 0.72,
    volumeNormalized: 0.72,
    volumeDisplay: "-4.8 dB",
    volumeAvailable: true,
    pan: 0.25,
    panNormalized: 0.625,
    panDisplay: "25R",
    panAvailable: true
  }
};

test("escapes user track names before inserting them into SVG", () => {
  assert.equal(escapeXml("A&B <C>"), "A&amp;B &lt;C&gt;");
  assert.match(trackDial(connected), /Bass &amp; Lead/);
  assert.match(trackDial(connected), /font-size="29"/);
});

test("removes unstable track number prefixes from displayed track names", () => {
  assert.equal(displayTrackName("1 - Bass"), "Bass");
  assert.equal(displayTrackName("02. Lead"), "Lead");
  assert.equal(displayTrackName("3: Drums"), "Drums");
  assert.equal(displayTrackName("4  Keys"), "Keys");
  assert.equal(displayTrackName("808 Bass"), "808 Bass");
  assert.equal(displayTrackName("2 Bass", 2), "Bass");
  assert.equal(displayTrackName("02 Bass", 2), "Bass");
  assert.equal(displayTrackName("808 Bass", 2), "808 Bass");
  const numbered = { ...connected, track: { ...connected.track!, name: "02. Bass & Lead" } };
  assert.match(trackDial(numbered), /TRACK 2\/8/);
  assert.match(trackDial(numbered), /Bass &amp; Lead/);
  assert.doesNotMatch(trackDial(numbered), /02\\. Bass/);
  const singleSpaceNumbered = { ...connected, track: { ...connected.track!, name: "2 Bass & Lead" } };
  assert.match(trackDial(singleSpaceNumbered), /Bass &amp; Lead/);
  assert.doesNotMatch(trackDial(singleSpaceNumbered), /2 Bass/);
});

test("renders connection, volume, and key state feedback", () => {
  assert.match(volumeDial(connected), /-4.8 dB/);
  assert.match(volumeDial(connected), /#782d3f/);
  assert.match(panDial(connected), /25R/);
  assert.equal(compactNumericDisplay("38.4849892898"), "38.5");
  assert.equal(compactNumericDisplay("-4.84892898 dB"), "-4.85 dB");
  assert.match(toggleSvg("arm", connected), /SOFT/);
  assert.match(toggleSvg("arm", connected), /#9b2036/);
  assert.match(toggleSvg("arm", connected), /#ff3156/);
  assert.doesNotMatch(toggleSvg("arm", connected), /#8f48ff/);
  assert.match(toggleSvg("arm", { ...connected, track: { ...connected.track!, arm: false, armSoft: false, armLatched: false } }), /#6d2938/);
  assert.match(toggleSvg("arm", { ...connected, track: { ...connected.track!, arm: true, armSoft: false, armLatched: true } }), /#ff3156/);
  assert.match(toggleSvg("armMode", connected), /MULTI/);
  assert.match(toggleSvg("armMode", { ...connected, armMode: "auto" }), /SINGLE/);
  assert.match(transportSvg("play", connected), /RUNNING/);
  assert.match(transportSvg("play", connected), /#32c786/);
  assert.match(transportSvg("play", { ...connected, transport: { ...connected.transport, playing: false } }), /#7af0b7/);
  assert.match(transportSvg("stop", { ...connected, transport: { ...connected.transport, playing: true } }), /#ffd1a1/);
  assert.match(transportSvg("record", connected), /#6d2938/);
  assert.match(transportSvg("record", connected), /#ff96a9/);
  assert.match(transportSvg("click", connected), /ON/);
  assert.match(transportSvg("click", connected), /#43a5ff/);
  assert.match(transportSvg("click", connected), /#ff3156/);
  assert.doesNotMatch(transportSvg("click", connected), /#a2d3ff/);
  const clickOff = transportSvg("click", { ...connected, transport: { ...connected.transport, metronome: false } });
  assert.match(clickOff, /#252a31/);
  assert.match(clickOff, /#ff3156/);
  assert.match(transportStripSegment(connected, 0) ?? "", /viewBox="0 0 200 100"/);
  assert.match(transportStripSegment(connected, 3) ?? "", /viewBox="600 0 200 100"/);
  const volumeStrip = splitStripSegment(connected, 1, { label: "Vol", value: "-4.8 dB", progress: 0.72 });
  assert.match(volumeStrip, /viewBox="200 0 200 100"/);
  assert.match(volumeStrip, /Bass &amp; Lead/);
  assert.match(volumeStrip, /PLUGIN · Wavetable 1/);
  assert.match(volumeStrip, /Audio In · EXT 1\/2/);
  assert.match(volumeStrip, /Audio Out · MAIN/);
  assert.match(volumeStrip, /PLUGIN · Wavetable 1 · Audio In · EXT 1\/2 · Audio Out · MAIN/);
  assert.doesNotMatch(volumeStrip, /stroke-opacity="0\.08"/);
  assert.match(volumeStrip, /width="62"/);
  assert.match(volumeStrip, />-4.8 dB</);
  assert.match(volumeStrip, /font-size="37"/);
  assert.match(volumeStrip, /font-weight="800"/);
  assert.match(volumeStrip, /x="4" y="30" width="5" height="9"/);
  assert.match(volumeStrip, /x="12" y="17" width="5" height="22"/);
  assert.match(volumeStrip, /<text x="25" y="39"/);
  assert.match(volumeStrip, /font-size="15"/);
  assert.doesNotMatch(volumeStrip, /width="800" height="6"/);
  assert.doesNotMatch(volumeStrip, /height="1" fill="#ffffff"/);
  assert.match(volumeStrip, /height="38" fill="#ff3156"/);
  const trackStrip = splitStripSegment(connected, 0, { label: "Track", value: "2/8 AUDIO" });
  assert.match(trackStrip, />2\/8 AUDIO</);
  const audioTrackStrip = splitStripSegment(connected, 0, { label: "Track", value: "2/8 AUDIO" });
  assert.doesNotMatch(audioTrackStrip, /2\/8 AUDIO ← Ext\./);
  assert.match(audioTrackStrip, /Audio In · EXT 1\/2/);
  assert.match(audioTrackStrip, /PLUGIN · Wavetable 1/);
  const midiTrackStrip = splitStripSegment({ ...connected, track: { ...connected.track!, typeLabel: "MIDI", midiFromLabel: "All Ins · All Channels", midiToLabel: "Synth A · Ch. 1" } }, 0, { label: "Track", value: "5/8 MIDI" });
  assert.match(midiTrackStrip, />5\/8 MIDI</);
  assert.match(midiTrackStrip, /MIDI In · ALL\/ALL/);
  assert.match(midiTrackStrip, /MIDI Out · Synth A\/CH1/);
  const plainMidiTrackStrip = splitStripSegment({ ...connected, track: { ...connected.track!, typeLabel: "MIDI", deviceLabel: "", midiFromLabel: "", midiToLabel: "" } }, 0, { label: "Track", value: "3/8 MIDI" });
  assert.doesNotMatch(plainMidiTrackStrip, /SINGLE|MULTI/);
  const externalInstrumentStrip = splitStripSegment({ ...connected, track: { ...connected.track!, typeLabel: "MIDI", deviceLabel: "EXT INST · Synth A", midiFromLabel: "Pad Controller · Ch. 1", midiToLabel: "Main" } }, 0, { label: "Track", value: "5/8 MIDI" });
  assert.match(externalInstrumentStrip, /EXT INST · Synth A · MIDI In · Pad Controller\/CH1 · Output · Main/);
  assert.doesNotMatch(externalInstrumentStrip, /MIDI Out · Main/);
  const longMidiRouteStrip = splitStripSegment({ ...connected, track: { ...connected.track!, typeLabel: "MIDI", deviceLabel: "", midiFromLabel: "Keyboard 49 mk2 (MIDI) · All Channels", midiToLabel: "Keyboard Output (Keyboard 49 mk2 (DAW)) · Ch. 1" } }, 0, { label: "Track", value: "3/8 MIDI" });
  assert.match(longMidiRouteStrip, /MIDI In · Keyboard 49 mk2\/ALL · MIDI Out · Keyboard Out\/CH1/);
  assert.doesNotMatch(longMidiRouteStrip, /Keyboard 49 mk2 \(DAW\)/);
  const panStrip = splitStripSegment(connected, 1, { label: "Pan", value: "25R", pan: 0.625 });
  assert.match(panStrip, />25R</);
  assert.match(panStrip, /cx="348"/);
  assert.match(panStrip, /cy="84.5"/);
  assert.match(fixedCellLocatorText("11.3.3", "#fff"), /x="290"/);
  assert.match(fixedCellLocatorText("11.3.3", "#fff"), /x="510"/);
  assert.doesNotMatch(fixedCellLocatorText("11.3.3", "#fff"), /> </);
  assert.match(transportStripSegment(connected, 1) ?? "", /futura-pt,Futura,Avenir/);
  assert.match(transportStripSegment({ ...connected, transport: { ...connected.transport, playing: false, recording: false } }, 1) ?? "normal", /normal/);
  assert.match(transportStripSegment({ ...connected, transport: { ...connected.transport, playing: false, recording: true } }, 1) ?? "normal", /normal/);
  const recordingStrip = transportStripSegment({ ...connected, transport: { ...connected.transport, playing: true, recording: true } }, 1) ?? "";
  assert.doesNotMatch(recordingStrip, /Recording|Playing/);
  assert.match(recordingStrip, /y="68"/);
  assert.match(dialSvg("Test", "42", "not-a-color", 0.5), /width="90"/);
  const offline = { ...connected, connected: false };
  assert.match(transportStripSegment(offline, 1) ?? "", /Waiting for Ableton Live/);
  assert.match(transportStripSegment(offline, 1) ?? "", /#d59b3b/);
  assert.match(transportStripSegment(offline, 1) ?? "", /font-weight="normal"/);
  assert.match(transportStripSegment(offline, 1) ?? "", /viewBox="200 0 200 100"/);
  assert.doesNotMatch(toggleSvg("arm", offline), /ARM|LIVE OFFLINE/);
  assert.doesNotMatch(transportSvg("play", offline), /PLAY|LIVE OFFLINE/);
  assert.match(toggleSvg("arm", offline), /fill="#000000"/);
});

test("state store applies bridge snapshots and disconnects", () => {
  const store = new StateStore();
  let notifications = 0;
  store.subscribe(() => notifications++);
  store.apply({ type: "state", protocol: 1, liveVersion: "12.1.0", armMode: "multi", viewMode: "session", externalInstrumentBrowser: connected.externalInstrumentBrowser, transport: connected.transport, track: connected.track } as LiveState);
  assert.equal(store.current.connected, true);
  assert.equal(store.current.armMode, "multi");
  assert.equal(store.current.viewMode, "session");
  assert.equal(store.current.externalInstrumentBrowser.name, "Synth A");
  assert.equal(store.current.track?.name, "Bass & Lead");
  assert.equal(store.current.transport.playing, true);
  assert.equal(store.current.transport.locator, "11.3.3");
  store.markDisconnected();
  assert.equal(store.current.connected, false);
  assert.equal(notifications, 2);
});

test("projects locator from Live song time and tempo", async () => {
  assert.equal(formatLocator(0, 4), "1.1.1");
  assert.equal(formatLocator(4.5, 4), "2.1.3");
  assert.equal(formatLocator(3, 6, 8), "2.1.1", "a 6/8 bar is three quarter notes");
  assert.equal(formatLocator(0.75, 6, 8), "1.2.2");

  const store = new StateStore();
  store.apply({
    type: "state",
    protocol: 1,
    liveVersion: "12.1.0",
    armMode: "multi",
    transport: { ...connected.transport, songTime: 4, locator: "2.1.1", tempo: 240 },
    track: connected.track
  } as LiveState);
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.equal(store.current.transport.locator, "2.2.1");
});
