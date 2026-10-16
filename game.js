// ========== CONSTANTS ==========
const TILE_SIZE = 64;
const GRAVITY = 0.55;
const FRICTION = 0.82;
const PLAYER_SPEED = 4.2;
const PLAYER_JUMP = -11.5;
const BULLET_SPEED = 9;
const WORLD_WIDTH = 7800;       // большая карта — прохождение занимает >30 секунд
const WORLD_HEIGHT = 720;
const CAMERA_WIDTH = 960;
const CAMERA_HEIGHT = 540;

// ========== GAME STATE ==========
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = CAMERA_WIDTH;
canvas.height = CAMERA_HEIGHT;

const game = {
  state: 'playing',       // playing | win | dead
  score: 0,
  timeStart: 0,
  camera: { x: 0, y: 0 },
  keys: {},
  bullets: [],
  particles: [],
  enemies: [],
  platforms: [],
  decorations: [],
  bgStars: [],
  bgClouds: [],
  bgFigures: [],          // декоративные существа на фоне
  webStrings: [],
  webSpiders: [],
  finishX: WORLD_WIDTH - 200,
};

window.addEventListener('keydown', (e) => {
  game.keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    if (player.onGround) {
      player.vy = PLAYER_JUMP;
      player.onGround = false;
    }
  }
  if (e.code === 'KeyF' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
    player.shoot();
  }
  if (e.code === 'KeyR' && game.state !== 'playing') {
    restart();
  }
});
window.addEventListener('keyup', (e) => { game.keys[e.code] = false; });

// ========== IMAGE LOADING ==========
const images = {};
const imageList = [
  'hero_spritesheet',
  'enemy_spider_spritesheet',
  'enemy_alien_spritesheet',
  'enemy_ghost_spritesheet',
  'grass_tile',
  'candy_tile',
  'cookie_tile',
  'stripe_tile',
  'bullet',
];
let loaded = 0;
imageList.forEach((name) => {
  const img = new Image();
  img.src = `assets/${name}.png`;
  img.onload = () => {
    loaded += 1;
    if (loaded === imageList.length) start();
  };
  images[name] = img;
});

// ========== SPRITE HELPERS ==========
function drawSprite(img, sx, sy, sw, sh, dx, dy, dw, dh) {
  if (!img.complete) return;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawSpriteFrame(imgName, frame, x, y, w, h, flip = false) {
  const img = images[imgName];
  if (!img.complete) return;
  const fw = img.width / 4;
  const fh = img.height;
  ctx.save();
  if (flip) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, frame * fw, 0, fw, fh, 0, 0, w, h);
  } else {
    ctx.drawImage(img, frame * fw, 0, fw, fh, x, y, w, h);
  }
  ctx.restore();
}

// ========== LEVEL GENERATION ==========
// Level built from chunk arrays. Each entry [x, y, type]
function buildLevel() {
  const ground = [];      // базовая поверхность из травы
  const floating = [];    // парящие платформы из конфет/печенья/полос
  // Базовая земля — длинная полоса из травы внизу с разрывами для прыжков
  let gx = 0;
  while (gx < WORLD_WIDTH - 200) {
    const segLen = 6 + Math.floor(Math.random() * 8);  // 6..13 тайлов подряд
    for (let i = 0; i < segLen; i += 1) {
      ground.push([gx + i * TILE_SIZE, WORLD_HEIGHT - TILE_SIZE, 'grass']);
    }
    gx += segLen * TILE_SIZE;
    // иногда делаем разрыв (прыжок над пропастью)
    if (Math.random() < 0.55) {
      const gap = 1 + Math.floor(Math.random() * 2);   // 1-2 тайла
      gx += gap * TILE_SIZE;
    }
  }
  // Парящие платформы по всей длине
  for (let x = 200; x < WORLD_WIDTH - 300; x += 180 + Math.random() * 220) {
    const y = WORLD_HEIGHT - 140 - Math.random() * 240;
    const len = 2 + Math.floor(Math.random() * 4);
    const types = ['candy', 'cookie', 'stripe'];
    const t = types[Math.floor(Math.random() * types.length)];
    for (let i = 0; i < len; i += 1) {
      floating.push([x + i * TILE_SIZE, y, t]);
    }
  }
  return { ground, floating };
}

