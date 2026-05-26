import { describe, it, expect } from 'vitest';
import { createGithubClient } from '../../src/github/githubClient';

interface CapturedRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string | null;
}

function recordingFetch(responses: Response[]): { fetch: typeof fetch; calls: CapturedRequest[] } {
	const calls: CapturedRequest[] = [];
	const queue = [...responses];
	const fakeFetch: typeof fetch = async (input, init) => {
		const url = typeof input === 'string' ? input : (input as Request).url;
		const method = (init?.method ?? 'GET').toUpperCase();
		const headers: Record<string, string> = {};
		if (init?.headers) {
			for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
				headers[k] = v;
			}
		}
		const body = typeof init?.body === 'string' ? init.body : null;
		calls.push({ url, method, headers, body });

		const next = queue.shift();
		if (!next) throw new Error('recordingFetch ran out of queued responses');
		return next;
	};
	return { fetch: fakeFetch, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

const baseConfig = {
	token: 'ghs_test_token',
	owner: 'meltsas',
	repo: 'non-touristic-rentals',
};

describe('createGithubClient — request construction', () => {
	it('sets required GitHub headers on every request', async () => {
		const { fetch, calls } = recordingFetch([
			jsonResponse({ object: { sha: 'abc' } }),
		]);
		const client = createGithubClient({ ...baseConfig, fetchImpl: fetch });
		await client.getBranchHead('data-export-test');

		expect(calls).toHaveLength(1);
		const headers = calls[0]!.headers;
		expect(headers.Authorization).toBe('Bearer ghs_test_token');
		expect(headers.Accept).toBe('application/vnd.github+json');
		expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
		expect(headers['User-Agent']).toBe('portal-api');
	});

	it('uses a custom User-Agent when provided', async () => {
		const { fetch, calls } = recordingFetch([
			jsonResponse({ object: { sha: 'abc' } }),
		]);
		const client = createGithubClient({ ...baseConfig, fetchImpl: fetch, userAgent: 'portal-api/custom' });
		await client.getBranchHead('data-export-test');
		expect(calls[0]!.headers['User-Agent']).toBe('portal-api/custom');
	});

	it('getBranchHead builds the right URL and returns commitSha', async () => {
		const { fetch, calls } = recordingFetch([
			jsonResponse({ object: { sha: 'parent-commit-sha' } }),
		]);
		const client = createGithubClient({ ...baseConfig, fetchImpl: fetch });
		const result = await client.getBranchHead('data-export-test');

		expect(calls[0]!.method).toBe('GET');
		expect(calls[0]!.url).toBe(
			'https://api.github.com/repos/meltsas/non-touristic-rentals/git/ref/heads/data-export-test',
		);
		expect(result).toEqual({ commitSha: 'parent-commit-sha' });
	});

	it('URL-encodes branch names with special characters', async () => {
		const { fetch, calls } = recordingFetch([
			jsonResponse({ object: { sha: 'sha' } }),
		]);
		const client = createGithubClient({ ...baseConfig, fetchImpl: fetch });
		await client.getBranchHead('feature/my branch');

		expect(calls[0]!.url).toBe(
			'https://api.github.com/repos/meltsas/non-touristic-rentals/git/ref/heads/feature%2Fmy%20branch',
		);
	});

	it('getCommit returns sha + treeSha', async () => {
		const { fetch, calls } = recordingFetch([
			jsonResponse({ sha: 'parent-commit-sha', tree: { sha: 'parent-tree-sha' } }),
		]);
		const client = createGithubClient({ ...baseConfig, fetchImpl: fetch });
		const result = await client.getCommit('parent-commit-sha');

		expect(calls[0]!.method).toBe('GET');
		expect(calls[0]!.url).toBe(
			'https://api.github.com/repos/meltsas/non-touristic-rentals/git/commits/parent-commit-sha',
		);
		expect(result).toEqual({ commitSha: 'parent-commit-sha', treeSha: 'parent-tree-sha' });
	});

	it('createTree posts the right body shape with base_tree + blob entries', async () => {
		const { fetch, calls } = recordingFetch([
			jsonResponse({ sha: 'new-tree-sha' }),
		]);
		const client = createGithubClient({ ...baseConfig, fetchImpl: fetch });
		const result = await client.createTree('parent-tree-sha', [
			{ path: 'app/data/weather/open-meteo-responses.json', content: '{"a":1}' },
			{ path: 'app/data/marine/open-meteo-responses.json', content: '{"b":2}' },
		]);

		expect(calls[0]!.method).toBe('POST');
		expect(calls[0]!.url).toBe('https://api.github.com/repos/meltsas/non-touristic-rentals/git/trees');
		expect(calls[0]!.headers['Content-Type']).toBe('application/json');

		const body = JSON.parse(calls[0]!.body!);
		expect(body).toEqual({
			base_tree: 'parent-tree-sha',
			tree: [
				{
					path: 'app/data/weather/open-meteo-responses.json',
					mode: '100644',
					type: 'blob',
					content: '{"a":1}',
				},
				{
					path: 'app/data/marine/open-meteo-responses.json',
					mode: '100644',
					type: 'blob',
					content: '{"b":2}',
				},
			],
		});
		expect(result).toEqual({ treeSha: 'new-tree-sha' });
	});

	it('createCommit posts message + tree + single-parent + author/committer', async () => {
		const { fetch, calls } = recordingFetch([
			jsonResponse({ sha: 'new-commit-sha' }),
		]);
		const client = createGithubClient({ ...baseConfig, fetchImpl: fetch });
		const result = await client.createCommit({
			message: 'Update weather and marine data',
			treeSha: 'new-tree-sha',
			parentSha: 'parent-commit-sha',
			author: { name: 'Portal Data Bot', email: 'bot@example.com' },
			committer: { name: 'Portal Data Bot', email: 'bot@example.com' },
		});

		expect(calls[0]!.method).toBe('POST');
		expect(calls[0]!.url).toBe('https://api.github.com/repos/meltsas/non-touristic-rentals/git/commits');

		const body = JSON.parse(calls[0]!.body!);
		expect(body).toEqual({
			message: 'Update weather and marine data',
			tree: 'new-tree-sha',
			parents: ['parent-commit-sha'],
			author: { name: 'Portal Data Bot', email: 'bot@example.com' },
			committer: { name: 'Portal Data Bot', email: 'bot@example.com' },
		});
		expect(result).toEqual({ commitSha: 'new-commit-sha' });
	});

	it('updateBranchRef PATCHes with force=false by default', async () => {
		const { fetch, calls } = recordingFetch([
			jsonResponse({ ref: 'refs/heads/data-export-test', object: { sha: 'new-commit-sha' } }),
		]);
		const client = createGithubClient({ ...baseConfig, fetchImpl: fetch });
		await client.updateBranchRef('data-export-test', 'new-commit-sha');

		expect(calls[0]!.method).toBe('PATCH');
		expect(calls[0]!.url).toBe(
			'https://api.github.com/repos/meltsas/non-touristic-rentals/git/refs/heads/data-export-test',
		);
		expect(JSON.parse(calls[0]!.body!)).toEqual({ sha: 'new-commit-sha', force: false });
	});

	it('updateBranchRef passes force=true when opted in', async () => {
		const { fetch, calls } = recordingFetch([
			jsonResponse({ ref: 'x', object: { sha: 's' } }),
		]);
		const client = createGithubClient({ ...baseConfig, fetchImpl: fetch });
		await client.updateBranchRef('data-export-test', 'new-commit-sha', { force: true });
		expect(JSON.parse(calls[0]!.body!).force).toBe(true);
	});

	it('throws a clear error including GitHub message on non-2xx', async () => {
		const errorResponse = new Response(
			JSON.stringify({ message: 'Bad credentials', documentation_url: 'https://docs.github.com' }),
			{ status: 401, statusText: 'Unauthorized', headers: { 'Content-Type': 'application/json' } },
		);
		const { fetch } = recordingFetch([errorResponse]);
		const client = createGithubClient({ ...baseConfig, fetchImpl: fetch });

		await expect(client.getBranchHead('data-export-test')).rejects.toThrow(/401.*Bad credentials/);
	});

	it('does NOT call the network on construction — only when methods are invoked', () => {
		const { fetch, calls } = recordingFetch([]);
		createGithubClient({ ...baseConfig, fetchImpl: fetch });
		expect(calls).toHaveLength(0);
	});
});
