import { useEffect, useMemo, useRef, useState } from "react";
import {
  ROUTE_ID,
  supabase,
  messaging,
  VAPID_KEY,
  initAnalytics,
  logEvent,
  openMap
} from "@trotro/shared";
import { getToken, onMessage } from "firebase/messaging";
import { isIOSDevice } from "@trotro/shared";

/** Stable browser device id (like your Android device_id) */
const getWebDeviceId = () => {
  const k = "trotro_web_device_id";
  const v = localStorage.getItem(k);
  if (v) return v;
  const id = crypto.randomUUID();
  localStorage.setItem(k, id);
  return id;
};

const FRESH_MS = 25_000;
const STALE_BADGE_SEC = 15;

const REALTIME_SILENCE_MS = 30_000;
const FALLBACK_POLL_MS = 25_000;

const DEFAULT_DEST_KEY = "trotro_default_destination_passenger_web";
const IOS_INSTALL_VIDEO = "https://youtube.com/shorts/QsyLxX3B8t8?feature=share";

const isStandalonePWA = () =>
  window.matchMedia?.("(display-mode: standalone)")?.matches ||
  window.navigator.standalone === true;

const isAndroidChrome = () => {
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isChrome = /Chrome/i.test(ua) && !/Edg/i.test(ua) && !/OPR/i.test(ua);
  return isAndroid && isChrome;
};

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className="fixed top-3 left-0 right-0 z-[60] mx-auto max-w-md px-5">
      <div
        className={
          "rounded-2xl border p-3 text-sm backdrop-blur " +
          (toast.type === "error"
            ? "border-red-500/30 bg-red-500/10 text-red-100"
            : toast.type === "success"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
            : "border-white/10 bg-white/5 text-zinc-100")
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="whitespace-pre-wrap">{toast.message}</div>
          <button onClick={onClose} className="text-zinc-300 hover:text-white">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function InstallSheet({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="absolute left-0 right-0 bottom-0 mx-auto max-w-md rounded-t-3xl border border-white/10 bg-zinc-950 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-black tracking-wide text-zinc-100">Install instructions</div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm text-zinc-200">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="font-semibold text-zinc-100">Android (Chrome)</div>
            <ol className="mt-2 list-decimal pl-5 space-y-1 text-zinc-300">
              <li>Open this site in Chrome.</li>
              <li>Tap the menu ⋮ (top-right).</li>
              <li>Tap <span className="text-zinc-100 font-semibold">Install app</span> or <span className="text-zinc-100 font-semibold">Add to Home screen</span>.</li>
              <li>Open it from the new icon for the best experience.</li>
            </ol>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="font-semibold text-zinc-100">iPhone (Safari)</div>
            <ol className="mt-2 list-decimal pl-5 space-y-1 text-zinc-300">
              <li>Open in Safari (not Chrome).</li>
              <li>Tap Share → <span className="text-zinc-100 font-semibold">Add to Home Screen</span>.</li>
              <li>Open from the icon to enable the best notification support.</li>
            </ol>
            <div className="mt-2 text-zinc-400">
              Video: {IOS_INSTALL_VIDEO}
            </div>
          </div>
        </div>

        <div className="mt-3 h-1 w-16 mx-auto rounded-full bg-white/10" />
      </div>
    </div>
  );
}

function DestinationSheet({ open, onClose, destinations, selectedId, onSelect }) {
  const [q, setQ] = useState("");

  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  if (!open) return null;

  const filtered = (destinations || []).filter((d) =>
    (d.name || "").toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="absolute left-0 right-0 bottom-0 mx-auto max-w-md rounded-t-3xl border border-white/10 bg-zinc-950 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-black tracking-wide text-zinc-100">Select destination</div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">✕</button>
        </div>

        <div className="mt-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search destination…"
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
          />
        </div>

        <div className="mt-3 max-h-[55vh] overflow-auto pr-1">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">
              No matches.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((d) => {
                const active = d.id === selectedId;
                return (
                  <button
                    key={d.id}
                    onClick={() => {
                      onSelect(d);
                      onClose();
                    }}
                    className={
                      "w-full rounded-2xl border px-4 py-4 text-left active:scale-[0.99] " +
                      (active
                        ? "border-amber-400 bg-amber-400/15"
                        : "border-white/10 bg-white/5 hover:bg-white/10")
                    }
                  >
                    <div className="text-lg font-semibold text-zinc-100">{d.name}</div>
                    {active ? <div className="text-xs text-amber-300 mt-1">Selected</div> : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-3 h-1 w-16 mx-auto rounded-full bg-white/10" />
      </div>
    </div>
  );
}

export default function Passenger() {
  const [destinations, setDestinations] = useState([]);
  const [stops, setStops] = useState([]);

  const [selectedDest, setSelectedDest] = useState(null);
  const [selectedStop, setSelectedStop] = useState(null);

  const [loading, setLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("");
  const [locationHelp, setLocationHelp] = useState("");

  const [pushEnabled, setPushEnabled] = useState(false);

  // Drivers online
  const [driversOnlineRaw, setDriversOnlineRaw] = useState([]);

  // UI
  const [tab, setTab] = useState("stops"); // "stops" | "drivers"
  const [destSheetOpen, setDestSheetOpen] = useState(false);
  const [installSheetOpen, setInstallSheetOpen] = useState(false);

  // Toasts
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const notify = (type, message, ms = 2400) => {
    setToast({ type, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), ms);
  };
  useEffect(() => () => toastTimerRef.current && clearTimeout(toastTimerRef.current), []);

  // Request sent / cancel state
  const [requestState, setRequestState] = useState(null); // { id, createdAtMs, destinationName, stopName }
  useEffect(() => {
    if (!requestState) return;
    const t = setTimeout(() => setRequestState(null), 30_000);
    return () => clearTimeout(t);
  }, [requestState]);

  const [lastRealtimeAt, setLastRealtimeAt] = useState(0);
  const [driversRefreshTick, setDriversRefreshTick] = useState(0);

  const isIOS = isIOSDevice();
  const deviceId = useMemo(() => getWebDeviceId(), []);

  // Analytics init
  useEffect(() => {
    initAnalytics({
      userId: deviceId,
      userProps: { app_role: "passenger", platform: "web" }
    });
  }, [deviceId]);

  // Foreground messages
  useEffect(() => {
    const unsub = onMessage(messaging, (payload) => {
      const title = payload?.notification?.title || "Trotro";
      const body = payload?.notification?.body || "";
      notify("info", `${title}\n${body}`, 4500);
    });
    return () => unsub();
  }, []);

  const enableNotifications = async () => {
    try {
      if (!("Notification" in window)) {
        notify("error", "This browser does not support notifications.");
        return;
      }

      const standalone = isStandalonePWA();

      // iOS requires install-from-home-screen for reliable push
      if (isIOS && !standalone) {
        notify(
          "info",
          "On iPhone: install this web app first (Safari → Share → Add to Home Screen), then open from the icon to enable notifications.",
          7000
        );
        setInstallSheetOpen(true);
        return;
      }

      // Android Chrome doesn’t strictly require install, but users benefit from it.
      if (isAndroidChrome() && !standalone) {
        notify("info", "Tip: Install this app on Android Chrome (⋮ → Install app) for a faster, app-like experience.", 6000);
      }

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        notify("error", "Notifications blocked.");
        return;
      }

      const swReg = await navigator.serviceWorker.ready;

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg
      });

      if (!token) {
        notify("error", "Could not get push token.");
        return;
      }

      const { error } = await supabase.from("push_tokens").upsert(
        {
          device_id: deviceId,
          app: "web_passenger",
          platform: "web",
          fcm_token: token,
          updated_at: new Date().toISOString()
        },
        { onConflict: "device_id,app" }
      );

      if (error) {
        notify("error", "Failed to save push token: " + error.message, 5000);
        return;
      }

      setPushEnabled(true);

      if (selectedDest?.id) {
        await supabase.from("push_tokens").upsert(
          {
            device_id: deviceId,
            app: "web_passenger",
            platform: "web",
            last_destination_id: selectedDest.id,
            updated_at: new Date().toISOString()
          },
          { onConflict: "device_id,app" }
        );
      }

      notify("success", "Notifications enabled ✅");
    } catch (e) {
      notify("error", "Notifications setup failed: " + (e?.message || e), 5000);
    }
  };

  const refreshDestinations = async () => {
    const { data, error } = await supabase.from("destinations").select("id,name").order("name");
    if (error) return;

    const list = data || [];
    setDestinations(list);

    const saved = localStorage.getItem(DEFAULT_DEST_KEY);
    if (saved && !selectedDest) {
      const d = list.find((x) => x.id === saved);
      if (d) loadStops(d);
    }
  };

  useEffect(() => {
    refreshDestinations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStops = async (dest) => {
    setSelectedDest(dest);
    setSelectedStop(null);
    setLocationHelp("");
    setGpsStatus("");
    setTab("stops");

    logEvent("destination_selected", { destination_id: dest.id });

    await supabase.from("push_tokens").upsert(
      {
        device_id: deviceId,
        app: "web_passenger",
        platform: "web",
        last_destination_id: dest.id,
        updated_at: new Date().toISOString()
      },
      { onConflict: "device_id,app" }
    );

    const { data, error } = await supabase
      .from("route_stops")
      .select("id,name,stop_order")
      .eq("destination_id", dest.id)
      .eq("route_id", ROUTE_ID)
      .order("stop_order");

    if (!error) setStops(data || []);
  };

  const isUnknownStopSelected = useMemo(() => {
    const name = (selectedStop?.name || "").trim().toLowerCase();
    return (
      name.includes("don't know my stop") ||
      name.includes("dont know my stop") ||
      name.includes("don\u2019t know my stop")
    );
  }, [selectedStop]);

  const setHelpForDeniedLocation = () => {
    setLocationHelp(
      isIOS
        ? "Location is blocked. On iPhone: Settings → Safari → Location → While Using / Ask. Also ensure Settings → Privacy & Security → Location Services is ON. Then reload this page."
        : "Location is blocked. In your browser: click the lock icon → Site settings → Location → Allow. Then refresh."
    );
  };

  const insertPassenger = async (lat, lng) => {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const expiresIso = new Date(now + 5 * 60 * 1000).toISOString();

    try {
      // Reuse existing active request for this device if present
      const { data: existing, error: existingErr } = await supabase
        .from("waiting_passengers")
        .select("id,expires_at,active")
        .eq("route_id", ROUTE_ID)
        .eq("destination_id", selectedDest.id)
        .eq("device_id", deviceId)
        .eq("active", true)
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingErr) throw existingErr;

      let requestId = existing?.id ?? null;

      if (!requestId) {
        const { data, error } = await supabase
          .from("waiting_passengers")
          .insert({
            device_id: deviceId,
            stop_id: selectedStop.id,
            destination_id: selectedDest.id,
            route_id: ROUTE_ID,
            lat,
            lng,
            active: true,
            last_seen: nowIso,
            expires_at: expiresIso
          })
          .select("id")
          .single();

        if (error) throw error;
        requestId = data?.id ?? null;
      } else {
        // Refresh last_seen so the driver side sees it as fresh
        await supabase.from("waiting_passengers").update({ last_seen: nowIso }).eq("id", requestId);
      }

      setLoading(false);
      setGpsStatus("");

      logEvent("pickup_requested", {
        request_id: requestId,
        destination_id: selectedDest.id,
        stop_id: selectedStop.id,
        route_id: ROUTE_ID,
        gps_shared: lat != null && lng != null
      });

      setRequestState({
        id: requestId,
        createdAtMs: now,
        destinationName: selectedDest.name,
        stopName: selectedStop.name
      });

      notify("success", lat != null && lng != null ? "Request sent ✅ (GPS shared)" : "Request sent ✅");
    } catch (e) {
      setLoading(false);
      setGpsStatus("");
      logEvent("pickup_request_failed", { reason: e?.message || String(e) });
      notify("error", "Failed to request pickup. Please try again.", 5000);
    }
  };

  const cancelRequest = async () => {
    if (!requestState?.id) return;
    try {
      const { error } = await supabase.from("waiting_passengers").update({ active: false }).eq("id", requestState.id);
      if (error) throw error;
      logEvent("pickup_cancelled", { request_id: requestState.id });
      setRequestState(null);
      notify("success", "Cancelled ✅");
    } catch (e) {
      notify("error", "Failed to cancel: " + (e?.message || e), 5000);
    }
  };

  const confirmPickup = async () => {
    if (!selectedDest || !selectedStop || loading) return;

    setLoading(true);
    setGpsStatus("📍 Checking location permission…");
    setLocationHelp("");

    let permState = "unknown";
    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: "geolocation" });
        permState = status.state;
      } catch {}
    }

    const mustHaveGps = isUnknownStopSelected;

    if (mustHaveGps) {
      if (!navigator.geolocation) {
        setLoading(false);
        setGpsStatus("");
        setLocationHelp(
          isIOS
            ? "Your browser can’t access location. Use Safari and enable Location Services."
            : "Your browser can’t access location. Try Chrome and allow Location for this site."
        );
        return;
      }
      if (permState === "denied") {
        setLoading(false);
        setGpsStatus("");
        setHelpForDeniedLocation();
        return;
      }
    }

    setGpsStatus("📍 Getting your location…");

    navigator.geolocation?.getCurrentPosition(
      async (pos) => {
        await insertPassenger(pos.coords.latitude, pos.coords.longitude);
      },
      async () => {
        if (mustHaveGps) {
          setLoading(false);
          setGpsStatus("");
          setHelpForDeniedLocation();
          return;
        }
        await insertPassenger(null, null);
      },
      {
        enableHighAccuracy: mustHaveGps,
        timeout: mustHaveGps ? 45000 : 15000,
        maximumAge: mustHaveGps ? 10000 : 60000
      }
    );
  };

  /* ===== LIVE DRIVERS ONLINE (drivers_online) ===== */
  useEffect(() => {
    if (!selectedDest?.id) {
      setDriversOnlineRaw([]);
      return;
    }

    let alive = true;

    const fetchDriversOnline = async () => {
      const { data, error } = await supabase
        .from("drivers_online")
        .select("driver_id,lat,lng,online,active,route_id,destination_id,updated_at,last_seen")
        .eq("route_id", ROUTE_ID);

      if (!error && alive) setDriversOnlineRaw(data || []);
    };

    fetchDriversOnline();

    const channel = supabase
      .channel("drivers_online_changes_passenger_web")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers_online", filter: `route_id=eq.${ROUTE_ID}` },
        () => {
          setLastRealtimeAt(Date.now());
          fetchDriversOnline();
        }
      )
      .subscribe();

    const t = setInterval(() => {
      const silence = Date.now() - (lastRealtimeAt || 0);
      if (silence >= REALTIME_SILENCE_MS) fetchDriversOnline();
    }, FALLBACK_POLL_MS);

    return () => {
      alive = false;
      clearInterval(t);
      supabase.removeChannel(channel);
    };
  }, [selectedDest?.id, lastRealtimeAt, driversRefreshTick]);

  const driversOnline = useMemo(() => {
    if (!selectedDest?.id) return [];
    const now = Date.now();

    return (driversOnlineRaw || [])
      .filter((d) => d.route_id === ROUTE_ID)
      .filter((d) => d.destination_id === selectedDest.id)
      .filter((d) => d.online === true && d.active === true)
      .filter((d) => {
        const t = d.last_seen || d.updated_at;
        if (!t) return false;
        const ms = new Date(t).getTime();
        if (!Number.isFinite(ms)) return false;
        return now - ms <= FRESH_MS;
      })
      .sort((a, b) => {
        const ta = new Date(a.last_seen || a.updated_at || 0).getTime();
        const tb = new Date(b.last_seen || b.updated_at || 0).getTime();
        return tb - ta;
      });
  }, [driversOnlineRaw, selectedDest]);

  const waitingLabel = selectedStop ? "Waiting ✅" : "Waiting";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="mx-auto max-w-md px-5 pb-28">
        {/* Top bar */}
        <div className="pt-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">🚌</div>
            <div className="text-2xl font-black tracking-tight">Trotro</div>
          </div>
          <div className="text-sm text-zinc-400">{waitingLabel}</div>
        </div>

        {/* Hero graphic */}
        <div className="mt-5 relative h-24">
          <div className="absolute inset-0">
            <svg viewBox="0 0 400 120" className="w-full h-full">
              <path
                d="M10,90 C80,20 160,120 240,60 C300,20 340,70 390,40"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <circle cx="300" cy="45" r="8" fill="#fbbf24" />
            </svg>
          </div>
        </div>

        <div className="mt-2 text-zinc-400 text-lg">Waiting for driver...</div>

        {/* Request Sent Card */}
        {requestState ? (
          <div className="mt-4 rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-4">
            <div className="text-sm font-semibold text-emerald-100">Request sent ✅</div>
            <div className="mt-1 text-sm text-emerald-100/80">
              {requestState.stopName} → {requestState.destinationName}
            </div>
            <button
              onClick={cancelRequest}
              className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Cancel request
            </button>
          </div>
        ) : null}

        {/* Destination card */}
        <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs tracking-widest text-zinc-400">DESTINATION</div>
          <div className="mt-2 text-sm text-amber-400 font-semibold">Select destination</div>

          <div className="mt-1 relative">
            <button onClick={() => setDestSheetOpen(true)} className="w-full text-left pr-10">
              <div className="text-2xl font-black text-zinc-100">
                {selectedDest?.name || "Select..."}
              </div>
            </button>
            <div className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-zinc-300">
              ▾
            </div>
          </div>

          <div className="mt-3 h-[2px] w-full bg-amber-400/90 rounded-full" />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={enableNotifications}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 active:scale-[0.99]"
            >
              {pushEnabled ? "Notifications ✅" : "Enable notifications"}
            </button>

            <button
              onClick={() => setInstallSheetOpen(true)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 active:scale-[0.99]"
            >
              Install app
            </button>

            {selectedDest ? (
              <button
                onClick={() => {
                  localStorage.setItem(DEFAULT_DEST_KEY, selectedDest.id);
                  notify("success", "Default destination saved ✅");
                }}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 active:scale-[0.99]"
              >
                Set Default Destination
              </button>
            ) : null}
          </div>
        </div>

        {/* Tabs */}
        {selectedDest ? (
          <div className="mt-6">
            <div className="flex items-center justify-center gap-10 text-sm tracking-widest">
              <button
                onClick={() => setTab("stops")}
                className={"pb-2 " + (tab === "stops" ? "text-zinc-100" : "text-zinc-500")}
              >
                STOPS
                {tab === "stops" ? (
                  <div className="mt-2 h-[2px] bg-amber-400 rounded-full" />
                ) : (
                  <div className="mt-2 h-[2px] bg-transparent" />
                )}
              </button>

              <button
                onClick={() => setTab("drivers")}
                className={"pb-2 " + (tab === "drivers" ? "text-zinc-100" : "text-zinc-500")}
              >
                DRIVERS
                {tab === "drivers" ? (
                  <div className="mt-2 h-[2px] bg-amber-400 rounded-full" />
                ) : (
                  <div className="mt-2 h-[2px] bg-transparent" />
                )}
              </button>
            </div>

            <div className="mt-6">
              {tab === "stops" ? (
                stops.length === 0 ? (
                  <div className="text-zinc-500">No stops for this destination yet.</div>
                ) : (
                  <div className="space-y-5">
                    {stops.map((s) => {
                      const lower = (s.name || "").trim().toLowerCase();
                      const isUnknown =
                        lower.includes("don't know my stop") ||
                        lower.includes("dont know my stop") ||
                        lower.includes("don\u2019t know my stop");

                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSelectedStop(s);
                            setLocationHelp("");
                            setGpsStatus("");
                            logEvent("stop_selected", { stop_id: s.id, destination_id: selectedDest.id });
                          }}
                          className="w-full text-left active:scale-[0.99]"
                        >
                          <div className="text-xl font-semibold text-zinc-100">{s.name}</div>
                          <div className="text-sm text-zinc-500">
                            {selectedStop?.id === s.id
                              ? "Selected ✅"
                              : isUnknown
                              ? "Uses your GPS to help the driver find you."
                              : "Tap to select"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                <div>
                  <div className="flex items-center justify-between">
                    <div className="text-zinc-400 text-sm">Drivers nearby</div>
                    <button
                      onClick={() => {
                        setDriversRefreshTick((x) => x + 1);
                        notify("info", "Refreshing…", 1200);
                      }}
                      className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="mt-3">
                    {driversOnline.length === 0 ? (
                      <div className="text-zinc-500">
                        🚗 No driver nearby
                        <div className="text-zinc-600 text-sm mt-1">
                          Drivers appear here when they broadcast.
                        </div>
                        <div className="text-zinc-600 text-sm mt-1">
                          If drivers are indoors GPS may delay updates.
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {driversOnline.map((d, idx) => {
                          const ts = d.last_seen || d.updated_at;
                          const ageSec = ts
                            ? Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000))
                            : null;
                          const stale = ageSec != null && ageSec >= STALE_BADGE_SEC;

                          return (
                            <button
                              key={d.driver_id}
                              onClick={() => {
                                logEvent("maps_opened", {
                                  context: "view_driver_location",
                                  provider: "google_maps",
                                  route_id: ROUTE_ID,
                                  destination_id: selectedDest.id,
                                  driver_id: d.driver_id
                                });
                                openMap(d.lat, d.lng);
                              }}
                              className="w-full text-left active:scale-[0.99]"
                            >
                              <div className="text-xl font-semibold text-zinc-100">
                                🚗 Driver {idx + 1} nearby
                              </div>
                              <div className="text-sm text-zinc-500">
                                Tap to open in Maps
                                {ageSec != null ? ` • Updated ${ageSec}s ago` : ""}
                                {stale ? " • ⚠️ Stale" : ""}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {gpsStatus ? <div className="mt-6 text-center text-sm text-zinc-400">{gpsStatus}</div> : null}

            {locationHelp ? (
              <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                {locationHelp}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Bottom CTA */}
        <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur border-t border-white/10">
          <div className="mx-auto max-w-md px-5 py-4">
            <button
              onClick={confirmPickup}
              disabled={!selectedDest || !selectedStop || loading}
              className={
                "w-full rounded-3xl py-5 text-lg font-black tracking-wide active:scale-[0.99] " +
                (!selectedDest || !selectedStop || loading
                  ? "bg-amber-400/30 text-amber-100/70"
                  : "bg-amber-400 text-zinc-950")
              }
            >
              {loading ? "REQUESTING..." : "CONFIRM PICKUP"}
            </button>
          </div>
        </div>

        {/* Sheets */}
        <DestinationSheet
          open={destSheetOpen}
          onClose={() => setDestSheetOpen(false)}
          destinations={destinations}
          selectedId={selectedDest?.id || null}
          onSelect={loadStops}
        />

        <InstallSheet open={installSheetOpen} onClose={() => setInstallSheetOpen(false)} />
      </div>
    </div>
  );
}