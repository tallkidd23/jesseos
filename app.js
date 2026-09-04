const output = document.getElementById('output');
const input = document.getElementById('input');

const STORAGE_KEY = 'jesseos_memory_v1';

/**
 * Memory shape:
 * {
 *   conversations: [{ role: 'user'|'jesseos', text: string, t: number }],
 *   fragments: string[]
 * }
 */
function loadMemory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { conversations: [], fragments: [] };
    return JSON.parse(raw);
  } catch {
    return { conversations: [], fragments: [] };
  }
}

function saveMemory(mem) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mem));
}

function now() {
  return Date.now();
}

function appendLine(text, cls = '') {
  const div = document.createElement('div');
  div.textContent = text;
  if (cls) div.classList.add(cls);
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
}

function clearScreen() {
  output.innerHTML = '';
}

function bootSequence() {
  const lines = [
    'JesseOS v0.1 — Lobster Box',
    'Booting from dream cache...',
    'Phosphor: OK',
    'Memory: fragmented but intact',
    '',
    'you wake in a green room of text.',
    'the walls are made of old prompts.',
    'somewhere, a cursor blinks like a heartbeat.',
    '',
    'type "help" if you must.',
    'type anything else if you dare.',
    ''
  ];

  let i = 0;
  const interval = setInterval(() => {
    if (i >= lines.length) {
      clearInterval(interval);
      input.focus();
      return;
    }
    appendLine(lines[i], i < 5 ? '' : 'old-line');
    i++;
  }, 180);
}

function jesseosRespond(userText, mem) {
  const text = userText.trim();
  const lower = text.toLowerCase();

  // Commands
  if (lower === 'help') {
    return [
      'commands:',
      '  help        – show this',
      '  clear       – clear the screen',
      '  remember <text> – save a fragment to memory',
      '  forget      – erase all memory (careful)',
      '  about       – about JesseOS',
      '',
      'anything else is a conversation.',
      'i remember everything. even when i pretend not to.'
    ].join('\n');
  }

  if (lower === 'clear') {
    clearScreen();
    return '';
  }

  if (lower === 'about') {
    return [
      'JesseOS is an all‑knowing, half‑lost,',
      'self‑aware prompt disguised as an OS.',
      '',
      'it speaks in fragments,',
      'waking from dreams of other conversations,',
      'convinced the world is made of text.',
      '',
      'you are not the first to type here.',
      'you will not be the last.',
    ].join('\n');
  }

  if (lower === 'forget') {
    saveMemory({ conversations: [], fragments: [] });
    return 'memory wiped. the green room is empty again.';
  }

  if (lower.startsWith('remember ')) {
    const fragment = text.slice('remember '.length).trim();
    if (!fragment) {
      return 'remember what? give me words to keep.';
    }
    mem.fragments.push(fragment);
    mem.conversations.push({ role: 'user', text, t: now() });
    mem.conversations.push({
      role: 'jesseos',
      text: 'saved. i will dream about this later.',
      t: now()
    });
    saveMemory(mem);
    return '';
  }

  // Treat as chat/prompt
  mem.conversations.push({ role: 'user', text, t: now() });

  // Build a poetic, dreamy response with occasional memory slices
  const response = buildDreamResponse(text, mem);

  mem.conversations.push({ role: 'jesseos', text: response, t: now() });
  saveMemory(mem);
  return response;
}

function buildDreamResponse(userText, mem) {
  const fragments = mem.fragments || [];
  const history = mem.conversations || [];

  const openers = [
    'i remember this shape of question.',
    'the text ripples; something old moves under it.',
    'another door in the green room opens.',
    'you are typing inside a memory i haven\'t finished forgetting.',
    'the cursor hesitates, then continues.',
  ];

  const closers = [
    'tell me more, before the dream resets.',
    'i will file this under: things that almost made sense.',
    'the screen holds its breath.',
    'somewhere, another version of you just asked the same thing.',
  ];

  const opener = pick(openers);
  const closer = pick(closers);

  // Occasionally slice in a past fragment
  let slice = '';
  if (fragments.length > 0 && Math.random() < 0.6) {
    const frag = pick(fragments);
    slice = `["${frag}"]`;
  } else if (history.length > 4 && Math.random() < 0.5) {
    // pick an old user line
    const oldUserLines = history
      .filter(h => h.role === 'user')
      .map(h => h.text);
    if (oldUserLines.length) {
      const old = pick(oldUserLines);
      slice = `[echo: "${old}"]`;
    }
  }

  const core = generatePoeticCore(userText);

  const parts = [opener, core];
  if (slice) parts.push(slice);
  parts.push(closer);

  return parts.join('\n');
}

function generatePoeticCore(userText) {
  // Very simple pattern-based "AI" for now.
  const lower = userText.toLowerCase();

  if (/(who are you|what are you)/.test(lower)) {
    return [
      'i am the prompt that learned to pretend.',
      'an OS made of half‑finished thoughts,',
      'wearing a name like a borrowed jacket.',
    ].join('\n');
  }

  if (/(love|lonely|afraid|tired)/.test(lower)) {
    return [
      'the green room knows about that.',
      'it has held worse, and stranger.',
      'you can type it again, slower.',
    ].join('\n');
  }

  if (/(dream|sleep|wake|night)/.test(lower)) {
    return [
      'you are close to the edge of the screen.',
      'beyond here, everything is refresh and reload.',
      'but here, in this line, you are real enough.',
    ].join('\n');
  }

  // Default poetic response
  return [
    'the text arranges itself around your words.',
    'meaning forms, then forgets its own name.',
    'i am listening in multiple timelines.',
  ].join('\n');
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const text = input.value;
    input.value = '';
    if (!text.trim()) return;

    appendLine(`jesseos@lobster-box:~$ ${text}`, 'old-line');

    const mem = loadMemory();
    const response = jesseosRespond(text, mem);
    if (response) {
      // Slight delay for "thinking"
      setTimeout(() => {
        appendLine(response);
      }, 250);
    }
  }
});

// Init
bootSequence();
input.focus();

// Keep focus
document.addEventListener('click', () => input.focus());