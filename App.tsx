import SmoothScroll from "@/lib/SmoothScroll";
import CustomCursor from "@/components/CustomCursor";
import BackgroundScene from "@/three/BackgroundScene";
import Navbar from "@/components/Navbar";
import Hero from "@/sections/Hero";
import Marquee from "@/sections/Marquee";
import Intelligence from "@/sections/Intelligence";
import Capabilities from "@/sections/Capabilities";
import Engineering from "@/sections/Engineering";
import Quote from "@/sections/Quote";
import CTA from "@/sections/CTA";
import Footer from "@/sections/Footer";

export default function App() {
  return (
    <SmoothScroll>
      <div className="relative min-h-screen bg-void text-white selection:bg-white/20">
        <BackgroundScene />
        <div className="grain-overlay" />
        <div className="vignette" />
        <CustomCursor />

        <Navbar />

        <main className="relative z-10">
          <Hero />
          <Marquee />
          <Intelligence />
          <Capabilities />
          <Engineering />
          <Quote />
          <CTA />
        </main>

        <Footer />
      </div>
    </SmoothScroll>
  );
}
