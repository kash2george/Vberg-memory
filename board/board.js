/* VBerg board — the page: camera (pan and zoom), input line, gestures.
   Split, layout and drawing are the site's (assets/vberg-engine.js). */
(function(){
  'use strict';
  var C = VBoardCore, Hills = VBoardHills, Ink = VBoardInk;
  var commands = VBoardCommands.create(VBoardStore, C);
  var app = document.getElementById('app');
  var viewport = document.getElementById('viewport');
  var world = document.getElementById('world');
  var TAP_SLOP = 6;            /* px a pointer may move and still be a tap */

  /* ── camera: view only, never stored ── */
  var cam = {x: 0, y: 0, z: 1};
  var glide = 0;

  function applyCamera(){
    world.style.transform = 'translate(' + cam.x + 'px,' + cam.y + 'px) scale(' + cam.z + ')';
    var step = 40 * cam.z;
    while(step < 14) step *= 4;
    viewport.style.backgroundSize = step + 'px ' + step + 'px';
    viewport.style.backgroundPosition = cam.x + 'px ' + cam.y + 'px';
  }

  function setCamera(next){
    cancelAnimationFrame(glide);
    cam = next;
    applyCamera();
  }

  /* Move the camera smoothly so the person sees where the board went. */
  function glideTo(target){
    cancelAnimationFrame(glide);
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduce){ cam = target; applyCamera(); return; }
    var from = cam, t0 = performance.now(), ms = 320;
    (function tick(now){
      var t = Math.min(1, (now - t0) / ms), e = t * t * (3 - 2 * t);
      cam = {x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, z: from.z + (target.z - from.z) * e};
      applyCamera();
      if(t < 1) glide = requestAnimationFrame(tick);
    })(t0);
  }

  function viewSize(){ return {w: viewport.clientWidth, h: viewport.clientHeight}; }
  function localXY(e){
    var r = viewport.getBoundingClientRect();
    return {x: e.clientX - r.left, y: e.clientY - r.top};
  }

  function showPlace(index, smooth){
    var v = viewSize();
    var target = C.fitCamera(C.placeOf(index), v.w, v.h);
    if(smooth) glideTo(target); else setCamera(target);
  }

  /* ── hills: the board's time thread, in entry order ── */
  var focused = null;

  function focusHill(h, smooth){
    if(focused) focused.el.classList.remove('focused');
    focused = h;
    if(h){
      h.el.classList.add('focused');
      showPlace(h.index, smooth);
    }
  }

  function newId(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /* Data stays on this device. If the browser refuses storage, the board
     still works for this visit and says so. */
  var statusEl = document.getElementById('status');
  function notSaved(err){
    statusEl.textContent = 'Not saved on this device: storage is unavailable.';
    statusEl.hidden = false;
    if(window.console) console.warn('VBerg board storage:', err);
  }

  function addEntry(text){
    var h = Hills.create(newId(), text, Hills.all().length, world);
    focusHill(h, true);
    commands.addEntry(h.id, text).catch(notSaved);
    return h;
  }

  /* Remember a regroup of the sentence (boundaries only). The word view is
     a view: its letters are not stored. */
  function noteRegroup(h){
    if(h.word) return;
    var splits = h.view.state.splits.slice();
    if(JSON.stringify(splits) === JSON.stringify(h.splits)) return;
    h.splits = splits;
    commands.regroup(h.id, splits).catch(notSaved);
  }

  /* Reload: the same entries, in the same order, with their regroups. */
  var ready = commands.load().then(function(data){
    data.entries.forEach(function(e, i){
      Hills.create(e.node.id, e.node.text, i, world, e.regroup ? e.regroup.splits : null);
    });
    var all = Hills.all();
    if(all.length) focusHill(all[all.length - 1], false);
    Ink.show(data.strokes);
  }, notSaved);

  /* ── free drawing: pen, hide, clear. A separate layer; no hill is touched ── */
  var penOn = false;
  var btnPen = document.getElementById('btnPen');
  var btnInk = document.getElementById('btnInk');
  var btnClear = document.getElementById('btnClear');
  var clearTimer = 0;

  function setInkHidden(hidden){
    Ink.setHidden(hidden);
    btnInk.textContent = hidden ? 'Show' : 'Hide';
    btnInk.setAttribute('aria-pressed', String(hidden));
  }
  function setPen(on){
    penOn = on;
    if(on) setInkHidden(false);          /* never draw on a hidden layer */
    btnPen.setAttribute('aria-pressed', String(on));
    viewport.classList.toggle('pen', on);
  }
  function disarmClear(){
    clearTimeout(clearTimer);
    btnClear.textContent = 'Clear';
    btnClear.removeAttribute('data-armed');
  }
  btnPen.addEventListener('click', function(){ setPen(!penOn); });
  btnInk.addEventListener('click', function(){
    var hide = !Ink.hidden();
    if(hide) setPen(false);
    setInkHidden(hide);
  });
  /* Clear cannot be undone, so it asks once: tap, then tap again. */
  btnClear.addEventListener('click', function(){
    if(!btnClear.hasAttribute('data-armed')){
      btnClear.setAttribute('data-armed', '');
      btnClear.textContent = 'Clear all?';
      clearTimer = setTimeout(disarmClear, 3000);
      return;
    }
    disarmClear();
    Ink.clear();
    commands.clearStrokes().catch(notSaved);
  });

  function syncTheme(){ document.body.classList.toggle('dark', isDark); }

  /* ── pointers ──
     One finger / mouse: drag pans. On the focused hill a drag that starts on
     a word moves that word to a neighbouring group (the site's tryMove), and
     a tap opens a word or presses one of the hill's own buttons.
     Two fingers: pinch zoom. */
  var pointers = {};           /* id → last local position */
  var pinch = null;
  var gesture = null;          /* the single-pointer gesture in progress */

  function ids(){ return Object.keys(pointers); }

  function startPinch(){
    var k = ids(), a = pointers[k[0]], b = pointers[k[1]];
    pinch = {dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2};
  }

  function dropWordDrag(){
    if(!gesture || gesture.type !== 'word') return;
    var h = gesture.hill;
    Hills.run(h, function(){ drag.active = false; render(); });
    h.canvas.classList.remove('dragging');
  }

  viewport.addEventListener('pointerdown', function(e){
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    if(e.target.closest('#tools') || e.target.closest('.back')) return;
    var p = localXY(e);
    pointers[e.pointerId] = p;
    viewport.setPointerCapture(e.pointerId);
    cancelAnimationFrame(glide);

    if(ids().length === 2){
      dropWordDrag();
      Ink.end(false);                    /* a second finger turns it into a pinch */
      gesture = null;
      startPinch();
      return;
    }
    if(ids().length > 2){ gesture = null; return; }

    if(penOn){
      var w = C.toWorld(cam, p.x, p.y);
      Ink.begin(w.x, w.y);
      gesture = {type: 'ink', id: e.pointerId, start: p, moved: false, hill: null, btn: null, box: null};
      return;
    }

    var hill = Hills.byElement(e.target);
    gesture = {type: 'pan', id: e.pointerId, start: p, moved: false, hill: hill, btn: null, box: null};
    if(hill && hill === focused && e.target === hill.canvas){
      Hills.run(hill, function(){
        var q = canvasXY(e);
        gesture.btn = hitBtn(q.x, q.y);
        gesture.box = gesture.btn ? null : hitBox(q.x, q.y);
        gesture.q = q;
      });
      if(gesture.box) gesture.type = 'word-pending';
      else if(gesture.btn) gesture.type = 'button';
    }
  });

  viewport.addEventListener('pointermove', function(e){
    var last = pointers[e.pointerId];
    if(!last) return;
    var p = localXY(e);
    pointers[e.pointerId] = p;
    var n = ids().length;

    if(n === 2 && pinch){
      var k = ids(), a = pointers[k[0]], b = pointers[k[1]];
      var dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      var moved = {x: cam.x + mx - pinch.mx, y: cam.y + my - pinch.my, z: cam.z};
      setCamera(C.zoomAt(moved, mx, my, dist / pinch.dist));
      pinch = {dist: dist, mx: mx, my: my};
      return;
    }
    if(n !== 1 || !gesture || gesture.id !== e.pointerId) return;

    if(gesture.type === 'ink'){
      var w = C.toWorld(cam, p.x, p.y);
      Ink.extend(w.x, w.y, 1.5 / cam.z);
      return;
    }

    if(!gesture.moved){
      if(Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) <= TAP_SLOP) return;
      gesture.moved = true;
      last = gesture.start;
      if(gesture.type === 'button') gesture.type = 'pan';
      if(gesture.type === 'word-pending'){
        gesture.type = 'word';
        var g = gesture;
        Hills.run(g.hill, function(){
          drag = {active: true, wi: g.box.wi, mx: g.q.x, my: g.q.y, offX: g.q.x - g.box.x, offY: g.q.y - g.box.y};
        });
        g.hill.canvas.classList.add('dragging');
      }
      if(gesture.type === 'pan') viewport.classList.add('panning');
    }

    if(gesture.type === 'word'){
      Hills.run(gesture.hill, function(){
        var q = canvasXY(e);
        drag.mx = q.x; drag.my = q.y;
        render();
      });
    }else{
      setCamera({x: cam.x + p.x - last.x, y: cam.y + p.y - last.y, z: cam.z});
    }
  });

  function endPointer(e){
    if(!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    pinch = null;
    if(ids().length === 2) startPinch();
    viewport.classList.remove('panning');
    var g = gesture;
    if(!g || g.id !== e.pointerId) return;
    gesture = null;
    var cancelled = e.type === 'pointercancel';

    if(g.type === 'ink'){
      var points = Ink.end(!cancelled);
      if(points) commands.addStroke(newId(), points).catch(notSaved);
      return;
    }

    if(g.type === 'word'){
      /* Same finish as the site's mouseup: the boundary moves, order stays. */
      Hills.run(g.hill, function(){
        if(!cancelled){
          var tg = nearestGroup(drag.mx);
          if(tg >= 0) tryMove(drag.wi, tg);
        }
        drag.active = false;
        _wordMemory = []; DBG_GROUP_PX = []; DBG_GROUP_OX = [];
        render();
      });
      g.hill.canvas.classList.remove('dragging');
      noteRegroup(g.hill);
      return;
    }
    if(g.moved || cancelled) return;

    /* a tap */
    if(g.type === 'button'){
      Hills.run(g.hill, function(){ doBtn(g.btn.id); });
      if(g.btn.id === 'groups') noteRegroup(g.hill);
      else { syncTheme(); Hills.renderAll(false); }
    }else if(g.type === 'word-pending'){
      Hills.openWord(g.hill, g.box.wi);
    }else if(g.hill && g.hill !== focused){
      focusHill(g.hill, true);
    }
  }
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);

  /* "‹ sentence" under a hill: back from the word view. */
  world.addEventListener('click', function(e){
    var back = e.target.closest('.back');
    if(!back) return;
    var h = Hills.byElement(back);
    if(h) Hills.showSentence(h);
  });

  /* Wheel and trackpad pinch zoom around the cursor. */
  viewport.addEventListener('wheel', function(e){
    e.preventDefault();
    var p = localXY(e);
    var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    setCamera(C.zoomAt(cam, p.x, p.y, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015))));
  }, {passive: false});

  /* Keep the page as tall as the visible screen (phone keyboard, iOS). */
  function fitScreen(){
    var vv = window.visualViewport;
    app.style.height = (vv ? vv.height : window.innerHeight) + 'px';
    app.style.top = (vv ? vv.offsetTop : 0) + 'px';
  }
  if(window.visualViewport){
    visualViewport.addEventListener('resize', fitScreen);
    visualViewport.addEventListener('scroll', fitScreen);
  }
  window.addEventListener('resize', fitScreen);
  fitScreen();

  /* ── input line: grows with the text; Enter draws, Shift+Enter = new line ── */
  var inp = document.getElementById('inp');
  var send = document.getElementById('send');

  function growInput(){
    inp.style.height = 'auto';
    inp.style.height = inp.scrollHeight + 'px';
    send.disabled = !inp.value.trim();
  }

  function submit(){
    var text = inp.value.trim();
    if(!text) return;
    inp.value = '';
    growInput();
    ready.then(function(){ addEntry(text); });
  }

  inp.addEventListener('input', growInput);
  inp.addEventListener('keydown', function(e){
    if(e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); submit(); }
  });
  send.addEventListener('click', function(){ submit(); inp.focus(); });
  growInput();

  document.getElementById('btnHome').addEventListener('click', function(){
    var all = Hills.all();
    if(all.length) focusHill(all[all.length - 1], true); else showPlace(0, true);
  });

  /* Word widths depend on the font: lay out again once it has arrived. */
  if(document.fonts && document.fonts.load){
    document.fonts.load("16px 'Reggae One'").then(function(){ Hills.renderAll(true); }, function(){});
  }

  showPlace(0, false);

  /* Offline: cache the board's own files (scope /board/ only). */
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    navigator.serviceWorker.register('sw.js').catch(function(){});
  }

  window.VBoard = {
    ready: ready,
    camera: function(){ return {x: cam.x, y: cam.y, z: cam.z}; },
    showPlace: showPlace,
    addEntry: addEntry,
    focused: function(){ return focused; },
    commands: commands
  };
})();
