// Hunter: standalone phone app. Talks to Supabase over plain REST (auth + database), no libraries.
(() => {
  const CFG = window.HUNTER_CONFIG || {};
  const app = document.getElementById("app");
  const store = {
    get(k, d) { try { const v = localStorage.getItem("hunter-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("hunter-" + k, JSON.stringify(v)); } catch (e) {} }
  };
  let session = store.get("session", null), profile = store.get("profile", null);
  let jobs = [], jobsUpdated = "", marks = {}, loadError = "", loaded = false, filter = "fit", query = "", fnFilter = "", regionFilter = "", shownCount = 40;
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
    // Jobs: one file rebuilt every day by the job collector. The hour stamp gets past caches without refetching on every open.
    try {
      const res = await fetch("jobs.json?h=" + Math.floor(Date.now() / 3600000));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const file = await res.json();
      jobs = file.jobs || []; jobsUpdated = file.updated || "";
      loaded = true; loadError = "";
      if (profile && profile.functions) store.set("seen", jobs.map(x => x.id));
    } catch (e) { loadError = navigator.onLine === false ? "אין חיבור לאינטרנט. המשרות יתעדכנו כשהחיבור יחזור." : "לא הצלחנו לטעון את המשרות. נסה שוב בעוד רגע."; }
    route();
    // Personal data: saved marks, and the profile when this phone does not have it yet
    try {
      await ensureSession();
      const [m, p] = await Promise.all([call("/rest/v1/user_jobs?select=job_id,status,notes"), profile ? null : call("/rest/v1/profiles?select=data")]);
      marks = Object.fromEntries((m || []).map(r => [r.job_id, r]));
      if (!profile && p && p[0]) { profile = p[0].data; store.set("profile", profile); }
      route();
    } catch (e) { /* the list still works without it */ }
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
  const TAX = window.HunterTax, same = list => list.map(x => [x, x]);
  const isSales = d => arr(d.functions).some(f => f === "מכירות" || f === "פיתוח עסקי");
  const STEPS = [
    { title: "נעים להכיר", lead: "", qs: [
      { key: "name", label: "איך קוראים לך?", type: "text", placeholder: "שם פרטי" },
      { key: "functions", label: "באילו תחומים אתה מחפש עבודה?", type: "many", opts: same(TAX.functions) } ] },
    { title: "הניסיון שלך", lead: "", qs: [
      { key: "years", label: "כמה שנות ניסיון יש לך בתחום?", type: "one", opts: [["0", "בלי ניסיון"], ["1", "שנה עד שנתיים"], ["3", "3 עד 5"], ["6", "6 עד 10"], ["11", "יותר מ-10"]] },
      { key: "management", label: "ניהלת צוות?", type: "one", opts: [["yes", "כן"], ["no", "לא"]] },
      { key: "kinds", label: "באילו סוגי מכירות עבדת?", type: "many", optional: true, when: isSales, opts: TAX.salesKinds },
      { key: "sectors", label: "אילו ענפים אתה מכיר?", type: "many", optional: true, opts: same(TAX.sectors) } ] },
    { title: "איפה ואיך", lead: "אפשר לבחור כמה תשובות.", qs: [
      { key: "regions", label: "באילו אזורים מתאים לך לעבוד?", type: "many", opts: same(TAX.regions) },
      { key: "modes", label: "איזה אופי עבודה מתאים לך?", type: "many", opts: same(TAX.modes) } ] },
    { title: "תנאים", lead: "", qs: [
      { key: "minPay", label: "מה השכר החודשי שאתה מכוון אליו?", type: "one", opts: [["0", "פתוח"], ["12000", "12 אלף ₪ ומעלה"], ["18000", "18 אלף ₪ ומעלה"], ["25000", "25 אלף ₪ ומעלה"], ["30000", "30 אלף ₪ ומעלה"]] },
      { key: "wantsCar", label: "חשוב לך רכב צמוד?", type: "one", opts: [["yes", "כן"], ["no", "לא חובה"]] } ] },
    { title: "עוד שני פרטים", lead: "", qs: [
      { key: "english", label: "מה רמת האנגלית שלך?", type: "one", opts: [["basic", "בסיסית"], ["good", "טובה"], ["fluent", "שוטפת"]] },
      { key: "degree", label: "יש לך תואר אקדמי?", type: "one", opts: [["yes", "כן"], ["no", "לא"]] } ] }
  ];
  const YEAR_BUCKETS = [11, 6, 3, 1, 0];
  const bucket = y => str(YEAR_BUCKETS.find(b => (Number(y) || 0) >= b));
  const yn = v => (v === true ? "yes" : v === false ? "no" : undefined);
  let draft = null, step = -1, cvNote = "";
  function toDraft(p) {
    const d = { functions: [], kinds: [], sectors: [], regions: [], modes: [] };
    if (!p) return d;
    return { ...d, ...p, years: bucket(p.years), minPay: str(p.minPay || 0), wantsCar: yn(!!p.wantsCar), degree: yn(!!p.degree), management: yn(!!p.management || arr(p.kinds).includes("team")) };
  }
  function fromDraft(d) {
    return { ...d, kinds: isSales(d) ? arr(d.kinds).filter(k => k !== "team") : [], name: str(d.name).trim().slice(0, 40), years: Number(d.years) || 0, minPay: Number(d.minPay) || 0,
      wantsCar: d.wantsCar === "yes", degree: d.degree === "yes", management: d.management === "yes" };
  }
  const shown = s => s.qs.filter(q => !q.when || q.when(draft));
  function stepDone(s) { return shown(s).every(q => q.optional || (q.type === "many" ? arr(draft[q.key]).length : str(draft[q.key]).trim())); }

  // Fills the questionnaire from what the CV analysis found. Only known values are taken; the user confirms every step.
  function applyCv(found) {
    const pick = (list, allowed) => arr(list).filter(x => allowed.includes(x));
    if (str(found.name).trim()) draft.name = str(found.name).trim().slice(0, 40);
    const f = pick(found.functions, TAX.functions); if (f.length) draft.functions = f;
    const sec = pick(found.sectors, TAX.sectors); if (sec.length) draft.sectors = sec;
    const reg = pick(found.regions, TAX.regions); if (reg.length) draft.regions = reg;
    const k = pick(found.kinds, TAX.salesKinds.map(x => x[0])); if (k.length) draft.kinds = k;
    if (found.years != null && !isNaN(Number(found.years))) draft.years = bucket(found.years);
    if (typeof found.management === "boolean") draft.management = yn(found.management);
    if (typeof found.degree === "boolean") draft.degree = yn(found.degree);
    if (["basic", "good", "fluent"].includes(found.english)) draft.english = found.english;
  }
  async function analyzeCv(file, say) {
    say("קורא את הקובץ…");
    let text;
    try { text = (await HunterCV.extractText(file)).trim(); }
    catch (e) { throw new Error(e.message === "type" ? "אפשר להעלות קובץ PDF, Word (docx) או טקסט." : "לא הצלחנו לקרוא את הקובץ. נסה קובץ אחר, או מלא את הפרטים לבד."); }
    if (text.length < 200) throw new Error("לא מצאנו טקסט בקובץ. ייתכן שהוא סרוק כתמונה. נסה קובץ אחר, או מלא את הפרטים לבד.");
    if (text.length > 40000) throw new Error("הקובץ ארוך מדי לניתוח. נסה גרסה קצרה יותר של קורות החיים.");
    say("מנתח את קורות החיים…");
    try { await ensureSession(); return { found: await call("/functions/v1/analyze-cv", { method: "POST", body: { text } }), source: "ai" }; }
    catch (e) { return { found: HunterCV.analyzeLocal(text), source: "local" }; }
  }
  function renderCvStep() {
    const status = h("p", { class: "hint", "aria-live": "polite" });
    const input = h("input", { type: "file", id: "cv-file", accept: ".pdf,.docx,.txt,application/pdf,text/plain", hidden: "" });
    const pickBtn = h("button", { class: "btn primary", on: { click: () => input.click() } }, "העלאת קורות חיים");
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0]; if (!file) return;
      pickBtn.disabled = true;
      try {
        const { found, source } = await analyzeCv(file, t => { status.textContent = t; });
        applyCv(found);
        cvNote = source === "ai" ? "מילאנו את הפרטים לפי קורות החיים שלך. בדוק ותקן מה שצריך."
          : "מילאנו את מה שהצלחנו לזהות בקורות החיים. זה זיהוי בסיסי, אז כדאי לעבור ולתקן.";
        step = 0; renderOnboarding(); scrollTo(0, 0);
      } catch (e) { status.textContent = e.message; pickBtn.disabled = false; input.value = ""; }
    });
    app.replaceChildren(h("section", { class: "step" },
      h("div", { class: "sec" }, h("h1", { class: "brand" }, "Hunter"), h("h2", null, "נמצא לך את המשרות שהכי מתאימות לך")),
      h("p", null, "העלה קורות חיים ונמלא את הפרטים בשבילך. אפשר גם לדלג ולענות על כמה שאלות קצרות."),
      h("div", { class: "actions" }, pickBtn, h("button", { class: "btn", on: { click: () => { step = 0; renderOnboarding(); } } }, "דלג, אמלא לבד"), input),
      status,
      h("p", { class: "hint" }, "הקובץ נקרא בטלפון שלך ולא נשמר. הטקסט שלו נשלח לניתוח אוטומטי, ורק התשובות שתאשר נשמרות בפרופיל."),
      profile && profile.functions ? h("div", { class: "nav" }, h("button", { class: "btn", on: { click: () => { draft = null; location.hash = ""; route(); } } }, "ביטול")) : null));
  }

  function renderOnboarding() {
    if (!draft) { draft = toDraft(profile); step = -1; cvNote = ""; }
    if (step < 0) return renderCvStep();
    const s = STEPS[step], last = step === STEPS.length - 1;
    const hint = h("p", { class: "hint", "aria-live": "polite" });
    const next = h("button", { class: "btn primary", on: { click: async () => {
      if (!stepDone(s)) { hint.textContent = "צריך לענות על כל השאלות כדי להמשיך."; return; }
      if (!last) { step++; renderOnboarding(); scrollTo(0, 0); return; }
      next.disabled = true; hint.textContent = "שומר…";
      try { await saveProfile(fromDraft(draft)); } catch (e) { /* kept on this phone; it is sent again on the next save */ }
      draft = null; store.set("seen", jobs.map(x => x.id)); location.hash = ""; route(); scrollTo(0, 0);
    } } }, last ? "הצג לי משרות" : "המשך");
    const qEls = shown(s).map(q => {
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
      return h("div", { class: "q" }, h("div", { class: "qt" }, q.label + (q.optional ? " (לא חובה)" : "")), group);
    });
    app.replaceChildren(h("section", { class: "step" },
      h("div", { class: "progress", role: "progressbar", "aria-valuemin": "1", "aria-valuemax": String(STEPS.length), "aria-valuenow": String(step + 1) }, h("i", { style: "width:" + ((step + 1) / STEPS.length * 100) + "%" })),
      h("div", { class: "sec" }, h("h2", null, s.title), s.lead && h("p", { class: "sub" }, s.lead)),
      cvNote && h("p", { class: "notice" }, cvNote),
      ...qEls, hint,
      h("div", { class: "nav" }, h("button", { class: "btn", on: { click: () => { step--; renderOnboarding(); scrollTo(0, 0); } } }, "חזרה"), next)));
  }

  // ---------- list ----------
  const MARKS = { saved: "שמרתי", applied: "הגשתי", interview: "ראיון", skipped: "לא רלוונטית" };
  const FILTERS = [["fit", "הכי מתאימות"], ["new", "חדשות"], ["saved", "שמרתי"], ["applied", "הגשתי"], ["all", "הכול"]];
  const scored = () => jobs.map(j => ({ job: j, m: HunterMatch.match(j, profile), mark: (marks[j.id] || {}).status || "", isNew: !!seenBefore && !seenBefore.includes(j.id) }))
    .sort((a, b) => b.m.score - a.m.score);

  function renderList() {
    const all = scored(), newCount = all.filter(x => x.isNew).length;
    const fnCounts = {}; for (const x of all) { const f = x.job.function || "מכירות"; fnCounts[f] = (fnCounts[f] || 0) + 1; }
    const results = h("div", { id: "results" });
    const paint = () => {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const searching = words.length || fnFilter || regionFilter;
      let items = all;
      if (filter === "fit") items = items.filter(x => x.mark !== "skipped" && (searching || x.m.score >= 50));
      else if (filter === "new") items = items.filter(x => x.isNew);
      else if (filter === "saved") items = items.filter(x => x.mark === "saved");
      else if (filter === "applied") items = items.filter(x => x.mark === "applied" || x.mark === "interview");
      if (fnFilter) items = items.filter(x => (x.job.function || "מכירות") === fnFilter);
      if (regionFilter) items = items.filter(x => arr(x.job.regions).includes(regionFilter) || arr(x.job.regions).includes("ארצי"));
      if (words.length) items = items.filter(x => { const hay = [x.job.role, x.job.company, x.job.location, x.job.function, x.job.desc].map(str).join(" ").toLowerCase(); return words.every(w => hay.includes(w)); });
      const page = items.slice(0, shownCount);
      results.replaceChildren(
        loaded && jobs.length ? h("p", { class: "hint" }, items.length === 1 ? "נמצאה משרה אחת" : "נמצאו " + items.length.toLocaleString("he-IL") + " משרות") : null,
        ...page.map(({ job, m, mark, isNew }) =>
          h("button", { class: "row", on: { click: () => { location.hash = "#job-" + job.id; } } },
            h("span", { class: "co", dir: "auto" }, str(job.company)),
            h("span", { class: "score" + (m.score < 50 ? " low" : "") }, m.score + "%"),
            h("span", { class: "role", dir: "auto" }, [str(job.role), str(job.location)].filter(Boolean).join(" · ")),
            h("span", { class: "why" }, m.pros[0] || m.gaps[0] || ""),
            (isNew || mark) && h("span", { class: "tags" }, isNew && h("span", { class: "pill new" }, "חדשה"), mark && h("span", { class: "pill " + (mark === "skipped" ? "" : mark === "interview" ? "good" : "on") }, MARKS[mark])))),
        items.length > page.length ? h("div", { class: "actions", style: "justify-content:center;margin-top:14px" }, h("button", { class: "btn", on: { click: () => { shownCount += 40; paint(); } } }, "הצג עוד משרות")) : null,
        !items.length ? h("div", { class: "empty" }, !loaded && !loadError ? h("strong", null, "טוען את המשרות…")
          : !jobs.length ? [h("strong", null, "עדיין אין משרות"), "משרות חדשות מתווספות כל יום. כדאי לחזור מחר."]
          : searching ? [h("strong", null, "לא נמצאו משרות לחיפוש הזה"), "נסה מילה אחרת, או נקה את הסינון."]
          : filter === "fit" && !jobs.some(j => arr(profile.functions).includes(j.function || "מכירות")) ? [h("strong", null, "עדיין אין משרות בתחומים שבחרת"), "משרות חדשות מתווספות כל יום. בינתיים אפשר לחפש בכל המשרות בלשונית \"הכול\"."]
          : filter === "fit" ? [h("strong", null, "לא מצאנו כרגע משרה שמתאימה לפרופיל שלך"), "אפשר לחפש בכל המשרות בלשונית \"הכול\", או לעדכן את הפרופיל."]
          : [h("strong", null, "אין כאן משרות כרגע")]) : null);
    };
    const search = h("input", { type: "search", id: "q", placeholder: "חיפוש: תפקיד, חברה או עיר", autocomplete: "off", enterkeyhint: "search", "aria-label": "חיפוש משרות" });
    search.value = query; search.addEventListener("input", () => { query = search.value; shownCount = 40; paint(); });
    const select = (id, label, value, opts, set) => {
      const el = h("select", { id, "aria-label": label }, h("option", { value: "" }, label), opts.map(([v, t]) => h("option", { value: v }, t)));
      el.value = value; el.addEventListener("change", () => { set(el.value); shownCount = 40; paint(); }); return el;
    };
    const fnOpts = Object.entries(fnCounts).sort((a, b) => b[1] - a[1]).map(([f, n]) => [f, f + " (" + n + ")"]);
    app.replaceChildren(
      h("header", { class: "top" },
        h("div", { class: "toprow" },
          h("div", null, h("h1", { class: "brand" }, "Hunter"), h("p", { class: "sub" }, loaded ? jobs.length.toLocaleString("he-IL") + " משרות פתוחות" + (jobsUpdated ? " · עודכן " + new Date(jobsUpdated).toLocaleDateString("he-IL") : "") : "משרות שמתאימות לך")),
          h("button", { class: "textbtn", on: { click: () => { location.hash = "#profile"; } } }, "הפרופיל שלי")),
        search,
        h("div", { class: "selects" }, select("f-fn", "כל התחומים", fnFilter, fnOpts, v => { fnFilter = v; }), select("f-region", "כל האזורים", regionFilter, TAX.regions.map(r => [r, r]), v => { regionFilter = v; })),
        newCount > 0 && h("p", { class: "notice" }, newCount === 1 ? "משרה חדשה אחת נוספה מאז הביקור הקודם שלך." : newCount + " משרות חדשות נוספו מאז הביקור הקודם שלך."),
        h("div", { class: "chips", role: "group", "aria-label": "סינון" }, FILTERS.map(([k, label]) =>
          h("button", { class: "chip", "aria-pressed": String(filter === k), on: { click: () => { filter = k; shownCount = 40; renderList(); } } }, label)))),
      loadError && h("p", { class: "notice", style: "margin-top:12px" }, loadError),
      results);
    paint();
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
      h("div", { class: "sec" }, h("h2", { dir: "auto" }, str(job.company)), h("p", { class: "sub", dir: "auto" }, [str(job.role), str(job.location)].filter(Boolean).join(" · "))),
      h("section", { class: "matchbox" },
        h("div", null, h("span", { class: "big" }, m.score + "%"), " התאמה לפרופיל שלך"),
        m.pros.length ? h("ul", { class: "sec" }, m.pros.map(t => h("li", null, t))) : null,
        m.gaps.length ? h("ul", { class: "sec gaps" }, m.gaps.map(t => h("li", null, t))) : null),
      job.auto && str(job.desc) && h("section", { class: "sec" }, h("h3", null, "מתוך המודעה"), h("p", { dir: "auto", class: "pre" }, str(job.desc))),
      section("מה החברה מוכרת", str(job.sells)),
      section("על החברה", str(job.about)),
      section("מה המשרה דורשת", arr(job.requires)),
      section("שכר ורכב", str(job.comp)),
      section("שאלות שכדאי לשאול בראיון", arr(job.ask)),
      section("איך מגישים", str(job.applyHow)),
      url && h("div", { class: "actions" }, h("a", { class: "btn primary", href: url, target: "_blank", rel: "noopener" }, job.auto ? "למודעה המלאה ולהגשה" : "למודעה ולהגשה")),
      job.auto && h("p", { class: "hint" }, "הפרטים נאספו אוטומטית מאתר הקריירה של החברה" + (job.foundOn ? ", עדכון אחרון " + new Date(job.foundOn).toLocaleDateString("he-IL") : "") + ". ההתאמה מחושבת לפי כותרת המשרה והטקסט שלה, ולכן כדאי לקרוא את המודעה המלאה."),
      h("section", { class: "sec" }, h("h3", null, "המעקב שלך"),
        h("div", { class: "actions" }, Object.entries(MARKS).map(([s, label]) => h("button", { class: "btn", "aria-pressed": String(mark.status === s), on: { click: () => setMark(s) } }, label))), hint),
      h("section", { class: "sec" }, h("h3", null, "הערות שלך"), notes)));
  }

  // ---------- routing ----------
  let lastRoute = null;
  function route() {
    if (!CFG.url || !CFG.anonKey) { app.replaceChildren(h("div", { class: "empty" }, h("strong", null, "האפליקציה עדיין בהקמה"), "החיבור למסד הנתונים לא הוגדר.")); return; }
    const hash = location.hash, typing = document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName);
    if (!profile || !profile.functions || hash === "#profile") { if (!(typing && draft)) renderOnboarding(); }
    else {
      draft = null;
      const m = /^#job-([\w-]+)$/.exec(hash);
      if (m) { if (!typing) renderJob(m[1]); } else if (!(typing && document.activeElement.id === "q")) renderList();
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
