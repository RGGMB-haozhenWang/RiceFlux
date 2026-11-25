import {traitConcept} from './traitVocabulary.js';

const operators={
  increasing:'increase', increase:'increase', increaing:'increase', higher:'increase', high:'increase', more:'increase',
  promoting:'promoting', promote:'promoting', larger:'larger',
  shorter:'shorter', smaller:'reduce', decreasing:'reduce', reduce:'reduce', reducing:'reduce',
  deceasing:'reduce', dereasing:'reduce', lower:'reduce', fewer:'reduce', losing:'reduce', preventing:'reduce',
  delaying:'delaying', delay:'delaying',
};
const states=new Map([
  ['awn present',['awn','present']],['awn absent',['awn','absent']],
  ['fragrance',['fragrance','present']],['glutinous rice',['glutinous_rice','present']],
  ['glabrousness of rice leave glumes',['glabrous_leaves_glumes','present']],
  ['grains turns brown in phenol solution',['grain_phenol_reaction','present']],
  ['red seed coat',['seed_coat_color','category','red']],
  ['light red seed coat',['seed_coat_color','category','light red']],
  ['black seed coat',['seed_coat_color','category','black']],
  ['colorless apiculus',['apiculus_pigmentation','category','colorless']],
  ['slight pigmentation apiculus',['apiculus_pigmentation','category','slightly pigmented']],
  ['loose panicle',['panicle_architecture','category','loose']],
  ['erect panicle',['panicle_architecture','category','erect']],
  ['semi-dwarf',['plant_height','shorter']],
  ['fertility restoration',['fertility_restoration','present']],
  ['non-restorer',['fertility_restoration','absent']],
  ['hybrid compatibility',['hybrid_compatibility','present']],
  ['hybrid incompatibility',['hybrid_compatibility','absent']],
  ['hybrid male sterility',['hybrid_male_sterility','present']],
  ['cytoplasmic male sterility',['cytoplasmic_male_sterility','present']],
  ['photoperiod-sensitive male sterility',['photoperiod_sensitive_male_sterility','present']],
  ['thermosensitive male sterility',['thermosensitive_male_sterility','present']],
  ['interspecific hybrid weakness',['hybrid_weakness','present']],
]);
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
const headingSign={promoting:'decrease',delaying:'increase'};
const signs={increase:'increase',larger:'increase',shorter:'decrease',reduce:'decrease'};

export function parseAlleleFunction(source){
  const normalized=normalize(source);
  let inherited='', previous='';
  return normalized.split(' and ').map(part=>{
    const context=part.match(/ under (ld|sd)$/)?.[1]?.toUpperCase()??'';
    const text=part.replace(/ under (ld|sd)$/,'');
    const state=states.get(text);
    const match=text.match(/^(\S+)(?: of)? (.+)$/);
    const operator=Object.hasOwn(operators,match?.[1])?operators[match[1]]:'';
    let term=state?.[0]??(operator?match[2]:text);
    if(term==='weight'&&previous.startsWith('root '))term='root weight';
    if(term==='weight'&&previous.startsWith('grain '))term='grain weight';
    const trait=traitConcept(term);
    const direction=state?.[1]??(operator||(trait?inherited:''));
    inherited=direction;
    previous=term;
    return {trait:trait?.id??'',direction:direction||'unspecified',
      sign:trait?((trait.id==='heading'?headingSign[direction]:null)??signs[direction]??''):'',
      context,state:state?.[2]??'',status:!trait?'trait_unresolved':direction?'mapped':'direction_unspecified'};
  });
}

export const directionLabels={
  increase:'升高',promoting:'促进',larger:'增大',shorter:'缩短',reduce:'降低',delaying:'延迟',
  present:'存在',absent:'缺失',category:'类别',unspecified:'方向未注明',
};
