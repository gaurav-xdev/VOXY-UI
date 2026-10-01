import { useEffect } from "react";
import { useLocation } from "react-router";

/** Route changes reset scroll; hash links (e.g. /#access from another page) scroll to their section once it mounts. */
export default function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    // Token fragments (#token=…) are not element ids; ignore them.
    if (!/^[A-Za-z][\w-]*$/.test(id)) return;
    let tries = 0;
    let raf = 0;
    const seek = () => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView();
      else if (tries++ < 30) raf = requestAnimationFrame(seek);
    };
    seek();
    return () => cancelAnimationFrame(raf);
  }, [pathname, hash]);
  return null;
}
