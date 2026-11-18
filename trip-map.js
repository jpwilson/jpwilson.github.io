// Each local Natural Earth texture covers [west, south, east, north] in degrees.
// The regional texture and its pins share the globe's orthographic camera.
const tripRegions={
  ontario:[-82,41.3,-77,45.4],california:[-131,27,-109,44],plains:[-108,25,-84,45],
  switzerland:[4.2,44.6,12.2,49.1],thailand:[81,-4,122,32],mozambique:[28,-29,38,-21],
  argentina:[-114,-82,-14,9],india:[21,-11,110,55],surrey:[-2.2,50.1,1.1,52.5],
  caribbean:[-111,3,-69,43],'south-africa':[9,-43,39,-18],us:[-143,16,-42,69]
};
const tripTextures={t1998:'plains',t2001:'switzerland',t2007:'thailand',t2008:'mozambique',
  t2011:'argentina','t2014-us':'plains',t2015:'india','t2016-ca':'ontario',t2016:'california',
  't2024-uk':'surrey','t2024-ch':'switzerland',t2025:'caribbean',tza:'south-africa','tus-other':'us'};
const tripDegrees=Math.PI/180;
let tripView=null;

function tripFrame(stops,region){
  const [west,south,east,north]=tripRegions[region]||[-180,-90,180,90];
  const mid=values=>(Math.min(...values)+Math.max(...values))/2;
  const lat=stops.length?mid(stops.map(n=>n.geo[0])):(north+south)/2;
  const lon=stops.length?mid(stops.map(n=>n.geo[1])):(east+west)/2;
  // When the itinerary names only a country, frame the country without adding a city pin.
  let radius=stops.length?1.25:(region==='switzerland'?2.4:12);
  if(stops.length>1)radius=Math.max(.22,...stops.map(n=>Math.hypot(n.geo[0]-lat,(n.geo[1]-lon)*Math.cos(lat*tripDegrees))))/.71;
  return {lat,lon,zoom:1/Math.sin(radius*tripDegrees)};
}

function selectTripView(n){
  let trip=n;
  while(trip&&trip.parent!==byId.visited)trip=trip.parent;
  const region=trip&&tripTextures[trip.id];
  if(!trip){tripView=null;return}
  if(tripView&&tripView.trip===trip){
    if(n===trip){Object.assign(tripView.target,tripView.frame)}
    return;
  }
  const stops=[];
  function collect(node){if(node.geo)stops.push(node);node.kids.forEach(collect)}
  trip.kids.forEach(collect);
  if(!stops.length&&!region){tripView=null;return}
  const frame=tripFrame(stops,region);
  const unused=PAL.filter(h=>h!==trip.branch.hueVar);
  const colors=new Map();
  for(const stop of stops){
    const preferred=hueOf(stop),hue=unused.includes(preferred)?preferred:(unused[0]||preferred);
    colors.set(stop,hue);if(unused.includes(hue))unused.splice(unused.indexOf(hue),1);
  }
  const from=tripView?{...tripView.camera}:{lon:globeYaw/tripDegrees,lat:.18/tripDegrees,zoom:1};
  const view={trip,region,stops,frame,colors,camera:{...from},target:{...frame},surface:document.createElement('canvas'),
    pixels:null,texture:null,hits:[],lastPaint:-Infinity,lastFrame:performance.now()};
  tripView=view;
  if(!region)return;
  const image=new Image();
  image.onload=()=>{
    if(tripView!==view)return;
    const tile=document.createElement('canvas');tile.width=image.width;tile.height=image.height;
    const g=tile.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0);
    view.texture=g.getImageData(0,0,tile.width,tile.height);view.cacheKey='';
  };
  image.src='assets/trips/'+region+'.webp';
}

function zoomTrip(factor){
  const v=tripView;
  v.target.zoom=Math.max(1,Math.min(v.frame.zoom*5,v.target.zoom*factor));
}
function panTrip(dx,dy){
  const v=tripView,r=v.radius||100;
  const degreesPerPixel=1/(r*v.camera.zoom*tripDegrees);
  v.target.lon-=dx*degreesPerPixel/Math.max(.12,Math.cos(v.camera.lat*tripDegrees));
  v.target.lat=Math.max(-85,Math.min(85,v.target.lat+dy*degreesPerPixel));
}

