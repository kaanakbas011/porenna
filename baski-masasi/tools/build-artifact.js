/* Claude içinde denenebilen tek dosyalık sürümü üretir.
   Kullanım: node tools/build-artifact.js <çıktı.html>
   Kod aynıdır; window.BM_ARTIFACT bayrağıyla yazdırma/indirme gibi
   Claude önizlemesinde çalışmayan işlemler kapatılır. */
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "renderer");
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
const out = process.argv[2] || path.join(__dirname, "..", "dist", "baski-masasi-deneme.html");

const html = read("index.html");
let body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
body = body.replace(/<script src="[^"]+"><\/script>\s*/g, "");

const banner = `
<div class="trial-bar">
    <span><b>Deneme sürümü.</b> Sayfa düzenleme, önizleme, yazı/logo ve PDF içe aktarma çalışır. PDF kaydetme ve yazdırma yalnızca Windows uygulamasında var.</span>
    <a href="https://github.com/kaanakbas011/porenna/releases" target="_blank" rel="noopener">Windows uygulamasını indir ↗</a>
</div>`;
body = body.replace('<header class="topbar">', banner + '\n<header class="topbar">');

const extraCss = `
/* Claude deneme sürümü */
html, body { height: 100%; }
body { background: var(--bg); color-scheme: light; }
.trial-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 16px;
    padding: 7px max(16px, env(safe-area-inset-right, 0px)) 7px max(16px, env(safe-area-inset-left, 0px));
    background: #fff4d6; color: #5c4510; font-size: 12.5px; border-bottom: 1px solid #ecd9a4; }
.trial-bar a { color: #2457c5; font-weight: 600; text-decoration: none; white-space: nowrap; }
.trial-bar a:hover { text-decoration: underline; }
#pdfBtn, #printBtn, #saveProjBtn { opacity: .55; }
@media (max-width: 1000px) {
    body { overflow: auto; height: auto; }
    .topbar { flex-wrap: wrap; }
    .top-group.right { margin-left: 0; }
    .layout { grid-template-columns: 1fr; }
    .library, .side, .board-wrap { overflow: visible; }
    .library { border-right: 0; border-bottom: 1px solid var(--line); }
    .side { border-left: 0; border-top: 1px solid var(--line); }
    .board-head { flex-wrap: wrap; }
    .board-stats { white-space: normal; }
}`;

const scripts = ["templates.js", "preview.js", "editor.js", "app.js"].map((f) => `<script>\n${read(f)}\n</script>`).join("\n");

const page = `<title>Baskı Masası</title>
<style>
${read("styles.css")}
${extraCss}
</style>
${body.trim()}
<script>window.BM_ARTIFACT = true;</script>
${scripts}
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(out, Math.round(page.length / 1024) + " KB");
