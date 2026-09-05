import type { Driver } from "../types.js";

export class DriverRegistry {
  private drivers = new Map<string, Driver>();

  register(driver: Driver): void {
    this.drivers.set(driver.type, driver);
  }

  get(type: string): Driver | undefined {
    return this.drivers.get(type);
  }

  list(): string[] {
    return [...this.drivers.keys()];
  }
}
