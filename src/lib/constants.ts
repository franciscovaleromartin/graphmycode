// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { NodeLabel } from 'gitnexus-shared';

// Node colors by type - vivid Tailwind-400 palette over dark background (entramado.org style)
export const NODE_COLORS: Record<NodeLabel, string> = {
  Project: '#a78bfa', // Violet - prominent
  Package: '#c4b5fd', // Violet light
  Module: '#8b5cf6', // Violet darker
  Folder: '#818cf8', // Indigo
  File: '#38bdf8', // Sky
  Class: '#fbbf24', // Amber - stands out
  Function: '#34d399', // Emerald
  Method: '#2dd4bf', // Teal
  Variable: '#94a3b8', // Slate - muted (less important)
  Interface: '#f472b6', // Pink
  Enum: '#fb923c', // Orange
  Decorator: '#fcd34d', // Yellow
  Import: '#64748b', // Slate darker - very muted
  Type: '#a5b4fc', // Indigo light
  CodeElement: '#94a3b8', // Slate - muted
  Community: '#818cf8', // Indigo light - cluster indicator
  Process: '#fb7185', // Rose - execution flow indicator
  Section: '#7dd3fc', // Sky light - structural section
  Struct: '#fbbf24', // Amber - like Class
  Trait: '#f472b6', // Pink - like Interface
  Impl: '#2dd4bf', // Teal - like Method
  TypeAlias: '#a5b4fc', // Indigo light - like Type
  Const: '#94a3b8', // Slate - like Variable
  Static: '#94a3b8', // Slate - like Variable
  Namespace: '#8b5cf6', // Violet - like Module
  Union: '#fb923c', // Orange - like Enum
  Typedef: '#a5b4fc', // Indigo light - like Type
  Macro: '#fcd34d', // Yellow - like Decorator
  Property: '#94a3b8', // Slate - like Variable
  Record: '#fbbf24', // Amber - like Class
  Delegate: '#2dd4bf', // Teal - like Method
  Annotation: '#fcd34d', // Yellow - like Decorator
  Constructor: '#34d399', // Emerald - like Function
  Template: '#a5b4fc', // Indigo light - like Type
  Route: '#fb7185', // Rose - like Process
  Tool: '#a78bfa', // Violet - like Project
};

// Node sizes by type - clear visual hierarchy with dramatic size differences
// Structural nodes are MUCH larger to make hierarchy obvious
export const NODE_SIZES: Record<NodeLabel, number> = {
  Project: 20, // Largest - root of everything
  Package: 16, // Major structural element
  Module: 13, // Important container
  Folder: 10, // Structural - clearly bigger than files
  File: 6, // Common element - smaller than folders
  Class: 8, // Important code structure
  Function: 4, // Common code element - small
  Method: 3, // Smaller than function
  Variable: 2, // Tiny - leaf node
  Interface: 7, // Important type definition
  Enum: 5, // Type definition
  Decorator: 2, // Tiny modifier
  Import: 1.5, // Very small - usually hidden anyway
  Type: 3, // Type alias - small
  CodeElement: 2, // Generic small
  Community: 0, // Hidden by default - metadata node
  Process: 0, // Hidden by default - metadata node
  Section: 8, // Structural section - similar to Folder
  Struct: 8, // Like Class
  Trait: 7, // Like Interface
  Impl: 3, // Like Method
  TypeAlias: 3, // Like Type
  Const: 2, // Like Variable
  Static: 2, // Like Variable
  Namespace: 13, // Like Module
  Union: 5, // Like Enum
  Typedef: 3, // Like Type
  Macro: 2, // Like Decorator
  Property: 2, // Like Variable
  Record: 8, // Like Class
  Delegate: 3, // Like Method
  Annotation: 2, // Like Decorator
  Constructor: 4, // Like Function
  Template: 3, // Like Type
  Route: 5, // Like Enum
  Tool: 5, // Like Enum
};

// Community color palette for cluster-based coloring
export const COMMUNITY_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
  '#14b8a6', // teal
  '#84cc16', // lime
];

export const getCommunityColor = (communityIndex: number): string => {
  return COMMUNITY_COLORS[communityIndex % COMMUNITY_COLORS.length];
};

// Labels to show by default (hide imports and variables by default as they clutter)
export const DEFAULT_VISIBLE_LABELS: NodeLabel[] = [
  'Project',
  'Package',
  'Module',
  'Folder',
  'File',
  'Class',
  'Function',
  'Method',
  'Interface',
  'Enum',
  'Type',
];

// All filterable labels (in display order)
export const FILTERABLE_LABELS: NodeLabel[] = [
  'Folder',
  'File',
  'Class',
  'Interface',
  'Enum',
  'Type',
  'Function',
  'Method',
  'Variable',
  'Decorator',
  'Import',
];

// Edge/Relation types
export type EdgeType = 'CONTAINS' | 'DEFINES' | 'IMPORTS' | 'CALLS' | 'EXTENDS' | 'IMPLEMENTS';

export const ALL_EDGE_TYPES: EdgeType[] = [
  'CONTAINS',
  'DEFINES',
  'IMPORTS',
  'CALLS',
  'EXTENDS',
  'IMPLEMENTS',
];

// Default visible edges (CALLS hidden by default to reduce clutter)
export const DEFAULT_VISIBLE_EDGES: EdgeType[] = [
  'CONTAINS',
  'DEFINES',
  'IMPORTS',
  'EXTENDS',
  'IMPLEMENTS',
  'CALLS',
];

// Edge display info for UI
export const EDGE_INFO: Record<EdgeType, { color: string; label: string }> = {
  CONTAINS: { color: '#7c8aa0', label: 'Contains' },
  DEFINES: { color: '#2dd4bf', label: 'Defines' },
  IMPORTS: { color: '#7dd3fc', label: 'Imports' },
  CALLS: { color: '#a78bfa', label: 'Calls' },
  EXTENDS: { color: '#fb923c', label: 'Extends' },
  IMPLEMENTS: { color: '#f472b6', label: 'Implements' },
};
