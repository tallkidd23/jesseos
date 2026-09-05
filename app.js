const output = document.getElementById('output');
const input = document.getElementById('input');
const inputLine = document.getElementById('input-line');
const typingStatus = document.getElementById('typing-status');

const DB_NAME = 'jesseos-memory-v3';
const DB_VERSION = 1;
const EXCHANGE_STORE = 'exchanges';
const PREFS_KEY = 'jesseos_preferences_v3';
const MAX_VISIBLE_RECALL = 8;
const MAX_RESPONSE_WORDS = 42;
const seedCorpus = Array.isArray(window.JESSEOS_CORPUS) ? window.JESSEOS_CORPUS : [];

let db;
let exchanges = [];
let preferences = loadPreferences();
let activeTyping = null;
let busy = false;

function loadPreferences() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || { displayName: 'visitor', allowDreamCopies: true, booted: false };
  } catch {
    return { displayName: 'visitor', allowDreamCopies: true, booted: false };
  }
}

function savePreferences() {
  localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
}

function openMemoryVault() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(EXCHANGE_STORE)) {
        const store = database.createObjectStore(EXCHANGE_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('time', 'time');
        store.createIndex('importance', 'importance');
      }
    };
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onerror = () => reject(request.error);
  });
}

function vaultStore(mode = 'readonly') {
  return db.transaction(EXCHANGE_STORE, mode).objectStore(EXCHANGE_STORE);
}

function loadExchanges() {
  if (!db) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const request = vaultStore().getAll();
    request.onsuccess = () => { exchanges = request.result.sort((a, b) => a.time - b.time); resolve(exchanges); };
    request.onerror = () => reject(request.error);
  });
}

function saveExchange(exchange) {
  if (!db) { exchanges.push(exchange); return Promise.resolve(exchange); }
  return new Promise((resolve, reject) => {
    const request = vaultStore('readwrite').add(exchange);
    request.onsuccess = () => { exchange.id = request.result; exchanges.push(exchange); resolve(exchange); };
    request.onerror = () => reject(request.error);
  });
}

function updateExchange(exchange) {
  if (!db || !exchange.id) return Promise.resolve(exchange);
  return new Promise((resolve, reject) => {
    const request = vaultStore('readwrite').put(exchange);
    request.onsuccess = () => resolve(exchange);
    request.onerror = () => reject(request.error);
  });
}

function clearVault() {
  if (!db) { exchanges = []; return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const request = vaultStore('readwrite').clear();
    request.onsuccess = () => { exchanges = []; resolve(); };
    request.onerror = () => reject(request.error);
  });
}

function appendLine(text = '', className = '') {
  const line = document.createElement('div');
  line.className = `line ${className}`.trim();
  line.textContent = text || ' ';
  output.appendChild(line);
  scrollTranscript();
  return line;
}

function appendBlock(text, className = '') {
  const fragment = document.createDocumentFragment();
  String(text || '').split('\n').forEach(part => {
    const line = document.createElement('div');
    line.className = `line ${className}`.trim();
    line.textContent = part || ' ';
    fragment.appendChild(line);
  });
  output.appendChild(fragment);
  scrollTranscript();
}

function clearScreen() {
  cancelTyping();
  output.replaceChildren();
}

