// Nominal FIRST manual dimensions, in inches. Detailed damper constants are
// tunable approximations; both renderers and physics share this geometry.
export const HIVE = {
  pivot: 43.95, frameWidth: 49.46, frameDepth: 38.95,
  inner: 9.42, outer: 21.42, openingHeight: 14, openingWidth: 20,
  openingCenter: 5.8, depth: 12, stopAngle: Math.PI / 6,
  inertia: 680, damping: 650, latchTorque: 300,
} as const
export const GRAVITY = 386.09
export type PieceKind = 'pollen' | 'nectar'
export interface CellPiece { kind: PieceKind; color?: 'red' | 'blue' }
export interface Hive {
  side: number; tips: number; cells: [number, number]; angle: number; omega: number;
  contents: [CellPiece[], CellPiece[]]; tipping: boolean; targetSide: number;
  spilling: number | null; spillClock: number;
}
export const pieceMass = (kind: PieceKind) => kind === 'nectar' ? .091 : .055
export const pieceRadius = (kind: PieceKind) => kind === 'nectar' ? 1.8 : 1.4
export const pieceLoad = (kind: PieceKind) => kind === 'nectar' ? .091 / .055 : 1

export function createHive(side: number, color: 'red' | 'blue'): Hive {
  const contents: [CellPiece[], CellPiece[]] = [[], []]
  contents[side] = Array.from({length:3}, () => ({kind:'nectar' as const, color}))
  return {side,tips:0,cells:side===0?[3*pieceLoad('nectar'),0]:[0,3*pieceLoad('nectar')],
    angle:side===0?-HIVE.stopAngle:HIVE.stopAngle,omega:0,contents,tipping:false,
    targetSide:side,spilling:null,spillClock:0}
}
export function cellOpening(hive: Hive, side: number) {
  const sign = side===0 ? -1 : 1, c=Math.cos(hive.angle), s=Math.sin(hive.angle)
  return {x:sign*HIVE.outer*c-HIVE.openingCenter*s,
    z:HIVE.pivot+sign*HIVE.outer*s+HIVE.openingCenter*c,
    nx:sign*c,nz:sign*s}
}
export function localToHive(hive: Hive, x: number, z: number) {
  const c=Math.cos(hive.angle),s=Math.sin(hive.angle)
  return {x:x*c-z*s,z:HIVE.pivot+x*s+z*c}
}
export function hiveToLocal(hive: Hive, x: number, z: number) {
  const c=Math.cos(hive.angle),s=Math.sin(hive.angle)
  return {x:x*c+(z-HIVE.pivot)*s,z:-x*s+(z-HIVE.pivot)*c}
}
export function addCellPiece(hive: Hive, side: number, piece: CellPiece) {
  hive.contents[side].push(piece)
  hive.cells[side]+=pieceLoad(piece.kind)
}
export interface Spill extends CellPiece {x:number;y:number;z:number;vx:number;vy:number;vz:number}

// Over-centre load torque starts the transition; a damped joint settles against
// the opposite stop. Piece release waits until the old opening points down.
export function advanceHive(hive: Hive, dt: number): Spill[] {
  const sign=hive.side===0?-1:1
  if(!hive.tipping && hive.cells[hive.side]>=8 && hive.spilling===null) {
    hive.tipping=true;hive.targetSide=1-hive.side;hive.spilling=hive.side;hive.spillClock=0
  }
  if(hive.tipping) {
    const loadTorque=-sign*Math.max(0,hive.cells[hive.side]-5)*160*Math.cos(hive.angle)
    const overCentre=(hive.targetSide===0?-1:1)*HIVE.latchTorque
    hive.omega+=(loadTorque+overCentre-HIVE.damping*hive.omega)/HIVE.inertia*dt
    hive.angle+=hive.omega*dt
    const stop=hive.targetSide===0?-HIVE.stopAngle:HIVE.stopAngle
    if(hive.targetSide===0 ? hive.angle<=stop : hive.angle>=stop) {
      hive.angle=stop;hive.omega=0;hive.side=hive.targetSide;hive.tipping=false;hive.tips++
    }
  }
  const spills:Spill[]=[]
  if(hive.spilling!==null) {
    const side=hive.spilling,opening=cellOpening(hive,side)
    if(opening.nz<-.08) {
      hive.spillClock+=dt
      while(hive.spillClock>=.065 && hive.contents[side].length) {
        hive.spillClock-=.065
        const piece=hive.contents[side].shift()!,r=pieceRadius(piece.kind)
        hive.cells[side]=Math.max(0,hive.cells[side]-pieceLoad(piece.kind))
        const lane=((hive.contents[side].length%4)-1.5)*(r*2+.1)
        // Exit at the lower lip, not the pivot. Joint velocity + gravity-driven
        // sliding down the cell determine velocity; there is no radial scatter.
        const lip=localToHive(hive,(side===0?-1:1)*(HIVE.outer+r),HIVE.openingCenter-7+r)
        const slide=Math.sqrt(2*GRAVITY*HIVE.depth*Math.max(.05,-opening.nz))*.38
        spills.push({...piece,x:lip.x,y:lane,z:lip.z,
          vx:opening.nx*slide-hive.omega*(lip.z-HIVE.pivot),vy:0,
          vz:opening.nz*slide+hive.omega*lip.x})
      }
      if(!hive.contents[side].length)hive.spilling=null
    }
  }
  return spills
}
