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
