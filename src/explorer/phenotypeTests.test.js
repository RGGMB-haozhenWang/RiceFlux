import test from 'node:test';
import assert from 'node:assert/strict';
import {phenotypeComparison} from './phenotypeTests.js';

const endpoint=(id,unit='mm')=>({id,unit,assay:'length',source:{site:id,year:'2023',dataset_id:'D1'}});
const group=(key,values)=>({key,members:values.map(n=>({phenotypes:{a:n,b:n}}))});
const groups=[group('g1',[1,2,3,4,6]),group('g2',[2,3,4,10,20]),group('g3',[2,3,3,5,6,7]),group('rare',[1,null,1])];
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-11,`${a} vs ${b}`);

test('Welch and tie-corrected Kruskal agree with independent R results and retain small-group counts',()=>{
  const r=phenotypeComparison(groups,[endpoint('a'),endpoint('b')]);
  const [w,k]=r.tests;
  // R 4.5.3 stats::oneway.test and stats::kruskal.test on the three eligible groups.
  close(w.statistic,1.0580717566775748);close(w.df2,7.472334554601925);close(w.p,.39391076575216016);
  close(k.statistic,1.4589608433734915);close(k.p,.48215944461014959);close(w.holm,2*w.p);
  assert.equal(w.n,16);assert.equal(w.excluded_groups,1);
  assert.equal(r.counts.find(g=>g.definition==='rare').n,2);
});

test('ordinal, tied, zero variance, and missing comparisons have explicit status',()=>{
  const tied=[group('x',[1,1,1,1,1]),group('y',[1,1,1,1,1])];
  const continuous=phenotypeComparison(tied,[endpoint('a')]).tests;
  const ordinal=phenotypeComparison(tied,[endpoint('a','级')]).tests;
  assert.deepEqual(continuous.map(x=>x.status),['zero_within_group_variance','all_tied']);
  assert.deepEqual(ordinal.map(x=>x.status),['ordinal_scale','all_tied']);
  assert.equal(phenotypeComparison([groups[0]],[endpoint('a')]).tests[0].status,'too_few_groups');
});
