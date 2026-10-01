import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { pointer, usePointerTracker } from "./pointer";
import { prefersReducedMotion, TIER, useQualityTier, type Tier } from "./quality";
import { AdaptiveQuality, FrameGovernor, useSceneActive } from "./SceneRuntime";
import { SceneBoundary, canUseWebGL } from "./SceneBoundary";

const motion = () => (prefersReducedMotion() ? 0.25 : 1);

function GlassPlane({
  position,
  rotation,
  size,
  color,
  speed,
  tier,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number];
  color: string;
  speed: number;
  tier: Tier;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const base = position[1];
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime() * motion();
      ref.current.position.y = base + Math.sin(t * speed) * 0.4;
      ref.current.rotation.z = rotation[2] + Math.sin(t * speed * 0.6) * 0.05;
    }
  });
  return (
    <mesh ref={ref} position={position} rotation={rotation}>
      <planeGeometry args={size} />
      {/* Transmission forces an extra full-scene render pass per frame; reserve it for the high tier. */}
      {tier === "high" ? (
        <meshPhysicalMaterial color={color} transparent opacity={0.06} roughness={0.2} metalness={0.1} transmission={0.9} thickness={0.4} side={THREE.DoubleSide} />
      ) : (
        <meshStandardMaterial color={color} transparent opacity={0.06} roughness={0.2} metalness={0.1} side={THREE.DoubleSide} />
      )}
    </mesh>
  );
}

function DriftingLight() {
  const ref = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 0.15 * motion();
    if (ref.current) ref.current.position.set(Math.sin(t) * 6, Math.cos(t * 0.7) * 3, Math.cos(t) * 4);
  });
  return <pointLight ref={ref} intensity={18} color="#8fe9ff" distance={20} />;
}

function CameraRig() {
  usePointerTracker();
  useFrame(({ camera, clock }, delta) => {
    const t = clock.getElapsedTime() * motion();
    // Frame-rate independent damping (same feel as the original 0.02/frame at 60fps).
    camera.position.x = THREE.MathUtils.damp(camera.position.x, pointer.x * 0.6 * motion(), 1.2, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, pointer.y * 0.35 * motion() + Math.sin(t * 0.08) * 0.15, 1.2, delta);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function BackgroundScene() {
  const wrap = useRef<HTMLDivElement>(null);
  const active = useSceneActive(wrap, "0px");
  const tier = useQualityTier();
  const t = TIER[tier];
  return (
    <div ref={wrap} className="fixed inset-0 z-0" aria-hidden="true">
      {canUseWebGL() && (
        <SceneBoundary>
          <Canvas
            frameloop="demand"
            dpr={t.dprBg as unknown as [number, number]}
            gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
            camera={{ position: [0, 0, 9], fov: 50 }}
            onCreated={({ gl }) => gl.domElement.addEventListener("webglcontextlost", (e) => e.preventDefault())}
          >
            <AdaptiveQuality />
            <FrameGovernor active={active} tier={tier} idleThrottle />
            <color attach="background" args={["#050506"]} />
            <fog attach="fog" args={["#050506", 6, 16]} />
            <ambientLight intensity={0.2} />
            <DriftingLight />
            <pointLight position={[-6, -3, -4]} intensity={8} color="#b39bff" distance={20} />
            <Suspense fallback={null}>
              <GlassPlane tier={tier} position={[-4.5, 1.2, -4]} rotation={[0.2, 0.4, 0.3]} size={[3.4, 4.2]} color="#8fe9ff" speed={0.3} />
              <GlassPlane tier={tier} position={[4.8, -1.5, -6]} rotation={[-0.15, -0.5, -0.2]} size={[4, 5]} color="#b39bff" speed={0.22} />
              <GlassPlane tier={tier} position={[0, 3, -8]} rotation={[0.3, 0, 0]} size={[6, 3]} color="#ffffff" speed={0.18} />
              <Sparkles count={t.sparkBg} scale={[16, 9, 10]} size={1.6} speed={0.18 * motion()} opacity={0.4} color="#dbe8ff" />
            </Suspense>
            <CameraRig />
          </Canvas>
        </SceneBoundary>
      )}
    </div>
  );
}
