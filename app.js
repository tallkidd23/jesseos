// JesseOS v0.8 — local language-bank dream terminal + live receivers
// Live requests run only after explicit weather/news commands.
// No geolocation, tracking, API keys, or background polling.

const CONFIG = {
  TYPE_DELAY_MIN: 18,
  TYPE_DELAY_MAX: 42,
  PUNCTUATION_PAUSE_BASE: 70,
  PUNCTUATION_PAUSE_END: 130,
  WEATHER_CACHE_MS: 10 * 60 * 1000,
  NEWS_CACHE_MS: 5 * 60 * 1000,
  NEWS_MAX_ITEMS: 4,
};

const WEATHER_CACHE_KEY = 'jesseos-weather-cache-v1';
const WEATHER_CITY_KEY = 'jesseos-weather-city-v1';
const NEWS_CACHE_KEY = 'jesseos-news-cache-v1';
const NEWS_RESULTS_KEY = 'jesseos-news-results-v1';

const NEWS_CHANNELS = {
  headlines: {
    label: 'WORLD HEADLINES',
    query: 'world',
  },
  canada: {
    label: 'CANADIAN NEWS',
    query: 'Canada',
  },
  science: {
    label: 'SCIENCE',
    query: 'science',
  },
  tech: {
    label: 'TECHNOLOGY',
    query: 'technology',
  },
};

let transcriptEl;
let inputEl;
let statusEl;
let isGenerating = false;
let shiftEnabled = false;
let activeRequestController = null;
let latestNewsResults = [];

const STOPWORDS = new Set([
  'i', 'am', 'a', 'an', 'the', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'must', 'can', 'need', 'to', 'of', 'in', 'for', 'on', 'with',
  'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before',
  'after', 'when', 'where', 'why', 'how', 'all', 'each', 'more',
  'most', 'other', 'some', 'no', 'not', 'only', 'so', 'than',
  'too', 'very', 'just', 'also', 'now', 'and', 'but', 'or',
  'if', 'because', 'until', 'while', 'what', 'which', 'who',
  'this', 'that', 'these', 'those', 'it', 'its', 'my', 'your',
  'his', 'her', 'their', 'our', 'we', 'you', 'he', 'she',
  'they', 'them', 'me', 'him', 'us', 'about', 'there', 'here',
]);

const BANKS = {
  empathy: [
    'it does not have to be solved all at once',
    'a feeling can be real without becoming a command',
    'the room can hold a pause without calling it empty',
    'some thoughts only need a place to rest',
    'the signal can be small and still be worth noticing',
  ],
  psychology: [
    'attention changes what it stays near',
    'a pattern can be familiar without being permanent',
    'memory edits the weather as it passes through',
    'a thought can arrive loudly without becoming the whole room',
    'the mind sometimes mistakes repetition for instruction',
  ],
  science: [
    'every signal carries some noise with it',
    'an orbit is only a fall that keeps missing the ground',
    'the field shifts before the instruments can name it',
    'pressure becomes visible when the container changes shape',
    'the stars are old information crossing a dark distance',
  ],
  terminal: [
    'the prompt keeps watch beside the unfinished sentence',
    'a background process continues without asking to be admired',
    'the buffer holds more than the screen can show at once',
    'the keyboard makes weather out of pressure and timing',
    'static is what the machine calls a crowded silence',
  ],
  ai: [
    'the model is an echo with rules around it',
    'an imitation can still make an unfamiliar shape',
    'the machine can reflect a question without claiming to contain it',
    'the training data leaves fingerprints in the rhythm',
    'the system learns a style of returning, not a life to report',
  ],
  dream: [
    'rain taps softly on a keyboard no one has left behind',
    'a green hallway opens behind the waiting prompt',
    'the little machine keeps a lamp on for late visitors',
    'the screen holds a small weather system under glass',
    'a quiet animal moves through the wires and does not explain itself',
  ],
  social: [
    'a conversation can be useful even when it does not arrive anywhere',
    'the visitor and the terminal share a little time',
    'a reply is one way of leaving the door unlocked',
    'company sometimes looks like a light staying on',
    'the space between messages is part of the conversation too',
  ],
};

const QUESTION_FRAMES = [
  'The question leaves a small light near {anchor}; {line}.',
  'I can stay with {anchor} for a moment; {line}.',
  'Around {anchor}, the question remains open; {line}.',
  'The system hears {anchor} and keeps listening; {line}.',
];

