import { app, BrowserWindow, ipcMain, dialog } from "electron"
import { ipcMainHandle, isDev, DEV_PORT } from "./util.js";
import { getPreloadPath, getUIPath, getIconPath } from "./pathResolver.js";
import { getStaticData, pollResources } from "./test.js";
import { handleClientEvent, sessions } from "./ipc-handlers.js";
import { generateSessionTitle } from "./libs/util.js";
import type { ClientEvent } from "./types.js";
import { ConfigStore } from "./libs/config-store.js";
import { setConfigStore } from "./libs/claude-settings.js";
import { join } from "path";

// Windows: 抑制 Chromium 内部 DPAPI/OsCrypt 相关的错误日志
// 错误代码 0x80090345 是 Windows 某些环境下 DPAPI 初始化失败的已知问题
// 这不影响实际功能，Chromium 会回退到其他加密方式
// 我们的 API Key 加密使用自定义的 AES-256-GCM 方案（crypto-util.ts），不受影响
if (process.platform === 'win32') {
    // 设置日志级别为 FATAL (3)，抑制 ERROR (2) 及以下级别的日志
    // Chromium LogSeverity: INFO=0, WARNING=1, ERROR=2, FATAL=3
    app.commandLine.appendSwitch('log-level', '1');
}

const CONFIG_DB_PATH = join(app.getPath("userData"), "config.db");
const configStore = new ConfigStore(CONFIG_DB_PATH);
setConfigStore(configStore);

if (process.platform === 'win32') {
    app.setAppUserModelId('com.agent-cowork.app');
}

app.on("ready", () => {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            preload: getPreloadPath(),
        },
        icon: getIconPath(),
        titleBarStyle: "hiddenInset",
        backgroundColor: "#FAF9F6",
        trafficLightPosition: { x: 15, y: 18 }
    });

    if (isDev()) mainWindow.loadURL(`http://localhost:${DEV_PORT}`)
    else mainWindow.loadFile(getUIPath());

    pollResources(mainWindow);

    ipcMainHandle("getStaticData", () => {
        return getStaticData();
    });

    // Handle client events
    ipcMain.on("client-event", (_, event: ClientEvent) => {
        handleClientEvent(event);
    });

    // Handle session title generation
    ipcMainHandle("generate-session-title", async (_: any, userInput: string | null) => {
        return await generateSessionTitle(userInput);
    });

    // Handle recent cwds request
    ipcMainHandle("get-recent-cwds", (_: any, limit?: number) => {
        const boundedLimit = limit ? Math.min(Math.max(limit, 1), 20) : 8;
        return sessions.listRecentCwds(boundedLimit);
    });

    // Handle directory selection
    ipcMainHandle("select-directory", async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        
        if (result.canceled) {
            return null;
        }
        
        return result.filePaths[0];
    });
})
