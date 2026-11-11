function generator(seed){let value=seed>>>0;return ()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};}
function radialBand(size,tilt,source={}){
 const aspect=source.aspect??1,anchor=source.anchor??{x:.5,y:.5},b=source.bounds??{left:0,top:0,right:1,bottom:1};
 const xs=[b.left,b.right].map(x=>(x-anchor.x)*size*aspect),ys=[b.top,b.bottom].map(y=>(y-anchor.y)*size),sin=Math.sin(tilt),cos=Math.cos(tilt);
 const values=xs.flatMap(x=>ys.map(y=>-x*sin-y*cos));
 const min=Math.min(...values),max=Math.max(...values);
 return {inward:Math.max(0,-min),width:Math.max(.001,max-min),range(radius){
  // Measure the full annular footprint, including corners of wide cutouts.
  const x=Math.max(xs[0],Math.min(xs[1],radius*sin)),y=Math.max(ys[0],Math.min(ys[1],-radius*cos));
  const inner=Math.hypot(x-radius*sin,y+radius*cos);
  const outer=Math.max(...xs.flatMap(x=>ys.map(y=>Math.hypot(radius-x*sin-y*cos,x*cos-y*sin))));
  return {inner,outer,width:outer-inner};
 }};
}
export function layout({density=12,scale:spacing=50,rotation=0,size=100,seed=0},objectCount,sources=[]){
 if(!objectCount)return [];
 const t=Math.max(0,Math.min(100,spacing))/100,spread=Math.sqrt(2*t);
 const count=Math.max(6,Math.min(30,Math.round(density/2)*2)),scale=Math.max(40,Math.min(160,size))/100;
 const random=generator(seed),randomized=seed!==0,order=Array.from({length:objectCount},(_,i)=>i);
 if(randomized)for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 const spinRandom=generator(seed ^ 0x9e3779b9);
 const rings=[];
 for(let ring=0;ring<objectCount;ring++){
  const position=objectCount===1?.7:ring/(objectCount-1),object=order[ring];
  const baseSize=(.30+position*.06)*(randomized?.96+random()*.08:1);
  const phase=randomized?random()*Math.PI*2:ring*Math.PI/count;
  const legacyTilt = randomized ? (random() - .5) * Math.PI / 3 : 0;
  const objectAngle = sources[object]?.angle ?? legacyTilt;
  const tilt = objectAngle + Math.max(-120, Math.min(120, rotation)) * Math.PI / 180;
  const overlap=randomized?.15+random()*.15:.22;
  const reference=radialBand(baseSize,tilt,sources[object]),actual=radialBand(baseSize*scale,tilt,sources[object]);
  let radius;
  if(!ring)radius=Math.max(reference.inward+reference.width*.12,actual.inward*.65);
  else{
   const previous=rings[ring-1];
   const before=previous.reference.range(previous.baseRadius),beforeLarge=previous.actual.range(previous.baseRadius);
   const fits=r=>{const next=reference.range(r),nextLarge=actual.range(r);return next.inner>=before.outer-overlap*Math.min(before.width,next.width)&&nextLarge.inner>=beforeLarge.outer-.45*Math.min(beforeLarge.width,nextLarge.width);};
   let low=previous.baseRadius+.025,high=low+before.outer+reference.width+actual.width;
   while(!fits(high))high*=2;
   // Keep adjacent rings readable; the size control can still increase overlap.
   for(let i=0;i<24;i++){const middle=(low+high)/2;if(fits(middle))high=middle;else low=middle;}
   radius=high;
  }
  rings.push({ring,object,baseRadius:radius,reference,actual,phase,tilt,size:baseSize*scale,spinDirection:spinRandom()<.5?-1:1});
 }
 // Keep the random assignment, but guarantee counter-rotation in a multi-ring pattern.
 if(rings.length>1&&rings.every(ring=>ring.spinDirection===rings[0].spinDirection)){
  rings[Math.floor(spinRandom()*rings.length)].spinDirection*=-1;
 }
 const items=[];
 for(const ring of rings)for(let i=0;i<count;i++){
  const a=i/count*Math.PI*2+ring.phase,r=ring.baseRadius*spread;
  items.push({x:Math.cos(a)*r,y:Math.sin(a)*r,rotation:a+Math.PI/2+ring.tilt,azimuth:a,size:ring.size,object:ring.object,ring:ring.ring,spinDirection:ring.spinDirection});
 }
 return items;
}
export function outputSize(format = 'poster') {
 if (format === 'story') return {width: 1350, height: 2400};
 if (format === 'square') return {width: 1600, height: 1600};
 return {width: 1600, height: 2400};
}
