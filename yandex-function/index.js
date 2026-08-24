/**
 * Приёмник заявок формы ТЗ — https://tz.fmill.ru/
 * Яндекс Облако, Cloud Functions (Node.js 18+).
 *
 * Принимает заявку из формы, собирает PDF и отправляет письма через
 * SMTP-шлюз Yandex Cloud Postbox:
 *   • коммерческому отделу — PDF и файл заявки во вложении;
 *   • клиенту — подтверждение с PDF, если он оставил почту.
 *
 * Настройки берутся из переменных окружения функции — см. README.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');

// ─── настройки из переменных окружения ──────────────────────────────
const CFG = {
  from:       process.env.MAIL_FROM       || 'tz@fmill.ru',
  commercial: process.env.MAIL_COMMERCIAL || 'info@fmill.ru',
  corp:       process.env.MAIL_CORP       || 'info@fmill.ru',
  tech:       process.env.MAIL_TECH       || '',
  smtpHost:   process.env.SMTP_HOST       || 'postbox.cloud.yandex.net',
  smtpPort:   Number(process.env.SMTP_PORT || 587),
  smtpUser:   process.env.SMTP_USER       || '',   // ID ключа Postbox
  smtpPass:   process.env.SMTP_PASS       || '',   // секрет ключа Postbox
  company:    process.env.COMPANY         || 'Фабрика «Мельница»',
  clientCopy: process.env.SEND_CLIENT_COPY !== 'false',
  attachHtml: process.env.ATTACH_SOURCE   !== 'false',
  maxPerMin:  Number(process.env.MAX_PER_MIN || 5)
};

const FONT_R = path.join(__dirname, 'font', 'PT_Sans-Web-Regular.ttf');
const FONT_B = path.join(__dirname, 'font', 'PT_Sans-Web-Bold.ttf');

const GREEN = '#03832A', INK = '#15211A', MUTED = '#586A5E', RULE = '#DCE6DB', RED = '#D93125';

/* ═══ входная точка ═══════════════════════════════════════════════ */
module.exports.handler = async function (event) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  const done = (code, obj) => ({ statusCode: code, headers: cors, body: JSON.stringify(obj) });

  try {
    if (event && event.httpMethod === 'OPTIONS') return done(200, { ok: true });
    if (event && event.httpMethod === 'GET') {
      return done(200, { ok: true, note: 'Приёмник заявок формы ТЗ работает. Заявки принимаются методом POST.' });
    }
    if (!event || !event.body) return done(400, { ok: false, error: 'пустой запрос' });
    if (!throttle()) return done(429, { ok: false, error: 'слишком много заявок, попробуйте через минуту' });

    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    const p = JSON.parse(raw);

    const client   = p.client || 'без наименования';
    const products = (p.products || []).filter(Boolean);
    const approved = p.approved === true;
    const base     = String(p.filename || ('ТЗ_' + client)).replace(/\.html?$/i, '');

    // ── вложения
    const attachments = [];
    let pdfOk = true;
    try {
      attachments.push({ filename: base + '.pdf', content: await buildPdf(p), contentType: 'application/pdf' });
    } catch (e) {
      pdfOk = false;
      console.error('PDF не собран:', e && e.stack || e);
    }
    if (CFG.attachHtml && p.html) {
      attachments.push({ filename: base + '.html', content: Buffer.from(p.html, 'utf8'), contentType: 'text/html; charset=utf-8' });
    }

    const rows = [['Клиент', client], ['Изделия', products.length ? products.join(', ') : '—']];
    if (p.manager)     rows.push(['Менеджер', p.manager]);
    if (p.status)      rows.push(['Статус', p.status]);
    if (p.clientEmail) rows.push(['Почта клиента', p.clientEmail]);
    if (!pdfOk)        rows.push(['Внимание', 'PDF собрать не удалось, см. вложенный html-файл']);

    const tx = nodemailer.createTransport({
      host: CFG.smtpHost,
      port: CFG.smtpPort,
      secure: CFG.smtpPort === 465,
      auth: { user: CFG.smtpUser, pass: CFG.smtpPass }
    });

    // ── письмо своим
    const to = [approved ? CFG.corp : CFG.commercial].concat(approved && CFG.tech ? [CFG.tech] : []).join(', ');
    await tx.sendMail({
      from: '"' + CFG.company + '" <' + CFG.from + '>',
      to: to,
      subject: (approved ? 'ФС утверждено — ' : 'Новое ТЗ на разработку — ') + client,
      html: card(
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
    if (CFG.clientCopy && !approved && isMail(p.clientEmail)) {
      await tx.sendMail({
        from: '"' + CFG.company + '" <' + CFG.from + '>',
        to: p.clientEmail,
        subject: 'Ваше техническое задание принято — ' + CFG.company,
        html: card(
          'Спасибо, мы получили ваше техническое задание',
          rows.slice(0, 2),
          'Копия заявки — во вложении. Коммерческий отдел свяжется с вами по указанным контактам. ' +
          'Если нужно что-то дополнить, просто ответьте на это письмо.'
        ),
        attachments: attachments.filter(a => /\.pdf$/i.test(a.filename))
      });
    }

    return done(200, { ok: true, pdf: pdfOk });

  } catch (err) {
    console.error(err && err.stack || err);
    return done(500, { ok: false, error: String(err && err.message || err) });
  }
};

/* ═══ сборка PDF ══════════════════════════════════════════════════ */
function buildPdf(p) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 52, left: 52, right: 52 },
      info: { Title: 'ТЗ на разработку продукции — ' + (p.client || ''), Author: CFG.company }
    });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      doc.registerFont('r', FONT_R);
      doc.registerFont('b', FONT_B);

      const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const X = doc.page.margins.left;

      // шапка
      doc.font('b').fontSize(9).fillColor(GREEN)
         .text(CFG.company.toUpperCase() + ' · FMILL.RU', X, doc.y, { characterSpacing: 1.2 });
      doc.moveDown(0.4);
      doc.font('b').fontSize(19).fillColor(INK).text('Техническое задание на разработку продукции', { width: W });
      doc.moveDown(0.25);
      doc.font('r').fontSize(10).fillColor(MUTED)
         .text((p.client || '') + ' · ' + new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }));
      doc.moveDown(0.5);
      doc.moveTo(X, doc.y).lineTo(X + W, doc.y).lineWidth(2).strokeColor(GREEN).stroke();
      doc.moveDown(0.8);

      if (p.approved) {
        const stamp = 'УТВЕРЖДЕНО' + (p.status ? ' · ' + p.status : '') + (p.manager ? ' · ' + p.manager : '');
        doc.font('b').fontSize(10).fillColor(GREEN).text(stamp, { width: W });
        doc.moveDown(0.8);
      }

      (p.flat || []).forEach(sec => {
        ensure(doc, 60);
        doc.moveDown(0.4);
        doc.font('b').fontSize(13).fillColor(INK).text(sec.title, X, doc.y, { width: W });
        doc.moveDown(0.35);

        (sec.rows || []).forEach(r => {
          if (r.h) {
            ensure(doc, 40);
            doc.moveDown(0.35);
            doc.font('b').fontSize(10).fillColor(GREEN).text(r.h, X, doc.y, { width: W });
            doc.moveDown(0.25);
            return;
          }
          if (r.photos) {
            if (!r.photos.length) return;
            ensure(doc, 40);
            doc.font('r').fontSize(9.5).fillColor(MUTED).text(r.label, X, doc.y, { width: W });
            doc.moveDown(0.3);
            r.photos.forEach(src => {
              const buf = toBuf(src);
              if (!buf) return;
              ensure(doc, 190);
              try {
                doc.image(buf, X, doc.y, { fit: [240, 175] });
                doc.y += 182;
              } catch (e) { /* картинка не вставилась — пропускаем */ }
            });
            doc.moveDown(0.2);
            return;
          }
          row(doc, X, W, String(r.label || ''), String(r.value || ''));
        });
      });

      doc.end();
    } catch (e) { reject(e); }
  });
}

