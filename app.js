/*
  JESSEOS // LBSTRCOMP
  Complete replacement app.js

  This version intentionally keeps the original JesseOS functions:
  - local language-bank dream responses
  - on-demand weather through Open-Meteo
  - on-demand news through GDELT
  - cached weather/news results
  - touch keyboard plus physical-key animation

  It adds a safe B: shell on top of that behavior. The shell does not build
  paths by blindly appending names, which prevents B:\WEATHER\WEATHER\ bugs.
*/

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
const NEWS_CACHE_KEY = 'jesseos-news-cache-v1';
const NEWS_RESULTS_KEY = 'jesseos-news-results-v1';

const NEWS_CHANNELS = {
  headlines: { label: 'WORLD HEADLINES', query: 'world sourcelang:English' },
  canada: { label: 'CANADIAN NEWS', query: 'Canada sourcelang:English' },
  science: { label: 'SCIENCE', query: 'science sourcelang:English' },
  tech: { label: 'TECHNOLOGY', query: 'technology sourcelang:English' },
};

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

const STOPWORDS = new Set([
  'i', 'am', 'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'can', 'need', 'to', 'of',
  'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'during', 'before', 'after', 'when', 'where', 'why', 'how', 'all', 'each',
  'more', 'most', 'other', 'some', 'no', 'not', 'only', 'so', 'than', 'too',
  'very', 'just', 'also', 'now', 'and', 'but', 'or', 'if', 'because', 'until',
  'while', 'what', 'which', 'who', 'this', 'that', 'these', 'those', 'it',
  'its', 'my', 'your', 'his', 'her', 'their', 'our', 'we', 'you', 'he', 'she',
  'they', 'them', 'me', 'him', 'us', 'about', 'there', 'here',
]);

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

let transcriptEl;
let inputEl;
let statusEl;
let isGenerating = false;
let shiftEnabled = false;
let activeRequestController = null;
let latestNewsResults = [];
let currentDirectory = 'ROOT';
let commandHistory = [];
let historyIndex = -1;
let hardwareKeyboardMode = false;

const DIRECTORIES = {
  ROOT: {
    path: 'B:\\',
    entries: [
      ['WEATHER', '<DIR>', 'LIVE LOCAL CONDITIONS'],
      ['NEWS', '<DIR>', 'HEADLINES AND TOPICS'],
      ['BOARD', '<DIR>', 'LOCAL MESSAGE ARCHIVE'],
      ['GAMES', '<DIR>', 'INSTALLED PROGRAMS'],
      ['ABOUT.TXT', 'FILE', 'SYSTEM INFORMATION'],
      ['STATUS.EXE', 'EXE', 'MACHINE STATUS'],
      ['CLS.EXE', 'EXE', 'CLEAR SCREEN'],
      ['HELP.EXE', 'EXE', 'COMMAND INDEX'],
    ],
  },
  WEATHER: {
    path: 'B:\\WEATHER\\',
    entries: [
      ['CURRENT.EXE', 'EXE', 'CURRENT WEATHER BY CITY'],
      ['HELP.TXT', 'FILE', 'WEATHER RECEIVER NOTES'],
    ],
  },
  NEWS: {
    path: 'B:\\NEWS\\',
    entries: [
      ['HEADLINES.EXE', 'EXE', 'WORLD HEADLINES'],
      ['CANADA.EXE', 'EXE', 'CANADIAN SIGNAL'],
      ['SCIENCE.EXE', 'EXE', 'SCIENCE SIGNAL'],
      ['TECH.EXE', 'EXE', 'TECHNOLOGY SIGNAL'],
      ['TOPIC.EXE', 'EXE', 'SEARCH CUSTOM TOPIC'],
      ['OPEN.EXE', 'EXE', 'OPEN STORED NEWS ITEM'],
      ['HELP.TXT', 'FILE', 'NEWS RECEIVER NOTES'],
    ],
  },
  BOARD: {
    path: 'B:\\BOARD\\',
    entries: [
      ['README.TXT', 'FILE', 'LOCAL MESSAGE ARCHIVE'],
      ['LISTEN.EXE', 'EXE', 'OPEN DREAM CHANNEL'],
    ],
  },
  GAMES: {
    path: 'B:\\GAMES\\',
    entries: [
      ['PLANETRUNNER.EXE', 'EXE', 'ORBITAL NAVIGATION PROGRAM'],
      ['README.TXT', 'FILE', 'PROGRAM DIRECTORY'],
    ],
  },
};

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
  return shuffle(compatible[mode]).map(bank => pickRandom(BANKS[bank]));
}

