// Preserve the 50 curated cards; attach the wider V4 registry and separate regional comparisons.
const pairs=Array.from({length:9},(_,i)=>[i%3,Math.floor(i/3)].map(x=>x===2?null:x));
export function callOf(sample,variant){
  return variant.column ? pairs[variant.column[sample.ordinal]] : sample.genotypes[variant.id];
}
export function catalogStatus(g){
  if(g.catalog.historical)return '历史身份';
  if(g.variants.some(v=>v.classified!=='区域探索标记'))return '文献位点有分型';
  return g.variants.length?'仅区域 SNP 有分型':'未接入分型';
}
export function attachCatalog(data,catalog,archive,evidence){
  if(archive.samples.length!==data.individuals.length||archive.samples.some((id,i)=>id!==data.individuals[i].id))throw Error('新增分型的材料顺序不一致');
  const byId=new Map(data.genes.map(g=>[g.id,g]));
  data.individuals.forEach((s,i)=>s.ordinal=i);
  const all=data.traits.find(t=>t.id==='all_prior');
  all.name='全部现行先验基因 · '+catalog.summary.active;
  const category=(group,id,name)=>{
    if(!data.traits.some(t=>t.id===id))data.traits.push({id,name,family:'prior',unit:'无配对表型',category:group});
    return id;
  };
  const fields=new Map([['heading',/抽穗期|开花期/],['length',/粒长/],['width',/粒宽/],['leaf_blast',/稻瘟病|叶瘟/],['neck_blast',/稻瘟病|穗颈瘟/],['blight',/白叶枯/],['sheath',/纹枯病/]]);
  for(const row of catalog.genes){
    let g=byId.get(row.id);if(Boolean(g)!==row.core)throw Error('核心基因身份不匹配');
    if(!g){
      const m=row.model;
      g={id:row.id,name:row.name,prior:row.categories.join('、'),description:row.function[0]||row.traits[0]||(row.historical?'仅保留旧版名称；已撤出的事件未纳入。':'本版只有基因档案，具体作用待核。'),
        assembly:'MSU7',chromosome:m?.chromosome??null,strand:m?.strand??null,gene_start:m?.gene_start??null,gene_end:m?.gene_end??null,model:m?.transcript??null,
        start:m?Math.min(m.gene_start,m.promoter[0]):null,end:m?Math.max(m.gene_end,m.promoter[1]):null,promoter:m?{start:m.promoter[0],end:m.promoter[1]}:null,
        features:(m?.cds||[]).map(([start,end])=>({type:'CDS',start,end})),sources:row.geneDOI.map(d=>'https://doi.org/'+d),variants:[],records:[],trait_ids:row.historical?[]:['all_prior']};
      if(!row.historical){
        const labels=row.traits.join('；'); // chart eligibility from explicit gene trait only; never from regional SNP location
        for(const [t,re] of fields)if(re.test(labels))g.trait_ids.push(t);
      }
      data.genes.push(g);byId.set(g.id,g);evidence.genes[g.id]=row.geneDOI;
    }
    g.catalog=row;
    for(const cat of row.categories)g.trait_ids.push(category('V4 文献性状','v4_'+cat,cat));
    if(row.core)g.trait_ids.push(category('基因先验','core50','原核心 50 基因'));
    if(row.historical)g.trait_ids.push(category('历史名录','historical','仅历史身份'));
    if(!row.historical && g.trait_ids.length===1)g.trait_ids.push(category('V4 文献性状','v4_unspecified','未归类的基因先验'));
    g.trait_ids=[...new Set(g.trait_ids)];
    for(const v of row.sites){
      const raw=archive.calls[v.id];if(!raw||raw.length!==2*data.individuals.length||!g.model||g.chromosome!==v.chromosome)throw Error('扩展位点或参考模型不匹配');
      const allele=a=>a===v.ref?0:a===v.alt?1:'0N'.includes(a)?2:-1;
      const column=new Uint8Array(data.individuals.length);
      for(let j=0;j<column.length;j++){const a=allele(raw[j*2]),b=allele(raw[j*2+1]);if(a<0||b<0)throw Error('扩展位点碱基不匹配');column[j]=a+3*b;}
      const variant={...v};Object.defineProperty(variant,'column',{value:column});g.variants.push(variant);
      g.start=Math.min(g.start,v.pos);g.end=Math.max(g.end,v.pos);
      const related=row.events.filter(e=>v.sourceEvents.includes(e.key));
      evidence.sites[v.id]={level:v.classified,sourceClass:v.feature,primary:[],event:[...new Set(related.flatMap(e=>e.doi))],background:row.geneDOI,
        note:related.length?'文献状态表中的同坐标组分；单独的群体分型不证明功能或效应。':'按参考转录本选择的实测 '+v.feature+' 区域 SNP。未建立与功能等位的连锁关系，不能据此推断育种效应。'};
    }
    g.variants.sort((a,b)=>a.pos-b.pos);
  }
  if(data.genes.length!==catalog.summary.catalog||Object.keys(archive.calls).length!==catalog.summary.regional_sites+catalog.summary.new_literature_sites)throw Error('先验基因或位点全集不完整');
  return {...data,evidence,catalogSummary:catalog.summary};
}
