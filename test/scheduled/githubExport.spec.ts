import { describe, it, expect } from 'vitest';
import {
	computeCompositeHash,
	evaluatePublishConditions,
	formatStableJson,
	type ConditionInput,
	type GithubExportConfig,
} from '../../src/scheduled/githubExport';
import { parseRepo } from '../../src/github/githubClient';
import type { GithubExportStateRow } from '../../src/types/db';

const baseConfig: GithubExportConfig = {
	enabled: true,
	dryRun: false,
	token: 'ghs_test_token',
	repo: 'meltsas/non-touristic-rentals',
	branch: 'data-export-test',
	weatherFilePath: 'app/data/weather/open-meteo-responses.json',
	marineFilePath: 'app/data/marine/open-meteo-responses.json',
	committerName: 'Portal Data Bot',
	committerEmail: 'portal-data-bot@example.com',
};

function fullySuppliedInput(overrides: Partial<ConditionInput> = {}): ConditionInput {
	return {
		config: baseConfig,
		hasWeatherSnapshot: true,
		hasMarineSnapshot: true,
		weatherJsonValid: true,
		marineJsonValid: true,
		compositeHash: 'newhash',
		priorState: null,
		now: new Date('2026-05-26T07:09:00Z'),
		minExportIntervalMs: 30 * 60 * 1000,
		...overrides,
	};
}

function priorState(overrides: Partial<GithubExportStateRow> = {}): GithubExportStateRow {
	return {
		id: 'state-1',
		repo: baseConfig.repo,
		branch: baseConfig.branch,
		latest_export_hash: 'oldhash',
		latest_commit_sha: 'abc123',
		latest_exported_at: '2026-05-25T07:09:00Z',
		last_attempt_at: '2026-05-25T07:09:00Z',
		last_status: 'success',
		last_error: null,
		created_at: '2026-05-20T12:00:00Z',
		updated_at: '2026-05-25T07:09:00Z',
		...overrides,
	};
}

describe('parseRepo', () => {
	it('parses well-formed owner/repo', () => {
		expect(parseRepo('meltsas/non-touristic-rentals')).toEqual({
			owner: 'meltsas',
			repo: 'non-touristic-rentals',
		});
	});

	it('trims surrounding whitespace', () => {
		expect(parseRepo('  meltsas/non-touristic-rentals  ')).toEqual({
			owner: 'meltsas',
			repo: 'non-touristic-rentals',
		});
	});

	it('returns null for missing slash', () => {
		expect(parseRepo('meltsas-non-touristic-rentals')).toBeNull();
	});

	it('returns null for too many slashes', () => {
		expect(parseRepo('meltsas/non-touristic/rentals')).toBeNull();
	});

	it('returns null for empty parts', () => {
		expect(parseRepo('/repo')).toBeNull();
		expect(parseRepo('owner/')).toBeNull();
		expect(parseRepo('/')).toBeNull();
	});

	it('returns null for empty input', () => {
		expect(parseRepo('')).toBeNull();
	});

	it('returns null when a part has internal whitespace padding', () => {
		expect(parseRepo('owner /repo')).toBeNull();
		expect(parseRepo('owner/ repo')).toBeNull();
	});
});

describe('formatStableJson', () => {
	it('emits sorted keys recursively', () => {
		const out = formatStableJson({ b: 1, a: { d: 4, c: 3 } });
		expect(out).toBe('{\n  "a": {\n    "c": 3,\n    "d": 4\n  },\n  "b": 1\n}\n');
	});

	it('preserves array order while sorting keys inside each element', () => {
		const out = formatStableJson([
			{ b: 1, a: 2 },
			{ d: 4, c: 3 },
		]);
		expect(out).toBe(
			'[\n  {\n    "a": 2,\n    "b": 1\n  },\n  {\n    "c": 3,\n    "d": 4\n  }\n]\n',
		);
	});

	it('is idempotent — re-serializing the same logical value produces identical output', () => {
		const v1 = { z: 1, a: 2, m: { y: 3, b: 4 } };
		const v2 = { a: 2, m: { b: 4, y: 3 }, z: 1 };
		expect(formatStableJson(v1)).toBe(formatStableJson(v2));
	});

	it('ends with a trailing newline', () => {
		expect(formatStableJson({})).toMatch(/\n$/);
	});

	it('handles primitives', () => {
		expect(formatStableJson(null)).toBe('null\n');
		expect(formatStableJson(42)).toBe('42\n');
		expect(formatStableJson('s')).toBe('"s"\n');
	});
});

