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

  var api = {
    HILL_W: HILL_W, HILL_H: HILL_H, CAPTION_H: CAPTION_H, ROW_LEN: ROW_LEN,
    ZOOM_MIN: ZOOM_MIN, ZOOM_MAX: ZOOM_MAX,
    clampZoom: clampZoom, zoomAt: zoomAt, toWorld: toWorld,
    placeOf: placeOf, fitCamera: fitCamera,
    seedOf: seedOf, seededRandom: seededRandom
  };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VBoardCore = api;
})(typeof self !== 'undefined' ? self : this);
