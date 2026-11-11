const DATABASE='patterning-local',STORE='workspace';
function open(){return new Promise((resolve,reject)=>{
 const request=indexedDB.open(DATABASE,1);
 request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
export async function loadSession(){
 const db=await open();
 try{return await new Promise((resolve,reject)=>{const r=db.transaction(STORE).objectStore(STORE).get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 finally{db.close();}
}
let writes=Promise.resolve();
export function saveSession(value){
 const operation=writes.catch(()=>{}).then(async()=>{
  const db=await open();
  try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');const s=tx.objectStore(STORE);if(value)s.put(value,'current');else s.delete('current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  finally{db.close();}
 });
 writes=operation;return operation;
}