describe('computeCompositeHash', () => {
	it('produces the same hash for the same input', async () => {
		const a = await computeCompositeHash({
			weatherData: { temp: 22 },
			marineData: { wave: 0.3 },
			weatherPath: 'a',
			marinePath: 'b',
		});
		const b = await computeCompositeHash({
			weatherData: { temp: 22 },
			marineData: { wave: 0.3 },
			weatherPath: 'a',
			marinePath: 'b',
		});
		expect(a).toBe(b);
	});

	it('changes when weather data changes', async () => {
		const a = await computeCompositeHash({
			weatherData: { temp: 22 },
			marineData: { wave: 0.3 },
			weatherPath: 'a',
			marinePath: 'b',
		});
		const b = await computeCompositeHash({
			weatherData: { temp: 23 },
			marineData: { wave: 0.3 },
			weatherPath: 'a',
			marinePath: 'b',
		});
		expect(a).not.toBe(b);
	});

	it('changes when target file paths change', async () => {
		const a = await computeCompositeHash({
			weatherData: { temp: 22 },
			marineData: { wave: 0.3 },
			weatherPath: 'a',
			marinePath: 'b',
		});
		const b = await computeCompositeHash({
			weatherData: { temp: 22 },
			marineData: { wave: 0.3 },
			weatherPath: 'a',
			marinePath: 'c',
		});
		expect(a).not.toBe(b);
	});

	it('is insensitive to key order in the inputs', async () => {
		const a = await computeCompositeHash({
			weatherData: { temp: 22, humidity: 50 },
			marineData: { wave: 0.3, period: 4 },
			weatherPath: 'a',
			marinePath: 'b',
		});
		const b = await computeCompositeHash({
			weatherData: { humidity: 50, temp: 22 },
			marineData: { period: 4, wave: 0.3 },
			weatherPath: 'a',
			marinePath: 'b',
		});
		expect(a).toBe(b);
	});
});

