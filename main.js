/* ==========================================================================
   Lumenorth — motion, cursor and interactions (shared by both pages)
   ========================================================================== */
(() => {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const html = document.documentElement, body = document.body;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const pad = n => String(n).padStart(2, '0');
  const rand = a => a[Math.floor(Math.random() * a.length)];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  };
  const isHome = body.dataset.page === 'home';

  /* ---------- 1. smooth scroll + one shared animation loop ---------- */
  let lenis = null;
  if (!reduce && typeof window.Lenis === 'function') {
    try { lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true }); } catch (e) { lenis = null; }
  }
  const ticks = [];
  const onTick = f => ticks.push(f);
  let lastY = scrollY, vel = 0;
  const loop = t => {
    if (lenis) lenis.raf(t);
    const y = scrollY;
    vel = lerp(vel, y - lastY, 0.15);
    lastY = y;
    for (const f of ticks) f(t, y, vel);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const goTo = target => {
    if (lenis) { lenis.scrollTo(target, { offset: typeof target === 'number' ? 0 : -70, duration: 1.4 }); return; }
    const y = typeof target === 'number' ? target : target.getBoundingClientRect().top + scrollY - 70;
    window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  };
  const locked = { menu: false, ir: false };
  const isLocked = () => locked.menu || locked.ir;
  const applyLock = () => {
    const l = isLocked();
    html.classList.toggle('locked', l);
    if (lenis) l ? lenis.stop() : lenis.start();
  };

  /* ---------- 2. text effects ---------- */
  // split headings into masked words
  $$('[data-split]').forEach(el => {
    let i = 0;
    const frag = document.createDocumentFragment();
    const word = (txt, wrapper) => {
      const w = document.createElement('span'); w.className = 'w';
      const wi = document.createElement('span'); wi.className = 'wi'; wi.style.setProperty('--i', i++);
      if (wrapper) { const c = wrapper.cloneNode(false); c.textContent = txt; wi.appendChild(c); } else wi.textContent = txt;
      w.appendChild(wi);
      return w;
    };
    const add = (text, wrapper) => text.split(/(\s+)/).forEach(p => {
      if (!p) return;
      frag.appendChild(/^\s+$/.test(p) ? document.createTextNode(' ') : word(p, wrapper));
    });
    [...el.childNodes].forEach(n => {
      if (n.nodeType === 3) add(n.textContent);
      else if (n.nodeName === 'BR') frag.appendChild(document.createElement('br'));
      else if (n.nodeType === 1) add(n.textContent, n);
    });
    el.textContent = '';
    el.appendChild(frag);
  });

  // "decode" scramble
  const GLYPHS = '!<>-_\\/[]{}=+*^?#01';
  const scramble = (el, dur = 800) => {
    const final = el.dataset.text || (el.dataset.text = el.textContent);
    if (reduce) { el.textContent = final; return; }
    cancelAnimationFrame(el._sr);
    const t0 = performance.now();
    const step = t => {
      const p = Math.min((t - t0) / dur, 1);
      let out = '';
      for (let i = 0; i < final.length; i++) {
        const ch = final[i];
        out += (ch === ' ' || i / final.length < p) ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (p < 1) el._sr = requestAnimationFrame(step);
    };
    el._sr = requestAnimationFrame(step);
  };

  // scroll-scrubbed paragraph (words light up as you scroll)
  const scrubs = $$('[data-scrub]').map(el => {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((w, i) => {
      const s = document.createElement('span'); s.className = 'sw'; s.textContent = w;
      el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
    return { el, ws: $$('.sw', el), k: -1 };
  });
  if (!reduce) onTick(() => {
    const vh = innerHeight;
    scrubs.forEach(s => {
      const r = s.el.getBoundingClientRect();
      if (r.bottom < -50 || r.top > vh + 50) return;
      const p = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.35), 0, 1);
      const k = p * s.ws.length;
      if (Math.abs(k - s.k) < 0.02) return;
      s.k = k;
      s.ws.forEach((w, i) => { w.style.opacity = (0.14 + 0.86 * clamp(k - i, 0, 1)).toFixed(3); });
    });
  });

  // rolling button labels
  $$('.btn>span, .ir>span').forEach(s => {
    const t = s.textContent.trim();
    s.textContent = '';
    const em = document.createElement('em'); em.textContent = t; em.dataset.t = t;
    s.appendChild(em);
  });
  // fill grows from where the cursor enters
  $$('.btn').forEach(b => b.addEventListener('mouseenter', e => {
    const r = b.getBoundingClientRect();
    b.style.setProperty('--bx', (e.clientX - r.left) + 'px');
    b.style.setProperty('--by', (e.clientY - r.top) + 'px');
  }));

  // footer wordmark letters
  $$('.bigmark').forEach(el => {
    const txt = el.textContent.trim();
    el.textContent = '';
    [...txt].forEach((c, i) => {
      const s = document.createElement('span'); s.textContent = c; s.style.transitionDelay = (i * 0.05) + 's';
      el.appendChild(s);
    });
  });

  /* ---------- 3. load sequence: preloader / page transition ---------- */
  let isReady = false;
  const readyQ = [];
  const whenReady = f => (isReady ? f() : readyQ.push(f));
  const ready = () => {
    if (isReady) return;
    isReady = true;
    body.classList.add('loaded');
    readyQ.splice(0).forEach(f => f());
  };

  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    io.unobserve(el);
    el.classList.add('in');
    whenReady(() => {
      if (el.hasAttribute('data-scramble')) setTimeout(() => scramble(el, 900), 150);
      if (el.classList.contains('rv')) setTimeout(() => el.classList.add('settled'), 1700);
    });
  }), { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
  $$('.rv, [data-split], [data-scramble], .stat, .bigmark').forEach(el => io.observe(el));

  const pt = $('.pt');
  const leave = href => {
    if (reduce || !pt) { location.href = href; return; }
    store.set('lm-t', '1');
    pt.classList.remove('reveal');
    void pt.offsetWidth;
    pt.classList.add('cover');
    setTimeout(() => { location.href = href; }, 900);
  };
  addEventListener('pageshow', e => {
    if (e.persisted && pt) { pt.classList.remove('cover'); pt.classList.add('reveal'); store.del('lm-t'); ready(); }
  });

  const boot = pre => {
    const lines = [
      '<b>[ OK ]</b> loading detection rules · 8,412 active',
      '<b>[ OK ]</b> threat-intel feeds synced · 1,204 new IOCs',
      '<b>[ OK ]</b> sensors online · 3 regions',
      '<b>[ OK ]</b> analyst desk staffed · tier 1 / 2 / 3',
      '<b>[ OK ]</b> defense grid active<span class="caret"></span>'
    ];
    const box = $('#boot', pre), num = $('#preNum', pre), bar = $('#preBar', pre);
    lines.forEach(l => { const d = document.createElement('div'); d.innerHTML = l; box.appendChild(d); });
    const rows = $$('div', box), dur = 2100, t0 = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      pre.classList.add('done');
      setTimeout(ready, 250);
      setTimeout(() => pre.remove(), 1300);
    };
    const step = t => {
      const p = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      num.textContent = String(Math.round(e * 100)).padStart(3, '0');
      bar.style.width = (e * 100) + '%';
      rows.forEach((r, i) => { if (p >= i / rows.length) r.classList.add('show'); });
      if (p < 1) requestAnimationFrame(step); else setTimeout(finish, 350);
    };
    requestAnimationFrame(step);
    setTimeout(finish, 5000); // safety net
  };

  const start = () => {
    const pre = $('#pre');
    if (html.classList.contains('pt-in')) {
      if (pre) pre.remove();
      store.del('lm-t');
      requestAnimationFrame(() => {
        if (pt) pt.classList.add('reveal');
        html.classList.remove('pt-in');
        setTimeout(ready, 300);
      });
      return;
    }
    if (!pre) { ready(); return; }
    store.set('lm-booted', '1');
    if (reduce) { pre.remove(); ready(); return; }
    boot(pre);
  };

  /* ---------- 4. custom cursor ---------- */
  const cur = $('#cursor');
  if (cur && fine && !reduce) {
    html.classList.add('has-cursor');
    const ring = $('.c-ring', cur), dot = $('.c-dot', cur), label = $('.c-label', cur), coord = $('.c-coord', cur);
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my, seen = false, state = '';
    const setState = (s, txt = '') => {
      if (s === state && label.textContent === txt) return;
      state = s; cur.dataset.state = s; label.textContent = txt;
    };
    addEventListener('mousemove', e => {
      mx = e.clientX; my = e.clientY;
      if (!seen) { seen = true; rx = mx; ry = my; cur.classList.add('on'); }
    }, { passive: true });
    document.addEventListener('mouseleave', () => cur.classList.remove('on'));
    document.addEventListener('mouseenter', () => { if (seen) cur.classList.add('on'); });
    addEventListener('mousedown', () => cur.classList.add('down'));
    addEventListener('mouseup', () => cur.classList.remove('down'));
    addEventListener('click', e => {
      const r = document.createElement('span');
      r.className = 'c-ripple';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      body.appendChild(r);
      r.addEventListener('animationend', () => r.remove());
    });
    document.addEventListener('mouseover', e => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      cur.classList.toggle('coords', !!t.closest('[data-coords]'));
      const lab = t.closest('[data-cursor]');
      if (lab && lab.dataset.cursor) {
        const v = lab.dataset.cursor;
        return v === 'drag' ? setState('drag', '← Drag →') : setState('label', v);
      }
      if (t.closest('input:not([type=checkbox]):not([type=radio]), textarea')) return setState('text');
      if (t.closest('a, button, select, label, [role=button], .chips span')) return setState('hover');
      setState('');
    });
    onTick(() => {
      rx = lerp(rx, mx, 0.17); ry = lerp(ry, my, 0.17);
      const vx = mx - rx, vy = my - ry;
      const sp = state === '' ? Math.min(Math.hypot(vx, vy) / 90, 0.5) : 0;
      const ang = sp > 0.01 ? Math.atan2(vy, vx) * 57.2958 : 0;
      ring.style.transform = `translate3d(${rx}px,${ry}px,0) rotate(${ang}deg) scale(${1 + sp},${1 - sp * 0.5})`;
      dot.style.transform = `translate3d(${mx}px,${my}px,0)`;
      if (cur.classList.contains('coords')) coord.textContent = `X:${String(mx | 0).padStart(4, '0')}  Y:${String(my | 0).padStart(4, '0')}`;
    });

    // magnetic buttons
    $$('.magnetic').forEach(b => {
      const inner = b.querySelector(':scope > span');
      b.addEventListener('mousemove', e => {
        const r = b.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
        b.style.transform = `translate(${x * 0.3}px,${y * 0.45}px)`;
        if (inner) inner.style.transform = `translate(${x * 0.12}px,${y * 0.2}px)`;
      });
      b.addEventListener('mouseleave', () => { b.style.transform = ''; if (inner) inner.style.transform = ''; });
    });

    // 3D tilt + spotlight cards
    $$('[data-tilt]').forEach(c => {
      c.addEventListener('mousemove', e => {
        const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        c.style.setProperty('--mx', px * 100 + '%');
        c.style.setProperty('--my', py * 100 + '%');
        c.style.transform = `perspective(1000px) rotateX(${(0.5 - py) * 7}deg) rotateY(${(px - 0.5) * 9}deg) translateY(-4px)`;
      });
      c.addEventListener('mouseleave', () => { c.style.transform = ''; });
    });

    // hero glow + console parallax
    $$('.hero, .phero').forEach(h => {
      const glow = $('[data-glow]', h), t3 = $('.tilt3d', h);
      let tx = 0, ty = 0, cx = 0, cy = 0;
      h.addEventListener('mousemove', e => {
        const r = h.getBoundingClientRect();
        if (glow) { glow.style.setProperty('--hx', (e.clientX - r.left) + 'px'); glow.style.setProperty('--hy', (e.clientY - r.top) + 'px'); }
        tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5;
      });
      h.addEventListener('mouseleave', () => { tx = ty = 0; });
      if (t3) onTick(() => {
        cx = lerp(cx, tx, 0.06); cy = lerp(cy, ty, 0.06);
        t3.style.transform = `rotateY(${cx * 12}deg) rotateX(${-cy * 9}deg) translate3d(${cx * 16}px,${cy * 12}px,0)`;
      });
    });
  }

  // nav + footer link scramble on hover
  $$('.menu a.l .sc, .fgrid li a').forEach(s => {
    const host = s.closest('a');
    host.addEventListener('mouseenter', () => scramble(s, 450));
  });

  /* ---------- 5. nav, progress, back-to-top ---------- */
  const nav = $('#nav'), prog = $('#progress'), totop = $('#totop'), circ = totop && $('.prog-c', totop);
  let navY = scrollY;
  const onScroll = () => {
    const y = scrollY, h = html.scrollHeight - innerHeight, p = h > 0 ? clamp(y / h, 0, 1) : 0;
    if (prog) prog.style.transform = `scaleX(${p})`;
    if (nav) {
      nav.classList.toggle('scrolled', y > 40);
      if (!isLocked()) nav.classList.toggle('hide', y > navY && y > 400);
    }
    navY = y;
    if (totop) { totop.classList.toggle('show', y > 700); circ.style.strokeDashoffset = 150.8 * (1 - p); }
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (totop) totop.addEventListener('click', () => goTo(0));

  const burger = $('#burger'), mobile = $('#mobile');
  const setMenu = o => {
    if (!mobile) return;
    burger.classList.toggle('open', o);
    mobile.classList.toggle('open', o);
    burger.setAttribute('aria-expanded', String(o));
    locked.menu = o; applyLock();
  };
  if (burger) burger.addEventListener('click', () => setMenu(!mobile.classList.contains('open')));
  const accBtn = $('#mAccBtn');
  if (accBtn) accBtn.addEventListener('click', () => $('#mAcc').classList.toggle('open'));

  const irm = $('#irModal');
  const irSet = o => {
    if (!irm) return;
    irm.classList.toggle('open', o);
    irm.setAttribute('aria-hidden', String(!o));
    locked.ir = o; applyLock();
    if (o) setTimeout(() => { const f = $('#ir1'); if (f) f.focus({ preventScroll: true }); }, 600);
  };
  const irOpen = $('#irOpen'), irOpenM = $('#irOpenM'), irClose = $('#irClose');
  if (irOpen) irOpen.addEventListener('click', () => irSet(true));
  if (irOpenM) irOpenM.addEventListener('click', () => { setMenu(false); setTimeout(() => irSet(true), 350); });
  if (irClose) irClose.addEventListener('click', () => irSet(false));
  if (irm) irm.addEventListener('click', e => { if (e.target === irm) irSet(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') { irSet(false); setMenu(false); } });

  // all link clicks: smooth anchors + page transitions
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href === '#') { e.preventDefault(); return; }
    const inMenu = !!a.closest('#mobile');
    if (href.startsWith('#')) {
      const t = document.querySelector(href);
      if (!t) return;
      e.preventDefault();
      if (inMenu) setMenu(false);
      goTo(href === '#top' ? 0 : t);
      return;
    }
    if (a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || /^(mailto|tel):/i.test(href)) return;
    const url = new URL(a.href, location.href);
    if (url.protocol !== location.protocol || url.host !== location.host) return;
    e.preventDefault();
    if (inMenu) setMenu(false);
    leave(url.href);
  });

  // active section in the menu (home page)
  if (isHome) {
    const spy = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      $$('#menu a.l').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
    }), { rootMargin: '-45% 0px -50% 0px' });
    ['top', 'about', 'services', 'insights', 'resources', 'contact'].forEach(id => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }

  /* ---------- 6. forms (demo only) ---------- */
  $$('form[data-demo]').forEach(f => {
    f.setAttribute('novalidate', '');
    f.addEventListener('submit', e => {
      e.preventDefault();
      let ok = true;
      $$('[required]', f).forEach(i => {
        const bad = !i.value.trim() || (i.type === 'email' && !/^\S+@\S+\.\S+$/.test(i.value));
        const fld = i.closest('.field'); if (fld) fld.classList.toggle('bad', bad);
        if (bad) ok = false;
      });
      if (!ok) { f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); return; }
      const th = $('.thanks', f);
      if (th) { th.style.display = 'block'; scramble(th, 700); }
      f.reset();
    });
    $$('input, textarea', f).forEach(i => i.addEventListener('input', () => { const fld = i.closest('.field'); if (fld) fld.classList.remove('bad'); }));
  });

  /* ---------- 7. counters ---------- */
  const count = el => {
    const end = +el.dataset.count, suf = el.dataset.suffix || '', pre = el.dataset.prefix || '';
    if (reduce) { el.textContent = pre + end + suf; return; }
    const t0 = performance.now(), dur = 1800;
    const tick = t => {
      const p = Math.min((t - t0) / dur, 1);
      el.textContent = pre + Math.round(end * (1 - Math.pow(1 - p, 4))) + suf;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const co = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    co.unobserve(e.target);
    whenReady(() => count(e.target));
  }), { threshold: 0.5 });
  $$('[data-count]').forEach(el => co.observe(el));

  /* ---------- 8. scroll-driven motion ---------- */
  // velocity marquees
  $$('[data-marquee]').forEach(m => {
    const tr = $('.track', m);
    const base = +m.dataset.marquee || 1, rev = m.hasAttribute('data-reverse') ? -1 : 1;
    let x = 0, w = 0, dir = 1, vis = true, slow = 1;
    const size = () => { w = tr.scrollWidth / 2; };
    size();
    addEventListener('resize', debounce(size, 200));
    if (document.fonts) document.fonts.ready.then(size);
    new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(m);
    m.addEventListener('mouseenter', () => { slow = 0.25; });
    m.addEventListener('mouseleave', () => { slow = 1; });
    if (!reduce) onTick((t, y, v) => {
      if (!vis || !w) return;
      if (v > 0.3) dir = 1; else if (v < -0.3) dir = -1;
      x -= (base + Math.min(Math.abs(v) * 0.6, 18)) * dir * rev * slow;
      if (x <= -w) x += w;
      if (x > 0) x -= w;
      tr.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
    });
  });

  // simple parallax
  const pars = $$('[data-speed]').map(el => ({ el, s: +el.dataset.speed, y: 0 }));
  if (!reduce) onTick(() => {
    const vh = innerHeight;
    pars.forEach(p => {
      const r = p.el.getBoundingClientRect(), top = r.top - p.y;
      if (top > vh + 200 || top + r.height < -200) return;
      p.y = -(top + r.height / 2 - vh / 2) * p.s;
      p.el.style.transform = `translate3d(0,${p.y.toFixed(1)}px,0)`;
    });
  });

  // pinned horizontal pipeline
  const hs = $('#hs');
  if (hs) {
    const track = $('.hs-track', hs), panels = $$('.hs-panel', hs), rail = $('.hs-rail i', hs), num = $('#hsNum');
    let maxX = 0, active = false;
    const size = () => {
      active = innerWidth > 900 && !reduce;
      if (active) {
        maxX = Math.max(0, track.offsetWidth - html.clientWidth);
        hs.style.height = (maxX + innerHeight) + 'px';
      } else { hs.style.height = ''; track.style.transform = ''; }
    };
    size();
    addEventListener('resize', debounce(size, 150));
    if (document.fonts) document.fonts.ready.then(size);
    onTick(() => {
      if (!active) return;
      const r = hs.getBoundingClientRect(), total = hs.offsetHeight - innerHeight;
      if (r.bottom < -50 || r.top > innerHeight + 50) return;
      const p = total > 0 ? clamp(-r.top / total, 0, 1) : 0;
      track.style.transform = `translate3d(${(-p * maxX).toFixed(1)}px,0,0)`;
      if (rail) rail.style.transform = `scaleX(${p})`;
      const mid = html.clientWidth * 0.62;
      let cur = 0;
      panels.forEach((pn, i) => { const on = pn.getBoundingClientRect().left < mid; pn.classList.toggle('on', on); if (on) cur = i; });
      if (num) num.textContent = pad(cur + 1);
    });
  }

  /* ---------- 9. hero network canvas ---------- */
  $$('canvas[data-net]').forEach(cv => {
    const ctx = cv.getContext('2d'), host = cv.parentElement, dpr = Math.min(devicePixelRatio || 1, 2);
    let W = 0, H = 0, pts = [], vis = true;
    const m = { x: -9999, y: -9999 };
    const size = () => {
      const r = host.getBoundingClientRect();
      if (Math.abs(r.width - W) < 2 && pts.length) return;
      W = r.width; H = r.height;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(clamp(W * H / 15000, 28, 95));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.3 + 0.5, hot: Math.random() < 0.06
      }));
    };
    host.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(); m.x = e.clientX - r.left; m.y = e.clientY - r.top; });
    host.addEventListener('mouseleave', () => { m.x = m.y = -9999; });
    new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(cv);
    const L2 = 120 * 120;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        if (!reduce) {
          const dx = p.x - m.x, dy = p.y - m.y, d2 = dx * dx + dy * dy;
          if (d2 < 14400) { const d = Math.sqrt(d2) || 1, f = (120 - d) / 120 * 0.7; p.x += dx / d * f; p.y += dy / d * f; }
          p.x += p.vx; p.y += p.vy;
          if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
          if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
        }
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < L2) {
            ctx.strokeStyle = `rgba(46,230,166,${((1 - d2 / L2) * 0.16).toFixed(3)})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        const dx = a.x - m.x, dy = a.y - m.y, d2 = dx * dx + dy * dy;
        if (d2 < 32400) {
          ctx.strokeStyle = `rgba(46,230,166,${((1 - d2 / 32400) * 0.5).toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(m.x, m.y); ctx.stroke();
        }
      }
      for (const p of pts) {
        ctx.fillStyle = p.hot ? 'rgba(255,77,94,.9)' : 'rgba(46,230,166,.7)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.hot ? p.r + 0.8 : p.r, 0, 6.283); ctx.fill();
      }
    };
    size();
    addEventListener('resize', debounce(size, 200));
    if (reduce) draw(); else onTick(() => { if (vis) draw(); });
  });

  /* ---------- 10. home: SOC console, radar, terminal, slider ---------- */
  const feed = $('#feed');
  if (feed) {
    const ev = [
      ['BLOCKED', 'crit', 'Brute-force attempt on VPN gateway from 203.0.113.%'],
      ['BLOCKED', 'crit', 'Known C2 domain request dropped at DNS'],
      ['TRIAGE', 'warn', 'Unusual PowerShell child process on FIN-WS-%'],
      ['TRIAGE', 'warn', 'Impossible-travel sign-in for service account'],
      ['ENRICHED', 'info', 'Newly registered domain matched threat-intel feed'],
      ['ENRICHED', 'info', 'File hash seen in 3 prior campaigns'],
      ['CONTAINED', 'ok', 'Host isolated, credentials reset'],
      ['CLEARED', 'ok', 'Scanner traffic from 198.51.100.% marked benign'],
      ['TRIAGE', 'warn', 'Outbound transfer spike to unfamiliar storage bucket'],
      ['BLOCKED', 'crit', 'Malicious attachment quarantined (macro dropper)']
    ];
    const addRow = () => {
      const [tag, cls, msg] = rand(ev), d = new Date();
      const row = document.createElement('div'); row.className = 'row';
      const t = document.createElement('span'); t.className = 't'; t.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const g = document.createElement('span'); g.className = 'tag ' + cls; g.textContent = tag;
      const mm = document.createElement('span'); mm.className = 'm'; mm.textContent = msg.replace('%', Math.floor(Math.random() * 240) + 10);
      row.append(t, g, mm);
      feed.prepend(row);
      while (feed.children.length > 8) feed.lastChild.remove();
    };
    for (let i = 0; i < 6; i++) addRow();
    let evN = 1873402, blk = 12904;
    const evEl = $('#evCount'), blkEl = $('#blkCount'), incEl = $('#incCount');
    if (!reduce) {
      (function nextRow() { addRow(); setTimeout(nextRow, 1300 + Math.random() * 1600); })();
      setInterval(() => { evN += Math.floor(Math.random() * 90) + 20; evEl.textContent = evN.toLocaleString('en-US'); }, 180);
      setInterval(() => { blk += Math.floor(Math.random() * 3); blkEl.textContent = blk.toLocaleString('en-US'); }, 900);
      setInterval(() => { incEl.textContent = 2 + Math.floor(Math.random() * 4); }, 5200);
    }
  }

  const rc = $('#radar');
  if (rc) {
    const rx2 = rc.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 2);
    rc.width = 150 * dpr; rc.height = 150 * dpr; rx2.scale(dpr, dpr);
    let ang = 0, blips = [], vis = true;
    new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(rc);
    const radar = () => {
      const c = 75;
      rx2.clearRect(0, 0, 150, 150);
      rx2.strokeStyle = 'rgba(46,230,166,.22)'; rx2.lineWidth = 1;
      [70, 47, 24].forEach(r => { rx2.beginPath(); rx2.arc(c, c, r, 0, Math.PI * 2); rx2.stroke(); });
      rx2.beginPath(); rx2.moveTo(c, 5); rx2.lineTo(c, 145); rx2.moveTo(5, c); rx2.lineTo(145, c);
      rx2.strokeStyle = 'rgba(46,230,166,.12)'; rx2.stroke();
      if (rx2.createConicGradient) {
        const g = rx2.createConicGradient(ang, c, c);
        g.addColorStop(0, 'rgba(46,230,166,0)'); g.addColorStop(0.86, 'rgba(46,230,166,0)'); g.addColorStop(1, 'rgba(46,230,166,.45)');
        rx2.fillStyle = g; rx2.beginPath(); rx2.arc(c, c, 70, 0, Math.PI * 2); rx2.fill();
      }
      rx2.strokeStyle = 'rgba(46,230,166,.9)';
      rx2.beginPath(); rx2.moveTo(c, c); rx2.lineTo(c + Math.cos(ang) * 70, c + Math.sin(ang) * 70); rx2.stroke();
      if (Math.random() < 0.02 && blips.length < 6) {
        const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 52;
        blips.push({ x: c + Math.cos(a) * r, y: c + Math.sin(a) * r, l: 1, col: Math.random() < 0.4 ? '255,77,94' : '255,176,32' });
      }
      blips.forEach(b => {
        b.l -= 0.006;
        const l = Math.max(b.l, 0);
        rx2.fillStyle = `rgba(${b.col},${l})`; rx2.beginPath(); rx2.arc(b.x, b.y, 2.6, 0, Math.PI * 2); rx2.fill();
        rx2.strokeStyle = `rgba(${b.col},${l * 0.5})`; rx2.beginPath(); rx2.arc(b.x, b.y, 2.6 + (1 - b.l) * 9, 0, Math.PI * 2); rx2.stroke();
      });
      blips = blips.filter(b => b.l > 0);
      ang += 0.03;
    };
    radar();
    if (!reduce) onTick(() => { if (vis) radar(); });
  }

  const term = $('#term');
  if (term) {
    const lns = $$('.ln', term);
    lns.forEach(l => { const m = $('.m', l); m.dataset.t = m.textContent; if (!reduce) m.textContent = ''; });
    const tio = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return;
      tio.disconnect();
      whenReady(async () => {
        for (const l of lns) {
          l.classList.add('show');
          if (reduce) continue;
          const m = $('.m', l), s = m.dataset.t;
          for (let k = 1; k <= s.length; k++) { m.textContent = s.slice(0, k); await wait(12); }
          await wait(260);
        }
      });
    }, { threshold: 0.35 });
    tio.observe(term);
  }

  const slides = $('#slides');
  if (slides) {
    const n = $$('.slide', slides).length, dots = $('#sdots'), sl = $('#slider');
    let idx = 0, timer;
    for (let i = 0; i < n; i++) {
      const d = document.createElement('button');
      d.className = 'sdot'; d.setAttribute('aria-label', 'Slide ' + (i + 1));
      d.addEventListener('click', () => go(i));
      dots.appendChild(d);
    }
    function go(i) {
      idx = (i + n) % n;
      slides.style.transform = `translateX(${-idx * 100}%)`;
      $$('.sdot', dots).forEach((d, k) => { d.classList.remove('active'); void d.offsetWidth; if (k === idx) d.classList.add('active'); });
      clearTimeout(timer);
      timer = setTimeout(() => go(idx + 1), 7000);
    }
    go(0);
    let sx = null, dx = 0;
    sl.addEventListener('pointerdown', e => { sx = e.clientX; dx = 0; slides.style.transition = 'none'; clearTimeout(timer); });
    addEventListener('pointermove', e => {
      if (sx === null) return;
      dx = e.clientX - sx;
      slides.style.transform = `translateX(calc(${-idx * 100}% + ${dx}px))`;
    });
    addEventListener('pointerup', () => {
      if (sx === null) return;
      sx = null; slides.style.transition = '';
      if (Math.abs(dx) > 60) go(idx + (dx < 0 ? 1 : -1)); else go(idx);
    });
  }

  /* ---------- 11. contact: office cards light map pins ---------- */
  $$('.office').forEach(o => {
    const pin = $(`.pin[data-pin="${o.dataset.pin}"]`);
    if (!pin) return;
    o.addEventListener('mouseenter', () => pin.classList.add('on'));
    o.addEventListener('mouseleave', () => pin.classList.remove('on'));
  });

  /* ---------- 12. footer clock + year ---------- */
  const clock = $('#clock');
  if (clock) {
    const tick = () => { const d = new Date(); clock.textContent = `LOCAL ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
    tick(); setInterval(tick, 1000);
  }
  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  start();
})();
