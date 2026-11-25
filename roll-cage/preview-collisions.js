/* Advisory tube-envelope proximity checks for the DCB ENG 3D preview.
   Contacts near tube ends are treated as intended joints; midspan intrusions
   are reported for manual verification, NEVER used as structural sign-off. */
(function(root,factory){
  const check=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=check;
  if(root)root.dcbCageCollisionCheck=check;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const subtract=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const add=(a,b,t)=>[a[0]+b[0]*t,a[1]+b[1]*t,a[2]+b[2]*t];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const clamp=t=>Math.min(1,Math.max(0,t));
  function segmentClosest(p0,p1,q0,q1){
    const u=subtract(p1,p0),v=subtract(q1,q0),w=subtract(p0,q0);
    const a=dot(u,u),b=dot(u,v),c=dot(v,v),d=dot(u,w),e=dot(v,w);
    if(a<1e-9||c<1e-9)return null;
    const denom=a*c-b*b;
    let s=denom>1e-9?clamp((b*e-c*d)/denom):0;
    let t=clamp((b*s+e)/c);
    s=clamp((b*t-d)/a);
    t=clamp((b*s+e)/c);
    const p=add(p0,u,s),q=add(q0,v,t);
    return {distance:distance(p,q),p,q};
  }
  function valid(t){
    return t&&typeof t.id==='string'&&t.od>0&&Number.isFinite(t.od)&&
      Array.isArray(t.points)&&t.points.length>=2&&
      t.points.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite));
  }
  function nearEnd(p,tube){
    const ends=tube.points;
    // End attachments intentionally overlap parent tube envelopes.
    const tolerance=Math.max(50,2.0*tube.od);
    return distance(p,ends[0])<tolerance||distance(p,ends[ends.length-1])<tolerance;
  }
  function scan(tubes){
    if(!Array.isArray(tubes))return [];
    const validTubes=tubes.filter(valid).slice(0,80);
    const results=[];
    for(let i=0;i<validTubes.length;i++){
      const a=validTubes[i];
      for(let j=i+1;j<validTubes.length;j++){
        const b=validTubes[j];
        const threshold=(a.od+b.od)/2-1;
        if(threshold<=0)continue;
        let best=null;
        for(let x=1;x<a.points.length;x++){
          for(let y=1;y<b.points.length;y++){
            const hit=segmentClosest(a.points[x-1],a.points[x],b.points[y-1],b.points[y]);
            if(!hit||hit.distance>=threshold)continue;
            if(nearEnd(hit.p,a)||nearEnd(hit.q,b))continue;
            if(!best||hit.distance<best.distance)best=hit;
          }
        }
        if(best)results.push({
          a:a.id,b:b.id,
          labels:[a.label||a.id,b.label||b.id],
          clearance:Number((best.distance-(a.od+b.od)/2).toFixed(1)),
          point:best.p,
          kind:'review-midspan-contact'
        });
      }
    }
    return results.sort((a,b)=>a.clearance-b.clearance).slice(0,20);
  }
  return scan;
});