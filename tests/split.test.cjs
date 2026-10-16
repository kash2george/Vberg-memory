const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {createHash} = require('node:crypto');
const vm = require('node:vm');
const source = readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const acceptance = 'Risk management helps organizations identify analyze and evaluate threats';
const swedish = 'Vi lär oss att planera och följa rutiner som fungerar';

// Execute the actual splitter and UI handlers with drawing/DOM effects stubbed.
function app(){
  const elements = {inp:{value:''}, sentOut:{textContent:''}};
  const c = vm.createContext({
    state:{words:[], splits:[], G:3, charMode:false}, drag:{active:false},
    _wordMemory:[], _firstInput:true, DBG_GROUP_PX:[], DBG_GROUP_OX:[],
    isDark:false, noColor:false, renders:0, randomCalls:0,
    document:{getElementById:id=>elements[id]},
    render(){c.renders++;}, randomHP(){c.randomCalls++;},
    buildGroupPXSliders(){}, exitPractice(){}
  });
  vm.runInContext(source.slice(source.indexOf('var VOWELS'), source.indexOf('/* ── faces')) +
    source.slice(source.indexOf('function groupOf('), source.indexOf('var COMMON_WORDS')) +
    source.slice(source.indexOf('var COMMON_WORDS'), source.indexOf('function wordFontSize')) +
    source.slice(source.indexOf('function doBtn('), source.indexOf('var tip=')) +
    source.slice(source.indexOf('function go('), source.indexOf("document.getElementById('inp').addEventListener('keydown'")), c);
  c.submit = text=>{elements.inp.value=text;c.go();};
  c.groups = ()=>JSON.parse(JSON.stringify(c.getGroupArrays().map(g=>g.map(i=>c.state.words[i]).join(c.state.charMode?'':' '))));
  return c;
}

test('acceptance list stays together; user regroup takes precedence over redraw', ()=>{
  const c=app();c.submit(acceptance);
  assert(c.groups().includes('identify analyze and evaluate'));
  const before=JSON.stringify(c.state.splits);
  c.tryMove(4,1); // Deliberately split the suggested list by moving its edge.
  assert.notEqual(JSON.stringify(c.state.splits),before);
  const manual=JSON.stringify(c.state.splits);
  c.doBtn('dark');c.doBtn('color');
  assert.equal(JSON.stringify(c.state.splits),manual);
  assert.equal(c.state.words.join(' '),acceptance);
});

test('Swedish clause starts are cheap, coordinated och list stays together', ()=>{
  const c=app();c.submit(swedish);
  assert.equal(c.state.words.join(' '),swedish);
  assert(c.groups().some(g=>g.includes('planera och följa')));
  const words='Vi lär oss att planera och följa rutiner som fungerar'.split(' ');
  const costs=c.sentenceCutCosts(words);
  assert.equal(costs[3],0); // att
  assert.equal(costs[8],0); // som
  assert.equal(c.sentenceCutCosts('Vi planerar och vi lär'.split(' '))[2],0);
});

test('comma lists with and without a conjunction resist internal cuts', ()=>{
  const c=app();
  for(const phrase of ['identify, analyze, and evaluate', 'identify, analyze, evaluate']){
    c.submit('We '+phrase+' risks before taking action');
    assert(c.groups().some(g=>g.includes(phrase)));
  }
});

test('Groups fixes G, cycles 3/4/5, and submit returns to automatic choice', ()=>{
  const c=app();c.submit(acceptance);
  let expected=c.state.G;
  for(let i=0;i<9;i++){
    expected=expected>=5?3:expected+1;
    c.doBtn('groups');
    assert.equal(c.state.G,expected);
    assert.equal(c.state.splits.length,expected-1);
    assert.equal(c.state.words.join(' '),acceptance);
  }
  c.submit(acceptance);
  assert.equal(c.state.G,c.split(acceptance.split(' '),true).G);
});

function boundaries(chunks){let p=0;return Array.from(chunks.slice(0,-1),g=>p+=g.length);}

