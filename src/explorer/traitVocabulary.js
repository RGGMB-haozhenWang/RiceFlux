const groups={
  heading:['heading','days to heading','heading date','抽穗期','抽穗天数'],
  length:['length','grain length','粒长','籽粒长度'],
  width:['width','grain width','粒宽','籽粒宽度'],
  grain_ratio:['grain_ratio','grain length/width ratio','grain length-to-width ratio','粒长宽比','粒长/粒宽'],
  thousand_grain_weight:['thousand_grain_weight','1000-grain weight','thousand grain weight','千粒重'],
  panicle_length:['panicle_length','panicle length','穗长'],
  leaf_blast:['leaf_blast','leaf blast resistance','叶瘟','叶瘟抗性','叶瘟评分'],
  neck_blast:['neck_blast','neck blast resistance','穗颈瘟','穗颈瘟抗性','穗颈瘟评分'],
  blight:['blight','bacterial blight lesion length','白叶枯病斑长度','白叶枯病病斑长度'],
  plant_height:['plant_height','plant height','株高'],
  culm_length:['culm_length','culm length','茎秆长','茎秆长度'],
};
const literal=value=>String(value??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const synonyms=new Map(Object.entries(groups).flatMap(([key,values])=>values.map(value=>[literal(value),key])));
export const canonicalTraitKey=value=>synonyms.get(literal(value))||literal(value);
