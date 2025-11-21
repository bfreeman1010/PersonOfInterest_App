const addPersonForm = document.getElementById("add-person-form");

// Turns the  comma separated trait/proficiency fields into clean arrays.
function parseListInput(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// Mirrors the main console payload builder so new profiles fit right in.
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

// Saves the recruit through our Express API and loops back to the console when done.
if (addPersonForm) {
  addPersonForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = buildProfilePayloadFromForm(addPersonForm);
    if (!payload.name) {
      alert("Name is required.");
      return;
    }

    const response = await fetch("/api/people", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      alert("Failed to add individual.");
      return;
    }

    window.location.href = "/";
  });
}
