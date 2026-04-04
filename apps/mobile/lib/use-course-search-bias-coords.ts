import { useEffect, useState } from "react";
import * as Location from "expo-location";

export type CourseSearchBiasCoords = {
  latitude: number;
  longitude: number;
};

/**
 * Resolves device location once (foreground) for biasing golf course search.
 * Returns null if permission denied or position unavailable — server can still use profile home.
 */
export function useCourseSearchBiasCoords() {
  const [coords, setCoords] = useState<CourseSearchBiasCoords | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted" || cancelled) return;
      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch {
        /* keep null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return coords;
}
