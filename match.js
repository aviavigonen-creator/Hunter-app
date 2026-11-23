// Questionnaire matching: scores one job against one profile and explains the score in Hebrew.
// Used by the app in the browser and by tests in Node.
(function (root) {
  const ENGLISH = { basic: 1, good: 2, fluent: 3 };
  const LEVEL_PAY = { junior: 18000, mid: 32000, senior: 45000 }; // rough ceiling we assume per level; shown as an estimate

  function match(job, p) {
    let score = 30;
    const pros = [], gaps = [];
    const has = (list, v) => Array.isArray(list) && list.includes(v);
    const kinds = p.kinds || [];

    // Where
    const regions = job.regions || [];
    if (has(regions, "ארצי")) { score += 12; pros.push("פריסה ארצית, כולל האזור שלך"); }
    else if ((p.regions || []).some(r => has(regions, r))) { score += 15; pros.push("באזור שבחרת: " + regions.filter(r => has(p.regions, r)).join(", ")); }
    else if (regions.length) { score -= 20; gaps.push("האזור הוא " + regions.join(", ") + ", לא אחד מהאזורים שבחרת"); }

    // How
    const modes = p.modes || [];
    if (modes.length && job.mode) {
      if (has(modes, job.mode)) { score += 8; pros.push("אופי העבודה מתאים: " + job.mode); }
      else { score -= 8; gaps.push("אופי העבודה הוא " + job.mode); }
    }

    // Car
    if (p.wantsCar) {
      if (job.car === "yes") { score += 12; pros.push("רכב צוין במודעה"); }
      else { score -= 6; gaps.push("רכב לא צוין במודעה, צריך לשאול"); }
    }

    // Experience
    const years = Number(p.years) || 0, min = Number(job.minYears) || 0;
    if (years >= min) { score += 10; if (min) pros.push("יש לך את שנות הניסיון הנדרשות (" + min + " ומעלה)"); }
    else { score -= 15; gaps.push("נדרשות " + min + " שנות ניסיון ומעלה"); }

    if (job.needsSoftwareSales && !has(kinds, "software")) { score -= 25; gaps.push("ניסיון במכירת תוכנה הוא דרישת חובה"); }
    if (job.needsManagement) {
      if (has(kinds, "team")) { score += 8; pros.push("יש לך ניסיון ניהולי, כנדרש"); }
      else { score -= 25; gaps.push("ניסיון ניהולי הוא דרישת חובה"); }
    }
    if (job.needsDegree && !p.degree) { score -= 20; gaps.push("תואר הוא דרישת חובה"); }
    if (job.mode === "שטח" && has(kinds, "field")) { score += 6; pros.push("ניסיון במכירות שטח"); }
    if (job.sector && has(p.sectors, job.sector)) { score += 8; pros.push("אתה מכיר את התחום: " + job.sector); }

    // English
    const need = ENGLISH[job.english] || 0, got = ENGLISH[p.english] || 1;
    if (need && got < need) { score -= 12; gaps.push("נדרשת אנגלית ברמה גבוהה יותר"); }

    // Pay: postings rarely state it, so this is our estimate from the seniority of the role
    const minPay = Number(p.minPay) || 0, ceiling = LEVEL_PAY[job.level];
    if (minPay && ceiling) {
      if (ceiling >= minPay) score += 6;
      else { score -= 22; gaps.push("לפי הערכה שלנו השכר כנראה נמוך מהיעד שלך. המודעה לא מציינת שכר"); }
    }

    return { score: Math.max(5, Math.min(98, Math.round(score))), pros, gaps };
  }

  root.HunterMatch = { match };
  if (typeof module !== "undefined") module.exports = { match };
})(typeof window !== "undefined" ? window : globalThis);
