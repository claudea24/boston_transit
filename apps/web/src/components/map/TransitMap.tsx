"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type Map as MapLibreMap, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { TripLeg } from "@weather/shared";
import { useTripContext } from "@/context/TripContext";
import { useVehiclesContext } from "@/context/VehiclesContext";
import { useStopsContext } from "@/context/StopsContext";
import { useRoutesContext } from "@/context/RoutesContext";
import { tripRouteIdSet } from "@/lib/tripRoutes";

const BOSTON_CENTER: [number, number] = [-71.0589, 42.3601];
const DEFAULT_ZOOM = 11;
const ARROW_IMAGE_ID = "vehicle-arrow";
const ANIMATION_MS = 1500;

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
  : "https://tiles.openfreemap.org/styles/liberty";

const MODE_COLORS: Record<string, string> = {
  rail: "#da291c",
  tram: "#00843d",
  bus: "#ffc72c",
  ferry: "#008eaa",
  cable_car: "#8b5cf6",
  other: "#94a3b8",
};

type PointFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, string | number>;
};

type LineFeature = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: Record<string, string | number>;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Array<PointFeature | LineFeature>;
};

const EMPTY_COLLECTION: FeatureCollection = { type: "FeatureCollection", features: [] };

interface AnimatedVehicle {
  lng: number;
  lat: number;
  bearing: number;
  color: string;
  mode: string;
  routeId?: string;
}

function createArrowImageData(size = 32): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "rgba(255,255,255,1)";
  const cx = size / 2;
  ctx.beginPath();
  ctx.moveTo(cx, 3);
  ctx.lineTo(size - 4, size - 4);
  ctx.lineTo(cx, size - 9);
  ctx.lineTo(4, size - 4);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

function bearingBetween(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(aLat);
  const φ2 = toRad(bLat);
  const λ1 = toRad(aLng);
  const λ2 = toRad(bLng);
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function legsToGeoJson(legs: TripLeg[] | undefined): FeatureCollection {
  const features: LineFeature[] = (legs ?? [])
    .filter((leg) => leg.polyline && leg.polyline.length >= 2)
    .map((leg) => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: leg.polyline.map(
          (p) => [p.longitude, p.latitude] as [number, number]
        ),
      },
      properties: {
        mode: leg.mode,
        color: leg.routeColor ?? (leg.mode === "walk" ? "#64748b" : "#1a73e8"),
      },
    }));
  return { type: "FeatureCollection", features };
}

