// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { useMemo } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileCode } from '@/lib/lucide-icons';
import { NODE_COLORS } from '../lib/constants';
import { COMPATIBLE_EXTENSIONS } from '../lib/codeflow/types';
import type { GraphNode } from 'gitnexus-shared';

const JUNK_SEGMENTS = new Set([
  '__MACOSX', '.DS_Store', '.localized', 'Thumbs.db', 'desktop.ini',
  '.Spotlight-V100', '.Trashes', '.fseventsd',
]);

function isJunkPath(filePath: string): boolean {
  return filePath.split('/').some(
    seg => JUNK_SEGMENTS.has(seg) || seg.startsWith('._'),
  );
}

interface TreeNode {
  id: string;
  name: string;
  type: 'folder' | 'file';
  path: string;
  filePath?: string;
  children: TreeNode[];
}

function buildTree(files: GraphNode[]): TreeNode[] {
  const root: TreeNode[] = [];
  const pathMap = new Map<string, TreeNode>();

  const sorted = [...files].sort((a, b) =>
    a.properties.filePath.localeCompare(b.properties.filePath),
  );

  for (const file of sorted) {
    const parts = file.properties.filePath.split('/').filter(Boolean);
    let currentLevel = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;

      let node = pathMap.get(currentPath);
      if (!node) {
        node = {
          id: isLast ? file.id : currentPath,
          name: part,
          type: isLast ? 'file' : 'folder',
          path: currentPath,
          filePath: isLast ? file.properties.filePath : undefined,
          children: [],
        };
        pathMap.set(currentPath, node);
        currentLevel.push(node);
      }
      currentLevel = node.children;
    }
  }

  return root;
}

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (filePath: string) => void;
}

const TreeItem = ({ node, depth, selectedPath, expandedPaths, onToggle, onSelect }: TreeItemProps) => {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.filePath;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          if (node.type === 'folder') {
            onToggle(node.path);
          } else if (node.filePath) {
            onSelect(node.filePath);
          }
        }}
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-hover ${
          isSelected
            ? 'border-l-2 border-accent bg-accent/15 text-accent'
            : 'border-l-2 border-transparent text-text-secondary hover:text-text-primary'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        {node.type === 'folder' ? (
          isExpanded ? (
            <FolderOpen className="h-4 w-4 shrink-0" style={{ color: NODE_COLORS.Folder }} />
          ) : (
            <Folder className="h-4 w-4 shrink-0" style={{ color: NODE_COLORS.Folder }} />
          )
        ) : (
          <FileCode className="h-4 w-4 shrink-0" style={{ color: NODE_COLORS.File }} />
        )}
        <span className="truncate font-mono">{node.name}</span>
      </button>
      {isExpanded && (
        <div>
          {node.children.map(child => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface CodeFlowExplorerProps {
  files: GraphNode[];
  selectedFilePath: string | null;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onFileSelect: (filePath: string) => void;
}

export const CodeFlowExplorer = ({
  files,
  selectedFilePath,
  expandedPaths,
  onToggle,
  onFileSelect,
}: CodeFlowExplorerProps) => {
  const compatibleFiles = useMemo(
    () =>
      files.filter(
        n =>
          COMPATIBLE_EXTENSIONS.some(ext => n.properties.filePath.endsWith(ext)) &&
          !isJunkPath(n.properties.filePath),
      ),
    [files],
  );

  const tree = useMemo(() => buildTree(compatibleFiles), [compatibleFiles]);

  if (compatibleFiles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="text-sm text-text-muted">
          No se encontraron archivos compatibles con Code Flow en este proyecto
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border-subtle px-4 py-3">
        <p className="text-xs text-text-muted">
          {compatibleFiles.length} archivo{compatibleFiles.length !== 1 ? 's' : ''} compatible{compatibleFiles.length !== 1 ? 's' : ''}
          <span className="ml-1 text-text-muted/60">(.js .ts .jsx .tsx .py)</span>
        </p>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {tree.map(node => (
          <TreeItem
            key={node.id}
            node={node}
            depth={0}
            selectedPath={selectedFilePath}
            expandedPaths={expandedPaths}
            onToggle={onToggle}
            onSelect={onFileSelect}
          />
        ))}
      </div>
    </div>
  );
};
