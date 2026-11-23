// Hunter: standalone phone app. Talks to Supabase over plain REST (auth + database), no libraries.
(() => {
  const CFG = window.HUNTER_CONFIG || {};
  const app = document.getElementById("app");
  const store = {
    get(k, d) { try { const v = localStorage.getItem("hunter-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("hunter-" + k, JSON.stringify(v)); } catch (e) {} }
  };
  let session = store.get("session", null), profile = store.get("profile", null);
  let jobs = [], marks = {}, loadError = "", loaded = false, filter = "fit";
  const seenBefore = store.get("seen", null); // job ids known on the previous visit; null on the very first one

  // ---------- small DOM helper ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in (attrs || {})) {
      const v = attrs[k];
      if (k === "class") el.className = v; else if (k === "on") for (const ev in v) el.addEventListener(ev, v[ev]);
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const str = v => (typeof v === "string" ? v : v == null ? "" : String(v));
  const arr = v => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  const safeUrl = u => (/^https:\/\//.test(str(u)) ? str(u) : "");

  // ---------- backend ----------
  async function call(path, opts = {}, retry = true) {
    const headers = { apikey: CFG.anonKey, "Content-Type": "application/json", ...(opts.headers || {}) };
    if (session && !opts.noAuth) headers.Authorization = "Bearer " + session.access_token;
    const res = await fetch(CFG.url + path, { method: opts.method || "GET", headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    if (res.status === 401 && retry && session && !opts.noAuth) { await refresh(); return call(path, opts, false); }
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  function keep(s) { session = { access_token: s.access_token, refresh_token: s.refresh_token, user_id: s.user && s.user.id, expires_at: Date.now() + (s.expires_in || 3600) * 1000 }; store.set("session", session); }
  async function refresh() {
    try { keep(await call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: session.refresh_token }, noAuth: true })); }
    catch (e) { session = null; await signIn(); }
  }
  async function signIn() { keep(await call("/auth/v1/signup", { method: "POST", body: {}, noAuth: true })); } // anonymous account for this phone
  async function ensureSession() {
    if (!session) return signIn();
    if (session.expires_at - Date.now() < 60000) return refresh();
  }

  async function loadAll() {
    try {
      await ensureSession();
      const [j, m, p] = await Promise.all([
        call("/rest/v1/jobs?select=id,data,found_on&active=eq.true&order=found_on.desc"),
        call("/rest/v1/user_jobs?select=job_id,status,notes"),
        profile ? null : call("/rest/v1/profiles?select=data")
      ]);
      jobs = (j || []).map(r => ({ id: r.id, foundOn: r.found_on, ...(r.data || {}) }));
      marks = Object.fromEntries((m || []).map(r => [r.job_id, r]));
      if (!profile && p && p[0]) { profile = p[0].data; store.set("profile", profile); }
      loaded = true; loadError = "";
      if (profile) store.set("seen", jobs.map(x => x.id));
    } catch (e) { loadError = navigator.onLine === false ? "אין חיבור לאינטרנט. המשרות יתעדכנו כשהחיבור יחזור." : "לא הצלחנו לטעון את המשרות. נסה שוב בעוד רגע."; }
    route();
  }
  async function saveProfile(p) {
    profile = p; store.set("profile", p);
    await ensureSession();
    await call("/rest/v1/profiles?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: { user_id: session.user_id, data: p, updated_at: new Date().toISOString() } });
  }
  async function saveMark(jobId, patch) {
    const next = { job_id: jobId, status: "", notes: "", ...(marks[jobId] || {}), ...patch };
    marks[jobId] = next;
    await ensureSession();
    await call("/rest/v1/user_jobs?on_conflict=user_id,job_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: { user_id: session.user_id, job_id: jobId, status: next.status, notes: next.notes, updated_at: new Date().toISOString() } });
  }

  // ---------- onboarding ----------
  const STEPS = [
    { title: "נעים להכיר", lead: "כמה שאלות קצרות, ונתאים לך את המשרות הכי רלוונטיות במכירות בהייטק.", qs: [
      { key: "name", label: "איך קוראים לך?", type: "text", placeholder: "שם פרטי" },
      { key: "years", label: "כמה שנות ניסיון יש לך במכירות?", type: "one", opts: [["0", "בלי ניסיון"], ["1", "שנה עד שנתיים"], ["3", "3 עד 5"], ["6", "6 עד 10"], ["11", "יותר מ-10"]] } ] },
    { title: "הניסיון שלך", lead: "אפשר לבחור כמה תשובות.", qs: [
      { key: "kinds", label: "באילו סוגי מכירות עבדת?", type: "many", opts: [["field", "מכירות שטח"], ["phone", "מכירות טלפוניות"], ["accounts", "ניהול תיקי לקוחות"], ["team", "ניהול צוות"], ["software", "מכירת תוכנה"]] },
      { key: "sectors", label: "אילו תחומים אתה מכיר?", type: "many", opts: ["תקשורת", "פיננסים ותשלומים", "קמעונאות", "אבטחה ומיגון", "בריאות", "רכב ואנרגיה"].map(s => [s, s]) } ] },
    { title: "איפה ואיך", lead: "", qs: [
      { key: "regions", label: "באילו אזורים מתאים לך לעבוד?", type: "many", opts: ["ירושלים", "מרכז", "שרון", "שפלה", "צפון", "דרום"].map(s => [s, s]) },
      { key: "modes", label: "איזה אופי עבודה מתאים לך?", type: "many", opts: ["שטח", "היברידי", "משרד"].map(s => [s, s]) } ] },
    { title: "תנאים", lead: "", qs: [
      { key: "wantsCar", label: "חשוב לך רכב צמוד?", type: "one", opts: [["yes", "כן"], ["no", "לא חובה"]] },
      { key: "minPay", label: "מה השכר החודשי שאתה מכוון אליו, כולל עמלות?", type: "one", opts: [["0", "פתוח"], ["12000", "12 אלף ₪ ומעלה"], ["18000", "18 אלף ₪ ומעלה"], ["25000", "25 אלף ₪ ומעלה"], ["30000", "30 אלף ₪ ומעלה"]] } ] },
    { title: "עוד שני פרטים", lead: "", qs: [
      { key: "english", label: "מה רמת האנגלית שלך?", type: "one", opts: [["basic", "בסיסית"], ["good", "טובה"], ["fluent", "שוטפת"]] },
      { key: "degree", label: "יש לך תואר אקדמי?", type: "one", opts: [["yes", "כן"], ["no", "לא"]] } ] }
  ];
  let draft = null, step = 0;
  function toDraft(p) { return p ? { ...p, years: str(p.years), minPay: str(p.minPay), wantsCar: p.wantsCar ? "yes" : "no", degree: p.degree ? "yes" : "no" } : { kinds: [], sectors: [], regions: [], modes: [] }; }
  function fromDraft(d) { return { ...d, name: str(d.name).trim().slice(0, 40), years: Number(d.years) || 0, minPay: Number(d.minPay) || 0, wantsCar: d.wantsCar === "yes", degree: d.degree === "yes" }; }
  function stepDone(s) { return s.qs.every(q => q.type === "many" ? (q.key === "sectors" || arr(draft[q.key]).length) : str(draft[q.key]).trim()); }

  function renderOnboarding() {
    if (!draft) { draft = toDraft(profile); step = 0; }
    const s = STEPS[step], last = step === STEPS.length - 1;
    const hint = h("p", { class: "hint", "aria-live": "polite" });
    const next = h("button", { class: "btn primary", on: { click: async () => {
      if (!stepDone(s)) { hint.textContent = "צריך לענות על כל השאלות כדי להמשיך."; return; }
      if (!last) { step++; renderOnboarding(); scrollTo(0, 0); return; }
      next.disabled = true; hint.textContent = "שומר…";
      try { await saveProfile(fromDraft(draft)); } catch (e) { /* kept on this phone; it is sent again on the next save */ }
      draft = null; store.set("seen", jobs.map(x => x.id)); location.hash = ""; route(); scrollTo(0, 0);
    } } }, last ? "הצג לי משרות" : "המשך");
    const qEls = s.qs.map(q => {
      if (q.type === "text") {
        const input = h("input", { type: "text", id: "q-" + q.key, placeholder: q.placeholder, maxlength: "40", autocomplete: "given-name" });
        input.value = str(draft[q.key]); input.addEventListener("input", () => { draft[q.key] = input.value; });
        return h("div", { class: "q" }, h("label", { for: "q-" + q.key }, q.label), input);
      }
      const many = q.type === "many";
      const group = h("div", { class: "opts", role: "group", "aria-label": q.label });
      const paint = () => group.replaceChildren(...q.opts.map(([val, label]) => {
        const on = many ? arr(draft[q.key]).includes(val) : draft[q.key] === val;
        return h("button", { class: "opt", type: "button", "aria-pressed": String(on), on: { click: () => {
          if (many) { const cur = arr(draft[q.key]); draft[q.key] = on ? cur.filter(x => x !== val) : [...cur, val]; } else draft[q.key] = val;
          paint();
        } } }, label);
      }));
      paint();
      return h("div", { class: "q" }, h("div", { class: "qt" }, q.label), group);
    });
    app.replaceChildren(h("section", { class: "step" },
      h("div", { class: "progress", role: "progressbar", "aria-valuemin": "1", "aria-valuemax": String(STEPS.length), "aria-valuenow": String(step + 1) }, h("i", { style: "width:" + ((step + 1) / STEPS.length * 100) + "%" })),
      h("div", { class: "sec" }, h("h2", null, s.title), s.lead && h("p", { class: "sub" }, s.lead)),
      ...qEls, hint,
      h("div", { class: "nav" },
        step > 0 ? h("button", { class: "btn", on: { click: () => { step--; renderOnboarding(); } } }, "חזרה")
          : profile ? h("button", { class: "btn", on: { click: () => { draft = null; location.hash = ""; route(); } } }, "ביטול") : h("span"),
        next)));
  }

  // ---------- list ----------
  const MARKS = { saved: "שמרתי", applied: "הגשתי", interview: "ראיון", skipped: "לא רלוונטית" };
  const FILTERS = [["fit", "הכי מתאימות"], ["new", "חדשות"], ["saved", "שמרתי"], ["applied", "הגשתי"], ["all", "הכול"]];
  const scored = () => jobs.map(j => ({ job: j, m: HunterMatch.match(j, profile), mark: (marks[j.id] || {}).status || "", isNew: !!seenBefore && !seenBefore.includes(j.id) }))
    .sort((a, b) => b.m.score - a.m.score);

  function renderList() {
    let items = scored();
    if (filter === "fit") items = items.filter(x => x.mark !== "skipped" && x.m.score >= 50);
    else if (filter === "new") items = items.filter(x => x.isNew);
    else if (filter === "saved") items = items.filter(x => x.mark === "saved");
    else if (filter === "applied") items = items.filter(x => x.mark === "applied" || x.mark === "interview");
    const newCount = scored().filter(x => x.isNew).length;
    app.replaceChildren(
      h("header", { class: "top" },
        h("div", { class: "toprow" },
          h("div", null, h("h1", { class: "brand" }, "Hunter"), h("p", { class: "sub" }, (profile.name ? profile.name + ", " : "") + "משרות מכירות בהייטק שמתאימות לך")),
          h("button", { class: "textbtn", on: { click: () => { location.hash = "#profile"; } } }, "הפרופיל שלי")),
        newCount > 0 && h("p", { class: "notice" }, newCount === 1 ? "משרה חדשה אחת נוספה מאז הביקור הקודם שלך." : newCount + " משרות חדשות נוספו מאז הביקור הקודם שלך."),
        h("div", { class: "chips", role: "group", "aria-label": "סינון" }, FILTERS.map(([k, label]) =>
          h("button", { class: "chip", "aria-pressed": String(filter === k), on: { click: () => { filter = k; renderList(); } } }, label)))),
      loadError && h("p", { class: "notice", style: "margin-top:12px" }, loadError),
      ...items.map(({ job, m, mark, isNew }) =>
        h("button", { class: "row", on: { click: () => { location.hash = "#job-" + job.id; } } },
          h("span", { class: "co" }, str(job.company)),
          h("span", { class: "score" + (m.score < 50 ? " low" : "") }, m.score + "%"),
          h("span", { class: "role" }, [str(job.role), str(job.location)].filter(Boolean).join(" · ")),
          h("span", { class: "why" }, m.pros[0] || m.gaps[0] || ""),
          (isNew || mark) && h("span", { class: "tags" }, isNew && h("span", { class: "pill new" }, "חדשה"), mark && h("span", { class: "pill " + (mark === "skipped" ? "" : mark === "interview" ? "good" : "on") }, MARKS[mark])))),
      !items.length && h("div", { class: "empty" }, !loaded && !loadError ? h("strong", null, "טוען את המשרות…")
        : !jobs.length ? [h("strong", null, "עדיין אין משרות"), "משרות חדשות מתווספות כל הזמן. כדאי לחזור מחר."]
        : filter === "fit" ? [h("strong", null, "לא מצאנו כרגע משרה שמתאימה לפרופיל שלך"), "אפשר לראות את כל המשרות בלשונית \"הכול\", או לעדכן את הפרופיל."]
        : [h("strong", null, "אין כאן משרות כרגע")]));
  }

  // ---------- job ----------
  function section(title, body) {
    if (!body || (Array.isArray(body) && !body.length)) return null;
    return h("section", { class: "sec" }, h("h3", null, title), Array.isArray(body) ? h("ul", null, body.map(t => h("li", null, t))) : h("p", null, body));
  }
  function renderJob(id, flash) {
    const job = jobs.find(j => j.id === id);
    const back = h("button", { class: "textbtn", on: { click: () => { location.hash = ""; } } }, "→ חזרה לרשימה");
    if (!job) { app.replaceChildren(back, h("div", { class: "empty" }, h("strong", null, loaded ? "המשרה כבר לא זמינה" : "טוען…"))); return; }
    const m = HunterMatch.match(job, profile), mark = marks[id] || {};
    const hint = h("p", { class: "hint", "aria-live": "polite" }, flash || "");
    const setMark = async s => {
      const status = mark.status === s ? "" : s;
      let msg;
      try { await saveMark(id, { status }); msg = status ? "נשמר: " + MARKS[status] : "הסימון הוסר"; } catch (e) { msg = "השמירה נכשלה. נסה שוב בעוד רגע."; }
      renderJob(id, msg);
    };
    const notes = h("textarea", { id: "notes", dir: "auto", placeholder: "למשל: עם מי דיברתי, מתי הראיון" });
    notes.value = str(mark.notes);
    notes.addEventListener("blur", async () => { if (notes.value === str(mark.notes)) return; try { await saveMark(id, { notes: notes.value }); hint.textContent = "ההערות נשמרו"; } catch (e) { hint.textContent = "ההערות לא נשמרו. נסה שוב."; } });
    const url = safeUrl(job.url);
    app.replaceChildren(back, h("article", { class: "detail" },
      h("div", { class: "sec" }, h("h2", null, str(job.company)), h("p", { class: "sub" }, [str(job.role), str(job.location)].filter(Boolean).join(" · "))),
      h("section", { class: "matchbox" },
        h("div", null, h("span", { class: "big" }, m.score + "%"), " התאמה לפרופיל שלך"),
        m.pros.length ? h("ul", { class: "sec" }, m.pros.map(t => h("li", null, t))) : null,
        m.gaps.length ? h("ul", { class: "sec gaps" }, m.gaps.map(t => h("li", null, t))) : null),
      section("מה החברה מוכרת", str(job.sells)),
      section("על החברה", str(job.about)),
      section("מה המשרה דורשת", arr(job.requires)),
      section("שכר ורכב", str(job.comp)),
      section("שאלות שכדאי לשאול בראיון", arr(job.ask)),
      section("איך מגישים", str(job.applyHow)),
      url && h("div", { class: "actions" }, h("a", { class: "btn primary", href: url, target: "_blank", rel: "noopener" }, "למודעה ולהגשה")),
      h("section", { class: "sec" }, h("h3", null, "המעקב שלך"),
        h("div", { class: "actions" }, Object.entries(MARKS).map(([s, label]) => h("button", { class: "btn", "aria-pressed": String(mark.status === s), on: { click: () => setMark(s) } }, label))), hint),
      h("section", { class: "sec" }, h("h3", null, "הערות שלך"), notes)));
  }

  // ---------- routing ----------
  let lastRoute = null;
  function route() {
    if (!CFG.url || !CFG.anonKey) { app.replaceChildren(h("div", { class: "empty" }, h("strong", null, "האפליקציה עדיין בהקמה"), "החיבור למסד הנתונים לא הוגדר.")); return; }
    const hash = location.hash, typing = document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName);
    if (!profile || hash === "#profile") { if (!(typing && draft)) renderOnboarding(); }
    else {
      draft = null;
      const m = /^#job-([\w-]+)$/.exec(hash);
      if (m) { if (!typing) renderJob(m[1]); } else renderList();
    }
    if (lastRoute !== hash) { scrollTo(0, 0); lastRoute = hash; }
  }
  addEventListener("hashchange", route);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && CFG.url) loadAll(); }); // picks up new jobs whenever the app is reopened
  setInterval(() => { if (!document.hidden && CFG.url) loadAll(); }, 5 * 60 * 1000);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  route();
  if (CFG.url && CFG.anonKey) loadAll();
})();
