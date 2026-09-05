// jesseos v0.3 - Deep Engine (Commit 2/3)

// === CONFIG ===
const CONFIG = {
  presence: { thinkingCursor: true, variableTyping: true, pauseResume: true, mobileTerminal: true },
  engine: { markovOrder: 3, motifs: true, memoryTransforms: true, noveltyGuard: true },
  empathy: { toneDirector: true, practicalMode: true, gentleMode: true, safetyOverride: true, climateCommands: true }
};

// === PRESENCE LAYER ===
class PresenceLayer {
  constructor() {
    this.thinkingCursor = CONFIG.presence.thinkingCursor;
    this.variableTyping = CONFIG.presence.variableTyping;
    this.paused = false;
    this.mobileTerminal = CONFIG.presence.mobileTerminal;
  }
  init() {
    if (this.thinkingCursor) this.setupThinkingCursor();
    if (this.mobileTerminal) this.setupMobileTerminal();
  }
  setupThinkingCursor() {
    document.body.style.cursor = 'progress';
    setTimeout(() => document.body.style.cursor = 'default', 300);
  }
  setupMobileTerminal() {
    const term = document.getElementById('terminal');
    if (term) { term.style.fontSize = '14px'; term.style.padding = '8px'; }
  }
  typeWithPresence(text, element) {
    if (!this.variableTyping) { element.textContent = text; return; }
    let i = 0;
    const type = () => {
      if (this.paused) return;
      element.textContent += text.charAt(i++);
      if (i < text.length) setTimeout(type, 20 + Math.random() * 30);
    };
    type();
  }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
}

// === DEEP ENGINE ===
class DeepEngine {
  constructor() {
    this.order = CONFIG.engine.markovOrder;
    this.motifs = CONFIG.engine.motifs;
    this.memory = [];
    this.noveltyGuard = CONFIG.engine.noveltyGuard;
    this.model = {};
  }

  train(corpus) {
    this.model = {};
    for (let i = 0; i <= corpus.length - this.order; i++) {
      const state = corpus.slice(i, i + this.order).join(' ');
      const next = corpus[i + this.order];
      if (!this.model[state]) this.model[state] = [];
      this.model[state].push(next);
    }
  }

  generate(seed, length = 50) {
    let state = seed.split(' ');
    let output = [...state];
    for (let i = 0; i < length; i++) {
      const key = output.slice(-this.order).join(' ');
      const options = this.model[key] || ['...'];
      const next = options[Math.floor(Math.random() * options.length)];
      output.push(next);
    }
    return output.join(' ');
  }

  applyMotifs(text) {
    if (!this.motifs) return text;
    const motifs = ['echo', 'spiral', 'mirror'];
    const m = motifs[Math.floor(Math.random() * motifs.length)];
    if (m === 'echo') return text + ' → ' + text.split(' ').reverse().join(' ');
    if (m === 'spiral') return text.split(' ').map((w,i) => w.repeat(i%3+1)).join(' ');
    if (m === 'mirror') return text + ' | ' + text;
    return text;
  }

  transformMemory(input) {
    if (!CONFIG.engine.memoryTransforms) return input;
    this.memory.push(input);
    if (this.memory.length > 10) this.memory.shift();
    return input.toLowerCase().replace(/\b(i|me|my)\b/g, 'we');
  }

  checkNovelty(text) {
    if (!this.noveltyGuard) return true;
    const seen = this.memory.some(m => m.includes(text));
    return !seen;
  }
}

// === EMPATHY LAYER (stub for Commit 3/3) ===
class EmpathyLayer {
  constructor() {
    this.toneDirector = CONFIG.empathy.toneDirector;
    this.practicalMode = CONFIG.empathy.practicalMode;
    this.gentleMode = CONFIG.empathy.gentleMode;
    this.safetyOverride = CONFIG.empathy.safetyOverride;
    this.climateCommands = CONFIG.empathy.climateCommands;
  }
  adjustTone(text, mood) { return text; }
  safetyFilter(text) { return text; }
  climateCommand(cmd) { return ''; }
}

// === MAIN ===
const presence = new PresenceLayer();
const engine = new DeepEngine();
const empathy = new EmpathyLayer();

presence.init();

function jesseos(input, mood = 'neutral') {
  const safe = empathy.safetyFilter(input);
  const transformed = engine.transformMemory(safe);
  const generated = engine.generate(transformed, 30);
  const motivated = engine.applyMotifs(generated);
  const toned = empathy.adjustTone(motivated, mood);
  return toned;
}

window.jesseos = jesseos;
window.PresenceLayer = PresenceLayer;
window.DeepEngine = DeepEngine;
window.EmpathyLayer = EmpathyLayer;
