/* =====================================================
   BASKI MASASI — sayfa şablonları
   Tüm şablonlar milimetre birimli SVG olarak üretilir;
   böylece ekranda da PDF'te de keskin (vektör) çıkar.
===================================================== */

const PAGE_SIZES = {
    A4: { w: 210, h: 297, label: "A4" },
    A5: { w: 148, h: 210, label: "A5" },
    B5: { w: 176, h: 250, label: "B5" },
    Letter: { w: 215.9, h: 279.4, label: "Letter" }
};

const COLORS = {
    mavi: { label: "Mavi", value: "#86a9d6" },
    gri: { label: "Gri", value: "#9aa3ad" },
    acik: { label: "Açık gri", value: "#c9cfd6" },
    siyah: { label: "Siyah", value: "#3b3b3b" },
    yesil: { label: "Yeşil", value: "#86b893" },
    turuncu: { label: "Turuncu", value: "#e3a36f" }
};

const WEIGHTS = {
    ince: { label: "İnce", value: 0.12 },
    normal: { label: "Normal", value: 0.22 },
    kalin: { label: "Kalın", value: 0.38 }
};

/* Şablon tipleri: hangi ayarları desteklediklerini belirtir */
const TEMPLATE_TYPES = {
    blank: { name: "Boş sayfa", options: [] },
    grid: { name: "Kareli", options: ["spacing", "color", "weight", "margin", "header"], spacing: [3, 20] },
    lined: { name: "Çizgili", options: ["spacing", "color", "weight", "margin", "leftLine", "header"], spacing: [5, 20] },
    dots: { name: "Noktalı", options: ["spacing", "color", "margin", "header"], spacing: [3, 20] },
    mm: { name: "Milimetrik", options: ["color", "margin", "header"] },
    hand: { name: "Güzel yazı", options: ["spacing", "color", "weight", "margin", "header"], spacing: [6, 24] },
    music: { name: "Nota (porte)", options: ["spacing", "color", "weight", "margin", "header"], spacing: [1.5, 3.5] },
    cornell: { name: "Cornell not", options: ["spacing", "color", "weight", "margin"], spacing: [5, 12] }
};

/* Kütüphanede görünen hazır şablonlar */
const PRESETS = [
    { key: "blank", tpl: "blank", name: "Boş sayfa", opts: {} },
    { key: "grid5", tpl: "grid", name: "Kareli 5 mm", opts: { spacing: 5, color: "mavi", weight: "normal", margin: 8 } },
    { key: "grid10", tpl: "grid", name: "Kareli 1 cm", opts: { spacing: 10, color: "mavi", weight: "normal", margin: 8 } },
    { key: "lined8", tpl: "lined", name: "Çizgili 8 mm", opts: { spacing: 8, color: "gri", weight: "normal", margin: 10, leftLine: true } },
    { key: "lined10", tpl: "lined", name: "Geniş çizgili", opts: { spacing: 10, color: "gri", weight: "normal", margin: 10, leftLine: false } },
    { key: "dots5", tpl: "dots", name: "Noktalı", opts: { spacing: 5, color: "gri", margin: 8 } },
    { key: "mm", tpl: "mm", name: "Milimetrik", opts: { color: "turuncu", margin: 10 } },
    { key: "hand", tpl: "hand", name: "Güzel yazı", opts: { spacing: 12, color: "mavi", weight: "normal", margin: 10 } },
    { key: "music", tpl: "music", name: "Nota defteri", opts: { spacing: 2, color: "siyah", weight: "normal", margin: 12 } },
    { key: "cornell", tpl: "cornell", name: "Cornell not", opts: { spacing: 7, color: "gri", weight: "normal", margin: 10 } }
];

const r2 = (n) => Math.round(n * 100) / 100;

function colorOf(o, fallback) {
    return (COLORS[o.color] || COLORS[fallback] || COLORS.gri).value;
}

