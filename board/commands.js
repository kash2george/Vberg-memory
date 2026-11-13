/* VBerg board — commands. The only code that writes data (rule 5). Each
   command builds plain records, checks them, and hands them to a store.
   The store is passed in, so the same commands run against IndexedDB in
   the browser and against a plain in-memory store in the tests. */
(function(root){
  'use strict';

  function create(store, C, now){
    var clock = now || function(){ return new Date().toISOString(); };

    return {
      load: function(){ return store.load(C.BOARD_ID); },

      /* A new entry: one node and its place at the end of the board's thread. */
      addEntry: function(id, text){
        return store.appendEntry(C.checkThreadRecord('nodes', C.boardNode()), function(prevOrder){
          var recs = C.entryRecords(id, text, prevOrder, clock());
          C.checkThreadRecord('nodes', recs.node);
          C.checkThreadRecord('placements', recs.placement);
          return recs;
        });
      },

      /* The person moved a boundary: keep it as the new home split. */
      regroup: function(nodeId, splits){
        return store.putAnnotation(C.checkThreadRecord('annotations', C.regroupRecord(nodeId, splits)));
      },

      /* Free drawing. Goes to the strokes store only; no thread record is
         read or written. */
      addStroke: function(id, points){
        return store.putStroke(C.checkStroke(C.strokeRecord(id, C.BOARD_ID, points)));
      },
      clearStrokes: function(){ return store.clearStrokes(C.BOARD_ID); }
    };
  }

  var api = {create: create};
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VBoardCommands = api;
})(typeof self !== 'undefined' ? self : this);
