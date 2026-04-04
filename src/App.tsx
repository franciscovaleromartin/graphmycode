import { useRef } from 'react';
import { AppStateProvider, useAppState } from './hooks/useAppState';
import { LandingScreen } from './screens/LandingScreen';
import { SidePanel } from './screens/SidePanel';
import { LoadingOverlay } from './components/LoadingOverlay';
import { GraphCanvas, GraphCanvasHandle } from './components/GraphCanvas';

const AppContent = () => {
  const { viewMode, progress } = useAppState();
  const graphCanvasRef = useRef<GraphCanvasHandle>(null);

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
    </div>
  );
};

function App() {
  return (
    <AppStateProvider>
      <AppContent />
    </AppStateProvider>
  );
}

export default App;
