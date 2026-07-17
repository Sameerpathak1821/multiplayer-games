import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { CLOSE_CODES, clientMessageSchema, isValidRoomCode } from "@gamehub/shared";
import { verifySessionToken } from "./auth";
import type { RoomManager } from "./rooms/manager";

/**
 * Attach the room WebSocket endpoint at /ws?code=XXXXXX&token=…
 * Auth happens before the upgrade completes — bad requests never
 * reach a room.
 */
export function attachRoomSockets(httpServer: HttpServer, manager: RoomManager): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", async (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    const code = (url.searchParams.get("code") ?? "").toUpperCase();
    const token = url.searchParams.get("token") ?? "";

    const reject = (closeCode: number, reason: string) => {
      wss.handleUpgrade(request, socket, head, (ws) => ws.close(closeCode, reason));
    };

    if (!isValidRoomCode(code) || !token) {
      reject(CLOSE_CODES.INVALID_PARAMS, "invalid code or missing token");
      return;
    }
    const session = await verifySessionToken(token);
    if (!session) {
      reject(CLOSE_CODES.BAD_TOKEN, "invalid token");
      return;
    }
    const room = manager.getRoom(code);
    if (!room) {
      reject(CLOSE_CODES.ROOM_NOT_FOUND, "room not found");
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      const err = room.join(session, ws);
      if (err) {
        ws.close(CLOSE_CODES.ROOM_FULL, "room full");
        return;
      }

      ws.on("message", (raw) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(raw));
        } catch {
          return;
        }
        const msg = clientMessageSchema.safeParse(parsed);
        if (!msg.success) return;
        room.handleMessage(session.sessionId, msg.data);
      });

      ws.on("close", () => {
        room.handleClose(session.sessionId, ws);
      });
    });
  });
}
