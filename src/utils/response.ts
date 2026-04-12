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
