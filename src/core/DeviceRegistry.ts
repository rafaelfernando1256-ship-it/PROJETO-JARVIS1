import { EventEmitter } from "node:events";
import type { DeviceConfig, DeviceState, DeviceAction, CommandResult } from "../types.js";
import { DriverRegistry } from "./DriverRegistry.js";
import { normalize, tokenize } from "../voice/textUtils.js";

export interface DeviceRecord {
  config: DeviceConfig;
  state: DeviceState;
}

export class DeviceRegistry extends EventEmitter {
  private devices = new Map<string, DeviceRecord>();

  constructor(private drivers: DriverRegistry) {
    super();
  }

  async loadAll(configs: DeviceConfig[]): Promise<void> {
    for (const config of configs) {
      this.devices.set(config.id, {
        config,
        state: { power: "unknown", online: false },
      });
    }

    await Promise.all(
      configs.map(async (config) => {
        const driver = this.drivers.get(config.driver);
        if (!driver) {
          console.warn(`[devices] driver "${config.driver}" nao encontrado para "${config.name}"`);
          return;
        }
        try {
          await driver.connect(config);
          const state = await driver.getState(config);
          this.setState(config.id, { ...state, online: true });
          driver.onStateChange?.(config, (patch) => this.setState(config.id, patch));
        } catch (err) {
          console.warn(`[devices] falha ao conectar "${config.name}": ${(err as Error).message}`);
          this.setState(config.id, { online: false });
        }
      })
    );
  }

  list(): DeviceRecord[] {
    return [...this.devices.values()];
  }

  get(id: string): DeviceRecord | undefined {
    return this.devices.get(id);
  }

  /** Encontra dispositivos por nome, apelido ou comodo (busca por tokens, sem acento). */
  find(query: string): DeviceRecord[] {
    const q = normalize(query);
    if (!q) return [];

    if (["tudo", "todos", "todas", "tudo da casa"].includes(q)) {
      return this.list();
    }

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const candidates = this.list().filter((record) => {
      const deviceTokens = new Set(
        [record.config.name, ...(record.config.aliases ?? []), record.config.room ?? ""].flatMap(
          (n) => tokenize(n)
        )
      );
      return queryTokens.every((t) => deviceTokens.has(t));
    });

    if (candidates.length > 0) return candidates;

    // fallback: pelo menos um token em comum (comandos tipo "tudo da sala")
    return this.list().filter((record) => {
      const deviceTokens = new Set(
        [record.config.name, ...(record.config.aliases ?? []), record.config.room ?? ""].flatMap(
          (n) => tokenize(n)
        )
      );
      return queryTokens.some((t) => deviceTokens.has(t));
    });
  }

  async execute(id: string, action: DeviceAction, params?: Record<string, unknown>): Promise<CommandResult> {
    const record = this.devices.get(id);
    if (!record) {
      return { ok: false, message: `Dispositivo "${id}" nao encontrado.` };
    }
    const driver = this.drivers.get(record.config.driver);
    if (!driver) {
      return { ok: false, message: `Driver "${record.config.driver}" nao disponivel.` };
    }

    try {
      const result = await driver.execute(record.config, action, params);
      if (result.state) {
        this.setState(id, result.state);
      }
      return result;
    } catch (err) {
      return { ok: false, message: `Erro ao executar comando: ${(err as Error).message}` };
    }
  }

  setState(id: string, patch: DeviceState): void {
    const record = this.devices.get(id);
    if (!record) return;
    record.state = { ...record.state, ...patch, lastUpdated: new Date().toISOString() };
    this.emit("state", { id, state: record.state });
  }
}
