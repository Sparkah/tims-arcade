export type SaveData = {
  version: number;
  bestScore: number;
  idle?: unknown;
  settings: {
    musicVolume: number;
    sfxVolume: number;
    reducedMotion: boolean;
  };
};

export type SaveSlot = 'slot-1' | 'slot-2' | 'slot-3';

const defaultSave: SaveData = {
  version: 1,
  bestScore: 0,
  settings: {
    musicVolume: 0.8,
    sfxVolume: 0.8,
    reducedMotion: false,
  },
};

type SaveEnvelope = {
  updatedAt: string;
  data: SaveData;
};

export class SaveManager {
  constructor(
    private readonly namespace: string,
    private readonly storage: Storage = localStorage,
  ) {}

  load(slot: SaveSlot = 'slot-1'): SaveData {
    const raw = this.storage.getItem(this.keyForSlot(slot));
    if (!raw) return this.createDefaultSave();

    try {
      const parsed = JSON.parse(raw) as Partial<SaveEnvelope> & Partial<SaveData>;
      const data = parsed.data ?? parsed;
      return this.migrate(data);
    } catch {
      return this.createDefaultSave();
    }
  }

  save(data: SaveData, slot: SaveSlot = 'slot-1'): void {
    const migrated = this.migrate(data);
    const envelope: SaveEnvelope = {
      updatedAt: new Date().toISOString(),
      data: migrated,
    };

    this.storage.setItem(this.keyForSlot(slot), JSON.stringify(envelope));
  }

  listSlots(): Array<{ slot: SaveSlot; updatedAt: string | undefined; data: SaveData | undefined }> {
    return this.slots.map((slot) => {
      const raw = this.storage.getItem(this.keyForSlot(slot));

      if (!raw) {
        return { slot, updatedAt: undefined, data: undefined };
      }

      try {
        const envelope = JSON.parse(raw) as Partial<SaveEnvelope>;
        return {
          slot,
          updatedAt: envelope.updatedAt,
          data: envelope.data ? this.migrate(envelope.data) : undefined,
        };
      } catch {
        return { slot, updatedAt: undefined, data: undefined };
      }
    });
  }

  reset(slot: SaveSlot = 'slot-1'): void {
    this.storage.removeItem(this.keyForSlot(slot));
  }

  private migrate(data: Partial<SaveData> | undefined): SaveData {
    return {
      ...this.createDefaultSave(),
      ...data,
      version: defaultSave.version,
      settings: {
        ...defaultSave.settings,
        ...data?.settings,
      },
    };
  }

  private createDefaultSave(): SaveData {
    return {
      ...defaultSave,
      settings: { ...defaultSave.settings },
    };
  }

  private keyForSlot(slot: SaveSlot): string {
    return `${this.namespace}:save:${slot}`;
  }

  private get slots(): SaveSlot[] {
    return ['slot-1', 'slot-2', 'slot-3'];
  }
}
