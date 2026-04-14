import { Html } from '@react-three/drei';
import type { CityBuilding } from '../../lib/city-layout';

interface Props {
  building: CityBuilding;
  nodeName: string;
  nodeLabel: string;
  metricLabel: string;
  metricValue: number;
}

export function CityTooltip({ building, nodeName, nodeLabel, metricLabel, metricValue }: Props) {
  return (
    <Html
      position={[building.x, building.height + 0.8, building.z]}
      center
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          background: 'rgba(13,13,26,0.95)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}
      >
        <p style={{ color: '#fff', fontWeight: 600, margin: '0 0 2px' }}>{nodeName}</p>
        <p style={{ color: '#9ca3af', margin: '0 0 4px' }}>{nodeLabel}</p>
        <p style={{ color: '#d1d5db', margin: 0 }}>
          <span style={{ color: '#6b7280' }}>{metricLabel}: </span>
          <span style={{ color: '#fbbf24', fontWeight: 600 }}>{metricValue}</span>
        </p>
      </div>
    </Html>
  );
}
