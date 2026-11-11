// U²-NetP at 320×320 replaces the 183 MB model. The worker is retired after
// every image, releasing its WASM heap instead of accumulating mobile memory.
const ROOT='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
self.onmessage=async({data})=>{
 let session;
 try{
  postMessage({type:'progress',message:'Preparing background remover…'});
  const ort=await import(ROOT+'ort.wasm.min.mjs');
  ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=ROOT;
  postMessage({type:'progress',message:'Loading small model · 4.6 MB…'});
  const response=await fetch(new URL('./models/u2netp.onnx', import.meta.url),{cache:'force-cache'});
  if(!response.ok)throw new Error('Could not load the model.');
  const model=await response.arrayBuffer();
  session=await ort.InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all',enableCpuMemArena:false,enableMemPattern:false});
  postMessage({type:'progress',message:'Removing background…'});
  const rgba=new Uint8ClampedArray(data.pixels),count=320*320,input=new Float32Array(count*3);
  let max=1;for(let i=0;i<rgba.length;i+=4)max=Math.max(max,rgba[i],rgba[i+1],rgba[i+2]);
  const mean=[.485,.456,.406],std=[.229,.224,.225];
  for(let i=0;i<count;i++)for(let c=0;c<3;c++)input[c*count+i]=(rgba[i*4+c]/max-mean[c])/std[c];
  const tensor=new ort.Tensor('float32',input,[1,3,320,320]);
  const outputs=await session.run({[session.inputNames[0]]:tensor});
  const values=outputs[session.outputNames[0]].data;
  let min=Infinity,maxValue=-Infinity;for(const value of values){min=Math.min(min,value);maxValue=Math.max(maxValue,value);}
  if(maxValue-min<1e-6)throw new Error('No clear foreground found.');
  const mask=new Uint8ClampedArray(count);for(let i=0;i<count;i++)mask[i]=Math.round(255*(values[i]-min)/(maxValue-min));
  for(const output of Object.values(outputs))output.dispose?.();tensor.dispose?.();
  await session.release();session=null;
  postMessage({type:'done',mask:mask.buffer,width:320,height:320},[mask.buffer]);
 }catch(error){postMessage({type:'error',message:error.message||'Background removal failed'});}
 finally{if(session)await session.release().catch(()=>{});}
};
