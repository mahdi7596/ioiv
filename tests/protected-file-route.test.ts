import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { GET } from "@/app/api/files/[id]/route";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    applicationFile: {
      findUnique: vi.fn(),
    },
    admin: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const fileRecord = {
  id: "file-1",
  applicationId: "app-1",
  originalName: "certificate.pdf",
  mimeType: "application/pdf",
  size: 4,
  storagePath: "/tmp/certificate.pdf",
  application: {
    userId: "user-1",
  },
};

function context(id = "file-1") {
  return {
    params: Promise.resolve({ id }),
  } as RouteContext<"/api/files/[id]">;
}

describe("protected file route", () => {
  beforeEach(() => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from("test"));
    vi.mocked(db.applicationFile.findUnique).mockResolvedValue(fileRecord);
    vi.mocked(db.admin.findUnique).mockResolvedValue({ active: true });
  });

  it("allows the owning user to download a validation certificate", async () => {
    vi.mocked(getSession).mockResolvedValue({ kind: "user", subjectId: "user-1" });

    const response = await GET(new Request("http://test.local/api/files/file-1"), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("rejects another user downloading a validation certificate", async () => {
    vi.mocked(getSession).mockResolvedValue({ kind: "user", subjectId: "user-2" });

    const response = await GET(new Request("http://test.local/api/files/file-1"), context());

    expect(response.status).toBe(403);
  });

  it("rejects inactive admins downloading a validation certificate", async () => {
    vi.mocked(getSession).mockResolvedValue({ kind: "admin", subjectId: "admin-1" });
    vi.mocked(db.admin.findUnique).mockResolvedValue({ active: false });

    const response = await GET(new Request("http://test.local/api/files/file-1"), context());

    expect(response.status).toBe(403);
  });
});
