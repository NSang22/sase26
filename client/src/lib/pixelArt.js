// Shared pixel art rendering utilities used by LandingPage and WaitingRoom

export const POKEMON_SPRITES = {
  pikachu: {
    color: '#F8D030',
    accent: '#B8860B',
    cheeks: '#E85050',
    size: 32,
    name: 'Pikachu',
  },
  jigglypuff: {
    color: '#FFB8E0',
    accent: '#68C8A0',
    cheeks: '#FF6090',
    size: 32,
    name: 'Jigglypuff',
  },
  bulbasaur: {
    color: '#68B868',
    accent: '#48D0B0',
    cheeks: '#68B868',
    size: 32,
    name: 'Bulbasaur',
  },
  squirtle: {
    color: '#58A8E8',
    accent: '#C09858',
    cheeks: '#58A8E8',
    size: 32,
    name: 'Squirtle',
  },
  charmander: {
    color: '#F08830',
    accent: '#F8D030',
    cheeks: '#F08830',
    size: 32,
    name: 'Charmander',
  },
};

export function fillRect(ctx, x, y, w, h) {
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function drawPixelPokemon(ctx, x, y, pokemon, frame, scale = 3) {
  const p = POKEMON_SPRITES[pokemon];
  const s = scale;
  const bounce = Math.sin(frame * 0.08) * 2 * s;
  const blink = Math.floor(frame / 40) % 8 === 0;
  const yOff = y + bounce;

  ctx.imageSmoothingEnabled = false;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + 8 * s, y + 18 * s, 6 * s, 2 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = p.color;
  fillRect(ctx, x + 3 * s, yOff + 6 * s, 10 * s, 10 * s);

  // Head
  ctx.fillStyle = p.color;
  fillRect(ctx, x + 2 * s, yOff + 1 * s, 12 * s, 8 * s);

  // Ears/features based on Pokemon
  if (pokemon === 'pikachu') {
    ctx.fillStyle = p.color;
    fillRect(ctx, x + 1 * s, yOff - 3 * s, 2 * s, 5 * s);
    fillRect(ctx, x + 13 * s, yOff - 3 * s, 2 * s, 5 * s);
    ctx.fillStyle = '#282828';
    fillRect(ctx, x + 1 * s, yOff - 3 * s, 2 * s, 2 * s);
    fillRect(ctx, x + 13 * s, yOff - 3 * s, 2 * s, 2 * s);
    ctx.fillStyle = p.cheeks;
    fillRect(ctx, x + 1 * s, yOff + 5 * s, 2 * s, 2 * s);
    fillRect(ctx, x + 13 * s, yOff + 5 * s, 2 * s, 2 * s);
    ctx.fillStyle = p.accent;
    fillRect(ctx, x + 14 * s, yOff + 4 * s, 2 * s, 2 * s);
    fillRect(ctx, x + 16 * s, yOff + 2 * s, 2 * s, 2 * s);
    fillRect(ctx, x + 16 * s, yOff + 0 * s, 3 * s, 2 * s);
  } else if (pokemon === 'jigglypuff') {
    // Rounder pink body
    ctx.fillStyle = p.color;
    fillRect(ctx, x + 2 * s, yOff + 7 * s, 12 * s, 8 * s);
    // Hair curl
    ctx.fillStyle = '#FF90C0';
    fillRect(ctx, x + 6 * s, yOff - 3 * s, 4 * s, 3 * s);
    fillRect(ctx, x + 7 * s, yOff - 5 * s, 3 * s, 3 * s);
    // Ear tufts
    fillRect(ctx, x + 1 * s, yOff - 1 * s, 3 * s, 3 * s);
    fillRect(ctx, x + 12 * s, yOff - 1 * s, 3 * s, 3 * s);
    // Cheeks
    ctx.fillStyle = p.cheeks;
    fillRect(ctx, x + 1 * s, yOff + 5 * s, 2 * s, 2 * s);
    fillRect(ctx, x + 13 * s, yOff + 5 * s, 2 * s, 2 * s);
    // Big green eyes
    ctx.fillStyle = p.accent;
    fillRect(ctx, x + 4 * s, yOff + 3 * s, 3 * s, 3 * s);
    fillRect(ctx, x + 9 * s, yOff + 3 * s, 3 * s, 3 * s);
  } else if (pokemon === 'bulbasaur') {
    ctx.fillStyle = p.accent;
    fillRect(ctx, x + 4 * s, yOff - 2 * s, 8 * s, 4 * s);
    fillRect(ctx, x + 5 * s, yOff - 4 * s, 6 * s, 3 * s);
    ctx.fillStyle = '#48A068';
    fillRect(ctx, x + 4 * s, yOff + 8 * s, 2 * s, 2 * s);
    fillRect(ctx, x + 10 * s, yOff + 9 * s, 2 * s, 2 * s);
  } else if (pokemon === 'squirtle') {
    ctx.fillStyle = p.accent;
    fillRect(ctx, x + 3 * s, yOff + 8 * s, 10 * s, 8 * s);
    ctx.fillStyle = '#805028';
    fillRect(ctx, x + 5 * s, yOff + 10 * s, 6 * s, 4 * s);
    ctx.fillStyle = '#58A8E8';
    fillRect(ctx, x + 14 * s, yOff + 10 * s, 3 * s, 3 * s);
    fillRect(ctx, x + 16 * s, yOff + 8 * s, 2 * s, 3 * s);
  } else if (pokemon === 'charmander') {
    ctx.fillStyle = p.accent;
    fillRect(ctx, x + 14 * s, yOff + 8 * s, 2 * s, 4 * s);
    ctx.fillStyle = '#F85030';
    fillRect(ctx, x + 15 * s, yOff + 6 * s, 3 * s, 4 * s);
    ctx.fillStyle = '#F8D030';
    fillRect(ctx, x + 16 * s, yOff + 4 * s + Math.sin(frame * 0.2) * s, 2 * s, 3 * s);
    ctx.fillStyle = '#F8E880';
    fillRect(ctx, x + 5 * s, yOff + 8 * s, 6 * s, 6 * s);
  }

  // Eyes
  if (!blink) {
    ctx.fillStyle = '#282828';
    fillRect(ctx, x + 4 * s, yOff + 3 * s, 2 * s, 2 * s);
    fillRect(ctx, x + 10 * s, yOff + 3 * s, 2 * s, 2 * s);
    ctx.fillStyle = '#FFFFFF';
    fillRect(ctx, x + 4 * s, yOff + 3 * s, 1 * s, 1 * s);
    fillRect(ctx, x + 10 * s, yOff + 3 * s, 1 * s, 1 * s);
  } else {
    ctx.fillStyle = '#282828';
    fillRect(ctx, x + 4 * s, yOff + 4 * s, 2 * s, 1 * s);
    fillRect(ctx, x + 10 * s, yOff + 4 * s, 2 * s, 1 * s);
  }

  // Mouth
  ctx.fillStyle = '#282828';
  fillRect(ctx, x + 7 * s, yOff + 6 * s, 2 * s, 1 * s);

  // Feet
  ctx.fillStyle = p.color;
  fillRect(ctx, x + 3 * s, yOff + 14 * s, 3 * s, 2 * s);
  fillRect(ctx, x + 10 * s, yOff + 14 * s, 3 * s, 2 * s);
}

export function drawParticle(ctx, x, y, size, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  fillRect(ctx, x, y, size, size);
  ctx.globalAlpha = 1;
}

export function drawStar(ctx, x, y, frame, seed) {
  const twinkle = Math.sin(frame * 0.03 + seed * 7) * 0.5 + 0.5;
  const size = seed > 0.7 ? 3 : seed > 0.4 ? 2 : 1;
  ctx.globalAlpha = twinkle * 0.8 + 0.2;
  ctx.fillStyle = seed > 0.8 ? '#F8D030' : seed > 0.5 ? '#A8D8F8' : '#FFFFFF';
  fillRect(ctx, x, y, size, size);
  ctx.globalAlpha = 1;
}

export function drawGround(ctx, width, height, frame) {
  const tileSize = 24;
  const groundY = height - 100;

  ctx.fillStyle = '#2D5A1E';
  ctx.fillRect(0, groundY, width, 100);

  for (let x = 0; x < width; x += tileSize) {
    ctx.fillStyle = x % (tileSize * 2) === 0 ? '#347A24' : '#2D6A1E';
    ctx.fillRect(x, groundY, tileSize, 4);
    if (Math.sin(x * 0.5 + frame * 0.02) > 0.3) {
      ctx.fillStyle = '#4CAF50';
      const bladeOffset = Math.sin(frame * 0.05 + x * 0.1) * 2;
      fillRect(ctx, x + 4 + bladeOffset, groundY - 4, 2, 6);
      fillRect(ctx, x + 14 + bladeOffset * 0.7, groundY - 3, 2, 5);
    }
  }

  ctx.fillStyle = '#8B7355';
  ctx.fillRect(0, groundY + 20, width, 30);
  ctx.fillStyle = '#9B8365';
  for (let x = 0; x < width; x += 32) {
    ctx.fillRect(x + 2, groundY + 22, 28, 26);
  }
  ctx.fillStyle = '#7B6345';
  for (let x = 0; x < width; x += 32) {
    ctx.fillRect(x, groundY + 20, 32, 2);
  }
}
