// Fires the owner's end-of-day report at 11:59 PM Asia/Kolkata, every day —
// no cron dependency needed: a plain setInterval checks the current
// Kolkata time once a minute, and sends the report the one minute it sees
// 23:59. A per-day guard (lastSentDate) stops it firing twice if a check
// happens to land on 23:59 more than once in the same minute window, and
// keeps working correctly across server restarts (it just resumes checking).
const { sendDailyReportEmail, isOwnerNotifyConfigured } = require("./emailService");

let lastSentDate = null; // "YYYY-MM-DD" (Asia/Kolkata) of the last report sent

function getKolkataParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function checkAndSend() {
  if (!isOwnerNotifyConfigured()) return; // silently skip — same gate as per-order emails
  const { dateStr, hour, minute } = getKolkataParts();
  if (hour === 23 && minute === 59 && lastSentDate !== dateStr) {
    lastSentDate = dateStr;
    sendDailyReportEmail().catch((err) => {
      console.error("[email] Unexpected error sending daily report:", err.message);
    });
  }
}

// Starts the once-a-minute check. Call this once from server.js on boot.
function startDailyReportScheduler() {
  checkAndSend(); // in case the server started exactly at 23:59
  setInterval(checkAndSend, 60 * 1000);
  console.log("[email] Daily report scheduler started (fires 11:59 PM Asia/Kolkata daily).");
}

module.exports = { startDailyReportScheduler };
