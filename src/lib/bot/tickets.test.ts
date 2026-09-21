import assert from "node:assert/strict";
import { test } from "node:test";
import { makeTicketId, userCanSeeTicket } from "./tickets.server.ts";

test("ticket id is BRQ- plus 6 uppercase alnum", () => {
  const id = makeTicketId();
  assert.match(id, /^BRQ-[A-Z0-9]{6}$/);
  assert.equal(id.length, 10);
  const other = makeTicketId();
  assert.match(other, /^BRQ-[A-Z0-9]{6}$/);
  assert.notEqual(id, other);
});

test("userCanSeeTicket: owner sees any, user sees own only", () => {
  assert.equal(userCanSeeTicket("1", "2", true), true);
  assert.equal(userCanSeeTicket("1", "1", true), true);
  assert.equal(userCanSeeTicket("1", "1", false), true);
  assert.equal(userCanSeeTicket("1", "2", false), false);
  assert.equal(userCanSeeTicket("99", "99", false), true);
});
