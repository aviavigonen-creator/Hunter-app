// CV reading on the phone: pulls the text out of a PDF / Word / text file, and a simple keyword
// analysis used when the AI analysis is not available.
(function (root) {
  const LIBS = {
    pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    pdfWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
    mammoth: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"
  };
  const loaded = {};
  function loadScript(src) {
    return loaded[src] || (loaded[src] = new Promise((ok, fail) => {
      const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => { delete loaded[src]; fail(new Error("load")); };
      document.head.append(s);
    }));
  }
  async function extractText(file) {
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      await loadScript(LIBS.pdf);
      root.pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
      const doc = await root.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        let line = "", out = "";
        for (const it of content.items) { line += it.str; if (it.hasEOL) { out += line + "\n"; line = ""; } else line += " "; }
        pages.push(out + line);
      }
      return pages.join("\n");
    }
    if (name.endsWith(".docx")) {
      await loadScript(LIBS.mammoth);
      return (await root.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
    }
    if (name.endsWith(".txt") || file.type === "text/plain") return file.text();
    throw new Error("type");
  }

  const FUNCTION_WORDS = {
    "מכירות": /מכירות|סוכן|sales|account executive/i, "פיתוח עסקי": /פיתוח עסקי|business development|\bSDR\b|\bBDR\b/i,
    "שיווק": /שיווק|marketing|קמפיינ|סושיאל/i, "שירות ותמיכת לקוחות": /שירות לקוחות|תמיכה טכנית|מוקד|customer support|helpdesk/i,
    "הצלחת לקוחות": /customer success|הצלחת לקוחות/i, "פיתוח תוכנה": /מפתח|פיתוח תוכנה|developer|software engineer|full ?stack|backend|frontend/i,
    "QA ובדיקות": /\bQA\b|בדיקות תוכנה|בודק תוכנה|automation/i, "מוצר": /מנהל(ת)? מוצר|product manager/i, "עיצוב": /מעצב|\bUX\b|\bUI\b|עיצוב גרפי/i,
    "דאטה ואנליזה": /אנליסט|data analyst|\bSQL\b|\bBI\b|דאטה/i, "IT ותשתיות": /system admin|סיסטם|DevOps|תשתיות|רשתות תקשורת/i, "סייבר": /סייבר|אבטחת מידע|cyber|SOC/i,
    "כספים": /הנהלת חשבונות|רואה חשבון|חשב|כספים|finance/i, "משאבי אנוש": /משאבי אנוש|גיוס עובדים|\bHR\b|recruit/i,
    "תפעול ולוגיסטיקה": /לוגיסטי|תפעול|מחסן|שרשרת אספקה|רכש/i, "ניהול פרויקטים": /ניהול פרויקט|מנהל(ת)? פרויקט|project manager/i,
    "אדמיניסטרציה": /מזכיר|אדמיניסטר|מנהל(ת)? משרד|back ?office/i, "משפטים": /עורך דין|עו"ד|משפט/i, "הנדסה": /מהנדס|הנדסאי|engineer/i, "הדרכה": /הדרכה|מדריך|הכשרה|training/i
  };
  const SECTOR_WORDS = {
    "תוכנה ואינטרנט": /SaaS|תוכנה|סטארט ?אפ|startup/i, "תקשורת": /סלולר|תקשורת|סלקום|פרטנר|בזק|הוט|Samsung|סמסונג/i, "פיננסים ותשלומים": /בנק|אשראי|סליקה|פינטק|fintech/i,
    "ביטוח": /ביטוח/i, "קמעונאות": /קמעונא|חנויות|רשתות שיווק|נקודות מכירה/i, "מזון ומשקאות": /מזון|משקאות|מסעד/i, "אבטחה ומיגון": /מיגון|אבטחה|אזעק/i,
    "בריאות": /רפוא|מרפא|בית חולים|תרופ|מדיקל/i, "רכב ואנרגיה": /רכב|ליסינג|אנרגיה|דלק/i, "תעשייה וייצור": /ייצור|מפעל|תעשיי/i, "נדל\"ן": /נדל"ן|תיווך/i, "חינוך": /חינוך|הוראה|מורה/i
  };
  const CITIES = { "ירושלים": /ירושלים|מבשרת|בית שמש|מעלה אדומים|Jerusalem|Mevaseret/i, "מרכז": /תל אביב|רמת גן|גבעתיים|חולון|בת ים|פתח תקו|בני ברק|ראשון לציון|ראש העין|אור יהודה|Tel Aviv|Ramat Gan|Petah Tikva|Holon|Rishon/i, "שרון": /הרצליה|רעננה|כפר סבא|נתניה|הוד השרון|רמת השרון/,
    "שפלה": /רחובות|נס ציונה|מודיעין|רמלה|לוד|יבנה|אשדוד/, "צפון": /חיפה|קריות|קרית|עכו|נהריה|כרמיאל|טבריה|עפולה|נצרת|חדרה|Haifa/i, "דרום": /באר שבע|אשקלון|אילת|דימונה|קרית גת|נתיבות|שדרות/ };

  function analyzeLocal(raw) {
    const text = raw.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ""); // direction marks that PDFs add around Hebrew
    const p = { functions: [], sectors: [], regions: [], kinds: [], modes: [] };
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    const first = lines[0] || "";
    if (first && first.split(/\s+/).length <= 4 && !/[\d@:]/.test(first)) p.name = first.split(/\s+/)[0];
    // years: span of the dated periods found; shown to the user as an estimate to correct
    const now = new Date().getFullYear(), years = [];
    const STUDY = /תיכון|בגרות|שנות לימוד|קורס|מכללה|אוניברסיט|תואר|high school|diploma|course|college|university|degree/i;
    for (const line of lines) {
      if (STUDY.test(line)) continue; // study periods are not work experience
      for (const m of line.matchAll(/((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2}|היום|כיום|present|now)/gi)) {
        const a = Number(m[1]), b = /^\d/.test(m[2]) ? Number(m[2]) : now;
        if (a >= 1970 && a <= now && b <= now + 1) years.push(Math.min(a, b), Math.max(a, b));
      }
    }
    if (years.length) p.years = Math.max(0, Math.min(40, Math.max(...years) - Math.min(...years)));
    const scored = Object.entries(FUNCTION_WORDS).map(([f, re]) => [f, (text.match(new RegExp(re.source, "gi")) || []).length]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    // keep only fields that clearly stand out: a word or two in passing is not a profession
    const top = scored.length ? scored[0][1] : 0;
    p.functions = scored.filter(x => x[1] >= Math.max(2, top * 0.35)).slice(0, 3).map(x => x[0]);
    if (!p.functions.length && scored.length) p.functions = [scored[0][0]];
    p.sectors = Object.entries(SECTOR_WORDS).filter(([, re]) => re.test(text)).map(x => x[0]).slice(0, 5);
    p.regions = Object.entries(CITIES).filter(([, re]) => re.test(lines.slice(0, 12).join(" "))).map(x => x[0]).slice(0, 2);
    if (/מכירות שטח|סוכן שטח|field sales/i.test(text)) p.kinds.push("field");
    if (/מכירה טלפונית|מכירות טלפוני|טלמרקטינג|inside sales/i.test(text)) p.kinds.push("phone");
    if (/תיקי לקוחות|account manag|ניהול לקוחות/i.test(text)) p.kinds.push("accounts");
    if (/מכירת תוכנה|מכירות תוכנה|SaaS/i.test(text)) p.kinds.push("software");
    p.management = /ניהול צוות|מנהל(ת)? צוות|ראש צוות|אחראי(ת)? צוות|team lead/i.test(text);
    // the language level is usually stated right after the word; take the highest level found near any mention
    const en = [...text.matchAll(/(?:אנגלית|english)\s*(?:[:\-–]\s*|ברמה\s+|רמה\s+|level\s+|(?=שפת אם|שוטפת|fluent|native))[^\n,|.]{0,25}/gi)].map(m => m[0]);
    if (en.length) p.english = en.some(t => /שפת אם|שוטפ|fluent|native/i.test(t)) ? "fluent" : en.some(t => /גבוה|טובה|מצוי|high|good|proficien/i.test(t)) ? "good" : "basic";
    p.degree = /תואר ראשון|תואר שני|בוגר(ת)? אוניברסיט/.test(text) || /bachelor|master's degree|university degree/i.test(text) || /\bB\.?A\.?\b|\bB\.?Sc\b|\bM\.?A\.?\b|\bMBA\b|\bLL\.?B\b/.test(text);
    return p;
  }

  root.HunterCV = { extractText, analyzeLocal };
  if (typeof module !== "undefined") module.exports = { analyzeLocal };
})(typeof window !== "undefined" ? window : globalThis);
