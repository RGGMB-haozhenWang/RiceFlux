import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {assessmentPolicy,assessPhenotype,targetKey,validateTraitTargets} from './traitAssessment.js';
import {countReportedAllele,parseTraitEvidence,supportsTraitAssessment,traitEvidenceFor} from './traitEvidence.js';
import {literatureDefinitions} from './jointHaplotypes.js';
import {literatureMatches} from './model.js';

const read=name=>readFileSync(new URL('../../public/'+name,import.meta.url));
const sample=(key,values,median)=>({key,values,median,n:values.length});
const groups=[sample('low',[1,2,3],2),sample('high',[5,6,7],6),sample('missing',[],null)];
const relative={mode:'relative'};

test('relative targets use closed boundaries and change the best observed type',()=>{
  assert.deepEqual([...assessPhenotype(groups,relative,[1,3]).preferred],['low']);
  assert.deepEqual([...assessPhenotype(groups,relative,[5,8]).preferred],['high']);
  assert.equal(assessPhenotype(groups,relative,[5,7]).results.get('high').inRange,3);
  assert.equal(assessPhenotype(groups,relative,[5,7]).results.get('low').distance,3);
  assert.equal(assessPhenotype(groups.slice(0,1),relative,[1,3]).preferred.size,0);
  assert.equal(assessPhenotype(groups,relative).results.size,0);
});

test('tied medians favour higher in-band coverage and exact ties remain visible',()=>{
  const equal=[sample('wide',[1,5,9],5),sample('narrow',[4,5,6],5),sample('tied',[4,5,6],5)];
  assert.deepEqual([...assessPhenotype(equal,relative,[4,6]).preferred],['narrow','tied']);
  assert.deepEqual([...assessPhenotype(equal,relative,[5,5]).preferred],['wide','narrow','tied']);
  const decimals=[sample('a',[8.1],8.1),sample('b',[8.4],8.4)];
  assert.equal(assessPhenotype(decimals,relative,[8.2,8.3]).preferred.size,2);
});

test('disease direction follows the registered assay and its measurement scale',()=>{
  const trait={id:'blight',category:'抗病'};
  const endpoint={unit:'cm',assay:'C5',method_id:'RF:method:blight:C5',scale_id:'RF:scale:cm'};
  assert.deepEqual([...assessPhenotype(groups,assessmentPolicy(trait,endpoint),[5,8]).preferred],['low']);
  const unknown=assessmentPolicy(trait,{...endpoint,scale_id:'another-method'});
  assert.equal(unknown.direction,null);
  assert.equal(assessPhenotype(groups,unknown,[1,3]).preferred.size,0);
  const key=targetKey({id:'heading'},{method_id:'method',scale_id:'days'});
  assert.doesNotThrow(()=>validateTraitTargets({[key]:[4,5]}));
  assert.throws(()=>validateTraitTargets({[key]:[5,4]}),/目标区间/);
  assert.throws(()=>validateTraitTargets({heading:[4,5]}),/目标区间/);
});

test('all 50 pilot genes are V4 members with unique sourced records and claims bind by definition',()=>{
  const data=JSON.parse(gunzipSync(read('datasets/reference.json.gz')));
  const review=parseTraitEvidence(String(read('prior/core50_genes.tsv')),String(read('formats/haplotype-effects.tsv')));
  const genes=data.genes.filter(g=>g.catalog.core&&!g.catalog.historical);
  assert.equal(data.genes.length,485);
  assert.equal(genes.length,50);
  assert.equal(review.pilot.length,genes.length);
  const records=new Set();
  for(const gene of genes){
    const {record,claims}=traitEvidenceFor(review,gene);
    assert.ok(record?.['文献主要作用']&&record['原始研究'].startsWith('https://'),gene.name);
    records.add(record);
    const definitions=literatureDefinitions(gene,data.evidence);
    for(const claim of claims.filter(c=>c.definition_id)){
      const definition=definitions.find(d=>d.id===claim.definition_id)||gene.records.find(d=>d.id===claim.definition_id);
      assert.ok(definition,claim.label);
      assert.ok([...(definition.doi||[]),...(definition.sources||[])].some(source=>source.endsWith(claim.doi)),claim.label);
    }
    for(const claim of claims.filter(c=>c.marker_state)){
      const [id,state]=claim.marker_state.split('=');
      const marker=gene.variants.find(v=>v.id===id);
      assert.ok(marker&&[marker.ref,marker.alt].includes(state),claim.label);
      assert.ok(countReportedAllele(gene,claim,data.evidence,[]),claim.label);
    }
  }
  assert.equal(records.size,review.pilot.length);
  const current=data.genes.filter(supportsTraitAssessment);
  assert.equal(current.length,484);
  assert.ok(!supportsTraitAssessment({catalog:{collection:'cloned_catalog'}}));
  const extended=new Set(gunzipSync(read('datasets/cloned_catalog/genes.tsv.gz')).toString().split('\n')
    .slice(1).filter(Boolean).map(line=>line.split('\t')[0]));
  for(const claim of review.claims){
    const gene=current.find(g=>g.id===claim.gene_id);
    if(extended.has(claim.gene_id)&&!gene){
      assert.ok(!claim.definition_id&&!claim.marker_state,claim.label);
      assert.ok(traitEvidenceFor(review,{id:claim.gene_id,catalog:{collection:'cloned_catalog'}}).claims.includes(claim));
      continue;
    }
    assert.ok(gene,claim.label);
    assert.ok(traitEvidenceFor(review,gene).claims.includes(claim));
    if(claim.definition_id){
      const definitions=literatureDefinitions(gene,data.evidence);
      const definition=definitions.find(d=>d.id===claim.definition_id)||gene.records.find(d=>d.id===claim.definition_id);
      assert.ok(definition,claim.label);
      assert.ok([...(definition.doi||[]),...(definition.sources||[])].some(source=>source.endsWith(claim.doi)),claim.label);
    }
  }
  const gnp3=current.find(gene=>gene.id==='LOC_Os03g49640');
  const [first]=traitEvidenceFor(review,gnp3).claims;
  const definitions=literatureDefinitions(gnp3,data.evidence);
  assert.deepEqual(definitions.map(d=>[d.label,d.components]),[
    ['GNP3 Hap‑T',[{pos:28274865,ref:'G',state:'T'}]],
    ['GNP3 Hap‑G',[{pos:28274865,ref:'G',state:'G'}]],
  ]);
  assert.equal(first.definition_id,definitions[0].id);
  assert.equal(first.judgment,'favourable');
  assert.equal(literatureMatches(gnp3,definitions,[])[0].callable,0);
  assert.deepEqual(literatureDefinitions({...gnp3,assembly:'different'},data.evidence),[]);
  const high=review.claims.find(c=>c.definition_id==='ea3657836f30abf9c');
  assert.deepEqual([high.label,high.trait_id,high.judgment],['DTH7 Hap4','grains_per_panicle','favourable']);
});
