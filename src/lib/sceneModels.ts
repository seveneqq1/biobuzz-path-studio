import * as T from 'three'
import { HIVE, pieceRadius } from './hivePhysics'
import type { PieceKind } from './hivePhysics'

export const materials = () => ({
  steel: new T.MeshStandardMaterial({color:0xa9b7be,metalness:.75,roughness:.32}),
  dark: new T.MeshStandardMaterial({color:0x23323b,metalness:.5,roughness:.45}),
  rubber: new T.MeshStandardMaterial({color:0x141c22,roughness:.92}),
  amber: new T.MeshStandardMaterial({color:0xf6b94c,metalness:.2,roughness:.45}),
  red: new T.MeshStandardMaterial({color:0xe75159,metalness:.2,roughness:.4}),
  blue: new T.MeshStandardMaterial({color:0x3e77ce,metalness:.2,roughness:.4}),
  green: new T.MeshStandardMaterial({color:0x77b76e,roughness:.55}),
  skin: new T.MeshStandardMaterial({color:0xe3e9ed,transparent:true,opacity:.35,side:T.DoubleSide,depthWrite:false,roughness:.48}),
})
type Mats = ReturnType<typeof materials>

export function box(parent:T.Object3D, size:number[], position:number[], material:T.Material) {
  const mesh=new T.Mesh(new T.BoxGeometry(size[0],size[1],size[2]),material)
  mesh.position.set(position[0],position[1],position[2]);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh
}
export function rod(parent:T.Object3D,a:number[],b:number[],radius:number,material:T.Material) {
  const from=new T.Vector3(...a as [number,number,number]),to=new T.Vector3(...b as [number,number,number]),delta=to.clone().sub(from)
  const mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,delta.length(),10),material)
  mesh.position.copy(from.add(to).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize())
  mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh
}
export function label(text:string,color='#22303b',background='#edf1f2',width=18,height=4) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128
  const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,512,128)
  ctx.fillStyle=color;ctx.font='600 48px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,68)
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false}));sprite.scale.set(width,height,1);return sprite
}

function ballShell() {
  const geometry=new T.SphereGeometry(1,28,20),p=geometry.getAttribute('position'),indices=geometry.index!,keep:number[]=[]
  const holes:T.Vector3[]=[]
  for(const z of [-.72,0,.72])for(let i=0;i<6;i++){
    const a=(i+ (z===0?.5:0))*Math.PI/3
    holes.push(new T.Vector3(Math.sqrt(1-z*z)*Math.cos(a),z,Math.sqrt(1-z*z)*Math.sin(a)))
  }
  const center=new T.Vector3()
  for(let i=0;i<indices.count;i+=3){
    const a=indices.getX(i),b=indices.getX(i+1),c=indices.getX(i+2)
    center.set(p.getX(a)+p.getX(b)+p.getX(c),p.getY(a)+p.getY(b)+p.getY(c),p.getZ(a)+p.getZ(b)+p.getZ(c)).normalize()
    if(!holes.some(h=>h.dot(center)>.979))keep.push(a,b,c)
  }
  geometry.setIndex(keep);return geometry
}
// One shared shell geometry for the perforated game pieces.
export function gamePieceFactory(m:Mats) {
  const shell=ballShell(),core=new T.SphereGeometry(.88,16,12)
  const pollen=new T.MeshStandardMaterial({color:0xffcb39,roughness:.62,side:T.DoubleSide})
  const inside=new T.MeshStandardMaterial({color:0x4a421d,roughness:1})
  return (kind:PieceKind,color?:'red'|'blue')=>{
    const group=new T.Group(),surface=kind==='pollen'?pollen:color==='blue'?m.blue:m.red
    const mesh=new T.Mesh(shell,surface);mesh.castShadow=true;mesh.receiveShadow=true
    group.add(mesh,new T.Mesh(core,inside));group.scale.setScalar(pieceRadius(kind));return group
  }
}

