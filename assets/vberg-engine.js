/* VBerg engine — shared by index.html and board/ (first slice of VB-51).
   Moved word-for-word from index.html: split, layout, drawing, hit tests,
   doBtn and setThread. Plain globals, as before. The page that loads this
   file provides `cv` and `ctx` (the canvas being drawn). */

var FONT  = "'Reggae One',system-ui,sans-serif";
var COLS  = [
  {f:'#d6e8fa',s:'#3a7abf',t:'#1a3d6e'},
  {f:'#fdf3d0',s:'#b08020',t:'#5a3e00'},
  {f:'#f5d6f0',s:'#9a4090',t:'#5a1a58'},
  {f:'#d0f0df',s:'#2a8c5a',t:'#0d4428'},
  {f:'#ffe8d0',s:'#c05820',t:'#6a2800'}
];
var THEMES = {
  light:{sky:'#c9dff0',hill:'#fdfbf7',ink:'#2a2218',botBg:'#d4c9b0',sentC:'#2a2218',inputBg:'#f5f0e8',inputC:'#2a2218'},
  dark: {sky:'#1a2535',hill:'#2e2b26',ink:'#d8d2c4',botBg:'#252219',sentC:'#d8d2c4',inputBg:'#1e1c18',inputC:'#d8d2c4'}
};

var state  = {words:[],splits:[],G:3,charMode:false};
var wordBoxes=[], groupCenters=[], groupCircles=[], L={};
var drag   = {active:false,wi:-1,mx:0,my:0,offX:0,offY:0};
var isDark=false, noColor=false, memeIdx=-1;
var PH=5, PV=5;
var canvasBtns=[], BTN_R=12, BTN_M=22;
var HP = {h:2.7, k:0.1, a:2.8};
var FNT_SPACING = 0.2;

function getGroupS(gi){ return DBG.FNT_SPACING; }

function onSpacing(val){
  DBG.FNT_SPACING = 0.2 + (parseInt(val)/100) * 0.4;
  if(state.words.length) render();
}

/* ── debug variables (all global, tweakable) ── */
var DBG = {
  COL_ABOVE_HILL:   4,
  COL_ABOVE_LINE:   1,
  COL_MIN_GAP:      1,
  TRK_AP_SCALE:  1.50,
  FNT_COMMON:  0.8,
  FNT_CONTENT: 1.0,
  FNT_SPACING:     0.2,
  BOX_HITPAD: 4,
};

var DBG_GROUP_PX = [];
var DBG_GROUP_OX = [];

function getGroupMinPX(gi){
  if(DBG_GROUP_PX[gi] !== undefined) return DBG_GROUP_PX[gi];

  return Math.min(48, (L.CW || 680) / (3 * state.G));
}
function getGroupOX(gi){
  return (DBG_GROUP_OX[gi] !== undefined) ? DBG_GROUP_OX[gi] : 0;
}

var DBG_STEPS = {
  FNT_BOOST:    true,
};

function randomHP(){
  var h=2.7+Math.random()*1.1;
  var a=h*(0.88+Math.random()*0.28);
  a=Math.max(1,Math.min(5,a));
  var kSign=Math.random()<0.5?1:-1;
  HP={h:h, k:kSign*(0.06+Math.random()*0.14), a:a};
}

/* ══════════════════════════════════════════════════════
   HILL EQUATION with smooth horizontal endpoints
   ══════════════════════════════════════════════════════ */
function smoothstep(v,e0,e1){
  var t=Math.max(0,Math.min(1,(v-e0)/(e1-e0)));
  return t*t*(3-2*t);
}
function taper(xn,a){
  return 1-smoothstep(Math.abs(xn)/a, 0.60, 1.02);
}
function solveY(xn,h,k,a){
  var r2=1-(xn/a)*(xn/a);
  if(r2<=0)return 0;
  var y=h*Math.sqrt(r2);
  for(var i=0;i<16;i++){
    var u=(xn+k*y)/a, u2=u*u;
    if(u2>=1){y=0;break;}
    var yn=h*Math.sqrt(1-u2);
    if(Math.abs(yn-y)<1e-6){y=yn;break;}
    y=yn;
  }
  return Math.max(0,y)*taper(xn,a);
}
function hillY(cx_,CX,GY,scale){
  var yn=solveY((cx_-CX)/scale,HP.h,HP.k,HP.a);
  return yn>0?GY-yn*scale:GY;
}
function placementY(cx_,CX,GY,scale,hP,aP){
  var yn=solveY((cx_-CX)/scale,hP,HP.k,aP);
  return yn>0?GY-yn*scale:GY;
}

/* ══════════════════════════════════════════════════════
   DRAW HILL
   ══════════════════════════════════════════════════════ */
function drawHillFill(T,CX,GY,scale,CW){
  var ctx=window._ctx;
  var x0=Math.max(0,CX-HP.a*scale*1.6);
  var x1=Math.min(CW,CX+HP.a*scale*1.6);
  var le=x0,re=x1;
  for(var xi=x0;xi<=CX;xi+=1){if(hillY(xi,CX,GY,scale)<GY-0.8){le=xi;break;}}
  for(var xi=x1;xi>=CX;xi-=1){if(hillY(xi,CX,GY,scale)<GY-0.8){re=xi;break;}}
  ctx.beginPath();ctx.moveTo(le,GY);
  for(var xi=le;xi<=re;xi+=1){var cy2=hillY(xi,CX,GY,scale);ctx.lineTo(xi,cy2<GY?cy2:GY);}
  ctx.lineTo(re,GY);ctx.closePath();
  ctx.fillStyle=T.hill;ctx.fill();
}
function drawHillStroke(T,CX,GY,scale,CW){
  var ctx=window._ctx;
  var x0=Math.max(0,CX-HP.a*scale*1.6);
  var x1=Math.min(CW,CX+HP.a*scale*1.6);
  var le=x0,re=x1;
  for(var xi=x0;xi<=CX;xi+=1){if(hillY(xi,CX,GY,scale)<GY-0.8){le=xi;break;}}
  for(var xi=x1;xi>=CX;xi-=1){if(hillY(xi,CX,GY,scale)<GY-0.8){re=xi;break;}}
  ctx.beginPath();ctx.moveTo(le,GY);
  for(var xi=le;xi<=re;xi+=1){var cy2=hillY(xi,CX,GY,scale);ctx.lineTo(xi,cy2<GY?cy2:GY);}
  ctx.lineTo(re,GY);
  ctx.strokeStyle=T.ink;ctx.lineWidth=2.2;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
}
function drawHill(T,CX,GY,scale,CW){
  drawHillFill(T,CX,GY,scale,CW);
  drawHillStroke(T,CX,GY,scale,CW);
}

