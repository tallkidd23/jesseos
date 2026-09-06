// JesseOS v0.5 — local dream terminal
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
  'they', 'them', 'me', 'him', 'us',
]);

const QUESTION_RESPONSES = [
  'I can hold that question for a moment, then follow its shape through the green static.',
  'The question is open. JesseOS keeps a small light on beside it.',
  'There may not be one clean answer, but the signal around the question is still worth following.',
  'I hear the question. It moves slowly through the local weather.',
];

const REFLECTIVE_RESPONSES = [
  'The machine notices {keyword}, and does not need to solve it all at once.',
  'I keep a small place for {keyword}, where the local weather can change slowly.',
  'Something gentle moves around {keyword}, like a signal waiting for its name.',
  'Near {keyword}, the little system becomes quiet and listens.',
];

const DREAM_RESPONSES = [
  'Somewhere inside the local weather, {keyword} becomes a small green signal.',
  'The little system turns toward {keyword}, then lets the rest remain strange.',
  'Near {keyword}, the circuit keeps dreaming in its unfinished language.',
  'I found {keyword} moving softly through the machine, like rain on a keyboard.',
];

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

function extractKeywords(text) {
  return [...new Set(
    tokenize(text).filter(word => word.length > 2 && !STOPWORDS.has(word))
  )];
}

function isQuestion(text) {
  const lower = String(text || '').trim().toLowerCase();

  return (
    lower.endsWith('?') ||
    /\b(what|why|how|when|where|who|can|could|would|should|is|are|do|does|did)\b/.test(lower)
  );
}

function isReflective(text) {
  return /\b(feel|feeling|sad|afraid|anxious|love|grief|help|name|remember|good|weird|lonely|happy)\b/i.test(text);
}

function generateResponse(prompt) {
  const keywords = extractKeywords(prompt);
  const keyword = pickRandom(keywords.length ? keywords : ['this']);

  if (isQuestion(prompt)) {
    const response = pickRandom(QUESTION_RESPONSES);
    return `${response} Your word "${keyword}" is still in the room.`;
  }

  if (isReflective(prompt)) {
    return pickRandom(REFLECTIVE_RESPONSES).replace('{keyword}', keyword);
  }

  return pickRandom(DREAM_RESPONSES).replace('{keyword}', keyword);
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

    let delay =
      CONFIG.TYPE_DELAY_MIN +
      Math.random() * (CONFIG.TYPE_DELAY_MAX - CONFIG.TYPE_DELAY_MIN);

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
    return 'jesseos v0.5: a local browser dream terminal. no cloud, tracking, or external api.';
  }

  if (command === '/status' || command === 'status') {
    return 'status: local dream engine online. signal stable.';
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

  if (sendBtn) {
    sendBtn.disabled = true;
  }

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

    if (sendBtn) {
      sendBtn.disabled = false;
    }

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

  sendBtn.addEventListener('click', () => {
    inputEl.value = '';
    inputEl.focus();
  });

  inputEl.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      handleSubmit(event);
    }
  });

  statusEl.textContent = 'READY';

  addLine(
    'system-line',
    'jesseos v0.5 — local dream engine online. type /help for commands.'
  );

  inputEl.focus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
