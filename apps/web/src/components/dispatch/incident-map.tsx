'use client';
import 'maplibre-gl/dist/maplibre-gl.css';
import { layers, namedFlavor } from '@protomaps/basemaps';
import { Building2 } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import { useTranslations } from 'next-intl';
import { Protocol } from 'pmtiles';
import { useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Layer, Marker, Popup, Source, type MapRef } from 'react-map-gl/maplibre';
import { HospitalMarker } from '@/components/ui/hospital-marker';
import { TriageMarker } from '@/components/ui/triage-marker';
import { useHealth, useHospitals, type HospitalPoint, type QueueItem } from '@/lib/dispatch';
import { cn } from '@/lib/utils';
import type { TilesMode } from './status-strip';

/** Offline basemap (docs/04): a regional extract served by Next from /public. Override with NEXT_PUBLIC_PMTILES_URL. */
const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_URL || '/tiles/sellekni.pmtiles';
/** Online fallback (no key). Flagged "ONLINE TILES" in the status strip, never silent. */
const ONLINE_STYLE = { dark: 'https://tiles.openfreemap.org/styles/dark', light: 'https://tiles.openfreemap.org/styles/positron' };
const RTL_PLUGIN = 'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js';

// Turbopack does not emit MapLibre's worker next to the bundle: serve it from /public (scripts/copy-map-worker.mjs).
if (typeof window !== 'undefined') maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

let protocolAdded = false;
function ensurePmtiles() {
  if (protocolAdded) return;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  protocolAdded = true;
}

/** Labels need glyph files; offline we keep roads/landuse/water and drop text unless glyphs are served locally. */
function offlineStyle(theme: 'dark' | 'light'): StyleSpecification {
  const glyphs = process.env.NEXT_PUBLIC_MAP_GLYPHS;
  const all = layers('protomaps', namedFlavor(theme), { lang: 'fr' });
  return {
    version: 8,
    ...(glyphs && { glyphs }),
    sources: { protomaps: { type: 'vector', url: `pmtiles://${PMTILES_URL}`, attribution: '© OpenStreetMap · Protomaps' } },
    layers: glyphs ? all : all.filter((l) => l.type !== 'symbol'),
  } as StyleSpecification;
}

/** Last resort: no tiles at all. Pins, routes and the queue still work on a plain surface. */
const EMPTY_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] };

