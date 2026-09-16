import { expect, mock, spyOn, test } from "bun:test";
import fixture from "../fixtures/pipeline-jobs-needs.json";
import retriedFixture from "../fixtures/pipeline-jobs-retried.json";
import missing from "../fixtures/needs-missing.json";
import { fetchPipelineGraph, latestJobs, NeedsUnavailableError, parsePipelineGraph, projectFullPath, projectInfo } from "./graph.ts";
import { RateLimitedError } from "./ratelimit.ts";
import * as runModule from "./run.ts";

test("parses real jobs and name-based needs", () => {
  const graph = parsePipelineGraph(fixture);
  expect(graph.iid).toBe("18");
  expect(graph.jobs.length).toBe(14);
  const sonarqube = graph.jobs.find((job) => job.name === "sonarqube");
  expect(sonarqube?.needsNames).toEqual(["tests"]);
  expect(sonarqube?.numericId).toBe("47085888");
  expect(graph.jobs.some((job) => job.isBridge)).toBe(false);
  expect(graph.truncated).toBe(false);
  expect(graph.stageNames).toEqual([
    "prepare",
    "secure_code",
    "metrics",
    "build_images",
    "deploy",
    "security",
  ]);
  expect(graph.jobs.every((job) => job.retried === false)).toBe(true);
});

test("fails clearly when needs is absent from the schema", () => {
  expect(() => parsePipelineGraph(missing)).toThrow(NeedsUnavailableError);
});

test("bridge jobs stay as ordinary nodes on the same pipeline", () => {
  const graph = parsePipelineGraph({
    data: {
      project: {
        pipeline: {
          id: "gid://gitlab/Ci::Pipeline/1",
          iid: "1",
          status: "RUNNING",
          jobs: {
            nodes: [
              {
                id: "gid://gitlab/Ci::Build/10",
                name: "build",
                status: "success",
                kind: "BUILD",
                stage: { name: "build" },
                needs: { nodes: [] },
              },
              {
                id: "gid://gitlab/Ci::Build/11",
                name: "trigger-child",
                status: "success",
                kind: "BRIDGE",
                stage: { name: "deploy" },
                needs: { nodes: [{ name: "build" }] },
              },
            ],
          },
        },
      },
    },
  });
  expect(graph.jobs).toHaveLength(2);
  expect(graph.jobs[1]?.isBridge).toBe(true);
  expect(graph.iid).toBe("1");
  expect(graph.jobs[0]?.retried).toBe(false);
  expect(graph.stageNames).toEqual([]);
});

test("latest attempt is the job with retried false, else the highest numeric id", () => {
  const graph = parsePipelineGraph({
    data: {
      project: {
        pipeline: {
          id: "gid://gitlab/Ci::Pipeline/1",
          iid: "1",
          status: "SUCCESS",
          stages: { nodes: [{ name: "test" }] },
          jobs: {
            nodes: [
              {
                id: "gid://gitlab/Ci::Build/10",
                name: "lint",
                status: "failed",
                kind: "BUILD",
                retried: true,
                stage: { name: "test" },
                needs: { nodes: [] },
              },
              {
                id: "gid://gitlab/Ci::Build/12",
                name: "lint",
                status: "success",
                kind: "BUILD",
                retried: false,
                stage: { name: "test" },
                needs: { nodes: [] },
              },
            ],
          },
        },
      },
    },
  });
  expect(latestJobs(graph.jobs).map((job) => job.numericId)).toEqual(["12"]);
});

test("a retried-away attempt collapses to one node per job with its needs intact", () => {
  const graph = parsePipelineGraph(retriedFixture);
  // The payload keeps both attempts: the attempts list needs the older one.
  expect(graph.jobs).toHaveLength(4);
  expect(graph.jobs.filter((job) => job.name === "tests")).toHaveLength(2);

  const visible = latestJobs(graph.jobs);
  expect(visible.map((job) => job.name)).toEqual(["build", "tests", "deploy"]);
  expect(new Set(visible.map((job) => `${job.stage}\0${job.name}`)).size).toBe(3);
  const tests = visible.find((job) => job.name === "tests");
  expect(tests?.numericId).toBe("47085812");
  expect(tests?.status).toBe("SUCCESS");
  expect(tests?.needsNames).toEqual(["build"]);
  expect(visible.find((job) => job.name === "deploy")?.needsNames).toEqual(["tests"]);
});

