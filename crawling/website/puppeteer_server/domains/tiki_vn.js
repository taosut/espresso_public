var exports = module.exports;

const utils = require('../utils');

getReviewsData = async (page, options) => {
    return new Promise(async (resolve, reject) => {
        try {
            const countBinhLuanButton = await page.$('.-reviews-count');
            if (!countBinhLuanButton) {
                resolve([]);
                return;
            }

            const numBinhLuan = await (await countBinhLuanButton.getProperty('innerText')).jsonValue();
            let numBinhLuanPage = (await page.$$('div.list-pager > ul > li')).length - 1;
            
            if (parseInt(numBinhLuan) === 0) {
                resolve([]);
                return;
            } else {
                if (numBinhLuanPage < 1) {
                    numBinhLuanPage = 1;
                }
            }
            console.log('numBinhLuanPage: ', numBinhLuanPage);
        
            // get reviews by clicking next page
            let i = 0;
            let reviewsData = [];
            do {
                if (numBinhLuanPage > 0) {
                    const reviewData = await page.evaluate(() => {
                        let data = [];
                        let contentElements = document.getElementsByClassName('review_detail');
                        let rateElements = document.querySelectorAll('div.rating > div > meta[itemprop="ratingValue"]');
                        let timeElements = document.getElementsByClassName('days');
                        let userNamesElements = document.querySelectorAll('[itemprop="author"]');

                        for (let i = 0; i < rateElements.length; i++){
                            data.push({
                                content: contentElements[i].textContent,
                                rate: rateElements[i].getAttribute('content'),
                                time: timeElements[i].textContent,
                                userName: userNamesElements[i].textContent
                            });
                        }
        
                        return data;
                    });
        
                    reviewsData = reviewsData.concat(reviewData);
        
                    // click next page
                    if (i < numBinhLuanPage - 1) {
                        await utils.click(page,
                                          `[data-page-number="${i + 2}"]`, 
                                          options.buttonClickWaitTime);
                    }
                }
                i++;
            } while (i < options.maxPageComment && i < numBinhLuanPage);

            resolve(reviewsData);
        } catch (error) {
            console.log(error);
            console.log('error while getting reviews');
            resolve([]);
        }
    });
}

exports.doActions = (page, options) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("Get comments and change DOM for tiki");
            let reviewsData = [];
            reviewsData = reviewsData.concat(await getReviewsData(page, options));

            if (reviewsData.length === 0) {
                resolve(true);
            }

            try {
                const dropDown = await page.$('#product-review-box > div > div.review-filter > div:nth-child(4)');
                await utils.clickButton(page, dropDown, 500);
                
                // get negative reviews
                const buttonChuaHaiLong = await page.$('[data-index="7"]');
                await utils.clickButton(page, buttonChuaHaiLong, options.buttonClickWaitTime);
                reviewsData = reviewsData.concat(await getReviewsData(page, options));
            } catch (error) {
                console.log('error while getting more reviews');
            }
            
            // concat reviews to the dom
            await utils.addReviewsToDom(page, reviewsData);

            resolve(true);
        } catch(error) {
            if (error.name == 'TypeError') {
                // when the comment button is null we will return true
                console.log("Can't find the element or error while reading reviews");
                resolve(true);
            } else {
                reject(error);
            }
        }
    });
};