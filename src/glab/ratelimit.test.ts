import { expect, test } from "bun:test";
import { RateLimitedError, looksRateLimited, rateLimitedError } from "./ratelimit.ts";

test("recognizes representative 429 output", () => {
  expect(looksRateLimited("ERROR: 429 Too Many Requests")).toBe(true);
  expect(
    looksRateLimited("error: API v4: GET https://gitlab.example.com/api/v4/jobs: 429 {error: Too Many Requests}"),
  ).toBe(true);
  expect(looksRateLimited("gitlab: API rate limit exceeded")).toBe(true);
});

test("ordinary failures are not classified as rate limits", () => {
  expect(looksRateLimited("error: 500 Internal Server Error")).toBe(false);
  expect(looksRateLimited("fatal: could not read from remote repository")).toBe(false);
  expect(looksRateLimited("")).toBe(false);
});

test("rate-limited errors carry the classifier name for backoff checks", () => {
  const error = rateLimitedError({ stdout: "", stderr: "ERROR: 429 Too Many Requests" });
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe("RateLimitedError");
  expect(error).toBeInstanceOf(RateLimitedError);
  expect(error.message).toContain("429");
});

test("rate-limited errors fall back to a generic message without output", () => {
  const error = rateLimitedError({ stdout: "", stderr: "" });
  expect(error.message).toContain("429");
});
