// Load local env so Supabase keys are available during local dev
//require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Supabase environment variables are required. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DEFAULT_STATS = {
  affiliation: "",
  threat: "Medium",
  loyalty: "Unknown",
};

function parseList(value) {
  // Accept either comma text or arrays; trim empties so chips stay clean
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function normalizePerson(raw) {
  if (!raw) {
    return null;
  }

  // Stats + affiliation show up in several places, so normalize them once here
  const stats = raw.stats || {};
  const workplace = raw.workplace || raw.unit || "";
  const affiliation =
    stats.affiliation || raw.affiliation || stats.clearance || raw.clearance || "";

  return {
    id: raw.id,
    name: raw.name || "",
    callsign: raw.callsign || "",
    role: raw.role || "",
    workplace,
    // Keep `unit` for compatibility with existing data/clients.
    unit: workplace,
    description: raw.description || "",
    image_url: raw.image_url || "",
    traits: parseList(raw.traits),
    proficiencies: parseList(raw.proficiencies),
    dossier_notes: raw.dossier_notes || "",
    affiliation,
    stats: {
      affiliation,
      threat: stats.threat || raw.threat || DEFAULT_STATS.threat,
      loyalty: stats.loyalty || raw.loyalty || DEFAULT_STATS.loyalty,
    },
    last_seen_notes: raw.last_seen_notes || "",
    last_seen_lat:
      typeof raw.last_seen_lat === "number" ? raw.last_seen_lat : null,
    last_seen_lng:
      typeof raw.last_seen_lng === "number" ? raw.last_seen_lng : null,
    last_seen_timestamp: raw.last_seen_timestamp || null,
  };
}

function buildStatsObject(stats = {}) {
  // Keep old "clearance" payloads working while nudging everything to stats.
  return {
    affiliation: stats.affiliation || stats.clearance || DEFAULT_STATS.affiliation,
    threat: stats.threat || DEFAULT_STATS.threat,
    loyalty: stats.loyalty || DEFAULT_STATS.loyalty,
  };
}

function buildProfileRecord(payload = {}) {
  // Shape inbound payload for Supabase insert/update columns
  const stats = buildStatsObject(payload.stats || {});
  const workplace = payload.workplace ?? payload.unit;
  return {
    name: payload.name || "",
    callsign: payload.callsign || "",
    role: payload.role || "",
    // Supabase column is still named `unit`, and im not changin all that.
    unit: workplace || "",
    description: payload.description || "",
    image_url: payload.image_url || "",
    dossier_notes: payload.dossier_notes || "",
    traits: Array.isArray(payload.traits)
      ? payload.traits
      : parseList(payload.traits),
    proficiencies: Array.isArray(payload.proficiencies)
      ? payload.proficiencies
      : parseList(payload.proficiencies),
    stats,
    affiliation: stats.affiliation,
  };
}

async function getPeople() {
  // Full roster, alphabetized for the left rail
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .order("name", { ascending: true });
  if (error) {
    throw error;
  }
  return (data || []).map(normalizePerson).filter(Boolean);
}

async function getPerson(id) {
  // Single dossier lookup for detail panels
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data ? normalizePerson(data) : null;
}

async function createPerson(payload) {
  // New recruits pick up Supabase's auto id and timestamps
  const record = buildProfileRecord(payload);
  const { data, error } = await supabase
    .from("people")
    .insert(record)
    .select()
    .single();
  if (error) {
    throw error;
  }
  return normalizePerson(data);
}

async function updatePersonProfile(id, payload) {
  const updates = {};

  // Only ship what changed so partial updates stay lightweight
  if (payload.name !== undefined) {
    updates.name = payload.name || "";
  }
  if (payload.callsign !== undefined) {
    updates.callsign = payload.callsign || "";
  }
  if (payload.role !== undefined) {
    updates.role = payload.role || "";
  }
  if (payload.workplace !== undefined || payload.unit !== undefined) {
    updates.unit = payload.workplace || payload.unit || "";
  }
  if (payload.description !== undefined) {
    updates.description = payload.description || "";
  }
  if (payload.image_url !== undefined) {
    updates.image_url = payload.image_url || "";
  }
  if (payload.dossier_notes !== undefined) {
    updates.dossier_notes = payload.dossier_notes || "";
  }
  if (payload.traits !== undefined) {
    updates.traits = Array.isArray(payload.traits)
      ? payload.traits
      : parseList(payload.traits);
  }
  if (payload.proficiencies !== undefined) {
    updates.proficiencies = Array.isArray(payload.proficiencies)
      ? payload.proficiencies
      : parseList(payload.proficiencies);
  }
  if (payload.stats) {
    const stats = buildStatsObject(payload.stats);
    updates.stats = stats;
    updates.affiliation = stats.affiliation;
  }

  if (Object.keys(updates).length === 0) {
    return getPerson(id);
  }

  const { data, error } = await supabase
    .from("people")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data ? normalizePerson(data) : null;
}

async function updateLastSeen(id, { lat, lng, notes }) {
  // Geo updates double as a heartbeat, so we timestamp it here
  const update = {
    last_seen_lat: lat,
    last_seen_lng: lng,
    last_seen_notes: notes || "",
    last_seen_timestamp: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("people")
    .update(update)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data ? normalizePerson(data) : null;
}

module.exports = {
  getPeople,
  getPerson,
  createPerson,
  updatePersonProfile,
  updateLastSeen,
};
