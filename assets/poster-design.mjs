export const patternCenterY = .57;
const headlines = {
  red: 'KEEP AWAY FROM THE RED',
  amber: 'PATTERNS ARE DANGEROUS',
  blue: 'DON’T EAT THE MOLD',
  green: 'REPORT LEVITATING OBJECTS',
};
const originalFooter = 'You are not a copy of a copy of a copy of a copy of a copy of a copy of a copy of a copy of a copy';
const symmetryWarning = 'Symmetrically grouped objects or people may pose a serious risk. Contact FBC for further information';

export function defaultPosterCopyForPalette(palette) {
  return {
    headline: headlines[palette] ?? headlines.red,
    footerCopy: palette === 'amber' || palette === 'green' ? symmetryWarning : originalFooter,
  };
}

const credit = 'Patterning\nA browser-based poster maker';
const fontFamily = 'Patterning Inter';

export async function loadPosterAssets() {
  await document.fonts.load(`900 16px "${fontFamily}"`);
}

function wrapText(ctx, text, width) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/u)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      // Break unusually long tokens too, so a single word can never overflow the box.
      for (const character of word) {
        if (line && ctx.measureText(line + character).width > width) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

function paintText(ctx, text, {x, y, width, size, maxLines, leading, weight, align = 'left'}) {
  const content = text.trim();
  if (!content) return;
  const maxHeight = size * leading * maxLines;
  const measure = fontSize => {
    ctx.font = `${weight} ${fontSize}px "${fontFamily}", sans-serif`;
    ctx.letterSpacing = `${fontSize * -.02}px`;
    return wrapText(ctx, content, width);
  };
  let fontSize = size;
  let lines = measure(fontSize);
  if (lines.length > maxLines) {
    let low = 0;
    let high = size;
    for (let step = 0; step < 14; step++) {
      const middle = (low + high) / 2;
      const candidate = measure(middle);
      if (candidate.length * middle * leading <= maxHeight) low = middle;
      else high = middle;
    }
    fontSize = low;
    lines = measure(fontSize);
  }

  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const lineHeight = fontSize * leading;
  const capHeight = ctx.measureText('H').actualBoundingBoxAscent;
  const baseline = y + (lineHeight + capHeight) / 2;
  for (const [index, line] of lines.entries()) {
    ctx.fillText(line, x, baseline + index * lineHeight, width);
  }
}

function posterTextLayout(vertical, format) {
  const square = format === 'square';
  const footerStyle = {y: 2199.16 * vertical, width: 360.056, size: square ? 19.64 : 22.314, maxLines: 3, leading: 1.1, weight: 500};
  return {
    headline: {
      x: 795.75, y: (format === 'story' ? 146.12 : 98.12) * vertical, width: 1417.125,
      size: square ? 181 : 232, maxLines: square ? 2 : 3, leading: .9, weight: 900, align: 'center',
    },
    footerCopy: {...footerStyle, x: 1119.41},
  };
}

export function posterTextBounds(width, height, format) {
  const scale = width / 1600;
  const layout = posterTextLayout(height / scale / 2400, format);
  return Object.fromEntries(Object.entries(layout).map(([key, box]) => [
    key,
    {
      left: (box.x - (box.align === 'center' ? box.width / 2 : 0)) * scale,
      top: box.y * scale,
      width: box.width * scale,
      height: box.size * box.leading * box.maxLines * scale,
      fontSize: box.size * scale,
    },
  ]));
}

export function paintPosterDesign(ctx, width, height, copy, format, editing = null) {
  if (!width || !height) return;
  const scale = width / 1600;
  const vertical = height / scale / 2400;
  const {headline, footerCopy} = posterTextLayout(vertical, format);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';

  if (editing !== 'headline') paintText(ctx, copy.headline.toUpperCase(), headline);
  paintText(ctx, credit, {...footerCopy, x: 87.19});
  if (editing !== 'footerCopy') paintText(ctx, copy.footerCopy, footerCopy);

  ctx.restore();
}
