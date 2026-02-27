import { ExprHandle } from './NagaBuilder';

export class ScopeEnvironment {
  private readonly map = new Map<string, ExprHandle>();

  public constructor(private readonly parent: ScopeEnvironment | null = null) {}

  public set(id: string, handle: ExprHandle): void {
    this.map.set(id, handle);
  }

  public get(id: string): ExprHandle | undefined {
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
