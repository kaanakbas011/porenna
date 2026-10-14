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

function headerSvg(W, m, color) {
    const y = m + 7;
    return `<g font-family="Arial, Helvetica, sans-serif" font-size="3.4" fill="#666">`
        + `<text x="${m}" y="${y}">Ad Soyad:</text>`
        + `<text x="${r2(W * 0.62)}" y="${y}">Tarih:</text></g>`
        + `<path d="M${r2(m + 17)} ${r2(y + 0.6)}H${r2(W * 0.58)}M${r2(W * 0.62 + 11)} ${r2(y + 0.6)}H${r2(W - m)}" stroke="${color}" stroke-width="0.2" fill="none"/>`;
}

/* Bir şablonun SVG içeriğini üretir (dış <svg> etiketi hariç) */
function templateInner(tpl, W, H, o) {
    o = o || {};
    const m = o.margin != null ? +o.margin : 8;
    const color = colorOf(o, "gri");
    const sw = weightOf(o);
    const top = m + (o.header ? 14 : 0);
    let out = o.header ? headerSvg(W, m, color) : "";

    switch (tpl) {
        case "grid": {
            const s = +o.spacing || 5;
            const cols = Math.floor((W - 2 * m) / s);
            const rows = Math.floor((H - m - top) / s);
            const x0 = (W - cols * s) / 2;
            const y0 = top + ((H - m - top) - rows * s) / 2;
            let d = "";
            for (let i = 0; i <= cols; i++) d += `M${r2(x0 + i * s)} ${r2(y0)}V${r2(y0 + rows * s)}`;
            for (let j = 0; j <= rows; j++) d += `M${r2(x0)} ${r2(y0 + j * s)}H${r2(x0 + cols * s)}`;
            out += `<path d="${d}" stroke="${color}" stroke-width="${sw}" fill="none"/>`;
            break;
        }
        case "dots": {
            const s = +o.spacing || 5;
            const cols = Math.floor((W - 2 * m) / s);
            const rows = Math.floor((H - m - top) / s);
            const x0 = (W - cols * s) / 2;
            const y0 = top + ((H - m - top) - rows * s) / 2;
            let c = "";
            for (let i = 0; i <= cols; i++) {
                for (let j = 0; j <= rows; j++) c += `<circle cx="${r2(x0 + i * s)}" cy="${r2(y0 + j * s)}" r="0.28"/>`;
            }
            out += `<g fill="${color}">${c}</g>`;
            break;
        }
        case "mm": {
            const cols = Math.floor((W - 2 * m) / 10) * 10;
            const rows = Math.floor((H - m - top) / 10) * 10;
            const x0 = (W - cols) / 2;
            const y0 = top + ((H - m - top) - rows) / 2;
            const paths = ["", "", ""];
            for (let i = 0; i <= cols; i++) {
                const k = i % 10 === 0 ? 2 : i % 5 === 0 ? 1 : 0;
                paths[k] += `M${r2(x0 + i)} ${r2(y0)}V${r2(y0 + rows)}`;
            }
            for (let j = 0; j <= rows; j++) {
                const k = j % 10 === 0 ? 2 : j % 5 === 0 ? 1 : 0;
                paths[k] += `M${r2(x0)} ${r2(y0 + j)}H${r2(x0 + cols)}`;
            }
            const widths = [0.06, 0.14, 0.28];
            paths.forEach((d, k) => {
                out += `<path d="${d}" stroke="${color}" stroke-width="${widths[k]}" fill="none"/>`;
            });
            break;
        }
        case "lined": {
            const s = +o.spacing || 8;
            const start = top + (o.header ? s : Math.max(s, 18));
            let d = "";
            for (let y = start; y <= H - m + 0.01; y += s) d += `M${r2(m)} ${r2(y)}H${r2(W - m)}`;
            out += `<path d="${d}" stroke="${color}" stroke-width="${sw}" fill="none"/>`;
            if (o.leftLine) {
                const x = m + 20;
                out += `<path d="M${r2(x)} ${r2(top)}V${r2(H - m)}" stroke="#e08a8a" stroke-width="${r2(sw * 1.2)}" fill="none"/>`;
            }
            break;
        }
        case "hand": {
            const s = +o.spacing || 12;
            const gap = s * 0.55;
            let solid = "", dashed = "", base = "";
            for (let y = top + 4; y + s <= H - m + 0.01; y += s + gap) {
                solid += `M${r2(m)} ${r2(y)}H${r2(W - m)}M${r2(m)} ${r2(y + s)}H${r2(W - m)}`;
                dashed += `M${r2(m)} ${r2(y + s / 3)}H${r2(W - m)}`;
                base += `M${r2(m)} ${r2(y + (2 * s) / 3)}H${r2(W - m)}`;
            }
            out += `<path d="${solid}" stroke="${color}" stroke-width="${sw}" fill="none"/>`;
            out += `<path d="${dashed}" stroke="${color}" stroke-width="${sw}" stroke-dasharray="1.2 1.2" fill="none"/>`;
            out += `<path d="${base}" stroke="#e08a8a" stroke-width="${r2(sw * 1.1)}" fill="none"/>`;
            break;
        }
        case "music": {
            const s = +o.spacing || 2;
            const staff = s * 4;
            const gap = Math.max(10, staff * 1.4);
            let d = "";
            for (let y = top + 6; y + staff <= H - m + 0.01; y += staff + gap) {
                for (let k = 0; k < 5; k++) d += `M${r2(m)} ${r2(y + k * s)}H${r2(W - m)}`;
            }
            out += `<path d="${d}" stroke="${color}" stroke-width="${sw}" fill="none"/>`;
            break;
        }
        case "cornell": {
            const s = +o.spacing || 7;
            const cueX = m + (W - 2 * m) * 0.3;
            const titleY = m + 16;
            const summaryY = H - m - Math.min(55, H * 0.18);
            let d = `M${r2(m)} ${r2(titleY)}H${r2(W - m)}M${r2(m)} ${r2(summaryY)}H${r2(W - m)}M${r2(cueX)} ${r2(titleY)}V${r2(summaryY)}`;
            out += `<path d="${d}" stroke="${color}" stroke-width="${r2(sw * 2)}" fill="none"/>`;
            let lines = "";
            for (let y = titleY + s; y < summaryY - 0.5; y += s) lines += `M${r2(cueX + 3)} ${r2(y)}H${r2(W - m)}`;
            out += `<path d="${lines}" stroke="${color}" stroke-width="${sw}" fill="none"/>`;
            out += `<g font-family="Arial, Helvetica, sans-serif" font-size="3.2" fill="#888">`
                + `<text x="${r2(m)}" y="${r2(m + 5)}">Konu / Tarih</text>`
                + `<text x="${r2(m + 1)}" y="${r2(titleY + 5)}">Anahtar kelimeler</text>`
                + `<text x="${r2(m + 1)}" y="${r2(summaryY + 5)}">Özet</text></g>`;
            break;
        }
        default:
            break;
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
function pageSvg(page, W, H, extraAttrs, gutter) {
    let x = 0, y = 0, cw = W, ch = H;
    const useGutter = gutter && gutter.size > 0 && (page.kind === "tpl" || page.inset);
    if (useGutter) {
        const g = Math.min(gutter.size, Math.min(W, H) / 3);
        if (gutter.side === "left") { x = g; cw -= g; }
        if (gutter.side === "right") { cw -= g; }
        if (gutter.side === "top") { y = g; ch -= g; }
        if (gutter.side === "bottom") { ch -= g; }
    }
    let inner = "";
    if (page.kind === "tpl") inner = templateInner(page.tpl, cw, ch, page.opts);
    else if (page.kind === "img" && page.image) inner = imageInner(page, cw, ch);
    if (inner && useGutter) inner = `<svg x="${r2(x)}" y="${r2(y)}" width="${r2(cw)}" height="${r2(ch)}" viewBox="0 0 ${r2(cw)} ${r2(ch)}">${inner}</svg>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ${extraAttrs || ""}>`
        + `<rect width="${W}" height="${H}" fill="#fff"/>${inner}</svg>`;
}

window.BM_TEMPLATES = { PAGE_SIZES, COLORS, WEIGHTS, TEMPLATE_TYPES, PRESETS, templateInner, pageSvg };
