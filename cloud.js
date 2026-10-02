/* One shared collection, publicly editable by the user's explicit choice. */
(() => {
  const ENDPOINT='https://uwpdtnppplweacxjxkar.supabase.co/rest/v1/anime_shared_collections?id=eq.main';
  const KEY='sb_publishable_tWkoksyTLZJ2qPyfZfKQzg_ebN80e3x';
  const CACHE='anime-shared-cache-v1', STORAGE='anime-shared-titles-v1';
  const $=id=>document.getElementById(id);
  let revision=0, ready=false, applying=false, pending=false, sending=false, loading=false, conflict=false, timer, loadPromise;
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const put=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const snapshot=()=>({titles:JSON.parse(JSON.stringify(anime)),settings:{mode:wheelMode(),seconds:wheelSeconds(),places:wheelPlaces()}});
  function status(message){$('cloudStatus').textContent=message;$('cloudMessage').textContent=message;$('cloudResolve').hidden=!conflict;}
  function remember(){return put(CACHE,{payload:snapshot(),revision,pending});}
  function lock(value){loading=value;document.querySelectorAll('.top,main').forEach(el=>el.inert=value);}
  function apply(payload){
    if(!payload||!Array.isArray(payload.titles)||!payload.titles.every(a=>Number.isSafeInteger(a.id)&&a.id>0&&typeof a.name==='string'))throw Error('Invalid collection');
    applying=true;
    try{
      anime=payload.titles.map(a=>({...a,seen:Math.max(0,Number(a.seen)||0),priority:priorityNumber(a.priority),ongoingPriority:priorityNumber(a.ongoingPriority),tilt:Number(a.tilt)||0,inWheel:!!a.inWheel}));
      const s=payload.settings||{};$('wheelMode').value=s.mode==='elimination'?'elimination':'classic';$('wheelPlaces').value=String(Math.max(1,Math.min(4,Number(s.places)||1)));$('wheelSpeed').value=String(Math.max(.2,Math.min(60,Number(s.seconds)||4.2)));
      lastDeleted=read('anime-shared-last-deleted',null);save();
      if(active)closeDetail();resetEditor();resetTournament();render();renderManage();renderWheel();route();
    }finally{applying=false;}
  }
  async function request(method='GET',base,payload){
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const url=ENDPOINT+(base!==undefined?'&revision=eq.'+encodeURIComponent(base):'')+'&select=payload,revision';
      const response=await fetch(url,{method,headers:{apikey:KEY,'Content-Type':'application/json',Prefer:'return=representation'},body:payload?JSON.stringify({payload}):undefined,signal:controller.signal});
      if(!response.ok)throw Error('Cloud HTTP '+response.status);
      const rows=await response.json();if(!Array.isArray(rows))throw Error('Invalid response');return rows[0]||null;
    }finally{clearTimeout(timeout);}
  }
  function changed(){
    if(applying||!ready)return;
    pending=true;remember();status(conflict?'Конфликт версий. Изменения сохранены на этом устройстве.':'Сохраняю в облако…');
    clearTimeout(timer);timer=setTimeout(flush,650);
  }
  async function flush(){
    if(!ready||!pending||sending||conflict||loading)return;
    sending=true;const payload=snapshot(),base=revision;
    try{
      const row=await request('PATCH',base,payload);
      if(!row){conflict=true;status('На другом устройстве появилась новая версия. Выбери, как продолжить.');}
      else{revision=row.revision;pending=JSON.stringify(payload)!==JSON.stringify(snapshot());remember();status(pending?'Сохраняю новые изменения…':'Сохранено в облаке');}
    }catch{remember();status('Нет связи с облаком. Изменения ждут отправки на этом устройстве.');}
    finally{sending=false;}
    if(pending&&!conflict){clearTimeout(timer);timer=setTimeout(flush,10000);}
  }
  async function load(){
    if(loadPromise)return loadPromise;
    loadPromise=(async()=>{
      lock(true);status('Загружаю общую коллекцию…');const cache=read(CACHE,null);
      try{
        const row=await request();if(!row)throw Error('Collection missing');
        if(cache?.pending){revision=cache.revision;apply(cache.payload);pending=true;conflict=row.revision!==revision;status(conflict?'Есть локальные изменения и новая версия в облаке':'Отправляю сохранённые изменения…');}
        else{revision=row.revision;apply(row.payload);pending=false;conflict=false;status('Сохранено в облаке');}
        ready=true;remember();lock(false);await flush();
      }catch{
        if(cache){revision=cache.revision;apply(cache.payload);pending=!!cache.pending;ready=true;lock(false);status(pending?'Облако недоступно. Изменения ждут отправки.':'Облако недоступно. Открыта сохранённая копия.');}
        else{ready=false;status('Не удалось загрузить общую коллекцию. Нажми «Повторить».');}
      }
    })();try{await loadPromise}finally{loadPromise=null}
  }
  async function refresh(force=false){
    if(!ready||loading||sending||wheelSpinning)return;
    if(pending&&!force){await flush();return;}
    if(!force&&(editingId||active||$('formName')?.value.trim()||document.activeElement?.closest('#titleForm')))return;
    try{
      const row=await request();if(!row)throw Error('Missing collection');
      if(pending&&!force)return;
      if(force||row.revision!==revision){
        if(force&&pending&&!put('anime-shared-backup:'+Date.now(),snapshot())){status('Не удалось сохранить резервную копию. Скачай текущую версию перед заменой.');return;}
        revision=row.revision;pending=false;conflict=false;apply(row.payload);remember();status('Сохранено в облаке');
      }
    }catch{status('Нет связи с облаком. Текущая копия сохранена на устройстве.');}
  }
  async function keepLocal(){
    if(sending||loading||wheelSpinning)return;
    try{
      const row=await request();if(!row)throw Error('Missing');
      if(!put('anime-shared-backup:'+Date.now(),row.payload)){status('Не удалось сохранить резервную копию. Попробуй позже.');return;}
      revision=row.revision;conflict=false;pending=true;remember();await flush();
    }catch{status('Нет связи с облаком. Попробуй позже.');}
  }
  async function retry(){if(!ready)await load();else if(conflict)status('Выбери версию в разделе конфликта.');else if(pending)await flush();else await refresh(true);}
  function exportCopy(){const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='anime-collection.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function start(){
    $('cloudAccount').onclick=()=>$('cloudDialog').showModal();$('cloudClose').onclick=()=>$('cloudDialog').close();$('cloudExport').onclick=exportCopy;$('cloudRetry').onclick=retry;$('cloudUseRemote').onclick=()=>refresh(true);$('cloudUseLocal').onclick=keepLocal;
    await load();
    setInterval(()=>{if(!document.hidden)refresh();},30000);window.addEventListener('online',retry);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
    window.addEventListener('beforeunload',e=>{if(pending){e.preventDefault();e.returnValue='';}});
  }
  window.animeCloud={start,changed,paused:()=>loading,storageKey:()=>STORAGE,undoKey:()=>'anime-shared-last-deleted'};
})();
