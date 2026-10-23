import { describe, expect, it } from "vitest";
import { hashToken } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { resetMemberPassword } from "@/server/features/admin/team-service";
import { makeWorld } from "../helpers";

describe("password reset", () => {
  it("mints a fresh invite link and expires the previous unused one", async () => {
    const { actor } = await makeWorld("owner");
    const membership = await getDb().membership.findFirstOrThrow({
      where: { organizationId: actor.organizationId, userId: actor.userId },
    });
    const first = await resetMemberPassword(actor, membership.id);
    const second = await resetMemberPassword(actor, membership.id);
    expect(first.url).toContain("/invite/");
    expect(second.url).toContain("/invite/");
    expect(first.token).not.toBe(second.token);
    const firstInvite = await getDb().invitation.findUniqueOrThrow({
      where: { tokenHash: hashToken(first.token) },
    });
    const secondInvite = await getDb().invitation.findUniqueOrThrow({
      where: { tokenHash: hashToken(second.token) },
    });
    expect(firstInvite.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(secondInvite.acceptedAt).toBeNull();
    expect(secondInvite.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects members outside the actor organization", async () => {
    const owner = await makeWorld("owner");
    const other = await makeWorld("owner");
    const otherMembership = await getDb().membership.findFirstOrThrow({
      where: { organizationId: other.organizationId, userId: other.actor.userId },
    });
    await expect(resetMemberPassword(owner.actor, otherMembership.id)).rejects.toThrow();
  });
});
