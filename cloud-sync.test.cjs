const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const code=readFileSync(require('node:path').join(__dirname,'./cloud.js'),'utf8').replace("const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');",'const createClient=mockCreateClient;').replace('window.animeCloud={start,','window.testCloud={sessionChanged,flush,refresh,keepLocal,getState:()=>({revision,pending,conflict})};window.animeCloud={start,');
const records=new Map(), storage=new Map(), elements=new Map();
let deferred=null;
const client={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){},signOut:async()=>({}),signInWithOtp:async()=>({})},from(){
 let operation='read', values, filters={};
 const q={select(){return q;},eq(k,v){filters[k]=v;return q;},update(v){operation='update';values=v;return q;},insert(v){operation='insert';values=v;return q;},async maybeSingle(){
  if(deferred){const f=deferred;deferred=null;await f();}
  const id=filters.user_id||values?.user_id, row=records.get(id);
  if(operation==='read')return {data:row?structuredClone(row):null};
  if(operation==='insert'&&row)return {error:{code:'23505'}};
  if(operation==='update'&&(!row||row.revision!==filters.revision))return {data:null};
  const next={payload:structuredClone(values.payload),revision:row?row.revision+1:1};records.set(id,next);return {data:{revision:next.revision}};
 }};return q;
}};
function el(id){if(!elements.has(id))elements.set(id,{value:'',hidden:false,disabled:false,textContent:'',close(){},showModal(){}});return elements.get(id);}
const c={console,URL,Blob,structuredClone,JSON,navigator:{onLine:true},anime:[],active:null,lastDeleted:null,editingId:null,wheelSpinning:false,
 document:{hidden:false,activeElement:null,getElementById:el,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({click(){}})},
 localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
 mockCreateClient:()=>client,setTimeout:()=>0,clearTimeout(){},setInterval(){},
 wheelMode:()=>el('wheelMode').value||'classic',wheelSeconds:()=>Number(el('wheelSpeed').value)||4.2,wheelPlaces:()=>Number(el('wheelPlaces').value)||1,
 priorityNumber:v=>Number.isInteger(Number(v))&&Number(v)>0?Number(v):null,
 closeDetail(){},resetEditor(){},resetTournament(){},render(){},renderManage(){},renderWheel(){},route(){},syncAniList(){}};
c.window=c;c.addEventListener=()=>{};c.save=()=>{storage.set(c.animeCloud.storageKey()||'guest',JSON.stringify(c.anime));c.animeCloud.changed();};
vm.createContext(c);vm.runInContext(code,c);
(async()=>{
 await c.animeCloud.start();
 c.anime=[{id:1,name:'Local',seen:2,priority:1}];c.save();
 await c.testCloud.sessionChanged({user:{id:'a',email:'a@example.test'}});
 assert.equal(records.get('a').payload.titles[0].seen,2,'first login imports latest guest edits');
 c.anime[0].seen=3;c.save();await c.testCloud.flush();assert.equal(records.get('a').payload.titles[0].seen,3);
 // Two devices: newer remote revision must never be silently overwritten.
 records.get('a').revision++;records.get('a').payload.titles[0].seen=7;
 c.anime[0].seen=4;c.save();await c.testCloud.flush();
 assert.equal(records.get('a').payload.titles[0].seen,7);assert.equal(c.testCloud.getState().conflict,true);
 await c.testCloud.refresh(true);assert.equal(c.anime[0].seen,7);assert([...storage.keys()].some(k=>k.startsWith('anime-cloud-backup:a:')));
 // Edits made while a save is in flight must remain queued.
 c.anime[0].seen=8;c.save();let release;deferred=()=>new Promise(r=>{release=r;});const flight=c.testCloud.flush();
 c.anime[0].seen=9;c.save();release();await flight;assert.equal(c.testCloud.getState().pending,true);await c.testCloud.flush();assert.equal(records.get('a').payload.titles[0].seen,9);
 // Guest collection survives logout and another account cannot receive account A's list.
 await c.testCloud.sessionChanged(null);assert.equal(c.anime[0].seen,2);
 await c.testCloud.sessionChanged({user:{id:'b'}});assert.equal(records.get('b').payload.titles[0].seen,2);
 // Persisted offline queue survives account load, and newer remote state causes conflict.
 c.anime[0].seen=5;c.save();await c.testCloud.sessionChanged(null);
 records.get('b').revision++;records.get('b').payload.titles[0].seen=6;
 await c.testCloud.sessionChanged({user:{id:'b'}});assert.equal(c.anime[0].seen,5);assert.equal(c.testCloud.getState().conflict,true);assert.equal(records.get('b').payload.titles[0].seen,6);
 await c.testCloud.keepLocal();assert.equal(records.get('b').payload.titles[0].seen,5);
 console.log('Passed: migration, saves, concurrency, backups, queued edits, account isolation, offline recovery, conflict resolution');
})().catch(e=>{console.error(e);process.exitCode=1});
