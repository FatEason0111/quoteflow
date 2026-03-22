import supertest from "supertest";
import { createApp } from "../../src/app.js";

export function createTestAgent() {
  return supertest.agent(createApp());
}
