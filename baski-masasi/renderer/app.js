/* =====================================================
   BASKI MASASI — uygulama mantığı
===================================================== */

(() => {
    const { PAGE_SIZES, COLORS, WEIGHTS, TEMPLATE_TYPES, PRESETS, pageSvg, marginsOf } = window.BM_TEMPLATES;
    const desktop = window.desktop || null; // Electron köprüsü (tarayıcıda yok)

    const $ = (sel) => document.querySelector(sel);
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const uid = () => Math.random().toString(36).slice(2, 10);
    const clone = (o) => JSON.parse(JSON.stringify(o));

    /* ---------------- STATE ---------------- */

    const state = {
        pageSize: "A4",
        orient: "portrait",
        duplex: true,
        binding: "side",   // side | top | booklet | none
        gutter: 10,        // spiral payı (mm)
        gutterMode: "both", // both: her sayfada iki yanda aynı (kaymaz) | mirror: sadece delik tarafında
        signature: 0,      // kitapçıkta forma başına kağıt (0 = tek forma)
        blocks: [],
        selected: null
    };

    const BINDINGS = {
        side: { name: "Yandan spiral", short: "Yandan spiral" },
        top: { name: "Üstten spiral", short: "Üstten spiral" },
        booklet: { name: "Kitapçık (ortadan zımba)", short: "Kitapçık" },
        none: { name: "Ciltsiz / tek yaprak", short: "Ciltsiz" }
    };

    /* Kitapçıkta iki sayfanın yan yana basılacağı kağıt */
    const BOOKLET_PAPER = {
        A5: { w: 297, h: 210, label: "A4" },
        A4: { w: 420, h: 297, label: "A3" },
        B5: { w: 353, h: 250, label: "B4" },
        Letter: { w: 431.8, h: 279.4, label: "Tabloid" }
    };

    const isBooklet = () => state.binding === "booklet";
    const isSpiral = () => state.binding === "side" || state.binding === "top";
    const images = new Map(); // id -> { id, name, url, thumb, w, h }
    const pdfs = new Map(); // id -> { id, name, pages: [{ url, thumb, w, h }] }

    function emptyBlock(label) {
        return { id: uid(), kind: "empty", label: label || "", count: 1, backBlank: false };
    }

    function defaultDoc() {
        state.blocks = [emptyBlock("Ön kapak"), emptyBlock("İç sayfalar"), emptyBlock("Arka kapak")];
        state.selected = null;
    }

    /* ---------------- UNDO / REDO ---------------- */

    const undoStack = [];
    const redoStack = [];

    function snapshot() {
        return JSON.stringify({
            pageSize: state.pageSize, orient: state.orient, duplex: state.duplex,
            binding: state.binding, gutter: state.gutter, gutterMode: state.gutterMode, signature: state.signature, blocks: state.blocks
        });
    }

    function restore(snap) {
        const s = JSON.parse(snap);
        Object.assign(state, s);
        if (!state.blocks.some((b) => b.id === state.selected)) state.selected = null;
    }

    /* Her değişiklikten önce çağrılır */
    function commit() {
        undoStack.push(snapshot());
        if (undoStack.length > 150) undoStack.shift();
        redoStack.length = 0;
    }

    function undo() {
        if (!undoStack.length) return;
        redoStack.push(snapshot());
        restore(undoStack.pop());
        render();
    }

    function redo() {
        if (!redoStack.length) return;
        undoStack.push(snapshot());
        restore(redoStack.pop());
        render();
    }

    /* ---------------- YARDIMCILAR ---------------- */

    function pageDims() {
        const p = PAGE_SIZES[state.pageSize];
        // Kitapçık sayfaları her zaman dikeydir
        return state.orient === "landscape" && !isBooklet() ? { W: p.h, H: p.w } : { W: p.w, H: p.h };
    }

    function blockName(b) {
        if (b.kind === "empty") return b.label || "Boş yer";
        if (b.kind === "tpl") {
            const preset = PRESETS.find((p) => p.key === b.presetKey);
            return (preset && preset.name) || TEMPLATE_TYPES[b.tpl].name;
        }
        if (b.kind === "img") {
            const im = images.get(b.imageId);
            return im ? im.name : "Görsel";
        }
        if (b.kind === "pdf") {
            const doc = pdfs.get(b.pdfId);
            if (!doc) return "PDF";
            return doc.pages.length > 1 ? `${doc.name} (s. ${b.from}–${b.to})` : doc.name;
        }
        return "?";
    }

    /* Logoların görsel adreslerini çözer */
    function resolveLayers(layers, useThumb) {
        return (layers || []).map((l) => {
            if (l.type !== "logo") return l;
            const im = images.get(l.imageId);
            return Object.assign({}, l, { url: im ? (useThumb ? im.thumb : im.url) : null });
        });
    }

    /* Sayfa + üstündeki yazı/logo katmanları.
       ctx: { n: sayfa no, total, mirror: arka yüzde yansıt } */
    function blockPage(b, useThumb, pi, ctx) {
        const page = blockContent(b, useThumb, pi);
        if (b.layers && b.layers.length) {
            page.layers = resolveLayers(b.layers, useThumb);
            page.ctx = ctx || { n: 1, total: 1 };
        }
        return page;
    }

    /* pi: PDF bloklarında belgenin kaçıncı sayfası (0 tabanlı) */
    function blockContent(b, useThumb, pi) {
        if (b.kind === "tpl") return { kind: "tpl", tpl: b.tpl, opts: b.opts };
        if (b.kind === "img") {
            const im = images.get(b.imageId);
            return { kind: "img", image: im ? (useThumb ? im.thumb : im.url) : null, fit: b.fit, turn: b.turn };
        }
        if (b.kind === "pdf") {
            const doc = pdfs.get(b.pdfId);
            const pg = doc && doc.pages[pi != null ? pi : b.from - 1];
            if (!pg) return { kind: "blank" };
            return { kind: "img", image: useThumb ? pg.thumb : pg.url, fit: b.fit, rotate: b.rotate, turn: b.turn, w: pg.w, h: pg.h, inset: true };
        }
        return { kind: "blank" };
    }

    /* Bir bloğun bastığı sayfalar (pdf için belge sayfa indeksleri) */
    function blockPageIndexes(b) {
        const count = Math.max(1, b.count | 0);
        const out = [];
        if (b.kind === "pdf") {
            for (let r = 0; r < count; r++) for (let i = b.from - 1; i < b.to; i++) out.push(i);
        } else {
            for (let i = 0; i < count; i++) out.push(null);
        }
        return out;
    }

    function contentFromPayload(p) {
        if (p.type === "preset") {
            const preset = PRESETS.find((x) => x.key === p.key);
            return { kind: "tpl", tpl: preset.tpl, presetKey: preset.key, opts: clone(preset.opts) };
        }
        if (p.type === "image") return { kind: "img", imageId: p.id, fit: "cover" };
        if (p.type === "slot") return { kind: "empty" };
        if (p.type === "pdf") {
            const doc = pdfs.get(p.id);
            const from = p.page || 1;
            const to = p.page || doc.pages.length;
            return { kind: "pdf", pdfId: p.id, from, to, fit: "contain", rotate: true };
        }
        return null;
    }

    function applyContent(b, content) {
        delete b.tpl; delete b.presetKey; delete b.opts; delete b.imageId; delete b.fit;
        delete b.pdfId; delete b.from; delete b.to; delete b.rotate; delete b.turn;
        Object.assign(b, content);
    }

    function newBlockFrom(payload) {
        const b = emptyBlock(payload.type === "slot" ? "Sayfa" : "");
        applyContent(b, contentFromPayload(payload));
        return b;
    }

    function indexOf(id) {
        return state.blocks.findIndex((b) => b.id === id);
    }

    /* ---------------- SAYFA DÜZENİ / BASKI PLANI ----------------
       Blokları gerçek sayfa listesine açar. Arkalı önlü modda
       "arkası boş" işaretli sayfaların önüne/arkasına otomatik boş
       sayfa eklenir. */
    function flatten(duplex) {
        const pages = [];
        for (const b of state.blocks) {
            blockPageIndexes(b).forEach((pi, occ) => {
                if (duplex && b.backBlank && pages.length % 2 === 1) pages.push({ auto: true });
                pages.push({ block: b, pi, occ });
                if (duplex && b.backBlank) pages.push({ auto: true });
            });
        }
        return pages;
    }

    const isCoverish = (p) => p && p.block && (p.block.kind === "img" || /arka/i.test(p.block.label || ""));

    function analyze() {
        const booklet = isBooklet();
        const duplex = booklet || state.duplex;
        const pages = flatten(duplex);
        const warnings = [];
        let pad = 0;
        if (booklet && pages.length) {
            // Kitapçıkta sayfa sayısı 4'ün katı olmalı; boşlukları arka kapaktan önceye koy
            pad = (4 - (pages.length % 4)) % 4;
            const blanks = Array.from({ length: pad }, () => ({ auto: true, pad: true }));
            if (pages.length > 1 && isCoverish(pages[pages.length - 1])) pages.splice(pages.length - 1, 0, ...blanks);
            else pages.push(...blanks);
            if (pad) warnings.push({ level: "info", text: `Kitapçık için sayfa sayısı 4'ün katı olmalı: ${pad} boş sayfa otomatik eklendi${isCoverish(pages[pages.length - 1]) ? " (arka kapaktan önce)" : ""}.` });
        }
        const ranges = new Map();
        pages.forEach((p, i) => {
            if (!p.block) return;
            if (!ranges.has(p.block.id)) ranges.set(p.block.id, []);
            ranges.get(p.block.id).push(i);
        });
        const empties = state.blocks.filter((b) => b.kind === "empty");
        if (empties.length) {
            warnings.push({
                level: "warn",
                text: `${empties.length} temsili yer hâlâ boş. Boş sayfa olarak basılır.`,
                fix: empties.length ? { label: "İlk boş yeri seç", action: () => select(empties[0].id) } : null
            });
        }
        if (duplex && pages.length > 1) {
            const lastIsCoverish = isCoverish(pages[pages.length - 1]);
            if (!booklet && pages.length % 2 === 1) {
                if (lastIsCoverish) {
                    warnings.push({
                        level: "error",
                        text: "Arka kapak bir yaprağın ÖN yüzüne düşüyor. Kitapçığın arkasında değil, son kağıdın önünde çıkar.",
                        fix: { label: "Önüne 1 boş sayfa ekle", action: () => insertBlankBeforeLast() }
                    });
                } else {
                    warnings.push({ level: "info", text: "Sayfa sayısı tek. Son yaprağın arka yüzü boş kalacak." });
                }
            }
            const first = state.blocks[0];
            if (first && first.kind === "img" && !first.backBlank && first.count === 1 && pages.length > 2) {
                warnings.push({
                    level: "info",
                    text: "Ön kapağın arkasına 2. sayfa basılacak. Kapağın arkası boş kalsın istiyorsanız işaretleyin.",
                    fix: { label: "Kapağın arkası boş kalsın", action: () => { commit(); first.backBlank = true; render(); } }
                });
            }
        }
        return { pages, ranges, warnings, duplex, booklet, pad };
    }

    /* Spiral payı hangi kenarda: ön yüzde cilt tarafı, arka yüzde tam tersi */
    function gutterFor(i, duplex) {
        if (!isSpiral() || !(state.gutter > 0)) return null;
        if (state.gutterMode !== "mirror") return { side: state.binding === "side" ? "left" : "top", size: state.gutter, both: true };
        const back = duplex && i % 2 === 1;
        if (state.binding === "side") return { side: back ? "right" : "left", size: state.gutter };
        return { side: back ? "bottom" : "top", size: state.gutter };
    }

    function pageOf(p, useThumb, ctx) {
        return p && p.block ? blockPage(p.block, useThumb, p.pi, ctx) : { kind: "blank" };
    }

    /* Arka yüzde (veya kitapçığın sol sayfasında) yansıtma yapılır mı */
    function mirrorAt(i, info) {
        return state.binding !== "top" && (info.duplex || info.booklet) && i % 2 === 1;
    }

    function ctxFor(i, info) {
        return { n: i + 1, total: info.pages.length, mirror: mirrorAt(i, info) };
    }

    /* Kitapçık dizgisi: her kağıdın ön ve arka yüzüne ikişer sayfa.
       8 sayfa için: 1. kağıt ön 8|1, arka 2|7 — 2. kağıt ön 6|3, arka 4|5 */
    function impose(pages) {
        const sides = [];
        const per = state.signature > 0 ? state.signature * 4 : pages.length;
        let forma = 0;
        for (let start = 0; start < pages.length; start += per, forma++) {
            const chunk = pages.slice(start, start + per);
            const n = chunk.length;
            for (let s = 0; s < n / 4; s++) {
                const no = (i) => start + i + 1;
                sides.push({ kind: "spread", forma, left: chunk[n - 1 - 2 * s], right: chunk[2 * s], nums: [no(n - 1 - 2 * s), no(2 * s)] });
                sides.push({ kind: "spread", forma, left: chunk[2 * s + 1], right: chunk[n - 2 - 2 * s], nums: [no(2 * s + 1), no(n - 2 - 2 * s)] });
            }
        }
        return sides;
    }

    /* Kağıda basılacak fiziksel yüzler ve kağıt boyu */
    function buildSides(info) {
        const { W, H } = pageDims();
        if (info.booklet) {
            const paper = BOOKLET_PAPER[state.pageSize];
            return { W, H, SW: Math.max(2 * W, paper.w), SH: Math.max(H, paper.h), sides: impose(info.pages), info };
        }
        return {
            W, H, SW: W, SH: H, info,
            sides: info.pages.map((p, i) => ({ kind: "page", p, i, gutter: gutterFor(i, info.duplex) }))
        };
    }

    /* Önerilen arkalı önlü çevirme yönü (kağıdın yönüne göre) */
    function recommendedMode() {
        const { SW, SH } = buildSides({ pages: [], booklet: isBooklet() });
        const portraitSheet = SH >= SW;
        if (isBooklet()) return "shortEdge"; // yatay kağıt, katlama yeri kısa kenar ortasında
        if (state.binding === "top") return portraitSheet ? "shortEdge" : "longEdge";
        if (state.binding === "side") return portraitSheet ? "longEdge" : "shortEdge";
        return state.duplex ? (portraitSheet ? "longEdge" : "shortEdge") : "simplex";
    }

    function insertBlankBeforeLast() {
        commit();
        const b = emptyBlock("");
        applyContent(b, { kind: "tpl", tpl: "blank", presetKey: "blank", opts: {} });
        state.blocks.splice(Math.max(0, state.blocks.length - 1), 0, b);
        render();
        toast("Arka kapağın önüne boş sayfa eklendi.");
    }

    /* ---------------- RENDER ---------------- */

    function render() {
        if (preview && preview.isOpen()) preview.refresh();
        renderTop();
        renderLibraryImages();
        const info = analyze();
        renderBoard(info);
        renderProps(info);
        renderPlan(info);
    }

    function renderTop() {
        $("#pageSize").value = state.pageSize;
        document.querySelectorAll("#orient button").forEach((b) => {
            b.classList.toggle("on", b.dataset.v === (isBooklet() ? "portrait" : state.orient));
            b.disabled = isBooklet();
        });
        $("#bindBtn").innerHTML = `${bindIcon(state.binding, 18)} <span>${BINDINGS[state.binding].short}</span>`;
        $("#undoBtn").disabled = !undoStack.length;
        $("#redoBtn").disabled = !redoStack.length;
    }

    function sheetSvg(page) {
        const { W, H } = pageDims();
        // Kart küçük gösterildiği için ince çizgiler kaybolmasın
        return pageSvg(page, W, H, 'preserveAspectRatio="xMidYMid meet"', null, { pxPerMm: (W > H ? 178 : 138) / W });
    }

    let rangeDuplex = true;

    function rangeLabel(idx) {
        if (!idx || !idx.length) return "";
        const side = (i) => (rangeDuplex ? (i % 2 === 0 ? " · ön" : " · arka") : "");
        if (idx.length === 1) return `s. ${idx[0] + 1}${side(idx[0])}`;
        return `s. ${idx[0] + 1}–${idx[idx.length - 1] + 1}`;
    }

    function firstCtx(b, info) {
        const idx = info.ranges.get(b.id);
        return idx && idx.length ? ctxFor(idx[0], info) : { n: 1, total: info.pages.length };
    }

    function renderBoard(info) {
        rangeDuplex = info.duplex && !info.booklet;
        const { W, H } = pageDims();
        const board = $("#board");
        board.style.setProperty("--ratio", `${W} / ${H}`);
        board.style.setProperty("--card-w", W > H ? "190px" : "150px");

        let html = "";
        state.blocks.forEach((b) => {
            const sel = b.id === state.selected ? " selected" : "";
            const empty = b.kind === "empty";
            const nPages = blockPageIndexes(b).length;
            const many = nPages > 1;
            const badge = b.kind === "pdf"
                ? `${b.to - b.from + 1} s.${b.count > 1 ? " ×" + b.count : ""}`
                : `×${b.count}`;
            const thumb = empty && !(b.layers && b.layers.length)
                ? `<div class="placeholder"><span>${esc(b.label || "Boş yer")}</span><small>Şablon veya görsel sürükleyin</small></div>`
                : sheetSvg(blockPage(b, true, undefined, firstCtx(b, info)));
            html += `<div class="card${sel}${empty ? " empty" : ""}" draggable="true" data-id="${b.id}">
                <div class="card-top">
                    <span class="pg">${rangeLabel(info.ranges.get(b.id))}</span>
                    ${b.kind === "pdf" ? '<span class="flag pdf">PDF</span>' : ""}
                    ${b.layers && b.layers.length ? `<span class="flag txt" title="Yazı / logo var">✎${b.layers.length}</span>` : ""}
                    ${b.backBlank ? '<span class="flag" title="Arkalı önlü baskıda arkası boş">arkası boş</span>' : ""}
                    <button class="icon-btn del" data-del="${b.id}" title="Sil">×</button>
                </div>
                <div class="sheet-wrap${many ? " stack" : ""}">
                    <div class="sheet">${thumb}</div>
                    ${many ? `<span class="badge">${badge}</span>` : ""}
                </div>
                <div class="card-name">
                    ${b.label && !empty ? `<span class="tag">${esc(b.label)}</span>` : ""}
                    <span>${esc(empty ? "Boş yer" : blockName(b))}</span>
                </div>
            </div>`;
        });
        html += `<div class="card add-card" data-add="1">
            <div class="sheet-wrap"><div class="sheet add-sheet"><span>+</span><small>Sayfa yeri ekle<br>veya buraya sürükleyin</small></div></div>
        </div>`;
        board.innerHTML = html;

        const n = info.pages.length;
        const paper = info.booklet ? n / 4 : info.duplex ? Math.ceil(n / 2) : n;
        const kind = info.booklet ? `kitapçık (${BOOKLET_PAPER[state.pageSize].label} kağıda)` : info.duplex ? "arkalı önlü" : "tek yüz";
        $("#boardStats").innerHTML = `<b>${n}</b> sayfa <span class="dot">•</span> <b>${paper}</b> kağıt <span class="dot">•</span> ${kind}`;
    }

    function renderLibraryImages() {
        const wrap = $("#imageTiles");
        wrap.innerHTML = [...pdfs.values()].map((d) => `
            <div class="tile pdf-tile" draggable="true" data-pdf="${d.id}" title="${esc(d.name)} — ${d.pages.length} sayfa">
                <div class="tile-thumb"><img src="${d.pages[0].thumb}" alt=""><span class="pdf-count">PDF · ${d.pages.length} s.</span></div>
                <span>${esc(d.name)}</span>
                <button class="icon-btn rm" data-rmpdf="${d.id}" title="Kütüphaneden kaldır">×</button>
            </div>`).join("") + [...images.values()].filter((im) => !im.hidden).map((im) => `
            <div class="tile img-tile" draggable="true" data-image="${im.id}" title="${esc(im.name)}">
                <div class="tile-thumb"><img src="${im.thumb}" alt=""></div>
                <span>${esc(im.name)}</span>
                <button class="icon-btn rm" data-rmimg="${im.id}" title="Kütüphaneden kaldır">×</button>
            </div>`).join("");
    }

    function renderPresets() {
        const { W, H } = { W: 210, H: 297 };
        $("#presetTiles").innerHTML = PRESETS.map((p) => `
            <div class="tile" draggable="true" data-preset="${p.key}" title="${esc(p.name)}">
                <div class="tile-thumb">${pageSvg({ kind: "tpl", tpl: p.tpl, opts: p.opts }, W, H, "", null, { pxPerMm: 95 / W })}</div>
                <span>${esc(p.name)}</span>
            </div>`).join("");
        $("#textTiles").innerHTML = `
            <div class="tile tool-tile" draggable="true" data-tool="text" title="Sayfaya yazı ekle">
                <div class="tool-ico">T</div><span>Yazı ekle</span></div>
            <div class="tile tool-tile" draggable="true" data-tool="logo" title="Sayfaya logo ekle">
                <div class="tool-ico">▣</div><span>Logo ekle</span></div>
            <div class="tile tool-tile wide" data-tool="pagenum" title="Kapaklar hariç tüm sayfalara sayfa numarası ekler">
                <div class="tool-ico small">1 2 3</div><span>Sayfa numarası ekle</span></div>`;
        $("#slotTiles").innerHTML = `
            <div class="tile slot-tile" draggable="true" data-slot="1" title="Temsili sayfa yeri">
                <div class="tile-thumb"><div class="placeholder mini"><span>?</span></div></div>
                <span>Boş sayfa yeri</span>
            </div>`;
    }

    /* ---- Sağ panel: seçili sayfa ayarları ---- */

    function renderProps(info) {
        const el = $("#props");
        const b = state.blocks.find((x) => x.id === state.selected);
        if (!b) {
            el.innerHTML = `
                <h3>Nasıl çalışır?</h3>
                <ol class="howto">
                    <li>Soldan <b>şablon</b> ya da <b>kapak görseli</b> sürükleyip ortadaki sayfa yerlerine bırakın.</li>
                    <li>Bir sayfaya tıklayın, <b>adet</b> girin (ör. kareliyi 45 sayfa yapın).</li>
                    <li>Araya sayfa eklemek için kartın <b>kenarına</b> bırakın.</li>
                    <li>Sağ alttaki <b>baskı planı</b> hangi sayfanın hangi kağıdın önüne/arkasına geleceğini gösterir.</li>
                    <li><b>PDF kaydet</b> veya <b>Yazdır</b>.</li>
                </ol>`;
            return;
        }
        const idx = info.ranges.get(b.id) || [];
        const t = b.kind === "tpl" ? TEMPLATE_TYPES[b.tpl] : null;
        const has = (k) => t && t.options.includes(k);
        const o = b.opts || {};

        let h = `<div class="props-head">
            <h3>${esc(blockName(b))}</h3>
            <span class="muted">${rangeLabel(idx)}</span>
        </div>`;

        h += `<label class="field">Etiket <small>(isteğe bağlı, ör. “Ön kapak”)</small>
            <input type="text" data-prop="label" value="${esc(b.label)}" placeholder="Etiket">
        </label>`;

        if (b.kind === "pdf") {
            const doc = pdfs.get(b.pdfId);
            const n = doc ? doc.pages.length : 1;
            h += `<div class="field">PDF sayfa aralığı <small>(belgede ${n} sayfa var)</small>
                <div class="range-pair">
                    <input type="number" min="1" max="${n}" data-prop="from" value="${b.from}">
                    <span>–</span>
                    <input type="number" min="1" max="${n}" data-prop="to" value="${b.to}">
                    <button class="btn small" data-act="allpages">Tümü</button>
                </div>
            </div>`;
        }

        h += `<div class="field">${b.kind === "pdf" ? "Kaç kez basılsın" : "Sayfa adedi"}
            <div class="stepper">
                <button data-step="-1">−</button>
                <input type="number" min="1" max="2000" data-prop="count" value="${b.count}">
                <button data-step="1">+</button>
            </div>
            <div class="chips">${(b.kind === "pdf" ? [1, 2, 3, 5, 10, 20, 30] : [1, 10, 20, 40, 45, 50, 100]).map((n) => `<button class="chip${b.count === n ? " on" : ""}" data-count="${n}">${n}</button>`).join("")}</div>
        </div>`;

        if (b.kind === "empty") {
            h += `<p class="note">Bu bir <b>temsili yer</b>. Soldan bir şablon ya da görsel sürükleyip bırakın.</p>`;
        }

        if (t && t.options.length) {
            h += `<div class="group-title">Şablon ayarları</div>`;
            if (has("spacing")) {
                const [mn, mx] = t.spacing;
                h += `<label class="field">${b.tpl === "music" ? "Porte çizgi aralığı" : b.tpl === "hand" ? "Satır yüksekliği" : "Aralık"} (mm)
                    <div class="range-row"><input type="range" min="${mn}" max="${mx}" step="0.5" data-prop="opts.spacing" value="${o.spacing}">
                    <input type="number" min="${mn}" max="${mx}" step="0.5" data-prop="opts.spacing" value="${o.spacing}"></div>
                </label>`;
            }
            if (has("color")) {
                h += `<div class="field">Renk<div class="swatches">${Object.entries(COLORS).map(([k, c]) =>
                    `<button class="swatch${o.color === k ? " on" : ""}" data-color="${k}" title="${c.label}" style="--c:${c.value}"></button>`).join("")}</div></div>`;
            }
            if (has("weight")) {
                h += `<div class="field">Çizgi kalınlığı<div class="seg small">${Object.entries(WEIGHTS).map(([k, w]) =>
                    `<button class="${(o.weight || "normal") === k ? "on" : ""}" data-weight="${k}">${w.label}</button>`).join("")}</div></div>`;
            }
            if (has("margin")) {
                const mg = marginsOf(o);
                h += `<div class="field">Kenar boşlukları (mm)
                    <div class="margins">
                        <label>Üst<input type="number" min="0" max="80" step="1" data-margin="mTop" value="${mg.T}"></label>
                        <label>Alt<input type="number" min="0" max="80" step="1" data-margin="mBottom" value="${mg.B}"></label>
                        <label>Sol<input type="number" min="0" max="80" step="1" data-margin="mLeft" value="${mg.L}"></label>
                        <label>Sağ<input type="number" min="0" max="80" step="1" data-margin="mRight" value="${mg.R}"></label>
                    </div>
                    <div class="chips">
                        <button class="chip" data-mall="5">Hepsi 5</button>
                        <button class="chip" data-mall="8">Hepsi 8</button>
                        <button class="chip" data-mall="12">Hepsi 12</button>
                        <button class="chip" data-mbottom="20">Alttan 20</button>
                    </div>
                    <button class="btn small" data-act="margins-all">Bu boşlukları tüm şablon sayfalarına uygula</button>
                </div>`;
            }
            if (has("leftLine")) {
                h += `<label class="check"><input type="checkbox" data-prop="opts.leftLine" ${o.leftLine ? "checked" : ""}> <span>Sol kenar (kırmızı) çizgisi</span></label>`;
            }
            if (has("header")) {
                h += `<label class="check"><input type="checkbox" data-prop="opts.header" ${o.header ? "checked" : ""}> <span>Üstte “Ad Soyad / Tarih” satırı</span></label>`;
            }
        }

        if (b.kind === "img") {
            h += `<div class="group-title">Görsel yerleşimi</div>
                <div class="seg small">
                    <button data-fit="cover" class="${b.fit === "cover" ? "on" : ""}" title="Sayfayı doldurur, taşan kenarlar kırpılır">Doldur</button>
                    <button data-fit="contain" class="${b.fit === "contain" ? "on" : ""}" title="Görselin tamamı görünür">Sığdır</button>
                    <button data-fit="stretch" class="${b.fit === "stretch" ? "on" : ""}" title="Sayfaya esnetir">Esnet</button>
                </div>
                <p class="note">Görseli değiştirmek için soldan başka bir görseli bu sayfanın üstüne sürükleyin.</p>`;
        }

        if (b.kind === "pdf") {
            h += `<div class="group-title">PDF sayfa yerleşimi</div>
                <div class="seg small">
                    <button data-fit="contain" class="${b.fit === "contain" ? "on" : ""}" title="Sayfanın tamamı görünür (önerilen)">Sığdır</button>
                    <button data-fit="cover" class="${b.fit === "cover" ? "on" : ""}" title="Kağıdı doldurur, taşan kenarlar kırpılır">Doldur</button>
                    <button data-fit="stretch" class="${b.fit === "stretch" ? "on" : ""}" title="Kağıda esnetir">Esnet</button>
                </div>
                <label class="check"><input type="checkbox" data-prop="rotate" ${b.rotate ? "checked" : ""}> <span>Yatay/dikey uymayan sayfaları otomatik döndür</span></label>
                ${b.to > b.from ? `<button class="btn small" data-act="split">Sayfalara böl <small>(araya sayfa eklemek için)</small></button>` : ""}`;
        }

        h += `<div class="group-title">Arkalı önlü</div>
            <label class="check"><input type="checkbox" data-prop="backBlank" ${b.backBlank ? "checked" : ""}> <span>Bu sayfanın arkası boş kalsın <small>(kapaklar için)</small></span></label>`;

        h += `<div class="group-title">Yazı ve logo</div>
            <button class="btn wide" data-act="edit">✎ Yazı / logo ekle ve düzenle${b.layers && b.layers.length ? ` <small>(${b.layers.length} öğe)</small>` : ""}</button>`;

        h += `<div class="actions">
            <button class="btn" data-act="dup">⧉ Çoğalt</button>
            ${b.kind === "img" || b.kind === "pdf" ? '<button class="btn" data-act="turn" title="İçeriği 90° döndür">↻ Döndür</button>' : ""}
            ${b.kind !== "empty" ? '<button class="btn" data-act="clear">Boş yere çevir</button>' : ""}
            <button class="btn danger" data-act="delete">Sil</button>
        </div>`;

        el.innerHTML = h;
    }

    /* ---- Sağ panel: baskı planı ---- */

    function renderPlan(info) {
        const { pages, warnings } = info;
        const el = $("#plan");
        const total = pages.length;
        const duplex = info.duplex;
        const sheetsCount = info.booklet ? total / 4 : duplex ? Math.ceil(total / 2) : total;

        const nameOf = (p) => (!p ? "—" : p.auto ? "boş (otomatik)" : p.block.kind === "empty" ? "boş yer" : (p.block.label ? p.block.label + " · " : "") + blockName(p.block));
        const bindRow = `<div class="bind-row">${bindIcon(state.binding, 22)}<div><b>${BINDINGS[state.binding].name}</b>
            <small>${state.binding === "side" ? "Arka yüzler uzun kenardan çevrilir" : state.binding === "top" ? "Arka yüzler yukarı (kısa kenardan) çevrilir" : state.binding === "booklet" ? `${BOOKLET_PAPER[state.pageSize].label} kağıda ikişer sayfa, ortadan katla ve zımbala` : "Sayfalar ayrı kullanılır"}${isSpiral() && state.gutter > 0 ? ` · spiral payı ${state.gutter} mm` : ""}</small></div>
            <button class="btn small" data-bind-open>Değiştir</button></div>`;

        if (info.booklet) {
            const { sides } = buildSides(info);
            let h = `<h3>Baskı planı</h3>${bindRow}
                <div class="stats">
                    <div><b>${total}</b><span>sayfa (A5 vb.)</span></div>
                    <div><b>${sheetsCount}</b><span>${BOOKLET_PAPER[state.pageSize].label} kağıt</span></div>
                </div>
                <label class="field">Forma <small>(kalın kitapçıklar katlanabilsin diye gruplara böler)</small>
                    <select data-signature>${[0, 3, 4, 5, 6, 8, 10].map((k) => `<option value="${k}" ${state.signature === k ? "selected" : ""}>${k ? `${k} kağıtlık formalar (${k * 4} sayfa)` : "Tek forma (hepsi iç içe)"}</option>`).join("")}</select>
                </label>`;
            if (warnings.length) {
                h += `<div class="warnings">${warnings.map((w, i) => `
                    <div class="warning ${w.level}"><span>${esc(w.text)}</span>
                    ${w.fix ? `<button class="btn small" data-fix="${i}">${esc(w.fix.label)}</button>` : ""}</div>`).join("")}</div>`;
            }
            h += `<div class="sheets">`;
            if (!total) h += `<p class="muted">Henüz sayfa yok.</p>`;
            let lastForma = -1;
            for (let i = 0; i < sides.length; i += 2) {
                const f = sides[i], b = sides[i + 1];
                if (state.signature > 0 && f.forma !== lastForma) {
                    h += `<div class="forma-title">${f.forma + 1}. forma</div>`;
                    lastForma = f.forma;
                }
                const cell = (sd) => `<span class="imp" title="${esc(nameOf(sd.left))} | ${esc(nameOf(sd.right))}"><i class="${sd.left.auto ? "auto" : ""}">${sd.nums[0]}</i><i class="${sd.right.auto ? "auto" : ""}">${sd.nums[1]}</i></span>`;
                h += `<div class="sheet-row booklet">
                    <div class="sheet-no">Kağıt ${i / 2 + 1}</div>
                    <div class="sheet-sides"><div class="side-chip"><em>Ön</em>${cell(f)}</div><div class="side-chip"><em>Arka</em>${cell(b)}</div></div>
                </div>`;
            }
            h += `</div><p class="hint" style="margin-top:8px">Kağıtları sırayla üst üste koyup ortadan katlayın; 1. kağıt en dışta kalır.</p>`;
            el.innerHTML = h;
            el._warnings = warnings;
            return;
        }
        const keyOf = (p) => (!p ? "-" : p.auto ? "auto" : p.block.id);

        // Yaprakları ardışık aynı olanları gruplayarak listele
        const sheets = [];
        for (let i = 0; i < total; i += duplex ? 2 : 1) {
            sheets.push({ front: pages[i], back: duplex ? pages[i + 1] : undefined });
        }
        const runs = [];
        sheets.forEach((s, i) => {
            const key = keyOf(s.front) + "|" + keyOf(s.back);
            const last = runs[runs.length - 1];
            if (last && last.key === key) last.to = i;
            else runs.push({ key, from: i, to: i, s });
        });

        let h = `<h3>Baskı planı</h3>${bindRow}
            <div class="seg wide" id="duplexSeg">
                <button data-duplex="0" class="${!state.duplex ? "on" : ""}">Tek yüz</button>
                <button data-duplex="1" class="${state.duplex ? "on" : ""}">Arkalı önlü</button>
            </div>
            <div class="stats">
                <div><b>${total}</b><span>sayfa</span></div>
                <div><b>${sheetsCount}</b><span>yaprak kağıt</span></div>
            </div>
            ${isSpiral() ? `<label class="field inline-num">Spiral payı <small>(delikler için boşluk)</small>
                <span><input type="number" min="0" max="25" step="1" data-gutter value="${state.gutter}"> mm</span></label>
                <div class="seg wide small" title="Spiral payı nasıl bırakılsın">
                    <button data-gmode="both" class="${state.gutterMode !== "mirror" ? "on" : ""}">Her sayfada aynı</button>
                    <button data-gmode="mirror" class="${state.gutterMode === "mirror" ? "on" : ""}">Sadece delik tarafı</button>
                </div>
                <p class="hint">${state.gutterMode === "mirror" ? "Ön yüzde solda, arka yüzde sağda boşluk; içerik sayfadan sayfaya yer değiştirir." : "Her sayfa birebir aynı; boşluk iki yanda bırakılır, içerik kaymaz."}</p>` : ""}`;

        if (warnings.length) {
            h += `<div class="warnings">${warnings.map((w, i) => `
                <div class="warning ${w.level}">
                    <span>${esc(w.text)}</span>
                    ${w.fix ? `<button class="btn small" data-fix="${i}">${esc(w.fix.label)}</button>` : ""}
                </div>`).join("")}</div>`;
        }

        h += `<div class="sheets">`;
        if (!total) h += `<p class="muted">Henüz sayfa yok.</p>`;
        runs.forEach((r) => {
            const label = r.from === r.to ? `Yaprak ${r.from + 1}` : `Yaprak ${r.from + 1}–${r.to + 1}`;
            const n = r.to - r.from + 1;
            h += `<div class="sheet-row">
                <div class="sheet-no">${label}${n > 1 ? `<small>${n} kağıt</small>` : ""}</div>
                <div class="sheet-sides">
                    <div class="side-chip ${r.s.front && r.s.front.auto ? "auto" : ""}"><em>${duplex ? "Ön" : "Sayfa"}</em>${esc(nameOf(r.s.front))}</div>
                    ${duplex ? `<div class="side-chip ${!r.s.back || r.s.back.auto ? "auto" : ""}"><em>Arka</em>${esc(nameOf(r.s.back))}</div>` : ""}
                </div>
            </div>`;
        });
        h += `</div>`;
        el.innerHTML = h;
        el._warnings = warnings;
    }

    /* ---------------- AKSİYONLAR ---------------- */

    function select(id) {
        state.selected = id;
        render();
        const card = document.querySelector(`.card[data-id="${id}"]`);
        if (card) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function deleteBlock(id) {
        const i = indexOf(id);
        if (i < 0) return;
        commit();
        state.blocks.splice(i, 1);
        if (state.selected === id) state.selected = state.blocks[i] ? state.blocks[i].id : state.blocks[i - 1] ? state.blocks[i - 1].id : null;
        render();
    }

    /* Kopyalanan bir kartın yazı/logo katmanlarına yeni kimlik ver
       (bağlantı kimliği korunur, böylece bağlantılı kopyalar birlikte güncellenir) */
    function freshLayerIds(b) {
        if (b.layers) b.layers = b.layers.map((l) => Object.assign({}, l, { id: uid() }));
        return b;
    }

    function duplicateBlock(id) {
        const i = indexOf(id);
        if (i < 0) return;
        commit();
        const copy = freshLayerIds(clone(state.blocks[i]));
        copy.id = uid();
        state.blocks.splice(i + 1, 0, copy);
        state.selected = copy.id;
        render();
    }

    /* Bir PDF bloğunu her sayfası ayrı kart olacak şekilde böler */
    function splitPdfBlock(id) {
        const i = indexOf(id);
        const b = state.blocks[i];
        if (!b || b.kind !== "pdf") return;
        commit();
        const parts = [];
        for (let pg = b.from; pg <= b.to; pg++) {
            const nb = freshLayerIds(clone(b));
            nb.id = uid();
            nb.from = nb.to = pg;
            nb.count = 1;
            nb.label = pg === b.from ? b.label : "";
            parts.push(nb);
        }
        state.blocks.splice(i, 1, ...parts);
        state.selected = parts[0].id;
        render();
        toast(`${parts.length} ayrı sayfaya bölündü.`);
    }

    function addSlot() {
        commit();
        const b = emptyBlock("Sayfa");
        state.blocks.push(b);
        state.selected = b.id;
        render();
    }

    /* payload'ları (şablon/görsel) bir hedefe uygula */
    function dropPayloads(payloads, targetId, zone) {
        if (!payloads.length) return;
        commit();
        let i = targetId ? indexOf(targetId) : state.blocks.length;
        let selectId = null;
        if (targetId && zone === "replace") {
            const b = state.blocks[i];
            applyContent(b, contentFromPayload(payloads[0]));
            if (payloads[0].type === "slot") b.label = b.label || "Sayfa";
            selectId = b.id;
            payloads = payloads.slice(1);
            i += 1;
        } else if (targetId && zone === "after") {
            i += 1;
        }
        payloads.forEach((p) => {
            const nb = newBlockFrom(p);
            state.blocks.splice(i, 0, nb);
            i += 1;
            if (!selectId) selectId = nb.id;
        });
        state.selected = selectId;
        render();
    }

    function moveBlock(id, targetId, zone) {
        const from = indexOf(id);
        if (from < 0 || id === targetId) return;
        commit();
        const [b] = state.blocks.splice(from, 1);
        let to = targetId ? indexOf(targetId) : state.blocks.length;
        if (targetId && zone === "after") to += 1;
        state.blocks.splice(to, 0, b);
        render();
    }

    /* ---------------- GÖRSEL YÜKLEME ---------------- */

    function readAsDataURL(file) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = () => rej(r.error);
            r.readAsDataURL(file);
        });
    }

    function loadImg(url) {
        return new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = () => rej(new Error("Görsel açılamadı"));
            img.src = url;
        });
    }

    function resized(img, maxSide, type, quality) {
        const w = img.naturalWidth, h = img.naturalHeight;
        const k = Math.min(1, maxSide / Math.max(w, h));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w * k));
        c.height = Math.max(1, Math.round(h * k));
        const ctx = c.getContext("2d");
        if (type === "image/jpeg") {
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, c.width, c.height);
        }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL(type, quality);
    }

    async function importFiles(fileList) {
        const out = [];
        for (const f of fileList) {
            if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
                const p = await importPdf(f);
                if (p) out.push(p);
                continue;
            }
            if (!f.type || !f.type.startsWith("image/")) {
                toast(`“${f.name}” görsel ya da PDF değil, atlandı.`, "warn");
                continue;
            }
            try {
                let url = await readAsDataURL(f);
                const img = await loadImg(url);
                const keepPng = f.type === "image/png" || f.type === "image/svg+xml" || f.type === "image/gif";
                const outType = keepPng ? "image/png" : "image/jpeg";
                // 300 dpi A4 için ~3508 px yeterli; daha büyükleri küçült
                if (Math.max(img.naturalWidth, img.naturalHeight) > 3600 || f.type === "image/svg+xml") {
                    url = resized(img, 3600, outType, 0.92);
                }
                const thumb = resized(img, 360, outType, 0.8);
                const id = uid();
                images.set(id, { id, name: f.name.replace(/\.[^.]+$/, ""), url, thumb, w: img.naturalWidth, h: img.naturalHeight });
                out.push({ type: "image", id });
            } catch (e) {
                toast(`“${f.name}” açılamadı.`, "error");
            }
        }
        const nImg = out.filter((x) => x.type === "image").length;
        if (nImg) toast(`${nImg} görsel eklendi.`);
        renderLibraryImages();
        return out;
    }

    /* ---- PDF içe aktarma (pdf.js, ilk kullanımda yüklenir) ---- */

    let pdfjsReady = null;

    function loadScript(src) {
        return new Promise((res, rej) => {
            const s = document.createElement("script");
            s.src = src;
            s.onload = res;
            s.onerror = () => rej(new Error(src + " yüklenemedi"));
            document.head.appendChild(s);
        });
    }

    function loadPdfJs() {
        if (!pdfjsReady) {
            pdfjsReady = loadScript("vendor/pdf.min.js").then(() => {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
                return window.pdfjsLib;
            });
            pdfjsReady.catch(() => { pdfjsReady = null; });
        }
        return pdfjsReady;
    }

    function canvasToDataURL(canvas, maxSide, quality) {
        const k = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
        if (k === 1) return canvas.toDataURL("image/jpeg", quality);
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(canvas.width * k));
        c.height = Math.max(1, Math.round(canvas.height * k));
        const ctx = c.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(canvas, 0, 0, c.width, c.height);
        return c.toDataURL("image/jpeg", quality);
    }

    /* PDF'in her sayfasını ~300 dpi görüntüye çevirir */
    async function importPdf(file) {
        const progress = toast(`“${file.name}” açılıyor…`, "info", 0);
        try {
            const lib = await loadPdfJs();
            const data = new Uint8Array(await file.arrayBuffer());
            const base = location.href.replace(/[^/]*$/, "");
            const doc = await lib.getDocument({
                data,
                isEvalSupported: false,
                cMapUrl: base + "vendor/cmaps/",
                cMapPacked: true,
                standardFontDataUrl: base + "vendor/standard_fonts/"
            }).promise;
            const pages = [];
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            for (let n = 1; n <= doc.numPages; n++) {
                progress.querySelector("span").textContent = `“${file.name}” hazırlanıyor: ${n} / ${doc.numPages} sayfa`;
                const page = await doc.getPage(n);
                const v1 = page.getViewport({ scale: 1 });
                // 300 dpi, ama uzun kenar 3600 pikseli geçmesin
                const scale = Math.min(300 / 72, 3600 / Math.max(v1.width, v1.height));
                const vp = page.getViewport({ scale });
                canvas.width = Math.round(vp.width);
                canvas.height = Math.round(vp.height);
                ctx.fillStyle = "#fff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await page.render({ canvasContext: ctx, viewport: vp }).promise;
                pages.push({
                    url: canvas.toDataURL("image/jpeg", 0.9),
                    thumb: canvasToDataURL(canvas, 360, 0.8),
                    w: v1.width,
                    h: v1.height
                });
                page.cleanup();
                await new Promise((r) => setTimeout(r, 0)); // arayüz donmasın
            }
            doc.destroy();
            const id = uid();
            pdfs.set(id, { id, name: file.name.replace(/\.pdf$/i, ""), pages });
            progress.remove();
            toast(`PDF eklendi: ${pages.length} sayfa.`, "ok");
            return { type: "pdf", id };
        } catch (err) {
            progress.remove();
            const msg = err && err.name === "PasswordException" ? "PDF şifreli, açılamadı." : `“${file.name}” açılamadı.`;
            toast(msg, "error");
            return null;
        }
    }

    function removePdf(id) {
        if (state.blocks.some((b) => b.kind === "pdf" && b.pdfId === id)) {
            toast("Bu PDF bir sayfada kullanılıyor. Önce o sayfaları silin veya değiştirin.", "warn");
            return;
        }
        pdfs.delete(id);
        render();
    }

    function removeImage(id) {
        if (state.blocks.some((b) => (b.kind === "img" && b.imageId === id) || (b.layers || []).some((l) => l.imageId === id || l.srcImageId === id))) {
            toast("Bu görsel bir sayfada kullanılıyor. Önce o sayfayı silin veya değiştirin.", "warn");
            return;
        }
        images.delete(id);
        render();
    }

    /* ---------------- SÜRÜKLE & BIRAK ---------------- */

    let drag = null; // { type: 'preset'|'image'|'slot'|'block', key|id }

    function clearDropMarks() {
        document.querySelectorAll(".drop-before,.drop-after,.drop-replace,.drop-over").forEach((n) =>
            n.classList.remove("drop-before", "drop-after", "drop-replace", "drop-over"));
    }

    function endDrag() {
        drag = null;
        document.body.classList.remove("dragging", "dragging-block");
        document.querySelectorAll(".ghost").forEach((n) => n.classList.remove("ghost"));
        clearDropMarks();
    }

    function isFileDrag(e) {
        return !drag && e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    }

    function zoneFor(card, e) {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        if (drag && drag.type === "block") return x < 0.5 ? "before" : "after";
        if (drag && drag.type === "tool") return "replace";
        if (x < 0.22) return "before";
        if (x > 0.78) return "after";
        return "replace";
    }

    function setupDnD() {
        // Dosya pencereye bırakılınca uygulamanın o dosyaya gitmesini engelle
        window.addEventListener("dragover", (e) => e.preventDefault());
        window.addEventListener("drop", (e) => e.preventDefault());

        document.addEventListener("dragstart", (e) => {
            const t = e.target.closest ? e.target.closest("[draggable=true]") : null;
            if (!t) return;
            if (t.dataset.preset) drag = { type: "preset", key: t.dataset.preset };
            else if (t.dataset.image) drag = { type: "image", id: t.dataset.image };
            else if (t.dataset.pdf) drag = { type: "pdf", id: t.dataset.pdf };
            else if (t.dataset.tool) drag = { type: "tool", tool: t.dataset.tool };
            else if (t.dataset.slot) drag = { type: "slot" };
            else if (t.dataset.id) {
                drag = { type: "block", id: t.dataset.id };
                document.body.classList.add("dragging-block");
                setTimeout(() => t.classList.add("ghost"), 0);
            }
            if (drag) {
                e.dataTransfer.effectAllowed = drag.type === "block" ? "move" : "copy";
                e.dataTransfer.setData("text/plain", drag.type);
                document.body.classList.add("dragging");
            }
        });

        // Sürüklenen kart bırakınca yeniden çizildiği için dragend her zaman
        // gelmeyebilir; bu yüzden bırakma işleyicileri de endDrag çağırır.
        document.addEventListener("dragend", endDrag);

        const board = $("#board");

        board.addEventListener("dragover", (e) => {
            if (!drag && !isFileDrag(e)) return;
            e.preventDefault();
            const card = e.target.closest(".card");
            clearDropMarks();
            if (!card) return;
            if (card.dataset.add) {
                card.classList.add("drop-over");
                e.dataTransfer.dropEffect = drag && drag.type === "block" ? "move" : "copy";
                return;
            }
            if (drag && drag.type === "block" && card.dataset.id === drag.id) return;
            const zone = zoneFor(card, e);
            card.classList.add("drop-" + zone);
            e.dataTransfer.dropEffect = drag && drag.type === "block" ? "move" : "copy";
        });

        board.addEventListener("dragleave", (e) => {
            if (!board.contains(e.relatedTarget)) clearDropMarks();
        });

        board.addEventListener("drop", async (e) => {
            e.preventDefault();
            const card = e.target.closest(".card");
            const zone = card && !card.dataset.add ? zoneFor(card, e) : "end";
            const targetId = card && !card.dataset.add ? card.dataset.id : null;
            const current = drag;
            endDrag();

            if (current && current.type === "block") {
                if (targetId !== current.id) moveBlock(current.id, targetId, zone);
                return;
            }
            if (current && current.type === "tool") {
                if (targetId) openEditor(targetId, { addText: current.tool === "text", pickLogo: current.tool === "logo" });
                else toast("Yazı veya logoyu bir sayfa kartının üstüne bırakın.");
                return;
            }
            let payloads = [];
            if (current) payloads = [current];
            else if (e.dataTransfer.files && e.dataTransfer.files.length) payloads = await importFiles(e.dataTransfer.files);
            dropPayloads(payloads, targetId, zone);
        });

        // Görsel kütüphanesine dosya bırakma
        const lib = $("#imageDrop");
        const libArea = $("#library");
        libArea.addEventListener("dragover", (e) => {
            if (isFileDrag(e)) {
                e.preventDefault();
                lib.classList.add("drop-over");
            }
        });
        libArea.addEventListener("dragleave", (e) => {
            if (!libArea.contains(e.relatedTarget)) lib.classList.remove("drop-over");
        });
        libArea.addEventListener("drop", async (e) => {
            lib.classList.remove("drop-over");
            if (drag || !e.dataTransfer.files.length) return;
            e.preventDefault();
            await importFiles(e.dataTransfer.files);
        });

        // Çöp kutusu
        const trash = $("#trash");
        trash.addEventListener("dragover", (e) => {
            if (drag && drag.type === "block") {
                e.preventDefault();
                trash.classList.add("drop-over");
            }
        });
        trash.addEventListener("dragleave", () => trash.classList.remove("drop-over"));
        trash.addEventListener("drop", (e) => {
            e.preventDefault();
            trash.classList.remove("drop-over");
            const current = drag;
            endDrag();
            if (current && current.type === "block") deleteBlock(current.id);
        });
    }

    /* ---------------- OLAYLAR ---------------- */

    function setProp(b, path, value) {
        if (path.startsWith("opts.")) {
            b.opts = b.opts || {};
            b.opts[path.slice(5)] = value;
        } else {
            b[path] = value;
        }
    }

    let lastCardClick = { id: null, t: 0 };

    function setupEvents() {
        // Sayfa boyutu
        $("#pageSize").innerHTML = Object.entries(PAGE_SIZES).map(([k, p]) =>
            `<option value="${k}">${p.label} · ${p.w}×${p.h}</option>`).join("");
        $("#pageSize").addEventListener("change", (e) => { commit(); state.pageSize = e.target.value; render(); });
        $("#orient").addEventListener("click", (e) => {
            const v = e.target.closest("button")?.dataset.v;
            if (v && v !== state.orient) { commit(); state.orient = v; render(); }
        });

        $("#undoBtn").addEventListener("click", undo);
        $("#redoBtn").addEventListener("click", redo);
        $("#newBtn").addEventListener("click", () => {
            if (!confirm("Mevcut iş temizlensin mi? (Geri al ile dönebilirsiniz)")) return;
            commit();
            defaultDoc();
            render();
            openBindingDialog({ first: true });
        });
        $("#saveProjBtn").addEventListener("click", saveProject);
        $("#openBtn").addEventListener("click", openProject);
        $("#pdfBtn").addEventListener("click", () => savePdf());
        $("#printBtn").addEventListener("click", openPrintDialog);

        // Kütüphane tıklamaları
        $("#library").addEventListener("click", async (e) => {
            const rm = e.target.closest("[data-rmimg]");
            if (rm) { e.stopPropagation(); removeImage(rm.dataset.rmimg); return; }
            const rmp = e.target.closest("[data-rmpdf]");
            if (rmp) { e.stopPropagation(); removePdf(rmp.dataset.rmpdf); return; }
            if (e.target.closest("#imageDrop")) { $("#imageInput").click(); return; }
            const tile = e.target.closest(".tile");
            if (!tile) return;
            let payload = null;
            if (tile.dataset.preset) payload = { type: "preset", key: tile.dataset.preset };
            else if (tile.dataset.image) payload = { type: "image", id: tile.dataset.image };
            else if (tile.dataset.pdf) payload = { type: "pdf", id: tile.dataset.pdf };
            else if (tile.dataset.slot) payload = { type: "slot" };
            else if (tile.dataset.tool) {
                if (tile.dataset.tool === "pagenum") { addPageNumbers(); return; }
                const target = state.blocks.find((b) => b.id === state.selected) || state.blocks.find((b) => b.kind !== "img") || state.blocks[0];
                if (!target) { toast("Önce bir sayfa ekleyin.", "warn"); return; }
                openEditor(target.id, { addText: tile.dataset.tool === "text", pickLogo: tile.dataset.tool === "logo" });
                return;
            }
            if (!payload) return;
            const sel = state.blocks.find((b) => b.id === state.selected);
            if (sel && payload.type !== "slot") dropPayloads([payload], sel.id, "replace");
            else dropPayloads([payload], null, "end");
        });
        $("#imageDrop").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") $("#imageInput").click(); });
        $("#imageInput").addEventListener("change", async (e) => {
            await importFiles(e.target.files);
            e.target.value = "";
        });

        // Kartlar
        $("#board").addEventListener("click", (e) => {
            const del = e.target.closest("[data-del]");
            if (del) { e.stopPropagation(); deleteBlock(del.dataset.del); return; }
            const card = e.target.closest(".card");
            if (!card) { if (e.target === $("#board")) { state.selected = null; render(); } return; }
            if (card.dataset.add) { addSlot(); return; }
            // Çift tıklama: ilk tıklama kartı yeniden çizdiği için dblclick olayı gelmez; kendimiz yakalıyoruz
            const now = Date.now();
            if (lastCardClick.id === card.dataset.id && now - lastCardClick.t < 450) {
                lastCardClick = { id: null, t: 0 };
                openEditor(card.dataset.id);
                return;
            }
            lastCardClick = { id: card.dataset.id, t: now };
            // Paneldeki bir kutuda kalan odağı bırak; yoksa Delete tuşu kutuya gider
            if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) document.activeElement.blur();
            select(card.dataset.id);
        });


        // Ayar paneli
        const props = $("#props");
        props.addEventListener("input", (e) => {
            const b = state.blocks.find((x) => x.id === state.selected);
            if (b && e.target.dataset.margin) {
                const v = parseFloat(e.target.value);
                if (!isFinite(v)) return;
                if (!props._editing) { commit(); props._editing = true; }
                b.opts = b.opts || {};
                b.opts[e.target.dataset.margin] = Math.max(0, Math.min(80, v));
                const info = analyze();
                renderBoard(info);
                renderPlan(info);
                return;
            }
            const path = e.target.dataset.prop;
            if (!b || !path) return;
            let v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
            if (e.target.type === "number" || e.target.type === "range") {
                v = parseFloat(v);
                if (!isFinite(v)) return;
                if (path === "count") v = Math.max(1, Math.min(2000, Math.round(v)));
                if (path === "from" || path === "to") {
                    const doc = pdfs.get(b.pdfId);
                    v = Math.max(1, Math.min(doc ? doc.pages.length : 1, Math.round(v)));
                }
            }
            if (!props._editing) { commit(); props._editing = true; }
            setProp(b, path, v);
            if (path === "from" && b.to < b.from) b.to = b.from;
            if (path === "to" && b.from > b.to) b.from = b.to;
            // Metin/sayı yazarken odağı kaybetmemek için paneli değil diğer alanları yenile
            const info = analyze();
            renderTop();
            renderBoard(info);
            renderPlan(info);
            props.querySelectorAll(`[data-prop="${path}"]`).forEach((n) => { if (n !== e.target && n.type !== "checkbox") n.value = v; });
            if (e.target.type === "checkbox") { props._editing = false; renderProps(info); }
        });
        // Paneli burada yeniden çizmiyoruz: aksi halde yazdıktan hemen sonra
        // başka bir düğmeye yapılan tıklama kaybolur.
        props.addEventListener("change", () => { props._editing = false; });
        props.addEventListener("click", (e) => {
            const b = state.blocks.find((x) => x.id === state.selected);
            if (!b) return;
            const btn = e.target.closest("button");
            if (!btn) return;
            if (btn.dataset.step) { commit(); b.count = Math.max(1, Math.min(2000, b.count + +btn.dataset.step)); render(); }
            else if (btn.dataset.count) { commit(); b.count = +btn.dataset.count; render(); }
            else if (btn.dataset.color) { commit(); setProp(b, "opts.color", btn.dataset.color); render(); }
            else if (btn.dataset.weight) { commit(); setProp(b, "opts.weight", btn.dataset.weight); render(); }
            else if (btn.dataset.fit) { commit(); b.fit = btn.dataset.fit; render(); }
            else if (btn.dataset.mall) {
                commit();
                b.opts = Object.assign(b.opts || {}, { margin: +btn.dataset.mall, mTop: +btn.dataset.mall, mBottom: +btn.dataset.mall, mLeft: +btn.dataset.mall, mRight: +btn.dataset.mall });
                render();
            }
            else if (btn.dataset.mbottom) { commit(); b.opts = Object.assign(b.opts || {}, { mBottom: +btn.dataset.mbottom }); render(); }
            else if (btn.dataset.act === "margins-all") {
                commit();
                const mg = marginsOf(b.opts || {});
                let n = 0;
                state.blocks.forEach((x) => {
                    if (x.kind !== "tpl" || x.tpl === "blank") return;
                    x.opts = Object.assign(x.opts || {}, { mTop: mg.T, mBottom: mg.B, mLeft: mg.L, mRight: mg.R });
                    n++;
                });
                render();
                toast(`Kenar boşlukları ${n} şablon kartına uygulandı.`, "ok");
            }
            else if (btn.dataset.act === "dup") duplicateBlock(b.id);
            else if (btn.dataset.act === "delete") deleteBlock(b.id);
            else if (btn.dataset.act === "split") splitPdfBlock(b.id);
            else if (btn.dataset.act === "edit") openEditor(b.id);
            else if (btn.dataset.act === "turn") { commit(); b.turn = ((b.turn || 0) + 90) % 360; render(); }
            else if (btn.dataset.act === "allpages") { commit(); b.from = 1; b.to = pdfs.get(b.pdfId).pages.length; render(); }
            else if (btn.dataset.act === "clear") { commit(); applyContent(b, { kind: "empty" }); render(); }
        });

        // Baskı planı
        $("#plan").addEventListener("click", (e) => {
            const d = e.target.closest("[data-duplex]");
            if (d) {
                const v = d.dataset.duplex === "1";
                if (v !== state.duplex) { commit(); state.duplex = v; render(); }
                return;
            }
            if (e.target.closest("[data-bind-open]")) { openBindingDialog(); return; }
            const gm = e.target.closest("[data-gmode]");
            if (gm) { if (gm.dataset.gmode !== state.gutterMode) { commit(); state.gutterMode = gm.dataset.gmode; render(); } return; }
            const f = e.target.closest("[data-fix]");
            if (f) {
                const w = $("#plan")._warnings[+f.dataset.fix];
                if (w && w.fix) w.fix.action();
            }
        });

        $("#plan").addEventListener("change", (e) => {
            if (e.target.matches("[data-signature]")) { commit(); state.signature = +e.target.value; render(); }
            if (e.target.matches("[data-gutter]")) {
                const v = Math.max(0, Math.min(25, Math.round(+e.target.value || 0)));
                commit(); state.gutter = v; render();
            }
        });

        $("#bindBtn").addEventListener("click", () => openBindingDialog());
        $("#previewBtn").addEventListener("click", () => openPreview());

        // Klavye
        document.addEventListener("keydown", (e) => {
            if (preview && preview.isOpen()) return; // önizleme kendi tuşlarını yönetir
            if (editor && editor.isOpen()) return;
            const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === "z" && !e.shiftKey && !typing) { e.preventDefault(); undo(); }
            else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) && !typing) { e.preventDefault(); redo(); }
            else if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); openPrintDialog(); }
            else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); savePdf(); }
            else if (e.key === " " && !typing && $("#modalBack").hidden) { e.preventDefault(); openPreview(); }
            else if (mod && e.key.toLowerCase() === "d" && state.selected && !typing) { e.preventDefault(); duplicateBlock(state.selected); }
            else if (e.key === "Enter" && state.selected && !typing && $("#modalBack").hidden) { e.preventDefault(); openEditor(state.selected); }
            else if ((e.key === "Delete" || e.key === "Backspace") && state.selected && !typing) { e.preventDefault(); deleteBlock(state.selected); }
            else if (e.key === "Escape") { if (!$("#modalBack").hidden) closeModal(); else if (state.selected) { state.selected = null; render(); } }
            else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && state.selected && !typing) {
                const i = indexOf(state.selected);
                const j = i + (e.key === "ArrowLeft" ? -1 : 1);
                if (state.blocks[j]) select(state.blocks[j].id);
            }
        });
    }

    /* ---------------- PDF / YAZDIRMA ---------------- */

    /* Fiziksel yüzleri yazdırılabilir HTML'e çevirir */
    function printHtml(layout, sides) {
        const { W, H, SW, SH } = layout;
        const body = (sides || layout.sides).map((sd) => {
            const rot = sd.rot180 ? ' style="transform: rotate(180deg)"' : "";
            if (sd.kind === "spread") {
                const ox = (SW - 2 * W) / 2, oy = (SH - H) / 2;
                const half = (p, x, num) => pageSvg(pageOf(p, false, ctxFor(num - 1, layout.info)), W, H, `x="${x}" y="${oy}" width="${W}" height="${H}"`);
                return `<div class="p"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SW} ${SH}" width="${SW}mm" height="${SH}mm"${rot}>`
                    + `<rect width="${SW}" height="${SH}" fill="#fff"/>${half(sd.left, ox, sd.nums[0])}${half(sd.right, ox + W, sd.nums[1])}</svg></div>`;
            }
            return `<div class="p"><div${rot}>${pageSvg(pageOf(sd.p, false, sd.i != null ? ctxFor(sd.i, layout.info) : null), W, H, `width="${W}mm" height="${H}mm"`, sd.gutter)}</div></div>`;
        }).join("");
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Baskı</title><style>
            @page { size: ${SW}mm ${SH}mm; margin: 0; }
            html, body { margin: 0; padding: 0; background: #fff; }
            /* Yükseklikten 1px eksik: eski Chromium sürümleri yuvarlama yüzünden sona boş sayfa eklemesin */
            .p { width: ${SW}mm; height: calc(${SH}mm - 1px); overflow: hidden; break-after: page; page-break-after: always; break-inside: avoid; }
            .p:last-child { break-after: auto; page-break-after: auto; }
            svg { display: block; }
            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        </style></head><body>${body}</body></html>`;
    }

    function jobMeta(layout) {
        return { widthMm: layout.SW, heightMm: layout.SH, landscape: layout.SW > layout.SH };
    }

    function defaultFileName() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        return `baski-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    }

    /* Basılacak düzeni hazırlar; sayfa yoksa uyarır */
    function ensureLayout() {
        const info = analyze();
        if (!info.pages.length) {
            toast("Önce en az bir sayfa ekleyin.", "warn");
            return null;
        }
        return buildSides(info);
    }

    /* Tarayıcıda (masaüstü uygulaması dışında) gizli iframe ile yazdır */
    function browserPrint(html) {
        return new Promise((resolve) => {
            const f = document.createElement("iframe");
            f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
            document.body.appendChild(f);
            f.onload = () => {
                setTimeout(() => {
                    f.contentWindow.focus();
                    f.contentWindow.print();
                    setTimeout(() => { f.remove(); resolve({ success: true }); }, 500);
                }, 200);
            };
            f.srcdoc = html;
        });
    }

    async function savePdf(silentAfter) {
        const layout = ensureLayout();
        if (!layout) return null;
        const html = printHtml(layout);
        if (!desktop) {
            toast("Tarayıcı modunda: yazdırma penceresinde hedef olarak “PDF olarak kaydet”i seçin.");
            await browserPrint(html);
            return null;
        }
        const busy = toast("PDF hazırlanıyor…", "info", 0);
        try {
            const res = await desktop.savePdf({ html, defaultName: defaultFileName() + (isBooklet() ? "-kitapcik" : "") + ".pdf", ...jobMeta(layout) });
            busy.remove();
            if (res && res.path) {
                if (!silentAfter) {
                    toast(`PDF kaydedildi (${layout.sides.length} sayfa${isBooklet() ? ", kitapçık dizgisiyle" : ""}).`, "ok", 7000, [
                        { label: "Aç", run: () => desktop.openPath(res.path) },
                        { label: "Klasörde göster", run: () => desktop.showInFolder(res.path) }
                    ]);
                }
                return res.path;
            }
            if (res && res.error) toast("PDF kaydedilemedi: " + res.error, "error");
        } catch (err) {
            busy.remove();
            toast("PDF kaydedilemedi: " + err.message, "error");
        }
        return null;
    }

    /* ---- Modal ---- */

    function openModal(html) {
        $("#modal").innerHTML = html;
        $("#modalBack").hidden = false;
        const first = $("#modal").querySelector("button.primary, select, input");
        if (first) first.focus();
    }

    function closeModal() {
        $("#modalBack").hidden = true;
        $("#modal").innerHTML = "";
        $("#modal").onclick = null;
        $("#modal").onchange = null;
    }

    async function openPrintDialog() {
        if (!ensureLayout()) return;
        let printers = [];
        if (desktop) {
            try { printers = await desktop.getPrinters(); } catch (e) { printers = []; }
        }
        const rec = recommendedMode();
        const recTag = `<span class="rec">Önerilen · ${BINDINGS[state.binding].short}</span>`;
        const modes = [
            { v: "longEdge", t: "Arkalı önlü — uzun kenardan çevir", d: "Kağıt uzun kenarı etrafında çevrilir" },
            { v: "shortEdge", t: "Arkalı önlü — kısa kenardan çevir", d: "Kağıt kısa kenarı etrafında çevrilir" },
            { v: "manual", t: "Elle arkalı önlü", d: "Yazıcı çift yüz basamıyorsa: önce tekler, sonra kağıdı çevirip çiftler" },
            { v: "simplex", t: "Tek yüz", d: isBooklet() ? "Kitapçık için uygun değil" : "Her sayfa ayrı kağıda" }
        ];
        const def = rec;

        openModal(`
            <h2>Yazdır</h2>
            <div class="modal-body">
                ${desktop ? `<label class="field">Yazıcı
                    <select id="pPrinter">
                        ${printers.map((p) => `<option value="${esc(p.name)}" ${p.isDefault ? "selected" : ""}>${esc(p.displayName || p.name)}${p.isDefault ? " (varsayılan)" : ""}</option>`).join("") || '<option value="">Sistem varsayılanı</option>'}
                    </select></label>` : `<p class="note">Tarayıcı modunda çalışıyorsunuz. Arkalı önlü ayarını açılacak yazdırma penceresinden seçin. Masaüstü uygulamasında bu ayar otomatik gönderilir.</p>`}
                <div class="field">Baskı şekli
                    <div class="radios">${modes.map((m) => `
                        <label class="radio"><input type="radio" name="pMode" value="${m.v}" ${m.v === def ? "checked" : ""}>
                        <span><b>${m.t} ${m.v === rec ? recTag : ""}</b><small>${m.d}</small></span></label>`).join("")}
                    </div>
                </div>
                <div class="row2">
                    <label class="field">Kopya sayısı <input type="number" id="pCopies" min="1" max="999" value="1"></label>
                    ${desktop ? `<label class="check pdf-too"><input type="checkbox" id="pAlsoPdf"> <span>Yazdırmadan önce PDF olarak da kaydet</span></label>` : ""}
                </div>
                <div class="summary" id="pSummary"></div>
            </div>
            <div class="modal-foot">
                <button class="btn" data-close>İptal</button>
                <button class="btn primary" id="pGo">🖶 Yazdır</button>
            </div>`);

        const updateSummary = () => {
            const mode = document.querySelector('input[name="pMode"]:checked').value;
            const duplex = mode !== "simplex";
            if (!isBooklet() && duplex !== state.duplex) { commit(); state.duplex = duplex; render(); }
            const { sides } = buildSides(analyze());
            const copies = Math.max(1, +$("#pCopies").value || 1);
            const sheets = (duplex ? Math.ceil(sides.length / 2) : sides.length) * copies;
            $("#pSummary").innerHTML = `<b>${sides.length}</b> baskı yüzü × <b>${copies}</b> kopya → toplam <b>${sheets}</b> kağıt`
                + (isBooklet() ? ` <small>(${BOOKLET_PAPER[state.pageSize].label})</small>` : "")
                + (mode !== rec && mode !== "manual" && rec !== "simplex" ? `<br><small class="warn-text">Bu cilt için önerilen: ${modes.find((m) => m.v === rec).t}. Aksi halde arka yüzler ters çıkabilir.</small>` : "")
                + (mode === "manual" ? `<br><small>2 tur: önce ${Math.ceil(sides.length / 2)} ön yüz, sonra kağıtları çevirip ${Math.floor(sides.length / 2)} arka yüz.</small>` : "");
        };
        $("#modal").onchange = updateSummary;
        $("#pCopies").addEventListener("input", updateSummary);
        updateSummary();

        $("#modal").querySelector("[data-close]").onclick = closeModal;
        $("#pGo").onclick = async () => {
            const mode = document.querySelector('input[name="pMode"]:checked').value;
            const copies = Math.max(1, Math.min(999, +$("#pCopies").value || 1));
            const deviceName = desktop ? $("#pPrinter").value : "";
            const alsoPdf = desktop && $("#pAlsoPdf").checked;
            closeModal();
            if (alsoPdf) {
                const p = await savePdf(true);
                if (!p) return;
                toast("PDF kaydedildi, yazdırılıyor…", "ok");
            }
            const layout = buildSides(analyze());
            if (mode === "manual") manualDuplex(layout, deviceName, copies);
            else runPrint(layout, layout.sides, { duplexMode: mode, copies, deviceName });
        };
    }

    async function runPrint(layout, sides, opts) {
        const html = printHtml(layout, sides);
        if (!desktop) return browserPrint(html);
        const busy = toast("Yazıcıya gönderiliyor…", "info", 0);
        try {
            const res = await desktop.print({ html, ...jobMeta(layout), ...opts });
            busy.remove();
            if (res && res.success) toast("Yazıcıya gönderildi.", "ok");
            else if (res && res.failureReason && !/cancel/i.test(res.failureReason)) toast("Yazdırılamadı: " + res.failureReason, "error");
            return res;
        } catch (err) {
            busy.remove();
            toast("Yazdırılamadı: " + err.message, "error");
            return null;
        }
    }

    /* Yazıcı çift yüz desteklemiyorsa: önce tek numaralı sayfalar,
       sonra kağıt çevrilip çift numaralı sayfalar basılır. */
    async function manualDuplex(layout, deviceName, copies) {
        const sides = layout.sides;
        const odd = sides.filter((_, i) => i % 2 === 0);
        const even = sides.filter((_, i) => i % 2 === 1);
        while (even.length < odd.length) even.push({ kind: "page", p: { auto: true } }); // son kağıdın arkası boş
        const rotDefault = recommendedMode() === "shortEdge";

        const all = [];
        for (let c = 0; c < copies; c++) all.push(...odd);
        const res = await runPrint(layout, all, { duplexMode: "simplex", copies: 1, deviceName });
        if (desktop && (!res || !res.success)) return;

        openModal(`
            <h2>2. tur: kağıtları çevirin</h2>
            <div class="modal-body">
                <ol class="howto">
                    <li>Basılan ${odd.length * copies} yaprağı çıkış tepsisinden <b>sırasını bozmadan</b> alın.</li>
                    <li>Basılı yüz <b>yukarı</b> bakacak, sayfanın <b>üst kenarı</b> yazıcıya ilk girecek şekilde besleme tepsisine koyun. <small>(Yazıcınıza göre değişebilir; emin değilseniz önce tek bir kağıtla deneyin.)</small></li>
                    <li>Aşağıdaki düğmeye basın.</li>
                </ol>
                <label class="check"><input type="checkbox" id="mReverse"> <span>Arka yüzleri <b>ters sırada</b> bas <small>(kağıtlar yüzü yukarı çıkan yazıcılar için)</small></span></label>
                <label class="check"><input type="checkbox" id="mRotate" ${rotDefault ? "checked" : ""}> <span>Arka yüzleri <b>180° çevir</b> <small>(${BINDINGS[state.binding].short} için ${rotDefault ? "genelde gerekir" : "genelde gerekmez"}; ilk kağıtla kontrol edin)</small></span></label>
            </div>
            <div class="modal-foot">
                <button class="btn" data-close>Vazgeç</button>
                <button class="btn primary" id="mGo">2. turu yazdır (${even.length * copies} yüz)</button>
            </div>`);
        $("#modal").querySelector("[data-close]").onclick = closeModal;
        $("#mGo").onclick = () => {
            const reverse = $("#mReverse").checked;
            const rot = $("#mRotate").checked;
            closeModal();
            let list = [];
            for (let c = 0; c < copies; c++) list.push(...even.map((sd) => (rot ? { ...sd, rot180: true } : sd)));
            if (reverse) list = list.reverse();
            runPrint(layout, list, { duplexMode: "simplex", copies: 1, deviceName });
        };
    }

    /* ---------------- PROJE KAYDET / AÇ ---------------- */

    function projectJson() {
        const used = new Set(state.blocks.filter((b) => b.kind === "img").map((b) => b.imageId));
        state.blocks.forEach((b) => (b.layers || []).forEach((l) => { if (l.imageId) used.add(l.imageId); if (l.srcImageId) used.add(l.srcImageId); }));
        return JSON.stringify({
            app: "baski-masasi",
            version: 1,
            pageSize: state.pageSize,
            orient: state.orient,
            duplex: state.duplex,
            binding: state.binding,
            gutter: state.gutter,
            gutterMode: state.gutterMode,
            signature: state.signature,
            blocks: state.blocks,
            images: [...images.values()].filter((im) => used.has(im.id) || (!im.hidden && images.size < 40)),
            pdfs: [...pdfs.values()].filter((d) => state.blocks.some((b) => b.kind === "pdf" && b.pdfId === d.id))
        });
    }

    async function saveProject() {
        const json = projectJson();
        const name = defaultFileName() + ".baski";
        if (desktop) {
            const res = await desktop.saveProject({ json, defaultName: name });
            if (res && res.path) toast("İş kaydedildi.", "ok");
            return;
        }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    function loadProject(text) {
        let data;
        try { data = JSON.parse(text); } catch (e) { data = null; }
        if (!data || data.app !== "baski-masasi" || !Array.isArray(data.blocks)) {
            toast("Bu dosya bir Baskı Masası işi değil.", "error");
            return;
        }
        commit();
        // Eski görselleri silmiyoruz: "Geri al" ile önceki işe dönülebilsin
        (data.images || []).forEach((im) => images.set(im.id, im));
        (data.pdfs || []).forEach((d) => pdfs.set(d.id, d));
        state.pageSize = PAGE_SIZES[data.pageSize] ? data.pageSize : "A4";
        state.orient = data.orient === "landscape" ? "landscape" : "portrait";
        state.duplex = data.duplex !== false;
        state.binding = BINDINGS[data.binding] ? data.binding : "side";
        state.gutter = data.gutter != null ? +data.gutter : 10;
        state.gutterMode = data.gutterMode === "mirror" ? "mirror" : "both";
        state.signature = data.signature | 0;
        state.blocks = data.blocks;
        state.selected = null;
        render();
        toast("İş açıldı.", "ok");
    }

    async function openProject() {
        if (desktop) {
            const res = await desktop.openProject();
            if (res && res.text) loadProject(res.text);
            return;
        }
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = ".baski,application/json";
        inp.onchange = async () => {
            if (inp.files[0]) loadProject(await inp.files[0].text());
        };
        inp.click();
    }

    /* ---------------- CİLT SEÇİMİ ---------------- */

    function bindIcon(kind, size) {
        const z = size || 40;
        const rings = (pts) => pts.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" fill="none" stroke="currentColor" stroke-width="1.6"/>`).join("");
        let body = "";
        if (kind === "side") {
            body = `<rect x="11" y="5" width="24" height="30" rx="2" fill="#fff" stroke="currentColor" stroke-width="1.6"/>`
                + rings([8, 13, 18, 23, 28].map((y) => [7, y - 1.5, 8, 3]));
        } else if (kind === "top") {
            body = `<rect x="7" y="10" width="26" height="26" rx="2" fill="#fff" stroke="currentColor" stroke-width="1.6"/>`
                + rings([11, 16, 21, 26].map((x) => [x - 1.5, 6, 3, 8]));
        } else if (kind === "booklet") {
            body = `<path d="M20 9 L5 6 V32 L20 35 Z M20 9 L35 6 V32 L20 35 Z" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`
                + `<path d="M20 15v3M20 25v3" stroke="currentColor" stroke-width="2.4"/>`;
        } else {
            body = `<rect x="13" y="8" width="20" height="27" rx="2" fill="#fff" stroke="currentColor" stroke-width="1.4" opacity=".6"/>`
                + `<rect x="8" y="5" width="20" height="27" rx="2" fill="#fff" stroke="currentColor" stroke-width="1.6"/>`;
        }
        return `<svg class="bind-ico" viewBox="0 0 40 40" width="${z}" height="${z}" aria-hidden="true">${body}</svg>`;
    }

    /* İş başında ve "Değiştir" ile açılır: cilt türüne göre kağıt yönü,
       arkalı önlü çevirme ve spiral payı ayarlanır. */
    function openBindingDialog(opts) {
        const first = opts && opts.first;
        let choice = state.binding;
        const descs = {
            side: "Kitap gibi sağa-sola açılır. Arka yüzler uzun kenardan çevrilir, spiral tarafında boşluk bırakılır.",
            top: "Bloknot/takvim gibi yukarı açılır. Arka yüzler kısa kenardan çevrilir ki ters çıkmasın.",
            booklet: "Bir kağıda yan yana 2 sayfa basılır, kağıtlar ortadan katlanıp zımbalanır. Sayfa sırası otomatik dizilir.",
            none: "Sayfalar ayrı ayrı kullanılır (föy, test, tek yaprak)."
        };

        const optionsHtml = () => {
            if (choice === "booklet") {
                const size = BOOKLET_PAPER[state.pageSize] && isBooklet() ? state.pageSize : "A5";
                return `<label class="field">Kitapçık boyu
                    <select id="bSize">${Object.entries(BOOKLET_PAPER).map(([k, p]) =>
                        `<option value="${k}" ${k === size ? "selected" : ""}>${PAGE_SIZES[k].label} kitapçık → ${p.label} kağıda basılır</option>`).join("")}</select></label>
                    <label class="field">Forma
                    <select id="bSig">${[0, 3, 4, 5, 6, 8].map((k) => `<option value="${k}" ${state.signature === k ? "selected" : ""}>${k ? `${k} kağıtlık formalar (kalın kitapçık)` : "Tek forma (ince kitapçık, hepsi iç içe)"}</option>`).join("")}</select></label>`;
            }
            const size = isBooklet() && state.pageSize === "A5" ? "A4" : state.pageSize;
            return `<div class="row2b">
                <label class="field">Kağıt
                    <select id="bSize">${Object.entries(PAGE_SIZES).map(([k, p]) => `<option value="${k}" ${k === size ? "selected" : ""}>${p.label}</option>`).join("")}</select></label>
                <div class="field">Sayfa yönü
                    <div class="seg" id="bOrient">
                        <button data-v="portrait" class="${state.orient === "portrait" || isBooklet() ? "on" : ""}">▯ Dikey</button>
                        <button data-v="landscape" class="${state.orient === "landscape" && !isBooklet() ? "on" : ""}">▭ Yatay</button>
                    </div></div>
                ${choice === "side" || choice === "top" ? `<label class="field">Spiral payı
                    <span class="inline-num"><input type="number" id="bGutter" min="0" max="25" value="${isSpiral() ? state.gutter : 10}"> mm</span></label>` : ""}
                </div>
                ${choice === "side" || choice === "top" ? `<p class="note">Spiral payı: delik tarafında çizgi/yazı basılmayan boşluk. Varsayılan olarak her sayfada ${choice === "side" ? "sağda ve solda" : "üstte ve altta"} aynı bırakılır, böylece sayfalar birbirinin aynısı olur. Baskı planından "sadece delik tarafı" seçilebilir.</p>` : ""}`;
        };

        const draw = () => {
            $("#modal").innerHTML = `
                <h2>${first ? "Yeni iş: defter nasıl ciltlenecek?" : "Cilt türü"}</h2>
                <div class="modal-body">
                    <div class="bind-grid">${Object.keys(BINDINGS).map((k) => `
                        <button class="bind-card ${k === choice ? "on" : ""}" data-bind="${k}">
                            ${bindIcon(k, 44)}
                            <b>${BINDINGS[k].name}</b>
                            <small>${descs[k]}</small>
                        </button>`).join("")}
                    </div>
                    <div class="bind-opts">${optionsHtml()}</div>
                    ${first ? '<p class="hint">Bunu daha sonra üst çubuktaki cilt düğmesinden değiştirebilirsiniz.</p>' : ""}
                </div>
                <div class="modal-foot">
                    ${first ? "" : '<button class="btn" data-close>İptal</button>'}
                    <button class="btn primary" id="bOk">Tamam</button>
                </div>`;
        };

        $("#modalBack").hidden = false;
        draw();
        const modal = $("#modal");
        modal.onclick = (e) => {
            const card = e.target.closest("[data-bind]");
            if (card) { choice = card.dataset.bind; draw(); return; }
            const o = e.target.closest("#bOrient button");
            if (o) { modal.querySelectorAll("#bOrient button").forEach((b) => b.classList.toggle("on", b === o)); return; }
            if (e.target.closest("[data-close]")) { closeModal(); return; }
            if (e.target.closest("#bOk")) {
                commit();
                const prev = state.binding;
                state.binding = choice;
                state.pageSize = $("#bSize").value;
                if (choice === "booklet") {
                    state.signature = +$("#bSig").value;
                } else {
                    const on = modal.querySelector("#bOrient button.on");
                    state.orient = on ? on.dataset.v : "portrait";
                    if (choice !== "none") state.duplex = true;
                    const g = modal.querySelector("#bGutter");
                    if (g) state.gutter = Math.max(0, Math.min(25, Math.round(+g.value || 0)));
                }
                closeModal();
                modal.onclick = null;
                render();
                if (prev !== choice) toast(`Cilt: ${BINDINGS[choice].name}. Baskı ayarları buna göre düzenlendi.`, "ok");
            }
        };
    }

    /* ---------------- TEK SAYFAYI DEĞİŞTİRME (önizlemeden) ---------------- */

    /* Çok sayfalık bir bloğun occ'uncu sayfasını ayrı bloğa ayırır */
    function isolatePage(b, occ) {
        const L = blockPageIndexes(b);
        if (L.length <= 1) return b;
        const i = indexOf(b.id);
        const mk = (extra, keepLabel) => Object.assign(freshLayerIds(clone(b)), { id: uid(), label: keepLabel || b.kind === "empty" ? b.label : "" }, extra);
        let before, single, after;
        if (b.kind === "pdf") {
            const toBlocks = (seq) => {
                const runs = [];
                seq.forEach((pi) => {
                    const r = runs[runs.length - 1];
                    if (r && pi === r.to) r.to = pi + 1; else runs.push({ from: pi + 1, to: pi + 1 });
                });
                return runs.map((r) => mk({ from: r.from, to: r.to, count: 1 }));
            };
            before = toBlocks(L.slice(0, occ));
            single = mk({ from: L[occ] + 1, to: L[occ] + 1, count: 1 });
            after = toBlocks(L.slice(occ + 1));
        } else {
            before = occ > 0 ? [mk({ count: occ })] : [];
            single = mk({ count: 1 });
            after = L.length - occ - 1 > 0 ? [mk({ count: L.length - occ - 1 })] : [];
        }
        const parts = [...before, single, ...after];
        parts[0].label = b.label;
        state.blocks.splice(i, 1, ...parts);
        return single;
    }

    function replacePage(p, payload) {
        if (!p || !p.block) {
            toast("Bu sayfa otomatik eklenen bir boşluk; değiştirmek için sayfalar listesinden sayfa ekleyin.", "warn");
            return;
        }
        commit();
        const single = isolatePage(p.block, p.occ);
        applyContent(single, contentFromPayload(payload));
        render();
        toast("Sadece bu sayfa değiştirildi.", "ok");
    }

    function rotatePage(p) {
        if (!p || !p.block || (p.block.kind !== "img" && p.block.kind !== "pdf")) {
            toast("Döndürme görsel ve PDF sayfaları içindir. Şablonlar için kağıt yönünü değiştirin.", "warn");
            return;
        }
        commit();
        const single = isolatePage(p.block, p.occ);
        single.turn = ((single.turn || 0) + 90) % 360;
        render();
    }

    /* ---------------- YAZI / LOGO ---------------- */

    /* Kapaklar hariç tüm sayfalara bağlantılı sayfa numarası ekler.
       Numara alttaki boşluğa konur; şablonun alt boşluğu gerekirse büyütülür
       ki numara çizgilerin üstüne binmesin. */
    function addPageNumbers() {
        const targets = state.blocks.filter((b) => b.kind !== "img" && !/kapak/i.test(b.label || ""));
        if (!targets.length) { toast("Önce sayfa ekleyin.", "warn"); return; }
        const mirrorOk = state.binding !== "top" && (state.duplex || isBooklet());
        openModal(`
            <h2>Sayfa numarası ekle</h2>
            <div class="modal-body">
                <div class="field">Konum
                    <div class="radios">
                        <label class="radio"><input type="radio" name="pnPos" value="center" checked><span><b>Alt orta</b><small>Her sayfada aynı yerde</small></span></label>
                        <label class="radio"><input type="radio" name="pnPos" value="right"><span><b>Alt sağ köşe</b><small>Her sayfada sağda</small></span></label>
                        ${mirrorOk ? `<label class="radio"><input type="radio" name="pnPos" value="outer"><span><b>Dış köşe (kitap gibi)</b><small>Ön yüzde sağda, arka yüzde solda — kitaplardaki gibi</small></span></label>` : ""}
                    </div>
                </div>
                <div class="row2">
                    <label class="field">Boyut (pt) <input type="number" id="pnSize" min="6" max="40" value="11"></label>
                    <label class="field">Biçim
                        <select id="pnFmt"><option value="{s}">3</option><option value="- {s} -">- 3 -</option><option value="Sayfa {s}">Sayfa 3</option><option value="{s} / {t}">3 / 48</option></select></label>
                </div>
                <p class="note">Numara sayfanın altındaki boşluğa konur. Şablonun alt boşluğu dar ise 15 mm'ye çıkarılır ki numara çizgilerin üstüne binmesin.</p>
            </div>
            <div class="modal-foot"><button class="btn" data-close>İptal</button><button class="btn primary" id="pnGo">Ekle</button></div>`);
        const modal = $("#modal");
        modal.onclick = (e) => {
            if (e.target.closest("[data-close]")) { closeModal(); return; }
            if (!e.target.closest("#pnGo")) return;
            const pos = modal.querySelector('input[name="pnPos"]:checked').value;
            const size = Math.max(6, Math.min(40, +modal.querySelector("#pnSize").value || 11));
            const text = modal.querySelector("#pnFmt").value;
            closeModal();
            commit();
            const { W, H } = pageDims();
            const w = 40;
            const g = isSpiral() && state.gutterMode !== "mirror" ? state.gutter : 0;
            const boxH = size * 0.3528 * 1.25;
            const base = {
                type: "text", role: "pagenum", text, font: "arial", size, color: "#555555", bold: false, italic: false,
                align: pos === "center" ? "center" : "right", w,
                x: pos === "center" ? (W - w) / 2 : W - 10 - g - w,
                y: H - 7.5 - boxH, rot: 0, opacity: 1, mirror: pos === "outer", link: uid()
            };
            let widened = 0;
            targets.forEach((b) => {
                b.layers = (b.layers || []).filter((l) => l.role !== "pagenum");
                b.layers.push(Object.assign({}, base, { id: uid() }));
                if (b.kind === "tpl" && b.tpl !== "blank") {
                    const mg = marginsOf(b.opts || {});
                    if (mg.B < 15) { b.opts = Object.assign(b.opts || {}, { mBottom: 15 }); widened++; }
                }
            });
            render();
            toast(`Sayfa numarası ${targets.length} karta eklendi (kapaklar hariç)${widened ? ", alt boşluk 15 mm yapıldı" : ""}.`, "ok", 6000, [
                { label: "Düzenle", run: () => openEditor(targets[0].id, { layerId: targets[0].layers[targets[0].layers.length - 1].id }) }
            ]);
        };
    }

    let editor = null;

    function openEditor(blockId, opts) {
        if (!editor) {
            editor = window.BM_createEditor({
                getBlock: (id) => state.blocks.find((b) => b.id === id),
                blocks: () => state.blocks,
                pageDims,
                pageCount: (b) => blockPageIndexes(b).length,
                blockName,
                rangeText: (b) => rangeLabel(analyze().ranges.get(b.id)),
                ctxForBlock: (b, back) => {
                    const info = analyze();
                    const idx = info.ranges.get(b.id) || [0];
                    const want = back ? 1 : 0;
                    const found = idx.find((k) => k % 2 === want);
                    const i = found != null ? found : idx[0] + (back ? 1 : 0);
                    return Object.assign(ctxFor(i, info), { gutter: gutterFor(i, info.duplex) });
                },
                basePage: (b) => blockContent(b, false),
                resolveLayers,
                mirrorPossible: () => state.binding !== "top" && (state.duplex || isBooklet()),
                image: (id) => images.get(id),
                imageName: (id) => (images.get(id) || {}).name,
                libraryImages: () => [...images.values()].filter((im) => !im.hidden),
                addImage: (rec) => { const id = uid(); images.set(id, Object.assign({ id }, rec)); return id; },
                importFiles,
                isolateFirst: (id) => {
                    const b = state.blocks.find((x) => x.id === id);
                    commit();
                    const single = isolatePage(b, 0);
                    render();
                    return single.id;
                },
                commit,
                changed: () => render(),
                undo, redo, toast, openModal, closeModal, uid,
                onClose: () => render()
            });
        }
        if (preview && preview.isOpen()) preview.close();
        state.selected = blockId;
        render();
        editor.open(blockId, opts);
    }

    /* ---------------- DEFTER ÖNİZLEME ---------------- */

    let preview = null;

    function openPreview() {
        if (!ensureLayout()) return;
        if (!preview) {
            preview = window.BM_createPreview({
                analyze, pageDims, gutterFor, pageOf, ctxFor, pageSvg, blockName, bindIcon,
                editBlock: (id) => openEditor(id),
                binding: () => state.binding,
                bindingName: () => BINDINGS[state.binding].name,
                presetsHtml: () => $("#presetTiles").innerHTML,
                imagesHtml: () => $("#imageTiles").innerHTML,
                getDrag: () => drag,
                endDrag,
                importFiles,
                replacePage,
                rotatePage,
                openBinding: () => openBindingDialog(),
                showBlock: (id) => select(id),
                undo, redo
            });
        }
        preview.open();
    }

    /* ---------------- BİLDİRİMLER ---------------- */

    function toast(text, level = "info", ms = 3500, actions) {
        const el = document.createElement("div");
        el.className = "toast " + level;
        el.innerHTML = `<span>${esc(text)}</span>`;
        (actions || []).forEach((a) => {
            const b = document.createElement("button");
            b.className = "btn small";
            b.textContent = a.label;
            b.onclick = () => { a.run(); el.remove(); };
            el.appendChild(b);
        });
        $("#toasts").appendChild(el);
        // Aynı anda en fazla 3 bildirim
        const all = $("#toasts").children;
        while (all.length > 3) all[0].remove();
        if (ms) setTimeout(() => el.remove(), ms);
        return el;
    }

    /* ---------------- BAŞLAT ---------------- */

    $("#modalBack").addEventListener("mousedown", (e) => { if (e.target === $("#modalBack")) closeModal(); });

    renderPresets();
    setupEvents();
    setupDnD();
    defaultDoc();
    render();
    openBindingDialog({ first: true });

    // Testler ve hata ayıklama için
    window.__bm = { state, images, pdfs, analyze, buildSides, printHtml, render, impose, openPreview, openEditor, addPageNumbers };
})();
