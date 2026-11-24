import {useText} from './locale.jsx';
import React from 'react';
import {showFrequencyGroup} from './researcherUi.js';
import {alleleStats,percent} from './model.js';
import {markerAnnotation} from './alleles.js';
import {MarkerIcon,markerNames} from './VariantMark.jsx';

const shade = (color,index) => index===0?'#dce5e5':
  `color-mix(in srgb, ${color} ${[0,100,65,38][index]}%, #fff)`;

export function alleleFrequencyText(stats) {
  return stats.alleleCounts.slice(1).map(a=>`${a.allele} ${percent(a.frequency)}`).join(' · ');
}
export const missingPercent=n=>n>0&&n<.001?(n*100).toPrecision(2)+'%':percent(n);
export function markerQuality(stats) {
  return `Missing ${missingPercent(stats.missing)} · MAF ${percent(stats.maf)}`;
}
export function AlleleFrequency({variant,cohort,populations,showSummary=true}) {
  const localize = useText();
  if(!variant)return <p>{localize("当前无可计算位点。")}</p>;
  const stats=alleleStats(cohort,variant);
  const {kind,ref,alts}=markerAnnotation(variant);
  const labels=['REF '+ref,...alts.map((allele,i)=>`ALT${alts.length>1?i+1:''} ${allele}`)];
  const showAll=stats.alleleCounts.length>2;
  return <>
    {showSummary&&<div className="marker-quality" title={localize("Missing：缺失等位数 / 预期等位数。MAF：第二常见等位在所有有效等位中的频率。")}>
      <span><MarkerIcon kind={kind}/>{localize(markerNames[kind])}</span>{localize(markerQuality(stats))}{showAll&&<span>{localize(alleleFrequencyText(stats))}</span>}
    </div>}
    <div className={kind==='SNP'?'af-legend':'af-legend indel-alleles'}>{labels.map((label,i)=><span key={label}><i style={{background:shade('#377b9a',i)}}/>{localize(label)}</span>)}</div>
    <div className="pop-frequency">{populations.map(p=>{
      const s=alleleStats(cohort.filter(x=>x.population_id===p.id),variant);
      if(!showFrequencyGroup(s))return null;
      const text=[p.name,p.description,`n=${s.n}`,markerQuality(s),alleleFrequencyText(s)].filter(Boolean).join(' · ');
      return <div key={p.id} title={localize(text)} tabIndex={0} aria-label={localize(text)}>
        <div className="freq-label"><b><i style={{background:p.color}}/><span>{localize(p.short_name||p.name)}</span></b><strong>{localize(percent(s.af))}</strong></div>
        <div className={s.called?"af-bar":"af-bar af-missing"} aria-label={s.called?undefined:localize("无有效调用")}>{s.called>0&&s.alleleCounts.map((a,i)=><div key={a.allele} style={{width:percent(a.frequency),background:shade(p.color,i)}}/>)}</div>
        <small>{localize(s.alt)} / {localize(s.called)}{" "+localize("有效 ALT · n=")}{localize(s.n)} · {localize(markerQuality(s))}{localize(showAll&&' · '+alleleFrequencyText(s))}</small>
      </div>;
    })}</div>
  </>;
}
