/*
  PlanetRunner for JesseOS / LBSTRBOX
  Drop-in module for planetrunner.js.

  It mounts only inside #planetrunner-mount and exposes:
  window.PlanetRunner.start()
  window.PlanetRunner.handleVirtualKey(key)
  window.PlanetRunner.handlePhysicalKey(key, pressed)
  window.PlanetRunner.stop()
*/

(() => {
  const COLS = 68;
  const ROWS = 26;
  const SHIP_X = 18;
  const BASE_SPEED = 0.48;
  const BOOST_SPEED = 1.05;
  const BRAKE_SPEED = 0.22;
  const GRAVITY = 0.055;
  const LIFT = 0.19;
  const MAX_VY = 0.85;
  const CRASH_FRAMES = 50;
  const SHIP = ['\\', '=>', '/'];
  const CRASH = ['*', '+', 'x', '.'];

  let mount;
  let canvas;
  let context;
  let animationFrame;
  let active = false;
  let lastTime = 0;
  let shipY = ROWS * 0.42;
  let shipVelocity = 0;
  let distance = 0;
  let speed = BASE_SPEED;
  let crashed = false;
  let crashFrames = 0;
  let frame = 0;
  let sparks = [];
  let exhaust = [];
  const held = { up: false, down: false, boost: false, brake: false };

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function noise(value, seed = 0) {
    const whole = Math.floor(value);
    const fraction = value - whole;
    const randomAt = index => {
      const sample = Math.sin((index + seed * 131) * 12.9898) * 43758.5453;
      return (sample - Math.floor(sample)) * 2 - 1;
    };
    const smooth = fraction * fraction * (3 - 2 * fraction);
    return randomAt(whole) * (1 - smooth) + randomAt(whole + 1) * smooth;
  }

  function fractal(value, seed, octaves = 3) {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let normalizer = 0;
    for (let index = 0; index < octaves; index += 1) {
      total += noise(value * frequency, seed + index * 19) * amplitude;
      normalizer += amplitude;
      amplitude *= 0.52;
      frequency *= 2;
    }
    return total / normalizer;
  }

  function terrainTop(worldX) {
    const broad = fractal(worldX * 0.026, 20, 3);
    const detail = fractal(worldX * 0.11, 41, 2);
    return Math.floor(clamp(ROWS * 0.77 + broad * 2.6 + detail * 1.4, ROWS * 0.64, ROWS - 4));
  }

  function mountainTop(worldX) {
    const broad = fractal(worldX * 0.014, 77, 3);
    const detail = fractal(worldX * 0.08, 99, 2);
    return Math.floor(clamp(ROWS * 0.48 + broad * 3 + detail * 2.1, 4, ROWS * 0.66));
  }

  function newBuffer() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
  }

  function newCollisionMap() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  }

  function put(buffer, x, y, character) {
    if (x >= 0 && x < COLS && y >= 0 && y < ROWS) buffer[y][x] = character;
  }

  function drawSky(buffer) {
    const sunX = 51 + Math.floor(Math.sin(distance * 0.01) * 3);
    const sunY = 5;
    for (let y = sunY - 3; y <= sunY + 3; y += 1) {
      for (let x = sunX - 7; x <= sunX + 7; x += 1) {
        const radius = ((x - sunX) / 7) ** 2 + ((y - sunY) / 3) ** 2;
        if (radius <= 1) put(buffer, x, y, radius < 0.35 ? '@' : radius < 0.7 ? '*' : '.');
      }
    }
    for (let x = 0; x < COLS; x += 1) {
      for (let y = 3; y < 9; y += 1) {
        if (buffer[y][x] === ' ' && fractal(distance * 0.03 + x * 0.18 + y * 0.4, 143, 2) > 0.66) put(buffer, x, y, '.');
      }
    }
  }

  function drawMountains(buffer) {
    const tops = Array.from({ length: COLS }, (_, x) => mountainTop(distance * 0.30 + x));
    for (let x = 1; x < COLS; x += 1) tops[x] = clamp(tops[x], tops[x - 1] - 2, tops[x - 1] + 2);
    for (let x = 0; x < COLS; x += 1) {
      const top = tops[x];
      const left = x > 0 ? tops[x - 1] : top;
      const right = x < COLS - 1 ? tops[x + 1] : top;
      put(buffer, x, top, top < left && top < right ? 'A' : top < left ? '/' : top < right ? '\\' : '^');
      for (let y = top + 1; y < Math.floor(ROWS * 0.61); y += 1) {
        if (fractal(x * 0.25 + y * 0.37 + distance * 0.04, 191, 2) > 0.44) put(buffer, x, y, '.');
      }
    }
  }

  function drawTerrain(buffer, collision) {
    for (let x = 0; x < COLS; x += 1) {
      const worldX = distance + x;
      const top = terrainTop(worldX);
      put(buffer, x, top, x % 5 === 0 ? '^' : x % 5 === 1 ? '/' : x % 5 === 3 ? '\\' : '_');
      for (let y = top; y < ROWS - 1; y += 1) {
        collision[y][x] = true;
        if (y > top && (x + y + Math.floor(distance)) % 5 === 0) put(buffer, x, y, '.');
      }
      if (x > 22 && fractal(worldX * 0.19, 257, 2) > 0.78) {
        const rockY = clamp(top - 2 - Math.floor(Math.abs(fractal(worldX * 0.51, 301, 2)) * 2), 5, ROWS - 5);
        put(buffer, x, rockY, '@');
        collision[rockY][x] = true;
        if (rockY + 1 < ROWS - 1) {
          put(buffer, x, rockY + 1, 'X');
          collision[rockY + 1][x] = true;
        }
      }
    }
  }

  function drawPlants(buffer) {
    for (let x = 0; x < COLS; x += 1) {
      const signal = fractal(distance * 0.8 + x * 0.35, 401, 2);
      if (signal < 0.54) continue;
      const height = 2 + Math.floor((signal - 0.54) * 7);
      for (let y = ROWS - 2; y > Math.max(9, ROWS - 2 - height); y -= 1) {
        put(buffer, x, y, (x + y) % 3 === 0 ? '/' : (x + y) % 3 === 1 ? '\\' : '|');
      }
    }
  }

  function shipCells() {
    const row = clamp(Math.round(shipY), 2, ROWS - 4);
    const cells = [];
    SHIP.forEach((part, dy) => {
      [...part].forEach((character, dx) => {
        if (character !== ' ') cells.push([SHIP_X + dx, row - 1 + dy]);
      });
    });
    return cells;
  }

  function drawShip(buffer) {
    SHIP.forEach((part, dy) => {
      [...part].forEach((character, dx) => {
        if (character !== ' ') put(buffer, SHIP_X + dx, Math.round(shipY) - 1 + dy, character);
      });
    });
  }

  function update() {
    if (!crashed) {
      if (held.up && !held.down) shipVelocity = Math.max(shipVelocity - LIFT, -MAX_VY);
      else if (held.down && !held.up) shipVelocity = Math.min(shipVelocity + LIFT * 0.82, MAX_VY);
      else {
        shipVelocity *= 0.86;
        shipVelocity = clamp(shipVelocity + GRAVITY, -MAX_VY, MAX_VY);
      }
      shipY = clamp(shipY + shipVelocity, 2, ROWS - 4);
      if (held.boost) speed = BOOST_SPEED;
      else if (held.brake) speed = BRAKE_SPEED;
      else speed += (BASE_SPEED - speed) * 0.14;
      distance += speed;
      if (frame % 2 === 0) exhaust.push({ x: SHIP_X - 2, y: Math.round(shipY), life: 18 });
    } else {
      crashFrames -= 1;
    }
    for (let index = exhaust.length - 1; index >= 0; index -= 1) {
      exhaust[index].x -= 1.1;
      exhaust[index].life -= 1;
      if (exhaust[index].life <= 0 || exhaust[index].x < 0) exhaust.splice(index, 1);
    }
  }

  function render() {
    const buffer = newBuffer();
    const collision = newCollisionMap();
    drawSky(buffer);
    drawMountains(buffer);
    drawTerrain(buffer, collision);
    if (crashed) sparks.forEach(([x, y], index) => put(buffer, x, y, CRASH[index % CRASH.length]));
    else {
      exhaust.forEach(trail => put(buffer, Math.round(trail.x), Math.round(trail.y), '.'));
      drawShip(buffer);
    }
    drawPlants(buffer);

    if (!crashed && shipCells().some(([x, y]) => collision[y]?.[x])) {
      crashed = true;
      crashFrames = CRASH_FRAMES;
      sparks = Array.from({ length: 15 }, (_, index) => [SHIP_X + (index % 5) - 2, clamp(Math.round(shipY) + Math.floor(index / 5) - 2, 2, ROWS - 4)]);
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(canvas.width / COLS, 0, 0, canvas.height / ROWS, 0, 0);
    context.fillStyle = '#001006';
    context.fillRect(0, 0, COLS, ROWS);
    context.fillStyle = '#51ff75';
    context.font = '1px "C64 Pro Mono", "Courier New", monospace';
    context.textBaseline = 'top';
    for (let y = 0; y < ROWS; y += 1) context.fillText(buffer[y].join(''), 0, y);
    context.fillStyle = '#a6ffae';
    context.fillText('PLANET RUNNER // W/S FLY D BOOST A BRAKE X EXIT', 1, 0);
    context.fillText(`SPD ${speed.toFixed(2)}  DIST ${String(Math.floor(distance)).padStart(6, '0')}  ${crashed ? 'CRASHED // R RESTART' : 'FLYING'}`, 1, ROWS - 1);
  }

  function gameLoop(time) {
    if (!active) return;
    if (!lastTime || time - lastTime >= 33) {
      lastTime = time;
      update();
      render();
      frame += 1;
    }
    animationFrame = requestAnimationFrame(gameLoop);
  }

  function reset() {
    shipY = ROWS * 0.42;
    shipVelocity = 0;
    distance = 0;
    speed = BASE_SPEED;
    crashed = false;
    crashFrames = 0;
    frame = 0;
    sparks = [];
    exhaust = [];
  }

  function normalizeControl(key) {
    const value = String(key || '').toLowerCase();
    if (value === 'w' || value === 'arrowup' || value === 'up') return 'up';
    if (value === 's' || value === 'arrowdown' || value === 'down') return 'down';
    if (value === 'd' || value === 'arrowright' || value === 'boost') return 'boost';
    if (value === 'a' || value === 'arrowleft' || value === 'brake') return 'brake';
    return '';
  }

  function setHeld(key, pressed) {
    const control = normalizeControl(key);
    if (control) held[control] = pressed;
  }

  window.PlanetRunner = {
    start() {
      mount = document.getElementById('planetrunner-mount');
      if (!mount) throw new Error('PLANETRUNNER MOUNT NOT FOUND');
      mount.innerHTML = '';
      canvas = document.createElement('canvas');
      canvas.className = 'planetrunner-canvas';
      canvas.setAttribute('aria-label', 'PlanetRunner game display');
      mount.appendChild(canvas);
      context = canvas.getContext('2d');
      reset();
      active = true;
      lastTime = 0;
      animationFrame = requestAnimationFrame(gameLoop);
    },

    stop() {
      active = false;
      Object.keys(held).forEach(key => { held[key] = false; });
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (mount) mount.innerHTML = '';
      canvas = null;
      context = null;
    },

    handleVirtualKey(key) {
      const value = String(key || '').toLowerCase();
      if (value === 'r') {
        reset();
        return 'restart';
      }
      if (value === 'x' || value === 'escape') return 'exit';
      const control = normalizeControl(value);
      if (!control) return '';
      held[control] = true;
      window.setTimeout(() => { held[control] = false; }, 120);
      return 'handled';
    },

    handlePhysicalKey(key, pressed) {
      const value = String(key || '').toLowerCase();
      if (value === 'r' && pressed) {
        reset();
        return 'restart';
      }
      if ((value === 'x' || value === 'escape') && pressed) return 'exit';
      setHeld(value, pressed);
      return normalizeControl(value) ? 'handled' : '';
    },
  };
})();
