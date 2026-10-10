import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, MapPin, LocateFixed, Loader2, X } from 'lucide-react';
import { Input, Button, cn } from '../src/ui';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Marker.prototype.options.icon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const DEFAULT_CENTER = [20.5937, 78.9629]; // Geographic center of India — neutral default, not a real pin
const DEFAULT_ZOOM = 4;

// MapContainer only honours center/zoom on first mount, so later changes are pushed here.
const ViewSync = ({ position, zoom }) => {
    const map = useMap();
    useEffect(() => {
        map.setView(position, zoom, { animate: true });
        const t = setTimeout(() => map.invalidateSize(), 150);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [position[0], position[1], zoom]);
    return null;
};

const DraggableMarker = ({ position, onMove }) => {
    useMapEvents({ click(e) { onMove([e.latlng.lat, e.latlng.lng]); } });
    return (
        <Marker
            position={position}
            draggable
            eventHandlers={{ dragend: (e) => { const p = e.target.getLatLng(); onMove([p.lat, p.lng]); } }}
        />
    );
};

// Clicking the empty map drops the first pin.
const ClickToPlace = ({ onPlace }) => {
    useMapEvents({ click(e) { onPlace([e.latlng.lat, e.latlng.lng]); } });
    return null;
};

// Nominatim names the city differently depending on settlement size. In India `county`
// is the tehsil (e.g. "Rishikesh"), a better match for dispatch than the nearest village.
const cityFrom = (addr = {}) =>
    addr.city || addr.town || addr.municipality || addr.county || addr.village || addr.state_district || addr.state || '';

/**
 * Address search + draggable map pin.
 * value:    { lat, lng, address, city } | null
 * onChange: called with the new value whenever the pin or address changes
 */
const LocationPicker = ({ value, onChange, placeholder = 'Search an address or area…', mapClassName = 'h-64', autoFocus }) => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [searching, setSearching] = useState(false);
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(-1);
    const [resolving, setResolving] = useState(false);
    const [zoom, setZoom] = useState(value ? 15 : DEFAULT_ZOOM);
    const debounceRef = useRef(null);
    const skipNextSearchRef = useRef(false);

    const position = value ? [value.lat, value.lng] : null;
    // A pin set from outside (e.g. typed coordinates) should be shown up close, not at country level.
    const effectiveZoom = position && zoom === DEFAULT_ZOOM ? 14 : zoom;

    useEffect(() => {
        // A query set by picking a suggestion shouldn't trigger another search.
        if (skipNextSearchRef.current) { skipNextSearchRef.current = false; return; }
        clearTimeout(debounceRef.current);
        if (query.trim().length < 3) return;
        debounceRef.current = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await fetch(`${NOMINATIM_BASE}/search?format=json&limit=5&addressdetails=1&q=${encodeURIComponent(query)}`);
                const data = await res.json();
                setSuggestions(Array.isArray(data) ? data : []);
                setHighlight(-1);
                setOpen(true);
            } catch {
                setSuggestions([]);
            } finally {
                setSearching(false);
            }
        }, 500);
        return () => clearTimeout(debounceRef.current);
    }, [query]);

    const placeAt = async (pos) => {
        setZoom(z => Math.max(z, 15));
        onChange({ lat: pos[0], lng: pos[1], address: value?.address || '', city: value?.city || '' });
        setResolving(true);
        try {
            const res = await fetch(`${NOMINATIM_BASE}/reverse?format=json&lat=${pos[0]}&lon=${pos[1]}`);
            const data = await res.json();
            onChange({ lat: pos[0], lng: pos[1], address: data?.display_name || `${pos[0].toFixed(5)}, ${pos[1].toFixed(5)}`, city: cityFrom(data?.address) });
        } catch {
            onChange({ lat: pos[0], lng: pos[1], address: `${pos[0].toFixed(5)}, ${pos[1].toFixed(5)}`, city: value?.city || '' });
        } finally {
            setResolving(false);
        }
    };

    const selectSuggestion = (s) => {
        setZoom(15);
        onChange({ lat: parseFloat(s.lat), lng: parseFloat(s.lon), address: s.display_name, city: cityFrom(s.address) });
        skipNextSearchRef.current = true;
        setQuery(s.display_name);
        setSuggestions([]);
        setOpen(false);
        setHighlight(-1);
    };

    // Arrow keys move through suggestions, Enter picks one. Enter never submits a surrounding form.
    const handleKeyDown = (e) => {
        const listOpen = open && suggestions.length > 0;
        if (e.key === 'ArrowDown' && listOpen) {
            e.preventDefault();
            setHighlight(h => (h + 1) % suggestions.length);
        } else if (e.key === 'ArrowUp' && listOpen) {
            e.preventDefault();
            setHighlight(h => (h <= 0 ? suggestions.length - 1 : h - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (listOpen) selectSuggestion(suggestions[Math.max(0, highlight)]);
        } else if (e.key === 'Escape' && listOpen) {
            e.preventDefault();
            setOpen(false);
        }
    };

    const useMyLocation = () => {
        navigator.geolocation?.getCurrentPosition((pos) => placeAt([pos.coords.latitude, pos.coords.longitude]));
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Input
                        icon={Search}
                        placeholder={placeholder}
                        value={query}
                        autoFocus={autoFocus}
                        onChange={(e) => { setQuery(e.target.value); if (e.target.value.trim().length < 3) setSuggestions([]); }}
                        onFocus={() => suggestions.length > 0 && setOpen(true)}
                        onBlur={() => setOpen(false)}
                        onKeyDown={handleKeyDown}
                        role="combobox"
                        aria-expanded={open && suggestions.length > 0}
                        aria-controls="location-suggestions"
                        aria-autocomplete="list"
                        right={searching
                            ? <Loader2 size={15} className="text-slate-400 animate-spin mr-1.5" />
                            : query && (
                                <button type="button" aria-label="Clear search"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => { setQuery(''); setSuggestions([]); setOpen(false); }}
                                    className="h-7 w-7 rounded flex items-center justify-center text-slate-400 hover:text-slate-700">
                                    <X size={14} />
                                </button>
                            )}
                        aria-label="Search location"
                    />
                    {open && suggestions.length > 0 && (
                        <ul id="location-suggestions" role="listbox" className="absolute z-[1000] mt-1 w-full bg-white rounded-lg border border-line shadow-lg p-1">
                            {suggestions.map((s, i) => (
                                <li key={s.place_id} role="option" aria-selected={i === highlight}>
                                    {/* preventDefault on mousedown keeps focus in the search box, so the list
                                        doesn't close before the click lands (a real click lasts ~100–200 ms). */}
                                    <button type="button" tabIndex={-1}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => selectSuggestion(s)}
                                        onMouseEnter={() => setHighlight(i)}
                                        className={cn('w-full flex items-start gap-2 px-2.5 py-2 rounded-md text-left text-sm text-slate-700', i === highlight ? 'bg-slate-100' : 'hover:bg-slate-100')}>
                                        <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0" />
                                        <span className="leading-snug line-clamp-2">{s.display_name}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <Button variant="secondary" onClick={useMyLocation} className="shrink-0" aria-label="Use my current location">
                    <LocateFixed size={15} /> <span className="hidden sm:inline">My location</span>
                </Button>
            </div>

            <div className={cn('w-full rounded-lg overflow-hidden border border-line relative z-0', mapClassName)}>
                <MapContainer center={position || DEFAULT_CENTER} zoom={effectiveZoom} style={{ height: '100%', width: '100%' }}>
                    <ViewSync position={position || DEFAULT_CENTER} zoom={effectiveZoom} />
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                    {position ? <DraggableMarker position={position} onMove={placeAt} /> : <ClickToPlace onPlace={placeAt} />}
                </MapContainer>
            </div>

            <div className="flex items-start gap-2 text-sm min-h-[2.5rem]">
                <MapPin size={15} className={cn('mt-0.5 shrink-0', position ? 'text-brand-600' : 'text-slate-300')} />
                {position ? (
                    <div className="min-w-0">
                        <p className="text-slate-700 leading-snug line-clamp-2">{resolving ? 'Looking up address…' : value.address}</p>
                        <p className="text-xs text-slate-400 tabular mt-0.5">{position[0].toFixed(5)}, {position[1].toFixed(5)} · drag the pin to adjust</p>
                    </div>
                ) : (
                    <p className="text-slate-500">Search, use your location, or click the map to drop a pin.</p>
                )}
            </div>
        </div>
    );
};

export default LocationPicker;
