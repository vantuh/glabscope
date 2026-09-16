/**
 * Spike (gitlab.foodtech.team, 2026-09-15):
 * `glab api graphql -f query=...` with an inline query (not `--input` JSON).
 * `CiJob.needs.nodes` exists. Each need `id` is `gid://gitlab/Ci::BuildNeed/...`,
 * not the upstream job id — match edges by `name`. Job `id` is
 * `gid://gitlab/Ci::Build/<rest-job-id>` (use that numeric tail for `glab ci trace`).
 * `kind` is BUILD / BRIDGE. REST `GET .../pipelines/:id/jobs` has no `needs`.
 * `Pipeline.stages.nodes` is the GitLab column order (do not sort names).
 * `CiJob.retried` is true for superseded attempts; the latest attempt is `retried: false`.
 */
export const PIPELINE_JOBS_QUERY = `
query {
  project(fullPath: "PROJECT_FULL_PATH") {
    pipeline(iid: "PIPELINE_IID") {
      id
      iid
      status
      stages {
        nodes { name }
      }
      jobs(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          id
          name
          status
          kind
          retried
          stage { name }
          needs {
            nodes { id name }
          }
        }
      }
    }
  }
}
`.trim();

export function pipelineJobsQuery(fullPath: string, pipelineIid: string): string {
  if (!/^[\w./-]+$/.test(fullPath) || !/^\d+$/.test(pipelineIid)) {
    throw new Error("Invalid project path or pipeline iid");
  }
  return PIPELINE_JOBS_QUERY.replace("PROJECT_FULL_PATH", fullPath).replace(
    "PIPELINE_IID",
    pipelineIid,
  );
}
