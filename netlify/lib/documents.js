"use strict";
/* Deterministic document assembly. Names, attendance, quorum, votes and action owners are copied
   from the form exactly — the AI only supplies wording for free-text notes. */
const V = require("../../public/js/validators.js");

function buildLetter(v, paragraphs) {
  const L = [];
  L.push("Date: " + V.fmtDate(v.letterDate), "", "To,", V.labelOf(V.RECIPIENTS, v.recipient), v.societyName, "");
  L.push("Subject: " + v.subject, "", "Dear Sir/Madam,", "");
  paragraphs.forEach((p) => L.push(p, ""));
  L.push("Yours sincerely,", "", v.name, "Flat / wing: " + v.flat, "Contact: " + v.contact);
  if (v.attachments) L.push("", "Enclosures: " + v.attachments);
  return L.join("\n");
}

function buildMinutes(v, polished) {
  polished = polished || {};
  const L = [], gen = v.meetingType === "agm" || v.meetingType === "sgm";
  const NR = "[not recorded]";
  const group = (st) => v.attendees.filter((a) => a.status === st);
  const line = (a, k) => "  " + k + ". " + a.name + (a.unit ? " — " + a.unit : "");

  L.push(v.societyName.toUpperCase(), "MINUTES OF THE " + V.labelOf(V.MEETING_TYPES, v.meetingType).toUpperCase(), "");
  L.push("Date: " + V.fmtDate(v.meetingDate));
  L.push("Time: " + (v.startTime ? v.startTime + (v.endTime ? " to " + v.endTime : "") : NR));
  L.push("Venue / mode: " + v.venue, "Chaired by: " + v.chairperson, "Minutes recorded by: " + v.recorder);
  if (v.noticeDate) L.push("Notice circulated on: " + V.fmtDate(v.noticeDate));

  L.push("", "1. ATTENDANCE");
  [["present", gen ? "Members present" : "Committee members present"], ["apology", "Absent (apology received)"], ["absent", "Absent"]].forEach(([st, label]) => {
    const g = group(st);
    if (!g.length) return;
    L.push(label + " (" + g.length + "):");
    g.forEach((a, i) => L.push(line(a, i + 1)));
  });

  L.push("", "2. QUORUM");
  L.push("Quorum required (as entered by the recorder): " + (v.quorum.required || NR));
  L.push("Attendees marked Present: " + group("present").length);
  L.push("Quorum status recorded: " + V.labelOf(V.QUORUM_STATUS, v.quorum.status));
  if (v.quorum.basis) L.push("Basis / reference supplied: " + v.quorum.basis);

  L.push("", "3. AGENDA");
  v.agenda.forEach((a) => L.push("  " + a.n + ". " + a.title));

  L.push("", "4. DISCUSSION AND RESOLUTIONS");
  v.agenda.forEach((a) => {
    const p = polished[a.n] || {};
    const disc = a.discussion ? (p.discussion || a.discussion) : "";
    const res = a.resolution ? (p.resolution || a.resolution) : "";
    L.push("", "Item " + a.n + " — " + a.title);
    L.push("Discussion: " + (disc || "[discussion not recorded]"));
    L.push("Outcome recorded: " + V.labelOf(V.OUTCOMES, a.outcome));
    if (a.outcome === "resolved" || a.outcome === "not_passed") {
      L.push("Resolution wording: " + (res || "[resolution wording not recorded]"));
      L.push("Proposed by: " + (a.proposedBy || NR) + "   Seconded by: " + (a.secondedBy || NR));
      const any = a.votesFor !== "" || a.votesAgainst !== "" || a.votesAbstain !== "";
      L.push("Votes: " + (any ? "For " + (a.votesFor || "0") + " | Against " + (a.votesAgainst || "0") + " | Abstained " + (a.votesAbstain || "0") : "[not recorded]"));
    }
  });

  L.push("", "5. ACTION ITEMS");
  if (!v.actions.length) L.push("No action items recorded.");
  v.actions.forEach((a, i) => L.push("  " + (i + 1) + ". " + a.text + " — Owner: " + a.owner + " — Due: " + (a.due ? V.fmtDate(a.due) : "to be confirmed") + (a.itemRef ? " — Item " + a.itemRef : "")));

  if (v.nextMeetingDate) L.push("", "6. NEXT MEETING", "Date: " + V.fmtDate(v.nextMeetingDate));
  L.push("", v.endTime ? "The meeting closed at " + v.endTime + "." : "[closing time not recorded]");
  L.push("", "Recorded by: " + v.recorder, "Signature: ____________________   Date: ______________");
  L.push("", "Chairperson: " + v.chairperson, "Signature: ____________________   Date: ______________");
  L.push("", "Confirmation of these minutes: [to be completed after approval]");
  return L.join("\n");
}

module.exports = { buildLetter, buildMinutes };
