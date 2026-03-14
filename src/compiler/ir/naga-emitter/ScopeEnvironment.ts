export class ScopeEnvironment<T> {
  private readonly map = new Map<string, T>();

  public constructor(private readonly parent: ScopeEnvironment<T> | null = null) {}

  public createChild(): ScopeEnvironment<T> {
    return new ScopeEnvironment<T>(this);
  }

  public set(id: string, value: T): void {
    this.map.set(id, value);
  }

  public get(id: string): T | undefined {
    const local = this.map.get(id);
    if (local !== undefined) {
      return local;
    }
    if (this.parent !== null) {
      return this.parent.get(id);
    }
    return undefined;
  }
}
