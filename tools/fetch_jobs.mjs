// Builds jobs.json: every open job in Israel from the public careers boards listed in companies.json,
// plus the hand-written jobs in curated.json. Run daily by .github/workflows/jobs.yml. Node 20+, no dependencies.
// Sources are the boards companies publish for candidates (Greenhouse, Lever and Ashby job-board APIs, and the
// public Comeet careers page). LinkedIn is not used.
import fs from "node:fs";

const here = (f) => new URL(f, import.meta.url);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(here(f), "utf8")); } catch { return d; } };
const companies = readJson("./companies.json", {});
const curated = readJson("./curated.json", []);
const OUT = here("../jobs.json");

const IL = /israel|ישראל|tel[ -]?aviv|תל אביב|herzliya|haifa|jerusalem|ra'?anana|petah|petach|netanya|be'?er[ -]?sheva|ramat[ -]?gan|yokne|rehovot|hod hasharon|kfar saba|caesarea|bnei brak|holon|rosh ha|modi'?in|ness ziona|airport city|or yehuda|giv'?atayim|kiryat|migdal|\btlv\b|yavne|ashdod|ashkelon|lod\b|omer\b|nazareth|karmiel|hadera|kfar|ramat|rishon/i;
const REGIONS = [
  ["ירושלים", /jerusalem|ירושלים|mevaseret|beit shemesh|בית שמש/i],
  ["מרכז", /tel[ -]?aviv|תל אביב|\btlv\b|ramat[ -]?gan|רמת גן|giv'?atayim|גבעתיים|petah|petach|פתח תקו|bnei brak|בני ברק|holon|חולון|bat yam|rishon|ראשון|rosh ha|ראש העין|or yehuda|אור יהודה|airport city|kiryat ono|yehud|azor|center|מרכז/i],
  ["שרון", /herzliya|הרצליה|ra'?anana|רעננה|kfar saba|כפר סבא|netanya|נתניה|hod hasharon|הוד השרון|ramat hasharon|sharon|even yehuda|poleg/i],
  ["שפלה", /rehovot|רחובות|ness ziona|נס ציונה|modi'?in|מודיעין|lod\b|לוד|ramla|yavne|יבנה|ashdod|אשדוד|gedera|shoham/i],
  ["צפון", /haifa|חיפה|yokne|יקנעם|caesarea|קיסריה|nazareth|karmiel|hadera|חדרה|tefen|migdal ha|afula|akko|nahariya|kiryat shmona|tiberias|north|צפון|matam/i],
  ["דרום", /be'?er[ -]?sheva|באר שבע|omer\b|ashkelon|אשקלון|eilat|dimona|kiryat gat|sderot|south|דרום/i],
];
// Order matters: the first match wins.
const FUNCTIONS = [
  ["QA ובדיקות", /\bqa\b|quality assurance|test(ing)? engineer|\bsdet\b|automation engineer|test automation|tester|validation engineer|בודק|בדיקות תוכנה/i],
  ["סייבר", /security (research|analyst|engineer|architect|operations|consultant)|\bsoc\b|penetration|pentest|threat|malware|vulnerabilit|incident response|\bciso\b|red team|reverse engineer|cyber|devsecops|\bsecurity\b|סייבר|אבטחת מידע/i],
  ["דאטה סיינס ו-AI", /data scien|machine learning|\bml\b|\bai\b|deep learning|\bnlp\b|computer vision|algorithm|applied scientist|\bllm\b/i],
  ["דאטה ואנליזה", /data (analyst|engineer|architect)|analytics|\bbi\b|business intelligence|analyst|\bdata\b|pricing|actuar|אנליסט/i],
  ["מערכות מידע", /\bsap\b|oracle|netsuite|salesforce (admin|developer|architect)|\bcrm\b|\berp\b|implementer|\bmis\b|priority|information systems|מערכות מידע|מיישם|מנתח.{0,3} מערכות|citrix/i],
  ["הנדסה", /hardware|electrical|mechanical|electronics|\brf\b|fpga|asic|vlsi|\bchip|physical design|verification|optic|process engineer|manufacturing|production|technician|board design|analog|מהנדס|הנדסאי|טכנאי|הנדס|integration specialist|integrator|אלקטרוניקה/i],
  ["IT ותשתיות", /devops|\bsre\b|site reliability|infrastructure|system administrator|sysadmin|\bit\b|network engineer|cloud engineer|platform engineer|\bdba\b|\bnoc\b|finops|release manager|תשתיות|תקשוב|network/i],
  ["תוכן וכתיבה", /technical writer|copywriter|\bwriter\b|\beditor\b|localization|translator|content (writer|editor)/i],
  ["פיתוח תוכנה", /software|developer|backend|back-end|frontend|front-end|full[ -]?stack|programmer|\bios\b|android|embedded|firmware|architect|r&d|engineering (manager|lead|director)|team lead|tech lead|מפתח|פיתוח תוכנה/i],
  ["עיצוב", /designer|\bux\b|\bui\b|design (lead|manager|director)|creative|animator|\bartist\b|illustrator|video editor|מעצב/i],
  ["הצלחת לקוחות", /customer success|\bcsm\b|onboarding|implementation|solutions? (engineer|architect|consultant)|sales engineer|pre[- ]?sales|professional services|technical account|deployment/i],
  ["פיתוח עסקי", /business development|partnership|alliances|channel|bizdev|strategic partner|פיתוח עסקי/i],
  ["מכירות", /sales|account executive|account manager|\bsdr\b|\bbdr\b|inside sales|מכירות|סוכן/i],
  ["שיווק", /marketing|growth|\bseo\b|\bppc\b|content|brand|social media|campaign|user acquisition|community|\bpr\b|communications|media buyer|monetization|שיווק/i],
  ["מוצר", /product (manager|owner|lead|director|analyst|operations|specialist)|product (group|team)|head of product|\bvp product|\bcpo\b|מנהל(ת)? מוצר/i],
  ["בנקאות וביטוח", /בנקאי|בנקאות|השקעו|רכז.{0,3} עסקים|ביטוח|securities|חיתום|underwrit|claims|תביעות|insurance/i],
  ["שירות ותמיכת לקוחות", /support|customer (service|care|experience)|help ?desk|service desk|tier [123]|call center|שירות לקוחות|תמיכה|נציג/i],
  ["כספים", /finance|financial|accountant|accounting|controller|bookkeep|payroll|treasury|fp&a|\btax\b|billing|collection|revenue operations|\bcfo\b|חשב|כספים|הנהלת חשבונות|audit|ביקורת|תקציב|מיסוי|יועצ.{0,3} מס|budget|חשבות|שכר/i],
  ["משאבי אנוש", /\bhr\b|human resources|recruit|talent|people (partner|operations|ops|experience)|sourcer|hrbp|גיוס|משאבי אנוש/i],
  ["רגולציה ואיכות", /regulatory|quality (engineer|manager|control|specialist)|compliance|\bra\b|רגולציה|מבקר.{0,3} איכות|\\bqc\\b|quality inspector|ניהול סיכונים|\\brisk\\b|בקרה/i],
  ["משפטים", /legal|counsel|lawyer|attorney|paralegal|privacy|משפט|עו"ד|עורכ.{0,3} דין/i],
  ["ניהול פרויקטים", /project manager|program manager|\bpmo\b|scrum master|delivery manager|project coordinator|פרויקט/i],
  ["תפעול ולוגיסטיקה", /operations|logistics|supply chain|warehouse|procurement|purchasing|\bbuyer\b|fulfillment|planner|תפעול|לוגיסטיקה|רכש|מחסן|vendor|bizops|demand|מחסנא/i],
  ["אדמיניסטרציה", /office manager|administrative|executive assistant|personal assistant|receptionist|\badmin\b|מזכיר|אדמיניסטר|אדמינ|administrator|עובד.{0,2} משק|אחראי.{0,2} משק/i],
  ["הדרכה", /training|trainer|enablement|instructional|learning|הדרכה|מדריכ|מדריך/i],
  ["ייצור ואחזקה", /חשמלאי|מכונאי|אחזקה|\bcnc\b|כרסם|חרט|עובד.{0,3} ייצור|מחווט|מפעיל|רתך|maintenance|operator|assembler|machinist/i],
  ["בנייה ונדל\"ן", /construction|מנהל.{0,3} עבודה|real estate|נדל"ן|בטיחות|\bhse\b|safety|שלד|חניון/i],
  ["חינוך ורווחה", /עובד.{0,3} סוציאל|רווחה|שליח|donor|fundrais|קהיל|מכינ|עמות|ישובי|social worker|teacher|מורה/i],
  ["ייעוץ", /consult|יועצ|יועץ|advisory|transformation/i],
  ["מחקר ומדע", /research|scientist|chemist|biolog|clinical|laboratory|\blab\b|physicist|מחקר/i],
  ["בריאות ורפואה", /nurse|physician|doctor|medical|pharmac|therap|רופא|אחות/i],
];
const text = (html) => String(html || "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
  .replace(/<(br|\/p|\/li|\/div|\/h\d)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ")
  .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);
const pretty = (slug) => slug.replace(/[-_]/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
const slugId = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

function classify(j) {
  const title = j.role, loc = j.location || "", body = (j.full || "") + "\n" + (j.requires || []).join("\n");
  j.desc = clip(j.full || "", 600); delete j.full;
  const fn = FUNCTIONS.find(([, re]) => re.test(title)) || (/engineer/i.test(title) ? ["פיתוח תוכנה"] : FUNCTIONS.find(([, re]) => re.test(j.dept || "")));
  j.function = fn ? fn[0] : "אחר";
  const remote = /remote/i.test(j.workplace || "") || /\bremote\b|מהבית/i.test(loc);
  const regions = REGIONS.filter(([, re]) => re.test(loc)).map((r) => r[0]);
  j.regions = regions.length ? regions : ["ארצי"];
  j.mode = remote ? "מהבית" : /hybrid|היברידי/i.test((j.workplace || "") + " " + loc + " " + body) ? "היברידי" : "משרד";
  j.level = /intern|student|junior|graduate|entry[- ]level|\bjr\b|סטודנט|ג'וניור|מתחיל/i.test(title) ? "junior"
    : /senior|\bsr\b|\blead\b|principal|staff|head of|director|\bvp\b|chief|architect|expert|team manager|group manager|בכיר|ראש צוות/i.test(title) ? "senior" : "mid";
  const yrs = [...body.matchAll(/(\d{1,2})\s*\+?\s*(?:[-–]\s*\d{1,2}\s*)?\+?\s*(?:years|yrs|שנות|שנים)/gi)].map((m) => Number(m[1])).filter((n) => n > 0 && n <= 15);
  j.minYears = yrs.length ? Math.min(...yrs) : { junior: 0, mid: 2, senior: 5 }[j.level];
  j.needsManagement = /team lead|group lead|director|head of|\bvp\b|team manager|group manager|engineering manager|r&d manager|ראש צוות/i.test(title);
  j.needsSoftwareSales = false; j.needsDegree = false; j.car = "unknown";
  j.english = /[a-z]/i.test(body) && (body.match(/[a-z]/gi) || []).length > (body.match(/[֐-׿]/g) || []).length ? "good" : "none";
  j.sector = "";
  j.auto = true;
  delete j.dept; delete j.remote; delete j.workplace;
  return j;
}

const get = async (url, as = "json") => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; HunterJobs/1.0)" }, signal: AbortSignal.timeout(30000) });
      if (r.ok) return as === "json" ? await r.json() : await r.text();
      if (r.status === 404) return null;
    } catch { /* retry once */ }
  }
  return null;
};
const day = (v) => { const d = new Date(v || Date.now()); return isNaN(d) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10); };

const sources = {
  async greenhouse(slug) {
    const [meta, d] = await Promise.all([get(`https://boards-api.greenhouse.io/v1/boards/${slug}`), get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`)]);
    if (!d?.jobs) return null;
    return d.jobs.filter((j) => IL.test(j.location?.name || "")).map((j) => ({
      id: `gh-${slugId(slug)}-${j.id}`, company: meta?.name || pretty(slug), role: j.title, location: j.location?.name || "", url: j.absolute_url,
      full: text(j.content), dept: (j.departments || []).map((x) => x.name).join(" "), foundOn: day(j.first_published || j.updated_at),
    }));
  },
  async lever(slug) {
    const d = await get(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    if (!Array.isArray(d)) return null;
    return d.filter((j) => IL.test((j.categories?.location || "") + " " + (j.categories?.allLocations || []).join(" "))).map((j) => ({
      id: `lv-${slugId(slug)}-${slugId(j.id)}`, company: pretty(slug), role: j.text, location: j.categories?.location || "", url: j.hostedUrl,
      full: text(j.descriptionPlain || j.description), dept: (j.categories?.team || "") + " " + (j.categories?.department || ""), workplace: j.workplaceType, foundOn: day(j.createdAt),
    }));
  },
  async ashby(slug) {
    const d = await get(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
    if (!d?.jobs) return null;
    return d.jobs.filter((j) => j.isListed !== false && IL.test((j.location || "") + " " + (j.secondaryLocations || []).map((x) => x.location).join(" "))).map((j) => ({
      id: `ab-${slugId(slug)}-${slugId(j.id)}`, company: pretty(slug), role: j.title, location: j.location || "", url: j.jobUrl,
      full: text(j.descriptionPlain || j.descriptionHtml), dept: (j.department || "") + " " + (j.team || ""), remote: !!j.isRemote, workplace: j.workplaceType, foundOn: day(j.publishedAt),
    }));
  },
  // The public careers page lists every open position in the page itself.
  async comeet({ slug, uid }) {
    const html = await get(`https://www.comeet.com/jobs/${slug}/${uid}`, "text");
    const mark = "COMPANY_POSITIONS_DATA = ";
    const at = html ? html.indexOf(mark) : -1;
    if (at < 0) return null;
    let list;
    try { const raw = html.slice(at + mark.length); list = JSON.parse(raw.slice(0, endOfJson(raw))); } catch { return null; }
    return list.filter((p) => !p.is_internal && (p.location?.country === "IL" || IL.test(p.location?.name || ""))).map((p) => {
      const details = p.custom_fields?.details || [];
      const part = (re) => text((details.find((x) => re.test(x.name || "")) || {}).value);
      const req = part(/requirement|דרישות/i).split("\n").map((s) => s.trim()).filter((s) => s.length > 8);
      return {
        id: `cm-${slugId(slug)}-${slugId(p.uid)}`, company: p.company_name || pretty(slug), role: p.name, url: p.url_comeet_hosted_page || p.url_active_page,
        location: [p.location?.city, p.location?.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", "),
        full: part(/description|תיאור/i), requires: req.slice(0, 6).map((s) => clip(s, 160)), dept: p.department || "",
        remote: !!p.location?.is_remote, workplace: p.workplace_type, foundOn: day(p.time_updated),
      };
    });
  },
};
// Finds where the JSON array that starts the string ends (brackets balanced, strings skipped).
function endOfJson(s) {
  let depth = 0, inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === "[" || c === "{") depth++; else if (c === "]" || c === "}") { depth--; if (depth === 0) return i + 1; }
  }
  throw new Error("unterminated");
}

const NOT_A_JOB = /always look|לא מצאת|unsolicited|general application|open application|talent pool|future opportunit|spontaneous|other opportunities|dream position|love to join|למשרות אחרות|יריד תעסוקה/i;
const tasks = [];
for (const kind of Object.keys(sources)) for (const c of companies[kind] || []) tasks.push([kind, c]);
const jobs = [], failed = [];
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < tasks.length) {
    const [kind, c] = tasks[next++];
    const got = await sources[kind](c);
    if (!got) failed.push(`${kind}:${c.slug || c}`); else for (const j of got) if (j.url && j.role && !NOT_A_JOB.test(j.role)) jobs.push(classify(j));
  }
}));

// Hand-written jobs keep their richer text for 30 days, then drop out unless refreshed.
const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
const keep = curated.filter((c) => new Date(c.found_on).getTime() > cutoff).map((c) => ({ id: c.id, foundOn: c.found_on, function: "מכירות", ...c.data }));
const curatedUrls = new Set(keep.map((c) => c.url));
const seen = new Set();
const all = [...keep, ...jobs.filter((j) => !curatedUrls.has(j.url))].filter((j) => (seen.has(j.id) ? false : seen.add(j.id)));

const before = readJson("../jobs.json", { jobs: [] }).jobs.length;
console.log(`${all.length} jobs (${jobs.length} from ${tasks.length - failed.length} boards, ${keep.length} hand-written). Before: ${before}.`);
if (failed.length) console.log("No answer from:", failed.join(", "));
const byFn = {}; for (const j of all) byFn[j.function] = (byFn[j.function] || 0) + 1;
console.log(Object.entries(byFn).sort((a, b) => b[1] - a[1]).map((x) => x.join(": ")).join(" | "));
if (before > 40 && all.length < before * 0.5) { console.error("Far fewer jobs than last time; keeping the previous file."); process.exit(1); }
fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), jobs: all }));
