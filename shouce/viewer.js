/* 云大研究生手册 网页版（上下册合订）
   侧边栏目录树 + 全文搜索定位 + 页码滚动联动
   依赖：先由 build_viewer.cjs 注入的 qindex.js / coords.js
   注意：搜索结果是按「册」分组的，两册一起搜。
*/
(function () {
  'use strict';

  var body = document.body;
  var side = document.querySelector('.side');
  var btn = document.getElementById('navbtn');
  var backdrop = document.getElementById('backdrop');
  var q = document.getElementById('q');
  var qclear = document.getElementById('qclear');
  var searchbtn = document.getElementById('searchbtn');
  var tree = document.getElementById('tree');
  var results = document.getElementById('results');
  var MOBILE = 900;

  function isMobile() { return window.innerWidth <= MOBILE; }
  function closeNav() { body.classList.remove('nav-open'); }

  /* ---------- 页面清单：按 DOM 顺序，就是「上册 1..N，下册 1..M」 ---------- */
  var pages = Array.prototype.map.call(document.querySelectorAll('.pg'), function (el, i) {
    return { el: el, id: el.id, vol: el.getAttribute('data-vol'), idx: i };
  });
  var pageById = {};
  pages.forEach(function (p) { pageById[p.id] = p; });
  /* 上册/下册各自的页序（用于结果里的「第N页」） */
  var volCount = {};
  pages.forEach(function (p) { p.local = (volCount[p.vol] = (volCount[p.vol] || 0) + 1); });

  /* ---------- 折叠：章节行和二级行都带箭头，初始一律收起 ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.tw'), function (t) {
    t.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var li = t.parentNode.parentNode;
      var closed = li.classList.toggle('closed');
      t.setAttribute('aria-expanded', closed ? 'false' : 'true');
    });
    // 字符固定 ▾，方向交给 CSS 的 rotate。别按状态换字符——
    // 两套编码叠加会把收起态转成朝上 ▲。
    t.textContent = '▾';
    t.setAttribute('aria-expanded',
      t.parentNode.parentNode.classList.contains('closed') ? 'false' : 'true');
  });

  /* ---------- 移动端抽屉 ---------- */
  if (btn) btn.addEventListener('click', function () { body.classList.toggle('nav-open'); });
  if (backdrop) backdrop.addEventListener('click', closeNav);
  if (searchbtn) searchbtn.addEventListener('click', function () {
    body.classList.add('nav-open');
    setTimeout(function () { if (q) q.focus(); }, 60);
  });
  Array.prototype.forEach.call(document.querySelectorAll('.tree a'), function (a) {
    a.addEventListener('click', function () { if (isMobile()) closeNav(); });
  });

  /* ---------- 目录与正文联动 ---------- */
  var links = {};
  Array.prototype.forEach.call(document.querySelectorAll('.tree a'), function (a) {
    links[a.getAttribute('href').slice(1)] = a;
  });

  var tops = [];
  function measure() {
    tops = pages.map(function (p) { return p.el.getBoundingClientRect().top + window.scrollY; });
  }
  measure();
  window.addEventListener('resize', function () { measure(); spy(); });
  window.addEventListener('load', measure);

  var current = null;
  // 目录默认收起，但滚动时要提示「你在哪」。等用户真的滚动过，
  // 才展开当前所在的那一支——初始化那次 spy() 不算数。
  var userMoved = false;
  function activate(id) {
    if (current === id) return;
    if (current && links[current]) links[current].parentNode.classList.remove('on');
    current = id;
    var a = links[id];
    if (!a) return;
    a.parentNode.classList.add('on');
    if (userMoved) {
      var li = a.closest('li');
      while (li) {
        li.classList.remove('closed');
        var tw = li.querySelector(':scope > .row > .tw');
        if (tw) tw.setAttribute('aria-expanded', 'true');
        li = li.parentNode.closest('li');
      }
    }
    var r = a.getBoundingClientRect();
    var sr = side.getBoundingClientRect();
    if (r.top < sr.top + 110 || r.bottom > sr.bottom - 24) {
      side.scrollTop += (r.top - sr.top) - side.clientHeight / 2 + r.height / 2;
    }
  }

  /* 只把「章节起始页」挂到目录上；正文页就近归属到它之前最近的那个目录项 */
  var anchorPages = [];
  Array.prototype.forEach.call(document.querySelectorAll('.tree a'), function (a) {
    var id = a.getAttribute('href').slice(1);
    var p = pageById[id];
    if (p) anchorPages.push({ idx: p.idx, id: id });
  });
  anchorPages.sort(function (a, b) { return a.idx - b.idx; });

  var ticking = false;
  function spy() {
    ticking = false;
    if (!pages.length || !anchorPages.length) return;
    var y = window.scrollY + (isMobile() ? 110 : 150);
    var best = anchorPages[0];
    for (var i = 0; i < anchorPages.length; i++) {
      if (tops[anchorPages[i].idx] <= y) best = anchorPages[i]; else break;
    }
    activate(best.id);
  }
  window.addEventListener('scroll', function () {
    userMoved = true;
    if (!ticking) { ticking = true; window.requestAnimationFrame(spy); }
  }, { passive: true });

  /* ---------- 搜索 ---------- */
  var idxReady = false, coordReady = false, pending = null;
  function whenReady(fn) {
    if (idxReady && coordReady) return fn();
    pending = fn;
  }
  function check() {
    if (idxReady && coordReady && pending) { var f = pending; pending = null; f(); }
  }
  function loadIndex() {
    if (window.__IDX__) { idxReady = true; return check(); }
    var s = document.createElement('script');
    s.src = 'qindex.js';
    s.onload = function () { idxReady = true; check(); };
    document.head.appendChild(s);
  }
  function loadCoords() {
    if (window.__COORD__) { coordReady = true; return check(); }
    var s = document.createElement('script');
    s.src = 'coords.js';
    s.onload = function () { coordReady = true; check(); };
    document.head.appendChild(s);
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* 在某一册的索引里找出所有命中。返回 [{pg, vol, pos, ctxBefore, hit, ctxAfter}] */
  function searchVolume(vol, kw, cap) {
    var idx = (window.__IDX__ || {})[vol] || [];
    var out = [];
    var CTX = 26;
    for (var i = 0; i < idx.length && out.length < cap; i++) {
      var rec = idx[i];
      var t = rec.t, from = 0, pos;
      while ((pos = t.indexOf(kw, from)) >= 0) {
        out.push({
          vol: vol,
          page: rec.name,
          local: rec.n,
          before: t.slice(Math.max(0, pos - CTX), pos),
          after: t.slice(pos + kw.length, pos + kw.length + CTX),
        });
        from = pos + kw.length;
        if (out.length >= cap) break;
      }
    }
    return out;
  }

  var VOLNAME = { shang: '上册', xia: '下册' };

  /* 记住上一次的结果长什么样，好让点了「全展开」之后还能原样还原。
     每次重新渲染都是从零建 DOM，不留悔棋的话，用户点一条命中再回来
     展开状态就没了。 */
  var lastView = null;   // { kw, open: {shang:bool, xia:bool}, allOpen:bool }

  function render(list, kw, capped) {
    if (!list.length) {
      results.hidden = false;
      results.innerHTML = '<div class="none">没有找到「' + esc(kw) + '」</div>';
      tree.style.display = 'none';
      return;
    }
    var byVol = { shang: [], xia: [] };
    list.forEach(function (r) { (byVol[r.vol] || (byVol[r.vol] = [])).push(r); });

    // 默认两册都收起 —— 先让用户看到「上册 N 处 / 下册 M 处」的量级，
    // 再决定先看哪一册。和目录树一样是收起优先。
    var prev = (lastView && lastView.kw === kw) ? lastView.open : null;
    var isOpen = { shang: !!(prev && prev.shang), xia: !!(prev && prev.xia) };

    var html = '<div class="cnt"><span>共 ' + list.length + ' 处' +
      (capped ? '（已截断）' : '') + '</span>' +
      '<button class="expandall" type="button">全展开</button></div>';
    ['shang', 'xia'].forEach(function (v) {
      var arr = byVol[v];
      if (!arr || !arr.length) return;
      // 组头整条可点：收起后只剩「上册 N 处」这一行，两册的结果不会互相淹没
      html += '<div class="volgrp' + (isOpen[v] ? '' : ' closed') + '" data-vol="' + v + '">' +
        '<button class="vol" type="button" aria-expanded="' + (isOpen[v] ? 'true' : 'false') + '">' +
        '<span class="arw" aria-hidden="true">▾</span>' +
        '<span class="vt">' + VOLNAME[v] + '</span>' +
        '<span class="vn">' + arr.length + ' 处</span></button>' +
        '<div class="hits">';
      arr.forEach(function (r) {
        html += '<a class="hit" href="#' + (v === 'shang' ? 's' : 'x') + r.page + '" data-vol="' + v + '" data-page="' + r.page + '">' +
          '<span class="hp">' + VOLNAME[v] + ' · 第 ' + r.local + ' 页</span>' +
          '<span class="hs">' + esc(r.before) + '<mark>' + esc(kw) + '</mark>' + esc(r.after) + '</span>' +
          '</a>';
      });
      html += '</div></div>';
    });
    results.hidden = false;
    results.innerHTML = html;
    tree.style.display = 'none';

    var grps = Array.prototype.slice.call(results.querySelectorAll('.volgrp'));
    var expandBtn = results.querySelector('.expandall');

    /* 只有一册有结果时「全展开」纯属多余（一个组头点了就开），收掉。
       注意这里数的是实际渲染出来的组数，不是 byVol 里非空的册数。 */
    if (expandBtn && results.querySelectorAll('.volgrp').length < 2) expandBtn.hidden = true;

    function setGrp(g, open) {
      g.classList.toggle('closed', !open);
      var b = g.querySelector('.vol');
      if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
      // 记下来，同一个关键词重渲染时照着还原（按 data-vol 取，别按位置——
      // 只有一册有结果时 grps 只有一个元素，按位置会把下册记错）
      var snap = { shang: false, xia: false };
      grps.forEach(function (x) {
        snap[x.getAttribute('data-vol')] = !x.classList.contains('closed');
      });
      lastView = { kw: kw, open: snap };
    }
    function syncBtn() {
      if (!expandBtn || expandBtn.hidden) return;
      var allOpen = grps.every(function (g) { return !g.classList.contains('closed'); });
      expandBtn.textContent = allOpen ? '全收起' : '全展开';
    }

    if (expandBtn) {
      expandBtn.addEventListener('click', function () {
        var allOpen = grps.every(function (g) { return !g.classList.contains('closed'); });
        grps.forEach(function (g) { setGrp(g, !allOpen); });
        syncBtn();
      });
    }
    grps.forEach(function (g) {
      g.querySelector('.vol').addEventListener('click', function () {
        setGrp(g, g.classList.contains('closed'));
        syncBtn();
      });
    });
    syncBtn();   // 还原出来的状态也要让按钮文字对得上

    Array.prototype.forEach.call(results.querySelectorAll('.hit'), function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        // 从收起的那一册点进去，先把这一册摊开，免得回来一看啥都没有
        var g = a.closest('.volgrp');
        if (g && g.classList.contains('closed')) { setGrp(g, true); syncBtn(); }
        gotoHit(a.getAttribute('data-vol'), a.getAttribute('data-page'), kw);
        if (isMobile()) closeNav();
      });
    });
  }

  function clearSearch() {
    results.hidden = true;
    results.innerHTML = '';
    tree.style.display = '';
    if (q) q.value = '';
  }

  var timer = null;
  function onInput() {
    var kw = q.value.trim();
    if (!kw) { clearSearch(); return; }
    if (kw.length < 1) return;
    whenReady(function () {
      var CAP = 300;
      var list = searchVolume('shang', kw, CAP).concat(searchVolume('xia', kw, CAP));
      render(list.slice(0, CAP), kw, list.length > CAP);
    });
  }
  if (q) {
    q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(onInput, 160); });
    q.addEventListener('keydown', function (e) { if (e.key === 'Escape') clearSearch(); });
  }
  if (qclear) qclear.addEventListener('click', function () { clearSearch(); q.focus(); });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (isMobile()) body.classList.add('nav-open');
      q.focus();
    }
  });
  // 索引是懒加载的，先把脚本拿下来，用户一输入就能立刻出结果
  loadIndex();
  loadCoords();

  /* ---------- 跳到命中的那一处并标出来 ---------- */
  function gotoHit(vol, pageName, kw) {
    var p = pageById[(vol === 'shang' ? 's' : 'x') + pageName];
    if (!p) return;
    p.el.scrollIntoView({ block: 'start', behavior: 'auto' });
    highlight(vol, pageName, kw, p.el);
  }

  /* 在 coords 里找到关键词对应的那几个字，按它们的包围盒画红框。
     rec.L 是「每行一组 word」，word 是 [x,y,w,h]（图片像素坐标），
     顺序和页面文字层里的 span 一一对应。 */
  var hlPage = null;    // 当前挂着红框的那一页
  var hlTimer = 0;

  function highlight(vol, pageName, kw, el) {
    var all = window.__COORD__ || {};
    var rec = all[vol + ':' + pageName];
    var hl = el.querySelector('.hl');
    if (!hl) return;

    // 换页跳转：把上一页的红框连同它的定时器一起清掉。
    // 记住当前页，免得同一页里再点一次时把自己刚画的清没了。
    if (hlPage && hlPage !== el) {
      var old = hlPage.querySelector('.hl');
      if (old) old.innerHTML = '';
      clearTimeout(hlTimer);
      hlTimer = 0;
    }

    hl.innerHTML = '';
    if (!rec) return;

    var boxes = [];
    for (var li = 0; li < rec.L.length && boxes.length < 3; li++) {
      var line = rec.L[li];
      // 把这一行的文本按 word 拼起来，同时记下每个字符属于哪个 word
      var text = '', owner = [];
      for (var wi = 0; wi < line.length; wi++) {
        var t = (line[wi][4] || '');
        for (var ci = 0; ci < t.length; ci++) { owner.push(wi); }
        text += t;
      }
      var pos = text.indexOf(kw);
      while (pos >= 0 && boxes.length < 3) {
        var a = owner[pos], b = owner[pos + kw.length - 1];
        if (a === undefined || b === undefined) { pos = text.indexOf(kw, pos + 1); continue; }
        // 命中横跨 word a..b，合并它们的包围盒
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (var k = a; k <= b; k++) {
          var w = line[k];
          x0 = Math.min(x0, w[0]); y0 = Math.min(y0, w[1]);
          x1 = Math.max(x1, w[0] + w[2]); y1 = Math.max(y1, w[1] + w[3]);
        }
        boxes.push([x0, y0, x1 - x0, y1 - y0]);
        pos = text.indexOf(kw, pos + kw.length);
      }
    }

    boxes.forEach(function (b) {
      var d = document.createElement('b');
      d.style.left = (b[0] / rec.w * 100) + '%';
      d.style.top = (b[1] / rec.h * 100) + '%';
      d.style.width = (b[2] / rec.w * 100) + '%';
      d.style.height = (b[3] / rec.h * 100) + '%';
      hl.appendChild(d);
    });
    // 把这一处滚到视口中间
    if (boxes.length) {
      var targetY = el.getBoundingClientRect().top + window.scrollY + (boxes[0][1] / rec.h) * el.offsetHeight;
      window.scrollTo({ top: Math.max(0, targetY - window.innerHeight * 0.35), behavior: 'auto' });
    }

    /* 定时清空只负责「这一处」。
       别让每个页面各留一个 6 秒定时器——那样连点几条结果，前一页的定时器
       还没到点，红框就一直挂在上面，一路累加，整本书点过的地方全在标红。
       每次跳转先把上一个页面的清掉，并撤掉它那个还没到点的定时器。 */
    hlPage = el;
    clearTimeout(hlTimer);
    hlTimer = setTimeout(function () { if (hl) hl.innerHTML = ''; }, 6000);
  }

  if (location.hash) {
    var t = document.getElementById(location.hash.slice(1));
    if (t) setTimeout(function () { t.scrollIntoView(); }, 80);
  }
  spy();
})();
