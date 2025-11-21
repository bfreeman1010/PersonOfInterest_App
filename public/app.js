const peopleListEl = document.getElementById("people-list");
const personNameEl = document.getElementById("person-name");
const personCallsignEl = document.getElementById("person-callsign");
const personRoleEl = document.getElementById("person-role");
const personDescriptionEl = document.getElementById("person-description");
const personNotesEl = document.getElementById("person-notes");
const personTimestampEl = document.getElementById("person-timestamp");
const personImageEl = document.getElementById("person-image");
const fieldNotesEl = document.getElementById("field-notes");
const statAffiliationEl = document.getElementById("stat-affiliation");
const statThreatEl = document.getElementById("stat-threat");
const statLoyaltyEl = document.getElementById("stat-loyalty");
const statWorkplaceEl = document.getElementById("stat-workplace");
const traitsListEl = document.getElementById("traits-list");
const proficienciesListEl = document.getElementById("proficiencies-list");
const editThreatSelect = document.getElementById("edit-threat");
const updateLastSeenForm = document.getElementById("update-last-seen-form");
const updateProfileForm = document.getElementById("update-profile-form");
const identityBlockEl = document.querySelector(
  ".identity-block.summary-layout",
);
const statGridEl = document.querySelector(".stat-grid");
const assetSearchInput = document.getElementById("asset-search");
const toggleProfileFormButton = document.getElementById("toggle-profile-form");
const profileFormContainer = document.getElementById("profile-form-container");

const FALLBACK_IMAGE =
  "https://dummyimage.com/400x600/0c141b/2bdba3&text=INDIVIDUAL";

const THREAT_COLORS = {
  critical: "#ff3355",
  high: "#ff8c1a",
  medium: "#ffd447",
  low: "#32e0a5",
  default: "#1c6073",
};

let people = [];
let selectedPersonId = null;
let map;
let markersLayer;
const markers = new Map();
const TIMESTAMP_FRESH_WINDOW = 1000 * 60 * 60 * 2;
let searchTerm = "";
const TYPEWRITER_SPEED = 18;
const typewriterTimers = new WeakMap();
const MAX_ROSTER_RETRIES = 5;
let rosterRetryTimer = null;

// Update or insert a person locally so UI stays in sync after writes
function upsertPerson(updated, { sortRoster = false } = {}) {
  people = people.map((person) =>
    person.id === updated.id ? updated : person,
  );
  if (sortRoster) {
    sortPeople();
  }
  return updated;
}

function getWorkplace(person) {
  if (!person) return "";
  return (person.workplace || person.unit || "").trim();
}

