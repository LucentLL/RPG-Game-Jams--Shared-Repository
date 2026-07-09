// ═══════════════════════════════════════════════════════════════════════════
// Procedural tile renderer — canvas-drawn battlefield tiles.
//
// Extracted from crucible.js (engine decomposition, Phase B). Pure drawing
// helpers with NO game state: given a 2D context and a tile-type coordinate they
// paint grass, cliffs, water, rocks, and flowers, deterministically per tile via
// tileRng so a battlefield always renders the same. `drawProceduralTile` is the
// dispatcher; `drawGrass` is also reused by the action-arena and ranch grass
// bakers, so both are exported. The rest are module-private helpers.
// ═══════════════════════════════════════════════════════════════════════════
import { tileRng } from './rng.js';

// === PROCEDURAL TILE RENDERER ===
// Replaces Mana Seed tileset with canvas-drawn tiles

export function drawProceduralTile(ctx, tileType, x, y, size, row, col) {
  var rng = tileRng(row * 137 + col * 311 + tileType[0] * 17 + tileType[1] * 53);
  var tx = tileType[0], ty = tileType[1];

  // Identify tile by its coordinate signature
  if (ty === 0 && tx === 0) {
    // GRASS
    drawGrass(ctx, x, y, size, rng);
  } else if (ty === 3) {
    // CLIFF TOP EDGE
    drawGrass(ctx, x, y, size, rng);
    drawCliffTop(ctx, x, y, size, tx, rng);
  } else if (ty === 5) {
    // CLIFF FACE
    drawCliffFace(ctx, x, y, size, tx, rng);
  } else if (ty === 6) {
    // CLIFF-WATER junction
    drawWater(ctx, x, y, size, rng);
    drawCliffWaterEdge(ctx, x, y, size, tx, rng);
  } else if (ty === 7) {
    // WATER
    drawWater(ctx, x, y, size, rng);
  } else if (ty === 8) {
    // WATER BOTTOM
    drawGrass(ctx, x, y, size, rng);
    drawWaterBottom(ctx, x, y, size, tx, rng);
  } else if (ty === 1 && tx >= 6 && tx <= 7) {
    // ROCKS
    drawGrass(ctx, x, y, size, rng);
    drawRock(ctx, x, y, size, rng, tx - 6);
  } else if (ty === 1 && tx >= 8 && tx <= 9) {
    // FLOWERS
    drawGrass(ctx, x, y, size, rng);
    drawFlowers(ctx, x, y, size, rng, tx - 8);
  } else {
    drawGrass(ctx, x, y, size, rng);
  }
}

export function drawGrass(ctx, x, y, size, rng) {
  // Base grass color
  ctx.fillStyle = '#3a6e2c';
  ctx.fillRect(x, y, size, size);

  // Pixel noise for texture
  var step = Math.max(4, size / 16);
  for (var py = 0; py < size; py += step) {
    for (var px = 0; px < size; px += step) {
      var r = rng();
      var brightness = 0.85 + r * 0.3;
      var g = Math.floor(110 * brightness);
      var rb = Math.floor(58 * brightness);
      var b = Math.floor(44 * brightness);
      ctx.fillStyle = 'rgb(' + rb + ',' + g + ',' + b + ')';
      ctx.fillRect(x + px, y + py, step, step);
    }
  }

  // Subtle grass blades
  ctx.strokeStyle = 'rgba(80,140,50,0.4)';
  ctx.lineWidth = 1;
  for (var i = 0; i < 6; i++) {
    var bx = x + rng() * size;
    var by = y + rng() * size;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + (rng() - 0.5) * 6, by - 4 - rng() * 6);
    ctx.stroke();
  }
}

function drawCliffTop(ctx, x, y, size, tx, rng) {
  // Draw cliff edge at bottom of tile
  var edgeY = y + size * 0.6;

  // Stone color
  ctx.fillStyle = '#8b7355';
  ctx.fillRect(x, edgeY, size, size - size * 0.6);

  // Darker edge line
  ctx.fillStyle = '#6b5335';
  ctx.fillRect(x, edgeY, size, 3);

  // Corner handling
  if (tx === 0) { // left corner
    ctx.fillStyle = '#3a6e2c';
    ctx.fillRect(x, edgeY, size * 0.15, size * 0.4);
  } else if (tx === 3) { // right corner
    ctx.fillStyle = '#3a6e2c';
    ctx.fillRect(x + size * 0.85, edgeY, size * 0.15, size * 0.4);
  }

  // Stone texture
  for (var i = 0; i < 4; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(x + rng() * size * 0.8, edgeY + 4 + rng() * (size * 0.3),
                 4 + rng() * 8, 2 + rng() * 4);
  }
}

