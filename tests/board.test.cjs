const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, readdirSync} = require('node:fs');
const path = require('node:path');
const C = require('../board/core.js');
const Commands = require('../board/commands.js');

const boardDir = path.join(__dirname, '../board');
const read = file => readFileSync(path.join(boardDir, file), 'utf8');

// A plain in-memory store with the same interface as board/store.js, so the
// real commands run here exactly as they do against IndexedDB.
function memoryStore(){
  const db = {nodes: new Map(), placements: new Map(), annotations: new Map(), strokes: new Map()};
  const copy = v => JSON.parse(JSON.stringify(v));
  const thread = id => [...db.placements.values()].filter(p => p.thread === id)
    .sort((a, b) => a.order < b.order ? -1 : a.order > b.order ? 1 : 0);
  return {
    db,
    async load(boardId){
      return {
        entries: thread(boardId).map(p => ({
          placement: copy(p), node: copy(db.nodes.get(p.node)),
          regroup: db.annotations.has('regroup:' + p.node) ? copy(db.annotations.get('regroup:' + p.node)) : null
        })),
        strokes: [...db.strokes.values()].filter(s => s.board === boardId).map(copy)
      };
    },
    async appendEntry(board, makeRecords){
      const line = thread(board.id);
      const recs = makeRecords(line.length ? line[line.length - 1].order : null);
      db.nodes.set(board.id, copy(board));
      db.nodes.set(recs.node.id, copy(recs.node));
      db.placements.set(recs.placement.id, copy(recs.placement));
      return recs;
    },
    async putAnnotation(rec){ db.annotations.set(rec.id, copy(rec)); },
    async putStroke(rec){ db.strokes.set(rec.id, copy(rec)); },
    async clearStrokes(boardId){
      for(const [id, s] of db.strokes) if(s.board === boardId) db.strokes.delete(id);
    }
  };
}

const threadData = store => JSON.stringify(['nodes', 'placements', 'annotations']
  .map(name => [...store.db[name].values()]));

const sentences = [
  'Risk management helps organizations identify analyze and evaluate threats',
  'Vi lär oss att planera och följa rutiner som fungerar',
  'إدارة المخاطر تساعد المؤسسات على تحديد وتحليل وتقييم التهديدات',
  'cybersäkerhet', 'I like learning new words', 'This sentence is easy to remember',
  'Words become clearer with structure', 'I can move words across the hill',
  'Language becomes easier with practice', 'father'
];

async function filledBoard(){
  const store = memoryStore();
  const commands = Commands.create(store, C, () => '2026-11-13T00:00:00.000Z');
  for(let i = 0; i < sentences.length; i++) await commands.addEntry('n' + i, sentences[i]);
  return {store, commands};
}

// ── Done when 4 / rule 1: no coordinate in thread data ───────────────────

const COORDINATE_KEYS = /^(x|y|z|u|v|w|h|cx|cy|px|py|ox|oy|dx|dy|left|top|right|bottom|width|height|size|scale|zoom|pos|position|coord|coords|coordinates|points|track|trkIdx|radius|r|hp|shape)$/i;

function scan(value, where, problems){
  if(Array.isArray(value)) value.forEach((v, i) => scan(v, where + '[' + i + ']', problems));
  else if(value && typeof value === 'object'){
    for(const key of Object.keys(value)){
      if(COORDINATE_KEYS.test(key)) problems.push(where + '.' + key + ' (coordinate-like key)');
      scan(value[key], where + '.' + key, problems);
    }
  }else if(typeof value === 'number' && !/\.splits\[\d+\]$/.test(where)){
    problems.push(where + ' = ' + value + ' (number outside regroup boundaries)');
  }
}

test('stored thread data contains no x, y or size (rule 1)', async () => {
  const {store, commands} = await filledBoard();
  await commands.regroup('n0', [2, 5]);
  await commands.regroup('n3', [3, 6, 9]);
  await commands.addStroke('s1', [10.123, 20.5, 300, 420.75]);

  const problems = [];
  for(const name of ['nodes', 'placements', 'annotations']){
    for(const rec of store.db[name].values()) scan(rec, name + '(' + rec.id + ')', problems);
  }
  assert.deepEqual(problems, []);

  // exactly the fields of Spec §1b, nothing else
  for(const n of store.db.nodes.values()) assert.deepEqual(Object.keys(n).sort(), ['createdAt', 'id', 'text', 'type']);
  for(const p of store.db.placements.values()) assert.deepEqual(Object.keys(p).sort(), ['id', 'node', 'order', 'orderKind', 'thread']);
  for(const a of store.db.annotations.values()) assert.deepEqual(Object.keys(a).sort(), ['id', 'kind', 'node', 'splits']);
  assert.equal(store.db.placements.size, 10);
});

