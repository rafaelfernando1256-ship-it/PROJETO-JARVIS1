import { WebSocket } from "ws";
import type { CommandResult, DeviceAction, DeviceConfig, DeviceState, Driver } from "../types.js";
import { sendWakeOnLan } from "./wakeOnLan.js";

const APP_NAME_B64 = Buffer.from("Jarvis").toString("base64");

interface Connection {
  socket: WebSocket;
  ready: boolean;
  token?: string;
}

/**
 * Driver para Smart TVs Samsung Tizen (2016+) via protocolo de controle remoto por
 * WebSocket (porta 8002, TLS com certificado autoassinado). Na primeira conexao a TV
 * mostra um popup pedindo permissao; o token retornado deve ser salvo em options.token
 * para futuras conexoes sem precisar aprovar de novo. Assim como a LG, ligar exige
 * Wake-on-LAN (options.mac) pois a TV desliga a rede ao ser desligada.
 */
export class SamsungTizenDriver implements Driver {
  readonly type = "samsung-tizen";
  private connections = new Map<string, Connection>();

  async connect(device: DeviceConfig): Promise<void> {
    if (!device.address) throw new Error(`Dispositivo "${device.name}" sem endereco IP configurado`);

    const token = device.options?.token as string | undefined;
    const url = `wss://${device.address}:8002/api/v2/channels/samsung.remote.control?name=${APP_NAME_B64}${
      token ? `&token=${token}` : ""
    }`;

    const socket = new WebSocket(url, { rejectUnauthorized: false });
    const conn: Connection = { socket, ready: false };
    this.connections.set(device.id, conn);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout conectando na TV Samsung")), 10000);

      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.event === "ms.channel.connect") {
          conn.ready = true;
          conn.token = msg.data?.token;
          clearTimeout(timeout);
          if (conn.token && conn.token !== token) {
            console.warn(
              `[samsung-tizen] Novo token para "${device.name}": ${conn.token}. ` +
                `Salve em options.token no devices.json para nao precisar aprovar o pareamento de novo.`
            );
          }
          resolve();
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

  private sendKey(device: DeviceConfig, key: string): void {
    const conn = this.connections.get(device.id);
    if (!conn?.ready) throw new Error(`TV "${device.name}" nao conectada`);
    conn.socket.send(
      JSON.stringify({
        method: "ms.remote.control",
        params: { Cmd: "Click", DataOfCmd: key, Option: "false", TypeOfRemote: "SendRemoteKey" },
      })
    );
  }

  async getState(device: DeviceConfig): Promise<DeviceState> {
    const conn = this.connections.get(device.id);
    return { power: conn?.ready ? "on" : "unknown" };
  }

  async execute(device: DeviceConfig, action: DeviceAction): Promise<CommandResult> {
    if (action === "power_on") {
      const mac = device.options?.mac as string | undefined;
      if (!mac) return { ok: false, message: `Configure options.mac para ligar "${device.name}" via Wake-on-LAN.` };
      await sendWakeOnLan(mac);
      return { ok: true, message: `${device.name}: pacote Wake-on-LAN enviado.` };
    }

    const keyMap: Partial<Record<DeviceAction, string>> = {
      power_off: "KEY_POWER",
      volume_up: "KEY_VOLUP",
      volume_down: "KEY_VOLDOWN",
      mute_toggle: "KEY_MUTE",
      media_play: "KEY_PLAY",
      media_pause: "KEY_PAUSE",
      media_stop: "KEY_STOP",
      media_next: "KEY_CHUP",
      media_prev: "KEY_CHDOWN",
    };

    if (action === "status") {
      const state = await this.getState(device);
      return { ok: true, message: `${device.name}: ${state.power}`, state };
    }

    const key = keyMap[action];
    if (!key) {
      return { ok: false, message: `Acao "${action}" nao suportada por TVs Samsung Tizen.` };
    }

    try {
      this.sendKey(device, key);
      return { ok: true, message: `${device.name}: tecla ${key} enviada.` };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }
}