function drawCliffFace(ctx, x, y, size, tx, rng) {
  // Full stone face
  ctx.fillStyle = '#7a6345';
  ctx.fillRect(x, y, size, size);

  // Vertical streaks
  for (var i = 0; i < 5; i++) {
    var sx = x + rng() * size;
    ctx.fillStyle = 'rgba(0,0,0,' + (0.05 + rng() * 0.1) + ')';
    ctx.fillRect(sx, y, 2 + rng() * 4, size);
  }

  // Stone texture blocks
  for (var i = 0; i < 6; i++) {
    ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(x + rng() * size * 0.8, y + rng() * size * 0.8,
                 6 + rng() * 12, 4 + rng() * 8);
  }

  // Edge handling
  if (tx === 0) {
    ctx.fillStyle = '#5a4325';
    ctx.fillRect(x, y, 3, size);
  } else if (tx === 3) {
    ctx.fillStyle = '#5a4325';
    ctx.fillRect(x + size - 3, y, 3, size);
  }
}

function drawWater(ctx, x, y, size, rng) {
  // Deep water base
  ctx.fillStyle = '#1a3a5c';
  ctx.fillRect(x, y, size, size);

  // Water noise
  var step = Math.max(4, size / 12);
  for (var py = 0; py < size; py += step) {
    for (var px = 0; px < size; px += step) {
      var r = rng();
      ctx.fillStyle = 'rgba(' + (r > 0.5 ? '40,100,160' : '20,60,120') + ',0.3)';
      ctx.fillRect(x + px, y + py, step, step);
    }
  }

  // Wave highlights
  ctx.strokeStyle = 'rgba(100,180,255,0.25)';
  ctx.lineWidth = 1.5;
  for (var i = 0; i < 3; i++) {
    var wy = y + size * 0.2 + i * size * 0.3;
    ctx.beginPath();
    ctx.moveTo(x + 4, wy);
    ctx.quadraticCurveTo(x + size * 0.5, wy - 3 + rng() * 6, x + size - 4, wy);
    ctx.stroke();
  }
}

function drawCliffWaterEdge(ctx, x, y, size, tx, rng) {
  // Cliff meets water - stone at top
  ctx.fillStyle = '#6b5335';
  ctx.fillRect(x, y, size, size * 0.35);

  // Shadow under cliff
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x, y + size * 0.35, size, size * 0.15);

  if (tx === 0) {
    ctx.fillStyle = '#5a4325';
    ctx.fillRect(x, y, 3, size);
  } else if (tx === 3) {
    ctx.fillStyle = '#5a4325';
    ctx.fillRect(x + size - 3, y, 3, size);
  }
}

function drawWaterBottom(ctx, x, y, size, tx, rng) {
  // Water-to-grass transition at top of tile
  ctx.fillStyle = '#1a3a5c';
  ctx.fillRect(x, y, size, size * 0.4);

  // Shore gradient
  ctx.fillStyle = 'rgba(58,110,44,0.3)';
  ctx.fillRect(x, y + size * 0.25, size, size * 0.15);

  // Foam line
  ctx.fillStyle = 'rgba(200,220,255,0.3)';
  ctx.fillRect(x, y + size * 0.35, size, 2);

  if (tx === 0) {
    ctx.fillStyle = '#3a6e2c';
    ctx.fillRect(x, y, size * 0.15, size * 0.4);
  } else if (tx === 3) {
    ctx.fillStyle = '#3a6e2c';
    ctx.fillRect(x + size * 0.85, y, size * 0.15, size * 0.4);
  }
}

function drawRock(ctx, x, y, size, rng, variant) {
  var cx = x + size * 0.5;
  var cy = y + size * 0.55;
  var rx = size * (0.25 + variant * 0.05);
  var ry = size * 0.2;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 3, rx, ry * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rock body
  ctx.fillStyle = '#706050';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.2, cy - ry * 0.3, rx * 0.5, ry * 0.4, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlowers(ctx, x, y, size, rng, variant) {
  var colors = variant === 0 ?
    ['#e8d040','#f0e060','#d0b030'] :
    ['#d050a0','#e070b0','#c04090'];

  for (var i = 0; i < 4 + Math.floor(rng() * 3); i++) {
    var fx = x + size * 0.15 + rng() * size * 0.7;
    var fy = y + size * 0.15 + rng() * size * 0.7;
    var fr = 2 + rng() * 3;

    // Stem
    ctx.strokeStyle = '#2a5e1c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx, fy + fr);
    ctx.lineTo(fx, fy + fr + 4 + rng() * 4);
    ctx.stroke();

    // Petals
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fill();

    // Center
    ctx.fillStyle = 'rgba(255,255,200,0.6)';
    ctx.beginPath();
    ctx.arc(fx, fy, fr * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}
