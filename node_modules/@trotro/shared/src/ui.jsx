import React, { useEffect, useRef, useState } from "react";
import { cn, isIOSDevice, isInSafari, isStandalone } from "./utils.js";

/* ============================ UI PRIMITIVES ============================ */
export function Pill({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-white/10 text-zinc-200 border-white/10",
    good: "bg-emerald-500/15 text-emerald-200 border-emerald-400/20",
    warn: "bg-amber-500/15 text-amber-200 border-amber-400/20",
    bad: "bg-red-500/15 text-red-200 border-red-400/20",
    accent: "bg-amber-500/20 text-amber-200 border-amber-400/25"
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide",
        tones[tone] || tones.neutral
      )}
    >
      {children}
    </span>
  );
}

export function Card({ children, className, ...props }) {
  return (
    <div
      {...props}
      className={cn(
        "rounded-2xl border border-white/10 bg-zinc-900/45 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.8)] backdrop-blur",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, className }) {
  return <div className={cn("p-6", className)}>{children}</div>;
}

export function SectionTitle({ children, right }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-[11px] font-extrabold tracking-[0.18em] text-zinc-400 uppercase">
        {children}
      </div>
      {right}
    </div>
  );
}

export function Divider() {
  return <div className="h-px w-full bg-white/10" />;
}

export function PrimaryButton({ children, className, ...props }) {
  return (
    <button
      {...props}
      className={cn(
        "w-full rounded-2xl bg-amber-500 px-5 py-4 text-base font-extrabold text-zinc-950 shadow-[0_10px_30px_-18px_rgba(245,158,11,0.45)] active:scale-[0.99] disabled:opacity-60",
        className
      )}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className, ...props }) {
  return (
    <button
      {...props}
      className={cn(
        "w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-extrabold text-zinc-100 hover:bg-white/10 active:scale-[0.99] disabled:opacity-60",
        className
      )}
    >
      {children}
    </button>
  );
}

export function TextInput({ className, ...props }) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-amber-400/40",
        className
      )}
    />
  );
}

/* ============================ HERO + SUMMARY ============================ */
export function Hero({ title, subtitle, right }) {
  return (
    <Card className="overflow-hidden">
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg sm:text-xl font-black tracking-tight">
              {title}
            </div>
            {subtitle ? (
              <div className="mt-1 text-sm text-zinc-400">{subtitle}</div>
            ) : null}
          </div>
          {right ? <div className="pt-1">{right}</div> : null}
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950">
          <div className="h-20" />
          <div className="absolute inset-0 opacity-70">
            <div className="absolute left-6 top-5 h-2 w-28 rounded bg-white/10" />
            <div className="absolute left-10 top-11 h-2 w-44 rounded bg-white/5" />
            <div className="absolute left-6 bottom-6 h-2 w-52 rounded bg-white/10" />
            <div className="absolute right-8 top-10 h-10 w-10 rounded-full bg-amber-500/20 blur-[1px]" />
          </div>
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        </div>
      </CardBody>
    </Card>
  );
}

export function SelectionSummary({ mode, destination, stop, locationRequired }) {
  if (!destination && !stop) return null;

  return (
    <div className="sticky top-[76px] z-40">
      <Card className="bg-zinc-950/70">
        <CardBody className="py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold tracking-[0.18em] text-zinc-400 uppercase">
                Selected
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-100 truncate">
                {destination ? destination.name : "No destination"}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500 truncate">
                {stop ? stop.name : "Pick a stop"}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <Pill tone={mode === "passenger" ? "accent" : "neutral"}>
                {mode === "passenger" ? "Passenger" : "Driver"}
              </Pill>
              {mode === "passenger" && stop ? (
                <Pill tone={locationRequired ? "warn" : "neutral"}>
                  {locationRequired ? "GPS required" : "GPS optional"}
                </Pill>
              ) : null}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* ============================ MENU HELPERS (driver uses these) ============================ */
function useOutsideClick(handler) {
  const ref = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      const el = ref.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      handler?.();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [handler]);

  return ref;
}

function ActionMenu({ open, onClose, onEdit, onDelete }) {
  const wrapRef = useOutsideClick(() => {
    if (open) onClose?.();
  });

  if (!open) return null;

  return (
    <div ref={wrapRef} className="absolute right-3 top-3 z-40">
      <div className="w-44 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-xl backdrop-blur">
        <button
          onClick={() => {
            onEdit?.();
            onClose?.();
          }}
          className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-100 hover:bg-white/5"
        >
          Edit
        </button>
        <button
          onClick={() => {
            onDelete?.();
            onClose?.();
          }}
          className="w-full px-4 py-3 text-left text-sm font-semibold text-red-200 hover:bg-red-500/10"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function SelectCard({
  title,
  subtitle,
  selected,
  right,
  onSelect,
  menuOpen,
  setMenuOpen,
  onEdit,
  onDelete,
  menuId
}) {
  const longPressTimer = useRef(null);

  const openMenu = () => setMenuOpen(menuId);
  const closeMenu = () => setMenuOpen(null);

  const startLongPress = () => {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => openMenu(), 520);
  };

  const endLongPress = () => clearTimeout(longPressTimer.current);

  return (
    <Card
      className={cn(
        "relative transition",
        selected ? "border-amber-400/30 bg-amber-500/10" : "hover:bg-white/5"
      )}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu();
      }}
      onTouchStart={startLongPress}
      onTouchEnd={endLongPress}
      onTouchMove={endLongPress}
    >
      <CardBody className="p-5">
        <div className="flex items-start justify-between gap-3">
          <button onClick={onSelect} className="flex-1 text-left">
            <div className="text-base font-semibold text-zinc-100">{title}</div>
            {subtitle ? (
              <div className="mt-1 text-xs text-zinc-500">{subtitle}</div>
            ) : null}
          </button>

          {right ? <div className="pt-0.5">{right}</div> : null}

          {setMenuOpen ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                menuOpen ? closeMenu() : openMenu();
              }}
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
              aria-label="Open actions"
            >
              <span className="text-lg leading-none">⋯</span>
            </button>
          ) : null}
        </div>

        <ActionMenu
          open={!!menuOpen}
          onClose={closeMenu}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </CardBody>
    </Card>
  );
}

/* ============================ iOS A2HS Banner (passenger app uses) ============================ */
export function IOSAddToHomeScreenBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isIOSDevice()) return;
    if (isStandalone()) return;

    const dismissed = localStorage.getItem("ios_a2hs_dismissed");
    if (dismissed === "1") return;

    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed bottom-4 left-0 right-0 z-[70]">
      <div className="mx-auto w-full max-w-3xl px-4">
        <div className="rounded-2xl border border-white/10 bg-zinc-950/90 p-4 shadow-xl backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 border border-amber-400/20">
              <span className="text-lg">📲</span>
            </div>

            <div className="flex-1">
              <div className="text-sm font-extrabold text-zinc-100">
                Add Trotro to your Home Screen
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                Tap <b>Share</b> (square with ↑) → <b>Add to Home Screen</b>.
              </div>
              {!isInSafari() && (
                <div className="mt-2 text-xs text-amber-200/90">
                  Tip: Open this page in <b>Safari</b> for “Add to Home Screen”.
                </div>
              )}
            </div>

            <button
              onClick={() => {
                localStorage.setItem("ios_a2hs_dismissed", "1");
                setOpen(false);
              }}
              className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/5 text-zinc-200"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
