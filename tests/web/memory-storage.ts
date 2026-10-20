export class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }
}

export function throwingStorage(...methods: ('getItem' | 'setItem' | 'removeItem')[]): MemoryStorage {
  const storage = new MemoryStorage();
  for (const method of methods) {
    storage[method] = () => {
      throw new Error('blocked');
    };
  }
  return storage;
}
