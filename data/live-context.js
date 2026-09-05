import { getEarthquakes, getLocalWeather } from './live-sources.js';

export const LIVE_ROUTES = {
  weather: ['console', 'signal', 'garden'],
  earthquakes: ['console', 'signal'],
  default: ['console', 'signal']
};

export const LIVE_TAGS = {
  weather: ['weather', 'sky', 'temperature', 'wind'],
  earthquakes: ['earthquake', 'ground', 'magnitude', 'location']
};

function compact(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function ageLabel(isoDate) {
  const milliseconds = Date.now() - new Date(isoDate).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'unknown age';
  const minutes = Math.floor(milliseconds / 60000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

function statusLine(result) {
  if (result.status === 'unavailable') return `${result.source}: unavailable${result.error ? ` (${result.error})` : ''}`;
  const age = result.fetchedAt ? ageLabel(result.fetchedAt) : 'unknown age';
  return `${result.source}: ${result.status} / ${age}`;
}

function weatherFact(observation) {
  const temperature = observation.value === null ? 'temperature unavailable' : `${observation.value}${observation.unit || ''}`;
  return `${observation.title} · ${temperature}${observation.detail ? ` · ${observation.detail}` : ''}`;
}

function earthquakeFact(observation) {
  const magnitude = observation.value === null ? 'magnitude unavailable' : `M${observation.value}`;
  return `${magnitude} · ${observation.detail || observation.title}`;
}

export function tagsForObservation(observation) {
  const sourceTags = LIVE_TAGS[observation.source] || [];
  const detailTags = compact([observation.title, observation.detail].filter(Boolean).join(' '));
  return unique([...sourceTags, ...detailTags]).slice(0, 14);
}

export function routeForObservation(observation) {
  return [...(LIVE_ROUTES[observation.source] || LIVE_ROUTES.default)];
}

export function toLiveContext(result, observation = result?.observations?.[0]) {
  if (!result || result.status === 'unavailable' || !observation) {
    return {
      available: false,
      source: result?.source || 'unknown',
      status: result?.status || 'unavailable',
      sourceLine: statusLine(result || { source: 'unknown', status: 'unavailable' }),
      observation: null,
      tags: [],
      route: [...LIVE_ROUTES.default],
      fact: 'No live observation is available.'
    };
  }

  const fact = observation.source === 'weather' ? weatherFact(observation) : earthquakeFact(observation);
  return {
    available: true,
    source: observation.source,
    status: result.status,
    sourceLine: statusLine(result),
    observation,
    tags: tagsForObservation(observation),
    route: routeForObservation(observation),
    fact
  };
}

export function buildReflectionSeed(context) {
  if (!context.available) return 'listen return next step';
  const location = context.observation?.location;
  const coordinates = location && typeof location === 'object' && 'latitude' in location
    ? ['latitude', 'longitude']
        .map((key) => Number(location[key]).toFixed(2))
        .filter((value) => value !== 'NaN')
        .join(' ')
    : '';
  return unique([...context.tags, ...compact(coordinates), 'observe', 'return']).join(' ');
}

export function formatLiveBlock(context) {
  const lines = [
    `[observation / ${context.source} / ${context.status}]`,
    context.fact,
    context.observation?.observedAt ? `observed ${ageLabel(context.observedAt)}` : null,
    context.sourceLine
  ].filter(Boolean);
  return lines.join('\n');
}

export function formatTraceBlock(context) {
  return [
    '[trace]',
    `route: ${context.route.join(' → ')}`,
    `tags: ${context.tags.join(', ') || 'none'}`,
    `source: ${context.sourceLine}`,
    `generation: local Markov reflection; live values remain in the observation block`
  ].join('\n');
}

export async function getLiveContext(source = 'weather', options = {}) {
  const normalized = String(source || 'weather').trim().toLowerCase();
  const result = normalized === 'earthquakes' || normalized === 'earthquake' || normalized === 'quake'
    ? await getEarthquakes(options)
    : await getLocalWeather(options);
  return toLiveContext(result);
}

export async function getSourceStatus(options = {}) {
  const [weather, earthquakes] = await Promise.all([
    getLocalWeather(options.weather),
    getEarthquakes(options.earthquakes)
  ]);
  return [weather, earthquakes].map(statusLine);
}
