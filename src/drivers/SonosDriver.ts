import type { CommandResult, DeviceAction, DeviceConfig, DeviceState, Driver } from "../types.js";

const SONOS_PORT = 1400;

/**
 * Driver para caixas de som Sonos via UPnP/SOAP local (porta 1400), sem depender da
 * nuvem Sonos. Sonos nao tem "power off" tradicional; usamos Play/Pause como equivalente.
 */
export class SonosDriver implements Driver {
  readonly type = "sonos";

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  private host(device: DeviceConfig): string {
    if (!device.address) throw new Error(`Dispositivo "${device.name}" sem endereco IP configurado`);
    return device.address;
  }

  async getState(device: DeviceConfig): Promise<DeviceState> {
    try {
      const volumeRes = await this.soap(device, "RenderingControl", "GetVolume", {
        InstanceID: 0,
        Channel: "Master",
      });
      const muteRes = await this.soap(device, "RenderingControl", "GetMute", {
        InstanceID: 0,
        Channel: "Master",
      });
      const transportRes = await this.soap(device, "AVTransport", "GetTransportInfo", { InstanceID: 0 });

      return {
        volume: Number(volumeRes.CurrentVolume ?? 0),
        muted: muteRes.CurrentMute === "1",
        playing: transportRes.CurrentTransportState === "PLAYING",
        power: transportRes.CurrentTransportState === "PLAYING" ? "on" : "off",
      };
    } catch {
      return { power: "unknown", online: false };
    }
  }

  async execute(device: DeviceConfig, action: DeviceAction, params: Record<string, unknown> = {}): Promise<CommandResult> {
    switch (action) {
      case "power_on":
      case "media_play":
        await this.soap(device, "AVTransport", "Play", { InstanceID: 0, Speed: 1 });
        return { ok: true, message: `${device.name}: tocando.`, state: { power: "on", playing: true } };

      case "power_off":
      case "media_pause":
        await this.soap(device, "AVTransport", "Pause", { InstanceID: 0 });
        return { ok: true, message: `${device.name}: pausado.`, state: { power: "off", playing: false } };

      case "media_stop":
        await this.soap(device, "AVTransport", "Stop", { InstanceID: 0 });
        return { ok: true, message: `${device.name}: parado.`, state: { playing: false } };

      case "media_next":
        await this.soap(device, "AVTransport", "Next", { InstanceID: 0 });
        return { ok: true, message: `${device.name}: proxima faixa.` };

      case "media_prev":
        await this.soap(device, "AVTransport", "Previous", { InstanceID: 0 });
        return { ok: true, message: `${device.name}: faixa anterior.` };

      case "volume_set": {
        const amount = clamp(Number(params.amount ?? 30));
        await this.soap(device, "RenderingControl", "SetVolume", {
          InstanceID: 0,
          Channel: "Master",
          DesiredVolume: amount,
        });
        return { ok: true, message: `${device.name}: volume ${amount}.`, state: { volume: amount } };
      }

      case "volume_up":
      case "volume_down": {
        const current = await this.getState(device);
        const delta = Number(params.amount ?? 10) * (action === "volume_up" ? 1 : -1);
        const amount = clamp(Number(current.volume ?? 30) + delta);
        await this.soap(device, "RenderingControl", "SetVolume", {
          InstanceID: 0,
          Channel: "Master",
          DesiredVolume: amount,
        });
        return { ok: true, message: `${device.name}: volume ${amount}.`, state: { volume: amount } };
      }

      case "mute_toggle": {
        const current = await this.getState(device);
        const desired = current.muted ? 0 : 1;
        await this.soap(device, "RenderingControl", "SetMute", {
          InstanceID: 0,
          Channel: "Master",
          DesiredMute: desired,
        });
        return { ok: true, message: `${device.name}: ${desired ? "mudo" : "som ativado"}.`, state: { muted: !!desired } };
      }

      case "status": {
        const state = await this.getState(device);
        return { ok: true, message: `${device.name}: volume ${state.volume}, ${state.playing ? "tocando" : "parado"}`, state };
      }

      default:
        return { ok: false, message: `Acao "${action}" nao suportada por Sonos.` };
    }
  }

  private async soap(
    device: DeviceConfig,
    service: "RenderingControl" | "AVTransport",
    action: string,
    args: Record<string, string | number>
  ): Promise<Record<string, string>> {
    const path = service === "RenderingControl" ? "/MediaRenderer/RenderingControl/Control" : "/MediaRenderer/AVTransport/Control";
    const serviceType = `urn:schemas-upnp-org:service:${service}:1`;
    const argsXml = Object.entries(args)
      .map(([k, v]) => `<${k}>${v}</${k}>`)
      .join("");

    const body = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
<s:Body>
<u:${action} xmlns:u="${serviceType}">${argsXml}</u:${action}>
</s:Body>
</s:Envelope>`;

    const res = await fetch(`http://${this.host(device)}:${SONOS_PORT}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": 'text/xml; charset="utf-8"',
        SOAPACTION: `"${serviceType}#${action}"`,
      },
      body,
    });

    if (!res.ok) {
      throw new Error(`Sonos SOAP HTTP ${res.status} (${service}#${action})`);
    }

    const xml = await res.text();
    const result: Record<string, string> = {};
    for (const match of xml.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) {
      result[match[1]!] = match[2]!;
    }
    return result;
  }
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, n));
}