function weightOf(o) {
    return (WEIGHTS[o.weight] || WEIGHTS.normal).value;
}

function headerSvg(W, L, R, T, color) {
    const y = T + 7;
    return `<g font-family="Arial, Helvetica, sans-serif" font-size="3.4" fill="#666">`
        + `<text x="${r2(L)}" y="${r2(y)}">Ad Soyad:</text>`
        + `<text x="${r2(W * 0.62)}" y="${r2(y)}">Tarih:</text></g>`
        + `<path d="M${r2(L + 17)} ${r2(y + 0.6)}H${r2(W * 0.58)}M${r2(W * 0.62 + 11)} ${r2(y + 0.6)}H${r2(W - R)}" stroke="${color}" stroke-width="0.2" fill="none"/>`;
}

/* Kenar boşlukları (mm): her kenar ayrı ayarlanabilir; ayarlanmamışsa genel "margin" */
function marginsOf(o) {
    const m = o.margin != null ? +o.margin : 8;
    const pick = (v) => (v != null && v !== "" && isFinite(+v) ? +v : m);
    return { T: pick(o.mTop), B: pick(o.mBottom), L: pick(o.mLeft), R: pick(o.mRight) };
}

/* Bir şablonun SVG içeriğini üretir (dış <svg> etiketi hariç).
   minStroke: ekranda küçük gösterirken çizgilerin kaybolmaması için
   en ince çizgi kalınlığı (mm). Baskıda verilmez. */
