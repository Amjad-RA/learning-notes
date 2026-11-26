// Shared page helper for output pages and the workspace site. Load it in <head> (not deferred),
// so the saved theme applies before the page draws.
// - Header links (SITE_NAV below) on the site and on output pages.
// - ☀/🌙 button in the top bar (.bar on outputs, header.top on the site); the choice is saved in localStorage
//   and shared by every page. With nothing saved, the page follows the phone or computer setting.
// - Claude Exam Notes layout (styles in tools/output.css and the site CSS in tools/build_site.py):
//   each h2 section of an output page (.wrap main) becomes a numbered section, and any page with 3 or more
//   h2 sections (outputs and the site's document pages, main.doc) gets an "On this page" table of contents:
//   a sidebar on wide screens, a bar stuck under the top bar on phones that names the section you're reading.
//   Pages with 5 or more sections also get a filter box.
//   <body data-nofold> keeps the page's own h2 layout (no numbered sections or filter) but still gets the
//   table of contents; <body data-notoc> turns the table of contents off.
(function () {
  const KEY = 'theme', root = document.documentElement;
  try { const t = localStorage.getItem(KEY); if (t) root.dataset.theme = t; } catch (e) {}
  const current = () => root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  function addToggle() {
    const host = document.querySelector('.bar, header.top .in');
    if (!host) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'theme';
    const label = () => { const dark = current() === 'dark'; b.textContent = dark ? '☀️' : '🌙'; b.title = b.ariaLabel = dark ? 'Switch to light mode' : 'Switch to dark mode'; };
    b.onclick = () => {
      root.dataset.theme = current() === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, root.dataset.theme); } catch (e) {}
      label(); window.dispatchEvent(new Event('resize'));  // canvases and charts that size themselves redraw
    };
    host.insertBefore(b, host.querySelector('button.print'));
    label();
  }

  // Header links, one list for the workspace site (header.top nav.site) and output pages (.bar with a
  // "Workspace home" link). Paths are from the workspace root.
  const SITE_NAV = [];
  function addNav() {
    let nav = document.querySelector('header.top nav.site'), root = nav ? nav.dataset.root || '' : null;
    if (!nav) {  // output pages: only bars whose one link is "Workspace home" (tutorials keep their own section links)
      const bar = document.querySelector('.bar');
      const links = bar ? bar.querySelectorAll('a') : [];
      if (links.length !== 1 || !/index\.html$/.test(links[0].getAttribute('href') || '')) return;
      root = links[0].getAttribute('href').replace(/index\.html$/, '');
      nav = Object.assign(document.createElement('nav'), { className: 'site' });
      nav.setAttribute('aria-label', 'Workspace');
      links[0].after(nav);
    }
    const here = location.pathname.replace(/\/$/, '/index.html');
    SITE_NAV.forEach(([label, path]) => {
      const a = Object.assign(document.createElement('a'), { href: root + path, textContent: label });
      const u = new URL(a.href);
      if (!u.hash && decodeURIComponent(u.pathname) === decodeURIComponent(here)) a.setAttribute('aria-current', 'page');
      if (label === 'Learning' && /\/04-study\/learning(\/|\.html)/.test(here)) a.setAttribute('aria-current', 'page');
      nav.append(a);
    });
    nav.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  const slug = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'section';

  function layout() {
    const main = document.querySelector('.wrap main') || document.querySelector('main.doc');
    if (!main) return;
    const body = document.body;
    const doc = main.matches('main.doc');   // site pages: each h2 is already in its own card (section.blk)
    const heads = [...main.querySelectorAll('h2')].filter(h => h.parentNode === main || (doc && h.parentNode.matches('section.blk') && h.parentNode.parentNode === main));
    const own = body.hasAttribute('data-nofold') || doc;

    // 1. Numbered sections (output pages): h2 and everything up to the next h2 go in a <section class="sec">.
    const secs = [];
    heads.forEach((h, i) => {
      if (!h.id) h.id = slug(h.textContent);
      if (own) {
        if (doc) h.prepend(Object.assign(document.createElement('span'), { className: 'sec-num', textContent: String(i + 1).padStart(2, '0') }));
        secs.push({ el: h, head: h }); return;
      }
      const sec = Object.assign(document.createElement('section'), { className: 'sec' });
      const nodes = [];
      for (let n = h.nextSibling; n && !(n.nodeType === 1 && (n.matches('h2') || n.querySelector('h2'))); n = n.nextSibling) nodes.push(n);
      main.insertBefore(sec, h);
      const num = Object.assign(document.createElement('span'), { className: 'sec-num', textContent: String(i + 1).padStart(2, '0') });
      h.prepend(num);
      sec.append(h, ...nodes);
      secs.push({ el: sec, head: h });
    });
    if (secs.length < 3 || body.hasAttribute('data-notoc')) return;

    // 2. Table of contents
    const aside = Object.assign(document.createElement('aside'), { className: 'ptoc' });
    aside.innerHTML = `<button type="button" class="toc-toggle" aria-expanded="false" aria-controls="toc-panel">
        <span class="toc-cur"><span class="toc-label">On this page</span></span><span class="toc-meta">${secs.length} sections</span><span class="toc-caret" aria-hidden="true">▼</span></button>
      <div class="toc-panel" id="toc-panel"><div class="toc-title">On this page</div><nav></nav></div>`;
    const nav = aside.querySelector('nav'), cur = aside.querySelector('.toc-cur'), toggle = aside.querySelector('.toc-toggle');
    const links = secs.map(({ head }, i) => {
      const a = document.createElement('a');
      a.href = '#' + head.id;
      const n = Object.assign(document.createElement('span'), { className: 'toc-num', textContent: String(i + 1).padStart(2, '0') });
      const c = head.cloneNode(true);
      c.querySelectorAll('.sec-num, .ic, .tag, svg').forEach(e => e.remove());
      const l = Object.assign(document.createElement('span'), { className: 'toc-label', textContent: c.textContent.replace(/^\s*\d+\s*·\s*/, '').trim() });
      a.append(n, l);
      nav.append(a);
      return a;
    });
    const content = Object.assign(document.createElement('div'), { className: 'toc-main' });
    content.append(...main.childNodes);
    main.append(aside, content);
    main.classList.add('has-toc');

    const setOpen = (o) => { aside.classList.toggle('open', o); toggle.setAttribute('aria-expanded', String(o)); };
    toggle.addEventListener('click', () => setOpen(!aside.classList.contains('open')));
    links.forEach(a => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('click', (e) => { if (!aside.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

    // the phone bar sticks just under the top bar
    const bar = document.querySelector('.bar, header.top');
    const setTop = () => root.style.setProperty('--bar-h', (bar ? bar.offsetHeight : 0) + 'px');
    setTop(); addEventListener('resize', setTop);

    // scroll spy: the section under the top fifth of the screen is "current"
    const spy = () => {
      const y = innerHeight * 0.22;
      let i = 0;
      secs.forEach(({ head }, j) => { if (head.getBoundingClientRect().top <= y) i = j; });
      links.forEach((a, j) => a.classList.toggle('active', j === i));
      cur.replaceChildren(...[...links[i].children].map(c => c.cloneNode(true)));
    };
    let raf = 0;
    addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(spy); }, { passive: true });
    spy();

    // 3. Filter box for longer pages (only where sections were built)
    if (!own && secs.length >= 5) {
      const box = Object.assign(document.createElement('input'), { type: 'search', className: 'search', placeholder: 'Filter sections…' });
      box.setAttribute('aria-label', 'Filter sections');
      content.insertBefore(box, secs[0].el);
      box.addEventListener('input', () => {
        const q = box.value.trim().toLowerCase();
        secs.forEach(({ el }, j) => { const hide = !!q && !el.textContent.toLowerCase().includes(q); el.hidden = hide; links[j].hidden = hide; });
      });
    }
    window.dispatchEvent(new Event('resize'));  // canvases that measured themselves before the move redraw

    // open at the right place when the URL has #section
    if (location.hash) { const t = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) t.scrollIntoView(); }
  }

  const ready = () => { addNav(); addToggle(); layout(); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', ready) : ready();
})();
