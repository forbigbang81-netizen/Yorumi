import type { Browser } from 'puppeteer-core';
import { logger } from '../../core/logger';

let browserInstance: Browser | null = null;
let browserLaunchPromise: Promise<Browser> | null = null;

const launchBrowser = async (): Promise<Browser> => {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

    if (isProduction) {
        logger.info('Launching shared serverless Chromium instance');

        const chromiumModule = await import('@sparticuz/chromium') as Record<string, unknown>;
        const puppeteerModule = await import('puppeteer-core') as Record<string, unknown>;
        const chromium = (chromiumModule.default || chromiumModule) as any;
        const puppeteer = (puppeteerModule.default || puppeteerModule) as any;

        return puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        }) as Promise<Browser>;
    }

    logger.info('Launching shared local Puppeteer instance');

    const localPuppeteerPackage = 'puppeteer-extra';
    const stealthPluginPackage = 'puppeteer-extra-plugin-stealth';
    const localPuppeteerModule = await import(localPuppeteerPackage) as Record<string, unknown>;
    const stealthPluginModule = await import(stealthPluginPackage) as Record<string, unknown>;
    const localPuppeteer = (localPuppeteerModule.default || localPuppeteerModule) as any;
    const StealthPlugin = (stealthPluginModule.default || stealthPluginModule) as any;

    localPuppeteer.use(StealthPlugin());

    return localPuppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
        ],
    }) as Promise<Browser>;
};

const attachLifecycleHandlers = (browser: Browser) => {
    browser.on('disconnected', () => {
        browserInstance = null;
        browserLaunchPromise = null;
        logger.warn('Shared browser instance disconnected');
    });
};

export const getManagedBrowser = async (): Promise<Browser> => {
    if (browserInstance?.isConnected()) {
        return browserInstance;
    }

    if (!browserLaunchPromise) {
        browserLaunchPromise = launchBrowser()
            .then((browser) => {
                browserInstance = browser;
                attachLifecycleHandlers(browser);
                return browser;
            })
            .finally(() => {
                browserLaunchPromise = null;
            });
    }

    return browserLaunchPromise;
};
