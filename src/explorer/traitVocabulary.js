import vocabulary from '../../public/formats/trait-vocabulary.v1.json' with {type:'json'};

const literal=value=>String(value??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const terms=new Map(vocabulary.traits.map(trait=>[trait.id,trait]));
const aliases=new Map(vocabulary.traits.flatMap(trait=>[trait.id,trait.zh,trait.en,...trait.aliases]
  .map(value=>[literal(value),trait.id])));

export const canonicalTraitKey=value=>aliases.get(literal(value))||literal(value);
export const traitConcept=value=>terms.get(canonicalTraitKey(value));
export const traitVocabulary=vocabulary;
