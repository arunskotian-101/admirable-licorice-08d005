(function () {
  "use strict";
  const { $, h, placeholderSpan, loadSociety } = window.App;
  loadSociety().then((s) => {
    const bearers = $("#bearers");
    if (!s) { bearers.replaceChildren(h("p", { class: "error", text: "Contact details could not be loaded. If you are running locally, use “netlify dev” rather than opening the file directly." })); return; }
    bearers.replaceChildren(...s.officeBearers.map((b) => h("div", { class: "card" },
      h("p", { class: "label", text: b.role }),
      h("h3", {}, placeholderSpan(b.name)),
      h("dl", { class: "contact" }, h("dt", { text: "Phone" }), h("dd", {}, placeholderSpan(b.phone)), h("dt", { text: "Email" }), h("dd", {}, placeholderSpan(b.email))))));
    $("#office").replaceChildren(
      h("dt", { text: "Registration" }), h("dd", {}, placeholderSpan(s.registration)),
      h("dt", { text: "Address" }), h("dd", {}, placeholderSpan(s.address)),
      h("dt", { text: "Office hours" }), h("dd", {}, placeholderSpan(s.officeHours)));
    $("#emergency").replaceChildren(...s.emergencyContacts.flatMap((c) => [h("dt", { text: c.label }), h("dd", {}, placeholderSpan(c.value))]));
  });
})();
