import test from 'node:test';
import assert from 'node:assert/strict';
import {phenotypeEffectComparisons} from './phenotypeEffectComparisons.js';
import {buildHaplotypeMapping} from './haplotypeIdentity.js';

const claim={trait_id:'length',doi:'10.1234/paper',definition_id:'target',label:'Target',control_definition_id:'control',control_label:'Control'};
const markers=[{id:'a',pos:10,ref:'A',alt:'G'},{id:'b',pos:20,ref:'T',alt:'C'}];
const gene={id:'gene',assembly:'IRGSP-1.0',chromosome:'Chr1'};
const scheme={kind:'literature',ready:true,doi:[claim.doi],markers,definitions:[
  {id:'target',label:'Hap1',valid:true,sequence:'A·T'}, {id:'control',label:'Hap4',valid:true,sequence:'G·C'}]};
const rows=[{key:'A T',n:10,median:12},{key:'G C',n:10,median:10}];
const groups=rows.map(r=>({key:r.key,members:[{}]}));
function compare(claims=[claim],current=scheme,data=rows,unit='mm',trait='length',published=[scheme],called=groups){
  return phenotypeEffectComparisons(claims,trait,buildHaplotypeMapping(gene,current,published,called),data,unit);
}

test('only exact trait claims with literature or explicit comparator are included',()=>{
  const literature=[{difference:'+3',comparison:'published experiment'}];
  const reported={trait_id:'length',quantitativeEffects:literature};
  const result=compare([reported,{trait_id:'width',quantitativeEffects:literature},{quantitativeEffects:literature},{trait_id:'length'},claim]);
  assert.equal(result.length,2);
  assert.equal(result[0].claim,reported);
  assert.equal(result[0].literature,literature);
  assert.equal(result[0].observed,null);
  assert.deepEqual(result[1].literature,[]);
  assert.deepEqual(phenotypeEffectComparisons([{quantitativeEffects:literature}],undefined,scheme,rows,'mm'),[]);
  assert.deepEqual(compare([{...reported,quantitativeEffects:'invalid'}]),[]);
  assert.deepEqual(compare([{...claim,control_label:''}]),[]);
});

test('exact genotypes can be matched under a user-defined scheme and a reordered axis',()=>{
  const sourceOnly={...claim,control_definition_id:'',quantitativeEffects:[{relative:'+26.2'}]};
  const result=compare([sourceOnly],{markers:[...markers].reverse()},rows,'mm','length',[scheme],
    [{key:'T A',members:[{}]},{key:'C G',members:[{}]}])[0];
  assert.deepEqual(result.targetKeys,['T A']);
  assert.equal(result.observed,null);
  assert.equal(compare([claim],{kind:'observed',markers})[0].observed.difference,2);
});

test('exact published two-group comparison uses both group counts and target minus control',()=>{
  assert.deepEqual(compare()[0].observed,{status:'ready',targetN:10,controlN:10,targetMedian:12,controlMedian:10,difference:2,differenceUnit:'mm',relative:20});
  const negative=compare([claim],scheme,[{...rows[0],median:8},rows[1]])[0].observed;
  assert.equal(negative.difference,-2);
  assert.equal(negative.relative,-20);
  assert.equal(compare([claim],scheme,[...rows,{key:'unrelated',n:1000,median:100}])[0].observed.difference,2);
});

test('wrong loci, ambiguous vectors, and non-independent target and control cannot produce an effect',()=>{
  const different={...scheme,markers:[{...markers[0],pos:11},markers[1]]};
  assert.equal(compare([claim],different)[0].observed.status,'unmatched');
  assert.equal(compare([claim],{markers:[markers[0]]})[0].observed.status,'unmatched');
  assert.equal(compare([{...claim,doi:'10.1234/else'}])[0].observed.status,'unmatched');
  assert.equal(compare([{...claim,control_definition_id:'target'}])[0].observed.status,'unmatched');
  const ambiguous={...scheme,definitions:[...scheme.definitions,{id:'alias',label:'Hap5',sequence:'A·T',valid:true}]};
  assert.equal(compare([claim],scheme,rows,'mm','length',[ambiguous])[0].relation,'ambiguous');
  assert.equal(compare([claim],scheme,rows,'mm','length',[ambiguous])[0].observed.status,'unmatched');
});

test('full paper marker coverage in a larger scheme attaches evidence, without a published-group difference',()=>{
  const current={markers:[...markers,{pos:30,ref:'A',alt:'T'}]};
  const data=['A T A','A T T','G C A'].map(key=>({key,members:[{}]}));
  const match=compare([claim],current,rows,'mm','length',[scheme],data)[0];
  assert.deepEqual(match.targetKeys,['A T A','A T T']);
  assert.equal(match.observed.status,'extension');
  assert.equal(match.observed.difference,null);
});

test('scarce or missing groups retain available statistics without deltas',()=>{
  for(const data of [[{...rows[0],n:9},rows[1]],[rows[0],{...rows[1],n:9}],
    [{...rows[0],n:19},{...rows[1],n:1}], [rows[0]],[],[{...rows[0],median:NaN},rows[1]]]){
    const observed=compare([claim],scheme,data)[0].observed;
    assert.equal(observed.status,'insufficient');
    assert.equal(observed.difference,null);
    assert.equal(observed.relative,null);
  }
  assert.deepEqual(compare([claim],scheme,[{...rows[0],n:2}])[0].observed,
    {status:'insufficient',targetN:2,controlN:0,targetMedian:12,controlMedian:null,difference:null,differenceUnit:'mm',relative:null});
  assert.equal(compare([claim],scheme,[rows[0],rows[0],rows[1]])[0].observed.status,'insufficient');
});

test('percentage differences are points; ratios require a known ratio scale and positive control',()=>{
  const percentage=compare([claim],scheme,rows,'%')[0].observed;
  assert.equal(percentage.difference,2);
  assert.equal(percentage.differenceUnit,'百分点');
  assert.equal(percentage.relative,20);
  for(const unit of ['粒/穗','g/株','kg/小区','天','cm'])
    assert.equal(compare([claim],scheme,rows,unit)[0].observed.relative,20);
  for(const unit of ['级','原表单位未注明','unknown','°C',null])
    assert.equal(compare([claim],scheme,rows,unit)[0].observed.relative,null);
  for(const median of [0,-10])
    assert.equal(compare([claim],scheme,[rows[0],{...rows[1],median}])[0].observed.relative,null);
  const overflow=compare([claim],scheme,[{...rows[0],median:Number.MAX_VALUE},{...rows[1],median:-Number.MAX_VALUE}])[0].observed;
  assert.equal(overflow.difference,null);
  assert.equal(overflow.relative,null);
});
