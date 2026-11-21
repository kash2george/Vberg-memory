const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { chromium } = require('playwright');

const cases = {
  English: 'Risk management helps organizations identify analyze and evaluate threats',
  Swedish: 'Vi lär oss att planera och följa rutiner som fungerar',
  Arabic: 'نتعلم اليوم كيف نرتب الكلمات في مجموعات صغيرة',
  'Arabic acceptance': 'حلل الافكار عشان ما يصير في لخبطة ونكمل روية',
  'long word': 'internationalisering',
  'one-word groups': 'red blue green white black',
  'twelve words': 'We write down our ideas and share them with the whole team',
  'twenty words': 'Every morning our team reviews the plan and checks the results before we share new ideas with our colleagues together'
};

// Cover each normal sentence length, including forced one-group stacks.
for(let count = 2; count < 12; count++){
  cases[count + ' words'] = cases['twelve words'].split(' ').slice(0, count).join(' ');
}

async function openPage(browser, board, width){
  const page = await browser.newPage({viewport:{width, height:width === 375 ? 667 : 720}, reducedMotion:'reduce'});
  const url = pathToFileURL(path.resolve(__dirname, '..', board ? 'board/index.html' : 'index.html'));
  url.searchParams.set('text', 'ready');
  await page.goto(url.href);
  await page.evaluate(() => document.fonts.ready);
  if(board) await page.evaluate(() => VBoard.ready);
  else await page.waitForFunction(() => state.words.join('') === 'ready');
  // Record the final canvas draw, using the real font and CanvasRenderingContext2D.
  // The board's camera scales a 680px canvas even at a 375px viewport.
  await page.evaluate(() => {
    const original = drawBox;
    window.drawn = [];
    drawBox = function(x, y, w, h, label, col, fs, alpha){
      original(x, y, w, h, label, col, fs, alpha);
      ctx.save();
      ctx.font = fs + 'px ' + FONT;
      const textWidth = ctx.measureText(label).width;
      ctx.restore();
      drawn.push({x,y,w,h,label,fs,textWidth,gi:COLS.indexOf(col)});
    };
  });
  return page;
}

async function drawCase(page, board, text, G){
  return page.evaluate(({board, text, G}) => {
    let hill;
    if(board) hill = VBoard.addEntry(text);
    else {
      document.getElementById('inp').value = text;
      go();
    }
    function capture(shape){
      if(shape) HP = shape;
      const word = !text.includes(' ');
      const splitResult = word ? splitSingleWord(text, G) : split(text.split(' '), true, G);
      applySplit(splitResult);
      drawn.length = 0;
      render();
      const rect = cv.getBoundingClientRect();
      const screenScale = rect.width / L.CW;
      return {
        boxes:drawn.slice(), chunks:splitResult.chunks, word,
        units:word ? splitResult.chunks.map(microSyllables) : splitResult.chunks,
        groups:state.G, onScreenWidth:rect.width, screenScale,
        width:L.CW, height:L.CH, centers:groupCircles, pitch:GROUP_LAYOUT.LINE_PITCH,
        dxMin:GROUP_LAYOUT.DX_MIN, dxMax:GROUP_LAYOUT.DX_MAX,
        portrait:matchMedia('(orientation: portrait)').matches
      };
    }
    // Exercise the actual site/seeded board hill, plus the narrowest and widest
    // aspect ratios randomHP can produce. Shape changes are local to this test.
    function captureShapes(){
      return [null, {h:2.7, a:2.7*0.88, k:-0.2}, {h:3.8, a:3.8*1.16, k:0.2}].map(capture);
    }
    if(!board) return captureShapes();
    let result;
    VBoardHills.run(hill, () => { result = captureShapes(); });
    return result;
  }, {board, text, G});
}

