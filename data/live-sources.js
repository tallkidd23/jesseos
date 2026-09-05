export const LIVE_CACHE_PREFIX = 'jesseos:live:';
export const LIVE_CACHE_TTL_MS = 5 * 60 * 1000;

const now = () => new Date().toISOString();

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cacheKey(source) {
  return `${LIVE_CACHE_PREFIX}${source}`;
}

function readCache(source, ttlMs = LIVE_CACHE_TTL_MS) {
  try {
    const raw = localStorage.getItem(cacheKey(source));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs > ttlMs) return null;
    return { ...cached, ageMs };
  } catch {
    return null;
  }
}

function writeCache(source, observations) {
  const cached = { fetchedAt: now(), observations };
  try {
    localStorage.setItem(cacheKey(source), JSON.stringify(cached));
  } catch {
    // Storage is optional; a live result remains usable for this session.
  }
  return cached;
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function observation(source, payload) {
  return {
    source,
    observedAt: payload.observedAt || now(),
    fetchedAt: now(),
    title: payload.title || source,
    value: payload.value ?? null,
    unit: payload.unit || null,
    location: payload.location || null,
    url: payload.url || null,
    detail: payload.detail || null,
    status: 'fresh'
  };
}

export async function getEarthquakes({ limit = 5, force = false } = {}) {
  const source = 'earthquakes';
  const cached = !force && readCache(source);
  if (cached) return { source, status: 'cached', fetchedAt: cached.fetchedAt, observations: cached.observations };

  try {
    const feed = await fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson');
    const observations = asArray(feed.features).slice(0, limit).map((feature) => {
      const properties = feature.properties || {};
      const coordinates = feature.geometry?.coordinates || [];
      return observation(source, {
        observedAt: properties.time ? new Date(properties.time).toISOString() : now(),
        title: properties.title || 'Earthquake',
        value: typeof properties.mag === 'number' ? properties.mag : null,
        unit: 'M',
        location: coordinates.length >= 2 ? { longitude: coordinates[0], latitude: coordinates[1], depthKm: coordinates[2] ?? null } : null,
        url: properties.url || null,
        detail: properties.place || null
      });
    });
    const saved = writeCache(source, observations);
    return { source, status: 'fresh', fetchedAt: saved.fetchedAt, observations };
  } catch (error) {
    return { source, status: 'unavailable', fetchedAt: null, observations: [], error: error.message };
  }
}

function getPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported in this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 10 * 60 * 1000,
      ...options
    });
  });
}

export async function getLocalWeather({ force = false, coordinates = null } = {}) {
  const source = 'weather';
  const cached = !force && readCache(source);
  if (cached) return { source, status: 'cached', fetchedAt: cached.fetchedAt, observations: cached.observations };

  try {
    const point = coordinates || await getPosition();
    const latitude = coordinates ? coordinates.latitude : point.coords.latitude;
    const longitude = coordinates ? coordinates.longitude : point.coords.longitude;
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', latitude);
    url.searchParams.set('longitude', longitude);
    url.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m');
    url.searchParams.set('timezone', 'auto');

    const data = await fetchJson(url.toString());
    const current = data.current || {};
    const label = weatherLabel(current.weather_code);
    const observations = [observation(source, {
      observedAt: current.time ? new Date(current.time).toISOString() : now(),
      title: label,
      value: current.temperature_2m ?? null,
      unit: data.current_units?.temperature_2m || '°C',
      location: { latitude, longitude, timezone: data.timezone || null },
      url: 'https://open-meteo.com/',
      detail: `Feels like ${current.apparent_temperature ?? '—'}${data.current_units?.apparent_temperature || '°C'}; wind ${current.wind_speed_10m ?? '—'}${data.current_units?.wind_speed_10m || ' km/h'}`
    })];
    const saved = writeCache(source, observations);
    return { source, status: 'fresh', fetchedAt: saved.fetchedAt, observations };
  } catch (error) {
    return { source, status: 'unavailable', fetchedAt: null, observations: [], error: error.message };
  }
}

export async function getLiveSnapshot(options = {}) {
  const [earthquakes, weather] = await Promise.all([
    getEarthquakes(options.earthquakes),
    getLocalWeather(options.weather)
  ]);
  return {
    fetchedAt: now(),
    sources: [earthquakes, weather],
    observations: [...earthquakes.observations, ...weather.observations]
  };
}

export function weatherLabel(code) {
  const labels = {
    0: 'Clear sky',
    1: 'Mostly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Rime fog',
    51: 'Light drizzle',
    53: 'Drizzle',
    55: 'Heavy drizzle',
    61: 'Light rain',
    63: 'Rain',
    65: 'Heavy rain',
    71: 'Light snow',
    73: 'Snow',
    75: 'Heavy snow',
    80: 'Rain showers',
    81: 'Heavy rain showers',
    82: 'Violent rain showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with hail',
    99: 'Severe thunderstorm with hail'
  };
  return labels[code] || 'Current weather';
}