const levelData = buildLevel();
levelData.ground.forEach(([x, y, t]) => game.platforms.push({ x, y, w: TILE_SIZE, h: TILE_SIZE, type: t }));
levelData.floating.forEach(([x, y, t]) => game.platforms.push({ x, y, w: TILE_SIZE, h: TILE_SIZE, type: t }));

// ========== PLAYER ==========
const player = {
  x: 80,
  y: WORLD_HEIGHT - TILE_SIZE * 3,
  w: 60,
  h: 80,
  vx: 0,
  vy: 0,
  onGround: false,
  facing: 1,
  frame: 0,
  frameTimer: 0,
  shootCooldown: 0,
  alive: true,
  shoot() {
    if (this.shootCooldown > 0) return;
    const bx = this.facing === 1 ? this.x + this.w : this.x - 16;
    const by = this.y + this.h * 0.45;
    game.bullets.push({ x: bx, y: by, vx: BULLET_SPEED * this.facing, life: 90 });
    this.shootCooldown = 14;
    // spark particle
    for (let i = 0; i < 4; i += 1) {
      game.particles.push({
        x: bx, y: by,
        vx: (Math.random() - 0.5) * 3 + this.facing * 2,
        vy: (Math.random() - 0.5) * 2,
        life: 14,
        color: '#fff37a',
      });
    }
  },
  update() {
    if (!this.alive) return;
    // horizontal
    if (game.keys['ArrowLeft'] || game.keys['KeyA']) {
      this.vx = -PLAYER_SPEED;
      this.facing = -1;
    } else if (game.keys['ArrowRight'] || game.keys['KeyD']) {
      this.vx = PLAYER_SPEED;
      this.facing = 1;
    } else {
      this.vx *= FRICTION;
    }
    this.vy += GRAVITY;
    this.x += this.vx;
    this.y += this.vy;

    if (this.shootCooldown > 0) this.shootCooldown -= 1;

    // collide with platforms (only when falling)
    this.onGround = false;
    for (const p of game.platforms) {
      // overlap check
      if (
        this.x + this.w > p.x && this.x < p.x + p.w &&
        this.y + this.h > p.y && this.y + this.h < p.y + p.h + 24 &&
        this.vy >= 0
      ) {
        this.y = p.y - this.h;
        this.vy = 0;
        this.onGround = true;
      }
    }
    // world bounds
    if (this.x < 0) this.x = 0;
    if (this.x + this.w > WORLD_WIDTH) this.x = WORLD_WIDTH - this.w;

    // fall into pit -> death
    if (this.y > WORLD_HEIGHT + 100) {
      this.alive = false;
      game.state = 'dead';
    }

    // animation frame
    this.frameTimer += 1;
    if (!this.onGround) {
      this.frame = 3;
    } else if (Math.abs(this.vx) > 0.5) {
      if (this.frameTimer % 8 === 0) this.frame = (this.frame + 1) % 2 + 1;
    } else {
      this.frame = 0;
    }

    // win
    if (this.x > game.finishX) {
      game.state = 'win';
    }
  },
  draw() {
    if (!this.alive) return;
    drawSpriteFrame('hero_spritesheet', this.frame, this.x - game.camera.x, this.y - game.camera.y, this.w, this.h, this.facing === -1);
  },
};

