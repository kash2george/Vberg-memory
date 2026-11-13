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
var PH=7, PV=5;
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

  /*  AUTO-CALIBRATE Anchor per group */
  var grps = getGroupArrays();
  var G = grps.length;
  var CW = L.CW || 680;
  var baseFs = Math.max(12, Math.min(18, Math.floor(CW/42)));
  var fs = Math.round(baseFs * DBG.FNT_CONTENT);
  var GAP = state.charMode ? 3 : (DBG.COL_MIN_GAP + 4);

  /* measure total width for every group */
  var groupWidths = [];
  var totalWidth = 0;
  offCv.width = CW; offCv.height = 1;
  ctx_m.font = fs + 'px ' + FONT;

  for(var g = 0; g < G; g++){
    var arr = grps[g];
    var w = 0;
    if(state.charMode){
      /* charMode: measure as concatenated string + per-char padding */
      for(var k = 0; k < arr.length; k++){
        if(arr[k] >= state.words.length) continue;
        w += ctx_m.measureText(state.words[arr[k]]).width + PH*2;
        if(k > 0) w += GAP;
      }
    } else {
      for(var k = 0; k < arr.length; k++){
        if(arr[k] >= state.words.length) continue;
        w += ctx_m.measureText(state.words[arr[k]]).width + PH*2;
        if(k > 0) w += GAP;
      }
    }
    groupWidths.push(w);
    totalWidth += w;
  }

  if(totalWidth <= 0) return 50;

  var trackWidth = CW * 0.72;
  var share = trackWidth * (groupWidths[gi] / totalWidth);
  var anchor = Math.max(20, Math.round(share / 2));

  /* ensure at least enough for the group's total horizontal content */
  var groupW = groupWidths[gi] || 0;
  anchor = Math.max(anchor, Math.round(groupW/2 + 8));

  return anchor;
}
function getGroupOX(gi){
  return (DBG_GROUP_OX[gi] !== undefined) ? DBG_GROUP_OX[gi] : 0;
}

