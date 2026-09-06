// JesseOS v0.6 — local language-bank dream terminal
// Local-only. No network calls, tracking, or secrets.

const CONFIG = {
  TYPE_DELAY_MIN: 18,
  TYPE_DELAY_MAX: 42,
  PUNCTUATION_PAUSE_BASE: 70,
  PUNCTUATION_PAUSE_END: 130,
};

let transcriptEl;
let inputEl;
let sendBtn;
let statusEl;
let isGenerating = false;

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
    'the cursor keeps watch beside the unfinished sentence',
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
    'a green hallway opens behind the blinking cursor',
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
  'The cursor is still waiting, but it is not in a hurry.',
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

  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function handleCommand(value) {
  const command = value.trim().toLowerCase();

  if (command === '/help' || command === 'help') {
    return 'commands: /help, /about, /status, /clear';
  }

  if (command === '/about' || command === 'about') {
    return 'jesseos v0.6: a local language-bank dream terminal. no cloud, tracking, or external api.';
  }

  if (command === '/status' || command === 'status') {
    return 'status: local dream engine online. language banks loaded. signal stable.';
  }

  if (command === '/clear' || command === 'clear') {
    transcriptEl.innerHTML = '';
    return 'terminal cleared. the green room remains.';
  }

  return null;
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
    const commandReply = handleCommand(prompt);
    const response = commandReply || generateResponse(prompt);
    statusEl.textContent = 'READY';
    await typeResponse(response);
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

  if (!transcriptEl || !inputEl || !statusEl) {
    console.error('JesseOS markup mismatch.');
    return;
  }

  const form = document.getElementById('input-form');
  form.addEventListener('submit', handleSubmit);

  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      inputEl.value = '';
      inputEl.focus();
    });
  }

  inputEl.addEventListener('keydown', event => {
    if (event.key === 'Enter') handleSubmit(event);
  });

  statusEl.textContent = 'READY';
  addLine('system-line', 'jesseos v0.6 — language banks online. type /help for commands.');
  inputEl.focus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
