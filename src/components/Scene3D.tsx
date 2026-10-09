import { useEffect, useRef, useState } from 'react'
import * as T from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Focus, Orbit, Video } from 'lucide-react'
import type { RobotConfig, SimState, profile } from '../lib/simulation'
import { flowers, hiveCenters } from '../lib/simulation'
import { HIVE, pieceRadius } from '../lib/hivePhysics'
import { buildField, buildFlower, buildHive, buildHiveFrame, buildRobot, gamePieceFactory, label, materials } from '../lib/sceneModels'
import { followCameraFrame, shootingCameraActive, smoothCameraBlend } from '../lib/followCamera'

interface Props {
  view:SimState; config:RobotConfig; route:ReturnType<typeof profile>; running:boolean;
  onBallMove:(id:number,x:number,y:number)=>void; onBack:()=>void;theme:'light'|'dark'
}
type CameraMode='orbit'|'follow'|'hive'

export default function Scene3D({view,config,route,running,onBallMove,onBack,theme}:Props) {
  const host=useRef<HTMLDivElement>(null)
  const live=useRef({view,running,onBallMove}),cameraMode=useRef<CameraMode>('orbit')
  const [mode,setMode]=useState<CameraMode>('orbit'),[error,setError]=useState('')
  useEffect(()=>{live.current={view,running,onBallMove}},[view,running,onBallMove])
  useEffect(()=>{cameraMode.current=mode},[mode])
  useEffect(()=>{
    const element=host.current
    if(!element)return
    let renderer:T.WebGLRenderer
    try { renderer=new T.WebGLRenderer({antialias:true,alpha:false}) }
    catch { const frame=requestAnimationFrame(()=>setError('3D needs WebGL. Enable hardware acceleration in your browser, or use 2D preview.'));return()=>cancelAnimationFrame(frame) }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.6))
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap
    renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15
    element.appendChild(renderer.domElement)
    const background=theme==='dark'?0x24343f:0xdfe7ea
    const scene=new T.Scene();scene.background=new T.Color(background);scene.fog=new T.Fog(background,500,1800)
    const camera=new T.PerspectiveCamera(39,1,.5,2400);camera.position.set(155,142,176)
    const controls=new OrbitControls(camera,renderer.domElement)
    controls.target.set(0,15,0);controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=65;controls.maxDistance=420
    controls.maxPolarAngle=Math.PI*.48;controls.minPolarAngle=.12;controls.update()
    scene.add(new T.HemisphereLight(0xffffff,0x727d80,2.2))
    const light=new T.DirectionalLight(0xfff1d9,3.4);light.position.set(-75,170,95);light.castShadow=true
    light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-115;light.shadow.camera.right=115
    light.shadow.camera.top=115;light.shadow.camera.bottom=-115;light.shadow.camera.near=1;light.shadow.camera.far=380;light.shadow.bias=-.0008
    scene.add(light,new T.DirectionalLight(0xc4ddff,1.3))
    const m=materials();buildField(scene,m,theme==='dark');buildHiveFrame(scene,m)
    const createPiece=gamePieceFactory(m)
    const joints=hiveCenters.map((center,i)=>{
      const joint=buildHive(i===0?'red':'blue',m);joint.position.set(center.x-72,HIVE.pivot,72-center.y);scene.add(joint)
      const storage=[new T.Group(),new T.Group()];joint.add(...storage)
      return {joint,storage,keys:['','']}
    })
    flowers.forEach(f=>buildFlower(scene,f.x,f.y,m))
    const robot=buildRobot(config.size,config.wheel,m,config.intakeMaterial);scene.add(robot.root)
    const hopper=new T.Group();robot.root.add(hopper);let hopperKey=''
    const feeder=new T.Group();robot.root.add(feeder);let feederKey=''
    const pathPoints=route.samples.map(p=>new T.Vector3(p.x-72,.28,72-p.y))
    if(pathPoints.length>1){
      const curve=new T.CatmullRomCurve3(pathPoints)
      const line=new T.Mesh(new T.TubeGeometry(curve,Math.min(pathPoints.length,600),.28,6,false),new T.MeshBasicMaterial({color:0xffcd58}))
      scene.add(line)
      const start=new T.Mesh(new T.TorusGeometry(2.8,.22,8,32),m.amber);start.rotation.x=Math.PI/2;start.position.copy(pathPoints[0]);scene.add(start)
      const finish=label('Finish','#33464f','#f9df9c',12,3);finish.position.copy(pathPoints.at(-1)!).y=4;scene.add(finish)
    }
    if(route.supportCollision){const point=route.supportCollision.sample,marker=new T.Mesh(new T.TorusGeometry(2.3,.35,8,24),m.red)
      marker.rotation.x=Math.PI/2;marker.position.set(point.x-72,.6,72-point.y);scene.add(marker)}
    const ballMeshes=new Map<number,T.Group>()
    let previousMode:CameraMode='orbit',dragging:number|null=null
    let shotBlend=0,lastFrame=performance.now()
    const ray=new T.Raycaster(),pointer=new T.Vector2(),floor=new T.Plane(new T.Vector3(0,1,0),-1.4)
    const pick=(event:PointerEvent)=>{
      const rect=renderer.domElement.getBoundingClientRect()
      pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera)
    }
    const down=(event:PointerEvent)=>{
      if(live.current.running || event.button!==0)return
      pick(event)
      const candidates=[...ballMeshes.values()].filter(mesh=>{
        const ball=live.current.view.balls.find(b=>b.id===mesh.userData.id)
        return ball?.flower===undefined && ball && ball.z<=pieceRadius(ball.kind)+.05
      })
      const hit=ray.intersectObjects(candidates,true)[0]
      if(hit){let node:T.Object3D=hit.object;while(node.userData.id===undefined && node.parent)node=node.parent
        dragging=node.userData.id as number;controls.enabled=false;renderer.domElement.setPointerCapture(event.pointerId)}
    }
    const move=(event:PointerEvent)=>{
      if(dragging===null)return
      pick(event);const at=ray.ray.intersectPlane(floor,new T.Vector3())
      if(at)live.current.onBallMove(dragging,Math.max(2,Math.min(142,at.x+72)),Math.max(2,Math.min(142,72-at.z)))
    }
    const up=()=>{dragging=null;controls.enabled=cameraMode.current==='orbit'}
    renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move)
    renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',up)
    const resize=()=>{const w=element.clientWidth,h=element.clientHeight;if(w>0&&h>0){renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix()}}
    const observer=new ResizeObserver(resize);observer.observe(element);resize()
    const contextLost=(event:Event)=>{event.preventDefault();setError('The 3D graphics context was interrupted. Return to 2D and reopen 3D to retry.')}
    renderer.domElement.addEventListener('webglcontextlost',contextLost)
    renderer.setAnimationLoop(()=>{
      const now=performance.now(),dt=Math.min(.1,(now-lastFrame)/1000);lastFrame=now
      const state=live.current.view,active=new Set(state.balls.map(b=>b.id))
      for(const [id,mesh] of ballMeshes)if(!active.has(id)){scene.remove(mesh);ballMeshes.delete(id)}
      for(const ball of state.balls){
        let mesh=ballMeshes.get(ball.id)
        if(!mesh){mesh=createPiece(ball.kind,ball.color);mesh.userData.id=ball.id;scene.add(mesh);ballMeshes.set(ball.id,mesh)}
        mesh.position.set(ball.x-72,ball.z,72-ball.y)
        mesh.rotation.set(ball.y/pieceRadius(ball.kind),0,-ball.x/pieceRadius(ball.kind))
      }
      joints.forEach(({joint,storage,keys},i)=>{
        const hive=state.hives[i];joint.rotation.z=hive.angle
        for(let side=0;side<2;side++){
          const key=hive.contents[side].map(p=>p.kind+p.color).join(',')
          if(key!==keys[side]){
            storage[side].clear();keys[side]=key
            hive.contents[side].forEach((p,n)=>{const mesh=createPiece(p.kind,p.color),r=pieceRadius(p.kind)
              mesh.position.set((side===0?-1:1)*(12+r+(Math.floor(n/4)%2)*r*2.1),r-.8+Math.floor(n/8)*r*2.1,((n%4)-1.5)*r*2.1);storage[side].add(mesh)})
          }
        }
      })
      robot.root.position.set(state.x-72,0,72-state.y);robot.root.rotation.y=state.heading*Math.PI/180
      robot.wheels.forEach(w=>{w.rotation.z=-state.driveTime*route.maxSpeed/(config.wheel/2)})
      robot.intakeWheels.forEach(w=>{w.rotation.z=state.intake?-state.time*12:0})
      robot.transferRollers.forEach((w,i)=>{w.rotation.z=state.feeder.length||state.activeType==='transfer'?state.time*10*(i%2===0?-1:1):0})
      robot.gate.rotation.z=state.shooting && state.turretReady?-.7:0
      robot.status.visible=state.intake
      robot.turret.rotation.y=(state.turretYaw-state.heading)*Math.PI/180
      robot.gun.rotation.z=state.turretElevation*Math.PI/180
      const staged=state.feeder.slice(0,3),stageKey=staged.map(item=>item.piece.kind+item.piece.color).join(',')
      if(stageKey!==feederKey){feederKey=stageKey;feeder.clear();staged.forEach(item=>feeder.add(createPiece(item.piece.kind,item.piece.color)))}
      staged.forEach((item,i)=>{const progress=i===0?1-Math.max(0,item.remaining/config.transferTime):0
        feeder.children[i].position.set(config.size/2-2-progress*(config.size/2+1),3+progress*5,i*2.8)})
      const pieces=state.hopper ?? [] // tolerate a stale state during development hot reload
      const inventoryKey=pieces.map(p=>p.kind+p.color).join(',')
      if(hopperKey!==inventoryKey){hopper.clear();hopperKey=inventoryKey
        pieces.slice(0,8).forEach((piece,i)=>{const ball=createPiece(piece.kind,piece.color);ball.position.set(-4+(i%3)*2.8,8+Math.floor(i/3)*2.8,-3+(i%2)*3);hopper.add(ball)})}
      const currentMode=cameraMode.current
      if(currentMode!==previousMode){
        shotBlend=0;controls.maxDistance=420
        controls.enabled=currentMode==='orbit';previousMode=currentMode
        if(currentMode==='orbit'){camera.position.set(155,142,176);controls.target.set(0,15,0)}
        if(currentMode==='hive'){camera.position.set(92,88,110);controls.target.set(0,42,0)}
      }
      if(currentMode==='follow'){
        const nextShot=!state.finished&&!state.blocked&&route.shotStops.some(stop=>!state.processed.includes(stop.node)&&stop.time>=state.driveTime&&stop.time-state.driveTime<.7)
        shotBlend=smoothCameraBlend(shotBlend,shootingCameraActive(state)||nextShot,dt)
        const frame=followCameraFrame(state,config,camera.aspect,shotBlend),position=new T.Vector3(frame.position.x,frame.position.y,frame.position.z)
        controls.maxDistance=Math.max(420,frame.distance+50)
        camera.position.lerp(position,1-Math.exp(-7*dt));controls.target.lerp(new T.Vector3(frame.target.x,frame.target.y,frame.target.z),1-Math.exp(-9*dt))
      }
      controls.update();renderer.render(scene,camera)
    })
    return()=>{
      renderer.setAnimationLoop(null);observer.disconnect();controls.dispose()
      const geometries=new Set<T.BufferGeometry>(),mats=new Set<T.Material>(),textures=new Set<T.Texture>()
      scene.traverse(node=>{if(node instanceof T.Mesh || node instanceof T.Sprite){if(node instanceof T.Mesh)geometries.add(node.geometry)
        const list=Array.isArray(node.material)?node.material:[node.material];for(const mat of list){mats.add(mat);if('map' in mat && mat.map instanceof T.Texture)textures.add(mat.map)}}})
      geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose())
      renderer.dispose();renderer.domElement.remove()
    }
  },[config,route,theme])
  return <div className="scene-three" aria-label="3D BIOBUZZ simulation">
    <div className="three-renderer" ref={host}/>
    <div className="scene-heading"><span className="scene-pill">3D playback</span><span>Same route. A new perspective.</span></div>
    <div className="camera-tools" aria-label="3D camera controls">
      <button aria-pressed={mode==='orbit'} onClick={()=>setMode('orbit')}><Orbit size={15}/>Orbit</button>
      <button aria-pressed={mode==='follow'} onClick={()=>setMode('follow')}><Video size={15}/>Follow robot</button>
      <button aria-pressed={mode==='hive'} onClick={()=>setMode('hive')}><Focus size={15}/>Hives</button>
    </div>
    <div className="scene-instructions">{mode==='orbit'?'Drag to orbit · scroll to zoom · drag floor balls while paused':mode==='follow'?shootingCameraActive(view)?'Shot view: robot, airborne balls and hive':'Robot follow · automatically widens for shooting':'Hive joint and cell view'}</div>
    {error && <div className="scene-error"><p>{error}</p><button onClick={onBack}>Return to 2D</button></div>}
  </div>
}