function sentenceCase(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  return cleaned ? `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}` : '';
}

function generateResponse(prompt) {
  const anchors = extractAnchors(prompt);
  const anchor = pickRandom(anchors.length ? anchors : ['this moment']);
  const mode = chooseMode(prompt);
  const frames = mode === 'question' ? QUESTION_FRAMES : mode === 'reflective' ? REFLECTIVE_FRAMES : DREAM_FRAMES;
  const [line, alternate] = chooseLines(mode);
  const first = pickRandom(frames).replace('{anchor}', anchor).replace('{line}', line);
  const second = Math.random() < 0.45
    ? (Math.random() < 0.6 ? pickRandom(SECOND_LINES) : sentenceCase(alternate))
    : '';
  return [sentenceCase(first), second].filter(Boolean).join(' ');
}

function addLine(className, text) {
  const line = document.createElement('div');
  line.className = className;
  line.textContent = text;
  transcriptEl.appendChild(line);
  scrollTranscriptToBottom();
  return line;
}

function addBlock(className, text) {
  const block = document.createElement('div');
  block.className = className;
  block.textContent = text;
  transcriptEl.appendChild(block);
  scrollTranscriptToBottom();
  return block;
}

function scrollTranscriptToBottom() {
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function typeResponse(text) {
  const line = addLine('response-line', '');
  for (const character of text) {
    line.textContent += character;
    let delay = CONFIG.TYPE_DELAY_MIN + Math.random() * (CONFIG.TYPE_DELAY_MAX - CONFIG.TYPE_DELAY_MIN);
    if (/[.!?]/.test(character)) delay += CONFIG.PUNCTUATION_PAUSE_END;
    if (/[,;:]/.test(character)) delay += CONFIG.PUNCTUATION_PAUSE_BASE;
    await wait(delay);
  }
  scrollTranscriptToBottom();
}

function addReceiverStatus(text) {
  return addLine('response-line', text);
}

function setReadySoon(delay = 800) {
  window.setTimeout(() => {
    if (!isGenerating) statusEl.textContent = 'READY';
  }, delay);
}

function promptPath() {
  return DIRECTORIES[currentDirectory].path;
}

function echoCommand(command) {
  addLine('user-line', `${promptPath()}> ${command}`);
}

function getInputValue() {
  return inputEl.value;
}

function setInputValue(value, caret = value.length) {
  inputEl.value = value;
  try {
    inputEl.setSelectionRange(caret, caret);
  } catch {
    // Read-only touch mode does not need a visible browser selection.
  }
}

function clearInput() {
  setInputValue('');
}

function cancelActiveRequest() {
  if (activeRequestController) {
    activeRequestController.abort();
    activeRequestController = null;
  }
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Receiver returned ${response.status}.`);
  return response.json();
}

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
    sun: '<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="20"></circle><path d="M60 12v16M60 92v16M12 60h16M92 60h16M26 26l11 11M83 83l11 11M94 26L83 37M37 83L26 94"></path></svg>',
    'partly-cloudy': '<svg viewBox="0 0 120 120"><circle cx="45" cy="42" r="16"></circle><path d="M45 12v10M45 62v10M15 42h10M65 42h10M24 21l8 8M58 55l8 8M66 21l-8 8"></path><path d="M39 86h49c10 0 18-7 18-16s-8-16-18-16c-2-14-13-23-27-23-13 0-25 9-27 22-11 0-20 7-20 17 0 9 8 16 18 16h7"></path></svg>',
    cloud: '<svg viewBox="0 0 120 120"><path d="M22 82h70c12 0 21-8 21-19 0-10-9-19-21-19-3-17-16-28-33-28-16 0-30 11-33 27-14 0-25 9-25 20 0 11 10 19 21 19z"></path></svg>',
    fog: '<svg viewBox="0 0 120 120"><path d="M24 60h68c9 0 16-6 16-15 0-8-7-15-16-15-2-13-13-22-26-22-14 0-25 9-28 22-10 0-18 7-18 16 0 8 6 14 14 14"></path><path d="M18 76h62M30 91h72M17 106h48"></path></svg>',
    drizzle: '<svg viewBox="0 0 120 120"><path d="M22 68h70c12 0 21-8 21-19 0-10-9-19-21-19-3-17-16-28-33-28-16 0-30 11-33 27-14 0-25 9-25 20 0 11 10 19 21 19z"></path><path d="M38 82v10M60 82v10M82 82v10M48 100v8M70 100v8"></path></svg>',
    rain: '<svg viewBox="0 0 120 120"><path d="M22 64h70c12 0 21-8 21-19 0-10-9-19-21-19-3-17-16-28-33-28-16 0-30 11-33 27-14 0-25 9-25 20 0 11 10 19 21 19z"></path><path d="M38 80l-4 15M60 80l-4 15M82 80l-4 15M48 100l-3 12M70 100l-3 12"></path></svg>',
    snow: '<svg viewBox="0 0 120 120"><path d="M22 64h70c12 0 21-8 21-19 0-10-9-19-21-19-3-17-16-28-33-28-16 0-30 11-33 27-14 0-25 9-25 20 0 11 10 19 21 19z"></path><path d="M39 84v18M31 89l16 8M47 89l-16 8M76 84v18M68 89l16 8M84 89l-16 8"></path></svg>',
    storm: '<svg viewBox="0 0 120 120"><path d="M22 65h70c12 0 21-8 21-19 0-10-9-19-21-19-3-17-16-28-33-28-16 0-30 11-33 27-14 0-25 9-25 20 0 11 10 19 21 19z"></path><path d="M61 76l-13 21h13l-7 17 20-27H61z"></path><path d="M35 82l-3 12M88 82l-3 12"></path></svg>',
  };
  return icons[iconName] || icons.cloud;
}

function formatWeatherLocation(location) {
  return [location.name, location.admin1, location.country]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .join(', ')
    .toUpperCase();
}

function formatWeatherTime(localTime) {
  if (!localTime) return 'TIME UNKNOWN';
  const date = new Date(`${localTime}:00`);
  if (Number.isNaN(date.getTime())) return localTime.replace('T', ' · ');
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).toUpperCase().replace(',', ' ·');
}

function windDirectionLabel(degrees) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const normalized = ((Number(degrees) % 360) + 360) % 360;
  return directions[Math.round(normalized / 22.5) % 16];
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
  icon.innerHTML = weatherIconMarkup(details.icon);
  copy.append(locationLine, timeLine, headline, data);
  card.append(copy, icon);
  transcriptEl.appendChild(card);
  scrollTranscriptToBottom();
}

function loadWeatherCache(cityQuery) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(WEATHER_CACHE_KEY) || 'null');
    return cached?.cityQuery === cityQuery && Date.now() - cached.savedAt < CONFIG.WEATHER_CACHE_MS ? cached : null;
  } catch {
    return null;
  }
}

function saveWeatherCache(cityQuery, location, weather) {
  try {
    sessionStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ cityQuery, location, weather, savedAt: Date.now() }));
  } catch {
    // Session storage is optional.
  }
}

async function fetchWeatherForCity(cityQuery, signal) {
  const geocodeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geocodeUrl.search = new URLSearchParams({ name: cityQuery, count: '1', language: 'en', format: 'json' });
  const geocode = await fetchJson(geocodeUrl, signal);
  const location = geocode.results?.[0];
  if (!location) throw new Error('CITY_NOT_FOUND');
  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.search = new URLSearchParams({
    latitude: String(location.latitude), longitude: String(location.longitude),
    current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
    temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm', timezone: 'auto',
  });
  const weather = await fetchJson(forecastUrl, signal);
  if (!weather.current) throw new Error('WEATHER_UNAVAILABLE');
  return { location, weather };
}

function weatherHelpText() {
  return 'WEATHER RECEIVER // STANDBY\n\nCURRENT.EXE <CITY, REGION>\n\nEXAMPLE:\nCURRENT.EXE MONTREAL, QC\n\nMETRIC UNITS ENABLED.';
}

async function runWeatherCommand(cityQuery) {
  const normalizedCity = cityQuery.trim();
  if (!normalizedCity) {
    addBlock('response-line', weatherHelpText());
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
  const controller = activeRequestController;
  statusEl.textContent = 'LINKING...';
  addReceiverStatus(`WEATHER RECEIVER // LINKING TO ${normalizedCity.toUpperCase()}...`);
  try {
    const { location, weather } = await fetchWeatherForCity(normalizedCity, controller.signal);
    saveWeatherCache(cacheKey, location, weather);
    statusEl.textContent = 'SIGNAL RECEIVED';
    renderWeatherCard(location, weather);
  } catch (error) {
    if (error.name === 'AbortError') return;
    statusEl.textContent = 'SIGNAL LOST';
    addBlock('response-line', error.message === 'CITY_NOT_FOUND'
      ? `CITY NOT FOUND: ${normalizedCity.toUpperCase()}\nTRY: CURRENT.EXE CITY, REGION`
      : 'WEATHER RECEIVER // SIGNAL LOST.\nCHECK CONNECTION AND TRY AGAIN.');
  } finally {
    if (activeRequestController === controller) activeRequestController = null;
    setReadySoon();
  }
}

function getNewsCacheKey(label, query) {
  return `${label.toLowerCase()}::${query.trim().toLowerCase()}`;
}

function loadNewsCache(label, query) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(NEWS_CACHE_KEY) || 'null');
    return cached?.cacheKey === getNewsCacheKey(label, query) && Date.now() - cached.savedAt < CONFIG.NEWS_CACHE_MS ? cached.articles : null;
  } catch {
    return null;
  }
}

