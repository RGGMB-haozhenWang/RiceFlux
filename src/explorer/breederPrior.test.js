import test from 'node:test';
import assert from 'node:assert/strict';
import {priorMaterialMatch,pairedPriorPhenotypes,priorCandidate} from './breederPrior.js';
const marker={id:'m',pos:10,ref:'A',alt:'G',assayedDatasets:new Set(['d'])};
const gene={id:'g',assembly:'MSU7',variants:[marker],records:[],catalog:{events:[]}};
const claim={gene_id:'g',marker_state:'m=G',doi:'10.1234/test',trait_id:'length'};
const evidence={sites:{m:{level:'原文功能位点',primary:['10.1234/test']}}};
const sample=pair=>({id:'s',dataset_id:'d',genotype_evidence:'G_chip',genotypes:{m:pair},phenotypes:{p:8,q:20}});
test('exact functional marker identity is required and no-call is never reference',()=>{
  assert.equal(priorMaterialMatch(sample([1,1]),gene,claim,evidence).status,'matched');
  assert.equal(priorMaterialMatch(sample([0,0]),gene,claim,evidence).status,'different');
  assert.equal(priorMaterialMatch(sample([null,null]),gene,claim,evidence).status,'missing');
  assert.equal(priorMaterialMatch(sample([0,1]),gene,claim,evidence).status,'heterozygous');
  assert.equal(priorMaterialMatch({...sample([1,1]),dataset_id:'other'},gene,claim,evidence).status,'uncovered');
  assert.equal(priorMaterialMatch(sample([1,1]),gene,{...claim,marker_state:'other=G'},evidence).status,'undefined');
  assert.equal(priorMaterialMatch(sample([1,1]),gene,{...claim,doi:'10.1234/unrelated'},evidence).status,'undefined');
  assert.equal(priorMaterialMatch(sample([1,1]),gene,{...claim,marker_state:'m=T'},evidence).status,'undefined');
  assert.equal(priorMaterialMatch(sample([1,1]),gene,claim,{sites:{m:{level:'区域探索标记',primary:['10.1234/test']}}}).status,'undefined');
});
test('only same accession, dataset and exact trait pair; proxies and aggregate PAV cannot become candidates',()=>{
  const axes=[{id:'p',key:'d:p',dataset:'d',trait_id:'length'},{id:'q',dataset:'other',trait_id:'length'},{id:'r',dataset:'d',trait_id:'width'}];
  const readings=pairedPriorPhenotypes(sample([1,1]),claim,axes);
  assert.equal(readings.length,1);assert.equal(readings[0].value,8);
  assert.equal(priorCandidate({status:'matched'},sample([1,1]),readings),true);
  for(const genotype_evidence of ['G_projected','G_mixed','G_none'])assert.equal(priorCandidate({status:'matched'},{...sample([1,1]),genotype_evidence},readings),false);
  assert.equal(priorCandidate({status:'matched'},sample([1,1]),[]),false);
  assert.equal(priorMaterialMatch(sample([1,1]),gene,{...claim,marker_state:'',definition_id:'pav_present'},evidence).status,'undefined');
});
test('local unsubmitted marker remains uncovered, not an inherited catalog call',()=>{
  assert.equal(priorMaterialMatch(sample([1,1]),gene,claim,evidence,new Map()).status,'uncovered');
});
test('multisite literature matches exact definition and source DOI, not another label at same locus',()=>{
  const m2={...marker,id:'m2',pos:20,ref:'C',alt:'T'};
  const record=(id,state)=>({id,label:id,mode:'完整多位点型',components:[{pos:10,ref:'A',state:'G'},{pos:20,ref:'C',state}]});
  const g={...gene,variants:[marker,m2],records:[record('hap1','T'),record('hap2','C')]};
  const e={events:{hap1:{doi:['10.1234/test']},hap2:{doi:['10.1234/test']}}};
  const c={...claim,marker_state:'',definition_id:'hap1'};
  const s={...sample([1,1]),genotypes:{m:[1,1],m2:[1,1]}};
  assert.equal(priorMaterialMatch(s,g,c,e).status,'matched');
  assert.equal(priorMaterialMatch({...s,genotypes:{m:[1,1],m2:[0,0]}},g,c,e).status,'different');
  assert.equal(priorMaterialMatch({...s,genotypes:{m:[1,1]}},g,c,e).status,'missing');
  assert.equal(priorMaterialMatch(s,g,{...c,doi:'10.1234/other'},e).status,'undefined');
});
test('imported same-trait measurements retain assay context without borrowing other accession data',()=>{
  const readings=pairedPriorPhenotypes(sample([1,1]),claim,[],[{trait:'length',value:8,unit:'mm',site:'A',year:'2026',method:'ruler'},{trait:'width',value:4,unit:'mm',site:'A',year:'2026',method:'ruler'}]);
  assert.equal(readings.length,1);assert.equal(readings[0].axis.assay,'ruler');assert.equal(readings[0].axis.source.site,'A');
  assert.deepEqual(pairedPriorPhenotypes(sample([1,1]),claim,[],[]),[]);
});
