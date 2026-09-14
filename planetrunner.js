// PlanetRunner - Canvas adaptation of planet_runner196.py
// Controls: W/S or ↑/↓ to fly, D to boost, A to brake, R to restart, X to quit

(function() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const TITLE = 'PLANET RUNNER // W/S FLY D BOOST A BRAKE X QUIT';
  const SUN_CHARS = ' .:-=+*#%@';
  const SHIP_SPRITE = ['\\', '=>', '/'];
  const CRASH_CHARS = ['*', '+', 'x', '.'];

  const FPS_MS = 33;
  const SHIP_X_RATIO = 0.28;
  const GRAVITY = 0.004;
  const LIFT = 0.240;
  const MAX_VY = 1.40;
  const BASE_SPEED = 1.6;
  const BOOST_SPEED = 2.9;
  const BRAKE_SPEED = 0.75;
  const CRASH_TIME = 45;
  const SEED = 1337;
  const SAFE_START_COLS = 50;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // Simple seeded RNG
  function mulberry32(seed) {
    return function() {
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class ValueNoise1D {
    constructor(seed) {
      this.seed = seed;
      this.cache = {};
    }
    _rand(i) {
      if (!(i in this.cache)) {
        const rng = mulberry32(this.seed + i * 7919);
        this.cache[i] = rng() * 2 - 1;
      }
      return this.cache[i];
    }
    sample(x) {
      const i0 = Math.floor(x);
      let t = x - i0;
      t = t * t * (3 - 2 * t);
      return this._rand(i0) * (1 - t) + this._rand(i0 + 1) * t;
    }
    fractal(x, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
      let total = 0, amp = 1, freq = 1, norm = 0;
      for (let i = 0; i < octaves; i++) {
        total += this.sample(x * freq) * amp;
        norm += amp;
        amp *= persistence;
        freq *= lacunarity;
      }
      return norm ? total / norm : 0;
    }
  }

  class TerrainGenerator {
    constructor() {
      this.mtn_base = new ValueNoise1D(SEED + 20);
      this.mtn_detail = new ValueNoise1D(SEED + 24);
      this.mtn_spike = new ValueNoise1D(SEED + 28);
      this.veg_noise = new ValueNoise1D(SEED + 34);
      this.rock_noise = new ValueNoise1D(SEED + 40);
      this.ground_noise = new ValueNoise1D(SEED + 60);
      this.boulder_noise = new ValueNoise1D(SEED + 80);
      this.cloud_noise = new ValueNoise1D(SEED + 100);
      this.wisp_noise = new ValueNoise1D(SEED + 140);
    }

    mountain_top(worldX, h) {
      const base = this.mtn_base.fractal(worldX * 0.007, 4, 0.55);
      const detail = this.mtn_detail.fractal(worldX * 0.032, 3, 0.58);
      const spike = Math.abs(this.mtn_spike.fractal(worldX * 0.14 + 80, 3));
      const y = h * 0.52 + base * (h * 0.11) + detail * (h * 0.08) - spike * (h * 0.34);
      return Math.floor(clamp(y, 2, h - 10));
    }

    veg_top(worldX, h) {
      const n = this.veg_noise.fractal(worldX * 0.05, 4, 0.58);
      const jitter = this.veg_noise.fractal(worldX * 0.19 + 90, 2);
      return Math.floor(h * 0.67 + n * (h * 0.06) + jitter * 2);
    }

    rock_top(worldX, h) {
      const n = this.rock_noise.fractal(worldX * 0.08, 4, 0.55);
      return Math.floor(h * 0.80 + n * (h * 0.04));
    }

    ground_top(worldX, h) {
      const n = this.ground_noise.fractal(worldX * 0.10, 3, 0.55);
      return Math.floor(h * 0.91 + n * (h * 0.02));
    }

    boulder_here(worldX, xCol) {
      if (xCol < SAFE_START_COLS) return false;
      const n = this.boulder_noise.fractal(worldX * 0.11, 2);
      return n > 0.76;
    }

    boulder_size(worldX) {
      const n = Math.abs(this.boulder_noise.fractal(worldX * 0.25 + 50, 2));
      return 2 + Math.floor(n * 3);
    }

    boulder_y(worldX, h, groundTop) {
      const n = this.boulder_noise.fractal(worldX * 0.13 + 200, 3);
      const laneTop = Math.floor(h * 0.60);
      const laneBot = groundTop - 2;
      const t = (n + 1) / 2.0;
      return Math.floor(laneTop + t * Math.max(1, laneBot - laneTop));
    }

    cloud_here(worldX, y, h) {
      if (y > h * 0.28) return false;
      const n = this.cloud_noise.fractal(worldX * 0.03 + y * 0.4, 2);
      return n > 0.58;
    }
  }

  function drawSun(buf, width, height, scroll, sunMask) {
    const sunX = Math.floor(width * 0.72 + Math.sin(scroll * 0.010) * width * 0.08);
    const sunY = Math.floor(height * 0.12 + Math.sin(scroll * 0.003) + scroll * 0.002) + 4;
    const rx = 10, ry = 5;
    for (let y = Math.max(0, sunY - ry); y < Math.min(height, sunY + ry + 1); y++) {
      for (let x = Math.max(0, sunX - rx); x < Math.min(width, sunX + rx + 1); x++) {
        const nx = (x - sunX) / rx;
        const ny = (y - sunY) / ry;
        const rr = nx * nx + ny * ny;
        if (rr <= 1.0) {
          const v = clamp(1.0 - rr, 0.0, 0.999);
          const ch = SUN_CHARS[Math.floor(v * SUN_CHARS.length)];
          buf[y][x] = ch;
          sunMask.add(y + ',' + x + ',' + ch);
        }
      }
    }
  }

  function drawClouds(buf, width, height, gen, scroll) {
    for (let x = 0; x < width; x++) {
      const wx = scroll * 0.04 + x;
      for (let y = 0; y < Math.floor(height * 0.28); y++) {
        if (buf[y][x] === ' ' && gen.cloud_here(wx, y, height)) {
          buf[y][x] = '.';
        }
      }
    }
  }

  function drawMountains(buf, width, height, gen, scroll) {
    const tops = [];
    for (let x = 0; x < width; x++) {
      tops.push(clamp(gen.mountain_top(scroll * 0.33 + x, height), 2, height - 10));
    }
    for (let x = 1; x < width; x++) {
      const prev = tops[x - 1];
      let cur = tops[x];
      if (cur > prev + 2) cur = prev + 2;
      else if (cur < prev - 2) cur = prev - 2;
      tops[x] = cur;
    }
    const mountainBottom = Math.floor(height * 0.62);
    for (let x = 0; x < width; x++) {
      const top = tops[x];
      const ly = x > 0 ? tops[x - 1] : top;
      const ry = x < width - 1 ? tops[x + 1] : top;
      if (top < ly && top < ry) buf[top][x] = 'A';
      else if (top > ly && top > ry) buf[top][x] = 'V';
      else if (top < ly) buf[top][x] = '/';
      else if (top < ry) buf[top][x] = '\\';
      else buf[top][x] = '^';
      for (let y = top + 1; y < mountainBottom; y++) {
        buf[y][x] = ' ';
      }
    }
  }

  function drawAlienVegetation(buf, width, height, gen, scroll) {
    const tops = [];
    for (let x = 0; x < width; x++) {
      tops.push(gen.veg_top(scroll * 1.2375 + x, height));
    }
    for (let x = 0; x < width; x++) {
      const top = tops[x];
      const ly = x > 0 ? tops[x - 1] : top;
      const ry = x < width - 1 ? tops[x + 1] : top;
      let ch;
      if (top < ly && top < ry) ch = 'Y';
      else if (top < ly) ch = '/';
      else if (top < ry) ch = '\\';
      else ch = '|';
      buf[top][x] = ch;
      const depth = height - top - 6;
      for (let d = 1; d < Math.max(1, depth); d++) {
        const y = top + d;
        if (y >= height - 4) break;
        if (buf[y][x] === ' ') {
          if (d < 3 && x % 4 === 0) buf[y][x] = ':';
          else if (x % 3 === 0) buf[y][x] = '|';
        }
      }
    }
  }

  function drawRocksAndBoulders(buf, coll, width, height, gen, scroll) {
    for (let x = 0; x < width; x++) {
      const wx = scroll * 1.875 + x;
      const top = gen.rock_top(wx, height);
      let crest;
      const m = x % 7;
      if (m === 0 || m === 1) crest = '/';
      else if (m === 3 || m === 4) crest = '\\';
      else crest = '^';
      buf[top][x] = crest;
      if (top + 1 < height) buf[top + 1][x] = ',';
      if (gen.boulder_here(scroll * 1.875 + x, x)) {
        const size = gen.boulder_size(scroll * 1.875 + x);
        const cy = gen.boulder_y(scroll * 1.875 + x, height, top);
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const widthLimit = size - Math.abs(dx);
          for (let dy = -widthLimit; dy <= widthLimit; dy++) {
            const y = cy + dy;
            if (y < 0 || y >= height - 3) continue;
            const ch = Math.abs(dy) === widthLimit ? 'X' : '@';
            buf[y][xx] = ch;
            coll[y][xx] = true;
          }
        }
      }
    }
  }

  function drawGround(buf, coll, width, height, gen, scroll) {
    for (let x = 0; x < width; x++) {
      const wx = scroll + x;
      const top = gen.ground_top(wx, height);
      coll[top][x] = true;
      for (let y = top + 1; y < height; y++) {
        coll[y][x] = true;
      }
    }
  }

  function renderFrame(shipY, scroll, speed, crashed, gen, sparkHist, exhaustTrails, frameCount) {
    const w = canvas.width;
    const h = canvas.height;
    const buf = Array.from({ length: h }, () => Array(w).fill(' '));
    const coll = Array.from({ length: h }, () => Array(w).fill(false));

    const sunMask = new Set();
    drawSun(buf, w, h, scroll, sunMask);
    drawClouds(buf, w, h, gen, scroll);
    drawMountains(buf, w, h, gen, scroll);
    drawAlienVegetation(buf, w, h, gen, scroll);
    drawRocksAndBoulders(buf, coll, w, h, gen, scroll);
    drawGround(buf, coll, w, h, gen, scroll);

    const shipX = Math.max(8, Math.floor(w * SHIP_X_RATIO));
    const shipYi = clamp(Math.floor(shipY), 2, h - 4);

    const shipCells = [];
    for (let dy = 0; dy < SHIP_SPRITE.length; dy++) {
      const yy = shipYi - 1 + dy;
      const row = SHIP_SPRITE[dy];
      for (let dx = 0; dx < row.length; dx++) {
        const ch = row[dx];
        if (ch !== ' ') shipCells.push([shipX + dx, yy]);
      }
    }

    let hit = false;
    for (const [sx, sy] of shipCells) {
      if (sx >= 0 && sx < w && sy >= 0 && sy < h && coll[sy][sx]) {
        hit = true;
        break;
      }
    }

    if (!crashed) {
      if (frameCount % 2 === 0) {
        exhaustTrails.push({ y: shipYi, x: shipX - 3, life: Math.max(12, Math.floor(w / 2)), age: 0 });
      }
      for (const trail of exhaustTrails) {
        const y = Math.floor(trail.y);
        const x = Math.round(trail.x);
        if (x >= 0 && x < w && y >= 0 && y < h && buf[y][x] === ' ') {
          buf[y][x] = '.';
        }
      }
      for (let dy = 0; dy < SHIP_SPRITE.length; dy++) {
        const yy = shipYi - 1 + dy;
        if (yy < 0 || yy >= h) continue;
        const row = SHIP_SPRITE[dy];
        for (let dx = 0; dx < row.length; dx++) {
          const ch = row[dx];
          const sx = shipX + dx;
          if (ch !== ' ' && sx >= 0 && sx < w) {
            buf[yy][sx] = ch;
          }
        }
      }
    } else {
      for (let i = 0; i < sparkHist.length; i++) {
        const [sx, sy] = sparkHist[i];
        if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
          buf[sy][sx] = CRASH_CHARS[i % CRASH_CHARS.length];
        }
      }
    }

    // Draw to canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';

    for (let y = 0; y < h; y++) {
      let line = '';
      for (let x = 0; x < w; x++) {
        line += buf[y][x];
      }
      ctx.fillStyle = '#0f0';
      ctx.fillText(line, 0, y * 12);
    }

    // HUD
    ctx.fillStyle = '#0f0';
    ctx.fillText(TITLE, 10, 10);
    ctx.fillText(`SPD ${speed.toFixed(2)} DIST ${Math.floor(scroll).toString().padStart(7, '0')} ${crashed ? 'CRASHED' : 'FLYING'}`, 10, h - 40);
    ctx.fillText('Foreground plants now use per-column height logic, so some stalks can rise much higher on screen.', 10, h - 28);

    return hit;
  }

  // Game loop
  const gen = new TerrainGenerator();
  let shipY = canvas.height * 0.40;
  let vy = 0;
  let scroll = 0;
  let speed = BASE_SPEED;
  let crashed = false;
  let crashTimer = 0;
  const sparkHist = [];
  const exhaustTrails = [];
  let frameCount = 0;

  const keys = { up: false, down: false, boost: false, brake: false };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.up = true;
    if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') keys.down = true;
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') keys.boost = true;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') keys.brake = true;
    if (e.key === 'r' || e.key === 'R') restart();
    if (e.key === 'x' || e.key === 'X') quit();
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.up = false;
    if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') keys.down = false;
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') keys.boost = false;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') keys.brake = false;
  });

  // Touch controls
  document.querySelectorAll('.btn').forEach(btn => {
    const k = btn.dataset.key;
    const setKey = (pressed) => {
      if (k === 'up') keys.up = pressed;
      if (k === 'down') keys.down = pressed;
      if (k === 'boost') keys.boost = pressed;
      if (k === 'brake') keys.brake = pressed;
      if (k === 'restart' && pressed) restart();
      if (k === 'quit' && pressed) quit();
    };
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); setKey(true); });
    btn.addEventListener('pointerup', (e) => { e.preventDefault(); setKey(false); });
    btn.addEventListener('pointercancel', () => setKey(false));
    btn.addEventListener('pointerleave', () => setKey(false));
  });

  function restart() {
    shipY = canvas.height * 0.40;
    vy = 0;
    scroll = 0;
    speed = BASE_SPEED;
    crashed = false;
    crashTimer = 0;
    sparkHist.length = 0;
    exhaustTrails.length = 0;
    frameCount = 0;
  }

  function quit() {
    window.location.href = './index.html';
  }

  function loop() {
    const w = canvas.width;
    const h = canvas.height;

    if (!crashed) {
      if (keys.up && !keys.down) vy = Math.max(vy - LIFT, -MAX_VY);
      else if (keys.down && !keys.up) vy = Math.min(vy + LIFT * 0.85, MAX_VY);
      else {
        vy *= 0.88;
        vy += GRAVITY;
        vy = clamp(vy, -MAX_VY, MAX_VY);
      }
      shipY += vy;
      shipY = clamp(shipY, 1, h - 3);
      scroll += speed;
      if (keys.boost) speed = BOOST_SPEED;
      else if (keys.brake) speed = BRAKE_SPEED;
      else speed += (BASE_SPEED - speed) * 0.14;
    } else {
      crashTimer--;
      for (let i = 0; i < 3; i++) {
        sparkHist.push([Math.floor(w * SHIP_X_RATIO) + i - 1, clamp(Math.floor(shipY) + (i % 3) - 1, 1, h - 3)]);
      }
      if (crashTimer <= 0) {
        // Show crash text
        ctx.fillStyle = '#0f0';
        ctx.fillText('CRASH - PRESS R', Math.floor(w / 2 - 60), Math.floor(h / 2));
      }
    }

    for (const trail of exhaustTrails.slice()) {
      trail.age++;
      trail.x -= 2;
      trail.life--;
      if (trail.life <= 0 || trail.x < 0) exhaustTrails.splice(exhaustTrails.indexOf(trail), 1);
    }

    const hit = renderFrame(shipY, scroll, speed, crashed, gen, sparkHist, exhaustTrails, frameCount);
    frameCount++;
    if (hit && !crashed) {
      crashed = true;
      crashTimer = CRASH_TIME;
      for (let i = 0; i < 12; i++) {
        sparkHist.push([Math.floor(w * SHIP_X_RATIO) + (i % 4) - 1, clamp(Math.floor(shipY) + Math.floor(i / 4) - 1, 1, h - 3)]);
      }
    }

    setTimeout(() => requestAnimationFrame(loop), FPS_MS);
  }

  loop();
})();
