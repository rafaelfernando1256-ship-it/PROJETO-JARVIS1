import type { CommandResult, DeviceAction, DeviceConfig, DeviceState, Driver } from "../types.js";

interface HttpEndpoint {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
}

interface HttpOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  endpoints: Partial<Record<DeviceAction, HttpEndpoint>>;
}

/**
 * Driver generico para dispositivos DIY/caseiros que expoem uma API REST simples
 * (ex: ESPHome, Tasmota em modo HTTP, microcontroladores customizados).
 * Configure em `options.endpoints` qual rota HTTP corresponde a cada acao.
 */
export class HttpDriver implements Driver {
  readonly type = "http";

  private options(device: DeviceConfig): HttpOptions {
    const opts = device.options as unknown as HttpOptions;
    if (!opts?.baseUrl) {
      throw new Error(`Dispositivo "${device.name}" nao tem options.baseUrl configurado`);
    }
    return opts;
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async getState(device: DeviceConfig): Promise<DeviceState> {
    const opts = this.options(device);
    const endpoint = opts.endpoints.status;
    if (!endpoint) return { power: "unknown" };
    const data = await this.call(opts, endpoint, {});
    return normalizeStateResponse(data);
  }

  async execute(device: DeviceConfig, action: DeviceAction, params: Record<string, unknown> = {}): Promise<CommandResult> {
    const opts = this.options(device);
    const endpoint = opts.endpoints[action];
    if (!endpoint) {
      return { ok: false, message: `Acao "${action}" nao configurada para "${device.name}".` };
    }

    const data = await this.call(opts, endpoint, params);
    return { ok: true, message: `${device.name}: comando enviado.`, state: normalizeStateResponse(data) };
  }

  private async call(opts: HttpOptions, endpoint: HttpEndpoint, params: Record<string, unknown>): Promise<unknown> {
    const path = interpolate(endpoint.path, params);
    const url = new URL(path, opts.baseUrl).toString();
    const method = endpoint.method ?? "GET";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
      body: method === "GET" ? undefined : JSON.stringify({ ...endpoint.body, ...params }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ao chamar ${url}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    return contentType.includes("application/json") ? response.json() : response.text();
  }
}

function interpolate(path: string, params: Record<string, unknown>): string {
  return path.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ""));
}

function normalizeStateResponse(data: unknown): DeviceState {
  if (data && typeof data === "object") {
    return data as DeviceState;
  }
  return {};
}