var DBG_STEPS = {
  FNT_BOOST:    true,
  FNT_SHRINK:   true,
  COL_CIRCLES:  true,
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

function cvIdxAt(pts, tx){
  var i = Math.round(tx - pts[0].x);
  return Math.max(0, Math.min(pts.length-1, i));
}

function cvWalk(pts, i0, px, dir){
  if(px <= 0) return i0;
  var walked=0, i=i0;
  while(walked < px){
    var next=i+dir;
    if(next<0||next>=pts.length) break;
    var dx=pts[next].x-pts[i].x, dy=pts[next].y-pts[i].y;
    walked+=Math.sqrt(dx*dx+dy*dy);
    i=next;
  }
  return i;
}

/* ── Main word X/Y computation ─────────────────────── 
   
   ARCHITECTURE (rebuilt from scratch):
   ════════════════════════════════════
   Every word lives on the TRACK CURVE. Period.
   
   1. Build track: array of {x,y} points, 1px horizontal steps
   2. Place group centers at equal arc-length intervals on track
   3. Push group centers apart (circle collision on track)
   4. For each group: find track segment inside circle (by 2D distance)
   5. Distribute words evenly on that segment
   6. Each word stores: trkIdx, leftIdx, rightIdx
   
   COLLISION (in computeLayout):
   - Words slide along the track (change trkIdx only)
   - Words are clamped to their group's [leftIdx, rightIdx]
   - x,y is ALWAYS read from trk[trkIdx] — never set directly
   ════════════════════════════════════════════════════════ */

/* helper: update a box's pixel position from its track index */
function _syncBoxToTrack(box, trk, baseFs, W, CX, GY, scale, aP, CW){
  var pt = trk[box.trkIdx];
  box.ax = pt.x;
  var TOP_CLEAR = BTN_M + BTN_R + 6;
  box.y = Math.max(4, Math.max(TOP_CLEAR, pt.y - box.h));
  box.x = Math.max(4, Math.min(CW - 4 - box.w, pt.x - box.w/2));
}

/* ── Word track memory: stores last good trkIdx per word ── */
var _wordMemory = [];

function computeWordPositions(W, G, CX, GY, scale, hP, aP, CW){
  var grps = getGroupArrays();
  var result = new Array(W);

  /* 1. Build full track */
  var trk = buildCurve(CX, GY, scale, 0, 0, CW);
  if(!trk.length){
    for(var wi=0; wi<W; wi++)
      result[wi] = {x:CX, y:GY-40, trkIdx:0, leftIdx:0, rightIdx:0};
    return {pts: result, trk: trk};
  }

  /* 2. Full track range */
  var UL = 0;
  var UR = trk.length - 1;

  /* Arc-length array */
  var arcLen = [0];
  for(var i=1; i<=UR; i++){
    var dx=trk[i].x-trk[i-1].x, dy=trk[i].y-trk[i-1].y;
    arcLen.push(arcLen[arcLen.length-1]+Math.sqrt(dx*dx+dy*dy));
  }
  var totalArc = arcLen[arcLen.length-1]||1;

  /* 3. Place group centers on track by equal arc-length within USABLE range */
  var gInfo = [];
  for(var gi=0; gi<G; gi++){
    var t = G===1 ? 0.5 : gi/(G-1);
    var target = t * totalArc;
    var ai = 0;
    for(var i=0; i<arcLen.length; i++){ if(arcLen[i]>=target){ai=i;break;} }
    var idx = Math.max(UL, Math.min(UR, UL + ai));

    /* apply OX offset: find nearest track point within usable */
    var ox = getGroupOX(gi);
    if(Math.abs(ox) > 0.5){
      var wantX = trk[idx].x + ox;
      var best=idx, bestD=Infinity;
      for(var i=UL;i<=UR;i++){
        var d=Math.abs(trk[i].x - wantX);
        if(d<bestD){bestD=d;best=i;}
      }
      idx=best;
    }

    gInfo.push({ci:idx, cx:trk[idx].x, cy:trk[idx].y,
                R:getGroupMinPX(gi), li:idx, ri:idx});
  }

  /* 4. Push group centers apart along track (within usable range) */
  if(DBG_STEPS.COL_CIRCLES){
    for(var pass=0;pass<20;pass++){
      var moved=false;
      for(var gi=0;gi<G-1;gi++){
        var ga=gInfo[gi], gb=gInfo[gi+1];
        var dx=trk[gb.ci].x-trk[ga.ci].x;
        var dy=trk[gb.ci].y-trk[ga.ci].y;
        var dist=Math.sqrt(dx*dx+dy*dy);
        var minD=ga.R+gb.R+4;
        if(dist>0 && dist<minD){
          var push=Math.ceil((minD-dist)/2);
          ga.ci=Math.max(UL, ga.ci-push);
          gb.ci=Math.min(UR, gb.ci+push);
          ga.cx=trk[ga.ci].x; ga.cy=trk[ga.ci].y;
          gb.cx=trk[gb.ci].x; gb.cy=trk[gb.ci].y;
          moved=true;
        }
      }
      if(!moved)break;
    }
  }

  /* 5. For each group: find track segment inside circle. */
  for(var gi=0;gi<G;gi++){
    var g=gInfo[gi];
    g.li=g.ci; g.ri=g.ci;
    for(var i=g.ci;i>=UL;i--){
      var dx=trk[i].x-g.cx, dy=trk[i].y-g.cy;
      if(Math.sqrt(dx*dx+dy*dy)>g.R) break;
      g.li=i;
    }
    for(var i=g.ci;i<=UR;i++){
      var dx=trk[i].x-g.cx, dy=trk[i].y-g.cy;
      if(Math.sqrt(dx*dx+dy*dy)>g.R) break;
      g.ri=i;
    }
    if(g.li>g.ri) g.li=g.ri=g.ci;
  }

  /* 5b. Clip overlapping segments between adjacent groups */
  for(var gi=0;gi<G-1;gi++){
    var ga=gInfo[gi], gb=gInfo[gi+1];
    if(ga.ri >= gb.li){
      var mid = Math.floor((ga.ri + gb.li) / 2);
      ga.ri = Math.max(ga.li, mid);
      gb.li = Math.min(gb.ri, mid + 1);
      if(ga.ci > ga.ri) ga.ci = ga.ri;
      if(gb.ci < gb.li) gb.ci = gb.li;
    }
  }

  /* 6. Distribute words with MEMORY SYSTEM
        ─────────────────────────────────────
        Rule: words always stay on the track, near their circle.
        
        When circle is big enough → place inside circle (normal)
        When circle is too small  → use memory BUT pull toward circle center
        
        The pull strength = how much the circle shrank.
        Fully open circle = word at memory position.
        Tiny circle = word at circle center.
        This prevents edge groups from having words stuck far away. */
  for(var gi=0;gi<G;gi++){
    var arr=grps[gi];
    if(!arr){arr=[];} /* safety */
    var n=arr.length, g=gInfo[gi];
    if(!g) continue; /* safety */
    var segLen = g.ri - g.li;
    
    /* Measure: how much horizontal X-space does the circle segment give? */
    var segXwidth = (g.ri < trk.length && g.li >= 0) ? 
                    Math.abs(trk[Math.min(g.ri, trk.length-1)].x - trk[g.li].x) : 0;
    /* How much X-space do we need for all words? */
    var neededXwidth = 15 * n;
    
    for(var k=0;k<n;k++){
      var wi = arr[k];
      
      /* ideal position inside circle */
      var t2 = n===1 ? 0.5 : k/(n-1);
      var idealTi = Math.round(g.li + t2*segLen);
      idealTi = Math.max(g.li, Math.min(g.ri, idealTi));
      
      var mem = (_wordMemory[wi] !== undefined) ? _wordMemory[wi] : -1;
      
      var useTi;
      var useLeft, useRight;
      
      if(segXwidth >= neededXwidth || n <= 1){
        /* ── Circle big enough → normal placement ── */
        useTi = idealTi;
        useLeft = g.li;
        useRight = g.ri;
        _wordMemory[wi] = useTi;
      } else if(mem >= 0 && mem < trk.length){
        /* ── Circle too small, have memory → blend memory toward center ──
           ratio = 1.0 when circle fits perfectly → use memory as-is
           ratio = 0.0 when circle is a single point → use circle center
           In between → linear interpolation */
        var ratio = (neededXwidth > 0) ? Math.min(1, segXwidth / neededXwidth) : 0;
        useTi = Math.round(mem * ratio + g.ci * (1 - ratio));
        useTi = Math.max(0, Math.min(trk.length-1, useTi));
        /* bounds: between circle and memory, not whole track */
        useLeft = Math.min(g.li, useTi);
        useRight = Math.max(g.ri, useTi);
      } else {
        /* ── No memory → place at circle center ── */
        useTi = idealTi;
        useLeft = g.li;
        useRight = g.ri;
        _wordMemory[wi] = useTi;
      }
      
      useTi = Math.max(UL, Math.min(UR, useTi));
      var pt = trk[useTi];
      result[wi] = {x:pt.x, y:pt.y, trkIdx:useTi, leftIdx:useLeft, rightIdx:useRight};
    }
  }

  /* 7. GLOBAL ORDER: ensure word 0 ≤ word 1 ≤ word 2 ... on track.
        When groups overlap at small R, initial placement can be crossed. */
  for(var wi=1; wi<W; wi++){
    if(!result[wi] || !result[wi-1]) continue;
    if(result[wi].trkIdx < result[wi-1].trkIdx){
      /* force this word at least at previous word's position + 1 */
      var fixed = Math.min(result[wi].rightIdx, result[wi-1].trkIdx + 1);
      fixed = Math.max(UL, Math.min(UR, fixed));
      result[wi].trkIdx = fixed;
      result[wi].x = trk[fixed].x;
      result[wi].y = trk[fixed].y;
    }
  }

  return {pts: result, trk: trk, gInfo: gInfo};
}

/* thin wrapper so old callers still work (returns just the point array) */
function computeWordX(W, G, CX, GY, scale, hP, aP, CW){
  var r = computeWordPositions(W, G, CX, GY, scale, hP, aP, CW);
  return r.pts;
}

/* ══════════════════════════════════════════════════════
   LAYOUT — track-index based (rebuilt from scratch)
   
   Rule #1: words ALWAYS sit on the track curve
   Rule #2: collision slides words along track (trkIdx ±)
   Rule #3: words clamp to group circle bounds [leftIdx..rightIdx]
   Rule #4: font shrink only if clamped and still overlapping
   Rule #5: Y-offset only as absolute last resort
   ══════════════════════════════════════════════════════ */
function computeLayout(W, CX, GY, scale, hP, aP, baseFs, CW){
  var MIN_X = 4, MAX_X = CW - 4;
  var COL_MIN_GAP = DBG.COL_MIN_GAP;

  var data = computeWordPositions(W, state.G, CX, GY, scale, hP, aP, CW);
  var allPts = data.pts;
  var trk    = data.trk;
  var gInfo  = data.gInfo;
  if(!allPts || !trk.length) return [];

  /* ═══════════════════════════════════════════════════
     CHAR MODE: each character is a separate box,
     arranged horizontally within its group.
     Group sits on track, characters are a flat row.
     ═══════════════════════════════════════════════════ */
  if(state.charMode && gInfo){
    var boxes = [];
    var grps = getGroupArrays();
    var CHAR_GAP = 3; /* px between characters */

    for(var gi = 0; gi < grps.length; gi++){
      var arr = grps[gi];
      if(!arr.length) continue;
      var g = gInfo[gi];
      if(!g) continue;

      /* group anchor point on track */
      var anchorPt = trk[g.ci] || trk[Math.floor(trk.length/2)];
      var anchorX = anchorPt.x;
      var anchorY = anchorPt.y;

      /* font size: based on group position on track — NO isCommon check
         (single chars like 'a','i','o' must not be shrunk) */
      var pY    = trackY(anchorX, CX, GY, scale);
      var peakY = trackY(CX, CX, GY, scale);
      var heightRatio = Math.max(0, Math.min(1, (GY - pY) / Math.max(1, GY - peakY)));
      var MAX_BOOST = Math.max(0.4, 1.6 - W * 0.09);
      var boost = DBG_STEPS.FNT_BOOST ? 1.0 + heightRatio * MAX_BOOST : 1.0;
      var fs = Math.max(baseFs, Math.round(baseFs * boost * DBG.FNT_CONTENT));
      var bh = fs + PV*2;

      /* measure all character widths */
      ctx_m.font = fs + 'px ' + FONT;
      var charWidths = [];
      var totalW = 0;
      for(var k = 0; k < arr.length; k++){
        var cw = ctx_m.measureText(state.words[arr[k]]).width + PH*2;
        charWidths.push(cw);
        totalW += cw;
        if(k > 0) totalW += CHAR_GAP;
      }

      /* position: horizontal row centered at anchorX */
      var TOP_CLEAR = BTN_M + BTN_R + 6;
      var rowY = Math.max(4, Math.max(TOP_CLEAR, anchorY - bh));
      var startX = anchorX - totalW/2;

      var cx = startX;
      for(var k = 0; k < arr.length; k++){
        var wi = arr[k];
        var bw = charWidths[k];
        var bx = Math.max(MIN_X, Math.min(MAX_X - bw, cx));

        boxes[wi] = {
          wi:wi, x:bx, y:rowY, w:bw, h:bh, gi:gi, fs:fs, ax:anchorX,
          trkIdx: g.ci, leftIdx: g.li, rightIdx: g.ri
        };
        cx += bw + CHAR_GAP;
      }
    }
    return boxes;
  }

  /* ═══════════════════════════════════════════════════
     NORMAL MODE (sentences): words on track
     ═══════════════════════════════════════════════════ */

  /* ── Step 1: Build boxes at track positions ── */
  var boxes = new Array(W);
  for(var wi=0; wi<W; wi++){
    var pt = allPts[wi];
    var gi = groupOf(wi);
    var fs = wordFontSize(wi, W, baseFs, pt.x, CX, GY, scale);
    var bh = fs + PV*2;
    ctx_m.font = fs+'px '+FONT;
    var bw = ctx_m.measureText(state.words[wi]).width + PH*2;

    var TOP_CLEAR = BTN_M + BTN_R + 6;
    var by = Math.max(4, Math.max(TOP_CLEAR, pt.y - bh));
    var bx = Math.max(MIN_X, Math.min(MAX_X - bw, pt.x - bw/2));

    boxes[wi] = {
      wi:wi, x:bx, y:by, w:bw, h:bh, gi:gi, fs:fs, ax:pt.x,
      trkIdx:   pt.trkIdx,
      leftIdx:  pt.leftIdx,
      rightIdx: pt.rightIdx
    };
  }

  /* ── Step 2: Slide words along track to resolve overlaps ── */
  for(var pass=0; pass<80; pass++){
    var moved = false;
    /* sort by track index (= left-to-right on curve) */
    var sorted = boxes.slice().sort(function(a,b){ return a.trkIdx - b.trkIdx; });

    for(var i=0; i<sorted.length; i++){
      for(var j=i+1; j<sorted.length; j++){
        var a=sorted[i], b=sorted[j];

        /* early exit if far apart in pixels */
        if(b.x > a.x + a.w + COL_MIN_GAP + 30) break;

        /* 2D box overlap? */
        var xOv = b.x < a.x + a.w + COL_MIN_GAP;
        var yOv = !(a.y + a.h < b.y || b.y + b.h < a.y);
        if(!xOv || !yOv) continue;

        /* overlap amount in pixels → approximate push in track indices */
        var overlap = (a.x + a.w + COL_MIN_GAP) - b.x;
        if(overlap <= 0) continue;
        var push = Math.ceil(overlap/2) + 1;

        /* push a left, b right — but clamp to group bounds */
        var newAi = Math.max(a.leftIdx,  a.trkIdx - push);
        var newBi = Math.min(b.rightIdx, b.trkIdx + push);

        if(newAi !== a.trkIdx){
          a.trkIdx = newAi;
          _syncBoxToTrack(a, trk, baseFs, W, CX, GY, scale, aP, CW);
          moved = true;
        }
        if(newBi !== b.trkIdx){
          b.trkIdx = newBi;
          _syncBoxToTrack(b, trk, baseFs, W, CX, GY, scale, aP, CW);
          moved = true;
        }
      }
    }

    /* ── ORDER ENFORCEMENT: words must keep sentence order on track ──
       word 0 must be left of word 1 which must be left of word 2, etc.
       If any word crosses its neighbour, push them back to midpoint. */
    for(var wi=0; wi<W-1; wi++){
      var cur  = boxes[wi];
      var next = boxes[wi+1];
      if(cur.trkIdx >= next.trkIdx){
        /* crossed! average them and space by 1 */
        var mid = Math.round((cur.trkIdx + next.trkIdx) / 2);
        cur.trkIdx  = Math.max(cur.leftIdx,  mid - 1);
        next.trkIdx = Math.min(next.rightIdx, mid + 1);
        /* still crossed after clamp? force equal */
        if(cur.trkIdx >= next.trkIdx){
          cur.trkIdx = Math.min(cur.trkIdx, next.trkIdx);
        }
        _syncBoxToTrack(cur,  trk, baseFs, W, CX, GY, scale, aP, CW);
        _syncBoxToTrack(next, trk, baseFs, W, CX, GY, scale, aP, CW);
      }
    }

    if(!moved) break;
  }

  /* ── Step 3: Font shrink for words still overlapping (clamped at bounds) ── */
  if(DBG_STEPS.FNT_SHRINK){
    for(var pass=0; pass<30; pass++){
      var changed = false;
      var sorted = boxes.slice().sort(function(a,b){ return a.x - b.x; });
      for(var i=0; i<sorted.length-1; i++){
        var a=sorted[i], b=sorted[i+1];
        var gap = b.x - (a.x + a.w);
        var yOv = !(a.y+a.h < b.y || b.y+b.h < a.y);
        if(gap < COL_MIN_GAP && yOv){
          /* shrink the content word (not common words) */
          var tgt = null;
          if(!isCommon(state.words[b.wi]) && b.fs>10) tgt=b;
          else if(!isCommon(state.words[a.wi]) && a.fs>10) tgt=a;
          else if(b.fs>10) tgt=b;
          else if(a.fs>10) tgt=a;
          if(tgt){
            tgt.fs = Math.max(10, tgt.fs-1);
            ctx_m.font = tgt.fs+'px '+FONT;
            tgt.w = ctx_m.measureText(state.words[tgt.wi]).width+PH*2;
            tgt.h = tgt.fs+PV*2;
            _syncBoxToTrack(tgt, trk, baseFs, W, CX, GY, scale, aP, CW);
            changed = true;
          }
        }
      }
      if(!changed) break;
    }
  }

  /* ── Step 4: removed — no vertical stacking. Words stay on track. ── */

  return boxes;
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
  if(isCommon(state.words[wi])) return Math.round(base * DBG.FNT_COMMON);
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
    ctx.fillStyle=T.ink;ctx.fillText(word,x+PH,y+bh/2);
  }else{
    rrPath(x,y,bw,bh);ctx.fillStyle=col.f;ctx.fill();
    ctx.strokeStyle=col.s;ctx.lineWidth=1.5;ctx.stroke();
    ctx.fillStyle=col.t;ctx.font=fs+'px '+FONT;
    ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.fillText(word,x+PH,y+bh/2);
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
  var G    = state.G;
  var grps = getGroupArrays();

  if(wordBoxes.length){
    var P = DBG.BOX_HITPAD;
    var byX3 = wordBoxes.slice().sort(function(a,b){return a.x-b.x;});

    ctx.save();
    for(var i=0;i<byX3.length;i++){
      var b = byX3[i];
      var col3 = COLS[b.gi%COLS.length].s;
      ctx.globalAlpha=0.5; ctx.strokeStyle=col3; ctx.lineWidth=1;
      ctx.setLineDash([3,3]);
      ctx.strokeRect(b.x-P, b.y-P, b.w+P*2, b.h+P*2);
      ctx.setLineDash([]);
      if(i < byX3.length-1){
        var nb = byX3[i+1];
        var gapPx = nb.x - (b.x + b.w);
        var midY  = Math.min(b.y + b.h/2, nb.y + nb.h/2);
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = gapPx < 2 ? '#e05c5c' : '#888';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(b.x + b.w, midY);
        ctx.lineTo(nb.x, midY);
        ctx.stroke();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle   = gapPx < 2 ? '#e05c5c' : '#888';
        ctx.font        = '9px system-ui';
        ctx.textAlign   = 'center';
        ctx.fillText(Math.round(gapPx)+'px', (b.x+b.w+nb.x)/2, midY-4);
      }
    }
    ctx.restore();
  }

  if(showCollision && wordBoxes.length){
    var byX4 = wordBoxes.slice().sort(function(a,b){return a.x-b.x;});
    ctx.save();
    for(var i=0;i<byX4.length-1;i++){
      var a4=byX4[i], b4=byX4[i+1];
      var gap4 = b4.x - (a4.x + a4.w);
      if(gap4 < 2){
        ctx.globalAlpha=0.6; ctx.strokeStyle='#e05c5c'; ctx.lineWidth=2;
        ctx.setLineDash([]);
        var y4 = Math.min(a4.y, b4.y) - 6;
        ctx.beginPath();
        ctx.moveTo(a4.x, y4); ctx.lineTo(a4.x+a4.w, y4);
        ctx.moveTo(b4.x, y4); ctx.lineTo(b4.x+b4.w, y4);
        ctx.stroke();
        ctx.globalAlpha=0.9; ctx.fillStyle='#e05c5c';
        ctx.font='10px system-ui'; ctx.textAlign='center';
        ctx.fillText('⚡', (a4.x+a4.w+b4.x)/2, y4);
      }
    }
    ctx.restore();
  }

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

  var samplePts2 = buildCurve(CX, GY, scale, 0, 0, CW);
  var guideLeft  = samplePts2.length ? samplePts2[0].x : 40;
  var guideRight = samplePts2.length ? samplePts2[samplePts2.length-1].x : CW-40;

  var MARGIN = 40;
  for(var gi=0; gi<G; gi++){
    var grp = getGroupArrays()[gi];
    var n   = grp ? grp.length : 1;
    var t   = G===1 ? 0.5 : gi/(G-1);
    var baseCx = guideLeft + t*(guideRight-guideLeft);
    var cx  = Math.max(guideLeft, Math.min(guideRight, baseCx + getGroupOX(gi)));
    var cy  = trackY(cx, CX, GY, scale);
    var R   = getGroupMinPX(gi);
    var col = COLS[gi%COLS.length].s;
    if(cy < 4 + R) cy = 4 + R;

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
  var CH=Math.round(CW*.56);
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

  var W=state.words.length;
  var baseFs=Math.max(12,Math.min(18,Math.floor(CW/42)));
  var boxes=computeLayout(W,CX,GY,scale,hP,aP,baseFs,CW);

  wordBoxes=[];groupCenters=[];groupCircles=[];
  var grps=getGroupArrays();
  var posData=computeWordPositions(W,state.G,CX,GY,scale,hP,aP,CW);
  var allAxesGC=posData.pts;
  var gInfoRender=posData.gInfo;
  for(var gi=0;gi<state.G;gi++){
    var arr=grps[gi];if(!arr||!arr.length)continue;
    var midWi=arr[Math.floor(arr.length/2)];
    var pt=allAxesGC&&allAxesGC[midWi]?allAxesGC[midWi]:null;
    groupCenters.push({gi:gi,px:pt?pt.x:CX});
    /* store circle info for wheel/middle-click hit testing */
    if(gInfoRender&&gInfoRender[gi]){
      var gi2=gInfoRender[gi];
      var trk2=posData.trk;
      var cp=trk2&&trk2[gi2.ci]?trk2[gi2.ci]:{x:CX,y:GY/2};
      groupCircles.push({gi:gi, cx:cp.x, cy:cp.y, R:getGroupMinPX(gi)});
    }
  }

  if(drag.active&&!noColor){
    var tg=nearestGroup(drag.mx);
    if(tg>=0&&tg!==groupOf(drag.wi)){
      ctx.save();ctx.globalAlpha=.09;ctx.fillStyle=COLS[tg%COLS.length].s;ctx.fillRect(0,0,CW,GY);ctx.restore();
    }
  }

  for(var wi=0;wi<W;wi++){
    var box=boxes[wi];
    if(!box) continue;
    wordBoxes.push(box);
    if(!drag.active||drag.wi!==wi)
      drawBox(box.x,box.y,box.w,box.h,state.words[wi],COLS[box.gi%COLS.length],box.fs,1);
  }

  drawHillStroke(T,CX,GY,scale,CW);

  if(drag.active){
    var ref=null;
    for(var i=0;i<wordBoxes.length;i++)if(wordBoxes[i].wi===drag.wi){ref=wordBoxes[i];break;}
    if(ref){
      var gi=groupOf(drag.wi);
      drawBox(drag.mx-drag.offX,drag.my-drag.offY,ref.w,ref.h,state.words[drag.wi],COLS[gi%COLS.length],ref.fs,0.78);
    }
  }

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
    var count = state.words.length;
    var maxG = Math.min(5, count), minG = Math.min(3, count);
    var G = state.G >= maxG ? minG : state.G + 1;
    randomHP();_wordMemory=[];
    if(count){
      var result = state.charMode ? splitSingleWord(state.words.join(''), G) : split(state.words, true, G);
      applySplit(result);
      if(state.charMode) state.charGroups = result.chunks;
      drag.active=false;render();DBG_GROUP_PX=[];buildGroupPXSliders();
    }else render();
  }
  else if(id==='meme'){var prev=memeIdx;do{memeIdx=Math.floor(Math.random()*FACES.length);}while(memeIdx===prev&&FACES.length>1);randomHP();_wordMemory=[];if(state.words.length)render();}
}

function setThread(raw){
  var sent=document.getElementById('sentOut');
  var parts=raw.split(/\s+/);
  updateSentenceNotice(false);
  drag.active=false;
  _wordMemory=[];
  if(parts.length===1){
    var result=splitSingleWord(parts[0]);
    /* charMode: each character is a separate "word", groups define which chars belong together */
    state.charMode = true;
    state.charGroups = result.chunks; /* ["com","pu","ter"] for display reference */
    var allChars = [];
    var splits = [];
    var pos = 0;
    for(var g = 0; g < result.chunks.length; g++){
      var chunk = result.chunks[g];
      for(var c = 0; c < chunk.length; c++){
        allChars.push(chunk[c]);
      }
      pos += chunk.length;
      if(g < result.chunks.length - 1) splits.push(pos);
    }
    state.words = allChars;
    state.G = result.G;
    state.splits = splits;
    if(sent) sent.textContent = parts[0];
  }else{
    state.charMode = false;
    if(sent) sent.textContent=raw;
    state.words=parts;
    applySplit(split(parts, true));
  }
  render();
  DBG_GROUP_PX=[];
  DBG_GROUP_OX=[];
  buildGroupPXSliders();
}
