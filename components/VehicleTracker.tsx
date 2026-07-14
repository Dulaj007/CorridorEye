"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// How often the latest GPS fix is sent to the server. The browser reports
// new fixes much more often than this (sometimes multiple times a second),
// so watchPosition's callback only updates a ref; a separate timer reads
// that ref and sends it on this fixed cadence. This keeps the request rate
// predictable regardless of how chatty the device's GPS is.
const SEND_INTERVAL_MS = 3000;

type Status =
  | "idle"
  | "requesting"
  | "tracking"
  | "permission-denied"
  | "unsupported"
  | "session-expired";

interface LatestFix {
  lat: number;
  lng: number;
  accuracy: number;
}

export default function VehicleTracker() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [wakeLockSupported, setWakeLockSupported] = useState(true);

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const latestFixRef = useRef<LatestFix | null>(null);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  const acquireWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) {
      setWakeLockSupported(false);
      return;
    }
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setWakeLockSupported(true);
    } catch {
      // Wake lock requests can fail for reasons outside our control (low
      // battery mode, an already-backgrounded tab). Treat this the same as
      // "unsupported": tell the driver to keep their screen on manually.
      setWakeLockSupported(false);
    }
  }, []);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    latestFixRef.current = null;
    void releaseWakeLock();
  }, [releaseWakeLock]);

  const sendLatestFix = useCallback(async () => {
    const fix = latestFixRef.current;
    if (!fix) {
      return;
    }

    try {
      const response = await fetch("/api/position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fix),
      });

      if (response.status === 401) {
        stopTracking();
        setStatus("session-expired");
        return;
      }

      if (!response.ok) {
        setWarning("Server rejected the last position. Retrying...");
        return;
      }

      setLastSentAt(new Date());
      setLastAccuracy(fix.accuracy);
      setWarning(null);
    } catch {
      setWarning("Network error sending position. Retrying...");
    }
  }, [stopTracking]);

  const startTracking = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }

    setStatus("requesting");
    setWarning(null);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        latestFixRef.current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setStatus("tracking");
        setWarning(null);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          stopTracking();
          setStatus("permission-denied");
          return;
        }
        // TIMEOUT and POSITION_UNAVAILABLE are usually transient (weak GPS
        // signal indoors, momentary loss of fix). watchPosition keeps
        // calling this callback on its own, so tracking stays active and
        // we just surface a warning instead of stopping.
        setWarning("Waiting for a GPS signal...");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );

    watchIdRef.current = watchId;
    void acquireWakeLock();
    intervalRef.current = setInterval(sendLatestFix, SEND_INTERVAL_MS);
  }, [acquireWakeLock, sendLatestFix, stopTracking]);

  const handleStop = useCallback(() => {
    stopTracking();
    setStatus("idle");
    setLastSentAt(null);
    setLastAccuracy(null);
    setWarning(null);
  }, [stopTracking]);

  // Wake locks are automatically released by the browser when a tab is
  // backgrounded. Re-request one when the driver switches back to this
  // tab, as long as tracking is still meant to be active.
  useEffect(() => {
    function handleVisibilityChange() {
      if (
        document.visibilityState === "visible" &&
        status === "tracking" &&
        wakeLockRef.current === null
      ) {
        void acquireWakeLock();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [status, acquireWakeLock]);

  // Stop everything if the component unmounts while tracking (e.g. the
  // driver navigates away) so no watch, timer, or wake lock is left behind.
  useEffect(() => {
    return () => stopTracking();
  }, [stopTracking]);

  if (status === "session-expired") {
    return (
      <div className="text-center">
        <p className="text-red-400">Your session has expired.</p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 rounded bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500"
        >
          Log in again
        </button>
      </div>
    );
  }

  if (status === "unsupported") {
    return (
      <p className="text-center text-red-400">
        This browser does not support location tracking. Please use a
        different browser.
      </p>
    );
  }

  if (status === "permission-denied") {
    return (
      <div className="text-center">
        <p className="text-red-400">Location permission was denied.</p>
        <p className="mt-2 max-w-xs text-sm text-neutral-400">
          Open your browser settings for this site and allow Location
          access, then press Start again.
        </p>
        <button
          onClick={startTracking}
          className="mt-4 rounded bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500"
        >
          Start Tracking
        </button>
      </div>
    );
  }

  if (status === "idle") {
    return (
      <div className="text-center">
        <p className="mb-6 text-neutral-300">
          Turn on your location and press Start.
        </p>
        <button
          onClick={startTracking}
          className="rounded-full bg-green-600 px-10 py-5 text-xl font-semibold text-white shadow-lg hover:bg-green-500"
        >
          Start Tracking
        </button>
      </div>
    );
  }

  if (status === "requesting") {
    return (
      <p className="text-center text-neutral-300">
        Requesting location permission... Please allow location access when
        prompted.
      </p>
    );
  }

  // status === "tracking"
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-2">
        <span className="h-3 w-3 animate-pulse rounded-full bg-green-500" />
        <span className="font-medium text-green-400">Tracking active</span>
      </div>

      <p className="mt-3 text-sm text-neutral-400">
        Last sent: {lastSentAt ? lastSentAt.toLocaleTimeString() : "not yet"}
      </p>
      <p className="text-sm text-neutral-400">
        Accuracy:{" "}
        {lastAccuracy !== null ? `${Math.round(lastAccuracy)} m` : "unknown"}
      </p>

      {warning && <p className="mt-2 text-sm text-yellow-400">{warning}</p>}

      {!wakeLockSupported && (
        <p className="mt-2 text-sm text-yellow-400">
          Your browser cannot keep the screen on automatically. Please keep
          the screen on manually while tracking.
        </p>
      )}

      <button
        onClick={handleStop}
        className="mt-6 rounded-full bg-red-600 px-10 py-4 text-lg font-semibold text-white shadow-lg hover:bg-red-500"
      >
        Stop
      </button>
    </div>
  );
}
