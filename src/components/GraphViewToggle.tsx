// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { Layers, Brain, Building2, GitBranch, Share2, Network } from '@/lib/lucide-icons';
import type { ReactNode } from 'react';

type ViewType = 'structural' | 'semantic' | 'city' | 'heatmap' | 'codeflow' | 'architectural';

interface ViewOption {
  type: ViewType;
  icon: ReactNode;
  label: string;
  title: string;
}

const VIEW_OPTIONS: ViewOption[] = [
  {
    type: 'structural',
    icon: <Layers className="size-3" />,
    label: 'Structural',
    title: 'Vista estructural (grafo 2D)',
  },
  {
    type: 'semantic',
    icon: <Brain className="size-3" />,
    label: 'Semantic',
    title: 'Vista semántica 3D (similitud de código)',
  },
  {
    type: 'city',
    icon: <Building2 className="size-3" />,
    label: 'Technical Debt',
    title: 'Vista ciudad 3D (deuda técnica)',
  },
  {
    type: 'heatmap',
    icon: <GitBranch className="size-3" />,
    label: 'Dependency Heatmap',
    title: 'Mapa de calor de acoplamiento entre ficheros',
  },
  {
    type: 'codeflow',
    icon: <Share2 className="size-3" />,
    label: 'Code Flow',
    title: 'Flujo de ejecución del archivo seleccionado',
  },
  {
    type: 'architectural',
    icon: <Network className="size-3" />,
    label: 'Arch. Layers',
    title: 'Vista de capas arquitectónicas (layout en carriles)',
  },
];

const ACTIVATED_VIEWS: Partial<Record<ViewType, true>> = {
  semantic: true,
  city: true,
  heatmap: true,
  codeflow: true,
  architectural: true,
};

interface GraphViewToggleProps {
  currentView: ViewType;
  isSidebarCollapsed: boolean;
  onViewChange: (view: ViewType) => void;
  onViewActivated: (view: ViewType) => void;
}

export const GraphViewToggle = ({
  currentView,
  isSidebarCollapsed,
  onViewChange,
  onViewActivated,
}: GraphViewToggleProps) => (
  <div
    className={`absolute top-4 z-20 flex overflow-hidden rounded-lg border border-border-subtle bg-surface shadow-sm transition-all duration-300 ${isSidebarCollapsed ? 'left-14' : 'left-60'}`}
  >
    {VIEW_OPTIONS.map((opt, idx) => (
      <div key={opt.type} className="contents">
        {idx > 0 && <div className="w-px bg-border-subtle" />}
        <button
          onClick={() => {
            onViewChange(opt.type);
            if (ACTIVATED_VIEWS[opt.type]) onViewActivated(opt.type);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            currentView === opt.type
              ? 'bg-elevated text-text-primary'
              : 'text-text-muted hover:bg-hover hover:text-text-secondary'
          }`}
          title={opt.title}
        >
          {opt.icon}
          {opt.label}
        </button>
      </div>
    ))}
  </div>
);
