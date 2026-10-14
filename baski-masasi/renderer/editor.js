/* =====================================================
   BASKI MASASI — sayfa düzenleyici (yazı ve logo)
   Bir kartın sayfalarına yazı ve logo katmanı ekler.
   Katmanlar fareyle sürüklenir, köşesinden büyütülür,
   ok tuşlarıyla milimetre milimetre kaydırılır.
   "Diğer sayfalara uygula" ile bağlantılı kopyalar
   oluşturulur: birinde yapılan değişiklik hepsine geçer.
===================================================== */

window.BM_createEditor = function (api) {
    const { FONTS, PT_MM, layersSvg, layerBox, pageSvg } = window.BM_TEMPLATES;
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const r1 = (n) => Math.round(n * 10) / 10;
    const SWATCHES = ["#222222", "#555555", "#ffffff", "#c0392b", "#e67e22", "#f1c40f", "#27ae60", "#2457c5", "#8e44ad", "#c7a66a"];

    let root = null;
    let blockId = null;
    let selId = null;
    let scale = 2; // px / mm
    let gesture = null;
    let lastCommit = 0;
    let viewBack = false;

    /* ---------- yardımcılar ---------- */

    const block = () => api.getBlock(blockId);
    function layers() {
        const b = block();
        if (!b) return [];
        if (!b.layers) b.layers = [];
        return b.layers;
    }
    const sel = () => layers().find((l) => l.id === selId) || null;

    /* Kısa aralıklı değişiklikleri (ok tuşu, yazma) tek geri alma adımında topla */
    function commitOnce() {
        const now = Date.now();
        if (now - lastCommit > 900) api.commit();
        lastCommit = now;
    }

    function linkedCount(l) {
        if (!l || !l.link) return 0;
        return api.blocks().filter((b) => (b.layers || []).some((x) => x.link === l.link)).length;
    }

    /* Bağlantılı kopyaları güncelle (konum dahil, kimlik hariç) */
    function syncLinked(l) {
        if (!l || !l.link) return;
        api.blocks().forEach((b) => (b.layers || []).forEach((x, i) => {
            if (x.link === l.link && x.id !== l.id) b.layers[i] = Object.assign({}, l, { id: x.id });
        }));
    }

    function changed(l) {
        syncLinked(l || sel());
        api.changed();
    }

    /* ---------- çizim ---------- */

    function fit() {
        const stage = root.querySelector(".ed-stage");
        const { W, H } = api.pageDims();
        scale = Math.max(0.5, Math.min((stage.clientWidth - 60) / W, (stage.clientHeight - 60) / H));
        const page = root.querySelector(".ed-page");
        page.style.width = W * scale + "px";
        page.style.height = H * scale + "px";
    }

    function drawBase() {
        const b = block();
        const { W, H } = api.pageDims();
        const ctx = api.ctxForBlock(b, viewBack);
        root.querySelector(".ed-base").innerHTML = pageSvg(api.basePage(b, ctx), W, H, 'width="100%" height="100%" preserveAspectRatio="none"', ctx.gutter, { pxPerMm: scale });
    }

    function drawLayers() {
        const b = block();
        if (!b) return;
        const { W, H } = api.pageDims();
        const ctx = api.ctxForBlock(b, viewBack);
        const resolved = api.resolveLayers(layers(), false);
        root.querySelector(".ed-layers").innerHTML =
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="none">${layersSvg(resolved, W, H, ctx)}</svg>`;
        root.querySelector(".ed-handles").innerHTML = layers().map((l) => {
            const bx = layerBox(l, W, ctx);
            return `<div class="ed-h ${l.type}${l.id === selId ? " on" : ""}${viewBack ? " ro" : ""}" data-id="${l.id}"
                style="left:${bx.x * scale}px;top:${bx.y * scale}px;width:${bx.w * scale}px;height:${bx.h * scale}px;transform:rotate(${l.rot || 0}deg)">
                ${l.id === selId && !viewBack ? '<span class="ed-knob" title="Büyüt / küçült"></span>' : ""}
            </div>`;
        }).join("");
        root.querySelector(".ed-empty").hidden = layers().length > 0;
    }

    function drawList() {
        root.querySelector(".ed-list").innerHTML = layers().map((l) => `
            <button class="ed-item${l.id === selId ? " on" : ""}" data-pick="${l.id}">
                <span class="ed-ico">${l.type === "text" ? "T" : "▣"}</span>
                <span class="ed-name">${esc(l.type === "text" ? (String(l.text || "").split("\n")[0] || "Yazı") : (api.imageName(l.srcImageId || l.imageId) || "Logo"))}</span>
                ${l.link ? `<span class="ed-link" title="Bağlantılı: ${linkedCount(l)} kartta">🔗${linkedCount(l)}</span>` : ""}
            </button>`).join("") || `<p class="hint">Henüz yazı veya logo yok.</p>`;
        root.querySelector(".ed-logos").innerHTML = api.libraryImages().map((im) => `
            <button class="ed-logo" data-addlogo="${im.id}" title="${esc(im.name)} — sayfaya ekle"><img src="${im.thumb}" alt=""></button>`).join("");
    }

    function drawHead() {
        const b = block();
        const n = api.pageCount(b);
        const blocks = api.blocks();
        const i = blocks.findIndex((x) => x.id === blockId);
        root.querySelector(".ed-title").innerHTML = `<b>${esc(api.blockName(b))}</b> <span>${esc(api.rangeText(b))}</span>`;
        root.querySelector(".ed-scope").innerHTML = n > 1
            ? `Bu karttaki <b>${n} sayfanın hepsine</b> uygulanır. <button class="btn small" data-act="isolate">Sadece ilk sayfa için ayır</button>`
            : "Bu sayfaya uygulanır.";
        root.querySelector("[data-act=prevb]").disabled = i <= 0;
        root.querySelector("[data-act=nextb]").disabled = i >= blocks.length - 1;
        const mirrorable = api.mirrorPossible() && layers().some((l) => l.mirror);
        const seg = root.querySelector(".ed-side");
        seg.hidden = !mirrorable;
        if (!mirrorable) viewBack = false;
        seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", (x.dataset.side === "back") === viewBack));
    }

    function drawPanel() {
        const el = root.querySelector(".ed-props");
        const l = sel();
        if (!l) {
            el.innerHTML = `<h3>Nasıl kullanılır?</h3>
                <ol class="howto">
                    <li>Soldan <b>Yazı ekle</b> veya bir <b>logo</b> seçin. Bilgisayardan logo dosyasını sayfanın üstüne de bırakabilirsiniz.</li>
                    <li>Öğeyi fareyle sürükleyin, köşesindeki noktadan büyütün.</li>
                    <li><b>Ok tuşları</b> 1 mm kaydırır (Shift: 5 mm, Alt: 0,2 mm). Delete siler, Ctrl+D çoğaltır.</li>
                    <li>Yazıda <code>{s}</code> sayfa numarası, <code>{t}</code> toplam sayfa olur.</li>
                    <li><b>Diğer sayfalara uygula</b> ile aynı öğeyi başka kartlara da koyun.</li>
                </ol>`;
            return;
        }
        const { W, H } = api.pageDims();
        let h = "";
        if (l.type === "text") {
            h += `<h3>Yazı</h3>
                <label class="field">Metin <small>({s} = sayfa no, {t} = toplam)</small>
                    <textarea rows="3" data-p="text">${esc(l.text)}</textarea></label>
                <div class="row-2">
                    <label class="field">Yazı tipi
                        <select data-p="font">${Object.entries(FONTS).map(([k, f]) => `<option value="${k}" ${l.font === k ? "selected" : ""} style="font-family:${f.css.replace(/"/g, "'")}">${f.label}</option>`).join("")}</select></label>
                    <label class="field">Boyut (pt)
                        <input type="number" min="4" max="300" step="1" data-p="size" value="${l.size}"></label>
                </div>
                <div class="field">Biçim
                    <div class="ed-row">
                        <div class="seg small">
                            <button data-toggle="bold" class="${l.bold ? "on" : ""}" title="Kalın"><b>K</b></button>
                            <button data-toggle="italic" class="${l.italic ? "on" : ""}" title="İtalik"><i>İ</i></button>
                        </div>
                        <div class="seg small">
                            ${[["left", "⇤ Sol"], ["center", "≡ Orta"], ["right", "Sağ ⇥"]].map(([v, t]) => `<button data-align="${v}" class="${l.align === v ? "on" : ""}">${t}</button>`).join("")}
                        </div>
                    </div>
                </div>
                <div class="field">Renk
                    <div class="swatches wrap">${SWATCHES.map((c) => `<button class="swatch${(l.color || "").toLowerCase() === c ? " on" : ""}" data-color="${c}" style="--c:${c}" title="${c}"></button>`).join("")}
                        <input type="color" data-p="color" value="${esc(l.color || "#222222")}" title="Başka renk"></div>
                </div>`;
        } else {
            const im = api.image(l.imageId);
            h += `<h3>Logo</h3>
                <div class="ed-logo-prev"><img src="${im ? im.thumb : ""}" alt=""></div>
                <label class="field">Genişlik (mm)
                    <div class="range-row"><input type="range" min="5" max="${Math.round(W)}" step="1" data-p="w" value="${r1(l.w)}">
                    <input type="number" min="2" max="${Math.round(W * 2)}" step="0.5" data-p="w" value="${r1(l.w)}"></div></label>
                <div class="group-title">Şeffaf arka plan</div>
                <p class="hint">Logonun etrafındaki düz renkli (genelde beyaz) zemini kaldırır.</p>
                <label class="field">Hassasiyet
                    <input type="range" min="10" max="160" step="5" id="edTol" value="${l.tol || 60}"></label>
                <label class="check"><input type="checkbox" id="edHoles" ${l.holes ? "checked" : ""}> <span>İç boşlukları da sil <small>(ör. “O” harfinin içi)</small></span></label>
                <div class="ed-row">
                    <button class="btn primary small" data-act="transparent">✨ Arkasını şeffaf yap</button>
                    ${l.srcImageId ? '<button class="btn small" data-act="original">Orijinale dön</button>' : ""}
                </div>`;
        }
        h += `<div class="group-title">Konum</div>
            <div class="row-2">
                <label class="field">Soldan (mm) <input type="number" step="0.5" data-p="x" value="${r1(l.x)}"></label>
                <label class="field">Üstten (mm) <input type="number" step="0.5" data-p="y" value="${r1(l.y)}"></label>
            </div>
            <div class="ed-row">
                <div class="seg small" title="Yatay hizala">
                    <button data-snap="left">Sola</button><button data-snap="hcenter">Ortala</button><button data-snap="right">Sağa</button>
                </div>
                <div class="seg small" title="Dikey hizala">
                    <button data-snap="top">Üste</button><button data-snap="vcenter">Orta</button><button data-snap="bottom">Alta</button>
                </div>
            </div>
            <div class="row-2">
                <label class="field">Döndür (°) <input type="number" step="1" data-p="rot" value="${l.rot || 0}"></label>
                <label class="field">Saydamlık (%) <input type="number" min="5" max="100" step="5" data-p="opacityPct" value="${Math.round((l.opacity == null ? 1 : l.opacity) * 100)}"></label>
            </div>
            ${api.mirrorPossible() ? `<label class="check"><input type="checkbox" data-p="mirror" ${l.mirror ? "checked" : ""}> <span>Arka yüzlerde sağ-sol yansıt <small>(sayfa numarası gibi dış kenara gelecek öğeler için)</small></span></label>` : ""}
            <div class="group-title">Diğer sayfalar</div>
            ${l.link ? `<p class="note">🔗 Bağlantılı: <b>${linkedCount(l)} kartta</b> aynı öğe var; burada yaptığınız değişiklik hepsine uygulanır. <button class="btn small" data-act="unlink">Bağlantıyı kopar</button></p>` : ""}
            <button class="btn" data-act="apply">📑 Diğer sayfalara uygula…</button>
            <div class="actions">
                <button class="btn" data-act="dup">⧉ Çoğalt</button>
                <button class="btn danger" data-act="del">Sil</button>
            </div>`;
        el.innerHTML = h;
    }

    function drawAll() {
        if (!block()) { close(); return; }
        fit();
        drawHead();
        drawBase();
        drawLayers();
        drawList();
        drawPanel();
    }

    /* ---------- katman işlemleri ---------- */

    function addText(at) {
        const { W, H } = api.pageDims();
        api.commit();
        const l = {
            id: api.uid(), type: "text", text: "Yazınız", font: "arial", size: 24, color: "#222222",
            bold: false, italic: false, align: "center", w: 90, x: 0, y: 0, rot: 0, opacity: 1, mirror: false
        };
        l.x = at ? at.x - l.w / 2 : (W - l.w) / 2;
        l.y = at ? at.y - 5 : H * 0.12;
        layers().push(l);
        selId = l.id;
        changed(l);
        drawAll();
        const ta = root.querySelector("textarea[data-p=text]");
        if (ta) { ta.focus(); ta.select(); }
    }

    function addLogo(imageId, at) {
        const im = api.image(imageId);
        if (!im) return;
        const { W } = api.pageDims();
        api.commit();
        const w = 40;
        const h = w * (im.h / im.w || 1);
        const l = { id: api.uid(), type: "logo", imageId, w, h, x: at ? at.x - w / 2 : W - w - 12, y: at ? at.y - h / 2 : 12, rot: 0, opacity: 1, mirror: false };
        layers().push(l);
        selId = l.id;
        changed(l);
        drawAll();
    }

    function removeSel() {
        const l = sel();
        if (!l) return;
        api.commit();
        const b = block();
        b.layers = b.layers.filter((x) => x.id !== l.id);
        selId = null;
        api.changed();
        drawAll();
        if (l.link && linkedCount(l)) api.toast("Yalnızca bu karttaki kopya silindi; diğer kartlardaki bağlantılı kopyalar duruyor.");
    }

    function dupSel() {
        const l = sel();
        if (!l) return;
        api.commit();
        const c = Object.assign({}, l, { id: api.uid(), x: l.x + 5, y: l.y + 5 });
        delete c.link;
        layers().push(c);
        selId = c.id;
        api.changed();
        drawAll();
    }

    function setLogoWidth(l, w) {
        const ratio = l.h / l.w || 1;
        l.w = Math.max(2, w);
        l.h = l.w * ratio;
    }

    function snapTo(l, where) {
        const { W, H } = api.pageDims();
        const b = layerBox(l, W, null);
        const m = 10;
        if (where === "left") l.x = m;
        if (where === "hcenter") l.x = (W - b.w) / 2;
        if (where === "right") l.x = W - m - b.w;
        if (where === "top") l.y = m;
        if (where === "vcenter") l.y = (H - b.h) / 2;
        if (where === "bottom") l.y = H - m - b.h;
    }

    /* Logonun arka planını şeffaf yapar: kenarlardaki zemin rengini bulur,
       kenardan başlayarak (veya tüm resimde) benzer pikselleri siler. */
    async function makeTransparent(l, tol, holes) {
        const srcId = l.srcImageId || l.imageId;
        const src = api.image(srcId);
        if (!src) return;
        const img = await new Promise((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = src.url;
        });
        const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k));
        const h = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const d = data.data;

        // Zemin rengi: kenar piksellerinde en sık görülen (kabaca gruplanmış) renk
        const counts = new Map();
        const sample = (x, y) => {
            const o = (y * w + x) * 4;
            if (d[o + 3] < 20) return;
            const key = (d[o] >> 4) + "," + (d[o + 1] >> 4) + "," + (d[o + 2] >> 4);
            const e = counts.get(key) || { n: 0, r: 0, g: 0, b: 0 };
            e.n++; e.r += d[o]; e.g += d[o + 1]; e.b += d[o + 2];
            counts.set(key, e);
        };
        for (let x = 0; x < w; x++) { sample(x, 0); sample(x, h - 1); }
        for (let y = 0; y < h; y++) { sample(0, y); sample(w - 1, y); }
        let best = null;
        counts.forEach((e) => { if (!best || e.n > best.n) best = e; });
        if (!best) { api.toast("Logonun arka planı zaten şeffaf görünüyor."); return; }
        const br = best.r / best.n, bg = best.g / best.n, bb = best.b / best.n;
        const dist = (o) => Math.hypot(d[o] - br, d[o + 1] - bg, d[o + 2] - bb);
        const soft = tol * 0.5;
        const clear = (o) => {
            const dd = dist(o);
            const a = dd <= tol - soft ? 0 : Math.round(((dd - (tol - soft)) / soft) * 255);
            d[o + 3] = Math.min(d[o + 3], a);
        };

        if (holes) {
            for (let o = 0; o < d.length; o += 4) if (dist(o) < tol) clear(o);
        } else {
            const seen = new Uint8Array(w * h);
            const stack = [];
            const push = (x, y) => {
                const p = y * w + x;
                if (seen[p]) return;
                seen[p] = 1;
                if (dist(p * 4) < tol) stack.push(p);
            };
            for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
            for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
            while (stack.length) {
                const p = stack.pop();
                clear(p * 4);
                const x = p % w, y = (p / w) | 0;
                if (x > 0) push(x - 1, y);
                if (x < w - 1) push(x + 1, y);
                if (y > 0) push(x, y - 1);
                if (y < h - 1) push(x, y + 1);
            }
        }
        ctx.putImageData(data, 0, 0);
        const url = c.toDataURL("image/png");
        const tk = Math.min(1, 360 / Math.max(w, h));
        const t = document.createElement("canvas");
        t.width = Math.max(1, Math.round(w * tk));
        t.height = Math.max(1, Math.round(h * tk));
        t.getContext("2d").drawImage(c, 0, 0, t.width, t.height);
        const newId = api.addImage({ name: src.name + " (şeffaf)", url, thumb: t.toDataURL("image/png"), w, h, hidden: true });

        api.commit();
        l.srcImageId = srcId;
        l.imageId = newId;
        l.tol = tol;
        l.holes = holes;
        changed(l);
        drawAll();
        api.toast("Arka plan şeffaf yapıldı. Beğenmezseniz hassasiyeti değiştirip tekrar deneyin.", "ok");
    }

    /* ---------- diğer sayfalara uygula ---------- */

    function openApply() {
        const l = sel();
        if (!l) return;
        const others = api.blocks().filter((b) => b.id !== blockId);
        if (!others.length) { api.toast("Başka kart yok. Önce sayfalar ekleyin."); return; }
        const has = (b) => l.link && (b.layers || []).some((x) => x.link === l.link);
        api.openModal(`
            <h2>Diğer sayfalara uygula</h2>
            <div class="modal-body">
                <div class="ed-row">
                    <button class="btn small" data-q="all">Tümü</button>
                    <button class="btn small" data-q="nocover">Kapaklar hariç</button>
                    <button class="btn small" data-q="same">Aynı türdekiler</button>
                    <button class="btn small" data-q="none">Hiçbiri</button>
                </div>
                <div class="apply-list">${others.map((b) => `
                    <label class="check"><input type="checkbox" value="${b.id}" data-kind="${b.kind}" data-cover="${b.kind === "img" || /kapak/i.test(b.label || "") ? 1 : 0}" data-tpl="${b.tpl || ""}" ${has(b) ? "checked" : ""}>
                    <span><b>${esc(api.blockName(b))}</b> <small>${esc(api.rangeText(b))}${b.label ? " · " + esc(b.label) : ""}</small></span></label>`).join("")}
                </div>
                <label class="check"><input type="checkbox" id="apLink" checked> <span><b>Bağlantılı kopya</b> <small>— sonradan birinde değiştirince hepsi değişir</small></span></label>
            </div>
            <div class="modal-foot">
                <button class="btn" data-close>İptal</button>
                <button class="btn primary" id="apGo">Uygula</button>
            </div>`);
        const modal = document.getElementById("modal");
        const cur = block();
        modal.onclick = (e) => {
            const q = e.target.closest("[data-q]");
            if (q) {
                modal.querySelectorAll(".apply-list input").forEach((c) => {
                    c.checked = q.dataset.q === "all" ? true
                        : q.dataset.q === "nocover" ? c.dataset.cover !== "1"
                            : q.dataset.q === "same" ? c.dataset.kind === cur.kind && c.dataset.tpl === (cur.tpl || "")
                                : false;
                });
                return;
            }
            if (e.target.closest("[data-close]")) { api.closeModal(); return; }
            if (e.target.closest("#apGo")) {
                const ids = [...modal.querySelectorAll(".apply-list input:checked")].map((c) => c.value);
                const linked = modal.querySelector("#apLink").checked;
                api.closeModal();
                api.commit();
                const link = linked ? l.link || api.uid() : null;
                if (linked) l.link = link;
                let pages = 0;
                ids.forEach((id) => {
                    const b = api.getBlock(id);
                    b.layers = (b.layers || []).filter((x) => !(link && x.link === link));
                    const c = Object.assign({}, l, { id: api.uid() });
                    if (link) c.link = link; else delete c.link;
                    b.layers.push(c);
                    pages += api.pageCount(b);
                });
                api.changed();
                drawAll();
                api.toast(`${ids.length} karta (${pages} sayfa) uygulandı.`, "ok");
            }
        };
    }

    /* ---------- olaylar ---------- */

    function mmFromEvent(e) {
        const r = root.querySelector(".ed-page").getBoundingClientRect();
        return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    }

    function showGuides(gx, gy) {
        const g = root.querySelector(".ed-guides");
        g.innerHTML = (gx != null ? `<i class="gv" style="left:${gx * scale}px"></i>` : "") + (gy != null ? `<i class="gh" style="top:${gy * scale}px"></i>` : "");
    }

    function bind() {
        const page = root.querySelector(".ed-page");

        page.addEventListener("pointerdown", (e) => {
            // Yazı kutusunda kalan odağı al: Delete ve ok tuşları öğeye gitsin
            if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) document.activeElement.blur();
            root.focus({ preventScroll: true });
            if (viewBack) return;
            const h = e.target.closest(".ed-h");
            if (!h) {
                if (selId) { selId = null; drawLayers(); drawList(); drawPanel(); }
                return;
            }
            e.preventDefault();
            selId = h.dataset.id;
            const l = sel();
            api.commit();
            const p = mmFromEvent(e);
            gesture = {
                mode: e.target.classList.contains("ed-knob") ? "resize" : "move",
                sx: p.x, sy: p.y, ox: l.x, oy: l.y, ow: l.w, osize: l.size
            };
            page.setPointerCapture(e.pointerId);
            drawLayers(); drawList(); drawPanel();
        });

        page.addEventListener("pointermove", (e) => {
            if (!gesture) return;
            const l = sel();
            if (!l) return;
            const { W, H } = api.pageDims();
            const p = mmFromEvent(e);
            const dx = p.x - gesture.sx, dy = p.y - gesture.sy;
            if (gesture.mode === "move") {
                l.x = gesture.ox + dx;
                l.y = gesture.oy + dy;
                // Sayfa ortasına yapıştır
                const b = layerBox(l, W, null);
                let gx = null, gy = null;
                if (!e.altKey) {
                    if (Math.abs(l.x + b.w / 2 - W / 2) < 1.5) { l.x = W / 2 - b.w / 2; gx = W / 2; }
                    if (Math.abs(l.y + b.h / 2 - H / 2) < 1.5) { l.y = H / 2 - b.h / 2; gy = H / 2; }
                }
                showGuides(gx, gy);
            } else {
                const f = Math.max(0.05, (gesture.ow + dx) / gesture.ow);
                if (l.type === "logo") setLogoWidth(l, gesture.ow * f);
                else { l.w = Math.max(5, gesture.ow * f); l.size = Math.max(4, Math.round(gesture.osize * f * 2) / 2); }
            }
            drawLayers();
        });

        const end = () => {
            if (!gesture) return;
            gesture = null;
            showGuides(null, null);
            changed();
            drawLayers(); drawPanel();
        };
        page.addEventListener("pointerup", end);
        page.addEventListener("pointercancel", end);

        page.addEventListener("dblclick", (e) => {
            // Karta çift tıklayıp düzenleyici açılınca aynı çift tıklama buraya düşmesin
            if (Date.now() - openedAt < 700) return;
            const h = e.target.closest(".ed-h.text");
            if (!h) { if (!viewBack) addText(mmFromEvent(e)); return; }
            const ta = root.querySelector("textarea[data-p=text]");
            if (ta) { ta.focus(); ta.select(); }
        });

        // Bilgisayardan logo bırakma
        page.addEventListener("dragover", (e) => {
            if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); page.classList.add("drop-over"); }
        });
        page.addEventListener("dragleave", () => page.classList.remove("drop-over"));
        page.addEventListener("drop", async (e) => {
            e.preventDefault();
            page.classList.remove("drop-over");
            if (!e.dataTransfer.files.length) return;
            const at = mmFromEvent(e);
            const got = await api.importFiles(e.dataTransfer.files);
            const img = got.find((x) => x.type === "image");
            if (img) addLogo(img.id, at);
        });

        // Sol panel
        root.querySelector(".ed-left").addEventListener("click", (e) => {
            if (e.target.closest("[data-act=addtext]")) { addText(); return; }
            if (e.target.closest("[data-act=uplogo]")) { root.querySelector(".ed-file").click(); return; }
            const al = e.target.closest("[data-addlogo]");
            if (al) { addLogo(al.dataset.addlogo); return; }
            const pk = e.target.closest("[data-pick]");
            if (pk) { selId = pk.dataset.pick; root.focus({ preventScroll: true }); drawLayers(); drawList(); drawPanel(); }
        });
        root.querySelector(".ed-file").addEventListener("change", async (e) => {
            const got = await api.importFiles(e.target.files);
            e.target.value = "";
            const img = got.find((x) => x.type === "image");
            if (img) addLogo(img.id);
        });

        // Üst çubuk
        root.querySelector(".ed-head").addEventListener("click", (e) => {
            const a = e.target.closest("[data-act]");
            const side = e.target.closest("[data-side]");
            if (side) { viewBack = side.dataset.side === "back"; drawAll(); return; }
            if (!a) return;
            const blocks = api.blocks();
            const i = blocks.findIndex((x) => x.id === blockId);
            if (a.dataset.act === "close") close();
            if (a.dataset.act === "prevb" && i > 0) { blockId = blocks[i - 1].id; selId = null; drawAll(); }
            if (a.dataset.act === "nextb" && i < blocks.length - 1) { blockId = blocks[i + 1].id; selId = null; drawAll(); }
            if (a.dataset.act === "isolate") { blockId = api.isolateFirst(blockId); drawAll(); api.toast("İlk sayfa ayrı karta alındı; değişiklikler artık sadece ona uygulanır.", "ok"); }
        });

        // Özellik paneli
        const props = root.querySelector(".ed-props");
        props.addEventListener("input", (e) => {
            const l = sel();
            const k = e.target.dataset.p;
            if (!l || !k) return;
            commitOnce();
            let v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
            if (e.target.type === "number" || e.target.type === "range") {
                v = parseFloat(v);
                if (!isFinite(v)) return;
            }
            if (k === "w" && l.type === "logo") setLogoWidth(l, v);
            else if (k === "opacityPct") l.opacity = Math.max(0.05, Math.min(1, v / 100));
            else if (k === "size") l.size = Math.max(4, Math.min(300, v));
            else l[k] = v;
            props.querySelectorAll(`[data-p="${k}"]`).forEach((n) => { if (n !== e.target && n.type !== "checkbox") n.value = r1(v); });
            drawLayers();
            if (k === "text") drawList();
            if (k === "mirror") { drawHead(); }
            changed(l);
        });
        props.addEventListener("click", async (e) => {
            const l = sel();
            const btn = e.target.closest("button");
            if (!l || !btn) return;
            const set = (fn) => { api.commit(); fn(); changed(l); drawLayers(); drawPanel(); drawList(); };
            if (btn.dataset.toggle) set(() => { l[btn.dataset.toggle] = !l[btn.dataset.toggle]; });
            else if (btn.dataset.align) set(() => { l.align = btn.dataset.align; });
            else if (btn.dataset.color) set(() => { l.color = btn.dataset.color; });
            else if (btn.dataset.snap) set(() => snapTo(l, btn.dataset.snap));
            else if (btn.dataset.act === "del") removeSel();
            else if (btn.dataset.act === "dup") dupSel();
            else if (btn.dataset.act === "apply") openApply();
            else if (btn.dataset.act === "unlink") set(() => { delete l.link; });
            else if (btn.dataset.act === "original") set(() => { l.imageId = l.srcImageId; delete l.srcImageId; });
            else if (btn.dataset.act === "transparent") {
                btn.disabled = true;
                btn.textContent = "İşleniyor…";
                await makeTransparent(l, +root.querySelector("#edTol").value, root.querySelector("#edHoles").checked);
            }
        });

        // Klavye
        root.addEventListener("keydown", (e) => {
            if (!document.getElementById("modalBack").hidden) return;
            const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
            const mod = e.ctrlKey || e.metaKey;
            const l = sel();
            if (e.key === "Escape") {
                e.preventDefault();
                if (typing) document.activeElement.blur();
                else if (selId) { selId = null; drawLayers(); drawList(); drawPanel(); }
                else close();
                return;
            }
            if (mod && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); e.shiftKey ? api.redo() : api.undo(); drawAll(); return; }
            if (mod && e.key.toLowerCase() === "y" && !typing) { e.preventDefault(); api.redo(); drawAll(); return; }
            if (typing || !l || viewBack) return;
            const step = e.shiftKey ? 5 : e.altKey ? 0.2 : 1;
            const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
            if (moves[e.key]) {
                e.preventDefault();
                commitOnce();
                l.x += moves[e.key][0];
                l.y += moves[e.key][1];
                changed(l);
                drawLayers();
                const xi = props.querySelector("[data-p=x]"), yi = props.querySelector("[data-p=y]");
                if (xi) xi.value = r1(l.x);
                if (yi) yi.value = r1(l.y);
            } else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSel(); }
            else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); dupSel(); }
        });

        window.addEventListener("resize", () => { if (isOpen()) { fit(); drawLayers(); } });
    }

    function build() {
        root = document.createElement("div");
        root.className = "ed";
        root.tabIndex = -1;
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-label", "Sayfa düzenleyici");
        root.innerHTML = `
            <div class="ed-head">
                <button class="btn small" data-act="prevb" title="Önceki kart">‹</button>
                <div class="ed-title"></div>
                <button class="btn small" data-act="nextb" title="Sonraki kart">›</button>
                <div class="ed-scope"></div>
                <div class="seg small ed-side" hidden><button data-side="front">Ön yüz</button><button data-side="back">Arka yüz</button></div>
                <button class="btn primary" data-act="close">Bitti</button>
            </div>
            <div class="ed-body">
                <aside class="ed-left">
                    <button class="btn wide" data-act="addtext">T&nbsp; Yazı ekle</button>
                    <div class="group-title">Logo / görsel ekle</div>
                    <button class="btn wide" data-act="uplogo">⤒ Bilgisayardan logo seç</button>
                    <input type="file" class="ed-file" accept="image/*" hidden>
                    <div class="ed-logos"></div>
                    <div class="group-title">Bu sayfadaki öğeler</div>
                    <div class="ed-list"></div>
                </aside>
                <div class="ed-stage">
                    <div class="ed-page">
                        <div class="ed-base"></div>
                        <div class="ed-layers"></div>
                        <div class="ed-guides"></div>
                        <div class="ed-handles"></div>
                        <div class="ed-empty"><span>Soldan <b>Yazı ekle</b>'ye basın, logo seçin<br>ya da logo dosyasını buraya sürükleyin.<br><small>Boş bir yere çift tıklamak da yazı ekler.</small></span></div>
                    </div>
                </div>
                <aside class="ed-props"></aside>
            </div>`;
        document.body.appendChild(root);
        bind();
    }

    let openedAt = 0;

    function open(id, opts) {
        if (!root) build();
        openedAt = Date.now();
        blockId = id;
        selId = (opts && opts.layerId) || null;
        viewBack = false;
        root.hidden = false;
        document.body.classList.add("ed-open");
        requestAnimationFrame(() => {
            drawAll();
            root.focus();
            if (opts && opts.addText) addText();
            if (opts && opts.pickLogo) root.querySelector(".ed-file").click();
        });
    }

    function close() {
        if (!root) return;
        root.hidden = true;
        document.body.classList.remove("ed-open");
        api.onClose && api.onClose();
    }

    function isOpen() {
        return !!root && !root.hidden;
    }

    return { open, close, isOpen, refresh: () => { if (isOpen() && !gesture) drawAll(); } };
};
