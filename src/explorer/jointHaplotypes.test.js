import test from 'node:test';
import assert from 'node:assert/strict';
import {geneSchemes,typeMaterial,jointCalls} from './jointHaplotypes.js';
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