function saveNewsCache(label, query, articles) {
  try {
    sessionStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ cacheKey: getNewsCacheKey(label, query), articles, savedAt: Date.now() }));
  } catch {
    // Session storage is optional.
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
    // Stored in memory until reload.
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
    return new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}Z`);
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
  return `${Math.floor(hours / 24)}D AGO`;
}

function normaliseNewsArticles(payload) {
  const candidates = Array.isArray(payload?.articles) ? payload.articles : Array.isArray(payload?.items) ? payload.items : [];
  const usedUrls = new Set();
  return candidates.map(article => {
    const url = safeArticleUrl(article.url || article.link || '');
    return {
      title: String(article.title || article.name || '').replace(/\s+/g, ' ').trim(),
      url,
      domain: getArticleDomain({ ...article, url }),
      seenDate: article.seendate || article.seenDate || article.date_published || '',
    };
  }).filter(article => article.title && article.url).filter(article => {
    if (usedUrls.has(article.url)) return false;
    usedUrls.add(article.url);
    return true;
  }).slice(0, CONFIG.NEWS_MAX_ITEMS);
}

async function fetchNews(query, signal) {
  const endpoint = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  endpoint.search = new URLSearchParams({ query, mode: 'artlist', format: 'json', maxrecords: String(CONFIG.NEWS_MAX_ITEMS), timespan: '24h', sort: 'datedesc' });
  const articles = normaliseNewsArticles(await fetchJson(endpoint, signal));
  if (!articles.length) throw new Error('NO_NEWS_RESULTS');
  return articles;
}

function renderNewsCard(label, articles) {
  const card = document.createElement('section');
  card.className = 'news-card response-line';
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
    const source = document.createElement('div');
    source.className = 'news-source';
    source.textContent = `${article.domain.toUpperCase()} · ${relativeSeenTime(article.seenDate)}`;
    row.append(headline, source);
    card.appendChild(row);
  });
  const note = document.createElement('div');
  note.className = 'news-note';
  note.textContent = `RUN OPEN.EXE 1–${articles.length} TO VISIT A SOURCE.`;
  card.appendChild(note);
  transcriptEl.appendChild(card);
  scrollTranscriptToBottom();
}

async function runNewsCommand(label, query) {
  const cleanLabel = String(label || 'NEWS').toUpperCase();
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) {
    addBlock('response-line', newsHelpText());
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
  const controller = activeRequestController;
  statusEl.textContent = 'TUNING...';
  addReceiverStatus(`NEWS RECEIVER // TUNING: ${cleanLabel}...`);
  try {
    const articles = await fetchNews(cleanQuery, controller.signal);
    saveNewsCache(cleanLabel, cleanQuery, articles);
    saveLatestNewsResults(articles);
    statusEl.textContent = 'SIGNAL RECEIVED';
    renderNewsCard(cleanLabel, articles);
  } catch (error) {
    if (error.name === 'AbortError') return;
    statusEl.textContent = 'SIGNAL LOST';
    addBlock('response-line', error.message === 'NO_NEWS_RESULTS'
      ? `NEWS RECEIVER // NO CLEAR SIGNALS FOR ${cleanLabel}.\nTRY: TOPIC.EXE <WORDS>`
      : 'NEWS RECEIVER // SIGNAL BLOCKED OR LOST.\nTRY AGAIN LATER.');
  } finally {
    if (activeRequestController === controller) activeRequestController = null;
    setReadySoon();
  }
}