test('the write check refuses a coordinate or any extra field in thread data', () => {
  const node = {id: 'a', type: 'sentence', text: 'two words', createdAt: 't'};
  const placement = {id: 'p:a', node: 'a', thread: C.BOARD_ID, order: 'a0', orderKind: 'sequence'};
  assert.doesNotThrow(() => C.checkThreadRecord('nodes', node));
  assert.doesNotThrow(() => C.checkThreadRecord('placements', placement));
  for(const extra of [{x: 10}, {y: 10}, {size: 3}, {width: 680}, {left: '0px'}, {hp: {h: 3}}, {index: 2}]){
    assert.throws(() => C.checkThreadRecord('nodes', {...node, ...extra}), /not allowed/);
    assert.throws(() => C.checkThreadRecord('placements', {...placement, ...extra}), /not allowed/);
    assert.throws(() => C.checkThreadRecord('annotations', {id: 'r', node: 'a', kind: 'regroup', splits: [2], ...extra}), /not allowed/);
  }
  assert.throws(() => C.checkThreadRecord('placements', {...placement, order: 3}), /bad or missing/);
  assert.throws(() => C.checkThreadRecord('annotations', {id: 'r', node: 'a', kind: 'regroup', splits: [2.5]}), /bad or missing/);
  assert.throws(() => C.checkThreadRecord('annotations', {id: 'r', node: 'a', kind: 'regroup', splits: [3, 3]}), /bad or missing/);
  assert.throws(() => C.checkThreadRecord('strokes', {id: 's'}), /not a thread store/);
});

// ── Done when 2: ten entries, entry order, a reload keeps them ───────────

test('ten entries give ten places in entry order, and a reload keeps them', async () => {
  const {store} = await filledBoard();
  const first = await Commands.create(store, C).load();
  assert.deepEqual(first.entries.map(e => e.node.text), sentences);

  const orders = first.entries.map(e => e.placement.order);
  for(let i = 1; i < orders.length; i++) assert.ok(orders[i] > orders[i - 1], orders[i - 1] + ' < ' + orders[i]);
  assert.ok(first.entries.every(e => e.placement.thread === C.BOARD_ID && e.placement.orderKind === 'sequence'));
  assert.equal(first.entries[3].node.type, 'word');
  assert.equal(first.entries[0].node.type, 'sentence');

  // "reload": new commands over the same stored data
  const again = await Commands.create(store, C).load();
  assert.deepEqual(again, first);
});

test('adding an entry never rewrites an older order key (invariant 7)', async () => {
  const {store, commands} = await filledBoard();
  const before = [...store.db.placements.values()].map(p => p.id + '=' + p.order);
  await commands.addEntry('late', 'one more sentence here');
  const after = [...store.db.placements.values()].map(p => p.id + '=' + p.order);
  assert.deepEqual(after.slice(0, before.length), before);
  assert.equal((await commands.load()).entries.at(-1).node.id, 'late');
});

test('order keys keep sorting as plain strings for a long thread', () => {
  let key = null, prev = '';
  for(let i = 0; i < 20000; i++){
    key = C.orderAfter(key);
    assert.ok(key > prev, prev + ' < ' + key);
    prev = key;
  }
  assert.equal(C.orderAfter(null), 'a0');
  assert.equal(C.orderAfter('az'), 'b10');
});

test('a hill\'s place is a pure function of its order: rows of four, never overlapping', () => {
  const places = Array.from({length: 40}, (_, i) => C.placeOf(i));
  assert.deepEqual(C.placeOf(7), C.placeOf(7));
  for(let i = 0; i < places.length; i++){
    assert.equal(places[i].w, C.HILL_W);
    if(i % C.ROW_LEN) assert.ok(places[i].x >= places[i - 1].x + places[i - 1].w, 'next in the row sits to the right');
    else if(i) assert.ok(places[i].y >= places[i - 1].y + places[i - 1].h, 'next row sits below');
  }
  assert.equal(places[4].x, places[0].x);
});

test('a regroup stores boundaries only and leaves order and text alone', async () => {
  const {store, commands} = await filledBoard();
  const nodes = JSON.stringify([...store.db.nodes.values()]);
  const placements = JSON.stringify([...store.db.placements.values()]);
  await commands.regroup('n0', [2, 5]);
  await commands.regroup('n0', [3, 6]);       // a second regroup replaces the first
  assert.equal(JSON.stringify([...store.db.nodes.values()]), nodes);
  assert.equal(JSON.stringify([...store.db.placements.values()]), placements);
  assert.deepEqual([...store.db.annotations.values()], [{id: 'regroup:n0', node: 'n0', kind: 'regroup', splits: [3, 6]}]);
  assert.deepEqual((await commands.load()).entries[0].regroup.splits, [3, 6]);
});

// ── Done when 3: the drawing layer never changes a hill ──────────────────

