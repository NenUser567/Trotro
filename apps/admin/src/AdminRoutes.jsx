import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, ROUTE_ID, ADMIN_API_BASE } from "./supabaseClient";

function parseBulkLines(text) {
  return (text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function adminFetch(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      // only if your worker checks it. harmless if not used.
      "x-admin-token": token || ""
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

function Toast({ msg, onClose }) {
  if (!msg) return null;
  return (
    <div className="fixed top-3 left-0 right-0 z-50 mx-auto max-w-2xl px-4">
      <div className="rounded-2xl border border-white/10 bg-zinc-950/90 p-3 text-sm text-zinc-100 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="whitespace-pre-wrap">{msg}</div>
          <button className="text-zinc-400 hover:text-white" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminRoutes() {
  const [token, setToken] = useState(() => sessionStorage.getItem("admin_token") || "");
  const [toast, setToast] = useState("");

  const notify = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  // Data
  const [destinations, setDestinations] = useState([]);
  const [stops, setStops] = useState([]);

  // UI state
  const [selectedDestId, setSelectedDestId] = useState("");
  const selectedDest = useMemo(
    () => destinations.find((d) => d.id === selectedDestId) || null,
    [destinations, selectedDestId]
  );

  // Forms
  const [newDestName, setNewDestName] = useState("");
  const [bulkDestText, setBulkDestText] = useState("");

  const [newStopName, setNewStopName] = useState("");
  const [bulkStopText, setBulkStopText] = useState("");

  const [loading, setLoading] = useState(false);

  // Keep scroll stable when stops update
  const stopsListRef = useRef(null);

  useEffect(() => {
    sessionStorage.setItem("admin_token", token);
  }, [token]);

  // ---------- LOAD DESTINATIONS (read direct from Supabase) ----------
  const loadDestinations = async () => {
    const { data, error } = await supabase.from("destinations").select("id,name").order("name");
    if (error) throw error;
    setDestinations(data || []);
    if (!selectedDestId && data?.[0]?.id) setSelectedDestId(data[0].id);
  };

  // ---------- LOAD STOPS (read direct from Supabase) ----------
  const loadStops = async (destId) => {
    if (!destId) {
      setStops([]);
      return;
    }
    const { data, error } = await supabase
      .from("route_stops")
      .select("id,name,stop_order,route_id,destination_id")
      .eq("route_id", ROUTE_ID)
      .eq("destination_id", destId)
      .order("stop_order");
    if (error) throw error;
    setStops(data || []);
  };

  // initial load
  useEffect(() => {
    (async () => {
      try {
        await loadDestinations();
      } catch (e) {
        notify("Failed to load destinations: " + (e?.message || e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load stops when destination changes
  useEffect(() => {
    (async () => {
      try {
        await loadStops(selectedDestId);
      } catch (e) {
        notify("Failed to load stops: " + (e?.message || e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDestId]);

  // ---------- REALTIME SUBSCRIPTIONS (read direct from Supabase) ----------
  useEffect(() => {
    const ch1 = supabase
      .channel("admin_destinations_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "destinations" }, () => {
        loadDestinations().catch(() => {});
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedDestId) return;

    const ch2 = supabase
      .channel("admin_stops_realtime_" + selectedDestId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "route_stops",
          filter: `destination_id=eq.${selectedDestId}`
        },
        () => {
          const el = stopsListRef.current;
          const prevTop = el ? el.scrollTop : null;

          loadStops(selectedDestId)
            .then(() => {
              if (el && prevTop != null) el.scrollTop = prevTop;
            })
            .catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDestId]);

  // ---------- DESTINATIONS CRUD (write via Worker) ----------
  const createDestination = async () => {
    const name = newDestName.trim();
    if (!name) return;

    setLoading(true);
    try {
      await adminFetch("/api/destinations", {
        token,
        method: "POST",
        body: { name }
      });
      setNewDestName("");
      notify("Destination added ✅");
    } catch (e) {
      notify("Add destination failed: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Worker DOES NOT support bulk destinations yet.
  // Keep UI but do it by calling POST repeatedly.
  const bulkCreateDestinations = async () => {
    const names = parseBulkLines(bulkDestText);
    if (!names.length) return;

    setLoading(true);
    try {
      let ok = 0;
      for (const n of names) {
        await adminFetch("/api/destinations", { token, method: "POST", body: { name: n } });
        ok++;
      }
      setBulkDestText("");
      notify(`Added ${ok} destination(s) ✅`);
    } catch (e) {
      notify("Bulk add failed: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const renameDestination = async (id) => {
    const cur = destinations.find((d) => d.id === id);
    const name = prompt("Rename destination:", cur?.name || "");
    if (!name || !name.trim()) return;

    setLoading(true);
    try {
      await adminFetch(`/api/destinations/${id}`, {
        token,
        method: "PATCH",
        body: { name: name.trim() }
      });
      notify("Destination renamed ✅");
    } catch (e) {
      notify("Rename failed: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const deleteDestination = async (id) => {
    const cascade = confirm("Delete destination?\n\nThis will also delete all stops for this destination.");
    if (!cascade) return;

    setLoading(true);
    try {
      await adminFetch(`/api/destinations/${id}`, { token, method: "DELETE" });
      if (selectedDestId === id) setSelectedDestId("");
      notify("Destination deleted ✅");
    } catch (e) {
      notify("Delete failed: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // ---------- STOPS CRUD (write via Worker) ----------
  const nextStopOrder = useMemo(() => {
    if (!stops.length) return 1;
    return Math.max(...stops.map((s) => s.stop_order || 0)) + 1;
  }, [stops]);

  // Worker currently supports bulk insert via /api/stops/bulk.
  // For single stop, we call bulk with one line.
  const createStop = async () => {
    if (!selectedDestId) return;
    const name = newStopName.trim();
    if (!name) return;

    setLoading(true);
    try {
      await adminFetch("/api/stops/bulk", {
        token,
        method: "POST",
        body: {
          destination_id: selectedDestId,
          namesText: name
        }
      });
      setNewStopName("");
      notify("Stop added ✅");
    } catch (e) {
      notify("Add stop failed: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const bulkCreateStops = async () => {
    if (!selectedDestId) return;
    const names = parseBulkLines(bulkStopText);
    if (!names.length) return;

    setLoading(true);
    try {
      await adminFetch("/api/stops/bulk", {
        token,
        method: "POST",
        body: {
          destination_id: selectedDestId,
          namesText: names.join("\n")
        }
      });
      setBulkStopText("");
      notify(`Added ${names.length} stop(s) ✅`);
    } catch (e) {
      notify("Bulk add stops failed: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Worker DOES NOT have stop rename/delete endpoints in the code you pasted.
  // So these two must write directly to Supabase (safe if your current RLS allows it),
  // OR you add endpoints later. For now, we do direct Supabase write to avoid breaking you.
  const renameStop = async (id) => {
    const cur = stops.find((s) => s.id === id);
    const name = prompt("Rename stop:", cur?.name || "");
    if (!name || !name.trim()) return;

    setLoading(true);
    try {
      const { error } = await supabase.from("route_stops").update({ name: name.trim() }).eq("id", id);
      if (error) throw error;
      notify("Stop renamed ✅");
    } catch (e) {
      notify("Rename stop failed: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const deleteStop = async (id) => {
    if (!confirm("Delete this stop?")) return;

    setLoading(true);
    try {
      const { error } = await supabase.from("route_stops").delete().eq("id", id);
      if (error) throw error;
      notify("Stop deleted ✅");
    } catch (e) {
      notify("Delete stop failed: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // ---------- REORDER (write via Worker) ----------
  const moveStop = (id, dir) => {
    const idx = stops.findIndex((s) => s.id === id);
    if (idx < 0) return;

    const j = dir === "up" ? idx - 1 : idx + 1;
    if (j < 0 || j >= stops.length) return;

    const copy = stops.slice();
    const tmp = copy[idx];
    copy[idx] = copy[j];
    copy[j] = tmp;

    const normalized = copy.map((s, k) => ({ ...s, stop_order: k + 1 }));
    setStops(normalized);
  };

  const saveOrder = async () => {
    if (!selectedDestId) return;

    setLoading(true);
    try {
      const ordered_ids = stops.map((s) => s.id); // current UI order is the intended new order
      await adminFetch("/api/stops/reorder", {
        token,
        method: "POST",
        body: { ordered_ids }
      });
      notify("Order saved ✅");
    } catch (e) {
      notify("Save order failed: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Toast msg={toast} onClose={() => setToast("")} />

      <div className="mx-auto max-w-5xl px-5 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-black">Trotro Admin</div>
            <div className="text-sm text-zinc-400 mt-1">Realtime destinations + stops</div>
          </div>

          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs tracking-widest text-zinc-400">ADMIN TOKEN</div>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your admin token here"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
            />
            <div className="mt-2 text-xs text-zinc-500">
              Stored in sessionStorage. (If your Worker isn’t enforcing it yet, you can ignore this field.)
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Destinations */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs tracking-widest text-zinc-400">DESTINATIONS</div>

            <div className="mt-3 flex gap-2">
              <input
                value={newDestName}
                onChange={(e) => setNewDestName(e.target.value)}
                placeholder="New destination name…"
                className="flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none"
              />
              <button
                disabled={loading}
                onClick={createDestination}
                className="rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black text-zinc-950 disabled:opacity-60"
              >
                Add
              </button>
            </div>

            <div className="mt-3">
              <textarea
                value={bulkDestText}
                onChange={(e) => setBulkDestText(e.target.value)}
                placeholder={"Bulk add destinations (one per line)\nExample:\nMadina\nCircle\nKasoa"}
                className="h-28 w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm outline-none"
              />
              <button
                disabled={loading}
                onClick={bulkCreateDestinations}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/15 disabled:opacity-60"
              >
                Bulk add destinations
              </button>
              <div className="mt-2 text-xs text-zinc-500">
                Note: worker doesn’t have a true bulk endpoint for destinations yet — this loops POST calls.
              </div>
            </div>

            <div className="mt-5">
              <div className="text-sm text-zinc-300">Select destination</div>
              <select
                value={selectedDestId}
                onChange={(e) => setSelectedDestId(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none"
              >
                <option value="">-- Select --</option>
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

              {selectedDest ? (
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={loading}
                    onClick={() => renameDestination(selectedDest.id)}
                    className="flex-1 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/15 disabled:opacity-60"
                  >
                    Rename
                  </button>
                  <button
                    disabled={loading}
                    onClick={() => deleteDestination(selectedDest.id)}
                    className="flex-1 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200 hover:bg-red-500/15 disabled:opacity-60"
                  >
                    Delete (cascade)
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {/* Stops */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs tracking-widest text-zinc-400">STOPS</div>
            <div className="mt-1 text-sm text-zinc-400">
              {selectedDest ? `Destination: ${selectedDest.name}` : "Select a destination to manage stops"}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={newStopName}
                onChange={(e) => setNewStopName(e.target.value)}
                placeholder="New stop name…"
                disabled={!selectedDestId}
                className="flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none disabled:opacity-60"
              />
              <button
                disabled={loading || !selectedDestId}
                onClick={createStop}
                className="rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black text-zinc-950 disabled:opacity-60"
              >
                Add
              </button>
            </div>

            <div className="mt-3">
              <textarea
                value={bulkStopText}
                onChange={(e) => setBulkStopText(e.target.value)}
                disabled={!selectedDestId}
                placeholder={"Bulk add stops (one per line)\nExample:\nOld Road\nPolice Station\nMarket"}
                className="h-28 w-full rounded-2xl border border-white/10 bg-black/30 p-3 text-sm outline-none disabled:opacity-60"
              />
              <button
                disabled={loading || !selectedDestId}
                onClick={bulkCreateStops}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/15 disabled:opacity-60"
              >
                Bulk add stops
              </button>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                disabled={loading || !stops.length}
                onClick={saveOrder}
                className="flex-1 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/15 disabled:opacity-60"
              >
                Save order
              </button>
            </div>

            <div
              ref={stopsListRef}
              className="mt-4 max-h-[52vh] overflow-auto rounded-2xl border border-white/10 bg-black/20"
            >
              {stops.length === 0 ? (
                <div className="p-4 text-sm text-zinc-500">No stops yet.</div>
              ) : (
                <div className="divide-y divide-white/10">
                  {stops
                    .slice()
                    .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0))
                    .map((s, idx) => (
                      <div key={s.id} className="p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">
                            {idx + 1}. {s.name}
                          </div>
                          <div className="text-xs text-zinc-500">id: {s.id.slice(0, 8)}…</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => moveStop(s.id, "up")}
                            className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveStop(s.id, "down")}
                            className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15"
                            title="Move down"
                          >
                            ↓
                          </button>

                          <button
                            disabled={loading}
                            onClick={() => renameStop(s.id)}
                            className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15 disabled:opacity-60"
                          >
                            Rename
                          </button>
                          <button
                            disabled={loading}
                            onClick={() => deleteStop(s.id)}
                            className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/15 disabled:opacity-60"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="mt-3 text-xs text-zinc-500">
              Tip: reorder with ↑ ↓ then hit <b>Save order</b>. Realtime updates don’t reset your scroll.
            </div>
          </div>
        </div>

        <div className="mt-8 text-xs text-zinc-500">
          ROUTE_ID: <span className="text-zinc-300">{ROUTE_ID || "(missing VITE_ROUTE_ID)"}</span>
          <br />
          Admin API: <span className="text-zinc-300">{ADMIN_API_BASE || "(missing VITE_ADMIN_API_BASE)"}</span>
        </div>
      </div>
    </div>
  );
}