function openNewsItem(itemNumber) {
  const index = Number(itemNumber) - 1;
  const article = latestNewsResults[index];
  if (!Number.isInteger(index) || !article?.url) {
    addBlock('response-line', 'NO STORED ITEM AT THAT NUMBER.\nRUN HEADLINES.EXE OR A NEWS CHANNEL FIRST.');
    return;
  }
  const tab = window.open(article.url, '_blank', 'noopener,noreferrer');
  if (!tab) addBlock('response-line', `SOURCE READY: ${article.domain.toUpperCase()}\nYOUR BROWSER BLOCKED THE TAB. TAP THE HEADLINE IN THE LIST.`);
}

function newsHelpText() {
  return 'NEWS RECEIVER // CHANNELS\n\nHEADLINES.EXE\nCANADA.EXE\nSCIENCE.EXE\nTECH.EXE\nTOPIC.EXE <WORDS>\nOPEN.EXE <NUMBER>';
}

function helpText() {
  return [
    'JESSEOS B: COMMAND INDEX',
    '',
    'DIR                       LIST CURRENT DIRECTORY',
    'CD <DIRECTORY>            ENTER A DIRECTORY',
    'CD ..                     RETURN ONE DIRECTORY',
    'CD \\                      RETURN TO B:\\ ROOT',
    'TYPE <FILE>               READ A TEXT FILE',
    'CLS.EXE                   CLEAR SCREEN',
    'STATUS.EXE                SYSTEM STATUS',
    '',
    'B:\\WEATHER\\',
    'CURRENT.EXE <CITY>        WEATHER RECEIVER',
    '',
    'B:\\NEWS\\',
    'HEADLINES.EXE             WORLD NEWS',
    'CANADA.EXE / SCIENCE.EXE / TECH.EXE',
    'TOPIC.EXE <WORDS>         CUSTOM NEWS SIGNAL',
    'OPEN.EXE <NUMBER>         OPEN STORED SOURCE',
    '',
    'COMPATIBILITY: /HELP, /CITY, /HEADLINES, /NEWS, /TOPIC, /OPEN',
  ].join('\n');
}