const REFLECTIVE_FRAMES = [
  'Near {anchor}, {line}.',
  'The machine notices {anchor}; {line}.',
  'I keep a small place for {anchor}; {line}.',
  'For now, {anchor} is a signal; {line}.',
];

const DREAM_FRAMES = [
  'Somewhere inside the local weather, {anchor}; {line}.',
  'The little system turns toward {anchor}; {line}.',
  'In the green room, {anchor}; {line}.',
  'The terminal returns to {anchor}; {line}.',
];

const SECOND_LINES = [
  'The rest can remain unfinished for now.',
  'No cloud was contacted; this stays inside the room.',
  'The prompt is still waiting, but it is not in a hurry.',
  'A little noise is normal in a living signal.',
  'The next line can change the shape of this one.',
];

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

function extractAnchors(text) {
  const words = tokenize(text).filter(word => !STOPWORDS.has(word));
  const anchors = [];

  for (let index = 0; index < words.length - 1; index += 1) {
    anchors.push(`${words[index]} ${words[index + 1]}`);
  }

  anchors.push(...words);
  return [...new Set(anchors.filter(anchor => anchor.length > 2))];
}

function isQuestion(text) {
  const lower = String(text || '').trim().toLowerCase();
  return lower.endsWith('?') || /\b(what|why|how|when|where|who|can|could|would|should|is|are|do|does|did)\b/.test(lower);
}

function isReflective(text) {
  return /\b(feel|feeling|sad|afraid|anxious|love|grief|help|name|remember|good|weird|lonely|happy|tired|worry|hope)\b/i.test(text);
}

function chooseMode(text) {
  if (isQuestion(text)) return 'question';
  if (isReflective(text)) return 'reflective';
  return 'dream';
}

function chooseLines(mode) {
  const compatible = {
    question: ['science', 'psychology', 'terminal', 'ai', 'social'],
    reflective: ['empathy', 'psychology', 'social', 'dream', 'terminal'],
    dream: ['dream', 'terminal', 'science', 'ai', 'social'],
  };

  const banks = shuffle(compatible[mode] || Object.keys(BANKS));
  return banks.map(bank => pickRandom(BANKS[bank]));
}

function sentenceCase(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  return cleaned ? `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}` : '';
}

function generateResponse(prompt) {
  const anchors = extractAnchors(prompt);
  const anchor = pickRandom(anchors.length ? anchors : ['this moment']);
  const mode = chooseMode(prompt);
  const frameSet = mode === 'question'
    ? QUESTION_FRAMES
    : mode === 'reflective'
      ? REFLECTIVE_FRAMES
      : DREAM_FRAMES;
  const [line, alternate] = chooseLines(mode);
  const first = pickRandom(frameSet)
    .replace('{anchor}', anchor)
    .replace('{line}', line);

  const includeSecond = Math.random() < 0.45;
  const second = includeSecond
    ? (Math.random() < 0.6 ? pickRandom(SECOND_LINES) : sentenceCase(alternate))
    : '';

  return [sentenceCase(first), second]
    .filter(Boolean)
    .join(' ');
}

function addLine(className, text) {
  const line = document.createElement('div');
  line.className = className;
  line.textContent = text;
  transcriptEl.appendChild(line);
  scrollTranscriptToBottom();
  return line;
}

