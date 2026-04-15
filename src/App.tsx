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

  // Exploring view — grafo a pantalla completa con panel lateral
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-void">
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
