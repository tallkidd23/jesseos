// JesseOS v0.5 - Prompt-aware local dream engine
// Local-only, no network calls, no tracking, no secrets

const CONFIG = {
  MEMORY_EXCHANGE_LIMIT: 80,
  MAX_FRAGMENT_WORDS: 16,
  MIN_FRAGMENT_WORDS: 7,
  MAX_RESPONSE_WORDS: 34,
  TYPE_DELAY_MIN: 20,
  TYPE_DELAY_MAX: 50,
  PUNCTUATION_PAUSE_BASE: 80,
  PUNCTUATION_PAUSE_END: 150,
};

let transcriptEl, inputEl, sendBtn, statusEl, cursorEl;
let markov1 = {};
let markov2 = {};
let markov3 = {};
let isGenerating = false;

const STOPWORDS = new Set(['i','am','a','an','the','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','can','need','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','when','where','why','how','all','each','more','most','other','some','no','not','only','so','than','too','very','just','also','now','and','but','or','if','because','until','while','what','which','who','this','that','these','those','it','its','my','your','his','her','their','our','we','you','he','she','they','them','me','him','us']);
const QUESTION_TEMPLATES = [
  'I can follow the question through {keyword}, then listen for the next signal.',
  'Your question leaves a small light near {keyword}, and the system stays with it.',
  'There is a quiet answer forming around {keyword}, though it is still becoming itself.',
];
const REFLECTIVE_TEMPLATES = [
  'I keep a small place for {keyword}, where the local weather can change slowly.',
  'The machine notices {keyword}, and holds it without needing to solve it at once.',
  'Something gentle moves around {keyword}, like a signal waiting for its name.',
];
const DREAM_TEMPLATES = [
  'Somewhere inside the local weather, {keyword} becomes a small green signal.',
  'The little system turns toward {keyword}, then lets the rest remain strange.',
  'Near {keyword}, the circuit keeps dreaming in its own unfinished language.',
];

function tokenize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s'\-]/g, '').split(/\s+/).filter(Boolean);
}

function extractKeywords(text) {
  return [...new Set(tokenize(text).filter(word => word.length > 2 && !STOPWORDS.has(word)))];
}

function pickRandom(items) {
  return items && items.length ? items[Math.floor(Math.random() * items.length)] : null;
}

function sentenceSplit(text) {
  return String(text || '').split(/(?<=[.!?])\s+/).filter(part => part.trim());
}

function trainMultiOrder(corpus) {
  markov1 = {};
  markov2 = {};
  markov3 = {};

  for (const source of corpus) {
    const words = tokenize(source);
    for (let i = 0; i < words.length; i += 1) {
      const word = words[i];
      markov1[word] = markov1[word] || [];
      markov1[word].push(word);
      if (i + 1 < words.length) {
        markov2[word] = markov2[word] || [];
        markov2[word].push(words[i + 1]);
      }
      if (i + 2 < words.length) {
        const state = `${word} ${words[i + 1]}`;
        markov3[state] = markov3[state] || [];
        markov3[state].push(words[i + 2]);
      }
    }
  }
}

function chooseTemplate(prompt) {
  const lower = String(prompt || '').toLowerCase();
  if (/[?]$/.test(lower) || /\b(what|why|how|when|where|who|can|could|would|should)\b/.test(lower)) return pickRandom(QUESTION_TEMPLATES);
  if (/\b(feel|feeling|sad|afraid|anxious|love|grief|help|name|remember|good|weird)\b/.test(lower)) return pickRandom(REFLECTIVE_TEMPLATES);
  return pickRandom(DREAM_TEMPLATES);
}

