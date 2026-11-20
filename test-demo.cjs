const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const html=fs.readFileSync(path.join(__dirname, 'factory-agent-proposal.html'),'utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const nodes={};
for(const match of html.matchAll(/\bid="([^"]+)"/g)) nodes[match[1]]={value:'',textContent:'',innerHTML:'',disabled:false,attrs:{},handlers:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,v){this.handlers[k]=v;},focus(){}};
nodes.quantity.value='80';nodes.due.value='210';nodes.strategy.value='edd';
let tick;
const sandbox={document:{getElementById:id=>nodes[id],querySelectorAll:()=>[]},window:{},setInterval:cb=>{tick=cb;return 1},clearInterval:()=>{tick=null},console};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
function click(id){assert(!nodes[id].disabled,`${id} must be enabled`);nodes[id].handlers.click();}
function read(){return sandbox.window.demoInspect();}
function at(t){nodes.scrub.value=t;nodes.scrub.handlers.input();}
function reset(){click('reset');}
function healthy(){const r=read();assert.equal(r.validation.length,0,JSON.stringify(r.validation));assert.equal(r.state.issues.length,0);assert.equal(r.state.tasks.length,r.state.jobs.length*3);for(const task of r.state.tasks){assert(task.end>task.start);assert(task.start>=r.state.jobs.find(j=>j.id===task.job).release);}return r;}
const results=[];
let initial=healthy();assert.equal(initial.summary.finish,217);assert.equal(initial.summary.late,1);results.push(['baseline',initial.summary]);
click('add-cnc');let two=healthy();assert.equal(two.summary.finish,152);assert.equal(two.summary.late,0);results.push(['parallel CNC',two.summary]);
click('add-qc');healthy();click('toggle-pack');assert(read().state.issues.length>0);assert(nodes.play.disabled);assert.equal(nodes['kpi-finish'].textContent,'不可行');click('toggle-pack');healthy();results.push(['missing capability blocks simulation',true]);
reset();at(65);let frozen=read().state.tasks.filter(t=>t.start<65);click('fault');let faulty=healthy();for(const before of frozen){const after=faulty.state.tasks.find(t=>t.job===before.job&&t.kind===before.kind);assert.equal(after.start,before.start);assert.equal(after.end,before.end+(before.machine==='CNC-01'&&before.end>65?45:0));}assert.equal(faulty.summary.finish,262);results.push(['fault at minute 65',faulty.summary]);
click('urgent');let urgent=healthy();assert.equal(urgent.state.jobs.length,4);assert(urgent.state.tasks.filter(t=>t.job==='U-404').every(t=>t.start>=65));results.push(['urgent job with fault',urgent.summary]);
reset();click('play');assert(read().state.playing);tick();assert.equal(read().state.time,3);click('play');assert(!read().state.playing);click('step');assert.equal(read().state.time,40);results.push(['play pause event-step',true]);
at(read().summary.finish);assert.equal(nodes['kpi-output'].textContent,'180 / 180');
reset();nodes.quantity.value='0';click('plan');assert(nodes['agent-text'].textContent.includes('10–200'));assert.equal(read().state.qty,80);results.push(['invalid quantity rejected',true]);
// Cover alternative job priorities, quantities, resources and interruption times.
let cases=0;
for(const strategy of ['edd','spt','fifo'])for(const qty of [10,80,200])for(const dual of [false,true])for(const faultAt of [0,1,39,40,41,65,110,170]){
 reset();nodes.strategy.value=strategy;nodes.quantity.value=String(qty);click('plan');if(dual)click('add-cnc');at(Math.min(faultAt,read().summary.finish-1));click('fault');healthy();if(!nodes.urgent.disabled){click('urgent');healthy();}cases++;
}
results.push(['constraint scenarios passed',cases]);
reset();at(65);click('fault');at(10);assert(nodes.urgent.disabled);assert(!nodes['event-log'].innerHTML.includes('停機 45 分'));at(65);assert(!nodes.urgent.disabled);results.push(['rewind blocks past mutations and hides future logs',true]);
reset();click('add-cnc');assert(nodes['kpi-diff'].textContent.includes('提早 65'));results.push(['comparison KPI matches schedule',true]);

console.log(JSON.stringify(results,null,2));
