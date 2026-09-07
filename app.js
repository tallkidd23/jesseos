// JesseOS v0.7 — local language-bank dream terminal + weather receiver
// Weather requests occur only after an explicit /city command.
// No geolocation, tracking, API keys, or background polling.

const CONFIG = {
  TYPE_DELAY_MIN: 18,
  TYPE_DELAY_MAX: 42,
  PUNCTUATION_PAUSE_BASE: 70,
  PUNCTUATION_PAUSE_END: 130,
  WEATHER_CACHE_MS: 10 * 60 * 1000,
};

const WEATHER_CACHE_KEY = 'jesseos-weather-cache-v1';
const WEATHER_CITY_KEY = 'jesseos-weather-city-v1';

let transcriptEl;
let inputEl;
let statusEl;
let isGenerating = false;
let shiftEnabled = false;
let activeRequestController = null;

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
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
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

    let delay = CONFIG.TYPE_DELAY_MIN + Math.random() * (CONFIG.TYPE_DELAY_MAX - CONFIG.TYPE_DELAY_MIN);
    if (/[.!?]/.test(char)) delay += CONFIG.PUNCTUATION_PAUSE_END;
    if (/[,;:]/.test(char)) delay += CONFIG.PUNCTUATION_PAUSE_BASE;
    await wait(delay);
  }

  scrollTranscriptToBottom();
}

function makeWeatherStatus(text) {
  const card = document.createElement('div');
  card.className = 'weather-status response-line';
  card.textContent = text;
  transcriptEl.appendChild(card);
  scrollTranscriptToBottom();
  return card;
}

function weatherDetailsForCode(code) {
  const numericCode = Number(code);

  if (numericCode === 0) {
    return { label: 'CLEAR SKY', icon: 'sun' };
  }

  if ([1, 2].includes(numericCode)) {
    return { label: 'PARTLY CLOUDY', icon: 'partly-cloudy' };
  }

  if (numericCode === 3) {
    return { label: 'OVERCAST', icon: 'cloud' };
  }

  if ([45, 48].includes(numericCode)) {
    return { label: 'FOG', icon: 'fog' };
  }

  if ([51, 53, 55, 56, 57].includes(numericCode)) {
    return { label: 'DRIZZLE', icon: 'drizzle' };
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(numericCode)) {
    return { label: 'RAIN', icon: 'rain' };
  }

  if ([71, 73, 75, 77, 85, 86].includes(numericCode)) {
    return { label: 'SNOW', icon: 'snow' };
  }

  if ([95, 96, 99].includes(numericCode)) {
    return { label: 'THUNDERSTORM', icon: 'storm' };
  }

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
  if (!Number.isFinite(number)) return '—';
  return number.toFixed(decimals);
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
  data.innerHTML = `
    <span>HUMIDITY ${roundWeatherValue(current.relative_humidity_2m)}%</span>
    <span>WIND ${windDirectionLabel(current.wind_direction_10m)} · ${roundWeatherValue(current.wind_speed_10m)} KM/H</span>
    <span>PRECIPITATION ${roundWeatherValue(current.precipitation, 1)} MM</span>
    <span>SOURCE: OPEN-METEO</span>
  `;

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
    const raw = sessionStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw);
    const isSameCity = cached.cityQuery === cityQuery;
    const isFresh = Date.now() - cached.savedAt < CONFIG.WEATHER_CACHE_MS;

    return isSameCity && isFresh ? cached : null;
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

async function fetchJson(url, signal) {
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Weather receiver returned ${response.status}.`);
  }

  return response.json();
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

  if (!location) {
    throw new Error('CITY_NOT_FOUND');
  }

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

  if (!weather.current) {
    throw new Error('WEATHER_UNAVAILABLE');
  }

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

  const cached = loadWeatherCache(normalizedCity.toLowerCase());

  if (cached) {
    statusEl.textContent = 'WEATHER CACHED';
    renderWeatherCard(cached.location, cached.weather);
    statusEl.textContent = 'READY';
    return;
  }

  if (activeRequestController) {
    activeRequestController.abort();
  }

  activeRequestController = new AbortController();
  const requestController = activeRequestController;

  statusEl.textContent = 'LINKING...';
  makeWeatherStatus(`WEATHER RECEIVER // LINKING TO ${normalizedCity.toUpperCase()}...`);

  try {
    const { location, weather } = await fetchWeatherForCity(
      normalizedCity,
      requestController.signal,
    );

    saveWeatherCache(normalizedCity.toLowerCase(), location, weather);
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

    window.setTimeout(() => {
      if (!isGenerating) statusEl.textContent = 'READY';
    }, 900);
  }
}

function handleCommand(value) {
  const command = value.trim();
  const lower = command.toLowerCase();

  if (lower === '/weather' || lower === 'weather') {
    return { type: 'weather-help' };
  }

  if (lower.startsWith('/city ')) {
    return {
      type: 'weather-city',
      city: command.slice(6).trim(),
    };
  }

  if (lower === '/city') {
    return { type: 'weather-help' };
  }

  if (lower === '/help' || lower === 'help') {
    return {
      type: 'text',
      text: 'commands: /help, /about, /status, /clear, /weather, /city <place>',
    };
  }

  if (lower === '/about' || lower === 'about') {
    return {
      type: 'text',
      text: 'jesseos v0.7: a local language-bank dream terminal with an on-demand weather receiver. no geolocation, tracking, or external api keys.',
    };
  }

  if (lower === '/status' || lower === 'status') {
    return {
      type: 'text',
      text: 'status: local dream engine online. language banks loaded. weather receiver standing by. signal stable.',
    };
  }

  if (lower === '/clear' || lower === 'clear') {
    transcriptEl.innerHTML = '';
    return {
      type: 'text',
      text: 'terminal cleared. the green room remains.',
    };
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

    const response = commandReply?.type === 'text'
      ? commandReply.text
      : generateResponse(prompt);

    statusEl.textContent = 'READY';
    await typeResponse(response);
  } catch (error) {
    console.error('JesseOS error:', error);
    statusEl.textContent = 'ERROR';
    addLine('response-line', 'system error: the local dream engine lost its thread. reload and try again.');
  } finally {
    isGenerating = false;
    inputEl.disabled = false;

    if (statusEl.textContent !== 'READY') {
      window.setTimeout(() => {
        if (!isGenerating) statusEl.textContent = 'READY';
      }, 900);
    }
  }
}

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

  initTouchKeyboard();
  updateShiftKeys();

  statusEl.textContent = 'READY';
  addLine(
    'system-line',
    'jesseos v0.7 — language banks online. weather receiver ready. type /help for commands.',
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