describe('evaluatePublishConditions', () => {
	it('commits when everything is satisfied and enabled+not-dry-run', () => {
		expect(evaluatePublishConditions(fullySuppliedInput())).toEqual({ action: 'commit' });
	});

	it('dry-runs when enabled but GITHUB_EXPORT_DRY_RUN=true', () => {
		expect(
			evaluatePublishConditions(
				fullySuppliedInput({
					config: { ...baseConfig, dryRun: true },
				}),
			),
		).toEqual({ action: 'dry_run' });
	});

	it('skips with `disabled` when enabled=false, even if dry-run=false', () => {
		expect(
			evaluatePublishConditions(
				fullySuppliedInput({
					config: { ...baseConfig, enabled: false },
				}),
			),
		).toEqual({ action: 'skip', reason: 'disabled' });
	});

	it('disabled wins over dry-run', () => {
		expect(
			evaluatePublishConditions(
				fullySuppliedInput({
					config: { ...baseConfig, enabled: false, dryRun: true },
				}),
			),
		).toEqual({ action: 'skip', reason: 'disabled' });
	});

	it('skips with `missing_token` when commit decision but no token', () => {
		expect(
			evaluatePublishConditions(
				fullySuppliedInput({
					config: { ...baseConfig, token: undefined },
				}),
			),
		).toEqual({ action: 'skip', reason: 'missing_token' });
	});

	it('skips with `invalid_repo` for missing GITHUB_REPO', () => {
		expect(
			evaluatePublishConditions(
				fullySuppliedInput({
					config: { ...baseConfig, repo: '' },
				}),
			),
		).toEqual({ action: 'skip', reason: 'invalid_repo' });
	});

	it('skips with `invalid_repo` for malformed GITHUB_REPO', () => {
		expect(
			evaluatePublishConditions(
				fullySuppliedInput({
					config: { ...baseConfig, repo: 'just-a-name' },
				}),
			),
		).toEqual({ action: 'skip', reason: 'invalid_repo' });
	});

	it('skips with `missing_branch` when branch is empty', () => {
		expect(
			evaluatePublishConditions(
				fullySuppliedInput({
					config: { ...baseConfig, branch: '' },
				}),
			),
		).toEqual({ action: 'skip', reason: 'missing_branch' });
	});

	it('skips with `missing_file_paths` when either path is empty', () => {
		expect(
			evaluatePublishConditions(
				fullySuppliedInput({
					config: { ...baseConfig, weatherFilePath: '' },
				}),
			),
		).toEqual({ action: 'skip', reason: 'missing_file_paths' });

		expect(
			evaluatePublishConditions(
				fullySuppliedInput({
					config: { ...baseConfig, marineFilePath: '' },
				}),
			),
		).toEqual({ action: 'skip', reason: 'missing_file_paths' });
	});

	it('skips with `missing_*_snapshot` if snapshots are missing', () => {
		expect(
			evaluatePublishConditions(
				fullySuppliedInput({ hasWeatherSnapshot: false }),
			),
		).toEqual({ action: 'skip', reason: 'missing_weather_snapshot' });

		expect(
			evaluatePublishConditions(
				fullySuppliedInput({ hasMarineSnapshot: false }),
			),
		).toEqual({ action: 'skip', reason: 'missing_marine_snapshot' });
	});

	it('skips with `invalid_*_json` if normalized_json fails to parse', () => {
		expect(
			evaluatePublishConditions(
				fullySuppliedInput({ weatherJsonValid: false }),
			),
		).toEqual({ action: 'skip', reason: 'invalid_weather_json' });

		expect(
			evaluatePublishConditions(
				fullySuppliedInput({ marineJsonValid: false }),
			),
		).toEqual({ action: 'skip', reason: 'invalid_marine_json' });
	});

	it('skips with `unchanged` when composite hash matches priorState.latest_export_hash', () => {
		expect(
			evaluatePublishConditions(
				fullySuppliedInput({
					compositeHash: 'samehash',
					priorState: priorState({ latest_export_hash: 'samehash' }),
				}),
			),
		).toEqual({ action: 'skip', reason: 'unchanged' });
	});

	it('skips with `too_recent` when last successful export is within min interval', () => {
		const now = new Date('2026-05-26T07:09:00Z');
		const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

		expect(
			evaluatePublishConditions(
				fullySuppliedInput({
					now,
					priorState: priorState({
						latest_export_hash: 'oldhash',
						latest_exported_at: tenMinutesAgo,
					}),
					minExportIntervalMs: 30 * 60 * 1000,
				}),
			),
		).toEqual({ action: 'skip', reason: 'too_recent' });
	});

	it('does NOT skip with `too_recent` when last export is older than min interval', () => {
		const now = new Date('2026-05-26T07:09:00Z');
		const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

		expect(
			evaluatePublishConditions(
				fullySuppliedInput({
					now,
					priorState: priorState({
						latest_export_hash: 'oldhash',
						latest_exported_at: twoHoursAgo,
					}),
				}),
			),
		).toEqual({ action: 'commit' });
	});

	it('still reaches `disabled` (not dry-run) even when valid data and changed hash exist', () => {
		// Important behavior: in the current shipping config (enabled=false,
		// dryRun=true), the result must be `skip:disabled`, not `dry_run`.
		expect(
			evaluatePublishConditions(
				fullySuppliedInput({
					config: { ...baseConfig, enabled: false, dryRun: true },
					compositeHash: 'fresh',
					priorState: priorState({ latest_export_hash: 'old', latest_exported_at: null }),
				}),
			),
		).toEqual({ action: 'skip', reason: 'disabled' });
	});

	it('dry-run with no token returns dry_run (token is only required for real commits)', () => {
		expect(
			evaluatePublishConditions(
				fullySuppliedInput({
					config: { ...baseConfig, dryRun: true, token: undefined },
				}),
			),
		).toEqual({ action: 'dry_run' });
	});
});
