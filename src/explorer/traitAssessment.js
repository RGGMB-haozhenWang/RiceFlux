import contract from '../../public/formats/trait-assessment.json' with { type:'json' };

export function assessmentPolicy(trait,endpoint) {
  const rule=Object.hasOwn(contract.absolute,trait.id)?contract.absolute[trait.id]:null;
  if(rule||trait.category==='抗病'){
    const known=rule&&rule.unit===endpoint.unit&&rule.assays.includes(endpoint.assay)&&
      endpoint.method_id===`RF:method:${trait.id}:${endpoint.assay}`&&endpoint.scale_id===`RF:scale:${endpoint.unit}`;
    return {mode:'absolute',direction:known?rule.better:null,criterion:known?rule.criterion:null,protocol:contract.protocol};
  }
  return {mode:'relative'};
}

export function targetKey(trait,endpoint) {
  return JSON.stringify([trait.id,endpoint.method_id,endpoint.scale_id]);
}

export function isTargetRange(range) {
  return Array.isArray(range)&&range.length===2&&range.every(Number.isFinite)&&range[0]<=range[1];
}

export function assessPhenotype(rows,policy,range) {
  if(policy.mode==='absolute'?!policy.direction:!isTargetRange(range))return {results:new Map(),preferred:new Set()};
  const relative=policy.mode==='relative';
  const results=new Map(), comparable=[];
  for(const row of rows){
    if(!Number.isFinite(row.median)||!row.n)continue;
    const distance=relative?Math.max(range[0]-row.median,0,row.median-range[1]):null;
    const inRange=relative?row.values.filter(x=>range[0]<=x&&x<=range[1]).length:0;
    const score=relative?distance:policy.direction==='lower'?row.median:-row.median;
    const result={distance,inRange,n:row.n,score,share:inRange/row.n};
    results.set(row.key,result);
    comparable.push([row.key,result]);
  }
  if(comparable.length<2)return {results,preferred:new Set()};
  const closestScore=comparable.reduce((best,[,x])=>Math.min(best,x.score),Infinity);
  const closest=comparable.filter(([,x])=>x.score===closestScore||(
    Number.isFinite(x.score)&&Number.isFinite(closestScore)&&
    Math.abs(x.score-closestScore)<=8*Number.EPSILON*Math.max(1,Math.abs(x.score),Math.abs(closestScore))));
  const greatestShare=closest.reduce((best,[,x])=>Math.max(best,x.share),0);
  return {results,preferred:new Set(closest.filter(([,x])=>x.share===greatestShare).map(([key])=>key))};
}

export function validateTraitTargets(targets) {
  if(targets===undefined)return;
  if(!targets||typeof targets!=='object'||Array.isArray(targets)||Object.entries(targets).some(([key,range])=>{
    let axis;
    try{axis=JSON.parse(key);}catch{return true;}
    return !Array.isArray(axis)||axis.length!==3||axis.some(part=>typeof part!=='string'||!part)||!isTargetRange(range);
  }))throw Error('表型目标区间设置无效');
}
