import { IconSpark } from "@/components/Icons";

const COLUMNS = [
  {
    title: "Product",
    links: ["Intelligence", "Capabilities", "Engineering", "Access"],
  },
  {
    title: "Company",
    links: ["Philosophy", "Studio", "Careers", "Press"],
  },
  {
    title: "Legal",
    links: ["Privacy", "Security", "Terms"],
  },
];

export default function Footer() {
  return (
    <footer className="relative z-10 mx-auto max-w-6xl px-6 pb-10 pt-20">
      <div className="grid grid-cols-2 gap-10 border-t border-white/8 pt-14 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-white/90 to-white/30">
              <IconSpark className="h-4 w-4 text-graphite" stroke="none" fill="currentColor" />
            </span>
            <span className="font-display text-[15px] font-medium tracking-[0.18em] text-white">VOXY</span>
          </div>
          <p className="mt-4 max-w-[220px] text-[13px] leading-relaxed text-white/40">
            The AI operating companion. Engineered intelligence, designed to feel alive.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h4 className="text-[12px] font-medium tracking-[0.2em] text-white/35">{col.title.toUpperCase()}</h4>
            <ul className="mt-4 space-y-3">
              {col.links.map((l) => (
                <li key={l}>
                  <a href="#" data-cursor-hover className="text-[13.5px] text-white/55 transition-colors hover:text-white">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/8 pt-8 text-[12px] text-white/30 sm:flex-row">
        <span>© {new Date().getFullYear()} VOXY Systems. All rights reserved.</span>
        <span>Designed &amp; engineered as one continuous intelligence.</span>
      </div>

      <div className="mask-fade-b pointer-events-none -mb-10 mt-4 select-none text-center">
        <span className="font-display block text-[19vw] font-medium leading-none tracking-tighter text-white/[0.05]">
          VOXY
        </span>
      </div>
    </footer>
  );
}
