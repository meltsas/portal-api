export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export type Params = Record<string, string>;

export interface RouteContext {
	request: Request;
	env: Env;
	ctx: ExecutionContext;
	url: URL;
	params: Params;
}

export type RouteHandler = (context: RouteContext) => Response | Promise<Response>;

export type Next = () => Promise<Response>;

export type Middleware = (context: RouteContext, next: Next) => Response | Promise<Response>;

export interface Route {
	method: HttpMethod;
	path: string;
	middleware: Middleware[];
	handler: RouteHandler;
}