// Sifts the roster by the live search field so the list stays manageable in the mock surveillance console.
function filterPeople(term) {
  const normalizedSearch = term.trim().toLowerCase();
  return people.filter((person) => {
    if (!normalizedSearch) return true;
    const haystack = [
      person.name,
      person.callsign,
      person.role,
      getWorkplace(person),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  });
}

// Little helper to retrigger CSS pulses when a dossier block updates.
function pulseElement(element, className) {
  if (!element) return;
  element.classList.remove(className);
  // Force reflow so animation can restart
  void element.offsetWidth;
  element.classList.add(className);
}

// Gives our interface that analog/terminal vibe by typing text into each field.
function typeText(element, value) {
  if (!element) return;
  const raw =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : String(value);
  const text = raw.trim();
  if (typewriterTimers.has(element)) {
    clearTimeout(typewriterTimers.get(element));
  }
  let index = 0;
  const step = () => {
    element.textContent = text.slice(0, index);
    if (index === text.length) {
      typewriterTimers.delete(element);
      return;
    }
    index += 1;
    const timer = setTimeout(step, TYPEWRITER_SPEED);
    typewriterTimers.set(element, timer);
  };
  step();
}

// Keeps the roster alphabetical so the operator can scan assets quickly.
function sortPeople() {
  people.sort((a, b) => a.name.localeCompare(b.name));
}

// Boots the Leaflet map that stands in for the Eye of Sauron tracking display.
function initMap() {
  map = L.map("map", {
    zoomControl: false,
  }).setView([20, 0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

// Populates the sidebar roster cards based on the current search results.
function renderPeopleList() {
  peopleListEl.innerHTML = "";
  const filtered = filterPeople(searchTerm);

  if (!filtered.length) {
    peopleListEl.innerHTML = `<p class="muted"></p>`;
    return;
  }

  filtered.forEach((person) => {
    const card = document.createElement("article");
    card.className =
      "person-card" + (person.id === selectedPersonId ? " active" : "");
    card.innerHTML = `<h4>${person.name}</h4>`;
    card.addEventListener("click", () => selectPerson(person.id));
    peopleListEl.appendChild(card);
  });
}

// Handles clicking a card so the dossier and map switch to that individual.
function selectPerson(id) {
  const person = people.find((p) => p.id === id);
  if (!person) return;
  selectedPersonId = id;
  renderPeopleList();
  updateDetail(person);
}

// Lets the  user/dev hit Enter to jump straight to the top search match.
function goToBestSearchMatch() {
  const filtered = filterPeople(searchTerm);
  if (!filtered.length) {
    return;
  }
  selectPerson(filtered[0].id);
  peopleListEl.scrollTop = 0;
}

// Renders trait/proficiency chips if present.
function renderChipList(container, items) {
  container.innerHTML = "";
  if (!items || !items.length) return;
  items.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = item;
    container.appendChild(chip);
  });
}

// Updates every data block in the profile panel when a new person is selected.
function updateDetail(person) {
  typeText(personNameEl, person.name || "");
  typeText(personCallsignEl, (person.callsign || "").trim());
  const roleLine = (person.role || "").trim();
  typeText(personRoleEl, roleLine);
  typeText(personDescriptionEl, person.description || "");
  typeText(personNotesEl, person.dossier_notes || "");
  updateTimestampDisplay(person);

  personImageEl.src = person.image_url || FALLBACK_IMAGE;
  personImageEl.onerror = () => {
    personImageEl.src = FALLBACK_IMAGE;
  };

  const rawAffiliation = person.stats?.affiliation || person.affiliation || "";
  const affiliation = rawAffiliation.trim();
  typeText(statAffiliationEl, affiliation || "");
  const threatLevel = (person.stats?.threat || "").trim();
  typeText(statThreatEl, threatLevel || "");
  updateThreatStyles(threatLevel);
  const hostility = (person.stats?.loyalty || "").trim();
  typeText(statLoyaltyEl, hostility || "");
  if (statWorkplaceEl) {
    const workplace = (getWorkplace(person) || "").trim();
    typeText(statWorkplaceEl, workplace || "");
  }

  renderChipList(traitsListEl, person.traits);
  renderChipList(proficienciesListEl, person.proficiencies);

  populateProfileForm(person);
  syncMap(person);
  pulseElement(identityBlockEl, "panel-animate");
  pulseElement(statGridEl, "stat-pulse");
  pulseElement(personImageEl, "image-refresh");
}

// Syncs the “last seen” form and log with the currently selected individual.
function syncMap(person) {
  const hasCoords = hasValidCoordinates(person);

  if (hasCoords) {
    updateLastSeenForm.lat.value = person.last_seen_lat;
    updateLastSeenForm.lng.value = person.last_seen_lng;
    updateLastSeenForm.notes.value = person.last_seen_notes || "";
    const noteText = person.last_seen_notes || "";
    typeText(fieldNotesEl, noteText);
  } else {
    updateLastSeenForm.reset();
    typeText(fieldNotesEl, "");
  }

  focusMapOnPerson(person);
}

// Rebuilds point markers for every asset that has GPS coordinates.
function refreshMarkers() {
  if (!markersLayer) return;
  markersLayer.clearLayers();
  markers.clear();

  people.forEach((person) => {
    if (!hasValidCoordinates(person)) {
      return;
    }

    const coords = [person.last_seen_lat, person.last_seen_lng];
    const marker = L.marker(coords);
    marker.on("click", () => selectPerson(person.id));
    marker.addTo(markersLayer);
    markers.set(person.id, marker);
  });

  if (selectedPersonId) {
    const active = people.find((p) => p.id === selectedPersonId);
    if (active) {
      focusMapOnPerson(active);
    }
  }
}

// Nudges the map to the person's coordinates (or resets to globe view).
function focusMapOnPerson(person) {
  if (!map) return;
  const marker = markers.get(person.id);

  if (marker && hasValidCoordinates(person)) {
    const popupLines = [person.name];
    if (person.last_seen_notes) {
      popupLines.push(person.last_seen_notes);
    }
    marker.bindPopup(popupLines.join("<br/>")).openPopup();
    map.flyTo(marker.getLatLng(), 5, { duration: 0.8 });
  } else {
    map.closePopup();
    map.setView([20, 0], 2);
  }
}

function hasValidCoordinates(person) {
  return (
    typeof person.last_seen_lat === "number" &&
    typeof person.last_seen_lng === "number" &&
    Number.isFinite(person.last_seen_lat) &&
    Number.isFinite(person.last_seen_lng)
  );
}

// Maps the textual threat level to the neon badge colors we use in the UI.
function getThreatColor(level) {
  const normalized = level ? level.toLowerCase() : "default";
  return THREAT_COLORS[normalized] || THREAT_COLORS.default;
}

// Updates both the profile badge and the edit dropdown to stay color synced.
function updateThreatStyles(level, options = { badge: true, select: true }) {
  const color = getThreatColor(level);
  const normalized = level ? level.toLowerCase() : "default";

  if (options.badge && statThreatEl) {
    statThreatEl.style.backgroundColor = color;
    statThreatEl.style.color = "#fff";
    statThreatEl.dataset.level = normalized;
    statThreatEl.classList.toggle("is-critical", normalized === "critical");
    statThreatEl.classList.toggle("is-high", normalized === "high");
    statThreatEl.classList.toggle("is-low", normalized === "low");
    pulseElement(statThreatEl, "stat-pulse");
  }

  if (options.select && editThreatSelect) {
    editThreatSelect.style.backgroundColor = color;
    editThreatSelect.style.color = "#fff";
  }
}

// Gives the “last update” label a friendly timestamp plus stale indicator.
function updateTimestampDisplay(person) {
  if (!personTimestampEl) return;
  const timestamp = person.last_seen_timestamp;
  if (timestamp) {
    const date = new Date(timestamp);
    const formatted = `Last update ${date.toLocaleString()}`;
    personTimestampEl.innerHTML = `<span class="live-dot"></span><span>${formatted}</span>`;
    const isFresh = Date.now() - date.getTime() <= TIMESTAMP_FRESH_WINDOW;
    personTimestampEl.classList.toggle("is-stale", !isFresh);
  } else {
    personTimestampEl.textContent = "";
    personTimestampEl.classList.add("is-stale");
  }
}

// Pre-fills the profile edit form with the active individual's dossier data.
function populateProfileForm(person) {
  if (!person) return;
  const stats = person.stats || {};
  updateProfileForm.name.value = person.name || "";
  updateProfileForm.callsign.value = person.callsign || "";
  updateProfileForm.role.value = (person.role || "").trim();
  updateProfileForm.workplace.value = (getWorkplace(person) || "").trim();
  updateProfileForm.image_url.value = person.image_url || "";
  updateProfileForm.affiliation.value = (
    stats.affiliation ||
    person.affiliation ||
    ""
  ).trim();
  updateProfileForm.threat.value = stats.threat || "Medium";
  updateProfileForm.loyalty.value = stats.loyalty || "Unknown";
  updateProfileForm.traits.value = (person.traits || []).join(", ");
  updateProfileForm.proficiencies.value = (person.proficiencies || []).join(
    ", ",
  );
  updateProfileForm.description.value = person.description || "";
  updateProfileForm.dossier_notes.value = person.dossier_notes || "";
  if (editThreatSelect) {
    editThreatSelect.value = stats.threat || "Unknown";
    updateThreatStyles(stats.threat || "", { badge: false, select: true });
  }
}

// Turns comma separated text fields into arrays for traits/proficiencies.
function parseListInput(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// Converts the edit form into the payload expected by our Express API.
function buildProfilePayloadFromForm(form) {
  const formData = new FormData(form);
  const get = (field) => (formData.get(field) || "").trim();
  const affiliation = get("affiliation");

  return {
    name: get("name"),
    callsign: get("callsign"),
    role: get("role"),
    workplace: get("workplace"),
    image_url: get("image_url"),
    description: get("description"),
    dossier_notes: get("dossier_notes"),
    traits: parseListInput(get("traits")),
    proficiencies: parseListInput(get("proficiencies")),
    affiliation,
    stats: {
      affiliation,
      threat: get("threat"),
      loyalty: get("loyalty"),
    },
  };
}

// Fetches the roster from the server, sorts it, and primes the UI/map.
function scheduleRosterRetry(nextAttempt) {
  if (nextAttempt > MAX_ROSTER_RETRIES) {
    return;
  }
  if (rosterRetryTimer) {
    clearTimeout(rosterRetryTimer);
  }
  rosterRetryTimer = setTimeout(() => {
    loadPeople({ silent: true, retryCount: nextAttempt });
  }, 1500);
}

async function loadPeople(options = {}) {
  const { silent = false, retryCount = 0 } = options;
  try {
    const response = await fetch(`/api/people?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Failed to load roster.");
    }
    people = await response.json();
  } catch (error) {
    console.error(error);
    if (!silent) {
      peopleListEl.innerHTML =
        '<p class="muted">Unable to reach command server. Retrying…</p>';
    }
    scheduleRosterRetry(retryCount + 1);
    return;
  }
  if (rosterRetryTimer) {
    clearTimeout(rosterRetryTimer);
    rosterRetryTimer = null;
  }
  sortPeople();
  renderPeopleList();
  refreshMarkers();
  if (people.length && !selectedPersonId) {
    selectPerson(people[0].id);
  } else if (selectedPersonId) {
    const refreshed = people.find((p) => p.id === selectedPersonId);
    if (refreshed) {
      updateDetail(refreshed);
    }
  } else if (!people.length) {
    scheduleRosterRetry(retryCount + 1);
  }
}

// Handles dossier edits so changes persist through the API and refresh the console.
updateProfileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedPersonId) {
    alert("Select an individual before editing.");
    return;
  }
  const payload = buildProfilePayloadFromForm(updateProfileForm);
  if (!payload.name) {
    alert("Name is required.");
    return;
  }

  const response = await fetch(`/api/people/${selectedPersonId}/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    alert("Failed to update profile.");
    return;
  }

  const updated = await response.json();
  upsertPerson(updated, { sortRoster: true });
  updateDetail(updated);
  renderPeopleList();
  refreshMarkers();
});

// Logs fresh coordinates from the field tracker panel and redraws the map marker.
updateLastSeenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedPersonId) {
    alert("Select an individual to log coordinates.");
    return;
  }

  const formData = new FormData(updateLastSeenForm);
  const payload = Object.fromEntries(formData.entries());
  const response = await fetch(`/api/people/${selectedPersonId}/last-seen`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    alert("Failed to update coordinates.");
    return;
  }

  const updated = await response.json();
  upsertPerson(updated);
  refreshMarkers();
  updateDetail(updated);
});

