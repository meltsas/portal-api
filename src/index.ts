import { createRouter } from './router/createRouter';
import { cors } from './middleware/cors';
import { requestLogger } from './middleware/requestLogger';
import { publicRoutes } from './routes/public';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import {
	CRON_GITHUB_EXPORT_PLACEHOLDER,
	CRON_HOURLY_FETCH,
	runGithubExportPlaceholder,
	runHourlyFetch,
} from './scheduled/handlers';

const router = createRouter([...publicRoutes, ...authRoutes, ...adminRoutes], {
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
				return;
			case CRON_GITHUB_EXPORT_PLACEHOLDER:
				ctx.waitUntil(runGithubExportPlaceholder(env));
				return;
			default:
				console.warn(`[scheduled] unhandled cron expression: ${controller.cron}`);
		}
	},
} satisfies ExportedHandler<Env>;
