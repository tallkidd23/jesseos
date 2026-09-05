export const LIVE_CACHE_PREFIX = 'jesseos:live:';
export const LIVE_CACHE_TTL_MS = 5 * 60 * 1000;

const now = () => new Date().toISOString();

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cacheKey(source, scope = '') {
  return `${LIVE_CACHE_PREFIX}${source}:${String(scope).trim().toLowerCase()}`;
}

function readCache(source, scope = '', ttlMs = LIVE_CACHE_TTL_MS) {
  try {
    const raw = localStorage.getItem(cacheKey(source, scope));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs > ttlMs) return null;
    return { ...cached, ageMs };
  } catch {
    return null;
  }
}

function writeCache(source, scope, observations) {
  const cached = { fetchedAt: now(), observations };
  try {
    localStorage.setItem(cacheKey(source, scope), JSON.stringify(cached));
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

function unavailable(source, error) {
  return {
    source,
    status: 'unavailable',
    fetchedAt: null,
    observations: [],
    error: error instanceof Error ? error.message : String(error)
  };
}

function placeLabel(place) {
  return [place.name, place.admin1, place.country].filter(Boolean).join(', ');
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
    const saved = writeCache(source, '', observations);
    return { source, status: 'fresh', fetchedAt: saved.fetchedAt, observations };
  } catch (error) {
    return unavailable(source, error);
  }
}

export async function findPlace(query) {
  const normalized = String(query || '').trim();
  if (!normalized) throw new Error('Weather needs a place. Try: /listen weather Cleveland, Ohio');

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', normalized);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const data = await fetchJson(url.toString());
  const place = asArray(data.results)[0];
  if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) {
    throw new Error(`No place found for: ${normalized}`);
  }
  return place;
}

export async function getWeatherForPlace(query, { force = false } = {}) {
  const source = 'weather';
  const requestedPlace = String(query || '').trim();
  if (!requestedPlace) return unavailable(source, 'Weather needs a place. Try: /listen weather Cleveland, Ohio');

  const scope = requestedPlace.toLowerCase();
  const cached = !force && readCache(source, scope);
  if (cached) return { source, status: 'cached', fetchedAt: cached.fetchedAt, observations: cached.observations };

  try {
    const place = await findPlace(requestedPlace);
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', place.latitude);
    url.searchParams.set('longitude', place.longitude);
    url.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m');
    url.searchParams.set('timezone', 'auto');

    const data = await fetchJson(url.toString());
    const current = data.current || {};
    const labels = placeLabel(place);
    const observations = [observation(source, {
      observedAt: current.time ? new Date(current.time).toISOString() : now(),
      title: weatherLabel(current.weather_code),
      value: current.temperature_2m ?? null,
      unit: data.current_units?.temperature_2m || '°C',
      location: {
        requested: requestedPlace,
        name: labels,
        latitude: place.latitude,
        longitude: place.longitude,
        timezone: data.timezone || place.timezone || null
      },
      url: 'https://open-meteo.com/',
      detail: `${labels}; feels like ${current.apparent_temperature ?? '—'}${data.current_units?.apparent_temperature || '°C'}; wind ${current.wind_speed_10m ?? '—'}${data.current_units?.wind_speed_10m || ' km/h'}`
    })];
    const saved = writeCache(source, scope, observations);
    return { source, status: 'fresh', fetchedAt: saved.fetchedAt, observations };
  } catch (error) {
    return unavailable(source, error);
  }
}

export async function getLiveSnapshot(options = {}) {
  const place = String(options.place || '').trim();
  const requests = [getEarthquakes(options.earthquakes)];
  if (place) requests.push(getWeatherForPlace(place, options.weather));
  const sources = await Promise.all(requests);
  return {
    fetchedAt: now(),
    sources,
    observations: sources.flatMap((result) => result.observations)
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
