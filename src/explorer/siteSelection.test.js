import test from 'node:test';
import assert from 'node:assert/strict';
import {analysisSites,resolveSites,validateSiteSelections} from './siteSelection.js';
import {customScheme,typeMaterial,jointCalls} from './jointHaplotypes.js';
import {genotypeGroups} from './model.js';
import {geneTables} from './exports.js';
const early={id:'a',pos:10,ref:'A',alt:'G'},late={id:'b',pos:20,ref:'T',alt:'C'};
const gene={id:'gene',assembly:'test-v1',chromosome:'Chr1',variants:[late,early],records:[]};
const sample=(id,a,b)=>({id,name:id,population_id:'P',ploidy:2,genotypes:{a,b},phenotypes:{}});
const samples=[sample('s1',[0,0],[0,0]),sample('s2',[0,1],[null,null]),sample('s3',[1,1],[1,1]),sample('s4',[0,null],[1,1])];
const choose=markerIds=>({assembly:'test-v1',markerIds});

test('manual subsets are ordered, independent of QC, and retain missing requests across datasets',()=>{
  assert.deepEqual(analysisSites(samples,gene,null,.5,.2).variants.map(v=>v.id),[]);
  const selected=analysisSites(samples,gene,choose(['b','a']),.5,.2);
  assert.deepEqual(selected.markerIds,['a','b']);assert.equal(selected.ready,true);
  assert.equal(genotypeGroups(samples,selected.variants).reduce((n,g)=>n+g.members.length,0),2);
  const subset=analysisSites(samples,gene,choose(['a']),.5,.2);
  assert.equal(genotypeGroups(samples,subset.variants).reduce((n,g)=>n+g.members.length,0),3);
  assert.equal(resolveSites(gene,choose([])).ready,false);
  assert.deepEqual(resolveSites(gene,choose(['absent','a'])).missing,['absent']);
  assert.equal(resolveSites(gene,{assembly:'other',markerIds:['a']}).ready,false);
});

test('custom homozygous schemes never inherit literature labels and exclude unresolved phase',()=>{
  const scheme=customScheme(gene,choose(['a']));
  assert.deepEqual(samples.map(s=>typeMaterial(s,scheme).status),['called','heterozygous','called','missing']);
  assert.equal(typeMaterial(samples[0],scheme).label,'自选型 A');
  assert.equal(jointCalls(samples,[scheme]).assigned,2);
  assert.equal(typeMaterial(samples[0],customScheme(gene,choose([]))).status,'no_sites');
  assert.equal(typeMaterial(samples[0],customScheme(gene,choose(['a','absent']))).status,'uncovered');
});

test('saved subsets reject malformed or duplicate definitions but allow explicit zero sites',()=>{
  validateSiteSelections({gene:choose([])});
  assert.throws(()=>validateSiteSelections({gene:choose(['a','a'])}),/位点/);
  assert.throws(()=>validateSiteSelections({gene:choose([1])}),/位点/);
  assert.throws(()=>validateSiteSelections({gene:[]}));
});

test('gene export separates analysis selection from QC and never exports partial definitions as complete',()=>{
  const data={traits:[],populations:[{id:'P'}],meta:{datasets:[]},evidence:{sites:{},papers:{}},literature:[]};
  const config={minMaf:.5,maxMissing:.2,siteSelections:{gene:choose(['a'])}};
  const files=geneTables(data,gene,samples,[early],config);
  assert.match(files['analysis_sites.tsv'],/1\ta\ttest-v1\tChr1\t10\tA\tG\tmanual\tavailable/);
  assert.match(files['variants.tsv'],/a\tChr1\t10\tA\tG\t\tfalse\ttrue/);
  assert.equal(files['combination_members.tsv'].split('\n').filter(row=>row.endsWith('\tcomplete')).length,3);
  config.siteSelections.gene=choose(['a','absent']);
  const missing=geneTables(data,gene,samples,[early],config);
  assert.match(missing['analysis_sites.tsv'],/absent.*uncovered/);
  assert.equal(missing['combination_members.tsv'].split('\n').filter(row=>row.endsWith('\tcomplete')).length,0);
});
