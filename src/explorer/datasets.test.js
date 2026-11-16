import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {parseDataset,combineDatasets,readTable} from './datasets.js';
import {findGenes} from './geneSearch.js';
import {callOf} from './catalog.js';
import {validateDataset,alleleStats} from './model.js';
import {geneSchemes,jointCalls} from './jointHaplotypes.js';
import {readPrior,bindPrior} from './exchange.js';
const base=new URL('../../public/',import.meta.url),read=(p)=>fs.readFileSync(new URL(p,base));
const reference=JSON.parse(gunzipSync(read('datasets/reference.json.gz')));
const manifest=JSON.parse(read('datasets/rice6044-v1/manifest.json'));
const texts=Object.fromEntries(Object.entries(manifest.files).map(([key,file])=>[key,(file.endsWith('.gz')?gunzipSync(read('datasets/rice6044-v1/'+file)):read('datasets/rice6044-v1/'+file)).toString()]));
const bundle=parseDataset(manifest,texts,reference);

test('tabular release preserves all 6044 materials, 1067 sites, original allele copies and phenotypes',()=>{
 const data=validateDataset(combineDatasets(reference,[bundle]));
 assert.equal(data.individuals.length,6044);assert.equal(data.genes.length,485);assert.equal(data.genes.flatMap(g=>g.variants).length,1067);
 const original=JSON.parse(gunzipSync(read('prior/cohort.json.gz'))),extended=JSON.parse(gunzipSync(read('prior/v4_marker_calls.json.gz')));
 const variants=new Map(data.genes.flatMap(g=>g.variants).map(v=>[v.id,v]));
 for(let i=0;i<original.samples.length;i++){
  const raw=original.samples[i],s=data.individuals[i];assert.equal(s.id,raw.id);assert.equal(s.name,raw.name);assert.equal(s.kind,raw.type);assert.equal(s.subspecies,raw.subspecies);assert.equal(s.source_group,raw.group);
  for(let j=0;j<original.sites.length;j++){
   const v=variants.get(original.sites[j].marker);assert.equal(callOf(s,v).map(a=>a===null?'N':a===0?v.ref:v.alt).join(''),raw.gt.slice(2*j,2*j+2).replaceAll('0','N'));
  }
  for(const [id,rawCalls] of Object.entries(extended.calls)){
   const v=variants.get(id);assert.equal(callOf(s,v).map(a=>a===null?'N':a===0?v.ref:v.alt).join(''),rawCalls.slice(2*i,2*i+2).replaceAll('0','N'));
  }
  original.environments.forEach((e,j)=>assert.equal(s.phenotypes['env_'+e.column],raw.ph[j]));
 }
 const genes=['DTH7','ALK'].map(name=>data.genes.find(g=>g.name===name));
 const records=bindPrior(readPrior(read('formats/prior_477.tsv').toString()),data.genes);
 const result=jointCalls(data.individuals,genes.map(g=>geneSchemes(g,data.evidence,records.filter(r=>r.gene===g))[0]));
 assert.equal(result.assigned,5969);assert.equal(result.groups.length,14);assert.equal(result.groups[0].n,2523);
});

const seed=bundle.variants.find(v=>v.alt);
function small(id,gt='A/A',sample='S1'){
 const manifest={schema:'RiceFlux tables 1.0',id,name:id,version:'1',assembly:'IRGSP-1.0/MSU7',source:'test fixture',genotype_evidence:'G_chip'};
 const ref=seed.ref,alt=seed.alt;
 const texts={samples:'sample_id\tname\tsource_group\tsubspecies\tregion\tmaterial_type\n'+sample+'\tOriginal\tSC\tindica\tNA\tlandrace\n',variants:'marker_id\tgene_id\tchr\tposition\tref\talt\n'+[seed.id,seed.gene,seed.chromosome,seed.pos,ref,alt].join('\t')+'\n',genotypes:'sample_id\t'+seed.id+'\n'+sample+'\t'+gt.replaceAll('A',ref).replaceAll('X',alt)+'\n',environments:'environment_id\ttrait_id\ttrait_name\tunit\tcategory\tfamily\tassay\tsite\tyear\n',phenotypes:'sample_id\n'+sample+'\n'};
 return {manifest,texts};
}
test('two datasets namespace duplicate local IDs, preserve partial missing and update grouping/allele denominators',()=>{
 const a=small('A','A/.'),b=small('B','X/X');
 const bundles=[a,b].map(x=>parseDataset(x.manifest,x.texts,reference));
 const data=validateDataset(combineDatasets(reference,bundles,'dataset_group'));
 assert.equal(new Set(data.individuals.map(s=>s.id)).size,2);assert.equal(data.individuals[0].source_sample_id,'S1');assert.equal(data.populations.length,2);
 const v=data.genes.flatMap(g=>g.variants)[0],stats=alleleStats(data.individuals,v);
 assert.deepEqual([stats.ref,stats.alt,stats.called,stats.total],[1,2,3,4]);
 assert.equal(combineDatasets(reference,bundles,'subspecies').populations.length,1);
 assert.equal(combineDatasets(reference,bundles,'region').populations[0].name,'未登记');
 assert.equal(data.individuals[0].name,'Original');assert.equal(data.traits.find(t=>t.id==='heading').unit,'无配对表型');
 assert.throws(()=>combineDatasets(reference,[bundles[0],bundles[0]]),/重复/);
});
test('import rejects wrong assembly, REF, allele, duplicate rows, unmatched identity and malformed axes',()=>{
 const a=small('A');
 assert.throws(()=>parseDataset({...a.manifest,assembly:'other'},a.texts,reference),/组装/);
 assert.throws(()=>parseDataset(a.manifest,{...a.texts,genotypes:a.texts.genotypes.replace(/[^\t\n]+\n$/,'Z/Z\n')},reference),/碱基/);
 assert.throws(()=>parseDataset(a.manifest,{...a.texts,samples:a.texts.samples+a.texts.samples.split('\n')[1]+'\n'},reference),/重复/);
 assert.throws(()=>parseDataset(a.manifest,{...a.texts,variants:a.texts.variants.replace(seed.gene,'unresolved')},reference),/唯一匹配/);
 assert.throws(()=>parseDataset(a.manifest,{...a.texts,genotypes:'sample_id\tother\nS1\tA/A\n'},reference),/位点列/);
 assert.throws(()=>parseDataset({...a.manifest,counts:{samples:2,variants:1,environments:0}},a.texts,reference),/counts/);
 assert.equal(readTable('a\tb\n1\t\n').rows[0][1],'');
});
test('exact MSU and normalized fuzzy aliases retrieve identity without merging similar names',()=>{
 const g=reference.genes.find(g=>g.name==='DTH7');
 assert.equal(findGenes(reference.genes,g.catalog.msu.toLowerCase())[0].id,g.id);
 assert.ok(findGenes(reference.genes,'dth').some(x=>x.id===g.id));
 assert.equal(findGenes(reference.genes,g.catalog.msu.replaceAll('_',' ').toUpperCase())[0].id,g.id);
 assert.equal(findGenes(reference.genes,'not-a-gene-zz123').length,0);
});

