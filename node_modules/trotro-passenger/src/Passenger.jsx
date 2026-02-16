import { useEffect, useMemo, useState } from "react";
import { ROUTE_ID, supabase } from "@trotro/shared";
import {
  Card,
  CardBody,
  Divider,
  Hero,
  Pill,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  SelectionSummary,
  SelectCard
} from "@trotro/shared";
import { isIOSDevice } from "@trotro/shared";

export default function Passenger() {
  const [destinations, setDestinations] = useState([]);
  const [stops, setStops] = useState([]);

  const [selectedDest, setSelectedDest] = useState(null);
  const [selectedStop, setSelectedStop] = useState(null);

  const [loading, setLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("");
  const [locationHelp, setLocationHelp] = useState("");

  const isIOS = isIOSDevice();

  useEffect(() => {
    refreshDestinations();
  }, []);

  const refreshDestinations = async () => {
    const { data, error } = await supabase
      .from("destinations")
      .select("id,name")
      .order("name");
    if (!error) setDestinations(data || []);
  };

  const loadStops = async (dest) => {
    setSelectedDest(dest);
    setSelectedStop(null);
    setLocationHelp("");

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

  const confirmPickup = async () => {
    if (!selectedDest || !selectedStop) return;

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
        timeout: mustHaveGps ? 12000 : 8000,
        maximumAge: mustHaveGps ? 0 : 60000
      }
    );
  };

  const insertPassenger = async (lat, lng) => {
    const now = Date.now();

    const { error } = await supabase.from("waiting_passengers").insert({
      stop_id: selectedStop.id,
      destination_id: selectedDest.id,
      route_id: ROUTE_ID,
      lat,
      lng,
      active: true,
      last_seen: new Date(now).toISOString(),
      expires_at: new Date(now + 5 * 60 * 1000).toISOString()
    });

    setLoading(false);
    setGpsStatus("");

    if (error) {
      alert("❌ Failed to request pickup. Please try again.");
      return;
    }

    alert(lat != null && lng != null ? "✅ Pickup requested with GPS" : "✅ Pickup requested (no GPS)");
  };

  const step = !selectedDest ? 1 : !selectedStop ? 2 : 3;

  return (
    <div className="space-y-4">
      <Hero
        title="Passenger"
        subtitle={
          step === 1
            ? "Step 1: Choose a destination."
            : step === 2
            ? "Step 2: Choose a stop."
            : "Step 3: Confirm pickup."
        }
        right={<Pill tone="accent">Ready</Pill>}
      />

      <SelectionSummary
        mode="passenger"
        destination={selectedDest}
        stop={selectedStop}
        locationRequired={!!selectedStop && isUnknownStopSelected}
      />

      {/* Destinations */}
      <Card>
        <CardBody className="space-y-3">
          <SectionTitle right={<Pill tone="neutral">Step 1</Pill>}>
            Destination
          </SectionTitle>

          <Divider />

          {destinations.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">
              No destinations yet. Ask a driver/admin to add them.
            </div>
          ) : (
            <div className="space-y-3">
              {destinations.map((d) => (
                <SelectCard
                  key={d.id}
                  menuId={null}
                  title={d.name}
                  subtitle={selectedDest?.id === d.id ? "Selected" : null}
                  selected={selectedDest?.id === d.id}
                  menuOpen={false}
                  setMenuOpen={null}
                  onSelect={() => loadStops(d)}
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Stops */}
      {selectedDest && (
        <Card>
          <CardBody className="space-y-3">
            <SectionTitle
              right={
                <div className="flex items-center gap-2">
                  <Pill tone="neutral">Step 2</Pill>
                  <Pill tone="accent">{selectedDest.name}</Pill>
                </div>
              }
            >
              Stops
            </SectionTitle>

            <Divider />

            {stops.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">
                No stops for this destination yet. Ask a driver/admin to add them.
              </div>
            ) : (
              <div className="space-y-3">
                {stops.map((s) => {
                  const lower = (s.name || "").trim().toLowerCase();
                  const isUnknown =
                    lower.includes("don't know my stop") ||
                    lower.includes("dont know my stop") ||
                    lower.includes("don\u2019t know my stop");

                  return (
                    <SelectCard
                      key={s.id}
                      menuId={null}
                      title={s.name}
                      subtitle={isUnknown ? "Uses your GPS to help the driver find you." : null}
                      selected={selectedStop?.id === s.id}
                      menuOpen={false}
                      setMenuOpen={null}
                      onSelect={() => {
                        setSelectedStop(s);
                        setLocationHelp("");
                      }}
                    />
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* GPS status + help */}
      {gpsStatus && <div className="text-center text-sm text-zinc-400">{gpsStatus}</div>}

      {locationHelp && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          {locationHelp}
        </div>
      )}

      {/* Confirm */}
      {selectedStop && (
        <Card>
          <CardBody className="space-y-3">
            <SectionTitle right={<Pill tone="neutral">Step 3</Pill>}>
              Confirm
            </SectionTitle>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold text-zinc-100">Pickup at:</div>
              <div className="mt-1 text-xs text-zinc-400">
                <span className="text-zinc-200 font-semibold">{selectedDest?.name}</span> •{" "}
                <span className="text-zinc-200 font-semibold">{selectedStop?.name}</span>
              </div>

              <div className="mt-3 text-xs text-zinc-500">
                Location is optional and only helps drivers find you faster.
                <br />
                For “I don’t know my stop”, location is required.
              </div>
            </div>

            <PrimaryButton onClick={confirmPickup} disabled={loading}>
              {loading ? "Requesting pickup…" : "Confirm pickup"}
            </PrimaryButton>

            <SecondaryButton
              onClick={() => {
                setSelectedStop(null);
                setLocationHelp("");
                setGpsStatus("");
              }}
              disabled={loading}
            >
              Change stop
            </SecondaryButton>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
