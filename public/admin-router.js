(() => {
  const render = () => {
    if (location.hash.split('?')[0] !== '#/admin') return;
    const app = document.querySelector('#app');
    if (!app) return;
    if (!localStorage.getItem('locly_token')) {
      location.hash = '#/login';
      return;
    }
    app.innerHTML = `<section class="dashboard admin-shell"><div class="container"><div class="section-head"><div><div class="eyebrow">Administration sécurisée</div><h1>Centre de contrôle Locly</h1><p class="muted">Modération, sécurité, utilisateurs et finances.</p></div><a class="btn btn-light" href="#/dashboard">← Mon espace</a></div><div class="stats"><div class="stat"><span>Utilisateurs</span><b id="admin-users">—</b></div><div class="stat"><span>Locations</span><b id="admin-bookings">—</b></div><div class="stat"><span>Signalements</span><b id="admin-reports">—</b></div><div class="stat"><span>Volume</span><b id="admin-volume">—</b></div></div><div class="admin-grid"><div class="panel"><h2>🛡️ Sécurité & modération</h2><div class="admin-actions"><button class="btn btn-light" data-admin-action="users">👥 Utilisateurs</button><button class="btn btn-light" data-admin-action="reports">🚨 Signalements</button><button class="btn btn-light" data-admin-action="bans">🔨 Bannissements</button><button class="btn btn-light" data-admin-action="ips">🌐 IP & sécurité</button></div></div><div class="panel"><h2>💶 Finance</h2><div class="admin-actions"><button class="btn btn-light" data-admin-action="ledger">📒 Ledger financier</button><button class="btn btn-light" data-admin-action="payouts">💳 Paiements</button><button class="btn btn-light" data-admin-action="refunds">↩️ Remboursements</button></div><div class="notice">Toutes les actions sensibles doivent être contrôlées côté serveur et inscrites dans le journal d'audit.</div></div></div><div class="panel" style="margin-top:18px"><div class="section-head"><div><h2>📜 Journal d'audit</h2><p class="muted">Dernières actions administratives.</p></div><span class="trust-badge">🔐 Accès restreint</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Administrateur</th><th>Action</th><th>Cible</th><th>IP</th></tr></thead><tbody id="admin-audit"><tr><td colspan="5">Chargement…</td></tr></tbody></table></div></div><div id="admin-message"></div></div></section>`;
    load();
  };
  const api = async (path, options={}) => {
    const token = localStorage.getItem('locly_token');
    const r = await fetch('/api' + path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Accès administrateur refusé (${r.status})`);
    return d;
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function load() {
    try {
      const d = await api('/admin/overview');
      document.querySelector('#admin-users').textContent = d.stats?.users ?? d.users ?? '0';
      document.querySelector('#admin-bookings').textContent = d.stats?.bookings ?? '0';
      document.querySelector('#admin-reports').textContent = d.stats?.reports ?? '0';
      document.querySelector('#admin-volume').textContent = d.stats?.volume != null ? `${Number(d.stats.volume).toFixed(0)} €` : '0 €';
      const rows = d.audit || d.logs || [];
      document.querySelector('#admin-audit').innerHTML = rows.length ? rows.map(x => `<tr><td>${esc(x.created_at || x.date)}</td><td>${esc(x.admin_name || x.actor)}</td><td>${esc(x.action)}</td><td>${esc(x.target || x.target_id)}</td><td>${esc(x.ip || '—')}</td></tr>`).join('') : '<tr><td colspan="5">Aucune action récente.</td></tr>';
    } catch (e) {
      document.querySelector('#admin-message').innerHTML = `<div class="error">${esc(e.message)}. La page est bien protégée : l’API doit refuser tout utilisateur sans rôle administrateur.</div>`;
    }
  }
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-admin-action]');
    if (!btn || location.hash.split('?')[0] !== '#/admin') return;
    const action = btn.dataset.adminAction;
    document.querySelector('#admin-message').innerHTML = `<div class="notice">Module « ${esc(action)} » prêt. Les opérations doivent être validées par les permissions serveur.</div>`;
  });
  window.addEventListener('hashchange', render);
  render();
})();