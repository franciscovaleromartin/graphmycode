// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

export interface SqlColumn {
  name: string;
  definition: string;
  line: number;
}

export interface SqlForeignKey {
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
}

export interface SqlTable {
  name: string;
  columns: SqlColumn[];
  foreignKeys: SqlForeignKey[];
  line: number;
  content: string;
}

export interface SqlView {
  name: string;
  line: number;
  content: string;
}

export interface SqlProc {
  name: string;
  kind: 'FUNCTION' | 'PROCEDURE';
  line: number;
  content: string;
}

export interface SqlRow {
  tableName: string;
  columns: string[];
  values: string[];
  rowIndex: number;
  line: number;
  content: string;
}

export interface SqlParseResult {
  tables: SqlTable[];
  views: SqlView[];
  procs: SqlProc[];
  rows: SqlRow[];
}

const stripName = (raw: string): string =>
  raw.trim().replace(/^["'\`]|["'\`]$/g, '');

const getLineNumber = (sql: string, index: number): number =>
  sql.slice(0, index).split('\n').length - 1;

const extractTableBody = (sql: string, startIndex: number): string => {
  let depth = 0;
  let i = startIndex;
  let start = -1;
  while (i < sql.length) {
    if (sql[i] === '(') {
      if (depth === 0) start = i;
      depth++;
    } else if (sql[i] === ')') {
      depth--;
      if (depth === 0) return sql.slice(start + 1, i);
    }
    i++;
  }
  return '';
};

const parseColumns = (
  body: string,
  tableStartLine: number,
): { columns: SqlColumn[]; foreignKeys: SqlForeignKey[] } => {
  const columns: SqlColumn[] = [];
  const foreignKeys: SqlForeignKey[] = [];

  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  for (const part of parts) {
    const upper = part.toUpperCase().trim();
    if (!upper) continue;

    const fkMatch = part.match(
      /FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+["'\`]?(\w+)["'\`]?\s*(?:\(([^)]*)\))?/i,
    );
    if (fkMatch) {
      foreignKeys.push({
        columns: fkMatch[1].split(',').map(c => stripName(c)),
        referencedTable: stripName(fkMatch[2]),
        referencedColumns: fkMatch[3] ? fkMatch[3].split(',').map(c => stripName(c)) : [],
      });
      continue;
    }

    if (/^(PRIMARY\s+KEY|UNIQUE|CHECK|CONSTRAINT)/i.test(upper)) continue;

    const colMatch = part.match(/^["'\`]?(\w+)["'\`]?\s+(\S+)/);
    if (colMatch) {
      columns.push({
        name: stripName(colMatch[1]),
        definition: part.trim(),
        line: tableStartLine,
      });
    }
  }

  return { columns, foreignKeys };
};

// Extrae los valores de un par de paréntesis respetando strings y anidamiento
const extractTupleValues = (sql: string, start: number): { values: string[]; end: number } => {
  const values: string[] = [];
  let i = start + 1; // skip '('
  let current = '';
  let depth = 0;
  let inStr = false;
  let strChar = '';

  while (i < sql.length) {
    const ch = sql[i];
    if (inStr) {
      if (ch === strChar && sql[i - 1] !== '\\') inStr = false;
      current += ch;
    } else if (ch === "'" || ch === '"') {
      inStr = true;
      strChar = ch;
      current += ch;
    } else if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      if (depth === 0) {
        values.push(current.trim());
        return { values, end: i + 1 };
      }
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      values.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
    i++;
  }
  return { values, end: i };
};

// Límite para evitar saturar el grafo con ficheros de volcado muy grandes
const MAX_ROWS_PER_FILE = 20000;

const parseInserts = (sql: string): SqlRow[] => {
  const rows: SqlRow[] = [];
  // INSERT INTO `table` (col, ...) VALUES (...), (...);
  const headerRe = /INSERT\s+INTO\s+[`"]?(\w+)[`"]?\s*(?:\(([^)]*)\))?\s*VALUES\s*/gi;
  let match: RegExpExecArray | null;

  while ((match = headerRe.exec(sql)) !== null && rows.length < MAX_ROWS_PER_FILE) {
    const tableName = stripName(match[1]);
    const columns = match[2]
      ? match[2].split(',').map(c => stripName(c))
      : [];
    const line = getLineNumber(sql, match.index);

    let pos = headerRe.lastIndex;

    // Iterar sobre cada tupla de VALUES separadas por comas
    while (pos < sql.length && rows.length < MAX_ROWS_PER_FILE) {
      // Saltar espacios y comas entre tuplas
      while (pos < sql.length && /[\s,]/.test(sql[pos])) pos++;
      if (pos >= sql.length || sql[pos] !== '(') break;

      const { values, end } = extractTupleValues(sql, pos);
      pos = end;

      // Formatear contenido para embedding: "tabla: col=val, col=val"
      const pairs = values.map((v, idx) =>
        columns[idx] ? `${columns[idx]}=${v}` : v
      );
      const content = `${tableName}: ${pairs.join(', ')}`;

      // rows.length como rowIndex garantiza IDs únicos aunque cada INSERT tenga una sola fila
      rows.push({ tableName, columns, values, rowIndex: rows.length, line, content });

      // Saltar espacios; si lo siguiente es ';' o algo que no sea ',' ni '(' → fin del INSERT
      let lookahead = pos;
      while (lookahead < sql.length && /\s/.test(sql[lookahead])) lookahead++;
      if (sql[lookahead] !== ',') break;
    }

    headerRe.lastIndex = pos;
  }

  return rows;
};

export const parseSql = (sql: string, _filePath: string): SqlParseResult => {
  const tables: SqlTable[] = [];
  const views: SqlView[] = [];
  const procs: SqlProc[] = [];
  const rows: SqlRow[] = [];

  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'\`]?(\w+)["'\`]?\s*\(/gi;
  let match: RegExpExecArray | null;

  while ((match = tableRegex.exec(sql)) !== null) {
    const name = stripName(match[1]);
    const line = getLineNumber(sql, match.index);
    const body = extractTableBody(sql, match.index + match[0].length - 1);
    const content = sql.slice(match.index, match.index + match[0].length + body.length + 2);
    const { columns, foreignKeys } = parseColumns(body, line);
    tables.push({ name, columns, foreignKeys, line, content });
  }

  const viewRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+["'\`]?(\w+)["'\`]?\s+AS/gi;
  while ((match = viewRegex.exec(sql)) !== null) {
    const name = stripName(match[1]);
    const line = getLineNumber(sql, match.index);
    const rest = sql.slice(match.index);
    const end = rest.indexOf(';');
    const content = end !== -1 ? rest.slice(0, end + 1) : rest.slice(0, 500);
    views.push({ name, line, content });
  }

  const procRegex =
    /CREATE\s+(?:OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE)\s+["'\`]?(\w+)["'\`]?\s*\(/gi;
  while ((match = procRegex.exec(sql)) !== null) {
    const kind = match[1].toUpperCase() as 'FUNCTION' | 'PROCEDURE';
    const name = stripName(match[2]);
    const line = getLineNumber(sql, match.index);
    const rest = sql.slice(match.index);
    const end = rest.search(/\$\$\s*;|\blanguage\b[^;]+;/i);
    const content =
      end !== -1 ? rest.slice(0, end + 20).slice(0, 1000) : rest.slice(0, 500);
    procs.push({ name, kind, line, content });
  }

  rows.push(...parseInserts(sql));

  return { tables, views, procs, rows };
};