function row(doc, X, W, label, value) {
  const L = 168, GAP = 14, VW = W - L - GAP;
  doc.font('r').fontSize(9.5);
  const hL = doc.heightOfString(label, { width: L });
  doc.font('b').fontSize(10.5);
  const hV = doc.heightOfString(value, { width: VW });
  const h = Math.max(hL, hV) + 10;

  ensure(doc, h + 6);
  const y = doc.y;
  doc.font('r').fontSize(9.5).fillColor(MUTED).text(label, X, y, { width: L });
  doc.font('b').fontSize(10.5).fillColor(/^!!!/.test(label) ? RED : INK).text(value, X + L + GAP, y, { width: VW });
  doc.y = y + h;
  doc.moveTo(X, doc.y - 5).lineTo(X + W, doc.y - 5).lineWidth(0.5).strokeColor(RULE).stroke();
}

function ensure(doc, need) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + need > bottom) doc.addPage();
}

function toBuf(dataUrl) {
  try {
    const m = /^data:(image\/[a-z+]+);base64,(.*)$/i.exec(String(dataUrl));
    if (!m) return null;
    return Buffer.from(m[2], 'base64');
  } catch (e) { return null; }
}

/* ═══ вспомогательное ═════════════════════════════════════════════ */
let bucket = { minute: 0, n: 0 };
function throttle() {
  const m = Math.floor(Date.now() / 60000);
  if (bucket.minute !== m) bucket = { minute: m, n: 0 };
  if (bucket.n >= CFG.maxPerMin) return false;
  bucket.n++;
  return true;
}

function card(title, rows, note) {
  const tr = rows.map(r =>
    '<tr><td style="padding:7px 14px 7px 0;color:#586a5e;font-size:14px;vertical-align:top">' + esc(r[0]) + '</td>' +
    '<td style="padding:7px 0;font-weight:600;font-size:14px">' + esc(r[1]) + '</td></tr>').join('');
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#15211a;max-width:620px">' +
      '<div style="border-bottom:3px solid #03832a;padding-bottom:14px;margin-bottom:18px">' +
        '<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#03832a;font-weight:700">' + esc(CFG.company) + '</div>' +
        '<div style="font-size:21px;font-weight:700;margin-top:6px">' + esc(title) + '</div>' +
      '</div><table style="border-collapse:collapse">' + tr + '</table>' +
      '<p style="margin-top:18px;font-size:14px;line-height:1.55;color:#586a5e">' + note + '</p></div>';
}
function isMail(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '')); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// экспорт для локальной проверки сборки PDF
module.exports._buildPdf = buildPdf;