// ========== ENEMIES ==========
function spawnEnemies() {
  const types = ['spider', 'alien', 'ghost'];
  // Расставляем по карте, не слишком близко к старту
  for (let i = 0; i < 28; i += 1) {
    const x = 700 + i * (240 + Math.random() * 220);
    if (x > WORLD_WIDTH - 400) continue;
    const t = types[Math.floor(Math.random() * types.length)];
    let y;
    if (t === 'alien') {
      // летающие — на высоте
      y = WORLD_HEIGHT - 200 - Math.random() * 200;
    } else if (t === 'ghost') {
      y = WORLD_HEIGHT - 280 - Math.random() * 180;
    } else {
      // spiders — на земле
      y = WORLD_HEIGHT - TILE_SIZE - 50;
    }
    game.enemies.push({
      type: t,
      x,
      y,
      w: 56,
      h: 56,
      vx: (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.4),
      originX: x,
      originY: y,
      frame: 0,
      frameTimer: 0,
      alive: true,
      patrol: 60 + Math.random() * 80,
      t: 0,
      phase: Math.random() * Math.PI * 2,
    });
  }
}
spawnEnemies();

function updateEnemies() {
  for (const e of game.enemies) {
    if (!e.alive) continue;
    e.t += 1;
    e.frameTimer += 1;
    if (e.frameTimer % 10 === 0) e.frame = (e.frame + 1) % 4;

    if (e.type === 'alien') {
      // плавно летают по небольшой зоне
      e.x += e.vx;
      if (Math.abs(e.x - e.originX) > e.patrol) e.vx = -e.vx;
      e.y = e.originY + Math.sin(e.t / 30 + e.phase) * 30;
    } else if (e.type === 'ghost') {
      // призраки плавно дрейфуют
      e.x += e.vx * 0.5;
      if (Math.abs(e.x - e.originX) > e.patrol * 1.5) e.vx = -e.vx;
      e.y = e.originY + Math.sin(e.t / 40 + e.phase) * 25;
    } else {
      // пауки ползают по земле
      e.x += e.vx;
      if (Math.abs(e.x - e.originX) > e.patrol) e.vx = -e.vx;
    }
  }
}

function drawEnemies() {
  for (const e of game.enemies) {
    if (!e.alive) continue;
    const spriteName = `enemy_${e.type}_spritesheet`;
    drawSpriteFrame(spriteName, e.frame, e.x - game.camera.x, e.y - game.camera.y, e.w, e.h);
  }
}

// ========== COLLISIONS ==========
function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function handleCollisions() {
  // bullets -> enemies
  for (const b of game.bullets) {
    for (const e of game.enemies) {
      if (!e.alive) continue;
      if (aabb(b, e)) {
        e.alive = false;
        b.life = 0;
        game.score += 100;
        for (let i = 0; i < 12; i += 1) {
          game.particles.push({
            x: e.x + e.w / 2, y: e.y + e.h / 2,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5 - 2,
            life: 30,
            color: ['#ff5b8a', '#ffd966', '#7ec8ff'][Math.floor(Math.random() * 3)],
          });
        }
      }
    }
  }
  // player stomp / damage
  for (const e of game.enemies) {
    if (!e.alive || !player.alive) continue;
    if (aabb(player, e)) {
      // Если игрок падает сверху и его нижняя часть выше верхней части врага — это прыжок на голову
      const playerBottom = player.y + player.h;
      const enemyTop = e.y;
      if (player.vy > 1 && playerBottom - player.vy < enemyTop + 12) {
        // stomp
        e.alive = false;
        player.vy = -8;
        game.score += 200;
        for (let i = 0; i < 10; i += 1) {
          game.particles.push({
            x: e.x + e.w / 2, y: e.y + e.h / 2,
            vx: (Math.random() - 0.5) * 6,
            vy: -Math.random() * 5,
            life: 30,
            color: '#fff',
          });
        }
      } else {
        // damage
        player.alive = false;
        game.state = 'dead';
        for (let i = 0; i < 18; i += 1) {
          game.particles.push({
            x: player.x + player.w / 2, y: player.y + player.h / 2,
            vx: (Math.random() - 0.5) * 7,
            vy: (Math.random() - 0.5) * 7,
            life: 40,
            color: '#ff5b8a',
          });
        }
      }
    }
  }
}

// ========== BULLETS & PARTICLES ==========
function updateBullets() {
  for (const b of game.bullets) {
    b.x += b.vx;
    b.life -= 1;
  }
  game.bullets = game.bullets.filter((b) => b.life > 0 && b.x > -50 && b.x < WORLD_WIDTH + 50);
}

