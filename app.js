// JesseOS v0.4 - Free-association dream engine
// Local-only, no network calls, no tracking, no secrets

const CONFIG = {
  MEMORY_EXCHANGE_LIMIT: 80,
  MAX_RESPONSE_SENTENCES: 4,
  MIN_RESPONSE_SENTENCES: 2,
  ASSOCIATIVE_JUMP_PROBABILITY: 0.10,
  TYPE_DELAY_MIN: 20,
  TYPE_DELAY_MAX: 50,
  PUNCTUATION_PAUSE_BASE: 80,
  PUNCTUATION_PAUSE_END: 150,
  BACKSPACE_PROBABILITY: 0.02,
};

let transcriptEl, inputEl, sendBtn, statusEl, cursorEl;
let markov1 = {};
let markov2 = {};
let markov3 = {};
let isGenerating = false;

function tokenize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s'\-]/g, '').split(/\s+/).filter(Boolean);
}

function extractKeywords(text) {
  const stopwords = new Set(['i','am','a','an','the','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','can','need','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','when','where','why','how','all','each','more','most','other','some','no','not','only','so','than','too','very','just','also','now','and','but','or','if','because','until','while','what','which','who','this','that','these','those','it','its','my','your','his','her','their','our','we','you','he','she','they','them','me','him','us']);
  return tokenize(text).filter(word => word.length > 2 && !stopwords.has(word));
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

function generatePromptSeeded(prompt) {
  const keywords = extractKeywords(prompt);
  const allStates = Object.keys(markov2);
  let current = keywords.find(word => markov2[word]?.length) || pickRandom(allStates);
  if (!current) return 'i am still learning. leave me another thought.';

  const words = [current];
  let sentenceWords = 1;
  let sentences = 0;

  while (sentences < CONFIG.MAX_RESPONSE_SENTENCES && words.length < 62) {
    if (keywords.length && Math.random() < CONFIG.ASSOCIATIVE_JUMP_PROBABILITY) {
      const jump = pickRandom(keywords.filter(word => markov2[word]?.length));
      if (jump) current = jump;
    }

    const pair = words.length > 1 ? `${words[words.length - 2]} ${words[words.length - 1]}` : '';
    const next = pickRandom(markov3[pair]) || pickRandom(markov2[current]) || pickRandom(Object.keys(markov1));
    if (!next) break;
    words.push(next);
    current = next;
    sentenceWords += 1;

    if (sentenceWords >= 8 + Math.floor(Math.random() * 7)) {
      words[words.length - 1] += '.';
      sentences += 1;
      sentenceWords = 0;
      if (sentences >= CONFIG.MIN_RESPONSE_SENTENCES && Math.random() > 0.6) break;
    }
  }

  if (!/[.!?]$/.test(words[words.length - 1])) words[words.length - 1] += '.';
  const answer = words.join(' ');
  return answer.charAt(0).toUpperCase() + answer.slice(1);
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
  if (command === '/about' || command === 'about') return 'jesseos v0.4: a local browser dream engine. no cloud, tracking, or external api.';
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

  if (!transcriptEl || !inputEl || !statusEl) {
    console.error('JesseOS markup mismatch: transcript, input, or status is missing.');
    return;
  }

  const form = document.getElementById('input-form');
  form?.addEventListener('submit', handleSubmit);
  sendBtn?.addEventListener('click', handleSubmit);
  inputEl.addEventListener('keydown', event => {
    if (event.key === 'Enter') handleSubmit(event);
  });

  trainMultiOrder(window.JESSEOS_CORPUS || []);
  statusEl.textContent = 'READY';
  addLine('system-line', 'jesseos v0.4 — local dream engine online. type /help for commands.');
  inputEl.focus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
