const express = require("express");
const path = require("path");

const {
  getPeople,
  createPerson,
  updateLastSeen,
  getPerson,
  updatePersonProfile,
} = require("./db");

const DEFAULT_PORT = process.env.PORT || 4000;

// Tiny helper so async route errors bubble to the same handler
const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function createApp() {
  const app = express();

  app.use(express.json());
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      res.set("Cache-Control", "no-store");
    }
    next();
  });

  // Simple heartbeat for uptime checks
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get(
    "/api/people",
    asyncHandler(async (_req, res) => {
      const people = await getPeople();
      res.json(people);
    }),
  );

  app.post(
    "/api/people",
    asyncHandler(async (req, res) => {
      const payload = buildProfilePayload(req.body || {});
      if (!payload.name) {
        return res.status(400).json({ error: "name is required" });
      }

      const person = await createPerson(payload);
      res.status(201).json(person);
    }),
  );

  app.put(
    "/api/people/:id/last-seen",
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { lat, lng, notes } = req.body || {};

      const latNum = Number(lat);
      const lngNum = Number(lng);

      if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
        return res.status(400).json({ error: "lat and lng must be numbers" });
      }

      const updated = await updateLastSeen(Number(id), {
        lat: latNum,
        lng: lngNum,
        notes: notes || "",
      });

      if (!updated) {
        return res.status(404).json({ error: "Person not found" });
      }

      res.json(updated);
    }),
  );

  app.get(
    "/api/people/:id",
    asyncHandler(async (req, res) => {
      const person = await getPerson(Number(req.params.id));
      if (!person) {
        return res.status(404).json({ error: "Person not found" });
      }
      res.json(person);
    }),
  );

  app.put(
    "/api/people/:id/profile",
    asyncHandler(async (req, res) => {
      const payload = buildProfilePayload(req.body || {});
      if (!payload.name) {
        return res.status(400).json({ error: "name is required" });
      }

      const updated = await updatePersonProfile(Number(req.params.id), payload);
      if (!updated) {
        return res.status(404).json({ error: "Person not found" });
      }
      res.json(updated);
    }),
  );

  const publicDir = path.join(__dirname, "public");
  const staticOptions = {
    etag: false,
    lastModified: false,
    maxAge: 0,
    cacheControl: false,
  };
  app.use(
    "/vendor/leaflet",
    express.static(
      path.join(__dirname, "node_modules", "leaflet", "dist"),
      staticOptions,
    ),
  );
  app.use(express.static(publicDir, staticOptions));

  // Any non-API path just serves the SPA shell
  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.sendFile(path.join(publicDir, "index.html"));
  });

  // Centralized error logging so Supabase hiccups don't crash silently
  app.use((err, req, res, next) => {
    console.error("Unexpected server error", err);
    if (res.headersSent) {
      return next(err);
    }
    if (req.path.startsWith("/api/")) {
      return res.status(500).json({ error: "Internal server error" });
    }
    return res.status(500).send("Internal server error");
  });

  return app;
}

function startServer(port = DEFAULT_PORT) {
  const app = createApp();
  const server = app.listen(port, () => {
    const address = server.address();
    const actualPort =
      address && typeof address === "object" ? address.port : port;
    console.log(
      `Surveillance server listening on http://localhost:${actualPort}`,
    );
  });
  return server;
}

if (require.main === module) {
  startServer(DEFAULT_PORT);
}

module.exports = {
  createApp,
  startServer,
};

function buildProfilePayload(body) {
  const sanitize = (value) =>
    typeof value === "string" ? value.trim() : value || "";
  const listFromBody = (value) => {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry).trim()).filter(Boolean);
    }
    if (typeof value === "string") {
      return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    return [];
  };

  const stats = body.stats || {};

  const affiliation = sanitize(
    stats.affiliation || body.affiliation || stats.clearance || body.clearance,
  );
  const workplace = sanitize(body.workplace || body.unit);

  return {
    name: sanitize(body.name),
    callsign: sanitize(body.callsign),
    role: sanitize(body.role),
    workplace,
    // Keep `unit` for compatibility with existing payloads.
    unit: workplace,
    description: sanitize(body.description),
    image_url: sanitize(body.image_url),
    dossier_notes: sanitize(body.dossier_notes),
    traits: listFromBody(body.traits),
    proficiencies: listFromBody(body.proficiencies),
    affiliation,
    stats: {
      affiliation,
      threat: sanitize(stats.threat || body.threat),
      loyalty: sanitize(stats.loyalty || body.loyalty),
    },
  };
}
