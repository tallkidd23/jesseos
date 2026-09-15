// PlanetRunner - fixed logical-grid Canvas adaptation of planet_runner196.py
// Controls: W/S or Up/Down to fly, D to boost, A to brake, R to restart, X to quit.

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;

  const LOGICAL_COLS = 96;
  const LOGICAL_ROWS = 38;
  const TITLE = 'PLANET RUNNER // W/S FLY D BOOST A BRAKE X QUIT';
  const SHIP_SPRITE = ['\\', '=>', '/'];
  const CRASH_CHARS = ['*', '+', 'x', '.'];
  const SHIP_X_RATIO = 0.28;
  const GRAVITY = 0.045;
  const LIFT = 0.17;
  const MAX_VY = 0.85;
  const BASE_SPEED = 0.55;
  const BOOST_SPEED = 1.15;
  const BRAKE_SPEED = 0.25;
  const CRASH_TIME = 55;
  const SAFE_START_COLS = 30;
  const FRAME_MS = 33;
  const SEED = 1337;

  let viewWidth = window.innerWidth;
  let viewHeight = window.innerHeight;

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewWidth = Math.max(1, window.innerWidth);
    viewHeight = Math.max(1, window.innerHeight);
    canvas.width = Math.floor(viewWidth * dpr);
    canvas.height = Math.floor(viewHeight * dpr);
    canvas.style.width = `${viewWidth}px`;
    canvas.style.height = `${viewHeight}px`;
    ctx.setTransform(canvas.width / LOGICAL_COLS, 0, 0, canvas.height / LOGICAL_ROWS, 0, 0);
    ctx.imageSmoothingEnabled = false;
    shipY = clamp(shipY || LOGICAL_ROWS * 0.4, 2, LOGICAL_ROWS - 4);
  }

  function mulberry32(seed) {
    return () => {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class ValueNoise1D {
    constructor(seed) {
      this.seed = seed;
      this.cache = new Map();
    }

    randomAt(index) {
      if (!this.cache.has(index)) {
        this.cache.set(index, mulberry32(this.seed + index * 7919)() * 2 - 1);
      }
      return this.cache.get(index);
    }

    sample(x) {
      const left = Math.floor(x);
      let amount = x - left;
      amount = amount * amount * (3 - 2 * amount);
      return this.randomAt(left) * (1 - amount) + this.randomAt(left + 1) * amount;
    }

    fractal(x, octaves = 4, persistence = 0.5, lacunarity = 2) {
      let total = 0;
      let amplitude = 1;
      let frequency = 1;
      let normalizer = 0;
      for (let step = 0; step < octaves; step += 1) {
        total += this.sample(x * frequency) * amplitude;
        normalizer += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
      }
      return normalizer ? total / normalizer : 0;
    }
  }

  class TerrainGenerator {
    constructor() {
      this.mountainBase = new ValueNoise1D(SEED + 20);
      this.mountainDetail = new ValueNoise1D(SEED + 24);
      this.mountainSpike = new ValueNoise1D(SEED + 28);
      this.vegetation = new ValueNoise1D(SEED + 34);
      this.rocks = new ValueNoise1D(SEED + 40);
      this.ground = new ValueNoise1D(SEED + 60);
      this.boulders = new ValueNoise1D(SEED + 80);
      this.clouds = new ValueNoise1D(SEED + 100);
      this.wisps = new ValueNoise1D(SEED + 140);
    }

    mountainTop(worldX, height) {
      const base = this.mountainBase.fractal(worldX * 0.007, 4, 0.55);
      const detail = this.mountainDetail.fractal(worldX * 0.032, 3, 0.58);
      const spike = Math.abs(this.mountainSpike.fractal(worldX * 0.14 + 80, 3));
      return Math.floor(clamp(height * 0.51 + base * height * 0.11 + detail * height * 0.08 - spike * height * 0.27, 3, height - 11));
    }

    vegetationTop(worldX, height) {
      const n = this.vegetation.fractal(worldX * 0.05, 4, 0.58);
      const jitter = this.vegetation.fractal(worldX * 0.19 + 90, 2);
      return Math.floor(clamp(height * 0.69 + n * height * 0.055 + jitter * 1.5, 6, height - 6));
    }

    rockTop(worldX, height) {
      return Math.floor(clamp(height * 0.80 + this.rocks.fractal(worldX * 0.08, 4, 0.55) * height * 0.035, 6, height - 5));
    }

    groundTop(worldX, height) {
      return Math.floor(clamp(height * 0.91 + this.ground.fractal(worldX * 0.10, 3, 0.55) * height * 0.018, 8, height - 3));
    }

    boulderHere(worldX, xColumn) {
      return xColumn >= SAFE_START_COLS && this.boulders.fractal(worldX * 0.11, 2) > 0.76;
    }

    boulderSize(worldX) {
      return 2 + Math.floor(Math.abs(this.boulders.fractal(worldX * 0.25 + 50, 2)) * 2);
    }

    boulderY(worldX, height, groundTop) {
      const n = this.boulders.fractal(worldX * 0.13 + 200, 3);
      const laneTop = Math.floor(height * 0.60);
      return Math.floor(laneTop + ((n + 1) / 2) * Math.max(1, groundTop - 2 - laneTop));
    }

    cloudHere(worldX, y, height) {
      return y < height * 0.28 && this.clouds.fractal(worldX * 0.03 + y * 0.4, 2) > 0.62;
    }
  }

  function makeBuffer() {
    return Array.from({ length: LOGICAL_ROWS }, () => Array(LOGICAL_COLS).fill(' '));
  }

  function makeCollisionMap() {
    return Array.from({ length: LOGICAL_ROWS }, () => Array(LOGICAL_COLS).fill(false));
  }

  function put(buffer, x, y, char) {
    if (x >= 0 && x < LOGICAL_COLS && y >= 0 && y < LOGICAL_ROWS) buffer[y][x] = char;
  }

  function drawSun(buffer, scroll) {
    const xCenter = Math.floor(LOGICAL_COLS * 0.72 + Math.sin(scroll * 0.01) * LOGICAL_COLS * 0.08);
    const yCenter = Math.floor(LOGICAL_ROWS * 0.16 + Math.sin(scroll * 0.003));
    const radiusX = 9;
    const radiusY = 4;
    for (let y = yCenter - radiusY; y <= yCenter + radiusY; y += 1) {
      for (let x = xCenter - radiusX; x <= xCenter + radiusX; x += 1) {
        if (x < 0 || x >= LOGICAL_COLS || y < 0 || y >= LOGICAL_ROWS) continue;
        const distance = ((x - xCenter) / radiusX) ** 2 + ((y - yCenter) / radiusY) ** 2;
        if (distance <= 1) buffer[y][x] = distance < 0.33 ? '@' : distance < 0.66 ? '*' : '.';
      }
    }
  }

  function drawClouds(buffer, terrain, scroll) {
    for (let x = 0; x < LOGICAL_COLS; x += 1) {
      for (let y = 3; y < Math.floor(LOGICAL_ROWS * 0.27); y += 1) {
        if (buffer[y][x] === ' ' && terrain.cloudHere(scroll * 0.04 + x, y, LOGICAL_ROWS)) put(buffer, x, y, '.');
      }
    }
  }

  function drawMountains(buffer, terrain, scroll) {
    const tops = Array.from({ length: LOGICAL_COLS }, (_, x) => terrain.mountainTop(scroll * 0.33 + x, LOGICAL_ROWS));
    for (let x = 1; x < tops.length; x += 1) tops[x] = clamp(tops[x], tops[x - 1] - 2, tops[x - 1] + 2);
    const bottom = Math.floor(LOGICAL_ROWS * 0.62);
    for (let x = 0; x < LOGICAL_COLS; x += 1) {
      const top = tops[x];
      const left = x ? tops[x - 1] : top;
      const right = x < LOGICAL_COLS - 1 ? tops[x + 1] : top;
      put(buffer, x, top, top < left && top < right ? 'A' : top < left ? '/' : top < right ? '\\' : '^');
      for (let y = top + 1; y < bottom; y += 1) {
        const grain = terrain.wisps.fractal((scroll * 0.33 + x) * 0.12 + y * 0.09 + 1400, 2);
        if (grain > 0.5 && ((x + y + Math.floor(scroll)) % 8 === 0)) put(buffer, x, y, "'");
        else if (grain > 0.15 && ((x * 2 + y) % 7 === 0)) put(buffer, x, y, '.');
      }
    }
  }

  function drawVegetation(buffer, terrain, scroll) {
    for (let x = 0; x < LOGICAL_COLS; x += 1) {
      const top = terrain.vegetationTop(scroll * 1.2375 + x, LOGICAL_ROWS);
      const stemHeight = Math.min(LOGICAL_ROWS - top - 4, 2 + ((x + Math.floor(scroll)) % 4));
      put(buffer, x, top, x % 7 === 0 ? 'Y' : x % 3 === 0 ? '/' : x % 3 === 1 ? '\\' : '|');
      for (let distance = 1; distance <= stemHeight; distance += 1) put(buffer, x, top + distance, distance === 1 && x % 4 === 0 ? ':' : '|');
    }
  }

  function drawRocksAndBoulders(buffer, collisionMap, terrain, scroll) {
    for (let x = 0; x < LOGICAL_COLS; x += 1) {
      const worldX = scroll * 1.875 + x;
      const top = terrain.rockTop(worldX, LOGICAL_ROWS);
      put(buffer, x, top, x % 7 < 2 ? '/' : x % 7 < 5 ? '^' : '\\');
      put(buffer, x, top + 1, ',');
      if (!terrain.boulderHere(worldX, x)) continue;
      const size = terrain.boulderSize(worldX);
      const centerY = terrain.boulderY(worldX, LOGICAL_ROWS, top);
      for (let dx = -1; dx <= 1; dx += 1) {
        const radius = size - Math.abs(dx);
        for (let dy = -radius; dy <= radius; dy += 1) {
          const px = x + dx;
          const py = centerY + dy;
          if (px < 0 || px >= LOGICAL_COLS || py < 1 || py >= LOGICAL_ROWS - 3) continue;
          put(buffer, px, py, Math.abs(dy) === radius ? 'X' : '@');
          collisionMap[py][px] = true;
        }
      }
    }
  }

  function drawGround(buffer, collisionMap, terrain, scroll) {
    for (let x = 0; x < LOGICAL_COLS; x += 1) {
      const top = terrain.groundTop(scroll + x, LOGICAL_ROWS);
      for (let y = top; y < LOGICAL_ROWS - 2; y += 1) {
        collisionMap[y][x] = true;
        if (y === top) put(buffer, x, y, y % 2 ? '_' : '-');
        else if ((x + y + Math.floor(scroll)) % 5 === 0) put(buffer, x, y, '.');
      }
    }
  }

  function drawForeground(buffer, terrain, scroll) {
    for (let x = 0; x < LOGICAL_COLS; x += 1) {
      const noise = terrain.wisps.fractal((scroll * 2.5 + x) * 0.05 + 700, 3);
      if (noise < 0.43) continue;
      const height = 2 + Math.floor((noise - 0.43) * 12);
      for (let y = LOGICAL_ROWS - 3; y >= Math.max(2, LOGICAL_ROWS - 3 - height); y -= 1) {
        if ((x + y) % 3 !== 0) put(buffer, x, y, y % 2 ? '|' : '/');
      }
    }
  }

  function drawShip(buffer, shipX, shipRow) {
    SHIP_SPRITE.forEach((spriteRow, rowOffset) => {
      [...spriteRow].forEach((char, colOffset) => {
        if (char !== ' ') put(buffer, shipX + colOffset, shipRow - 1 + rowOffset, char);
      });
    });
  }

  function shipHits(collisionMap, shipX, shipRow) {
    return SHIP_SPRITE.some((spriteRow, rowOffset) => [...spriteRow].some((char, colOffset) => {
      const x = shipX + colOffset;
      const y = shipRow - 1 + rowOffset;
      return char !== ' ' && collisionMap[y]?.[x];
    }));
  }

  function render() {
    const buffer = makeBuffer();
    const collisionMap = makeCollisionMap();
    const shipX = Math.max(8, Math.floor(LOGICAL_COLS * SHIP_X_RATIO));
    const shipRow = clamp(Math.round(shipY), 2, LOGICAL_ROWS - 4);

    drawSun(buffer, scroll);
    drawClouds(buffer, terrain, scroll);
    drawMountains(buffer, terrain, scroll);
    drawVegetation(buffer, terrain, scroll);
    drawRocksAndBoulders(buffer, collisionMap, terrain, scroll);
    drawGround(buffer, collisionMap, terrain, scroll);

    if (crashed) {
      sparks.forEach(([x, y], index) => put(buffer, x, y, CRASH_CHARS[index % CRASH_CHARS.length]));
    } else {
      exhaust.forEach(trail => put(buffer, Math.round(trail.x), Math.round(trail.y), '.'));
      drawShip(buffer, shipX, shipRow);
    }

    drawForeground(buffer, terrain, scroll);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LOGICAL_COLS, LOGICAL_ROWS);
    ctx.fillStyle = '#00ff44';
    ctx.font = '1px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';

    for (let row = 0; row < LOGICAL_ROWS; row += 1) ctx.fillText(buffer[row].join(''), 0, row);

    ctx.fillStyle = '#75ff8c';
    ctx.fillText(TITLE, 2, 1);
    ctx.fillText(`SPD ${speed.toFixed(2)}  DIST ${String(Math.floor(scroll)).padStart(7, '0')}  ${crashed ? 'CRASHED - PRESS R' : 'FLYING'}`, 2, LOGICAL_ROWS - 2);

    return !crashed && shipHits(collisionMap, shipX, shipRow);
  }

  function setStatus(message) {
    const status = document.getElementById('gameStatus');
    if (status) status.textContent = message;
  }

  const terrain = new TerrainGenerator();
  const keys = { up: false, down: false, boost: false, brake: false };
  const sparks = [];
  const exhaust = [];
  let shipY = LOGICAL_ROWS * 0.4;
  let verticalVelocity = 0;
  let scroll = 0;
  let speed = BASE_SPEED;
  let crashed = false;
  let crashTimer = 0;
  let frameCount = 0;
  let lastFrameTime = 0;

  function restart() {
    shipY = LOGICAL_ROWS * 0.4;
    verticalVelocity = 0;
    scroll = 0;
    speed = BASE_SPEED;
    crashed = false;
    crashTimer = 0;
    sparks.length = 0;
    exhaust.length = 0;
    frameCount = 0;
    setStatus('ORBITAL NAVIGATION ONLINE');
  }

  function quit() {
    window.location.href = './index.html';
  }

  function update() {
    if (!crashed) {
      if (keys.up && !keys.down) verticalVelocity = Math.max(verticalVelocity - LIFT, -MAX_VY);
      else if (keys.down && !keys.up) verticalVelocity = Math.min(verticalVelocity + LIFT * 0.85, MAX_VY);
      else {
        verticalVelocity *= 0.88;
        verticalVelocity = clamp(verticalVelocity + GRAVITY, -MAX_VY, MAX_VY);
      }
      shipY = clamp(shipY + verticalVelocity, 2, LOGICAL_ROWS - 4);
      if (keys.boost) speed = BOOST_SPEED;
      else if (keys.brake) speed = BRAKE_SPEED;
      else speed += (BASE_SPEED - speed) * 0.14;
      scroll += speed;
      if (frameCount % 2 === 0) exhaust.push({ x: Math.floor(LOGICAL_COLS * SHIP_X_RATIO) - 3, y: Math.round(shipY), life: 26 });
    } else {
      crashTimer -= 1;
      if (crashTimer <= 0) setStatus('CRASHED // PRESS RESTART OR R');
    }

    for (let index = exhaust.length - 1; index >= 0; index -= 1) {
      exhaust[index].x -= 1.35;
      exhaust[index].life -= 1;
      if (exhaust[index].life <= 0 || exhaust[index].x < 0) exhaust.splice(index, 1);
    }
  }

  function frame(timestamp) {
    if (!lastFrameTime || timestamp - lastFrameTime >= FRAME_MS) {
      lastFrameTime = timestamp;
      update();
      const hit = render();
      if (hit) {
        crashed = true;
        crashTimer = CRASH_TIME;
        const shipX = Math.floor(LOGICAL_COLS * SHIP_X_RATIO);
        for (let index = 0; index < 16; index += 1) sparks.push([shipX + (index % 5) - 2, clamp(Math.round(shipY) + Math.floor(index / 5) - 2, 2, LOGICAL_ROWS - 4)]);
        setStatus('IMPACT DETECTED // PRESS RESTART OR R');
      }
      frameCount += 1;
    }
    requestAnimationFrame(frame);
  }

  function setControl(key, pressed) {
    if (key in keys) keys[key] = pressed;
  }

  window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (['w', 's', 'a', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'r', 'x'].includes(key)) event.preventDefault();
    if (key === 'w' || key === 'arrowup') setControl('up', true);
    if (key === 's' || key === 'arrowdown') setControl('down', true);
    if (key === 'd' || key === 'arrowright') setControl('boost', true);
    if (key === 'a' || key === 'arrowleft') setControl('brake', true);
    if (key === 'r') restart();
    if (key === 'x') quit();
  });

  window.addEventListener('keyup', event => {
    const key = event.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') setControl('up', false);
    if (key === 's' || key === 'arrowdown') setControl('down', false);
    if (key === 'd' || key === 'arrowright') setControl('boost', false);
    if (key === 'a' || key === 'arrowleft') setControl('brake', false);
  });

  document.querySelectorAll('[data-key]').forEach(button => {
    const control = button.dataset.key;
    const press = event => {
      event.preventDefault();
      if (control === 'restart') restart();
      else if (control === 'quit') quit();
      else setControl(control, true);
    };
    const release = event => {
      if (event) event.preventDefault();
      if (control in keys) setControl(control, false);
    };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
  });

  window.addEventListener('resize', resize);
  resize();
  restart();
  requestAnimationFrame(frame);
})();