export function buildField(scene:T.Scene,m:Mats) {
  const root=new T.Group();scene.add(root)
  const ground=new T.MeshStandardMaterial({color:0xd7dee1,roughness:.98})
  box(root,[800,2,800],[0,-3,0],ground)
  const tiles=[0x555c60,0x596165,0x535b60].map(color=>new T.MeshStandardMaterial({color,roughness:.96}))
  for(let x=0;x<6;x++)for(let y=0;y<6;y++)box(root,[23.94,.59,23.94],[-60+x*24,-.3,-60+y*24],tiles[(x+y)%3])
  const wall=new T.MeshStandardMaterial({color:0xe2eaf0,transparent:true,opacity:.24,roughness:.25,metalness:.05,depthWrite:false})
  for(const axis of [0,1])for(const sign of [-1,1]){
    box(root,axis===0?[.45,12,144]:[144,12,.45],axis===0?[sign*72.2,6,0]:[0,6,sign*72.2],wall)
    box(root,axis===0?[.9,.7,145]:[145,.7,.9],axis===0?[sign*72.2,12.2,0]:[0,12.2,sign*72.2],m.dark)
    box(root,axis===0?[1.5,1.3,145]:[145,1.3,1.5],axis===0?[sign*72.2,.65,0]:[0,.65,sign*72.2],m.dark)
  }
  for(const x of [-72,72])for(const z of [-72,0,72])box(root,[1.2,12.7,1.2],[x,6.3,z],m.steel)
  // Recreate the asset's alliance tape in tile coordinates (blue top / red bottom).
  const tape=(x:number,y:number,w:number,d:number,material:T.Material)=>box(root,[w,.06,d],[x-72,.05,72-y],material)
  for(const [x,y,mat] of [[1,132,m.blue],[143,12,m.red]] as const){tape(x,y,2,23,mat)}
  for(const [x,y,mat] of [[107,139,m.blue],[12,5,m.red]] as const){
    tape(x,y-5,23,.6,mat);tape(x-11.5,y,.6,10,mat);tape(x+11.5,y,.6,10,mat)
  }
  const origin=label('144 × 144 in','#61747c','#d7dee1',22,5);origin.position.set(0,.7,87);root.add(origin)
  return root
}

export function buildHiveFrame(parent:T.Object3D,m:Mats) {
  const half=HIVE.frameWidth/2,depth=HIVE.frameDepth/2
  for(const z of [-depth,depth]){
    rod(parent,[-half,.5,z],[0,HIVE.pivot,z],.62,m.steel)
    rod(parent,[half,.5,z],[0,HIVE.pivot,z],.62,m.steel)
    rod(parent,[-half,.65,z],[half,.65,z],.58,m.steel)
    for(const x of [-half,half])box(parent,[5,.25,4],[x,.15,z],m.dark)
    const panel=new T.Shape();panel.moveTo(-9,18);panel.lineTo(9,18);panel.lineTo(5,28);panel.lineTo(-5,28);panel.closePath()
    const skin=new T.Mesh(new T.ShapeGeometry(panel),m.amber);skin.position.z=z;skin.material.side=T.DoubleSide;parent.add(skin)
    const title=label('BIOBUZZ','#243139','#f6b94c',15,3);title.position.set(0,23,z);parent.add(title)
  }
  rod(parent,[0,HIVE.pivot,-depth],[0,HIVE.pivot,depth],.8,m.dark)
  // Under-tile straps and visible joint collars.
  for(const z of [-12.75,12.75])rod(parent,[0,HIVE.pivot,z-1.4],[0,HIVE.pivot,z+1.4],1.1,m.steel)
}

export function buildHive(color:'red'|'blue',m:Mats) {
  const joint=new T.Group(),rim=color==='red'?m.red:m.blue
  for(const sign of [-1,1]){
    const polygon=[[HIVE.inner,-1.2],[HIVE.outer,-1.2],[HIVE.outer,12.8],[14.5,19.8],[HIVE.inner,16.5]]
    const shape=new T.Shape();polygon.forEach(([x,y],i)=>i?shape.lineTo(sign*x,y):shape.moveTo(sign*x,y));shape.closePath()
    for(const z of [-10,10]){
      const skin=new T.Mesh(new T.ShapeGeometry(shape),m.skin);skin.position.z=z;joint.add(skin)
      polygon.forEach(([x,y],i)=>{const next=polygon[(i+1)%polygon.length];rod(joint,[sign*x,y,z],[sign*next[0],next[1],z],.35,rim)})
    }
    const bottom=box(joint,[12,.22,20],[sign*15.42,-1.2,0],m.skin)
    bottom.castShadow=false
    box(joint,[.22,17.7,20],[sign*HIVE.inner,7.6,0],m.skin)
    rod(joint,[sign*HIVE.outer,-1.2,-10],[sign*HIVE.outer,-1.2,10],.35,rim)
    rod(joint,[sign*HIVE.outer,12.8,-10],[sign*HIVE.outer,12.8,10],.35,rim)
    rod(joint,[sign*HIVE.inner,16.5,-10],[sign*HIVE.inner,16.5,10],.35,rim)
    rod(joint,[sign*HIVE.inner,-1.2,0],[0,0,0],.55,m.steel)
    for(const z of [-7,7]){
      // Damper / stop: black body and steel plunger, linked to the cell base.
      rod(joint,[sign*7,-2,z],[sign*4,-6,z],.4,m.dark)
      rod(joint,[sign*4,-6,z],[sign*2,-7,z],.18,m.steel)
    }
    const tag=label(color==='red'?'Red cell':'Blue cell','#f3f6f6',color==='red'?'#bc414a':'#3568b5',12,2.5)
    tag.position.set(sign*15.5,-2.5,0);joint.add(tag)
  }
  return joint
}