test('automatic and fixed-G sentence results minimize the specified score', ()=>{
  const c=app();
  for(const text of [acceptance,swedish]){
    const words=text.split(' '), costs=c.sentenceCutCosts(words);
    function score(cuts){
      const edges=[0,...cuts,words.length], sizes=edges.slice(1).map((x,i)=>x-edges[i]);
      const mean=words.length/sizes.length;
      return Math.sqrt(sizes.reduce((s,n)=>s+(n-mean)**2,0)/sizes.length) +
        1.5*Math.abs(sizes[0]-sizes.at(-1)) + cuts.reduce((s,i)=>s+costs[i],0) + .15*(sizes.length-3);
    }
    const minima={3:Infinity,4:Infinity,5:Infinity};
    // Independent enumeration via boundary bit masks, rather than the production recursion.
    for(let mask=0;mask<2**(words.length-1);mask++){
      const cuts=[];
      for(let i=1;i<words.length;i++)if(mask & (1<<(i-1)))cuts.push(i);
      const G=cuts.length+1;
      if(G>=3&&G<=5)minima[G]=Math.min(minima[G],score(cuts));
    }
    for(const G of [3,4,5,undefined]){
      const result=c.split(words,true,G);
      const best=G?minima[G]:Math.min(...Object.values(minima));
      assert(Math.abs(score(boundaries(result.chunks))-best)<1e-10);
    }
  }
});

test('2 and 3 word inputs never create empty or excess groups, including Groups presses', ()=>{
  const c=app();
  for(const text of ['two words','one two three']){
    c.state.G=5;c.submit(text);
    for(let i=0;i<6;i++){
      assert.equal(c.state.G,text.split(' ').length);
      assert(c.groups().every(Boolean));
      c.doBtn('groups');
    }
  }
});

test('same input gives same contiguous groups regardless of previous G', ()=>{
  const c=app();
  for(const text of [acceptance,swedish,'We learn because practice makes difficult ideas easier to remember']){
    c.submit(text);const expected=c.groups();
    for(const G of [3,4,5]){
      c.state.G=G;c.submit(text);
      assert.deepEqual(c.groups(),expected);
      assert.equal(c.groups().join(' '),text);
    }
  }
  for(let n=2;n<=15;n++){
    const words=Array.from({length:n},(_,i)=>'item'+i);
    for(const G of [undefined,3,4,5]){
      const result=c.split(words,true,G);
      assert(result.G<=n);
      assert(result.chunks.every(g=>g.length>0));
      assert.deepEqual(Array.from(result.chunks.flat()),words);
    }
  }
});

test('initial page load uses the same automatic split as submit', ()=>{
  for(const text of [acceptance,swedish,'two words','one two three','computer']){
    const c=app();
    c.document.fonts={ready:{then:fn=>fn()}};
    c.window={location:{search:'?text='+encodeURIComponent(text)}};
    c.URLSearchParams=URLSearchParams;
    c.EXAMPLES=[text];c.setTimeout=fn=>fn();
    vm.runInContext(source.slice(source.indexOf('document.fonts.ready.then'), source.indexOf('</script>', source.indexOf('document.fonts.ready.then'))),c);
    const loaded=c.groups();c.submit(text);
    assert.deepEqual(c.groups(),loaded);
    // Also exercise a random-example initial load (no URL parameter).
    c.window.location.search='';
    vm.runInContext(source.slice(source.indexOf('document.fonts.ready.then'), source.indexOf('</script>', source.indexOf('document.fonts.ready.then'))),c);
    assert.deepEqual(c.groups(),loaded);
  }
});

test('default single-word splitting matches the original test-branch corpus', ()=>{
  const c=app();
  const words=['a','test','computer','structure','learning','organizations','riskhantering','åäö','rhythms','identification','abcdefghijklmnopqrstuvwxy'];
  for(let i=0;i<3000;i++){
    let x=i,w='';
    for(let j=0;j<1+i%25;j++){x=(x*1664525+1013904223)>>>0;w+='abcdeiouåäöxyz'[x%14];}
    words.push(w);
  }
  // Generated from unmodified 39e28f5, not from the new implementation.
  const digest=createHash('sha256').update(JSON.stringify(words.map(w=>c.splitSingleWord(w)))).digest('hex');
  assert.equal(digest,'80e659d12ececb4fd88640fd566541833f00831a05d69815ad34bc0773d34512');
});
