// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import { KnowledgeGraph } from '../graph/types';
import { generateId } from '../../lib/utils';
import { parseSql } from '../sql/sql-parser';

export const processSql = (
  graph: KnowledgeGraph,
  files: { path: string; content: string }[],
): void => {
  const sqlFiles = files.filter(f => f.path.toLowerCase().endsWith('.sql'));

  for (const file of sqlFiles) {
    const result = parseSql(file.content, file.path);
    const fileId = generateId('File', file.path);

    for (const table of result.tables) {
      const tableId = generateId('SqlTable', `${file.path}:${table.name}`);

      graph.addNode({
        id: tableId,
        label: 'SqlTable' as any,
        properties: {
          name: table.name,
          filePath: file.path,
          startLine: table.line,
          endLine: table.line,
          content: table.content.slice(0, 1000),
        },
      });

      graph.addRelationship({
        id: generateId('DEFINES', `${fileId}->${tableId}`),
        sourceId: fileId,
        targetId: tableId,
        type: 'DEFINES',
        confidence: 1.0,
        reason: '',
      });

      for (const col of table.columns) {
        const colId = generateId('SqlColumn', `${file.path}:${table.name}.${col.name}`);

        graph.addNode({
          id: colId,
          label: 'SqlColumn' as any,
          properties: {
            name: col.name,
            filePath: file.path,
            startLine: col.line,
            endLine: col.line,
            content: col.definition.slice(0, 200),
          },
        });

        graph.addRelationship({
          id: generateId('CONTAINS', `${tableId}->${colId}`),
          sourceId: tableId,
          targetId: colId,
          type: 'CONTAINS',
          confidence: 1.0,
          reason: '',
        });
      }

      for (const fk of table.foreignKeys) {
        const referencedTableId = generateId('SqlTable', `${file.path}:${fk.referencedTable}`);
        const exists = graph.nodes.some(n => n.id === referencedTableId);
        if (exists) {
          graph.addRelationship({
            id: generateId('USES', `${tableId}->${referencedTableId}`),
            sourceId: tableId,
            targetId: referencedTableId,
            type: 'USES',
            confidence: 1.0,
            reason: `FOREIGN KEY references ${fk.referencedTable}`,
          });
        }
      }
    }

    for (const row of result.rows) {
      const tableId = generateId('SqlTable', `${file.path}:${row.tableName}`);
      const tableExists = graph.nodes.some(n => n.id === tableId);
      if (!tableExists) continue;

      const rowId = generateId('SqlRow', `${file.path}:${row.tableName}[${row.rowIndex}]`);

      graph.addNode({
        id: rowId,
        label: 'SqlRow' as any,
        properties: {
          name: `${row.tableName}[${row.rowIndex}]`,
          filePath: file.path,
          startLine: row.line,
          endLine: row.line,
          content: row.content.slice(0, 500),
        },
      });

      graph.addRelationship({
        id: generateId('CONTAINS', `${tableId}->${rowId}`),
        sourceId: tableId,
        targetId: rowId,
        type: 'CONTAINS',
        confidence: 1.0,
        reason: '',
      });
    }

    for (const view of result.views) {
      const viewId = generateId('SqlView', `${file.path}:${view.name}`);
      graph.addNode({
        id: viewId,
        label: 'SqlView' as any,
        properties: {
          name: view.name,
          filePath: file.path,
          startLine: view.line,
          endLine: view.line,
          content: view.content.slice(0, 500),
        },
      });
      graph.addRelationship({
        id: generateId('DEFINES', `${fileId}->${viewId}`),
        sourceId: fileId,
        targetId: viewId,
        type: 'DEFINES',
        confidence: 1.0,
        reason: '',
      });
    }

    for (const proc of result.procs) {
      const procId = generateId('SqlProc', `${file.path}:${proc.name}`);
      graph.addNode({
        id: procId,
        label: 'SqlProc' as any,
        properties: {
          name: proc.name,
          filePath: file.path,
          startLine: proc.line,
          endLine: proc.line,
          content: proc.content.slice(0, 500),
        },
      });
      graph.addRelationship({
        id: generateId('DEFINES', `${fileId}->${procId}`),
        sourceId: fileId,
        targetId: procId,
        type: 'DEFINES',
        confidence: 1.0,
        reason: '',
      });
    }
  }
};