function drawBullets() {
  const img = images.bullet;
  if (!img.complete) return;
  for (const b of game.bullets) {
    ctx.drawImage(img, b.x - 24 - game.camera.x, b.y - 24 - game.camera.y, 48, 48);
  }
}

function updateParticles() {
  for (const p of game.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.2;
    p.life -= 1;
  }
  game.particles = game.particles.filter((p) => p.life > 0);
}

function drawParticles() {
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, p.life / 40);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - game.camera.x, p.y - game.camera.y, 4, 4);
  }
  ctx.globalAlpha = 1;
}

// ========== BACKGROUND ==========
function initBackground() {
  // звёзды падают
  for (let i = 0; i < 120; i += 1) {
    game.bgStars.push({
      x: Math.random() * WORLD_WIDTH,
      y: Math.random() * WORLD_HEIGHT,
      size: 1 + Math.random() * 3,
      speed: 1 + Math.random() * 3,
      color: Math.random() < 0.5 ? '#ffffff' : (Math.random() < 0.5 ? '#ffd966' : '#ff9eb5'),
    });
  }
  // облачка летают
  for (let i = 0; i < 14; i += 1) {
    game.bgClouds.push({
      x: Math.random() * WORLD_WIDTH,
      y: 40 + Math.random() * 220,
      w: 60 + Math.random() * 80,
      h: 24 + Math.random() * 30,
      speed: 0.2 + Math.random() * 0.5,
    });
  }
  // паутинки с пауками — черные паучки ползают вверх-вниз
  const webCount = 18;
  for (let i = 0; i < webCount; i += 1) {
    const wx = 400 + i * (WORLD_WIDTH - 800) / webCount + Math.random() * 80;
    const wyTop = 80 + Math.random() * 200;
    const wyLen = 180 + Math.random() * 260;
    game.webStrings.push({ x: wx, y: wyTop, len: wyLen });
    game.webSpiders.push({
      x: wx,
      y: wyTop + Math.random() * wyLen,
      top: wyTop,
      bottom: wyTop + wyLen,
      speed: 0.4 + Math.random() * 0.7,
      phase: Math.random() * Math.PI * 2,
      dir: 1,
    });
  }
  // маленькие фоновые существа (паучки и инопланетяне) хаотично движутся
  for (let i = 0; i < 22; i += 1) {
    const isAlien = Math.random() < 0.4;
    game.bgFigures.push({
      type: isAlien ? 'alien' : 'spider',
      x: Math.random() * WORLD_WIDTH,
      y: 50 + Math.random() * 380,
      vx: (Math.random() - 0.5) * 1.4,
      vy: (Math.random() - 0.5) * 0.6,
      frame: Math.floor(Math.random() * 4),
      frameTimer: Math.floor(Math.random() * 10),
    });
  }
}

function updateBackground() {
  for (const s of game.bgStars) {
    s.y += s.speed;
    if (s.y > WORLD_HEIGHT) {
      s.y = -10;
      s.x = Math.random() * WORLD_WIDTH;
    }
  }
  for (const c of game.bgClouds) {
    c.x += c.speed;
    if (c.x > WORLD_WIDTH + 100) c.x = -100;
  }
  for (const s of game.webSpiders) {
    s.y += s.speed * s.dir;
    if (s.y > s.bottom) { s.y = s.bottom; s.dir = -1; }
    if (s.y < s.top) { s.y = s.top; s.dir = 1; }
  }
  for (const f of game.bgFigures) {
    f.x += f.vx;
    f.y += f.vy;
    f.frameTimer += 1;
    if (f.frameTimer % 12 === 0) f.frame = (f.frame + 1) % 4;
    // отскок от границ своей зоны
    if (f.x < 50 || f.x > WORLD_WIDTH - 50) f.vx = -f.vx;
    if (f.y < 30 || f.y > WORLD_HEIGHT - 120) f.vy = -f.vy;
    // периодически меняем направление
    if (Math.random() < 0.01) { f.vx = (Math.random() - 0.5) * 1.6; f.vy = (Math.random() - 0.5) * 0.8; }
  }
}

