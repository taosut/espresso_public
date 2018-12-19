var exports = module.exports;

const puppeteer = require('puppeteer');
const genericPool = require('generic-pool');
const options = require('./options');
const logger = require('./logger')(module);

waitForBrowser = browserHandler => new Promise ((resolve, reject) => {
    const browserCheck = setInterval(() => {
        if (browserHandler.browser !== false) {
            clearInterval(browserCheck);
            resolve(true);
        }
    }, 10);
});

class BrowserHandler {
    constructor (options) {
        let _this = this;

        this.options = options;

        this.pageFactory = {
            create: async () => {
                waitForBrowser(_this);
                const context = await _this.browser.createIncognitoBrowserContext();
                const page = await context.newPage();
                // Print log inside the page's evaluate function
                page.on('console', msg => {
                        let txt = msg._text;
                        let logType = msg._type;
                        if (txt[0] !== '[' && logType === 'log') {
                        logger.info(msg._text);
                    }
                });
                return page;
            },
        
            destroy: async (page) => {
                // we dont handle close here
                // await page.close();
            }
        }
        this.pagePoolOptions = {
            max: 64,
            min: 8
        }
        this.pagePool = null;
        this.printPagePoolStatus = () => {
            logger.info(`======== Pagepool status START ========`);
            logger.info(`Pagepool spareResourceCapacity: ${this.pagePool.spareResourceCapacity}`);
            logger.info(`Pagepool max: ${this.pagePool.max}`);
            logger.info(`Pagepool min: ${this.pagePool.min}`);
            logger.info(`Pagepool size: ${_this.pagePool.size}`);
            logger.info(`Pagepool available: ${_this.pagePool.available}`);
            logger.info(`Pagepool borrowed: ${_this.pagePool.borrowed}`);
            logger.info(`Pagepool pending: ${_this.pagePool.pending}`);
            logger.info(`======== Pagepool status END ===========`);
        }

        const launchBrowser = async () => {
            logger.info('Launching the browser with options: ', this.options);
            this.browser = false;
            this.browser = await puppeteer.launch({
                headless: true,
                args: [`--no-sandbox`, `--window-size=${this.options.width},
                                      ${this.options.height}`]
            });
            logger.info('Created a new browser instance');
            
            if (this.pagePool == null) {
                logger.info(`Create page pool for browserhandler`);
                this.pagePool = genericPool.createPool(this.pageFactory, this.pagePoolOptions);
                this.printPagePoolStatus();
            } else {
                logger.info(`Recreate the browser so we clear the pageFool`);
                await this.pagePool.drain().then(() => {
                    _this.pagePool.clear();
                });
            }

            this.browser.on('disconnected', launchBrowser);
        };

        this.getPage = () => {
            return new Promise(async (resolve, reject) => {
                try {
                    waitForBrowser(_this);
                    const page = await _this.pagePool.acquire();
                    
                    resolve(page);
                    logger.info(`Get a page`);
                    this.printPagePoolStatus();
                } catch (error) {
                    // might get this when the timeout or maxWaitingClients
                    logger.info('Error while getting a page from pool');
                    reject(error);
                }
            });
        }

        this.releasePage = (page) => {
            return new Promise(async (resolve, reject) => {
                try {
                    await _this.pagePool.release(page);
                    resolve(true);
                    logger.info(`Release a page`);
                    this.printPagePoolStatus();
                } catch (error) {
                    reject(error);
                }
            });
        }

        this.destroyPage = (page) => {
            return new Promise(async (resolve, reject) => {
                try {
                    await _this.pagePool.destroy(page);
                    resolve(true);
                    logger.info(`Destroy a page`);
                    this.printPagePoolStatus();
                } catch (error) {
                    reject(error);
                }
            });
        }
        
        (async () => {
            await launchBrowser();
        })();
    }
}

let _instanceHandler = new BrowserHandler(options);
logger.info('Created a browserHandler');

exports.getPage = () => {
    return new Promise(async (resolve, reject) => {
        try {
            await waitForBrowser(_instanceHandler);
            const page = await _instanceHandler.getPage();
            resolve(page);
        } catch (error) {
            logger.info('Error while getting a page');
            reject(error);
        }
    });
};

exports.releasePage = (page) => {
    return new Promise(async (resolve, reject) => {
        try {
            const res = await _instanceHandler.releasePage(page);
            resolve(res);
        } catch (error) {
            logger.info('Error while releasing a page');
            reject(error);
        }
    });
}

exports.destroyPage = (page) => {
    return new Promise(async (resolve, reject) => {
        try {
            const res = await _instanceHandler.destroyPage(page);
            resolve(res);
        } catch (error) {
            logger.info('Error while releasing a page');
            reject(error);
        }
    });
}