function moveTripCamera(v,now){
  const dt=Math.min(100,Math.max(0,now-v.lastFrame));v.lastFrame=now;
  const k=reduce?1:1-Math.exp(-dt/135),c=v.camera,t=v.target;
  const delta=((t.lon-c.lon+180)%360+360)%360-180;
  c.lon=Math.abs(delta)<.00001?t.lon:c.lon+delta*k;
  c.lat+=Math.abs(t.lat-c.lat)<.00001?t.lat-c.lat:(t.lat-c.lat)*k;
  // Zoom logarithmically, letting the globe turn toward the country during the approach.
  const ratio=Math.log(t.zoom/c.zoom);
  c.zoom=Math.abs(ratio)<.0001?t.zoom:c.zoom*Math.exp(ratio*k);
}
function tripPoint(geo,c){
  const lat=geo[0]*tripDegrees,lon=(geo[1]-c.lon)*tripDegrees,tilt=c.lat*tripDegrees;
  const horizontal=Math.cos(lat)*Math.cos(lon),vertical=Math.sin(lat);
  const x=Math.cos(lat)*Math.sin(lon)*c.zoom;
  const y=(horizontal*Math.sin(tilt)-vertical*Math.cos(tilt))*c.zoom;
  return {x,y,visible:horizontal*Math.cos(tilt)+vertical*Math.sin(tilt)>0&&x*x+y*y<1};
}

function paintTripSurface(v,r,now){
  const c=v.camera,tilt=c.lat*tripDegrees,sinLat=Math.sin(tilt),cosLat=Math.cos(tilt);
  const moving=Math.abs(Math.log(c.zoom/v.target.zoom))>.003||Math.abs(c.lat-v.target.lat)+Math.abs(c.lon-v.target.lon)>.015/c.zoom;
  const size=Math.max(64,Math.min(moving?220:640,Math.ceil(r*2*dpr)));
  const key=[size,c.lat.toFixed(5),c.lon.toFixed(5),c.zoom.toFixed(4),!!globeTexture,!!v.texture].join('/');
  if(key===v.cacheKey||(moving&&now-v.lastPaint<40&&v.pixels))return;
  v.cacheKey=key;v.lastPaint=now;
  const g=v.surface.getContext('2d');
  if(v.surface.width!==size||!v.pixels){v.surface.width=v.surface.height=size;v.pixels=g.createImageData(size,size)}
  const out=v.pixels.data,local=v.texture,world=globeTexture;
  const [west,south,east,north]=tripRegions[v.region]||[-180,-90,180,90];
  const az=c.lon*tripDegrees;
  for(let j=0;j<size;j++){
    const ny=1-(j+.5)*2/size,Y=ny/c.zoom;
    for(let i=0;i<size;i++){
      const nx=(i+.5)*2/size-1,d=nx*nx+ny*ny,k=4*(j*size+i);
      if(d>1){out[k+3]=0;continue}
      const X=nx/c.zoom,Z=Math.sqrt(Math.max(0,1-X*X-Y*Y));
      const lat=Math.asin(Math.max(-1,Math.min(1,Y*cosLat+Z*sinLat)))/tripDegrees;
      const lon=(((az+Math.atan2(X,Z*cosLat-Y*sinLat))/tripDegrees+180)%360+360)%360-180;
      let data,index;
      if(local&&lon>=west&&lon<east&&lat<=north&&lat>south){
        const x=Math.floor((lon-west)/(east-west)*local.width),y=Math.floor((north-lat)/(north-south)*local.height);
        data=local.data;index=(y*local.width+x)*4;
      }else if(world){
        const x=Math.min(1023,Math.floor((lon+180)/360*1024)),y=Math.min(511,Math.floor((90-lat)/180*512));
        data=world;index=(y*1024+x)*4;
      }
      const shade=.89+.11*(1-.35*nx+.3*ny-.45*d);
      out[k]=(data?data[index]:38)*shade;out[k+1]=(data?data[index+1]:125)*shade;
      out[k+2]=(data?data[index+2]:166)*shade;out[k+3]=Math.min(255,(1-d)*size*125);
    }
  }
  g.putImageData(v.pixels,0,0);
}

