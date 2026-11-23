// Shared lists: job functions, industries, regions. Modelled on the filters LinkedIn uses
// (job function, industry, workplace type, experience). Keep in sync with supabase/functions/analyze-cv/index.ts.
(function (root) {
  const T = {
    functions: ["מכירות", "פיתוח עסקי", "שיווק", "שירות ותמיכת לקוחות", "הצלחת לקוחות", "פיתוח תוכנה", "QA ובדיקות", "מוצר", "עיצוב", "דאטה ואנליזה", "IT ותשתיות", "סייבר", "כספים", "משאבי אנוש", "תפעול ולוגיסטיקה", "ניהול פרויקטים", "אדמיניסטרציה", "משפטים", "הנדסה", "הדרכה"],
    sectors: ["תוכנה ואינטרנט", "תקשורת", "פיננסים ותשלומים", "ביטוח", "קמעונאות", "מזון ומשקאות", "אבטחה ומיגון", "בריאות", "רכב ואנרגיה", "תעשייה וייצור", "נדל\"ן", "חינוך"],
    regions: ["ירושלים", "מרכז", "שרון", "שפלה", "צפון", "דרום"],
    modes: ["משרד", "היברידי", "מהבית", "שטח"],
    salesKinds: [["field", "מכירות שטח"], ["phone", "מכירות טלפוניות"], ["accounts", "ניהול תיקי לקוחות"], ["software", "מכירת תוכנה"]]
  };
  root.HunterTax = T;
  if (typeof module !== "undefined") module.exports = T;
})(typeof window !== "undefined" ? window : globalThis);
