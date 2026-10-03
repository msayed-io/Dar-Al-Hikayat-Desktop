/**
 * Wire protocol tests for the wireless Story Keyboard (<-> دار الحكايات).
 *
 * The phone speaks in HTTP query params (`?action=mouse&dx=12&dy=-4`); the
 * tablet must decode every one of them into a typed payload. Mouse actions
 * used to fall through to an empty KEY payload — the exact bug that made the
 * 🖱️ tab do nothing on the tablet.
 */
import { describe, it, expect } from "vitest";
import { mapNativeCommandToPayload } from "../lib/remote-keyboard-service";

const PIN = "123456";

describe("Phone → tablet command decoding", () => {
  it("decodes pointer movement into a MOUSE_MOVE payload with integer deltas", () => {
    const payload = mapNativeCommandToPayload("mouse", { dx: "12", dy: "-4" }, PIN);
    expect(payload).toMatchObject({
      sessionPin: PIN,
      type: "MOUSE",
      action: "MOUSE_MOVE",
      dx: 12,
      dy: -4,
    });
  });

  it("decodes left/right/double clicks", () => {
    expect(mapNativeCommandToPayload("mouse_click", { button: "left" }, PIN)).toMatchObject({
      type: "MOUSE",
      action: "MOUSE_CLICK",
      button: "left",
      clicks: 1,
    });
    expect(mapNativeCommandToPayload("mouse_click", { button: "right" }, PIN)).toMatchObject({
      button: "right",
    });
    expect(mapNativeCommandToPayload("mouse_click", { button: "left", count: "2" }, PIN)).toMatchObject({
      clicks: 2,
    });
  });

  it("decodes scroll, press and release for drag support", () => {
    expect(mapNativeCommandToPayload("mouse_scroll", { deltaY: "120" }, PIN)).toMatchObject({
      type: "MOUSE",
      action: "MOUSE_SCROLL",
      deltaY: 120,
    });
    expect(mapNativeCommandToPayload("mouse_down", { button: "left" }, PIN)).toMatchObject({
      action: "MOUSE_DOWN",
      button: "left",
    });
    expect(mapNativeCommandToPayload("mouse_up", { button: "left" }, PIN)).toMatchObject({
      action: "MOUSE_UP",
      button: "left",
    });
  });

  it("decodes the mouse-mode signal that shows/hides the tablet pointer", () => {
    expect(mapNativeCommandToPayload("mouse_mode", { enabled: "1" }, PIN)).toMatchObject({
      type: "MOUSE",
      action: "MOUSE_MODE",
      enabled: true,
    });
    expect(mapNativeCommandToPayload("mouse_mode", { enabled: "0" }, PIN)).toMatchObject({
      action: "MOUSE_MODE",
      enabled: false,
    });
    expect(mapNativeCommandToPayload("mouse_mode", { enabled: "true" }, PIN)).toMatchObject({
      enabled: true,
    });
  });

  it("keeps every existing text command working (no regression)", () => {
    expect(mapNativeCommandToPayload("type", { char: "ب" }, PIN)).toMatchObject({ type: "KEY", char: "ب" });
    expect(mapNativeCommandToPayload("tashkeel", { char: "َ" }, PIN)).toMatchObject({ type: "TASHKEEL", char: "َ" });
    expect(mapNativeCommandToPayload("paste", { text: "نص" }, PIN)).toMatchObject({ type: "PASTE_TEXT", text: "نص" });
    expect(mapNativeCommandToPayload("newline", {}, PIN)).toMatchObject({ type: "COMMAND", action: "NEWLINE" });
    expect(mapNativeCommandToPayload("backspace", {}, PIN)).toMatchObject({ type: "COMMAND", action: "BACKSPACE" });
    expect(mapNativeCommandToPayload("delete_word", {}, PIN)).toMatchObject({ action: "DELETE_WORD" });
    expect(mapNativeCommandToPayload("undo", {}, PIN)).toMatchObject({ action: "UNDO" });
    expect(mapNativeCommandToPayload("redo", {}, PIN)).toMatchObject({ action: "REDO" });
    expect(mapNativeCommandToPayload("select_all", {}, PIN)).toMatchObject({ action: "SELECT_ALL" });
    expect(mapNativeCommandToPayload("ping", {}, PIN)).toMatchObject({ type: "COMMAND", action: "PING" });
    expect(mapNativeCommandToPayload("cursor_move", { delta: "-1" }, PIN)).toMatchObject({
      action: "NAVIGATE_LEFT",
    });
    expect(mapNativeCommandToPayload("cursor_move", { delta: "1" }, PIN)).toMatchObject({
      action: "NAVIGATE_RIGHT",
    });
  });

  it("ignores unknown actions and empty characters instead of popping the keyboard", () => {
    // Previously these produced an empty KEY payload that focused the editor
    // (and therefore summoned the tablet IME) with no visible input.
    expect(mapNativeCommandToPayload("mouse_unknown", {}, PIN)).toBeNull();
    expect(mapNativeCommandToPayload("gibberish", {}, PIN)).toBeNull();
    expect(mapNativeCommandToPayload("type", { char: "" }, PIN)).toBeNull();
  });

  it("never throws on malformed numbers arriving as strings", () => {
    const payload = mapNativeCommandToPayload("mouse", { dx: "abc", dy: "" }, PIN);
    expect(payload).toMatchObject({ dx: 0, dy: 0 });
    expect(mapNativeCommandToPayload("mouse_scroll", { deltaY: undefined }, PIN)).toMatchObject({
      deltaY: 0,
    });
  });
});
