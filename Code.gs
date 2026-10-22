/**
 * MM26 MHD - сервер для приложения mm26-karte (Google Apps Script, привязан к Google-таблице).
 *
 * Лист "MHD": одна строка = одна отметка срока годности на полке.
 * Приложение шлёт сюда записи (POST) и читает активный список (GET).
 * Доступ - только с секретным ключом (Свойства скрипта -> SECRET), его же один раз вводят в приложении.
 */

const BLATT = "MHD";
const KOPF = ["ID", "Отмечено", "Артикул", "EAN", "Название", "MHD", "Кол-во", "Статус", "Статус изменён", "Комментарий"];
const STATUS_AKTIV = "активен";

function secretOk_(s) {
  const soll = PropertiesService.getScriptProperties().getProperty("SECRET");
  return soll && String(s || "") === soll;
}

function blatt_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(BLATT);
  if (!sh) {
    sh = ss.insertSheet(BLATT);
    sh.appendRow(KOPF);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, KOPF.length).setFontWeight("bold").setBackground("#D9E1F2");
    sh.getRange("F:F").setNumberFormat("dd.MM.yyyy");
    sh.getRange("B:B").setNumberFormat("dd.MM.yyyy HH:mm");
    sh.getRange("I:I").setNumberFormat("dd.MM.yyyy HH:mm");
  }
  return sh;
}

function antwort_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function datum_(s) {               // "2026-10-25" -> Date
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

function iso_(d) {
  if (!(d instanceof Date)) return String(d || "");
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

/** GET ?secret=...&action=list  -> активные записи (и закрытые за 14 дней) */
function doGet(e) {
  const p = e.parameter || {};
  if (!secretOk_(p.secret)) return antwort_({ ok: false, fehler: "ключ" });
  const sh = blatt_();
  const werte = sh.getDataRange().getValues();
  const grenze = new Date(Date.now() - 14 * 86400000);
  const liste = [];
  for (let i = 1; i < werte.length; i++) {
    const r = werte[i];
    if (!r[0]) continue;
    const aktiv = r[7] === STATUS_AKTIV;
    if (!aktiv && !(r[8] instanceof Date && r[8] > grenze)) continue;
    liste.push({ id: r[0], erfasst: r[1] instanceof Date ? r[1].toISOString() : r[1], art: String(r[2]), ean: String(r[3] || ""),
      name: r[4], mhd: iso_(r[5]), menge: r[6], status: r[7], kommentar: r[9] || "" });
  }
  return antwort_({ ok: true, liste: liste, stand: new Date().toISOString() });
}

/** POST {secret, action:"add", id, art, ean, name, mhd:"yyyy-mm-dd", menge, kommentar}
 *  POST {secret, action:"status", id, status} */
function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (x) { return antwort_({ ok: false, fehler: "json" }); }
  if (!secretOk_(d.secret)) return antwort_({ ok: false, fehler: "ключ" });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = blatt_();
    if (d.action === "add") {
      const werte = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
      for (let i = 1; i < werte.length; i++) if (werte[i][0] === d.id) return antwort_({ ok: true, doppelt: true });   // повторная отправка
      sh.appendRow([d.id, new Date(), "'" + d.art, "'" + (d.ean || ""), d.name || "", datum_(d.mhd), Number(d.menge) || 1,
        STATUS_AKTIV, "", d.kommentar || ""]);
      return antwort_({ ok: true });
    }
    if (d.action === "status") {
      const werte = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
      for (let i = 1; i < werte.length; i++) {
        if (werte[i][0] === d.id) {
          sh.getRange(i + 1, 8, 1, 2).setValues([[d.status, new Date()]]);
          return antwort_({ ok: true });
        }
      }
      return antwort_({ ok: false, fehler: "нет записи" });
    }
    return antwort_({ ok: false, fehler: "action" });
  } finally {
    lock.releaseLock();
  }
}
