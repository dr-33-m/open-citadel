export type SqlValue = string | number | null;

/** The four things the index asks of a database, so it runs on expo-sqlite in the app and on Node's SQLite in tests. */
export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  /** Runs `work` in one transaction: all of it lands, or none of it does. */
  transaction(work: (tx: SqlDriver) => Promise<void>): Promise<void>;
}
