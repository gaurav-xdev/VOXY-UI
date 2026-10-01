import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { cn } from "@/utils/cn";
import Magnetic from "@/components/Magnetic";
import { IconArrowUpRight } from "@/components/Icons";

/* Everything below reuses the exact class vocabulary already in the landing page (CTA form, Hero buttons). */

export const inputClass =
  "w-full rounded-full border border-white/15 bg-white/[0.05] px-5 py-3.5 text-[14px] text-white placeholder:text-white/35 outline-none backdrop-blur-md transition-colors focus:border-white/35 aria-[invalid=true]:border-red-300/50 disabled:opacity-50";
export const primaryClass =
  "group inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-[14px] font-medium text-graphite transition-transform active:scale-95 disabled:opacity-60 disabled:active:scale-100";
export const secondaryClass =
  "glass-panel inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[14px] font-medium text-white/85 transition-colors duration-300 hover:text-white disabled:opacity-50";
export const dangerClass =
  "inline-flex items-center justify-center gap-2 rounded-full border border-red-300/30 bg-red-300/[0.06] px-6 py-3.5 text-[14px] font-medium text-red-100/90 transition-colors hover:bg-red-300/15 disabled:opacity-50";
export const linkClass = "text-white/70 underline decoration-white/20 underline-offset-4 transition-colors hover:text-white hover:decoration-white/60";

export function Eyebrow({ children, tone = "text-white/45" }: { children: ReactNode; tone?: string }) {
  return <span className={cn("text-[11px] font-medium tracking-[0.3em]", tone)}>{children}</span>;
}

export const Field = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }>(function Field(
  { label, error, hint, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  const describedBy = error ? `${fid}-err` : hint ? `${fid}-hint` : undefined;
  return (
    <div className="text-left">
      <label htmlFor={fid} className="mb-2 block pl-5 text-[11px] font-medium uppercase tracking-[0.2em] text-white/45">
        {label}
      </label>
      <input ref={ref} id={fid} data-cursor-text aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={cn(inputClass, className)} {...rest} />
      {error ? (
        <p id={`${fid}-err`} role="alert" className="mt-2 pl-5 text-[12.5px] text-red-200/90">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fid}-hint`} className="mt-2 pl-5 text-[12px] text-white/35">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export function PrimaryButton({ children, busy, arrow = true, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; arrow?: boolean }) {
  return (
    <Magnetic strength={0.15}>
      <button {...rest} disabled={rest.disabled || busy} aria-busy={busy || undefined} className={cn(primaryClass, "w-full", className)}>
        {busy ? "Working…" : children}
        {!busy && arrow && <IconArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />}
      </button>
    </Magnetic>
  );
}

export function SecondaryButton({ className, busy, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button {...rest} data-cursor-hover disabled={rest.disabled || busy} aria-busy={busy || undefined} className={cn(secondaryClass, className)}>
      {busy ? "Working…" : children}
    </button>
  );
}

export function DangerButton({ className, busy, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button {...rest} data-cursor-hover disabled={rest.disabled || busy} aria-busy={busy || undefined} className={cn(dangerClass, className)}>
      {busy ? "Working…" : children}
    </button>
  );
}

export function TextLink(props: LinkProps) {
  return <Link data-cursor-hover {...props} className={cn(linkClass, props.className)} />;
}

export function PillLink({ className, ...props }: LinkProps & { variant?: "primary" | "secondary" }) {
  const { variant = "primary", ...rest } = props as LinkProps & { variant?: "primary" | "secondary" };
  return (
    <Magnetic strength={0.2}>
      <Link {...rest} className={cn(variant === "primary" ? primaryClass : secondaryClass, className)} />
    </Magnetic>
  );
}

export function Notice({ tone = "info", children, role }: { tone?: "info" | "error" | "success"; children: ReactNode; role?: "alert" | "status" }) {
  const tones = {
    info: "border-white/12 bg-white/[0.04] text-white/70",
    success: "border-ice/30 bg-ice/10 text-white",
    error: "border-red-300/30 bg-red-300/[0.07] text-red-100/90",
  };
  return (
    <div role={role ?? (tone === "error" ? "alert" : "status")} className={cn("rounded-2xl border px-5 py-3 text-left text-[13.5px] leading-relaxed", tones[tone])}>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse-soft rounded-full bg-white/[0.07]", className)} />;
}
