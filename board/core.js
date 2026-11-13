/* VBerg board — pure helpers (no DOM, no storage). Tested from Node.
   Nothing here is stored: every value is computed from order or from the
   viewport. */
(function(root){
  'use strict';

  /* A hill on the board is drawn at the site's default canvas size. */
  var HILL_W = 680;
  var HILL_H = Math.round(HILL_W * 0.56);
  var CAPTION_H = 64;      /* ground line under the hill */
  var GAP_X = 60, GAP_Y = 56;
  var ROW_LEN = 4;         /* hills per row; tunable */
  var ZOOM_MIN = 0.1, ZOOM_MAX = 4;

  function clampZoom(z){ return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)); }

  /* Camera: screen = cam.x + world * cam.z. Zoom keeps the point under the
     cursor / fingers still. */
  function zoomAt(cam, sx, sy, factor){
    var z = clampZoom(cam.z * factor);
    var k = z / cam.z;
    return {x: sx - (sx - cam.x) * k, y: sy - (sy - cam.y) * k, z: z};
  }

  function toWorld(cam, sx, sy){
    return {x: (sx - cam.x) / cam.z, y: (sy - cam.y) / cam.z};
  }

  /* Place of the i-th entry of the board's time thread. A pure function of
     the order index: rows of ROW_LEN, left to right, top to bottom. */
  function placeOf(index){
    return {
      x: (index % ROW_LEN) * (HILL_W + GAP_X),
      y: Math.floor(index / ROW_LEN) * (HILL_H + CAPTION_H + GAP_Y),
      w: HILL_W,
      h: HILL_H + CAPTION_H
    };
  }

  /* Camera that shows one place fully inside a viewport, never magnified
     above 1. */
  function fitCamera(place, vw, vh, margin){
    var m = margin == null ? 12 : margin;
    var z = clampZoom(Math.min(1, (vw - 2 * m) / place.w, (vh - 2 * m) / place.h));
    return {
      x: vw / 2 - (place.x + place.w / 2) * z,
      y: vh / 2 - (place.y + place.h / 2) * z,
      z: z
    };
  }

  /* Hill shape is never stored (Spec §1). It is recomputed from the node
     ID, so a hill looks the same after every reload (Spec §13.6 seed). */
  function seedOf(id){
    var h = 0x811c9dc5;                          /* FNV-1a, 32 bit */
    for(var i = 0; i < id.length; i++){
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  function seededRandom(seed){                   /* mulberry32 */
    var a = seed >>> 0;
    return function(){
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── stored records (Spec §1b) ──
     Thread data is nodes, placements and annotations. None of them may
     carry a coordinate or a size (rule 1): screen places are computed from
     `order`. Free-drawing strokes are the only stored coordinates and live
     in their own store, keyed by board. */
  var BOARD_ID = 'board:main';

  /* Order key for the next point on a thread. Keys sort as plain strings:
     a length letter, then base-36 digits ("a0" … "az", "b10" …). Appending
     never rewrites an older key; room is left to insert between two keys
     later by adding digits. */
  function orderAfter(prev){
    if(!prev) return 'a0';
    var len = prev.charCodeAt(0) - 96;
    var digits = (parseInt(prev.slice(1, 1 + len), 36) + 1).toString(36);
    if(digits.length > len) len = digits.length;
    while(digits.length < len) digits = '0' + digits;
    return String.fromCharCode(96 + len) + digits;
  }

  var SHAPES = {
    nodes:       {id: 'string', type: 'string', text: 'string', createdAt: 'string'},
    placements:  {id: 'string', node: 'string', thread: 'string', order: 'string', orderKind: 'string'},
    annotations: {id: 'string', node: 'string', kind: 'string', splits: 'boundaries'}
  };

  function isBoundaries(v){
    if(!Array.isArray(v)) return false;
    for(var i = 0; i < v.length; i++){
      if(typeof v[i] !== 'number' || v[i] !== Math.floor(v[i]) || v[i] < 1) return false;
      if(i && v[i] <= v[i - 1]) return false;
    }
    return true;
  }

  /* Every write of thread data passes here. Only the fields above are
     allowed, so a coordinate cannot be stored even by mistake. */
  function checkThreadRecord(store, rec){
    var shape = SHAPES[store];
    if(!shape) throw new Error('not a thread store: ' + store);
    var keys = Object.keys(rec);
    for(var i = 0; i < keys.length; i++){
      if(!shape[keys[i]]) throw new Error(store + ': field not allowed: ' + keys[i]);
    }
    for(var k in shape){
      var ok = shape[k] === 'boundaries' ? isBoundaries(rec[k]) : typeof rec[k] === shape[k];
      if(!ok) throw new Error(store + ': bad or missing field: ' + k);
    }
    return rec;
  }

  function boardNode(){
    return {id: BOARD_ID, type: 'board', text: 'Board', createdAt: ''};
  }
  /* One entry = one node + its placement on the board's time thread. */
  function entryRecords(id, text, prevOrder, now){
    return {
      node: {id: id, type: /\s/.test(text) ? 'sentence' : 'word', text: text, createdAt: now},
      placement: {id: 'p:' + id, node: id, thread: BOARD_ID, order: orderAfter(prevOrder), orderKind: 'sequence'}
    };
  }
  /* A manual regroup: boundaries as word indices. Order is not touched. */
  function regroupRecord(nodeId, splits){
    return {id: 'regroup:' + nodeId, node: nodeId, kind: 'regroup', splits: splits.slice()};
  }

  /* ── free drawing: its own layer, its own store ──
     A stroke is a line the person drew on the board. It is not part of any
     thread and no hill reads it. Points are board coordinates, flat:
     [x0, y0, x1, y1, …]. */
  var PEN = {color: '#e03131', width: 4};

  function strokeRecord(id, boardId, points){
    var flat = [];
    for(var i = 0; i < points.length; i++) flat.push(Math.round(points[i] * 10) / 10);
    return {id: id, board: boardId, points: flat, color: PEN.color, width: PEN.width};
  }
  function checkStroke(rec){
    var ok = rec && typeof rec.id === 'string' && typeof rec.board === 'string' &&
      typeof rec.color === 'string' && typeof rec.width === 'number' &&
      Array.isArray(rec.points) && rec.points.length >= 2 && rec.points.length % 2 === 0 &&
      rec.points.every(function(n){ return typeof n === 'number' && isFinite(n); });
    if(!ok) throw new Error('strokes: bad record');
    return rec;
  }
  function strokePath(points){
    var d = 'M' + points[0] + ' ' + points[1];
    if(points.length === 2) return d + 'L' + points[0] + ' ' + points[1];
    for(var i = 2; i < points.length; i += 2) d += 'L' + points[i] + ' ' + points[i + 1];
    return d;
  }

  var api = {
    HILL_W: HILL_W, HILL_H: HILL_H, CAPTION_H: CAPTION_H, ROW_LEN: ROW_LEN,
    ZOOM_MIN: ZOOM_MIN, ZOOM_MAX: ZOOM_MAX,
    clampZoom: clampZoom, zoomAt: zoomAt, toWorld: toWorld,
    placeOf: placeOf, fitCamera: fitCamera,
    seedOf: seedOf, seededRandom: seededRandom,
    BOARD_ID: BOARD_ID, orderAfter: orderAfter, checkThreadRecord: checkThreadRecord,
    boardNode: boardNode, entryRecords: entryRecords, regroupRecord: regroupRecord,
    PEN: PEN, strokeRecord: strokeRecord, checkStroke: checkStroke, strokePath: strokePath
  };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VBoardCore = api;
})(typeof self !== 'undefined' ? self : this);
