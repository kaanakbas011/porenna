/* =====================================================
   BASKI MASASI — uygulama mantığı
===================================================== */

(() => {
    const { PAGE_SIZES, COLORS, WEIGHTS, TEMPLATE_TYPES, PRESETS, pageSvg } = window.BM_TEMPLATES;
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
        blocks: [],
        selected: null
    };
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
        return JSON.stringify({ pageSize: state.pageSize, orient: state.orient, duplex: state.duplex, blocks: state.blocks });
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
        return state.orient === "landscape" ? { W: p.h, H: p.w } : { W: p.w, H: p.h };
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

    /* pi: PDF bloklarında belgenin kaçıncı sayfası (0 tabanlı) */
    function blockPage(b, useThumb, pi) {
        if (b.kind === "tpl") return { kind: "tpl", tpl: b.tpl, opts: b.opts };
        if (b.kind === "img") {
            const im = images.get(b.imageId);
            return { kind: "img", image: im ? (useThumb ? im.thumb : im.url) : null, fit: b.fit };
        }
        if (b.kind === "pdf") {
            const doc = pdfs.get(b.pdfId);
            const pg = doc && doc.pages[pi != null ? pi : b.from - 1];
            if (!pg) return { kind: "blank" };
            return { kind: "img", image: useThumb ? pg.thumb : pg.url, fit: b.fit, rotate: b.rotate, w: pg.w, h: pg.h };
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
        delete b.pdfId; delete b.from; delete b.to; delete b.rotate;
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
        const ranges = new Map();
        for (const b of state.blocks) {
            const start = pages.length;
            for (const pi of blockPageIndexes(b)) {
                if (duplex && b.backBlank && pages.length % 2 === 1) pages.push({ auto: true });
                pages.push({ block: b, pi });
                if (duplex && b.backBlank) pages.push({ auto: true });
            }
            const realIdx = [];
            pages.forEach((p, i) => { if (i >= start && p.block === b) realIdx.push(i); });
            ranges.set(b.id, realIdx);
        }
        return { pages, ranges };
    }

    function analyze() {
        const { pages, ranges } = flatten(state.duplex);
        const warnings = [];
        const empties = state.blocks.filter((b) => b.kind === "empty");
        if (empties.length) {
            warnings.push({
                level: "warn",
                text: `${empties.length} temsili yer hâlâ boş. Boş sayfa olarak basılır.`,
                fix: empties.length ? { label: "İlk boş yeri seç", action: () => select(empties[0].id) } : null
            });
        }
        if (state.duplex && pages.length > 1) {
            const last = pages[pages.length - 1];
            const lastIsCoverish = last.block && (last.block.kind === "img" || /arka/i.test(last.block.label || ""));
            if (pages.length % 2 === 1) {
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
        return { pages, ranges, warnings };
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
        renderTop();
        renderLibraryImages();
        const info = analyze();
        renderBoard(info);
        renderProps(info);
        renderPlan(info);
    }

    function renderTop() {
        $("#pageSize").value = state.pageSize;
        document.querySelectorAll("#orient button").forEach((b) => b.classList.toggle("on", b.dataset.v === state.orient));
        $("#undoBtn").disabled = !undoStack.length;
        $("#redoBtn").disabled = !redoStack.length;
    }

    function sheetSvg(page) {
        const { W, H } = pageDims();
        return pageSvg(page, W, H, 'preserveAspectRatio="xMidYMid meet"');
    }

    function rangeLabel(idx) {
        if (!idx || !idx.length) return "";
        const side = (i) => (state.duplex ? (i % 2 === 0 ? " · ön" : " · arka") : "");
        if (idx.length === 1) return `s. ${idx[0] + 1}${side(idx[0])}`;
        return `s. ${idx[0] + 1}–${idx[idx.length - 1] + 1}`;
    }

    function renderBoard(info) {
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
            const thumb = empty
                ? `<div class="placeholder"><span>${esc(b.label || "Boş yer")}</span><small>Şablon veya görsel sürükleyin</small></div>`
                : sheetSvg(blockPage(b, true));
            html += `<div class="card${sel}${empty ? " empty" : ""}" draggable="true" data-id="${b.id}">
                <div class="card-top">
                    <span class="pg">${rangeLabel(info.ranges.get(b.id))}</span>
                    ${b.kind === "pdf" ? '<span class="flag pdf">PDF</span>' : ""}
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

        const sheets = info.pages.length;
        const paper = state.duplex ? Math.ceil(sheets / 2) : sheets;
        $("#boardStats").innerHTML = `<b>${sheets}</b> sayfa <span class="dot">•</span> <b>${paper}</b> yaprak kağıt <span class="dot">•</span> ${state.duplex ? "arkalı önlü" : "tek yüz"}`;
    }

    function renderLibraryImages() {
        const wrap = $("#imageTiles");
        wrap.innerHTML = [...pdfs.values()].map((d) => `
            <div class="tile pdf-tile" draggable="true" data-pdf="${d.id}" title="${esc(d.name)} — ${d.pages.length} sayfa">
                <div class="tile-thumb"><img src="${d.pages[0].thumb}" alt=""><span class="pdf-count">PDF · ${d.pages.length} s.</span></div>
                <span>${esc(d.name)}</span>
                <button class="icon-btn rm" data-rmpdf="${d.id}" title="Kütüphaneden kaldır">×</button>
            </div>`).join("") + [...images.values()].map((im) => `
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
                <div class="tile-thumb">${pageSvg({ kind: "tpl", tpl: p.tpl, opts: p.opts }, W, H)}</div>
                <span>${esc(p.name)}</span>
            </div>`).join("");
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
                h += `<label class="field">Kenar boşluğu (mm)
                    <div class="range-row"><input type="range" min="0" max="25" step="1" data-prop="opts.margin" value="${o.margin != null ? o.margin : 8}">
                    <input type="number" min="0" max="25" step="1" data-prop="opts.margin" value="${o.margin != null ? o.margin : 8}"></div>
                </label>`;
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

        h += `<div class="actions">
            <button class="btn" data-act="dup">⧉ Çoğalt</button>
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
        const sheetsCount = state.duplex ? Math.ceil(total / 2) : total;

        const nameOf = (p) => (!p ? "—" : p.auto ? "boş (otomatik)" : p.block.kind === "empty" ? "boş yer" : (p.block.label ? p.block.label + " · " : "") + blockName(p.block));
        const keyOf = (p) => (!p ? "-" : p.auto ? "auto" : p.block.id);

        // Yaprakları ardışık aynı olanları gruplayarak listele
        const sheets = [];
        for (let i = 0; i < total; i += state.duplex ? 2 : 1) {
            sheets.push({ front: pages[i], back: state.duplex ? pages[i + 1] : undefined });
        }
        const runs = [];
        sheets.forEach((s, i) => {
            const key = keyOf(s.front) + "|" + keyOf(s.back);
            const last = runs[runs.length - 1];
            if (last && last.key === key) last.to = i;
            else runs.push({ key, from: i, to: i, s });
        });

        let h = `<h3>Baskı planı</h3>
            <div class="seg wide" id="duplexSeg">
                <button data-duplex="0" class="${!state.duplex ? "on" : ""}">Tek yüz</button>
                <button data-duplex="1" class="${state.duplex ? "on" : ""}">Arkalı önlü</button>
            </div>
            <div class="stats">
                <div><b>${total}</b><span>sayfa</span></div>
                <div><b>${sheetsCount}</b><span>yaprak kağıt</span></div>
            </div>`;

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
                    <div class="side-chip ${r.s.front && r.s.front.auto ? "auto" : ""}"><em>${state.duplex ? "Ön" : "Sayfa"}</em>${esc(nameOf(r.s.front))}</div>
                    ${state.duplex ? `<div class="side-chip ${!r.s.back || r.s.back.auto ? "auto" : ""}"><em>Arka</em>${esc(nameOf(r.s.back))}</div>` : ""}
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

    function duplicateBlock(id) {
        const i = indexOf(id);
        if (i < 0) return;
        commit();
        const copy = clone(state.blocks[i]);
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
            const nb = clone(b);
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
        if (state.blocks.some((b) => b.kind === "img" && b.imageId === id)) {
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

    function setupEvents() {
        // Sayfa boyutu
        $("#pageSize").innerHTML = Object.entries(PAGE_SIZES).map(([k, p]) =>
            `<option value="${k}">${p.label} (${p.w}×${p.h} mm)</option>`).join("");
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
            select(card.dataset.id);
        });

        // Ayar paneli
        const props = $("#props");
        props.addEventListener("input", (e) => {
            const b = state.blocks.find((x) => x.id === state.selected);
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
            else if (btn.dataset.act === "dup") duplicateBlock(b.id);
            else if (btn.dataset.act === "delete") deleteBlock(b.id);
            else if (btn.dataset.act === "split") splitPdfBlock(b.id);
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
            const f = e.target.closest("[data-fix]");
            if (f) {
                const w = $("#plan")._warnings[+f.dataset.fix];
                if (w && w.fix) w.fix.action();
            }
        });

        // Klavye
        document.addEventListener("keydown", (e) => {
            const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === "z" && !e.shiftKey && !typing) { e.preventDefault(); undo(); }
            else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) && !typing) { e.preventDefault(); redo(); }
            else if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); openPrintDialog(); }
            else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); savePdf(); }
            else if (mod && e.key.toLowerCase() === "d" && state.selected && !typing) { e.preventDefault(); duplicateBlock(state.selected); }
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

    function printHtml(pageList) {
        const { W, H } = pageDims();
        const body = pageList.map((p) => {
            const page = p && p.block ? blockPage(p.block, false, p.pi) : { kind: "blank" };
            return `<div class="p">${pageSvg(page, W, H, `width="${W}mm" height="${H}mm"`)}</div>`;
        }).join("");
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Baskı</title><style>
            @page { size: ${W}mm ${H}mm; margin: 0; }
            html, body { margin: 0; padding: 0; background: #fff; }
            .p { width: ${W}mm; height: ${H}mm; overflow: hidden; break-after: page; page-break-after: always; }
            .p:last-child { break-after: auto; page-break-after: auto; }
            svg { display: block; }
            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        </style></head><body>${body}</body></html>`;
    }

    function jobMeta() {
        const { W, H } = pageDims();
        return { widthMm: W, heightMm: H, landscape: state.orient === "landscape" };
    }

    function defaultFileName() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        return `baski-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    }

    function ensurePages() {
        const { pages } = analyze();
        if (!pages.length) {
            toast("Önce en az bir sayfa ekleyin.", "warn");
            return null;
        }
        return pages;
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
        const pages = ensurePages();
        if (!pages) return null;
        const html = printHtml(pages);
        if (!desktop) {
            toast("Tarayıcı modunda: yazdırma penceresinde hedef olarak “PDF olarak kaydet”i seçin.");
            await browserPrint(html);
            return null;
        }
        const busy = toast("PDF hazırlanıyor…", "info", 0);
        try {
            const res = await desktop.savePdf({ html, defaultName: defaultFileName() + ".pdf", ...jobMeta() });
            busy.remove();
            if (res && res.path) {
                if (!silentAfter) {
                    toast(`PDF kaydedildi (${pages.length} sayfa).`, "ok", 7000, [
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
    }

    async function openPrintDialog() {
        const pages = ensurePages();
        if (!pages) return;
        let printers = [];
        if (desktop) {
            try { printers = await desktop.getPrinters(); } catch (e) { printers = []; }
        }
        const landscape = state.orient === "landscape";
        const modes = [
            { v: "longEdge", t: "Arkalı önlü — uzun kenardan çevir", d: landscape ? "Yatay sayfada bloknot gibi çevrilir" : "Kitap/defter gibi çevrilir (önerilen)" },
            { v: "shortEdge", t: "Arkalı önlü — kısa kenardan çevir", d: landscape ? "Yatay sayfada kitap gibi çevrilir (önerilen)" : "Bloknot/takvim gibi yukarı çevrilir" },
            { v: "manual", t: "Elle arkalı önlü", d: "Yazıcı çift yüz basamıyorsa: önce tekler, sonra kağıdı çevirip çiftler" },
            { v: "simplex", t: "Tek yüz", d: "Her sayfa ayrı kağıda" }
        ];
        const def = state.duplex ? (landscape ? "shortEdge" : "longEdge") : "simplex";

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
                        <span><b>${m.t}</b><small>${m.d}</small></span></label>`).join("")}
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
            if (duplex !== state.duplex) { commit(); state.duplex = duplex; render(); }
            const { pages: pg } = analyze();
            const copies = Math.max(1, +$("#pCopies").value || 1);
            const sheets = (duplex ? Math.ceil(pg.length / 2) : pg.length) * copies;
            $("#pSummary").innerHTML = `<b>${pg.length}</b> sayfa × <b>${copies}</b> kopya → toplam <b>${sheets}</b> yaprak kağıt`
                + (mode === "manual" ? `<br><small>2 tur: önce ${Math.ceil(pg.length / 2)} tek sayfa, sonra kağıtları çevirip ${Math.floor(pg.length / 2)} çift sayfa.</small>` : "");
        };
        $("#modal").addEventListener("change", updateSummary);
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
            if (mode === "manual") manualDuplex(deviceName, copies);
            else runPrint(analyze().pages, { duplexMode: mode, copies, deviceName });
        };
    }

    async function runPrint(pageList, opts) {
        const html = printHtml(pageList);
        if (!desktop) return browserPrint(html);
        const busy = toast("Yazıcıya gönderiliyor…", "info", 0);
        try {
            const res = await desktop.print({ html, ...jobMeta(), ...opts });
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
    async function manualDuplex(deviceName, copies) {
        const pages = analyze().pages;
        const odd = pages.filter((_, i) => i % 2 === 0);
        const even = pages.filter((_, i) => i % 2 === 1);
        while (even.length < odd.length) even.push({ auto: true }); // son kağıdın arkası boş

        const all = [];
        for (let c = 0; c < copies; c++) all.push(...odd);
        const res = await runPrint(all, { duplexMode: "simplex", copies: 1, deviceName });
        if (desktop && (!res || !res.success)) return;

        openModal(`
            <h2>2. tur: kağıtları çevirin</h2>
            <div class="modal-body">
                <ol class="howto">
                    <li>Basılan ${odd.length * copies} yaprağı çıkış tepsisinden <b>sırasını bozmadan</b> alın.</li>
                    <li>Basılı yüz <b>yukarı</b> bakacak, sayfanın <b>üst kenarı</b> yazıcıya ilk girecek şekilde besleme tepsisine koyun. <small>(Yazıcınıza göre değişebilir; emin değilseniz önce tek bir kağıtla deneyin.)</small></li>
                    <li>Aşağıdaki düğmeye basın.</li>
                </ol>
                <label class="check"><input type="checkbox" id="mReverse"> <span>Çift sayfaları <b>ters sırada</b> bas <small>(kağıtlar yüzü yukarı çıkan yazıcılar için)</small></span></label>
            </div>
            <div class="modal-foot">
                <button class="btn" data-close>Vazgeç</button>
                <button class="btn primary" id="mGo">2. turu yazdır (${even.length * copies} sayfa)</button>
            </div>`);
        $("#modal").querySelector("[data-close]").onclick = closeModal;
        $("#mGo").onclick = () => {
            const reverse = $("#mReverse").checked;
            closeModal();
            let list = [];
            for (let c = 0; c < copies; c++) list.push(...even);
            if (reverse) list = list.reverse();
            runPrint(list, { duplexMode: "simplex", copies: 1, deviceName });
        };
    }

    /* ---------------- PROJE KAYDET / AÇ ---------------- */

    function projectJson() {
        const used = new Set(state.blocks.filter((b) => b.kind === "img").map((b) => b.imageId));
        return JSON.stringify({
            app: "baski-masasi",
            version: 1,
            pageSize: state.pageSize,
            orient: state.orient,
            duplex: state.duplex,
            blocks: state.blocks,
            images: [...images.values()].filter((im) => used.has(im.id) || images.size < 40),
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
        images.clear();
        (data.images || []).forEach((im) => images.set(im.id, im));
        pdfs.clear();
        (data.pdfs || []).forEach((d) => pdfs.set(d.id, d));
        state.pageSize = PAGE_SIZES[data.pageSize] ? data.pageSize : "A4";
        state.orient = data.orient === "landscape" ? "landscape" : "portrait";
        state.duplex = data.duplex !== false;
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

    // Testler ve hata ayıklama için
    window.__bm = { state, images, pdfs, analyze, printHtml, render };
})();
