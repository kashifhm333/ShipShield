import { ScannerId } from '@shipshield/contracts';
import { ScannerAdapter } from './adapter.interface.js';

export class AdapterRegistry {
  private readonly adapters = new Map<ScannerId, ScannerAdapter>();

  public register(adapter: ScannerAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  public get(id: ScannerId): ScannerAdapter | undefined {
    return this.adapters.get(id);
  }

  public getAll(): ScannerAdapter[] {
    return Array.from(this.adapters.values());
  }

  public has(id: ScannerId): boolean {
    return this.adapters.has(id);
  }
}
