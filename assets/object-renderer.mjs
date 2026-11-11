export const COMPOSITION_SCALE=1.6;
export function compositionUnit(side,extent){return side/(2*extent)*COMPOSITION_SCALE;}

export function compositionBounds(items,sources){
 let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 for(const item of items){
  const source=sources[item.object],aspect=source.aspect??source.image.width/source.image.height;
  const anchor=source.anchor,b=source.bounds??{left:0,top:0,right:1,bottom:1},cos=Math.cos(item.rotation),sin=Math.sin(item.rotation);
  for(const x of [b.left,b.right])for(const y of [b.top,b.bottom]){
   const px=(x-anchor.x)*item.size*aspect,py=(y-anchor.y)*item.size;
   const tx=item.x+px*cos-py*sin,ty=item.y+px*sin+py*cos;
   left=Math.min(left,tx);right=Math.max(right,tx);top=Math.min(top,ty);bottom=Math.max(bottom,ty);
  }
 }
 return items.length?{left,top,right,bottom}:{left:0,top:0,right:0,bottom:0};
}
export function fittedCompositionUnit(width,height,preferredUnit,items,sources){
 const b=compositionBounds(items,sources),padding=Math.max(8,Math.min(width,height)*.045);
 const x=Math.max(Math.abs(b.left),Math.abs(b.right)),y=Math.max(Math.abs(b.top),Math.abs(b.bottom));
 return Math.min(preferredUnit,x?(width/2-padding)/x:Infinity,y?(height/2-padding)/y:Infinity);
}

const fringeMasks = new WeakMap();
const shadowMasks = new WeakMap();
const previewBuffers = new WeakMap();

function getFringeMasks(image) {
 const cached = fringeMasks.get(image);
 if (cached) return cached;

 const scale = Math.min(1, 512 / Math.max(image.width, image.height));
 const masks = ['#ff244b', '#46cbff'].map(color => {
  const mask = document.createElement('canvas');
  mask.width = Math.max(1, Math.round(image.width * scale));
  mask.height = Math.max(1, Math.round(image.height * scale));
  const context = mask.getContext('2d');
  context.drawImage(image, 0, 0, mask.width, mask.height);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, mask.width, mask.height);
  return mask;
 });
 fringeMasks.set(image, masks);
 return masks;
}

function getShadowMask(image) {
 let mask = shadowMasks.get(image);
 if (!mask) {
  const scale = Math.min(1, 512 / Math.max(image.width, image.height));
  mask = document.createElement('canvas');
  mask.width = Math.max(1, Math.round(image.width * scale));
  mask.height = Math.max(1, Math.round(image.height * scale));
  const ctx = mask.getContext('2d');
  ctx.drawImage(image, 0, 0, mask.width, mask.height);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, mask.width, mask.height);
  shadowMasks.set(image, mask);
 }
 return mask;
}

const blurWeights = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];

function blurAxis(context, source, stepX, stepY) {
 context.clearRect(0, 0, source.width, source.height);
 context.save();
 context.globalCompositeOperation = 'lighter';
 for (const [index, weight] of blurWeights.entries()) {
  const offset = index - 2;
  context.globalAlpha = weight;
  context.drawImage(source, offset * stepX, offset * stepY);
 }
 context.restore();
}

