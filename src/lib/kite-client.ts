/**
 * Kite Connect Client Helper
 * Reusable module for Zerodha Kite authentication and API calls.
 */

import puppeteer from 'puppeteer';
import { KiteConnect } from 'kiteconnect';
import { TOTP } from 'otpauth';
import { logger } from '@/lib/logger';

const kiteLogger = logger.scope('Kite');

// Configuration from environment
const CONFIG = {
    userId: process.env.ZERODHA_USER_ID,
    password: process.env.ZERODHA_PASSWORD,
    totpSecret: process.env.ZERODHA_TOTP_SECRET,
    apiKey: process.env.ZERODHA_API_KEY,
    apiSecret: process.env.ZERODHA_API_SECRET,
    loginUrl: 'https://kite.zerodha.com'
};

export function validateKiteConfig(): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!CONFIG.userId) missing.push('ZERODHA_USER_ID');
    if (!CONFIG.password) missing.push('ZERODHA_PASSWORD');
    if (!CONFIG.totpSecret) missing.push('ZERODHA_TOTP_SECRET');
    if (!CONFIG.apiKey) missing.push('ZERODHA_API_KEY');
    if (!CONFIG.apiSecret) missing.push('ZERODHA_API_SECRET');
    
    return { valid: missing.length === 0, missing };
}

/**
 * Get request token via headless browser login
 */
async function getRequestToken(): Promise<string> {
    kiteLogger.info('Launching headless browser for login...');
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    try {
        const page = await browser.newPage();
        
        // Construct the login URL with api_key for correct redirect
        const loginUrl = `https://kite.trade/connect/login?v=3&api_key=${CONFIG.apiKey}`;
        
        kiteLogger.info('Navigating to login page...');
        await page.goto(loginUrl, { waitUntil: 'networkidle0' });

        // 1. Enter User ID
        await page.waitForSelector('#userid');
        await page.type('#userid', CONFIG.userId!);
        await page.type('#password', CONFIG.password!);
        
        kiteLogger.info('Submitting credentials...');
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})
        ]);

        // Check for error message immediately
        const errorEl = await page.$('.error-message, .su-message.error');
        if (errorEl) {
            const errorText = await page.evaluate((el: Element) => el.textContent, errorEl);
            kiteLogger.error('Login Failed with Error:', errorText);
            throw new Error(`Zerodha Login Failed: ${errorText?.trim()}`);
        }

        kiteLogger.info('Waiting for 2FA screen...');
        try {
            await page.waitForSelector('input[type="text"], input[type="number"], input[placeholder="App Code"]', { timeout: 10000 });
        } catch {
            kiteLogger.error('Failed to find 2FA input. Current URL:', page.url());
            const err = await page.$eval('body', (el: Element) => (el as HTMLElement).innerText); 
            if (err.includes('Invalid credentials') || err.includes('Login failed')) {
               throw new Error('Invalid credentials');
            }
            throw new Error('Timed out waiting for 2FA input. Check if User ID/Password are correct.');
        }

        // Generate TOTP
        kiteLogger.info('Generating TOTP...');
        const totp = new TOTP({
            secret: CONFIG.totpSecret!,
            algorithm: 'SHA1',
            digits: 6,
            period: 30
        });
        const token = totp.generate();
        
        // Type TOTP
        const totpInputSelector = 'input[type="number"], input[type="text"]'; 
        await page.type(totpInputSelector, token);
        
        // Wait for redirect or authorization page
        kiteLogger.info('Waiting for redirect...');
        
        try {
            const submitBtn = await page.$('button[type="submit"]');
            if (submitBtn) {
                 await submitBtn.click();
            }
        } catch { /* Ignore */ }

        await page.waitForNavigation({ waitUntil: 'networkidle0' });
        let url = page.url();
        kiteLogger.info('Current URL:', url);

        // Check if we are on the Authorize page (Consent Screen)
        if (url.includes('connect/authorize')) {
            kiteLogger.info('Authorization consent screen detected. Clicking Authorize...');
            try {
                const submitBtn = await page.$('button[type="submit"]'); 
                if (submitBtn) {
                     await submitBtn.click();
                } else {
                     await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        const authBtn = buttons.find(b => b.textContent?.includes('Authorize'));
                        if (authBtn) authBtn.click();
                     });
                }
                
                await page.waitForNavigation({ timeout: 15000, waitUntil: 'networkidle0' });
                url = page.url();
                kiteLogger.info('URL after authorization:', url);
            } catch (e) {
                kiteLogger.error('Failed to click Authorize:', e);
            }
        }
        
        const urlObj = new URL(url);
        const requestToken = urlObj.searchParams.get('request_token');
        
        if (!requestToken) {
            throw new Error(`Request token not found in URL: ${url}. Ensure valid Redirect URL is set in Kite Connect app settings?`);
        }
        
        return requestToken;

    } finally {
        await browser.close();
    }
}

/**
 * Get authenticated Kite Connect instance
 */
export async function getAuthenticatedKiteClient(): Promise<typeof KiteConnect.prototype> {
    const configCheck = validateKiteConfig();
    if (!configCheck.valid) {
        throw new Error(`Missing required Zerodha credentials: ${configCheck.missing.join(', ')}`);
    }

    // 1. Get Request Token
    const requestToken = await getRequestToken();
    kiteLogger.info('Request Token obtained.');

    // 2. Initialize Kite Connect
    const kc = new KiteConnect({
        api_key: CONFIG.apiKey!,
        debug: false
    });

    // 3. Generate Session
    kiteLogger.info('Generating session...');
    const response = await kc.generateSession(requestToken, CONFIG.apiSecret!);
    const accessToken = response.access_token;
    kc.setAccessToken(accessToken);
    kiteLogger.info('Session active.');

    return kc;
}

export interface ExecutedOrder {
    orderId: string;
    symbol: string;
    transactionType: 'BUY' | 'SELL';
    quantity: number;
    averagePrice: number;
    orderTimestamp: Date;
}

/**
 * Fetch today's executed orders from Kite
 */
export async function fetchExecutedOrders(kc: typeof KiteConnect.prototype): Promise<ExecutedOrder[]> {
    kiteLogger.info('Fetching orders...');
    const orders = await kc.getOrders();
    
    // Filter for executed or partially executed orders
    // status: COMPLETE means fully filled. 
    // Best metric: filled_quantity > 0
     
    const executedOrders = orders.filter((o: any) => o.filled_quantity > 0);
    
    if (executedOrders.length === 0) {
        kiteLogger.info('No executed orders found for today.');
        return [];
    }

    kiteLogger.info(`Fetched ${executedOrders.length} executed orders.`);

    // Map to standardized format
     
    return executedOrders.map((o: any) => ({
        orderId: o.order_id,
        symbol: o.tradingsymbol,
        transactionType: o.transaction_type as 'BUY' | 'SELL',
        quantity: o.filled_quantity,
        averagePrice: o.average_price,
        orderTimestamp: o.order_timestamp ? new Date(o.order_timestamp) : new Date()
    }));
}
