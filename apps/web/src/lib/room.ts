import {
  FATAL_CLOSE_CODES,
  serverMessageSchema,
  type ChatMessage,
  type ClientMessage,
  type GamePlayer,
  type GameResultInfo,
  type Reaction,
  type RoomEvent,
  type RoomSnapshot,
  type TurnInfo,
} from "@gamehub/shared";

export interface GameStateMsg {
  gameKey: string;
  view: unknown;
  players: GamePlayer[];
  turn: TurnInfo;
}

export interface GameOverMsg {
  result: GameResultInfo;
  forfeit?: { sessionId: string; name: string };
}

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

export type ClosedReason =
  | "left"
  | "kicked"
  | "banned"
  | "room_full"
  | "room_not_found"
  | "wrong_password"
  | "error";

export interface RoomHandlers {
  onState(room: RoomSnapshot, you: string): void;
  onEvent(event: RoomEvent): void;
  onChat(message: ChatMessage): void;
  onChatHistory(messages: ChatMessage[]): void;
  onReaction(reaction: Reaction): void;
  onCountdown(n: number): void;
  onLaunch(): void;
  onGameState(state: GameStateMsg): void;
  onGameOver(over: GameOverMsg): void;
  onError(code: string, message: string): void;
  onStatus(status: ConnectionStatus): void;
  onClosed(reason: ClosedReason): void;
  /** Round-trip time measurement, reported every few seconds. */
  onPing?(rttMs: number): void;
}

function reasonForCloseCode(code: number): ClosedReason {
  switch (code) {
    case 4003:
      return "room_full";
    case 4004:
      return "room_not_found";
    case 4005:
      return "wrong_password";
    case 4009:
      return "kicked";
    case 4010:
      return "banned";
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
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private code: string,
    private token: string,
    private handlers: RoomHandlers,
    private password?: string,
  ) {}

  connect(): void {
    if (this.stopped) return;
    this.handlers.onStatus(this.attempts === 0 ? "connecting" : "reconnecting");

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    let url = `${proto}//${location.host}/ws?code=${encodeURIComponent(this.code)}&token=${encodeURIComponent(this.token)}`;
    if (this.password) url += `&password=${encodeURIComponent(this.password)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.handlers.onStatus("connected");
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ type: "ping", t: Date.now() }), 2000);
      this.send({ type: "ping", t: Date.now() });
    };

    ws.onmessage = (e) => {
      const parsed = serverMessageSchema.safeParse(JSON.parse(String(e.data)));
      if (!parsed.success) return;
      const msg = parsed.data;
      switch (msg.type) {
        case "room:state":
          this.handlers.onState(msg.room, msg.you);
          break;
        case "room:event":
          this.handlers.onEvent(msg.event);
          break;
        case "chat:message":
          this.handlers.onChat(msg.message);
          break;
        case "chat:history":
          this.handlers.onChatHistory(msg.messages);
          break;
        case "reaction":
          this.handlers.onReaction(msg.reaction);
          break;
        case "countdown":
          this.handlers.onCountdown(msg.n);
          break;
        case "lobby:launch":
          this.handlers.onLaunch();
          break;
        case "game:state":
          this.handlers.onGameState({
            gameKey: msg.gameKey,
            view: msg.view,
            players: msg.players,
            turn: msg.turn,
          });
          break;
        case "game:over":
          this.handlers.onGameOver({ result: msg.result, forfeit: msg.forfeit });
          break;
        case "pong":
          if (msg.t !== undefined) this.handlers.onPing?.(Date.now() - msg.t);
          break;
        case "error":
          this.handlers.onError(msg.code, msg.message);
          break;
      }
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
    if (this.pingTimer) clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
  }
}
