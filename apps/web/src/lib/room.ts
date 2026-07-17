import {
  FATAL_CLOSE_CODES,
  serverMessageSchema,
  type ClientMessage,
  type RoomEvent,
  type RoomSnapshot,
} from "@gamehub/shared";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

export type ClosedReason = "left" | "kicked" | "room_full" | "room_not_found" | "error";

export interface RoomHandlers {
  onState(room: RoomSnapshot, you: string): void;
  onEvent(event: RoomEvent): void;
  onStatus(status: ConnectionStatus): void;
  onClosed(reason: ClosedReason): void;
}

function reasonForCloseCode(code: number): ClosedReason {
  switch (code) {
    case 4003:
      return "room_full";
    case 4004:
      return "room_not_found";
    case 4009:
      return "kicked";
    default:
      return "error";
  }
}

/**
 * A resilient connection to one room. Network drops auto-reconnect with
 * backoff (the server holds the seat for the grace period); fatal closes
 * (kicked, room gone) stop and surface a reason.
 */
export class RoomConnection {
  private ws: WebSocket | null = null;
  private stopped = false;
  private attempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private code: string,
    private token: string,
    private handlers: RoomHandlers,
  ) {}

  connect(): void {
    if (this.stopped) return;
    this.handlers.onStatus(this.attempts === 0 ? "connecting" : "reconnecting");

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/ws?code=${encodeURIComponent(this.code)}&token=${encodeURIComponent(this.token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.handlers.onStatus("connected");
    };

    ws.onmessage = (e) => {
      const parsed = serverMessageSchema.safeParse(JSON.parse(String(e.data)));
      if (!parsed.success) return;
      const msg = parsed.data;
      if (msg.type === "room:state") this.handlers.onState(msg.room, msg.you);
      else if (msg.type === "room:event") this.handlers.onEvent(msg.event);
    };

    ws.onclose = (e) => {
      if (this.ws !== ws || this.stopped) return;
      this.ws = null;

      if (FATAL_CLOSE_CODES.includes(e.code)) {
        this.stopped = true;
        this.handlers.onClosed(reasonForCloseCode(e.code));
        return;
      }
      // Unexpected drop — retry with backoff while the server holds our seat.
      this.attempts += 1;
      if (this.attempts > 8) {
        this.stopped = true;
        this.handlers.onClosed("error");
        return;
      }
      this.handlers.onStatus("reconnecting");
      const delay = Math.min(1000 * 2 ** (this.attempts - 1), 10_000);
      this.retryTimer = setTimeout(() => this.connect(), delay);
    };
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** Explicitly leave the room (frees the seat immediately). */
  leave(): void {
    this.send({ type: "leave" });
    this.dispose();
    this.handlers.onClosed("left");
  }

  /** Tear down without leaving (e.g. component unmount) — seat survives. */
  dispose(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
  }
}
