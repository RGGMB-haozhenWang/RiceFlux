import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHaplotypeMapping,haplotypeMappingRows,sourceHaplotypeKey} from './haplotypeIdentity.js';

const snp={id:'a',pos:10,ref:'A',alt:'G,T',markerType:'SNP'};
const indel={id:'b',pos:10,ref:'A',alt:'ACT,AG',markerType:'InDel'};
const extra={id:'c',pos:20,ref:'T',alt:'C'};
const gene={id:'LOC_Os01g12345',assembly:'MSU7',chromosome:'Chr01'};
const study=(doi,markers,records)=>({kind:'literature',ready:true,doi:[doi],markers,
  definitions:records.map(([id,label,sequence])=>({id,label,sequence,valid:true}))});
const paperA=study('10.1234/a',[snp,indel],[['a1','Hap1','A·ACT'],['a2','Hap2','T·A']]);
const paperB=study('10.1234/b',[indel,snp],[['b1','Hap1','A·T'],['b2','Hap7','ACT·A']]);
const groups=(...keys)=>keys.map(key=>({key,members:[{}]}));
const ref=(m,doi,id)=>m.bySource.get(sourceHaplotypeKey(doi,id));

test('same names in independent studies remain distinct; different names can describe one genotype',()=>{
  const m=buildHaplotypeMapping(gene,{markers:[snp,indel]},[paperA,paperB],groups('A ACT','T A'));
  assert.deepEqual(m.byGroup.get('A ACT').matches.map(s=>[s.doi,s.label]),[['10.1234/a','Hap1'],['10.1234/b','Hap7']]);
  assert.deepEqual(m.byGroup.get('T A').matches.map(s=>s.label),['Hap2','Hap1']);
  assert.notEqual(m.byGroup.get('A ACT').id,m.byGroup.get('T A').id);
  assert.deepEqual(JSON.parse(m.byGroup.get('A ACT').id),[gene.id,'IRGSP-1.0/MSU7',1,[['10:A:InDel','ACT'],['10:A:SNP','A']]]);
});

test('order, ALT index and IDs of equivalent records do not change molecular identity',()=>{
  const a=buildHaplotypeMapping(gene,{markers:[snp,indel]},[paperA],groups('A ACT'));
  const b=buildHaplotypeMapping({...gene,assembly:'IRGSP-1.0'},{markers:[{...indel,id:'z',alt:'AG,ACT'},{...snp,alt:'T,G'}]},[paperA],groups('ACT A'));
  assert.equal(a.byGroup.get('A ACT').id,b.byGroup.get('ACT A').id);
  assert.equal(ref(b,'10.1234/a','a1').status,'exact');
});

test('extensions are one-to-many; missing markers and different assembly cannot establish a match',()=>{
  const sup=buildHaplotypeMapping(gene,{markers:[snp,indel,extra]},[paperA],groups('A ACT T','A ACT C','T A T'));
  assert.deepEqual(ref(sup,'10.1234/a','a1').groupKeys,['A ACT T','A ACT C']);
  assert.equal(ref(sup,'10.1234/a','a1').status,'extension');
  for(const scheme of [{markers:[snp]},{markers:[snp,indel],assembly:'different'}]){
    const sub=buildHaplotypeMapping(gene,scheme,[paperA],groups('A'));
    assert.equal(ref(sub,'10.1234/a','a1').status,'current_missing_sites');
    assert.equal(ref(sub,'10.1234/a','a1').groupKeys.length,0);
  }
});

test('ambiguous source aliases, unresolved source positions and unobserved vectors are exportable',()=>{
  const duplicate=study('10.1234/a',[snp,indel],[['other','Different label','A·ACT']]);
  const unresolved=study('10.1234/c',[undefined],[['bad','Bad','C']]);
  const absent=study('10.1234/d',[snp],[['none','Other','G']]);
  const m=buildHaplotypeMapping(gene,{markers:[snp,indel]},[paperA,duplicate,unresolved,absent],groups('A ACT'));
  assert.equal(ref(m,'10.1234/a','a1').status,'ambiguous');
  assert.equal(ref(m,'10.1234/c','bad').status,'source_unresolved');
  assert.equal(ref(m,'10.1234/d','none').status,'not_observed');
  const rows=haplotypeMappingRows(gene,m,[{dataset_id:'D1'}],{kind:'observed'});
  assert.equal(rows.filter(r=>r.observed_haplotype_id).length,2);
  assert.equal(rows.find(r=>r.mapping_status==='source_unresolved').observed_haplotype_id,undefined);
});

test('a DOI-backed single InDel event maps through its definition ID or exports as unresolved',()=>{
  const marker={id:'gw2',pos:8117283,ref:'CA',alt:'C',markerType:'InDel'};
  const event={id:'published-deletion',label:'GW2 WY3',mode:'单个位点',components:[{pos:marker.pos,ref:'CA',state:'C'}]};
  const model={...gene,variants:[marker],records:[event]};
  const evidence={events:{[event.id]:{doi:['10.1234/indel']}}};
  const current={markers:[marker]};
  const m=buildHaplotypeMapping(model,current,[],groups('C'),[],evidence);
  assert.equal(ref(m,'10.1234/indel',event.id).status,'exact');
  assert.equal(ref(m,'10.1234/indel',event.id).sites,'8117283:CA:InDel=C');
  const absent=buildHaplotypeMapping({...model,variants:[]},current,[],groups('C'),[],evidence);
  assert.equal(ref(absent,'10.1234/indel',event.id).status,'source_unresolved');
});
