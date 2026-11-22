import test from 'node:test';
import assert from 'node:assert/strict';
import {claimEvidenceKey,parseQuantitativeEffects,parseTraitEvidence,quantitativeEffectText} from './traitEvidence.js';

const quantity={comparison:'Hap-T versus Hap-G, field trial',target:'15.6',control:'12.0',unit:'g',difference:'+3.6',difference_unit:'g',difference_basis:'calculated',relative:'+30.0',relative_basis:'calculated',locator:'Table 1',note:'Reported means; descriptive contrast.'};
const pilot='RAP\tMSU\t文献主要作用\t原始研究\ngene\tmsu\teffect\thttps://doi.org/10.1234/test\n';
const fields=['gene_id','definition_id','marker_state','label','trait_id','trait','direction','judgment','basis','effect','context','locator','doi'];
const claim=['gene','hap','','Hap-T','yield','产量','increase','favourable','association','Higher yield','Field trial','Table 1','10.1234/test'];
const table=(extraFields=[],extraValues=[])=>[fields.concat(extraFields).join('\t'),claim.concat(extraValues).join('\t')].join('\n');

test('legacy evidence and blank optional quantities remain loadable without fabricated effects',()=>{
  for(const text of [table(),table(['quantitative_effects'],[''])]){
    const parsed=parseTraitEvidence(pilot,text).claims[0];
    assert.deepEqual(parsed.quantitativeEffects,[]);
    assert.equal(quantitativeEffectText({},'relative'),'未核得');
  }
  assert.deepEqual(parseQuantitativeEffects('[]'),[]);
});

test('optional TSV JSON preserves values, scope, provenance and independent missing dimensions',()=>{
  const rows=[quantity,{...quantity,comparison:'Relative only',target:'',control:'',unit:'',difference:'',difference_unit:'',difference_basis:'',relative:'-10.2～-8.4',relative_basis:'reported'}];
  const parsed=parseTraitEvidence(pilot,table(['quantitative_effects'],[JSON.stringify(rows)])).claims[0];
  assert.deepEqual(parsed.quantitativeEffects,rows);
  assert.equal(quantitativeEffectText(rows[0],'difference'),'+3.6 g · 按原值计算');
  assert.equal(quantitativeEffectText(rows[1],'relative'),'-10.2～-8.4% · 原文报告');
  assert.equal(quantitativeEffectText(rows[1],'difference'),'未核得');
  assert.equal(quantitativeEffectText({...quantity,difference:'10.2～28.4',difference_unit:'百分点'},'difference'),'+10.2～+28.4 百分点 · 按原值计算');
  assert.equal(quantitativeEffectText({...quantity,relative:'0'},'relative'),'0% · 按原值计算');
});

test('invalid quantitative schema, numeric syntax, basis and provenance fail explicitly',()=>{
  for(const text of ['{','{}','[null]','[1]',JSON.stringify([quantity,quantity])])assert.throws(()=>parseQuantitativeEffects(text),/效应量/);
  for(const overrides of [{relative:'NaN'},{relative:'Infinity'},{relative:'+30%'},{relative_basis:'inferred'},
    {difference:'',difference_basis:'reported'},{difference_unit:''},{unit:''},{comparison:''},{locator:''},{target:15.6}]){
    assert.throws(()=>parseQuantitativeEffects(JSON.stringify([{...quantity,...overrides}])),/效应量/);
  }
  assert.throws(()=>parseTraitEvidence(pilot,table(['quantitative_effects'],['{}'])),/效应量/);
});

test('claim keys distinguish DOI and gene while remaining stable across quantitative updates',()=>{
  const base={gene_id:'gene',definition_id:'hap',label:'Hap-T',trait_id:'yield',doi:'10.1234/test'};
  assert.equal(claimEvidenceKey(base),claimEvidenceKey({...base,quantitative_effects:JSON.stringify([quantity])}));
  assert.notEqual(claimEvidenceKey(base),claimEvidenceKey({...base,doi:'10.1234/other'}));
  assert.notEqual(claimEvidenceKey(base),claimEvidenceKey({...base,gene_id:'other'}));
});