function useTheme(): 'dark' | 'light' {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setTheme(el.dataset.theme === 'light' ? 'light' : 'dark');
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

/** MapLibre paints need concrete colours: read the token CSS variables (recomputed when the theme flips). */
function useTokenColors(theme: 'dark' | 'light') {
  return useMemo(() => {
    if (typeof window === 'undefined') return { route: 'currentColor', casing: 'transparent' };
    const css = getComputedStyle(document.documentElement);
    return { route: css.getPropertyValue('--sellekni-brand-text').trim(), casing: css.getPropertyValue('--sellekni-bg').trim() };
  }, [theme]); // eslint-disable-line react-hooks/exhaustive-deps
}

export interface RouteHint {
  hospitalId: string;
  name: string;
  to: { lat: number; lon: number };
  /** haversine fallback → dashed straight line, labelled "estimated" */
  estimated: boolean;
}

export interface IncidentMapProps {
  incidents: readonly QueueItem[];
  selectedId: string | null;
  newIds: ReadonlySet<string>;
  route: RouteHint | null;
  onSelect: (id: string) => void;
  onTiles: (mode: TilesMode) => void;
  className?: string;
}

export function IncidentMap({ incidents, selectedId, newIds, route, onSelect, onTiles, className }: IncidentMapProps) {
  const t = useTranslations();
  const theme = useTheme();
  const colors = useTokenColors(theme);
  const ref = useRef<MapRef>(null);
  // The server says whether the offline file is installed (no 404 probe in the console); else online tiles, flagged.
  const health = useHealth();
  const configured = process.env.NEXT_PUBLIC_PMTILES_URL ? true : health.data?.offlineTiles;
  /** set when the online style host fails: pins stay on a plain surface */
  const [failed, setFailed] = useState(false);
  const tiles: TilesMode | null =
    configured === undefined && !health.isError ? null : failed ? 'none' : configured ? 'offline' : 'online';
  useEffect(() => {
    if (tiles === 'offline') ensurePmtiles();
    else if (tiles === 'online' && maplibregl.getRTLTextPluginStatus() === 'unavailable') {
      maplibregl.setRTLTextPlugin(RTL_PLUGIN, true).catch(() => undefined); // Arabic labels shape correctly
    }
  }, [tiles]);
  useEffect(() => {
    if (tiles) onTiles(tiles);
  }, [tiles, onTiles]);

  const style = useMemo(
    () => (tiles === 'offline' ? offlineStyle(theme) : tiles === 'online' ? ONLINE_STYLE[theme] : EMPTY_STYLE),
    [tiles, theme],
  );

  const selected = incidents.find((i) => i.id === selectedId) ?? null;
  useEffect(() => {
    const map = ref.current;
    if (!map || !selected) return;
    if (route) {
      const b = new maplibregl.LngLatBounds([selected.lon, selected.lat], [selected.lon, selected.lat]).extend([route.to.lon, route.to.lat]);
      map.fitBounds(b, { padding: 80, duration: 360, maxZoom: 12 });
    } else {
      map.flyTo({ center: [selected.lon, selected.lat], zoom: Math.max(map.getZoom(), 11), duration: 360 });
    }
  }, [selected?.id, selected?.lat, selected?.lon, route?.hospitalId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every hospital of the active set, always on the map (H plaque, Level A larger). Tap one for its name and services.
  const hospitals = useHospitals();
  const [openHospital, setOpenHospital] = useState<HospitalPoint | null>(null);

  const line = useMemo(
    () =>
      selected && route
        ? ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[selected.lon, selected.lat], [route.to.lon, route.to.lat]] } } as const)
        : null,
    [selected, route],
  );

  return (
    // Maps never mirror (docs/06 §6): the canvas stays LTR in Arabic.
    <div dir="ltr" className={cn('relative h-full w-full bg-raised', className)} data-testid="map" data-tiles={tiles ?? 'probing'}>
      {tiles && (
        <MapGL
          ref={ref}
          mapLib={maplibregl}
          initialViewState={{ latitude: 36.45, longitude: 2.9, zoom: 8 }}
          mapStyle={style}
          style={{ width: '100%', height: '100%' }}
          attributionControl={{ compact: true }}
          onError={(e) => {
            // style or tile host unreachable: keep the pins on a plain surface, and say so
            if (tiles === 'online' && /style|fetch|Failed/i.test(String(e.error?.message))) setFailed(true);
          }}
        >
          {hospitals.data?.hospitals.map((h) => (
            <Marker key={h.id} longitude={h.lon} latitude={h.lat} anchor="center" style={{ zIndex: 0 }}>
              <button
                type="button"
                data-testid={`map-hospital-${h.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenHospital(h);
                }}
                aria-label={t('hospital.marker', { name: h.name, level: h.level })}
                className="grid min-h-6 min-w-6 place-items-center rounded-md p-0.5"
              >
                <HospitalMarker level={h.level} chosen={route?.hospitalId === h.id} />
              </button>
            </Marker>
          ))}
          {openHospital && (
            <Popup
              longitude={openHospital.lon}
              latitude={openHospital.lat}
              anchor="bottom"
              offset={14}
              onClose={() => setOpenHospital(null)}
              closeOnClick={false}
              maxWidth="260px"
            >
              <div className="text-sm" data-testid="hospital-popup">
                <p className="font-semibold">{openHospital.name}</p>
                <p>{t('hospital.level', { level: openHospital.level })}</p>
                <p className="mt-1">{openHospital.capabilities.map((c) => t(`capability.${c}`)).join(' · ')}</p>
              </div>
            </Popup>
          )}
          {line && (
            <Source id="route" type="geojson" data={line}>
              <Layer id="route-casing" type="line" paint={{ 'line-color': colors.casing, 'line-width': 8, 'line-opacity': 0.8 }} />
              <Layer
                id="route-line"
                type="line"
                paint={{ 'line-color': colors.route, 'line-width': 4, ...(route?.estimated && { 'line-dasharray': [2, 1.5] }) }}
              />
            </Source>
          )}
          {route && selected && (
            <Marker longitude={route.to.lon} latitude={route.to.lat} anchor="bottom" offset={[0, -14]} style={{ zIndex: 1 }}>
              <span className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-sm text-text shadow">
                <Building2 aria-hidden className="size-4 text-brand-text" />
                {route.name}
                {route.estimated && <span className="text-status-warn">· {t('orient.route')}</span>}
              </span>
            </Marker>
          )}
          {incidents.map((i) => (
            <Marker key={i.id} longitude={i.lon} latitude={i.lat} anchor="center" style={{ zIndex: i.id === selectedId ? 2 : 1 }}>
              <button
                type="button"
                data-testid={`pin-${i.id}`}
                onClick={() => onSelect(i.id)}
                aria-label={`${i.id} · ${t('band.label', { band: i.band, name: t(`band.${i.band}`) })}`}
                className="block rounded-full p-1"
              >
                <TriageMarker band={i.band} size="pin" selected={i.id === selectedId} pulsing={newIds.has(i.id)} />
              </button>
            </Marker>
          ))}
        </MapGL>
      )}
    </div>
  );
}