// Initializes the cartography layer and populate the dossier as soon as the console loads.
initMap();
loadPeople();

// Always refresh when the page becomes visible (initial load, tab focus, or history nav).
window.addEventListener("pageshow", () => {
  loadPeople({ silent: true });
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    loadPeople({ silent: true });
  }
});

// Keeps the dropdown color in sync while an operator tweaks the threat level.
if (editThreatSelect) {
  editThreatSelect.addEventListener("change", (event) => {
    updateThreatStyles(event.target.value, { badge: false, select: true });
  });
}

// Allows collapsing the edit form so the dossier feels more like a control deck.
if (toggleProfileFormButton && profileFormContainer) {
  toggleProfileFormButton.addEventListener("click", () => {
    const isCollapsed = profileFormContainer.classList.toggle("collapsed");
    toggleProfileFormButton.setAttribute(
      "aria-expanded",
      (!isCollapsed).toString(),
    );
    toggleProfileFormButton.classList.toggle("is-open", !isCollapsed);
  });
}

// Wires the search bar to filter cards live and jump to the best match on Enter.
if (assetSearchInput) {
  assetSearchInput.addEventListener("input", (event) => {
    searchTerm = event.target.value;
    renderPeopleList();
  });

  assetSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      goToBestSearchMatch();
    }
  });
}
