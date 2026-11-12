import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {regionalView, regionalDistributions} from './regions.js';
import {observedDataset} from './observed.js';
import {exportSnapshot} from './model.js';

const release = file => JSON.parse(gunzipSync(readFileSync(new URL('../../public/prior/'+file,import.meta.url))));
const raw = release('cohort.json.gz');
const data = observedDataset(raw, release('ontology.jsonld.gz'));
const trait = id => data.traits.find(t=>t.id===id);

test('seven measured traits partition all 66 workbook columns without merging assays, sites or years', () => {
  const measured = data.traits.filter(t=>t.environments);
  assert.equal(measured.length,7);
  const seen = [];
  for (const t of measured) for (const assay of regionalView(t).assays) {
    const assayView = regionalView(t,{assay});
    for (const year of assayView.years) {
      const view=regionalView(t,{assay,year});
      for (const {site,endpoint} of view.sites) {
        if (!endpoint) continue;
        assert.equal(endpoint.source.site,site);
        assert.equal(endpoint.source.year,year);
        assert.equal(endpoint.assay,assay);
        seen.push(endpoint.source.column);
      }
    }
  }
  assert.deepEqual(seen.sort(),raw.environments.map(e=>e.column).sort());
  assert.equal(regionalView(trait('length')).sites.length,7);
  assert.equal(regionalView(trait('leaf_blast')).assays.length,6);
  assert.equal(regionalView(trait('blight')).assays.length,4);
  assert.equal(regionalView(trait('leaf_blast'),{assay:'SLBR_CH102'}).unit,'原表单位未注明');
  assert.equal(regionalView(trait('all_prior')),null);
});

test('regional boxes use the same axis and count finite values per group including zero and one-member groups', () => {
  const sample=(id,values)=>({id,phenotypes:values});
  const members=[sample('a',{env_CR:0,env_CV:8}),sample('b',{env_CR:2,env_CV:null}),sample('c',{env_CR:4,env_CV:null}),sample('d',{env_CR:6,env_CV:null})];
  const view=regionalView(trait('length')), out=regionalDistributions([{members,key:'g'}],view,['d']);
  const row=out.sites.find(s=>s.site==='Gongzhuling').rows[0];
  assert.deepEqual([row.n,row.min,row.q1,row.median,row.q3,row.max],[4,0,1.5,3,4.5,6]);
  assert.deepEqual(row.highlighted,[{id:'d',value:6}]);
  const one=out.sites.find(s=>s.site==='Hefei').rows[0];
  assert.deepEqual([one.n,one.min,one.max],[1,8,8]);
  assert.deepEqual(out.domain,[0,8]);
  assert.equal(regionalDistributions([],view).domain,null);
});

test('all reported regional n and median agree with the workbook column before genotype grouping', () => {
  const group={key:'all',members:data.individuals};
  for (const t of data.traits.filter(t=>t.environments)) for (const assay of regionalView(t).assays) {
    for (const year of regionalView(t,{assay}).years) {
      const view=regionalView(t,{assay,year}), distribution=regionalDistributions([group],view);
      for (const {endpoint,rows} of distribution.sites) {
        if (!endpoint) {assert.equal(rows[0].n,0); continue;}
        const column=raw.environments.findIndex(e=>e.column===endpoint.source.column);
        const values=raw.samples.map(s=>s.ph[column]).filter(Number.isFinite).sort((a,b)=>a-b);
        assert.equal(rows[0].n,endpoint.source.n);
        assert.equal(rows[0].n,values.length);
        const mid=Math.floor(values.length/2);
        if (values.length) assert.equal(rows[0].median,(values[mid]+values[Math.floor((values.length-1)/2)])/2);
      }
    }
  }
});

test('new and previously saved selections export the correct individual and site, year and assay columns', () => {
  const state={traitId:'length',geneId:data.genes.find(g=>g.name==='GS3').id,popIds:data.populations.map(p=>p.id),individualIds:['D1163'],individualOnly:true,minMaf:0,maxMissing:1};
  const output=exportSnapshot(data,state);
  assert.equal(output.phenotype_view.active_column,'CV');
  assert.equal(output.individuals[0].phenotype,8.35);
  assert.equal(output.individuals[0].phenotypes_by_column.CV,8.35);
  assert.equal(Object.keys(output.individuals[0].phenotypes_by_column).length,7);
  const old=exportSnapshot(data,{...state,traitId:'env_CW'});
  assert.equal(old.trait.source.column,'CW');
  assert.equal(old.individuals[0].phenotype,old.individuals[0].phenotypes_by_column.CW);
  const different=exportSnapshot(data,{...state,phenotypeView:{year:'2022',site:'Gongzhuling'}});
  assert.equal(different.phenotype_view.active_column,'CQ');
  assert.equal(different.individuals[0].phenotype,null);
});
