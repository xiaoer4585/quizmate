declare module 'electron-store' {
  export default class Store<T extends Record<string, any> = Record<string, any>> {
    constructor(options?: { name?: string; defaults?: Partial<T> });
    get<K extends keyof T>(key: K): T[K];
    set<K extends keyof T>(key: K, value: T[K]): void;
    delete<K extends keyof T>(key: K): void;
  }
}
