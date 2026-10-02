import { blockSprite, type ModelElement, type ModelFace, type GuiTransform } from "./block-sprite";

type Vec = [number, number, number];
const dyes: Record<string, number> = { white:16383998, orange:16351261, magenta:13061821, light_blue:3847130, yellow:16701501, lime:8439583, pink:15961002, gray:4673362, light_gray:10329495, cyan:1481884, purple:8991416, blue:3949738, brown:8606770, green:6192150, red:11546150, black:1908001 };

// Vanilla 1.21.1 entity cuboids use a 64px atlas instead of block-model JSON.
function cuboid(from: Vec, to: Vec, u: number, v: number, texture: string, tint?: string): ModelElement {
  const [w,h,d] = to.map((n,i)=>n-from[i]);
  const regions = { down:[u+d,v,u+d+w,v+d], up:[u+d+w,v+d,u+d+w+w,v], west:[u,v+d,u+d,v+d+h], north:[u+d,v+d,u+d+w,v+d+h], east:[u+d+w,v+d,u+d+w+d,v+d+h], south:[u+d+w+d,v+d,u+d+w+d+w,v+d+h] };
  return { from,to,faces:Object.fromEntries(Object.entries(regions).map(([side,uv])=>[side,{texture,uv:uv.map(n=>n/4),tint}])) };
}

export function entitySprite(id: string, gui: GuiTransform | undefined, texture: (reference: string) => Promise<string | null>) {
  if (id === "minecraft:shield") {
    const atlas = "minecraft:entity/shield_base_nopattern";
    return blockSprite([cuboid([-6,-11,-2],[6,11,-1],0,0,atlas),cuboid([-1,-3,-1],[1,3,5],26,0,atlas)],gui,texture);
  }
  if (id === "minecraft:chest" || id === "minecraft:trapped_chest" || id === "minecraft:ender_chest") {
    const atlas = `minecraft:entity/chest/${id === "minecraft:chest" ? "normal" : id === "minecraft:trapped_chest" ? "trapped" : "ender"}`;
    return blockSprite([cuboid([1,0,1],[15,10,15],0,19,atlas),cuboid([1,9,1],[15,14,15],0,0,atlas),cuboid([7,7,15],[9,11,16],0,0,atlas)],gui,texture);
  }
  const bed = /^minecraft:([a-z_]+)_bed$/.exec(id);
  if (bed && bed[1] in dyes) {
    const atlas=`minecraft:entity/bed/${bed[1]}`, elements: ModelElement[]=[];
    for (let part=0;part<2;part++) {
      const v=part*22, z=part*16;
      const faces: Record<string,ModelFace>={ up:{texture:atlas,uv:[6,6+v,22,22+v].map(n=>n/4)},down:{texture:atlas,uv:[22,v,38,6+v].map(n=>n/4)},west:{texture:atlas,uv:[0,6+v,6,22+v].map(n=>n/4),rotation:90},east:{texture:atlas,uv:[22,6+v,28,22+v].map(n=>n/4),rotation:90},north:{texture:atlas,uv:[6,v,22,6+v].map(n=>n/4)},south:{texture:atlas,uv:[22,v,38,6+v].map(n=>n/4)} };
      elements.push({from:[0,3,z],to:[16,9,z+16],faces});
      for (const x of [0,13]) elements.push(cuboid([x,0,part?29:0],[x+3,3,part?32:3],50,part?(x?12:0):(x?18:6),atlas));
    }
    return blockSprite(elements,gui,texture);
  }
  const banner=/^minecraft:([a-z_]+)_banner$/.exec(id);
  if (banner && banner[1] in dyes) {
    const atlas="minecraft:entity/banner_base", color=`#${dyes[banner[1]].toString(16).padStart(6,"0")}`;
    return blockSprite([cuboid([-1,-10,-1],[1,32,1],44,0,atlas),cuboid([-10,30,-1],[10,32,1],0,42,atlas),cuboid([-10,-8,-2],[10,32,-1],0,0,atlas,color)],gui ?? {rotation:[0,180,0]},texture);
  }
  return Promise.resolve(null);
}
