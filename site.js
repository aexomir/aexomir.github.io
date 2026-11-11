// aexomir.me — the little behaviour the pages need. No dependencies.
(function () {
  var root = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');

  // Theme toggle. Follows the system until the visitor picks one, then remembers it.
  var btn = document.querySelector('.theme');
  var saved = function () { try { return localStorage.getItem('theme'); } catch (e) { return null; } };
  var paint = function () {
    var to = root.dataset.theme === 'dark' ? 'Light' : 'Dark';
    btn.querySelector('span').textContent = to;
    btn.setAttribute('aria-label', 'Switch to ' + to.toLowerCase() + ' theme');
  };
  paint();
  btn.addEventListener('click', function () {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
    paint();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    if (saved()) return;
    root.dataset.theme = e.matches ? 'dark' : 'light';
    paint();
  });

  // Project filters: a short crossfade instead of rows popping in and out.
  // Updates can run out of order when clicks overlap, so each one applies the latest choice, not its own.
  var wanted = null;
  var apply = function () {
    document.querySelectorAll('[data-filter]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === wanted)); });
    document.querySelectorAll('.proj').forEach(function (row) {
      row.hidden = wanted.dataset.filter !== 'All' && row.dataset.type !== wanted.dataset.filter;
    });
  };
  document.querySelectorAll('[data-filter]').forEach(function (b) {
    b.addEventListener('click', function () {
      wanted = b;
      if (!document.startViewTransition || reduce.matches) return apply();
      root.classList.add('vt-soft');
      var t = document.startViewTransition(apply);
      t.ready.catch(function () {}); // a quick second click skips the first transition; that's fine, not an error
      t.finished.finally(function () { root.classList.remove('vt-soft'); });
    });
  });

  // "← Projects" goes back in history when the previous entry in this tab is the list, so its scroll position comes back too.
  // Without the Navigation API we can't see the previous entry, so it stays a plain link.
  var back = document.querySelector('[data-back]');
  if (back && window.navigation && navigation.currentEntry) back.addEventListener('click', function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    var prev = navigation.entries()[navigation.currentEntry.index - 1];
    if (prev && prev.url === back.href) { e.preventDefault(); history.back(); }
  });

  // The name: letters get bolder near the pointer; on touch, a wave runs out from where you tap.
  // Widths are reserved in CSS, so none of this moves the layout.
  var hero = document.querySelector('.hero');
  if (!hero || reduce.matches) return;
  var letters = Array.prototype.slice.call(hero.querySelectorAll('.l'));
  var centers = [];
  var raf = 0;
  var weightAt = function (dist, radius) { return Math.round(300 + 260 * Math.pow(Math.max(0, 1 - dist / radius), 2)); };
  var measure = function () {
    centers = letters.map(function (el) { var r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  };

  if (matchMedia('(hover: hover)').matches) {
    hero.addEventListener('pointerenter', measure);
    addEventListener('scroll', function () { if (hero.matches(':hover')) measure(); }, { passive: true });
    hero.addEventListener('pointermove', function (e) {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        letters.forEach(function (el, i) { el.style.fontWeight = weightAt(Math.hypot(e.clientX - centers[i][0], e.clientY - centers[i][1]), 260); });
      });
    });
    hero.addEventListener('pointerleave', function () {
      cancelAnimationFrame(raf);
      letters.forEach(function (el) { el.style.fontWeight = ''; });
    });
  } else {
    hero.addEventListener('pointerdown', function (e) {
      measure();
      var reach = Math.max.apply(null, centers.map(function (c) { return Math.abs(c[0] - e.clientX); })) + 80;
      var start = performance.now();
      hero.classList.add('rippling');
      cancelAnimationFrame(raf);
      (function frame(now) {
        var t = Math.min(1, (now - start) / 1000);
        var front = reach * (1 - Math.pow(1 - t, 2));
        letters.forEach(function (el, i) { el.style.fontWeight = t < 1 ? weightAt(Math.abs(Math.abs(centers[i][0] - e.clientX) - front), 70) : ''; });
        if (t < 1) raf = requestAnimationFrame(frame); else hero.classList.remove('rippling');
      })(start);
    });
  }
})();
