import { describe, it, expect } from 'vitest';
import { shouldBypassGithubExportWindowForDev } from '../../src/scheduled/handlers';

function fakeEnv(vars: Record<string, unknown>): Env {
	return vars as unknown as Env;
}

describe('shouldBypassGithubExportWindowForDev', () => {
	it('returns true when ENVIRONMENT=development AND GITHUB_EXPORT_DRY_RUN=true', () => {
		expect(
			shouldBypassGithubExportWindowForDev(
				fakeEnv({ ENVIRONMENT: 'development', GITHUB_EXPORT_DRY_RUN: true }),
			),
		).toBe(true);
	});

	it('returns false in production even when GITHUB_EXPORT_DRY_RUN=true', () => {
		expect(
			shouldBypassGithubExportWindowForDev(
				fakeEnv({ ENVIRONMENT: 'production', GITHUB_EXPORT_DRY_RUN: true }),
			),
		).toBe(false);
	});

	it('returns false in development when GITHUB_EXPORT_DRY_RUN=false', () => {
		expect(
			shouldBypassGithubExportWindowForDev(
				fakeEnv({ ENVIRONMENT: 'development', GITHUB_EXPORT_DRY_RUN: false }),
			),
		).toBe(false);
	});

	it('returns false in production with GITHUB_EXPORT_DRY_RUN=false', () => {
		expect(
			shouldBypassGithubExportWindowForDev(
				fakeEnv({ ENVIRONMENT: 'production', GITHUB_EXPORT_DRY_RUN: false }),
			),
		).toBe(false);
	});

	it('returns false when GITHUB_EXPORT_DRY_RUN is missing entirely', () => {
		expect(
			shouldBypassGithubExportWindowForDev(
				fakeEnv({ ENVIRONMENT: 'development' }),
			),
		).toBe(false);
	});

	it('returns false when ENVIRONMENT is missing entirely', () => {
		expect(
			shouldBypassGithubExportWindowForDev(
				fakeEnv({ GITHUB_EXPORT_DRY_RUN: true }),
			),
		).toBe(false);
	});

	it('returns false on truthy-but-not-true GITHUB_EXPORT_DRY_RUN', () => {
		// Strict equality matters: a stringified "true" must not flip the gate.
		expect(
			shouldBypassGithubExportWindowForDev(
				fakeEnv({ ENVIRONMENT: 'development', GITHUB_EXPORT_DRY_RUN: 'true' }),
			),
		).toBe(false);
		expect(
			shouldBypassGithubExportWindowForDev(
				fakeEnv({ ENVIRONMENT: 'development', GITHUB_EXPORT_DRY_RUN: 1 }),
			),
		).toBe(false);
	});

	it('returns false on ENVIRONMENT casing/typos', () => {
		// Strict equality on the string 'development' is intentional — any other
		// value (Development, dev, DEVELOPMENT) must not enable the bypass.
		expect(
			shouldBypassGithubExportWindowForDev(
				fakeEnv({ ENVIRONMENT: 'Development', GITHUB_EXPORT_DRY_RUN: true }),
			),
		).toBe(false);
		expect(
			shouldBypassGithubExportWindowForDev(
				fakeEnv({ ENVIRONMENT: 'dev', GITHUB_EXPORT_DRY_RUN: true }),
			),
		).toBe(false);
	});

	it('returns false for an empty env', () => {
		expect(shouldBypassGithubExportWindowForDev(fakeEnv({}))).toBe(false);
	});
});
