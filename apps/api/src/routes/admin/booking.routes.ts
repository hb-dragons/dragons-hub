import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import {
  listBookings,
  getBookingDetail,
  updateBooking,
  updateBookingStatus,
  createBooking,
  deleteBooking,
} from "../../services/admin/booking-admin.service";
import {
  bookingIdParamSchema,
  bookingListQuerySchema,
  bookingUpdateBodySchema,
  bookingStatusBodySchema,
  bookingCreateBodySchema,
} from "./booking.schemas";

const bookingRoutes = new Hono();

// GET /admin/bookings - List all bookings
bookingRoutes.get(
  "/bookings",
  describeRoute({
    description: "List all bookings",
    tags: ["Bookings"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const query = bookingListQuerySchema.parse(c.req.query());
    const result = await listBookings(query);
    return c.json(result);
  },
);

// GET /admin/bookings/:id - Booking detail
bookingRoutes.get(
  "/bookings/:id",
  describeRoute({
    description: "Get booking detail",
    tags: ["Bookings"],
    responses: {
      200: { description: "Success" },
      404: { description: "Booking not found" },
    },
  }),
  async (c) => {
    const { id } = bookingIdParamSchema.parse({ id: c.req.param("id") });
    const result = await getBookingDetail(id);

    if (!result) {
      return c.json({ error: "Booking not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

// PATCH /admin/bookings/:id - Update booking
bookingRoutes.patch(
  "/bookings/:id",
  describeRoute({
    description: "Update booking",
    tags: ["Bookings"],
    responses: {
      200: { description: "Success" },
      404: { description: "Booking not found" },
    },
  }),
  async (c) => {
    const { id } = bookingIdParamSchema.parse({ id: c.req.param("id") });
    const body = bookingUpdateBodySchema.parse(await c.req.json());
    const result = await updateBooking(id, body);

    if (!result) {
      return c.json({ error: "Booking not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

// PATCH /admin/bookings/:id/status - Quick status change
bookingRoutes.patch(
  "/bookings/:id/status",
  describeRoute({
    description: "Quick status change for booking",
    tags: ["Bookings"],
    responses: {
      200: { description: "Success" },
      404: { description: "Booking not found" },
    },
  }),
  async (c) => {
    const { id } = bookingIdParamSchema.parse({ id: c.req.param("id") });
    const body = bookingStatusBodySchema.parse(await c.req.json());
    const result = await updateBookingStatus(id, body.status);

    if (!result) {
      return c.json({ error: "Booking not found", code: "NOT_FOUND" }, 404);
    }

    return c.json(result);
  },
);

// POST /admin/bookings - Create a booking manually
bookingRoutes.post(
  "/bookings",
  describeRoute({
    description: "Create a booking manually",
    tags: ["Bookings"],
    responses: {
      201: { description: "Created" },
      409: { description: "Venue not found or booking already exists" },
    },
  }),
  async (c) => {
    const body = bookingCreateBodySchema.parse(await c.req.json());
    const result = await createBooking(body);

    if (!result) {
      return c.json(
        { error: "Venue not found or booking already exists", code: "CONFLICT" },
        409,
      );
    }

    return c.json(result, 201);
  },
);

// DELETE /admin/bookings/:id - Delete a booking
bookingRoutes.delete(
  "/bookings/:id",
  describeRoute({
    description: "Delete a booking",
    tags: ["Bookings"],
    responses: {
      200: { description: "Deleted" },
      404: { description: "Booking not found" },
    },
  }),
  async (c) => {
    const { id } = bookingIdParamSchema.parse({ id: c.req.param("id") });
    const deleted = await deleteBooking(id);

    if (!deleted) {
      return c.json({ error: "Booking not found", code: "NOT_FOUND" }, 404);
    }

    return c.json({ success: true });
  },
);

export { bookingRoutes };
