import { get, set, del } from "idb-keyval";

const DB_PREFIX = "llm-gw:";

function k(key: string): string {
  return `${DB_PREFIX}${key}`;
}

export const kv = {
  get: <T>(key: string): Promise<T | undefined> => get<T>(k(key)),
  set: <T>(key: string, value: T): Promise<void> => set(k(key), value),
  del: (key: string): Promise<void> => del(k(key)),
};
