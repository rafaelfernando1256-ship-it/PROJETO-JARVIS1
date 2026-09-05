import mqtt, { type MqttClient } from "mqtt";
import type { CommandResult, DeviceAction, DeviceConfig, DeviceState, Driver } from "../types.js";

interface MqttOptions {
  brokerUrl: string;
  username?: string;
  password?: string;
  commandTopic?: string;
  stateTopic?: string;
  /** Payload customizado por acao. Suporta o placeholder {amount}. */
  payloads?: Partial<Record<DeviceAction, string>>;
}

const DEFAULT_PAYLOADS: Record<string, string> = {
  power_on: "ON",
  power_off: "OFF",
  power_toggle: "TOGGLE",
  volume_set: "{amount}",
  mute_toggle: "MUTE_TOGGLE",
};

/**
 * Driver generico para dispositivos controlados via MQTT (Tasmota, ESPHome, Zigbee2MQTT,
 * Home Assistant addons, etc). Publica no commandTopic e escuta o stateTopic.
 */
export class MqttDriver implements Driver {
  readonly type = "mqtt";
  private clients = new Map<string, MqttClient>();
  private lastState = new Map<string, DeviceState>();

  private options(device: DeviceConfig): MqttOptions {
    const opts = device.options as unknown as MqttOptions;
    if (!opts?.brokerUrl) {
      throw new Error(`Dispositivo "${device.name}" nao tem options.brokerUrl configurado`);
    }
    return opts;
  }

  async connect(device: DeviceConfig): Promise<void> {
    const opts = this.options(device);
    const client = mqtt.connect(opts.brokerUrl, {
      username: opts.username,
      password: opts.password,
      reconnectPeriod: 5000,
    });

    await new Promise<void>((resolve, reject) => {
      client.once("connect", () => resolve());
      client.once("error", (err) => reject(err));
    });

    if (opts.stateTopic) {
      client.subscribe(opts.stateTopic);
      client.on("message", (topic, payload) => {
        if (topic !== opts.stateTopic) return;
        const state = parsePayload(payload.toString());
        this.lastState.set(device.id, { ...this.lastState.get(device.id), ...state });
      });
    }

    this.clients.set(device.id, client);
    this.lastState.set(device.id, { power: "unknown" });
  }

  async disconnect(device: DeviceConfig): Promise<void> {
    this.clients.get(device.id)?.end();
    this.clients.delete(device.id);
  }

  onStateChange(device: DeviceConfig, callback: (state: DeviceState) => void): void {
    const client = this.clients.get(device.id);
    const opts = this.options(device);
    if (!client || !opts.stateTopic) return;
    client.on("message", (topic, payload) => {
      if (topic !== opts.stateTopic) return;
      callback(parsePayload(payload.toString()));
    });
  }

  async getState(device: DeviceConfig): Promise<DeviceState> {
    return this.lastState.get(device.id) ?? { power: "unknown" };
  }

  async execute(device: DeviceConfig, action: DeviceAction, params: Record<string, unknown> = {}): Promise<CommandResult> {
    const opts = this.options(device);
    const client = this.clients.get(device.id);
    if (!client || !opts.commandTopic) {
      return { ok: false, message: `Dispositivo "${device.name}" nao tem commandTopic configurado.` };
    }

    const template = opts.payloads?.[action] ?? DEFAULT_PAYLOADS[action];
    if (!template) {
      return { ok: false, message: `Acao "${action}" nao mapeada para payload MQTT.` };
    }

    const payload = template.replace("{amount}", String(params.amount ?? ""));
    client.publish(opts.commandTopic, payload);

    return { ok: true, message: `${device.name}: publicado "${payload}" em ${opts.commandTopic}.` };
  }
}

function parsePayload(raw: string): DeviceState {
  try {
    const json = JSON.parse(raw);
    if (json && typeof json === "object") return json as DeviceState;
  } catch {
    // payload nao-JSON (ex: "ON"/"OFF")
  }
  const upper = raw.toUpperCase();
  if (upper === "ON" || upper === "OFF") return { power: upper === "ON" ? "on" : "off" };
  const asNumber = Number(raw);
  if (!Number.isNaN(asNumber)) return { volume: asNumber };
  return {};
}
