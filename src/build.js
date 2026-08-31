/**
 * Сборка формы: части + шрифт + фотографии -> два готовых файла.
 *
 *   node src/build.js
 *
 *   ../index.html                  — страница сайта (GitHub Pages)
 *   ../../tz-razrabotka-produkta.html — версия для Artifact, без <head>
 *
 * ВАЖНО: index.html генерируется. Правки вносите в src/part-*, а не в него,
 * иначе следующая сборка их сотрёт.
 */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const SITE_OUT = path.join(HERE, '..', 'index.html');
const ART_OUT  = process.argv[2] || null;   // необязательный путь для версии Artifact

// имя картинки -> ключ в коде
const IMG_KEYS = {
  image1: 'FORM_OBLONG', image2: 'FORM_OVAL', image3: 'FORM_POINTED', image4: 'FORM_RECT',
  image6: 'POR_FINE',    image7: 'POR_MED',   image9: 'POR_COARSE',
  image10: 'CUT_SHALLOW', image8: 'CUT_DEEP', image5: 'CRUST_SCALE'
};

const font = fs.readFileSync(path.join(HERE, 'font', 'TildaSans-VF.woff2')).toString('base64');

const IMG = {};
for (const [file, key] of Object.entries(IMG_KEYS)) {
  const p = path.join(HERE, 'img', file + '.jpg');
  IMG[key] = 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64');
}

const a = fs.readFileSync(path.join(HERE, 'part-a.html'), 'utf8').replace('__FONT__', font);
const b = fs.readFileSync(path.join(HERE, 'part-b.html'), 'utf8');
const c = fs.readFileSync(path.join(HERE, 'part-c.js'), 'utf8').replace('__IMAGES__', JSON.stringify(IMG));

if (/__FONT__|__IMAGES__/.test(a + c)) throw new Error('остались незаменённые метки');

const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<rect width="32" height="32" rx="7" fill="#03832A"/>' +
  '<g fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M16 27V10"/>' +
  '<path d="M16 15.4c-3.3 0-5.3-2.2-5.3-4.8 3.3 0 5.3 2.2 5.3 4.8Z"/>' +
  '<path d="M16 15.4c3.3 0 5.3-2.2 5.3-4.8-3.3 0-5.3 2.2-5.3 4.8Z"/>' +
  '<path d="M16 21.4c-3.3 0-5.3-2.2-5.3-4.8 3.3 0 5.3 2.2 5.3 4.8Z"/>' +
  '<path d="M16 21.4c3.3 0 5.3-2.2 5.3-4.8-3.3 0-5.3 2.2-5.3 4.8Z"/>' +
  '<path d="M16 10c-1.9-1.4-2.4-3.7-1.4-5.7 1.9 1.4 2.4 3.7 1.4 5.7Z"/>' +
  '</g></svg>');

const TITLE = 'ТЗ на разработку продукции — Фабрика «Мельница»';
const DESC  = 'Онлайн-форма технического задания на разработку хлебобулочного изделия: характеристики, органолептика, фото-референсы, хранение и упаковка.';

const site = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${TITLE}</title>
<meta name="description" content="${DESC}">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#03832A" media="(prefers-color-scheme:light)">
<meta name="theme-color" content="#0A1310" media="(prefers-color-scheme:dark)">
<link rel="icon" href="${FAVICON}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Фабрика «Мельница»">
<meta property="og:title" content="ТЗ на разработку продукции">
<meta property="og:description" content="${DESC}">
<meta property="og:locale" content="ru_RU">
<meta name="twitter:card" content="summary">
${a.replace(/^<title>[^<]*<\/title>\s*/, '')}</head>
<body>
${b}
${c}
</body>
</html>
`;

fs.writeFileSync(SITE_OUT, site, 'utf8');
console.log('index.html :', (fs.statSync(SITE_OUT).size / 1024).toFixed(0) + ' KB');

if (ART_OUT) {
  fs.writeFileSync(ART_OUT, a + '\n' + b + '\n' + c, 'utf8');
  console.log('artifact   :', (fs.statSync(ART_OUT).size / 1024).toFixed(0) + ' KB');
}
