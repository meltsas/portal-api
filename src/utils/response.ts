	export function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

export function methodNotAllowed(): Response {
	return jsonResponse({ error: 'Method not allowed' }, 405);
}

export function notFound(): Response {
	return jsonResponse({ error: 'Not found' }, 404);
}

export function badRequest(message: string): Response {
	return jsonResponse({ error: message }, 400);
}

/**
 * Parses a JSON request body. Returns null if the body is missing or not valid JSON.
 */
export async function parseJsonBody<T = unknown>(request: Request): Promise<T | null> {
	try {
		return await request.json<T>();
	} catch {
		return null;
	}
}

/**
 * Like parseJsonBody, but answers 413 for a body over `maxBytes` and 400 for invalid JSON.
 */
export async function parseJsonBodyWithLimit<T = unknown>(request: Request, maxBytes: number): Promise<{ body: T } | Response> {
	const tooLarge = () => jsonResponse({ error: 'Request body is too large' }, 413);
	if (Number(request.headers.get('Content-Length') ?? '0') > maxBytes) return tooLarge();

	const text = await request.text();
	if (new TextEncoder().encode(text).byteLength > maxBytes) return tooLarge();

	try {
		return { body: JSON.parse(text) as T };
	} catch {
		return badRequest('Invalid or missing JSON body');
	}
}
