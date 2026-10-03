(function () {
  "use strict";
  const { $, $$, h, apiPost, checkHealth, showErrors, clearErrors, setLoading, docPanel, renderNotes, localToday, loadSociety, isPlaceholder } = window.App;
  const V = window.Validators;
  const form = $("#minutes-form"), submit = $("#submit"), status = $("#status"), result = $("#result");
  const attBox = $("#attendees"), agBox = $("#agenda"), acBox = $("#actions");
  const STORE = "society.minutes.draft.v1", today = localToday();
  const hasRes = (o) => o === "resolved" || o === "not_passed";
  let uid = 0, saveTimer = null;

  /* ---------- small builders ---------- */
  const select = (list, key, placeholder) => {
    const s = h("select", { "data-key": key });
    if (placeholder) s.append(h("option", { value: "", text: placeholder }));
    list.forEach(([v, l]) => s.append(h("option", { value: v, text: l })));
    return s;
  };
  const field = (label, control, o) => {
    o = o || {}; const id = "m" + (++uid); control.id = id;
    return h("div", { class: "field" }, h("label", { for: id, class: o.required ? "req" : null, text: label }), control, o.hint ? h("p", { class: "hint", text: o.hint }) : null);
  };
  const bare = (control) => h("div", { class: "field" }, control);
  const val = (root, key) => { const c = root.querySelector('[data-key="' + key + '"]'); return c ? c.value : ""; };
  const setVal = (root, key, v) => { const c = root.querySelector('[data-key="' + key + '"]'); if (c && v != null) c.value = v; };

  /* ---------- numbering, paths and aria labels ---------- */
  const LABELS = { name: "name", unit: "flat or designation", status: "attendance status", text: "action", owner: "owner", due: "due date", itemRef: "linked agenda item" };
  function renumber(box, prefix, noun) {
    $$(":scope > .row-item", box).forEach((row, i) => {
      row.dataset.index = i;
      $$("[data-key]", row).forEach((c) => {
        c.dataset.path = prefix + "." + i + "." + c.dataset.key;
        if (LABELS[c.dataset.key] && !c.labels.length) c.setAttribute("aria-label", noun + " " + (i + 1) + " " + LABELS[c.dataset.key]);
      });
      const t = $(".item-title", row); if (t) t.textContent = "Item " + (i + 1);
    });
  }
  const renumberAll = () => { renumber(attBox, "attendees", "Attendee"); renumber(agBox, "agenda", "Item"); renumber(acBox, "actions", "Action"); refreshRefs(); updateCounts(); };

  /* ---------- attendees ---------- */
  function addAttendee(d) {
    d = d || {};
    const status = select(V.ATTENDANCE_STATUS, "status");
    const row = h("div", { class: "row-item att-row" },
      bare(h("input", { "data-key": "name", placeholder: "Name", maxlength: 200, autocomplete: "off" })),
      bare(h("input", { "data-key": "unit", placeholder: "Flat / designation", maxlength: 200, autocomplete: "off" })),
      bare(status),
      h("button", { type: "button", class: "btn btn-danger btn-sm", "aria-label": "Remove attendee", text: "Remove", onclick: () => { row.remove(); renumberAll(); queueSave(); } }));
    setVal(row, "name", d.name); setVal(row, "unit", d.unit); status.value = d.status || "present";
    attBox.append(row); renumberAll(); return row;
  }

  /* ---------- agenda items ---------- */
  function addItem(d) {
    d = d || {};
    const outcome = select(V.OUTCOMES, "outcome");
    const resBlock = h("div", {},
      field("Resolution wording", h("textarea", { "data-key": "resolution", rows: 2, "data-max": 1000 }), { required: true, hint: "Exactly as moved. You are recording what the meeting decided — the tool does not decide." }),
      h("div", { class: "row" },
        field("Proposed by", h("input", { "data-key": "proposedBy", maxlength: 200 })),
        field("Seconded by", h("input", { "data-key": "secondedBy", maxlength: 200 }))),
      h("p", { class: "label", text: "Votes (leave blank if not recorded)" }),
      h("div", { class: "votes" },
        field("For", h("input", { "data-key": "votesFor", type: "number", min: 0, inputmode: "numeric" })),
        field("Against", h("input", { "data-key": "votesAgainst", type: "number", min: 0, inputmode: "numeric" })),
        field("Abstained", h("input", { "data-key": "votesAbstain", type: "number", min: 0, inputmode: "numeric" }))));
    const row = h("div", { class: "row-item item" },
      h("div", { class: "item-head" }, h("strong", { class: "item-title" }),
        h("button", { type: "button", class: "btn btn-danger btn-sm", text: "Remove item", onclick: () => removeItem(row) })),
      field("Agenda item", h("input", { "data-key": "title", maxlength: 300 }), { required: true }),
      field("Discussion notes", h("textarea", { "data-key": "discussion", rows: 3, "data-max": 3000 }), { hint: "Rough notes are fine. Only what you write is used; leave empty if nothing was recorded." }),
      field("Outcome", outcome), resBlock);
    const sync = () => { resBlock.hidden = !hasRes(outcome.value); };
    outcome.addEventListener("change", sync);
    ["title", "discussion", "resolution", "proposedBy", "secondedBy", "votesFor", "votesAgainst", "votesAbstain"].forEach((k) => setVal(row, k, d[k]));
    outcome.value = d.outcome || "none"; sync();
    $$("textarea[data-max]", row).forEach((t) => { const max = +t.dataset.max, c = h("p", { class: "counter", "aria-hidden": "true" }); t.after(c); const u = () => { c.textContent = t.value.length + " / " + max; c.classList.toggle("over", t.value.length > max); }; t.addEventListener("input", u); u(); });
    $("[data-key=title]", row).addEventListener("input", refreshRefs);
    agBox.append(row); renumberAll(); return row;
  }
  function removeItem(row) {
    const k = +row.dataset.index + 1;
    if ((val(row, "title") || val(row, "discussion")) && !confirm("Remove agenda item " + k + " and its notes?")) return;
    $$("[data-key=itemRef]", acBox).forEach((s) => { const n = +s.value; if (n === k) s.value = ""; else if (n > k) s.dataset.pending = String(n - 1); });
    row.remove(); renumberAll();
    $$("[data-key=itemRef]", acBox).forEach((s) => { if (s.dataset.pending) { s.value = s.dataset.pending; delete s.dataset.pending; } });
    queueSave();
  }
  function refreshRefs() {
    const items = $$(":scope > .row-item", agBox);
    $$("[data-key=itemRef]", acBox).forEach((s) => {
      const keep = s.dataset.pending || s.value;
      s.replaceChildren(h("option", { value: "", text: "No linked item" }), ...items.map((it, i) => h("option", { value: String(i + 1), text: "Item " + (i + 1) + (val(it, "title") ? ": " + val(it, "title").slice(0, 35) : "") })));
      s.value = keep && +keep <= items.length ? keep : "";
    });
  }

  /* ---------- action items ---------- */
  function addAction(d) {
    d = d || {};
    const row = h("div", { class: "row-item act-row" },
      bare(h("input", { "data-key": "text", placeholder: "Action", maxlength: 500 })),
      bare(h("input", { "data-key": "owner", placeholder: "Owner (name / role)", maxlength: 200 })),
      bare(h("input", { "data-key": "due", type: "date" })),
      bare(h("select", { "data-key": "itemRef" })),
      h("button", { type: "button", class: "btn btn-danger btn-sm", "aria-label": "Remove action", text: "Remove", onclick: () => { row.remove(); renumberAll(); queueSave(); } }));
    acBox.append(row); renumberAll();
    setVal(row, "text", d.text); setVal(row, "owner", d.owner); setVal(row, "due", d.due); if (d.itemRef) setVal(row, "itemRef", d.itemRef);
    return row;
  }

  /* ---------- counts & labels ---------- */
  function updateCounts() {
    const rows = $$(":scope > .row-item", attBox);
    const present = rows.filter((r) => val(r, "status") === "present" && val(r, "name").trim()).length;
    $("#present-count").textContent = present + " marked Present";
    const req = form.elements.quorumRequired.value.trim();
    $("#quorum-hint").textContent = "Attendees marked Present: " + present + (/^\d+$/.test(req) ? ". Required figure you entered: " + req + ". Confirm both against the registered bye-laws." : ".");
    const general = ["agm", "sgm"].includes(form.elements.meetingType.value);
    $("#att-legend").textContent = general ? "Members present and absent" : "Committee attendance";
  }

  /* ---------- collect / save / restore ---------- */
  function collect(forSave) {
    const g = (n) => form.elements[n].value;
    const d = { quorum: { required: g("quorumRequired"), status: g("quorumStatus"), basis: g("quorumBasis") } };
    ["societyName", "meetingType", "meetingDate", "startTime", "endTime", "venue", "chairperson", "recorder", "noticeDate", "nextMeetingDate"].forEach((n) => { d[n] = g(n); });
    d.attendees = $$(":scope > .row-item", attBox).map((r) => ({ name: val(r, "name"), unit: val(r, "unit"), status: val(r, "status") }));
    d.agenda = $$(":scope > .row-item", agBox).map((r) => {
      const o = val(r, "outcome"), keep = forSave || hasRes(o);
      return { title: val(r, "title"), discussion: val(r, "discussion"), outcome: o,
        resolution: keep ? val(r, "resolution") : "", proposedBy: keep ? val(r, "proposedBy") : "", secondedBy: keep ? val(r, "secondedBy") : "",
        votesFor: keep ? val(r, "votesFor") : "", votesAgainst: keep ? val(r, "votesAgainst") : "", votesAbstain: keep ? val(r, "votesAbstain") : "" };
    });
    d.actions = $$(":scope > .row-item", acBox).map((r) => ({ text: val(r, "text"), owner: val(r, "owner"), due: val(r, "due"), itemRef: val(r, "itemRef") }));
    return d;
  }
  const queueSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(collect(true))); } catch { /* storage unavailable: ignore */ } }, 400); };

  function restore(d) {
    d = d || {};
    const set = (n, v) => { if (v != null) form.elements[n].value = v; };
    ["societyName", "meetingType", "meetingDate", "startTime", "endTime", "venue", "chairperson", "recorder", "noticeDate", "nextMeetingDate"].forEach((n) => set(n, d[n]));
    const q = d.quorum || {}; set("quorumRequired", q.required); set("quorumStatus", q.status);  set("quorumBasis", q.basis);
    [attBox, agBox, acBox].forEach((b) => b.replaceChildren());
    (d.attendees && d.attendees.length ? d.attendees : [{}, {}, {}]).forEach(addAttendee);
    (d.agenda && d.agenda.length ? d.agenda : [{}]).forEach(addItem);
    (d.actions || []).forEach(addAction);
    renumberAll();
  }

  /* ---------- init ---------- */
  [["meetingType", V.MEETING_TYPES, "Choose a meeting type…"], ["quorumStatus", V.QUORUM_STATUS, "Choose the status you are recording…"]].forEach(([n, list, ph]) => {
    const s = form.elements[n]; s.append(h("option", { value: "", text: ph })); list.forEach(([v, l]) => s.append(h("option", { value: v, text: l })));
  });
  form.elements.meetingDate.max = today; form.elements.meetingDate.value = today;
  checkHealth($("#health-banner"));

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) || "null"); } catch { saved = null; }
  restore(saved);
  if (!saved) loadSociety().then((s) => { if (s && !isPlaceholder(s.name) && !form.elements.societyName.value) form.elements.societyName.value = s.name; });

  $("#add-attendee").addEventListener("click", () => { addAttendee().querySelector("input").focus(); });
  $("#add-item").addEventListener("click", () => { addItem().querySelector("input").focus(); });
  $("#add-action").addEventListener("click", () => { addAction().querySelector("input").focus(); });
  $("#bulk-add").addEventListener("click", () => {
    const lines = $("#bulk").value.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    $$(":scope > .row-item", attBox).filter((r) => !val(r, "name").trim() && !val(r, "unit").trim()).forEach((r) => r.remove());
    lines.slice(0, 300).forEach((l) => { const i = l.indexOf(","); addAttendee(i < 0 ? { name: l } : { name: l.slice(0, i).trim(), unit: l.slice(i + 1).trim() }); });
    $("#bulk").value = ""; queueSave();
  });
  form.addEventListener("input", () => { updateCounts(); queueSave(); });
  form.addEventListener("change", () => { updateCounts(); queueSave(); });
  $("#clear-draft").addEventListener("click", () => {
    if (!confirm("Clear everything entered in this form and the copy saved in this browser?")) return;
    try { localStorage.removeItem(STORE); } catch { /* ignore */ }
    form.reset(); form.elements.meetingDate.value = today; clearErrors(form); restore(null); result.hidden = true; status.textContent = "";
  });

  /* ---------- generate ---------- */
  const panel = docPanel(result, { filename: () => "minutes-" + (form.elements.meetingType.value || "meeting") + "-" + (form.elements.meetingDate.value || "draft") + ".txt" });

  async function generate() {
    const data = collect(false);
    const check = V.validateMinutes(data, { today });
    if (!check.ok) { showErrors(form, check.errors); status.className = "status"; status.textContent = ""; return; }
    clearErrors(form); status.className = "status"; status.textContent = "Preparing the minutes — this usually takes 5–25 seconds…";
    setLoading(submit, true, "Preparing…"); $("#regen").disabled = true;
    try {
      const out = await apiPost("/api/generate-minutes", data);
      panel.show(out.minutes);
      renderNotes($("#warnings"), "Check these points", out.warnings, "notice-warn");
      renderNotes($("#notes"), "Reviewer notes", out.reviewerNotes);
      $("#model-note").textContent = out.aiUsed && out.model ? "Wording tidied with " + out.model + "." : "Assembled directly from your form.";
      status.textContent = "Draft ready below.";
      result.scrollIntoView({ behavior: "smooth", block: "start" }); $("#result-title").focus({ preventScroll: true });
    } catch (err) {
      status.className = "status err";
      if (err.fields) { showErrors(form, err.fields); status.textContent = ""; } else status.textContent = err.message;
    } finally { setLoading(submit, false); $("#regen").disabled = false; }
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); generate(); });
  $("#regen").addEventListener("click", () => {
    if (panel.isDirty() && !confirm("Regenerating will replace the edits you have made to these minutes. Continue?")) return;
    generate();
  });
})();
