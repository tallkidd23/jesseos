// jesseos v0.3 - 8 Markov Chains (Commit 5/3)

// === CONFIG ===
const CONFIG = {
  presence: { thinkingCursor: true, variableTyping: true, pauseResume: true, mobileTerminal: true },
  engine: { markovOrder: 3, motifs: true, memoryTransforms: true, noveltyGuard: true, chainCount: 8 },
  empathy: { toneDirector: true, practicalMode: true, gentleMode: true, safetyOverride: true, climateCommands: true }
};

// === PRESENCE LAYER ===
class PresenceLayer {
  constructor() {
    this.thinkingCursor = CONFIG.presence.thinkingCursor;
    this.variableTyping = CONFIG.presence.variableTyping;
    this.paused = false;
    this.mobileTerminal = CONFIG.presence.mobileTerminal;
    this.isWaiting = false;
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
  showWaitingCursor(show = true) {
    this.isWaiting = show;
    document.body.style.cursor = show ? 'wait' : 'default';
  }
  typeWithPresence(text, element) {
    if (!this.variableTyping) { element.textContent = text; return; }
    let i = 0;
    let backspaceChance = 0.02;
    let lastWasBackspace = false;
    const type = () => {
      if (this.paused) return;
      if (!lastWasBackspace && Math.random() < backspaceChance && element.textContent.length > 0) {
        element.textContent = element.textContent.slice(0, -1);
        lastWasBackspace = true;
        setTimeout(type, 50 + Math.random() * 50);
        return;
      }
      lastWasBackspace = false;
      if (i < text.length) {
        element.textContent += text.charAt(i++);
        let pause = 20 + Math.random() * 30;
        if (text.charAt(i-1) === '.' || text.charAt(i-1) === '!' || text.charAt(i-1) === '?') pause += 150;
        else if (text.charAt(i-1) === ',') pause += 80;
        setTimeout(type, pause);
      }
    };
    type();
  }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
}

// === DEEP ENGINE - 8 MARKOV CHAINS ===
class DeepEngine {
  constructor() {
    this.order = CONFIG.engine.markovOrder;
    this.motifs = CONFIG.engine.motifs;
    this.memory = [];
    this.noveltyGuard = CONFIG.engine.noveltyGuard;
    this.chains = {};
  }

  // 1. Word-level Markov (standard n-gram)
  trainWordLevel(corpus) {
    this.chains.word = {};
    for (let i = 0; i <= corpus.length - this.order; i++) {
      const state = corpus.slice(i, i + this.order).join(' ');
      const next = corpus[i + this.order];
      if (!this.chains.word[state]) this.chains.word[state] = [];
      this.chains.word[state].push(next);
    }
  }

  // 2. Character-level Markov (fine texture)
  trainCharLevel(text) {
    this.chains.char = {};
    for (let i = 0; i <= text.length - this.order; i++) {
      const state = text.slice(i, i + this.order);
      const next = text[i + this.order];
      if (!this.chains.char[state]) this.chains.char[state] = [];
      this.chains.char[state].push(next);
    }
  }

  // 3. Phrase-level Markov (larger chunks)
  trainPhraseLevel(corpus) {
    this.chains.phrase = {};
    const phrases = [];
    let current = [];
    for (const word of corpus) {
      current.push(word);
      if (word.match(/[.!?]$/)) {
        phrases.push(current.join(' '));
        current = [];
      }
    }
    for (let i = 0; i < phrases.length - 1; i++) {
      const key = phrases[i];
      if (!this.chains.phrase[key]) this.chains.phrase[key] = [];
      this.chains.phrase[key].push(phrases[i + 1]);
    }
  }

  // 4. Semantic Markov (topic-aware via keyword clusters)
  trainSemantic(corpus) {
    this.chains.semantic = { topics: {}, transitions: {} };
    const topics = ['tech', 'emotion', 'nature', 'abstract', 'action'];
    const topicWords = {
      tech: ['code', 'system', 'data', 'network', 'digital', 'ai', 'engine'],
      emotion: ['feel', 'heart', 'mind', 'dream', 'soul', 'love', 'fear'],
      nature: ['tree', 'river', 'sky', 'earth', 'wind', 'star', 'ocean'],
      abstract: ['being', 'become', 'exist', 'void', 'infinite', 'cycle'],
      action: ['run', 'build', 'create', 'move', 'change', 'flow', 'rise']
    };
    let currentTopic = 'abstract';
    for (const word of corpus) {
      const w = word.toLowerCase();
      for (const t of topics) {
        if (topicWords[t].some(kw => w.includes(kw))) currentTopic = t;
      }
      if (!this.chains.semantic.topics[currentTopic]) this.chains.semantic.topics[currentTopic] = [];
      this.chains.semantic.topics[currentTopic].push(w);
      this.chains.semantic.transitions[w] = currentTopic;
    }
  }

  // 5. Rhythmic Markov (meter/prosody-aware)
  trainRhythmic(corpus) {
    this.chains.rhythmic = { stressed: {}, unstressed: {}, mixed: {} };
    const vowels = 'aeiou';
    for (let i = 0; i < corpus.length - 1; i++) {
      const word = corpus[i];
      const vowelCount = word.toLowerCase().split('').filter(c => vowels.includes(c)).length;
      const next = corpus[i + 1];
      let bucket = vowelCount >= 2 ? 'stressed' : vowelCount === 1 ? 'unstressed' : 'mixed';
      if (!this.chains.rhythmic[bucket]) this.chains.rhythmic[bucket] = [];
      this.chains.rhythmic[bucket].push(next);
    }
  }

