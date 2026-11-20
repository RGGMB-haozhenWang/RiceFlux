import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectMaterialGene,parseMaterialCheck} from './materialCheck.js';

test('body check retains missing, unknown and invalid variants without treating them as reference',()=>{
  const marker=(id,pos)=>({id,pos,ref:'A',alt:'C'});
  const markers=[marker('m1',1),marker('m2',2),marker('m3',3),marker('m4',4)];
  const genotype='sample_id\tmarker_id\tgenotype\ns\tm1\tA/C\ns\tm2\tNA\ns\tunknown\tA/A\ns\tm3\tG/G\n';
  const phenotype='sample_id\ttrait\tvalue\tunit\tsite\tyear\tmethod\ns\t粒长\t8.225\tmm\t甲地\t2026\t尺测\n';
  const input=parseMaterialCheck([genotype,phenotype],markers);
  assert.deepEqual(input.submitted.map(r=>r.status),['called','missing','unknown','invalid']);
  assert.equal(input.readings[0].value,8.225);
  const scheme={id:'observed',kind:'observed',markers,positions:[1,2,3,4],ready:true};
  const result=inspectMaterialGene(input.sample,scheme,input.calls);
  assert.deepEqual([result.complete,result.covered,result.expected,result.gaps],[1,2,4,['2','3','4']]);
  assert.equal(result.call.status,'uncovered');
  assert.throws(()=>parseMaterialCheck([genotype,phenotype.replace('\ns\t','\nother\t')],markers),/同.*sample_id/);
});
