(() => {
  const app = document.querySelector('#app');
  if (!app) return;
  const token = () => localStorage.getItem('locly_token');
  const esc = (v='') => String(v).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const api = async (path) => {
    const r = await fetch('/api' + path, { headers: token() ? {Authorization:'Bearer '+token()} : {} });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Erreur serveur');
    return d;
  };
  const categories = ['Toutes','Événementiel','Outillage','Camping','Sono','Photo & vidéo','Mobilier','Vélo','Véhicule','Chantier','Autre'];
  let listings = [];
  let favorites = JSON.parse(localStorage.getItem('locly_favorites') || '[]');
  let state = {q:'', city:'', category:'Toutes', min:'', max:'', sort:'recent', radius:'50'};

  const icon = c => ({'Événementiel':'🎪','Outillage':'🛠️','Camping':'⛺','Sono':'🔊','Photo & vidéo':'📷','Mobilier':'🪑','Vélo':'🚲','Véhicule':'🚐','Chantier':'🚧'}[c] || '📦');
  const money = n => `${Number(n || 0).toFixed(0)} €`;

  function card(l) {
    const saved = favorites.includes(l.id);
    const rating = Number(l.owner_rating || 0);
    return `<article class="market-listing-card">
      <a class="market-listing-image" href="#/listing/${encodeURIComponent(l.id)}" aria-label="Voir ${esc(l.title)}"><span>${icon(l.category)}</span><button class="market-favorite ${saved?'is-saved':''}" type="button" onclick="event.preventDefault();event.stopPropagation();window.toggleLoclyFavorite(${Number(l.id)})" aria-label="${saved?'Retirer des favoris':'Ajouter aux favoris'}">${saved?'♥':'♡'}</button></a>
      <div class="market-listing-body">
        <div class="market-listing-category">${esc(l.category || 'Matériel')} ${l.owner_trust >= 70 ? '<span>✓ Loueur vérifié</span>' : ''}</div>
        <a class="market-listing-title" href="#/listing/${encodeURIComponent(l.id)}">${esc(l.title)}</a>
        <div class="market-listing-price">${money(l.price)} <small>/ jour</small></div>
        <div class="market-listing-meta"><span>📍 ${esc(l.city || 'France')}</span><span>⭐ ${rating ? rating.toFixed(1) : 'Nouveau'}</span></div>
        <div class="market-listing-footer"><span>${l.owner_trust ? `Confiance ${Math.round(l.owner_trust)}/100` : 'Nouveau loueur'}</span><a href="#/listing/${encodeURIComponent(l.id)}">Voir l'annonce →</a></div>
      </div>
    </article>`;
  }

  function shell() {
    app.innerHTML = `<div class="marketplace-feed">
      <div class="market-feed-container">
        <section class="market-search-panel">
          <div class="market-search-main">
            <div class="market-search-input"><span>⌕</span><input id="ml-q" value="${esc(state.q)}" placeholder="Que recherchez-vous ?" autocomplete="off"></div>
            <div class="market-search-input market-location-input"><span>⌖</span><input id="ml-city" value="${esc(state.city)}" placeholder="Ville, code postal" autocomplete="off"><button id="ml-geolocate" type="button" title="Utiliser ma position">◎</button></div>
            <button id="ml-search" class="market-search-submit" type="button">Rechercher</button>
          </div>
          <div class="market-search-bottom"><button id="ml-filter-open" class="market-filter-button" type="button">☷ Filtres <b id="ml-filter-count"></b></button><div class="market-active-filters" id="ml-active-filters"></div><button id="ml-clear" class="market-clear" type="button">Réinitialiser</button></div>
        </section>

        <section class="market-results-head">
          <div><div class="market-results-kicker">MARKETPLACE</div><h1>Toutes les annonces</h1><p id="ml-count">Chargement des annonces…</p></div>
          <label class="market-sort">Trier par <select id="ml-sort"><option value="recent">Plus récentes</option><option value="price_asc">Prix croissant</option><option value="price_desc">Prix décroissant</option><option value="rating">Meilleures notes</option></select></label>
        </section>

        <section class="market-results-layout">
          <aside class="market-filters" id="ml-filters">
            <div class="market-filter-head"><strong>Filtres</strong><button id="ml-filter-close" type="button">×</button></div>
            <div class="market-filter-group"><label>Catégorie</label><select id="ml-category">${categories.map(c=>`<option ${state.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
            <div class="market-filter-group"><label>Localisation</label><input id="ml-filter-city" value="${esc(state.city)}" placeholder="Ville ou code postal"><label class="small-label">Rayon</label><select id="ml-radius"><option value="5">5 km</option><option value="10">10 km</option><option value="25">25 km</option><option value="50" selected>50 km</option><option value="100">100 km</option></select></div>
            <div class="market-filter-group"><label>Prix / jour</label><div class="market-price-fields"><input id="ml-min" value="${esc(state.min)}" type="number" min="0" placeholder="Min €"><span>—</span><input id="ml-max" value="${esc(state.max)}" type="number" min="0" placeholder="Max €"></div></div>
            <button id="ml-apply" class="market-apply" type="button">Afficher les résultats</button>
          </aside>
          <div class="market-results"><div class="market-results-grid" id="ml-grid"><div class="market-loading">Chargement…</div></div><div class="market-pagination" id="ml-pagination"></div></div>
        </section>
      </div>
    </div>`;
    bind();
    load();
  }

  function bind() {
    document.querySelector('#ml-search').onclick = applySearch;
    document.querySelector('#ml-apply').onclick = () => { syncState(); closeFilters(); applySearch(); };
    document.querySelector('#ml-filter-open').onclick = () => document.querySelector('#ml-filters').classList.add('open');
    document.querySelector('#ml-filter-close').onclick = closeFilters;
    document.querySelector('#ml-clear').onclick = () => { state={q:'',city:'',category:'Toutes',min:'',max:'',sort:'recent',radius:'50'}; shell(); };
    document.querySelector('#ml-sort').onchange = e => { state.sort=e.target.value; render(); };
    document.querySelector('#ml-geolocate').onclick = geolocate;
    ['ml-q','ml-city'].forEach(id => document.querySelector('#'+id).addEventListener('keydown', e => { if(e.key==='Enter') applySearch(); }));
    updateFilterUI();
  }
  function syncState() {
    state.q = document.querySelector('#ml-q')?.value.trim() || '';
    state.city = document.querySelector('#ml-city')?.value.trim() || document.querySelector('#ml-filter-city')?.value.trim() || '';
    state.category = document.querySelector('#ml-category')?.value || 'Toutes';
    state.min = document.querySelector('#ml-min')?.value || '';
    state.max = document.querySelector('#ml-max')?.value || '';
    state.radius = document.querySelector('#ml-radius')?.value || '50';
  }
  function applySearch() { syncState(); closeFilters(); render(); updateFilterUI(); }
  function closeFilters() { document.querySelector('#ml-filters')?.classList.remove('open'); }
  function updateFilterUI() {
    const active=[state.category!=='Toutes',!!state.city,!!state.min,!!state.max].filter(Boolean).length;
    const c=document.querySelector('#ml-filter-count'); if(c)c.textContent=active?`(${active})`:'';
    const a=document.querySelector('#ml-active-filters'); if(a)a.innerHTML=[state.category!=='Toutes'?state.category:'',state.city?`📍 ${esc(state.city)}`:'',state.min?`≥ ${state.min} €`:'',state.max?`≤ ${state.max} €`:'' ].filter(Boolean).map(x=>`<span>${x}</span>`).join('');
  }

  async function load() {
    try { const d=await api('/listings'); listings=d.listings||[]; render(); }
    catch(e) { const g=document.querySelector('#ml-grid'); if(g)g.innerHTML=`<div class="market-empty"><strong>Impossible de charger les annonces</strong><p>${esc(e.message)}</p><button class="btn btn-primary" onclick="location.reload()">Réessayer</button></div>`; }
  }
  function render() {
    let data=listings.filter(l=>{
      const q=state.q.toLowerCase(); const title=`${l.title||''} ${l.description||''} ${l.category||''}`.toLowerCase();
      const price=Number(l.price||0);
      return (!q||title.includes(q)) && (!state.city || String(l.city||'').toLowerCase().includes(state.city.toLowerCase())) && (state.category==='Toutes'||l.category===state.category) && (!state.min||price>=Number(state.min)) && (!state.max||price<=Number(state.max));
    });
    data.sort((a,b)=> state.sort==='price_asc'?Number(a.price)-Number(b.price):state.sort==='price_desc'?Number(b.price)-Number(a.price):state.sort==='rating'?Number(b.owner_rating||0)-Number(a.owner_rating||0):Number(b.id)-Number(a.id));
    const count=document.querySelector('#ml-count'); if(count)count.textContent=`${data.length} annonce${data.length>1?'s':''}${state.city?' près de '+state.city:''}`;
    const grid=document.querySelector('#ml-grid'); if(grid)grid.innerHTML=data.length?data.map(card).join(''):`<div class="market-empty"><div class="market-empty-icon">⌕</div><strong>Aucune annonce trouvée</strong><p>Essayez une autre recherche ou élargissez vos filtres.</p><button class="btn btn-light" onclick="document.querySelector('#ml-clear').click()">Effacer les filtres</button></div>`;
    updateFilterUI();
  }
  async function geolocate() {
    if(!navigator.geolocation) return alert('La géolocalisation n’est pas disponible sur cet appareil.');
    const btn=document.querySelector('#ml-geolocate'); btn.textContent='…';
    navigator.geolocation.getCurrentPosition(async pos=>{
      try {
        const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&zoom=10&addressdetails=1`,{headers:{'Accept-Language':'fr'}});
        const d=await r.json(); const a=d.address||{}; const city=a.city||a.town||a.village||a.municipality||''; const cp=a.postcode||'';
        const value=[city,cp].filter(Boolean).join(' '); state.city=value; const i=document.querySelector('#ml-city'); const f=document.querySelector('#ml-filter-city'); if(i)i.value=value;if(f)f.value=value; render(); updateFilterUI();
      } catch { alert('Impossible de déterminer votre ville.'); }
      btn.textContent='◎';
    },()=>{btn.textContent='◎';alert('Autorisez la localisation dans votre navigateur pour utiliser cette fonction.');},{enableHighAccuracy:false,timeout:8000});
  }
  window.toggleLoclyFavorite=id=>{favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];localStorage.setItem('locly_favorites',JSON.stringify(favorites));render();};
  function isHome(){return (location.hash.split('?')[0]||'#/home')==='#/home'||location.hash===''||location.hash==='#';}
  let last=''; function sync(){if(!isHome())return; if(location.hash===last)return; last=location.hash; state.q=new URLSearchParams(location.hash.split('?')[1]||'').get('q')||''; state.city=new URLSearchParams(location.hash.split('?')[1]||'').get('city')||''; shell();}
  window.addEventListener('hashchange',()=>setTimeout(sync,0)); setTimeout(sync,0);
})();
