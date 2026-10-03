(function () {
  "use strict";
  const { $, h, apiPost, checkHealth, showErrors, clearErrors, setLoading } = window.App;
  let K = null;
  const src = (id) => K.sources.find((s) => s.id === id);

  const sourceCard = (s) => h("div", { class: "card" },
    h("span", { class: "chip " + (s.kind === "general-reference" ? "" : "chip-blue"), text: s.kind === "general-reference" ? "General reference" : "Society document" }),
    h("h3", { text: s.title }),
    s.url ? h("p", {}, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer", text: "Open the source document" })) : null,
    h("p", { class: "small muted", text: s.note }));

  const entry = (e) => {
    const s = src(e.sourceId);
    return h("details", { class: "faq" },
      h("summary", { text: e.question || e.title }),
      h("div", { class: "body" },
        e.type === "rule" ? h("blockquote", { text: e.quote }) : h("p", { text: e.answer }),
        h("p", { class: "source-line" }, "Source: " + (s ? s.title : "unknown") + " — " + e.locator + (e.verifiedBy ? " — verified by " + e.verifiedBy + " on " + e.verifiedOn : ""))));
  };

  function render(filter) {
    const q = (filter || "").toLowerCase().trim();
    const faq = $("#faq"); faq.replaceChildren();
    const list = K.entries.filter((e) => e.type !== "rule").filter((e) => !q || (e.question + " " + e.answer + " " + e.category).toLowerCase().includes(q));
    const cats = [...new Set(list.map((e) => e.category))];
    cats.forEach((c) => { faq.append(h("h3", { class: "cat-title", text: c })); list.filter((e) => e.category === c).forEach((e) => faq.append(entry(e))); });
    $("#search-status").textContent = q ? (list.length ? list.length + " matching question" + (list.length === 1 ? "" : "s") + "." : "No matching question in the supplied sources.") : "";
  }

  fetch("/data/knowledge.json").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((data) => {
    K = data;
    $("#sources").replaceChildren(...K.sources.map(sourceCard));
    const rules = K.entries.filter((e) => e.type === "rule");
    $("#rules").replaceChildren(...(rules.length ? rules.map(entry) : [h("div", { class: "notice" },
      h("p", { text: "No bye-law clauses have been added yet. This site does not quote or number any bye-law until a committee member verifies the wording against the society’s registered bye-laws and adds it with its source." }),
      h("p", { class: "small", text: "The Maharashtra 2014 model bye-laws are listed above as a general reference only." }))]));
    render("");
    $("#search").addEventListener("input", (e) => render(e.target.value));
  }).catch(() => { $("#sources").replaceChildren(h("p", { class: "error", text: "The rules and FAQ data could not be loaded. If you are running locally, use “netlify dev” rather than opening the file directly." })); });


})();
