export function supportHandle(username: string): string {
  const h = String(username || "")
    .replace(/^@+/u, "")
    .trim();
  return h || "i_2169";
}

export function isAppealCommand(text: string): boolean {
  const t = text.trim();
  return /^\/appeal(?:@\w+)?(?:\s|$)/i.test(t) || t.startsWith("استئناف");
}

export function parseAppealNote(text: string): string {
  const note = text
    .replace(/^\/appeal(?:@\w+)?\s*/i, "")
    .replace(/^استئناف\s*/u, "")
    .trim();
  return note.slice(0, 500) || "طلب استئناف";
}

export function bannedUserMessage(supportUsername: string): string {
  const handle = supportHandle(supportUsername);
  return `حسابك موقوف.\nللاستئناف اكتب: استئناف ثم سبب قصير.\nالدعم @${handle}`;
}

export function appealReceivedMessage(ok: boolean, supportUsername: string): string {
  const handle = supportHandle(supportUsername);
  return ok
    ? "وصل طلب الاستئناف. الدعم يراجعه."
    : `تعذر تسجيل الاستئناف. راسل الدعم @${handle}`;
}

export function appealDecisionMessage(accept: boolean, tgId: string, found: boolean): string {
  if (!found) return "لا استئناف مفتوح";
  const id = String(tgId).trim();
  return accept ? `قُبل الاستئناف وفُك الحظر عن ${id}` : `رُفض استئناف ${id}`;
}

export function ownerAppealNotice(tgId: string, note: string): string {
  const id = String(tgId).trim();
  return `استئناف حظر من ${id}:\n${note.slice(0, 400)}\n/appealok ${id}\n/appealno ${id}`;
}

export function parseOwnerAppealDecision(text: string): { accept: boolean; tgId: string } | null {
  const m = text.trim().match(/^\/appeal(ok|no)(?:@\w+)?\s+(\d{1,20})\b/i);
  if (!m) return null;
  return { accept: m[1]!.toLowerCase() === "ok", tgId: m[2]! };
}