function drawSkyGradient() {
  const grad = ctx.createLinearGradient(0, 0, 0, CAMERA_HEIGHT);
  grad.addColorStop(0, '#5dd0e3');
  grad.addColorStop(0.6, '#7fd6c8');
  grad.addColorStop(1, '#8fb86b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CAMERA_WIDTH, CAMERA_HEIGHT);
}

function drawBackground() {
  drawSkyGradient();
  // дальние облачка
  for (const c of game.bgClouds) {
    const sx = c.x - game.camera.x * 0.3;
    const sy = c.y;
    drawCloud(sx, sy, c.w, c.h);
  }
  // звёзды падают
  for (const s of game.bgStars) {
    const sx = s.x - game.camera.x * 0.5;
    const sy = s.y;
    if (sx < -10 || sx > CAMERA_WIDTH + 10) continue;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
    ctx.fill();
    // хвостик у падающей звезды
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx, sy - s.size * 6);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // фоновые маленькие существа
  for (const f of game.bgFigures) {
    const sx = f.x - game.camera.x * 0.7;
    const sy = f.y;
    if (sx < -60 || sx > CAMERA_WIDTH + 60) continue;
    const spriteName = `enemy_${f.type}_spritesheet`;
    const img = images[spriteName];
    if (!img.complete) continue;
    const fw = img.width / 4;
    ctx.globalAlpha = 0.5;
    ctx.drawImage(img, f.frame * fw, 0, fw, img.height, sx - 25, sy - 25, 50, 50);
    ctx.globalAlpha = 1;
  }
}

function drawCloud(x, y, w, h) {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, h * 0.6, 0, Math.PI * 2);
  ctx.arc(x + w * 0.4, y - h * 0.2, h * 0.7, 0, Math.PI * 2);
  ctx.arc(x + w * 0.8, y, h * 0.55, 0, Math.PI * 2);
  ctx.arc(x + w * 0.5, y + h * 0.1, h * 0.5, 0, Math.PI * 2);
  ctx.fill();
  // глаза
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(x + w * 0.4 - 3, y + 2, 2, 0, Math.PI * 2);
  ctx.arc(x + w * 0.6 + 3, y + 2, 2, 0, Math.PI * 2);
  ctx.fill();
  // румянец
  ctx.fillStyle = '#ffb3c1';
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(x + w * 0.4 - 8, y + 6, 3, 0, Math.PI * 2);
  ctx.arc(x + w * 0.6 + 8, y + 6, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ========== WEBS & BACKGROUND SPIDERS ==========
function drawWebs() {
  for (const w of game.webStrings) {
    const sx = w.x - game.camera.x * 0.8;
    if (sx < -40 || sx > CAMERA_WIDTH + 40) continue;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, w.len);
    ctx.stroke();
  }
  for (const s of game.webSpiders) {
    const sx = s.x - game.camera.x * 0.8;
    const sy = s.y;
    if (sx < -40 || sx > CAMERA_WIDTH + 40) continue;
    const img = images.enemy_spider_spritesheet;
    if (!img.complete) continue;
    const fw = img.width / 4;
    ctx.drawImage(img, s.frame * fw, 0, fw, img.height, sx - 22, sy - 18, 44, 36);
  }
  // spider frame
  for (const s of game.webSpiders) {
    s.frameTimer = (s.frameTimer || 0) + 1;
    if (s.frameTimer % 10 === 0) s.frame = ((s.frame || 0) + 1) % 4;
  }
}

// ========== PLATFORMS ==========
function drawPlatforms() {
  for (const p of game.platforms) {
    const sx = p.x - game.camera.x;
    const sy = p.y - game.camera.y;
    if (sx + p.w < -10 || sx > CAMERA_WIDTH + 10) continue;
    const img = images[`${p.type}_tile`];
    if (!img.complete) continue;
    ctx.drawImage(img, sx, sy, p.w, p.h);
  }
}

// ========== FINISH FLAG ==========
function drawFinish() {
  const sx = game.finishX - game.camera.x;
  const sy = WORLD_HEIGHT - TILE_SIZE - 180 - game.camera.y;
  // древко
  ctx.fillStyle = '#222';
  ctx.fillRect(sx + 30, sy, 4, 180);
  // флажок
  ctx.fillStyle = '#ff5b8a';
  ctx.beginPath();
  ctx.moveTo(sx + 34, sy);
  ctx.lineTo(sx + 90, sy + 25);
  ctx.lineTo(sx + 34, sy + 50);
  ctx.fill();
  // звёздочка
  ctx.fillStyle = '#ffd966';
  ctx.beginPath();
  ctx.arc(sx + 60, sy + 25, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('★', sx + 56, sy + 30);
}

// ========== CAMERA ==========
function updateCamera() {
  const targetX = player.x + player.w / 2 - CAMERA_WIDTH / 2;
  game.camera.x += (targetX - game.camera.x) * 0.1;
  game.camera.y = 0;
  if (game.camera.x < 0) game.camera.x = 0;
  if (game.camera.x > WORLD_WIDTH - CAMERA_WIDTH) game.camera.x = WORLD_WIDTH - CAMERA_WIDTH;
}

// ========== HUD ==========
function drawHUD() {
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(10, 10, 230, 60);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 230, 60);
  ctx.fillStyle = '#222';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`Score: ${game.score}`, 22, 36);
  ctx.fillStyle = '#ff5b8a';
  ctx.fillText(`Time: ${((performance.now() - game.timeStart) / 1000).toFixed(1)}s`, 22, 58);

  // мини-карта прогресса
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(CAMERA_WIDTH - 230, 10, 220, 26);
  ctx.strokeRect(CAMERA_WIDTH - 230, 10, 220, 26);
  ctx.fillStyle = '#7ec8ff';
  const progress = Math.min(1, player.x / game.finishX);
  ctx.fillRect(CAMERA_WIDTH - 226, 14, 212 * progress, 18);
  ctx.fillStyle = '#222';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('progress →', CAMERA_WIDTH - 220, 28);
}

