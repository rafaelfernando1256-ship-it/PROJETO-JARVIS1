import { PORT, loadDeviceConfigs } from "./config.js";
import { DriverRegistry } from "./core/DriverRegistry.js";
import { DeviceRegistry } from "./core/DeviceRegistry.js";
import { CommandRouter } from "./core/CommandRouter.js";
import { createApp } from "./api/server.js";

import { MockDriver } from "./drivers/MockDriver.js";
import { HttpDriver } from "./drivers/HttpDriver.js";
import { MqttDriver } from "./drivers/MqttDriver.js";
import { TpLinkKasaDriver } from "./drivers/TpLinkKasaDriver.js";
import { RokuDriver } from "./drivers/RokuDriver.js";
import { SonosDriver } from "./drivers/SonosDriver.js";
import { LgWebOsDriver } from "./drivers/LgWebOsDriver.js";
import { SamsungTizenDriver } from "./drivers/SamsungTizenDriver.js";
import { BluetoothDriver } from "./drivers/BluetoothDriver.js";

async function main() {
  const drivers = new DriverRegistry();
  drivers.register(new MockDriver());
  drivers.register(new HttpDriver());
  drivers.register(new MqttDriver());
  drivers.register(new TpLinkKasaDriver());
  drivers.register(new RokuDriver());
  drivers.register(new SonosDriver());
  drivers.register(new LgWebOsDriver());
  drivers.register(new SamsungTizenDriver());
  drivers.register(new BluetoothDriver());

  const devices = new DeviceRegistry(drivers);
  const configs = loadDeviceConfigs();

  if (configs.length === 0) {
    console.warn(
      "[jarvis] Nenhum dispositivo configurado. Copie config/devices.example.json para " +
        "config/devices.json e edite com os enderecos reais da sua casa."
    );
  }

  await devices.loadAll(configs);

  const router = new CommandRouter(devices);
  const server = createApp(devices, router);

  server.listen(PORT, () => {
    console.log(`[jarvis] rodando em http://localhost:${PORT}`);
    console.log(`[jarvis] drivers disponiveis: ${drivers.list().join(", ")}`);
    console.log(`[jarvis] dispositivos carregados: ${devices.list().length}`);
  });
}

main().catch((err) => {
  console.error("[jarvis] falha ao iniciar:", err);
  process.exit(1);
});
