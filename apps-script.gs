/**
 * Приёмник заявок формы ТЗ — https://tz.fmill.ru/
 *
 * Принимает заявку из формы, собирает PDF и отправляет письма:
 *   • коммерческому отделу — с PDF и файлом заявки во вложении;
 *   • клиенту — подтверждение с PDF, если он оставил почту.
 *
 * PDF собирается через Google Документ, а не прямой конвертацией HTML:
 * так корректно переносятся кириллица и фотографии.
 *
 * Установка — в README.md, раздел «Автоматическая отправка на почту».
 */

// ─── настройки ──────────────────────────────────────────────────────
var MAIL_COMMERCIAL  = 'info@fmill.ru';   // куда падают заявки от клиентов
var MAIL_CORP        = 'info@fmill.ru';   // куда падают утверждённые ФС
var MAIL_TECH        = '';                // технологи, можно оставить пустым
var COMPANY          = 'Фабрика «Мельница»';
var SEND_CLIENT_COPY = true;              // отправлять клиенту подтверждение
var ATTACH_SOURCE    = true;              // прикладывать html-файл заявки
                                          // (нужен, чтобы менеджер мог загрузить
                                          //  его обратно в форму на tz.fmill.ru)
var TZ               = 'Europe/Moscow';
var MAX_PER_HOUR     = 20;                // защита от злоупотребления: адрес
                                          // приёмника виден в исходниках формы,
                                          // поэтому ограничиваем поток заявок
// ────────────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return reply({ ok: false, error: 'пустой запрос' });
    if (!allow_()) return reply({ ok: false, error: 'слишком много заявок за час, попробуйте позже' });

    var p        = JSON.parse(e.postData.contents);
    var client   = p.client || 'без наименования';
    var products = (p.products || []).filter(String);
    var approved = p.approved === true;
    var base     = (p.filename || ('ТЗ_' + client)).replace(/\.html?$/i, '');

    // ── вложения
    var attachments = [];
    var pdf = null;
    try {
      pdf = buildPdf_(p, base);
      attachments.push(pdf);
    } catch (errPdf) {
      // PDF не собрался — письмо всё равно уходит, чтобы заявка не потерялась
      console.error('PDF не собран: ' + errPdf);
    }
    if (ATTACH_SOURCE && p.html) {
      var src = Utilities.newBlob('', 'text/html', base + '.html');
      src.setDataFromString(p.html, 'UTF-8');
      attachments.push(src);
    }

    var rows = [['Клиент', client], ['Изделия', products.length ? products.join(', ') : '—']];
    if (p.manager)     rows.push(['Менеджер', p.manager]);
    if (p.status)      rows.push(['Статус', p.status]);
    if (p.clientEmail) rows.push(['Почта клиента', p.clientEmail]);
    if (!pdf)          rows.push(['Внимание', 'PDF собрать не удалось, см. вложенный html-файл']);

    // ── письмо своим
    var to = approved ? MAIL_CORP : MAIL_COMMERCIAL;
    if (approved && MAIL_TECH) to += ',' + MAIL_TECH;

    MailApp.sendEmail({
      to: to,
      name: COMPANY,
      subject: (approved ? 'ФС утверждено — ' : 'Новое ТЗ на разработку — ') + client,
      htmlBody: card_(
        approved ? 'Техническое задание утверждено' : 'Поступило новое техническое задание',
        rows,
        approved
          ? 'Полное ФС со всеми параметрами и фотографиями — во вложении.'
          : 'PDF во вложении. Чтобы дозаполнить служебный блок, загрузите вложенный html-файл на ' +
            '<a href="https://tz.fmill.ru/">tz.fmill.ru</a> кнопкой «Загрузить заявку клиента».'
      ),
      attachments: attachments
    });

    // ── подтверждение клиенту
    if (SEND_CLIENT_COPY && !approved && isMail_(p.clientEmail)) {
      MailApp.sendEmail({
        to: p.clientEmail,
        name: COMPANY,
        subject: 'Ваше техническое задание принято — ' + COMPANY,
        htmlBody: card_(
          'Спасибо, мы получили ваше техническое задание',
          rows.slice(0, 2),
          'Копия заявки — во вложении. Коммерческий отдел свяжется с вами по указанным контактам. ' +
          'Если нужно что-то дополнить, просто ответьте на это письмо.'
        ),
        attachments: pdf ? [pdf] : []
      });
    }

    log_(p, approved);
    return reply({ ok: true, pdf: !!pdf });

  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

function doGet() {
  return reply({ ok: true, note: 'Приёмник заявок формы ТЗ работает. Заявки принимаются методом POST.' });
}

