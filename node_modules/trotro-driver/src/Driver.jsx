import { useEffect, useMemo, useState } from "react";
import { ROUTE_ID, supabase, openMap } from "@trotro/shared";
import {
  Card,
  CardBody,
  Divider,
  Hero,
  Pill,
  SectionTitle,
  SelectCard,
  SelectionSummary,
  TextInput
} from "@trotro/shared";

export default function Driver() {
  const [destinations, setDestinations] = useState([]);
  const [stops, setStops] = useState([]);
  const [passengers, setPassengers] = useState([]);

  const [selectedDest, setSelectedDest] = useState(null);
  const [selectedStop, setSelectedStop] = useState(null);

  const [newDest, setNewDest] = useState("");
  const [newStop, setNewStop] = useState("");

  const [openMenuId, setOpenMenuId] = useState(null);

  const refreshDestinations = async () => {
    const { data, error } = await supabase
      .from("destinations")
      .select("id,name")
      .order("name");
    if (!error) setDestinations(data || []);
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
  }, []);

  useEffect(() => {
    if (!selectedDest) return;
    refreshStops(selectedDest.id);
  }, [selectedDest]);

  useEffect(() => {
    if (!selectedDest) return;

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

      if (!error) setPassengers(data || []);
    };

    fetchPassengers();

    const channel = supabase
      .channel("waiting_passengers_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "waiting_passengers",
          filter: `route_id=eq.${ROUTE_ID}`
        },
        () => fetchPassengers()
      )
      .subscribe();

    const t = setInterval(fetchPassengers, 5000);

    return () => {
      clearInterval(t);
      supabase.removeChannel(channel);
    };
  }, [selectedDest]);

  const passengerMap = useMemo(() => {
    const map = {};
    for (const p of passengers) {
      map[p.stop_id] = map[p.stop_id] || [];
      map[p.stop_id].push(p);
    }
    return map;
  }, [passengers]);

  const waitingCount = useMemo(
    () => passengers.filter((p) => p.active).length,
    [passengers]
  );

  const acknowledgePickup = async (p) => {
    openMap(p.lat, p.lng);
    await supabase.from("waiting_passengers").update({ active: false }).eq("id", p.id);
  };

  /* ===== DESTINATIONS CRUD ===== */
  const addDestination = async () => {
    const name = newDest.trim();
    if (!name) return;

    const { error } = await supabase.from("destinations").insert({ name });
    if (error) return alert("❌ Failed to add destination.");

    setNewDest("");
    refreshDestinations();
  };

  const renameDestination = async (dest, newName) => {
    const name = (newName || "").trim();
    if (!name) return;

    const { error } = await supabase.from("destinations").update({ name }).eq("id", dest.id);
    if (error) return alert("❌ Failed to rename destination.");

    setDestinations((prev) => prev.map((d) => (d.id === dest.id ? { ...d, name } : d)));
    if (selectedDest?.id === dest.id) setSelectedDest((d) => ({ ...d, name }));
  };

  const deleteDestination = async (dest) => {
    const ok = window.confirm(
      `Delete destination "${dest.name}"?\n\nWith ON DELETE CASCADE, its stops + related waiting passengers will also be deleted.`
    );
    if (!ok) return;

    const { error } = await supabase.from("destinations").delete().eq("id", dest.id);
    if (error) return alert("❌ Failed to delete destination. Ensure CASCADE FKs are set.");

    setDestinations((prev) => prev.filter((d) => d.id !== dest.id));
    if (selectedDest?.id === dest.id) {
      setSelectedDest(null);
      setSelectedStop(null);
      setStops([]);
      setPassengers([]);
    }
  };

  /* ===== STOPS CRUD ===== */
  const addStop = async () => {
    const name = newStop.trim();
    if (!name || !selectedDest) return;

    const last = stops[stops.length - 1]?.stop_order || 0;

    const { error } = await supabase.from("route_stops").insert({
      route_id: ROUTE_ID,
      destination_id: selectedDest.id,
      name,
      stop_order: last + 1
    });

    if (error) return alert("❌ Failed to add stop.");

    setNewStop("");
    refreshStops(selectedDest.id);
  };

  const renameStop = async (stop, newName) => {
    const name = (newName || "").trim();
    if (!name) return;

    const { error } = await supabase.from("route_stops").update({ name }).eq("id", stop.id);
    if (error) return alert("❌ Failed to rename stop.");

    setStops((prev) => prev.map((s) => (s.id === stop.id ? { ...s, name } : s)));
    if (selectedStop?.id === stop.id) setSelectedStop((s) => ({ ...s, name }));
  };

  const deleteStop = async (stop) => {
    const ok = window.confirm(
      `Delete stop "${stop.name}"?\n\nWith ON DELETE CASCADE, related waiting passengers will also be deleted.`
    );
    if (!ok) return;

    const { error } = await supabase.from("route_stops").delete().eq("id", stop.id);
    if (error) return alert("❌ Failed to delete stop. Ensure CASCADE FKs are set.");

    setStops((prev) => prev.filter((s) => s.id !== stop.id));
    if (selectedStop?.id === stop.id) setSelectedStop(null);
    setPassengers((prev) => prev.filter((p) => p.stop_id !== stop.id));
  };

  return (
    <div className="space-y-4">
      <Hero
        title="Driver"
        subtitle="Manage destinations/stops and pick up passengers."
        right={<Pill tone="accent">{waitingCount} waiting</Pill>}
      />

      <SelectionSummary mode="driver" destination={selectedDest} stop={selectedStop} />

      {/* DESTINATIONS + ADD */}
      <Card>
        <CardBody className="space-y-3">
          <SectionTitle right={<Pill tone="neutral">CRUD</Pill>}>
            Destinations
          </SectionTitle>

          <div className="flex gap-2">
            <TextInput
              value={newDest}
              onChange={(e) => setNewDest(e.target.value)}
              placeholder="Add destination"
            />
            <button
              onClick={addDestination}
              className="shrink-0 rounded-2xl bg-amber-500 px-4 text-xl font-black text-zinc-950 shadow-sm active:scale-[0.99]"
              aria-label="Add destination"
            >
              +
            </button>
          </div>

          <Divider />

          {destinations.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">
              No destinations yet.
            </div>
          ) : (
            <div className="space-y-3">
              {destinations.map((d) => (
                <SelectCard
                  key={d.id}
                  menuId={`dest:${d.id}`}
                  title={d.name}
                  subtitle={selectedDest?.id === d.id ? "Selected" : null}
                  selected={selectedDest?.id === d.id}
                  menuOpen={openMenuId === `dest:${d.id}`}
                  setMenuOpen={setOpenMenuId}
                  onSelect={() => {
                    setOpenMenuId(null);
                    setSelectedDest(d);
                    setSelectedStop(null);
                  }}
                  onEdit={() => {
                    const nn = window.prompt("Rename destination:", d.name);
                    if (nn != null) renameDestination(d, nn);
                  }}
                  onDelete={() => deleteDestination(d)}
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* STOPS + ADD */}
      {selectedDest && (
        <Card>
          <CardBody className="space-y-3">
            <SectionTitle right={<Pill tone="accent">{selectedDest.name}</Pill>}>
              Stops
            </SectionTitle>

            <div className="flex gap-2">
              <TextInput
                value={newStop}
                onChange={(e) => setNewStop(e.target.value)}
                placeholder="Add stop"
              />
              <button
                onClick={addStop}
                className="shrink-0 rounded-2xl bg-white/10 px-4 text-xl font-black text-zinc-100 border border-white/10 hover:bg-white/15 active:scale-[0.99]"
                aria-label="Add stop"
              >
                +
              </button>
            </div>

            <Divider />

            {stops.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">
                No stops yet.
              </div>
            ) : (
              <div className="space-y-3">
                {stops.map((s) => (
                  <SelectCard
                    key={s.id}
                    menuId={`stop:${s.id}`}
                    title={s.name}
                    subtitle={selectedStop?.id === s.id ? "Selected" : null}
                    selected={selectedStop?.id === s.id}
                    right={<Pill tone="accent">{passengerMap[s.id]?.length || 0}</Pill>}
                    menuOpen={openMenuId === `stop:${s.id}`}
                    setMenuOpen={setOpenMenuId}
                    onSelect={() => {
                      setOpenMenuId(null);
                      setSelectedStop(s);
                    }}
                    onEdit={() => {
                      const nn = window.prompt("Rename stop:", s.name);
                      if (nn != null) renameStop(s, nn);
                    }}
                    onDelete={() => deleteStop(s)}
                  />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* PASSENGERS */}
      {selectedStop && (
        <Card>
          <CardBody className="space-y-3">
            <SectionTitle right={<Pill tone="neutral">{selectedStop.name}</Pill>}>
              Passengers
            </SectionTitle>

            {(passengerMap[selectedStop.id] || []).length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">
                No waiting passengers right now.
              </div>
            ) : (
              <div className="space-y-3">
                {(passengerMap[selectedStop.id] || []).map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => acknowledgePickup(p)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left flex items-center justify-between hover:bg-white/10 active:scale-[0.99]"
                  >
                    <div>
                      <div className="text-base font-semibold">Passenger {i + 1}</div>
                      <div className="text-xs text-zinc-500">
                        {p.lat != null && p.lng != null ? "GPS shared" : "No GPS (stop pickup)"}
                      </div>
                    </div>
                    <div className="text-xl">{p.lat != null && p.lng != null ? "📍" : "🚏"}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="text-xs text-zinc-500">
              Tip: Tapping a passenger opens directions, then marks them as picked up.
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
