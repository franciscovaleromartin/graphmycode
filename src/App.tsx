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
import { CodeReferencesPanel } from './components/CodeReferencesPanel';

const AppContent = () => {
  const { viewMode, progress, isSettingsPanelOpen, setSettingsPanelOpen, isCodePanelOpen } = useAppState();
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

  // Exploring view — layout flex horizontal: sidebar | code panel | canvas | chat panel
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-void">
      <SidePanel />
      {isCodePanelOpen && (
        <CodeReferencesPanel
          onFocusNode={(nodeId) => graphCanvasRef.current?.focusNode(nodeId)}
        />
      )}
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
