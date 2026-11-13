/* VBerg board — the page: camera (pan and zoom), input line, wiring. */
(function(){
  'use strict';
  var C = VBoardCore;
  var app = document.getElementById('app');
  var viewport = document.getElementById('viewport');
  var world = document.getElementById('world');

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

  /* ── pointers: one finger / mouse drag pans, two fingers pinch ── */
  var pointers = {};           /* id → last local position */
  var pinch = null;

  function ids(){ return Object.keys(pointers); }

  function startPinch(){
    var k = ids(), a = pointers[k[0]], b = pointers[k[1]];
    pinch = {dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2};
  }

  viewport.addEventListener('pointerdown', function(e){
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    if(e.target.closest && e.target.closest('#tools')) return;
    pointers[e.pointerId] = localXY(e);
    viewport.setPointerCapture(e.pointerId);
    cancelAnimationFrame(glide);
    if(ids().length === 2) startPinch();
    viewport.classList.add('panning');
  });

  viewport.addEventListener('pointermove', function(e){
    var last = pointers[e.pointerId];
    if(!last) return;
    var p = localXY(e);
    pointers[e.pointerId] = p;
    var n = ids().length;
    if(n === 1){
      setCamera({x: cam.x + p.x - last.x, y: cam.y + p.y - last.y, z: cam.z});
    }else if(n === 2 && pinch){
      var k = ids(), a = pointers[k[0]], b = pointers[k[1]];
      var dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      var moved = {x: cam.x + mx - pinch.mx, y: cam.y + my - pinch.my, z: cam.z};
      setCamera(C.zoomAt(moved, mx, my, dist / pinch.dist));
      pinch = {dist: dist, mx: mx, my: my};
    }
  });

  function endPointer(e){
    if(!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    pinch = null;
    if(ids().length === 2) startPinch();
    if(!ids().length) viewport.classList.remove('panning');
  }
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);

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

  /* ── entries: the board's time thread, in entry order ── */
  var entries = [];            /* [{text, el}] ; index = order on the thread */

  function addEntry(text){
    var index = entries.length, place = C.placeOf(index);
    var el = document.createElement('div');
    el.className = 'hill';
    el.style.left = place.x + 'px';
    el.style.top = place.y + 'px';
    var slot = document.createElement('div');
    slot.className = 'slot';
    var ground = document.createElement('div');
    ground.className = 'ground';
    ground.dir = 'auto';
    ground.textContent = text;
    el.appendChild(slot);
    el.appendChild(ground);
    world.appendChild(el);
    entries.push({text: text, el: el});
    showPlace(index, true);
  }

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
    addEntry(text);
  }

  inp.addEventListener('input', growInput);
  inp.addEventListener('keydown', function(e){
    if(e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); submit(); }
  });
  send.addEventListener('click', function(){ submit(); inp.focus(); });
  growInput();

  document.getElementById('btnHome').addEventListener('click', function(){
    showPlace(Math.max(0, entries.length - 1), true);
  });

  showPlace(0, false);

  window.VBoard = {
    camera: function(){ return {x: cam.x, y: cam.y, z: cam.z}; },
    showPlace: showPlace,
    entries: function(){ return entries.map(function(e){ return e.text; }); }
  };
})();
