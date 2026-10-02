/* Public key only. Access is enforced by Supabase Auth and database RLS. */
(() => {
  const URL = 'https://uwpdtnppplweacxjxkar.supabase.co';
  const KEY = 'sb_publishable_tWkoksyTLZJ2qPyfZfKQzg_ebN80e3x';
  const SITE = 'https://peskoshachy.github.io/anime-tracker/';
  let client, user, revision = 0, ready = false, applying = false;
  let pending = false, sending = false, conflict = false, timer, generation = 0;
  let guest, transition = false, lastStatus = 'Данные только в этом браузере';
  const $ = id => document.getElementById(id);
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const put = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* in-memory queue remains */ } };
  const cacheKey = () => 'anime-cloud-cache:' + user.id;
  const snapshot = () => ({titles: JSON.parse(JSON.stringify(anime)), settings: {mode: wheelMode(), seconds: wheelSeconds(), places: wheelPlaces()}});
  function status(message) { lastStatus = message; $('cloudStatus').textContent = message; $('cloudMessage').textContent = message; }
  function lock(value) { transition = value; document.querySelectorAll('.top, main').forEach(el => el.inert = value); }
  function remember() { if(user) put(cacheKey(), {payload:snapshot(), revision, pending}); }
  function repaint() { if(active) closeDetail(); resetEditor(); resetTournament(); render(); renderManage(); renderWheel(); route(); }
  function apply(payload) {
    if(!payload || !Array.isArray(payload.titles)) throw Error('Некорректные данные коллекции');
    applying = true;
    try {
      anime = payload.titles.filter(a => Number.isSafeInteger(a.id) && a.id > 0 && typeof a.name === 'string').map(a => ({...a, seen:Math.max(0,Number(a.seen)||0), priority:priorityNumber(a.priority), ongoingPriority:priorityNumber(a.ongoingPriority), tilt:Number(a.tilt)||0, inWheel:!!a.inWheel}));
      const s = payload.settings || {};
      $('wheelMode').value = s.mode === 'elimination' ? 'elimination' : 'classic';
      $('wheelPlaces').value = String(Math.max(1,Math.min(4,Number(s.places)||1)));
      $('wheelSpeed').value = String(Math.max(.2,Math.min(60,Number(s.seconds)||4.2)));
      lastDeleted = null; save(); repaint();
    } finally { applying = false; }
  }
  function changed() {
    if(applying)return;
    if(!user) { if(guest)guest=snapshot(); return; }
    if(!ready)return;
    pending = true; remember();
    status(conflict ? 'Конфликт: изменения сохранены на этом устройстве' : 'Сохраняю в облако…');
    clearTimeout(timer); timer = setTimeout(flush,650);
  }
  async function fetchRow() {
    const {data,error} = await client.from('anime_collections').select('payload,revision').eq('user_id',user.id).maybeSingle();
    if(error) throw error; return data;
  }
  async function flush() {
    if(!ready || !user || !pending || sending || conflict) return;
    sending = true;
    const uid = user.id, ticket = generation, payload = snapshot(), base = revision;
    try {
      const query = base ? client.from('anime_collections').update({payload}).eq('user_id',uid).eq('revision',base) : client.from('anime_collections').insert({user_id:uid,payload});
      const {data,error} = await query.select('revision').maybeSingle();
      if(ticket !== generation) return;
      if(error) { if(error.code === '23505') { conflict=true; status('Коллекция уже изменена на другом устройстве'); } else throw error; }
      else if(!data) { conflict=true; status('Коллекция изменена на другом устройстве. Выбери, как продолжить.'); }
      else {
        revision = data.revision;
        pending = JSON.stringify(payload) !== JSON.stringify(snapshot());
        remember(); status(pending ? 'Сохраняю новые изменения…' : 'Сохранено в облаке');
      }
    } catch { status('Нет связи с облаком. Изменения ждут отправки на этом устройстве.'); remember(); }
    finally { sending=false; updateControls(); }
    if(pending && !conflict && ticket===generation && navigator.onLine) { clearTimeout(timer); timer=setTimeout(flush,10000); }
  }
  async function refresh(force=false) {
    if(!user || !ready || sending || transition || wheelSpinning) return;
    if(pending && !force) { await flush(); return; }
    if((editingId || active || document.activeElement?.closest('#titleForm')) && !force) return;
    const ticket=generation;
    try {
      const row=await fetchRow(); if(ticket!==generation)return;
      if(pending && !force)return;
      if(row && (force || row.revision !== revision)) {
        if(force && pending) put('anime-cloud-backup:'+user.id+':'+Date.now(),snapshot());
        revision=row.revision; pending=false; conflict=false; apply(row.payload); remember(); status('Сохранено в облаке');
      }
    } catch { status('Не удалось загрузить облако. Текущие данные сохранены на устройстве.'); }
    updateControls();
  }
  function updateControls() {
    $('cloudEmailForm').hidden=!!user;
    $('cloudSignedIn').hidden=!user;
    $('cloudEmailLabel').textContent=user?.email || '';
    $('cloudResolve').hidden=!conflict;
    $('cloudImport').disabled=!ready || !guest?.titles.length || wheelSpinning;
    $('cloudLogout').disabled=sending || transition || wheelSpinning;
    $('cloudRetry').disabled=sending || transition || wheelSpinning;
  }
  async function sessionChanged(session) {
    if(session?.user.id === user?.id && ready)return;
    if(wheelSpinning) { setTimeout(()=>sessionChanged(session),1000); return; }
    const ticket=++generation; clearTimeout(timer); ready=false; lock(true);
    user=session?.user || null; revision=0; pending=false; conflict=false;
    if(!user) {
      apply(guest); ready=true; lock(false); status('Данные только в этом браузере'); updateControls(); return;
    }
    status('Загружаю твою коллекцию…'); updateControls();
    const cache=read(cacheKey(),null);
    try {
      const row=await fetchRow(); if(ticket!==generation)return;
      if(cache?.pending) {
        revision=cache.revision; apply(cache.payload); pending=true;
        conflict=!!row && row.revision!==revision;
        status(conflict ? 'Есть несохранённые изменения и новая версия в облаке' : 'Отправляю сохранённые изменения…');
      } else if(row) { revision=row.revision; apply(row.payload); status('Сохранено в облаке'); }
      else { apply(guest); pending=true; status('Переношу коллекцию в облако…'); }
      ready=true; remember(); lock(false); updateControls(); await flush(); syncAniList();
    } catch {
      if(ticket!==generation)return;
      if(cache) { revision=cache.revision; apply(cache.payload); pending=!!cache.pending; ready=true; lock(false); status('Облако недоступно. Открыта сохранённая копия твоего аккаунта.'); }
      else { status('Облако недоступно. Нажми «Повторить» для загрузки коллекции.'); }
      updateControls();
    }
  }
  async function retry() { if(!ready) await sessionChanged({user}); else if(conflict) status('Сначала выбери версию в разделе конфликта.'); else if(pending) await flush(); else await refresh(true); }
  function exportCopy() {
    const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}), url=globalThis.URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='anime-collection.json'; a.click(); setTimeout(()=>globalThis.URL.revokeObjectURL(url),1000);
  }
  async function keepLocal() {
    if(sending || wheelSpinning)return;
    const ticket=generation;
    try { const row=await fetchRow(); if(ticket!==generation)return; if(row)put('anime-cloud-backup:'+user.id+':'+Date.now(),row.payload); revision=row?.revision||0; conflict=false; pending=true; remember(); await flush(); }
    catch { status('Нет связи с облаком. Попробуй позже.'); }
    updateControls();
  }
  async function start() {
    guest=snapshot();
    $('cloudAccount').onclick=()=>{ updateControls(); $('cloudDialog').showModal(); };
    $('cloudClose').onclick=()=>$('cloudDialog').close();
    $('cloudExport').onclick=exportCopy;
    $('cloudRetry').onclick=retry;
    $('cloudUseRemote').onclick=()=>refresh(true);
    $('cloudUseLocal').onclick=keepLocal;
    $('cloudImport').onclick=()=>{
      if(!ready || wheelSpinning)return;
      const ids=new Set(anime.map(a=>a.id)); const extra=guest.titles.filter(a=>!ids.has(a.id));
      anime.push(...extra); save(); repaint(); status(extra.length ? 'Добавляю тайтлы из этого браузера…' : 'Все локальные тайтлы уже есть в коллекции');
    };
    $('cloudLogout').onclick=async()=>{
      if(sending || transition || wheelSpinning)return;
      if(pending) { status('Сначала сохрани изменения в облако или скачай копию.'); return; }
      const {error}=await client.auth.signOut({scope:'local'}); if(error)status('Не удалось выйти. Попробуй ещё раз.');
    };
    $('cloudEmailForm').onsubmit=async e=>{
      e.preventDefault(); if(!client) { status('Сервис входа недоступен. Обнови страницу.'); return; }
      $('cloudSend').disabled=true;
      try {
        const {error}=await client.auth.signInWithOtp({email:$('cloudEmail').value.trim(),options:{emailRedirectTo:SITE}});
        status(error ? (error.code==='over_email_send_rate_limit' ? 'Письма отправляются слишком часто. Подожди и попробуй снова.' : 'Не удалось отправить письмо. Проверь почту и настройки отправки Supabase.') : 'Письмо отправлено. Открой ссылку на этом устройстве, чтобы войти.');
      } catch { status('Нет связи с сервисом входа. Попробуй позже.'); }
      finally { $('cloudSend').disabled=false; }
    };
    lock(true);
    try {
      const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      client=createClient(URL,KEY);
      const {data,error}=await client.auth.getSession(); if(error)throw error;
      await sessionChanged(data.session);
      client.auth.onAuthStateChange((_event,session)=>setTimeout(()=>sessionChanged(session),0));
      setInterval(()=>{ if(!document.hidden)refresh(); },30000);
      window.addEventListener('online',retry);
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
      window.addEventListener('beforeunload',e=>{if(pending){e.preventDefault();e.returnValue='';}});
    } catch { lock(false); ready=false; status('Облако недоступно. Данные сохраняются только в этом браузере.'); }
  }
  window.animeCloud={start,changed,paused:()=>transition,storageKey:()=>user ? 'anime-pinboard-account:'+user.id : null,undoKey:()=>user ? 'anime-last-deleted:'+user.id : 'anime-last-deleted'};
})();