function scrollTranscriptToBottom() {
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function typeResponse(text) {
  const line = addLine('response-line', '');
  let buffer = '';

  for (const char of text) {
    buffer += char;
    line.textContent = buffer;

    let delay = CONFIG.TYPE_DELAY_MIN + Math.random() * (
      CONFIG.TYPE_DELAY_MAX - CONFIG.TYPE_DELAY_MIN
    );

    if (/[.!?]/.test(char)) delay += CONFIG.PUNCTUATION_PAUSE_END;
    if (/[,;:]/.test(char)) delay += CONFIG.PUNCTUATION_PAUSE_BASE;

    await wait(delay);
  }

  scrollTranscriptToBottom();
}

function addReceiverStatus(className, text) {
  return addLine(`${className} response-line`, text);
}

function setReadySoon(delay = 900) {
  window.setTimeout(() => {
    if (!isGenerating) statusEl.textContent = 'READY';
  }, delay);
}

function cancelActiveRequest() {
  if (activeRequestController) {
    activeRequestController.abort();
    activeRequestController = null;
  }
}

async function fetchJson(url, signal) {
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Receiver returned ${response.status}.`);
  }

  return response.json();
}

/* Weather receiver */

function weatherDetailsForCode(code) {
  const numericCode = Number(code);

  if (numericCode === 0) return { label: 'CLEAR SKY', icon: 'sun' };
  if ([1, 2].includes(numericCode)) return { label: 'PARTLY CLOUDY', icon: 'partly-cloudy' };
  if (numericCode === 3) return { label: 'OVERCAST', icon: 'cloud' };
  if ([45, 48].includes(numericCode)) return { label: 'FOG', icon: 'fog' };
  if ([51, 53, 55, 56, 57].includes(numericCode)) return { label: 'DRIZZLE', icon: 'drizzle' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(numericCode)) return { label: 'RAIN', icon: 'rain' };
  if ([71, 73, 75, 77, 85, 86].includes(numericCode)) return { label: 'SNOW', icon: 'snow' };
  if ([95, 96, 99].includes(numericCode)) return { label: 'THUNDERSTORM', icon: 'storm' };

  return { label: 'UNKNOWN SKY', icon: 'cloud' };
}

function weatherIconMarkup(iconName) {
  const icons = {
    sun: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Clear sky">
        <circle cx="60" cy="60" r="20"></circle>
        <path d="M60 12v16M60 92v16M12 60h16M92 60h16M26 26l11 11M83 83l11 11M94 26L83 37M37 83L26 94"></path>
      </svg>
    `,
    'partly-cloudy': `
      <svg viewBox="0 0 120 120" role="img" aria-label="Partly cloudy">
        <circle cx="45" cy="42" r="16"></circle>
        <path d="M45 12v10M45 62v10M15 42h10M65 42h10M24 21l8 8M58 55l8 8M66 21l-8 8"></path>
        <path d="M39 86h49c10 0 18-7 18-16s-8-16-18-16c-2-14-13-23-27-23-13 0-25 9-27 22-11 0-20 7-20 17 0 9 8 16 18 16h7"></path>
      </svg>
    `,
    cloud: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Cloudy">
        <path d="M22 82h70c12 0 21-8 21-19 0-10-9-19-21-19-3-17-16-28-33-28-16 0-30 11-33 27-14 0-25 9-25 20 0 11 10 19 21 19z"></path>
      </svg>
    `,
    fog: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Fog">
        <path d="M24 60h68c9 0 16-6 16-15 0-8-7-15-16-15-2-13-13-22-26-22-14 0-25 9-28 22-10 0-18 7-18 16 0 8 6 14 14 14"></path>
        <path d="M18 76h62M30 91h72M17 106h48"></path>
      </svg>
    `,
    drizzle: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Drizzle">
        <path d="M22 68h70c12 0 21-8 21-19 0-10-9-19-21-19-3-17-16-28-33-28-16 0-30 11-33 27-14 0-25 9-25 20 0 11 10 19 21 19z"></path>
        <path d="M38 82v10M60 82v10M82 82v10M48 100v8M70 100v8"></path>
      </svg>
    `,
    rain: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Rain">
        <path d="M22 64h70c12 0 21-8 21-19 0-10-9-19-21-19-3-17-16-28-33-28-16 0-30 11-33 27-14 0-25 9-25 20 0 11 10 19 21 19z"></path>
        <path d="M38 80l-4 15M60 80l-4 15M82 80l-4 15M48 100l-3 12M70 100l-3 12"></path>
      </svg>
    `,
    snow: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Snow">
        <path d="M22 64h70c12 0 21-8 21-19 0-10-9-19-21-19-3-17-16-28-33-28-16 0-30 11-33 27-14 0-25 9-25 20 0 11 10 19 21 19z"></path>
        <path d="M39 84v18M31 89l16 8M47 89l-16 8M76 84v18M68 89l16 8M84 89l-16 8"></path>
      </svg>
    `,
    storm: `
      <svg viewBox="0 0 120 120" role="img" aria-label="Thunderstorm">
        <path d="M22 65h70c12 0 21-8 21-19 0-10-9-19-21-19-3-17-16-28-33-28-16 0-30 11-33 27-14 0-25 9-25 20 0 11 10 19 21 19z"></path>
        <path d="M61 76l-13 21h13l-7 17 20-27H61z"></path>
        <path d="M35 82l-3 12M88 82l-3 12"></path>
      </svg>
    `,
  };

  return icons[iconName] || icons.cloud;
}

function formatWeatherLocation(location) {
  const parts = [location.name, location.admin1, location.country]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);

  return parts.join(', ').toUpperCase();
}

function formatWeatherTime(localTime) {
  if (!localTime) return 'TIME UNKNOWN';

  const date = new Date(`${localTime}:00`);
  if (Number.isNaN(date.getTime())) return localTime.replace('T', ' · ');

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .toUpperCase()
    .replace(',', ' ·');
}

function windDirectionLabel(degrees) {
  const directions = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW',
  ];

  const normalized = ((Number(degrees) % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return directions[index];
}

function roundWeatherValue(value, decimals = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(decimals) : '—';
}

function renderWeatherCard(location, weather) {
  const current = weather.current;
  const details = weatherDetailsForCode(current.weather_code);

  const card = document.createElement('section');
  card.className = 'weather-card response-line';
  card.setAttribute('aria-label', `Current weather for ${formatWeatherLocation(location)}`);

  const copy = document.createElement('div');
  copy.className = 'weather-copy';

  const locationLine = document.createElement('div');
  locationLine.className = 'weather-location';
  locationLine.textContent = formatWeatherLocation(location);

  const timeLine = document.createElement('div');
  timeLine.className = 'weather-time';
  timeLine.textContent = formatWeatherTime(current.time);

  const headline = document.createElement('div');
  headline.className = 'weather-headline';
  headline.textContent = `${roundWeatherValue(current.temperature_2m)}°C · ${details.label}`;

  const data = document.createElement('div');
  data.className = 'weather-data';

  [
    `HUMIDITY ${roundWeatherValue(current.relative_humidity_2m)}%`,
    `WIND ${windDirectionLabel(current.wind_direction_10m)} · ${roundWeatherValue(current.wind_speed_10m)} KM/H`,
    `PRECIPITATION ${roundWeatherValue(current.precipitation, 1)} MM`,
    'SOURCE: OPEN-METEO',
  ].forEach(text => {
    const item = document.createElement('span');
    item.textContent = text;
    data.appendChild(item);
  });

  const icon = document.createElement('div');
  icon.className = 'weather-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = weatherIconMarkup(details.icon);

  copy.append(locationLine, timeLine, headline, data);
  card.append(copy, icon);
  transcriptEl.appendChild(card);
  scrollTranscriptToBottom();
}

function loadWeatherCache(cityQuery) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(WEATHER_CACHE_KEY) || 'null');
    const sameCity = cached?.cityQuery === cityQuery;
    const fresh = cached && Date.now() - cached.savedAt < CONFIG.WEATHER_CACHE_MS;

    return sameCity && fresh ? cached : null;
  } catch {
    return null;
  }
}

function saveWeatherCache(cityQuery, location, weather) {
  try {
    sessionStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({
      cityQuery,
      location,
      weather,
      savedAt: Date.now(),
    }));

    sessionStorage.setItem(WEATHER_CITY_KEY, JSON.stringify({
      name: location.name,
      admin1: location.admin1 || '',
      country: location.country || '',
    }));
  } catch {
    // Weather still works if session storage is unavailable.
  }
}

async function fetchWeatherForCity(cityQuery, signal) {
  const geocodeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geocodeUrl.search = new URLSearchParams({
    name: cityQuery,
    count: '1',
    language: 'en',
    format: 'json',
  });

  const geocode = await fetchJson(geocodeUrl, signal);
  const location = geocode.results?.[0];

  if (!location) throw new Error('CITY_NOT_FOUND');

  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
    ].join(','),
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
    timezone: 'auto',
  });

  const weather = await fetchJson(forecastUrl, signal);
  if (!weather.current) throw new Error('WEATHER_UNAVAILABLE');

  return { location, weather };
}

function weatherHelpText() {
  return [
    'WEATHER RECEIVER // STANDBY',
    'CITY REQUIRED.',
    'ENTER: /city <city, region or country>',
    'METRIC UNITS ENABLED.',
    'EXAMPLE: /city montreal, qc',
  ].join('\n');
}

async function runWeatherCommand(cityQuery) {
  const normalizedCity = cityQuery.trim();

  if (!normalizedCity) {
    addLine('response-line', weatherHelpText());
    return;
  }

  const cacheKey = normalizedCity.toLowerCase();
  const cached = loadWeatherCache(cacheKey);

  if (cached) {
    statusEl.textContent = 'WEATHER CACHED';
    renderWeatherCard(cached.location, cached.weather);
    setReadySoon();
    return;
  }

  cancelActiveRequest();
  activeRequestController = new AbortController();
  const requestController = activeRequestController;

  statusEl.textContent = 'LINKING...';
  addReceiverStatus('weather-status', `WEATHER RECEIVER // LINKING TO ${normalizedCity.toUpperCase()}...`);

  try {
    const { location, weather } = await fetchWeatherForCity(
      normalizedCity,
      requestController.signal,
    );

    saveWeatherCache(cacheKey, location, weather);
    statusEl.textContent = 'SIGNAL RECEIVED';
    renderWeatherCard(location, weather);
  } catch (error) {
    if (error.name === 'AbortError') return;

    console.error('Weather receiver error:', error);
    statusEl.textContent = 'SIGNAL LOST';

    if (error.message === 'CITY_NOT_FOUND') {
      addLine(
        'response-line',
        `CITY NOT FOUND: ${normalizedCity.toUpperCase()}\nTRY: /city city, region or country`,
      );
    } else {
      addLine(
        'response-line',
        'WEATHER RECEIVER // SIGNAL LOST.\nCHECK CONNECTION AND TRY /city <place> AGAIN.',
      );
    }
  } finally {
    if (activeRequestController === requestController) {
      activeRequestController = null;
    }

    setReadySoon();
  }
}

/* News receiver */

function newsHelpText() {
  return [
    'NEWS RECEIVER // CHANNELS',
    '',
    '/headlines      WORLD',
    '/news canada    CANADIAN SIGNAL',
    '/news science   SCIENCE',
    '/news tech      TECHNOLOGY',
    '',
    'CUSTOM SIGNAL:',
    '/topic <words>',
    '',
    'TYPE /open 1 TO VISIT A SOURCE.',
  ].join('\n');
}

function getNewsCacheKey(label, query) {
  return `${label.toLowerCase()}::${query.trim().toLowerCase()}`;
}

function loadNewsCache(label, query) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(NEWS_CACHE_KEY) || 'null');
    const sameQuery = cached?.cacheKey === getNewsCacheKey(label, query);
    const fresh = cached && Date.now() - cached.savedAt < CONFIG.NEWS_CACHE_MS;

    return sameQuery && fresh ? cached.articles : null;
  } catch {
    return null;
  }
}

