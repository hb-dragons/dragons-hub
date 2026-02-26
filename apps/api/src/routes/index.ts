import { Hono } from "hono";
import { healthRoutes } from "./health.routes";
import { syncRoutes } from "./admin/sync.routes";
import { matchRoutes } from "./admin/match.routes";
import { teamRoutes } from "./admin/team.routes";
import { settingsRoutes } from "./admin/settings.routes";
import { leagueRoutes } from "./admin/league.routes";
import { venueRoutes } from "./admin/venue.routes";
import { refereeRoutes } from "./admin/referee.routes";
import { standingsRoutes } from "./admin/standings.routes";
import { boardRoutes } from "./admin/board.routes";
import { taskRoutes } from "./admin/task.routes";
import { bookingRoutes } from "./admin/booking.routes";
import { notificationRoutes } from "./admin/notification.routes";

const routes = new Hono();

routes.route("/", healthRoutes);
routes.route("/admin", syncRoutes);
routes.route("/admin", matchRoutes);
routes.route("/admin", teamRoutes);
routes.route("/admin", settingsRoutes);
routes.route("/admin", leagueRoutes);
routes.route("/admin", venueRoutes);
routes.route("/admin", refereeRoutes);
routes.route("/admin", standingsRoutes);
routes.route("/admin", boardRoutes);
routes.route("/admin", taskRoutes);
routes.route("/admin", bookingRoutes);
routes.route("/admin", notificationRoutes);

export { routes };