function templateInner(tpl, W, H, o, minStroke) {
    o = o || {};
    // Çok küçük gösterimde çizgi kalınlığı aralığın %18'ini geçmesin (yoksa sayfa boyanmış gibi görünür)
    const gap = tpl === "mm" ? 5 : tpl === "music" ? (+o.spacing || 2) : (+o.spacing || 5);
    const ms = Math.min(minStroke || 0, gap * 0.18);
    const { T, B, L, R } = marginsOf(o);
    const color = colorOf(o, "gri");
    const sw = Math.max(weightOf(o), ms);
    const top = T + (o.header ? 14 : 0);
    const bottom = H - B;          // içeriğin bittiği y
    const left = L, right = W - R; // içeriğin başladığı/bittiği x
    const aw = Math.max(0, right - left), ah = Math.max(0, bottom - top);
    let out = o.header ? headerSvg(W, L, R, T, color) : "";

    switch (tpl) {
        case "grid": {
            const s = +o.spacing || 5;
            const cols = Math.floor(aw / s);
            const rows = Math.floor(ah / s);
            const x0 = left + (aw - cols * s) / 2;
            const y0 = top + (ah - rows * s) / 2;
            let d = "";
            for (let i = 0; i <= cols; i++) d += `M${r2(x0 + i * s)} ${r2(y0)}V${r2(y0 + rows * s)}`;
            for (let j = 0; j <= rows; j++) d += `M${r2(x0)} ${r2(y0 + j * s)}H${r2(x0 + cols * s)}`;
            out += `<path d="${d}" stroke="${color}" stroke-width="${r2(sw)}" fill="none"/>`;
            break;
        }
        case "dots": {
            const s = +o.spacing || 5;
            const cols = Math.floor(aw / s);
            const rows = Math.floor(ah / s);
            const x0 = left + (aw - cols * s) / 2;
            const y0 = top + (ah - rows * s) / 2;
            const rad = r2(Math.max(0.28, ms * 0.8));
            let c = "";
            for (let i = 0; i <= cols; i++) {
                for (let j = 0; j <= rows; j++) c += `<circle cx="${r2(x0 + i * s)}" cy="${r2(y0 + j * s)}" r="${rad}"/>`;
            }
            out += `<g fill="${color}">${c}</g>`;
            break;
        }
        case "mm": {
            const cols = Math.floor(aw / 10) * 10;
            const rows = Math.floor(ah / 10) * 10;
            const x0 = left + (aw - cols) / 2;
            const y0 = top + (ah - rows) / 2;
            const paths = ["", "", ""];
            // Ekranda çok küçükken 1 mm çizgileri çizme (gri bir leke gibi görünür)
            const skipFine = ms > 0.12;
            for (let i = 0; i <= cols; i++) {
                const k = i % 10 === 0 ? 2 : i % 5 === 0 ? 1 : 0;
                if (k || !skipFine) paths[k] += `M${r2(x0 + i)} ${r2(y0)}V${r2(y0 + rows)}`;
            }
            for (let j = 0; j <= rows; j++) {
                const k = j % 10 === 0 ? 2 : j % 5 === 0 ? 1 : 0;
                if (k || !skipFine) paths[k] += `M${r2(x0)} ${r2(y0 + j)}H${r2(x0 + cols)}`;
            }
            const widths = [0.06, 0.14, 0.28].map((w) => Math.max(w, ms));
            paths.forEach((d, k) => {
                if (d) out += `<path d="${d}" stroke="${color}" stroke-width="${r2(widths[k])}" fill="none"/>`;
            });
            break;
        }
        case "lined": {
            const s = +o.spacing || 8;
            const start = top + (o.header ? s : Math.max(s, 18 - Math.min(T, 10)));
            let d = "";
            for (let y = start; y <= bottom + 0.01; y += s) d += `M${r2(left)} ${r2(y)}H${r2(right)}`;
            out += `<path d="${d}" stroke="${color}" stroke-width="${r2(sw)}" fill="none"/>`;
            if (o.leftLine) {
                const x = left + 20;
                out += `<path d="M${r2(x)} ${r2(top)}V${r2(bottom)}" stroke="#e08a8a" stroke-width="${r2(sw * 1.2)}" fill="none"/>`;
            }
            break;
        }
        case "hand": {
            const s = +o.spacing || 12;
            const gap = s * 0.55;
            let solid = "", dashed = "", base = "";
            for (let y = top + 4; y + s <= bottom + 0.01; y += s + gap) {
                solid += `M${r2(left)} ${r2(y)}H${r2(right)}M${r2(left)} ${r2(y + s)}H${r2(right)}`;
                dashed += `M${r2(left)} ${r2(y + s / 3)}H${r2(right)}`;
                base += `M${r2(left)} ${r2(y + (2 * s) / 3)}H${r2(right)}`;
            }
            out += `<path d="${solid}" stroke="${color}" stroke-width="${r2(sw)}" fill="none"/>`;
            out += `<path d="${dashed}" stroke="${color}" stroke-width="${r2(sw)}" stroke-dasharray="1.2 1.2" fill="none"/>`;
            out += `<path d="${base}" stroke="#e08a8a" stroke-width="${r2(sw * 1.1)}" fill="none"/>`;
            break;
        }
        case "music": {
            const s = +o.spacing || 2;
            const staff = s * 4;
            const gap = Math.max(10, staff * 1.4);
            let d = "";
            for (let y = top + 6; y + staff <= bottom + 0.01; y += staff + gap) {
                for (let k = 0; k < 5; k++) d += `M${r2(left)} ${r2(y + k * s)}H${r2(right)}`;
            }
            out += `<path d="${d}" stroke="${color}" stroke-width="${r2(sw)}" fill="none"/>`;
            break;
        }
        case "cornell": {
            const s = +o.spacing || 7;
            const cueX = left + aw * 0.3;
            const titleY = T + 16;
            const summaryY = bottom - Math.min(55, H * 0.18);
            let d = `M${r2(left)} ${r2(titleY)}H${r2(right)}M${r2(left)} ${r2(summaryY)}H${r2(right)}M${r2(cueX)} ${r2(titleY)}V${r2(summaryY)}`;
            out += `<path d="${d}" stroke="${color}" stroke-width="${r2(sw * 2)}" fill="none"/>`;
            let lines = "";
            for (let y = titleY + s; y < summaryY - 0.5; y += s) lines += `M${r2(cueX + 3)} ${r2(y)}H${r2(right)}`;
            out += `<path d="${lines}" stroke="${color}" stroke-width="${r2(sw)}" fill="none"/>`;
            out += `<g font-family="Arial, Helvetica, sans-serif" font-size="3.2" fill="#888">`
                + `<text x="${r2(left)}" y="${r2(T + 5)}">Konu / Tarih</text>`
                + `<text x="${r2(left + 1)}" y="${r2(titleY + 5)}">Anahtar kelimeler</text>`
                + `<text x="${r2(left + 1)}" y="${r2(summaryY + 5)}">Özet</text></g>`;
            break;
        }
        default:
            break;
    }
    return out;
}

