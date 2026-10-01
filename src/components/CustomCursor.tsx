import { useEffect, useRef } from "react";

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;
    let hovering = false;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
      }
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      hovering = !!target.closest("[data-cursor-hover]");
      const isText = !!target.closest("[data-cursor-text]");
      if (ringRef.current) {
        ringRef.current.style.opacity = "1";
        ringRef.current.dataset.state = hovering ? "hover" : isText ? "text" : "default";
      }
    };

    const onLeaveWindow = () => {
      if (ringRef.current) ringRef.current.style.opacity = "0";
      if (dotRef.current) dotRef.current.style.opacity = "0";
    };
    const onEnterWindow = () => {
      if (ringRef.current) ringRef.current.style.opacity = "1";
      if (dotRef.current) dotRef.current.style.opacity = "1";
    };

    const loop = () => {
      ringX += (mouseX - ringX) * 0.16;
      ringY += (mouseY - ringY) * 0.16;
      if (ringRef.current) {
        const scale = hovering ? 2.2 : 1;
        ringRef.current.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%) scale(${scale})`;
      }
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseover", onOver);
    document.documentElement.addEventListener("mouseleave", onLeaveWindow);
    document.documentElement.addEventListener("mouseenter", onEnterWindow);
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
      document.documentElement.removeEventListener("mouseleave", onLeaveWindow);
      document.documentElement.removeEventListener("mouseenter", onEnterWindow);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="voxy-cursor">
      <div
        ref={dotRef}
        className="pointer-events-none fixed left-0 top-0 z-[100] h-1.5 w-1.5 rounded-full bg-white transition-opacity duration-200"
        style={{ willChange: "transform" }}
      />
      <div
        ref={ringRef}
        data-state="default"
        className="pointer-events-none fixed left-0 top-0 z-[99] h-9 w-9 rounded-full border border-white/40 opacity-0 transition-[background,border-color] duration-300 ease-out data-[state=hover]:border-white/0 data-[state=hover]:bg-white/10 data-[state=text]:h-14 data-[state=text]:w-14 data-[state=text]:border-ice/60"
        style={{ willChange: "transform", transitionProperty: "opacity, background-color, border-color" }}
      />
    </div>
  );
}
