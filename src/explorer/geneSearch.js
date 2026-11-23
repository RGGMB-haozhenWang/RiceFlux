const normalize=x=>String(x??'').toLowerCase().replace(/[\s_./;；-]/g,'');
export function geneScore(g,query){
  const terms=query.trim().split(/\s+/).filter(Boolean).map(normalize);
  if(!terms.length)return 1;
  const ids=[g.id,g.catalog?.msu,g.catalog?.rap,g.catalog?.sourceId].filter(Boolean).map(normalize);
  const names=[g.name,...g.catalog?.aliases||[],...g.catalog?.originalNames||[]].map(normalize);
  if(terms.length===1&&ids.includes(terms[0]))return 100;
  if(terms.length===1&&names.includes(terms[0]))return 90;
  const fields=[...ids,...names];
  return terms.every(t=>fields.some(f=>f.includes(t)))?50:0;
}
export function findGenes(genes,query){return genes.map(g=>({g,score:geneScore(g,query)})).filter(r=>r.score).sort((a,b)=>b.score-a.score||a.g.name.localeCompare(b.g.name)).map(r=>r.g);}

// Suggestions never establish identity. Callers must inspect status before binding data.
export function resolveGeneQuery(genes,query){
  const q=String(query??'').trim().toLowerCase();
  if(!q)return {status:'unresolved',gene:null,suggestions:[]};
  const exact=genes.filter(g=>[g.id,g.catalog?.msu,g.catalog?.rap,g.catalog?.sourceId,g.name,...g.catalog?.aliases||[],...g.catalog?.originalNames||[]]
    .filter(Boolean).some(x=>String(x).trim().toLowerCase()===q));
  if(exact.length===1)return {status:'exact',gene:exact[0],suggestions:exact};
  if(exact.length>1)return {status:'ambiguous',gene:null,suggestions:exact};
  return {status:'unresolved',gene:null,suggestions:findGenes(genes,query)};
}
