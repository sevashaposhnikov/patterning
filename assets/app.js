import {createCycle,sampleCycle,sampleLightPulse,shakeItems,spinItems} from './animation.mjs?v=7';
import {chooseDemoObjects,objectLibrary} from './demo.mjs?v=6';
import {recordVideo,videoSupported} from './video.mjs?v=3';
import {layout,outputSize} from './layout.mjs?v=13';
import {compositionUnit,fittedCompositionUnit,paintObjectLayers} from './object-renderer.mjs?v=25';
import {lightingPalette,paintAlley,paintRainbowHalo} from './lighting.mjs?v=17';
import {defaultPosterCopyForPalette,loadPosterAssets,paintPosterDesign,patternCenterY,posterTextBounds} from './poster-design.mjs?v=7';
import {applyLensDistortion} from './lens.mjs?v=5';
import {gradePixels} from './grade.mjs?v=6';
import {loadSession,saveSession} from './session-store.mjs?v=4';
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
const aboutDialog = $('about-dialog');
$('about-button').onclick = () => aboutDialog.showModal();
aboutDialog.addEventListener('click', event => {
 if (event.target === aboutDialog) aboutDialog.close();
});
const fields=['density','scale','rotation','size'];
const lookKey = 'patterning-look';
const defaultLook = {palette:'red', chromatic:true, halo:true, lensDistortion:false, noText:false, noColor:false};
const originalCopy = defaultPosterCopyForPalette('red');
let posterReady;
let savedLook = {};
try { savedLook = JSON.parse(localStorage.getItem(lookKey)) ?? {}; } catch {}
const {headline, footerCopy, posterCopyOverrides, ...savedSettings} = savedLook;
const look = {...defaultLook, ...savedSettings};
const copyOverrides = posterCopyOverrides ?? {};
if (!posterCopyOverrides) {
 const migrated = {};
 for (const [key, value] of Object.entries({headline, footerCopy})) {
  if (typeof value === 'string' && value !== originalCopy[key]) migrated[key] = value;
 }
 if (Object.keys(migrated).length) copyOverrides[look.palette] = migrated;
}
function updatePosterCopy() {
 Object.assign(look, defaultPosterCopyForPalette(look.palette), copyOverrides[look.palette]);
}
updatePosterCopy();
const paletteButtons = [...document.querySelectorAll('[data-palette]')];
const effectInputs = [...document.querySelectorAll('[data-effect]')];
const posterInputs = [...document.querySelectorAll('[data-poster-copy]')];
const inlinePoster = $('poster-inline');
const inlinePosterInputs = [...inlinePoster.querySelectorAll('textarea')];
let editingPosterCopy = null;
function updateLookControls() {
 for (const button of paletteButtons) {
  button.setAttribute('aria-pressed', String(button.dataset.palette === (look.noColor ? 'none' : look.palette)));
 }
 for (const input of effectInputs) input.checked = look[input.dataset.effect];
 $('poster-text-fields').hidden = look.noText;
 for (const input of posterInputs) {
  const value = look[input.dataset.posterCopy];
  if (input.value !== value) input.value = value;
 }
}
function changeLook(key, value) {
 if (Object.hasOwn(originalCopy, key)) {
  const overrides = copyOverrides[look.palette] ??= {};
  if (value === defaultPosterCopyForPalette(look.palette)[key]) delete overrides[key];
  else overrides[key] = value;
 } else if (key === 'palette') {
  look.noColor = value === 'none';
  if (!look.noColor) look.palette = value;
 } else {
  look[key] = value;
 }
 updatePosterCopy();
 const {headline, footerCopy, ...settings} = look;
 try { localStorage.setItem(lookKey, JSON.stringify({...settings, posterCopyOverrides:copyOverrides})); } catch {}
 updateLookControls();
 render();
}
for (const button of paletteButtons) button.onclick = () => changeLook('palette', button.dataset.palette);
for (const input of effectInputs) input.onchange = () => changeLook(input.dataset.effect, input.checked);
for (const input of posterInputs) {
 const key = input.dataset.posterCopy;
 input.addEventListener('input', () => changeLook(key, input.value));
}
for (const input of inlinePosterInputs) {
 input.addEventListener('focus', () => {
  editingPosterCopy = input.dataset.posterCopy;
  paintPreview();
 });
 input.addEventListener('blur', () => {
  editingPosterCopy = null;
  paintPreview();
 });
 input.addEventListener('keydown', event => {
  if (event.key === 'Escape') input.blur();
 });
}
updateLookControls();
const randomHaloRadius = () => .315 + Math.random() * .07;
const randomObjectAngle = () => (Math.random() - .5) * Math.PI;
const defaults = () => ({
 density: 12, scale: 50, rotation: 0, size: 100, seed: 0,
 format: 'poster', haloRadius: randomHaloRadius(),
});

