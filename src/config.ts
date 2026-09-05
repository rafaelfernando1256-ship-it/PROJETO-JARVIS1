import { readFileSync, existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "dotenv/config";
import type { DeviceConfig } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

export const PORT = Number(process.env.PORT ?? 3000);

const configuredPath = process.env.DEVICES_CONFIG_PATH
  ? path.resolve(projectRoot, process.env.DEVICES_CONFIG_PATH)
  : path.resolve(projectRoot, "config/devices.json");

const examplePath = path.resolve(projectRoot, "config/devices.example.json");

export function loadDeviceConfigs(): DeviceConfig[] {
  let sourcePath = configuredPath;

  if (!existsSync(sourcePath)) {
    if (existsSync(examplePath)) {
      copyFileSync(examplePath, sourcePath);
      // eslint-disable-next-line no-console
      console.warn(
        `[config] ${sourcePath} nao encontrado. Copiando config/devices.example.json como ponto de partida. ` +
          `Edite esse arquivo com os IPs/enderecos reais dos seus dispositivos.`
      );
    } else {
      return [];
    }
  }

  const raw = readFileSync(sourcePath, "utf-8");
  const parsed = JSON.parse(raw) as DeviceConfig[];
  return parsed;
}
