export type DeviceCapability =
  | "power"
  | "volume"
  | "mute"
  | "input"
  | "media"
  | "brightness"
  | "color";

export type DeviceAction =
  | "power_on"
  | "power_off"
  | "power_toggle"
  | "volume_set"
  | "volume_up"
  | "volume_down"
  | "mute_toggle"
  | "input_set"
  | "media_play"
  | "media_pause"
  | "media_stop"
  | "media_next"
  | "media_prev"
  | "status";

export interface DeviceState {
  power?: "on" | "off" | "unknown";
  volume?: number;
  muted?: boolean;
  input?: string;
  brightness?: number;
  playing?: boolean;
  lastUpdated?: string;
  online?: boolean;
  [key: string]: unknown;
}

export interface DeviceConfig {
  id: string;
  name: string;
  aliases?: string[];
  room?: string;
  driver: string;
  capabilities: DeviceCapability[];
  address?: string;
  options?: Record<string, unknown>;
}

export interface CommandResult {
  ok: boolean;
  message: string;
  state?: DeviceState;
}

export interface Driver {
  readonly type: string;
  connect(device: DeviceConfig): Promise<void>;
  disconnect(device: DeviceConfig): Promise<void>;
  getState(device: DeviceConfig): Promise<DeviceState>;
  execute(
    device: DeviceConfig,
    action: DeviceAction,
    params?: Record<string, unknown>
  ): Promise<CommandResult>;
  /** Drivers orientados a evento (ex: MQTT) podem empurrar mudancas de estado assincronas. */
  onStateChange?(device: DeviceConfig, callback: (state: DeviceState) => void): void;
}

export interface ParsedIntent {
  action: DeviceAction | "unknown";
  targetQuery: string | null;
  amount?: number;
  raw: string;
}