function statusText() {
  return [
    'JESSEOS SYSTEM STATUS',
    '=====================',
    'MACHINE: LBSTRCOMP TERMINAL',
    'SYSTEM: ONLINE',
    `DIRECTORY: ${promptPath()}`,
    'MEMORY: LOCAL LANGUAGE BANKS LOADED',
    'WEATHER: ON-DEMAND RECEIVER READY',
    'NEWS: ON-DEMAND RECEIVER READY',
    'DISPLAY: CRT PHOSPHOR GREEN',
  ].join('\n');
}

function aboutText() {
  return [
    'JESSEOS v0.8',
    'LBSTRCOMP LOCAL DREAM TERMINAL',
    '',
    'A local language-bank system with optional on-demand',
    'weather and news receivers. No geolocation, tracking,',
    'background polling, or API keys are required.',
  ].join('\n');
}

function fileText(fileName) {
  const name = fileName.toUpperCase();
  const files = {
    'ABOUT.TXT': aboutText(),
    'HELP.TXT': currentDirectory === 'WEATHER' ? weatherHelpText()
      : currentDirectory === 'NEWS' ? newsHelpText()
      : 'THIS DIRECTORY HAS NO ADDITIONAL HELP FILE.',
    'README.TXT': currentDirectory === 'BOARD'
      ? 'BOARD // LOCAL MESSAGE ARCHIVE\n\nTHE BOARD IS QUIET FOR NOW.\nRUN LISTEN.EXE TO OPEN THE DREAM CHANNEL.'
      : 'PROGRAM DIRECTORY\n\nPLANETRUNNER.EXE\nORBITAL NAVIGATION MODULE NOT YET INSTALLED.',
  };
  return files[name] || null;
}

function listDirectory() {
  const directory = DIRECTORIES[currentDirectory];
  addLine('response-line', `DIRECTORY OF ${directory.path}`);
  addLine('response-line', '');
  directory.entries.forEach(([name, type, description]) => {
    addLine('response-line', ` ${name.padEnd(17)} ${type.padEnd(6)} ${description}`);
  });
}

