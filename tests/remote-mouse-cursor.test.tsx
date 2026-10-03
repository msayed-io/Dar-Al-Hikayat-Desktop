/** @vitest-environment jsdom */
/**
 * The pointer overlay itself: appears only when the phone enters the 🖱️ tab,
 * follows deltas with rAF easing, stays inside the viewport and presses the
 * real element underneath.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import RemoteMouseCursor from "../components/RemoteMouseCursor";
import { emitRemoteMouse, resetRemoteMouse } from "../lib/remote-mouse";

let host: HTMLElement;
let root: Root | null = null;

const cursorNode = () => document.querySelector('[data-remote-mouse-cursor="true"]') as HTMLElement | null;

async function mount() {
  await act(async () => {
    root = createRoot(host);
    root.render(<RemoteMouseCursor accent="#D97706" isDark />);
  });
}

const flush = async (ms = 200) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number);
  vi.stubGlobal("cancelAnimationFrame", (h: number) => clearTimeout(h));
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1000 });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 800 });
  vi.useFakeTimers();
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    writable: true,
    value: vi.fn(() => null),
  });
  resetRemoteMouse();
  await mount();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
    root = null;
  });
  host.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Remote pointer overlay", () => {
  it("stays unmounted until the phone selects the mouse tab", async () => {
    expect(cursorNode()).toBeNull();
    await act(async () => emitRemoteMouse({ action: "MOUSE_MODE", enabled: true }));
    expect(cursorNode()).not.toBeNull();
    await act(async () => emitRemoteMouse({ action: "MOUSE_MODE", enabled: false }));
    expect(cursorNode()).toBeNull();
  });

  it("starts centered and never intercepts touches", async () => {
    await act(async () => emitRemoteMouse({ action: "MOUSE_MODE", enabled: true }));
    await flush();
    const node = cursorNode()!;
    expect(node.style.pointerEvents).toBe("none");
    expect(node.parentElement).toBe(document.body);
    const transform = node.style.transform;
    await flush(160);
    expect(node.style.transform).toMatch(/translate3d\(5\d\dpx, 4\d\dpx, 0\)/);
    expect(transform).toContain("translate3d");
  });

  it("moves with the phone deltas and clamps at the viewport edges", async () => {
    await act(async () => emitRemoteMouse({ action: "MOUSE_MODE", enabled: true }));
    await flush(160);
    await act(async () => emitRemoteMouse({ action: "MOUSE_MOVE", dx: 400, dy: -300 }));
    await flush(400);
    let match = /translate3d\((-?\d+)px, (-?\d+)px/.exec(cursorNode()!.style.transform)!;
    expect(Number(match[1])).toBeGreaterThan(800);
    expect(Number(match[2])).toBeLessThan(200);

    // Push far past the edge: the pointer must remain inside the screen.
    await act(async () => emitRemoteMouse({ action: "MOUSE_MOVE", dx: 5000, dy: 5000 }));
    await flush(600);
    match = /translate3d\((-?\d+)px, (-?\d+)px/.exec(cursorNode()!.style.transform)!;
    expect(Number(match[1])).toBe(992);
    expect(Number(match[2])).toBe(792);
  });

  it("presses the element under the pointer and pulses a ripple on click", async () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    const pressed = vi.fn();
    button.addEventListener("click", pressed);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, writable: true, value: vi.fn(() => button) });

    await act(async () => emitRemoteMouse({ action: "MOUSE_MODE", enabled: true }));
    await flush(160);
    await act(async () => emitRemoteMouse({ action: "MOUSE_CLICK", button: "left", clicks: 1 }));

    expect(pressed).toHaveBeenCalledTimes(1);
    expect(cursorNode()!.querySelectorAll("span").length).toBeGreaterThan(0);
  });

  it("shows the dragging ring between press and release", async () => {
    await act(async () => emitRemoteMouse({ action: "MOUSE_MODE", enabled: true }));
    await flush(160);
    const before = cursorNode()!.querySelectorAll("span").length;
    await act(async () => emitRemoteMouse({ action: "MOUSE_DOWN", button: "left" }));
    expect(cursorNode()!.querySelectorAll("span").length).toBeGreaterThan(before);
    await act(async () => emitRemoteMouse({ action: "MOUSE_UP", button: "left" }));
    expect(cursorNode()!.querySelectorAll("span").length).toBe(before);
  });

  it("re-clamps the pointer when the tablet rotates", async () => {
    await act(async () => emitRemoteMouse({ action: "MOUSE_MODE", enabled: true }));
    await act(async () => emitRemoteMouse({ action: "MOUSE_MOVE", dx: 5000, dy: 5000 }));
    await flush(400);
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 600 });
    Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 400 });
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    await flush(300);
    const match = /translate3d\((-?\d+)px, (-?\d+)px/.exec(cursorNode()!.style.transform)!;
    expect(Number(match[1])).toBe(592);
    expect(Number(match[2])).toBe(392);
  });
});
