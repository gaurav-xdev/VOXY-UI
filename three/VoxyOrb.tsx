import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Environment,
  Float,
  Lightformer,
  MeshDistortMaterial,
  MeshTransmissionMaterial,
  Sparkles,
  Trail,
} from "@react-three/drei";
import * as THREE from "three";

function FieldRing({ radius, speed, tilt, color }: { radius: number; speed: number; tilt: number; color: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * speed;
  });
  return (
    <group ref={ref} rotation={[tilt, 0.3, 0]}>
      <mesh>
        <torusGeometry args={[radius, 0.004, 8, 160]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function MagneticSeed({ radius, offset, speed, color }: { radius: number; offset: number; speed: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * speed + offset;
    if (ref.current) {
      ref.current.position.set(Math.cos(t) * radius, Math.sin(t * 1.3) * radius * 0.4, Math.sin(t) * radius);
    }
  });
  return (
    <Trail width={2.4} length={5} color={color} attenuation={(t) => t * t}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.028, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </Trail>
  );
}

function Core() {
  const coreRef = useRef<THREE.Mesh>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock, pointer }) => {
    const t = clock.getElapsedTime();
    if (coreRef.current) {
      coreRef.current.rotation.y = t * 0.25;
      coreRef.current.rotation.x = Math.sin(t * 0.2) * 0.15;
    }
    if (wireRef.current) {
      wireRef.current.rotation.y = -t * 0.08;
      wireRef.current.rotation.x = t * 0.05;
    }
    if (shellRef.current) {
      shellRef.current.rotation.y = t * 0.06;
    }
    if (groupRef.current) {
      const targetX = pointer.y * 0.28;
      const targetY = pointer.x * 0.35;
      groupRef.current.rotation.x += (targetX - groupRef.current.rotation.x) * 0.04;
      groupRef.current.rotation.y += (targetY - groupRef.current.rotation.y) * 0.04;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Inner plasma / energy core */}
      <mesh ref={coreRef} scale={0.62}>
        <icosahedronGeometry args={[1, 12]} />
        <MeshDistortMaterial
          color="#eaf6ff"
          emissive="#8fe9ff"
          emissiveIntensity={1.4}
          distort={0.42}
          speed={2.1}
          roughness={0.15}
          metalness={0.1}
        />
      </mesh>

      {/* Liquid glass shell */}
      <mesh ref={shellRef}>
        <icosahedronGeometry args={[1.28, 6]} />
        <MeshTransmissionMaterial
          samples={6}
          resolution={512}
          thickness={0.85}
          roughness={0.06}
          transmission={1}
          ior={1.25}
          chromaticAberration={0.045}
          anisotropy={0.35}
          distortion={0.25}
          distortionScale={0.4}
          temporalDistortion={0.12}
          clearcoat={1}
          clearcoatRoughness={0.1}
          attenuationDistance={1.2}
          attenuationColor="#bfe9ff"
          color="#ffffff"
          background={new THREE.Color("#050506")}
        />
      </mesh>

      {/* Structural wireframe — engineered lattice */}
      <mesh ref={wireRef} scale={1.42}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial color="#cfe9ff" wireframe transparent opacity={0.12} />
      </mesh>

      <FieldRing radius={1.9} speed={0.09} tilt={0.5} color="#8fe9ff" />
      <FieldRing radius={2.15} speed={-0.06} tilt={1.15} color="#b39bff" />
      <FieldRing radius={1.7} speed={0.13} tilt={-0.4} color="#ffffff" />

      <MagneticSeed radius={2.0} offset={0} speed={0.35} color="#8fe9ff" />
      <MagneticSeed radius={2.1} offset={2.4} speed={0.28} color="#b39bff" />
      <MagneticSeed radius={1.85} offset={4.6} speed={0.42} color="#ffffff" />
    </group>
  );
}

function Rig() {
  return (
    <Environment resolution={256}>
      <group rotation={[0, 0.4, 0]}>
        <Lightformer form="rect" intensity={2.2} color="#8fe9ff" position={[-4, 2, 2]} scale={[3, 5, 1]} />
        <Lightformer form="rect" intensity={2.4} color="#b39bff" position={[4, -1, 2]} scale={[3, 5, 1]} />
        <Lightformer form="rect" intensity={3.4} color="#ffffff" position={[0, 4, -2]} scale={[6, 2, 1]} />
        <Lightformer form="ring" intensity={1.4} color="#ffffff" position={[0, 0, -6]} scale={[10, 10, 1]} />
      </group>
    </Environment>
  );
}

function Particles() {
  return (
    <Sparkles
      size={2.4}
      scale={[7, 5, 7]}
      count={70}
      speed={0.25}
      opacity={0.55}
      color="#dff4ff"
    />
  );
}

export default function VoxyOrb({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 0, 6.2], fov: 34 }}
      >
        <color attach="background" args={[0, 0, 0]} />
        <ambientLight intensity={0.3} />
        <pointLight position={[3, 3, 4]} intensity={12} color="#8fe9ff" distance={12} />
        <pointLight position={[-3, -2, 3]} intensity={10} color="#b39bff" distance={12} />
        <pointLight position={[0, -3, -2]} intensity={6} color="#ffffff" distance={12} />
        <Suspense fallback={null}>
          <Rig />
          <Float speed={1.4} rotationIntensity={0.3} floatIntensity={0.9}>
            <Core />
          </Float>
          <Particles />
        </Suspense>
      </Canvas>
    </div>
  );
}
