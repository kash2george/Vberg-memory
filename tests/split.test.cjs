const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {createHash} = require('node:crypto');
const vm = require('node:vm');
const source = readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const acceptance = 'Risk management helps organizations identify analyze and evaluate threats';
const swedish = 'Vi lär oss att planera och följa rutiner som fungerar';
const twenty = 'Every morning our team reviews the plan and checks the results before we share new ideas with our colleagues together';
const twentyOne = twenty + ' today';

// Execute the actual splitter and UI handlers with drawing/DOM effects stubbed.
function app(){
  const elements = {inp:{value:''}, sentOut:{textContent:''}, sentenceNotice:{textContent:'',hidden:true}};
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
  c.notice = ()=>({...elements.sentenceNotice});
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
  for(const mark of [',',';',':','.','!','?','،','؛','؟']){
    assert.equal(c.sentenceCutCosts(['We','pause'+mark,'then','continue'])[2],0);
  }
  assert.equal(c.sentenceCutCosts(['We','pause','then','continue'])[2],1);
  assert.equal(c.sentenceCutCosts('الأمن مهم، لأنه يحمي البيانات'.split(' '))[2],0);
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
    twenty,
    ...Array.from({length:19},(_,i)=>Array.from({length:i+2},(_,j)=>'item'+j).join(' '))];
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
      const allowed=(words.length<6||sizes.every(n=>n>1)) && sizes.every(n=>n<=4);
      return {score,allowed};
    }
    const minima={}, allowedMinima={};
    const minG=Math.min(3,words.length), maxG=Math.min(5,words.length);
    for(let G=minG;G<=maxG;G++){minima[G]=Infinity;allowedMinima[G]=Infinity;}
    // Enumerate boundary combinations independently, without exploring all 2^(N-1) masks.
    function* masks(n,k,start=0,mask=0){
      if(!k){yield mask;return;}
      for(let bit=start;bit<=n-k;bit++)yield* masks(n,k-1,bit+1,mask|(1<<bit));
    }
    for(const mask of (function*(){
      for(let G=minG;G<=maxG;G++)yield* masks(words.length-1,G-1);
    })()){
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

test('filters cap every position and reject singleton lines; impossible fixed G still returns all words', ()=>{
  const c=app();
  function groups(sizes){return sizes.map(n=>Array(n).fill('word'));}
  assert.equal(c.sentenceGroupsAllowed(groups([1,6,1]),8),false);
  assert.equal(c.sentenceGroupsAllowed(groups([2,5,2]),9),false);
  assert.equal(c.sentenceGroupsAllowed(groups([5,3,3]),11),false);
  assert.equal(c.sentenceGroupsAllowed(groups([3,3,5]),11),false);
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
  c.submit(Array.from({length:15},(_,i)=>'item'+i).join(' '));
  c.state.G=5;c.doBtn('groups');
  assert.equal(c.state.G,3);
  assert.equal(c.state.words.length,15);
  assert(c.groups().some(g=>g.split(' ').length>4));
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

test('automatic sentence corpus through 20 words has capped groups and no singleton from six words', ()=>{
  const c=app();
  const corpus=[acceptance,swedish,twenty,
    'Browser sends requests to the server and receives responses as inputs.',
    'الأمن مهم، لأنه يحمي البيانات'];
  for(let n=1;n<=20;n++){
    for(let variant=0;variant<4;variant++){
      corpus.push(Array.from({length:n},(_,i)=>['item'+i,'and','pause,','مهم،'][(i+variant)%4]).join(' '));
    }
  }
  for(const text of corpus){
    const words=text.split(' '), result=c.split(words,true);
    assert(result.chunks.every(g=>g.length<=4),text);
    if(words.length>=6)assert(result.chunks.every(g=>g.length>=2),text);
    assert.deepEqual(Array.from(result.chunks.flat()),words);
    assert.deepEqual(c.split(words,true),result);
  }
});

test('20 words stay intact as five fours; 21 words split directly with a notice that clears', ()=>{
  const c=app();
  assert.equal(twenty.split(' ').length,20);
  c.submit(twenty);
  assert.deepEqual(c.groups().map(g=>g.split(' ').length),[4,4,4,4,4]);
  assert.equal(c.groups().join(' '),twenty);
  assert.equal(c.split(twenty.split(' '),true).longSentence,false);
  assert.equal(c.notice().hidden,true);
  c.submit(twentyOne);
  assert.deepEqual(c.groups().map(g=>g.split(' ').length),[4,4,5,4,4]);
  assert.equal(c.groups().join(' '),twentyOne);
  assert.equal(c.split(twentyOne.split(' '),true).longSentence,true);
  assert.equal(c.notice().textContent,'long sentence: split it into two');
  assert.equal(c.notice().hidden,false);
  c.doBtn('groups');
  assert.equal(c.notice().hidden,false);
  for(const text of [twenty,'computer','']){
    c.submit(twentyOne);c.submit(text);
    assert.equal(c.notice().textContent,'');
    assert.equal(c.notice().hidden,true);
  }
});

test('long sentences bypass enumeration and scoring, keeping balanced contiguous groups', ()=>{
  const c=app();
  c.allGroupings=()=>{throw Error('long sentence enumerated candidates');};
  c.sentenceCutCosts=()=>{throw Error('long sentence calculated cut costs');};
  c.scoreGrouping=()=>{throw Error('long sentence scored candidates');};
  for(const n of [21,22,23,24,80,150,200]){
    const words=Array.from({length:n},(_,i)=>'word'+i);
    for(const G of [undefined,3,4,5]){
      const result=c.split(words,true,G), sizes=Array.from(result.chunks,g=>g.length);
      assert.equal(result.G,G||5);
      assert(Math.max(...sizes)-Math.min(...sizes)<=1);
      assert.equal(result.longSentence,true);
      assert.deepEqual(Array.from(result.chunks.flat()),words);
      assert.deepEqual(c.split(words,true,G),result);
    }
  }
  const words=Array.from({length:150},(_,i)=>'word'+i);
  assert.deepEqual(Array.from(c.split(words,true,3).chunks,g=>g.length),[50,50,50]);
  assert.deepEqual(Array.from(c.split(words.slice(0,21),true,4).chunks,g=>g.length),[5,6,5,5]);
  assert.deepEqual(Array.from(c.split(words.slice(0,23),true).chunks,g=>g.length),[4,5,5,5,4]);
});

test('80 and 200 word splits each finish in less than 50 ms', ()=>{
  const c=app();
  for(const n of [80,200]){
    const words=Array.from({length:n},(_,i)=>'word'+i);
    const start=performance.now();
    const result=c.split(words,true);
    const elapsed=performance.now()-start;
    assert(elapsed<50,`${n} words took ${elapsed.toFixed(2)} ms`);
    assert.equal(result.G,5);
    assert.deepEqual(Array.from(result.chunks.flat()),words);
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
  for(const text of [acceptance,swedish,twenty,twentyOne,'two words','one two three','computer']){
    const c=app();
    c.document.fonts={ready:{then:fn=>fn()}};
    c.window={location:{search:'?text='+encodeURIComponent(text)}};
    c.URLSearchParams=URLSearchParams;
    c.EXAMPLES=[text];c.setTimeout=fn=>fn();
    vm.runInContext(source.slice(source.indexOf('document.fonts.ready.then'), source.indexOf('</script>', source.indexOf('document.fonts.ready.then'))),c);
    const loaded=c.groups(),notice=c.notice();c.submit(text);
    assert.deepEqual(c.groups(),loaded);
    assert.deepEqual(c.notice(),notice);
    // Also exercise a random-example initial load (no URL parameter).
    c.window.location.search='';
    vm.runInContext(source.slice(source.indexOf('document.fonts.ready.then'), source.indexOf('</script>', source.indexOf('document.fonts.ready.then'))),c);
    assert.deepEqual(c.groups(),loaded);
    assert.deepEqual(c.notice(),notice);
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
