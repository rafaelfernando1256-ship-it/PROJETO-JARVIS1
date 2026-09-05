import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import type { CommandResult, DeviceAction, DeviceConfig, DeviceState, Driver } from "../types.js";
import { sendWakeOnLan } from "./wakeOnLan.js";

const REGISTER_PAYLOAD = {
  forcePairing: false,
  pairingType: "PROMPT",
  manifest: {
    manifestVersion: 1,
    permissions: [
      "LAUNCH",
      "CONTROL_AUDIO",
      "CONTROL_POWER",
      "CONTROL_PLAYBACK",
      "READ_CURRENT_CHANNEL",
      "CONTROL_INPUT_MEDIA_PLAYBACK",
    ],
  },
};

interface Connection {
  socket: WebSocket;
  registered: boolean;
  pending: Map<string, (payload: any) => void>;
  clientKey?: string;
}

/**
 * Driver para Smart TVs LG WebOS via protocolo SSAP (WebSocket local, porta 3000/3001).
 * Na primeira conexao a TV mostra um prompt pedindo para aceitar o pareamento no controle
 * remoto fisico; o client-key retornado deve ser salvo em options.clientKey para logins futuros.
 * Como a TV desliga a interface de rede ao ser desligada, "ligar" e feito via Wake-on-LAN
 * (requer options.mac e a TV com WoL habilitado nas configuracoes de rede).
 */
export class LgWebOsDriver implements Driver {
  readonly type = "lg-webos";
  private connections = new Map<string, Connection>();

  async connect(device: DeviceConfig): Promise<void> {
    if (!device.address) throw new Error(`Dispositivo "${device.name}" sem endereco IP configurado`);

    const socket = new WebSocket(`ws://${device.address}:3000`);
    const conn: Connection = { socket, registered: false, pending: new Map() };
    this.connections.set(device.id, conn);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout conectando na TV LG")), 10000);

      socket.on("open", () => {
        socket.send(
          JSON.stringify({
            type: "register",
            id: "register_1",
            payload: { ...REGISTER_PAYLOAD, "client-key": (device.options?.clientKey as string) || undefined },
          })
        );
      });

      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "registered") {
          conn.registered = true;
          conn.clientKey = msg.payload?.["client-key"];
          clearTimeout(timeout);
          if (conn.clientKey && conn.clientKey !== device.options?.clientKey) {
            console.warn(
              `[lg-webos] Novo client-key para "${device.name}": ${conn.clientKey}. ` +
                `Salve em options.clientKey no devices.json para nao precisar aceitar o pareamento de novo.`
            );
          }
          resolve();
          return;
        }

        if (msg.id && conn.pending.has(msg.id)) {
          conn.pending.get(msg.id)!(msg.payload);
          conn.pending.delete(msg.id);
        }
      });

      socket.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async disconnect(device: DeviceConfig): Promise<void> {
    this.connections.get(device.id)?.socket.close();
    this.connections.delete(device.id);
  }

  private request(device: DeviceConfig, uri: string, payload: Record<string, unknown> = {}): Promise<any> {
    const conn = this.connections.get(device.id);
    if (!conn || !conn.registered) {
      return Promise.reject(new Error(`TV "${device.name}" nao conectada`));
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout aguardando resposta da TV")), 5000);
      conn.pending.set(id, (res) => {
        clearTimeout(timeout);
        resolve(res);
      });
      conn.socket.send(JSON.stringify({ type: "request", id, uri, payload }));
    });
  }

  async getState(device: DeviceConfig): Promise<DeviceState> {
    if (!this.connections.get(device.id)?.registered) {
      return { power: "off" };
    }
    try {
      const volume = await this.request(device, "ssap://audio/getVolume");
      return { power: "on", volume: volume.volume, muted: volume.muted };
    } catch {
      return { power: "unknown" };
    }
  }

  async execute(device: DeviceConfig, action: DeviceAction, params: Record<string, unknown> = {}): Promise<CommandResult> {
    if (action === "power_on") {
      const mac = device.options?.mac as string | undefined;
      if (!mac) return { ok: false, message: `Configure options.mac para ligar "${device.name}" via Wake-on-LAN.` };
      await sendWakeOnLan(mac);
      return { ok: true, message: `${device.name}: pacote Wake-on-LAN enviado.` };
    }

    switch (action) {
      case "power_off":
        await this.request(device, "ssap://system/turnOff");
        return { ok: true, message: `${device.name}: desligando.`, state: { power: "off" } };
      case "volume_up":
        await this.request(device, "ssap://audio/volumeUp");
        return { ok: true, message: `${device.name}: volume aumentado.` };
      case "volume_down":
        await this.request(device, "ssap://audio/volumeDown");
        return { ok: true, message: `${device.name}: volume diminuido.` };
      case "volume_set": {
        const amount = Number(params.amount ?? 20);
        await this.request(device, "ssap://audio/setVolume", { volume: amount });
        return { ok: true, message: `${device.name}: volume ${amount}.`, state: { volume: amount } };
      }
      case "mute_toggle": {
        const current = await this.getState(device);
        const muted = !current.muted;
        await this.request(device, "ssap://audio/setMute", { mute: muted });
        return { ok: true, message: `${device.name}: ${muted ? "mudo" : "som ativado"}.`, state: { muted } };
      }
      case "media_play":
        await this.request(device, "ssap://media.controls/play");
        return { ok: true, message: `${device.name}: play.` };
      case "media_pause":
        await this.request(device, "ssap://media.controls/pause");
        return { ok: true, message: `${device.name}: pausado.` };
      case "media_stop":
        await this.request(device, "ssap://media.controls/stop");
        return { ok: true, message: `${device.name}: parado.` };
      case "input_set": {
        const inputId = params.inputId as string;
        await this.request(device, "ssap://system.launcher/launch", { id: inputId });
        return { ok: true, message: `${device.name}: entrada alterada para ${inputId}.` };
      }
      case "status": {
        const state = await this.getState(device);
        return { ok: true, message: `${device.name}: ${state.power}`, state };
      }
      default:
        return { ok: false, message: `Acao "${action}" nao suportada por TVs LG WebOS.` };
    }
  }
}
