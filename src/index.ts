import { createRouter } from './router/createRouter';
import { cors } from './middleware/cors';
import { requestLogger } from './middleware/requestLogger';
import { publicRoutes } from './routes/public';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';

const router = createRouter([...publicRoutes, ...authRoutes, ...adminRoutes], {
	middleware: [requestLogger(), cors()],
});

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return router.handle(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