export default function TransitMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const { vehicles } = useVehiclesContext();
  const { selectedItinerary, from, to } = useTripContext();
  const { stops, selectedStopId, setSelectedStopId } = useStopsContext();
  const { routes, stopColors, stopToRoutes, routeColorById } = useRoutesContext();
  const routeColorByIdRef = useRef(routeColorById);
  routeColorByIdRef.current = routeColorById;
  const tripRouteIds = useMemo(
    () => tripRouteIdSet(selectedItinerary, routes),
    [selectedItinerary, routes]
  );
  const tripRouteIdsRef = useRef(tripRouteIds);
  tripRouteIdsRef.current = tripRouteIds;

  const lastPolledRef = useRef(new Map<string, { lng: number; lat: number }>());
  const animatedRef = useRef(new Map<string, AnimatedVehicle>());
  const targetRef = useRef(new Map<string, AnimatedVehicle>());
  const animationStartRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const setSelectedStopRef = useRef(setSelectedStopId);
  setSelectedStopRef.current = setSelectedStopId;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: BOSTON_CENTER,
      zoom: DEFAULT_ZOOM,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      loadedRef.current = true;

      try {
        map.addImage(ARROW_IMAGE_ID, createArrowImageData(), { sdf: true });
      } catch (error) {
        console.error("addImage arrow failed", error);
      }

      map.addSource("route-lines", { type: "geojson", data: EMPTY_COLLECTION });
      map.addLayer({
        id: "route-lines-casing",
        type: "line",
        source: "route-lines",
        paint: {
          "line-color": "#ffffff",
          "line-width": ["case", ["==", ["get", "isBus"], 1], 3, 6],
          "line-opacity": [
            "case",
            ["==", ["get", "highlighted"], 1],
            0.9,
            ["==", ["get", "isBus"], 1],
            0.15,
            0.5,
          ],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "route-lines-layer",
        type: "line",
        source: "route-lines",
        paint: {
          "line-color": ["get", "color"],
          "line-width": [
            "case",
            ["==", ["get", "highlighted"], 1],
            5,
            ["==", ["get", "isBus"], 1],
            1.5,
            3,
          ],
          "line-opacity": [
            "case",
            ["==", ["get", "highlighted"], 1],
            1,
            ["==", ["get", "isBus"], 1],
            0.35,
            0.85,
          ],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });

      map.addSource("stops", { type: "geojson", data: EMPTY_COLLECTION });
      map.addLayer({
        id: "stops-layer",
        type: "circle",
        source: "stops",
        minzoom: 11,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            2.5,
            14,
            4.5,
            17,
            7,
          ],
          "circle-color": ["coalesce", ["get", "color"], "#ffffff"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.95,
        },
      });
      map.addLayer({
        id: "stops-selected",
        type: "circle",
        source: "stops",
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-radius": 10,
          "circle-color": ["coalesce", ["get", "color"], "#1a73e8"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
        },
      });

      map.addSource("trip", { type: "geojson", data: EMPTY_COLLECTION });
      map.addLayer({
        id: "trip-casing",
        type: "line",
        source: "trip",
        paint: {
          "line-color": "#ffffff",
          "line-width": 10,
          "line-opacity": 0.7,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "trip-line",
        type: "line",
        source: "trip",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 6,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });

      map.addSource("vehicles", { type: "geojson", data: EMPTY_COLLECTION });
      map.addLayer({
        id: "vehicles-layer",
        type: "symbol",
        source: "vehicles",
        layout: {
          "icon-image": ARROW_IMAGE_ID,
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.55,
            14,
            0.9,
            17,
            1.3,
          ],
          "icon-rotate": ["get", "bearing"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-color": ["get", "color"],
          "icon-halo-color": "#ffffff",
          "icon-halo-width": 1.2,
          "icon-opacity": [
            "case",
            ["==", ["get", "dimmed"], 1],
            0.25,
            1,
          ],
        },
      });

      map.on("click", "stops-layer", (event) => {
        const feature = event.features?.[0];
        const id = feature?.properties?.id;
        if (typeof id === "string") setSelectedStopRef.current(id);
      });
      map.on("mouseenter", "stops-layer", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "stops-layer", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("click", (event) => {
        const hit = map.queryRenderedFeatures(event.point, { layers: ["stops-layer"] });
        if (hit.length === 0) setSelectedStopRef.current(null);
      });
    });

    return () => {
      loadedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const nextTargets = new Map<string, AnimatedVehicle>();
    const colorLookup = routeColorByIdRef.current;
    const MIN_MOVEMENT_DEG = 0.00003;
    for (const vehicle of vehicles) {
      const id = `${vehicle.agencyId}:${vehicle.vehicleId}`;
      const color =
        (vehicle.routeId ? colorLookup.get(vehicle.routeId) : undefined) ??
        vehicle.routeColor ??
        MODE_COLORS[vehicle.mode] ??
        MODE_COLORS.other;
      const last = lastPolledRef.current.get(id);
      const prevBearing = animatedRef.current.get(id)?.bearing ?? 0;
      const hasReportedBearing =
        typeof vehicle.bearing === "number" && !Number.isNaN(vehicle.bearing);

      let bearing = prevBearing;
      if (hasReportedBearing) {
        bearing = vehicle.bearing as number;
      } else if (last) {
        const dLng = vehicle.longitude - last.lng;
        const dLat = vehicle.latitude - last.lat;
        if (Math.abs(dLng) > MIN_MOVEMENT_DEG || Math.abs(dLat) > MIN_MOVEMENT_DEG) {
          bearing = bearingBetween(last.lng, last.lat, vehicle.longitude, vehicle.latitude);
        }
      }

      lastPolledRef.current.set(id, { lng: vehicle.longitude, lat: vehicle.latitude });
      nextTargets.set(id, {
        lng: vehicle.longitude,
        lat: vehicle.latitude,
        bearing,
        color,
        mode: vehicle.mode,
        routeId: vehicle.routeId,
      });
      if (!animatedRef.current.has(id)) {
        animatedRef.current.set(id, {
          lng: vehicle.longitude,
          lat: vehicle.latitude,
          bearing,
          color,
          mode: vehicle.mode,
          routeId: vehicle.routeId,
        });
      }
    }
    for (const id of animatedRef.current.keys()) {
      if (!nextTargets.has(id)) {
        animatedRef.current.delete(id);
        lastPolledRef.current.delete(id);
      }
    }

    targetRef.current = nextTargets;
    animationStartRef.current = performance.now();
    const previous = new Map<string, AnimatedVehicle>();
    animatedRef.current.forEach((v, id) => previous.set(id, { ...v }));

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = Math.min(1, (now - animationStartRef.current) / ANIMATION_MS);
      const features: PointFeature[] = [];
      const trip = tripRouteIdsRef.current;
      const tripActive = trip.size > 0;
      targetRef.current.forEach((target, id) => {
        const prev = previous.get(id) ?? target;
        const lng = prev.lng + (target.lng - prev.lng) * t;
        const lat = prev.lat + (target.lat - prev.lat) * t;
        animatedRef.current.set(id, {
          lng,
          lat,
          bearing: target.bearing,
          color: target.color,
          mode: target.mode,
          routeId: target.routeId,
        });
        const dimmed =
          tripActive && (!target.routeId || !trip.has(target.routeId)) ? 1 : 0;
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [lng, lat] },
          properties: {
            id,
            mode: target.mode,
            color: target.color,
            bearing: target.bearing,
            dimmed,
          },
        });
      });
      const map = mapRef.current;
      if (map && loadedRef.current) {
        const src = map.getSource("vehicles") as GeoJSONSource | undefined;
        src?.setData({ type: "FeatureCollection", features } as unknown as GeoJSON.FeatureCollection);
      }
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else rafRef.current = null;
    };

    if (loadedRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      map.once("load", () => {
        rafRef.current = requestAnimationFrame(tick);
      });
    }
  }, [vehicles, tripRouteIds, routeColorById]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("stops") as GeoJSONSource | undefined;
      if (!src) return;
      const features: PointFeature[] = stops.map((stop) => {
        const color = stopColors.get(stop.id) ?? stopColors.get(stop.parentStation ?? "") ?? "";
        const props: Record<string, string | number> = {
          id: stop.id,
          name: stop.name,
          locationType: stop.locationType,
        };
        if (color) props.color = color;
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [stop.longitude, stop.latitude] },
          properties: props,
        };
      });
      src.setData({ type: "FeatureCollection", features } as unknown as GeoJSON.FeatureCollection);
    };
    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [stops, stopColors]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("route-lines") as GeoJSONSource | undefined;
      if (!src) return;
      const highlightIds = new Set<string>(
        selectedStopId
          ? (stopToRoutes.get(selectedStopId) ?? []).map((r) => r.id)
          : []
      );
      const features: LineFeature[] = routes.flatMap((route) => {
        const props = {
          routeId: route.id,
          color: route.color,
          isBus: route.type === 3 ? 1 : 0,
          highlighted: highlightIds.has(route.id) ? 1 : 0,
        };
        if (route.shapes && route.shapes.length > 0) {
          return route.shapes.map(
            (coordinates) =>
              ({
                type: "Feature",
                geometry: { type: "LineString", coordinates },
                properties: props,
              }) satisfies LineFeature
          );
        }
        if (route.stops.length >= 2) {
          return [
            {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: route.stops.map(
                  (s) => [s.longitude, s.latitude] as [number, number]
                ),
              },
              properties: props,
            } satisfies LineFeature,
          ];
        }
        return [];
      });
      src.setData({ type: "FeatureCollection", features } as unknown as GeoJSON.FeatureCollection);
    };
    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [routes, selectedStopId, stopToRoutes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.setFilter("stops-selected", ["==", ["get", "id"], selectedStopId ?? ""]);
    };
    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [selectedStopId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const legs = selectedItinerary?.legs;
    const apply = () => {
      const src = map.getSource("trip") as GeoJSONSource | undefined;
      if (src) src.setData(legsToGeoJson(legs) as unknown as GeoJSON.FeatureCollection);
      if (!legs || legs.length === 0) return;

      const coords: [number, number][] = legs.flatMap((l) =>
        l.polyline.map((p) => [p.longitude, p.latitude] as [number, number])
      );
      if (from) coords.push([from.longitude, from.latitude]);
      if (to) coords.push([to.longitude, to.latitude]);
      if (coords.length < 2) return;

      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(coords[0], coords[0])
      );
      map.fitBounds(bounds, { padding: 80, duration: 900, maxZoom: 14 });
    };
    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [selectedItinerary, from, to]);

  return (
    <div className="transit-map">
      <div ref={containerRef} className="transit-map__canvas" />
    </div>
  );
}
