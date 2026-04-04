"use client";

import { useEffect, useState } from "react";

export type CourseSearchBiasCoordsWeb = {
  latitude: number;
  longitude: number;
};

/**
 * One-shot browser geolocation for biasing golf course search. Returns null if unavailable.
 */
export function useCourseSearchBiasCoordsWeb() {
  const [coords, setCoords] = useState<CourseSearchBiasCoordsWeb | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => {
        /* keep null; server may use profile home */
      },
      { enableHighAccuracy: false, maximumAge: 600_000, timeout: 10_000 },
    );
  }, []);

  return coords;
}
