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

test('equality wins over list preservation; manual regroup still overrides filters', ()=>{
  const c=app();c.submit(acceptance);
  assert.deepEqual(c.groups(),['Risk management helps','organizations identify analyze','and evaluate threats']);
  const before=JSON.stringify(c.state.splits);
  c.tryMove(2,1);c.tryMove(1,1); // Two edge moves deliberately create a singleton.
  assert.notEqual(JSON.stringify(c.state.splits),before);
  assert.equal(c.groups()[0],'Risk');
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

test('punctuation pauses are cheap; detected lists retain cost 8 but yield to equality', ()=>{
  const c=app();
  for(const mark of [',',';',':','.','!','?']){
    assert.equal(c.sentenceCutCosts(['We','pause'+mark,'then','continue'])[2],0);
  }
  assert.equal(c.sentenceCutCosts(['We','pause','then','continue'])[2],1);
  for(const phrase of ['identify, analyze, and evaluate', 'identify, analyze, evaluate']){
    const words=('We '+phrase+' risks before taking action').split(' ');
    const costs=c.sentenceCutCosts(words);
    assert.equal(costs[2],8); // Comma-list protection overrides the punctuation pause.
    assert.equal(costs[3],8);
    c.submit(words.join(' '));
    assert(c.groups().every(g=>g.split(' ').length>=2));
    assert.equal(c.groups().join(' '),words.join(' '));
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

test('automatic and fixed G minimize the score within filters, or all candidates if none pass', ()=>{
  const c=app();
  const samples=[acceptance,swedish,
    'Browser checks passed, including Swedish and short inputs.',
    'Identify, classify, assess, treat and monitor risks in the organisation',
    'Monday Tuesday Wednesday Thursday Friday Saturday Sunday',
    'Vi granskar resultaten, förklarar riskerna och följer planen som fungerar',
    ...Array.from({length:14},(_,i)=>Array.from({length:i+2},(_,j)=>'item'+j).join(' '))];
  for(const text of samples){
    const words=text.split(' '), costs=c.sentenceCutCosts(words);
    function candidate(cuts){
      const edges=[0,...cuts,words.length], sizes=edges.slice(1).map((x,i)=>x-edges[i]);
      const mean=words.length/sizes.length;
      const edge=(sizes[0]+sizes.at(-1))/2;
      const middle=sizes.slice(1,-1);
      const score=Math.sqrt(sizes.reduce((s,n)=>s+(n-mean)**2,0)/sizes.length) +
        1.5*Math.abs(sizes[0]-sizes.at(-1)) + cuts.reduce((s,i)=>s+costs[i],0) + .15*(sizes.length-3) +
        middle.reduce((s,n)=>s+1.5*(n<edge?edge-n:Math.max(0,n-edge-1)),0) +
        (words.length>=6?2*sizes.filter(n=>n===1).length:0);
      const allowed=(words.length<6||sizes.every(n=>n>1)) && middle.every(n=>n<=edge+2);
      return {score,allowed};
    }
    const minima={}, allowedMinima={};
    const minG=Math.min(3,words.length), maxG=Math.min(5,words.length);
    for(let G=minG;G<=maxG;G++){minima[G]=Infinity;allowedMinima[G]=Infinity;}
    // Independent enumeration via boundary bit masks, rather than the production recursion.
    for(let mask=0;mask<2**(words.length-1);mask++){
      const cuts=[];
      for(let i=1;i<words.length;i++)if(mask & (1<<(i-1)))cuts.push(i);
      const G=cuts.length+1;
      if(G>=minG&&G<=maxG){
        const {score,allowed}=candidate(cuts);
        minima[G]=Math.min(minima[G],score);
        if(allowed)allowedMinima[G]=Math.min(allowedMinima[G],score);
      }
    }
    for(const G of [3,4,5,undefined]){
      const result=c.split(words,true,G);
      const selectedG=G?Math.min(G,words.length):undefined;
      const filtered=G?allowedMinima[selectedG]:Math.min(...Object.values(allowedMinima));
      const best=Number.isFinite(filtered)?filtered:(G?minima[selectedG]:Math.min(...Object.values(minima)));
      const actual=candidate(boundaries(result.chunks));
      assert(Math.abs(actual.score-best)<1e-10,`${text}, G=${G}`);
      if(Number.isFinite(filtered))assert(actual.allowed);
      if(selectedG)assert.equal(result.G,selectedG);
      else assert(result.G>=minG && result.G<=maxG);
      assert.equal(result.chunks.length,result.G);
      assert(result.chunks.every(g=>g.length>0));
      assert.deepEqual(Array.from(result.chunks.flat()),words);
    }
  }
});

test('filters reject oversized middles and singleton lines, and fixed G=5 still returns six words', ()=>{
  const c=app();
  function groups(sizes){return sizes.map(n=>Array(n).fill('word'));}
  assert.equal(c.sentenceGroupsAllowed(groups([1,6,1]),8),false);
  assert.equal(c.sentenceGroupsAllowed(groups([2,5,2]),9),false);
  assert.equal(c.sentenceGroupsAllowed(groups([2,4,2]),8),true);
  assert.equal(c.sentenceGroupsAllowed(groups([1,2,1]),4),true);
  const words='one two three four five six'.split(' ');
  const result=c.split(words,true,5);
  assert.equal(result.G,5);
  assert(result.chunks.every(g=>g.length>0));
  assert.deepEqual(Array.from(result.chunks.flat()),words);
  c.submit(words.join(' '));
  c.doBtn('groups');c.doBtn('groups');
  assert.equal(c.state.G,5);
  assert.equal(c.groups().length,5);
  assert(c.groups().every(Boolean));
  assert.equal(c.groups().join(' '),words.join(' '));
});

test('Browser, weekday and Swedish regression results match the new priority', ()=>{
  const c=app();
  c.submit('Browser checks passed, including Swedish and short inputs.');
  assert.deepEqual(c.groups(),['Browser checks passed,','including Swedish','and short inputs.']);
  c.submit('Monday Tuesday Wednesday Thursday Friday Saturday Sunday');
  assert.deepEqual(c.groups(),['Monday Tuesday','Wednesday Thursday Friday','Saturday Sunday']);
  c.submit(swedish);
  assert.deepEqual(c.groups(),['Vi lär oss','att planera och följa','rutiner som fungerar']);
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
