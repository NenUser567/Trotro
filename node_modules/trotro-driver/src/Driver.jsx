import { useEffect, useMemo, useRef, useState } from "react";
import {
  ROUTE_ID,
  supabase,
  openMap,
  messaging,
  VAPID_KEY,
  initAnalytics,
  logEvent
} from "@trotro/shared";
import { getToken, onMessage } from "firebase/messaging";

const getWebDeviceId = () => {
  const k = "trotro_web_device_id_driver";
  const v = localStorage.getItem(k);
  if (v) return v;
  const id = crypto.randomUUID();
  localStorage.setItem(k, id);
  return id;
};

const DEFAULT_DEST_KEY = "trotro_default_destination_driver_web";

const SEND_MIN_MS = 3000;
const MOVE_MIN_M = 10;
const HEARTBEAT_MS = 15000;
const HIDDEN_HEARTBEAT_MS = 30000;

const REALTIME_SILENCE_MS = 30_000;
const FALLBACK_POLL_MS = 25_000;

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
          <button onClick={onClose} className="text-zinc-300 hover:text-white">✕</button>
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
          <button onClick={onClose} className="text-zinc-400 hover:text-white">✕</button>
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
            <div className="font-semibold text-zinc-100">Note</div>
            <div className="mt-2 text-zinc-300">
              Installing doesn’t magically fix GPS, but it reduces “tab killed / background throttling” issues and feels more reliable.
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

