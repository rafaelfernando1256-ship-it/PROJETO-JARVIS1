import { test } from "node:test";
import assert from "node:assert/strict";
import { DriverRegistry } from "../src/core/DriverRegistry.js";
import { DeviceRegistry } from "../src/core/DeviceRegistry.js";
import { CommandRouter } from "../src/core/CommandRouter.js";
import { MockDriver } from "../src/drivers/MockDriver.js";
import type { DeviceConfig } from "../src/types.js";

const CONFIGS: DeviceConfig[] = [
  {
    id: "tv-sala",
    name: "TV da Sala",
    aliases: ["televisao da sala"],
    room: "sala",
    driver: "mock",
    capabilities: ["power", "volume"],
  },
  {
    id: "luz-cozinha",
    name: "Luz da Cozinha",
    room: "cozinha",
    driver: "mock",
    capabilities: ["power"],
  },
];

async function setup() {
  const drivers = new DriverRegistry();
  drivers.register(new MockDriver());
  const devices = new DeviceRegistry(drivers);
  await devices.loadAll(CONFIGS);
  return { devices, router: new CommandRouter(devices) };
}

test("find() localiza dispositivo por nome parcial", async () => {
  const { devices } = await setup();
  const matches = devices.find("tv da sala");
  assert.equal(matches.length, 1);
  assert.equal(matches[0]!.config.id, "tv-sala");
});

test("find() localiza por comodo", async () => {
  const { devices } = await setup();
  const matches = devices.find("cozinha");
  assert.equal(matches.length, 1);
  assert.equal(matches[0]!.config.id, "luz-cozinha");
});

test("find('tudo') retorna todos os dispositivos", async () => {
  const { devices } = await setup();
  assert.equal(devices.find("tudo").length, 2);
});

test("CommandRouter liga a tv da sala de ponta a ponta", async () => {
  const { devices, router } = await setup();
  const results = await router.handleText("liga a tv da sala");
  assert.equal(results.length, 1);
  assert.equal(results[0]!.ok, true);
  assert.equal(devices.get("tv-sala")!.state.power, "on");
});

test("CommandRouter avisa quando nenhum dispositivo e encontrado", async () => {
  const { router } = await setup();
  const results = await router.handleText("liga o forno");
  assert.equal(results[0]!.ok, false);
});
