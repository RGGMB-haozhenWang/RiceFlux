import test from 'node:test';
import assert from 'node:assert/strict';
import {comparePav,pavComparisonRows} from './pavHaplotype.js';
const snp={id:'s',pos:10,ref:'A',alt:'G',assayedDatasets:new Set(['D'])};
const indel={id:'i',pos:20,ref:'AT',alt:'A',assayedDatasets:new Set(['D'])};
const gene={id:'gene',assembly:'MSU7',chromosome:1};
const assay={datasetId:'D',id:'pav-1',version:'v1',sourceGene:'gene',sampleIndex:new Map(['a','b','c','u','h','m'].map((id,i)=>[id,i])),states:'110.01'};
const sample=(id,pair=[0,0],extra={})=>({id:'qualified-'+id,source_sample_id:id,dataset_id:'D',population_id:'pop',genotypes:{s:pair,i:[0,0]},phenotypes:{env:2,other:999},...extra});
const run=(cohort,extra={})=>comparePav({gene,assay,cohort,variants:[indel,snp],view:{active:{id:'env'},unit:'g'},...extra});

test('co-called literal vectors keep present and absent distinct and use full cohort denominator',()=>{
  const c=run([sample('a'),sample('b',[0,0],{phenotypes:{env:6}}),sample('c'),sample('u'),sample('no-call'),sample('a',[0,0],{dataset_id:'other'})]);
  assert.deepEqual(c.sites.map(s=>s.id),['s','i']);
  assert.deepEqual(c.counts,{present:2,absent:1,unknown:1,unassayed:2,short_missing:0,short_heterozygous:0,short_unassayed:1});
  assert.deepEqual(c.groups.map(g=>[g.bases,g.state,g.n,g.ratio,g.pairedN,g.median]),[['A AT','present',2,2/6,2,4],['A AT','absent',1,1/6,1,2]]);
  assert.equal(c.members.filter(m=>m.key===null).length,3);
  assert.equal(run([sample('a')],{variants:[snp,indel]}).groups[0].key,c.groups[0].key);
});

test('missing, unassayed and heterozygous short calls never become haplotypes',()=>{
  const c=run([sample('h',[0,1]),sample('m',[null,null]),sample('a',[0,0],{dataset_id:'other'})]);
  assert.equal(c.groups.length,0);
  assert.deepEqual(c.members.map(m=>m.shortStatus),['heterozygous','missing','uncovered']);
  assert.equal(c.counts.short_missing,1);assert.equal(c.counts.short_heterozygous,1);
  const only=run([sample('h',[0,1])],{variants:[]});
  assert.equal(only.groups[0].state,'absent');assert.equal(only.members[0].shortStatus,'not_selected');
});

test('summary-only assays cannot join despite matching dataset and IDs',()=>{
  const c=run([sample('a')],{assay:{...assay,groups:[{present:30,absent:2}]}});
  assert.equal(c.unavailable,'summary_only');assert.equal(c.groups.length,0);assert.equal(c.members.length,0);
});

test('exports keep assay/event identity, genotype vector, excluded materials and one trial',()=>{
  const event={kind:'deletion',lengthChange:-80,chr:1,position:30,ref:'A'.repeat(81),alt:'A',originalId:'sv1'};
  const c=run([sample('a'),sample('u')],{assay:{...assay,event}}),rows=pavComparisonRows(c);
  assert.equal(rows.groups[0].pav_kind,'fragment');assert.deepEqual(JSON.parse(rows.groups[0].pav_event),event);
  assert.equal(rows.groups[0].pav_assay_id,'pav-1');assert.equal(rows.groups[0].dataset_id,'D');
  assert.equal(rows.materials[0].sample_id,'a');assert.equal(rows.materials[0].sample_dataset_id,'D');
  assert.equal(rows.materials[0].phenotype,2);assert.equal(rows.materials[0].environment_id,'env');
  assert.equal(rows.materials[1].pav_status,'unknown');assert.equal(rows.materials[1].group_id,'');
  assert.notEqual(c.groups[0].key,run([sample('a')]).groups[0].key);
});

test('unsupported marker types refuse comparison and empty/no paired cohorts are safe',()=>{
  assert.equal(run([sample('a')],{variants:[{...snp,alt:'<DEL>'}]}).unavailable,'unsupported_markers');
  assert.equal(run([]).groups.length,0);
  const c=run([sample('a')],{view:{active:{id:'missing'}}});
  assert.equal(c.groups[0].pairedN,0);assert.equal(c.groups[0].median,null);
});