// Keep labels outside the map. Use their geographic order on each side so close
// neighbours can share a shoreline and still have individually selectable beads.
function tripLayout(v){
  const left=cardOpen()&&W>980?Math.min(card.offsetWidth+30,W*.36):0;
  const width=W-left,top=phone?102:68,bottom=phone&&cardOpen()?H-card.offsetHeight-28:H-20;
  const height=Math.max(100,bottom-top),narrow=width<590;
  const r=Math.max(28,Math.min(252,narrow?width*.345:(width-252)*.32,height*(narrow?.28:.34)));
  const x=left+width/2,y=top+height*.51;
  const pins=v.stops.map(n=>({n,anchor:tripPoint(n.geo,v.frame)}));
  pins.sort((a,b)=>narrow?a.anchor.y-b.anchor.y:a.anchor.x-b.anchor.x);
  const half=Math.ceil(pins.length/2),gap=Math.min(36,Math.max(20,r*.18));
  for(const [index,group] of [pins.slice(0,half),pins.slice(half)].entries()){
    const side=index===0?-1:1;
    group.sort((a,b)=>narrow?a.anchor.x-b.anchor.x:a.anchor.y-b.anchor.y);
    group.forEach((p,i)=>{
      const t=(i+.5)/group.length;
      if(narrow){
        p.x=left+width*(.06+.88*t);p.y=y+side*(r+gap);
        p.align='center';p.tx=p.x;p.ty=p.y+side*22;p.wrap=width*.87/group.length-6;
      }else{
        const dy=(2*t-1)*r*1.15;
        p.x=x+side*(Math.sqrt(Math.max(0,r*r-dy*dy)) +gap+12);
        p.y=y+dy;p.align=side<0?'right':'left';p.tx=p.x+side*16;p.ty=p.y;p.wrap=side<0?p.tx-left-13:W-p.tx-13;
      }
    });
  }
  const offset=narrow?r+gap+65:r+33;
  return {x,y,r,pins,titleY:Math.max(top+8,y-offset),visitedY:Math.min(bottom-8,y+offset)};
}
function tripLabel(v,n,x,y,align,size,width,ink){
  font(n===v.trip?700:600,size);ctx.fillStyle=ink;ctx.textAlign=align;ctx.textBaseline='middle';
  const lines=[''];
  for(const word of n.label.split(' ')){
    const i=lines.length-1,next=(lines[i]+' '+word).trim();
    if(lines[i]&&ctx.measureText(next).width>width)lines.push(word);else lines[i]=next;
  }
  const leading=size+2;
  lines.forEach((line,i)=>{
    const py=y+(i-(lines.length-1)/2)*leading,len=ctx.measureText(line).width;
    ctx.fillText(line,x,py);
    const start=align==='center'?x-len/2:align==='right'?x-len:x;
    v.hits.push({n,x:start-4,y:py-leading/2-3,w:len+8,h:leading+6});
  });
}
function drawTripMap(now,ink){
  const v=tripView;moveTripCamera(v,now);
  const {x,y,r,pins,titleY,visitedY}=tripLayout(v);
  v.radius=r;v.hits=[];v.disc={x,y,r};labelRects=[];
  paintTripSurface(v,r,now);
  ctx.save();ctx.shadowColor='#144b4833';ctx.shadowBlur=r*.12;ctx.shadowOffsetY=r*.04;
  ctx.drawImage(v.surface,x-r,y-r,2*r,2*r);ctx.restore();
  ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.strokeStyle='#dcfff2a6';ctx.lineWidth=1.25;ctx.stroke();
  pins.sort((a,b)=>Number(a.n===active||a.n===hover)-Number(b.n===active||b.n===hover));
  for(const p of pins){
    const point=tripPoint(p.n.geo,v.camera),px=x+point.x*r,py=y+point.y*r;
    if(!point.visible)continue;
    const hot=p.n===active||p.n===hover;
    ctx.beginPath();ctx.moveTo(px,py);ctx.quadraticCurveTo(px+(p.x-px)*.56,py+(p.y-py)*.32,p.x,p.y);
    ctx.lineWidth=hot?1.9:1.15;ctx.strokeStyle=hot?'#173c3b':'#1c494881';ctx.stroke();
    ctx.beginPath();ctx.arc(px,py,hot?4.8:3.4,0,2*Math.PI);
    ctx.fillStyle=col[v.colors.get(p.n)];ctx.fill();ctx.strokeStyle=ink;ctx.lineWidth=1;ctx.stroke();
    v.hits.push({n:p.n,x:px-6,y:py-6,w:12,h:12});
  }
  for(const p of pins){
    const n=p.n,hot=n===active||n===hover,br=hot?11:9;
    if(hot){ctx.beginPath();ctx.arc(p.x,p.y,br+3.5,0,2*Math.PI);ctx.strokeStyle='#edfff5';ctx.lineWidth=2;ctx.stroke()}
    ball(p.x,p.y,br,col[v.colors.get(n)],1);n.s[0]=p.x;n.s[1]=p.y;
    v.hits.push({n,x:p.x-14,y:p.y-14,w:28,h:28});tripLabel(v,n,p.tx,p.ty,p.align,phone?13:15,p.wrap,ink);
  }
  tripLabel(v,v.trip,x,titleY,'center',phone?18:22,W-32,ink);
  const visited=byId.visited;
  font(600,14);const bx=x-(ctx.measureText(visited.label).width+19)/2+5;
  ball(bx,visitedY,6,col[hueOf(visited)],1);
  v.hits.push({n:visited,x:bx-10,y:visitedY-13,w:21,h:26});
  tripLabel(v,visited,bx+13,visitedY,'left',14,W,ink);
}
function hitTrip(x,y){
  const v=tripView;
  for(let i=v.hits.length-1;i>=0;i--){
    const h=v.hits[i];if(x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h)return h.n;
  }
  const d=v.disc;return d&&Math.hypot(x-d.x,y-d.y)<d.r?byId.earth:null;
}