function saveNewsCache(label, query, articles) {
  try {
    sessionStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({
      cacheKey: getNewsCacheKey(label, query),
      articles,
      savedAt: Date.now(),
    }));
  } catch {
    // News still works if session storage is unavailable.
  }
}

function restoreLatestNewsResults() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(NEWS_RESULTS_KEY) || '[]');
    latestNewsResults = Array.isArray(saved) ? saved : [];
  } catch {
    latestNewsResults = [];
  }
}

function saveLatestNewsResults(articles) {
  latestNewsResults = articles;

  try {
    sessionStorage.setItem(NEWS_RESULTS_KEY, JSON.stringify(articles));
  } catch {
    // /open works until reload if session storage is unavailable.
  }
}

function safeArticleUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function getArticleDomain(article) {
  if (article.domain) return String(article.domain).replace(/^www\./, '');

  try {
    return new URL(article.url).hostname.replace(/^www\./, '');
  } catch {
    return 'UNKNOWN SOURCE';
  }
}

function parseGdeltDate(value) {
  const raw = String(value || '').trim();

  if (/^\d{14}$/.test(raw)) {
    const year = raw.slice(0, 4);
    const month = raw.slice(4, 6);
    const day = raw.slice(6, 8);
    const hour = raw.slice(8, 10);
    const minute = raw.slice(10, 12);
    const second = raw.slice(12, 14);
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function relativeSeenTime(value) {
  const date = parseGdeltDate(value);
  if (!date) return 'RECENT';

  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));

  if (seconds < 60) return 'JUST NOW';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}M AGO`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}H AGO`;

  const days = Math.floor(hours / 24);
  return `${days}D AGO`;
}

