"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import LogoutButton from "@/components/LogoutButton";
import type { VehicleMapData } from "@/components/MapView";

// Leaflet reads `window` as soon as it is imported, which does not exist
// during server-side rendering. Loading the map with next/dynamic and
// ssr: false skips server rendering for this component entirely, so it
// only ever runs in the browser.
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-neutral-500">
      Loading map...
    </div>
  ),
});

const POLL_INTERVAL_MS = 3000;
const DEFAULT_CORRIDOR_M = 150;

interface VehicleData extends VehicleMapData {
  lastUpdate: string;
}

interface RouteData {
  id: number;
  name: string;
  points: [number, number][];
  corridorM: number;
}

interface VehicleOption {
  id: number;
  username: string;
}

interface AssignmentData {
  id: number;
  routeId: number;
  vehicleUserId: number;
  vehicleUsername: string;
}

interface AlertData {
  id: number;
  vehicleUserId: number;
  vehicleUsername: string;
  routeName: string;
  distanceM: number;
  createdAt: string;
}

function formatRelativeTime(iso: string): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  );
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// A short synthesized beep, played through the Web Audio API so no audio
// file needs to ship with the app. Browsers block audio until the page has
// received a user gesture, which is why the AudioContext is only created
// on the dashboard's first click rather than up front.
function playAlertBeep(context: AudioContext) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.25, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.4);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.4);
}