export function paintObjectLayers(target,{width,height,unit,items,sources,shadows=true,chromatic=false,lighting,centerY=.5,reuseBuffers=false,lightPulse=0,elementSize=100,tremorProgress=0,doubleExposure=null}){
 const scale=Math.hypot(target.getTransform().a,target.getTransform().b);
 const pixelWidth=Math.ceil(width*scale),pixelHeight=Math.ceil(height*scale),originX=pixelWidth/2,originY=pixelHeight*centerY;
 let buffers = reuseBuffers ? previewBuffers.get(target) : null;
 if (!buffers) {
  buffers = Array.from({length: 3}, () => document.createElement('canvas'));
  if (reuseBuffers) previewBuffers.set(target, buffers);
 }
 const [layer, stamp, shadow] = buffers;
 for (const buffer of [layer, stamp, shadow]) {
  if (buffer.width !== pixelWidth || buffer.height !== pixelHeight) {
   buffer.width = pixelWidth;
   buffer.height = pixelHeight;
  }
 }
 const receiver = layer.getContext('2d'), caster = stamp.getContext('2d'), sx = shadow.getContext('2d');
 receiver.clearRect(0, 0, pixelWidth, pixelHeight);
 function placement(item) {
  const {image, anchor} = sources[item.object];
  const h = item.size * unit * scale;
  const w = h * image.width / image.height;
  return {
   image, w, h, x: -w * anchor.x, y: -h * anchor.y,
   pivotX: originX + item.x * unit * scale,
   pivotY: originY + item.y * unit * scale,
  };
 }
 function drawItem(context, item, position) {
  const {image, w, h, x, y, pivotX, pivotY} = position;
  context.save();
  context.translate(pivotX, pivotY);
  context.rotate(item.rotation);
  if (chromatic) {
   const [red, blue] = getFringeMasks(image);
   const offset = Math.min(w, h) * .012;
   // Invert the local rotation so both fringes shift along the poster's horizontal axis.
   const dx = offset * Math.cos(item.rotation);
   const dy = -offset * Math.sin(item.rotation);
   context.globalAlpha = .224;
   context.drawImage(red, x - dx, y - dy, w, h);
   context.drawImage(blue, x + dx, y + dy, w, h);
   context.globalAlpha = 1;
  }
  context.drawImage(image, x, y, w, h);
  if (doubleExposure) {
   // The copy shares this object's pivot and rotation, with a short horizontal offset.
   const offset = Math.min(w, h) * (.02 + .015 * doubleExposure.strength) * doubleExposure.direction;
   const dx = offset * Math.cos(item.rotation);
   const dy = -offset * Math.sin(item.rotation);
   context.globalAlpha = .36 * doubleExposure.strength;
   context.drawImage(image, x + dx, y + dy, w, h);
  }
  context.restore();
 }
 function itemRegion(item, position, padding) {
  const {w, h, x, y, pivotX, pivotY} = position;
  const cos = Math.cos(item.rotation), sin = Math.sin(item.rotation);
  const dx = x + w / 2, dy = y + h / 2;
  const centerX = pivotX + dx * cos - dy * sin;
  const centerY = pivotY + dx * sin + dy * cos;
  const extentX = (Math.abs(cos) * w + Math.abs(sin) * h) / 2 + padding;
  const extentY = (Math.abs(sin) * w + Math.abs(cos) * h) / 2 + padding;
  const left = Math.max(0, Math.floor(centerX - extentX));
  const top = Math.max(0, Math.floor(centerY - extentY));
  return [left, top,
   Math.min(pixelWidth, Math.ceil(centerX + extentX)) - left,
   Math.min(pixelHeight, Math.ceil(centerY + extentY)) - top,
  ];
 }

 function castShadow(item, position, region, depth) {
  const {image, w, h, x, y, pivotX, pivotY} = position;
  const [left, top, regionWidth, regionHeight] = region;
  sx.clearRect(left, top, regionWidth, regionHeight);
  sx.save();
  sx.translate(pivotX, pivotY);
  sx.rotate(item.rotation);
  const mask = getShadowMask(image);
  // Canvas shadow offsets use poster axes even when the cutout is rotated.
  sx.shadowColor = '#000000c7';
  sx.shadowBlur = unit * .018 * scale * depth;
  sx.shadowOffsetX = unit * .030 * scale * depth;
  sx.shadowOffsetY = unit * .045 * scale * depth;
  sx.drawImage(mask, x, y, w, h);
  sx.shadowColor = '#000000cc';
  sx.shadowBlur = unit * .004 * scale;
  sx.shadowOffsetX = unit * .002 * scale;
  sx.shadowOffsetY = unit * .004 * scale;
  sx.drawImage(mask, x, y, w, h);
  sx.restore();
  // Clip cast shadows to the receiving cutouts, including the sector being painted.
  receiver.globalCompositeOperation = 'source-atop';
  receiver.drawImage(shadow, ...region, ...region);
  receiver.globalCompositeOperation = 'source-over';
 }

 const fullTurn = 2 * Math.PI;
 const clipRadius = Math.hypot(pixelWidth, pixelHeight) + 4;
 const branchOverlap = 2 / Math.max(1, Math.min(pixelWidth, pixelHeight));
 let hasPainted = false;

 function paintSector(entry, start, sweep) {
  const {item, position, region, depth, angle, halfSpan} = entry;
  const relative = ((angle - start) % fullTurn + fullTurn) % fullTurn;
  if (relative > sweep + halfSpan && relative < fullTurn - halfSpan) return;
  const clipped = sweep < fullTurn && (relative < halfSpan || relative > sweep - halfSpan);
  if (clipped) {
   receiver.save();
   receiver.beginPath();
   receiver.moveTo(originX, originY);
   receiver.arc(originX, originY, clipRadius, start, start + sweep);
   receiver.closePath();
   receiver.clip();
  }
  if (shadows && hasPainted) castShadow(item, position, region, depth);
  drawItem(receiver, item, position);
  if (clipped) receiver.restore();
  hasPainted = true;
 }

 function paintRing(ring) {
  const step = fullTurn / ring.length;
  // At each point, order the ring starting with the object on its opposite side.
  // A cutout switches passes at its own opposite ray, away from its visible edge.
  const branch = ring[0].azimuth + Math.PI - step / 2;
  const entries = [];
  for (const [index, item] of ring.entries()) {
   const position = placement(item);
   const depth = 1 + item.ring * .12;
   const padding = Math.ceil(Math.max(position.h * .05, unit * scale * depth * .11)) + 2;
   const region = itemRegion(item, position, padding);
   const [left, top, w, h] = region;
   if (w <= 0 || h <= 0) continue;
   const x = left + w / 2 - originX, y = top + h / 2 - originY;
   const radius = Math.hypot(w, h) / 2;
   const distance = Math.hypot(x, y);
   const halfSpan = distance <= radius ? Math.PI : Math.asin(radius / distance);
   entries.push({item, position, region, depth, angle:Math.atan2(y, x), halfSpan, cut:(index + .5) * step});
  }
  for (const entry of entries) paintSector(entry, branch - branchOverlap, entry.cut + branchOverlap);
  for (const entry of entries) paintSector(entry, branch + entry.cut, fullTurn - entry.cut + branchOverlap);
 }

 for (let start = 0; start < items.length;) {
  let end = start + 1;
  while (end < items.length && items[end].ring === items[start].ring) end++;
  paintRing(items.slice(start, end));
  start = end;
 }
 target.save();target.shadowColor='transparent';target.shadowBlur=target.shadowOffsetX=target.shadowOffsetY=0;

 // Keep the sampling resolution fixed during tremor and soften color and alpha together.
 const blur = width * scale * .005 * tremorProgress ** 1.4;
 const sampleWidth = Math.ceil(pixelWidth / 2);
 const sampleHeight = Math.ceil(pixelHeight / 2);

 function drawDefocused(source, offsetY = 0) {
  if (blur < .75) {
   target.drawImage(source, 0, offsetY, width, height);
   return;
  }
  const sample = buffers[3] ??= document.createElement('canvas');
  const intermediate = buffers[4] ??= document.createElement('canvas');
  for (const buffer of [sample, intermediate]) {
   if (buffer.width !== sampleWidth || buffer.height !== sampleHeight) {
    buffer.width = sampleWidth;
    buffer.height = sampleHeight;
   }
  }
  const sampling = sample.getContext('2d');
  sampling.clearRect(0, 0, sampleWidth, sampleHeight);
  sampling.drawImage(source, 0, 0, sampleWidth, sampleHeight);
  const step = blur * .4;
  blurAxis(intermediate.getContext('2d'), sample, step, 0);
  blurAxis(sampling, intermediate, 0, step);
  target.drawImage(sample, 0, offsetY, width, height);
 }

 function tintSilhouette(color) {
  caster.clearRect(0, 0, pixelWidth, pixelHeight);
  caster.drawImage(layer, 0, 0);
  caster.globalCompositeOperation = 'source-in';
  caster.fillStyle = color;
  caster.fillRect(0, 0, pixelWidth, pixelHeight);
  caster.globalCompositeOperation = 'source-over';
 }

 if (lighting) {
  // Deepen the faces and let the same colored light catch the exposed edges.
  receiver.globalCompositeOperation = 'source-atop';
  receiver.fillStyle = lighting.dark;
  receiver.globalAlpha = .60;
  receiver.fillRect(0, 0, pixelWidth, pixelHeight);
  receiver.fillStyle = `rgb(${lighting.light})`;
  receiver.globalAlpha = .03675;
  receiver.fillRect(0, 0, pixelWidth, pixelHeight);
  receiver.globalAlpha = 1;
  receiver.globalCompositeOperation = 'source-over';

  const lightSize = elementSize / 100;
  tintSilhouette(`rgb(${lighting.core})`);
  target.globalCompositeOperation = 'screen';
  target.shadowColor = `rgba(${lighting.light}, .60)`;
  target.shadowBlur = width * scale * .015 * lightSize * (1 - .3 * lightPulse);
  target.globalAlpha = .55 * lightSize * (1 - .24 * lightPulse);
  drawDefocused(stamp, -width * .003 * lightSize);
  target.shadowColor = 'transparent';
  target.shadowBlur = 0;
  target.globalAlpha = 1;
  target.globalCompositeOperation = 'source-over';
 }

 drawDefocused(layer);
 target.restore();
 if (!reuseBuffers) for (const buffer of buffers) buffer.width = buffer.height = 1;
}
