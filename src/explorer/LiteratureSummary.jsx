import React from 'react';
export function LiteratureSummary({gene,literature=[],dois}){
 const ids=[gene.id,gene.catalog?.msu];
 const rows=literature.filter(r=>ids.includes(r.gene_id)&&(!dois||dois.includes(r.doi)));
 if(!rows.length)return null;
 return <div className="literature-summaries">{rows.map(r=><div key={r.doi}><p>{r.summary}</p><small>{r.scope} · <a href={'https://doi.org/'+r.doi} target="_blank" rel="noreferrer">{r.doi} ↗</a></small></div>)}</div>;
}