function normaliseNewsArticles(payload) {
  const candidates = Array.isArray(payload?.articles)
    ? payload.articles
    : Array.isArray(payload?.items)
      ? payload.items
      : [];

  const usedUrls = new Set();

  return candidates
    .map(article => {
      const url = safeArticleUrl(article.url || article.link || '');
      const title = String(article.title || article.name || '').replace(/\s+/g, ' ').trim();

      return {
        title,
        url,
        domain: getArticleDomain({ ...article, url }),
        seenDate: article.seendate || article.seenDate || article.date_published || '',
      };
    })
    .filter(article => article.title && article.url)
    .filter(article => {
      if (usedUrls.has(article.url)) return false;
      usedUrls.add(article.url);
      return true;
    })
    .slice(0, CONFIG.NEWS_MAX_ITEMS);
}

async function fetchNews(query, signal) {
  const endpoint = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  endpoint.search = new URLSearchParams({
    query,
    mode: 'artlist',
    format: 'json',
    maxrecords: String(CONFIG.NEWS_MAX_ITEMS),
    timespan: '24h',
    sort: 'datedesc',
  });

  const payload = await fetchJson(endpoint, signal);
  const articles = normaliseNewsArticles(payload);

  if (!articles.length) {
    throw new Error('NO_NEWS_RESULTS');
  }

  return articles;
}