  // 6. Emotional Markov (mood-conditioned)
  trainEmotional(corpus) {
    this.chains.emotional = { positive: [], neutral: [], negative: [] };
    const posWords = ['light', 'warm', 'soft', 'gentle', 'bright', 'hope', 'love', 'peace'];
    const negWords = ['dark', 'cold', 'hard', 'sharp', 'void', 'fear', 'pain', 'loss'];
    let mood = 'neutral';
    for (const word of corpus) {
      const w = word.toLowerCase();
      if (posWords.some(p => w.includes(p))) mood = 'positive';
      else if (negWords.some(n => w.includes(n))) mood = 'negative';
      this.chains.emotional[mood].push(w);
    }
  }

  // 7. Memory-weighted Markov (recency-biased)
  trainMemoryWeighted(corpus) {
    this.chains.memory = {};
    const weights = {};
    for (let i = 0; i <= corpus.length - this.order; i++) {
      const state = corpus.slice(i, i + this.order).join(' ');
      const next = corpus[i + this.order];
      if (!this.chains.memory[state]) this.chains.memory[state] = [];
      if (!weights[state]) weights[state] = {};
      const weight = 1 + (corpus.length - i) / corpus.length;
      this.chains.memory[state].push(next);
      weights[state][next] = (weights[state][next] || 0) + weight;
    }
    this.memoryWeights = weights;
  }

  // 8. Dream/Hallucination Markov (creative interpolation)
  trainDream(corpus) {
    this.chains.dream = {};
    for (let i = 0; i <= corpus.length - this.order; i++) {
      const state = corpus.slice(i, i + this.order).join(' ');
      const next = corpus[i + this.order];
      if (!this.chains.dream[state]) this.chains.dream[state] = [];
      this.chains.dream[state].push(next);
      if (Math.random() < 0.1) {
        const hallucinated = corpus[Math.floor(Math.random() * corpus.length)];
        this.chains.dream[state].push(hallucinated);
      }
    }
  }

  // Master train function
  train(corpus) {
    this.trainWordLevel(corpus);
    this.trainCharLevel(corpus.join(' '));
    this.trainPhraseLevel(corpus);
    this.trainSemantic(corpus);
    this.trainRhythmic(corpus);
    this.trainEmotional(corpus);
    this.trainMemoryWeighted(corpus);
    this.trainDream(corpus);
  }

  // Generate from specific chain
  generateFrom(chainName, seed, length = 30) {
    const chain = this.chains[chainName];
    if (!chain) return seed;
    let state = seed.split(' ').slice(-this.order);
    let output = [...state];
    for (let i = 0; i < length; i++) {
      const key = state.join(' ');
      const options = chain[key] || ['...'];
      const next = options[Math.floor(Math.random() * options.length)];
      output.push(next);
      state = output.slice(-this.order);
    }
    return output.join(' ');
  }

  // Blended generation (uses all 8 chains)
  generate(seed, length = 50) {
    const outputs = [];
    const weights = { word: 1.0, char: 0.3, phrase: 0.7, semantic: 0.5, rhythmic: 0.4, emotional: 0.6, memory: 0.8, dream: 0.9 };
    for (const [name, weight] of Object.entries(weights)) {
      const out = this.generateFrom(name, seed, Math.floor(length * weight));
      outputs.push({ name, text: out, weight });
    }
    let blended = '';
    const segments = 4;
    for (let i = 0; i < segments; i++) {
      const chain = outputs[Math.floor(Math.random() * outputs.length)];
      const words = chain.text.split(' ');
      const segment = words.slice(i * 10, (i + 1) * 10).join(' ');
      blended += (blended ? ' ' : '') + segment;
    }
    return blended;
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

// === EMPATHY LAYER ===
class EmpathyLayer {
  constructor() {
    this.toneDirector = CONFIG.empathy.toneDirector;
    this.practicalMode = CONFIG.empathy.practicalMode;
    this.gentleMode = CONFIG.empathy.gentleMode;
    this.safetyOverride = CONFIG.empathy.safetyOverride;
    this.climateCommands = CONFIG.empathy.climateCommands;
  }
  adjustTone(text, mood = 'neutral') {
    if (!this.toneDirector) return text;
    const tones = {
      practical: { prefix: '→ ', suffix: ' [actionable]' },
      gentle: { prefix: '💛 ', suffix: ' [soft]' },
      neutral: { prefix: '', suffix: '' }
    };
    const t = tones[mood] || tones.neutral;
    return t.prefix + text + t.suffix;
  }
  safetyFilter(text) {
    if (!this.safetyOverride) return text;
    const blocked = ['harm', 'danger', 'illegal'];
    if (blocked.some(b => text.toLowerCase().includes(b))) {
      return 'I care about your safety. Let\'s find a constructive path.';
    }
    return text;
  }
  climateCommand(cmd) {
    if (!this.climateCommands) return '';
    const cmds = {
      'climate warm': '🌡️ Temperature increased',
      'climate cool': '❄️ Temperature decreased',
      'climate reset': '🔄 Climate reset to default'
    };
    return cmds[cmd] || 'Unknown climate command';
  }
}

// === MAIN ===
const presence = new PresenceLayer();
const engine = new DeepEngine();
const empathy = new EmpathyLayer();

presence.init();

function jesseos(input, mood = 'neutral') {
  presence.showWaitingCursor(true);
  const safe = empathy.safetyFilter(input);
  const transformed = engine.transformMemory(safe);
  const generated = engine.generate(transformed, 30);
  const motivated = engine.applyMotifs(generated);
  const toned = empathy.adjustTone(motivated, mood);
  presence.showWaitingCursor(false);
  return toned;
}

window.jesseos = jesseos;
window.PresenceLayer = PresenceLayer;
window.DeepEngine = DeepEngine;
window.EmpathyLayer = EmpathyLayer;
