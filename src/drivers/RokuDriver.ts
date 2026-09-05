import type { CommandResult, DeviceAction, DeviceConfig, DeviceState, Driver } from "../types.js";

/**
 * Driver para TVs/streamers Roku via ECP (External Control Protocol), API HTTP simples
 * e local, sem depender da nuvem Roku. Documentacao publica: developer.roku.com/docs/developer-program/debugging/external-control-api.md
 */
export class RokuDriver implements Driver {
  readonly type = "roku";

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  private baseUrl(device: DeviceConfig): string {
    if (!device.address) throw new Error(`Dispositivo "${device.name}" sem endereco IP configurado`);
    return `http://${device.address}:8060`;
  }

  async getState(device: DeviceConfig): Promise<DeviceState> {
    try {
      const res = await fetch(`${this.baseUrl(device)}/query/device-info`);
      const xml = await res.text();
      const powerMode = xml.match(/<power-mode>(.*?)<\/power-mode>/)?.[1];
      return { power: powerMode === "PowerOn" ? "on" : "off" };
    } catch {
      return { power: "unknown", online: false };
    }
  }

  async execute(device: DeviceConfig, action: DeviceAction): Promise<CommandResult> {
    const keyMap: Partial<Record<DeviceAction, string>> = {
      power_on: "PowerOn",
      power_off: "PowerOff",
      power_toggle: "Power",
      volume_up: "VolumeUp",
      volume_down: "VolumeDown",
      mute_toggle: "VolumeMute",
      media_play: "Play",
      media_pause: "Play",
      media_next: "Fwd",
      media_prev: "Rev",
    };

    if (action === "status") {
      const state = await this.getState(device);
      return { ok: true, message: `${device.name}: ${state.power}`, state };
    }

    const key = keyMap[action];
    if (!key) {
      return { ok: false, message: `Acao "${action}" nao suportada via Roku ECP.` };
    }

    const res = await fetch(`${this.baseUrl(device)}/keypress/${key}`, { method: "POST" });
    if (!res.ok) {
      return { ok: false, message: `Roku respondeu HTTP ${res.status}.` };
    }

    return { ok: true, message: `${device.name}: comando "${key}" enviado.` };
  }
}
