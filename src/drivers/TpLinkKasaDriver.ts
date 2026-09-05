import { Socket } from "node:net";
import type { CommandResult, DeviceAction, DeviceConfig, DeviceState, Driver } from "../types.js";

const KASA_PORT = 9999;
const KASA_KEY = 171;

/**
 * Driver para tomadas/interruptores TP-Link Kasa (HS100/HS110/KP series, etc).
 * Protocolo TCP proprietario documentado pela comunidade (python-kasa e outros):
 * JSON com "criptografia" XOR simples, sem necessidade da nuvem TP-Link.
 */
export class TpLinkKasaDriver implements Driver {
  readonly type = "tplink-kasa";

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async getState(device: DeviceConfig): Promise<DeviceState> {
    const response = await this.send(device, { system: { get_sysinfo: {} } });
    const info = response?.system?.get_sysinfo;
    if (!info) return { power: "unknown" };
    return {
      power: info.relay_state === 1 ? "on" : "off",
      brightness: info.brightness,
    };
  }

  async execute(device: DeviceConfig, action: DeviceAction): Promise<CommandResult> {
    switch (action) {
      case "power_on":
        await this.send(device, { system: { set_relay_state: { state: 1 } } });
        return { ok: true, message: `${device.name}: ligado.`, state: { power: "on" } };
      case "power_off":
        await this.send(device, { system: { set_relay_state: { state: 0 } } });
        return { ok: true, message: `${device.name}: desligado.`, state: { power: "off" } };
      case "power_toggle": {
        const current = await this.getState(device);
        return this.execute(device, current.power === "on" ? "power_off" : "power_on");
      }
      case "status": {
        const state = await this.getState(device);
        return { ok: true, message: `${device.name}: ${state.power}`, state };
      }
      default:
        return { ok: false, message: `Acao "${action}" nao suportada por tomadas Kasa.` };
    }
  }

  private send(device: DeviceConfig, command: Record<string, unknown>): Promise<any> {
    const host = (device.options?.host as string) ?? device.address;
    if (!host) {
      return Promise.reject(new Error(`Dispositivo "${device.name}" sem endereco IP configurado`));
    }

    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const chunks: Buffer[] = [];
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Timeout ao conectar em ${host}:${KASA_PORT}`));
      }, 5000);

      socket.connect(KASA_PORT, host, () => {
        socket.write(encrypt(JSON.stringify(command)));
      });

      socket.on("data", (chunk) => chunks.push(chunk));

      socket.on("close", () => {
        clearTimeout(timeout);
        try {
          const payload = Buffer.concat(chunks);
          const body = payload.length > 4 ? payload.subarray(4) : payload;
          resolve(JSON.parse(decrypt(body)));
        } catch (err) {
          reject(err);
        }
      });

      socket.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }
}

function encrypt(input: string): Buffer {
  const buf = Buffer.from(input, "utf-8");
  const out = Buffer.alloc(buf.length + 4);
  out.writeUInt32BE(buf.length, 0);
  let key = KASA_KEY;
  for (let i = 0; i < buf.length; i++) {
    const encrypted = buf[i]! ^ key;
    key = encrypted;
    out[i + 4] = encrypted;
  }
  return out;
}

function decrypt(buf: Buffer): string {
  let key = KASA_KEY;
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const encrypted = buf[i]!;
    out[i] = encrypted ^ key;
    key = encrypted;
  }
  return out.toString("utf-8");
}
