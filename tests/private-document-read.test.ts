import { mkdtemp, writeFile, mkdir, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readPrivateDocument } from "@/lib/files/qualification";
const roots: string[] = [];
async function fixture() { const root = await realpath(await mkdtemp(path.join(tmpdir(),"private-document-test-"))); roots.push(root); await mkdir(path.join(root,"ready")); const file=path.join(root,"ready","document"); await writeFile(file,"hello"); return {root,file}; }
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
describe("bounded private document reads",()=>{
 it("accepts exact bounded regular bytes",async()=>{const f=await fixture();expect((await readPrivateDocument(f.root,f.file,5,5)).toString()).toBe("hello");});
 it.each([0,-1,6,1.5,NaN,Infinity])("rejects invalid/incorrect size %s",async size=>{const f=await fixture();await expect(readPrivateDocument(f.root,f.file,size,5)).rejects.toThrow();});
 it("rejects escaping file and child-directory links",async()=>{const f=await fixture();const other=await fixture();const link=path.join(f.root,"ready","link");await symlink(other.file,link);await expect(readPrivateDocument(f.root,link,5,5)).rejects.toThrow();await symlink(path.dirname(other.file),path.join(f.root,"linked"));await expect(readPrivateDocument(f.root,path.join(f.root,"linked","document"),5,5)).rejects.toThrow();await expect(readPrivateDocument(f.root,other.file,5,5)).rejects.toThrow();});
 it("accepts configured root alias but never a child alias",async()=>{const f=await fixture();const alias=path.join(f.root,"root-alias");await symlink(f.root,alias);expect((await readPrivateDocument(alias,path.join(alias,"ready","document"),5,5)).toString()).toBe("hello");});
 it("rejects directories",async()=>{const f=await fixture();await expect(readPrivateDocument(f.root,path.dirname(f.file),5,5)).rejects.toThrow();});
});