test('drawing, and clearing the drawing, leaves all thread data unchanged', async () => {
  const {store, commands} = await filledBoard();
  await commands.regroup('n1', [3, 7]);
  const before = threadData(store);

  await commands.addStroke('s1', [0, 0, 120.44, 80.06, 300, 10]);
  await commands.addStroke('s2', [5, 5]);
  assert.equal(threadData(store), before);
  assert.equal(store.db.strokes.size, 2);
  assert.deepEqual((await commands.load()).strokes[0],
    {id: 's1', board: C.BOARD_ID, points: [0, 0, 120.4, 80.1, 300, 10], color: C.PEN.color, width: C.PEN.width});

  await commands.clearStrokes();
  assert.equal(threadData(store), before);
  assert.equal(store.db.strokes.size, 0);
  assert.equal((await commands.load()).entries.length, 10);
});

test('strokes are checked too, and are the only records that hold coordinates', () => {
  assert.throws(() => C.checkStroke(C.strokeRecord('s', C.BOARD_ID, [1])), /bad record/);
  assert.throws(() => C.checkStroke(C.strokeRecord('s', C.BOARD_ID, [1, NaN])), /bad record/);
  assert.equal(C.strokePath([1, 2]), 'M1 2L1 2');
  assert.equal(C.strokePath([1, 2, 3, 4]), 'M1 2L3 4');
});

// ── hill shape: from the node ID, stable, never stored ───────────────────

test('hill shape numbers come from the node ID: same ID same shape, on every run', () => {
  const draw = id => { const r = C.seededRandom(C.seedOf(id)); return [r(), r(), r(), r()]; };
  assert.deepEqual(draw('18331012-0126-4d0e-ad37-a3720cf0e8b6'), draw('18331012-0126-4d0e-ad37-a3720cf0e8b6'));
  assert.notDeepEqual(draw('n1'), draw('n2'));
  assert.ok(draw('n1').every(n => n >= 0 && n < 1));
  assert.equal(C.seedOf('n1'), 70638592);      // fixed across machines and runs (invariant 6)
});

// ── Done when 6: board and input usable on a phone held upright ──────────

test('on an upright phone every hill fits the screen, and zoom keeps the pinched point still', () => {
  for(const [vw, vh] of [[320, 480], [360, 640], [390, 664], [430, 780]]){     // board area above the input
    for(const i of [0, 3, 4, 9, 37]){
      const place = C.placeOf(i), cam = C.fitCamera(place, vw, vh);
      const left = cam.x + place.x * cam.z, top = cam.y + place.y * cam.z;
      assert.ok(left >= 0 && left + place.w * cam.z <= vw, 'hill ' + i + ' inside width ' + vw);
      assert.ok(top >= 0 && top + place.h * cam.z <= vh, 'hill ' + i + ' inside height ' + vh);
      assert.ok(cam.z > C.ZOOM_MIN && cam.z <= 1);
    }
  }
  const cam = {x: 40, y: -30, z: 0.5}, before = C.toWorld(cam, 200, 300);
  const after = C.toWorld(C.zoomAt(cam, 200, 300, 1.8), 200, 300);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
  assert.equal(C.zoomAt(cam, 0, 0, 1e9).z, C.ZOOM_MAX);
  assert.equal(C.zoomAt(cam, 0, 0, 1e-9).z, C.ZOOM_MIN);
});

test('the board page has no portrait lock and keeps the input on screen', () => {
  const html = read('index.html');
  assert.ok(!/orientation\s*:\s*portrait/.test(html), 'no "rotate your device" rule');
  assert.ok(!/rotate-msg/.test(html));
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, interactive-widget=resizes-content">/);
  assert.match(html, /<textarea id="inp"/);
  assert.match(read('board.js'), /visualViewport/);
});

// ── no second engine ─────────────────────────────────────────────────────

test('the board loads the site\'s engine and defines no split, layout or drawing of its own', () => {
  const html = read('index.html');
  assert.match(html, /<script src="\.\.\/assets\/vberg-engine\.js"><\/script>/);
  const engine = readFileSync(path.join(__dirname, '../assets/vberg-engine.js'), 'utf8');
  const engineFunctions = [...engine.matchAll(/^function ([A-Za-z_]\w*)\(/gm)].map(m => m[1]);
  assert.ok(engineFunctions.includes('split') && engineFunctions.includes('computeLayout') && engineFunctions.includes('render'));
  for(const file of readdirSync(boardDir).filter(f => f.endsWith('.js'))){
    const source = read(file);
    for(const name of engineFunctions){
      assert.ok(!new RegExp('function\\s+' + name + '\\s*\\(').test(source), file + ' must not redefine ' + name + '()');
    }
  }
  // every engine entry point the board uses really is the engine's
  const hills = read('hills.js') + read('board.js');
  for(const name of ['setThread', 'render', 'tryMove', 'doBtn', 'hitBox', 'hitBtn', 'nearestGroup', 'canvasXY']){
    assert.ok(engineFunctions.includes(name) && new RegExp('\\b' + name + '\\(').test(hills), name);
  }
});

// ── out of scope here, tracked elsewhere ─────────────────────────────────

test('Arabic sentence draws right to left', {todo: 'VB-46: RTL comes from the shared engine, not from the board'}, () => {});
test('portrait hill: taller and narrower, one word per line', {todo: 'VB-50: arrives with the shared engine'}, () => {});
