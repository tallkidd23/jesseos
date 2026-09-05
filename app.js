// JesseOS v0.4 - Free-association dream engine
// Local-only, no network calls, no tracking, no secrets

// ============ Configuration ============
const CONFIG = {
  CORPUS_SIZE_TARGET: 150,
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

// ============ DOM Elements ============
let transcriptEl, inputEl, sendBtn, statusEl, cursorEl;

// ============ State ============
let markov1 = {}; // 1-gram
let markov2 = {}; // 2-gram
let markov3 = {}; // 3-gram
let isGenerating = false;
let pauseResumeState = { paused: false, resumeAfter: null };

// ============ Utilities ============
function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s\'\-]/g, '').split(/\s+/).filter(w => w.length > 0);
}

function extractKeywords(text) {
  const stopwords = new Set(['i','am','a','an','the','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','shall','can','need','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','above','below','between','under','again','further','then','once','here','there','when','where','why','how','all','each','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','just','also','now','and','but','or','if','because','until','while','although','though','since','unless','lest','whether','what','which','who','whom','whose','this','that','these','those','it','its','my','your','his','her','their','our','we','you','he','she','they','them','me','him','us']);
  return tokenize(text).filter(w => !stopwords.has(w) && w.length > 2);
}

function sentenceSplit(text) {
  return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
}

function pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted(transitions) {
  if (!transitions || transitions.length === 0) return null;
  const total = transitions.reduce((sum, t) => sum + (t.weight || 1), 0);
  let r = Math.random() * total;
  for (const t of transitions) {
    r -= (t.weight || 1);
    if (r <= 0) return t.word || t;
  }
  return transitions[transitions.length - 1].word || transitions[transitions.length - 1];
}

// ============ Markov Training ============
function trainMultiOrder(corpus) {
  markov1 = {};
  markov2 = {};
  markov3 = {};
  
  for (const sentence of corpus) {
    const tokens = tokenize(sentence);
    if (tokens.length === 0) continue;
    
    // 1-gram
    for (const token of tokens) {
      if (!markov1[token]) markov1[token] = [];
      markov1[token].push(token);
    }
    
    // 2-gram and 3-gram
    for (let i = 0; i < tokens.length; i++) {
      // 2-gram: state = tokens[i], next = tokens[i+1]
      if (i + 1 < tokens.length) {
        const state2 = tokens[i];
        const next = tokens[i + 1];
        if (!markov2[state2]) markov2[state2] = [];
        markov2[state2].push(next);
      }
      
      // 3-gram: state = tokens[i] + tokens[i+1], next = tokens[i+2]
      if (i + 2 < tokens.length) {
        const state3 = tokens[i] + ' ' + tokens[i + 1];
        const next = tokens[i + 2];
        if (!markov3[state3]) markov3[state3] = [];
        markov3[state3].push(next);
      }
    }
  }
}

// ============ Generation ============
function generatePromptSeeded(prompt, mode = 'neutral') {
  const keywords = extractKeywords(prompt);
  const allTokens = Object.keys(markov1);
  
  if (allTokens.length === 0) {
    return "i am still learning, please talk to me more";
  }
  
  // Try to start from a keyword
  let startToken = null;
  if (keywords.length > 0) {
    for (const kw of keywords) {
      if (markov2[kw] && markov2[kw].length > 0) {
        startToken = kw;
        break;
      }
    }
  }
  
  // Fallback: pick random token that has 2-gram transitions
  if (!startToken) {
    const candidates = Object.keys(markov2).filter(k => markov2[k] && markov2[k].length > 0);
    startToken = pickRandom(candidates) || pickRandom(allTokens);
  }
  
  if (!startToken) {
    return "i am dreaming quietly today";
  }
  
  let currentToken = startToken;
  let sentence = currentToken.charAt(0).toUpperCase() + currentToken.slice(1);
  let sentenceCount = 0;
  let wordsSincePunctuation = 0;
  
  while (sentenceCount < CONFIG.MAX_RESPONSE_SENTENCES) {
    // Associative jump
    if (Math.random() < CONFIG.ASSOCIATIVE_JUMP_PROBABILITY && keywords.length > 0) {
      const jumpKeyword = pickRandom(keywords);
      if (markov2[jumpKeyword] && markov2[jumpKeyword].length > 0) {
        currentToken = jumpKeyword;
      }
    }
    
    // Try 3-gram first (need previous token too)
    let nextWord = null;
    
    // We need to track previous token for 3-gram, but for simplicity use 2-gram with 3-gram fallback
    // Simplified: use 3-gram if we can construct a state, else 2-gram, else 1-gram
    const sentenceTokens = tokenize(sentence);
    if (sentenceTokens.length >= 2) {
      const state3 = sentenceTokens[sentenceTokens.length - 2] + ' ' + sentenceTokens[sentenceTokens.length - 1];
      if (markov3[state3] && markov3[state3].length > 0) {
        nextWord = pickRandom(markov3[state3]);
      }
    }
    
    // Fallback to 2-gram
    if (!nextWord && markov2[currentToken] && markov2[currentToken].length > 0) {
      nextWord = pickRandom(markov2[currentToken]);
    }
    
    // Fallback to 1-gram
    if (!nextWord && allTokens.length > 0) {
      nextWord = pickRandom(allTokens);
    }
    
    if (!nextWord) break;
    
    sentence += ' ' + nextWord;
    currentToken = nextWord;
    wordsSincePunctuation++;
    
    // End sentence after 8-15 words or if we hit natural punctuation in corpus (simplified: force period)
    if (wordsSincePunctuation >= 8 + Math.floor(Math.random() * 7)) {
      sentence = sentence.replace(/[.!?]+$/, '') + '.';
      sentenceCount++;
      wordsSincePunctuation = 0;
      
      if (sentenceCount >= CONFIG.MIN_RESPONSE_SENTENCES) {
        // Small chance to end early
        if (Math.random() > 0.6) break;
      }
    }
  }
  
  // Ensure we have at least one sentence
  if (sentenceCount === 0) {
    sentence = sentence.replace(/[.!?]+$/, '') + '.';
  }
  
  return sentence;
}

