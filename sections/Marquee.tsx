const ITEMS = [
  "REAL-TIME COGNITION",
  "ADAPTIVE MEMORY",
  "AMBIENT PRESENCE",
  "PRIVATE BY DESIGN",
  "CROSS-DEVICE CONTINUITY",
  "LIQUID INTERFACE",
  "ZERO LATENCY VOICE",
  "ENGINEERED INTELLIGENCE",
];

export default function Marquee() {
  const loop = [...ITEMS, ...ITEMS];
  return (
    <div className="relative z-10 border-y border-white/8 bg-white/[0.02] py-5">
      <div className="mask-fade-x overflow-hidden">
        <div className="flex w-max animate-marquee gap-10">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center gap-10">
              {loop.map((item, i) => (
                <span key={`${copy}-${i}`} className="flex items-center gap-10 whitespace-nowrap">
                  <span className="font-display text-xs font-medium tracking-[0.3em] text-white/45">{item}</span>
                  <span className="h-1 w-1 rounded-full bg-ice/60" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
