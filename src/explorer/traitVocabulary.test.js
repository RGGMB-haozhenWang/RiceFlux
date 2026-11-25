import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalTraitKey,traitVocabulary} from './traitVocabulary.js';
import {parseAlleleFunction} from './alleleDirection.js';

test('frozen trait vocabulary has 50 requested concepts and no overlapping aliases',()=>{
  assert.equal(traitVocabulary.traits.filter(t=>t.scope==='requested').length,50);
  assert.equal(new Set(traitVocabulary.traits.map(t=>t.id)).size,traitVocabulary.traits.length);
  for(const trait of traitVocabulary.traits){
    for(const term of [trait.id,trait.zh,trait.en,...trait.aliases])assert.equal(canonicalTraitKey(term),trait.id,term);
  }
  assert.notEqual(canonicalTraitKey('grain weight'),canonicalTraitKey('thousand grain weight'));
  assert.notEqual(canonicalTraitKey('effective panicle number (EPN)'),canonicalTraitKey('panicle number'));
  assert.notEqual(canonicalTraitKey('cold/chilling tolerance'),canonicalTraitKey('low-temperature germinability'));
});

test('effect directions preserve temporal meaning and source-only categories',()=>{
  const first=value=>parseAlleleFunction(value)[0];
  assert.deepEqual(first('promoting heading date under LD'),
    {trait:'heading',direction:'promoting',sign:'decrease',context:'LD',state:'',status:'mapped'});
  assert.equal(first('delaying heading date under SD').sign,'increase');
  assert.deepEqual(parseAlleleFunction('larger grain width and weight').map(effect=>[effect.trait,effect.direction,effect.sign]),
    [['width','larger','increase'],['grain_weight','larger','increase']]);
  assert.equal(first('black seed coat').state,'black');
  assert.equal(first('black seed coat').sign,'');
  assert.equal(first('cadmium accumulation').status,'direction_unspecified');
});