// ========== OVERLAYS ==========
function drawOverlay(title, sub) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, CAMERA_WIDTH, CAMERA_HEIGHT);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, CAMERA_WIDTH / 2, CAMERA_HEIGHT / 2 - 20);
  ctx.font = '24px sans-serif';
  ctx.fillText(sub, CAMERA_WIDTH / 2, CAMERA_HEIGHT / 2 + 30);
  ctx.font = '18px sans-serif';
  ctx.fillText('Press R to restart', CAMERA_WIDTH / 2, CAMERA_HEIGHT / 2 + 70);
  ctx.textAlign = 'left';
}

// ========== GAME LOOP ==========
function loop() {
  // background
  drawBackground();
  drawWebs();

  ctx.save();
  ctx.translate(-game.camera.x, -game.camera.y);

  drawPlatforms();
  drawFinish();
  drawEnemies();
  player.draw();
  drawBullets();
  drawParticles();

  ctx.restore();

  drawHUD();

  // update
  if (game.state === 'playing') {
    updateCamera();
    player.update();
    updateEnemies();
    updateBullets();
    updateParticles();
    handleCollisions();
    updateBackground();
  }

  if (game.state === 'dead') {
    drawOverlay('Game Over', `Score: ${game.score}`);
  }
  if (game.state === 'win') {
    const t = ((performance.now() - game.timeStart) / 1000).toFixed(1);
    drawOverlay('You Win!', `Time: ${t}s — Score: ${game.score}`);
  }

  requestAnimationFrame(loop);
}

function restart() {
  player.x = 80;
  player.y = WORLD_HEIGHT - TILE_SIZE * 3;
  player.vx = 0;
  player.vy = 0;
  player.alive = true;
  game.bullets = [];
  game.particles = [];
  game.enemies = [];
  spawnEnemies();
  game.score = 0;
  game.camera.x = 0;
  game.timeStart = performance.now();
  game.state = 'playing';
}

function start() {
  initBackground();
  game.timeStart = performance.now();
  requestAnimationFrame(loop);
}