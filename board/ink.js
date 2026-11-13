/* VBerg board — free drawing layer. An SVG above the hills. It knows
   nothing about threads or hills and never draws on a hill's canvas, so
   hiding or clearing it cannot change a hill. */
var VBoardInk = (function(){
  'use strict';
  var C = VBoardCore;
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.getElementById('ink');
  var live = null;             /* the stroke being drawn: {path, points} */

  function addPath(points, color, width){
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', width);
    path.setAttribute('d', C.strokePath(points));
    svg.appendChild(path);
    return path;
  }

  return {
    /* strokes loaded from the device */
    show: function(strokes){
      strokes.forEach(function(s){ addPath(s.points, s.color, s.width); });
    },
    begin: function(x, y){
      live = {points: [x, y], path: addPath([x, y], C.PEN.color, C.PEN.width)};
    },
    extend: function(x, y, minStep){
      if(!live) return;
      var p = live.points, n = p.length;
      if(Math.hypot(x - p[n - 2], y - p[n - 1]) < minStep) return;
      p.push(x, y);
      live.path.setAttribute('d', C.strokePath(p));
    },
    /* returns the finished stroke's points, or null */
    end: function(keep){
      var done = live;
      live = null;
      if(!done) return null;
      if(!keep){ svg.removeChild(done.path); return null; }
      return done.points;
    },
    drawing: function(){ return !!live; },
    clear: function(){ live = null; while(svg.firstChild) svg.removeChild(svg.firstChild); },
    setHidden: function(hidden){ svg.classList.toggle('hidden', hidden); },
    hidden: function(){ return svg.classList.contains('hidden'); },
    count: function(){ return svg.childNodes.length; }
  };
})();
