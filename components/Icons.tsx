import type { SVGProps } from "react";

/* Handcrafted minimal line-icon set for VOXY — custom drawn, not stock icon-pack. */

const base = {
  fill: "none",
  strokeWidth: 1.15,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconNeural(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" {...base} {...props}>
      <circle cx="24" cy="10" r="3.2" />
      <circle cx="10" cy="24" r="3.2" />
      <circle cx="38" cy="24" r="3.2" />
      <circle cx="17" cy="38" r="3.2" />
      <circle cx="31" cy="38" r="3.2" />
      <circle cx="24" cy="24" r="2.4" />
      <path d="M24 13v8.4M12.6 25.6 21.4 24M35.4 25.6 26.6 24M19.2 36l3.6-9.8M28.8 36l-3.6-9.8" />
    </svg>
  );
}

export function IconWave(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" {...base} {...props}>
      <path d="M6 24h4l3-11 5 22 4-15 3 9 3-6 3 6h11" />
    </svg>
  );
}

export function IconShield(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" {...base} {...props}>
      <path d="M24 6l14 5v11c0 10-6 16.5-14 20-8-3.5-14-10-14-20V11z" />
      <path d="M18 24l4.5 4.5L31 19" />
    </svg>
  );
}

export function IconSync(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" {...base} {...props}>
      <path d="M12 20a12 12 0 0 1 20.5-7.5L36 16" />
      <path d="M36 16v-7M36 28a12 12 0 0 1-20.5 7.5L12 32" />
      <path d="M12 32v7" />
    </svg>
  );
}

export function IconSpark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" {...base} {...props}>
      <path d="M24 6c0 8 4 14 14 14-10 0-14 6-14 14 0-8-4-14-14-14 10 0 14-6 14-14z" />
    </svg>
  );
}

export function IconLayers(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" {...base} {...props}>
      <path d="M24 6 5 16l19 10 19-10z" />
      <path d="M5 24l19 10 19-10" />
      <path d="M5 32l19 10 19-10" />
    </svg>
  );
}

export function IconOrbit(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" {...base} {...props}>
      <circle cx="24" cy="24" r="4.5" />
      <ellipse cx="24" cy="24" rx="19" ry="8" />
      <ellipse cx="24" cy="24" rx="19" ry="8" transform="rotate(60 24 24)" />
      <ellipse cx="24" cy="24" rx="19" ry="8" transform="rotate(120 24 24)" />
    </svg>
  );
}

export function IconEye(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" {...base} {...props}>
      <path d="M4 24s7.5-13 20-13 20 13 20 13-7.5 13-20 13S4 24 4 24z" />
      <circle cx="24" cy="24" r="5.5" />
    </svg>
  );
}

export function IconInfinity(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" {...base} {...props}>
      <path d="M14 18c-5 0-9 3.6-9 8s4 8 9 8c7 0 10-16 20-16 5 0 9 3.6 9 8s-4 8-9 8c-10 0-13-16-20-16z" />
    </svg>
  );
}

export function IconArrowUpRight(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...base} strokeWidth={1.6} {...props}>
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

export function IconChevronDown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...base} strokeWidth={1.4} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
