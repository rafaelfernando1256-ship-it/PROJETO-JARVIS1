import type { CommandResult, DeviceAction, DeviceConfig, DeviceState, Driver } from "../types.js";

interface BluetoothOptions {
  /** UUID do servico GATT usado para enviar comandos (necessario para volume/media). */
  serviceUuid?: string;
  /** UUID da characteristic GATT onde os comandos sao escritos. */
  characteristicUuid?: string;
  /** Bytes (0-255) a escrever na characteristic para cada acao, em hexadecimal ou decimal. */
  commands?: Partial<Record<DeviceAction, number[]>>;
}

interface Connected {
  peripheral: any;
  characteristic?: any;
}

/**
 * Driver Bluetooth LE generico usando @abandonware/noble. So funciona rodando numa maquina
 * com adaptador Bluetooth real (ex: Raspberry Pi, PC com dongle BLE) e com o pacote nativo
 * instalado (`npm install @abandonware/noble`, que exige libbluetooth/BlueZ no Linux).
 *
 * Como o protocolo de comandos (volume, play/pause, etc) varia por fabricante, "ligar" e
 * "desligar" mapeiam para conectar/desconectar via GATT, e as demais acoes escrevem bytes
 * configurados em options.commands na characteristic indicada.
 */
export class BluetoothDriver implements Driver {
  readonly type = "bluetooth";
  private connected = new Map<string, Connected>();
  private noblePromise: Promise<any> | null = null;

  private async noble(): Promise<any> {
    if (!this.noblePromise) {
      this.noblePromise = import("@abandonware/noble")
        .then((m) => m.default ?? m)
        .catch((err) => {
          this.noblePromise = null;
          throw new Error(
            "@abandonware/noble nao esta instalado ou nao pode ser carregado. " +
              "Instale com `npm install @abandonware/noble` numa maquina com Bluetooth real " +
              `(erro original: ${(err as Error).message})`
          );
        });
    }
    return this.noblePromise;
  }

  async connect(): Promise<void> {
    // Conexao real acontece sob demanda em execute("power_on"), pois BLE exige scan ativo.
  }

  async disconnect(device: DeviceConfig): Promise<void> {
    const conn = this.connected.get(device.id);
    if (conn) {
      await conn.peripheral.disconnectAsync();
      this.connected.delete(device.id);
    }
  }

  async getState(device: DeviceConfig): Promise<DeviceState> {
    return { power: this.connected.has(device.id) ? "on" : "off" };
  }

  private async findPeripheral(noble: any, address: string, timeoutMs = 15000): Promise<any> {
    const target = address.toLowerCase().replace(/:/g, "");
    await noble.startScanningAsync([], false);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        noble.stopScanningAsync().catch(() => {});
        reject(new Error(`Dispositivo Bluetooth ${address} nao encontrado em ${timeoutMs}ms`));
      }, timeoutMs);

      const onDiscover = (peripheral: any) => {
        if (peripheral.address?.toLowerCase().replace(/:/g, "") === target) {
          clearTimeout(timeout);
          noble.removeListener("discover", onDiscover);
          noble.stopScanningAsync().catch(() => {});
          resolve(peripheral);
        }
      };

      noble.on("discover", onDiscover);
    });
  }

  private options(device: DeviceConfig): BluetoothOptions {
    return (device.options as unknown as BluetoothOptions) ?? {};
  }

  private async ensureConnected(device: DeviceConfig): Promise<Connected> {
    const existing = this.connected.get(device.id);
    if (existing) return existing;

    if (!device.address) throw new Error(`Dispositivo "${device.name}" sem endereco Bluetooth (MAC) configurado`);

    const noble = await this.noble();
    const peripheral = await this.findPeripheral(noble, device.address);
    await peripheral.connectAsync();

    const conn: Connected = { peripheral };
    const opts = this.options(device);

    if (opts.serviceUuid && opts.characteristicUuid) {
      const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [opts.serviceUuid],
        [opts.characteristicUuid]
      );
      conn.characteristic = characteristics[0];
    }

    peripheral.once("disconnect", () => this.connected.delete(device.id));
    this.connected.set(device.id, conn);
    return conn;
  }

  async execute(device: DeviceConfig, action: DeviceAction): Promise<CommandResult> {
    if (action === "power_on") {
      await this.ensureConnected(device);
      return { ok: true, message: `${device.name}: conectado via Bluetooth.`, state: { power: "on" } };
    }

    if (action === "power_off") {
      await this.disconnect(device);
      return { ok: true, message: `${device.name}: desconectado.`, state: { power: "off" } };
    }

    if (action === "status") {
      const state = await this.getState(device);
      return { ok: true, message: `${device.name}: ${state.power}`, state };
    }

    const opts = this.options(device);
    const bytes = opts.commands?.[action];
    if (!bytes) {
      return {
        ok: false,
        message: `Acao "${action}" nao configurada em options.commands para "${device.name}".`,
      };
    }

    const conn = await this.ensureConnected(device);
    if (!conn.characteristic) {
      return {
        ok: false,
        message: `Configure options.serviceUuid/characteristicUuid para enviar comandos a "${device.name}".`,
      };
    }

    await conn.characteristic.writeAsync(Buffer.from(bytes), false);
    return { ok: true, message: `${device.name}: comando "${action}" enviado via Bluetooth.` };
  }
}
