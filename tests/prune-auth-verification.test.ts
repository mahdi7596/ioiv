import { describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({transaction:vi.fn(),disconnect:vi.fn(async()=>{})}));
vi.mock("@/lib/db",()=>({db:{$transaction:mocks.transaction,$disconnect:mocks.disconnect}}));
describe("verification maintenance reporting",()=>{
 it("does not report success when commit acknowledgement fails",async()=>{
  const info=vi.spyOn(console,"info").mockImplementation(()=>{});const error=vi.spyOn(console,"error").mockImplementation(()=>{});
  const original=process.exitCode;
  try {
   mocks.transaction.mockRejectedValueOnce(new Error("commit acknowledgement failed"));
   await import("@/scripts/prune-auth-verification");
   await vi.waitFor(()=>expect(mocks.disconnect).toHaveBeenCalledOnce());
   expect(info).not.toHaveBeenCalled();expect(error).toHaveBeenCalledWith(JSON.stringify({event:"auth_verify_prune_failed"}));expect(process.exitCode).toBe(1);
  }finally{process.exitCode=original;info.mockRestore();error.mockRestore();}
 });
});
