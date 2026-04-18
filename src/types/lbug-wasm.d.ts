// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

declare module '@ladybugdb/wasm-core' {
  export function init(): Promise<void>;
  export class Database {
    constructor(path: string, bufferPoolSize?: number);
    close(): Promise<void>;
  }
  export class Connection {
    constructor(db: Database);
    query(cypher: string): Promise<QueryResult>;
    prepare(cypher: string): Promise<PreparedStatement>;
    execute(stmt: PreparedStatement, params?: Record<string, any>): Promise<QueryResult>;
    close(): Promise<void>;
  }
  export interface QueryResult {
    getAll(): Promise<any[]>;
    getAllRows(): Promise<any[]>;
    hasNext(): Promise<boolean>;
    getNext(): Promise<any>;
  }
  export interface PreparedStatement {
    isSuccess(): boolean;
    getErrorMessage(): Promise<string>;
    close(): Promise<void>;
  }
  export const FS: {
    writeFile(path: string, data: string): Promise<void>;
    unlink(path: string): Promise<void>;
  };
  const lbug: {
    init: typeof init;
    Database: typeof Database;
    Connection: typeof Connection;
    FS: typeof FS;
  };
  export default lbug;
}
