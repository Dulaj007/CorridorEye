"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Tooltip,
  Polyline,
  CircleMarker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

export interface VehicleMapData {
  id: number;
  username: string;
  lat: number;
  lng: number;
  isLive: boolean;
  trail: [number, number][];
  hasAlert: boolean;
}

export interface RouteMapData {
  id: number;
  points: [number, number][];
}

interface MapViewProps {
  vehicles: VehicleMapData[];
  panToVehicleId: number | null;
  drawingMode: boolean;
  draftPoints: [number, number][];
  onMapClick: (lat: number, lng: number) => void;
  visibleRoutes: RouteMapData[];
}

const COLOMBO: [number, number] = [6.9271, 79.8612];
const LIVE_COLOR = "#22c55e"; // green-500
const OFFLINE_COLOR = "#737373"; // neutral-500
const ALERT_COLOR = "#ef4444"; // red-500
const ROUTE_COLOR = "#3b82f6"; // blue-500
const DRAFT_COLOR = "#60a5fa"; // blue-400

// Leaflet's default marker relies on image files that Next.js does not
// automatically serve from node_modules, which is a common source of
// broken/invisible markers in a Next.js + Leaflet setup. Using a small
// colored circle built from HTML/CSS (a "div icon") avoids that problem
// entirely and also gives an easy way to color markers by live/offline
// status.
function createVehicleIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.6);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

const liveIcon = createVehicleIcon(LIVE_COLOR);
const offlineIcon = createVehicleIcon(OFFLINE_COLOR);
const alertIcon = createVehicleIcon(ALERT_COLOR);

// An unacknowledged alert takes visual priority over live/offline status --
// an off-route vehicle should stand out in red even while still reporting
// positions normally.
function iconForVehicle(vehicle: VehicleMapData): L.DivIcon {
  if (vehicle.hasAlert) return alertIcon;
  return vehicle.isLive ? liveIcon : offlineIcon;
}

// Pans the map to a vehicle whenever the sidebar selection changes. This
// has to live inside <MapContainer> because useMap() only works there.
// vehiclesRef holds the latest vehicle list without being a dependency of
// the effect, so a 3-second position refresh does not re-trigger a pan --
// only an actual click in the sidebar (a panToVehicleId change) does.
function PanToVehicle({
  vehiclesRef,
  panToVehicleId,
}: {
  vehiclesRef: React.RefObject<VehicleMapData[]>;
  panToVehicleId: number | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (panToVehicleId == null) return;
    const vehicle = vehiclesRef.current.find((v) => v.id === panToVehicleId);
    if (vehicle) {
      map.flyTo([vehicle.lat, vehicle.lng], Math.max(map.getZoom(), 14));
    }
  }, [panToVehicleId, vehiclesRef, map]);

  return null;
}

// Listens for clicks on the map and reports them upward while drawing mode
// is on. This has to live inside <MapContainer> because useMapEvents()
// only works there; it renders nothing itself.
function MapClickHandler({
  enabled,
  onMapClick,
}: {
  enabled: boolean;
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(event) {
      if (enabled) {
        onMapClick(event.latlng.lat, event.latlng.lng);
      }
    },
  });
  return null;
}

export default function MapView({
  vehicles,
  panToVehicleId,
  drawingMode,
  draftPoints,
  onMapClick,
  visibleRoutes,
}: MapViewProps) {
  const vehiclesRef = useRef(vehicles);
  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  return (
    <MapContainer
      center={COLOMBO}
      zoom={12}
      scrollWheelZoom
      className={`h-full w-full ${drawingMode ? "cursor-crosshair" : ""}`}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {visibleRoutes.map((route) => (
        <Polyline
          key={`route-${route.id}`}
          positions={route.points}
          pathOptions={{ color: ROUTE_COLOR, weight: 5, opacity: 0.8 }}
        />
      ))}

      {draftPoints.length > 1 && (
        <Polyline
          positions={draftPoints}
          pathOptions={{
            color: DRAFT_COLOR,
            weight: 4,
            opacity: 0.9,
            dashArray: "6 6",
          }}
        />
      )}
      {draftPoints.map((point, index) => (
        <CircleMarker
          key={`draft-${index}`}
          center={point}
          radius={5}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: DRAFT_COLOR,
            fillOpacity: 1,
          }}
        />
      ))}

      {vehicles.map(
        (vehicle) =>
          vehicle.trail.length > 1 && (
            <Polyline
              key={`trail-${vehicle.id}`}
              positions={vehicle.trail}
              pathOptions={{
                color: vehicle.isLive ? LIVE_COLOR : OFFLINE_COLOR,
                weight: 3,
                opacity: 0.5,
              }}
            />
          )
      )}

      {vehicles.map((vehicle) => (
        <Marker
          key={vehicle.id}
          position={[vehicle.lat, vehicle.lng]}
          icon={iconForVehicle(vehicle)}
        >
          <Tooltip permanent direction="top" offset={[0, -10]}>
            {vehicle.username}
            {!vehicle.isLive && " (offline)"}
            {vehicle.hasAlert && " (off route)"}
          </Tooltip>
        </Marker>
      ))}

      <PanToVehicle vehiclesRef={vehiclesRef} panToVehicleId={panToVehicleId} />
      <MapClickHandler enabled={drawingMode} onMapClick={onMapClick} />
    </MapContainer>
  );
}
