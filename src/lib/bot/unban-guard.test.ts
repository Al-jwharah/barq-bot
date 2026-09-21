import assert from "node:assert/strict";
import { test } from "node:test";
import { permForCommand, permForGrokTool } from "./acl.server.ts";
import { assertCan, can, parseRole } from "./roles.server.ts";

test("ordinary user cannot unban", () => {
  assert.equal(can("user", "users.unban"), false);
  assert.equal(can("admin", "users.unban"), false);
  assert.equal(can("moderator", "users.unban"), false);
  assert.equal(can("support", "users.unban"), false);
  assert.equal(parseRole("user"), "user");
  assert.equal(parseRole("mod"), "moderator");
  assert.throws(() => assertCan("user", "users.unban"));
  assert.throws(() => assertCan("admin", "users.unban"));
  assert.throws(() => assertCan(parseRole("user"), "users.unban"));
  assert.throws(() => assertCan(parseRole("mod"), "users.unban"));
  assert.equal(permForGrokTool("unban_user"), "users.unban");
  assert.equal(can(parseRole("user"), permForGrokTool("unban_user")!), false);
  assert.equal(can(parseRole("user"), permForCommand("/unban")!), false);
  assert.equal(can("user", permForCommand("/appealok")!), false);
  assert.equal(can("user", permForCommand("/appealno")!), false);
  assert.equal(can("user", permForCommand("/ban")!), false);
});

test("owner can unban", () => {
  assert.equal(can("owner", "users.unban"), true);
  assert.doesNotThrow(() => assertCan("owner", "users.unban"));
  assert.equal(permForGrokTool("unban_user"), "users.unban");
  assert.equal(can("owner", permForGrokTool("unban_user")!), true);
  assert.equal(can("owner", permForCommand("/unban")!), true);
  assert.equal(can("owner", permForCommand("/ban")!), true);
  assert.equal(can("owner", permForCommand("/appealok")!), true);
  assert.equal(can("owner", permForCommand("/appealno")!), true);
});
