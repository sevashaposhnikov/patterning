const palettes = {
  red: {dark: '#170406', light: '247, 32, 24', core: '255, 114, 78'},
  blue: {dark: '#041820', light: '32, 163, 205', core: '99, 219, 237'},
  green: {dark: '#04160e', light: '38, 186, 109', core: '129, 241, 164'},
  amber: {dark: '#220e04', light: '247, 127, 25', core: '255, 183, 87'},
};

export function lightingPalette(theme) {
  return palettes[theme] ?? palettes.red;
}

function polygon(ctx, points, fill) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

function glow(ctx, x, y, rx, ry, color, strength) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const light = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  light.addColorStop(0, `rgba(${color}, ${strength})`);
  light.addColorStop(.46, `rgba(${color}, ${strength * .48})`);
  light.addColorStop(1, `rgba(${color}, 0)`);
  ctx.fillStyle = light;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

function wall(ctx, palette, right) {
  ctx.save();
  if (right) {
    ctx.translate(1, 0);
    ctx.scale(-1, 1);
  }
  const edge = .30;
  const foot = .485;
  const shade = ctx.createLinearGradient(.03, 0, .49, 0);
  shade.addColorStop(0, '#060407');
  shade.addColorStop(.48, palette.dark);
  shade.addColorStop(1, `rgb(${palette.light})`);
  polygon(ctx, [[0, 0], [edge, 0], [edge + .03, .12], [edge + .075, .12],
    [edge + .11, .31], [foot - .02, .31], [foot, .66], [0, .92]], shade);
  ctx.clip();

  glow(ctx, .37, .4, .39, .62, palette.light, .38);

  // Narrow window recesses shrink in both directions toward the vanishing point.
  const project = (depth, height) => [.49 * depth, .66 + (height - .66) * (1 - .84 * depth)];
  for (const [near, far] of [[.1, .24], [.35, .45], [.55, .62], [.71, .77], [.84, .88]]) {
    for (const top of [.06, .23, .41, .59, .74]) {
      const bottom = top + .093;
      polygon(ctx, [project(near, top), project(far, top), project(far, bottom), project(near, bottom)],
        '#070509a8');
      polygon(ctx, [project(near, bottom), project(far, bottom),
        project(far, bottom + .009), project(near, bottom + .009)], `rgba(${palette.core}, .16)`);
    }
  }

  // Facade seams and window bays converge toward the end of the passage.
  for (const x of [.06, .18, .29, .38, .44]) {
    const distant = .49 - (.49 - x) * .11;
    polygon(ctx, [[x, 0], [x + .014, 0], [distant + .005, .71], [distant, .71]], '#070409a0');
  }
  for (const y of [.12, .25, .41, .57, .72, .88]) {
    const far = .66 + (y - .66) * .16;
    polygon(ctx, [[0, y], [.5, far], [.5, far + .004], [0, y + .013]], '#060307b5');
    polygon(ctx, [[0, y + .013], [.5, far + .004], [.5, far + .006], [0, y + .017]],
      `rgba(${palette.light}, .12)`);
  }

  const shadow = ctx.createLinearGradient(.07, 0, .49, 0);
  shadow.addColorStop(0, '#030305ed');
  shadow.addColorStop(.67, '#03030569');
  shadow.addColorStop(1, '#03030519');
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, .5, 1);
  ctx.restore();
}

