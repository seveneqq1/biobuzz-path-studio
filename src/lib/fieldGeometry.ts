import { HIVE } from './hivePhysics'

// Field coordinates: x/right, y/up the tiles, z/height (all inches).
export interface Vec3 { x:number; y:number; z:number }
export type FieldSolid = {name:string;kind:'tube';a:Vec3;b:Vec3;radius:number}
  | {name:string;kind:'box';center:Vec3;half:Vec3;material:'foot'|'panel'}
export const frameSolids:FieldSolid[]=[]
for(const side of [-1,1]) {
  const y=72-side*HIVE.frameDepth/2,row=side===1?'South':'North'
  for(const sign of [-1,1]) {
    const x=72+sign*HIVE.frameWidth/2,name=`${row}-${sign===-1?'west':'east'} hive pillar`
    frameSolids.push({name,kind:'tube',a:{x,y,z:.5},b:{x:72,y,z:HIVE.pivot},radius:.62})
    frameSolids.push({name:`${name} foot`,kind:'box',center:{x,y,z:.15},half:{x:2.5,y:2,z:.125},material:'foot'})
  }
  frameSolids.push({name:`${row} hive ground rail`,kind:'tube',a:{x:72-HIVE.frameWidth/2,y,z:.65},b:{x:72+HIVE.frameWidth/2,y,z:.65},radius:.58})
  frameSolids.push({name:`${row} hive sign panel`,kind:'box',center:{x:72,y,z:23},half:{x:9,y:.12,z:5},material:'panel'})
}
frameSolids.push({name:'Hive overhead axle',kind:'tube',a:{x:72,y:72-HIVE.frameDepth/2,z:HIVE.pivot},b:{x:72,y:72+HIVE.frameDepth/2,z:HIVE.pivot},radius:.8})

export const templateClearanceHeight=(size:number)=>18+size*.42+2
