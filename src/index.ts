import { createRouter } from './router/createRouter';
import { cors } from './middleware/cors';
import { requestLogger } from './middleware/requestLogger';
import { publicRoutes } from './routes/public';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { tenantFormRoutes } from './routes/tenantForms';
import {
	CRON_HOURLY_FETCH,
	CRON_SMART_GITHUB_EXPORT,
	runHourlyFetch,
	runSmartGithubExport,
} from './scheduled/handlers';
import { runScheduledTenantFormsCleanup } from './scheduled/tenantFormsCleanup';

const router = createRouter([...publicRoutes, ...authRoutes, ...adminRoutes, ...tenantFormRoutes], {
	middleware: [requestLogger(), cors()],
});

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return router.handle(request, env, ctx);
	},

	async scheduled(controller, env, ctx): Promise<void> {
		// Cron expressions must match `wrangler.jsonc -> triggers.crons`.
		switch (controller.cron) {
			case CRON_HOURLY_FETCH:
				ctx.waitUntil(runHourlyFetch(env));
				// Runs only once a day (Madrid night), see tenantFormsCleanup.ts.
				ctx.waitUntil(runScheduledTenantFormsCleanup(env));
				return;
			case CRON_SMART_GITHUB_EXPORT:
				ctx.waitUntil(runSmartGithubExport(env));
				return;
			default:
				console.warn(`[scheduled] unhandled cron expression: ${controller.cron}`);
		}
	},
} satisfies ExportedHandler<Env>;
