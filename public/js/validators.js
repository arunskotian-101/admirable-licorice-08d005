/* Shared validation + labels. Loaded by the browser (window.Validators) AND required by
   the Netlify Functions, so client and server always apply the same rules. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Validators = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DRAFT_LABEL = "Draft — requires review";

  const LETTER_CATEGORIES = [
    ["maintenance", "Maintenance and common facilities (lifts, pumps, lighting, drainage)"],
    ["housekeeping", "Housekeeping and waste collection"],
    ["repairs", "Repairs, inspection or estimate request"],
    ["billing", "Maintenance bill or payment clarification"],
    ["complaint", "Complaint about a concern affecting residents"],
    ["records", "Request for society records or documents"],
    ["security", "Security or emergency contacts"],
    ["meeting", "Meeting-related request"],
    ["other", "Other"]
  ];
  const RECIPIENTS = [
    ["secretary", "The Secretary"],
    ["chairman", "The Chairman"],
    ["committee", "The Managing Committee"],
    ["finance", "The Finance Lead"]
  ];
  const MEETING_TYPES = [
    ["agm", "Annual General Meeting (AGM)"],
    ["sgm", "Special General Meeting (SGM)"],
    ["weekly", "Weekly Committee Meeting"],
    ["monthly", "Monthly Committee Meeting"]
  ];
  const ATTENDANCE_STATUS = [
    ["present", "Present"],
    ["apology", "Absent (apology received)"],
    ["absent", "Absent"]
  ];
  const QUORUM_STATUS = [
    ["present", "Quorum present"],
    ["not_present", "Quorum not present"],
    ["adjourned", "Meeting adjourned for want of quorum"],
    ["not_recorded", "Not recorded"]
  ];
  const OUTCOMES = [
    ["none", "No resolution"],
    ["resolved", "Resolution passed"],
    ["not_passed", "Resolution not passed"],
    ["deferred", "Deferred (no decision)"]
  ];

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
  const MAX_ATTENDEES = 300, MAX_AGENDA = 30, MAX_ACTIONS = 50;

  const labelOf = (list, value) => { const f = list.find((o) => o[0] === value); return f ? f[1] : ""; };

  /* ---------- dates ---------- */
  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y, mo, d };
  }
  function fmtDate(iso) {
    const p = parseISO(iso);
    return p ? p.d + " " + MONTHS[p.mo - 1] + " " + p.y : "";
  }
  const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const utcToday = () => new Date().toISOString().slice(0, 10);

  /* ---------- primitive field checkers ---------- */
  const cleanText = (s, single) => {
    s = typeof s === "string" ? s.replace(/\r\n?/g, "\n").replace(CTRL, "").trim() : "";
    return single ? s.replace(/\s*\n\s*/g, " ") : s;
  };
  function textField(errors, out, key, path, raw, label, o) {
    o = o || {};
    const s = cleanText(raw, !o.multiline);
    out[key] = s;
    if (!s) { if (o.required) errors[path] = label + " is required."; return s; }
    if (o.min && s.length < o.min) errors[path] = label + " must be at least " + o.min + " characters (currently " + s.length + ").";
    else if (o.max && s.length > o.max) errors[path] = label + " must be " + o.max + " characters or fewer (currently " + s.length + ").";
    return s;
  }
  function dateField(errors, out, key, path, raw, label, o) {
    o = o || {};
    const s = cleanText(raw, true);
    out[key] = s;
    if (!s) { if (o.required) errors[path] = label + " is required."; return; }
    if (!parseISO(s)) { errors[path] = label + " must be a valid date."; return; }
    if (o.min && s < o.min) errors[path] = label + " cannot be before " + (o.minLabel || fmtDate(o.min)) + ".";
    else if (o.max && s > o.max) errors[path] = label + " cannot be after " + (o.maxLabel || fmtDate(o.max)) + ".";
  }
  function selectField(errors, out, key, path, raw, noun, options) {
    const s = cleanText(raw, true);
    out[key] = s;
    if (!s) errors[path] = "Choose " + noun + ".";
    else if (!options.some((o) => o[0] === s)) errors[path] = "That is not a valid choice for " + noun + ".";
  }
  const isEmail = (s) => s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
  const isPhone = (s) => { const n = (s.match(/\d/g) || []).length; return /^[+()\d][\d\s().-]*$/.test(s) && n >= 7 && n <= 15; };
  const validTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

  /* ---------- letter ---------- */
  function validateLetter(raw, opts) {
    raw = raw || {}; opts = opts || {};
    const e = {}, v = {};
    const today = opts.today || addDays(utcToday(), 1); // server allows +1 day for time-zone differences

    textField(e, v, "societyName", "societyName", raw.societyName, "Society name", { required: true, max: 120 });
    selectField(e, v, "recipient", "recipient", raw.recipient, "a recipient", RECIPIENTS);
    textField(e, v, "name", "name", raw.name, "Your name", { required: true, min: 2, max: 100 });
    textField(e, v, "flat", "flat", raw.flat, "Flat / wing", { required: true, max: 40 });
    textField(e, v, "contact", "contact", raw.contact, "Contact", { required: true, max: 120 });
    if (v.contact && !e.contact && !isEmail(v.contact) && !isPhone(v.contact)) e.contact = "Enter a valid phone number (7–15 digits) or email address.";
    selectField(e, v, "category", "category", raw.category, "a category", LETTER_CATEGORIES);
    textField(e, v, "subject", "subject", raw.subject, "Subject", { required: true, min: 5, max: 150 });
    textField(e, v, "details", "details", raw.details, "Issue details", { required: true, min: 20, max: 3000, multiline: true });
    dateField(e, v, "letterDate", "letterDate", raw.letterDate, "Letter date", { required: true, max: today });
    const ld = v.letterDate && !e.letterDate ? v.letterDate : today;
    dateField(e, v, "issueStartDate", "issueStartDate", raw.issueStartDate, "First noticed date", { max: ld, maxLabel: "the letter date" });
    const sd = v.issueStartDate && !e.issueStartDate ? v.issueStartDate : "";
    dateField(e, v, "issueEndDate", "issueEndDate", raw.issueEndDate, "Latest occurrence date", { min: sd || undefined, minLabel: "the first noticed date", max: ld, maxLabel: "the letter date" });
    dateField(e, v, "responseByDate", "responseByDate", raw.responseByDate, "Response-by date", { min: v.letterDate && !e.letterDate ? v.letterDate : undefined, minLabel: "the letter date" });
    textField(e, v, "requestedAction", "requestedAction", raw.requestedAction, "Requested action", { required: true, min: 10, max: 1500, multiline: true });
    textField(e, v, "attachments", "attachments", raw.attachments, "Enclosures", { max: 300 });
    return { ok: !Object.keys(e).length, errors: e, value: v };
  }

  /* ---------- meeting minutes ---------- */
  function intField(errors, out, key, path, raw, label) {
    const s = cleanText(String(raw == null ? "" : raw), true);
    out[key] = s;
    if (s && !/^\d{1,5}$/.test(s)) errors[path] = label + " must be a whole number (0 or more).";
  }

  function validateMinutes(raw, opts) {
    raw = raw || {}; opts = opts || {};
    const e = {}, v = {}, warnings = [];
    const today = opts.today || addDays(utcToday(), 1);

    textField(e, v, "societyName", "societyName", raw.societyName, "Society name", { required: true, max: 120 });
    selectField(e, v, "meetingType", "meetingType", raw.meetingType, "a meeting type", MEETING_TYPES);
    dateField(e, v, "meetingDate", "meetingDate", raw.meetingDate, "Meeting date", { required: true, max: today });
    const md = v.meetingDate && !e.meetingDate ? v.meetingDate : "";
    v.startTime = cleanText(raw.startTime, true); v.endTime = cleanText(raw.endTime, true);
    if (v.startTime && !validTime(v.startTime)) e.startTime = "Start time must be a valid time (HH:MM).";
    if (v.endTime && !validTime(v.endTime)) e.endTime = "End time must be a valid time (HH:MM).";
    if (!e.startTime && !e.endTime && v.startTime && v.endTime && v.endTime <= v.startTime) e.endTime = "End time must be after the start time.";
    textField(e, v, "venue", "venue", raw.venue, "Venue or mode", { required: true, max: 120 });
    textField(e, v, "chairperson", "chairperson", raw.chairperson, "Chairperson", { required: true, max: 100 });
    textField(e, v, "recorder", "recorder", raw.recorder, "Minutes recorded by", { required: true, max: 100 });
    dateField(e, v, "noticeDate", "noticeDate", raw.noticeDate, "Notice date", { max: md || today, maxLabel: "the meeting date" });
    dateField(e, v, "nextMeetingDate", "nextMeetingDate", raw.nextMeetingDate, "Next meeting date", { min: md || undefined, minLabel: "the meeting date" });

    /* attendance */
    v.attendees = [];
    const attIn = Array.isArray(raw.attendees) ? raw.attendees : [];
    if (attIn.length > MAX_ATTENDEES) e.attendees = "Too many attendee rows (maximum " + MAX_ATTENDEES + ").";
    attIn.slice(0, MAX_ATTENDEES).forEach((r, i) => {
      r = r || {};
      if (!cleanText(r.name, true) && !cleanText(r.unit, true)) return;
      const row = { i };
      textField(e, row, "name", "attendees." + i + ".name", r.name, "Name", { required: true, max: 100 });
      textField(e, row, "unit", "attendees." + i + ".unit", r.unit, "Flat / designation", { max: 60 });
      row.status = cleanText(r.status, true) || "present";
      if (!ATTENDANCE_STATUS.some((o) => o[0] === row.status)) e["attendees." + i + ".status"] = "Choose a valid attendance status.";
      v.attendees.push(row);
    });
    const presentCount = v.attendees.filter((a) => a.status === "present").length;
    if (!e.attendees && presentCount === 0) e.attendees = "Add at least one attendee marked Present.";
    const seen = new Set();
    v.attendees.forEach((a) => { const k = a.name.toLowerCase(); if (a.name && seen.has(k) && !warnings.some((w) => w.includes('"' + a.name + '"'))) warnings.push('The name "' + a.name + '" appears more than once in the attendance list.'); seen.add(k); });

    /* quorum — recorded, never calculated or assumed */
    const qIn = raw.quorum || {};
    v.quorum = {};
    textField(e, v.quorum, "required", "quorum.required", qIn.required, "Quorum required", { max: 80 });
    selectField(e, v.quorum, "status", "quorum.status", qIn.status, "the quorum status you are recording", QUORUM_STATUS);
    textField(e, v.quorum, "basis", "quorum.basis", qIn.basis, "Quorum basis", { max: 200 });
    if (!e["quorum.status"] && v.quorum.status === "present") {
      const need = /^\d+$/.test(v.quorum.required) ? parseInt(v.quorum.required, 10) : null;
      if (need !== null && presentCount < need) warnings.push("You recorded “Quorum present”, but only " + presentCount + " attendee(s) are marked Present against a required figure of " + need + ". Check the attendance list and the registered bye-laws.");
      if (!v.quorum.required) warnings.push("Quorum is recorded as present but no quorum requirement was entered. Add it from the registered bye-laws before finalising.");
    }

    /* agenda, discussion, resolutions, votes */
    v.agenda = [];
    const agIn = Array.isArray(raw.agenda) ? raw.agenda : [];
    if (agIn.length > MAX_AGENDA) e.agenda = "Too many agenda items (maximum " + MAX_AGENDA + ").";
    const refMap = {};
    agIn.slice(0, MAX_AGENDA).forEach((r, i) => {
      r = r || {};
      const p = "agenda." + i + ".";
      const blank = !cleanText(r.title, true) && !cleanText(r.discussion) && !cleanText(r.resolution);
      if (blank) return;
      const row = { i, n: v.agenda.length + 1 };
      refMap[i + 1] = row.n;
      textField(e, row, "title", p + "title", r.title, "Agenda item title", { required: true, max: 150 });
      textField(e, row, "discussion", p + "discussion", r.discussion, "Discussion notes", { max: 3000, multiline: true });
      row.outcome = cleanText(r.outcome, true) || "none";
      if (!OUTCOMES.some((o) => o[0] === row.outcome)) e[p + "outcome"] = "Choose a valid outcome.";
      textField(e, row, "resolution", p + "resolution", r.resolution, "Resolution wording", { max: 1000, multiline: true });
      if ((row.outcome === "resolved" || row.outcome === "not_passed") && !row.resolution && !e[p + "resolution"]) e[p + "resolution"] = "Enter the resolution wording exactly as moved.";
      textField(e, row, "proposedBy", p + "proposedBy", r.proposedBy, "Proposed by", { max: 100 });
      textField(e, row, "secondedBy", p + "secondedBy", r.secondedBy, "Seconded by", { max: 100 });
      intField(e, row, "votesFor", p + "votesFor", r.votesFor, "Votes for");
      intField(e, row, "votesAgainst", p + "votesAgainst", r.votesAgainst, "Votes against");
      intField(e, row, "votesAbstain", p + "votesAbstain", r.votesAbstain, "Abstentions");
      const f = +row.votesFor || 0, a = +row.votesAgainst || 0, ab = +row.votesAbstain || 0;
      if (!e[p + "votesFor"] && !e[p + "votesAgainst"] && !e[p + "votesAbstain"]) {
        if (presentCount && f + a + ab > presentCount) warnings.push("Item " + row.n + ": votes recorded (" + (f + a + ab) + ") exceed attendees marked Present (" + presentCount + ").");
        if (row.outcome === "resolved" && row.votesFor !== "" && row.votesAgainst !== "" && a > f) warnings.push("Item " + row.n + ": marked “Resolution passed” although votes against exceed votes for. Required majorities depend on the registered bye-laws — confirm the outcome.");
      }
      v.agenda.push(row);
    });
    if (!e.agenda && v.agenda.length === 0) e.agenda = "Add at least one agenda item with a title.";

    /* action items */
    v.actions = [];
    const acIn = Array.isArray(raw.actions) ? raw.actions : [];
    if (acIn.length > MAX_ACTIONS) e.actions = "Too many action items (maximum " + MAX_ACTIONS + ").";
    acIn.slice(0, MAX_ACTIONS).forEach((r, i) => {
      r = r || {};
      const p = "actions." + i + ".";
      if (!cleanText(r.text, true) && !cleanText(r.owner, true) && !cleanText(r.due, true)) return;
      const row = { i };
      textField(e, row, "text", p + "text", r.text, "Action", { required: true, max: 300 });
      textField(e, row, "owner", p + "owner", r.owner, "Action owner", { required: true, max: 100 });
      dateField(e, row, "due", p + "due", r.due, "Due date", {});
      const ref = cleanText(String(r.itemRef == null ? "" : r.itemRef), true);
      row.itemRef = ref && refMap[ref] ? refMap[ref] : "";
      v.actions.push(row);
    });

    return { ok: !Object.keys(e).length, errors: e, warnings, value: v, presentCount };
  }

  return {
    DRAFT_LABEL, LETTER_CATEGORIES, RECIPIENTS, MEETING_TYPES, ATTENDANCE_STATUS, QUORUM_STATUS, OUTCOMES,
    labelOf, fmtDate, parseISO, validateLetter, validateMinutes, cleanText
  };
});
