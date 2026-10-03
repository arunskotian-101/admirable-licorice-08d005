(function () {
  "use strict";
  const { $, h, apiPost, checkHealth, showErrors, clearErrors, initCounters, setLoading, docPanel, renderNotes, localToday, loadSociety, isPlaceholder, slug } = window.App;
  const V = window.Validators;
  const form = $("#letter-form"), submit = $("#submit"), status = $("#status"), result = $("#result");

  const fill = (sel, list, ph) => { sel.append(h("option", { value: "", text: ph })); list.forEach(([v, l]) => sel.append(h("option", { value: v, text: l }))); };
  fill($("#recipient"), V.RECIPIENTS, "Choose a recipient…"); fill($("#category"), V.LETTER_CATEGORIES, "Choose a category…");
  $("#recipient").value = "secretary";
  const today = localToday();
  ["letterDate", "issueStartDate", "issueEndDate"].forEach((n) => form.elements[n].max = today);
  form.elements.letterDate.value = today;
  initCounters(form);
  checkHealth($("#health-banner"));
  loadSociety().then((s) => { if (s && !isPlaceholder(s.name) && !form.elements.societyName.value) form.elements.societyName.value = s.name; });

  const panel = docPanel(result, { filename: () => "letter-" + (slug(form.elements.subject.value) || "draft") + "-" + form.elements.letterDate.value + ".txt" });
  const collect = () => Object.fromEntries(new FormData(form).entries());

  async function generate() {
    const data = collect();
    const check = V.validateLetter(data, { today });
    if (!check.ok) { showErrors(form, check.errors); status.textContent = ""; return; }
    clearErrors(form); status.className = "status"; status.textContent = "Drafting your letter — this usually takes 5–20 seconds…";
    setLoading(submit, true, "Drafting…"); $("#regen").disabled = true;
    try {
      const out = await apiPost("/api/generate-letter", data);
      panel.show(out.letter);
      renderNotes($("#notes"), "Check before you use this letter", [...(out.warnings || []), ...(out.reviewerNotes || [])], "notice-warn");
      $("#model-note").textContent = out.model ? "Drafted with " + out.model + "." : "";
      status.textContent = "Draft ready below.";
      result.scrollIntoView({ behavior: "smooth", block: "start" }); $("#result-title").focus({ preventScroll: true });
    } catch (err) {
      status.className = "status err";
      if (err.fields) { showErrors(form, err.fields); status.textContent = ""; }
      else status.textContent = err.message;
    } finally { setLoading(submit, false); $("#regen").disabled = false; }
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); generate(); });
  $("#regen").addEventListener("click", () => {
    if (panel.isDirty() && !confirm("Regenerating will replace the edits you have made to this letter. Continue?")) return;
    generate();
  });
})();
