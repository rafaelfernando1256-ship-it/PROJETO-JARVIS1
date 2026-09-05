import type { CommandResult, DeviceAction, DeviceConfig, DeviceState, Driver } from "../types.js";

/**
 * Driver simulado em memoria. Util para testar o fluxo completo (voz -> comando -> estado ->
 * WebSocket -> UI) antes de ter hardware real configurado.
 */
export class MockDriver implements Driver {
  readonly type = "mock";
  private states = new Map<string, DeviceState>();

  async connect(device: DeviceConfig): Promise<void> {
    this.states.set(device.id, { power: "off", volume: 30, muted: false, brightness: 100 });
  }

  async disconnect(): Promise<void> {}

  async getState(device: DeviceConfig): Promise<DeviceState> {
    return this.states.get(device.id) ?? { power: "unknown" };
  }

  async execute(device: DeviceConfig, action: DeviceAction, params?: Record<string, unknown>): Promise<CommandResult> {
    const state = { ...(this.states.get(device.id) ?? {}) };

    switch (action) {
      case "power_on":
        state.power = "on";
        break;
      case "power_off":
        state.power = "off";
        break;
      case "power_toggle":
        state.power = state.power === "on" ? "off" : "on";
        break;
      case "volume_set":
        state.volume = clamp(Number(params?.amount ?? state.volume ?? 0));
        break;
      case "volume_up":
        state.volume = clamp(Number(state.volume ?? 0) + Number(params?.amount ?? 10));
        break;
      case "volume_down":
        state.volume = clamp(Number(state.volume ?? 0) - Number(params?.amount ?? 10));
        break;
      case "mute_toggle":
        state.muted = !state.muted;
        break;
      case "status":
        break;
      default:
        return { ok: false, message: `Acao "${action}" nao suportada por dispositivos simulados.` };
    }

    this.states.set(device.id, state);
    return { ok: true, message: `${device.name}: ${describe(action, state)}`, state };
  }
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, n));
}

function describe(action: DeviceAction, state: DeviceState): string {
  switch (action) {
    case "power_on":
      return "ligado";
    case "power_off":
      return "desligado";
    case "power_toggle":
      return state.power === "on" ? "ligado" : "desligado";
    case "volume_set":
    case "volume_up":
    case "volume_down":
      return `volume em ${state.volume}`;
    case "mute_toggle":
      return state.muted ? "mudo" : "som ativado";
    default:
      return JSON.stringify(state);
  }
}
