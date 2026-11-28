import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addSubscriptionDuration,
  computeExtendedExpiry,
  getSubscriptionInfo,
  isUserExpired,
} from "./subscription";

describe("subscription lifecycle helpers", () => {
  it("adds months and clamps end-of-month dates cleanly", () => {
    const jan31 = new Date("2026-01-31T05:00:00.000Z");
    const plus1Month = addSubscriptionDuration(jan31, 1, "months");
    assert.equal(plus1Month.toISOString(), "2026-02-28T05:00:00.000Z");

    const plus1Year = addSubscriptionDuration(new Date("2024-02-29T05:00:00.000Z"), 1, "years");
    assert.equal(plus1Year.toISOString(), "2025-02-28T05:00:00.000Z");
  });

  it("extends from current expiry if active, or from now if expired", () => {
    const now = new Date("2026-11-28T08:00:00.000Z");
    const futureExpiry = new Date("2026-12-15T08:00:00.000Z");
    const pastExpiry = new Date("2026-11-01T08:00:00.000Z");

    const fromFuture = computeExtendedExpiry(futureExpiry, 2, "months", now);
    assert.equal(fromFuture.toISOString(), "2027-02-15T08:00:00.000Z");

    const fromPast = computeExtendedExpiry(pastExpiry, 1, "years", now);
    assert.equal(fromPast.toISOString(), "2027-11-28T08:00:00.000Z");

    const fromNull = computeExtendedExpiry(null, 3, "months", now);
    assert.equal(fromNull.toISOString(), "2027-02-28T08:00:00.000Z");
  });

  it("checks expiration while exempting admins and permanent accounts", () => {
    const now = new Date("2026-11-28T08:00:00.000Z").getTime();
    const past = new Date("2026-11-27T08:00:00.000Z");
    const future = new Date("2026-12-01T08:00:00.000Z");

    assert.equal(isUserExpired({ role: "admin", expiresAt: past }, now), false);
    assert.equal(isUserExpired({ role: "owner", expiresAt: null }, now), false);
    assert.equal(isUserExpired({ role: "owner", expiresAt: past }, now), true);
    assert.equal(isUserExpired({ role: "owner", expiresAt: future }, now), false);
  });

  it("computes subscription status and daysLeft accurately", () => {
    const now = new Date("2026-11-28T08:00:00.000Z").getTime();

    assert.deepEqual(
      getSubscriptionInfo({ role: "owner", active: false, expiresAt: null }, now),
      { status: "inactive", daysLeft: null },
    );
    assert.deepEqual(
      getSubscriptionInfo({ role: "owner", active: true, expiresAt: null }, now),
      { status: "permanent", daysLeft: null },
    );
    assert.deepEqual(
      getSubscriptionInfo(
        { role: "owner", active: true, expiresAt: new Date("2026-11-28T07:59:59.000Z") },
        now,
      ),
      { status: "expired", daysLeft: 0 },
    );
    assert.deepEqual(
      getSubscriptionInfo(
        { role: "owner", active: true, expiresAt: new Date("2026-12-03T08:00:00.000Z") },
        now,
      ),
      { status: "expiring", daysLeft: 5 },
    );
    assert.deepEqual(
      getSubscriptionInfo(
        { role: "owner", active: true, expiresAt: new Date("2027-01-28T08:00:00.000Z") },
        now,
      ),
      { status: "active", daysLeft: 61 },
    );
  });
});
