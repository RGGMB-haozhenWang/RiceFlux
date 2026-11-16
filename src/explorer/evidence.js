export const normalizeDOI=d=>String(d||'').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').toLowerCase();
export function evidenceRows(gene,evidence,literature=[]){
  const rows=new Map();
  function add(ds,role,event='',marker=''){
    for(const raw of ds||[]){const doi=normalizeDOI(raw);if(!/^10\.\d{4,9}\/\S+$/.test(doi))continue;
      if(!rows.has(doi))rows.set(doi,{doi,title:evidence.papers?.[raw]||evidence.papers?.[doi]||'',summaries:new Set(),roles:new Set(),event_ids:new Set(),markers:new Set()});
      const r=rows.get(doi);r.roles.add(role);if(event)r.event_ids.add(event);if(marker)r.markers.add(marker);
    }
  }
  add(gene.catalog?.geneDOI,'基因来源');add(gene.catalog?.backgroundDOI,'背景文献');add(evidence.genes?.[gene.id],'基因来源');
  for(const v of gene.variants){const s=evidence.sites?.[v.id];if(s){add(s.primary,'功能位点','',v.id);add(s.event,s.level,'',v.id);add(s.background,'背景文献','',v.id);}}
  for(const e of gene.catalog?.events||[])add(e.doi,'事件',e.key);
  for(const e of gene.records||[])add(evidence.events?.[e.id]?.doi||e.sources,'分型定义',e.id);
  for(const x of literature.filter(x=>x.gene_id===gene.id)){const doi=normalizeDOI(x.doi);add([doi],x.scope);if(x.summary)rows.get(doi)?.summaries.add(x.summary);}
  return [...rows.values()].map(r=>({...r,summary:[...r.summaries].join('；'),roles:[...r.roles].join('；'),event_ids:[...r.event_ids].join(';'),markers:[...r.markers].join(';')}));
}
export function eventRows(gene){
  const rows=new Map();
  for(const e of gene.catalog?.events||[]){
    // Only exact semantic duplicates merge. Unlocated events require their original label.
    const key=JSON.stringify([e.chr,e.pos,e.ref,e.state,e.trait,e.effect,e.type,(!e.pos||e.pos==='NA')?e.label:'']);
    if(!rows.has(key))rows.set(key,{...e,ids:new Set(),labels:new Set(),dois:new Set()});
    const r=rows.get(key);r.ids.add(e.key);if(e.label)r.labels.add(e.label);for(const d of e.doi)r.dois.add(normalizeDOI(d));
  }
  return [...rows.values()].map(r=>({...r,key:[...r.ids].join(';'),label:[...r.labels].join(' / '),doi:[...r.dois]}));
}
