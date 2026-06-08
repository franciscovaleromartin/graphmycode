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

export interface SqlParseResult {
  tables: SqlTable[];
  views: SqlView[];
  procs: SqlProc[];
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

export const parseSql = (sql: string, _filePath: string): SqlParseResult => {
  const tables: SqlTable[] = [];
  const views: SqlView[] = [];
  const procs: SqlProc[] = [];

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

  return { tables, views, procs };
};