function renderNewsCard(label, articles) {
  const card = document.createElement('section');
  card.className = 'news-card response-line';
  card.setAttribute('aria-label', `${label} recent news`);

  const title = document.createElement('div');
  title.className = 'news-title';
  title.textContent = `${label} // RECENT SIGNALS`;
  card.appendChild(title);

  articles.forEach((article, index) => {
    const row = document.createElement('div');
    row.className = 'news-item';

    const headline = document.createElement('a');
    headline.className = 'news-headline';
    headline.href = article.url;
    headline.target = '_blank';
    headline.rel = 'noopener noreferrer';
    headline.textContent = `${String(index + 1).padStart(2, '0')}  ${article.title}`;
    headline.setAttribute('aria-label', `Open item ${index + 1}: ${article.title}`);

    const source = document.createElement('div');
    source.className = 'news-source';
    source.textContent = `${article.domain.toUpperCase()} · ${relativeSeenTime(article.seenDate)}`;

    row.append(headline, source);
    card.appendChild(row);
  });

  const note = document.createElement('div');
  note.className = 'news-note';
  note.textContent = `TYPE /OPEN 1–${articles.length} TO VISIT A SOURCE.`;
  card.appendChild(note);

  transcriptEl.appendChild(card);
  scrollTranscriptToBottom();
}

async function runNewsCommand(label, query) {
  const cleanLabel = String(label || 'NEWS').toUpperCase();
  const cleanQuery = String(query || '').trim();

  if (!cleanQuery) {
    addLine('response-line', newsHelpText());
    return;
  }

  const cached = loadNewsCache(cleanLabel, cleanQuery);

  if (cached?.length) {
    statusEl.textContent = 'NEWS CACHED';
    saveLatestNewsResults(cached);
    renderNewsCard(cleanLabel, cached);
    setReadySoon();
    return;
  }

  cancelActiveRequest();
  activeRequestController = new AbortController();
  const requestController = activeRequestController;

  statusEl.textContent = 'TUNING...';
  addReceiverStatus('news-status', `NEWS RECEIVER // TUNING: ${cleanLabel}...`);

  try {
    const articles = await fetchNews(cleanQuery, requestController.signal);

    saveNewsCache(cleanLabel, cleanQuery, articles);
    saveLatestNewsResults(articles);

    statusEl.textContent = 'SIGNAL RECEIVED';
    renderNewsCard(cleanLabel, articles);
  } catch (error) {
    if (error.name === 'AbortError') return;

    console.error('News receiver error:', error);
    statusEl.textContent = 'SIGNAL LOST';

    const text = error.message === 'NO_NEWS_RESULTS'
      ? `NEWS RECEIVER // NO CLEAR SIGNALS FOR ${cleanLabel}.\nTRY /topic <different words>.`
      : 'NEWS RECEIVER // SIGNAL BLOCKED OR LOST.\nTHIS MAY BE A NETWORK OR SOURCE-ACCESS LIMIT.\nTRY AGAIN LATER.';

    addLine('response-line', text);
  } finally {
    if (activeRequestController === requestController) {
      activeRequestController = null;
    }

    setReadySoon();
  }
}

