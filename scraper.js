const { chromium } = require('playwright');

async function scanKeywords(keywords) {
    console.log(`🚀 Starting RAW DATA Scan...`);
    
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        locale: 'en-US'
    });

    const page = await context.newPage();
    let allFindings = [];

    const sites = [
        { name: 'Erome', searchUrl: (k, p) => `https://www.erome.com/search?q=${encodeURIComponent(k)}&page=${p}`, container: '#room_results .album-link, .video-link' },
        { name: 'Reddit', searchUrl: (k, p) => `https://old.reddit.com/search?q=${encodeURIComponent(k)}&sort=new`, container: '.search-result-link' },
        { name: 'SpankBang', searchUrl: (k, p) => `https://spankbang.com/s/${encodeURIComponent(k)}/${p}/?o=new`, container: '.video-item' },
        { name: 'Pornhub', searchUrl: (k, p) => `https://www.pornhub.com/video/search?search=${encodeURIComponent(k)}&o=d&page=${p}`, container: '#videoSearchResult .pcVideoListItem' },
        { name: 'RedTube', searchUrl: (k, p) => `https://www.redtube.com/?search=${encodeURIComponent(k)}&ordering=newest&page=${p}`, container: '.video_block' },
        { name: 'XHamster', searchUrl: (k, p) => `https://xhamster.com/search?q=${encodeURIComponent(k)}&sort=new&page=${p}`, container: 'div[data-video-id]' },
        { name: 'XVideos', searchUrl: (k, p) => `https://www.xvideos.com/?k=${encodeURIComponent(k)}&sort=uploaddate&p=${p}`, container: '.frame-block, .thumb-block' },
        { name: 'XNXX', searchUrl: (k, p) => `https://www.xnxx.com/search/${encodeURIComponent(k)}/date/${p}`, container: '.thumb-block' }
    ];

    for (const site of sites) {
        for (const term of keywords) {
            for (let pageNum = 1; pageNum <= 3; pageNum++) {
                if (site.name === 'Reddit' && pageNum > 1) continue;

                try {
                    console.log(`🔎 [${site.name}] Checking "${term}" (Page ${pageNum})...`);
                    await page.goto(site.searchUrl(term, pageNum), { waitUntil: 'domcontentloaded', timeout: 15000 });
                    
                    if (pageNum === 1 && site.name === 'Pornhub') {
                        try { await page.click('#accessAgeDisclaimerPHBtn', {timeout: 500}); } catch(e){}
                    }

                    const findings = await page.$$eval(site.container, (els, siteName) => {
                        return els.map(el => {
                            let title = "Unknown Title";
                            let link = "";
                            let date = "Unknown";

                            // --- SELECTORS ---
                            if (siteName === 'Erome') {
                                title = el.querySelector('.album-title')?.innerText?.trim() || "Erome Content";
                                link = el.getAttribute('href') || el.parentElement.getAttribute('href');
                                date = el.innerText.match(/(\d+\s\w+\sago)/)?.[0];
                            }
                            else if (siteName === 'Reddit') {
                                title = el.querySelector('a.search-title')?.innerText?.trim();
                                link = el.querySelector('a.search-title')?.getAttribute('href');
                                date = el.querySelector('.search-time time')?.innerText;
                            }
                            else if (siteName === 'Pornhub') {
                                title = el.querySelector('.title a')?.innerText?.trim();
                                link = "https://pornhub.com" + el.querySelector('.title a')?.getAttribute('href');
                                date = el.querySelector('.added')?.innerText?.trim();
                            }
                            else if (siteName === 'SpankBang') {
                                title = el.querySelector('.t')?.innerText?.trim();
                                link = "https://spankbang.com" + el.querySelector('.t')?.getAttribute('href');
                                date = el.innerText.match(/(\d+\s\w+\sago)/)?.[0];
                            }
                            else if (siteName === 'RedTube') {
                                title = el.querySelector('a.video_title')?.innerText?.trim();
                                link = "https://redtube.com" + el.querySelector('a.video_link')?.getAttribute('href');
                                date = el.querySelector('.added_time')?.innerText?.trim();
                            }
                            else if (siteName === 'XHamster') {
                                title = el.querySelector('.video-thumb__title')?.innerText?.trim();
                                link = el.querySelector('a.video-thumb__link')?.getAttribute('href');
                                date = el.querySelector('.video-thumb__upload-time')?.innerText?.trim();
                            }
                            else if (siteName === 'XVideos' || siteName === 'XNXX') {
                                const linkTag = el.querySelector('a') || el.parentElement.querySelector('a');
                                title = linkTag?.getAttribute('title') || linkTag?.innerText || "Video";
                                link = linkTag?.getAttribute('href');
                                if (link && !link.startsWith('http')) {
                                    link = (siteName === 'XVideos' ? "https://xvideos.com" : "https://xnxx.com") + link;
                                }
                                date = el.innerText.match(/(\d+\s\w+\sago)/)?.[0];
                            }

                            return { title, url: link, date: date || "Unknown", source: siteName };
                        });
                    }, site.name);

                    const validFindings = findings.filter(f => f && f.url && f.url.length > 5);
                    allFindings = [...allFindings, ...validFindings];

                } catch (e) {
                    console.log(`   Skipping [${site.name}] Page ${pageNum}: ${e.message}`);
                }
            }
        }
    }

    await browser.close();
    
    // DEDUPLICATION: Only filter exact duplicate URLs
    // This allows EVERYTHING through
    const uniqueResults = [...new Map(allFindings.map(item => [item['url'], item])).values()];

    console.log(`✅ Extraction Complete. Returning ${uniqueResults.length} items.`);
    return uniqueResults;
}

module.exports = { scanKeywords };
