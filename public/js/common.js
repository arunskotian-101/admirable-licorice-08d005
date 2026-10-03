/* Shared browser helpers (window.App). No frameworks, no inline styles (the CSP forbids them). */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const DRAFT = () => window.Validators.DRAFT_LABEL;

  function h(tag, attrs) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  }

  const isPlaceholder = (s) => /^\[.*\]$/.test(String(s || "").trim());
  const placeholderSpan = (s) => (isPlaceholder(s) ? h("span", { class: "placeholder", text: s }) : document.createTextNode(s));

  function localToday() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /* ---------- society profile ---------- */
  let societyPromise;
  function loadSociety() {
    if (!societyPromise) societyPromise = fetch("/data/society.json").then((r) => { if (!r.ok) throw new Error("society.json " + r.status); return r.json(); }).catch(() => null);
    return societyPromise;
  }
  async function applySocietyName() {
    const s = await loadSociety();
    if (!s) return null;
    $$("[data-society-name]").forEach((el) => { el.textContent = s.name; if (isPlaceholder(s.name) && el.closest(".brand")) el.textContent = "Sai Heritage"; });
    return s;
  }

  /* ---------- header nav ---------- */
  function initNav() {
    const btn = $(".nav-toggle"), nav = $("#nav");
    if (btn && nav) btn.addEventListener("click", () => { const o = nav.classList.toggle("open"); btn.setAttribute("aria-expanded", String(o)); });
    const here = location.pathname.replace(/\/index\.html$/, "/");
    $$("#nav a").forEach((a) => { if (a.getAttribute("href") === here || (here === "/" && a.getAttribute("href") === "/")) a.setAttribute("aria-current", "page"); });
  }

  /* ---------- API ---------- */
  const ACCESS_KEY = "society.accessCode";
  const mkErr = (code, message, status, fields) => Object.assign(new Error(message), { code, status, fields });

  function askAccessCode(wasWrong) {
    return new Promise((resolve) => {
      const input = h("input", { type: "password", id: "access-code", autocomplete: "off", required: true });
      const dlg = h("dialog", { "aria-labelledby": "access-title" },
        h("form", { method: "dialog" },
          h("h2", { id: "access-title", text: "Access code" }),
          h("p", { class: "muted", text: wasWrong ? "That code was not correct. Try again." : "Enter the society access code to use the drafting assistant." }),
          h("label", { for: "access-code", text: "Access code" }), input,
          h("div", { class: "form-actions" },
            h("button", { class: "btn", value: "ok", type: "submit", text: "Continue" }),
            h("button", { class: "btn btn-ghost", value: "cancel", type: "submit", formnovalidate: true, text: "Cancel" }))));
      dlg.addEventListener("close", () => { const ok = dlg.returnValue === "ok" && input.value.trim(); dlg.remove(); resolve(ok ? input.value.trim() : null); });
      document.body.append(dlg); dlg.showModal(); input.focus();
    });
  }

  async function apiPost(path, body, retried) {
    const headers = { "Content-Type": "application/json" };
    const code = sessionStorage.getItem(ACCESS_KEY);
    if (code) headers["x-access-code"] = code;
    let res;
    try { res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) }); }
    catch { throw mkErr("NETWORK", "Could not reach the server. Check your internet connection and try again."); }
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON response */ }
    if (res.ok && data) return data;
    const err = (data && data.error) || {};
    if ((err.code === "ACCESS_CODE_REQUIRED" || err.code === "ACCESS_CODE_INVALID") && !retried) {
      sessionStorage.removeItem(ACCESS_KEY);
      const entered = await askAccessCode(err.code === "ACCESS_CODE_INVALID");
      if (entered) { sessionStorage.setItem(ACCESS_KEY, entered); return apiPost(path, body, true); }
      throw mkErr(err.code, "An access code is needed to use the drafting assistant.", res.status);
    }
    if (!data) {
      if (res.status === 404) throw mkErr("NO_FUNCTION", "The server function was not found. If you are running locally, start the site with “netlify dev” instead of opening the files directly.", 404);
      if (res.status === 502 || res.status === 504) throw mkErr("TIMEOUT", "The request timed out. Please try again, or shorten the text.", res.status);
      throw mkErr("BAD_RESPONSE", "The server sent an unexpected response (HTTP " + res.status + "). Please try again.", res.status);
    }
    throw mkErr(err.code || "ERROR", err.message || "Something went wrong. Please try again.", res.status, err.fields);
  }

  async function checkHealth(bannerEl) {
    try {
      const r = await fetch("/api/health"); if (!r.ok) throw 0;
      const d = await r.json();
      if (!d.aiConfigured) { bannerEl.hidden = false; bannerEl.textContent = "The AI drafting service is not configured on this server yet (GEMINI_API_KEY is missing). You can fill in the form, but generating a draft will not work until the site administrator completes setup."; }
    } catch { /* the page still works; submit will report a clear error */ }
  }

  /* ---------- form errors ---------- */
  const findControl = (root, path) => root.querySelector('[data-path="' + path + '"]') || root.querySelector('[name="' + path + '"]');
  function clearErrors(root) {
    $$('[aria-invalid="true"]', root).forEach((c) => { c.removeAttribute("aria-invalid"); c.removeAttribute("aria-describedby"); });
    $$("p.error", root).forEach((p) => p.remove());
    const sum = $(".error-summary", root); if (sum) { sum.hidden = true; sum.replaceChildren(); }
  }
  /* errors: {path: message}. Marks fields, adds inline messages, fills the summary and focuses the first problem. */
  function showErrors(root, errors) {
    clearErrors(root);
    const items = []; let n = 0;
    Object.entries(errors).forEach(([path, msg]) => {
      const c = findControl(root, path);
      if (c) {
        const id = "err-" + (c.id || path.replace(/\W/g, "-")) + "-" + (n++);
        const p = h("p", { class: "error", id, text: msg });
        (c.closest(".field") || c.parentElement).append(p);
        c.setAttribute("aria-invalid", "true"); c.setAttribute("aria-describedby", id);
      }
      items.push([path, msg, c]);
    });
    const sum = $(".error-summary", root);
    if (sum && items.length) {
      sum.hidden = false;
      sum.append(h("h2", { text: items.length === 1 ? "There is 1 problem to fix" : "There are " + items.length + " problems to fix" }),
        h("ul", {}, ...items.map(([, msg, c]) => h("li", {}, c ? h("a", { href: "#", onclick: (e) => { e.preventDefault(); c.focus(); } , text: msg }) : msg))));
      sum.setAttribute("tabindex", "-1"); sum.focus();
    } else if (items[0] && items[0][2]) items[0][2].focus();
  }

  function initCounters(root) {
    $$("textarea[maxlength], textarea[data-max]", root).forEach((t) => {
      const max = +(t.getAttribute("data-max") || t.getAttribute("maxlength"));
      const c = h("p", { class: "counter", "aria-hidden": "true" });
      t.after(c);
      const upd = () => { c.textContent = t.value.length + " / " + max; c.classList.toggle("over", t.value.length > max); };
      t.addEventListener("input", upd); upd();
    });
  }

  function setLoading(btn, on, label) {
    if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.replaceChildren(h("span", { class: "spinner", "aria-hidden": "true" }), " " + (label || "Working…")); }
    else { btn.disabled = false; btn.textContent = btn.dataset.label || btn.textContent; }
  }

  /* ---------- generated document panel: edit, copy, download, print ---------- */
  function docPanel(root, opts) {
    const ta = $(".doc-text", root), status = $(".doc-status", root), count = $(".placeholder-count", root);
    const marked = () => DRAFT().toUpperCase() + "\n\n" + ta.value;
    const say = (m) => { status.textContent = m; };
    const updCount = () => {
      const n = (ta.value.match(/\[[^\]\n]{1,80}\]/g) || []).length;
      count.textContent = n ? n + " placeholder" + (n === 1 ? "" : "s") + " in [square brackets] still need to be completed." : "No [bracketed] placeholders remain — still read the whole draft before use.";
    };
    ta.addEventListener("input", () => { root.dataset.dirty = "1"; updCount(); });
    $('[data-action="copy"]', root).addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(marked()); say("Copied to the clipboard, including the “" + DRAFT() + "” line."); }
      catch {
        const tmp = h("textarea", { "aria-hidden": "true" }); tmp.value = marked(); document.body.append(tmp); tmp.select();
        try { document.execCommand("copy"); say("Copied to the clipboard, including the “" + DRAFT() + "” line."); } catch { say("Copy failed. Select the text and copy it manually."); }
        tmp.remove();
      }
    });
    $('[data-action="download"]', root).addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([marked()], { type: "text/plain;charset=utf-8" }));
      const a = h("a", { href: url, download: opts.filename() }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); say("Downloaded " + opts.filename() + ".");
    });
    $('[data-action="print"]', root).addEventListener("click", () => {
      $("#print-body").textContent = ta.value; $("#print-draft").textContent = DRAFT(); window.print();
    });
    return {
      show(text) { ta.value = text; root.dataset.dirty = ""; updCount(); say(""); root.hidden = false; },
      isDirty: () => root.dataset.dirty === "1"
    };
  }

  function renderNotes(container, title, list, kind) {
    container.replaceChildren();
    if (!list || !list.length) return;
    container.append(h("div", { class: "notice " + (kind || "") }, h("strong", { text: title }), h("ul", { class: "review-list" }, ...list.map((t) => h("li", { text: t })))));
  }

  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

  document.addEventListener("DOMContentLoaded", () => { initNav(); applySocietyName(); });
  window.App = { $, $$, h, isPlaceholder, placeholderSpan, localToday, loadSociety, apiPost, checkHealth, showErrors, clearErrors, initCounters, setLoading, docPanel, renderNotes, slug };
})();
