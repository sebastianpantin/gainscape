export interface KeyedStore<Value, Saved = Value> {
  key(userId: string): string;
  read(storage: Storage | null, userId: string): Value;
  save(storage: Storage | null, userId: string, value: Saved): void;
  forget(storage: Storage | null, userId: string): void;
}

export function keyedStore<Value, Saved = Value>(
  keyPrefix: string,
  parse: (raw: string | null, userId: string) => Value,
  format: (value: Saved, userId: string) => unknown = (value) => value,
): KeyedStore<Value, Saved> {
  const key = (userId: string) => `${keyPrefix}${userId}`;
  return {
    key,
    read(storage, userId) {
      try {
        return parse(storage?.getItem(key(userId)) ?? null, userId);
      } catch {
        return parse(null, userId);
      }
    },
    save(storage, userId, value) {
      try {
        storage?.setItem(key(userId), JSON.stringify(format(value, userId)));
      } catch {
        return;
      }
    },
    forget(storage, userId) {
      try {
        storage?.removeItem(key(userId));
      } catch {
        return;
      }
    },
  };
}

export function deviceStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function tabStorage(): Storage | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}
