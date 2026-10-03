/** @vitest-environment jsdom */
/**
 * Remote pointer engine: geometry, event bus and the synthetic DOM event
 * sequence a phone click must produce on the tablet.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buttonMask,
  clampCursor,
  dispatchRemoteMouseAt,
  elementAtPoint,
  emitRemoteMouse,
  findScrollableAncestor,
  handleRemoteMousePayload,
  isRemoteMouseEnabled,
  normalizeMouseButton,
  parseRemoteMousePayload,
  resetRemoteMouse,
  subscribeRemoteMouse,
  type RemoteMouseCommand,
} from "../lib/remote-mouse";
import type { RemoteKeystrokePayload } from "../lib/remote-keyboard-service";

const payload = (patch: Partial<RemoteKeystrokePayload>): RemoteKeystrokePayload => ({
  sessionPin: "123456",
  type: "MOUSE",
  timestamp: 0,
  ...patch,
});

/** jsdom has no elementFromPoint: install a pretendable stub. */
function stubElementFromPoint(value: Element | null) {
  const fn = vi.fn(() => value);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, writable: true, value: fn });
  return fn;
}

beforeEach(() => {
  document.body.innerHTML = "";
  resetRemoteMouse();
  stubElementFromPoint(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  resetRemoteMouse();
});

describe("Pointer geometry", () => {
  it("clamps the cursor inside the viewport with a safety margin", () => {
    expect(clampCursor(-40, -40, 1000, 800)).toEqual({ x: 8, y: 8 });
    expect(clampCursor(5000, 5000, 1000, 800)).toEqual({ x: 992, y: 792 });
    expect(clampCursor(400, 300, 1000, 800)).toEqual({ x: 400, y: 300 });
  });

  it("survives non-finite deltas without losing the cursor", () => {
    expect(clampCursor(NaN, Infinity, 600, 400)).toEqual({ x: 8, y: 392 });
  });

  it("maps buttons to DOM bitmasks and normalizes unknown names to left", () => {
    expect(buttonMask("left")).toBe(1);
    expect(buttonMask("right")).toBe(2);
    expect(buttonMask("middle")).toBe(4);
    expect(normalizeMouseButton("right")).toBe("right");
    expect(normalizeMouseButton("weird")).toBe("left");
  });
});

describe("Payload decoding and the event bus", () => {
  it("parses every mouse payload kind", () => {
    expect(parseRemoteMousePayload(payload({ action: "MOUSE_MOVE", dx: 5, dy: -3 }))).toMatchObject({
      action: "MOUSE_MOVE",
      dx: 5,
      dy: -3,
    });
    expect(parseRemoteMousePayload(payload({ action: "MOUSE_SCROLL", deltaY: 90 }))).toMatchObject({
      deltaY: 90,
    });
    expect(parseRemoteMousePayload(payload({ action: "MOUSE_MODE", enabled: false }))).toMatchObject({
      enabled: false,
    });
    expect(parseRemoteMousePayload(payload({ action: "MOUSE_CLICK", clicks: 2 }))).toMatchObject({
      clicks: 2,
    });
  });

  it("refuses non-mouse payloads and unknown mouse actions", () => {
    expect(parseRemoteMousePayload({ ...payload({}), type: "KEY", char: "ب" })).toBeNull();
    expect(parseRemoteMousePayload(payload({ action: "MOUSE_WARP" as any }))).toBeNull();
  });

  it("delivers commands to subscribers and tracks the enabled flag", () => {
    const seen: RemoteMouseCommand[] = [];
    const unsubscribe = subscribeRemoteMouse((command) => seen.push(command));

    expect(isRemoteMouseEnabled()).toBe(false);
    expect(handleRemoteMousePayload(payload({ action: "MOUSE_MODE", enabled: true }))).toBe(true);
    expect(isRemoteMouseEnabled()).toBe(true);
    handleRemoteMousePayload(payload({ action: "MOUSE_MOVE", dx: 3, dy: 4 }));
    expect(seen.map((command) => command.action)).toEqual(["MOUSE_MODE", "MOUSE_MOVE"]);

    unsubscribe();
    emitRemoteMouse({ action: "MOUSE_MOVE", dx: 1, dy: 1 });
    expect(seen).toHaveLength(2);
  });

  it("turns the pointer off on disconnect, but only when it was on", () => {
    const seen: RemoteMouseCommand[] = [];
    subscribeRemoteMouse((command) => seen.push(command));

    resetRemoteMouse();
    expect(seen).toHaveLength(0);

    emitRemoteMouse({ action: "MOUSE_MODE", enabled: true });
    resetRemoteMouse();
    expect(seen[seen.length - 1]).toMatchObject({ action: "MOUSE_MODE", enabled: false });
    expect(isRemoteMouseEnabled()).toBe(false);
  });

  it("a throwing subscriber cannot break the input pipeline", () => {
    subscribeRemoteMouse(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    subscribeRemoteMouse(good);
    expect(() => emitRemoteMouse({ action: "MOUSE_MOVE", dx: 1, dy: 1 })).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});

describe("Synthetic DOM dispatch (what the phone can actually press)", () => {
  it("resolves the real element under the pointer", () => {
    const button = document.createElement("button");
    button.id = "target";
    Object.defineProperty(button, "tagName", { value: "BUTTON" });
    document.body.appendChild(button);
    stubElementFromPoint(button);
    expect(elementAtPoint(120, 240)).toBe(button);
  });

  it("fires a full left-click sequence on the element under the cursor", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    const order: string[] = [];
    for (const type of ["mousedown", "mouseup", "click", "contextmenu", "dblclick"]) {
      button.addEventListener(type, (event) => {
        const mouse = event as MouseEvent;
        order.push(`${type}:${mouse.button}:${mouse.clientX},${mouse.clientY}`);
      });
    }
    stubElementFromPoint(button);

    dispatchRemoteMouseAt({ action: "MOUSE_CLICK", button: "left", clicks: 1 }, 210, 96);

    expect(order).toEqual(["mousedown:0:210,96", "mouseup:0:210,96", "click:0:210,96"]);
  });

  it("right click opens the context menu and never fires a primary click", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const order: string[] = [];
    for (const type of ["mousedown", "mouseup", "click", "contextmenu", "auxclick"]) {
      target.addEventListener(type, () => order.push(type));
    }
    stubElementFromPoint(target);

    dispatchRemoteMouseAt({ action: "MOUSE_CLICK", button: "right", clicks: 1 }, 50, 60);

    expect(order).toEqual(["mousedown", "contextmenu", "mouseup", "auxclick"]);
    expect(order).not.toContain("click");
  });

  it("double click adds a dblclick event with detail 2", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const clicks: number[] = [];
    target.addEventListener("dblclick", (event) => clicks.push((event as MouseEvent).detail));
    stubElementFromPoint(target);

    dispatchRemoteMouseAt({ action: "MOUSE_CLICK", button: "left", clicks: 2 }, 10, 10);

    expect(clicks).toEqual([2]);
  });

  it("two quick taps in the same spot become a real double click", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const events: string[] = [];
    for (const type of ["click", "dblclick"]) {
      target.addEventListener(type, () => events.push(type));
    }
    stubElementFromPoint(target);

    dispatchRemoteMouseAt({ action: "MOUSE_CLICK", button: "left", clicks: 1 }, 300, 400);
    expect(events).toEqual(["click"]);

    // Instant taps from the phone: the tablet adds the double-click semantics.
    dispatchRemoteMouseAt({ action: "MOUSE_CLICK", button: "left", clicks: 1 }, 302, 401);
    expect(events).toEqual(["click", "click", "dblclick"]);
  });

  it("a slow second click or a far one stays two separate clicks", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const dblclicks = vi.fn();
    target.addEventListener("dblclick", dblclicks);
    stubElementFromPoint(target);

    dispatchRemoteMouseAt({ action: "MOUSE_CLICK", button: "left", clicks: 1 }, 100, 100);
    dispatchRemoteMouseAt({ action: "MOUSE_CLICK", button: "left", clicks: 1 }, 400, 400);
    expect(dblclicks).not.toHaveBeenCalled();
  });

  it("press and release dispatch without a click (drag stays a drag)", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const events: string[] = [];
    for (const type of ["mousedown", "mouseup", "click"]) {
      target.addEventListener(type, () => events.push(type));
    }
    stubElementFromPoint(target);

    dispatchRemoteMouseAt({ action: "MOUSE_DOWN", button: "left" }, 10, 10);
    dispatchRemoteMouseAt({ action: "MOUSE_UP", button: "left" }, 40, 60);

    expect(events).toEqual(["mousedown", "mouseup"]);
  });

  it("scroll goes to the nearest scrollable panel and falls back to the page", () => {
    const panel = document.createElement("div");
    panel.style.overflowY = "auto";
    Object.defineProperty(panel, "scrollHeight", { value: 900 });
    Object.defineProperty(panel, "clientHeight", { value: 300 });
    const inner = document.createElement("span");
    panel.appendChild(inner);
    document.body.appendChild(panel);

    expect(findScrollableAncestor(inner)).toBe(panel);

    stubElementFromPoint(inner);
    dispatchRemoteMouseAt({ action: "MOUSE_SCROLL", deltaY: 120 }, 20, 20);
    expect(panel.scrollTop).toBe(120);

    const plain = document.createElement("em");
    document.body.appendChild(plain);
    stubElementFromPoint(plain);
    const scrollBy = vi.fn();
    Object.defineProperty(window, "scrollBy", { configurable: true, writable: true, value: scrollBy });
    dispatchRemoteMouseAt({ action: "MOUSE_SCROLL", deltaY: 60 }, 0, 0);
    expect(scrollBy).toHaveBeenCalledWith(0, 60);
  });

  it("respects an app handler that consumes the wheel event", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    target.addEventListener("wheel", (event) => event.preventDefault());
    stubElementFromPoint(target);

    const result = dispatchRemoteMouseAt({ action: "MOUSE_SCROLL", deltaY: 100 }, 5, 5);
    expect(result.accepted).toBe(false);
  });

  it("falls back to document.body when the point resolves to nothing", () => {
    stubElementFromPoint(null);
    const listener = vi.fn();
    document.body.addEventListener("click", listener);
    const result = dispatchRemoteMouseAt({ action: "MOUSE_CLICK", button: "left" }, 1, 1);
    expect(result.target).toBe(document.body);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
