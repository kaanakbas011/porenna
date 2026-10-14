/* =====================================================
   BASKI MASASI — defter önizleme
   Defteri cilt türüne göre (yandan spiral, üstten spiral,
   kitapçık, ciltsiz) açılmış halde gösterir. Sayfalar
   çevrilebilir, sürükle-bırak ile tek tek değiştirilebilir,
   görsel/PDF sayfaları döndürülebilir.
===================================================== */

window.BM_createPreview = function (api) {
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let root = null;
    let spreads = [];
    let index = 0;
    let busy = false;
    let info = null;

    /* ---------- veri ---------- */

    function compute() {
        info = api.analyze();
        const P = info.pages;
        let Q;
        if (info.duplex) {
            Q = P.map((p, i) => ({ p, i }));
        } else {
            // Tek yüz baskı: her kağıdın arkası boş
            Q = [];
            P.forEach((p, i) => { Q.push({ p, i }); Q.push({ blankBack: true }); });
            Q.pop();
        }
        spreads = Q.length ? [[null, Q[0]]] : [];
        for (let k = 1; k < Q.length; k += 2) spreads.push([Q[k], Q[k + 1] || null]);
        if (index > spreads.length - 1) index = Math.max(0, spreads.length - 1);
    }

    const vertical = () => api.binding() === "top";

    /* ---------- çizim ---------- */

    function pageHtml(q) {
        if (!q) return `<div class="pv-none"></div>`;
        const { W, H } = api.pageDims();
        if (q.blankBack) {
            return `<div class="pv-page blank-back">${api.pageSvg({ kind: "blank" }, W, H, 'preserveAspectRatio="none"')}
                <span class="pv-note">Arka yüz boş<br><small>(tek yüz baskı)</small></span></div>`;
        }
        const p = q.p;
        const gutter = api.gutterFor(q.i, info.duplex);
        const svg = api.pageSvg(api.pageOf(p, false), W, H, 'preserveAspectRatio="none"', gutter);
        const name = p.auto ? (p.pad ? "Boş (kitapçık tamamlama)" : "Boş (otomatik)") : p.block.kind === "empty" ? (p.block.label || "Boş yer") : api.blockName(p.block);
        const canRotate = p.block && (p.block.kind === "img" || p.block.kind === "pdf");
        const side = info.booklet ? "" : info.duplex ? (q.i % 2 === 0 ? " · ön yüz" : " · arka yüz") : "";
        return `<div class="pv-page${p.auto ? " auto" : ""}" data-pi="${q.i}">
            ${svg}
            ${gutter ? `<div class="pv-gutter g-${gutter.side}" style="--g:${(gutter.size / (gutter.side === "left" || gutter.side === "right" ? W : H)) * 100}%"></div>` : ""}
            ${p.block ? `<div class="pv-tools">
                ${canRotate ? `<button data-rot="${q.i}" title="Bu sayfayı 90° döndür">↻</button>` : ""}
                <button data-goto="${q.i}" title="Sayfalar listesinde göster">☰</button>
            </div>` : ""}
            <div class="pv-cap"><b>s. ${q.i + 1}</b>${side} — ${esc(name)}</div>
        </div>`;
    }

    function spineHtml() {
        const b = api.binding();
        if (b === "side" || b === "top") {
            return `<div class="pv-spine spiral ${b}">${Array.from({ length: 24 }, () => "<i></i>").join("")}</div>`;
        }
        if (b === "booklet") return `<div class="pv-spine fold"><i></i><i></i></div>`;
        return `<div class="pv-spine gap"></div>`;
    }

    function sizeBook() {
        const stage = root.querySelector(".pv-stage");
        const book = root.querySelector(".pv-book");
        const { W, H } = api.pageDims();
        const aw = stage.clientWidth - 140;
        const ah = stage.clientHeight - 40;
        let pw, ph;
        if (vertical()) {
            ph = Math.min(ah / 2, (aw * H) / W);
            pw = (ph * W) / H;
        } else {
            pw = Math.min(aw / 2, (ah * W) / H);
            ph = (pw * H) / W;
        }
        book.style.setProperty("--pw", Math.floor(pw) + "px");
        book.style.setProperty("--ph", Math.floor(ph) + "px");
        // halka sayısı sayfa boyuna göre
        const spine = book.querySelector(".pv-spine.spiral");
        if (spine) {
            const len = vertical() ? pw : ph;
            const n = Math.max(6, Math.floor(len / 22));
            spine.innerHTML = Array.from({ length: n }, () => "<i></i>").join("");
        }
    }

    function draw() {
        if (!root) return;
        compute();
        const book = root.querySelector(".pv-book");
        book.className = `pv-book ${vertical() ? "vertical" : "horizontal"} b-${api.binding()}`;
        const sp = spreads[index] || [null, null];
        book.innerHTML = `<div class="pv-slot a">${pageHtml(sp[0])}</div><div class="pv-slot b">${pageHtml(sp[1])}</div>${spineHtml()}`;
        sizeBook();

        const nums = sp.filter((q) => q && !q.blankBack).map((q) => q.i + 1);
        const total = info.pages.length;
        root.querySelector(".pv-ind").textContent = nums.length ? `Sayfa ${nums.join("–")} / ${total}` : `${total} sayfa`;
        const range = root.querySelector(".pv-range");
        range.max = Math.max(0, spreads.length - 1);
        range.value = index;
        root.querySelector(".pv-bind").innerHTML = `${api.bindIcon(api.binding(), 20)}<span>${esc(api.bindingName())}</span>`;
        root.querySelector(".pv-prev").disabled = index <= 0;
        root.querySelector(".pv-next").disabled = index >= spreads.length - 1;
    }

    function drawTiles() {
        root.querySelector(".pv-tiles").innerHTML = api.presetsHtml() + api.imagesHtml();
        root.querySelectorAll(".pv-tiles .rm").forEach((b) => b.remove());
    }

    /* ---------- sayfa çevirme ---------- */

    function turn(dir) {
        const target = index + dir;
        if (busy || target < 0 || target > spreads.length - 1) return;
        if (reduceMotion) { index = target; draw(); return; }
        busy = true;
        const cur = spreads[index], nxt = spreads[target];
        const book = root.querySelector(".pv-book");
        const slotA = book.querySelector(".pv-slot.a"), slotB = book.querySelector(".pv-slot.b");
        const v = vertical();
        const axis = v ? "rotateX" : "rotateY";
        let deg, front, back, over;
        if (dir > 0) {
            // sağ/alt sayfa kalkar, arkasında bir sonraki sol/üst sayfa görünür
            slotB.innerHTML = pageHtml(nxt[1]);
            front = cur[1]; back = nxt[0]; over = "b";
            deg = v ? 180 : -180;
        } else {
            slotA.innerHTML = pageHtml(nxt[0]);
            front = cur[0]; back = nxt[1]; over = "a";
            deg = v ? -180 : 180;
        }
        const flip = document.createElement("div");
        flip.className = `pv-flip over-${over}`;
        flip.innerHTML = `<div class="face front">${pageHtml(front)}</div><div class="face back" style="transform:${axis}(180deg)">${pageHtml(back)}</div>`;
        book.appendChild(flip);
        const anim = flip.animate(
            [{ transform: `${axis}(0deg)` }, { transform: `${axis}(${deg}deg)` }],
            { duration: 650, easing: "cubic-bezier(.45,.05,.35,1)" }
        );
        anim.onfinish = () => {
            index = target;
            busy = false;
            draw();
        };
    }

    /* ---------- olaylar ---------- */

    function pageFromEl(el) {
        const pi = el && el.closest("[data-pi]");
        return pi ? info.pages[+pi.dataset.pi] : null;
    }

    function bind() {
        root.querySelector(".pv-close").onclick = close;
        root.querySelector(".pv-prev").onclick = () => turn(-1);
        root.querySelector(".pv-next").onclick = () => turn(1);
        root.querySelector(".pv-range").oninput = (e) => { index = +e.target.value; draw(); };
        root.querySelector(".pv-bind").onclick = () => api.openBinding();

        root.querySelector(".pv-book").addEventListener("click", (e) => {
            const rot = e.target.closest("[data-rot]");
            if (rot) { api.rotatePage(info.pages[+rot.dataset.rot]); return; }
            const go = e.target.closest("[data-goto]");
            if (go) {
                const p = info.pages[+go.dataset.goto];
                close();
                if (p && p.block) api.showBlock(p.block.id);
                return;
            }
            if (busy) return;
            const slot = e.target.closest(".pv-slot");
            if (slot) turn(slot.classList.contains("b") ? 1 : -1);
        });

        // Sürükle-bırak ile sayfa değiştirme
        const book = root.querySelector(".pv-book");
        book.addEventListener("dragover", (e) => {
            const pg = e.target.closest(".pv-page[data-pi]");
            const hasFiles = e.dataTransfer && [...e.dataTransfer.types].includes("Files");
            if (!pg || (!api.getDrag() && !hasFiles)) return;
            e.preventDefault();
            book.querySelectorAll(".drop-over").forEach((n) => n !== pg && n.classList.remove("drop-over"));
            pg.classList.add("drop-over");
        });
        book.addEventListener("dragleave", (e) => {
            if (!book.contains(e.relatedTarget)) book.querySelectorAll(".drop-over").forEach((n) => n.classList.remove("drop-over"));
        });
        book.addEventListener("drop", async (e) => {
            e.preventDefault();
            const pg = e.target.closest(".pv-page[data-pi]");
            book.querySelectorAll(".drop-over").forEach((n) => n.classList.remove("drop-over"));
            let payload = api.getDrag();
            api.endDrag();
            if (!pg) return;
            if (payload && payload.type === "block") return;
            if (!payload && e.dataTransfer.files.length) {
                const got = await api.importFiles(e.dataTransfer.files);
                payload = got[0];
                drawTiles();
            }
            if (payload) api.replacePage(pageFromEl(pg), payload);
        });

        root.addEventListener("keydown", (e) => {
            if (!document.getElementById("modalBack").hidden) return;
            const mod = e.ctrlKey || e.metaKey;
            if (e.key === "Escape") { e.preventDefault(); close(); }
            else if (["ArrowRight", "ArrowDown", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey)) { e.preventDefault(); turn(1); }
            else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey)) { e.preventDefault(); turn(-1); }
            else if (e.key === "Home") { index = 0; draw(); }
            else if (e.key === "End") { index = spreads.length - 1; draw(); }
            else if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? api.redo() : api.undo(); }
            else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); api.redo(); }
        });
        window.addEventListener("resize", () => { if (isOpen()) sizeBook(); });
    }

    function build() {
        root = document.createElement("div");
        root.className = "pv";
        root.tabIndex = -1;
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-label", "Defter önizleme");
        root.innerHTML = `
            <div class="pv-head">
                <h2>Defter görünümü</h2>
                <button class="pv-bind btn small" title="Cilt türünü değiştir"></button>
                <div class="pv-ind"></div>
                <input type="range" class="pv-range" min="0" max="0" value="0" aria-label="Sayfaya git">
                <button class="btn pv-close">Kapat ✕</button>
            </div>
            <div class="pv-stage">
                <button class="pv-nav pv-prev" aria-label="Önceki sayfa">‹</button>
                <div class="pv-book"></div>
                <button class="pv-nav pv-next" aria-label="Sonraki sayfa">›</button>
            </div>
            <div class="pv-foot">
                <div class="pv-hint"><b>Sayfayı değiştirmek için</b> aşağıdan bir şablon/görsel sürükleyip sayfanın üstüne bırakın (yalnızca o sayfa değişir). Sayfaya tıklayınca ya da ←/→ ile çevrilir. ↻ döndürür.</div>
                <div class="pv-tiles tiles"></div>
            </div>`;
        document.body.appendChild(root);
        bind();
    }

    function open() {
        if (!root) build();
        root.hidden = false;
        document.body.classList.add("pv-open");
        drawTiles();
        draw();
        root.focus();
    }

    function close() {
        if (!root) return;
        root.hidden = true;
        document.body.classList.remove("pv-open");
    }

    function isOpen() {
        return !!root && !root.hidden;
    }

    function refresh() {
        if (!isOpen() || busy) return;
        drawTiles();
        draw();
    }

    return { open, close, isOpen, refresh, turn, get index() { return index; }, get spreads() { return spreads; } };
};
