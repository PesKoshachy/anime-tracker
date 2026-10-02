const {readFileSync}=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=readFileSync(require('node:path').join(__dirname,'cloud.js'),'utf8').replace('window.animeCloud={start,','window.testCloud={load,flush,refresh,keepLocal,state:()=>({revision,pending,conflict})};window.animeCloud={start,');
const storage=new Map(),elements=new Map();
let row={revision:1,payload:{titles:[{id:1,name:'Shared title',seen:2,priority:1}],settings:{mode:'classic',seconds:10,places:1}}},offline=false,deferred;
const element=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:false,textContent:'',close(){},showModal(){}});return elements.get(id)};
const c={console,URL,Blob,JSON,AbortController,anime:[],active:null,editingId:null,lastDeleted:null,wheelSpinning:false,
 localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
 document:{hidden:false,activeElement:null,getElementById:element,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({click(){}})},
 setTimeout:()=>0,clearTimeout(){},setInterval(){},addEventListener(){},
 wheelMode:()=>element('wheelMode').value||'classic',wheelSeconds:()=>Number(element('wheelSpeed').value)||4.2,wheelPlaces:()=>Number(element('wheelPlaces').value)||1,
 priorityNumber:v=>Number.isInteger(Number(v))&&Number(v)>0?Number(v):null,
 closeDetail(){},resetEditor(){},resetTournament(){},render(){},renderManage(){},renderWheel(){},route(){},
 fetch:async(url,options)=>{if(offline)throw Error('offline');if(deferred){const f=deferred;deferred=null;await f()}
  if(options.method==='PATCH'){const base=Number(new URL(url).searchParams.get('revision').slice(3));if(base!==row.revision)return {ok:true,json:async()=>[]};row={revision:row.revision+1,payload:JSON.parse(options.body).payload};}
  return {ok:true,json:async()=>[JSON.parse(JSON.stringify(row))]};}};
c.window=c;c.save=()=>{storage.set(c.animeCloud.storageKey(),JSON.stringify(c.anime));c.animeCloud.changed()};vm.createContext(c);vm.runInContext(code,c);
(async()=>{
 c.anime=[{id:9,name:'Old local'}];await c.animeCloud.start();assert.equal(c.anime[0].id,1);assert.equal(element('wheelSpeed').value,'10');
 c.anime[0].seen=3;c.save();await c.testCloud.flush();assert.equal(row.payload.titles[0].seen,3);
 row.revision++;row.payload.titles[0].seen=7;c.anime[0].seen=4;c.save();await c.testCloud.flush();assert.equal(row.payload.titles[0].seen,7);assert.equal(c.testCloud.state().conflict,true);
 await c.testCloud.refresh(true);assert.equal(c.anime[0].seen,7);assert([...storage.keys()].some(k=>k.startsWith('anime-shared-backup:')));
 c.anime[0].seen=8;c.save();let release;deferred=()=>new Promise(r=>{release=r});const flight=c.testCloud.flush();c.anime[0].seen=9;c.save();release();await flight;assert.equal(c.testCloud.state().pending,true);await c.testCloud.flush();assert.equal(row.payload.titles[0].seen,9);
 offline=true;c.anime[0].seen=10;c.save();await c.testCloud.flush();assert.equal(c.testCloud.state().pending,true);assert.equal(JSON.parse(storage.get('anime-shared-cache-v1')).payload.titles[0].seen,10);
 offline=false;await c.testCloud.load();assert.equal(row.payload.titles[0].seen,10);
 c.anime[0].seen=11;c.save();row.revision++;row.payload.titles[0].seen=12;await c.testCloud.load();assert.equal(c.anime[0].seen,11);assert.equal(c.testCloud.state().conflict,true);assert.equal(row.payload.titles[0].seen,12);await c.testCloud.keepLocal();assert.equal(row.payload.titles[0].seen,11);
 // Automatic polling must not discard a newly typed, unsaved title.
 element('formName').value='New title';row.revision++;row.payload.titles[0].seen=13;await c.testCloud.refresh();assert.equal(c.anime[0].seen,11);element('formName').value='';await c.testCloud.refresh();assert.equal(c.anime[0].seen,13);
 console.log('Passed: shared load, wheel settings, saves, concurrency, backups, queued edits, offline recovery, conflict resolution, unsaved forms');
})().catch(e=>{console.error(e);process.exitCode=1});
