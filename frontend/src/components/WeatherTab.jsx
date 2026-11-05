import { useEffect, useState } from 'react';
import { CloudRain, RefreshCw } from 'lucide-react';

export default function WeatherTab({ latitude, longitude }) {
  const [data, setData] = useState({ loading: true, precipitation: null, temperature: null, humidity: null });
  const [position, setPosition] = useState(
    Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
      ? { latitude: Number(latitude), longitude: Number(longitude) }
      : null,
  );

  useEffect(() => {
    if (position || !('geolocation' in navigator)) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => setPosition({ latitude: coords.latitude, longitude: coords.longitude }),
      () => setPosition(null),
      { enableHighAccuracy: true, maximumAge: 60_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [position]);

  useEffect(() => {
    const lat = position?.latitude ?? latitude;
    const lng = position?.longitude ?? longitude;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      setData((current) => ({ ...current, loading: false }));
      return undefined;
    }

    let cancelled = false;
    const load = async () => {
      setData((current) => ({ ...current, loading: true }));
      try {
        const url = new URL('https://api.open-meteo.com/v1/forecast');
        url.searchParams.set('latitude', lat);
        url.searchParams.set('longitude', lng);
        url.searchParams.set('current', 'precipitation,temperature_2m,relative_humidity_2m');
        url.searchParams.set('timezone', 'auto');
        const response = await fetch(url);
        if (!response.ok) throw new Error('Weather request failed');
        const payload = await response.json();
        if (!cancelled) {
          setData({
            loading: false,
            precipitation: Number(payload.current?.precipitation ?? 0),
            temperature: Number(payload.current?.temperature_2m ?? null),
            humidity: Number(payload.current?.relative_humidity_2m ?? null),
          });
        }
      } catch {
        if (!cancelled) setData({ loading: false, precipitation: null, temperature: null, humidity: null });
      }
    };

    load();
    const interval = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [latitude, longitude, position]);

  const raining = data.precipitation > 2;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-900">Live weather analytics</p>
          <p className="text-[10px] text-slate-500">Open-Meteo · updated every minute</p>
        </div>
        <RefreshCw size={14} className={data.loading ? 'animate-spin text-blue-600' : 'text-slate-400'} />
      </div>
      {data.loading && <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">Loading live conditions…</p>}
      {!data.loading && data.precipitation == null && <p className="rounded-xl bg-red-50 px-3 py-4 text-center text-xs font-semibold text-red-500">Weather data unavailable.</p>}
      {!data.loading && data.precipitation != null && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center"><p className="text-lg font-extrabold text-slate-900">{data.precipitation.toFixed(1)}</p><p className="text-[9px] uppercase text-slate-500">mm rain</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center"><p className="text-lg font-extrabold text-slate-900">{Number.isFinite(data.temperature) ? `${data.temperature.toFixed(1)}°` : '—'}</p><p className="text-[9px] uppercase text-slate-500">temperature</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center"><p className="text-lg font-extrabold text-slate-900">{Number.isFinite(data.humidity) ? `${Math.round(data.humidity)}%` : '—'}</p><p className="text-[9px] uppercase text-slate-500">humidity</p></div>
          </div>
          <div className={`flex items-start gap-2 rounded-xl border p-3 ${raining ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
            <CloudRain size={18} className={raining ? 'text-red-500' : 'text-emerald-500'} />
            <div>
              <p className={`text-xs font-bold ${raining ? 'text-red-500' : 'text-slate-900'}`}>{raining ? 'Rain detected — higher passenger demand expected.' : 'No significant rain detected.'}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{raining ? 'Drivers and commuters should expect possible delays and increased demand.' : 'Operating conditions currently show no major rain impact.'}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
