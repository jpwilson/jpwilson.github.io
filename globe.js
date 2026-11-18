/* Geographic texture: Natural Earth public-domain land polygons; rendered locally.
   The globe is cached at 15 fps. Node motion still runs with the main canvas. */
const globeMap=new Image(),globeSurface=document.createElement('canvas'),globeRaster=document.createElement('canvas');
globeSurface.width=1024;globeSurface.height=512;globeRaster.width=globeRaster.height=280;
const globePixels=globeRaster.getContext('2d').createImageData(280,280),globeSamples=[];
let globeTexture=null,globeYaw=-.15,globeStamp=-1,globeLastTime=0;
for(let y=0;y<280;y++)for(let x=0;x<280;x++){
  const nx=(x-139.5)/139,ny=(y-139.5)/139,d=nx*nx+ny*ny;if(d>1)continue;
  const nz=Math.sqrt(1-d),tilt=.18,yy=ny*Math.cos(tilt)-nz*Math.sin(tilt),zz=ny*Math.sin(tilt)+nz*Math.cos(tilt);
  globeSamples.push([(y*280+x)*4,Math.atan2(nx,zz),Math.floor((.5+Math.asin(yy)/Math.PI)*511),
    .66+.34*Math.max(0,-nx*.45-ny*.55+nz*.7),Math.min(1,(1-Math.sqrt(d))*139)]);
}
globeMap.onload=()=>{const g=globeSurface.getContext('2d',{willReadFrequently:true});g.drawImage(globeMap,0,0,1024,512);globeTexture=g.getImageData(0,0,1024,512).data;globeStamp=-1};
globeMap.src='assets/earth-map.svg';
function drawGlobe(x,y,r,alpha,now){
  if(!globeTexture){ball(x,y,r,'#237bb1',alpha);return}
  const located=focus===byId.earth&&(hover&&hover.geo?hover:active&&active.geo?active:null);
  if(located&&!(down&&down.globe)){const target=located.geo[1]*Math.PI/180,delta=Math.atan2(Math.sin(target-globeYaw),Math.cos(target-globeYaw));globeYaw+=delta*(reduce?1:.08)}
  const stamp=reduce?globeYaw:Math.floor(now/66);
  if(stamp!==globeStamp){
    if(!located&&!reduce&&!down&&!hover&&globeLastTime)globeYaw+=Math.min(100,now-globeLastTime)*.000065;
    globeLastTime=now;globeStamp=stamp;
    const out=globePixels.data,tau=Math.PI*2;
    for(const [i,lon,row,shade,edge] of globeSamples){
      const u=((lon+globeYaw)/tau+.5)%1,col=Math.floor(((u+1)%1)*1024),j=(row*1024+col)*4;
      out[i]=globeTexture[j]*shade;out[i+1]=globeTexture[j+1]*shade;out[i+2]=globeTexture[j+2]*shade;out[i+3]=255*edge;
    }
    globeRaster.getContext('2d').putImageData(globePixels,0,0);
  }
  ctx.save();ctx.globalAlpha=alpha;
  const glow=ctx.createRadialGradient(x,y,r*.9,x,y,r*1.2);glow.addColorStop(0,'#d6fff060');glow.addColorStop(1,'#d6fff000');
  ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,r*1.2,0,Math.PI*2);ctx.fill();
  ctx.shadowColor='#154a4840';ctx.shadowBlur=r*.3;ctx.shadowOffsetY=r*.12;
  ctx.drawImage(globeRaster,x-r,y-r,r*2,r*2);ctx.shadowColor='transparent';
  ctx.strokeStyle='#e0fff288';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.restore();
}

// Keep the existing 3D graph and its spring motion. Resolve projected label
// collisions locally, so a large travel branch can breathe without a new UI.
function relaxPlaces(){
  const visibleNodes=nodes.filter(n=>n.branch===byId.earth&&n.a>.1),earth=byId.earth;
  const top=phone?112:86,bottom=H-42;
  const boxes=visibleNodes.map(n=>{
    const r=n===earth?n.rr*n.s[3]+12:Math.max(12,n.rr*n.s[3]),side=n.s[0]>=cx?1:-1;
    font(n===focus?700:n.depth===2?600:500,n===focus?21:n.depth===2?16:14);
    const w=n===earth?r*2:ctx.measureText(n.label).width+r*2+24;
    return {n,x:n.s[0],y:n.s[1],r,w,h:n===earth?r*2+30:36,side};
  });
  const bounds=b=>({x:b.n===earth?b.x-b.r:b.side>0?b.x-b.r:b.x+b.r-b.w,y:b.y-b.h/2,w:b.w,h:b.h});
  for(let pass=0;pass<16;pass++){
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i],b=boxes[j],A=bounds(a),B=bounds(b),ox=Math.min(A.x+A.w,B.x+B.w)-Math.max(A.x,B.x),oy=Math.min(A.y+A.h,B.y+B.h)-Math.max(A.y,B.y);
      if(ox<=0||oy<=0)continue;
      const fixedA=a.n===earth,fixedB=b.n===earth,weight=fixedA||fixedB?1:.5;
      if(ox<oy&&!(fixedA||fixedB)){const d=(a.x<b.x?-1:1)*(ox+3)*weight;a.x+=d;b.x-=d}
      else{const d=(a.y<b.y?-1:1)*(oy+3)*weight;if(!fixedA)a.y+=d;if(!fixedB)b.y-=d}
    }
    for(const b of boxes){if(b.n===earth)continue;const B=bounds(b);b.x+=Math.max(0,18-B.x)-Math.max(0,B.x+B.w-W+18);b.y=Math.max(top+b.h/2,Math.min(bottom-b.h/2,b.y))}
  }
  for(const b of boxes){const n=b.n;n.f=1;n.placeSide=b.side;
    if(!n.sp)n.sp=[b.x,b.y];const k=reduce?1:.2;
    n.sp[0]+=(b.x-n.sp[0])*k;n.sp[1]+=(b.y-n.sp[1])*k;n.s[0]=n.sp[0];n.s[1]=n.sp[1];
  }
}
function drawPlacePin(){
  const n=hover&&hover.geo?hover:active&&active.geo?active:null;if(!n||n.a<.5)return;
  const earth=byId.earth,r=earth.r;if(!r)return;
  const lat=n.geo[0]*Math.PI/180,lon=n.geo[1]*Math.PI/180-globeYaw;
  const x=Math.cos(lat)*Math.sin(lon),y=-Math.sin(lat),z=Math.cos(lat)*Math.cos(lon),tilt=.18;
  const yy=y*Math.cos(tilt)+z*Math.sin(tilt),zz=-y*Math.sin(tilt)+z*Math.cos(tilt);if(zz<=.03)return;
  const px=earth.s[0]+x*r,py=earth.s[1]+yy*r,[nx,ny]=n.s;
  ctx.save();ctx.globalAlpha=Math.min(1,zz*4);ctx.beginPath();ctx.moveTo(px,py);
  ctx.quadraticCurveTo((px+nx)/2,(py+ny)/2-Math.min(60,Math.abs(nx-px)*.2),nx,ny);
  ctx.strokeStyle='#173c3b88';ctx.lineWidth=1.3;ctx.stroke();
  ctx.beginPath();ctx.arc(px,py,3.5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#174052';ctx.lineWidth=1;ctx.stroke();ctx.restore();
}
