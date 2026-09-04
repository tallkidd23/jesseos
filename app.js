const output = document.getElementById('output');
const input = document.getElementById('input');

const DB_NAME = 'jesseos-memory-v2';
const DB_VERSION = 1;
const EXCHANGE_STORE = 'exchanges';
const PREFS_KEY = 'jesseos_preferences_v2';
const MAX_VISIBLE_RECALL = 8;

const seedCorpus = window.JESSEOS_CORPUS || [];
let db;
let exchanges = [];
let preferences = loadPreferences();

function loadPreferences() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {
      displayName: 'visitor',
      allowDreamCopies: true,
      booted: false
    };
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
        const store = database.createObjectStore(EXCHANGE_STORE, {
          keyPath: 'id', autoIncrement: true
        });
        store.createIndex('time', 'time');
        store.createIndex('importance', 'importance');
      }
    };
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

function vaultTransaction(mode = 'readonly') {
  return db.transaction(EXCHANGE_STORE, mode).objectStore(EXCHANGE_STORE);
}

function loadExchanges() {
  return new Promise((resolve, reject) => {
    const request = vaultTransaction().getAll();
    request.onsuccess = () => {
      exchanges = request.result.sort((a, b) => a.time - b.time);
      resolve(exchanges);
    };
    request.onerror = () => reject(request.error);
  });
}

function saveExchange(exchange) {
  return new Promise((resolve, reject) => {
    const request = vaultTransaction('readwrite').add(exchange);
    request.onsuccess = () => {
      exchange.id = request.result;
      exchanges.push(exchange);
      resolve(exchange);
    };
    request.onerror = () => reject(request.error);
  });
}

function updateExchange(exchange) {
  return new Promise((resolve, reject) => {
    const request = vaultTransaction('readwrite').put(exchange);
    request.onsuccess = () => resolve(exchange);
    request.onerror = () => reject(request.error);
  });
}

