/** Storage-only baseline shared by Room and Directory; never grants authority. */
export function initializeServiceSchema(storage: DurableObjectStorage): void {
  storage.transactionSync(() => {
    storage.sql.exec('CREATE TABLE IF NOT EXISTS service_schema (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), version INTEGER NOT NULL)');
    storage.sql.exec('INSERT OR IGNORE INTO service_schema VALUES (1, 1)');
    const { version } = storage.sql.exec<{ version: number }>('SELECT version FROM service_schema WHERE singleton = 1').one();
    if (version !== 1) throw Error('unsupported-schema');
  });
}
