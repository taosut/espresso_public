const express = require('express');
const app = express();
require('events').EventEmitter.prototype._maxListeners = 1000;

const browser_instance = require('./browser_instance');
const domains = require('./domains/domains');

const PORT = process.env.PORT || 3000;
const options = {
	maxPageComment: 5,
	pageTimeout: 60000,
	width: 1920,
	height: 1080,
	viewPortW: 1920,
	viewPortH: 1080,
	scrollHeightFactor: 2000,
	buttonClickWaitTime: 1000,
	agent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36'
}

const SCOPE_OP_REQUEST = 'opreq';
const SCOPE_OP_SCROLL  = 'scroll';

// Get the instance for the first time
browser_instance.getBrowserInstance(options);

app.get('/api/v1/viewDom', async function(req, res) {
	const queries = req.query;
	let url = queries.url || '';
	let scopes = queries.scopes;
	let scrollHeightFactor = queries.scrollHeight || options.scrollHeightFactor;

	if (scopes) {
		scopes = scopes.split(",");
	} else {
		scopes = [SCOPE_OP_REQUEST];
	}

	if (url === ''){
		return res.send('No url');
	}

	let decodedUrl = decodeURIComponent(url);
	console.log('Decoded url: ' + decodedUrl);
	console.log('Scopes: ', scopes);

	let currentPage = null;
	let isCurrentPageClosed = false;
	try {
		const browser = await browser_instance.getBrowserInstance(options);

		if (!browser) {
			return res.send('The browser have not started yet.');
		}

		const page = await browser.newPage();

		if (!page) {
			return res.send('Can not create page');
		}

		currentPage = page;
		page.once('close', () => {
			isCurrentPageClosed = true;
		});

		// Print log inside the page's evaluate function
		page.on('console', msg => {
				let txt = msg._text;
				let logType = msg._type;
				if (txt[0] !== '[' && logType === 'log') {
				console.log(msg._text);
			}
		});

		if (scopes.includes(SCOPE_OP_REQUEST)) {
			await domains.doOptimizeRequests(page);
		}

		let viewPortH = options.viewPortH;
		if (scopes.includes(SCOPE_OP_SCROLL)) {
			viewPortH += scrollHeightFactor;
		}

		await page.setUserAgent(options.agent);
		await page.setViewport({ width: options.viewPortW, height: viewPortH});
		await page.goto(decodedUrl, {waitUntil: 'networkidle0', timeout: options.pageTimeout});

		const funcActions = await domains.getDomainFuncActionsByScopes(scopes);

		if (scopes.includes(SCOPE_OP_SCROLL)) {
			await domains.scrollAndFuncDoActions(page, options, funcActions);
		} else {
			await domains.doFuncActions(page, options, funcActions);
		}

		let html = await page.content();

		if (page) {
			await page.close();
			console.log('Closed page');
		}
		console.log('isCurrentPageClosed: ', isCurrentPageClosed);

		res.send(html);
	} catch (error) {
		console.log('error: ', error);
		try {
			if (currentPage && !isCurrentPageClosed) {
				await currentPage.close();
				console.log('Closed page with error');
			}
		} catch (error) {
			console.log('Error while closing a page');	
		}
		
		res.send('Error');
	}
	// await browser.close();
})


app.listen(PORT, () => {
	console.log(`Server is listening on port ${PORT}`);
})