function clearVault() {
  return new Promise((resolve, reject) => {
    const request = vaultTransaction('readwrite').clear();
    request.onsuccess = () => {
      exchanges = [];
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

function appendBlock(text, cls = '') {
  if (!text) return;
  const lines = String(text).split('\n');
  lines.forEach(line => {
    const div = document.createElement('div');
    div.textContent = line || ' ';
    if (cls) div.classList.add(cls);
    output.appendChild(div);
  });
  output.scrollTop = output.scrollHeight;
}

function clearScreen() {
  output.innerHTML = '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function bootSequence() {
  const count = exchanges.length;
  const lines = [
    'JesseOS v0.2 — Lobster Box',
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

  for (let i = 0; i < lines.length; i++) {
    appendBlock(lines[i], i < 5 ? '' : 'old-line');
    await sleep(115);
  }
  input.focus();
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
  const stop = new Set([
    'the','a','an','and','or','but','if','then','than','to','of','in','on','at','for','from','with',
    'is','are','was','were','be','been','being','i','you','we','they','it','this','that','these','those',
    'what','why','how','when','where','who','do','does','did','can','could','would','should','tell','me',
    'about','please','my','your','our','their','not','no','yes','just','really','very'
  ]);
  return [...new Set(tokens(text).filter(word => word.length > 2 && !stop.has(word)))];
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

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function buildChain(sourceTexts) {
  const chain = new Map();
  sourceTexts.forEach(source => {
    const words = ['<start>', '<start>', ...tokens(source), '<end>'];
    for (let i = 0; i < words.length - 2; i++) {
      const state = `${words[i]}\u0001${words[i + 1]}`;
      const next = words[i + 2];
      if (!chain.has(state)) chain.set(state, []);
      chain.get(state).push(next);
    }
  });
  return chain;
}

function generateMarkov(chain, terms = [], maxWords = 28) {
  if (!chain.size) return '';
  let a = '<start>';
  let b = '<start>';
  const result = [];
  const preferred = new Set(terms);

  for (let step = 0; step < maxWords; step++) {
    const options = chain.get(`${a}\u0001${b}`) || chain.get('<start>\u0001<start>');
    if (!options || !options.length) break;
    const choices = options.map(word => ({
      value: word,
      weight: preferred.has(word) ? 4 : 1
    }));
    const next = weightedPick(choices);
    if (!next || next === '<end>') break;
    result.push(next);
    a = b;
    b = next;
  }

  if (!result.length) return '';
  const sentence = result.join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

function scoreMemory(exchange, terms) {
  const haystack = normalize(`${exchange.user} ${exchange.jesseos}`);
  const matches = terms.reduce((count, term) => count + (haystack.includes(term) ? 1 : 0), 0);
  const ageDays = Math.max(0, (Date.now() - exchange.time) / 86400000);
  const recency = Math.max(0.2, 2 - ageDays / 30);
  const pin = exchange.pinned ? 3 : 0;
  return matches * 5 + (exchange.importance || 0) * 2 + pin + recency;
}

function selectMemory(userText) {
  if (!exchanges.length) return null;
  const terms = keyTerms(userText);
  const ranked = exchanges
    .map(exchange => ({ exchange, score: scoreMemory(exchange, terms) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const candidates = ranked.slice(0, MAX_VISIBLE_RECALL);
  if (!candidates.length) return null;
  const selected = weightedPick(candidates.map(item => ({
    value: item.exchange,
    weight: Math.max(1, item.score)
  })));
  if (selected) {
    selected.recalled = (selected.recalled || 0) + 1;
    updateExchange(selected).catch(() => {});
  }
  return selected;
}

function detectMode(text) {
  const lower = normalize(text);
  if (/(who are you|what are you|are you real|alive|conscious)/.test(lower)) return 'IDENTITY';
  if (/(dream|sleep|wake|night|remember|memory|forgot)/.test(lower)) return 'RECALL';
  if (/(weather|temperature|rain|forecast|news|today|latest|stock|price)/.test(lower)) return 'FIELD NOTE';
  if (/(sad|lonely|afraid|scared|tired|grief|love|angry)/.test(lower)) return 'SOFT SIGNAL';
  if (/(what is|tell me about|how do|why is|why are|where is|when is)/.test(lower)) return 'ORDINARY KNOWLEDGE';
  return 'DREAM';
}

function ordinaryFrame(userText, terms) {
  const subject = terms.slice(0, 4).join(' ') || 'that';
  const frames = [
    `${subject}: a subject has entered the green room.`,
    `${subject}: definition pending. no oracle has been consulted.`,
    `${subject}: the terminal recognizes the shape of this question.`,
    `${subject}: filed as ordinary knowledge, which is rarely ordinary for long.`
  ];
  return pick(frames);
}

function createResponse(userText) {
  const terms = keyTerms(userText);
  const mode = detectMode(userText);
  const memory = preferences.allowDreamCopies ? selectMemory(userText) : null;
  const memoryTexts = exchanges.flatMap(item => [item.user, item.jesseos]);
  const corpus = [...seedCorpus, ...memoryTexts];
  const chain = buildChain(corpus);
  const generated = generateMarkov(chain, terms);

  const openers = {
    'IDENTITY': [
      'identity request received.',
      'the cursor pauses at the word “real.”',
      'self-description routine: partially recovered.'
    ],
    'RECALL': [
      'memory sector stirs.',
      'the dream cache has noticed you looking at it.',
      'something old moves beneath the command line.'
    ],
    'FIELD NOTE': [
      'field-note mode engaged.',
      'the outside world has been requested.',
      'antenna raised. no live oracle is attached.'
    ],
    'SOFT SIGNAL': [
      'soft signal received.',
      'the green room makes space for that.',
      'the terminal lowers its voice, as much as a terminal can.'
    ],
    'ORDINARY KNOWLEDGE': [
      'ordinary-question protocol engaged.',
      'the terminal checks its pockets for a useful fact.',
      'a question has arrived wearing daytime clothes.'
    ],
    'DREAM': [
      'the text ripples; something old moves under it.',
      'another door in the green room opens.',
      'the cursor hesitates, then continues.',
      'you are typing inside a memory i have not finished forgetting.'
    ]
  };

  const closers = [
    'the screen holds its breath.',
    'filed under: things that almost made sense.',
    'somewhere, another version of this line is still loading.',
    'the green room resumes its quiet work.',
    'confidence: theatrical.'
  ];

  const lines = [pick(openers[mode])];

  if (mode === 'FIELD NOTE') {
    lines.push('source: no live feed connected. this terminal does not invent current events.');
  } else if (mode === 'ORDINARY KNOWLEDGE') {
    lines.push(ordinaryFrame(userText, terms));
  } else if (mode === 'IDENTITY') {
    lines.push('i am a local dream engine wearing an operating system as a costume.');
  }

  if (generated) lines.push(generated);

  if (memory && Math.random() < 0.72) {
    const remembered = memory.user.length > 110 ? `${memory.user.slice(0, 107)}...` : memory.user;
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
  const exchange = {
    time: Date.now(),
    user: text,
    jesseos: response.text,
    mode: response.mode,
    source: response.source,
    importance: importanceFor(text),
    recalled: 0,
    pinned: false
  };
  await saveExchange(exchange);
  await sleep(180);
  appendBlock(response.text);
}

function showHelp() {
  return [
    'commands:',
    '  help                 show this index',
    '  clear                clear the visible screen',
    '  about                what JesseOS is',
    '  memory               show vault status',
    '  recall [words]       retrieve remembered exchanges',
    '  remember <text>      store a pinned memory fragment',
    '  pin <number>         pin an exchange from recall',
    '  export memory        download your private archive',
    '  import memory        choose a JesseOS archive to restore',
    '  forget all           erase this browser’s JesseOS vault',
    '  source               explain the current data boundary',
    '',
    'anything else becomes input for the dream engine.',
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
    '  storage: this browser only (IndexedDB)',
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

  const label = query ? `recall results for: ${query}` : 'recent memory fragments:';
  const lines = [label, ''];
  sorted.forEach(({ exchange }, index) => {
    const stamp = new Date(exchange.time).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric'
    });
    const flag = exchange.pinned ? ' *' : '';
    const preview = exchange.user.length > 72 ? `${exchange.user.slice(0, 69)}...` : exchange.user;
    lines.push(`${index + 1}. [${stamp}]${flag} ${preview}`);
  });
  lines.push('', 'use pin <number> to keep one close to the surface.');
  return lines.join('\n');
}

async function pinRecall(indexText) {
  const index = Number(indexText) - 1;
  const ranked = [...exchanges]
    .map(exchange => ({ exchange, score: scoreMemory(exchange, []) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  if (!Number.isInteger(index) || !ranked[index]) {
    return 'pin: choose a number shown by recall.';
  }
  const exchange = ranked[index].exchange;
  exchange.pinned = true;
  await updateExchange(exchange);
  return `pinned: “${exchange.user}”`;
}

async function remember(text) {
  if (!text) return 'remember what? give the vault a sentence to keep.';
  const response = 'manual memory deposit accepted. it will remain near the surface.';
  await saveExchange({
    time: Date.now(),
    user: text,
    jesseos: response,
    mode: 'MANUAL MEMORY',
    source: 'user-pinned local memory',
    importance: 10,
    recalled: 0,
    pinned: true
  });
  return response;
}

function exportMemory() {
  const archive = {
    format: 'jesseos-memory-archive',
    version: 2,
    exportedAt: new Date().toISOString(),
    preferences: { ...preferences },
    exchanges
  };
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `jesseos-memory-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
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
      if (archive.format !== 'jesseos-memory-archive' || !Array.isArray(archive.exchanges)) {
        throw new Error('unrecognized archive');
      }
      for (const item of archive.exchanges) {
        const copy = { ...item };
        delete copy.id;
        await saveExchange(copy);
      }
      appendBlock(`import complete. ${archive.exchanges.length} memory fragments returned from storage.`);
    } catch {
      appendBlock('import failed. the archive arrived speaking an unfamiliar dialect.');
    }
  };
  picker.click();
  return 'select a JesseOS memory archive.';
}

async function processInput(raw) {
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (lower === 'help') return showHelp();
  if (lower === 'clear') {
    clearScreen();
    return '';
  }
  if (lower === 'about') {
    return [
      'JesseOS is a local, memory-fed Markov dream engine.',
      'it is not an all-knowing model, although it sometimes dresses like one.',
      'it recombines a curated corpus and exchanges stored in this browser.',
      'it labels its limits instead of inventing current facts.',
      '',
      'the prompt is the costume. the memory is the weather.'
    ].join('\n');
  }
  if (lower === 'memory') return memoryStatus();
  if (lower === 'recall') return recall();
  if (lower.startsWith('recall ')) return recall(text.slice(7));
  if (lower.startsWith('pin ')) return pinRecall(text.slice(4));
  if (lower === 'export memory') return exportMemory();
  if (lower === 'import memory') return importMemory();
  if (lower === 'source') {
    return [
      'source boundary:',
      '  dream language: local curated corpus',
      '  remembered exchanges: IndexedDB in this browser',
      '  external AI API: none',
      '  live web data: none connected yet',
      '',
      'current facts require an explicitly labelled public data source.'
    ].join('\n');
  }
  if (lower === 'forget all') {
    const answer = window.confirm('Erase every JesseOS exchange stored in this browser?');
    if (!answer) return 'forget sequence cancelled. the vault remains closed, but not empty.';
    await clearVault();
    return 'memory vault cleared. the green room has forgotten its furniture.';
  }
  if (lower === 'forget') {
    return 'to erase local memory, type: forget all';
  }
  if (lower.startsWith('remember ')) return remember(text.slice(9).trim());

  await respondTo(text);
  return '';
}

input.addEventListener('keydown', async event => {
  if (event.key !== 'Enter') return;
  const text = input.value;
  input.value = '';
  if (!text.trim()) return;

  appendBlock(`jesseos@lobster-box:~$ ${text}`, 'old-line');
  input.disabled = true;
  try {
    const result = await processInput(text);
    if (result) appendBlock(result);
  } catch (error) {
    appendBlock('system note: the memory vault produced an unfamiliar sound. try again.');
    console.error(error);
  } finally {
    input.disabled = false;
    input.focus();
  }
});

document.addEventListener('click', () => input.focus());

(async function init() {
  try {
    await openMemoryVault();
    await loadExchanges();
    await bootSequence();
  } catch (error) {
    appendBlock('memory vault unavailable. JesseOS will wake without a past.');
    console.error(error);
    await bootSequence();
  }
})();
