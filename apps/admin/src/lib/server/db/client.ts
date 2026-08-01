// ============================================================================
// D1 数据库访问层
// 所有表的操作都经过这里，统一错误处理和类型标注
// ============================================================================

export class DB {
  constructor(private d1: D1Database) {}

  get raw() {
    return this.d1;
  }

  /** 执行无返回值的写操作 */
  async exec(sql: string, ...params: (string | number | null)[]): Promise<void> {
    await this.d1.prepare(sql).bind(...params).run();
  }

  /** 查询单行 */
  async one<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): Promise<T | null> {
    const result = await this.d1.prepare(sql).bind(...params).first<T>();
    return result ?? null;
  }

  /** 查询多行 */
  async all<T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]): Promise<T[]> {
    const result = await this.d1.prepare(sql).bind(...params).all<T>();
    return result.results ?? [];
  }
}
