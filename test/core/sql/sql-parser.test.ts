import { describe, it, expect } from 'vitest';
import { parseSql } from '../../../src/core/sql/sql-parser';

describe('parseSql', () => {
  it('extrae una tabla simple', () => {
    const sql = `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        name TEXT
      );
    `;
    const result = parseSql(sql, 'schema.sql');
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].name).toBe('users');
    expect(result.tables[0].columns).toHaveLength(3);
    expect(result.tables[0].columns[0].name).toBe('id');
    expect(result.tables[0].columns[1].name).toBe('email');
    expect(result.tables[0].columns[2].name).toBe('name');
  });

  it('extrae múltiples tablas', () => {
    const sql = `
      CREATE TABLE posts (id SERIAL PRIMARY KEY, title TEXT);
      CREATE TABLE comments (id SERIAL PRIMARY KEY, post_id INT);
    `;
    const result = parseSql(sql, 'schema.sql');
    expect(result.tables).toHaveLength(2);
    expect(result.tables.map(t => t.name)).toEqual(['posts', 'comments']);
  });

  it('extrae una vista', () => {
    const sql = `CREATE VIEW active_users AS SELECT * FROM users WHERE active = true;`;
    const result = parseSql(sql, 'schema.sql');
    expect(result.views).toHaveLength(1);
    expect(result.views[0].name).toBe('active_users');
  });

  it('extrae una función', () => {
    const sql = `CREATE FUNCTION get_user(p_id INT) RETURNS users AS $$ SELECT * FROM users WHERE id = p_id $$ LANGUAGE sql;`;
    const result = parseSql(sql, 'schema.sql');
    expect(result.procs).toHaveLength(1);
    expect(result.procs[0].name).toBe('get_user');
  });

  it('extrae foreign keys', () => {
    const sql = `
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        user_id INT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `;
    const result = parseSql(sql, 'schema.sql');
    expect(result.tables[0].foreignKeys).toHaveLength(1);
    expect(result.tables[0].foreignKeys[0].referencedTable).toBe('users');
  });

  it('maneja IF NOT EXISTS', () => {
    const sql = `CREATE TABLE IF NOT EXISTS settings (key TEXT, value TEXT);`;
    const result = parseSql(sql, 'schema.sql');
    expect(result.tables[0].name).toBe('settings');
  });

  it('maneja nombres entre comillas dobles', () => {
    const sql = `CREATE TABLE "user_profiles" ("id" SERIAL, "full_name" TEXT);`;
    const result = parseSql(sql, 'schema.sql');
    expect(result.tables[0].name).toBe('user_profiles');
    expect(result.tables[0].columns[0].name).toBe('id');
  });

  it('retorna vacío para SQL sin definiciones', () => {
    const sql = `SELECT * FROM users WHERE id = 1;`;
    const result = parseSql(sql, 'schema.sql');
    expect(result.tables).toHaveLength(0);
    expect(result.views).toHaveLength(0);
    expect(result.procs).toHaveLength(0);
  });
});
