import type { DeviceAction, CommandResult } from "../types.js";
import type { DeviceRegistry } from "./DeviceRegistry.js";
import { parseIntent } from "../voice/intentParser.js";

export interface RoutedResult extends CommandResult {
  deviceName?: string;
}

export class CommandRouter {
  constructor(private devices: DeviceRegistry) {}

  async handleText(text: string): Promise<RoutedResult[]> {
    const intent = parseIntent(text);

    if (intent.action === "unknown") {
      return [
        {
          ok: false,
          message:
            "Nao entendi o comando. Tente algo como 'liga a tv da sala' ou 'aumenta o volume da caixa de som'.",
        },
      ];
    }

    if (!intent.targetQuery) {
      return [{ ok: false, message: "Diga qual dispositivo (ex: 'a tv da sala')." }];
    }

    const matches = this.devices.find(intent.targetQuery);

    if (matches.length === 0) {
      return [
        {
          ok: false,
          message: `Nenhum dispositivo encontrado para "${intent.targetQuery}".`,
        },
      ];
    }

    const action = intent.action as DeviceAction;
    const params = intent.amount !== undefined ? { amount: intent.amount } : undefined;

    const results = await Promise.all(
      matches.map(async (record) => {
        const result = await this.devices.execute(record.config.id, action, params);
        return { ...result, deviceName: record.config.name };
      })
    );

    return results;
  }
}
