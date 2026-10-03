"use strict";
/* Post-generation guards. They never edit the draft — they only warn the reviewer. */

const digits = (t) => new Set((String(t).match(/\d+/g) || []).map((n) => String(parseInt(n, 10))));

function unsupportedNumbers(output, source) {
  const allowed = digits(source);
  return [...digits(output)].filter((n) => !allowed.has(n));
}

const CLAIMS = [
  [/\b(bye[- ]?laws?|clause\s*\d|section\s*\d|article\s*\d|act,?\s*\d{4}|circular|statute)\b/i, "a bye-law, clause or legal reference"],
  [/\b(has|have|had|was|were|been)\s+(already\s+)?(sent|delivered|received|acknowledged|approved|ratified|sanctioned)\b/i, "a delivery, receipt or approval claim"],
  [/\b(unanimous(ly)?|without objection|carried|ratified)\b/i, "an outcome or voting claim"]
];

function unsupportedClaims(output, source) {
  const out = [];
  for (const [re, label] of CLAIMS) {
    const m = re.exec(output);
    if (m && !re.test(source)) out.push(label + ' (“' + m[0] + '”)');
  }
  return out;
}

/* Returns reviewer-facing warning strings. */
function auditText(output, source, where) {
  const w = [], prefix = where ? where + ": " : "";
  const nums = unsupportedNumbers(output, source);
  if (nums.length) w.push(prefix + "The draft contains figure(s) " + nums.slice(0, 6).join(", ") + " that do not appear in what you entered. Verify or remove them.");
  unsupportedClaims(output, source).forEach((c) => w.push(prefix + "The draft contains " + c + " that you did not supply. Remove it unless it is true and verified."));
  return w;
}

module.exports = { unsupportedNumbers, unsupportedClaims, auditText };