export default function SystemDashboard({ username }: { username: string }) {
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [panToVehicleId, setPanToVehicleId] = useState<number | null>(null);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);

  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [visibleRouteIds, setVisibleRouteIds] = useState<Set<number>>(new Set());
  const [routesError, setRoutesError] = useState<string | null>(null);

  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [corridorM, setCorridorM] = useState(DEFAULT_CORRIDOR_M);
  const [savingRoute, setSavingRoute] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [assignments, setAssignments] = useState<AssignmentData[]>([]);
  const [selectedVehicleByRoute, setSelectedVehicleByRoute] = useState<
    Record<number, string>
  >({});
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  const [unacknowledgedAlerts, setUnacknowledgedAlerts] = useState<AlertData[]>([]);
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<AlertData[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const seenAlertIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    function initAudio() {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
    }
    document.addEventListener("click", initAudio, { once: true });
    return () => document.removeEventListener("click", initAudio);
  }, []);

  const fetchPositions = useCallback(async () => {
    try {
      const response = await fetch("/api/positions");
      if (!response.ok) {
        setVehiclesError("Could not load vehicle positions.");
        return;
      }
      const data = await response.json();
      setVehicles(data.vehicles);
      setVehiclesError(null);
    } catch {
      setVehiclesError("Network error loading vehicle positions.");
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  const fetchRoutes = useCallback(async () => {
    try {
      const response = await fetch("/api/routes");
      if (!response.ok) {
        setRoutesError("Could not load routes.");
        return;
      }
      const data = await response.json();
      setRoutes(data.routes);
      setRoutesError(null);
    } catch {
      setRoutesError("Network error loading routes.");
    } finally {
      setRoutesLoading(false);
    }
  }, []);

  useEffect(() => {
    // The initial fetch is scheduled through setTimeout, alongside the
    // recurring one through setInterval, so both calls into fetchPositions
    // happen from a timer callback rather than directly in the effect
    // body -- the effect's own job is only to start and stop the polling.
    const initialFetch = setTimeout(fetchPositions, 0);
    const interval = setInterval(fetchPositions, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [fetchPositions]);

  useEffect(() => {
    // Routes only change through this dashboard's own create/delete
    // actions, so a one-time load is enough -- no polling needed.
    const initialFetch = setTimeout(fetchRoutes, 0);
    return () => clearTimeout(initialFetch);
  }, [fetchRoutes]);

  const fetchVehicleOptions = useCallback(async () => {
    try {
      const response = await fetch("/api/vehicles");
      if (!response.ok) {
        setAssignmentError("Could not load vehicle list.");
        return;
      }
      const data = await response.json();
      setVehicleOptions(data.vehicles);
    } catch {
      setAssignmentError("Network error loading vehicle list.");
    }
  }, []);

  const fetchAssignments = useCallback(async () => {
    try {
      const response = await fetch("/api/assignments");
      if (!response.ok) {
        setAssignmentError("Could not load assignments.");
        return;
      }
      const data = await response.json();
      setAssignments(data.assignments);
    } catch {
      setAssignmentError("Network error loading assignments.");
    }
  }, []);

  useEffect(() => {
    // Same one-time-load reasoning as routes: this data only changes
    // through actions taken in this same dashboard.
    const initialFetch = setTimeout(() => {
      fetchVehicleOptions();
      fetchAssignments();
    }, 0);
    return () => clearTimeout(initialFetch);
  }, [fetchVehicleOptions, fetchAssignments]);

  const fetchAlerts = useCallback(async () => {
    try {
      const response = await fetch("/api/alerts");
      if (!response.ok) {
        setAlertsError("Could not load alerts.");
        return;
      }
      const data = await response.json();
      const unacknowledged: AlertData[] = data.unacknowledged;

      // Only alerts not already seen on a previous poll should trigger the
      // sound -- otherwise the same still-unacknowledged alert would beep
      // again every 3 seconds for as long as it stays open.
      const hasNewAlert = unacknowledged.some(
        (alert) => !seenAlertIdsRef.current.has(alert.id)
      );
      unacknowledged.forEach((alert) => seenAlertIdsRef.current.add(alert.id));

      if (hasNewAlert && audioContextRef.current) {
        playAlertBeep(audioContextRef.current);
      }

      setUnacknowledgedAlerts(unacknowledged);
      setAcknowledgedAlerts(data.acknowledged);
      setAlertsError(null);
    } catch {
      setAlertsError("Network error loading alerts.");
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialFetch = setTimeout(fetchAlerts, 0);
    const interval = setInterval(fetchAlerts, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [fetchAlerts]);

  function startDrawing() {
    setDrawing(true);
    setDraftPoints([]);
    setShowSaveForm(false);
    setSaveError(null);
    setRouteName("");
    setCorridorM(DEFAULT_CORRIDOR_M);
  }

  function cancelDrawing() {
    setDrawing(false);
    setDraftPoints([]);
    setShowSaveForm(false);
    setSaveError(null);
  }

  function handleMapClick(lat: number, lng: number) {
    if (!drawing) return;
    setDraftPoints((points) => [...points, [lat, lng]]);
  }

  function undoLastPoint() {
    setDraftPoints((points) => points.slice(0, -1));
  }

  async function handleSaveRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingRoute(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: routeName,
          points: draftPoints,
          corridor_m: corridorM,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setSaveError(data.error ?? "Could not save route.");
        return;
      }

      setRoutes((current) => [data.route, ...current]);
      cancelDrawing();
    } catch {
      setSaveError("Network error saving route.");
    } finally {
      setSavingRoute(false);
    }
  }

  function toggleRouteVisible(id: number) {
    setVisibleRouteIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleDeleteRoute(id: number) {
    if (!window.confirm("Delete this route? This cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`/api/routes/${id}`, { method: "DELETE" });
      if (!response.ok) {
        setRoutesError("Could not delete route.");
        return;
      }
      setRoutes((current) => current.filter((route) => route.id !== id));
      setVisibleRouteIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      // The database cascades the delete to any assignments for this
      // route, so the local copy of assignments needs to drop them too.
      setAssignments((current) =>
        current.filter((assignment) => assignment.routeId !== id)
      );
    } catch {
      setRoutesError("Network error deleting route.");
    }
  }

  async function handleAssign(routeId: number) {
    const vehicleUserId = Number(selectedVehicleByRoute[routeId]);
    if (!vehicleUserId) return;

    setAssignmentError(null);

    try {
      const response = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route_id: routeId, vehicle_user_id: vehicleUserId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setAssignmentError(data.error ?? "Could not assign route.");
        return;
      }

      // The server just deactivated this vehicle's previous assignment (if
      // any), so drop it locally too before adding the new one.
      setAssignments((current) => [
        data.assignment,
        ...current.filter((a) => a.vehicleUserId !== vehicleUserId),
      ]);
      setSelectedVehicleByRoute((current) => ({ ...current, [routeId]: "" }));
    } catch {
      setAssignmentError("Network error assigning route.");
    }
  }

  async function handleUnassign(assignmentId: number) {
    setAssignmentError(null);

    try {
      const response = await fetch(`/api/assignments/${assignmentId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setAssignmentError("Could not unassign route.");
        return;
      }
      setAssignments((current) =>
        current.filter((assignment) => assignment.id !== assignmentId)
      );
    } catch {
      setAssignmentError("Network error unassigning route.");
    }
  }

  async function handleAcknowledge(alertId: number) {
    setAlertsError(null);

    try {
      const response = await fetch(`/api/alerts/${alertId}/ack`, {
        method: "POST",
      });
      if (!response.ok) {
        setAlertsError("Could not acknowledge alert.");
        return;
      }
      // The next poll (within 3 seconds) will pick this alert up in the
      // acknowledged history from the server, so only the unacknowledged
      // list needs a local update here.
      setUnacknowledgedAlerts((current) =>
        current.filter((alert) => alert.id !== alertId)
      );
    } catch {
      setAlertsError("Network error acknowledging alert.");
    }
  }

  const visibleRoutes = routes
    .filter((route) => visibleRouteIds.has(route.id))
    .map((route) => ({ id: route.id, points: route.points }));

  const alertedVehicleIds = new Set(
    unacknowledgedAlerts.map((alert) => alert.vehicleUserId)
  );
  const vehiclesForMap = vehicles.map((vehicle) => ({
    ...vehicle,
    hasAlert: alertedVehicleIds.has(vehicle.id),
  }));

  return (
    <main className="flex flex-1 overflow-hidden bg-neutral-950 text-white">
      <aside className="flex w-72 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900 p-4">
        <h1 className="text-lg font-semibold">CorridorEye</h1>
        <p className="mt-1 text-xs text-neutral-500">
          Logged in as{" "}
          <span className="font-medium text-neutral-300">{username}</span>
        </p>

        <div className="mt-4 flex-1 space-y-6 overflow-y-auto">
          <section>
            <h2 className="text-sm font-semibold text-neutral-400">
              Live Vehicles
            </h2>

            {vehiclesError && (
              <p className="mt-2 text-xs text-red-400">{vehiclesError}</p>
            )}

            {vehiclesLoading && (
              <p className="mt-2 text-sm text-neutral-500">Loading...</p>
            )}
            {!vehiclesLoading && vehicles.length === 0 && !vehiclesError && (
              <p className="mt-2 text-sm text-neutral-500">
                No vehicles have reported a position yet.
              </p>
            )}

            <ul className="mt-2 space-y-1">
              {vehicles.map((vehicle) => (
                <li key={vehicle.id}>
                  <button
                    onClick={() => setPanToVehicleId(vehicle.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-neutral-800"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        alertedVehicleIds.has(vehicle.id)
                          ? "bg-red-500"
                          : vehicle.isLive
                          ? "bg-green-500"
                          : "bg-neutral-600"
                      }`}
                    />
                    <span className="flex-1 truncate text-sm">
                      {vehicle.username}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {formatRelativeTime(vehicle.lastUpdate)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-neutral-400">Alerts</h2>

            {alertsError && (
              <p className="mt-2 text-xs text-red-400">{alertsError}</p>
            )}

            {alertsLoading && (
              <p className="mt-2 text-sm text-neutral-500">Loading...</p>
            )}
            {!alertsLoading &&
              unacknowledgedAlerts.length === 0 &&
              acknowledgedAlerts.length === 0 &&
              !alertsError && (
                <p className="mt-2 text-sm text-neutral-500">No alerts yet.</p>
              )}

            {unacknowledgedAlerts.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {unacknowledgedAlerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="rounded border border-red-700 bg-red-950/60 p-2"
                  >
                    <p className="text-xs font-medium text-red-300">
                      {alert.vehicleUsername} left &quot;{alert.routeName}&quot;
                    </p>
                    <p className="mt-0.5 text-xs text-red-400/80">
                      {Math.round(alert.distanceM)}m off route,{" "}
                      {new Date(alert.createdAt).toLocaleTimeString()}
                    </p>
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      className="mt-1.5 w-full rounded bg-red-600 py-1 text-xs font-medium hover:bg-red-500"
                    >
                      Acknowledge
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {acknowledgedAlerts.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {acknowledgedAlerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="rounded px-2 py-1 text-xs text-neutral-500"
                  >
                    {alert.vehicleUsername} acknowledged,{" "}
                    {new Date(alert.createdAt).toLocaleTimeString()}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-neutral-400">Routes</h2>

            {!drawing && (
              <button
                onClick={startDrawing}
                className="mt-2 w-full rounded bg-blue-600 py-1.5 text-sm font-medium hover:bg-blue-500"
              >
                Draw Route
              </button>
            )}

            {drawing && (
              <div className="mt-2 rounded border border-neutral-700 bg-neutral-800 p-2">
                <p className="text-xs text-neutral-400">
                  Click the map to add points. Points: {draftPoints.length}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={undoLastPoint}
                    disabled={draftPoints.length === 0}
                    className="flex-1 rounded border border-neutral-600 py-1 text-xs hover:bg-neutral-700 disabled:opacity-40"
                  >
                    Undo point
                  </button>
                  <button
                    onClick={cancelDrawing}
                    className="flex-1 rounded border border-neutral-600 py-1 text-xs hover:bg-neutral-700"
                  >
                    Cancel
                  </button>
                </div>

                {!showSaveForm && draftPoints.length >= 2 && (
                  <button
                    onClick={() => setShowSaveForm(true)}
                    className="mt-2 w-full rounded bg-green-600 py-1.5 text-sm font-medium hover:bg-green-500"
                  >
                    Save Route
                  </button>
                )}

                {showSaveForm && (
                  <form onSubmit={handleSaveRoute} className="mt-2 space-y-2">
                    <input
                      type="text"
                      placeholder="Route name"
                      value={routeName}
                      onChange={(event) => setRouteName(event.target.value)}
                      required
                      className="w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                    <input
                      type="number"
                      min={1}
                      placeholder="Corridor width (m)"
                      value={corridorM}
                      onChange={(event) => setCorridorM(Number(event.target.value))}
                      required
                      className="w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                    {saveError && (
                      <p className="text-xs text-red-400">{saveError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={savingRoute}
                      className="w-full rounded bg-green-600 py-1.5 text-sm font-medium hover:bg-green-500 disabled:opacity-50"
                    >
                      {savingRoute ? "Saving..." : "Confirm Save"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {routesError && (
              <p className="mt-2 text-xs text-red-400">{routesError}</p>
            )}
            {assignmentError && (
              <p className="mt-2 text-xs text-red-400">{assignmentError}</p>
            )}

            {routesLoading && (
              <p className="mt-2 text-sm text-neutral-500">Loading...</p>
            )}
            {!routesLoading && routes.length === 0 && !routesError && (
              <p className="mt-2 text-sm text-neutral-500">
                No routes saved yet.
              </p>
            )}

            <ul className="mt-2 space-y-2">
              {routes.map((route) => {
                const isVisible = visibleRouteIds.has(route.id);
                const routeAssignments = assignments.filter(
                  (a) => a.routeId === route.id
                );
                return (
                  <li
                    key={route.id}
                    className={`rounded px-2 py-1.5 hover:bg-neutral-800 ${
                      routeAssignments.length > 0
                        ? "border-l-2 border-green-500"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleRouteVisible(route.id)}
                        className="flex-1 truncate text-left text-sm"
                      >
                        <span className={isVisible ? "text-blue-400" : "text-neutral-300"}>
                          {route.name}
                        </span>{" "}
                        <span className="text-xs text-neutral-500">
                          ({route.corridorM}m)
                        </span>
                      </button>
                      <button
                        onClick={() => handleDeleteRoute(route.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>

                    {routeAssignments.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {routeAssignments.map((assignment) => (
                          <li
                            key={assignment.id}
                            className="flex items-center justify-between text-xs text-neutral-400"
                          >
                            <span>
                              Assigned to {assignment.vehicleUsername}
                            </span>
                            <button
                              onClick={() => handleUnassign(assignment.id)}
                              className="text-red-400 hover:text-red-300"
                            >
                              Unassign
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-1.5 flex items-center gap-1">
                      <select
                        value={selectedVehicleByRoute[route.id] ?? ""}
                        onChange={(event) =>
                          setSelectedVehicleByRoute((current) => ({
                            ...current,
                            [route.id]: event.target.value,
                          }))
                        }
                        className="flex-1 rounded border border-neutral-600 bg-neutral-900 px-1 py-0.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">Assign to...</option>
                        {vehicleOptions.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.username}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAssign(route.id)}
                        disabled={!selectedVehicleByRoute[route.id]}
                        className="rounded bg-blue-600 px-2 py-0.5 text-xs hover:bg-blue-500 disabled:opacity-40"
                      >
                        Assign
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="mt-4">
          <LogoutButton />
        </div>
      </aside>

      <div className="flex-1">
        <MapView
          vehicles={vehiclesForMap}
          panToVehicleId={panToVehicleId}
          drawingMode={drawing}
          draftPoints={draftPoints}
          onMapClick={handleMapClick}
          visibleRoutes={visibleRoutes}
        />
      </div>

      {unacknowledgedAlerts.length > 0 && (
        <div className="fixed inset-0 z-2000 flex items-start justify-center bg-black/50 px-4 pt-16">
          <div className="w-full max-w-sm space-y-3">
            {unacknowledgedAlerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-lg border border-red-600 bg-red-950 p-4 shadow-2xl"
              >
                <p className="font-semibold text-red-100">
                  {alert.vehicleUsername} has left the assigned route
                </p>
                <p className="mt-1 text-sm text-red-300">
                  {Math.round(alert.distanceM)} m from &quot;{alert.routeName}
                  &quot;
                </p>
                <button
                  onClick={() => handleAcknowledge(alert.id)}
                  className="mt-3 w-full rounded bg-red-600 py-1.5 text-sm font-medium text-white hover:bg-red-500"
                >
                  Acknowledge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
