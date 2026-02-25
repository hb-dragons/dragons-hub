import { Hono } from "hono";
import { healthRoutes } from "./health.routes";
import { syncRoutes } from "./admin/sync.routes";
import { matchRoutes } from "./admin/match.routes";
import { teamRoutes } from "./admin/team.routes";
import { settingsRoutes } from "./admin/settings.routes";
import { leagueRoutes } from "./admin/league.routes";
import { venueRoutes } from "./admin/venue.routes";

const routes = new Hono();

routes.route("/", healthRoutes);
routes.route("/admin", syncRoutes);
routes.route("/admin", matchRoutes);
routes.route("/admin", teamRoutes);
routes.route("/admin", settingsRoutes);
routes.route("/admin", leagueRoutes);
routes.route("/admin", venueRoutes);

export { routes };
