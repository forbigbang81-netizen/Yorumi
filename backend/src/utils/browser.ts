import { Browser } from 'puppeteer-core';

let browserInstance: Browser | null = null;

export const getBrowserInstance = async (): Promise<Browser> => {
    // Return existing connected browser
    if (browserInstance && browserInstance.isConnected()) {
        return browserInstance;
    }

    // Check if we are running locally or on Vercel
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

    if (isProduction) {
        console.log('Launching Serverless Chromium...');

        // Use dynamic imports to work in both ESM/CJS and avoiding explicit require
        const chromiumModule = await import('@sparticuz/chromium') as any;
        const puppeteerModule = await import('puppeteer-core') as any;

        // Handle default exports depending on bundler/module type
        const chromium = chromiumModule.default || chromiumModule;
        const puppeteer = puppeteerModule.default || puppeteerModule;

        browserInstance = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        }) as unknown as Browser;
    } else {
        console.log('Launching Local Puppeteer...');
        // Dynamic import to avoid bundling puppeteer in production
        // @ts-ignore
        const localPuppeteerModule = await import('puppeteer-extra') as any;
        const localPuppeteer = localPuppeteerModule.default || localPuppeteerModule;
        
        // Use stealth plugin to bypass basic bot checks
        const stealthPluginModule = await import('puppeteer-extra-plugin-stealth') as any;
        const StealthPlugin = stealthPluginModule.default || stealthPluginModule;
        localPuppeteer.use(StealthPlugin());

        browserInstance = await localPuppeteer.launch({
            headless: true, // Use new headless mode for better evasion
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        }) as unknown as Browser;
    }

    return browserInstance;
};