export default function Driver() {
  const [destinations, setDestinations] = useState([]);
  const [stops, setStops] = useState([]);
  const [passengers, setPassengers] = useState([]);

  const [selectedDest, setSelectedDest] = useState(null);
  const [selectedStop, setSelectedStop] = useState(null);

  const [pushEnabled, setPushEnabled] = useState(false);

  // Broadcasting
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastErr, setBroadcastErr] = useState("");
  const watchIdRef = useRef(null);
  const lastSentRef = useRef({ t: 0, lat: null, lng: null });

  // UI
  const [tab, setTab] = useState("stops"); // "stops" | "passengers"
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

  const deviceId = useMemo(() => getWebDeviceId(), []);

  // Analytics init
  useEffect(() => {
    initAnalytics({
      userId: deviceId,
      userProps: { app_role: "driver", platform: "web" }
    });
  }, [deviceId]);

  // Foreground push messages
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
      if (isAndroidChrome() && !standalone) {
        notify("info", "Tip: Install this app on Android Chrome (⋮ → Install app) for better reliability.", 6000);
      }

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        notify("error", "Notifications blocked.");
        return;
      }

      if (!("serviceWorker" in navigator)) {
        notify("error", "Service workers are not supported in this browser.");
        return;
      }

      logEvent("app_open", { app_role: "driver", platform: "web" });

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
          app: "web_driver",
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
            app: "web_driver",
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
      if (d) selectDestination(d);
    }
  };

  const refreshStops = async (destId) => {
    const { data, error } = await supabase
      .from("route_stops")
      .select("id,name,stop_order")
      .eq("destination_id", destId)
      .eq("route_id", ROUTE_ID)
      .order("stop_order");

    if (!error) setStops(data || []);
  };

  useEffect(() => {
    refreshDestinations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedDest) return;
    refreshStops(selectedDest.id);
  }, [selectedDest]);

  /* ===== PASSENGERS (realtime + fallback poll only) ===== */
  const [lastRealtimeAt, setLastRealtimeAt] = useState(0);
  const [passengerRefreshTick, setPassengerRefreshTick] = useState(0);

  useEffect(() => {
    if (!selectedDest) return;

    let alive = true;

    const fetchPassengers = async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("waiting_passengers")
        .select("*")
        .eq("destination_id", selectedDest.id)
        .eq("route_id", ROUTE_ID)
        .eq("active", true)
        .gt("expires_at", now)
        .order("created_at", { ascending: true });

      if (!error && alive) setPassengers(data || []);
    };

    fetchPassengers();

    const channel = supabase
      .channel("waiting_passengers_changes_driver_web")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waiting_passengers", filter: `route_id=eq.${ROUTE_ID}` },
        () => {
          setLastRealtimeAt(Date.now());
          fetchPassengers();
        }
      )
      .subscribe();

    const t = setInterval(() => {
      const silence = Date.now() - (lastRealtimeAt || 0);
      if (silence >= REALTIME_SILENCE_MS) fetchPassengers();
    }, FALLBACK_POLL_MS);

    return () => {
      alive = false;
      clearInterval(t);
      supabase.removeChannel(channel);
    };
  }, [selectedDest, lastRealtimeAt, passengerRefreshTick]);

  const passengerMap = useMemo(() => {
    const map = {};
    for (const p of passengers) {
      map[p.stop_id] = map[p.stop_id] || [];
      map[p.stop_id].push(p);
    }
    return map;
  }, [passengers]);

  const waitingCount = useMemo(() => passengers.filter((p) => p.active).length, [passengers]);

  const selectedStopPassengers = useMemo(() => {
    if (!selectedStop?.id) return [];
    return passengerMap[selectedStop.id] || [];
  }, [passengerMap, selectedStop]);

  const acknowledgePickup = async (p) => {
    logEvent("passenger_seen", {
      request_id: p.id,
      destination_id: p.destination_id,
      stop_id: p.stop_id
    });

    logEvent("maps_opened", {
      context: "navigate_to_passenger",
      provider: "google_maps",
      request_id: p.id,
      destination_id: p.destination_id,
      stop_id: p.stop_id
    });

    openMap(p.lat, p.lng);

    logEvent("passenger_acknowledged", {
      request_id: p.id,
      destination_id: p.destination_id,
      stop_id: p.stop_id,
      route_id: ROUTE_ID
    });

    await supabase.from("waiting_passengers").update({ active: false }).eq("id", p.id);
    notify("success", "Passenger accepted ✅");
  };

  const selectDestination = async (d) => {
    setSelectedDest(d);
    setSelectedStop(null);
    setTab("stops");

    logEvent("destination_selected", { destination_id: d.id });

    await supabase.from("push_tokens").upsert(
      {
        device_id: deviceId,
        app: "web_driver",
        platform: "web",
        last_destination_id: d.id,
        updated_at: new Date().toISOString()
      },
      { onConflict: "device_id,app" }
    );

    if (isBroadcasting) {
      await supabase.from("drivers_online").upsert(
        {
          driver_id: deviceId,
          route_id: ROUTE_ID,
          destination_id: d.id,
          online: true,
          active: true,
          updated_at: new Date().toISOString(),
          last_seen: new Date().toISOString()
        },
        { onConflict: "driver_id" }
      );
    }
  };

  /* ===== DRIVER LOCATION BROADCASTING (drivers_online) ===== */
  const haversineMeters = (lat1, lng1, lat2, lng2) => {
    if ([lat1, lng1, lat2, lng2].some((v) => v == null)) return Infinity;
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  const upsertDriversOnline = async (pos) => {
    const c = pos.coords;

    const payload = {
      driver_id: deviceId,
      lat: c.latitude,
      lng: c.longitude,
      online: true,
      active: true,
      route_id: ROUTE_ID,
      destination_id: selectedDest?.id ?? null,
      updated_at: new Date().toISOString(),
      last_seen: new Date().toISOString()
    };

    const { error } = await supabase.from("drivers_online").upsert(payload, {
      onConflict: "driver_id"
    });

    if (error) throw error;
  };

  const startBroadcasting = async () => {
    setBroadcastErr("");

    if (!("geolocation" in navigator)) {
      setBroadcastErr("Geolocation is not supported in this browser.");
      return;
    }
    if (!selectedDest?.id) {
      setBroadcastErr("Select a destination first before broadcasting.");
      return;
    }

    logEvent("driver_broadcast_start", { route_id: ROUTE_ID, destination_id: selectedDest.id });

    const onSuccess = async (pos) => {
      try {
        const now = Date.now();
        const last = lastSentRef.current;

        const moved = haversineMeters(last.lat, last.lng, pos.coords.latitude, pos.coords.longitude);
        const dueByTime = now - last.t >= SEND_MIN_MS;
        const dueByMove = moved >= MOVE_MIN_M;

        const heartbeatMs = document.hidden ? HIDDEN_HEARTBEAT_MS : HEARTBEAT_MS;
        const dueByHeartbeat = now - last.t >= heartbeatMs;

        // If hidden: avoid spam; only heartbeat
        if (document.hidden && !dueByHeartbeat) return;

        if (!dueByTime && !dueByMove && !dueByHeartbeat) return;

        await upsertDriversOnline(pos);

        lastSentRef.current = {
          t: now,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
      } catch (e) {
        setBroadcastErr("Failed to broadcast location: " + (e?.message || e));
      }
    };

    const onError = (err) => {
      const msg = err?.message || "Could not read location.";
      if (err?.code === 3) {
        setBroadcastErr(
          "Location is taking too long (GPS timeout). Try moving outdoors / turning on Location / using high accuracy."
        );
        return;
      }
      setBroadcastErr(msg);
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 45000,
      maximumAge: 10000
    });

    const id = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 45000,
      maximumAge: 10000
    });

    watchIdRef.current = id;
    setIsBroadcasting(true);
    notify("success", "Broadcasting started ✅");
  };

  const stopBroadcasting = async () => {
    setBroadcastErr("");

    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setIsBroadcasting(false);

    await supabase
      .from("drivers_online")
      .update({
        online: false,
        active: false,
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("driver_id", deviceId);

    logEvent("driver_broadcast_stop", { route_id: ROUTE_ID });
    notify("info", "Broadcasting stopped");
  };

  // Force send immediately when tab becomes visible again
  useEffect(() => {
    const onVis = () => {
      if (!isBroadcasting) return;
      if (!document.hidden) {
        lastSentRef.current.t = 0; // force update next position
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              await upsertDriversOnline(pos);
              lastSentRef.current = {
                t: Date.now(),
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
              };
            } catch {}
          },
          () => {},
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      }
    };

    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isBroadcasting]);

  // Best-effort offline update on unload/pagehide
  useEffect(() => {
    const goOffline = () => {
      try {
        if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      } catch {}

      try {
        supabase
          .from("drivers_online")
          .update({
            online: false,
            active: false,
            last_seen: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("driver_id", deviceId);
      } catch {}
    };

    window.addEventListener("pagehide", goOffline);
    window.addEventListener("beforeunload", goOffline);

    return () => {
      window.removeEventListener("pagehide", goOffline);
      window.removeEventListener("beforeunload", goOffline);
    };
  }, [deviceId]);

  // Component unmount cleanup (extra safety)
  useEffect(() => {
    return () => {
      try {
        if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      } catch {}
      supabase
        .from("drivers_online")
        .update({
          online: false,
          active: false,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("driver_id", deviceId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptPassenger = async () => {
    if (!selectedStopPassengers.length) return;
    await acknowledgePickup(selectedStopPassengers[0]);
  };

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
          <div className="text-sm text-zinc-400">Pickup code ----</div>
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
              <circle cx="140" cy="55" r="8" fill="#fbbf24" />
            </svg>
          </div>
        </div>

        <div className="mt-2 text-zinc-400 text-lg">{waitingCount} waiting</div>

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
            <div className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-zinc-300">▾</div>
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
              onClick={isBroadcasting ? stopBroadcasting : startBroadcasting}
              className={
                "rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/10 active:scale-[0.99] " +
                (isBroadcasting ? "bg-amber-400 text-zinc-950" : "bg-white/5 text-zinc-100")
              }
            >
              {isBroadcasting ? "Broadcasting ✅" : "Start broadcast"}
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
                className="w-full mt-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold hover:bg-white/10 active:scale-[0.99]"
              >
                Set Default Destination
              </button>
            ) : null}
          </div>

          {broadcastErr ? (
            <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {broadcastErr}
            </div>
          ) : null}
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
                onClick={() => setTab("passengers")}
                className={"pb-2 " + (tab === "passengers" ? "text-zinc-100" : "text-zinc-500")}
              >
                PASSENGERS
                {tab === "passengers" ? (
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
                    {stops.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSelectedStop(s);
                          setTab("passengers");
                          logEvent("stop_selected", { stop_id: s.id, destination_id: selectedDest.id });
                        }}
                        className="w-full text-left active:scale-[0.99]"
                      >
                        <div className="text-xl font-semibold text-zinc-100">{s.name}</div>
                        <div className="text-sm text-zinc-500">
                          Waiting: {(passengerMap[s.id] || []).length}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div>
                  <div className="flex items-center justify-between">
                    <div className="text-zinc-400 text-sm">
                      {selectedStop ? `Passengers at ${selectedStop.name}` : "Passengers"}
                    </div>
                    <button
                      onClick={() => {
                        setPassengerRefreshTick((x) => x + 1);
                        notify("info", "Refreshing…", 1200);
                      }}
                      className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="mt-3">
                    {!selectedStop ? (
                      <div className="text-zinc-500">
                        ⏳ Waiting
                        <div className="text-zinc-600 text-sm mt-1">Tap a stop to select</div>
                      </div>
                    ) : selectedStopPassengers.length === 0 ? (
                      <div className="text-zinc-500">No passengers waiting at {selectedStop.name}.</div>
                    ) : (
                      <div className="space-y-5">
                        {selectedStopPassengers.map((p, i) => (
                          <button
                            key={p.id}
                            onClick={() => acknowledgePickup(p)}
                            className="w-full text-left active:scale-[0.99]"
                          >
                            <div className="text-xl font-semibold text-zinc-100">⏳ Waiting</div>
                            <div className="text-sm text-zinc-500">Passenger {i + 1} • Tap to accept</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Bottom CTA */}
        <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur border-t border-white/10">
          <div className="mx-auto max-w-md px-5 py-4 flex items-center gap-3">
            <button
              onClick={acceptPassenger}
              disabled={!selectedStop || selectedStopPassengers.length === 0}
              className={
                "flex-1 rounded-3xl py-5 text-lg font-black tracking-wide active:scale-[0.99] " +
                (!selectedStop || selectedStopPassengers.length === 0
                  ? "bg-amber-400/30 text-amber-100/70"
                  : "bg-amber-400 text-zinc-950")
              }
            >
              ACCEPT PASSENGER
            </button>

            <div className="text-sm text-zinc-400 whitespace-nowrap">
              Passengers: {selectedStop ? selectedStopPassengers.length : 0}
            </div>
          </div>
        </div>

        <DestinationSheet
          open={destSheetOpen}
          onClose={() => setDestSheetOpen(false)}
          destinations={destinations}
          selectedId={selectedDest?.id || null}
          onSelect={(d) => selectDestination(d)}
        />

        <InstallSheet open={installSheetOpen} onClose={() => setInstallSheetOpen(false)} />
      </div>
    </div>
  );
}