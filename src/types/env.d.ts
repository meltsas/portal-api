// Augments the generated Cloudflare.Env interface in worker-configuration.d.ts
// so that GOOGLE_CLIENT_ID and SESSION_SECRET (declared in wrangler.jsonc vars)
// are typed without re-running `wrangler types`. Once `npm run cf-typegen` is
// run, the regenerated file will declare the same fields with identical types,
// which TypeScript merges without conflict.
declare namespace Cloudflare {
	interface Env {
		GOOGLE_CLIENT_ID: string;
		SESSION_SECRET: string;
	}
}
