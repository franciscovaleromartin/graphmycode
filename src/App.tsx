// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { useRef, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { track } from '@vercel/analytics';
import { AppStateProvider, useAppState } from './hooks/useAppState';
import { LandingScreen } from './screens/LandingScreen';
import { SidePanel } from './screens/SidePanel';
import { LoadingOverlay } from './components/LoadingOverlay';
import { GraphCanvas, GraphCanvasHandle } from './components/GraphCanvas';
import { RightPanel } from './components/RightPanel';
import { SettingsPanel } from './components/SettingsPanel';

const AppContent = () => {
  const { viewMode, progress, isSettingsPanelOpen, setSettingsPanelOpen } = useAppState();
  const graphCanvasRef = useRef<GraphCanvasHandle>(null);

  useEffect(() => {
    if (viewMode === 'exploring') {
      track('graph_viewed');
    }
  }, [viewMode]);

  if (viewMode === 'onboarding') {
    return <LandingScreen />;
  }

  if (viewMode === 'loading' && progress) {
    return <LoadingOverlay progress={progress} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-void">
      <SidePanel />
      <GraphCanvas ref={graphCanvasRef} />
      <RightPanel />
      <SettingsPanel
        isOpen={isSettingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
      />
    </div>
  );
};

function App() {
  return (
    <AppStateProvider>
      <AppContent />
      <Analytics />
    </AppStateProvider>
  );
}

export default App;
