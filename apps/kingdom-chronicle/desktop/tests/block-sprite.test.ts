import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync, inflateSync } from "node:zlib";
import { blockSprite, type ModelElement } from "../src/block-sprite";
import { firstTextureFrame } from "../src/sprite-png";
import { entitySprite } from "../src/entity-sprite";

const box = (height: number): ModelElement => ({from:[0,0,0],to:[16,height,16],faces:Object.fromEntries(["north","south","east","west","up","down"].map(side=>[side,{texture:"#stone"}]))});
test("cuboids keep their shape, cull hidden faces, and fit the icon", async () => {
  const cube=await blockSprite([box(16)],undefined,async()=>"texture");
  const slab=await blockSprite([box(8)],undefined,async()=>"texture");
  assert.equal(cube?.faces?.length,3);
  assert.equal(cube?.layers.length,1);
  assert.ok(slab);
  const height=(sprite: typeof cube)=> {const ys=sprite!.faces!.flatMap(f=>f.points.map(p=>p[1]));return Math.max(...ys)-Math.min(...ys);};
  assert.ok(height(slab)<height(cube));
  for(const face of slab!.faces!) {
    assert.ok(face.transform.every(Number.isFinite));
    assert.ok(face.points.flat().every(n=>n>=2-1e-6 && n<=30+1e-6));
  }
});
test("rotated UVs preserve finite texture placement and invalid models fail safely", async () => {
  const rotated=box(16); for(const face of Object.values(rotated.faces)) face.rotation=90;
  assert.ok((await blockSprite([rotated],undefined,async()=>"texture"))?.faces?.every(f=>f.transform.every(Number.isFinite)));
  assert.equal(await blockSprite([box(16)],undefined,async()=>null),null);
  assert.equal(await blockSprite(Array.from({length:65},()=>box(16)),undefined,async()=>"texture"),null);
  const broken=box(16);broken.to[1]=NaN;
  assert.equal(await blockSprite([broken],undefined,async()=>"texture"),null);
});
test("entity previews use canonical local atlases and retain dye colors", async () => {
  const paths: string[]=[];
  const texture=async(path:string)=>{paths.push(path);return "texture";};
  for(const id of ["minecraft:shield","minecraft:chest","minecraft:red_bed","minecraft:cyan_banner"]) assert.equal((await entitySprite(id,undefined,texture))?.kind,"model");
  assert.ok(paths.includes("minecraft:entity/shield_base_nopattern"));
  assert.ok(paths.includes("minecraft:entity/bed/red"));
  const white=await entitySprite("minecraft:white_banner",undefined,texture), black=await entitySprite("minecraft:black_banner",undefined,texture);
  assert.notEqual(white?.faces?.find(f=>f.tint)?.tint,black?.faces?.find(f=>f.tint)?.tint);
  assert.equal(await entitySprite("other:red_bed",undefined,texture),null);
  assert.equal(await entitySprite("minecraft:unknown_bed",undefined,texture),null);
});
function chunk(type: string,data: Buffer) {
  const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);result.write(type,4);data.copy(result,8);
  let crc=0xffffffff;for(const byte of result.subarray(4,-4)){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;
}
function strip() {
  const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(2,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(Buffer.from([0,255,0,0,255,0,0,0,255,255]))),chunk("IEND",Buffer.alloc(0))]);
}
test("vertical animation strips export only the first frame with valid PNG chunks", () => {
  const frame=firstTextureFrame(strip());assert.ok(frame);assert.equal(frame.readUInt32BE(16),1);assert.equal(frame.readUInt32BE(20),1);
  for(let offset=8;offset<frame.length;) {
    const length=frame.readUInt32BE(offset),type=frame.toString("ascii",offset+4,offset+8),data=frame.subarray(offset+8,offset+8+length);
    assert.deepEqual(frame.subarray(offset,offset+length+12),chunk(type,data));
    if(type==="IDAT")assert.deepEqual(inflateSync(data),Buffer.from([0,255,0,0,255]));
    offset+=length+12;
  }
});
test("malformed or excessive animation strips fall back without unbounded inflation", () => {
  assert.equal(firstTextureFrame(Buffer.alloc(100)),null);
  assert.equal(firstTextureFrame(strip().subarray(0,40)),null);
  const huge=strip();huge.writeUInt32BE(17000,20);assert.equal(firstTextureFrame(huge),null);
  const corrupt=strip();corrupt.fill(0,41,corrupt.length-12);assert.equal(firstTextureFrame(corrupt),null);
});
