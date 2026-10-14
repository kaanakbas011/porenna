/* Arayüze sadece gereken masaüstü işlevlerini açar */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
    savePdf: (job) => ipcRenderer.invoke("save-pdf", job),
    print: (job) => ipcRenderer.invoke("print", job),
    getPrinters: () => ipcRenderer.invoke("get-printers"),
    showInFolder: (p) => ipcRenderer.invoke("show-in-folder", p),
    openPath: (p) => ipcRenderer.invoke("open-path", p),
    saveProject: (o) => ipcRenderer.invoke("save-project", o),
    openProject: () => ipcRenderer.invoke("open-project")
});
