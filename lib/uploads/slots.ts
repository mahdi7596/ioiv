/** Canonical stable slots shared by browser and server. Array positions never compact. */
export const LEGACY_CANONICAL_SLOT = /^(taxDeclarations\.(0|[1-9][0-9]?)\.file|financials\.(0|[1-9][0-9]?)\.file|humanResources\.insuranceList|trialBalance\.(generalLedger|subsidiaryLedger)|creditReports\.(company|ceo|boardMember))$/;
export type LegacyReference = { fileId: string; name: string; generation?: number };
export function setLegacyFile<T extends object>(draft: T, slot: string, file: LegacyReference): T {
  if (!LEGACY_CANONICAL_SLOT.test(slot)) throw new Error("Invalid legacy slot");
  const result = structuredClone(draft) as Record<string, unknown>;
  const [group, key, leaf] = slot.split(".");
  if (leaf) {
    const rows = Array.isArray(result[group]) ? [...result[group]] : [];
    while (rows.length <= Number(key)) rows.push({});
    rows[Number(key)] = { ...(rows[Number(key)] as object), file };
    result[group] = rows;
  } else result[group] = { ...(result[group] as object ?? {}), [key]: file };
  return result as T;
}
export function legacyReferences(draft: object): Map<string, LegacyReference> {
  const data = draft as Record<string, unknown>;
  const refs = new Map<string, LegacyReference>();
  for (const group of ["taxDeclarations", "financials"]) {
    const rows = data[group];
    if (Array.isArray(rows)) rows.forEach((row, index) => {
      if (row?.file?.fileId) refs.set(`${group}.${index}.file`, row.file);
    });
  }
  for (const slot of ["humanResources.insuranceList", "trialBalance.generalLedger", "trialBalance.subsidiaryLedger", "creditReports.company", "creditReports.ceo", "creditReports.boardMember"]) {
    const [group, key] = slot.split(".");
    const file = (data[group] as Record<string, LegacyReference> | undefined)?.[key];
    if (file?.fileId) refs.set(slot, file);
  }
  return refs;
}

/** Retain unbound historical visibility; bound slots display only their current file. */
export function currentLegacyFiles<T extends { id?: string; fieldKey: string }>(files: T[], bindings: Array<{ slotKey: string; currentFileId: string }> = []): T[] {
  const current = new Map(bindings.map(binding => [binding.slotKey, binding.currentFileId]));
  return files.filter(file => !current.has(file.fieldKey) || current.get(file.fieldKey) === file.id);
}
