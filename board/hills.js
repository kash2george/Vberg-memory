/* VBerg board — hills. A thin wrapper around the site's engine
   (assets/vberg-engine.js). The engine keeps one hill in globals; the board
   has many, so each hill keeps its own copy of those globals and swaps them
   in before any engine call. No split, layout or drawing code lives here. */

/* The engine draws into these two globals; index.html defines them for the
   site's single canvas, the board points them at the hill being drawn. */
var cv = null, ctx = null;

/* Site-only debug panel hook the engine calls; the board has no such panel. */
function buildGroupPXSliders(){}

var VBoardHills = (function(){
  'use strict';
  var C = VBoardCore;
  var hills = [];              /* in entry order */
  var current = null;

  /* Stable shape: the site's own randomHP() formula, fed with numbers that
     come from the hill's ID instead of Math.random (Spec §13.6). */
  var siteRandomHP = randomHP;
  randomHP = function(){
    if(!current) return siteRandomHP();
    var real = Math.random;
    Math.random = C.seededRandom(current.seed);
    try{ siteRandomHP(); } finally { Math.random = real; }
  };

  function freshView(){
    return {
      state: {words: [], splits: [], G: 3, charMode: false},
      HP: null, wordMemory: [], groupPX: [], groupOX: [],
      wordBoxes: [], groupCenters: [], groupCircles: [], canvasBtns: [], L: {}
    };
  }

  /* Swap one hill's view into the engine's globals… */
  function activate(h){
    var v = h.view;
    current = h;
    cv = h.canvas; ctx = h.ctx; window._ctx = h.ctx;
    state = v.state;
    if(v.HP) HP = v.HP; else randomHP();
    _wordMemory = v.wordMemory; DBG_GROUP_PX = v.groupPX; DBG_GROUP_OX = v.groupOX;
    wordBoxes = v.wordBoxes; groupCenters = v.groupCenters; groupCircles = v.groupCircles;
    canvasBtns = v.canvasBtns; L = v.L;
  }
  /* …and keep what the engine left there (it reassigns its globals). */
  function keep(h){
    var v = h.view;
    v.state = state; v.HP = HP;
    v.wordMemory = _wordMemory; v.groupPX = DBG_GROUP_PX; v.groupOX = DBG_GROUP_OX;
    v.wordBoxes = wordBoxes; v.groupCenters = groupCenters; v.groupCircles = groupCircles;
    v.canvasBtns = canvasBtns; v.L = L;
  }
  function run(h, fn){
    activate(h);
    try{ return fn(); } finally { keep(h); }
  }

  /* Draw a thread on a hill with the site's setThread(): one word → letters
     in syllable groups, several words → the sentence split. */
  function setHillThread(h, text){
    h.view = freshView();
    run(h, function(){ setThread(text); });
    var notice = document.getElementById('sentenceNotice');
    h.note.textContent = notice && !notice.hidden ? notice.textContent : '';
    h.thread.textContent = text;
  }

  function showSentence(h){
    h.word = null;
    h.back.hidden = true;
    setHillThread(h, h.text);
    if(h.splits) applySplits(h, h.splits);
  }

  /* A stored manual regroup: boundaries only, order never changes. */
  function applySplits(h, splits){
    run(h, function(){
      var W = state.words.length, ok = splits.length >= 1 && splits.length <= 4;
      for(var i = 0; ok && i < splits.length; i++){
        if(splits[i] !== Math.floor(splits[i])) ok = false;
        else if(splits[i] < 1 || splits[i] >= W) ok = false;
        else if(i && splits[i] <= splits[i - 1]) ok = false;
      }
      if(!ok) return;
      state.splits = splits.slice();
      state.G = splits.length + 1;
      _wordMemory = []; DBG_GROUP_PX = []; DBG_GROUP_OX = [];
      render();
    });
  }

  /* Tap a word → the same hill shows that word's syllable hill (view only;
     words and letters are not stored, Spec §1b). */
  function openWord(h, wi){
    var v = h.view;
    if(h.word || v.state.charMode) return false;
    var word = v.state.words[wi];
    if(!word) return false;
    h.word = word;
    setHillThread(h, word);
    h.back.textContent = '‹ ' + h.text;
    h.back.hidden = false;
    return true;
  }

  function create(id, text, index, world, splits){
    var place = C.placeOf(index);
    var el = document.createElement('div');
    el.className = 'hill';
    el.style.left = place.x + 'px';
    el.style.top = place.y + 'px';
    el.dataset.id = id;
    var canvas = document.createElement('canvas');
    var ground = document.createElement('div');
    ground.className = 'ground';
    var back = document.createElement('button');
    back.type = 'button'; back.className = 'back'; back.hidden = true;
    var thread = document.createElement('div');
    thread.className = 'thread'; thread.dir = 'auto';
    var note = document.createElement('div');
    note.className = 'note';
    ground.appendChild(back); ground.appendChild(thread); ground.appendChild(note);
    el.appendChild(canvas); el.appendChild(ground);
    world.appendChild(el);

    var h = {
      id: id, text: text, index: index, seed: C.seedOf(id), splits: splits || null, word: null,
      el: el, canvas: canvas, ctx: canvas.getContext('2d'),
      back: back, thread: thread, note: note, view: freshView()
    };
    hills.push(h);
    showSentence(h);
    return h;
  }

  /* Redraw without changing any split (theme change, font arrival). */
  function renderAll(relayout){
    hills.forEach(function(h){
      run(h, function(){
        if(relayout){ _wordMemory = []; DBG_GROUP_PX = []; DBG_GROUP_OX = []; }
        render();
      });
    });
  }

  function byElement(node){
    var el = node && node.closest ? node.closest('.hill') : null;
    if(!el) return null;
    for(var i = 0; i < hills.length; i++) if(hills[i].el === el) return hills[i];
    return null;
  }

  return {
    all: function(){ return hills; },
    create: create, run: run, renderAll: renderAll, byElement: byElement,
    openWord: openWord, showSentence: showSentence, applySplits: applySplits
  };
})();