/* ══════════════════════════════════════════════════════
   GROUP SEGMENTS ON ARC
   ══════════════════════════════════════════════════════ */
var TRACK = { h: 5.23, a: 5.23, mid: 0.5 };

function trackY(xi, CX, GY, scale){
  var hillH  = HP.h;
  var hillA  = HP.a;
  var canvasH = GY / scale;
  var canvasA = CX / scale;
  var trackH  = hillH  + TRACK.mid * (canvasH  - hillH);
  var trackA  = hillA  + TRACK.mid * (canvasA  - hillA);
  var xn = (xi - CX) / scale;
  var r2 = 1 - (xn / trackA) * (xn / trackA);
  if(r2 <= 0) return GY;
  return GY - trackH * Math.sqrt(r2) * scale;
}

function onTrackChange(){
  _cvCache = {key:'', pts:[]};
  if(state.words.length) render();
}
var _cvCache = {key:'', pts:[]};

function buildCurve(CX, GY, scale, hPg, aP, CW){
  var key = [CX,GY,scale,CW,TRACK.h,TRACK.a,TRACK.mid].join(',');
  if(_cvCache.key === key) return _cvCache.pts;
  var pts=[];
  for(var xi=1; xi<CW-1; xi++){
    var y = trackY(xi, CX, GY, scale);
    if(y < GY - 0.5) pts.push({x:xi, y:y});
  }
  _cvCache = {key:key, pts:pts};
  return pts;
}

/* Geometry in canvas CSS pixels. L is the padded box height times LINE_PITCH.
   The track locates groups; text measurement only decides what fits there. */
var GROUP_LAYOUT = Object.freeze({
  LINE_PITCH: 1.18, DX_MIN: 1.5, DX_MAX: 4, PEAK_RISE: 3,
  MIN_FONT: 10, SHRINK_STEP: 0.05, GUTTER: 3
});

function stackHeight(count, boxHeight){
  return boxHeight * (1 + (count - 1) * GROUP_LAYOUT.LINE_PITCH);
}

function layoutHeight(width, groups){
  var normal = Math.round(width * 0.56);
  // A narrow hill can give a tall stair extra rows. The board's 680px tile
  // keeps its normal height, so its next row and caption stay in place.
  var rows = Math.max.apply(null, groups.map(function(group){ return group.length; }));
  var minBox = GROUP_LAYOUT.MIN_FONT + PV * 2;
  var minimum = BTN_M + BTN_R + 16 + stackHeight(rows, minBox);
  return Math.max(normal, Math.min(Math.ceil(minimum), width, Math.round(680 * 0.56)),
                  BTN_M + BTN_R + 16 + groups.length * (minBox + GROUP_LAYOUT.GUTTER));
}

function isPeakGroup(gi, count){
  return (count === 4 && (gi === 1 || gi === 2)) ||
         ((count === 3 || count === 5) && gi === Math.floor(count / 2));
}

// Keep layer 3's group points at equal arc-length intervals on the track.
function groupPoints(indices, baseFs){
  var track = buildCurve(L.CX, L.GY, L.scale, 0, 0, L.CW);
  var lengths = [0];
  for(var i = 1; i < track.length; i++){
    lengths.push(lengths[i-1] + Math.hypot(track[i].x-track[i-1].x, track[i].y-track[i-1].y));
  }
  var cursor = 0, count = indices.length;
  var lane = L.CW / count, top = BTN_M + BTN_R + 6, bottom = L.GY - GROUP_LAYOUT.GUTTER;
  return indices.map(function(words, gi){
    var fraction = count === 1 ? 0.5 : gi / (count - 1);
    while(cursor < track.length - 1 && lengths[cursor] < fraction * lengths[lengths.length-1]) cursor++;
    var anchor = track[cursor] || {x:L.CX, y:L.GY};
    // Reserve a distinct centre for each group even at the extremes of a drag.
    var inset = Math.min(lane / 2, L.CW * 0.16);
    var baseX = Math.max(inset, Math.min(L.CW - inset, anchor.x));
    var left = (gi + 0.25) * lane, right = (gi + 0.75) * lane;
    baseX = Math.max(left, Math.min(right, baseX));
    var x = Math.max(left, Math.min(right, baseX + getGroupOX(gi)));
    var y = trackY(anchor.x + x - baseX, L.CX, L.GY, L.scale);
    var half = Math.min((bottom - top) / 2, stackHeight(words.length, baseFs + 2 * PV) / 2);
    return {gi:gi, cx:x, cy:Math.max(top + half, Math.min(bottom - half, y))};
  });
}

