<script>
(function () {
"use strict";

/* ============================================================
   ОТПРАВКА ЗАЯВКИ
   Впишите сюда адрес приёмника форм (Formspree, Getform, вебхук
   Битрикс24/amoCRM или свой endpoint) — форма начнёт отправлять
   заявку туда методом POST (JSON).
   Пока строка пустая, кнопка «Отправить» просто отдаёт файл заявки.
   ============================================================ */
const SUBMIT_URL = "";
const MAIL_TO    = "info@fmill.ru";   // куда клиент отправляет заявку
const MAIL_CORP  = "info@fmill.ru";   // куда коммерческий отдел отправляет утверждённое ФС

const IMG  = __IMAGES__;
const LS_C = "fmill_tz_v1";      // черновик клиента
const LS_M = "fmill_tz_mgr_v1";  // заявка, открытая коммерческим отделом

let MODE = "client";   // "client" | "manager"
let allowEdit = false; // менеджер разрешил правку клиентской части

/* файл может открываться напрямую, без обёртки <head> — добавляем viewport сами */
if (!document.querySelector('meta[name="viewport"]')) {
  const mv = document.createElement("meta");
  mv.name = "viewport";
  mv.content = "width=device-width,initial-scale=1";
  document.head.appendChild(mv);
}
if (!document.documentElement.lang) document.documentElement.lang = "ru";

/* ---------- утилиты ---------- */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const uid = (() => { let n = 0; return () => "u" + (++n); })();

/* ---------- справочники ---------- */
const SHAPES = [
  { v: "Продолговатая",              img: "FORM_OBLONG"  },
  { v: "Продолговато-овальная",      img: "FORM_OVAL"    },
  { v: "С заострёнными концами",     img: "FORM_POINTED" },
  { v: "Прямоугольная / квадратная", img: "FORM_RECT"    },
  { v: "Круглая",                    ico: "round"        },
  { v: "Иная — укажу ниже",          ico: "other", other: true }
];
const PORES = [
  { v: "Мелкопористый",  img: "POR_FINE"   },
  { v: "Среднепористый", img: "POR_MED"    },
  { v: "Крупнопористый", img: "POR_COARSE" }
];
const CUTS = [
  { v: "Продольный неглубокий надрез", img: "CUT_SHALLOW" },
  { v: "Продольный надрез",            img: "CUT_DEEP"    },
  { v: "Отсутствует",                  ico: "none"        },
  { v: "Иные — укажу ниже",            ico: "other", other: true }
];
const CRUST = [
  { v: "От жёлтого до светло-коричневого, без подгорелостей",   g: "linear-gradient(103deg,#F6E3AE,#EBCB89 46%,#D6A75E)" },
  { v: "Румяная",                                               g: "linear-gradient(103deg,#EEBE7C,#D89550 48%,#BE7431)" },
  { v: "От коричневого до тёмно-коричневого, без подгорелостей",g: "linear-gradient(103deg,#B8783D,#8E5322 50%,#603514)" },
  { v: "Тёмно-коричневый с подгорелостями",                     g: "linear-gradient(103deg,#6E4118,#41220A 58%,#221204)" }
];

/* ---------- схема полей ---------- */
const CLIENT = [
  { k:"cl_name", lb:"Наименование клиента", req:2, t:"text", ph:"ООО «Ромашка», сеть пекарен «Хлебница»", span:2 },
  { k:"cl_contact", lb:"Контактные данные для уточнения службой разработки", req:0, t:"group", span:2,
    hint:"На случай, если технологическая служба захочет что-либо уточнить напрямую у вас.",
    sub:[ {k:"fio", ph:"ФИО", t:"text"}, {k:"tel", ph:"Телефон", t:"tel"}, {k:"mail", ph:"E-mail", t:"email"} ] },
  { k:"cl_volume", lb:"Планируемые объёмы к закупке", req:2, t:"unit", ph:"Ориентировочно 2–3",
    units:["т в месяц","кг в месяц","шт. в месяц","т в год","кг в год","шт. в год"],
    hint:"Допускается указать ориентировочно: «не менее», «не более» и т. д. Точный параметр знать необязательно — важен порядок цифр: он нужен, чтобы оценить возможности производства и коммерческую целесообразность." },
  { k:"cl_price", lb:"Цена к закупке, руб.", req:1, t:"textchips", ph:"Рыночная",
    chips:["Рыночная","Не дороже конкурентов","Не дороже ___ руб.","От ___ до ___ руб."],
    hint:"Есть ли у вас ограничения по цене? Например: «не дороже ___», «от ___ до ___», «не дороже конкурентов». Если особых пожеланий нет — укажите: Рыночная." },
  { k:"cl_start", lb:"Ориентировочное начало поставок", req:1, t:"textchips", ph:"Например: срочно",
    chips:["Срочно","В течение месяца","Не раньше чем через квартал","Сроков нет — мониторим рынок","Запуск в ___ году"],
    hint:"Ориентировочные параметры: «срочно», «месяц начала», «не раньше чем через квартал», «сроков нет — просто мониторим», «запуск в таком-то году»." },
  { k:"cl_geo", lb:"География поставок", req:1, t:"multi", span:2,
    opts:["Вся Россия","ЦФО","СЗФО","ЮФО","СКФО","ПФО","УФО","СФО","ДФО","Экспорт"], other:true,
    hint:"Макрорегион — для понимания логистики. Можно указать несколько." }
];

const MANAGER = [
  { k:"mg_name", lb:"Ответственный менеджер Мельницы", req:2, t:"text", ph:"ФИО", hint:"ФИО" },
  { k:"mg_status", lb:"Согласование параметров с клиентом", req:2, t:"single",
    opts:["Согласовал","Отказался согласовывать","На согласовании"],
    hint:"Указать, согласовал ли клиент параметры, либо отказался согласовывать." },
  { k:"mg_date", lb:"Дата согласования с клиентом", req:2, t:"date",
    hint:"Дата, на которую параметры были согласованы с клиентом." },
  { k:"mg_comment", lb:"Комментарий коммерческого отдела", req:0, t:"area", span:2,
    ph:"Согласованная цена, объём, сроки, особые условия",
    hint:"Всё, что технологической службе нужно знать помимо написанного клиентом: договорённости по цене, объёмам, срокам." }
];

const SPEC = [
  { k:"p_name", lb:"Наименование", req:2, t:"text", ph:"Багет французский", span:2, hint:"Пример: Багет французский." },
  { k:"p_desc", lb:"Описание", req:0, t:"area", span:2,
    ph:"Хлебобулочное изделие из муки пшеничной с добавлением сухой закваски…",
    hint:"Пример: хлебобулочное изделие из муки пшеничной с добавлением сухой закваски, с одним продольным надрезом, подпылённое мукой.\nПример: батон с отделкой кукурузной смесью по всей поверхности изделия, с продольным надрезом, надрез отделан тёртым сыром." },
  { k:"p_equip", lb:"Установленное оборудование. Возможность дефростации и расстойки", req:1, t:"area", span:2,
    ph:"Печь …, расстоечный шкаф …, дефростация …",
    hint:"Модель и марка установленного оборудования. Установлены ли расстоечные шкафы, где проходит дефростация." },
  { k:"p_bake", lb:"Режим выпечки после дефростации. Программа выпекания, если установлена", req:2, t:"area", span:2,
    ph:"Без дополнительной дефростации. Выпечка из заморозки 13–15 минут при 200 °C",
    chips:["Режимы отсутствуют, на усмотрение изготовителя"],
    note:"В случае отсутствия режимов укажите: «режимы отсутствуют, на усмотрение изготовителя».",
    hint:"Пример: без дополнительной дефростации, выпечка из заморозки 13–15 минут при 200 °C.\nПример: программа №5 — в этом случае, пожалуйста, приложите режимы работы программы." },
  { k:"p_weight", lb:"Вес после допекания", req:2, t:"unit", ph:"0,26", units:["кг","г"],
    hint:"Вес одного изделия после допекания. Пример: 0,26 кг." },
  { k:"p_ready", lb:"Степень готовности изделия", req:0, t:"single",
    opts:["Готовое, 100%","Высокой степени готовности, 90%","Готовность 80%"], other:true,
    hint:"Насколько изделие допечено до заморозки: полностью готовое или требует допекания у вас." },

  { k:"p_shape", lb:"Форма", req:0, t:"cards", cards:SHAPES, span:2,
    extra:{ k:"p_shape_ref", ph:"Или укажите позицию из каталога Мельницы" },
    hint:"Выберите ближайшую форму по фото. Либо дайте ссылку на стандартную позицию из каталога Мельницы." },

  { k:"p_h", lb:"Высота, см", req:2, t:"text", ph:"5–6", hint:"Точно либо ориентировочно. Пример: 5–6 см." },
  { k:"p_l", lb:"Длина, см", req:2, t:"text", ph:"48–50", hint:"Точно либо ориентировочно. Пример: 48–50 см." },
  { k:"p_w", lb:"Ширина, см", req:2, t:"text", ph:"10–12", hint:"Точно либо ориентировочно. Пример: 10–12 см." },

  { h:"Органолептические характеристики", note:"Как изделие должно выглядеть, пахнуть и ощущаться" },

  { k:"p_crust", lb:"Цвет корки", req:2, t:"sw", cards:CRUST, span:2, scale:"CRUST_SCALE",
    hint:"Выберите диапазон цвета корки. Эталонную шкалу можно раскрыть под вариантами." },
  { k:"p_pores", lb:"Пористость мякиша", req:2, t:"cards", cards:PORES, span:2,
    hint:"Выберите ближайший вариант по фото разреза." },
  { k:"p_cuts", lb:"Надрезы на корке", req:2, t:"cards", cards:CUTS, span:2,
    hint:"Выберите ближайший вариант по фото." },
  { k:"p_add", lb:"Не мучные добавки", req:2, t:"multi", span:2,
    opts:["Отсутствуют","Оливки","Маслины","Паприка","Лук","Чеснок","Прованские травы","Вяленые томаты","Семечки","Орехи"],
    neg:["Отсутствуют"], other:true,
    hint:"Что добавляется в тесто или на изделие помимо муки. Можно выбрать несколько." },
  { k:"p_top", lb:"Посыпка сверху", req:2, t:"multi", span:2,
    opts:["Отсутствует","Подпыл мукой","Семечки","Орехи","Кунжут","Тёртый сыр","Кукурузная смесь"],
    neg:["Отсутствует"], other:true,
    hint:"Чем отделана поверхность изделия. Можно выбрать несколько." },
  { k:"p_forbid", lb:"!!! Не допускается", req:1, t:"area", span:2, danger:true,
    ph:"Не допускается отслоение мякиша от корки, морщинистость, боковые подрывы более 5 см",
    hint:"Укажите, что для вас недопустимо в изделии.\nПример: не допускается отслоение мякиша от корки; не допускается морщинистость; боковые подрывы более 5 см." },
  { k:"p_other", lb:"Иная важная информация", req:1, t:"area", span:2,
    ph:"Выраженная рустикальность. Точная копия изделия производителя X",
    hint:"Любая информация, которая поможет разработать продукт нужного качества.\nПример: выраженная рустикальность. Точная копия производителя X." },
  { k:"p_taste", lb:"Вкус", req:0, t:"area", span:2,
    ph:"Приятный хлебный, с лёгкой кислинкой, послевкусие без горечи",
    hint:"Пример: сливочный, ароматный, со вкусом кукурузной муки у мякиша и сыра у корки.\nПример: приятный хлебный, с кислинкой, послевкусие без горечи." },
  { k:"p_comp", lb:"Состав", req:0, t:"area", span:2,
    ph:"Мука пшеничная высшего сорта, вода, дрожжи, соль…",
    hint:"Пример: кукурузная смесь, мука пшеничная высшего сорта, дрожжи, соль, вода." }
];

const PHOTOS = [
  { k:"ph_main", lb:"Общий вид изделия", req:0, t:"files",
    hint:"Загрузите фото изделия целиком: сверху и сбоку. Можно несколько файлов." },
  { k:"ph_cut",  lb:"Разрез / мякиш", req:0, t:"files",
    hint:"Фото разреза — по нему видно пористость и структуру мякиша." },
  { k:"ph_pack", lb:"Фото в упаковке (если есть)", req:0, t:"files",
    hint:"Как изделие выглядит в индивидуальной или транспортной упаковке." },
  { k:"ph_link", lb:"Ссылка на облачную папку", req:0, t:"text", span:2,
    ph:"https://disk.yandex.ru/… или https://drive.google.com/…",
    hint:"Если файлов много или они тяжёлые — выложите их в облако и вставьте ссылку. Проверьте, что доступ открыт по ссылке." }
];

const STORAGE = [
  { h:"Хранение", first:true },
  { k:"st_frozen", lb:"Срок годности в замороженном виде хранения, не менее", req:0, t:"unit",
    ph:"4", units:["месяцев","суток"], hint:"Пример: 4 месяца." },
  { k:"st_after", lb:"Срок годности после допекания", req:0, t:"unit",
    ph:"24", units:["часов","суток"], hint:"Пример: 24 часа." },
  { k:"st_cond", lb:"Условия хранения", req:0, t:"textchips", ph:"−18 °C",
    chips:["−18 °C","−18 °C и ниже","−20 °C"], hint:"Пример: −18 °C." },

  { h:"Упаковка" },
  { k:"pk_ind", lb:"Индивидуальная упаковка", req:2, t:"single", span:2,
    opts:["Без индивидуальной упаковки","Пакет","Флоу-пак","Пакет с клипсой"], neg:["Без индивидуальной упаковки"], other:true,
    hint:"Пример: без индивидуальной упаковки." },
  { k:"pk_trans", lb:"Транспортная упаковка", req:0, t:"textchips", span:2,
    ph:"Картонный короб с полиэтиленовым вкладышем",
    chips:["Картонный короб с полиэтиленовым вкладышем","Картонный короб"],
    hint:"Пример: картонный короб, с полиэтиленовым вкладышем." },
  { k:"pk_qty", lb:"Количество в транспортной упаковке, шт.", req:0, t:"num", ph:"20",
    hint:"Сколько изделий в одном коробе." }
];

const SCHEMA_BY_KEY = {};
[CLIENT, MANAGER, SPEC, PHOTOS, STORAGE].forEach(a => a.forEach(f => { if (f.k) SCHEMA_BY_KEY[f.k] = f; }));

/* ---------- иконки для вариантов без фото ---------- */
const ICONS = {
  round: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4"><circle cx="50" cy="50" r="30"/><path d="M35 40q15 -8 30 0" stroke-width="3"/></svg>',
  none:  '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><circle cx="50" cy="50" r="28"/><path d="M31 69 69 31"/></svg>',
  other: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M28 62V38a6 6 0 0 1 6-6h32a6 6 0 0 1 6 6v24a6 6 0 0 1-6 6H44l-12 10v-10h2"/><path d="M42 46h16M42 55h10"/></svg>'
};

/* ============================================================
   РЕНДЕР ПОЛЕЙ
   ============================================================ */
function hintBtn(f) {
  if (!f.hint) return "";
  return '<button type="button" class="q" aria-label="Подсказка" aria-expanded="false" data-tip="' + esc(f.hint) + '">?</button>';
}
function label(f) {
  const st = f.req === 2 ? '<span class="star">*</span>' : f.req === 1 ? '<span class="star w">**</span>' : "";
  return '<div class="f-lb"><span class="lbtxt">' + esc(f.lb) + " " + st + "</span>" + hintBtn(f) + '<span class="tick" aria-hidden="true">✓</span></div>';
}
function cardOpt(f, o, name) {
  const id = uid();
  const media = o.img
    ? '<span class="opt-im"><img src="' + IMG[o.img] + '" alt="' + esc(o.v) + '"></span>'
    : '<span class="opt-im ph">' + (ICONS[o.ico] || "") + "</span>";
  return '<label class="opt" for="' + id + '">' + media +
    '<span class="opt-cap">' + esc(o.v) + "</span>" +
    '<span class="opt-ck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg></span>' +
    '<input type="radio" id="' + id + '" name="' + name + '" value="' + esc(o.v) + '" data-r="opt"' + (o.other ? ' data-other="1"' : "") + "></label>";
}
function swOpt(f, o, name) {
  const id = uid();
  return '<label class="opt" for="' + id + '"><span class="sw-c" style="background:' + o.g + '"></span>' +
    '<span class="opt-cap">' + esc(o.v) + "</span>" +
    '<span class="opt-ck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg></span>' +
    '<input type="radio" id="' + id + '" name="' + name + '" value="' + esc(o.v) + '" data-r="opt"></label>';
}

function fieldHTML(f, scope) {
  const name = scope + "_" + f.k;
  let body = "";

  switch (f.t) {
    case "text": case "tel": case "email": case "date": case "num": {
      const type = f.t === "num" ? "number" : f.t === "date" ? "date" : f.t === "tel" ? "tel" : f.t === "email" ? "email" : "text";
      body = '<input class="inp" type="' + type + '" data-r="v" placeholder="' + esc(f.ph || "") + '"' + (f.t === "num" ? ' min="0" step="1"' : "") + ">";
      break;
    }
    case "area":
      body = '<textarea class="inp" data-r="v" rows="3" placeholder="' + esc(f.ph || "") + '"></textarea>';
      if (f.chips) body += '<div class="chips" style="margin-top:9px">' + f.chips.map(c => '<span class="chip" data-fill="' + esc(c) + '">' + esc(c) + "</span>").join("") + "</div>";
      break;
    case "unit":
      body = '<div class="row-u"><input class="inp g" type="text" data-r="v" placeholder="' + esc(f.ph || "") + '">' +
        '<select class="inp" data-r="u">' + f.units.map(u => '<option>' + esc(u) + "</option>").join("") + "</select></div>";
      break;
    case "textchips":
      body = '<input class="inp" type="text" data-r="v" placeholder="' + esc(f.ph || "") + '">' +
        '<div class="chips" style="margin-top:9px">' + f.chips.map(c => '<span class="chip" data-fill="' + esc(c) + '">' + esc(c) + "</span>").join("") + "</div>";
      break;
    case "single": case "multi": {
      const isM = f.t === "multi";
      body = '<div class="chips">' + f.opts.map(o => {
        const id = uid(), neg = (f.neg || []).indexOf(o) >= 0 ? " neg" : "";
        return '<label class="chip' + neg + '" for="' + id + '"><input type="' + (isM ? "checkbox" : "radio") + '" id="' + id +
          '" name="' + name + '" value="' + esc(o) + '" data-r="opt"' + (neg ? ' data-neg="1"' : "") + ">" + esc(o) + "</label>";
      }).join("");
      if (f.other) {
        const id = uid();
        body += '<label class="chip" for="' + id + '"><input type="' + (isM ? "checkbox" : "radio") + '" id="' + id +
          '" name="' + name + '" value="Иное" data-r="opt" data-other="1">Иное… укажу</label>';
      }
      body += "</div>";
      if (f.other) body += '<input class="inp" type="text" data-r="other" placeholder="Укажите свой вариант" style="margin-top:9px;display:none">';
      break;
    }
    case "cards": case "sw": {
      const mk = f.t === "sw" ? swOpt : cardOpt;
      body = '<div class="opts' + (f.t === "sw" ? " sw" : "") + '">' + f.cards.map(o => mk(f, o, name)).join("") + "</div>";
      if (f.cards.some(o => o.other)) body += '<input class="inp" type="text" data-r="other" placeholder="Опишите форму словами" style="margin-top:11px;display:none">';
      if (f.scale) body += '<details class="scale"><summary>Показать эталонную шкалу</summary><img src="' + IMG[f.scale] +
        '" alt="Эталонная цветовая шкала"><p>Фотография эталонной шкалы из технологической службы — для сверки оттенка.</p></details>';
      if (f.extra) body += '<input class="inp" type="text" data-r="extra" data-ek="' + f.extra.k + '" placeholder="' + esc(f.extra.ph) + '" style="margin-top:11px">';
      break;
    }
    case "group":
      body = '<div class="grid c3" style="gap:10px">' + f.sub.map(s =>
        '<input class="inp" type="' + (s.t || "text") + '" data-r="sub" data-sk="' + s.k + '" placeholder="' + esc(s.ph) + '">').join("") + "</div>";
      break;
    case "files":
      body = '<div class="dz" tabindex="0" role="button">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 9 5-5 5 5"/><path d="M12 4v12"/></svg>' +
        '<div class="dz-t">Перетащите фото сюда или нажмите</div>' +
        '<div class="dz-s">JPG, PNG, HEIC · до 10 файлов · до 12 МБ каждый</div></div>' +
        '<input type="file" accept="image/*" multiple hidden><div class="thumbs"></div>';
      break;
  }

  const cls = "f" + (f.danger ? " danger" : "");
  const style = f.span === 2 ? ' style="grid-column:1/-1"' : "";
  return '<div class="' + cls + '" data-k="' + f.k + '" data-t="' + f.t + '" data-req="' + (f.req || 0) + '"' + style + ">" +
    label(f) + body + (f.note ? '<div class="f-note">' + esc(f.note) + "</div>" : "") + "</div>";
}

function renderInto(host, list, scope, cols) {
  let html = "", open = false;
  const openGrid = () => { if (!open) { html += '<div class="grid ' + (cols || "c2") + '">'; open = true; } };
  const closeGrid = () => { if (open) { html += "</div>"; open = false; } };
  list.forEach((f, i) => {
    if (f.h) {
      closeGrid();
      html += '<div class="sub' + (f.first || i === 0 ? " first" : "") + '"><h3>' + esc(f.h) + "</h3>" + (f.note ? "<span>" + esc(f.note) + "</span>" : "") + "</div>";
      return;
    }
    openGrid();
    html += fieldHTML(f, scope);
  });
  closeGrid();
  host.innerHTML = html;
  $$(".f", host).forEach(bindField);
}

/* ============================================================
   ПОВЕДЕНИЕ ПОЛЕЙ
   ============================================================ */
function bindField(fEl) {
  const t = fEl.dataset.t;
  fEl._files = [];

  $$("input,textarea,select", fEl).forEach(el => {
    el.addEventListener("input", onChange);
    el.addEventListener("change", onChange);
  });

  $$(".chip[data-fill]", fEl).forEach(ch => ch.addEventListener("click", () => {
    const inp = $('[data-r="v"]', fEl);
    inp.value = ch.dataset.fill;
    inp.focus();
    onChange();
  }));

  if (t === "single" || t === "multi" || t === "cards" || t === "sw") {
    $$('input[data-r="opt"]', fEl).forEach(r => r.addEventListener("change", () => {
      // «Отсутствуют» гасит остальные и наоборот
      if (r.type === "checkbox" && r.checked) {
        if (r.dataset.neg) $$('input[data-r="opt"]', fEl).forEach(o => { if (o !== r) o.checked = false; });
        else $$('input[data-neg="1"]', fEl).forEach(o => { o.checked = false; });
      }
      syncOpts(fEl);
      onChange();
    }));
  }

  if (t === "files") {
    const dz = $(".dz", fEl), inp = $("input[type=file]", fEl);
    dz.addEventListener("click", () => inp.click());
    dz.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } });
    dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("over"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("over"));
    dz.addEventListener("drop", e => { e.preventDefault(); dz.classList.remove("over"); addFiles(fEl, e.dataTransfer.files); });
    inp.addEventListener("change", () => { addFiles(fEl, inp.files); inp.value = ""; });
  }
}

