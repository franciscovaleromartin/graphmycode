// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { lazy, Suspense, useRef, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { track } from '@vercel/analytics';
import { AppStateProvider, useAppState } from './hooks/useAppState';
import { LandingScreen } from './screens/LandingScreen';
import { LoadingOverlay } from './components/LoadingOverlay';

// Lazy-load everything used only in 'exploring' mode.
// These chunks (Sigma, Graphology, Three.js, Mermaid…) are never parsed
// during the landing page, reducing main-thread work on initial load.
const SidePanel = lazy(() =>
  import('./screens/SidePanel').then((m) => ({ default: m.SidePanel })),
);
const GraphCanvas = lazy(() =>
  import('./components/GraphCanvas').then((m) => ({ default: m.GraphCanvas })),
);
const RightPanel = lazy(() =>
  import('./components/RightPanel').then((m) => ({ default: m.RightPanel })),
);
const SettingsPanel = lazy(() =>
  import('./components/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
);

const AppContent = () => {
  const { viewMode, progress, isSettingsPanelOpen, setSettingsPanelOpen } = useAppState();
  const graphCanvasRef = useRef<import('./components/GraphCanvas').GraphCanvasHandle>(null);

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
    <Suspense fallback={null}>
      <main className="flex h-screen w-screen overflow-hidden bg-void">
        <SidePanel />
        <GraphCanvas ref={graphCanvasRef} />
        <RightPanel />
        <SettingsPanel
          isOpen={isSettingsPanelOpen}
          onClose={() => setSettingsPanelOpen(false)}
        />
      </main>
    </Suspense>
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