// ============ Memory (IndexedDB) ============
const DB_NAME = 'jesseos-memory';
const DB_VERSION = 1;
const STORE_NAME = 'exchanges';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveExchange(prompt, response) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.add({ prompt, response, timestamp: Date.now() });
    tx.oncomplete = () => pruneMemory();
  } catch (e) {
    console.warn('Failed to save memory', e);
  }
}

async function getRecentExchanges(limit = CONFIG.MEMORY_EXCHANGE_LIMIT) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const all = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return all.slice(-limit);
  } catch (e) {
    console.warn('Failed to load memory', e);
    return [];
  }
}

async function pruneMemory() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const all = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    if (all.length > CONFIG.MEMORY_EXCHANGE_LIMIT * 2) {
      const toDelete = all.slice(0, all.length - CONFIG.MEMORY_EXCHANGE_LIMIT);
      for (const item of toDelete) {
        store.delete(item.id);
      }
    }
  } catch (e) {
    console.warn('Failed to prune memory', e);
  }
}

async function clearMemory() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = resolve;
      req.onerror = reject;
    });
  } catch (e) {
    console.warn('Failed to clear memory', e);
  }
}

async function exportMemory() {
  const exchanges = await getRecentExchanges(9999);
  return JSON.stringify(exchanges, null, 2);
}

async function importMemory(json) {
  try {
    const exchanges = JSON.parse(json);
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const ex of exchanges) {
      store.add({ prompt: ex.prompt, response: ex.response, timestamp: ex.timestamp || Date.now() });
    }
  } catch (e) {
    console.warn('Failed to import memory', e);
  }
}

// ============ Response Generation ============
async function createResponse(prompt) {
  const mode = 'neutral'; // could be extended for tone modes
  
  // Get recent memory for context (not used in generation yet, but available)
  const recent = await getRecentExchanges(10);
  
  // Generate using prompt-seeded Markov
  let body = generatePromptSeeded(prompt, mode);
  
  // Optional: add a memory echo if there are pinned/recent items
  // (simplified: just use the generated body for now)
  
  return body;
}

