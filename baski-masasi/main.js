/* =====================================================
   BASKI MASASI — Electron ana süreç
   PDF kaydetme ve doğrudan yazıcıya gönderme burada yapılır.
===================================================== */

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1100,
        minHeight: 680,
        title: "Baskı Masası",
        backgroundColor: "#efece6",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    mainWindow.removeMenu();
    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

    // Dışarıdan bırakılan dosyalar pencereyi başka sayfaya götürmesin
    mainWindow.webContents.on("will-navigate", (e) => e.preventDefault());
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

/* Baskı HTML'ini gizli bir pencerede açar */
async function openPrintWindow(html) {
    const file = path.join(os.tmpdir(), `baski-masasi-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    await fs.promises.writeFile(file, html, "utf8");
    const win = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true, javascript: false }
    });
    await win.loadFile(file);
    // Görsellerin çözülmesi için kısa bir bekleme
    await new Promise((r) => setTimeout(r, 300));
    const cleanup = () => {
        if (!win.isDestroyed()) win.destroy();
        fs.promises.unlink(file).catch(() => {});
    };
    return { win, cleanup };
}

ipcMain.handle("save-pdf", async (_e, job) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: "PDF olarak kaydet",
        defaultPath: path.join(app.getPath("documents"), job.defaultName || "baski.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }]
    });
    if (canceled || !filePath) return { canceled: true };

    const { win, cleanup } = await openPrintWindow(job.html);
    try {
        const data = await win.webContents.printToPDF({
            printBackground: true,
            preferCSSPageSize: true,
            margins: { top: 0, bottom: 0, left: 0, right: 0 }
        });
        await fs.promises.writeFile(filePath, data);
        return { path: filePath };
    } catch (err) {
        return { error: err.message };
    } finally {
        cleanup();
    }
});

ipcMain.handle("print", async (_e, job) => {
    const { win, cleanup } = await openPrintWindow(job.html);
    const short = Math.min(job.widthMm, job.heightMm);
    const long = Math.max(job.widthMm, job.heightMm);
    const options = {
        silent: false,
        printBackground: true,
        copies: job.copies || 1,
        duplexMode: job.duplexMode || "simplex",
        landscape: !!job.landscape,
        margins: { marginType: "none" },
        pageSize: { width: Math.round(short * 1000), height: Math.round(long * 1000) }
    };
    if (job.deviceName) options.deviceName = job.deviceName;

    try {
        return await new Promise((resolve) => {
            win.webContents.print(options, (success, failureReason) => resolve({ success, failureReason }));
        });
    } finally {
        // Yazdırma kuyruğa alındıktan sonra pencereyi kapat
        setTimeout(cleanup, 1500);
    }
});

ipcMain.handle("get-printers", async () => {
    if (!mainWindow) return [];
    const list = await mainWindow.webContents.getPrintersAsync();
    return list.map((p) => ({ name: p.name, displayName: p.displayName, isDefault: !!p.isDefault }));
});

ipcMain.handle("show-in-folder", (_e, p) => shell.showItemInFolder(p));
ipcMain.handle("open-path", (_e, p) => shell.openPath(p));

ipcMain.handle("save-project", async (_e, { json, defaultName }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: "İşi kaydet",
        defaultPath: path.join(app.getPath("documents"), defaultName || "is.baski"),
        filters: [{ name: "Baskı Masası işi", extensions: ["baski"] }]
    });
    if (canceled || !filePath) return { canceled: true };
    await fs.promises.writeFile(filePath, json, "utf8");
    return { path: filePath };
});

ipcMain.handle("open-project", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: "İş aç",
        properties: ["openFile"],
        filters: [{ name: "Baskı Masası işi", extensions: ["baski", "json"] }]
    });
    if (canceled || !filePaths.length) return { canceled: true };
    return { text: await fs.promises.readFile(filePaths[0], "utf8") };
});

app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