/* ---------- Yazı ve logo katmanları ---------- */

const FONTS = {
    arial: { label: "Arial", css: "Arial, Helvetica, sans-serif" },
    segoe: { label: "Segoe UI", css: "'Segoe UI', Arial, sans-serif" },
    verdana: { label: "Verdana", css: "Verdana, Geneva, sans-serif" },
    times: { label: "Times New Roman", css: "'Times New Roman', Times, serif" },
    georgia: { label: "Georgia", css: "Georgia, serif" },
    comic: { label: "Comic Sans (okul)", css: "'Comic Sans MS', 'Comic Neue', cursive" },
    courier: { label: "Courier New", css: "'Courier New', Courier, monospace" },
    impact: { label: "Impact (başlık)", css: "Impact, 'Arial Black', sans-serif" }
};

const PT_MM = 0.3528; // 1 punto = 0,3528 mm
const LINE_H = 1.25;

const escXml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* {s} sayfa numarası, {t} toplam sayfa */
function layerText(l, ctx) {
    return String(l.text || "").replace(/\{s\}/g, ctx && ctx.n ? ctx.n : "1").replace(/\{t\}/g, ctx && ctx.total ? ctx.total : "1");
}

/* Katmanın sayfadaki kutusu (mm) */
function layerBox(l, W, ctx) {
    let h = l.h;
    if (l.type === "text") h = Math.max(1, String(l.text || "").split("\n").length) * l.size * PT_MM * LINE_H;
    let x = l.x;
    if (ctx && ctx.mirror && l.mirror) x = W - l.x - l.w;
    return { x, y: l.y, w: l.w, h };
}

function layersSvg(layers, W, H, ctx) {
    let out = "";
    for (const l of layers || []) {
        const b = layerBox(l, W, ctx);
        const tr = l.rot ? ` transform="rotate(${r2(l.rot)} ${r2(b.x + b.w / 2)} ${r2(b.y + b.h / 2)})"` : "";
        const op = l.opacity != null && l.opacity < 1 ? ` opacity="${r2(l.opacity)}"` : "";
        if (l.type === "text") {
            const fs = l.size * PT_MM;
            const lh = fs * LINE_H;
            // Arka yüzde yansıtılan yazının hizası da ters döner (sağ ↔ sol)
            let align = l.align;
            if (ctx && ctx.mirror && l.mirror) align = align === "left" ? "right" : align === "right" ? "left" : align;
            const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
            const tx = align === "center" ? b.x + b.w / 2 : align === "right" ? b.x + b.w : b.x;
            const lines = layerText(l, ctx).split("\n");
            const spans = lines.map((ln, i) =>
                `<tspan x="${r2(tx)}" y="${r2(b.y + i * lh + (lh - fs) / 2 + fs * 0.8)}">${escXml(ln) || " "}</tspan>`).join("");
            const font = (FONTS[l.font] || FONTS.arial).css;
            out += `<text font-family="${font}" font-size="${r2(fs)}" fill="${escXml(l.color || "#222")}"`
                + `${l.bold ? ' font-weight="bold"' : ""}${l.italic ? ' font-style="italic"' : ""} text-anchor="${anchor}" xml:space="preserve"${tr}${op}>${spans}</text>`;
        } else if (l.url) {
            out += `<image href="${l.url}" x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" preserveAspectRatio="xMidYMid meet"${tr}${op}/>`;
        }
    }
    return out;
}