function drawAlley(ctx, width, height, theme) {
  const palette = lightingPalette(theme);
  ctx.save();
  ctx.scale(width, height);
  ctx.fillStyle = palette.dark;
  ctx.fillRect(0, 0, 1, 1);
  glow(ctx, .5, .21, .43, .76, palette.light, .94);
  glow(ctx, .5, .48, .25, .47, palette.core, .65);

  const floor = ctx.createLinearGradient(0, .64, 0, 1);
  floor.addColorStop(0, `rgba(${palette.light}, .48)`);
  floor.addColorStop(1, '#070407');
  polygon(ctx, [[0, .87], [.475, .65], [.525, .65], [1, .87], [1, 1], [0, 1]], floor);
  glow(ctx, .5, .81, .23, .29, palette.light, .55);
  glow(ctx, .5, .88, .087, .31, palette.core, .42);
  for (let i = 0; i < 26; i++) {
    const depth = i / 26;
    const y = .66 + .34 * depth ** 1.6;
    const spread = .018 + depth * .16;
    const x = .5;
    polygon(ctx, [[x - spread, y], [x + spread, y], [x + spread * .7, y + .002 + depth * .004],
      [x - spread * .7, y + .002 + depth * .004]], `rgba(${palette.core}, ${.09 + (i % 4) * .025})`);
  }

  wall(ctx, palette, false);
  wall(ctx, palette, true);
  glow(ctx, .5, .61, .19, .18, palette.light, .35);
  const vignette = ctx.createRadialGradient(.5, .46, .13, .5, .46, .68);
  vignette.addColorStop(0, '#0000');
  vignette.addColorStop(.62, '#0002');
  vignette.addColorStop(1, '#020104e8');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, 1, 1);
  ctx.restore();
}


const alleyCache = new Map();

function blurPass(source, target, width, height, radius, vertical) {
  const lineCount = vertical ? width : height;
  const lineLength = vertical ? height : width;
  const pixelStride = vertical ? width * 4 : 4;
  const lineStride = vertical ? 4 : width * 4;
  const kernelSize = radius * 2 + 1;
  const last = lineLength - 1;

  for (let line = 0; line < lineCount; line++) {
    for (let channel = 0; channel < 3; channel++) {
      const start = line * lineStride + channel;
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        sum += source[start + Math.max(0, Math.min(last, offset)) * pixelStride];
      }
      for (let pixel = 0; pixel < lineLength; pixel++) {
        target[start + pixel * pixelStride] = sum / kernelSize;
        const outgoing = Math.max(0, pixel - radius);
        const incoming = Math.min(last, pixel + radius + 1);
        sum += source[start + incoming * pixelStride] - source[start + outgoing * pixelStride];
      }
    }
  }
}

export function paintAlley(ctx, width, height, theme) {
  if (width <= 0 || height <= 0) return;
  const bufferWidth = 128;
  const bufferHeight = Math.max(1, Math.round(bufferWidth * height / width));
  const key = `${theme}/${bufferHeight}`;
  let background = alleyCache.get(key);
  if (!background) {
    background = document.createElement('canvas');
    background.width = bufferWidth;
    background.height = bufferHeight;
    const buffer = background.getContext('2d', {willReadFrequently: true});
    drawAlley(buffer, bufferWidth, bufferHeight, theme);

    // Blur the opaque backdrop only. Three box passes give a soft, Gaussian-like falloff.
    const image = buffer.getImageData(0, 0, bufferWidth, bufferHeight);
    const scratch = new Uint8ClampedArray(image.data.length);
    for (const radius of [4, 5, 5]) {
      blurPass(image.data, scratch, bufferWidth, bufferHeight, radius, false);
      blurPass(scratch, image.data, bufferWidth, bufferHeight, radius, true);
    }
    buffer.putImageData(image, 0, 0);
    alleyCache.set(key, background);
  }
  ctx.drawImage(background, 0, 0, width, height);
}

const spectrum = [
  [0, '#8a64ff00'], [.20, '#8a64ff30'], [.36, '#5b9bff70'], [.49, '#39eac268'],
  [.60, '#e9ed6970'], [.71, '#ff98436b'], [.81, '#fc4c6a50'], [1, '#fc4c6a00'],
];

export function paintRainbowHalo(ctx, width, height, radiusFraction, centerY = .5, pulse = 0) {
  const x = width / 2;
  const y = height * centerY;
  const baseRadius = width * radiusFraction * (1 - .055 * pulse);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const [scale, opacity, reversed] of [[1, .17, false], [1.115, .075, true], [1.225, .032, false]]) {
    const radius = baseRadius * scale;
    const outer = radius * 1.055;
    const band = ctx.createRadialGradient(x, y, radius * .945, x, y, outer);
    for (const [stop, color] of spectrum) band.addColorStop(reversed ? 1 - stop : stop, color);
    ctx.globalAlpha = opacity * .75 * (1 - .32 * pulse);
    ctx.fillStyle = band;
    ctx.fillRect(x - outer, y - outer, outer * 2, outer * 2);
  }
  ctx.restore();
}