export function buildFlower(parent:T.Object3D,x:number,y:number,m:Mats) {
  const root=new T.Group();root.position.set(x-72,0,72-y);parent.add(root)
  for(const height of [1.2,12,22]){
    const ring=new T.Mesh(new T.TorusGeometry(2.4,.35,8,24),height===22?m.amber:m.dark)
    ring.rotation.x=Math.PI/2;ring.position.y=height;root.add(ring)
  }
  for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5])rod(root,[Math.cos(a)*2.3,1.2,Math.sin(a)*2.3],[Math.cos(a)*2.3,22,Math.sin(a)*2.3],.28,m.green)
  rod(root,[0,23,-2.7],[0,23,2.7],.25,m.dark)
}

export function buildRobot(size:number,wheelDiameter:number,m:Mats) {
  const root=new T.Group(),wheels:T.Group[]=[],r=wheelDiameter/2,half=size/2
  box(root,[size-3,1,size-2],[0,3.5,0],m.dark)
  for(const z of [-half+1,half-1])box(root,[size-2,2.4,.7],[0,4.5,z],m.steel)
  for(const x of [-half+1,half-1])box(root,[.7,2.4,size-2],[x,4.5,0],m.steel)
  box(root,[size-6,.35,size-5],[-1,6,0],m.amber)
  box(root,[4,2.2,3],[-3,7,0],m.dark)
  for(const z of [-half+3,half-3])box(root,[size-7,4,.18],[-2,8,z],m.skin)
  box(root,[.18,4,size-6],[-half+2,8,0],m.skin)
  for(const x of [-half+3,half-3])for(const z of [-half,half]){
    const wheel=new T.Group();wheel.position.set(x,r,z);root.add(wheel);wheels.push(wheel)
    const tire=new T.Mesh(new T.CylinderGeometry(r,r,1.4,20),m.rubber);tire.rotation.x=Math.PI/2;tire.castShadow=true;wheel.add(tire)
    const hub=new T.Mesh(new T.CylinderGeometry(r*.52,r*.52,1.6,16),m.steel);hub.rotation.x=Math.PI/2;wheel.add(hub)
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4,roller=new T.Mesh(new T.CapsuleGeometry(.3,r*.75,3,6),m.dark)
      roller.position.set(Math.cos(a)*r,Math.sin(a)*r,0);roller.rotation.set(Math.PI/4,0,a);wheel.add(roller)
    }
  }
  const intake=rod(root,[half,2,-half+2],[half,2,half-2],.8,m.green)
  const turret=new T.Group();turret.position.set(1,16,0);root.add(turret)
  rod(root,[1,6,0],[1,16,0],.8,m.steel)
  for(const z of [-3,3])rod(root,[-4,6,z],[1,15,0],.3,m.steel)
  box(turret,[5,2,4],[0,0,0],m.dark)
  const barrel=box(turret,[8,2.2,2.8],[4,1,0],m.steel);barrel.rotation.z=Math.PI/6
  for(const z of [-2,2])rod(turret,[2,0,z],[2,2,z],1,m.rubber)
  const status=new T.Mesh(new T.BoxGeometry(.4,.25,size-4),new T.MeshBasicMaterial({color:0x64e0c2}));status.position.set(half+1,3,0);root.add(status)
  return {root,wheels,intake,turret,status}
}