function randomizedArrangement(settings) {
 return {
  ...settings,
  seed: crypto.getRandomValues(new Uint32Array(1))[0] || 1,
  density: 6 + Math.floor(Math.random() * 8) * 2,
  scale: 20 + Math.floor(Math.random() * 76),
  rotation: Math.round(Math.random() * 240 - 120),
  size: 75 + Math.floor(Math.random() * 76),
  haloRadius: randomHaloRadius(),
 };
}
let state=defaults(),objects=[],demoMode=true,busy=false,worker=null,queue=[],active=null;
let demoGeneration=0,loading=false,initializing=true,saveTimer,workerTimer;
const playbackButton = $('playback');
const randomizeButton = $('randomize');
const exportButton = $('export'), exportChoices = $('export-choices');
let exporting = false;
const playback = {
 cycle: null, elapsed: 0, startedAt: 0, lastPaint: -Infinity,
 frameId: null, playing: false, tremor: null, glitch: null, doubleExposure: null, completedTime: 0, spinBase: 0, spinOffset: 0,
};
const opaqueBounds=new WeakMap(),anchors=new WeakMap(),gradedImages=new WeakMap(),mobile=matchMedia('(max-width:850px)');
function status(message){$('status').textContent=message;}
function setPanel(panel){document.body.dataset.mobilePanel=panel;document.querySelectorAll('[data-panel]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.panel===panel)));if(mobile.matches)document.querySelector('.sheet-content').scrollTop=0;}
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>setPanel(b.dataset.panel));
$('mobile-add').onclick=()=>{setPanel('objects');setSheet(true);};
function syncField(key) {
 const value = Math.round(playback.glitch?.[key] ?? state[key]);
 const input = $(key), output = $(`${key}-value`);
 const label = value + (key === 'density' ? ' / ring' : key === 'rotation' ? '°' : '%');
 if (Number(input.value) !== value) input.value = value;
 if (output.value !== label) output.value = label;
}
function sync() {
 for (const key of fields) syncField(key);
 document.querySelectorAll('[data-format]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.format===state.format)));
 fitFrame();
}
const sheet=$('controls-sheet');
function setSheet(open,focus=true){
 open=mobile.matches&&open;document.body.dataset.sheet=open?'open':'closed';$('settings').setAttribute('aria-expanded',String(open));
 sheet.inert=mobile.matches&&!open;
 if(mobile.matches){sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-hidden',String(!open));}
 else{sheet.removeAttribute('role');sheet.removeAttribute('aria-modal');sheet.removeAttribute('aria-hidden');}
 if(focus){if(open)requestAnimationFrame(()=>{if(document.body.dataset.sheet==='open')$('close-sheet').focus();});else if(mobile.matches)$('settings').focus();}
}
$('settings').onclick=()=>setSheet(true);$('close-sheet').onclick=()=>setSheet(false);$('sheet-backdrop').onclick=()=>setSheet(false);
$('sheet-handle').onclick=()=>setSheet(false);
sheet.addEventListener('transitionend',e=>{if(e.propertyName==='transform'&&document.body.dataset.sheet==='open'&&mobile.matches)$('close-sheet').focus();});
let dragY;
$('sheet-handle').addEventListener('pointerdown',e=>{dragY=e.clientY;e.currentTarget.setPointerCapture(e.pointerId);});
$('sheet-handle').addEventListener('pointermove',e=>{if(dragY!==undefined)sheet.style.transform=`translateY(${Math.max(0,e.clientY-dragY)}px)`;});
function finishSheetDrag(e){if(dragY===undefined)return;const distance=e.clientY-dragY;dragY=undefined;sheet.style.transform='';if(distance>60)setSheet(false);}
$('sheet-handle').addEventListener('pointerup',finishSheetDrag);$('sheet-handle').addEventListener('pointercancel',()=>{dragY=undefined;sheet.style.transform='';});
mobile.addEventListener('change',()=>{setSheet(false,false);fitFrame();});
document.addEventListener('keydown',e=>{
 if(document.body.dataset.sheet!=='open')return;
 if(e.key==='Escape'){e.preventDefault();setSheet(false);}
 if(e.key==='Tab'){
  const list=[...sheet.querySelectorAll('button,input,textarea,summary,a[href]')].filter(el=>!el.disabled&&el.getClientRects().length);
  const first=list[0],last=list.at(-1);
  if(!sheet.contains(document.activeElement)){e.preventDefault();first?.focus();}
  else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
 }
});
setSheet(false,false);
function grade(source){
 if(gradedImages.has(source))return gradedImages.get(source);
 const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(source,0,0);
 const pixels=x.getImageData(0,0,c.width,c.height);
 // Rotate around actual visible material so Scale=0 cannot leave a transparent hole.
 let anchorX=Math.floor(c.width/2),anchorY=Math.floor(c.height/2),best=Infinity,left=c.width,top=c.height,right=0,bottom=0;
 for(let y=0;y<c.height;y++)for(let i=0;i<c.width;i++){
  const alpha=pixels.data[(y*c.width+i)*4+3];
  if(alpha){left=Math.min(left,i);right=Math.max(right,i+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}
  if(alpha>128){const d=(i-c.width/2)**2+(y-c.height/2)**2;if(d<best){best=d;anchorX=i;anchorY=y;}}
 }
 opaqueBounds.set(c,{left:left/c.width,top:top/c.height,right:right/c.width,bottom:bottom/c.height});
 anchors.set(c,{x:(anchorX+.5)/c.width,y:(anchorY+.5)/c.height});gradePixels(pixels.data);x.putImageData(pixels,0,0);gradedImages.set(source,c);return c;
}
const grain=document.createElement('canvas');grain.width=grain.height=192;
{const x=grain.getContext('2d'),p=x.createImageData(192,192);let seed=19473;for(let i=0;i<p.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;p.data[i]=p.data[i+1]=p.data[i+2]=seed>>>24;p.data[i+3]=255;}x.putImageData(p,0,0);}
function draw(target,width,height,{
 arrangement=state, appearance=look, ready=objects.filter(o=>o.cut),
 glitch=playback.glitch, tremor=playback.tremor,
 doubleExposure=playback.playing ? playback.doubleExposure : null,
 time=playback.completedTime+playback.elapsed,
 spinTime=playback.spinBase+time, spinOffset=playback.spinOffset, reuseBuffers=target===ctx,
}={}){
 if(glitch) arrangement={...arrangement,...glitch};
 target.clearRect(0,0,width,height);
 if (!appearance.noColor) paintAlley(target,width,height,appearance.palette);
 const side=Math.max(50,Math.min(width*.98,height*.95));
 const images=ready.map(o=>grade(o.image));
 const sources = images.map((image, index) => ({
  image, aspect: image.width / image.height,
  anchor: anchors.get(image), bounds: opaqueBounds.get(image),
  angle: ready[index].angle,
 }));
 const items = layout(arrangement, ready.length, sources);
 const pulse = sampleLightPulse(time);
 const reach=Math.max(.5,...images.map(image=>{const a=anchors.get(image),aspect=image.width/image.height;return Math.max(...[0,1].flatMap(x=>[0,1].map(y=>Math.hypot((x-a.x)*aspect,y-a.y))));}));
 // Set the camera at the standard element size so resizing never zooms the poster out.
 const referenceItems = arrangement.size === 100 ? items : layout({...arrangement, size: 100}, ready.length, sources);
 const largest = Math.max(.3, ...referenceItems.map(item => item.size));
 const extent = Math.max(.64, .4 + largest * reach + .045);
 const square = arrangement.format === 'square';
 const centerY = appearance.noText ? .5 : patternCenterY;
 const preferred = compositionUnit(side, extent);
 const unit = appearance.noText
  ? fittedCompositionUnit(width, height, preferred * 1.22, referenceItems, sources)
  : fittedCompositionUnit(width * .9, height * (square ? .67 : .57), square ? preferred * 1.18 : preferred, referenceItems, sources);
 if (items.length) {
  paintObjectLayers(target, {
   width, height, unit, items: spinItems(shakeItems(items, tremor), spinTime, spinOffset), sources,
   chromatic: appearance.chromatic, lighting: appearance.noColor ? null : lightingPalette(appearance.palette),
   centerY, reuseBuffers, lightPulse: pulse, elementSize: arrangement.size,
   tremorProgress: tremor?.progress ?? 0, doubleExposure,
  });
 }
 if(appearance.halo && items.length)paintRainbowHalo(target,width,height,arrangement.haloRadius,centerY,pulse);
 if (appearance.lensDistortion && !applyLensDistortion(target, centerY) && target === ctx) {
  status('Lens distortion is unavailable in this browser.');
  look.lensDistortion = false;
  updateLookControls();
 }
 // A new offset on each playback frame gives the grain movement without changing paused exports.
 const grainFrame = Math.floor(time / 32);
 const grainPhase = Math.imul(grainFrame, 2654435761) >>> 0;
 const grainPattern = target.createPattern(grain, 'repeat');
 grainPattern.setTransform(new DOMMatrix()
  .translate((grainPhase & 255) * .6, ((grainPhase >>> 16) & 255) * .6)
  .scale(.6));
 target.save();
 target.fillStyle = grainPattern;
 target.globalCompositeOperation = appearance.noColor ? 'source-atop' : 'soft-light';
 target.globalAlpha = appearance.noColor ? .05 : .112;
 target.fillRect(0, 0, width, height);
 if (!appearance.noColor) {
  target.globalCompositeOperation = 'screen';
  target.globalAlpha = .0098;
  target.fillRect(0, 0, width, height);
 }
 target.restore();
 // Keep the seal and all typography above the film grain in preview and export.
 if (!appearance.noText && posterReady && items.length) paintPosterDesign(target, width, height, appearance, arrangement.format, target === ctx ? editingPosterCopy : null);
}
let previewWidth = 0, previewHeight = 0;
function paintPreview() {
 if (previewWidth && previewHeight) draw(ctx, previewWidth, previewHeight);
}

function layoutInlinePoster(hasObjects) {
 inlinePoster.hidden = !hasObjects || look.noText || !posterReady || !previewWidth || !previewHeight;
 if (inlinePoster.hidden) return;
 const boxes = posterTextBounds(previewWidth, previewHeight, state.format);
 for (const input of inlinePosterInputs) {
  const {left, top, width, height, fontSize} = boxes[input.dataset.posterCopy];
  input.style.setProperty('--text-left', `${left}px`);
  input.style.setProperty('--text-top', `${top}px`);
  input.style.setProperty('--text-width', `${width}px`);
  input.style.setProperty('--text-height', `${height}px`);
  input.style.setProperty('--text-right', `${previewWidth - left - width}px`);
  input.style.setProperty('--text-bottom', `${previewHeight - top - height}px`);
  input.style.setProperty('--text-size', `${fontSize}px`);
 }
}

function render() {
 const hasObjects = objects.some(o => o.cut);
 updateExportButton();
 if (!hasObjects && playback.playing) pausePlayback();
 playbackButton.disabled = exporting || !hasObjects;
 const rect = canvas.getBoundingClientRect();
 const ratio = Math.min(devicePixelRatio || 1, mobile.matches ? 1.5 : 2);
 const width = Math.round(rect.width * ratio);
 const height = Math.round(rect.height * ratio);
 if (canvas.width !== width || canvas.height !== height) {
  canvas.width = width;
  canvas.height = height;
 }
 ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
 previewWidth = rect.width;
 previewHeight = rect.height;
 layoutInlinePoster(hasObjects);
 paintPreview();
}

function resetPlayback() {
 playback.spinBase += playback.completedTime + playback.elapsed;
 playback.spinOffset = 0;
 playback.cycle = null;
 playback.elapsed = 0;
 playback.startedAt = performance.now();
 playback.lastPaint = -Infinity;
 playback.tremor = null;
 playback.glitch = null;
 playback.doubleExposure = null;
 playback.completedTime = 0;
}

function paintPlaybackFrame(now) {
 if (!playback.playing) return;
 if (now - playback.lastPaint >= 32) {
  playback.cycle ??= createCycle(state);
  let elapsed = Math.max(0, now - playback.startedAt);
  if (elapsed >= playback.cycle.duration) {
   const previousCycle = playback.cycle;
   const nextPose = previousCycle.jumps.at(-1).pose;
   playback.cycle = createCycle(nextPose);
   const nextElapsed = (elapsed - previousCycle.duration) % playback.cycle.duration;
   playback.completedTime += elapsed - nextElapsed;
   elapsed = nextElapsed;
   playback.startedAt = now - elapsed;
  }
  playback.elapsed = elapsed;
  const {pose, tremor, glitch, doubleExposure, spinOffset} = sampleCycle(playback.cycle, elapsed);
  const previousGlitch = playback.glitch;
  playback.glitch = glitch;
  Object.assign(state, pose);
  playback.tremor = tremor;
  playback.doubleExposure = doubleExposure;
  playback.spinOffset = spinOffset;
  playback.lastPaint = now;
  syncField('scale');
  syncField('rotation');
  if (previousGlitch !== glitch) {
   syncField('density');
   syncField('size');
  }
  paintPreview();
 }
 if (playback.playing) playback.frameId = requestAnimationFrame(paintPlaybackFrame);
}

function pausePlayback() {
 if (!playback.playing) return;
 playback.playing = false;
 cancelAnimationFrame(playback.frameId);
 updatePlaybackButton();
 scheduleSave();
}

function updatePlaybackButton() {
 const label = playback.playing ? 'Pause' : 'Play';
 playbackButton.dataset.playing = String(playback.playing);
 playbackButton.setAttribute('aria-label', label);
 playbackButton.title = label;
}

function startPlayback() {
 if (playback.playing) return;
 playback.playing = true;
 playback.startedAt = performance.now() - playback.elapsed;
 playback.lastPaint = -Infinity;
 updatePlaybackButton();
 playback.frameId = requestAnimationFrame(paintPlaybackFrame);
}
playbackButton.onclick = () => {
 if (playback.playing) {
  pausePlayback();
  if (playback.doubleExposure) render();
 } else startPlayback();
};
function fitFrame(){
 const stage=document.querySelector('.stage'),frame=$('drop-stage'),style=getComputedStyle(stage);
 const availableWidth=stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),availableHeight=stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
 const dimensions = outputSize(state.format);
 const aspect = dimensions.width / dimensions.height;
 const w = Math.max(1, Math.min(availableWidth, availableHeight * aspect));
 frame.style.width=w+'px';frame.style.height=w/aspect+'px';render();
}
new ResizeObserver(fitFrame).observe(document.querySelector('.stage'));
new ResizeObserver(render).observe(canvas);
document.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>{state.format=b.dataset.format;sync();scheduleSave();});
function snapshot(){return demoMode?null:{schema:6,state:{...state},wasProcessing:busy||queue.length>0,objects:objects.map(o=>o.libraryUrl ? {libraryUrl:o.libraryUrl,angle:o.angle} : {name:o.name,angle:o.angle,original:o.originalBlob,cutout:o.cutoutBlob||null})};}
async function checkpoint(){clearTimeout(saveTimer);try{await saveSession(snapshot());return true;}catch{return false;}}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(checkpoint,250);}
for (const key of fields) {
 $(key).addEventListener('input', () => {
  state[key] = Number($(key).value);
  if (key === 'scale' || key === 'rotation' || playback.glitch) resetPlayback();
  sync();
  scheduleSave();
 });
}
randomizeButton.onclick = () => {
 if (demoMode) {
  void loadDemo();
  return;
 }
 state = randomizedArrangement(state);
 resetPlayback();
 sync();
 scheduleSave();
};
function toBlob(c){return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Could not prepare this image.')),'image/png'));}
function imageFromURL(url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('This image format is not supported by your browser.'));image.src=url;});}
async function canvasFromBlob(blob,limit=1024){
 const url=URL.createObjectURL(blob);let image;
 try{image=await imageFromURL(url);const factor=Math.min(1,limit/Math.max(image.naturalWidth,image.naturalHeight)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.naturalWidth*factor));c.height=Math.max(1,Math.round(image.naturalHeight*factor));c.getContext('2d').drawImage(image,0,0,c.width,c.height);return c;}
 finally{if(image)image.src='';URL.revokeObjectURL(url);}
}
function release(object){if(object.url?.startsWith('blob:'))URL.revokeObjectURL(object.url);}
function addObject(object){
 if(demoMode){
  ++demoGeneration;
  cancelProcessing(true);
  objects.forEach(release);
  objects=[];
  demoMode=false;
 }
 objects.push(object);
}
async function libraryObject(asset, angle=randomObjectAngle()){
 return {...asset,libraryUrl:asset.url,angle,image:await imageFromURL(asset.url),cut:true};
}
const libraryButtons = objectLibrary.map(asset=>{
 const button=document.createElement('button');
 button.type='button';
 button.setAttribute('aria-label',`Add ${asset.name}`);
 const thumbnail=document.createElement('img');
 thumbnail.alt='';
 thumbnail.loading='lazy';
 thumbnail.src=asset.url;
 button.append(thumbnail,asset.name);
 button.onclick=async()=>{
  if(loading||initializing)return;
  if(!demoMode&&objects.length>=6){status('Up to 6 objects. Remove one to add another.');return;}
  loading=true;
  try{
   addObject(await libraryObject(asset));
   listObjects();
   render();
   const saved=await checkpoint();
   status(saved?'':'Your browser could not save this composition. Keep this tab open.');
  }catch{status('Could not load this object. Please try again.');}
  finally{loading=false;}
 };
 $('library-items').append(button);
 return {button,url:asset.url};
});
function listObjects(){
 for(const {button,url} of libraryButtons)button.disabled=!demoMode&&objects.some(object=>object.libraryUrl===url);
 $('objects').replaceChildren();
 for(const object of objects){
  const tile=document.createElement('div');tile.className='object-tile';const preview=document.createElement('img');preview.src=object.url;preview.alt=object.name;tile.append(preview);
  const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label',`Remove ${object.name}`);remove.onclick=()=>{
   demoMode=false;
   ++demoGeneration;
   if(active===object)cancelProcessing(false);
   queue=queue.filter(o=>o!==object);
   objects=objects.filter(o=>o!==object);
   release(object);
   listObjects();
   render();
   checkpoint();
   runQueue();
  };tile.append(remove);
  if(object.original&&!object.cut){const cut=document.createElement('button');cut.className='cut';cut.textContent=object===active?'Processing…':queue.includes(object)?'Queued':'Remove background';cut.disabled=object===active||queue.includes(object);cut.onclick=()=>{queue.push(object);runQueue();listObjects();};tile.append(cut);}
  $('objects').append(tile);
 }
}
function stopWorker(){clearTimeout(workerTimer);worker?.terminate();worker=null;}
function cancelProcessing(all=true){stopWorker();active=null;busy=false;updateExportButton();if(all)queue=[];$('processing').hidden=true;listObjects();}
async function loadDemo() {
 const generation = ++demoGeneration;
 const selection = chooseDemoObjects(Math.random, objects);
 try {
  const demo = await Promise.all(selection.map(asset=>libraryObject(asset)));
  if (generation !== demoGeneration || !demoMode) return;
  objects = demo;
  state = randomizedArrangement(state);
  resetPlayback();
  listObjects();
  sync();
  status('');
 } catch {
  if (generation === demoGeneration) status('Could not load demo objects. Please try again.');
 }
}

