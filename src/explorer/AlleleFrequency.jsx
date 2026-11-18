import React from 'react';
import {alleleStats,percent} from './model.js';

const shade = (color,index) => index===0?'#dce5e5':
  `color-mix(in srgb, ${color} ${[0,100,65,38][index]}%, #fff)`;

export function alleleFrequencyText(stats) {
  return stats.alleleCounts.slice(1).map(a=>`${a.allele} ${percent(a.frequency)}`).join(' · ');
}
export function markerQuality(stats) {
  return `Missing ${percent(stats.missing)} · MAF ${percent(stats.maf)}`;
}
export function AlleleFrequency({variant,cohort,populations}) {
  if(!variant)return <p>当前无可计算位点。</p>;
  const stats=alleleStats(cohort,variant);
  const labels=stats.alleleCounts.map((a,i)=>`${i===0?'REF':'ALT'+(stats.alleleCounts.length>2?i:'')} ${a.allele}`);
  const showAll=stats.alleleCounts.length>2;
  return <>
    <div className="marker-quality" title="Missing：缺失等位数 / 预期等位数。MAF：第二常见等位在所有有效等位中的频率。">{markerQuality(stats)}{showAll&&<span>{alleleFrequencyText(stats)}</span>}</div>
    <div className="af-legend">{labels.map((label,i)=><span key={label}><i style={{background:shade('#377b9a',i)}}/>{label}</span>)}</div>
    <div className="pop-frequency">{populations.map(p=>{
      const s=alleleStats(cohort.filter(x=>x.population_id===p.id),variant);
      const text=[p.name,p.description,`n=${s.n}`,markerQuality(s),alleleFrequencyText(s)].filter(Boolean).join(' · ');
      return <div key={p.id} title={text} tabIndex={0} aria-label={text}>
        <div className="freq-label"><b><i style={{background:p.color}}/><span>{p.short_name||p.name}</span></b><strong>{percent(s.af)}</strong></div>
        <div className="af-bar">{s.called>0&&s.alleleCounts.map((a,i)=><div key={a.allele} style={{width:percent(a.frequency),background:shade(p.color,i)}}/>)}</div>
        <small>{s.alt} / {s.called} 有效 ALT · n={s.n} · {markerQuality(s)}{showAll&&' · '+alleleFrequencyText(s)}</small>
      </div>;
    })}</div>
  </>;
}
