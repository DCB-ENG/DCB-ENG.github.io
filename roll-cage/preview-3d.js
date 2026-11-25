/* DCB ENG: dependency-free, real WebGL tubular preview.
   Visualises the existing centreline geometry (not a cope or certified STEP solid).
   Dimensions and tube paths come only from the calculator's render event. */
(() => {
  'use strict';
  const mount=document.getElementById('cage3DMount');
  const twoD=document.getElementById('cage2DInterface');
  const to3D=document.getElementById('cageShow3D');
  const to2D=document.getElementById('cageShow2D');
  if(!mount||!twoD||!to3D||!to2D)return;

  const groupMeta={
    main:{label:'Main hoop',color:'#ff9f3e'},
    front:{label:'Front legs',color:'#d7e2e9'},
    brace:{label:'Hoop diagonals',color:'#5cc9e5'},
    stays:{label:'Rear stays',color:'#8bdfba'},
    header:{label:'Windscreen header',color:'#e8c579'},
    harness:{label:'Crossbars',color:'#a3c9ed'},
    door:{label:'Door bars',color:'#dca2cf'},
    roof:{label:'Roof braces',color:'#beaeff'},
    reinforcement:{label:'Pillar braces',color:'#d1d5dc'}
  };
  mount.innerHTML=
    '<div class="cage-3d-bar">'+
      '<div class="cage-3d-presets" role="group" aria-label="3D camera angle">'+
        '<button type="button" data-3d-view="iso" aria-pressed="true">Isometric</button>'+
        '<button type="button" data-3d-view="front" aria-pressed="false">Front</button>'+
        '<button type="button" data-3d-view="side" aria-pressed="false">Side</button>'+
        '<button type="button" data-3d-view="top" aria-pressed="false">Top</button>'+
      '</div>'+
      '<div class="cage-3d-tools">'+
        '<button type="button" id="cage3DReset" title="Reset orbit, zoom and pan">Reset view</button>'+
        '<button type="button" id="cage3DExport" title="Save the visible 3D view as a PNG">Save PNG</button>'+
      '</div>'+
    '</div>'+
    '<div class="cage-3d-canvas-wrap">'+
      '<canvas id="cage3DCanvas" aria-label="Rotatable 3D roll cage tube preview. Drag to orbit; scroll to zoom."></canvas>'+
      '<div class="cage-3d-orientation">X: across · Y: up · Z: rear</div>'+
      '<div id="cage3DMessage" class="cage-3d-overlay" hidden></div>'+
    '</div>'+
    '<div class="cage-3d-bottom">'+
      '<p class="cage-3d-help">Drag to orbit · Wheel/pinch to zoom · Shift-drag to pan. Tubes have scaled outside diameters.</p>'+
      '<div class="cage-3d-visibility"><strong>Show in preview</strong><div id="cage3DGroups" class="cage-3d-group-grid"></div></div>'+
      '<p id="cage3DWarnings" class="cage-3d-warnings" role="status" hidden></p>'+
      '<p class="cage-3d-disclaimer">Visual geometry only: end copes, welded joints, mounting feet and wall thickness are not modelled here. Use the measured fabrication sheets, not this preview, for cutting.</p>'+
    '</div>';
  const canvas=document.getElementById('cage3DCanvas');
  const overlay=document.getElementById('cage3DMessage');
  const groupsContainer=document.getElementById('cage3DGroups');
  const warnings=document.getElementById('cage3DWarnings');
  const gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true});
  if(!gl){
    overlay.textContent='3D rendering requires WebGL. Your 2D drawings are still available.';
    overlay.hidden=false;
    to3D.disabled=true;
    mount.hidden=true;
    return;
  }

  const vertexSource=[
    'attribute vec3 aPosition;',
    'attribute vec3 aNormal;',
    'uniform mat4 uMVP;',
    'uniform mat3 uRotation;',
    'varying vec3 vNormal;',
    'void main(){',
    '  gl_Position=uMVP*vec4(aPosition,1.0);',
    '  vNormal=normalize(uRotation*aNormal);',
    '}'
  ].join('\n');
  const fragmentSource=[
    'precision mediump float;',
    'uniform vec3 uColor;',
    'uniform float uIsLine;',
    'varying vec3 vNormal;',
    'void main(){',
    '  if(uIsLine>0.5){ gl_FragColor=vec4(uColor,1.0); return; }',
    '  vec3 n=normalize(vNormal);',
    '  float diffuse=max(dot(n,normalize(vec3(-0.3,0.75,0.9))),0.0);',
    '  float shine=pow(max(dot(n,normalize(vec3(0.4,0.5,0.7))),0.0),16.0)*0.24;',
    '  gl_FragColor=vec4(min(vec3(1.0),uColor*(0.46+0.54*diffuse)+shine),1.0);',
    '}'
  ].join('\n');
  function compile(type,source){
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
      const reason=gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('3D shader: '+reason);
    }
    return shader;
  }
  let program;
  try{
    program=gl.createProgram();
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  }catch(error){
    overlay.textContent='3D preview could not initialise: '+error.message;
    overlay.hidden=false;to3D.disabled=true;mount.hidden=true;
    return;
  }
  gl.useProgram(program);
  const aPosition=gl.getAttribLocation(program,'aPosition');
  const aNormal=gl.getAttribLocation(program,'aNormal');
  const uMVP=gl.getUniformLocation(program,'uMVP');
  const uRotation=gl.getUniformLocation(program,'uRotation');
  const uColor=gl.getUniformLocation(program,'uColor');
  const uIsLine=gl.getUniformLocation(program,'uIsLine');
  gl.enableVertexAttribArray(aPosition);
  gl.enableVertexAttribArray(aNormal);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);
  const xyz=(x,y,z)=>[x,y,z];
  const sub=(a,b)=>xyz(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const cross=(a,b)=>xyz(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]);
  const normalize=a=>{
    const l=Math.hypot(a[0],a[1],a[2]);
    return l>1e-8?xyz(a[0]/l,a[1]/l,a[2]/l):xyz(1,0,0);
  };
  const addScaled=(a,b,k)=>xyz(a[0]+b[0]*k,a[1]+b[1]*k,a[2]+b[2]*k);
  const fromHex=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);

  function buffer(values){
    const b=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);
    return b;
  }
  function dispose(mesh){
    gl.deleteBuffer(mesh.positions);gl.deleteBuffer(mesh.normals);
  }
  function meshForTube(tube){
    const source=tube.points||[],points=[];
    for(const raw of source){
      if(!Array.isArray(raw)||raw.length!==3||!raw.every(Number.isFinite))continue;
      if(points.length&&Math.hypot(...sub(raw,points[points.length-1]))<1e-5)continue;
      points.push(raw);
    }
    if(points.length<2||!Number.isFinite(tube.od)||tube.od<=0)return null;
    const sides=12,radius=tube.od/2,positions=[],normals=[];
    const tangents=points.map((p,i)=>normalize(sub(points[Math.min(points.length-1,i+1)],points[Math.max(0,i-1)])));
    const rings=[],ringNormals=[];
    let basis;
    for(let i=0;i<points.length;i++){
      const t=tangents[i];
      if(!basis){
        const reference=Math.abs(dot(t,[0,1,0]))>0.88?[0,0,1]:[0,1,0];
        basis=normalize(cross(t,reference));
      }else{
        const projected=sub(basis,t.map(value=>value*dot(basis,t)));
        basis=normalize(projected);
      }
      const other=normalize(cross(t,basis)),ring=[],ringNormal=[];
      for(let j=0;j<sides;j++){
        const theta=2*Math.PI*j/sides;
        const n=normalize(basis.map((v,k)=>v*Math.cos(theta)+other[k]*Math.sin(theta)));
        ringNormal.push(n);
        ring.push(addScaled(points[i],n,radius));
      }
      rings.push(ring);ringNormals.push(ringNormal);
    }
    function vertex(p,n){positions.push(...p);normals.push(...n);}
    function triangle(pa,na,pb,nb,pc,nc){vertex(pa,na);vertex(pb,nb);vertex(pc,nc);}
    for(let i=0;i<points.length-1;i++){
      for(let j=0;j<sides;j++){
        const next=(j+1)%sides;
        triangle(rings[i][j],ringNormals[i][j],rings[i+1][j],ringNormals[i+1][j],rings[i+1][next],ringNormals[i+1][next]);
        triangle(rings[i][j],ringNormals[i][j],rings[i+1][next],ringNormals[i+1][next],rings[i][next],ringNormals[i][next]);
      }
    }
    for(const end of [0,points.length-1]){
      const sign=end===0?-1:1,normal=tangents[end].map(v=>v*sign);
      for(let j=0;j<sides;j++)triangle(points[end],normal,rings[end][j],normal,rings[end][(j+1)%sides],normal);
    }
    return {positions:buffer(positions),normals:buffer(normals),count:positions.length/3,group:tube.group,label:tube.label,od:tube.od};
  }

  function identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
  function multiply(a,b){
    const result=new Float32Array(16);
    for(let col=0;col<4;col++)for(let row=0;row<4;row++)
      for(let k=0;k<4;k++)result[col*4+row]+=a[k*4+row]*b[col*4+k];
    return result;
  }
  function rotateY(t){
    const m=identity(),c=Math.cos(t),s=Math.sin(t);
    m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m;
  }
  function rotateX(t){
    const m=identity(),c=Math.cos(t),s=Math.sin(t);
    m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m;
  }
  function translate(x,y,z){
    const m=identity();m[12]=x;m[13]=y;m[14]=z;return m;
  }
  function ortho(left,right,bottom,top,near,far){
    const m=identity();
    m[0]=2/(right-left);m[5]=2/(top-bottom);m[10]=-2/(far-near);
    m[12]=-(right+left)/(right-left);m[13]=-(top+bottom)/(top-bottom);m[14]=-(far+near)/(far-near);
    return m;
  }

  let meshes=[],grid=null,scene=null,center=[0,600,0],fitRadius=900;
  let yaw=0.68,pitch=0.4,zoom=1,panX=0,panY=0;
  let currentMode='2d',scheduled=false;
  let visible=new Set(),previousGroups=new Set(),visibilityTouched=false;
  function setMode(mode){
    currentMode=mode;
    mount.hidden=mode!=='3d';
    twoD.hidden=mode==='3d';
    to3D.setAttribute('aria-pressed',String(mode==='3d'));
    to2D.setAttribute('aria-pressed',String(mode!=='3d'));
    if(mode==='3d')requestDraw();
  }
  to3D.addEventListener('click',()=>setMode('3d'));
  to2D.addEventListener('click',()=>setMode('2d'));

  const presets={
    iso:[0.68,0.4],front:[Math.PI,0],side:[Math.PI/2,0],top:[Math.PI,Math.PI/2-0.001]
  };
  function applyPreset(key){
    const values=presets[key];if(!values)return;
    [yaw,pitch]=values;
    panX=0;panY=0;
    for(const button of mount.querySelectorAll('[data-3d-view]'))
      button.setAttribute('aria-pressed',String(button.dataset['3dView']===key));
    requestDraw();
  }
  for(const button of mount.querySelectorAll('[data-3d-view]'))
    button.addEventListener('click',()=>applyPreset(button.dataset['3dView']));
  document.getElementById('cage3DReset').addEventListener('click',()=>{
    zoom=1;applyPreset('iso');
  });

  function gridBuffers(maxRadius){
    const size=Math.max(750,Math.ceil(maxRadius/250)*250);
    const values=[];
    for(let k=-size;k<=size;k+=250){
      values.push(-size,-9,k,size,-9,k,k,-9,-size,k,-9,size);
    }
    const normals=[];
    for(let i=0;i<values.length;i+=3)normals.push(0,1,0);
    return {positions:buffer(values),normals:buffer(normals),count:values.length/3};
  }
  function updateScene(snapshot){
    if(!snapshot||!Array.isArray(snapshot.tubes))return;
    scene=snapshot;
    for(const mesh of meshes)dispose(mesh);
    meshes=snapshot.tubes.map(meshForTube).filter(Boolean);
    if(grid)dispose(grid);
    const positions=snapshot.tubes.flatMap(t=>t.points||[]).filter(p=>p.length===3&&p.every(Number.isFinite));
    if(positions.length){
      const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
      for(const p of positions)for(let i=0;i<3;i++){
        low[i]=Math.min(low[i],p[i]);high[i]=Math.max(high[i],p[i]);
      }
      center=low.map((v,i)=>(v+high[i])/2);
      fitRadius=Math.max(250,Math.hypot(...high.map((v,i)=>(v-low[i])/2))+45);
    }
    grid=gridBuffers(fitRadius*1.15);
    const groups=[...new Set(meshes.map(m=>m.group))];
    if(!visibilityTouched)visible=new Set(groups);
    else for(const name of groups)if(!previousGroups.has(name))visible.add(name);
    previousGroups=new Set(groups);
    groupsContainer.replaceChildren();
    for(const name of groups){
      const meta=groupMeta[name]||{label:name,color:'#d6e1e7'};
      const label=document.createElement('label');
      label.className='cage-3d-group';
      const checkbox=document.createElement('input');
      checkbox.type='checkbox';checkbox.checked=visible.has(name);
      const dot=document.createElement('span');
      dot.className='cage-3d-group-dot';dot.style.background=meta.color;
      const title=document.createElement('span');
      title.textContent=meta.label;
      checkbox.addEventListener('change',()=>{
        visibilityTouched=true;
        if(checkbox.checked)visible.add(name);else visible.delete(name);
        requestDraw();
      });
      label.append(checkbox,dot,title);
      groupsContainer.append(label);
    }
    warnings.hidden=!snapshot.issues?.length;
    warnings.textContent=snapshot.issues?.length?
      'Some selected members could not be calculated: '+snapshot.issues.slice(0,3).join(' · '):'';
    overlay.hidden=meshes.length>0;
    if(!meshes.length)overlay.textContent=snapshot.issues?.join(' · ')||'Enable and dimension cage members to view the 3D model.';
    requestDraw();
  }

  function setBuffers(mesh){
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.positions);
    gl.vertexAttribPointer(aPosition,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.normals);
    gl.vertexAttribPointer(aNormal,3,gl.FLOAT,false,0,0);
  }
  function resize(){
    const rect=canvas.getBoundingClientRect();
    if(rect.width<1||rect.height<1)return false;
    const ratio=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    gl.viewport(0,0,w,h);
    return true;
  }
  function render(){
    scheduled=false;
    if(currentMode!=='3d'||!resize())return;
    const width=canvas.width,height=canvas.height,aspect=width/height;
    const halfY=(fitRadius*1.11/zoom)*Math.max(1,1/aspect);
    const halfX=halfY*aspect;
    const projection=ortho(-halfX+panX,halfX+panX,-halfY+panY,halfY+panY,-20000,20000);
    const rotation=multiply(rotateX(pitch),rotateY(yaw));
    const model=multiply(rotation,translate(-center[0],-center[1],-center[2]));
    const mvp=multiply(projection,model);
    gl.clearColor(0.055,0.078,0.098,1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(uMVP,false,mvp);
    gl.uniformMatrix3fv(uRotation,false,new Float32Array([
      rotation[0],rotation[1],rotation[2],rotation[4],rotation[5],rotation[6],rotation[8],rotation[9],rotation[10]
    ]));
    if(grid){
      gl.uniform1f(uIsLine,1);
      gl.uniform3fv(uColor,[0.19,0.25,0.29]);
      setBuffers(grid);
      gl.drawArrays(gl.LINES,0,grid.count);
    }
    gl.uniform1f(uIsLine,0);
    for(const mesh of meshes){
      if(!visible.has(mesh.group))continue;
      const meta=groupMeta[mesh.group]||{color:'#d6e1e7'};
      gl.uniform3fv(uColor,fromHex(meta.color));
      setBuffers(mesh);
      gl.drawArrays(gl.TRIANGLES,0,mesh.count);
    }
  }
  function requestDraw(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(render);
  }
  if('ResizeObserver' in window)new ResizeObserver(requestDraw).observe(canvas);
  else window.addEventListener('resize',requestDraw);

  // Mouse, pen and touch controls use browser pointer events (no external libs).
  const pointers=new Map();
  let lastDistance=0;
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0&&event.button!==2)return;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,pan:event.shiftKey||event.button===2});
    if(pointers.size===2){
      const coords=[...pointers.values()];
      lastDistance=Math.hypot(coords[0].x-coords[1].x,coords[0].y-coords[1].y);
    }
  });
  canvas.addEventListener('pointermove',event=>{
    const previous=pointers.get(event.pointerId);
    if(!previous)return;
    const dx=event.clientX-previous.x,dy=event.clientY-previous.y;
    previous.x=event.clientX;previous.y=event.clientY;
    if(pointers.size===1){
      if(previous.pan){
        const pixelHeight=Math.max(1,canvas.clientHeight);
        const halfY=(fitRadius*1.11/zoom)*Math.max(1,canvas.clientHeight/Math.max(1,canvas.clientWidth));
        panX-=dx*2*halfY/pixelHeight;
        panY+=dy*2*halfY/pixelHeight;
      }else{
        yaw+=dx*0.008;
        pitch=Math.max(-1.52,Math.min(1.52,pitch+dy*0.008));
      }
    }else if(pointers.size===2){
      const coords=[...pointers.values()];
      const distance=Math.hypot(coords[0].x-coords[1].x,coords[0].y-coords[1].y);
      if(lastDistance>10&&distance>10)zoom=Math.max(0.28,Math.min(8,zoom*distance/lastDistance));
      lastDistance=distance;
    }
    requestDraw();
  });
  function finishPointer(event){
    pointers.delete(event.pointerId);
    lastDistance=0;
  }
  canvas.addEventListener('pointerup',finishPointer);
  canvas.addEventListener('pointercancel',finishPointer);
  canvas.addEventListener('lostpointercapture',finishPointer);
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('wheel',event=>{
    if(currentMode!=='3d')return;
    event.preventDefault();
    zoom=Math.max(0.28,Math.min(8,zoom*Math.exp(-event.deltaY*0.001)));
    requestDraw();
  },{passive:false});
  document.getElementById('cage3DExport').addEventListener('click',()=>{
    if(!meshes.length)return;
    render();
    canvas.toBlob(blob=>{
      if(!blob)return;
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;link.download='roll-cage-3d-preview.png';
      document.body.appendChild(link);
      link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    },'image/png');
  });
  window.addEventListener('dcb:cage-3d-update',event=>updateScene(event.detail));
  updateScene(window.dcbCage3DSnapshot||{tubes:[],issues:['Calculate a valid main hoop to generate the 3D view.']});
  setMode('3d');
})();