function changeDirectory(argument) {
  const target = String(argument || '').trim().toUpperCase().replace(/\//g, '\\');
  if (!target) {
    addLine('response-line', promptPath());
    return;
  }
  if (target === '\\' || target === 'B:\\' || target === 'B:') {
    currentDirectory = 'ROOT';
    updatePrompt();
    addLine('response-line', 'DIRECTORY CHANGED TO B:\\');
    return;
  }
  if (target === '..') {
    if (currentDirectory === 'ROOT') addLine('response-line', 'ALREADY AT B:\\ ROOT.');
    else {
      currentDirectory = 'ROOT';
      updatePrompt();
      addLine('response-line', 'DIRECTORY CHANGED TO B:\\');
    }
    return;
  }
  const normalized = target.replace(/^B:\\/, '').replace(/\\/g, '');
  if (['WEATHER', 'NEWS', 'BOARD', 'GAMES'].includes(normalized)) {
    if (currentDirectory === normalized) {
      addLine('response-line', `DIRECTORY ALREADY ACTIVE: ${normalized}`);
    } else {
      currentDirectory = normalized;
      updatePrompt();
      addLine('response-line', `DIRECTORY CHANGED TO ${promptPath()}`);
    }
    return;
  }
  addLine('response-line', `DIRECTORY NOT FOUND: ${argument}`);
}

async function runExecutable(executable, args) {
  const exe = executable.toUpperCase();
  if (exe === 'STATUS.EXE' || exe === 'STATUS') {
    addBlock('response-line', statusText());
    return;
  }
  if (exe === 'CLS.EXE' || exe === 'CLS') {
    transcriptEl.innerHTML = '';
    return;
  }
  if (exe === 'HELP.EXE' || exe === 'HELP') {
    addBlock('response-line', helpText());
    return;
  }
  if (currentDirectory === 'WEATHER' && (exe === 'CURRENT.EXE' || exe === 'CURRENT')) {
    await runWeatherCommand(args.join(' '));
    return;
  }
  if (currentDirectory === 'NEWS') {
    if (exe === 'HEADLINES.EXE' || exe === 'HEADLINES') {
      await runNewsCommand(NEWS_CHANNELS.headlines.label, NEWS_CHANNELS.headlines.query);
      return;
    }
    if (exe === 'CANADA.EXE' || exe === 'CANADA') {
      await runNewsCommand(NEWS_CHANNELS.canada.label, NEWS_CHANNELS.canada.query);
      return;
    }
    if (exe === 'SCIENCE.EXE' || exe === 'SCIENCE') {
      await runNewsCommand(NEWS_CHANNELS.science.label, NEWS_CHANNELS.science.query);
      return;
    }
    if (exe === 'TECH.EXE' || exe === 'TECH') {
      await runNewsCommand(NEWS_CHANNELS.tech.label, NEWS_CHANNELS.tech.query);
      return;
    }
    if (exe === 'TOPIC.EXE' || exe === 'TOPIC') {
      const topic = args.join(' ').trim();
      if (!topic) addBlock('response-line', 'TOPIC.EXE REQUIRES SEARCH WORDS.\nEXAMPLE: TOPIC.EXE NORTHERN LIGHTS');
      else await runNewsCommand(`TOPIC: ${topic.toUpperCase()}`, `${topic} sourcelang:English`);
      return;
    }
    if (exe === 'OPEN.EXE' || exe === 'OPEN') {
      openNewsItem(args[0]);
      return;
    }
  }
  if (currentDirectory === 'BOARD' && (exe === 'LISTEN.EXE' || exe === 'LISTEN')) {
    await typeResponse(generateResponse('open the local board'));
    return;
  }
  if (currentDirectory === 'GAMES' && (exe === 'PLANETRUNNER.EXE' || exe === 'PLANETRUNNER')) {
    addBlock('response-line', 'PLANETRUNNER // PROGRAM SLOT RESERVED\nORBITAL NAVIGATION MODULE NOT YET INSTALLED.\nTHE MACHINE HOLDS THE PLACE OPEN.');
    return;
  }
  addLine('response-line', `'${executable}' IS NOT RECOGNIZED IN ${promptPath()}`);
}

async function handleCompatibilityCommand(command) {
  const lower = command.toLowerCase();
  if (lower === '/help') {
    addBlock('response-line', helpText());
    return true;
  }
  if (lower === '/about') {
    addBlock('response-line', aboutText());
    return true;
  }
  if (lower === '/status') {
    addBlock('response-line', statusText());
    return true;
  }
  if (lower === '/clear') {
    transcriptEl.innerHTML = '';
    return true;
  }
  if (lower === '/weather') {
    addBlock('response-line', weatherHelpText());
    return true;
  }
  if (lower.startsWith('/city ')) {
    await runWeatherCommand(command.slice(6));
    return true;
  }
  if (lower === '/news') {
    addBlock('response-line', newsHelpText());
    return true;
  }
  if (lower === '/headlines') {
    await runNewsCommand(NEWS_CHANNELS.headlines.label, NEWS_CHANNELS.headlines.query);
    return true;
  }
  if (lower.startsWith('/news ')) {
    const channel = lower.slice(6).trim();
    if (NEWS_CHANNELS[channel]) await runNewsCommand(NEWS_CHANNELS[channel].label, NEWS_CHANNELS[channel].query);
    else addBlock('response-line', newsHelpText());
    return true;
  }
  if (lower.startsWith('/topic ')) {
    const topic = command.slice(7).trim();
    if (topic) await runNewsCommand(`TOPIC: ${topic.toUpperCase()}`, `${topic} sourcelang:English`);
    else addBlock('response-line', newsHelpText());
    return true;
  }
  if (/^\/open\s+\d+$/.test(lower)) {
    openNewsItem(lower.replace(/^\/open\s+/, ''));
    return true;
  }
  return false;
}

async function processShellCommand(command) {
  const trimmed = command.trim();
  if (!trimmed) return;
  if (await handleCompatibilityCommand(trimmed)) return;
  const [rawCommand, ...args] = trimmed.split(/\s+/);
  const operation = rawCommand.toUpperCase();
  if (operation === 'DIR') {
    listDirectory();
    return;
  }
  if (operation === 'CD' || operation === 'CHDIR') {
    changeDirectory(args.join(' '));
    return;
  }
  if (operation === 'TYPE') {
    const text = fileText(args.join(' '));
    if (text) addBlock('response-line', text);
    else addLine('response-line', `FILE NOT FOUND: ${args.join(' ') || '(NONE)'}`);
    return;
  }
  if (operation === 'EXIT') {
    addLine('response-line', 'THE GREEN ROOM STAYS ON.');
    return;
  }
  if (operation.endsWith('.EXE') || ['STATUS', 'CLS', 'HELP', 'CURRENT', 'HEADLINES', 'CANADA', 'SCIENCE', 'TECH', 'TOPIC', 'OPEN', 'LISTEN', 'PLANETRUNNER'].includes(operation)) {
    await runExecutable(operation, args);
    return;
  }
  await typeResponse(generateResponse(trimmed));
}

async function submitCurrentCommand(event) {
  if (event) event.preventDefault();
  const command = getInputValue().trim();
  if (!command || isGenerating) return;
  isGenerating = true;
  inputEl.disabled = true;
  statusEl.textContent = 'PROCESSING...';
  echoCommand(command);
  commandHistory.push(command);
  historyIndex = commandHistory.length;
  clearInput();
  try {
    await processShellCommand(command);
    if (statusEl.textContent === 'PROCESSING...') statusEl.textContent = 'READY';
  } catch (error) {
    console.error('JesseOS error:', error);
    statusEl.textContent = 'ERROR';
    addLine('response-line', 'SYSTEM ERROR: THE LOCAL DREAM ENGINE LOST ITS THREAD. RELOAD AND TRY AGAIN.');
  } finally {
    isGenerating = false;
    inputEl.disabled = false;
    if (!hardwareKeyboardMode) inputEl.setAttribute('readonly', 'readonly');
    if (statusEl.textContent !== 'READY') setReadySoon();
  }
}

function updateShiftKeys() {
  document.querySelectorAll('[data-key="shift"]').forEach(button => {
    button.classList.toggle('is-active', shiftEnabled);
    button.setAttribute('aria-pressed', String(shiftEnabled));
  });
}

function insertAtCaret(text) {
  const value = inputEl.value;
  const start = inputEl.selectionStart ?? value.length;
  const end = inputEl.selectionEnd ?? value.length;
  const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
  setInputValue(next, start + text.length);
}

function deleteAtCaret() {
  const value = inputEl.value;
  const start = inputEl.selectionStart ?? value.length;
  const end = inputEl.selectionEnd ?? value.length;
  if (start !== end) {
    setInputValue(`${value.slice(0, start)}${value.slice(end)}`, start);
  } else if (start > 0) {
    setInputValue(`${value.slice(0, start - 1)}${value.slice(end)}`, start - 1);
  }
}

function handleTouchKey(key) {
  if (isGenerating || inputEl.disabled) return;
  if (key === 'enter') {
    submitCurrentCommand();
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
    clearInput();
    shiftEnabled = false;
    updateShiftKeys();
    return;
  }
  if (['control', 'run', 'stop', 'f1', 'f3', 'f5'].includes(key)) return;
  const character = shiftEnabled && /^[a-z]$/.test(key) ? key.toUpperCase() : key;
  insertAtCaret(character);
  if (shiftEnabled) {
    shiftEnabled = false;
    updateShiftKeys();
  }
}

function virtualKeySelector(key) {
  const aliases = {
    Enter: '[data-key="enter"]', Backspace: '[data-key="backspace"]', Escape: '[data-key="escape"]',
    Shift: '[data-key="shift"]', Control: '[data-key="control"]', ' ': '[data-key="space"]', Tab: '[data-key="tab"]',
    '-': '[data-key="-"]', '=': '[data-key="+"]', ';': '[data-key=":"]',
  };
  if (aliases[key]) return aliases[key];
  if (/^[a-zA-Z]$/.test(key)) return `[data-key="${key.toLowerCase()}"]`;
  if (/^[0-9]$/.test(key) || ['/', '+', ':', ',', '.', "'", '[', ']'].includes(key)) return `[data-key="${key}"]`;
  return '';
}

function setVirtualKeyPressed(key, pressed) {
  const selector = virtualKeySelector(key);
  if (!selector) return;
  document.querySelectorAll(selector).forEach(button => button.classList.toggle('is-pressed', pressed));
}

function activateHardwareKeyboard() {
  if (hardwareKeyboardMode) return;
  hardwareKeyboardMode = true;
  inputEl.removeAttribute('readonly');
  inputEl.setAttribute('inputmode', 'text');
}

function initTouchKeyboard() {
  document.querySelectorAll('.keyboard [data-key]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.classList.add('is-pressed');
    });
    button.addEventListener('pointerup', event => {
      event.preventDefault();
      button.classList.remove('is-pressed');
      handleTouchKey(button.dataset.key);
    });
    button.addEventListener('pointercancel', () => button.classList.remove('is-pressed'));
    button.addEventListener('pointerleave', event => {
      if (event.buttons === 0) button.classList.remove('is-pressed');
    });
  });
}