function crop(source){
 const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(source,0,0);const {data}=x.getImageData(0,0,c.width,c.height);let x0=c.width,y0=c.height,x1=-1,y1=-1;
 for(let y=0;y<c.height;y++)for(let i=0;i<c.width;i++)if(data[(y*c.width+i)*4+3]>24){x0=Math.min(x0,i);x1=Math.max(x1,i);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 if(x1<0)throw new Error('No foreground found. Try a clearer subject.');const out=document.createElement('canvas');out.width=x1-x0+1;out.height=y1-y0+1;out.getContext('2d').drawImage(c,x0,y0,out.width,out.height,0,0,out.width,out.height);return out;
}
async function readFile(file){
 if(!/^image\/(png|jpeg|webp|heic|heif|avif)$/.test(file.type))throw new Error('Choose a photo or a PNG, JPG or WebP image.');
 if(file.size>20*1024*1024)throw new Error('Choose an image smaller than 20 MB.');
 const original=await canvasFromBlob(file,mobile.matches?768:1024),x=original.getContext('2d',{willReadFrequently:true}),pixels=x.getImageData(0,0,original.width,original.height);let transparent=0;
 for(let i=3;i<pixels.data.length;i+=4)if(pixels.data[i]<240)transparent++;
 const cut=transparent/(original.width*original.height)>.01,image=cut?crop(original):original;
 const originalBlob=await toBlob(original),cutoutBlob=cut?await toBlob(image):null;
 return {name:file.name,angle:randomObjectAngle(),image,url:URL.createObjectURL(cutoutBlob||originalBlob),original,originalBlob,cutoutBlob,cut};
}
async function addFiles(files){
 if(loading||initializing){status('Please wait while your images load.');return;}loading=true;let accepted=0,errors=[];
 try{
  for(const file of Array.from(files)){
   if(!demoMode&&objects.length>=6){errors.push('Up to 6 objects. Remove one to add another.');break;}
   try{const object=await readFile(file);addObject(object);accepted++;if(!object.cut)queue.push(object);}
   catch(error){errors.push(`${file.name}: ${error.message}`);}
  }
  listObjects();render();const saved=await checkpoint();if(accepted){setPanel('arrangement');if(mobile.matches)setSheet(true);}status(errors.length?errors.join(' '):!saved?'Your browser could not save these images. Keep this tab open.':'');runQueue();
 }finally{loading=false;$('upload').value='';}
}
$('upload-objects').onclick=()=>$('upload').click();
$('upload').onchange=e=>addFiles(e.target.files);
for(const zone of [$('drop-zone'),$('drop-stage')]){let depth=0;zone.addEventListener('dragenter',e=>{e.preventDefault();depth++;zone.classList.add('dragging');});zone.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});zone.addEventListener('dragleave',()=>{if(--depth<=0){depth=0;zone.classList.remove('dragging');}});zone.addEventListener('drop',e=>{e.preventDefault();depth=0;zone.classList.remove('dragging');addFiles(e.dataTransfer.files);});}
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
async function runQueue(){
 if(busy||!queue.length)return;const object=queue.shift();if(!objects.includes(object)){runQueue();return;}
 busy=true;active=object;updateExportButton();$('processing').hidden=false;$('processing-text').textContent='Preparing cutout…';$('progress').removeAttribute('value');status('');listObjects();
 // Commit the original before model allocation. A browser reload can restore it.
 await checkpoint();if(active!==object||!busy)return;
 let ownedWorker;try{ownedWorker=new Worker(new URL('./cutout-worker.js?v=4', import.meta.url),{type:'module'});}catch{cancelProcessing(true);checkpoint();status('Background removal is not supported in this browser. Your original is kept; you can use a transparent PNG.',true);return;}worker=ownedWorker;
 const finish=async()=>{stopWorker();busy=false;active=null;updateExportButton();$('processing').hidden=true;listObjects();render();await checkpoint();runQueue();};
 const fail=message=>{queue=[];status(message);finish();};
 workerTimer=setTimeout(()=>{if(worker===ownedWorker)fail('Processing took too long. Your original is kept; try again or use a transparent PNG.');},90000);
 ownedWorker.onmessage=async({data})=>{
  if(worker!==ownedWorker)return;
  if(data.type==='progress'){$('processing-text').textContent=data.message;return;}
  if(data.type==='error'){fail('Background removal could not finish. Your original is kept. Try a closer photo or a transparent PNG.');return;}
  if(data.type==='done'){
   // Release the entire inference worker before building full-size preview masks.
   stopWorker();
   try{
    const c=document.createElement('canvas');c.width=object.original.width;c.height=object.original.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(object.original,0,0);
    const low=document.createElement('canvas');low.width=data.width;low.height=data.height;const lx=low.getContext('2d'),p=lx.createImageData(data.width,data.height),mask=new Uint8ClampedArray(data.mask);
    for(let i=0;i<mask.length;i++){p.data[i*4]=p.data[i*4+1]=p.data[i*4+2]=mask[i];p.data[i*4+3]=255;}lx.putImageData(p,0,0);
    const scaled=document.createElement('canvas');scaled.width=c.width;scaled.height=c.height;const sx=scaled.getContext('2d',{willReadFrequently:true});sx.drawImage(low,0,0,c.width,c.height);
    const alpha=sx.getImageData(0,0,c.width,c.height).data,rgba=x.getImageData(0,0,c.width,c.height);let foreground=0;
    for(let i=0;i<c.width*c.height;i++){rgba.data[i*4+3]=Math.round(rgba.data[i*4+3]*alpha[i*4]/255);if(rgba.data[i*4+3]>128)foreground++;}
    if(foreground/(c.width*c.height)<.005)throw new Error('No clear subject found. Original kept. Try a closer photo.');
    x.putImageData(rgba,0,0);const image=crop(c),blob=await toBlob(image);
    if(active!==object)return;release(object);object.image=image;object.cutoutBlob=blob;object.url=URL.createObjectURL(blob);object.cut=true;status('Background removed.');
   }catch(error){status(error.message);}
   if(active===object)finish();
  }
 };
 ownedWorker.onerror=()=>{if(worker===ownedWorker)fail('The remover could not load. Your original is kept. Check your connection and retry.');};
 const input=document.createElement('canvas');input.width=input.height=320;const ix=input.getContext('2d',{willReadFrequently:true});ix.drawImage(object.original,0,0,320,320);const pixels=ix.getImageData(0,0,320,320);ownedWorker.postMessage({pixels:pixels.data.buffer},[pixels.data.buffer]);
}
function setExportChoices(open){
 exportChoices.hidden=!open;
 exportButton.setAttribute('aria-expanded',String(open));
}
function updateExportButton(){
 exportButton.disabled=exporting||busy||!objects.some(o=>o.cut);
 if(exportButton.disabled)setExportChoices(false);
}
exportButton.onclick=()=>setExportChoices(exportChoices.hidden);
document.addEventListener('click',event=>{
 if(!exportChoices.hidden&&!exportButton.parentElement.contains(event.target))setExportChoices(false);
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&!exportChoices.hidden){
  setExportChoices(false);
  exportButton.focus();
 }
});
function download(blob,extension){
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');
 link.href=url;
 link.download=`patterning.${extension}`;
 link.click();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function exportComposition(videoDuration=0){
 const video=videoDuration>0;
 if(exportButton.disabled)return;
 setExportChoices(false);
 if(video&&!videoSupported){
  status('Video export is unavailable in this browser.');
  return;
 }
 exporting=true;
 updateExportButton();
 if(video){
  pausePlayback();
  playbackButton.disabled=true;
  exportButton.textContent='Video 0%';
 }
 const out=document.createElement('canvas');
 const {width,height}=outputSize(state.format);
 const videoLongSide=state.format==='poster'?1278:1280;
 const factor=video?videoLongSide/Math.max(width,height):1;
 out.width=video?Math.round(width*factor/2)*2:width;
 out.height=video?Math.round(height*factor/2)*2:height;
 const target=out.getContext('2d');
 try{
  if(video){
   const base={...state}, appearance={...look}, ready=objects.filter(o=>o.cut);
   const startSpinTime=playback.spinBase+playback.completedTime+playback.elapsed;
   let cycle=createCycle(base), cycleStart=0;
   const blob=await recordVideo(out,videoDuration,time=>{
    if(time-cycleStart>=cycle.duration){
     cycleStart+=cycle.duration;
     cycle=createCycle(cycle.jumps.at(-1).pose);
    }
    const {pose,glitch,tremor,doubleExposure,spinOffset}=sampleCycle(cycle,time-cycleStart);
    draw(target,out.width,out.height,{
     arrangement:{...base,...pose},appearance,ready,glitch,tremor,doubleExposure,time,
     spinTime:startSpinTime+time,spinOffset,reuseBuffers:true,
    });
    if (appearance.noColor) {
     target.save();
     target.globalCompositeOperation = 'destination-over';
     target.fillStyle = '#000';
     target.fillRect(0, 0, out.width, out.height);
     target.restore();
    }
   },progress=>{exportButton.textContent=`Video ${Math.floor(progress*100)}%`;});
   download(blob,blob.type.startsWith('video/mp4')?'mp4':'webm');
   status(`Exported a ${videoDuration}-second video.`);
  }else{
   draw(target,out.width,out.height);
   download(await toBlob(out),'png');
   status(`Exported a ${out.width} × ${out.height} PNG.`);
  }
 }catch(error){
  status(error.message||'Export failed. Please try again.');
 }finally{
  out.width=out.height=1;
  exporting=false;
  exportButton.textContent='Export';
  updateExportButton();
  playbackButton.disabled=!objects.some(o=>o.cut);
  if(!exportButton.disabled&&document.activeElement===document.body)exportButton.focus();
 }
}
$('export-image').onclick=()=>exportComposition();
for(const button of exportChoices.querySelectorAll('[data-video-duration]')){
 button.onclick=()=>exportComposition(Number(button.dataset.videoDuration));
}
window.addEventListener('pagehide',()=>{pausePlayback();checkpoint();stopWorker();busy=false;active=null;queue=[];$('processing').hidden=true;});
window.addEventListener('pageshow',event=>{if(event.persisted){updateExportButton();listObjects();render();}});
async function boot(){
 await loadPosterAssets();
 posterReady = true;
 let saved;try{saved=await loadSession();}catch{}
 if(Array.isArray(saved?.objects)){
  try{
   state=saved.schema===6?{...defaults(),...saved.state}:{...defaults(),density:saved.state?.density??12,scale:saved.state?.pattern??50,size:saved.state?.size??100,seed:saved.state?.seed??0,format:saved.state?.format??'poster'};demoMode=false;
   for(const item of saved.objects.slice(0,6)){
    if(item.libraryUrl){
     const asset=objectLibrary.find(entry=>entry.url===item.libraryUrl);
     if(asset)objects.push(await libraryObject(asset,item.angle));
     continue;
    }
    const original=await canvasFromBlob(item.original),image=item.cutout?await canvasFromBlob(item.cutout):original;objects.push({name:item.name,angle:item.angle,original,originalBlob:item.original,image,cut:!!item.cutout,cutoutBlob:item.cutout,url:URL.createObjectURL(item.cutout||item.original)});}
   listObjects();sync();status(saved.wasProcessing?'Your images were restored. Background removal was interrupted; use Objects to retry.':'');
  }catch{objects.forEach(release);objects=[];status('Saved images could not be restored. Please add them again.');}
 }else await loadDemo();
 if (objects.some(object=>object.cut) && !matchMedia('(prefers-reduced-motion: reduce)').matches) startPlayback();
}
boot().catch(()=>status('Please add an image to begin.')).finally(()=>{
 initializing=false;
 randomizeButton.disabled=false;
});
