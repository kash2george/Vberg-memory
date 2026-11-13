/* VBerg board — storage on the device (IndexedDB). No server, no sync.
   Stores mirror Spec §1b: nodes, placements, annotations. Only
   commands.js calls this file. */
var VBoardStore = (function(){
  'use strict';
  var DB_NAME = 'vberg-board', DB_VERSION = 1;
  var opening = null;

  function open(){
    if(opening) return opening;
    opening = new Promise(function(resolve, reject){
      if(typeof indexedDB === 'undefined'){ reject(new Error('IndexedDB is not available')); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(){
        var db = req.result;
        if(!db.objectStoreNames.contains('nodes')) db.createObjectStore('nodes', {keyPath: 'id'});
        if(!db.objectStoreNames.contains('placements')){
          var p = db.createObjectStore('placements', {keyPath: 'id'});
          p.createIndex('thread_order', ['thread', 'order']);   /* draw a thread in one range query */
          p.createIndex('node', 'node');                        /* every thread through a point */
        }
        if(!db.objectStoreNames.contains('annotations')){
          db.createObjectStore('annotations', {keyPath: 'id'}).createIndex('node', 'node');
        }
      };
      req.onsuccess = function(){
        var db = req.result;
        db.onversionchange = function(){ db.close(); opening = null; };
        resolve(db);
      };
      req.onerror = function(){ reject(req.error); };
      req.onblocked = function(){ reject(new Error('storage is blocked by another tab')); };
    });
    opening.catch(function(){ opening = null; });
    return opening;
  }

  /* Run fn(tx) in one transaction; resolves with fn's result on commit. */
  function transact(stores, mode, fn){
    return open().then(function(db){
      return new Promise(function(resolve, reject){
        var tx = db.transaction(stores, mode), out;
        tx.oncomplete = function(){ resolve(out); };
        tx.onerror = tx.onabort = function(){ reject(tx.error || new Error('storage write failed')); };
        out = fn(tx);
      });
    });
  }

  function threadRange(thread){
    return IDBKeyRange.bound([thread, ''], [thread, '￿']);
  }

  /* Everything on one board: its entries in thread order, each with its
     regroup annotation if any. */
  function load(boardId){
    var entries = [];
    return transact(['nodes', 'placements', 'annotations'], 'readonly', function(tx){
      var nodes = tx.objectStore('nodes'), notes = tx.objectStore('annotations');
      tx.objectStore('placements').index('thread_order').getAll(threadRange(boardId)).onsuccess = function(e){
        e.target.result.forEach(function(placement, i){
          var entry = {placement: placement, node: null, regroup: null};
          entries[i] = entry;
          nodes.get(placement.node).onsuccess = function(ev){ entry.node = ev.target.result || null; };
          notes.get('regroup:' + placement.node).onsuccess = function(ev){ entry.regroup = ev.target.result || null; };
        });
      };
    }).then(function(){
      return {entries: entries.filter(function(e){ return e.node; })};
    });
  }

  /* Append one entry to a thread. The last order key is read inside the
     same transaction, so two tabs cannot hand out the same place. */
  function appendEntry(board, makeRecords){
    return transact(['nodes', 'placements'], 'readwrite', function(tx){
      var nodes = tx.objectStore('nodes'), placements = tx.objectStore('placements');
      var out = {};
      placements.index('thread_order').openCursor(threadRange(board.id), 'prev').onsuccess = function(e){
        var cursor = e.target.result;
        var recs = makeRecords(cursor ? cursor.value.order : null);
        nodes.put(board);
        nodes.put(recs.node);
        placements.put(recs.placement);
        out.node = recs.node; out.placement = recs.placement;
      };
      return out;
    });
  }

  function putAnnotation(rec){
    return transact(['annotations'], 'readwrite', function(tx){ tx.objectStore('annotations').put(rec); });
  }

  return {open: open, load: load, appendEntry: appendEntry, putAnnotation: putAnnotation};
})();