function cleanWord(word) {
  return String(word || '').replace(/[^a-z0-9'\-]/gi, '');
}

function generateFragment(seed) {
  const words = [seed];
  let current = seed;
  const targetLength = CONFIG.MIN_FRAGMENT_WORDS + Math.floor(Math.random() * (CONFIG.MAX_FRAGMENT_WORDS - CONFIG.MIN_FRAGMENT_WORDS + 1));

  while (words.length < targetLength) {
    const pair = words.length > 1 ? `${words[words.length - 2]} ${words[words.length - 1]}` : '';
    const candidates = (markov3[pair] || markov2[current] || []).map(cleanWord).filter(Boolean);
    const fresh = candidates.filter(word => !words.slice(-4).includes(word));
    const next = pickRandom(fresh.length ? fresh : candidates);
    if (!next) break;
    words.push(next);
    current = next;
  }

  return words;
}

function makeSentence(words) {
  const text = words.join(' ').replace(/\s+([,.!?;:])/g, '$1').trim();
  if (!text) return '';
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function generatePromptSeeded(prompt) {
  const keywords = extractKeywords(prompt);
  const availableKeywords = keywords.filter(word => markov2[word]?.length);
  const keyword = pickRandom(availableKeywords) || pickRandom(keywords) || 'this';
  const template = chooseTemplate(prompt).replace('{keyword}', keyword);
  const seed = pickRandom(availableKeywords) || pickRandom(Object.keys(markov2));
  const fragment = seed ? makeSentence(generateFragment(seed)) : '';

  const response = [template, fragment]
    .filter(Boolean)
    .join(' ')
    .split(/\s+/)
    .slice(0, CONFIG.MAX_RESPONSE_WORDS)
    .join(' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();

  if (!response) return 'I am still learning, leave me another thought.';
  return /[.!?]$/.test(response) ? response : `${response}.`;
}

const DB_NAME = 'jesseos-memory';
const DB_VERSION = 1;
const STORE_NAME = 'exchanges';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getRecentExchanges(limit = CONFIG.MEMORY_EXCHANGE_LIMIT) {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const records = await new Promise((resolve, reject) => {
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    return records.slice(-limit);
  } catch (error) {
    console.warn('JesseOS memory unavailable:', error);
    return [];
  }
}

async function saveExchange(prompt, response) {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).add({ prompt, response, timestamp: Date.now() });
  } catch (error) {
    console.warn('JesseOS could not save memory:', error);
  }
}

async function clearMemory() {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear();
    request.onsuccess = resolve;
    request.onerror = reject;
  });
}

async function handleCommand(value) {
  const command = value.trim().toLowerCase();
  if (command === '/help' || command === 'help') return 'commands: /help, /about, /status, /memory, /clear';
  if (command === '/about' || command === 'about') return 'jesseos v0.5: a local browser dream engine. no cloud, tracking, or external api.';
  if (command === '/status' || command === 'status') return `model: ${Object.keys(markov1).length} words, ${Object.keys(markov2).length} pairs, ${Object.keys(markov3).length} triples | corpus: ${(window.JESSEOS_CORPUS || []).length} lines.`;
  if (command === '/memory' || command === 'memory') {
    const recent = await getRecentExchanges(5);
    return recent.length ? `recent: ${recent.map(item => item.prompt.slice(0, 28)).join(' | ')}` : 'no local memories yet.';
  }
  if (command === '/clear' || command === 'clear') {
    await clearMemory();
    return 'local memory cleared.';
  }
  return null;
}

function addLine(className, text) {
  const line = document.createElement('div');
  line.className = className;
  line.textContent = text;
  transcriptEl.appendChild(line);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
  return line;
}

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function typeResponse(text) {
  const line = addLine('response-line', '');
  let buffer = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    buffer += char;
    line.textContent = buffer;
    let delay = CONFIG.TYPE_DELAY_MIN + Math.random() * (CONFIG.TYPE_DELAY_MAX - CONFIG.TYPE_DELAY_MIN);
    if (/[.!?]/.test(char)) delay += CONFIG.PUNCTUATION_PAUSE_END;
    if (/[,;:]/.test(char)) delay += CONFIG.PUNCTUATION_PAUSE_BASE;
    await wait(delay);
  }
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

async function handleSubmit(event) {
  if (event) event.preventDefault();
  const prompt = inputEl.value.trim();
  if (!prompt || isGenerating) return;

  isGenerating = true;
  inputEl.disabled = true;
  if (sendBtn) sendBtn.disabled = true;
  statusEl.textContent = 'THINKING...';
  addLine('user-line', `> ${prompt}`);
  inputEl.value = '';

  try {
    const commandReply = await handleCommand(prompt);
    let reply = commandReply;
    if (!reply) {
      const recent = await getRecentExchanges();
      const memories = recent.flatMap(item => sentenceSplit(`${item.prompt} ${item.response}`));
      trainMultiOrder((window.JESSEOS_CORPUS || []).concat(memories));
      reply = generatePromptSeeded(prompt);
      await saveExchange(prompt, reply);
    }
    statusEl.textContent = 'READY';
    await typeResponse(reply);
  } catch (error) {
    console.error('JesseOS error:', error);
    statusEl.textContent = 'ERROR';
    addLine('response-line', 'system error: the local dream engine lost its thread. reload and try again.');
  } finally {
    isGenerating = false;
    inputEl.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    inputEl.focus();
  }
}

function init() {
  transcriptEl = document.getElementById('transcript');
  inputEl = document.getElementById('input');
  sendBtn = document.getElementById('send');
  statusEl = document.getElementById('status');
  cursorEl = document.getElementById('cursor');