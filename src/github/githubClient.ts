/**
 * Minimal GitHub REST client for the smart GitHub export cron.
 *
 * Built on native `fetch` rather than Octokit to keep the Worker bundle
 * lean and avoid an extra dependency. Only covers the Git Database
 * endpoints the export flow needs: get branch head, get commit, create
 * tree, create commit, update ref.
 *
 * `fetchImpl` is injectable so tests can mock the network without
 * intercepting `globalThis.fetch`.
 */

export interface RepoIdentity {
	owner: string;
	repo: string;
}

/**
 * Parse a "owner/repo" string. Returns null on any malformed input —
 * empty parts, missing slash, extra slashes, leading/trailing whitespace
 * in the parts. Tolerates leading/trailing whitespace around the whole
 * string.
 */
export function parseRepo(value: string): RepoIdentity | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	const parts = trimmed.split('/');
	if (parts.length !== 2) return null;
	const [owner, repo] = parts;
	if (!owner || !repo) return null;
	if (owner.trim() !== owner || repo.trim() !== repo) return null;
	return { owner, repo };
}

export interface GithubBlobFile {
	path: string;
	content: string;
}

export interface GithubCommitRef {
	commitSha: string;
}

export interface GithubCommitDetail {
	commitSha: string;
	treeSha: string;
}

export interface GithubTreeResult {
	treeSha: string;
}

export interface CreateCommitInput {
	message: string;
	treeSha: string;
	parentSha: string;
	author: { name: string; email: string };
	committer: { name: string; email: string };
}

export interface GithubClient {
	getBranchHead(branch: string): Promise<GithubCommitRef>;
	getCommit(commitSha: string): Promise<GithubCommitDetail>;
	createTree(baseTreeSha: string, files: GithubBlobFile[]): Promise<GithubTreeResult>;
	createCommit(input: CreateCommitInput): Promise<GithubCommitRef>;
	updateBranchRef(branch: string, commitSha: string, opts?: { force?: boolean }): Promise<void>;
}

export interface GithubClientConfig {
	token: string;
	owner: string;
	repo: string;
	userAgent?: string;
	fetchImpl?: typeof fetch;
}

const DEFAULT_USER_AGENT = 'portal-api';
const GITHUB_API_BASE = 'https://api.github.com';

export function createGithubClient(config: GithubClientConfig): GithubClient {
	const fetchImpl = config.fetchImpl ?? fetch;
	const baseHeaders: Record<string, string> = {
		Authorization: `Bearer ${config.token}`,
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
		'User-Agent': config.userAgent ?? DEFAULT_USER_AGENT,
	};

	const repoPath = `/repos/${encodePathSegment(config.owner)}/${encodePathSegment(config.repo)}`;

	async function request(
		method: 'GET' | 'POST' | 'PATCH',
		path: string,
		body?: unknown,
	): Promise<unknown> {
		const url = `${GITHUB_API_BASE}${path}`;
		const init: RequestInit = {
			method,
			headers: { ...baseHeaders },
		};
		if (body !== undefined) {
			init.body = JSON.stringify(body);
			(init.headers as Record<string, string>)['Content-Type'] = 'application/json';
		}

		const res = await fetchImpl(url, init);

		if (!res.ok) {
			const text = await res.text().catch(() => '');
			const detail = extractGithubErrorMessage(text);
			throw new Error(
				`GitHub ${method} ${path} failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`,
			);
		}

		if (res.status === 204) return null;
		return res.json();
	}

	return {
		async getBranchHead(branch) {
			const data = (await request('GET', `${repoPath}/git/ref/heads/${encodePathSegment(branch)}`)) as {
				object?: { sha?: string };
			};
			const sha = data?.object?.sha;
			if (!sha) throw new Error(`GitHub branch ref response missing object.sha for "${branch}"`);
			return { commitSha: sha };
		},

		async getCommit(commitSha) {
			const data = (await request('GET', `${repoPath}/git/commits/${encodePathSegment(commitSha)}`)) as {
				sha?: string;
				tree?: { sha?: string };
			};
			const sha = data?.sha;
			const treeSha = data?.tree?.sha;
			if (!sha || !treeSha) {
				throw new Error(`GitHub commit response missing sha/tree.sha for "${commitSha}"`);
			}
			return { commitSha: sha, treeSha };
		},

		async createTree(baseTreeSha, files) {
			const body = {
				base_tree: baseTreeSha,
				tree: files.map((f) => ({
					path: f.path,
					mode: '100644',
					type: 'blob',
					content: f.content,
				})),
			};
			const data = (await request('POST', `${repoPath}/git/trees`, body)) as { sha?: string };
			if (!data?.sha) throw new Error('GitHub create-tree response missing sha');
			return { treeSha: data.sha };
		},

		async createCommit(input) {
			const body = {
				message: input.message,
				tree: input.treeSha,
				parents: [input.parentSha],
				author: input.author,
				committer: input.committer,
			};
			const data = (await request('POST', `${repoPath}/git/commits`, body)) as { sha?: string };
			if (!data?.sha) throw new Error('GitHub create-commit response missing sha');
			return { commitSha: data.sha };
		},

		async updateBranchRef(branch, commitSha, opts) {
			const body = {
				sha: commitSha,
				force: opts?.force === true,
			};
			await request('PATCH', `${repoPath}/git/refs/heads/${encodePathSegment(branch)}`, body);
		},
	};
}

/**
 * GitHub path segments preserve `/` characters in refs (e.g. heads/foo/bar),
 * but the segments we pass here are always single tokens (owner, repo,
 * branch, sha). encodeURIComponent is the right choice.
 */
function encodePathSegment(value: string): string {
	return encodeURIComponent(value);
}

function extractGithubErrorMessage(rawBody: string): string {
	if (!rawBody) return '';
	try {
		const parsed = JSON.parse(rawBody) as { message?: unknown };
		if (typeof parsed?.message === 'string') return parsed.message;
	} catch {
		// fall through
	}
	return rawBody.slice(0, 200);
}
