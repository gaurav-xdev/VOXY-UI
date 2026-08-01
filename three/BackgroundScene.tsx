import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";

function GlassPlane({
  position,
  rotation,
  size,
  color,
  speed,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number];
  color: string;
  speed: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const base = position[1];
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = base + Math.sin(clock.getElapsedTime() * speed) * 0.4;
      ref.current.rotation.z = rotation[2] + Math.sin(clock.getElapsedTime() * speed * 0.6) * 0.05;
    }
  });
  return (
    <mesh ref={ref} position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshPhysicalMaterial
        color={color}
        transparent
        opacity={0.06}
        roughness={0.2}
        metalness={0.1}
        transmission={0.9}
        thickness={0.4}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function DriftingLight() {
  const ref = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 0.15;
    if (ref.current) {
      ref.current.position.set(Math.sin(t) * 6, Math.cos(t * 0.7) * 3, Math.cos(t) * 4);
    }
  });
  return <pointLight ref={ref} intensity={18} color="#8fe9ff" distance={20} />;
}

function CameraRig() {
  useFrame(({ camera, pointer, clock }) => {
    const t = clock.getElapsedTime();
    camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.02;
    camera.position.y += (-pointer.y * 0.35 + Math.sin(t * 0.08) * 0.15 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function BackgroundScene() {
  return (
    <div className="fixed inset-0 z-0">
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 9], fov: 50 }}
      >
        <color attach="background" args={["#050506"]} />
        <fog attach="fog" args={["#050506", 6, 16]} />
        <ambientLight intensity={0.2} />
        <DriftingLight />
        <pointLight position={[-6, -3, -4]} intensity={8} color="#b39bff" distance={20} />
        <Suspense fallback={null}>
          <GlassPlane position={[-4.5, 1.2, -4]} rotation={[0.2, 0.4, 0.3]} size={[3.4, 4.2]} color="#8fe9ff" speed={0.3} />
          <GlassPlane position={[4.8, -1.5, -6]} rotation={[-0.15, -0.5, -0.2]} size={[4, 5]} color="#b39bff" speed={0.22} />
          <GlassPlane position={[0, 3, -8]} rotation={[0.3, 0, 0]} size={[6, 3]} color="#ffffff" speed={0.18} />
          <Sparkles count={140} scale={[16, 9, 10]} size={1.6} speed={0.18} opacity={0.4} color="#dbe8ff" />
        </Suspense>
        <CameraRig />
      </Canvas>
    </div>
  );
}