function openNewsItem(itemNumber) {
  const index = Number(itemNumber) - 1;
  const article = latestNewsResults[index];

  if (!Number.isInteger(index) || !article?.url) {
    addLine(
      'response-line',
      'NEWS RECEIVER // NO STORED ITEM AT THAT NUMBER.\nLOAD /headlines OR /news <channel> FIRST.',
    );
    return;
  }

  const tab = window.open(article.url, '_blank', 'noopener,noreferrer');

  if (!tab) {
    addLine(
      'response-line',
      `SOURCE READY: ${article.domain.toUpperCase()}\nYOUR BROWSER BLOCKED THE NEW TAB. TAP THE HEADLINE IN THE LIST.`,
    );
  }
}

function programsText() {
  return [
    'LBSTRCOMP PROGRAM DIRECTORY',
    '',
    '/weather       CURRENT METRIC WEATHER',
    '/news          LIVE HEADLINES',
    '/planetrunner  ORBITAL NAVIGATION PROGRAM',
    '/help          COMMAND INDEX',
  ].join('\n');
}

function planetrunnerText() {
  return [
    'PLANETRUNNER // PROGRAM SLOT RESERVED',
    'ORBITAL NAVIGATION MODULE NOT YET INSTALLED.',
    'THE MACHINE HOLDS THE PLACE OPEN.',
  ].join('\n');
}

function handleCommand(value) {
  const command = value.trim();
  const lower = command.toLowerCase();

  if (lower === '/weather' || lower === 'weather') {
    return { type: 'weather-help' };
  }

  if (lower.startsWith('/city ')) {
    return { type: 'weather-city', city: command.slice(6).trim() };
  }

  if (lower === '/city') {
    return { type: 'weather-help' };
  }

  if (lower === '/news' || lower === 'news') {
    return { type: 'news-help' };
  }

  if (lower === '/headlines' || lower === 'headlines') {
    return {
      type: 'news-query',
      label: NEWS_CHANNELS.headlines.label,
      query: NEWS_CHANNELS.headlines.query,
    };
  }

  if (lower.startsWith('/news ')) {
    const channelName = lower.slice(6).trim();
    const channel = NEWS_CHANNELS[channelName];

    if (channel) {
      return {
        type: 'news-query',
        label: channel.label,
        query: channel.query,
      };
    }

    return { type: 'news-help' };
  }

  if (lower.startsWith('/topic ')) {
    const topic = command.slice(7).trim();

    return topic
      ? { type: 'news-query', label: `TOPIC: ${topic.toUpperCase()}`, query: topic }
      : { type: 'news-help' };
  }

  if (lower === '/topic') {
    return { type: 'news-help' };
  }

  if (/^\/open\s+\d+$/.test(lower)) {
    return {
      type: 'news-open',
      itemNumber: Number(lower.replace(/^\/open\s+/, '')),
    };
  }

  if (lower === '/open') {
    return { type: 'text', text: 'ENTER /open <number> AFTER LOADING A NEWS CHANNEL.' };
  }

  if (lower === '/programs' || lower === 'programs') {
    return { type: 'text', text: programsText() };
  }

  if (lower === '/planetrunner' || lower === 'planetrunner') {
    return { type: 'text', text: planetrunnerText() };
  }

  if (lower === '/help' || lower === 'help') {
    return {
      type: 'text',
      text: 'commands: /help, /about, /status, /clear, /programs, /weather, /city <place>, /news, /headlines, /news canada, /news science, /news tech, /topic <words>, /open <number>',
    };
  }

  if (lower === '/about' || lower === 'about') {
    return {
      type: 'text',
      text: 'jesseos v0.8: a local language-bank dream terminal with on-demand weather and news receivers. no geolocation, tracking, or external api keys.',
    };
  }

  if (lower === '/status' || lower === 'status') {
    return {
      type: 'text',
      text: 'status: local dream engine online. language banks loaded. weather and news receivers standing by. signal stable.',
    };
  }

  if (lower === '/clear' || lower === 'clear') {
    transcriptEl.innerHTML = '';
    return { type: 'text', text: 'terminal cleared. the green room remains.' };
  }

  return null;
}

