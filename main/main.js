const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

app.setAppUserModelId('ir.mnabishahzamani.taskyar');

let mainWindow = null;

function sendToRenderer(channel, ...args) {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(channel, ...args);
    }
}

function createApplicationMenu() {
    const template = [
        {
            label: 'فایل',
            submenu: [
                {
                    label: 'کار جدید',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => sendToRenderer('menu:new-task')
                },
                {
                    label: 'جستجو در کارها',
                    accelerator: 'CmdOrCtrl+F',
                    click: () => sendToRenderer('menu:focus-search')
                },
                { type: 'separator' },
                {
                    label: 'ذخیره دستی فایل پشتیبان (JSON)...',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => sendToRenderer('menu:export-backup')
                },
                {
                    label: 'بازیابی اطلاعات از فایل پشتیبان...',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => sendToRenderer('menu:import-backup')
                },
                { type: 'separator' },
                {
                    label: 'خروج',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => app.quit()
                }
            ]
        },
        {
            label: 'ویرایش',
            submenu: [
                { label: 'واگرد', role: 'undo' },
                { label: 'بازگردانی', role: 'redo' },
                { type: 'separator' },
                { label: 'برش', role: 'cut' },
                { label: 'کپی', role: 'copy' },
                { label: 'چسباندن', role: 'paste' },
                { label: 'انتخاب همه', role: 'selectAll' },
                { type: 'separator' },
                {
                    label: 'حذف کار انتخاب‌شده',
                    accelerator: 'Delete',
                    registerAccelerator: false, // the renderer handles the key, so typing is never hijacked
                    click: () => sendToRenderer('menu:delete-task')
                }
            ]
        },
        {
            label: 'پشتیبان‌گیری',
            submenu: [
                {
                    label: 'تنظیمات و دوره زمانی بکاپ خودکار...',
                    accelerator: 'CmdOrCtrl+B',
                    click: () => sendToRenderer('menu:open-backup-settings')
                },
                {
                    label: 'پشتیبان‌گیری هم‌اکنون',
                    accelerator: 'CmdOrCtrl+Shift+B',
                    click: () => sendToRenderer('menu:trigger-backup')
                },
                { type: 'separator' },
                {
                    label: 'ذخیره دستی فایل پشتیبان (JSON)...',
                    click: () => sendToRenderer('menu:export-backup')
                },
                {
                    label: 'بازیابی اطلاعات از فایل پشتیبان...',
                    click: () => sendToRenderer('menu:import-backup')
                },
                {
                    label: 'باز کردن پوشه بکاپ‌ها',
                    click: () => sendToRenderer('menu:open-backup-folder')
                },
                { type: 'separator' },
                {
                    label: 'ارسال پشتیبان به ایمیل...',
                    click: () => sendToRenderer('menu:email-backup')
                }
            ]
        },
        {
            label: 'نمایش',
            submenu: [
                {
                    label: 'روز من',
                    accelerator: 'Alt+1',
                    click: () => sendToRenderer('menu:switch-view', 'myday')
                },
                {
                    label: 'برد ۷ روز هفته',
                    accelerator: 'Alt+2',
                    click: () => sendToRenderer('menu:switch-view', 'weekboard')
                },
                {
                    label: 'برد ۳۰ روزه ماه',
                    accelerator: 'Alt+3',
                    click: () => sendToRenderer('menu:switch-view', 'monthboard')
                },
                {
                    label: 'مهم و ستاره‌دار',
                    accelerator: 'Alt+4',
                    click: () => sendToRenderer('menu:switch-view', 'important')
                },
                {
                    label: 'کارهای روزانه',
                    accelerator: 'Alt+5',
                    click: () => sendToRenderer('menu:switch-view', 'daily')
                },
                {
                    label: 'برنامه‌های هفتگی',
                    accelerator: 'Alt+6',
                    click: () => sendToRenderer('menu:switch-view', 'weekly')
                },
                {
                    label: 'اهداف ماهیانه',
                    accelerator: 'Alt+7',
                    click: () => sendToRenderer('menu:switch-view', 'monthly')
                },
                {
                    label: 'همه وظایف',
                    accelerator: 'Alt+8',
                    click: () => sendToRenderer('menu:switch-view', 'all')
                },
                { type: 'separator' },
                {
                    label: 'تم رنگی',
                    submenu: [
                        {
                            label: 'بنفش (پیش‌فرض)',
                            click: () => sendToRenderer('menu:set-theme', 'default')
                        },
                        {
                            label: 'آبی اقیانوسی',
                            click: () => sendToRenderer('menu:set-theme', 'ocean')
                        },
                        {
                            label: 'قرمز غروب',
                            click: () => sendToRenderer('menu:set-theme', 'sunset')
                        },
                        {
                            label: 'سبز زمردی',
                            click: () => sendToRenderer('menu:set-theme', 'emerald')
                        }
                    ]
                },
                { type: 'separator' },
                { label: 'بزرگ‌نمایی', role: 'zoomIn' },
                { label: 'کوچک‌نمایی', role: 'zoomOut' },
                { label: 'اندازه واقعی', role: 'resetZoom' },
                { type: 'separator' },
                { label: 'حالت تمام‌صفحه', role: 'togglefullscreen' },
                { label: 'بارگذاری مجدد', role: 'reload', accelerator: 'CmdOrCtrl+R' }
            ]
        },
        {
            label: 'راهنما',
            submenu: [
                {
                    label: 'راهنمای کلیدهای میانبر...',
                    accelerator: 'F1',
                    click: () => sendToRenderer('menu:open-shortcuts')
                },
                { type: 'separator' },
                {
                    label: 'درباره تسک‌یار',
                    click: () => sendToRenderer('menu:open-about')
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setMenu(menu);
    }
}

function registerIpcHandlers() {
    ipcMain.handle('backup:get-default-folder', () => {
        const defaultPath = path.join(app.getPath('documents'), 'TaskYar_Backups');
        if (!fs.existsSync(defaultPath)) {
            try {
                fs.mkdirSync(defaultPath, { recursive: true });
            } catch (err) {}
        }
        return defaultPath;
    });

    ipcMain.handle('backup:select-folder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'انتخاب پوشه ذخیره بکاپ خودکار',
            properties: ['openDirectory', 'createDirectory']
        });
        if (result.canceled || !result.filePaths.length) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('backup:open-folder', async (event, folderPath) => {
        const target = folderPath || path.join(app.getPath('documents'), 'TaskYar_Backups');
        if (!fs.existsSync(target)) {
            try {
                fs.mkdirSync(target, { recursive: true });
            } catch (err) {
                return false;
            }
        }
        await shell.openPath(target);
        return true;
    });

    ipcMain.handle('backup:save-file', async (event, { folderPath, data, isAuto }) => {
        try {
            const targetFolder = folderPath || path.join(app.getPath('documents'), 'TaskYar_Backups');
            if (!fs.existsSync(targetFolder)) {
                fs.mkdirSync(targetFolder, { recursive: true });
            }

            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
            const prefix = isAuto ? 'taskyar_autobackup' : 'taskyar_backup';
            const fileName = `${prefix}_${stamp}.json`;
            const filePath = path.join(targetFolder, fileName);
            const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

            await fs.promises.writeFile(filePath, content, 'utf-8');

            const latestPath = path.join(targetFolder, 'taskyar_latest_backup.json');
            await fs.promises.writeFile(latestPath, content, 'utf-8');

            const files = await fs.promises.readdir(targetFolder);
            const autoFiles = files
                .filter(f => f.startsWith('taskyar_autobackup_') && f.endsWith('.json'))
                .sort((a, b) => b.localeCompare(a));

            if (autoFiles.length > 25) {
                for (const old of autoFiles.slice(25)) {
                    await fs.promises.unlink(path.join(targetFolder, old)).catch(() => {});
                }
            }

            return { success: true, filePath, fileName, timestamp: Date.now() };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('backup:export-dialog', async (event, data) => {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const defaultName = `taskyar_backup_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'ذخیره دستی فایل پشتیبان',
            defaultPath: defaultName,
            filters: [{ name: 'JSON Files', extensions: ['json'] }]
        });
        if (result.canceled || !result.filePath) return { canceled: true };
        const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        await fs.promises.writeFile(result.filePath, content, 'utf-8');
        return { success: true, filePath: result.filePath };
    });

    ipcMain.handle('backup:import-dialog', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'انتخاب فایل پشتیبان جهت بازیابی',
            filters: [{ name: 'JSON Files', extensions: ['json'] }],
            properties: ['openFile']
        });
        if (result.canceled || !result.filePaths.length) return { canceled: true };
        const content = await fs.promises.readFile(result.filePaths[0], 'utf-8');
        return { success: true, content, filePath: result.filePaths[0] };
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1180,
        height: 780,
        minWidth: 1000,
        minHeight: 640,
        title: 'تسک‌یار - مدیریت هوشمند کارها',
        icon: path.join(__dirname, '../build/icon.png'),
        autoHideMenuBar: false,
        backgroundColor: '#F5F3FF',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../preload/preload.js')
        }
    });

    createApplicationMenu();
    mainWindow.setMenuBarVisibility(true);
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        registerIpcHandlers();
        createWindow();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}

