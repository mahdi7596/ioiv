import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { KalanHesabAdminContent } from "./KalanHesabAdminContent";

export default async function KalanHesabAdminPage() {
  const session = await getSession();
  if (!session || session.kind !== "admin") {
    redirect("/admin/login");
  }

  const admin = await db.admin.findUnique({ where: { id: session.subjectId } });
  if (!admin || !admin.active || admin.role !== UserRole.KALAN_HESAB_ADMIN) {
    redirect("/admin/login");
  }

  const submissions = await db.kalanHesabSubmission.findMany({
    orderBy: { createdAt: "desc" },
  });

  const rows = submissions.map((s) => ({
    id: s.id,
    fullName: s.fullName,
    companyName: s.companyName,
    position: s.position,
    positionOther: s.positionOther,
    teamSize: s.teamSize,
    mainConcern: s.mainConcern,
    concernOther: s.concernOther,
    mobile: s.mobile,
    createdAt: s.createdAt.toLocaleDateString("fa-IR"),
  }));

  return <KalanHesabAdminContent adminMobile={admin.mobile} submissions={rows} />;
}
