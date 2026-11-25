import React, {useMemo, useState} from 'react';
import {isCross,materialKey} from './breeder.js';
import {matchesMaterial} from './formats.js';
import {useText} from './locale.jsx';
import {defaultCheckBand} from './phenotypeCheck.js';

export const checkCultivarName = sample => [sample.name,sample.source_sample_id??sample.id,sample.dataset_name]
  .filter((part,index,parts)=>part&&parts.indexOf(part)===index).join(' · ');

export function CheckCultivar({individuals,check,sample,onChange}) {
  const t=useText();
  const [query,setQuery]=useState('');
  const [open,setOpen]=useState(false);
  const matches=useMemo(()=>{
    if(!open||!query.trim())return [];
    const result=[];
    for(const s of individuals){
      if(!isCross(s)&&matchesMaterial(s,query)&&Object.values(s.phenotypes).some(Number.isFinite))result.push(s);
      if(result.length===12)break;
    }
    return result;
  },[individuals,open,query]);

  return <div className="phenotype-check">
    <details open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
      <summary>{t("对照品种")}{sample?' · '+checkCultivarName(sample):''}</summary>
      <div className="check-cultivar-search">
        <input type="search" aria-label={t("查找对照品种")} placeholder={t("输入品种名或编号")} value={query}
          onChange={e=>setQuery(e.target.value)}/>
        {query.trim()&&matches.length===0&&<p>{t("未找到有实测表型的品种")}</p>}
        {matches.map(s=><button type="button" key={materialKey(s)} aria-pressed={check?.key===materialKey(s)}
          onClick={()=>{onChange({key:materialKey(s),bandPct:check?.bandPct??defaultCheckBand});setQuery('');setOpen(false);}}>
          {checkCultivarName(s)}
        </button>)}
      </div>
    </details>
    {check&&<><label>{t("实测值 ±")} <input type="number" min="0" max="100" step="any"
      aria-label={t("对照蒙版百分比")} key={check.key} defaultValue={check.bandPct} onBlur={e=>{
        const n=e.target.valueAsNumber;
        if(Number.isFinite(n)&&n>=0&&n<=100)onChange({...check,bandPct:n});
        else e.target.value=check.bandPct;
      }} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/> %</label>
      <button type="button" onClick={()=>onChange(null)}>{t("清除对照")}</button>
      {!sample&&<small>{t("对照品种所在的数据集当前未加载")}</small>}
    </>}
  </div>;
}
