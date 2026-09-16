import { expect, test } from "bun:test";
import fixture from "../fixtures/pipeline-jobs-needs.json";
import { PIPELINE_JOBS_QUERY, pipelineJobsQuery } from "./query.ts";

test("recorded query asks for jobs, stages, retried, status, and needs", () => {
  expect(PIPELINE_JOBS_QUERY).toContain("needs");
  expect(PIPELINE_JOBS_QUERY).toContain("status");
  expect(PIPELINE_JOBS_QUERY).toContain("pageInfo");
  expect(PIPELINE_JOBS_QUERY).toContain("stages");
  expect(PIPELINE_JOBS_QUERY).toContain("retried");
});

test("real payload includes job ids and at least one named need", () => {
  const jobs = fixture.data.project.pipeline.jobs.nodes;
  expect(jobs.length).toBeGreaterThan(0);
  expect(jobs[0]?.id).toContain("gid://gitlab/Ci::Build/");
  const withNeeds = jobs.filter((job) => job.needs.nodes.length > 0);
  expect(withNeeds.length).toBeGreaterThan(0);
  expect(withNeeds[0]?.needs.nodes[0]?.id).toContain("Ci::BuildNeed");
  expect(withNeeds[0]?.needs.nodes[0]?.name).toBeTruthy();
});

test("pipelineJobsQuery interpolates a safe path and iid", () => {
  const q = pipelineJobsQuery("group/app", "18");
  expect(q).toContain('fullPath: "group/app"');
  expect(q).toContain('iid: "18"');
  expect(() => pipelineJobsQuery('x"y', "1")).toThrow();
});
