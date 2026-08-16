import { describe, expect, it } from "vitest";
import {
  CREDIT_COST_PER_SUCCESS,
  CREDIT_PACKAGES,
  REFERRAL_BONUS_CREDITS,
  REGISTER_BONUS_CREDITS
} from "../src/domain/credits.js";

describe("credit compatibility constants", () => {
  it("keeps the current production cost and registration bonus", () => {
    expect(CREDIT_COST_PER_SUCCESS).toBe(10);
    expect(REGISTER_BONUS_CREDITS).toBe(50);
  });

  it("keeps package identifiers and exact decimal price strings", () => {
    expect(CREDIT_PACKAGES.map((item) => item.id)).toEqual(["trial", "starter", "pro", "unlimited"]);
    expect(CREDIT_PACKAGES.map((item) => item.amount)).toEqual(["19.90", "49.90", "149.00", "399.90"]);
  });

  it("awards exactly 20 credits to each side of an activated referral", () => {
    expect(REFERRAL_BONUS_CREDITS).toBe(20);
  });
});