// ============ Typing Animation ============
async function typeResponse(text) {
  const responseLine = document.createElement('div');
  responseLine.className = 'response-line';
  transcriptEl.appendChild(responseLine);
  
  let buffer = '';
  const tokens = text.split('');
  
  for (let i = 0; i < tokens.length; i++) {
    if (pauseResumeState.paused) {
      await new Promise(r => {
        pauseResumeState.resumeAfter = r;
      });
    }
    
    const char = tokens[i];
    buffer += char;
    
    // Backspace effect (2% chance, only within current response)
    if (Math.random() < CONFIG.BACKSPACE_PROBABILITY && buffer.length > 3 && i < tokens.length - 1) {
      buffer = buffer.slice(0, -1);
      responseLine.textContent = buffer;
      await new Promise(r => setTimeout(r, 80));
      buffer += char;
    }
    
    responseLine.textContent = buffer;
    
    // Variable delay with punctuation pauses
    let delay = CONFIG.TYPE_DELAY_MIN + Math.random() * (CONFIG.TYPE_DELAY_MAX - CONFIG.TYPE_DELAY_MIN);
    if (char === '.' || char === '!' || char === '?') {
      delay += CONFIG.PUNCTUATION_PAUSE_END;
    } else if (char === ',' || char === ';' || char === ':') {
      delay += CONFIG.PUNCTUATION_PAUSE_BASE;
    }
    
    await new Promise(r => setTimeout(r, delay));
  }
  
  // Scroll to bottom
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

// ============ Command Handling ============
async function handleCommand(cmd) {
  const c = cmd.trim().toLowerCase();
  
  if (c === '/help' || c === 'help') {
    return 'commands: /help, /about, /memory, /clear, /export, /import, /status';
  }
  if (c === '/about' || c === 'about') {
    return 'jesseos v0.4 - a local dream engine running entirely in your browser, no tracking, no cloud';
  }
  if (c === '/status' || c === 'status') {
    const s1 = Object.keys(markov1).length;
    const s2 = Object.keys(markov2).length;
    const s3 = Object.keys(markov3).length;
    return `model: ${s1} 1-grams, ${s2} 2-grams, ${s3} 3-grams | corpus: ${window.JESSEOS_CORPUS ? window.JESSEOS_CORPUS.length : 0} sentences`;
  }
  if (c === '/memory' || c === 'memory') {
    const exs = await getRecentExchanges(5);
    if (exs.length === 0) return 'no memories yet';
    return 'recent: ' + exs.map(e => e.prompt.slice(0, 30)).join(' | ');
  }
  if (c === '/clear' || c === 'clear') {
    await clearMemory();
    return 'memory cleared';
  }
  if (c.startsWith('/export')) {
    const data = await exportMemory();
    return 'exported ' + data.length + ' bytes (check console)';
  }
  if (c.startsWith('/import')) {
    return 'paste json after /import to load';
  }
  
  return null;
}

// ============ Main Loop ============
async function handleSubmit() {
  const prompt = inputEl.value.trim();
  if (!prompt || isGenerating) return;
  
  isGenerating = true;
  statusEl.textContent = 'THINKING...';
  
  // Add user message
  const userLine = document.createElement('div');
  userLine.className = 'user-line';
  userLine.textContent = '> ' + prompt;
  transcriptEl.appendChild(userLine);
  
  inputEl.value = '';
  inputEl.disabled = true;
  
  // Check for commands
  const cmdResponse = await handleCommand(prompt);
  let response;
  
  if (cmdResponse) {
    response = cmdResponse;
  } else {
    // Train on corpus + recent memory
    const recent = await getRecentExchanges(CONFIG.MEMORY_EXCHANGE_LIMIT);
    const memorySentences = recent.flatMap(e => sentenceSplit(e.prompt + ' ' + e.response));
    const fullCorpus = (window.JESSEOS_CORPUS || []).concat(memorySentences);
    trainMultiOrder(fullCorpus);
    
    response = await createResponse(prompt);
    await saveExchange(prompt, response);
  }
  
  statusEl.textContent = 'READY';
  inputEl.disabled = false;
  inputEl.focus();
  
  await typeResponse(response);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
  
  isGenerating = false;
}

// ============ Pause/Resume ============
function togglePause() {
  if (pauseResumeState.paused) {
    pauseResumeState.paused = false;
    if (pauseResumeState.resumeAfter) {
      pauseResumeState.resumeAfter();
      pauseResumeState.resumeAfter = null;
    }
    statusEl.textContent = 'READY';
  } else {
    pauseResumeState.paused = true;
    statusEl.textContent = 'PAUSED';
  }
}

// ============ Initialization ============
function init() {
  transcriptEl = document.getElementById('transcript');
  inputEl = document.getElementById('input');
  sendBtn = document.getElementById('send');
  statusEl = document.getElementById('status');
  cursorEl = document.getElementById('cursor');
  
  sendBtn.addEventListener('click', handleSubmit);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSubmit();
  });
  
  // Initial training on corpus
  if (window.JESSEOS_CORPUS) {
    trainMultiOrder(window.JESSEOS_CORPUS);
  }
  
  statusEl.textContent = 'READY';
  
  // Welcome message
  const welcome = document.createElement('div');
  welcome.className = 'system-line';
  welcome.textContent = 'jesseos v0.4 - type /help for commands';
  transcriptEl.appendChild(welcome);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

// Start when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