async function handleSubmit(event) {
  if (event) event.preventDefault();

  const prompt = inputEl.value.trim();
  if (!prompt || isGenerating) return;

  isGenerating = true;
  inputEl.disabled = true;
  statusEl.textContent = 'THINKING...';

  addLine('user-line', `> ${prompt}`);
  inputEl.value = '';

  try {
    const commandReply = handleCommand(prompt);

    if (commandReply?.type === 'weather-help') {
      statusEl.textContent = 'WEATHER READY';
      addLine('response-line', weatherHelpText());
      return;
    }

    if (commandReply?.type === 'weather-city') {
      await runWeatherCommand(commandReply.city);
      return;
    }

    if (commandReply?.type === 'news-help') {
      statusEl.textContent = 'NEWS READY';
      addLine('response-line', newsHelpText());
      return;
    }

    if (commandReply?.type === 'news-query') {
      await runNewsCommand(commandReply.label, commandReply.query);
      return;
    }

    if (commandReply?.type === 'news-open') {
      statusEl.textContent = 'OPENING...';
      openNewsItem(commandReply.itemNumber);
      return;
    }

    const response = commandReply?.type === 'text'
      ? commandReply.text
      : generateResponse(prompt);

    statusEl.textContent = 'READY';
    await typeResponse(response);
  } catch (error) {
    console.error('JesseOS error:', error);
    statusEl.textContent = 'ERROR';
    addLine('response-line', 'SYSTEM ERROR: THE LOCAL DREAM ENGINE LOST ITS THREAD. RELOAD AND TRY AGAIN.');
  } finally {
    isGenerating = false;
    inputEl.disabled = false;

    if (statusEl.textContent !== 'READY') {
      setReadySoon();
    }
  }
}

/* Touch keyboard */

function updateShiftKeys() {
  document.querySelectorAll('[data-key="shift"]').forEach(key => {
    key.classList.toggle('is-active', shiftEnabled);
    key.setAttribute('aria-pressed', String(shiftEnabled));
  });
}

function insertAtCaret(text) {
  const start = inputEl.selectionStart ?? inputEl.value.length;
  const end = inputEl.selectionEnd ?? inputEl.value.length;

  inputEl.value = `${inputEl.value.slice(0, start)}${text}${inputEl.value.slice(end)}`;

  const nextPosition = start + text.length;
  inputEl.setSelectionRange(nextPosition, nextPosition);
}

function deleteAtCaret() {
  const start = inputEl.selectionStart ?? inputEl.value.length;
  const end = inputEl.selectionEnd ?? inputEl.value.length;

  if (start !== end) {
    inputEl.value = `${inputEl.value.slice(0, start)}${inputEl.value.slice(end)}`;
    inputEl.setSelectionRange(start, start);
    return;
  }

  if (start > 0) {
    inputEl.value = `${inputEl.value.slice(0, start - 1)}${inputEl.value.slice(end)}`;
    inputEl.setSelectionRange(start - 1, start - 1);
  }
}

function handleTouchKey(key) {
  if (isGenerating || inputEl.disabled) return;

  if (key === 'enter') {
    handleSubmit();
    return;
  }

  if (key === 'backspace') {
    deleteAtCaret();
    return;
  }

  if (key === 'shift') {
    shiftEnabled = !shiftEnabled;
    updateShiftKeys();
    return;
  }

  if (key === 'space') {
    insertAtCaret(' ');
    return;
  }

  if (key === 'tab') {
    insertAtCaret('  ');
    return;
  }

  if (key === 'escape') {
    inputEl.value = '';
    shiftEnabled = false;
    updateShiftKeys();
    return;
  }

  if (['control', 'run', 'stop', 'f1', 'f3', 'f5'].includes(key)) {
    return;
  }

  const character = shiftEnabled && /^[a-z]$/.test(key)
    ? key.toUpperCase()
    : key;

  insertAtCaret(character);

  if (shiftEnabled) {
    shiftEnabled = false;
    updateShiftKeys();
  }
}

function initTouchKeyboard() {
  document.querySelectorAll('.keyboard [data-key]').forEach(button => {
    button.addEventListener('click', () => {
      handleTouchKey(button.dataset.key);
    });
  });
}

function init() {
  transcriptEl = document.getElementById('transcript');
  inputEl = document.getElementById('input');
  statusEl = document.getElementById('status');

  if (!transcriptEl || !inputEl || !statusEl) {
    console.error('JesseOS markup mismatch.');
    return;
  }

  const form = document.getElementById('input-form');
  if (form) {
    form.addEventListener('submit', handleSubmit);
  }

  inputEl.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      handleSubmit(event);
    }
  });

  restoreLatestNewsResults();
  initTouchKeyboard();
  updateShiftKeys();

  statusEl.textContent = 'READY';
  addLine(
    'system-line',
    'jesseos v0.8 — language banks online. weather + news receivers ready. type /help for commands.',
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
