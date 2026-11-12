import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {observedDataset} from './observed.js';
import {attachCatalog,callOf,catalogStatus} from './catalog.js';
import {validateDataset} from './model.js';
const raw=f=>gunzipSync(readFileSync(new URL('../../public/prior/'+f,import.meta.url))).toString(), read=f=>JSON.parse(raw(f));
test('full catalogue, material order, missing models, and all new and historical marker calls stay distinct',()=>{
 const cohort=read('cohort.json.gz'),cat=read('v4_catalog.json.gz'),extra=read('v4_marker_calls.json.gz');
 const data=validateDataset(attachCatalog(observedDataset(cohort,read('ontology.jsonld.gz')),cat,extra,read('evidence.json.gz')));
 assert.equal(data.genes.filter(g=>g.trait_ids.includes('all_prior')).length,484);
 assert.deepEqual(Object.fromEntries(['历史身份','文献位点有分型','仅区域 SNP 有分型','未接入分型'].map(label=>[label,data.genes.filter(g=>catalogStatus(g)===label).length])),{'历史身份':1,'文献位点有分型':33,'仅区域 SNP 有分型':412,'未接入分型':39});
 const rows=raw('v4_accession_calls.tsv.gz').trimEnd().split('\n');const header=rows.shift().split('\t').slice(7);
 const vs=new Map(data.genes.flatMap(g=>g.variants.map(v=>[v.id,v])));assert.equal(vs.size,1067);assert.equal(header.length,812);
 rows.forEach((line,i)=>{const cells=line.split('\t');assert.equal(cells[0],data.individuals[i].id); assert.equal(cells.length,819);
  header.forEach((id,j)=>{const v=vs.get(id),pair=cells[j+7];const alleles=callOf(data.individuals[i],v);
   for(let k=0;k<2;k++) {const val=alleles[k]===null?null:[v.ref,v.alt][alleles[k]];assert.equal(val,'0N'.includes(pair[k])?null:pair[k]);}
  });
 });
 const hist=data.genes.find(g=>g.name==='LOGL1');assert.deepEqual(hist.variants,[]);assert.deepEqual(hist.catalog.events,[]);assert.equal(hist.start,null);
 const sug=data.genes.find(g=>g.name.startsWith('SUG1/'));assert.equal(sug.variants.length,21);assert.ok(sug.variants.every(v=>v.sourceEvents.length&&v.classified==='文献记录组分'));
});