/* Görseli W×H kutusuna, istenen açıyla (0/90/180/270) yerleştirir */
function imageInner(page, W, H) {
    const par = page.fit === "contain" ? "xMidYMid meet" : page.fit === "stretch" ? "none" : "xMidYMid slice";
    let r = (((page.turn || 0) % 360) + 360) % 360;
    // Yatay kaynak dikey kağıda (veya tersi) gelirse ek olarak 90° döndür
    if (page.rotate && page.w && page.h) {
        const landscapeSrc = r % 180 ? page.h > page.w : page.w > page.h;
        if (landscapeSrc !== (W > H)) r = (r + 90) % 360;
    }
    const sideways = r % 180 !== 0;
    const bw = sideways ? H : W;
    const bh = sideways ? W : H;
    const tr = { 0: "", 90: `translate(${W} 0) rotate(90)`, 180: `translate(${W} ${H}) rotate(180)`, 270: `translate(0 ${H}) rotate(270)` }[r];
    const img = `<image href="${page.image}" x="0" y="0" width="${bw}" height="${bh}" preserveAspectRatio="${par}"/>`;
    return tr ? `<g transform="${tr}">${img}</g>` : img;
}

/* Bir sayfayı tam SVG olarak üretir.
   page:   { kind: 'tpl'|'img'|'blank', tpl, opts, image, fit, turn, rotate, w, h, inset }
   gutter: { side: 'left'|'right'|'top'|'bottom', size } — spiral payı.
           Şablonlar ve PDF sayfaları bu payın dışına yerleşir; kapak
           görselleri (inset olmayan) kağıdı kenardan kenara doldurur. */
function pageSvg(page, W, H, extraAttrs, gutter, view) {
    let x = 0, y = 0, cw = W, ch = H;
    const useGutter = gutter && gutter.size > 0 && (page.kind === "tpl" || page.inset);
    if (useGutter) {
        const g = Math.min(gutter.size, Math.min(W, H) / 4);
        const horiz = gutter.side === "left" || gutter.side === "right";
        if (gutter.both) {
            // Her sayfada iki yanda (veya üst-altta) aynı pay: sayfalar kaymaz
            if (horiz) { x = g; cw -= 2 * g; } else { y = g; ch -= 2 * g; }
        } else {
            if (gutter.side === "left") { x = g; cw -= g; }
            if (gutter.side === "right") { cw -= g; }
            if (gutter.side === "top") { y = g; ch -= g; }
            if (gutter.side === "bottom") { ch -= g; }
        }
    }
    // Ekran görünümü: piksel başına mm'ye göre en ince çizgi (yaklaşık 0,9 piksel)
    const minStroke = view && view.pxPerMm ? 0.9 / view.pxPerMm : 0;
    let inner = "";
    if (page.kind === "tpl") inner = templateInner(page.tpl, cw, ch, page.opts, minStroke);
    else if (page.kind === "img" && page.image) inner = imageInner(page, cw, ch);
    if (inner && useGutter) inner = `<svg x="${r2(x)}" y="${r2(y)}" width="${r2(cw)}" height="${r2(ch)}" viewBox="0 0 ${r2(cw)} ${r2(ch)}">${inner}</svg>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ${extraAttrs || ""}>`
        + `<rect width="${W}" height="${H}" fill="#fff"/>${inner}${page.layers ? layersSvg(page.layers, W, H, page.ctx) : ""}</svg>`;
}

window.BM_TEMPLATES = { marginsOf, PAGE_SIZES, COLORS, WEIGHTS, TEMPLATE_TYPES, PRESETS, FONTS, PT_MM, templateInner, pageSvg, layersSvg, layerBox };
