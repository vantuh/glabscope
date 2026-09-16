import { expect, test } from "bun:test";
import { jobWebUrl, pipelineWebUrl } from "./gitlab-url.ts";

test("builds the pipeline and job paths under the project web url", () => {
  const base = "https://gitlab.foodtech.team/group/project";
  expect(pipelineWebUrl(base, "1457442")).toBe(
    "https://gitlab.foodtech.team/group/project/-/pipelines/1457442",
  );
  expect(jobWebUrl(base, "47074530")).toBe(
    "https://gitlab.foodtech.team/group/project/-/jobs/47074530",
  );
});

test("a trailing slash on the base does not double up", () => {
  const base = "https://gitlab.foodtech.team/group/project/";
  expect(pipelineWebUrl(base, "1457442")).toBe(
    "https://gitlab.foodtech.team/group/project/-/pipelines/1457442",
  );
  expect(jobWebUrl(base, "47074530")).toBe(
    "https://gitlab.foodtech.team/group/project/-/jobs/47074530",
  );
});

test("an id that is not all digits is rejected before anything is built", () => {
  const base = "https://gitlab.example.com/group/project";
  expect(() => pipelineWebUrl(base, "85")).not.toThrow();
  expect(() => pipelineWebUrl(base, "1457442a")).toThrow();
  expect(() => pipelineWebUrl(base, "")).toThrow();
  expect(() => pipelineWebUrl(base, "-1")).toThrow();
  expect(() => jobWebUrl(base, "47074530x")).toThrow();
  expect(() => jobWebUrl(base, "")).toThrow();
  expect(() => jobWebUrl(base, "4 7")).toThrow();
});
