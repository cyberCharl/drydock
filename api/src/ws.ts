import type { ServerWebSocket } from "bun";

const clients = new Set<ServerWebSocket<unknown>>();

export function addClient(ws: ServerWebSocket<unknown>) {
  clients.add(ws);
}

export function removeClient(ws: ServerWebSocket<unknown>) {
  clients.delete(ws);
}

export function broadcast(type: string, data: unknown) {
  const message = JSON.stringify({ type, data });
  for (const client of clients) {
    try {
      client.send(message);
    } catch {
      clients.delete(client);
    }
  }
}

export function clientCount() {
  return clients.size;
}
