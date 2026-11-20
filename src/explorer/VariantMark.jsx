import React from 'react';

const colors={SNP:'#2c6d9c',insertion:'#a55013',deletion:'#a55013',mixed:'#a55013'};
const paths={insertion:'M 0 -6 L 5.5 4 H -5.5 Z',deletion:'M -5.5 -4 H 5.5 L 0 6 Z',mixed:'M 0 -6 L 5.5 0 L 0 6 L -5.5 0 Z'};
export const markerNames={SNP:'SNP',insertion:'InDel 插入',deletion:'InDel 缺失',mixed:'InDel 混合等位'};

export function MarkerGlyph({kind}){
  const color=colors[kind];
  return kind==='SNP'?<circle r="4" fill={color}/>:<path d={paths[kind]} fill={kind==='deletion'?'#fff':color} stroke={color} strokeWidth="1.5"/>;
}

export function MarkerIcon({kind}){
  return <svg viewBox="-8 -8 16 16" className="variant-icon" width="15" height="15" aria-hidden="true" focusable="false"><MarkerGlyph kind={kind}/></svg>;
}
