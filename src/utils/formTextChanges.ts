import {
	BASE_LANGUAGE,
	findUnknownTextVariables,
	isFormLanguage,
	listTextKeys,
	type FormLanguage,
	type FormStructure,
	type TextKeySpec,
} from './formSchema';

export const MAX_TEXT_LENGTH = 5000;
export const MAX_TEXT_CHANGES = 500;

export type TextChangeErrorCode =
	| 'invalid_type'
	| 'unsupported_language'
	| 'unknown_text_key'
	| 'duplicate_change'
	| 'too_long'
	| 'unknown_variable'
	| 'invalid_link'
	| 'required_text'
	| 'missing_base_text';

export interface TextChangeError {
	/** Position of the change in the request, -1 for the request as a whole. */
	index: number;
	code: TextChangeErrorCode;
	variables?: string[];
}

export type TextOperation =
	| { kind: 'upsert'; language: FormLanguage; textKey: string; text: string }
	| { kind: 'delete'; language: FormLanguage; textKey: string }
	/** Removing an optional base-language text removes that text in every language. */
	| { kind: 'delete_all_languages'; textKey: string };

export type TextChangesResult = { ok: true; operations: TextOperation[] } | { ok: false; errors: TextChangeError[] };

/** language → text key → text, as currently stored for the template. */
export type StoredTexts = Partial<Record<FormLanguage, Record<string, string>>>;

// Markdown links: [label](url). The form only renders https links.
const LINK_PATTERN = /\[[^\]]*\]\(([^)]*)\)/g;

interface ChangeRun {
	keySpecs: Map<string, TextKeySpec>;
	stored: StoredTexts;
	operations: TextOperation[];
	seen: Set<string>;
	/** Base-language texts as they will be after this batch. */
	baseTexts: Map<string, string>;
	/** Non-base texts written by this batch; each needs a base-language text. */
	translations: { index: number; textKey: string }[];
}

/**
 * Checks a batch of text edits against the template and the stored texts. All or nothing:
 * any error rejects the whole batch. Unchanged texts produce no operation.
 */
export function validateTextChanges(structure: FormStructure, stored: StoredTexts, input: unknown): TextChangesResult {
	if (!Array.isArray(input) || input.length === 0 || input.length > MAX_TEXT_CHANGES) {
		return { ok: false, errors: [{ index: -1, code: 'invalid_type' }] };
	}

	const run: ChangeRun = {
		keySpecs: new Map(listTextKeys(structure).map((spec) => [spec.key, spec])),
		stored,
		operations: [],
		seen: new Set(),
		baseTexts: new Map(Object.entries(stored[BASE_LANGUAGE] ?? {})),
		translations: [],
	};

	const errors: TextChangeError[] = [];
	input.forEach((change: unknown, index) => {
		const error = applyChange(change, index, run);
		if (error) errors.push({ index, ...error });
	});

	for (const { index, textKey } of run.translations) {
		if (!run.baseTexts.has(textKey)) errors.push({ index, code: 'missing_base_text' });
	}

	errors.sort((a, b) => a.index - b.index);
	return errors.length > 0 ? { ok: false, errors } : { ok: true, operations: run.operations };
}

type ChangeError = Omit<TextChangeError, 'index'>;

function applyChange(change: unknown, index: number, run: ChangeRun): ChangeError | null {
	if (typeof change !== 'object' || change === null) return { code: 'invalid_type' };
	const { language, textKey, text } = change as Record<string, unknown>;

	if (typeof textKey !== 'string' || typeof text !== 'string') return { code: 'invalid_type' };
	if (!isFormLanguage(language)) return { code: 'unsupported_language' };
	const spec = run.keySpecs.get(textKey);
	if (!spec) return { code: 'unknown_text_key' };

	const changeId = `${language}:${textKey}`;
	if (run.seen.has(changeId)) return { code: 'duplicate_change' };
	run.seen.add(changeId);

	const normalized = text.replace(/\r\n?/g, '\n').trim();
	const isBase = language === BASE_LANGUAGE;
	const current = run.stored[language]?.[textKey];

	if (normalized === '') {
		if (isBase && spec.required) return { code: 'required_text' };
		if (current === undefined) return null;
		if (isBase) {
			run.baseTexts.delete(textKey);
			run.operations.push({ kind: 'delete_all_languages', textKey });
		} else {
			run.operations.push({ kind: 'delete', language, textKey });
		}
		return null;
	}

	if (normalized.length > MAX_TEXT_LENGTH) return { code: 'too_long' };
	const unknownVariables = findUnknownTextVariables(normalized);
	if (unknownVariables.length > 0) return { code: 'unknown_variable', variables: unknownVariables };
	if (hasNonHttpsLink(normalized)) return { code: 'invalid_link' };

	if (isBase) run.baseTexts.set(textKey, normalized);
	else run.translations.push({ index, textKey });

	if (current !== normalized) {
		run.operations.push({ kind: 'upsert', language, textKey, text: normalized });
	}
	return null;
}

function hasNonHttpsLink(text: string): boolean {
	for (const match of text.matchAll(LINK_PATTERN)) {
		if (!match[1].trim().startsWith('https://')) return true;
	}
	return false;
}
