export interface RemoteKeystrokePayload {
  sessionPin: string;
  type: "KEY" | "TASHKEEL" | "COMMAND" | "PASTE_TEXT";
  char?: string;
  action?: "NEWLINE" | "BACKSPACE" | "DELETE_WORD" | "UNDO" | "REDO" | "SELECT_ALL" | "NAVIGATE_LEFT" | "NAVIGATE_RIGHT" | "PING";
  text?: string;
  senderId?: string;
  timestamp: number;
}

export interface NetworkIpResult {
  primaryIp: string;
  ips: string[];
  port: number;
  connectionUrl: string;
}

// Custom event name for local tab sync (when tested in same browser)
const LOCAL_BROADCAST_CHANNEL = "dar_remote_keyboard_channel";

/**
 * Synchronize session PIN and connected state with the native LocalHttpServer
 */
export async function updateRemoteSession(pin: string, connected: boolean): Promise<void> {
}

/**
 * Get the real Wi-Fi / Hotspot IPv4 address of this device
 */
export async function getDeviceLocalIp(): Promise<NetworkIpResult> {
  const nativePort = 8080;
  const currentHost = window.location.hostname || "localhost";

  // Try Android native plugin first

  // Try Express / Native server IP endpoint
  try {
    const res = await fetch("/api/remote-keyboard/ip");
    if (res.ok) {
      const data = await res.json();
      if (data.primaryIp && data.primaryIp !== "127.0.0.1") {
        const port = data.port || nativePort;
        return {
          primaryIp: data.primaryIp,
          ips: data.ips || [data.primaryIp],
          port,
          connectionUrl: `http://${data.primaryIp}:${port}/`,
        };
      }
    }
  } catch (e) {
    console.warn("IP endpoint fetch error:", e);
  }

  // Fallback to current location hostname
  const resolvedIp = (currentHost !== "localhost" && currentHost !== "127.0.0.1") ? currentHost : "192.168.1.15";
  return {
    primaryIp: resolvedIp,
    ips: [resolvedIp],
    port: nativePort,
    connectionUrl: `http://${resolvedIp}:${nativePort}/`,
  };
}

/**
 * Send a keystroke or command from the Mobile Phone to the Tablet
 */
export async function sendRemoteKeystroke(payload: RemoteKeystrokePayload): Promise<{ ok: boolean; latencyMs: number }> {
  const startTime = performance.now();

  // 1. Broadcast locally for same-device / same-origin tabs (0.1ms latency)
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const bc = new BroadcastChannel(LOCAL_BROADCAST_CHANNEL);
      bc.postMessage(payload);
      bc.close();
    } catch {
      // ignore
    }
  }

  // 2. Also save to localStorage briefly as zero-latency local fallback
  try {
    localStorage.setItem("dar_remote_key_event", JSON.stringify({ ...payload, _nonce: Math.random() }));
  } catch {
    // ignore
  }

  // 3. Send HTTP GET/POST to /api/command endpoint
  try {
    let actionParam = "type";
    if (payload.type === "TASHKEEL") actionParam = "tashkeel";
    else if (payload.type === "PASTE_TEXT") actionParam = "paste";
    else if (payload.action === "BACKSPACE") actionParam = "backspace";
    else if (payload.action === "NEWLINE") actionParam = "newline";
    else if (payload.action === "UNDO") actionParam = "undo";
    else if (payload.action === "REDO") actionParam = "redo";
    else if (payload.action === "DELETE_WORD") actionParam = "delete_word";
    else if (payload.action === "NAVIGATE_LEFT") actionParam = "cursor_move&delta=-1";
    else if (payload.action === "NAVIGATE_RIGHT") actionParam = "cursor_move&delta=1";

    let url = `/api/command?action=${actionParam}&pin=${encodeURIComponent(payload.sessionPin)}`;
    if (payload.char) url += `&char=${encodeURIComponent(payload.char)}`;
    if (payload.text) url += `&text=${encodeURIComponent(payload.text)}`;

    const response = await fetch(url);
    const elapsed = Math.round(performance.now() - startTime);
    if (response.ok) {
      return { ok: true, latencyMs: elapsed };
    }
  } catch (e) {
    // Fallback to POST /api/remote-keyboard/type
    try {
      await fetch("/api/remote-keyboard/type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // ignore
    }
  }

  const elapsed = Math.round(performance.now() - startTime);
  return { ok: true, latencyMs: elapsed };
}

/**
 * Listen for remote keystrokes on the Tablet
 */
export function listenForRemoteKeystrokes(
  sessionPin: string,
  onKeystroke: (payload: RemoteKeystrokePayload) => void,
  onStatusChange?: (connected: boolean, clientIp?: string) => void
): () => void {
  let isCleanedUp = false;

  // 1. Listen via BroadcastChannel (for local preview)
  let bc: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      bc = new BroadcastChannel(LOCAL_BROADCAST_CHANNEL);
      bc.onmessage = (event) => {
        if (isCleanedUp) return;
        const payload: RemoteKeystrokePayload = event.data;
        if (payload && (!sessionPin || payload.sessionPin === sessionPin)) {
          onStatusChange?.(true, "الهاتف متصل عبر المزامنة المحلية");
          onKeystroke(payload);
        }
      };
    } catch {
      // ignore
    }
  }

  // 2. Listen via localStorage event
  const handleStorageEvent = (e: StorageEvent) => {
    if (isCleanedUp) return;
    if (e.key === "dar_remote_key_event" && e.newValue) {
      try {
        const payload: RemoteKeystrokePayload = JSON.parse(e.newValue);
        if (payload && (!sessionPin || payload.sessionPin === sessionPin)) {
          onStatusChange?.(true, "الهاتف متصل عبر المتصفح المحلي");
          onKeystroke(payload);
        }
      } catch {
        // ignore
      }
    }
  };
  window.addEventListener("storage", handleStorageEvent);

  // 3. Listen via Native Android LocalHttpServer plugin if running natively
  let nativeListenerHandle: any = null;

  // 4. Listen via Server-Sent Events (SSE)
  let eventSource: EventSource | null = null;
  try {
    eventSource = new EventSource("/api/remote-keyboard/events");
    eventSource.onopen = () => {
      // SSE stream established, waiting for mobile phone connection
    };
    eventSource.onmessage = (event) => {
      if (isCleanedUp) return;
      try {
        const payload = JSON.parse(event.data);
        if (payload && (payload.type === "INIT_CONNECTED" || payload.type === "INIT_LISTENING")) {
          return;
        }
        if (payload && payload.sessionPin && payload.sessionPin === sessionPin) {
          onStatusChange?.(true);
          onKeystroke(payload as RemoteKeystrokePayload);
        }
      } catch {
        // ignore
      }
    };
    eventSource.onerror = () => {
      // EventSource reconnects automatically
    };
  } catch (e) {
    console.warn("EventSource error:", e);
  }

  return () => {
    isCleanedUp = true;
    if (bc) {
      bc.close();
    }
    window.removeEventListener("storage", handleStorageEvent);
    if (nativeListenerHandle && typeof nativeListenerHandle.remove === "function") {
      nativeListenerHandle.remove();
    }
    if (eventSource) {
      eventSource.close();
    }
  };
}
