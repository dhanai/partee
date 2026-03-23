"use client";

import { cn } from "@/lib/utils";

type SpinnerSize = "xs" | "sm" | "md" | "lg";

const sizeClass: Record<SpinnerSize, string> = {
  xs: "h-3.5 w-3.5 border-[1.5px]",
  sm: "h-4 w-4 border-2",
  md: "h-8 w-8 border-2",
  lg: "h-11 w-11 border-[2.5px]",
};

type ParfadeSpinnerProps = {
  size?: SpinnerSize;
  /** `onPrimary` = light ring for fairway / primary buttons */
  variant?: "default" | "onPrimary" | "muted";
  className?: string;
  "aria-label"?: string;
};

export function ParfadeSpinner({
  size = "md",
  variant = "default",
  className,
  "aria-label": ariaLabel = "Loading",
}: ParfadeSpinnerProps) {
  const ring =
    variant === "onPrimary"
      ? "border-white/30 border-t-white"
      : variant === "muted"
        ? "border-[#e8e4dc] border-t-[#6e6e6e]"
        : "border-[#ece8e1] border-t-[#1a3c2a]";

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full",
        sizeClass[size],
        ring,
        className,
      )}
    />
  );
}

type ParfadeLoadingBlockProps = {
  message?: string;
  className?: string;
  /** Visual weight of the spinner */
  size?: "sm" | "md" | "lg";
};

/** Centered spinner for Suspense fallbacks and full-section loading */
export function ParfadeLoadingBlock({
  message,
  className,
  size = "md",
}: ParfadeLoadingBlockProps) {
  const spinnerSize = size === "sm" ? "sm" : size === "lg" ? "lg" : "md";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-10",
        className,
      )}
    >
      <ParfadeSpinner size={spinnerSize} />
      {message ? <p className="text-sm text-[#6e6e6e]">{message}</p> : null}
    </div>
  );
}

/** Spinner + optional label for compact rows */
export function ParfadeLoadingInline({
  label,
  className,
  size = "sm",
}: {
  label?: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm text-charcoal-300",
        className,
      )}
    >
      <ParfadeSpinner size={size} variant="muted" aria-label={label ?? "Loading"} />
      {label ? <span>{label}</span> : null}
    </div>
  );
}
