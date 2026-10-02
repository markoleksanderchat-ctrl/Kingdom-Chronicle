import type { ItemSprite } from "@/lib/item-sprite";

type Vec = [number, number, number];
export type ModelFace = { texture?: string; uv?: number[]; rotation?: number; tint?: string };
export type ModelElement = { from: Vec; to: Vec; shade?: boolean; rotation?: { origin: Vec; axis: string; angle: number; rescale?: boolean }; faces: Record<string, ModelFace> };
export type GuiTransform = { rotation?: Vec; scale?: Vec; translation?: Vec };
const vector = (v: unknown): v is Vec => Array.isArray(v) && v.length === 3 && v.every(x => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 180);
function rotate(v: Vec, axis: string, degrees: number): Vec {
  const [x, y, z] = v, c = Math.cos(degrees * Math.PI / 180), s = Math.sin(degrees * Math.PI / 180);
  return axis === "x" ? [x, y * c - z * s, y * s + z * c] : axis === "y" ? [x * c + z * s, y, -x * s + z * c] : [x * c - y * s, x * s + y * c, z];
}

export async function blockSprite(elements: ModelElement[], gui: GuiTransform | undefined, texture: (reference: string) => Promise<string | null>): Promise<ItemSprite | null> {
  if (!Array.isArray(elements) || !elements.length || elements.length > 64) return null;
  const rotation = vector(gui?.rotation) ? gui.rotation : [30, 225, 0];
  const scale = vector(gui?.scale) ? gui.scale : [1, 1, 1];
  const turn = (point: Vec, element: ModelElement): Vec => {
    let v = [...point] as Vec;
    if (element.rotation) {
      const r = element.rotation;
      if (!vector(r.origin) || !["x", "y", "z"].includes(r.axis) || !Number.isFinite(r.angle) || Math.abs(r.angle) > 90) throw Error("Invalid model rotation");
      v = v.map((n, i) => n - r.origin[i]) as Vec;
      if (r.rescale) {
        const factor = 1 / Math.cos(r.angle * Math.PI / 180);
        if (factor > 2) throw Error("Invalid model rescale");
        v = v.map((n, i) => "xyz"[i] === r.axis ? n : n * factor) as Vec;
      }
      v = rotate(v, r.axis, r.angle).map((n, i) => n + r.origin[i]) as Vec;
    }
    v = v.map((n, i) => (n - 8) * scale[i]) as Vec;
    v = rotate(rotate(rotate(v, "y", rotation[1]), "x", rotation[0]), "z", rotation[2]);
    return [v[0], -v[1], v[2]];
  };
  const layers: string[] = [], byTexture = new Map<string, number>();
  const faces: Array<{ texture: number; points: Vec[]; uv: number[][]; depth: number; shade: number; tint?: string }> = [];
  for (const element of elements) {
    if (!vector(element?.from) || !vector(element?.to) || !element.faces || typeof element.faces !== "object") return null;
    const [x, y, z] = element.from, [X, Y, Z] = element.to;
    const vertices: Record<string, Vec[]> = {
      north: [[X,Y,z],[x,Y,z],[x,y,z],[X,y,z]], south: [[x,Y,Z],[X,Y,Z],[X,y,Z],[x,y,Z]],
      west: [[x,Y,z],[x,Y,Z],[x,y,Z],[x,y,z]], east: [[X,Y,Z],[X,Y,z],[X,y,z],[X,y,Z]],
      up: [[x,Y,z],[X,Y,z],[X,Y,Z],[x,Y,Z]], down: [[x,y,Z],[X,y,Z],[X,y,z],[x,y,z]],
    };
    const defaults: Record<string, number[]> = { north:[16-X,16-Y,16-x,16-y], south:[x,16-Y,X,16-y], west:[z,16-Y,Z,16-y], east:[16-Z,16-Y,16-z,16-y], up:[x,z,X,Z], down:[x,16-Z,X,16-z] };
    for (const [side, face] of Object.entries(element.faces)) {
      if (!vertices[side] || typeof face?.texture !== "string") continue;
      const points = vertices[side].map(p => turn(p, element));
      const a=points[0], b=points[1], c=points[2];
      if ((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]) <= 0.00001) continue;
      const uv = face.uv ?? defaults[side];
      if (!Array.isArray(uv) || uv.length !== 4 || !uv.every(v => Number.isFinite(v) && Math.abs(v) <= 256) || uv[0] === uv[2] || uv[1] === uv[3]) return null;
      const turns = (face.rotation ?? 0) / 90;
      if (!Number.isInteger(turns) || turns < 0 || turns > 3) return null;
      const corners = [[uv[0],uv[1]],[uv[2],uv[1]],[uv[2],uv[3]],[uv[0],uv[3]]];
      const coords = corners.map((_, i) => corners[(i + turns) % 4]);
      let index = byTexture.get(face.texture);
      if (index === undefined) {
        const data = await texture(face.texture); if (!data) return null;
        index = layers.length; layers.push(data); byTexture.set(face.texture, index);
      }
      faces.push({ texture: index, points, uv: coords, depth: points.reduce((n,p)=>n+p[2],0)/4, tint: /^#[a-f0-9]{6}$/i.test(face.tint ?? "") ? face.tint : undefined, shade: element.shade === false || side === "up" ? 0 : side === "north" || side === "south" ? .16 : .28 });
    }
  }
  if (!faces.length) return null;
  const all=faces.flatMap(f=>f.points), xs=all.map(p=>p[0]), ys=all.map(p=>p[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  const fit = 28 / Math.max(maxX-minX,maxY-minY);
  if (!Number.isFinite(fit)) return null;
  return { kind:"model", layers, faces:faces.sort((a,b)=>a.depth-b.depth).map(face=>{
    const points=face.points.map(p=>[16+(p[0]-(minX+maxX)/2)*fit,16+(p[1]-(minY+maxY)/2)*fit]);
    const u=face.uv, p=points;
    const dx1=u[1][0]-u[0][0],dy1=u[1][1]-u[0][1],dx2=u[3][0]-u[0][0],dy2=u[3][1]-u[0][1], det=dx1*dy2-dx2*dy1;
    const a=((p[1][0]-p[0][0])*dy2-(p[3][0]-p[0][0])*dy1)/det;
    const c=((p[3][0]-p[0][0])*dx1-(p[1][0]-p[0][0])*dx2)/det;
    const b=((p[1][1]-p[0][1])*dy2-(p[3][1]-p[0][1])*dy1)/det;
    const d=((p[3][1]-p[0][1])*dx1-(p[1][1]-p[0][1])*dx2)/det;
    return { texture:face.texture,points,shade:face.shade,tint:face.tint,transform:[a,b,c,d,p[0][0]-a*u[0][0]-c*u[0][1],p[0][1]-b*u[0][0]-d*u[0][1]] };
  }) };
}