function checkFrame(frame, text, G, crowded, description){
  const {boxes, centers, chunks, word} = frame;
  assert.equal(frame.groups, G, description);
  assert.ok(frame.onScreenWidth > 0 && frame.screenScale > 0, description);
  assert.equal(chunks.flat().join(word ? '' : ' '), text, description);
  const summaries = [];
  for(let i = 0; i < boxes.length; i++){
    const a = boxes[i];
    assert.ok(a.fs >= 10 && a.textWidth <= a.w, description + ' font or text overflow');
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= frame.width && a.y + a.h <= frame.height, description + ' off canvas');
    for(const b of boxes.slice(i + 1)){
      // Include half of the 1.5px box outline on both sides.
      const intersects = a.x < b.x+b.w+1.5 && b.x < a.x+a.w+1.5 &&
                         a.y < b.y+b.h+1.5 && b.y < a.y+a.h+1.5;
      assert.ok(!intersects, description + ': ' + a.label + ' overlaps ' + b.label);
    }
  }
  assert.deepEqual(boxes.map(b => b.gi), boxes.map(b => b.gi).sort((a,b) => a-b), description + ' group order');
  for(let gi = 0; gi < G; gi++){
    const group = boxes.filter(b => b.gi === gi);
    assert.ok(group.length, description + ' missing group ' + gi);
    const compact = group.find(b => / \+\d+$/.test(b.label));
    if(compact){
      assert.ok(crowded, description + ' unexpected fallback: ' + compact.label);
      assert.equal(group.length, 1, description);
      assert.equal(compact.fs, 10, description);
      assert.equal(compact.label, chunks[gi][0] + ' +' + (chunks[gi].length - 1), description);
      summaries.push(compact.label);
      continue;
    }
    const labels = group.map(b => b.label);
    assert.deepEqual(labels, frame.units[gi], description + ' readable unit order');

    const peak = (G === 4 && (gi === 1 || gi === 2)) || ((G === 3 || G === 5) && gi === Math.floor(G/2));
    const first = group[0], last = group.at(-1);
    const isArc = peak && !frame.portrait && group.length > 1 && Math.abs(first.y - group[1].y) < first.h;
    if(isArc){
      for(let i=1; i<group.length; i++) assert.ok(group[i].x >= group[i-1].x + group[i-1].w, description + ' peak order');
      assert.ok(group[Math.floor(group.length/2)].y <= first.y, description + ' peak rise');
    }else{
      const cx = b => b.x + b.w / 2;
      const cy = b => b.y + b.h / 2;
      assert.ok(Math.abs((cx(first)+cx(last))/2 - centers[gi].cx) < 0.01, description + ' stack x');
      assert.ok(Math.abs((cy(first)+cy(last))/2 - centers[gi].cy) < 0.01, description + ' stack y');
      for(let i=1; i<group.length; i++){
        const dx = cx(group[i]) - cx(group[i-1]);
        const dy = cy(group[i]) - cy(group[i-1]);
        assert.ok(dx >= frame.dxMin - 0.001 && dx <= frame.dxMax + 0.001, description + ' dx');
        const direction = gi < G/2 ? -1 : 1;
        assert.ok(Math.abs(direction * dy - first.h * frame.pitch) < 0.001, description + ' line spacing');
      }
    }
  }
  return summaries;
}

test('Chromium draws ordered, disjoint readable units on the site and the board', async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  await t.test('wheel keeps the boxes in place and middle-drag moves the group', async () => {
    const page = await openPage(browser, false, 800);
    try {
      await drawCase(page, false, cases['Arabic acceptance'], 4);
      const point = await page.evaluate(() => {
        const {cx,cy,R} = groupCircles[1], rect = cv.getBoundingClientRect();
        return {x:rect.left + cx, y:rect.top + cy, cx, radius:R, boxes:wordBoxes};
      });
      await page.mouse.move(point.x, point.y);
      await page.mouse.wheel(0, -100);
      await page.waitForFunction(r => groupCircles[1].R > r, point.radius);
      assert.deepEqual(await page.evaluate(() => wordBoxes), point.boxes);
      await page.mouse.down({button:'middle'});
      await page.mouse.move(point.x + 12, point.y);
      await page.mouse.up({button:'middle'});
      assert.ok(await page.evaluate(x => groupCircles[1].cx > x, point.cx));
      assert.equal(await page.evaluate(() => state.words.join(' ')), cases['Arabic acceptance']);
    } finally { await page.close(); }
  });
  await t.test('restored board character offsets and syllable drags keep whole units', async () => {
    const page = await openPage(browser, true, 800);
    try {
      const result = await page.evaluate(() => {
        const h = VBoard.addEntry('internationalisering');
        VBoardHills.applySplits(h, [5, 12]);
        return VBoardHills.run(h, () => {
          const before = getGroupArrays().map(indices => indices.map(i => state.words[i]));
          const wi = state.splits[0] - 1, syllable = state.words[wi];
          const box = wordBoxes.find(b => b.wi === wi);
          const hit = hitBox(box.x + box.w/2, box.y + box.h/2);
          tryMove(hit.wi, 1);
          render();
          return {before, syllable, after:getGroupArrays().map(indices => indices.map(i => state.words[i])),
                  drawn:wordBoxes.map(b => b.label)};
        });
      });
      assert.deepEqual(result.before.map(group => group.join('')), ['inter', 'nationa', 'lisering']);
      assert.ok(result.syllable.length > 1);
      assert.equal(result.after[1][0], result.syllable);
      assert.deepEqual(result.after.flat(), result.before.flat());
      assert.deepEqual(result.drawn, result.before.flat());
    } finally { await page.close(); }
  });
  for(const board of [false, true]){
    for(const width of [1200, 375]){
      const surface = (board ? 'board' : 'site') + ' ' + width + 'px';
      await t.test(surface, async () => {
        const page = await openPage(browser, board, width);
        try {
          for(const [name,text] of Object.entries(cases)){
            const maxG = text.includes(' ') ? Math.min(5, text.split(' ').length) : 5;
            for(let G=1; G<=maxG; G++){
              const frames = await drawCase(page, board, text, G);
              const description = surface + ', ' + name + ', G=' + G;
              const fallbacks = new Set();
              for(const frame of frames){
                assert.ok(frame.onScreenWidth <= width + 1, description + ' outside viewport');
                const summaries = checkFrame(frame, text, G, name === 'twenty words', description);
                for(const label of summaries) fallbacks.add(label);
              }
              if(fallbacks.size) t.diagnostic(description + ' → ' + [...fallbacks].join(', '));
            }
          }
        } finally { await page.close(); }
      });
    }
  }
});