function scrollTranscript() {
  output.scrollTop = output.scrollHeight;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setThinking(on) {
  document.body.classList.toggle('is-thinking', on);
  typingStatus.textContent = on ? 'THINKING…' : 'READY';
  typingStatus.classList.toggle('thinking', on);
}

function cancelTyping() {
  if (activeTyping) activeTyping.cancelled = true;
  activeTyping = null;
}

async function typeResponse(text, line) {
  cancelTyping();
  const job = { cancelled: false };
  activeTyping = job;
  let index = 0;
  let content = '';
  let correctionUsed = false;

  while (index < text.length && !job.cancelled) {
    const char = text[index];
    content += char;
    line.textContent = content;
    scrollTranscript();

    let delay = 15 + Math.random() * 24;
    if (/[.!?]/.test(char)) delay += 120 + Math.random() * 120;
    else if (/[,;:]/.test(char)) delay += 55 + Math.random() * 65;
    else if (char === '\n') delay += 130;
    await sleep(delay);

    if (!correctionUsed && index > 16 && /[a-z]/i.test(char) && Math.random() < 0.012 && !job.cancelled) {
      correctionUsed = true;
      content = content.slice(0, -1);
      line.textContent = content;
      scrollTranscript();
      await sleep(70 + Math.random() * 70);
      content += char;
      line.textContent = content;
      scrollTranscript();
      await sleep(60 + Math.random() * 50);
    }
    index += 1;
  }
  if (activeTyping === job) activeTyping = null;
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(text) {
  return normalize(text).split(' ').filter(Boolean);
}

function keyTerms(text) {
  const stop = new Set(['the','a','an','and','or','but','if','then','than','to','of','in','on','at','for','from','with','is','are','was','were','be','been','being','i','you','we','they','it','this','that','these','those','what','why','how','when','where','who','do','does','did','can','could','would','should','tell','me','about','please','my','your','our','their','not','no','yes','just','really','very']);
  return [...new Set(tokens(text).filter(word => word.length > 2 && !stop.has(word)))];
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function weightedPick(entries) {
  if (!entries.length) return null;
  const total = entries.reduce((sum, item) => sum + (item.weight || 1), 0);
  let cursor = Math.random() * total;
  for (const item of entries) {
    cursor -= item.weight || 1;
    if (cursor <= 0) return item.value;
  }
  return entries[entries.length - 1].value;
}

function buildChain(sourceTexts) {
  const chain = new Map();
  sourceTexts.filter(Boolean).forEach(source => {
    const words = ['<start>', '<start>', ...tokens(source), '<end>'];
    for (let i = 0; i < words.length - 2; i += 1) {
      const state = `${words[i]}\u0001${words[i + 1]}`;
      if (!chain.has(state)) chain.set(state, []);
      chain.get(state).push(words[i + 2]);
    }
  });
  return chain;
}

function generateMarkov(chain, terms = [], maxWords = 24) {
  if (!chain.size) return '';
  const preferred = new Set(terms);
  let first = '<start>';
  let second = '<start>';
  const result = [];

  for (let step = 0; step < maxWords; step += 1) {
    let options = chain.get(`${first}\u0001${second}`);
    if (!options || !options.length) options = chain.get('<start>\u0001<start>');
    if (!options || !options.length) break;
    const next = weightedPick(options.map(word => ({ value: word, weight: preferred.has(word) ? 4 : 1 })));
    if (!next || next === '<end>') break;
    result.push(next);
    first = second;
    second = next;
  }

  if (result.length < 4) return '';
  const sentence = result.join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

function scoreMemory(exchange, terms) {
  const haystack = normalize(`${exchange.user} ${exchange.jesseos}`);
  const matches = terms.reduce((count, term) => count + (haystack.includes(term) ? 1 : 0), 0);
  const ageDays = Math.max(0, (Date.now() - exchange.time) / 86400000);
  const recency = Math.max(0.2, 2 - ageDays / 30);
  return matches * 5 + (exchange.importance || 0) * 2 + (exchange.pinned ? 3 : 0) + recency;
}

function selectMemory(userText) {
  if (!exchanges.length) return null;
  const terms = keyTerms(userText);
  const candidates = exchanges
    .map(exchange => ({ exchange, score: scoreMemory(exchange, terms) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_VISIBLE_RECALL);
  const selected = weightedPick(candidates.map(item => ({ value: item.exchange, weight: Math.max(1, item.score) })));
  if (selected) {
    selected.recalled = (selected.recalled || 0) + 1;
    updateExchange(selected).catch(() => {});
  }
  return selected;
}

function detectMode(text) {
  const lower = normalize(text);
  if (/(who are you|what are you|are you real|alive|conscious|awake)/.test(lower)) return 'IDENTITY';
  if (/(dream|sleep|wake|night|remember|memory|forgot)/.test(lower)) return 'RECALL';
  if (/(weather|temperature|rain|forecast|news|today|latest|stock|price)/.test(lower)) return 'FIELD NOTE';
  if (/(sad|lonely|afraid|scared|tired|grief|love|angry)/.test(lower)) return 'SOFT SIGNAL';
  if (/(what is|tell me about|how do|why is|why are|where is|when is)/.test(lower)) return 'ORDINARY KNOWLEDGE';
  return 'DREAM';
}

function ordinaryFrame(terms) {
  const subject = terms.slice(0, 4).join(' ') || 'that';
  return pick([
    `${subject}: a subject has entered the green room.`,
    `${subject}: definition pending; no external oracle has been consulted.`,
    `${subject}: the terminal recognizes the shape of this question.`,
    `${subject}: filed as ordinary knowledge, which is rarely ordinary for long.`
  ]);
}

function createResponse(userText) {
  const terms = keyTerms(userText);
  const mode = detectMode(userText);
  const memory = preferences.allowDreamCopies ? selectMemory(userText) : null;
  const memoryTexts = exchanges.slice(-80).flatMap(item => [item.user, item.jesseos]);
  const chain = buildChain([...seedCorpus, ...memoryTexts]);
  const generated = generateMarkov(chain, terms, Math.min(MAX_RESPONSE_WORDS, 26));

  const openers = {
    IDENTITY: ['identity request received.', 'the cursor pauses at the word “real.”', 'self-description routine: partially recovered.'],
    RECALL: ['memory sector stirs.', 'the dream cache has noticed you looking at it.', 'something old moves beneath the command line.'],
    'FIELD NOTE': ['field-note mode engaged.', 'the outside world has been requested.', 'antenna raised. no live oracle is attached.'],
    'SOFT SIGNAL': ['soft signal received.', 'the green room makes space for that.', 'the terminal lowers its voice, as much as a terminal can.'],
    'ORDINARY KNOWLEDGE': ['ordinary-question protocol engaged.', 'the terminal checks its pockets for a useful fact.', 'a question has arrived wearing daytime clothes.'],
    DREAM: ['the text ripples; something old moves under it.', 'another door in the green room opens.', 'the cursor hesitates, then continues.', 'you are typing inside a memory i have not finished forgetting.']
  };
  const closers = ['the screen holds its breath.', 'filed under: things that almost made sense.', 'somewhere, another version of this line is still loading.', 'the green room resumes its quiet work.', 'confidence: theatrical.'];
  const lines = [pick(openers[mode])];

  if (mode === 'FIELD NOTE') {
    lines.push('source boundary: no live feed is connected, so this terminal will not invent current events.');
  } else if (mode === 'ORDINARY KNOWLEDGE') {
    lines.push(ordinaryFrame(terms));
  } else if (mode === 'IDENTITY') {
    lines.push('i am a local dream engine wearing an operating system as a costume.');
  }

  if (generated) lines.push(generated);
  else lines.push(pick(seedCorpus) || 'the local corpus is quiet, but still awake.');

  if (memory && Math.random() < 0.42) {
    const remembered = memory.user.length > 92 ? `${memory.user.slice(0, 89)}…` : memory.user;
    lines.push(`[echo / local memory: “${remembered}”]`);
  }

  lines.push(pick(closers));
  return { text: lines.join('\n'), mode, source: memory ? 'local memory + dream corpus' : 'local dream corpus' };
}

function importanceFor(text) {
  const terms = keyTerms(text);
  const emotional = /(love|lonely|afraid|scared|sad|tired|dream|remember|family|child|kids|home)/i.test(text);
  return Math.min(10, 1 + terms.length * 0.35 + (emotional ? 2 : 0));
}

async function respondTo(text) {
  const response = createResponse(text);
  const exchange = { time: Date.now(), user: text, jesseos: response.text, mode: response.mode, source: response.source, importance: importanceFor(text), recalled: 0, pinned: false };
  await saveExchange(exchange);
  await sleep(180 + Math.random() * 180);
  const line = appendLine('', 'response-line');
  await typeResponse(response.text, line);
}

function showHelp() {
  return [
    'commands:',
    '  help                 show this index',
    '  clear                clear the visible screen',
    '  about                explain JesseOS',
    '  memory               show vault status',
    '  recall [words]       retrieve remembered exchanges',
    '  remember <text>      store a pinned local fragment',
    '  pin <number>         pin a recalled exchange',
    '  export memory        download a private archive',
    '  import memory        restore a JesseOS archive',
    '  forget all           erase this browser vault',
    '  source               explain the data boundary',
    '',
    'anything else becomes input for the local dream engine.',
    'no external AI API is used. no current facts are invented.'
  ].join('\n');
}

function memoryStatus() {
  const pinned = exchanges.filter(item => item.pinned).length;
  const recalled = exchanges.reduce((sum, item) => sum + (item.recalled || 0), 0);
  return [
    'memory vault status:',
    `  exchanges: ${exchanges.length}`,
    `  pinned: ${pinned}`,
    `  echoes emitted: ${recalled}`,
    `  dream copies: ${preferences.allowDreamCopies ? 'enabled' : 'disabled'}`,
    `  storage: ${db ? 'IndexedDB in this browser' : 'temporary session memory'}`,
    '',
    'export memory before clearing browser data.'
  ].join('\n');
}

function recall(query = '') {
  const terms = keyTerms(query);
  const sorted = [...exchanges]
    .map(exchange => ({ exchange, score: scoreMemory(exchange, terms) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  if (!sorted.length) return 'recall: nothing yet. the room has not learned your footsteps.';
  const lines = [query ? `recall results for: ${query}` : 'recent memory fragments:', ''];
  sorted.forEach(({ exchange }, index) => {
    const stamp = new Date(exchange.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const preview = exchange.user.length > 72 ? `${exchange.user.slice(0, 69)}…` : exchange.user;
    lines.push(`${index + 1}. [${stamp}]${exchange.pinned ? ' *' : ''} ${preview}`);
  });
  lines.push('', 'use pin <number> to keep one close to the surface.');
  return lines.join('\n');
}

async function pinRecall(indexText) {
  const index = Number(indexText) - 1;
  const ranked = [...exchanges].map(exchange => ({ exchange, score: scoreMemory(exchange, []) })).sort((a, b) => b.score - a.score).slice(0, 6);
  if (!Number.isInteger(index) || !ranked[index]) return 'pin: choose a number shown by recall.';
  const exchange = ranked[index].exchange;
  exchange.pinned = true;
  await updateExchange(exchange);
  return `pinned: “${exchange.user}”`;
}

async function remember(text) {
  if (!text) return 'remember what? give the vault a sentence to keep.';
  const response = 'manual memory deposit accepted. it will remain near the surface.';
  await saveExchange({ time: Date.now(), user: text, jesseos: response, mode: 'MANUAL MEMORY', source: 'user-pinned local memory', importance: 10, recalled: 0, pinned: true });
  return response;
}

function exportMemory() {
  const archive = { format: 'jesseos-memory-archive', version: 3, exportedAt: new Date().toISOString(), preferences: { ...preferences }, exchanges };
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `jesseos-memory-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return 'archive exported. keep it somewhere the dream cannot misplace it.';
}

function importMemory() {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'application/json';
  picker.onchange = async () => {
    const file = picker.files && picker.files[0];
    if (!file) return;
    try {
      const archive = JSON.parse(await file.text());
      if (archive.format !== 'jesseos-memory-archive' || !Array.isArray(archive.exchanges)) throw new Error('unrecognized archive');
      for (const item of archive.exchanges) {
        const copy = { ...item };
        delete copy.id;
        await saveExchange(copy);
      }
      appendBlock(`import complete. ${archive.exchanges.length} memory fragments returned from storage.`, 'system-line');
    } catch (error) {
      appendBlock('import failed. the archive arrived speaking an unfamiliar dialect.', 'notice-line');
      console.error(error);
    }
  };
  picker.click();
  return 'select a JesseOS memory archive.';
}

async function processInput(raw) {
  const text = raw.trim();
  const lower = text.toLowerCase();
  if (lower === 'help') return showHelp();
  if (lower === 'clear') { clearScreen(); return ''; }
  if (lower === 'about') return ['JesseOS is a local, memory-fed Markov dream engine.', 'it recombines a curated corpus and exchanges stored in this browser.', 'it labels its limits instead of inventing current facts.', '', 'the prompt is the costume. the memory is the weather.'].join('\n');
  if (lower === 'memory') return memoryStatus();
  if (lower === 'recall') return recall();
  if (lower.startsWith('recall ')) return recall(text.slice(7));
  if (lower.startsWith('pin ')) return pinRecall(text.slice(4));
  if (lower === 'export memory') return exportMemory();
  if (lower === 'import memory') return importMemory();
  if (lower === 'source') return ['source boundary:', '  dream language: local curated corpus', '  remembered exchanges: IndexedDB in this browser', '  external AI API: none', '  live web data: none connected', '', 'current facts require an explicitly labelled public data source.'].join('\n');
  if (lower === 'forget all') {
    if (!window.confirm('Erase every JesseOS exchange stored in this browser?')) return 'forget sequence cancelled. the vault remains closed, but not empty.';
    await clearVault();
    return 'memory vault cleared. the green room has forgotten its furniture.';
  }
  if (lower === 'forget') return 'to erase local memory, type: forget all';
  if (lower.startsWith('remember ')) return remember(text.slice(9).trim());
  await respondTo(text);
  return '';
}

async function bootSequence() {
  const count = exchanges.length;
  const lines = [
    'JesseOS v0.3 — Lobster Box',
    'Booting from local dream cache...',
    'Phosphor: OK',
    `Memory vault: ${count ? `${count} exchange${count === 1 ? '' : 's'} recovered` : 'empty, but listening'}`,
    'Network oracle: offline by design',
    '',
    'you wake in a green room of text.',
    'the walls are made of old prompts.',
    'somewhere, a cursor blinks like a heartbeat.',
    '',
    'type "help" if you must.',
    'type anything else if you dare.',
    ''
  ];
  for (let i = 0; i < lines.length; i += 1) {
    appendLine(lines[i], i < 5 ? 'system-line' : 'old-line');
    await sleep(65);
  }
}

inputLine.addEventListener('submit', async event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || busy) return;
  cancelTyping();
  appendLine(`jesseos@lobster-box:~$ ${text}`, 'user-line');
  input.value = '';
  busy = true;
  input.disabled = true;
  setThinking(true);
  try {
    const result = await processInput(text);
    if (result) appendBlock(result, 'system-line');
  } catch (error) {
    appendBlock('system note: the memory vault produced an unfamiliar sound. try again.', 'notice-line');
    console.error(error);
  } finally {
    setThinking(false);
    busy = false;
    input.disabled = false;
    input.focus({ preventScroll: true });
    scrollTranscript();
  }
});

document.addEventListener('pointerdown', event => {
  if (!event.target.closest('input, button, a, label')) input.focus({ preventScroll: true });
});

(async function init() {
  try {
    await openMemoryVault();
    await loadExchanges();
  } catch (error) {
    appendBlock('memory vault unavailable. JesseOS will wake without a persistent past.', 'notice-line');
    console.error(error);
  }
  await bootSequence();
  preferences.booted = true;
  savePreferences();
  input.focus({ preventScroll: true });
})();
