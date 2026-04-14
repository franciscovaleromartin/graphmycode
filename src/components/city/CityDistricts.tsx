import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import type { CityBuilding } from '../../lib/city-layout';

interface Props {
  buildings: CityBuilding[];
}

interface DistrictBounds {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function computeDistrictBounds(buildings: CityBuilding[]): DistrictBounds[] {
  const map = new Map<string, DistrictBounds>();
  buildings.forEach(b => {
    const half = b.width / 2;
    const existing = map.get(b.districtId);
    if (!existing) {
      map.set(b.districtId, {
        id: b.districtId,
        minX: b.x - half,
        maxX: b.x + half,
        minZ: b.z - half,
        maxZ: b.z + half,
      });
    } else {
      existing.minX = Math.min(existing.minX, b.x - half);
      existing.maxX = Math.max(existing.maxX, b.x + half);
      existing.minZ = Math.min(existing.minZ, b.z - half);
      existing.maxZ = Math.max(existing.maxZ, b.z + half);
    }
  });
  return [...map.values()];
}

const PADDING = 1.5;
const FLOOR_COLOR = new THREE.Color('#1a1a2e');
const BORDER_COLOR = '#2d2d4a';

export function CityDistricts({ buildings }: Props) {
  const districts = useMemo(() => computeDistrictBounds(buildings), [buildings]);

  return (
    <>
      {districts.map(d => {
        const w = d.maxX - d.minX + PADDING * 2;
        const h = d.maxZ - d.minZ + PADDING * 2;
        const cx = (d.minX + d.maxX) / 2;
        const cz = (d.minZ + d.maxZ) / 2;

        return (
          <group key={d.id}>
            {/* Floor plane */}
            <mesh position={[cx, -0.05, cz]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[w, h]} />
              <meshStandardMaterial color={FLOOR_COLOR} />
            </mesh>

            {/* Border edges */}
            <lineLoop position={[cx, 0.01, cz]}>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[
                    new Float32Array([
                      -w / 2, 0, -h / 2,
                       w / 2, 0, -h / 2,
                       w / 2, 0,  h / 2,
                      -w / 2, 0,  h / 2,
                    ]),
                    3,
                  ]}
                />
              </bufferGeometry>
              <lineBasicMaterial color={BORDER_COLOR} />
            </lineLoop>

            {/* District label */}
            <Text
              position={[cx, 0.3, d.minZ - PADDING + 0.6]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.9}
              color="#6366f1"
              anchorX="center"
              anchorY="middle"
              maxWidth={w}
            >
              {d.id}
            </Text>
          </group>
        );
      })}
    </>
  );
}
