import test from 'node:test';
import assert from 'node:assert/strict';
import {alleleNames,markerKind} from './alleles.js';
import {combineDatasets,parseDataset} from './datasets.js';
import {geneSchemes,typeMaterial,jointCalls} from './jointHaplotypes.js';
import {breederAxes,evidenceLevel,genotypePhenotypes,materialKey,markerCoverage,parentComparison,registeredCrosses,reviewAxes,targetRange,targetStatus,traitRows} from './breeder.js';

const gene={id:'LOC_Os01g00010',name:'Fixture',catalog:{msu:'LOC_Os01g00010'},model:'m',chromosome:'Chr1',
  start:1,end:100,promoter:{start:1,end:9},features:[],trait_ids:['len'],variants:[],records:[]};
const reference={genes:[gene],traits:[],meta:{}};
const manifest={schema:'RiceFlux tables 1.2',id:'a',name:'A',version:'1',source:'Synthetic test',
  assembly:'IRGSP-1.0/MSU7',genotype_evidence:'G_direct'};
const factory=(material='breeding line')=>({
  samples:'sample_id\tname\tsource_group\tsubspecies\tregion\tmaterial_type\n001\tA\tI\tindica\tNA\t'+material+'\n002\tB\tI\tindica\tNA\t'+material+'\n',
  variants:'marker_id\tgene_id\tchr\tposition\tref\talt\nA\tLOC_Os01g00010\tChr1\t10\tA\tAA\nB\tLOC_Os01g00010\tChr1\t11\tA\tAA\n',
  genotypes:'sample_id\tA\tB\n001\tAA/AA\t0/0\n002\t0/0\t1/1\n',
  environments:'environment_id\ttrait_id\ttrait_name\tunit\tcategory\tfamily\tassay\tsite\tyear\ntest\tlen\t粒长\tmm\t粒形\tlength\t直测\t甲地\t2026\n',
  phenotypes:'sample_id\ttest\n001\t8\n002\t9\n'
});

test('short anchored InDel intake keeps ordered state vectors and legacy tables reject InDel',()=>{
  const texts=factory();
  assert.throws(()=>parseDataset({...manifest,schema:'RiceFlux tables 1.1'},texts,reference),/锚定短 InDel/);
  assert.equal(markerKind(['AT','A','ATT'],true),'InDel');
  assert.equal(markerKind(['A','CT'],true),null);
  assert.equal(markerKind(['A','AT','AC','AG','AA'],true),null);
  const dataset=parseDataset(manifest,texts,reference);
  assert.equal(dataset.variants[0].markerType,'InDel');
  assert.deepEqual(alleleNames(dataset.variants[0]),['A','AA']);
  const data=combineDatasets(reference,[dataset]);
  const scheme=geneSchemes(data.genes[0],{events:{}})[0];
  const calls=data.individuals.map(s=>typeMaterial(s,scheme));
  assert.deepEqual(calls.map(c=>c.label),['标记型 AA·A','标记型 A·AA']);
  assert.equal(jointCalls(data.individuals,[scheme]).groups.length,2);
  assert.equal(markerCoverage(data.individuals,data.genes[0].variants[0]).maf,.5);
  assert.deepEqual(parentComparison(...data.individuals,scheme).f1,['AA/A','A/AA']);
  const proxy={...data.individuals[0],genotype_evidence:'G_projected'};
  assert.equal(parentComparison(proxy,data.individuals[1],scheme).f1,null);
});

test('phenotype targets use exact trial and dataset, with NA, inclusive boundaries and a separate effect grade',()=>{
  const data=combineDatasets(reference,[parseDataset(manifest,factory(),reference),
    parseDataset({...manifest,id:'b',version:'2'},factory(),reference)]);
  const axis=breederAxes(data).find(e=>e.dataset==='a');
  const bounded=targetRange({min:'8',max:'8'});
  assert.deepEqual(traitRows(data.individuals,axis,bounded).map(r=>[r.sample_id,r.value,r.reference_n,r.target_status]),
    [['001',8,2,'met'],['002',9,2,'outside']]);
  assert.equal(targetStatus(null,bounded),'missing');
  assert.equal(targetRange({min:'8',max:'7'}).invalid,true);
  assert.equal(targetRange({min:'0x10'}).invalid,true);
  assert.equal(targetStatus(0,targetRange()),'not_set');
  assert.equal(targetStatus(0,targetRange({max:'0'})),'met');
  const scheme=geneSchemes(data.genes[0],{events:{}})[0];
  const pheno=genotypePhenotypes(traitRows(data.individuals,axis,bounded),scheme,bounded);
  assert.deepEqual(pheno.map(r=>[r.n,r.mean,r.met]).sort((a,b)=>a[1]-b[1]),[[1,8,1],[1,9,0]]);
  assert.deepEqual(evidenceLevel(data.genes[0],scheme,pheno),{literature:'L0',phenotype:'P1',inference:'I0',grade:'C1'});
});

test('registered crosses resolve ordered parents by raw dataset identities and keep parent measurements absent',()=>{
  const pure=factory();
  pure.phenotypes='sample_id\ttest\n001\tNA\n002\tNA\n';
  pure.samples=pure.samples.replace('material_type\n','material_type\tfemale_dataset_id\tfemale_sample_id\tmale_dataset_id\tmale_sample_id\n')
    .replaceAll('breeding line\n','breeding line\t\t\t\t\n')+'C1\tCross\tF1\tindica\tNA\thybrid cross\ta\t001\ta\t002\n';
  pure.genotypes+='C1\tA/AA\t0/1\n';
  pure.phenotypes+='C1\t8.5\n';
  const data=combineDatasets(reference,[parseDataset(manifest,pure,reference)]);
  const [a,b,cross]=data.individuals;
  assert.equal(materialKey(a),'["a","001"]');
  assert.deepEqual(registeredCrosses(data.individuals,a,b),[cross]);
  assert.deepEqual(registeredCrosses(data.individuals,b,a),[]);
  assert.equal(a.phenotypes.test,null);
  assert.equal(cross.phenotypes.test,8.5);
  const broken={...pure,samples:pure.samples.replace('a\t001\ta\t002','a\t\ta\t002')};
  assert.throws(()=>parseDataset(manifest,broken,reference),/成对的数据集 ID/);
});

test('review uses measured coverage until a source is fixed and keeps the reference independent of the shortlist',()=>{
  const data=combineDatasets(reference,[parseDataset(manifest,factory(),reference),
    parseDataset({...manifest,id:'b',version:'2'},factory(),reference)]);
  const axes=breederAxes(data);
  const b=data.individuals.filter(s=>s.dataset_id==='b');
  const source=reviewAxes(axes,b,{},'len').axis;
  assert.equal(source.dataset,'b');
  assert.equal(source.observed,2);
  const locked=reviewAxes(axes,b,{axis:axes[0].key},'len').axis;
  assert.equal(locked.dataset,'a');
  assert.equal(locked.observed,0);
  assert.deepEqual(traitRows(b,locked,targetRange(),data.individuals),[]);
  const [row]=traitRows(b.slice(0,1),source,targetRange(),data.individuals);
  assert.equal(row.reference_n,2);
  assert.equal(row.percentile,25);
  assert.equal(row.dataset_version,'2');
});
