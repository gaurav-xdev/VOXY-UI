import { Outlet, useNavigation } from "react-router";
import SmoothScroll from "@/lib/SmoothScroll";
import CustomCursor from "@/components/CustomCursor";
import Navbar from "@/components/Navbar";
import Footer from "@/sections/Footer";
import LazyBackground from "@/three/LazyBackground";
import ScrollManager from "./ScrollManager";

function NavigationProgress() {
  const { state } = useNavigation();
  if (state === "idle") return null;
  return <div role="progressbar" aria-label="Loading page" className="fixed inset-x-0 top-0 z-[60] h-px animate-pulse-soft bg-ice/80" />;
}

/** Persistent VOXY chrome: backdrop scene, grain, vignette, cursor, nav and footer. Pages render in <Outlet/>. */
export default function SiteLayout() {
  return (
    <SmoothScroll>
      <div className="relative min-h-screen bg-void text-white selection:bg-white/20">
        <a href="#main" className="sr-only z-[70] rounded-full bg-white px-4 py-2 text-sm text-graphite focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Skip to content
        </a>
        <LazyBackground />
        <div className="grain-overlay" />
        <div className="vignette" />
        <CustomCursor />
        <NavigationProgress />
        <ScrollManager />
        <Navbar />
        <main id="main" className="relative z-10">
          <Outlet />
        </main>
        <Footer />
      </div>
    </SmoothScroll>
  );
}