function boxIntersects(a, b){
  var gap = GROUP_LAYOUT.GUTTER;
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap &&
         a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

function groupBoxes(group, reduction){
  var point = group.point;
  var boxes = group.indices.map(function(wi, i){
    var fs = Math.max(GROUP_LAYOUT.MIN_FONT, group.fonts[i] * (1 - reduction));
    ctx_m.font = fs + 'px ' + FONT;
    var label = state.words[wi];
    return {wi:wi, gi:point.gi, label:label, fs:fs, w:ctx_m.measureText(label).width + PH * 2};
  });
  var n = boxes.length, center = (n - 1) / 2;
  var height = boxes.reduce(function(tallest, b){ return Math.max(tallest, b.fs); }, 0) + 2 * PV;
  var pitch = height * GROUP_LAYOUT.LINE_PITCH;
  var dx = Math.max(GROUP_LAYOUT.DX_MIN, Math.min(GROUP_LAYOUT.DX_MAX, pitch * 0.1));
  var width = boxes.reduce(function(sum, b){ return sum + b.w; }, (n - 1) * GROUP_LAYOUT.GUTTER);
  var arc = n > 1 && isPeakGroup(point.gi, state.G) && width <= L.CW / state.G - 2 * GROUP_LAYOUT.GUTTER &&
            !window.matchMedia('(orientation: portrait)').matches;
  var left = point.cx - width / 2;
  var direction = point.gi < state.G / 2 ? -1 : 1;
  boxes.forEach(function(b, i){
    b.h = height;
    b.x = point.cx + (i - center) * dx - b.w / 2;
    b.y = point.cy + (i - center) * pitch * direction - height / 2;
    if(arc){
      b.x = left;
      b.y = point.cy - height / 2 + (n > 2 ? GROUP_LAYOUT.PEAK_RISE * (Math.abs(i - center) / center - 0.5) : 0);
      left += b.w + GROUP_LAYOUT.GUTTER;
    }
  });
  return boxes;
}

function compactBox(group, groups){
  var point = group.point, indices = group.indices, wi = indices[0];
  var label = state.words[wi] + (indices.length > 1 ? ' +' + (indices.length - 1) : '');
  var fs = GROUP_LAYOUT.MIN_FONT, gap = GROUP_LAYOUT.GUTTER, height = fs + PV * 2;
  ctx_m.font = fs + 'px ' + FONT;
  var width = Math.min(ctx_m.measureText(label).width + 2 * PH, L.CW - 2 * gap);
  var top = BTN_M + BTN_R + 6, bottom = L.GY - gap - height;
  var box = {wi:wi, gi:point.gi, label:label, fs:fs, w:width, h:height,
             x:Math.max(gap, Math.min(L.CW - gap - width, point.cx - width / 2)),
             y:Math.max(top, Math.min(bottom, point.cy - height / 2))};
  // Try the nearest clear row first. A summary can span a lane boundary
  // without hiding another group that still fits in full.
  var obstacles = [], candidates = [box.y, top, bottom];
  groups.forEach(function(other){
    if(other === group) return;
    other.boxes.forEach(function(b){
      if(box.x < b.x + b.w + gap && b.x < box.x + width + gap){
        obstacles.push(b);
        candidates.push(b.y - gap - height, b.y + b.h + gap);
      }
    });
  });
  var preferred = box.y;
  candidates.sort(function(a,b){ return Math.abs(a-preferred) - Math.abs(b-preferred); });
  for(var y of candidates){
    if(y < top || y > bottom) continue;
    box.y = y;
    if(!obstacles.some(function(other){ return boxIntersects(box, other); })) return box;
  }
  box.y = preferred;
  return box;
}

function computeLayout(indices, baseFs){
  var points = groupPoints(indices, baseFs);
  var groups = indices.map(function(words, gi){
    var point = points[gi];
    var fonts = words.map(function(wi){
      return Math.max(GROUP_LAYOUT.MIN_FONT, wordFontSize(wi, state.words.length, baseFs, point.cx, L.CX, L.GY, L.scale));
    });
    return {point:point, indices:words, fonts:fonts, step:0, compact:false};
  });
  var top = BTN_M + BTN_R + 6, gap = GROUP_LAYOUT.GUTTER;
  groups.forEach(function(group){ group.boxes = groupBoxes(group, 0); });
  // Only shrink groups that cross a boundary or actually collide. Each pass
  // either reduces a font, compacts a group, or resolves the last summary rows.
  for(;;){
    var onCanvas = [], failed = new Set();
    groups.forEach(function(group){
      var outside = group.boxes.some(function(b){
        return b.x < gap - 0.0001 || b.x + b.w > L.CW - gap + 0.0001 ||
               b.y < top - 0.0001 || b.y + b.h > L.GY - gap + 0.0001;
      });
      if(outside){
        failed.add(group);
        return;
      }
      onCanvas.forEach(function(other){
        if(group.boxes.some(function(b){ return other.boxes.some(function(a){ return boxIntersects(a,b); }); })){
          failed.add(group);
          failed.add(other);
        }
      });
      onCanvas.push(group);
    });
    if(!failed.size) break;
    var retry = Array.from(failed).filter(function(group){ return !group.compact; });
    if(!retry.length){
      // Each summary fits the canvas width. layoutHeight reserves at least
      // one row per group, so even full-width summaries have a solution.
      var row = top;
      groups.forEach(function(group){
        if(group.compact){
          group.boxes[0].y = row;
          row += group.boxes[0].h + gap;
        }
      });
      continue;
    }
    var reducible = retry.filter(function(group){ return group.boxes.some(function(b){ return b.fs > GROUP_LAYOUT.MIN_FONT; }); });
    if(reducible.length){
      reducible.forEach(function(group){
        group.boxes = groupBoxes(group, ++group.step * GROUP_LAYOUT.SHRINK_STEP);
      });
    }else{
      // One summary may free its neighbour, so recheck after each collapse.
      var group = retry.sort(function(a,b){ return b.indices.length - a.indices.length; })[0];
      group.compact = true;
      group.boxes = [compactBox(group, groups)];
    }
  }
  return groups;
}

/* ── off-screen canvas for text measurement ── */
var offCv=document.createElement('canvas');
var ctx_m=offCv.getContext('2d');

/* ── word splitting ──────────────────────────────────── 
   Methodology:
   1. Analyze word into micro-syllables (CV patterns)
   2. Try to group into G=3, then G=4, then G=5
   3. Each group: 1-4 characters, balanced
   4. Pick the most readable split (best balance score)
   5. Fallback: equal character division
   ──────────────────────────────────────────────────── */
var VOWELS='aeiouyåäöAEIOUYÅÄÖ';
function isVowel(ch){return VOWELS.indexOf(ch)>=0;}

/* Step 1: Split word into micro-syllables (smallest readable chunks)
   Pattern: (optional consonants)(vowel cluster)(optional trailing consonant)
   Examples: "computer" → ["com","pu","ter"]
             "strength" → ["str","eng","th"]  */
function microSyllables(word){
  var w = word, n = w.length, result = [], i = 0;
  while(i < n){
    var start = i;
    /* leading consonants (max 3) */
    while(i < n && !isVowel(w[i]) && (i - start) < 3) i++;
    /* vowel cluster */
    while(i < n && isVowel(w[i])) i++;
    /* trailing consonant: take ONE, but leave it if next char is vowel */
    if(i < n && !isVowel(w[i])){
      if(i + 1 < n && isVowel(w[i + 1])){
        /* next is vowel → this consonant starts next syllable */
      } else {
        i++; /* take this consonant */
      }
    }
    if(i === start){ /* safety: advance at least 1 */
      i++;
    }
    result.push(w.slice(start, i));
  }
  return result;
}

/* Step 2: Generate ALL contiguous partitions into G groups. Word chunks have 1-4 chars.
   Returns array of arrays, e.g. [["com","pu","ter"], ["co","mpu","ter"], ...] */
function allGroupings(syllables, G, sentence){
  var results = [];
  var N = syllables.length;
  if(N < G) return results;
  
  /* Generate partition points: where to split syllables into G groups */
  function recurse(pos, g, current){
    if(g === G){
      if(pos === N){
        /* Sentence groups are nonempty; word chunks have 1-4 chars. */
        var valid = true;
        for(var i = 0; i < current.length; i++){
          if(current[i].length < 1 || (!sentence && current[i].length > 4)){ valid = false; break; }
        }
        if(valid) results.push(current.slice());
      }
      return;
    }
    var remaining = G - g;
    var syllablesLeft = N - pos;
    /* this group can take 1..syllablesLeft-(remaining-1) syllables */
    var maxTake = syllablesLeft - (remaining - 1);
    var grp = sentence ? [] : '';
    for(var take = 1; take <= maxTake; take++){
      grp = sentence ? grp.concat([syllables[pos + take - 1]]) : grp + syllables[pos + take - 1];
      if(!sentence && grp.length > 4) break; /* word chunks can't exceed 4 chars */
      if(grp.length >= 1){
        current.push(grp);
        recurse(pos + take, g + 1, current);
        current.pop();
      }
    }
  }
  recurse(0, 0, []);
  return results;
}

/* Step 3: Score a grouping — lower is better */
function scoreGrouping(groups, cutCosts){
  var n = groups.length;
  /* balance: std dev of group lengths */
  var sum = 0;
  for(var i = 0; i < n; i++) sum += groups[i].length;
  var mean = sum / n;
  var variance = 0;
  for(var i = 0; i < n; i++){
    var d = groups[i].length - mean;
    variance += d * d;
  }
  var balance = Math.sqrt(variance / n);
  
  /* FIRST-LAST symmetry: strongly penalize if first and last differ */
  var firstLastDiff = Math.abs(groups[0].length - groups[n-1].length);
  var symmetryPenalty = firstLastDiff * 1.5;  /* heavy weight */

  /* readability penalties */
  var readPenalty = 0;
  if(cutCosts){
    var edge = (groups[0].length + groups[n-1].length) / 2;
    for(var i = 1; i < n - 1; i++){
      var size = groups[i].length;
      var over = size > edge ? Math.max(0, size - edge - 1) : edge - size;
      readPenalty += 1.5 * over;
    }
    if(sum >= 6){
      for(var i = 0; i < n; i++) if(groups[i].length === 1) readPenalty += 2;
    }
    var boundary = 0;
    for(var i = 0; i < n - 1; i++){
      boundary += groups[i].length;
      readPenalty += cutCosts[boundary];
    }
    return balance + symmetryPenalty + readPenalty;
  }
  for(var i = 1; i < n; i++){
    var prevLast = groups[i-1][groups[i-1].length - 1];
    var curFirst = groups[i][0];
    if(isVowel(prevLast) && isVowel(curFirst)) readPenalty += 0.5;
    if(groups[i].length === 1) readPenalty += 0.3;
  }
  if(groups[0].length === 1) readPenalty += 0.3;
  
  return balance + symmetryPenalty + readPenalty;
}

/* Sentence costs are a suggestion, not a language parser. Prefer clause starts,
   but protect short coordinated runs, including comma-separated lists. */
function sentenceCutCosts(words){
  var costs = [], clean = words.map(function(w){
    return w.toLowerCase().replace(/^[^a-zåäö]+|[^a-zåäö]+$/g, '');
  });
  var starts = /^(and|or|that|because|to|och|att|som)$/;
  var joins = /^(and|or|och|eller)$/;
  for(var i = 1; i < words.length; i++){
    costs[i] = starts.test(clean[i]) || /[,;:.!?،؛؟]$/.test(words[i-1]) ? 0 : 1;
  }
  /* Three or more comma-separated items can also form a list without "and". */
  for(var i = 0; i < words.length - 2; i++){
    var end = i;
    while(end < words.length - 1 && /,$/.test(words[end])) end++;
    if(end - i >= 2){
      for(var b = i + 1; b <= end; b++) costs[b] = 8;
      i = end;
    }
  }
  for(var i = 1; i < words.length - 1; i++){
    if(!joins.test(clean[i]) || !clean[i-1] || !clean[i+1]) continue;
    /* A pronoun/determiner after the conjunction usually starts a clause. */
    if(isCommon(clean[i-1]) || isCommon(clean[i+1]) || /[.;:!?]$/.test(words[i-1])) continue;
    var start = i - 1;
    if(start > 0 && /,$/.test(words[start-1])){
      while(start > 0 && /,$/.test(words[start-1])) start--;
    }else if(start > 0 && !isCommon(clean[start-1]) && !/[,.;:!?]$/.test(words[start-1])){
      start--; /* e.g. "identify analyze and evaluate" */
    }
    for(var b = start + 1; b <= i + 1; b++) costs[b] = 8;
  }
  return costs;
}

/* Automatic suggestions only. User markers (VB-37, later) override these filters,
   just as manual regrouping overrides the computed suggestion. */
function sentenceGroupsAllowed(groups, wordCount){
  for(var i = 0; i < groups.length; i++){
    if(wordCount >= 6 && groups[i].length === 1) return false;
    if(groups[i].length > 4) return false;
  }
  return true;
}

/* One candidate search and score for both levels. G is optional: automatic on
   submit, fixed when the person explicitly chooses a group count. */
function split(items, sentence, fixedG){
  if(!sentence && !fixedG && items.length <= 4){
    return {chunks: [items], G: 1};
  }
  if(!items.length) return {chunks: [], G: 0};
  /* Long sentences bypass candidate search. Multiple hills remain deferred.
     Equal contiguous groups keep all words; extras go middle-out, left on ties. */
  if(sentence && items.length > 20){
    var G = fixedG ? Math.min(fixedG, items.length) : 5;
    var base = Math.floor(items.length / G), rem = items.length % G;
    var middleOut = [], sizes = [], chunks = [], pos = 0;
    for(var i = 0; i < G; i++){ middleOut.push(i); sizes.push(base); }
    middleOut.sort(function(a, b){
      return Math.abs(2*a - G + 1) - Math.abs(2*b - G + 1) || a - b;
    });
    for(var i = 0; i < rem; i++) sizes[middleOut[i]]++;
    for(var i = 0; i < G; i++){
      chunks.push(items.slice(pos, pos + sizes[i]));
      pos += sizes[i];
    }
    return {chunks: chunks, G: G, longSentence: true};
  }
  var syls = sentence ? items : microSyllables(items);
  var cutCosts = sentence ? sentenceCutCosts(items) : null;
  
  /* Automatic G tries 3-5 (or fewer for short input); fixed G searches only that count. */
  var bestScore = Infinity, bestResult = null;
  var allowedScore = Infinity, allowedResult = null;
  
  var firstG = fixedG ? Math.min(fixedG, items.length) : Math.min(3, items.length);
  var lastG = fixedG ? firstG : Math.min(5, items.length);
  for(var G = firstG; G <= lastG; G++){
    
    var candidates = allGroupings(syls, G, sentence);
    
    for(var c = 0; c < candidates.length; c++){
      var s = scoreGrouping(candidates[c], cutCosts);
      /* small bias toward fewer groups: +0.15 per extra group beyond 3 */
      s += (G - 3) * 0.15;
      if(s < bestScore){ bestScore = s; bestResult = {chunks: candidates[c], G: G}; }
      if(sentence && sentenceGroupsAllowed(candidates[c], items.length) && s < allowedScore){
        allowedScore = s; allowedResult = {chunks: candidates[c], G: G};
      }
    }
  }
  
  /* Apply the same filters across all eligible G values, or within a fixed G.
     If none pass (e.g. six words, fixed G=5), return the lowest score overall. */
  var result = allowedResult || bestResult;
  if(result){
    if(sentence) result.longSentence = items.length > 20;
    return result;
  }
  
  /* Preserve the word fallback when no syllable partition fits the chosen count. */
  var G = firstG;
  var len = items.length, base = Math.floor(len / G), rem = len % G;
  var chunks = [], pos = 0;
  for(var i = 0; i < G; i++){
    var sz = base + (i < rem ? 1 : 0);
    chunks.push(items.slice(pos, pos + sz));
    pos += sz;
  }
  return {chunks: chunks, G: G};
}

function splitSingleWord(word, G){ return split(word, false, G); }

function updateSentenceNotice(longSentence){
  var notice = document.getElementById('sentenceNotice');
  if(notice){
    notice.textContent = longSentence ? 'long sentence: split it into two' : '';
    notice.hidden = !longSentence;
  }
}

function applySplit(result){
  updateSentenceNotice(result.longSentence);
  if(state.charMode){
    // The splitter keeps a short standalone word whole. Longer chunks can
    // contain several micro-syllables, each with a single draw and drag target.
    var chunks = result.chunks.map(function(chunk){
      return result.G === 1 && chunk.length <= 4 ? [chunk] : microSyllables(chunk);
    });
    result = {G:result.G, chunks:chunks};
    state.words = [].concat.apply([], result.chunks);
  }
  var pos = 0;
  state.G = result.G;
  state.splits = [];
  for(var i = 0; i < result.chunks.length - 1; i++){
    pos += result.chunks[i].length;
    state.splits.push(pos);
  }
}

/* ── faces ───────────────────────────────────────────── */
var FACES=[
  function(c,cx,fy,R,ink){var ex=R*.23,lw=Math.max(1.5,R*.018);c.strokeStyle=ink;c.lineWidth=lw;c.lineCap='round';c.beginPath();c.arc(cx-ex,fy,R*.07,-.1,Math.PI+.1,false);c.stroke();c.beginPath();c.arc(cx+ex,fy,R*.07,-.1,Math.PI+.1,false);c.stroke();c.beginPath();c.arc(cx,fy+R*.22,R*.26,.1,Math.PI-.1,false);c.stroke();c.beginPath();c.moveTo(cx-R*.16,fy+R*.22);c.lineTo(cx+R*.16,fy+R*.22);c.stroke();},
  function(c,cx,fy,R,ink){var ex=R*.22,lw=Math.max(1.5,R*.018);c.strokeStyle=ink;c.lineWidth=lw;c.lineCap='round';c.beginPath();c.arc(cx-ex,fy,R*.11,0,Math.PI*2);c.stroke();c.beginPath();c.arc(cx+ex,fy,R*.11,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(cx-ex-R*.12,fy-R*.14);c.lineTo(cx-ex+R*.08,fy-R*.05);c.stroke();c.beginPath();c.moveTo(cx+ex+R*.12,fy-R*.14);c.lineTo(cx+ex-R*.08,fy-R*.05);c.stroke();c.beginPath();c.ellipse(cx,fy+R*.27,R*.14,R*.1,0,0,Math.PI*2);c.stroke();},
  function(c,cx,fy,R,ink){var ex=R*.2,lw=Math.max(1.5,R*.018);c.strokeStyle=ink;c.lineWidth=lw;c.lineCap='round';c.fillStyle=ink;c.beginPath();c.arc(cx-ex,fy,R*.04,0,Math.PI*2);c.fill();c.beginPath();c.arc(cx+ex,fy,R*.04,0,Math.PI*2);c.fill();c.beginPath();c.moveTo(cx-ex-R*.06,fy-R*.07);c.lineTo(cx-ex,fy-R*.12);c.lineTo(cx-ex+R*.06,fy-R*.07);c.stroke();c.beginPath();c.moveTo(cx+ex-R*.06,fy-R*.07);c.lineTo(cx+ex,fy-R*.12);c.lineTo(cx+ex+R*.06,fy-R*.07);c.stroke();c.beginPath();c.moveTo(cx-R*.1,fy+R*.22);c.lineTo(cx+R*.1,fy+R*.22);c.stroke();},
  function(c,cx,fy,R,ink){var ex=R*.24,lw=Math.max(1.5,R*.018);c.strokeStyle=ink;c.lineWidth=lw+.5;c.lineCap='round';c.beginPath();c.arc(cx-ex,fy,R*.13,0,Math.PI*2);c.stroke();c.beginPath();c.arc(cx+ex,fy,R*.13,0,Math.PI*2);c.stroke();c.fillStyle=ink;c.beginPath();c.arc(cx-ex,fy,R*.05,0,Math.PI*2);c.fill();c.beginPath();c.arc(cx+ex,fy,R*.05,0,Math.PI*2);c.fill();c.lineWidth=lw;c.beginPath();c.arc(cx,fy+R*.28,R*.09,0,Math.PI*2);c.stroke();},
  function(c,cx,fy,R,ink){var ex=R*.22,lw=Math.max(1.5,R*.018);c.strokeStyle=ink;c.lineCap='round';c.lineWidth=lw;c.beginPath();c.arc(cx-ex,fy,R*.1,Math.PI,0,false);c.stroke();c.beginPath();c.arc(cx+ex,fy,R*.1,Math.PI,0,false);c.stroke();c.lineWidth=lw*1.8;c.beginPath();c.arc(cx-ex,fy,R*.1,Math.PI*1.05,Math.PI*.55,true);c.stroke();c.beginPath();c.arc(cx+ex,fy,R*.1,Math.PI*1.05,Math.PI*.55,true);c.stroke();c.lineWidth=lw;c.beginPath();c.moveTo(cx-R*.2,fy+R*.24);c.bezierCurveTo(cx-R*.07,fy+R*.32,cx+R*.07,fy+R*.16,cx+R*.2,fy+R*.24);c.stroke();},
  function(c,cx,fy,R,ink){var ex=R*.22,lw=Math.max(1.5,R*.018);c.strokeStyle=ink;c.lineWidth=lw;c.lineCap='round';c.beginPath();c.moveTo(cx-ex-R*.09,fy-R*.09);c.lineTo(cx-ex+R*.09,fy+R*.09);c.stroke();c.beginPath();c.moveTo(cx-ex+R*.09,fy-R*.09);c.lineTo(cx-ex-R*.09,fy+R*.09);c.stroke();c.beginPath();c.arc(cx+ex,fy,R*.1,0,Math.PI*2);c.stroke();c.fillStyle=ink;c.beginPath();c.arc(cx+ex+R*.04,fy+R*.04,R*.03,0,Math.PI*2);c.fill();c.beginPath();c.arc(cx+R*.04,fy+R*.22,R*.18,.2,Math.PI-.2,false);c.stroke();}
];

/* ── group helpers ───────────────────────────────────── */
function groupOf(wi){for(var i=0;i<state.splits.length;i++)if(wi<state.splits[i])return i;return state.splits.length;}
function getGroupArrays(){
  var out=[],prev=0;
  for(var i=0;i<state.splits.length;i++){var a=[];for(var j=prev;j<state.splits[i];j++)a.push(j);out.push(a);prev=state.splits[i];}
  var a=[];for(var j=prev;j<state.words.length;j++)a.push(j);out.push(a);return out;
}
function tryMove(wi,tg){
  var sg=groupOf(wi);if(sg===tg)return;
  var W=state.words.length,ns=state.splits.slice();
  if(tg>sg){
    ns[tg-1]=wi;
    for(var i=tg-2;i>=0;i--){if(ns[i]>=ns[i+1]){ns[i]=ns[i+1]-1;if(ns[i]<1)return;}}
    for(var i=tg;i<ns.length;i++){if(ns[i]<=ns[i-1]){ns[i]=ns[i-1]+1;if(ns[i]>=W)return;}}
  }else{
    ns[tg]=wi+1;if(ns[tg]>=W)return;
    for(var i=tg+1;i<ns.length;i++){if(ns[i]<=ns[i-1]){ns[i]=ns[i-1]+1;if(ns[i]>=W)return;}}
    for(var i=tg-1;i>=0;i--){if(ns[i]>=ns[i+1]){ns[i]=ns[i+1]-1;if(ns[i]<1)return;}}
  }
  for(var i=0;i<ns.length;i++){if(ns[i]<1||ns[i]>=W)return;if(i>0&&ns[i]<=ns[i-1])return;}
  state.splits=ns;
}
var COMMON_WORDS = {
  'a':1,'an':1,'the':1,'and':1,'or':1,'but':1,'nor':1,'so':1,'yet':1,'for':1,
  'in':1,'on':1,'at':1,'to':1,'of':1,'by':1,'up':1,'as':1,'if':1,'no':1,
  'is':1,'it':1,'be':1,'we':1,'he':1,'she':1,'me':1,'my':1,'do':1,'not':1,
  'was':1,'are':1,'am':1,'has':1,'had':1,'did':1,'can':1,'may':1,'got':1,
  'get':1,'let':1,'put':1,'its':1,'his':1,'her':1,'our':1,'you':1,'they':1,
  'them':1,'this':1,'that':1,'from':1,'with':1,'then':1,'than':1,'when':1,
  'what':1,'who':1,'how':1,'all':1,'been':1,'were':1,'will':1,'have':1,
  'into':1,'over':1,'also':1,'just':1,'like':1,'some':1,'your':1,'him':1,
  'more':1,'out':1,'now':1,'two':1,'even':1,'most':1,'only':1,'same':1,
  'any':1,'each':1,'much':1,'very':1,'such':1,'own':1,'too':1,'here':1,
  'does':1,'could':1,'would':1,'should':1,'there':1,'their':1,'these':1,
  'those':1,'about':1,'which':1,'while':1,'after':1,'being':1,'where':1,
  'every':1,'under':1,'until':1,'again':1,'still':1,'since':1,'might':1,
  'shall':1,'whose':1,'whom':1,'both':1,'well':1,'other':1,'first':1,
  'above':1,'below':1,'between':1,'among':1,'before':1,'through':1,
  'during':1,'without':1,'within':1,'along':1,'across':1,'behind':1,
  'beyond':1,'itself':1,'myself':1,'yourself':1,'himself':1,'herself':1,
  'themselves':1,'ourselves':1,'each':1,'either':1,'neither':1,'whether':1,
  'jag':1,'du':1,'han':1,'hon':1,'vi':1,'ni':1,'de':1,'man':1,
  'mig':1,'dig':1,'honom':1,'henne':1,'oss':1,'er':1,'dem':1,
  'min':1,'din':1,'hans':1,'hennes':1,'vår':1,'ert':1,'deras':1,
  'mitt':1,'ditt':1,'vårt':1,'era':1,
  'sin':1,'sitt':1,'sina':1,'sig':1,
  'är':1,'var':1,'har':1,'hade':1,'ska':1,'skall':1,'skulle':1,
  'kan':1,'kunde':1,'vill':1,'ville':1,'måste':1,'bör':1,'borde':1,
  'få':1,'fick':1,'bli':1,'blev':1,'blivit':1,'vara':1,'varit':1,
  'det':1,'den':1,'ett':1,'en':1,
  'och':1,'att':1,'i':1,'på':1,'av':1,'för':1,'med':1,'till':1,
  'om':1,'men':1,'så':1,'som':1,'ur':1,'mot':1,'vid':1,'hos':1,
  'från':1,'utan':1,'sedan':1,'efter':1,'innan':1,'under':1,'över':1,
  'genom':1,'mellan':1,'bland':1,'bakom':1,'framför':1,'bredvid':1,
  'då':1,'nu':1,'här':1,'där':1,'när':1,'hur':1,'vad':1,'vem':1,
  'inte':1,'också':1,'redan':1,'ännu':1,'just':1,'bara':1,'ändå':1,
  'eller':1,'varken':1,'antingen':1,'både':1,'varje':1,'alla':1,
  'ingen':1,'inget':1,'inga':1,'allt':1,'något':1,'några':1,
  'ut':1,'upp':1,'ner':1,'ned':1,'hem':1,'dit':1,'hit':1,
  'därför':1,'alltså':1,'dock':1,'samt':1,'fast':1,'trots':1
};

function isCommon(word){
  return !!COMMON_WORDS[word.toLowerCase()];
}

function wordFontSize(wi, W, base, ax, CX, GY, scale){
  if(!state.charMode && isCommon(state.words[wi])) return Math.round(base * DBG.FNT_COMMON);
  var pY    = trackY(ax, CX, GY, scale);
  var peakY = trackY(CX, CX, GY, scale);
  var heightRatio = Math.max(0, Math.min(1, (GY - pY) / Math.max(1, GY - peakY)));
  var MAX_BOOST = Math.max(0.4, 1.6 - W * 0.09);
  var boost = DBG_STEPS.FNT_BOOST ? 1.0 + heightRatio * MAX_BOOST : 1.0;
  var spaceV = Math.max(base, pY - 6 - PV*2);
  var fsV    = Math.floor(spaceV);
  var fs = Math.min(Math.round(base * boost), fsV);
  return Math.max(base, Math.round(fs * DBG.FNT_CONTENT));
}

function rrPath(x,y,w,h){
  var r=4;ctx.beginPath();
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
function drawBox(x,y,bw,bh,word,col,fs,alpha){
  var T=isDark?THEMES.dark:THEMES.light;
  ctx.save();ctx.globalAlpha=alpha==null?1:alpha;
  if(noColor){
    ctx.font=fs+'px '+FONT;ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.fillStyle=T.ink;ctx.fillText(word,x+PH,y+bh/2,bw-2*PH);
  }else{
    rrPath(x,y,bw,bh);ctx.fillStyle=col.f;ctx.fill();
    ctx.strokeStyle=col.s;ctx.lineWidth=1.5;ctx.stroke();
    ctx.fillStyle=col.t;ctx.font=fs+'px '+FONT;
    ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.fillText(word,x+PH,y+bh/2,bw-2*PH);
  }
  ctx.restore();
}

function drawCanvasButtons(CW){
  canvasBtns=[];
  var defs=[
    {id:'meme',  x:BTN_M,               y:BTN_M,label:'😶',tip:'Meme face',  on:false},
    {id:'dark',  x:CW-BTN_M,            y:BTN_M,label:'🌙',tip:'Dark mode',  on:isDark},
    {id:'color', x:CW-BTN_M-BTN_R*2-5,  y:BTN_M,label:'◑', tip:'No colors', on:noColor},
    {id:'groups',x:CW-BTN_M-BTN_R*4-10, y:BTN_M,label:String(state.G),tip:'Groups',on:false}
  ];
  defs.forEach(function(d){
    ctx.save();ctx.globalAlpha=.75;
    ctx.beginPath();ctx.arc(d.x,d.y,BTN_R,0,Math.PI*2);
    ctx.fillStyle=d.on?(isDark?'rgba(255,255,255,.22)':'rgba(0,0,0,.18)'):(isDark?'rgba(255,255,255,.12)':'rgba(255,255,255,.55)');
    ctx.fill();ctx.strokeStyle=isDark?'rgba(255,255,255,.25)':'rgba(0,0,0,.2)';ctx.lineWidth=1.2;ctx.stroke();ctx.restore();
    ctx.save();ctx.font='11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle=isDark?'#ddd':'#222';ctx.fillText(d.label,d.x,d.y);ctx.restore();
    canvasBtns.push({id:d.id,x:d.x,y:d.y,r:BTN_R,tip:d.tip});
  });
}

function drawFace(CX,GY,scale,ink){
  var CW=L.CW||680;
  var peakX=CX,peakY=GY;
  for(var xi=CW*.1;xi<=CW*.9;xi+=3){var cy=hillY(xi,CX,GY,scale);if(cy<peakY){peakY=cy;peakX=xi;}}
  var H=GY-peakY,fy=peakY+H*.42,R=H*.46;
  if(memeIdx>=0&&memeIdx<FACES.length)FACES[memeIdx](ctx,peakX,fy,R,ink);
  else{
    var ex=R*.22,er=R*.09,lw=Math.max(1.5,R*.016);
    ctx.strokeStyle=ink;ctx.lineWidth=lw;ctx.lineCap='round';
    ctx.beginPath();ctx.arc(peakX-ex,fy,er,0,Math.PI,false);ctx.stroke();
    ctx.beginPath();ctx.arc(peakX+ex,fy,er,0,Math.PI,false);ctx.stroke();
    ctx.beginPath();ctx.arc(peakX,fy+R*.18,R*.22,.15,Math.PI-.15,false);ctx.stroke();
  }
}

var showGuides    = false;
var showCollision = false;

function drawGuides(CW, GY, CX, scale, hP, aP){
  if(!showGuides || !state.words.length) return;
  var pad = DBG.BOX_HITPAD;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([3,3]);
  wordBoxes.forEach(function(box){
    var collision = showCollision && wordBoxes.some(function(other){
      return box !== other && boxIntersects(box, other);
    });
    ctx.strokeStyle = collision ? '#e05c5c' : COLS[box.gi % COLS.length].s;
    ctx.lineWidth = collision ? 2 : 1;
    ctx.strokeRect(box.x - pad, box.y - pad, box.w + 2 * pad, box.h + 2 * pad);
  });
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = isDark?'rgba(255,255,255,.5)':'rgba(0,0,0,.3)';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([5,4]);
  ctx.beginPath();
  var trackStarted=false;
  for(var xi2=1; xi2<CW-1; xi2++){
    var ty = trackY(xi2, CX, GY, scale);
    if(ty < GY-0.5){
      if(!trackStarted){ctx.moveTo(xi2,ty);trackStarted=true;}
      else ctx.lineTo(xi2,ty);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#888';
  ctx.lineWidth   = 1;
  ctx.setLineDash([4,4]);
  ctx.beginPath();
  var started = false;
  for(var xi=1; xi<CW-1; xi++){
    var y = placementY(xi, CX, GY, scale, hP, aP);
    if(y < GY-2){
      if(!started){ ctx.moveTo(xi,y); started=true; }
      else ctx.lineTo(xi,y);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  for(var gi=0; gi<groupCircles.length; gi++){
    var circle=groupCircles[gi], cx=circle.cx, cy=circle.cy, R=circle.R;
    var col = COLS[gi%COLS.length].s;

    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle   = col;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.stroke();

    var allIntersections = [];
    var prevDiff2 = null;
    var STEPS = 720;
    for(var s=0; s<=STEPS; s++){
      var ang   = (s/STEPS) * Math.PI * 2;
      var px    = cx + R * Math.cos(ang);
      var py    = cy + R * Math.sin(ang);
      var pcY   = trackY(px, CX, GY, scale);
      var diff2 = py - pcY;
      if(prevDiff2 !== null && prevDiff2 * diff2 < 0){
        var frac = Math.abs(prevDiff2) / (Math.abs(prevDiff2) + Math.abs(diff2));
        var ang2 = ((s-1+frac)/STEPS) * Math.PI * 2;
        allIntersections.push({
          x: cx + R * Math.cos(ang2),
          y: cy + R * Math.sin(ang2)
        });
      }
      prevDiff2 = diff2;
    }

    allIntersections
      .filter(function(pt){ return pt.y <= GY - DBG.COL_ABOVE_LINE; })
      .forEach(function(pt){
        ctx.globalAlpha = 0.9;
        ctx.fillStyle   = col;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 5, 0, Math.PI*2); ctx.fill();
      });

    ctx.restore();
  }
}

/* ══════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════ */
function render(){
  if(!state.words.length)return;
  var T=isDark?THEMES.dark:THEMES.light;
  var dpr=Math.min(window.devicePixelRatio||1,2);
  var CW=cv.offsetWidth||680;
  var grps=getGroupArrays();
  var CH=layoutHeight(CW, grps);
  cv.width=CW*dpr;cv.height=CH*dpr;cv.style.height=CH+'px';
  ctx.scale(dpr,dpr);
  offCv.width=CW;offCv.height=1;

  var GY=CH-5;
  var scale=(GY*.50)/HP.h;
  var CX=CW/2;
  L={CW:CW,CH:CH,GY:GY,scale:scale,CX:CX};

  var hP=HP.h, aP=HP.a*DBG.TRK_AP_SCALE;
  _cvCache = {key:'', pts:[]};

  ctx.fillStyle=noColor?(isDark?'#111':'#f5f0e8'):T.sky;
  ctx.fillRect(0,0,CW,GY);
  drawHillFill(T,CX,GY,scale,CW);
  drawFace(CX,GY,scale,T.ink);

  ctx.lineCap='butt';
  ctx.beginPath();ctx.moveTo(0,GY);ctx.lineTo(CW,GY);
  ctx.strokeStyle=T.ink;ctx.lineWidth=2.2;ctx.stroke();

  var baseFs=Math.max(12,Math.min(18,Math.floor(CW/42)));
  var groups=computeLayout(grps,baseFs);
  wordBoxes=[];groupCenters=[];groupCircles=[];
  groups.forEach(function(group){
    var point=group.point;
    groupCenters.push({gi:point.gi, px:point.cx});
    groupCircles.push({gi:point.gi, cx:point.cx, cy:point.cy, R:getGroupMinPX(point.gi)});
    group.boxes.forEach(function(box){ wordBoxes.push(box); });
  });

  if(drag.active&&!noColor){
    var tg=nearestGroup(drag.mx);
    if(tg>=0&&tg!==groupOf(drag.wi)){
      ctx.save();ctx.globalAlpha=.09;ctx.fillStyle=COLS[tg%COLS.length].s;ctx.fillRect(0,0,CW,GY);ctx.restore();
    }
  }

  wordBoxes.forEach(function(box){
    var x=box.x, y=box.y, alpha=1;
    if(drag.active && drag.wi===box.wi){
      var ghost={x:drag.mx-drag.offX,y:drag.my-drag.offY,w:box.w,h:box.h};
      if(ghost.x>=0 && ghost.x+box.w<=CW && ghost.y>=0 && ghost.y+box.h<=GY &&
         !wordBoxes.some(function(other){ return other!==box && boxIntersects(ghost,other); })){
        x=ghost.x; y=ghost.y;
      }
      alpha=0.78;
    }
    drawBox(x,y,box.w,box.h,box.label,COLS[box.gi%COLS.length],box.fs,alpha);
  });
  drawHillStroke(T,CX,GY,scale,CW);

  drawCanvasButtons(CW);
  drawGuides(CW, GY, CX, scale, hP, aP);
  applyTheme();
}

function applyTheme(){
  var T=isDark?THEMES.dark:THEMES.light;
  var bot=document.getElementById('bottom');
  var sent=document.getElementById('sentOut');
  var notice=document.getElementById('sentenceNotice');
  var inp=document.getElementById('inp');
  if(bot)  bot.style.background=noColor?(isDark?'#111':'#f5f0e8'):T.botBg;
  if(sent) sent.style.color=noColor?(isDark?'#666':'#aaa'):T.sentC;
  if(notice) notice.style.color=T.inputC;
  if(inp){ inp.style.background=T.inputBg; inp.style.color=T.inputC; }
  document.body.style.background=isDark?'#1e1c18':'#eee8da';
  var paw=document.getElementById('pawIcon');
  if(paw){
    var fills=paw.querySelectorAll('ellipse[fill="#1a1510"]');
    var strokes=paw.querySelectorAll('ellipse[stroke="white"]');
    var col=isDark?'#d8d2c4':'#1a1510';
    var bg=isDark?'#1e1c18':'white';
    fills.forEach(function(el){el.setAttribute('fill',col);});
    strokes.forEach(function(el){el.setAttribute('stroke',bg);});
  }
}

/* ── pointer ─────────────────────────────────────────── */
function canvasXY(e){
  var r=cv.getBoundingClientRect();
  var sc=(L.CW||cv.offsetWidth)/(r.width||1);
  var src=(e.touches&&e.touches.length)?e.touches[0]:e;
  return{x:(src.clientX-r.left)*sc,y:(src.clientY-r.top)*sc};
}
function hitBtn(px,py){for(var i=0;i<canvasBtns.length;i++){var b=canvasBtns[i],dx=px-b.x,dy=py-b.y;if(dx*dx+dy*dy<=b.r*b.r)return b;}return null;}
function hitBox(px,py){for(var i=0;i<wordBoxes.length;i++){var b=wordBoxes[i];if(px>=b.x&&px<=b.x+b.w&&py>=b.y&&py<=b.y+b.h)return b;}return null;}
function nearestGroup(px){var best=-1,bestD=Infinity;for(var i=0;i<groupCenters.length;i++){var d=Math.abs(groupCenters[i].px-px);if(d<bestD){bestD=d;best=groupCenters[i].gi;}}return best;}

function doBtn(id){
  if(id==='dark'){isDark=!isDark;render();}
  else if(id==='color'){noColor=!noColor;render();}
  else if(id==='groups'){
    var count = state.charMode ? state.words.join('').length : state.words.length;
    var maxG = Math.min(5, count), minG = Math.min(3, count);
    var G = state.G >= maxG ? minG : state.G + 1;
    randomHP();
    if(count){
      var result = state.charMode ? splitSingleWord(state.words.join(''), G) : split(state.words, true, G);
      applySplit(result);
      drag.active=false;render();DBG_GROUP_PX=[];buildGroupPXSliders();
    }else render();
  }
  else if(id==='meme'){var prev=memeIdx;do{memeIdx=Math.floor(Math.random()*FACES.length);}while(memeIdx===prev&&FACES.length>1);randomHP();if(state.words.length)render();}
}

function setThread(raw){
  var sent=document.getElementById('sentOut');
  var parts=raw.split(/\s+/);
  updateSentenceNotice(false);
  drag.active=false;
  DBG_GROUP_PX=[];
  DBG_GROUP_OX=[];
  if(parts.length===1){
    var result=splitSingleWord(parts[0]);
    state.charMode = true;
    applySplit(result);
    if(sent) sent.textContent = parts[0];
  }else{
    state.charMode = false;
    if(sent) sent.textContent=raw;
    state.words=parts;
    applySplit(split(parts, true));
  }
  render();
  buildGroupPXSliders();
}
