import { beforeEach, describe, expect, it } from "vitest";
import { createTestAgent } from "../helpers/testApp.js";
import { loginAs, seedTestData } from "../helpers/testData.js";

describe("auth API", () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it("logs in successfully and returns the current user", async () => {
    const agent = createTestAgent();

    const loginResponse = await loginAs(agent, "buyer@quoteflow.local");
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.data.email).toBe("buyer@quoteflow.local");
    expect(loginResponse.headers["set-cookie"]).toBeTruthy();

    const meResponse = await agent.get("/api/auth/me");
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.data.role).toBe("buyer");
  });

  it("rejects an invalid password", async () => {
    const agent = createTestAgent();
    const response = await agent.post("/api/auth/login").send({
      email: "buyer@quoteflow.local",
      password: "wrong-password",
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for unauthenticated protected requests", async () => {
    const agent = createTestAgent();
    const response = await agent.get("/api/dashboard/overview");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when the role does not match the endpoint", async () => {
    const agent = createTestAgent();
    await loginAs(agent, "analyst@quoteflow.local");

    const response = await agent.post("/api/quote-packages").send({
      fromSkuId: "not-used-before-role-check",
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("invalidates the session after logout", async () => {
    const agent = createTestAgent();
    await loginAs(agent, "buyer@quoteflow.local");

    const logoutResponse = await agent.post("/api/auth/logout");
    expect(logoutResponse.status).toBe(204);

    const meResponse = await agent.get("/api/auth/me");
    expect(meResponse.status).toBe(401);
  });
});
