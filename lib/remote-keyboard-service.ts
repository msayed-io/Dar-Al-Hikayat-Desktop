export type RemoteTextAction = "disconnect" | "NEWLINE" | "BACKSPACE" | "DELETE_WORD" | "UNDO" | "REDO" | "SELECT_ALL" | "NAVIGATE_LEFT" | "NAVIGATE_RIGHT" | "PING";
export type RemoteMouseAction = "MOUSE_MODE" | "MOUSE_MOVE" | "MOUSE_CLICK" | "MOUSE_SCROLL" | "MOUSE_DOWN" | "MOUSE_UP";
export type RemoteMouseButton = "left" | "right" | "middle";
export interface RemoteKeystrokePayload {
  sessionPin: string;
  type: "KEY" | "TASHKEEL" | "COMMAND" | "PASTE_TEXT" | "MOUSE";
  char?: string; action?: RemoteTextAction | RemoteMouseAction; text?: string;
  dx?: number; dy?: number; deltaY?: number; button?: RemoteMouseButton; clicks?: number; enabled?: boolean;
  senderId?: string; timestamp: number;
}
export interface NetworkIpResult { primaryIp: string; ips: string[]; port: number; connectionUrl: string; }
const CHANNEL = "dar_remote_keyboard_channel";
const int = (v: unknown, fallback = 0) => { const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10); return Number.isFinite(n) ? n : fallback; };
const truthy = (v: unknown) => typeof v === "boolean" ? v : ["1", "true", "on", "yes"].includes(String(v ?? "").trim().toLowerCase());
export async function updateRemoteSession(_pin: string, _connected: boolean): Promise<void> {}
export function mapNativeCommandToPayload(action: string, data: Record<string, unknown>, sessionPin = ""): RemoteKeystrokePayload | null {
  const char = typeof data.char === "string" ? data.char : ""; const text = typeof data.text === "string" ? data.text : "";
  const base = (type: RemoteKeystrokePayload["type"]): RemoteKeystrokePayload => ({ sessionPin, type, char, text, timestamp: Date.now() });
  switch (action) {
    case "ping": return { ...base("COMMAND"), action: "PING" }; case "tashkeel": return { ...base("TASHKEEL"), char: char || text }; case "paste": return { ...base("PASTE_TEXT"), text };
    case "backspace": return { ...base("COMMAND"), action: "BACKSPACE" }; case "delete_word": return { ...base("COMMAND"), action: "DELETE_WORD" }; case "newline": return { ...base("COMMAND"), action: "NEWLINE" }; case "undo": return { ...base("COMMAND"), action: "UNDO" }; case "redo": return { ...base("COMMAND"), action: "REDO" }; case "select_all": return { ...base("COMMAND"), action: "SELECT_ALL" };
    case "cursor_move": return { ...base("COMMAND"), action: int(data.delta, 1) < 0 ? "NAVIGATE_LEFT" : "NAVIGATE_RIGHT" };
    case "mouse": return { ...base("MOUSE"), action: "MOUSE_MOVE", dx: int(data.dx), dy: int(data.dy) }; case "mouse_click": return { ...base("MOUSE"), action: "MOUSE_CLICK", button: data.button === "right" ? "right" : data.button === "middle" ? "middle" : "left", clicks: int(data.count, 1) > 1 ? 2 : 1 };
    case "mouse_scroll": return { ...base("MOUSE"), action: "MOUSE_SCROLL", deltaY: int(data.deltaY) }; case "mouse_down": return { ...base("MOUSE"), action: "MOUSE_DOWN", button: data.button === "right" ? "right" : data.button === "middle" ? "middle" : "left" }; case "mouse_up": return { ...base("MOUSE"), action: "MOUSE_UP", button: data.button === "right" ? "right" : data.button === "middle" ? "middle" : "left" }; case "mouse_mode": return { ...base("MOUSE"), action: "MOUSE_MODE", enabled: truthy(data.enabled) };
    default: return char ? base("KEY") : null;
  }
}
export async function getDeviceLocalIp(): Promise<NetworkIpResult> {
  const port = 8080; const host = typeof window !== "undefined" ? window.location.hostname || "localhost" : "localhost";
  try { const res = await fetch("/api/remote-keyboard/ip"); if (res.ok) { const data = await res.json(); if (data.primaryIp && data.primaryIp !== "127.0.0.1") { const p = data.port || port; return { primaryIp: data.primaryIp, ips: data.ips || [data.primaryIp], port: p, connectionUrl: `http://${data.primaryIp}:${p}/` }; } } } catch { /* fallback */ }
  const ip = host !== "localhost" && host !== "127.0.0.1" ? host : "192.168.1.15"; return { primaryIp: ip, ips: [ip], port, connectionUrl: `http://${ip}:${port}/` };
}
export async function sendRemoteKeystroke(payload: RemoteKeystrokePayload): Promise<{ ok: boolean; latencyMs: number }> {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  try { if (typeof BroadcastChannel !== "undefined") { const bc = new BroadcastChannel(CHANNEL); bc.postMessage(payload); bc.close(); } } catch {}
  try { localStorage.setItem("dar_remote_key_event", JSON.stringify({ ...payload, _nonce: Math.random() })); } catch {}
  try {
    let a = "type"; if (payload.type === "TASHKEEL") a = "tashkeel"; else if (payload.type === "PASTE_TEXT") a = "paste"; else if (payload.action === "BACKSPACE") a = "backspace"; else if (payload.action === "NEWLINE") a = "newline"; else if (payload.action === "UNDO") a = "undo"; else if (payload.action === "REDO") a = "redo"; else if (payload.action === "DELETE_WORD") a = "delete_word"; else if (payload.action === "NAVIGATE_LEFT") a = "cursor_move&delta=-1"; else if (payload.action === "NAVIGATE_RIGHT") a = "cursor_move&delta=1"; else if (payload.action === "MOUSE_MOVE") a = `mouse&dx=${Math.round(payload.dx || 0)}&dy=${Math.round(payload.dy || 0)}`; else if (payload.action === "MOUSE_CLICK") a = `mouse_click&button=${payload.button || "left"}${payload.clicks === 2 ? "&count=2" : ""}`; else if (payload.action === "MOUSE_SCROLL") a = `mouse_scroll&deltaY=${Math.round(payload.deltaY || 0)}`; else if (payload.action === "MOUSE_DOWN") a = `mouse_down&button=${payload.button || "left"}`; else if (payload.action === "MOUSE_UP") a = `mouse_up&button=${payload.button || "left"}`; else if (payload.action === "MOUSE_MODE") a = `mouse_mode&enabled=${payload.enabled === false ? 0 : 1}`;
    let url = `/api/command?action=${a}&pin=${encodeURIComponent(payload.sessionPin)}`; if (payload.char) url += `&char=${encodeURIComponent(payload.char)}`; if (payload.text) url += `&text=${encodeURIComponent(payload.text)}`;
    const response = await fetch(url); const now = typeof performance !== "undefined" ? performance.now() : Date.now(); return { ok: response.ok, latencyMs: Math.round(now - start) };
  } catch { try { await fetch("/api/remote-keyboard/type", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); } catch {} const now = typeof performance !== "undefined" ? performance.now() : Date.now(); return { ok: true, latencyMs: Math.round(now - start) }; }
}
export function listenForRemoteKeystrokes(sessionPin: string, onKeystroke: (payload: RemoteKeystrokePayload) => void, onStatusChange?: (connected: boolean, clientIp?: string) => void): () => void {
  let stopped = false; let bc: BroadcastChannel | null = null;
  try { if (typeof BroadcastChannel !== "undefined") { bc = new BroadcastChannel(CHANNEL); bc.onmessage = e => { const p = e.data as RemoteKeystrokePayload; if (!stopped && p && (!sessionPin || p.sessionPin === sessionPin)) { onStatusChange?.(true, "الهاتف متصل عبر المزامنة المحلية"); onKeystroke(p); } }; } } catch {}
  const storage = (e: StorageEvent) => { if (stopped || e.key !== "dar_remote_key_event" || !e.newValue) return; try { const p = JSON.parse(e.newValue) as RemoteKeystrokePayload; if (p && (!sessionPin || p.sessionPin === sessionPin)) { onStatusChange?.(true, "الهاتف متصل عبر المتصفح المحلي"); onKeystroke(p); } } catch {} };
  window.addEventListener("storage", storage); let es: EventSource | null = null;
  try { es = new EventSource("/api/remote-keyboard/events"); es.onmessage = e => { if (stopped) return; try { const p = JSON.parse(e.data) as RemoteKeystrokePayload; if (p && p.type !== ("INIT_CONNECTED" as any) && p.type !== ("INIT_LISTENING" as any) && p.sessionPin === sessionPin) { onStatusChange?.(true); onKeystroke(p); } } catch {} }; } catch {}
  return () => { stopped = true; bc?.close(); window.removeEventListener("storage", storage); es?.close(); };
}
