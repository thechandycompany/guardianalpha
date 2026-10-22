// Sign-in for the site's pages (index.html: the admin; join.html: owners
// joining the alpha), with Supabase Auth. Needs supabase-js loaded first
// (the jsDelivr <script> on each page). The publishable key is meant to be
// public; never put the secret / service-role key here.
//
// Sign-in ways: an emailed link always; the buttons in PROVIDERS once each
// is turned on in the Supabase dashboard (Authentication > Sign In /
// Providers). Plan: .agents/tasks/online-boards-and-registration/plan.md.
window.guardianAuth = (() => {
  // Saved under the old project name (vpet*) before the guardian rename: move them over once.
  for (const k of ['AdminKey', 'Nicknames', 'DetailsOpen', 'JoinToken']) {
    const was = localStorage.getItem('vpet' + k);
    if (was !== null && localStorage.getItem('guardian' + k) === null) localStorage.setItem('guardian' + k, was);
    localStorage.removeItem('vpet' + k);
  }

  const SUPABASE_URL = 'https://fkeiqvlwujxjlxaducge.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_JBw_SlIMnqg6k96ZsdqabQ_n50CMqfZ';
  // Each one on in the Supabase dashboard (2026-10-22: Google, Discord). Add 'apple' when it is.
  const PROVIDERS = ['google', 'discord'];
  const LABELS = { google: 'Google', apple: 'Apple', discord: 'Discord' };

  const sb = window.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  let session = null;
  const listeners = [];

  // The sign-in link comes back as ?code=...: once supabase-js has used it,
  // take it out of the address bar (the hash is left alone).
  const ready = sb.auth.getSession().then(({ data }) => {
    session = data.session;
    const q = new URLSearchParams(location.search);
    if (q.has('code')) {
      q.delete('code');
      const s = q.toString();
      history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
    }
    return session;
  });
  sb.auth.onAuthStateChange((_event, s) => {
    const was = session?.user?.id;
    session = s;
    if (was !== s?.user?.id) for (const f of listeners) f(s);
  });

  // Back to this page, without its hash (the redirect allow-list has the page).
  const here = () => location.origin + location.pathname + location.search;

  return {
    SUPABASE_URL,
    ready,
    session: () => session,
    email: () => session?.user?.email || '',
    onChange: f => listeners.push(f),
    async emailLink(email) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: here(), shouldCreateUser: true } });
      if (error) throw error;
    },
    async provider(name) {
      const { error } = await sb.auth.signInWithOAuth({ provider: name, options: { redirectTo: here() } });
      if (error) throw error;
    },
    signOut: () => sb.auth.signOut(),
    // Call a site function as the signed-in user.
    async call(fn, { method = 'GET', body, query = '' } = {}) {
      const headers = { Authorization: 'Bearer ' + (session?.access_token || '') };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(SUPABASE_URL + '/functions/v1/' + fn + query, {
        method, headers, cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      return { status: res.status, ok: res.ok, out };
    },
    // The sign-in box: an email field and a button per provider, into `box`.
    // `note(text, isError)` reports what happened.
    renderSignIn(box, note) {
      box.textContent = '';
      const form = document.createElement('form');
      form.className = 'signin';
      const input = Object.assign(document.createElement('input'), { type: 'email', required: true, placeholder: 'you@example.com', autocomplete: 'email' });
      input.setAttribute('aria-label', 'email');
      const send = Object.assign(document.createElement('button'), { type: 'submit', className: 'act-retry', textContent: 'Email me a link' });
      form.append(input, send);
      form.onsubmit = async e => {
        e.preventDefault();
        send.disabled = true;
        try {
          await this.emailLink(input.value.trim());
          note('Check your email for the sign-in link (open it in this browser).', false);
        } catch (err) {
          note("Couldn't send it: " + (err.message || err), true);
        } finally {
          send.disabled = false;
        }
      };
      box.append(form);
      if (PROVIDERS.length) {
        const row = document.createElement('div');
        row.className = 'signin-providers';
        for (const p of PROVIDERS) {
          const b = Object.assign(document.createElement('button'), { type: 'button', className: 'act-retry', textContent: 'Sign in with ' + (LABELS[p] || p) });
          b.onclick = () => this.provider(p).catch(err => note("Couldn't start it: " + (err.message || err), true));
          row.append(b);
        }
        box.append(row);
      }
    },
  };
})();
