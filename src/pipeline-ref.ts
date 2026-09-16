/**
 * Ref shapes GitLab reports for pipelines: `refs/merge-requests/<iid>/head` for
 * detached merge-request pipelines and `…/merge` for merged-result ones, plus
 * branch and tag refs. A ref that matches none of them is shown as reported.
 */
const MERGE_REQUEST = /^refs\/merge-requests\/(\d+)\/(?:head|merge)$/;
const BRANCH = /^refs\/heads\/(.+)$/;
const TAG = /^refs\/tags\/(.+)$/;

/** Human label for what a pipeline runs on, derived from its ref. */
export function refLabel(ref: string): string {
  const mergeRequest = MERGE_REQUEST.exec(ref)?.[1];
  if (mergeRequest) {
    return `!${mergeRequest}`;
  }
  const branch = BRANCH.exec(ref)?.[1];
  if (branch) {
    return branch;
  }
  const tag = TAG.exec(ref)?.[1];
  if (tag) {
    return tag;
  }
  return ref;
}
