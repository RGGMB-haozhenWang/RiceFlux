import test from 'node:test';
import assert from 'node:assert/strict';
import {geneSchemes,typeMaterial,jointCalls,literatureDefinitions} from './jointHaplotypes.js';
import {literatureMatches} from './model.js';
const v1={id:'p1',pos:3,ref:'A',alt:'G'},v2={id:'p2',pos:11,ref:'T',alt:'C'};
const row=(id,label,a,b,pos=11)=>({id,label,mode:'完整多位点型',components:[{pos:3,ref:'A',state:a},{pos,ref:'T',state:b}]});
const gene={name:'G',variants:[v1,v2],records:[row('x','H1','A','T'),row('y','H2','G','C'),row('z','H3','G','C'),row('w','Other series','A','T',12)]};
const evidence={events:Object.fromEntries(['x','y','z','w'].map(x=>[x,{doi:[x==='w'?'other':'same']}]))};
const sample=(id,a,b,pop='SC')=>({id,population_id:pop,genotypes:{p1:a,p2:b}});
test('ordered homozygous states, ambiguity, unresolved phase, partial coverage and subgroup denominators',()=>{
 const options=geneSchemes(gene,evidence);const known=options[0],observed=options.find(s=>s.kind==='observed'),partial=options.find(s=>!s.ready);
 const cohort=[sample('1',[0,0],[0,0]),sample('2',[1,1],[1,1]),sample('3',[0,1],[0,0]),sample('4',[0,null],[0,1]),sample('5',[1,1],[0,0]),sample('6',[0,0],[0,0],'NE'),sample('7',[null,null],[1,1])];
 assert.deepEqual(cohort.map(s=>typeMaterial(s,known).status),['called','ambiguous','heterozygous','both','unmatched','called','missing']);
 assert.equal(typeMaterial(cohort[0],partial).status,'uncovered');
 assert.equal(typeMaterial(cohort[1],observed).label,'标记型 GC');
 const all=jointCalls(cohort,[known,observed]);assert.equal(all.assigned,2);assert.equal(all.groups.length,1);assert.equal(all.members.length,7);
 assert.deepEqual(all.population.get('SC'),{all:6,assigned:1});assert.equal(all.groups[0].pops.get('NE'),1);
 assert.equal(jointCalls([], [known,observed]).assigned,0);
});

test('supplement binds literature definitions to catalog identity, with the published order and source',()=>{
  const alk={id:'Os06g0229800',name:'alias',variants:[],records:[]};
  const known=geneSchemes(alk,{events:{}}).find(s=>s.kind==='literature');
  assert.deepEqual(known.positions,[6752756,6752887,6752888]);
  assert.deepEqual(known.doi,['10.1186/s12284-020-00393-5']);
  assert.deepEqual(known.definitions.map(d=>d.sequence),['A·G·C','G·T·T','G·G·C']);
  assert.ok(geneSchemes({...alk,id:'different',name:'ALK'},{events:{}}).every(s=>s.kind!=='literature'));
});

test('combined datasets retain assay coverage separately from missing calls',()=>{
  const combined={...gene,variants:[v1,{...v2,assayedDatasets:new Set(['D1'])}]};
  const scheme=geneSchemes(combined,evidence)[0];
  const covered={...sample('1',[0,0],[0,0]),dataset_id:'D1'};
  const missing={...sample('2',[0,0],[null,null]),dataset_id:'D1'};
  const uncovered={...sample('3',[0,0],[null,null]),dataset_id:'D2'};
  assert.deepEqual([covered,missing,uncovered].map(s=>typeMaterial(s,scheme).status),['called','missing','uncovered']);
  const [definition]=literatureDefinitions(combined,evidence);
  const counts=cohort=>literatureMatches(combined,[definition],cohort).map(({matched,callable})=>[matched,callable]);
  assert.deepEqual(counts([uncovered]),[[null,null]]);
  assert.deepEqual(counts([missing]),[[0,0]]);
  assert.deepEqual(counts([covered,missing,uncovered]),[[1,1]]);
});


test('joint groups use ordered literal states even when source labels are shared',()=>{
  const shared={...gene,records:[row('a','Hap1','A','T'),row('b','Hap1','G','C')]};
  const source={events:{a:{doi:['shared']},b:{doi:['shared']}}};
  const scheme=geneSchemes(shared,source)[0];
  const cohort=[sample('a',[0,0],[0,0]),sample('b',[1,1],[1,1]),sample('c',[0,0],[0,0],'NE')];
  const result=jointCalls(cohort,[scheme]);
  assert.deepEqual(result.members.map(m=>m.calls[0].label),['Hap1','Hap1','Hap1']);
  assert.deepEqual(result.members.map(m=>m.calls[0].status),['called','called','called']);
  assert.equal(result.assigned,3);
  assert.equal(result.groups.length,2);
  assert.equal(result.members[0].key,result.members[2].key);
  assert.notEqual(result.members[0].key,result.members[1].key);
  assert.deepEqual(result.groups.map(g=>[g.labels,g.n]),[[['Hap1'],2],[['Hap1'],1]]);
  assert.deepEqual(JSON.parse(result.members[0].key),['A T']);
  const joint=jointCalls(cohort,[scheme,scheme]);
  assert.deepEqual(JSON.parse(joint.members[1].key),['G C','G C']);
});

test('definitions retain original components even when markers are unavailable',()=>{
  const scheme=geneSchemes(gene,evidence).find(s=>!s.ready);
  const definition=gene.records.find(r=>r.id===scheme.definitions[0].id);
  assert.deepEqual(scheme.definitions[0].components,definition.components);
  assert.equal(scheme.definitions[0].sequence,'A·T');
  assert.equal(scheme.definitions[0].valid,true);
  assert.equal(scheme.definitions[0].label,'Other series');
});