/* ─── сборка PDF ──────────────────────────────────────────────────── */
function buildPdf_(p, base) {
  var doc = DocumentApp.create('~tz-tmp-' + Date.now());
  var id = doc.getId();
  try {
    var b = doc.getBody();
    b.setMarginTop(40).setMarginBottom(40).setMarginLeft(46).setMarginRight(46);

    b.appendParagraph('Техническое задание на разработку продукции')
      .setHeading(DocumentApp.ParagraphHeading.TITLE);

    var sub = b.appendParagraph(
      (p.client || '') + ' · ' + Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy'));
    sub.setForegroundColor('#586a5e');

    if (p.approved) {
      var st = b.appendParagraph('УТВЕРЖДЕНО' +
        (p.status ? ' · ' + p.status : '') + (p.manager ? ' · ' + p.manager : ''));
      st.setForegroundColor('#02661f').setBold(true);
    }

    (p.flat || []).forEach(function (sec) {
      b.appendParagraph(sec.title).setHeading(DocumentApp.ParagraphHeading.HEADING1);

      var pending = [];                       // копим строки, чтобы вывести таблицей
      var flush = function () {
        if (!pending.length) return;
        var t = b.appendTable(pending);
        t.setBorderColor('#dce6db');
        for (var i = 0; i < t.getNumRows(); i++) {
          var c0 = t.getRow(i).getCell(0);
          c0.setWidth(170);
          c0.editAsText().setForegroundColor('#586a5e');
        }
        pending = [];
      };

      (sec.rows || []).forEach(function (r) {
        if (r.h) { flush(); b.appendParagraph(r.h).setHeading(DocumentApp.ParagraphHeading.HEADING2); return; }
        if (r.photos) {
          flush();
          if (!r.photos.length) return;
          b.appendParagraph(r.label).setBold(true);
          r.photos.forEach(function (src) {
            var img = toBlob_(src);
            if (!img) return;
            try {
              var ins = b.appendImage(img);
              var w = ins.getWidth(), max = 340;
              if (w > max) { ins.setHeight(Math.round(ins.getHeight() * max / w)); ins.setWidth(max); }
            } catch (e) { /* картинка не вставилась — пропускаем */ }
          });
          return;
        }
        pending.push([String(r.label || ''), String(r.value || '')]);
      });
      flush();
    });

    doc.saveAndClose();
    return DriveApp.getFileById(id).getAs('application/pdf').setName(base + '.pdf');

  } finally {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {}
  }
}

function toBlob_(dataUrl) {
  try {
    var m = /^data:([^;]+);base64,(.*)$/.exec(String(dataUrl));
    if (!m) return null;
    return Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], 'photo.jpg');
  } catch (e) { return null; }
}

/* ─── журнал в таблице (если скрипт создан из Google Таблицы) ─────── */
function log_(p, approved) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    var sh = ss.getSheetByName('Заявки') || ss.insertSheet('Заявки');
    if (sh.getLastRow() === 0) {
      sh.appendRow(['Дата', 'Клиент', 'Почта клиента', 'Изделия', 'Статус', 'Менеджер', 'Файл']);
      sh.getRange(1, 1, 1, 7).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    sh.appendRow([new Date(), p.client || '', p.clientEmail || '',
      (p.products || []).join(', '),
      approved ? (p.status || 'Утверждено') : 'Новая',
      p.manager || '', p.filename || '']);
  } catch (e) { /* таблицы нет — не страшно */ }
}

/* ─── вспомогательное ─────────────────────────────────────────────── */
function card_(title, rows, note) {
  var tr = rows.map(function (r) {
    return '<tr>' +
      '<td style="padding:7px 14px 7px 0;color:#586a5e;font-size:14px;vertical-align:top">' + esc_(r[0]) + '</td>' +
      '<td style="padding:7px 0;font-weight:600;font-size:14px">' + esc_(r[1]) + '</td></tr>';
  }).join('');
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#15211a;max-width:620px">' +
      '<div style="border-bottom:3px solid #03832a;padding-bottom:14px;margin-bottom:18px">' +
        '<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#03832a;font-weight:700">' + esc_(COMPANY) + '</div>' +
        '<div style="font-size:21px;font-weight:700;margin-top:6px">' + esc_(title) + '</div>' +
      '</div>' +
      '<table style="border-collapse:collapse">' + tr + '</table>' +
      '<p style="margin-top:18px;font-size:14px;line-height:1.55;color:#586a5e">' + note + '</p>' +
    '</div>';
}
/** Не больше MAX_PER_HOUR заявок в час на весь приёмник.
 *  Адрес скрипта лежит в исходниках публичной страницы, поэтому без этого
 *  ограничения посторонний мог бы выжечь суточную квоту Gmail. */
function allow_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var hour = Math.floor(Date.now() / 3600000);
    var saved = (props.getProperty('rate') || '').split(':');
    var n = (Number(saved[0]) === hour) ? Number(saved[1]) : 0;
    if (n >= MAX_PER_HOUR) return false;
    props.setProperty('rate', hour + ':' + (n + 1));
    return true;
  } catch (e) { return true; }   // счётчик недоступен — не блокируем заявку
}

function isMail_(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '')); }
function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
