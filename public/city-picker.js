(() => {
  const API = 'https://api-adresse.data.gouv.fr/search/';
  const cache = new Map();
  let active = null;

  const css = document.createElement('style');
  css.textContent = `.locly-city-wrap{position:relative;flex:1;min-width:180px}.locly-city-wrap>input{width:100%}.locly-city-menu{position:absolute;z-index:9999;left:0;right:0;top:calc(100% + 8px);background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 18px 45px rgba(15,23,42,.14);padding:6px;max-height:310px;overflow:auto}.locly-city-item{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;text-align:left;padding:11px 12px;border-radius:10px;cursor:pointer;font:inherit;color:#111827}.locly-city-item:hover{background:#f3f4f6}.locly-city-item small{display:block;color:#6b7280;margin-top:2px}.locly-city-head{padding:9px 11px 5px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase}.locly-city-locate{display:flex;align-items:center;gap:8px;width:100%;border:0;background:#f5f3ff;color:#4f46e5;text-align:left;padding:11px 12px;border-radius:10px;cursor:pointer;font:600 14px inherit;margin-bottom:5px}.locly-city-status{padding:10px 12px;color:#6b7280;font-size:13px}`;
  document.head.appendChild(css);

  function cityInputs(){
    return [...document.querySelectorAll('#home-city, #city, input[name="city"]')];
  }
  function closeAll(){document.querySelectorAll('.locly-city-menu').forEach(x=>x.remove());active=null}
  function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  async function search(q){
    const key=q.trim().toLowerCase();
    if(key.length<2) return [];
    if(cache.has(key)) return cache.get(key);
    const r=await fetch(`${API}?q=${encodeURIComponent(q)}&type=municipality&limit=8`);
    if(!r.ok) return [];
    const data=await r.json();
    const rows=(data.features||[]).map(f=>{const p=f.properties||{};return {name:p.city||p.name||'',postcode:p.postcode||'',label:p.label||'',lat:f.geometry?.coordinates?.[1],lon:f.geometry?.coordinates?.[0]}}).filter(x=>x.name);
    cache.set(key,rows);return rows;
  }
  function choose(input,item){input.value=`${item.name} ${item.postcode}`.trim();input.dispatchEvent(new Event('change',{bubbles:true}));closeAll()}
  function menu(input){
    closeAll();
    const wrap=input.closest('.locly-city-wrap')||input.parentElement;
    const m=document.createElement('div');m.className='locly-city-menu';wrap.appendChild(m);active=input;
    const locate=document.createElement('button');locate.type='button';locate.className='locly-city-locate';locate.innerHTML='📍 <span>Me localiser automatiquement</span>';locate.onclick=()=>locateMe(input,m);m.appendChild(locate);
    const head=document.createElement('div');head.className='locly-city-head';head.textContent='Votre ville';m.appendChild(head);
    const status=document.createElement('div');status.className='locly-city-status';status.textContent='Commencez à saisir une ville ou un code postal…';m.appendChild(status);
    return m;
  }
  async function refresh(input,m){
    const q=input.value.trim();
    if(q.length<2){m.querySelector('.locly-city-status').textContent='Commencez à saisir une ville ou un code postal…';return}
    m.querySelector('.locly-city-status').textContent='Recherche des villes…';
    try{
      const rows=await search(q);const status=m.querySelector('.locly-city-status');
      if(!rows.length){status.textContent='Aucune ville trouvée.';return}
      status.remove();rows.forEach(x=>{const b=document.createElement('button');b.type='button';b.className='locly-city-item';b.innerHTML=`📍 <span><strong>${esc(x.name)}${x.postcode?' '+esc(x.postcode):''}</strong><small>${esc(x.label||'France')}</small></span>`;b.onclick=()=>choose(input,x);m.appendChild(b)})
    }catch{m.querySelector('.locly-city-status').textContent='Impossible de charger les villes pour le moment.'}
  }
  async function locateMe(input,m){
    const locate=m.querySelector('.locly-city-locate');
    if(!navigator.geolocation){locate.innerHTML='⚠️ Géolocalisation indisponible sur cet appareil';return}
    locate.disabled=true;locate.innerHTML='📍 <span>Localisation en cours…</span>';
    navigator.geolocation.getCurrentPosition(async pos=>{
      try{
        const r=await fetch(`${API}?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&type=municipality&limit=1`);const d=await r.json();const f=d.features?.[0];
        if(f){const p=f.properties||{};choose(input,{name:p.city||p.name||'',postcode:p.postcode||'',label:p.label||''})}
        else locate.innerHTML='⚠️ Ville introuvable';
      }catch{locate.innerHTML='⚠️ Localisation impossible'}
    },()=>{locate.disabled=false;locate.innerHTML='📍 <span>Autorisez la localisation pour continuer</span>'},{enableHighAccuracy:true,timeout:8000,maximumAge:300000});
  }
  function enhance(input){
    if(input.dataset.loclyCity==='1')return;
    input.dataset.loclyCity='1';input.autocomplete='off';input.placeholder=input.placeholder==='Ville'?'Votre ville ou code postal':'Votre ville ou code postal';
    const wrap=document.createElement('div');wrap.className='locly-city-wrap';input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);
    let timer;
    input.addEventListener('focus',()=>{const m=menu(input);if(input.value.trim().length>=2)refresh(input,m)});
    input.addEventListener('input',()=>{clearTimeout(timer);const m=input.parentElement.querySelector('.locly-city-menu')||menu(input);timer=setTimeout(()=>refresh(input,m),180)});
    input.addEventListener('keydown',e=>{if(e.key==='Escape')closeAll()});
  }
  const observer=new MutationObserver(()=>cityInputs().forEach(enhance));observer.observe(document.body,{subtree:true,childList:true});
  cityInputs().forEach(enhance);
  document.addEventListener('click',e=>{if(active&&!e.target.closest('.locly-city-wrap'))closeAll()});
})();
