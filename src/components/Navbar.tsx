import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router";
import { useSession } from "@/lib/session";
import { Skeleton } from "@/ui/primitives";
import Magnetic from "./Magnetic";
import { IconSpark } from "./Icons";

const LINKS = [
  { label: "Intelligence", href: "/#intelligence" },
  { label: "Capabilities", href: "/#capabilities" },
  { label: "Engineering", href: "/#engineering" },
  { label: "Access", href: "/#access" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const session = useSession();
  const signedIn = Boolean(session.data?.user);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4"
    >
      <div
        className={`flex w-full max-w-5xl items-center justify-between rounded-full px-5 py-2.5 transition-all duration-500 ${
          scrolled ? "glass-panel-strong" : "border border-white/0 bg-transparent"
        }`}
      >
        <Link to="/#top" data-cursor-hover aria-label="VOXY home" className="flex items-center gap-2.5">
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-white/90 to-white/30">
            <IconSpark className="h-4 w-4 text-graphite" stroke="none" fill="currentColor" />
          </span>
          <span className="font-display text-[15px] font-medium tracking-[0.18em] text-white">VOXY</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <Link key={l.label} to={l.href} data-cursor-text className="text-[13px] font-medium tracking-wide text-white/60 transition-colors duration-300 hover:text-white">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          {session.isPending && session.fetchStatus !== "idle" ? (
            <Skeleton className="h-3 w-14" />
          ) : (
            <Link
              to={signedIn ? "/account" : "/login"}
              data-cursor-text
              className="text-[13px] font-medium tracking-wide text-white/60 transition-colors duration-300 hover:text-white"
            >
              {signedIn ? "Account" : "Sign in"}
            </Link>
          )}
          <Magnetic>
            <Link
              to="/#access"
              className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-[13px] font-medium text-white transition-colors duration-300 hover:bg-white/15"
            >
              Request Access
            </Link>
          </Magnetic>
        </div>
      </div>
    </motion.header>
  );
}