function initPhysicalKeyboard() {
  window.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    activateHardwareKeyboard();
    setVirtualKeyPressed(event.key, true);
    if (event.key === 'Enter') {
      event.preventDefault();
      submitCurrentCommand();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (historyIndex > 0) {
        historyIndex -= 1;
        setInputValue(commandHistory[historyIndex]);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        historyIndex += 1;
        setInputValue(commandHistory[historyIndex]);
      } else {
        historyIndex = commandHistory.length;
        clearInput();
      }
    }
  });
  window.addEventListener('keyup', event => setVirtualKeyPressed(event.key, false));
  window.addEventListener('blur', () => {
    document.querySelectorAll('.keyboard .is-pressed').forEach(button => button.classList.remove('is-pressed'));
  });
}

function updatePrompt() {
  const promptEl = document.getElementById('prompt');
  if (!promptEl) return;

  // Build prompt from currentDirectory
  const dirInfo = DIRECTORIES[currentDirectory];
  if (!dirInfo) {
    promptEl.textContent = 'B:\\>';
    return;
  }

  // dirInfo.path is like 'B:\\' or 'B:\\WEATHER\\'
  // We want to display as 'B:\>' or 'B:\WEATHER>'
  let path = dirInfo.path.replace(/\\$/g, ''); // remove trailing backslashes
  promptEl.textContent = path + '>';
}

function init() {
  transcriptEl = document.getElementById('transcript');
  inputEl = document.getElementById('input');
  statusEl = document.getElementById('status');
  const form = document.getElementById('input-form');
  if (!transcriptEl || !inputEl || !statusEl || !form) {
    console.error('JesseOS markup mismatch.');
    return;
  }
  inputEl.setAttribute('readonly', 'readonly');
  inputEl.setAttribute('inputmode', 'none');
  form.addEventListener('submit', submitCurrentCommand);
  inputEl.addEventListener('focus', () => {
    if (!hardwareKeyboardMode) inputEl.blur();
  });
  restoreLatestNewsResults();
  initTouchKeyboard();
  initPhysicalKeyboard();
  updateShiftKeys();
  updatePrompt();
  statusEl.textContent = 'READY';
  addLine('system-line', 'JESSEOS v0.8 // LBSTRCOMP TERMINAL ONLINE');
  addLine('system-line', 'B: DRIVE MOUNTED. TYPE HELP.EXE OR DIR.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}