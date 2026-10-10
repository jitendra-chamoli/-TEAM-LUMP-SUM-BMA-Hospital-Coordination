import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Coloured pins so patient, hospital and ambulance are told apart at a glance.
const pin = (color, label) => L.divIcon({
  className: '',
  html: `<div style="display:flex;align-items:center;gap:4px;transform:translate(-8px,-8px)">
           <span style="flex-shrink:0;width:16px;height:16px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>
           <span style="font:600 11px/1 'Public Sans',sans-serif;color:#0f172a;background:#fff;padding:2px 5px;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.2);white-space:nowrap">${label}</span>
         </div>`
});
const PINS = { patient: pin('#ef4444', 'Patient'), hospital: pin('#2563eb', 'Hospital'), ambulance: pin('#059669', 'Ambulance') };

// Fit all markers once the container has its final size (and again when a new point appears).
const FitBounds = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => {
      map.invalidateSize();
      if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
      else if (points.length === 1) map.setView(points[0], 14);
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, points.length]);
  return null;
};

// `route` is the road the ambulance is following ([[lat, lng], ...]); without one, a
// dashed straight line just shows which hospital the patient is going to.
// `ahead` is the road from the patient to the hospital, shown while the ambulance
// is still on its way to the patient so the whole journey is visible.
const TrackingMap = ({ patient, hospital, ambulance, hospitalName, ambulanceName, route, ahead, className = 'h-64' }) => {
  const points = [patient, hospital, ambulance, ...(route || []), ...(ahead || [])].filter(Boolean);
  if (!patient) return null;
  return (
    <div className={`${className} rounded-lg overflow-hidden border border-line relative z-0`}>
      <MapContainer center={patient} zoom={13} style={{ height: '100%', width: '100%' }}>
        <FitBounds points={points} />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        {ahead && <Polyline positions={ahead} pathOptions={{ color: '#2563eb', weight: 4, dashArray: '8 8', opacity: 0.8 }} />}
        {hospital && !route && !ahead && <Polyline positions={[patient, hospital]} pathOptions={{ color: '#2563eb', weight: 2, dashArray: '6 6', opacity: 0.6 }} />}
        {route && <Polyline positions={route} pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.9 }} />}
        {route && <Polyline positions={route} pathOptions={{ color: '#059669', weight: 5, opacity: 0.95 }} />}
        <Marker position={patient} icon={PINS.patient}><Popup>Patient</Popup></Marker>
        {hospital && <Marker position={hospital} icon={PINS.hospital}><Popup>{hospitalName}</Popup></Marker>}
        {ambulance && <Marker position={ambulance} icon={PINS.ambulance}><Popup>{ambulanceName}</Popup></Marker>}
      </MapContainer>
    </div>
  );
};

export default TrackingMap;