test('sparse cross-dataset coverage remains missing and provenance is never promoted',()=>{
 const a=small('A','A/.'),b=small('B','X/X');
 const second=bundle.variants.find(v=>v.id!==seed.id&&v.gene===seed.gene&&v.alt);
 const lines=b.texts.variants.split('\n');lines[1]=[second.id,second.gene,second.chromosome,second.pos,second.ref,second.alt].join('\t');b.texts.variants=lines.join('\n');
 b.texts.genotypes='sample_id\t'+second.id+'\nS1\t'+second.ref+'/'+second.ref+'\n';b.manifest.genotype_evidence='G_projected';
 const data=validateDataset(combineDatasets(reference,[a,b].map(x=>parseDataset(x.manifest,x.texts,reference))));
 const v=data.genes.flatMap(g=>g.variants).find(v=>v.id===seed.id);
 assert.deepEqual(callOf(data.individuals[1],v),[null,null]);assert.equal(alleleStats(data.individuals,v).called,1);
 assert.equal(data.meta.genotype_evidence,'G_mixed');assert.equal(data.individuals[1].genotype_evidence,'G_projected');
});
test('environment units and duplicate observations cannot be silently merged',()=>{
 const a=small('A'),b=small('B');
 for(const x of [a,b]){x.texts.environments+='E1\tlength\t粒长\tmm\t粒形\tlength\tlength\tHefei\t2022\n';x.texts.phenotypes='sample_id\tE1\nS1\t \n';}
 const one=parseDataset(a.manifest,a.texts,reference);assert.equal(one.phenotypes.get('S1').E1,null);
 b.texts.environments=b.texts.environments.replace('\tmm\t','\tcm\t');
 assert.throws(()=>combineDatasets(reference,[one,parseDataset(b.manifest,b.texts,reference)]),/单位/);
 b.texts.environments=b.texts.environments.replace('\tcm\t','\tmm\t');b.texts.phenotypes='sample_id\tE1\nS1\t0\n';
 const both=combineDatasets(reference,[one,parseDataset(b.manifest,b.texts,reference)]);
 const envs=both.traits.find(t=>t.id==='length').environments;assert.equal(envs.length,2);assert.notEqual(envs[0].source.site,envs[1].source.site);assert.equal(Object.values(both.individuals[1].phenotypes)[0],0);
});


test('trait ontology separates CO/TO from GO, binds method/scale and rejects cross-dataset semantic conflicts',()=>{
 const a=small('A'),b=small('B');
 for(const x of [a,b]){x.texts.environments='environment_id\ttrait_id\ttrait_name\tunit\tcategory\tfamily\tassay\tsite\tyear\tontology_id\tmapping_status\tmethod_id\tscale_id\tgrowth_stage\nE1\tcustom_trait\tTest\tmm\tTest\tcustom\tm\tS\t2023\tTO:0000001\trelated\tmethod1\tscale1\tmaturity\n';x.texts.phenotypes='sample_id\tE1\nS1\t1\n';}
 const one=parseDataset(a.manifest,a.texts,reference),data=combineDatasets(reference,[one]);
 const env=data.traits.find(t=>t.id==='custom_trait').environments[0];assert.equal(env.method_id,'method1');assert.equal(env.growth_stage,'maturity');
 assert.throws(()=>parseDataset(a.manifest,{...a.texts,environments:a.texts.environments.replace('TO:0000001','GO:0000001')},reference),/GO/);
 b.texts.environments=b.texts.environments.replace('TO:0000001','TO:0000002');assert.throws(()=>combineDatasets(reference,[one,parseDataset(b.manifest,b.texts,reference)]),/定义/);
});
