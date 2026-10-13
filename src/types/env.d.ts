// Augments the generated Cloudflare.Env interface in worker-configuration.d.ts.
// SESSION_SECRET is a Wrangler secret (`.dev.vars` locally), so `wrangler types`
// only sees it when `.dev.vars` defines it.
declare namespace Cloudflare {
	interface Env {
		GOOGLE_CLIENT_ID: string;
		SESSION_SECRET: string;
	}
}
