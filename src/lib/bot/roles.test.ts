import assert from "node:assert/strict";
import { test } from "node:test";
import { can, dailyLimitFor, parseRole, permissionsOf, queuePriority } from "./roles.server.ts";
import { OWNER_ONLY_COMMANDS, permForCallback, permForCommand, permForGrokTool } from "./acl.server.ts";

test("owner has the full matrix, others are scoped", () => {
  assert.equal(can("owner", "all"), true);
  assert.equal(can("owner", "owners.manage"), true);
  assert.equal(can("owner", "users.unban"), true);
  assert.equal(can("owner", "payments.manage"), true);
  assert.equal(can("owner", "settings.write"), true);
  assert.equal(can("owner", "logs.read"), true);

  assert.equal(can("admin", "users.read"), true);
  assert.equal(can("admin", "jobs.manage"), true);
  assert.equal(can("admin", "jobs.retry"), true);
  assert.equal(can("admin", "errors.read"), true);
  assert.equal(can("admin", "users.manage"), false);
  assert.equal(can("admin", "settings.write"), false);
  assert.equal(can("admin", "users.unban"), false);

  assert.equal(can("moderator", "reports.review"), true);
  assert.equal(can("moderator", "content.ban"), true);
  assert.equal(can("moderator", "settings.write"), false);
  assert.equal(can("moderator", "jobs.manage"), false);

  assert.equal(can("support", "tickets.read"), true);
  assert.equal(can("support", "settings.write"), false);
  assert.equal(can("support", "users.read"), false);
  assert.equal(can("user", "tickets.read"), false);
  assert.equal(parseRole("ADMIN"), "admin");
  assert.equal(parseRole("moderator"), "moderator");
  assert.equal(parseRole("mod"), "moderator");
  assert.equal(parseRole("MOD"), "moderator");
  assert.equal(parseRole("owner"), "user");
  assert.ok(permissionsOf("admin").includes("jobs.retry"));
  assert.equal(permissionsOf("support").includes("settings.write"), false);
});

test("callbacks and grok tools map to permissions", () => {
  assert.equal(permForCallback("adm:wipe_ok"), "owners.manage");
  assert.equal(permForCallback("adm:pause"), "settings.write");
  assert.equal(permForCallback("adm:watch"), "errors.read");
  assert.equal(permForGrokTool("unban_user"), "users.unban");
  assert.equal(permForGrokTool("ban_user"), "users.manage");
  assert.equal(permForGrokTool("list_blocked"), "reports.review");
});

test("/ban /unban /appealok /appealno are owner-only", () => {
  for (const cmd of OWNER_ONLY_COMMANDS) {
    const perm = permForCommand(cmd);
    assert.ok(perm, cmd);
    assert.equal(can("owner", perm!), true, cmd);
    assert.equal(can("admin", perm!), false, cmd);
    assert.equal(can("moderator", perm!), false, cmd);
    assert.equal(can("support", perm!), false, cmd);
    assert.equal(can("user", perm!), false, cmd);
  }
  assert.equal(permForCommand("/ban"), "users.manage");
  assert.equal(permForCommand("/unban"), "users.unban");
  assert.equal(permForCommand("/appealok 99"), "users.unban");
  assert.equal(permForCommand("/appealno 99"), "users.unban");
});

test("tiers set daily limits and queue priority", () => {
  assert.equal(dailyLimitFor("vip"), -1);
  assert.equal(dailyLimitFor("pro"), 40);
  assert.equal(dailyLimitFor("free", 5), 5);
  assert.ok(queuePriority("vip") < queuePriority("pro"));
  assert.ok(queuePriority("pro") < queuePriority("free"));
});
