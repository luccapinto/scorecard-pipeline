// Outbound links, in one place. Plain anchors: following one navigates away,
// it never makes the page itself issue a request.

export const REPO_URL = 'https://github.com/luccapinto/scorecard-pipeline';
export const README_URL = `${REPO_URL}#readme`;
export const ADRS_URL = `${REPO_URL}/tree/main/docs/adr`;
export const AUTHOR_NAME = 'Lucca Pinto';
export const AUTHOR_URL = 'https://github.com/luccapinto';

/** A file in the repository on GitHub, e.g. `codeUrl('app/tasks.py')`. */
export function codeUrl(path: string): string {
  return `${REPO_URL}/blob/main/${path}`;
}