test("one glab repo view is shared by every read of the same directory", async () => {
  let calls = 0;
  const runSpy = spyOn(runModule, "runGlab").mockImplementation(async () => {
    calls += 1;
    return {
      stdout: JSON.stringify({
        path_with_namespace: "group/project",
        web_url: "https://gitlab.example.com/group/project",
      }),
      stderr: "",
      code: 0,
    };
  });
  try {
    const cwd = "/tmp/glabscope-project-cache";
    const first = await projectInfo(cwd);
    expect(first).toEqual({
      fullPath: "group/project",
      webUrl: "https://gitlab.example.com/group/project",
    });
    expect(await projectInfo(cwd)).toEqual(first);
    expect(calls).toBe(1);
    // The graph path keeps reading the full path through the same cache.
    expect(await projectFullPath(cwd)).toBe("group/project");
    expect(calls).toBe(1);
  } finally {
    runSpy.mockRestore();
  }
});

test("a payload without web_url still yields the full path and no web address", async () => {
  const runSpy = spyOn(runModule, "runGlab").mockResolvedValue({
    stdout: JSON.stringify({ path_with_namespace: "group/project" }),
    stderr: "",
    code: 0,
  });
  try {
    const info = await projectInfo("/tmp/glabscope-no-web-url");
    expect(info.fullPath).toBe("group/project");
    expect(info.webUrl).toBeNull();
  } finally {
    runSpy.mockRestore();
  }
});

test("a payload with no project path at all is an error", async () => {
  const runSpy = spyOn(runModule, "runGlab").mockResolvedValue({
    stdout: JSON.stringify({ web_url: "https://gitlab.example.com/group/project" }),
    stderr: "",
    code: 0,
  });
  try {
    await expect(projectInfo("/tmp/glabscope-missing-path")).rejects.toThrow(
      "path_with_namespace",
    );
  } finally {
    runSpy.mockRestore();
  }
});

test("the pre-existing fallback to path is kept", async () => {
  const runSpy = spyOn(runModule, "runGlab").mockResolvedValue({
    stdout: JSON.stringify({ path: "group/project" }),
    stderr: "",
    code: 0,
  });
  try {
    expect((await projectInfo("/tmp/glabscope-path-fallback")).fullPath).toBe("group/project");
  } finally {
    runSpy.mockRestore();
  }
});

test("two first reads of the same directory share one glab repo view", async () => {
  let calls = 0;
  const runSpy = spyOn(runModule, "runGlab").mockImplementation(async () => {
    calls += 1;
    await Bun.sleep(5);
    return {
      stdout: JSON.stringify({
        path_with_namespace: "group/project",
        web_url: "https://gitlab.example.com/group/project",
      }),
      stderr: "",
      code: 0,
    };
  });
  try {
    const cwd = "/tmp/glabscope-project-concurrent";
    const [first, second] = await Promise.all([projectInfo(cwd), projectInfo(cwd)]);
    expect(second).toEqual(first);
    expect(calls).toBe(1);
  } finally {
    runSpy.mockRestore();
  }
});

test("a failed project read is not cached", async () => {
  let calls = 0;
  const runSpy = spyOn(runModule, "runGlab").mockImplementation(async () => {
    calls += 1;
    if (calls === 1) {
      return { stdout: "", stderr: "boom", code: 1 };
    }
    return {
      stdout: JSON.stringify({ path_with_namespace: "group/project" }),
      stderr: "",
      code: 0,
    };
  });
  try {
    const cwd = "/tmp/glabscope-project-retry";
    await expect(projectInfo(cwd)).rejects.toThrow("boom");
    expect((await projectInfo(cwd)).fullPath).toBe("group/project");
    expect(calls).toBe(2);
  } finally {
    runSpy.mockRestore();
  }
});

test("a rate-limited graphql call is classified as a rate-limit error", async () => {
  const repoView = {
    path_with_namespace: "group/project",
  };
  let call = 0;
  const runSpy = spyOn(runModule, "runGlab").mockImplementation(async () => {
    call += 1;
    if (call === 1) {
      return { stdout: JSON.stringify(repoView), stderr: "", code: 0 };
    }
    return { stdout: "", stderr: "error: 429 Too Many Requests", code: 1 };
  });
  try {
    await expect(fetchPipelineGraph("18", process.cwd())).rejects.toThrow(RateLimitedError);
  } finally {
    runSpy.mockRestore();
    mock.restore();
  }
});
