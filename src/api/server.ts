import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DeviceRegistry } from "../core/DeviceRegistry.js";
import type { CommandRouter } from "../core/CommandRouter.js";
import { discoverSsdp } from "../discovery/ssdpDiscovery.js";
import type { DeviceAction } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../../public");

export function createApp(devices: DeviceRegistry, router: CommandRouter) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(publicDir));

  app.get("/api/devices", (_req, res) => {
    res.json(
      devices.list().map((d) => ({ ...d.config, state: d.state }))
    );
  });

  app.post("/api/command", async (req, res) => {
    const text = req.body?.text;
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ ok: false, message: "Campo 'text' obrigatorio." });
    }
    const results = await router.handleText(text);
    res.json({ results });
  });

  app.post("/api/devices/:id/execute", async (req, res) => {
    const { id } = req.params;
    const action = req.body?.action as DeviceAction | undefined;
    if (!action) {
      return res.status(400).json({ ok: false, message: "Campo 'action' obrigatorio." });
    }
    const result = await devices.execute(id, action, req.body?.params);
    res.json(result);
  });

  app.get("/api/discover", async (req, res) => {
    const timeoutMs = Number(req.query.timeoutMs ?? 4000);
    const found = await discoverSsdp(timeoutMs);
    res.json(found);
  });

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  function broadcast(payload: unknown) {
    const data = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  }

  wss.on("connection", (socket) => {
    socket.send(
      JSON.stringify({
        type: "snapshot",
        devices: devices.list().map((d) => ({ ...d.config, state: d.state })),
      })
    );

    socket.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "command" && typeof msg.text === "string") {
          const results = await router.handleText(msg.text);
          socket.send(JSON.stringify({ type: "command_result", results }));
        }
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "Mensagem invalida." }));
      }
    });
  });

  devices.on("state", ({ id, state }) => {
    broadcast({ type: "state", id, state });
  });

  return server;
}