function syncOpts(fEl) {
  $$(".chip,.opt", fEl).forEach(l => {
    const r = $('input[data-r="opt"]', l);
    if (r) l.classList.toggle("on", r.checked);
  });
  const other = $('[data-r="other"]', fEl);
  if (other) {
    const on = $$('input[data-other="1"]', fEl).some(o => o.checked);
    other.style.display = on ? "" : "none";
    if (!on) other.value = "";
  }
}

/* ---------- фото ---------- */
function addFiles(fEl, files) {
  const list = Array.prototype.slice.call(files).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|heic|webp)$/i.test(f.name));
  list.forEach(file => {
    if (fEl._files.length >= 10) return;
    if (file.size > 12 * 1024 * 1024) { flash("Файл «" + file.name + "» больше 12 МБ — пропущен.", "err"); return; }
    shrink(file, dataURL => {
      if (!dataURL) { flash("Не удалось прочитать «" + file.name + "».", "err"); return; }
      fEl._files.push({ name: file.name, data: dataURL });
      drawThumbs(fEl);
      onChange();
    });
  });
}
function shrink(file, cb) {
  const fr = new FileReader();
  fr.onerror = () => cb(null);
  fr.onload = () => {
    const im = new Image();
    im.onerror = () => cb(null);
    im.onload = () => {
      const MAX = 1500, r = Math.min(1, MAX / Math.max(im.width, im.height));
      const c = document.createElement("canvas");
      c.width = Math.round(im.width * r); c.height = Math.round(im.height * r);
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(im, 0, 0, c.width, c.height);
      try { cb(c.toDataURL("image/jpeg", 0.82)); } catch (e) { cb(fr.result); }
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function drawThumbs(fEl) {
  const box = $(".thumbs", fEl);
  box.innerHTML = fEl._files.map((f, i) =>
    '<div class="th"><img src="' + f.data + '" alt="' + esc(f.name) + '">' +
    '<button type="button" data-i="' + i + '" aria-label="Удалить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
    "<span>" + esc(f.name) + "</span></div>").join("");
  $$("button", box).forEach(b => b.addEventListener("click", () => {
    fEl._files.splice(+b.dataset.i, 1); drawThumbs(fEl); onChange();
  }));
}

/* ============================================================
   ЧТЕНИЕ / ЗАПИСЬ ЗНАЧЕНИЙ
   ============================================================ */
function readField(fEl) {
  const t = fEl.dataset.t, k = fEl.dataset.k, f = SCHEMA_BY_KEY[k] || {};
  const g = s => $(s, fEl);
  switch (t) {
    case "date": {
      const v = g('[data-r="v"]').value.trim();
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      return { raw: v, text: m ? m[3] + "." + m[2] + "." + m[1] : v };
    }
    case "text": case "tel": case "email": case "num": case "area": {
      const v = g('[data-r="v"]').value.trim();
      return { raw: v, text: v };
    }
    case "unit": {
      const v = g('[data-r="v"]').value.trim(), u = g('[data-r="u"]').value;
      return { raw: { v: v, u: u }, text: v ? v + " " + u : "" };
    }
    case "textchips": {
      const v = g('[data-r="v"]').value.trim();
      return { raw: v, text: v };
    }
    case "group": {
      const parts = [], raw = {};
      $$('[data-r="sub"]', fEl).forEach(el => {
        raw[el.dataset.sk] = el.value.trim();
        if (el.value.trim()) parts.push(el.placeholder + ": " + el.value.trim());
      });
      return { raw: raw, text: parts.join("; ") };
    }
    case "single": case "cards": case "sw": {
      const r = $$('input[data-r="opt"]', fEl).filter(x => x.checked)[0];
      const o = g('[data-r="other"]'), ex = g('[data-r="extra"]');
      let text = r ? r.value : "";
      // выбран вариант «Иное», но пояснение не написано — считаем поле незаполненным
      if (r && r.dataset.other) text = (o && o.value.trim()) ? o.value.trim() : "";
      const raw = { opt: r ? r.value : "", other: o ? o.value.trim() : "" };
      if (ex) { raw.extra = ex.value.trim(); if (raw.extra) text = (text ? text + ". " : "") + "Каталог Мельницы: " + raw.extra; }
      return { raw: raw, text: text };
    }
    case "multi": {
      const sel = $$('input[data-r="opt"]', fEl).filter(x => x.checked).map(x => x.value);
      const o = g('[data-r="other"]'), ot = o ? o.value.trim() : "";
      const list = sel.filter(v => v !== "Иное").concat(ot ? [ot] : []);
      return { raw: { opts: sel, other: ot }, text: list.join(", ") };
    }
    case "files":
      return { raw: fEl._files.slice(), text: fEl._files.length ? fEl._files.length + " шт." : "", files: fEl._files };
  }
  return { raw: "", text: "" };
}

function writeField(fEl, val) {
  if (val == null) return;
  const t = fEl.dataset.t;
  const g = s => $(s, fEl);
  switch (t) {
    case "text": case "tel": case "email": case "date": case "num": case "area": case "textchips":
      g('[data-r="v"]').value = val; break;
    case "unit":
      g('[data-r="v"]').value = val.v || "";
      if (val.u) g('[data-r="u"]').value = val.u;
      break;
    case "group":
      $$('[data-r="sub"]', fEl).forEach(el => { el.value = (val && val[el.dataset.sk]) || ""; });
      break;
    case "single": case "cards": case "sw": {
      $$('input[data-r="opt"]', fEl).forEach(x => { x.checked = x.value === val.opt; });
      const o = g('[data-r="other"]'); if (o) o.value = val.other || "";
      const ex = g('[data-r="extra"]'); if (ex) ex.value = val.extra || "";
      syncOpts(fEl);
      if (o && val.other) o.style.display = "";
      break;
    }
    case "multi": {
      const list = (val.opts) || [];
      $$('input[data-r="opt"]', fEl).forEach(x => { x.checked = list.indexOf(x.value) >= 0; });
      const o = g('[data-r="other"]'); if (o) o.value = val.other || "";
      syncOpts(fEl);
      if (o && val.other) o.style.display = "";
      break;
    }
    case "files":
      fEl._files = Array.isArray(val) ? val : [];
      drawThumbs(fEl);
      break;
  }
}

function isFilled(fEl) { const r = readField(fEl); return !!(r.text && String(r.text).trim()); }

/* ============================================================
   ИЗДЕЛИЯ
   ============================================================ */
let itemSeq = 0;
function addItem(data) {
  const idx = itemSeq++;
  const scope = "i" + idx;
  const box = document.createElement("div");
  box.className = "item";
  box.dataset.scope = scope;
  box.innerHTML =
    '<section class="card">' +
      '<div class="item-hd"><span class="ix"></span><span class="nm"></span>' +
        '<button class="rm" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>Удалить изделие</button></div>' +
      '<div class="card-hd"><div class="num">2</div><div><h2>Характеристика</h2><p>Техническое задание на разработку продукции</p></div></div>' +
      '<div class="card-bd"><div class="body-spec"></div></div>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-hd"><div class="num">3</div><div><h2>Фото и референс</h2><p>Загрузите изображения желаемого изделия</p></div></div>' +
      '<div class="card-bd"><div class="body-photo"></div></div>' +
    '</section>' +
    '<section class="card">' +
      '<div class="card-hd"><div class="num">4</div><div><h2>Хранение и упаковка</h2><p>Сроки годности, условия хранения, упаковка</p></div></div>' +
      '<div class="card-bd"><div class="body-store"></div></div>' +
    '</section>';

  $("#items").appendChild(box);
  renderInto($(".body-spec", box), SPEC, scope, "c2");
  renderInto($(".body-photo", box), PHOTOS, scope, "c3");
  renderInto($(".body-store", box), STORAGE, scope, "c2");

  $(".rm", box).addEventListener("click", () => {
    if ($$("#items .item").length === 1) { flash("Должно остаться хотя бы одно изделие.", "err"); return; }
    if (!confirm("Удалить это изделие вместе со всеми заполненными данными?")) return;
    box.remove(); renumber(); onChange();
  });

  if (data) {
    $$(".f", box).forEach(fEl => writeField(fEl, data[fEl.dataset.k]));
  }
  if (MODE === "manager") applyLock();
  renumber();
  return box;
}
function renumber() {
  const items = $$("#items .item");
  items.forEach((b, i) => {
    $(".ix", b).textContent = "Изделие " + (i + 1);
    $(".item-hd", b).style.display = items.length > 1 ? "" : "none";
  });
  updateNames();
}
function updateNames() {
  $$("#items .item").forEach(b => {
    const f = $('.f[data-k="p_name"]', b);
    const v = f ? readField(f).text : "";
    $(".nm", b).textContent = v ? "· " + v : "";
  });
}

/* ============================================================
   ВАЛИДАЦИЯ + ПРОГРЕСС
   ============================================================ */
let strict = false;

/* Служебный блок заполняет коммерческий отдел, а не клиент: пока форма
   в клиентском режиме, эти поля скрыты и отправку не блокируют. */
function counted(fEl) {
  return MODE === "manager" || !$("#mgrBody").contains(fEl);
}
function badFields() {
  return $$(".f").filter(f => +f.dataset.req === 2 && counted(f) && !isFilled(f));
}

function refresh() {
  let done = 0, total = 0;
  $$(".f").forEach(fEl => {
    if (!counted(fEl)) { fEl.classList.remove("ok", "bad"); return; }
    const req = +fEl.dataset.req, ok = isFilled(fEl);
    fEl.classList.toggle("ok", ok);
    fEl.classList.toggle("bad", strict && req === 2 && !ok);
    if (req === 2) { total++; if (ok) done++; }
  });
  $("#pgN").textContent = done;
  $("#pgM").textContent = total;
  $("#pgBar").style.width = total ? (done / total * 100).toFixed(1) + "%" : "0%";
  updateNames();
}

let saveT = null;
function onChange() {
  refresh();
  clearTimeout(saveT);
  saveT = setTimeout(save, 500);
}

/* ============================================================
   СБОР ДАННЫХ
   ============================================================ */
function collect(withFiles) {
  const rd = host => {
    const o = {};
    $$(".f", host).forEach(fEl => {
      const r = readField(fEl);
      if (fEl.dataset.t === "files" && !withFiles) o[fEl.dataset.k] = [];
      else o[fEl.dataset.k] = r.raw;
    });
    return o;
  };
  return {
    v: 1,
    ts: new Date().toISOString(),
    client: rd($("#clientBody")),
    manager: rd($("#mgrBody")),
    items: $$("#items .item").map(b => rd(b))
  };
}
function apply(d) {
  if (!d) return;
  $$(".f", $("#clientBody")).forEach(f => writeField(f, d.client && d.client[f.dataset.k]));
  $$(".f", $("#mgrBody")).forEach(f => writeField(f, d.manager && d.manager[f.dataset.k]));
  $("#items").innerHTML = ""; itemSeq = 0;
  const items = (d.items && d.items.length) ? d.items : [null];
  items.forEach(it => addItem(it));
  applyLock();
  if (d.manager && Object.keys(d.manager).some(k => d.manager[k] && String(d.manager[k].opt || d.manager[k]).trim())) $("#mgrBox").open = true;
}

/* ---------- автосохранение ---------- */
function pack(withFiles) {
  const d = collect(withFiles);
  if (MODE === "manager") d.mgrActive = true;
  return JSON.stringify(d);
}
function save() {
  const el = $("#saved");
  const key = MODE === "manager" ? LS_M : LS_C;
  try {
    let s = pack(true);
    if (s.length > 3.6e6) s = pack(false);
    localStorage.setItem(key, s);
    el.classList.add("on");
    $("span", el).textContent = "Черновик сохранён";
  } catch (e) {
    try {
      localStorage.setItem(key, pack(false));
      el.classList.add("on");
      $("span", el).textContent = "Сохранено без фото";
    } catch (e2) {
      el.classList.remove("on");
      $("span", el).textContent = "Не удалось сохранить";
    }
  }
}
function loadKey(k) {
  try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

/* ============================================================
   РЕЖИМ КОММЕРЧЕСКОГО ОТДЕЛА
   ============================================================ */
function applyLock() {
  const lock = MODE === "manager" && !allowEdit;
  const mgrBody = $("#mgrBody");
  $$(".f").forEach(fEl => {
    const ro = lock && !mgrBody.contains(fEl);
    fEl.classList.toggle("ro", ro);
    $$("input,textarea,select", fEl).forEach(el => {
      if (el.tagName === "SELECT" || el.type === "radio" || el.type === "checkbox" || el.type === "file") el.disabled = ro;
      else el.readOnly = ro;
    });
  });
  $$("#items .item .rm").forEach(b => b.disabled = lock);
  $("#btnAdd").disabled = lock;
}

function setMode(m) {
  MODE = m;
  const mgr = m === "manager";
  document.body.classList.toggle("mgr-mode", mgr);
  $("#mbar").hidden = !mgr;
  $("#sendLbl").textContent = mgr ? "Утвердить и отправить" : "Отправить заявку";
  $("#topLbl").textContent  = mgr ? "Утвердить" : "Отправить";
  if (mgr) {
    $("#mgrBox").open = true;
    $("#mbarName").textContent = readField($('#clientBody .f[data-k="cl_name"]')).text || "заявка без наименования";
  }
  applyLock();
  refresh();
}

/* данные лежат либо в .json, либо внутри html-файла заявки */
function extractData(text) {
  try { const j = JSON.parse(text); if (j && Array.isArray(j.items)) return j; } catch (e) {}
  const m = text.match(/<script[^>]*id="tz-data"[^>]*>([\s\S]*?)<\/script>/i);
  if (m) { try { const j = JSON.parse(m[1]); if (j && Array.isArray(j.items)) return j; } catch (e) {} }
  return null;
}

function openFile(file) {
  const fr = new FileReader();
  fr.onerror = () => flash("Не удалось прочитать файл.", "err");
  fr.onload = () => {
    const d = extractData(String(fr.result));
    if (!d) {
      flash("Это не похоже на заявку. Нужен файл, который формирует эта же форма — <b>ТЗ_….html</b> или <b>.json</b>.", "err");
      return;
    }
    apply(d);
    allowEdit = false;
    $("#allowEdit").checked = false;
    setMode("manager");
    save();
    flash("Заявка клиента загружена. Данные клиента открыты только для чтения — заполните служебный блок и нажмите «Утвердить и отправить».", "ok");
    $("#mgrBox").scrollIntoView({ behavior: "smooth", block: "center" });
  };
  fr.readAsText(file, "utf-8");
}

function exitManager() {
  if (!confirm("Выйти из режима коммерческого отдела? Загруженная заявка и внесённые правки будут убраны с экрана.")) return;
  try { localStorage.removeItem(LS_M); } catch (e) {}
  MODE = "client";
  location.reload();
}

/* ============================================================
   ЭКСПОРТ
   ============================================================ */
function humanList(host, list) {
  const rows = [];
  list.forEach(f => {
    if (f.h) { rows.push({ h: f.h }); return; }
    const fEl = $('.f[data-k="' + f.k + '"]', host);
    if (!fEl) return;
    const r = readField(fEl);
    if (f.t === "files") { if (r.files && r.files.length) rows.push({ lb: f.lb, files: r.files }); return; }
    if (!r.text) return;
    rows.push({ lb: f.lb, text: r.text, req: f.req, danger: f.danger });
  });
  return rows;
}
function rowsHTML(rows) {
  if (!rows.length) return '<p class="empty">— не заполнено —</p>';
  return rows.map(r => {
    if (r.h) return '<h3>' + esc(r.h) + "</h3>";
    if (r.files) return '<div class="r"><div class="k">' + esc(r.lb) + '</div><div class="v ims">' +
      r.files.map(f => '<img src="' + f.data + '" alt="' + esc(f.name) + '">').join("") + "</div></div>";
    return '<div class="r' + (r.danger ? " dg" : "") + '"><div class="k">' + esc(r.lb) + '</div><div class="v">' + esc(r.text).replace(/\n/g, "<br>") + "</div></div>";
  }).join("");
}
/* Уменьшаем фото для PDF: в документе они печатаются шириной в колонку,
   исходные 1500 px туда не нужны, а вес запроса режут заметно. */
function shrinkDataURL(src, max) {
  return new Promise(function (done) {
    const im = new Image();
    im.onerror = () => done(src);
    im.onload = () => {
      const r = Math.min(1, max / Math.max(im.width, im.height));
      if (r >= 1) return done(src);
      const cv = document.createElement("canvas");
      cv.width = Math.round(im.width * r);
      cv.height = Math.round(im.height * r);
      const g = cv.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(im, 0, 0, cv.width, cv.height);
      try { done(cv.toDataURL("image/jpeg", 0.8)); } catch (e) { done(src); }
    };
    im.src = src;
  });
}

/* Плоское представление заявки: подписи и значения так, как их видит человек.
   Из него сервис собирает PDF — форма отдаёт готовый текст, а не ключи полей. */
async function flatPayload() {
  const out = [];
  const conv = async rows => {
    const res = [];
    for (const r of rows) {
      if (r.h) { res.push({ h: r.h }); continue; }
      if (r.files) {
        const ph = [];
        for (const f of r.files) ph.push(await shrinkDataURL(f.data, 900));
        res.push({ label: r.lb, photos: ph });
        continue;
      }
      res.push({ label: r.lb, value: r.text });
    }
    return res;
  };

  out.push({ title: "Клиент", rows: await conv(humanList($("#clientBody"), CLIENT)) });
  const mgr = await conv(humanList($("#mgrBody"), MANAGER));
  if (mgr.length) out.push({ title: "Служебное — заполняет коммерческий отдел", rows: mgr });

  const items = $$("#items .item");
  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    const nm = readField($('.f[data-k="p_name"]', b)).text || ("изделие " + (i + 1));
    const rows = [{ h: "Характеристика" }].concat(
      await conv(humanList($(".body-spec", b), SPEC)),
      [{ h: "Фото и референс" }], await conv(humanList($(".body-photo", b), PHOTOS)),
      [{ h: "Хранение и упаковка" }], await conv(humanList($(".body-store", b), STORAGE)));
    out.push({ title: "Изделие " + (i + 1) + " — " + nm, rows: rows });
  }
  return out;
}

/* У приёмника есть потолок на размер запроса: у Яндекс Облака это 3,5 МБ
   на JSON. Самое тяжёлое — фотографии, поэтому payload собирается
   с постепенно уменьшающимися снимками, пока не уложится в лимит.
   Оригиналы при этом не портятся: после сборки они возвращаются на место. */
const PAYLOAD_LIMIT = 3.0e6;

async function buildPayload() {
  const fields = $$('.f[data-t="files"]');
  const orig = fields.map(f => f._files.map(x => x.data));
  const levels = [0, 1100, 800, 600, 450];   // 0 — как есть
  let built = null;

  try {
    for (const lvl of levels) {
      for (let i = 0; i < fields.length; i++) {
        for (let j = 0; j < fields[i]._files.length; j++) {
          fields[i]._files[j].data = lvl ? await shrinkDataURL(orig[i][j], lvl) : orig[i][j];
        }
      }
      const doc = buildDoc();
      const cRaw = readField($('#clientBody .f[data-k="cl_contact"]')).raw || {};
      const body = JSON.stringify({
        filename: doc.name,
        client: readField($('#clientBody .f[data-k="cl_name"]')).text,
        clientEmail: cRaw.mail || "",
        products: $$("#items .item").map(b => readField($('.f[data-k="p_name"]', b)).text),
        approved: MODE === "manager",
        manager: readField($('#mgrBody .f[data-k="mg_name"]')).text,
        status: readField($('#mgrBody .f[data-k="mg_status"]')).text,
        html: doc.html,
        flat: await flatPayload()
      });
      built = { body: body, size: body.length, level: lvl };
      if (body.length <= PAYLOAD_LIMIT) break;
    }
  } finally {
    fields.forEach((f, i) => f._files.forEach((x, j) => { x.data = orig[i][j]; }));
  }
  return built;
}

function buildDoc() {
  const cName = readField($('#clientBody .f[data-k="cl_name"]')).text || "Без названия";
  const date = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
  const mgName = readField($('#mgrBody .f[data-k="mg_name"]')).text;
  const mgStat = readField($('#mgrBody .f[data-k="mg_status"]')).text;
  const mgDate = readField($('#mgrBody .f[data-k="mg_date"]')).text;
  const approved = MODE === "manager" && mgStat === "Согласовал";
  const mgRows = humanList($("#mgrBody"), MANAGER);
  const stamp = (MODE === "manager" && mgStat)
    ? '<div class="stamp"><b>' + esc(mgStat) + "</b>" + (mgName ? " · " + esc(mgName) : "") + (mgDate ? " · " + esc(mgDate) : "") + "</div>"
    : "";
  const items = $$("#items .item").map((b, i) => {
    const nm = readField($('.f[data-k="p_name"]', b)).text || "изделие " + (i + 1);
    return '<section><h2 class="it"><span class="ib">Изделие ' + (i + 1) + '</span> ' + esc(nm) + '</h2>' +
      '<h3 class="blk">2. Характеристика</h3>' + rowsHTML(humanList($(".body-spec", b), SPEC)) +
      '<h3 class="blk">3. Фото и референс</h3>' + rowsHTML(humanList($(".body-photo", b), PHOTOS)) +
      '<h3 class="blk">4. Хранение и упаковка</h3>' + rowsHTML(humanList($(".body-store", b), STORAGE)) +
      "</section>";
  }).join("");

  const css = "body{margin:0;background:#eff3ee;color:#15211a;font:15px/1.5 'Segoe UI',system-ui,Arial,sans-serif}" +
    ".p{max-width:900px;margin:0 auto;padding:28px 20px 60px}" +
    "header{border-bottom:3px solid #03832a;padding-bottom:16px;margin-bottom:22px}" +
    "header .t{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#03832a;font-weight:700}" +
    "header h1{margin:6px 0 4px;font-size:26px;letter-spacing:-.02em}" +
    "header .m{color:#586a5e;font-size:13.5px}" +
    "section{background:#fff;border:1px solid #dce6db;border-radius:14px;padding:20px 22px;margin-bottom:16px}" +
    "section>h2{font-size:19px;margin:0 0 14px;display:flex;align-items:center;gap:10px;letter-spacing:-.01em}" +
    "section>h2 i{width:30px;height:30px;border-radius:9px;background:#03832a;color:#fff;font-style:normal;font-size:15px;display:grid;place-items:center;flex:none}" +
    "section>h2 .ib{background:#e6f4ea;color:#02661f;border:1px solid #9fcfaf;border-radius:60px;padding:3px 12px;font-size:12.5px;font-weight:700;flex:none}" +
    "h3{font-size:13px;margin:22px 0 10px;color:#03832a;letter-spacing:.02em}" +
    "h3.blk{border-top:1px dashed #dce6db;padding-top:16px}" +
    "h3:first-of-type{margin-top:0}" +
    ".r{display:grid;grid-template-columns:270px 1fr;gap:14px;padding:8px 0;border-bottom:1px solid #eaf1e9;align-items:start}" +
    ".r:last-child{border-bottom:0}" +
    ".k{color:#586a5e;font-size:13.5px}.v{font-weight:600}" +
    ".r.dg .v{color:#d93125}" +
    ".ims{display:flex;flex-wrap:wrap;gap:8px}.ims img{width:150px;height:120px;object-fit:cover;border-radius:9px;border:1px solid #dce6db}" +
    ".empty{color:#8a9c90;font-size:13.5px;margin:4px 0}" +
    "@media(max-width:640px){.r{grid-template-columns:1fr;gap:2px}}" +
    ".stamp{margin-top:12px;display:inline-block;background:#e6f4ea;border:1px solid #9fcfaf;color:#02661f;" +
    "border-radius:60px;padding:6px 16px;font-size:13px}" +
    "@media print{body{background:#fff}.p{padding:0}section{break-inside:avoid;box-shadow:none}@page{size:A4;margin:14mm}}";

  const html = '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>ТЗ — " + esc(cName) + "</title><style>" + css + "</style></head><body><div class=\"p\">" +
    '<header><div class="t">Фабрика Мельница · fmill.ru</div>' +
    "<h1>Техническое задание на разработку продукции</h1>" +
    '<div class="m">' + esc(cName) + " · сформировано " + esc(date) + "</div>" + stamp + "</header>" +
    "<section><h2><i>1</i> Клиент</h2>" + rowsHTML(humanList($("#clientBody"), CLIENT)) +
    (mgRows.length ? '<h3 class="blk">Служебное — заполняет менеджер Мельницы</h3>' + rowsHTML(mgRows) : "") + "</section>" +
    items +
    '</div><scr' + 'ipt type="application/json" id="tz-data">' +
    JSON.stringify(collect(true)).replace(/</g, "\\u003c") +
    "<\/script></body></html>";

  const base = "ТЗ_" + cName.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) + "_" + new Date().toISOString().slice(0, 10);
  return { html: html, name: base + (approved ? "_утверждено" : "") + ".html" };
}
/* В просмотрщике Artifact страница не может скачать файл сама — это делает
   возможность downloads. В обычном браузере (локальный файл, свой хостинг)
   её нет, и работает обычная ссылка. */
let dlPromise;
function downloads() {
  if (dlPromise === undefined) {
    dlPromise = (window.claude && typeof window.claude.use === "function")
      ? window.claude.use("downloads").catch(() => null)
      : Promise.resolve(null);
  }
  return dlPromise;
}

async function download() {
  const d = buildDoc();
  const dl = await downloads();

  if (dl) {
    try {
      await dl.save({ filename: d.name, data: d.html });
      return { ok: true, name: d.name };
    } catch (e) {
      const code = e && e.code;
      if (code === "extension_not_enabled" || code === "rejected_extension") {
        const jn = d.name.replace(/\.html$/, ".json");
        try {
          await dl.save({ filename: jn, data: JSON.stringify(collect(true), null, 1) });
          return { ok: true, name: jn, plain: true };
        } catch (e2) { return { ok: false, code: (e2 && e2.code) || "unavailable" }; }
      }
      return { ok: false, code: code || "unavailable" };
    }
  }

  const b = new Blob(["﻿" + d.html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = d.name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  return { ok: true, name: d.name };
}

/* Письмо собирается коротким: кириллица в адресной строке кодируется
   шестью символами на букву, а почтовые программы обрезают mailto
   примерно на 2000 символах. Поэтому в теле — только сводка,
   а полное ФС уходит приложенным файлом. */
function mailDraft(fileName) {
  const g = k => readField($('#clientBody .f[data-k="' + k + '"]')).text;
  const cName = g("cl_name") || "без наименования";
  const mgr = MODE === "manager";
  const names = $$("#items .item").map((b, i) =>
    (i + 1) + ". " + (readField($('.f[data-k="p_name"]', b)).text || "без наименования"));

  const subject = (mgr ? "ФС утверждено — " : "ТЗ на разработку продукции — ") + cName;
  const head = [
    mgr ? "Утверждённое техническое задание на разработку продукции." : "Техническое задание на разработку продукции.",
    "",
    "Клиент: " + cName
  ];
  const extra = [];
  const contact = g("cl_contact"); if (contact) extra.push("Контакты: " + contact);
  const vol = g("cl_volume");      if (vol)     extra.push("Объёмы: " + vol);
  if (mgr) {
    const mn = readField($('#mgrBody .f[data-k="mg_name"]')).text;
    const ms = readField($('#mgrBody .f[data-k="mg_status"]')).text;
    if (mn) extra.push("Менеджер: " + mn);
    if (ms) extra.push("Статус: " + ms);
  }
  const tail = [
    "",
    "Изделия:",
    names.join("\n"),
    "",
    "Полное ТЗ со всеми параметрами и фотографиями — в файле",
    "«" + fileName + "», он только что сохранён на устройство.",
    "Пожалуйста, приложите его к этому письму перед отправкой."
  ];

  const to = mgr ? MAIL_CORP : MAIL_TO;
  const build = lines => "mailto:" + to + "?subject=" + encodeURIComponent(subject) +
                         "&body=" + encodeURIComponent(lines.join("\n"));
  let url = build(head.concat(extra, tail));
  if (url.length > 1900) url = build(head.concat(tail));      // не влезло — убираем подробности
  if (url.length > 1900) url = build(head.concat(tail.slice(-4)));
  return url;
}

function openMail(fileName) {
  try {
    const a = document.createElement("a");
    a.href = mailDraft(fileName);
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch (e) { return false; }
}

const DL_MSG = {
  declined:      "Сохранение отменено. Нажмите «Скачать заявку» ещё раз, когда будете готовы.",
  rate_limited:  "Окно сохранения уже открыто. Завершите его и попробуйте снова.",
  too_large:     "Заявка получилась слишком большой. Удалите часть фотографий или приложите их ссылкой на облако.",
  bad_request:   "Не удалось собрать файл заявки. Проверьте загруженные фото и попробуйте снова."
};
function dlError(code) {
  return DL_MSG[code] || ("Не удалось сохранить файл заявки. Воспользуйтесь кнопкой «Печать / PDF» или пришлите данные на <a href=\"mailto:" + MAIL_TO + "\">" + MAIL_TO + "</a>.");
}

/* ============================================================
   ОТПРАВКА
   ============================================================ */
function firstBad() {
  strict = true; refresh();
  return badFields()[0] || null;
}
function flash(text, kind) {
  const m = $("#msg");
  m.className = "msg show " + (kind || "inf");
  m.innerHTML = text;
  if (kind !== "ok") m.scrollIntoView({ behavior: "smooth", block: "center" });
}
async function submit() {
  const bad = firstBad();
  if (bad) {
    const mgr = $("#mgrBox");
    if (mgr.contains(bad)) mgr.open = true;
    bad.scrollIntoView({ behavior: "smooth", block: "center" });
    const inp = $("input,textarea,select", bad); if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 400);
    flash("Заполнены не все обязательные поля — они подсвечены красным. Осталось: <b>" +
      badFields().length + "</b>.", "err");
    return;
  }
  if (MODE !== "manager" && !$("#consent").checked) {
    $("#consent").focus();
    flash("Отметьте согласие на обработку персональных данных.", "err");
    return;
  }

  if (!SUBMIT_URL) {
    const r = await download();
    if (!r.ok) { flash(dlError(r.code), "err"); return; }
    const addr = MODE === "manager" ? MAIL_CORP : MAIL_TO;
    openMail(r.name);
    flash("Файл <b>" + esc(r.name) + "</b> сохранён, и открылось готовое письмо на <b>" + esc(addr) + "</b>." +
      "<br>Приложите к нему сохранённый файл и нажмите «Отправить» в почтовой программе." +
      "<br><span style=\"opacity:.75\">Если письмо не открылось — почтовая программа не настроена. Отправьте файл вручную на <a href=\"mailto:" + addr + "\">" + addr + "</a>.</span>", "ok");
    return;
  }

  const btns = [$("#btnSend"), $("#btnTop")];
  btns.forEach(b => b.disabled = true);
  flash("Отправляем заявку…", "inf");
  try {
    const built = await buildPayload();

    if (!built || built.size > PAYLOAD_LIMIT) {
      const mb = built ? (built.size / 1048576).toFixed(1) : "?";
      const r = await download();
      flash("Заявка получилась слишком тяжёлой для автоматической отправки (" + mb + " МБ). " +
        (r.ok
          ? "Файл <b>" + esc(r.name) + "</b> сохранён — пришлите его на <a href=\"mailto:" + MAIL_TO + "\">" + MAIL_TO +
            "</a>, либо уберите часть фотографий и попробуйте снова."
          : dlError(r.code)), "err");
      return;
    }

    /* text/plain — чтобы браузер не слал preflight-запрос:
       ни Apps Script, ни функция Яндекса на OPTIONS могут не ответить */
    const res = await fetch(SUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: built.body
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    flash("Заявка отправлена. Мы свяжемся с вами по указанным контактам.", "ok");
  } catch (e) {
    const r = await download();
    flash("Не удалось отправить заявку автоматически (" + esc(e.message) + ").<br>" +
      (r.ok ? "Файл <b>" + esc(r.name) + "</b> сохранён — пришлите его на <a href=\"mailto:" + MAIL_TO + "\">" + MAIL_TO + "</a>."
            : dlError(r.code)), "err");
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

/* ============================================================
   ПОДСКАЗКИ
   ============================================================ */
const tip = () => $("#tip");
let tipOwner = null;
function showTip(btn) {
  const el = tip();
  el.textContent = btn.dataset.tip;
  el.classList.add("show");
  const r = btn.getBoundingClientRect();
  el.style.left = "0px"; el.style.top = "0px";
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = r.left + window.scrollX + r.width / 2 - w / 2;
  left = Math.max(12 + window.scrollX, Math.min(left, window.scrollX + document.documentElement.clientWidth - w - 12));
  let top = r.bottom + window.scrollY + 9;
  if (r.bottom + h + 20 > window.innerHeight && r.top - h - 9 > 0) top = r.top + window.scrollY - h - 9;
  el.style.left = left + "px"; el.style.top = top + "px";
  if (tipOwner && tipOwner !== btn) tipOwner.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-expanded", "true");
  tipOwner = btn;
}
function hideTip() {
  tip().classList.remove("show");
  if (tipOwner) { tipOwner.setAttribute("aria-expanded", "false"); tipOwner = null; }
}
document.addEventListener("click", e => {
  const q = e.target.closest(".q");
  if (q) { e.preventDefault(); (tipOwner === q) ? hideTip() : showTip(q); return; }
  if (!e.target.closest("#tip")) hideTip();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") hideTip(); });
if (window.matchMedia("(hover:hover) and (pointer:fine)").matches) {
  document.addEventListener("mouseover", e => { const q = e.target.closest(".q"); if (q && q !== tipOwner) showTip(q); });
  document.addEventListener("mouseout", e => {
    const q = e.target.closest(".q");
    if (q && !e.relatedTarget?.closest?.("#tip")) setTimeout(() => { if (tipOwner === q && !tip().matches(":hover")) hideTip(); }, 160);
  });
}
window.addEventListener("scroll", () => { if (tipOwner) hideTip(); }, { passive: true });
window.addEventListener("resize", hideTip);

/* ============================================================
   СТАРТ
   ============================================================ */
renderInto($("#clientBody"), CLIENT, "c", "c2");
renderInto($("#mgrBody"), MANAGER, "m", "c2");

const savedM = loadKey(LS_M);
const saved = (savedM && savedM.mgrActive) ? savedM : loadKey(LS_C);
if (saved) apply(saved); else addItem(null);
if (savedM && savedM.mgrActive) setMode("manager");

$("#btnAdd").addEventListener("click", () => {
  const b = addItem(null);
  onChange();
  b.scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#btnSend").addEventListener("click", submit);
$("#btnTop").addEventListener("click", submit);
$("#btnSave").addEventListener("click", async () => {
  const b = $("#btnSave"); b.disabled = true;
  try {
    const r = await download();
    if (!r.ok) { flash(dlError(r.code), "err"); return; }
    flash(r.plain
      ? "Заявка сохранена в виде данных: <b>" + esc(r.name) + "</b>. Для документа с фотографиями воспользуйтесь кнопкой «Печать / PDF»."
      : "Файл заявки сохранён: <b>" + esc(r.name) + "</b>. Внутри — все заполненные поля и приложенные фото.", "ok");
  } finally { b.disabled = false; }
});
let mgrWasOpen = null;
window.addEventListener("beforeprint", () => {
  const m = $("#mgrBox");
  if (mgrWasOpen === null) mgrWasOpen = m.open;
  m.open = true;
  hideTip();
});
window.addEventListener("afterprint", () => {
  if (mgrWasOpen !== null) { $("#mgrBox").open = mgrWasOpen; mgrWasOpen = null; }
});

$("#btnPrint").addEventListener("click", () => window.print());
$("#btnPrint2").addEventListener("click", () => window.print());
$("#btnClear").addEventListener("click", () => {
  if (!confirm("Очистить всю форму? Введённые данные и загруженные фото будут удалены безвозвратно.")) return;
  try { localStorage.removeItem(MODE === "manager" ? LS_M : LS_C); } catch (e) {}
  location.reload();
});

/* --- вход в режим коммерческого отдела --- */
$("#btnLoad").addEventListener("click", () => $("#loadFile").click());
$("#loadFile").addEventListener("change", e => {
  const f = e.target.files && e.target.files[0];
  if (f) openFile(f);
  e.target.value = "";
});
$("#btnExitMgr").addEventListener("click", exitManager);
$("#allowEdit").addEventListener("change", e => {
  allowEdit = e.target.checked;
  applyLock();
});

/* перетаскивание файла заявки в любое место страницы
   (зоны загрузки фото обрабатывают свой drop сами) */
const overDz = e => !!(e.target && e.target.closest && e.target.closest(".dz"));
document.addEventListener("dragover", e => {
  if (overDz(e) || !e.dataTransfer) return;
  if (Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") < 0) return;
  e.preventDefault();
  document.body.classList.add("drop-on");
});
document.addEventListener("dragleave", e => { if (!e.relatedTarget) document.body.classList.remove("drop-on"); });
document.addEventListener("drop", e => {
  if (overDz(e)) return;
  document.body.classList.remove("drop-on");
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) return;
  e.preventDefault();
  if (/\.(html?|json)$/i.test(f.name)) openFile(f);
  else flash("Это не файл заявки. Перетащите <b>ТЗ_….html</b>, полученный от клиента.", "err");
});

refresh();
if (saved) { $("#saved").classList.add("on"); $("span", $("#saved")).textContent = "Черновик восстановлен"; }

})();
</script>
