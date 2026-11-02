import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDataset, selectCohort, alleleStats, retainedVariants, genotypeGroups, quantile, exportSnapshot} from './model.js';

const data=JSON.parse(readFileSync(new URL('../../data/explorer_demo.json',import.meta.url)));
const v={id:'v',ref:'A',alt:'G'},w={id:'w',ref:'C',alt:'T'};
const sample=(id,gt,other=[0,0])=>({id,ploidy:2,genotypes:{v:gt,w:other}});
const tiny=[sample('a',[0,0]),sample('b',[0,1]),sample('c',[1,1]),sample('d',[1,null]),sample('e',[null,null])];

test('allele frequency counts known copies, including heterozygotes and partial calls',()=>{
  const s=alleleStats(tiny,v);
  assert.deepEqual(s,{ref:3,alt:4,called:7,total:10,complete:3,het:1,n:5,af:4/7,maf:3/7,missing:3/10});
  assert.equal(alleleStats([],v).af,null);
  assert.equal(alleleStats([tiny[4]],v).missing,1);
  assert.equal(alleleStats([tiny[4]],v).af,null);
});
test('QC applies inclusive MAF and missing-copy thresholds; no calls never passes',()=>{
  const g={variants:[v]};
  assert.deepEqual(retainedVariants(tiny,g,3/7,.3),[v]);
  assert.deepEqual(retainedVariants(tiny,g,.44,.3),[]);
  assert.deepEqual(retainedVariants(tiny,g,0,.29),[]);
  assert.deepEqual(retainedVariants([tiny[4]],g,0,1),[]);
});
test('unphased genotypes canonicalize reversed alleles and exclude incomplete individuals',()=>{
  const s=[sample('a',[0,1]),sample('b',[1,0]),sample('c',[0,1],[1,null]),sample('d',[0,0])];
  const groups=genotypeGroups(s,[v,w]);
  assert.deepEqual(groups.map(g=>g.members.map(s=>s.id)),[['a','b'],['d']]);
  assert.equal(groups[0].tokens[0],'A/G');
  assert.deepEqual(genotypeGroups(s,[]),[]);
});
test('population and individual filters intersect; empty selections stay empty',()=>{
  assert.equal(selectCohort(data,['P1'],[],false).length,24);
  assert.deepEqual(selectCohort(data,[],[],false),[]);
  assert.deepEqual(selectCohort(data,['P1'],[],true),[]);
  assert.deepEqual(selectCohort(data,['P1'],['SIM001','SIM025'],true).map(s=>s.id),['SIM001']);
});
test('fixture validates, has ordered loci and strand-correct promoter positions',()=>{
  assert.equal(validateDataset(data),data);
  assert.equal(data.individuals.length,96);
  for(const gene of data.genes) {
    assert.deepEqual(gene.variants.map(v=>v.pos),gene.variants.map(v=>v.pos).sort((a,b)=>a-b));
    const promoter=gene.variants.find(v=>v.feature==='promoter');
    assert.ok(gene.strand==='+'?promoter.pos<gene.gene_start:promoter.pos>gene.gene_end);
  }
  for(const s of data.individuals)for(const t of ['quality','restoration'])if(s.phenotypes[t]!==null)assert.ok(s.phenotypes[t]>=0&&s.phenotypes[t]<=100);
  const bad=structuredClone(data);bad.individuals[0].genotypes[bad.genes[0].variants[0].id]=[0,2];
  assert.throws(()=>validateDataset(bad),/二倍体双等位/);
  assert.throws(()=>validateDataset({...data,meta:{synthetic:false}}),/合成数据/);
  assert.throws(()=>validateDataset({...data,populations:[{name:'bad'}]}),/标识缺失/);
});
test('phenotype quantiles omit missing values rather than treating null as zero',()=>{
  assert.equal(quantile([null,80,100],.5),90);
  assert.equal(quantile([null],.5),null);
  assert.equal(quantile([80],.25),80);
});
test('export is auditable from raw genotype counts and complete members',()=>{
  const state={traitId:'heading',geneId:'SIM_HD01',popIds:['P1','P3'],individualIds:['SIM001'],individualOnly:false,minMaf:.05,maxMissing:.2,variantId:'nonexistent'};
  const out=exportSnapshot(data,state),retained=out.variants.filter(v=>v.retained);
  assert.equal(out.cohort_ids.length,48);
  assert.equal(out.selection.variantId,retained[0].id);
  assert.equal(out.population_stats.reduce((n,s)=>n+s.alt,0),retained[0].alt);
  assert.equal(out.population_stats.reduce((n,s)=>n+s.called,0),retained[0].called);
  const expectedComplete=out.individuals.filter(s=>retained.every(v=>!s.genotypes[v.id].includes(null))).length;
  const ids=out.genotype_groups.flatMap(g=>g.member_ids);
  assert.equal(ids.length,expectedComplete);
  assert.equal(new Set(ids).size,ids.length);
  assert.ok(out.dataset.synthetic);
  assert.deepEqual(exportSnapshot(data,{...state,popIds:[]}).genotype_groups,[]);
});
