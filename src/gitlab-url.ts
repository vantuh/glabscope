/**
 * Web URLs for the objects the TUI shows, built from the project's web URL that
 * `glab repo view` already reports. Both shapes were verified against the
 * `web_url` values glab itself returns for the same pipeline and job on the
 * operator's instance, and the id is refused before anything is built, so a
 * non-numeric id can never become a path segment.
 */
function requireNumericId(id: string, kind: string): string {
  if (!/^\d+$/.test(id)) {
    throw new Error(`Cannot build a gitlab web url without a numeric ${kind} id`);
  }
  return id;
}

function trimBase(base: string): string {
  return base.replace(/\/+$/, "");
}

export function pipelineWebUrl(base: string, pipelineId: string): string {
  return `${trimBase(base)}/-/pipelines/${requireNumericId(pipelineId, "pipeline")}`;
}

export function jobWebUrl(base: string, jobId: string): string {
  return `${trimBase(base)}/-/jobs/${requireNumericId(jobId, "job")}`;
}
