const { chromium } = require('playwright');

async function scanKeywords(keywords) {
    console.log(`🚀 Starting FRESH SCAN (Sorting by Date)...`);
    
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        locale: 'en-US'
    });

    const page = await context.newPage();
    let allFindings = [];

    // TARGETED SUBREDDITS
    const redditSubs = ['CelebNSFW', 'WatchItForThePlot', 'nsfw', 'BonerMaterial', 'pornid', 'TipOfMyPenis', 'NSFW_GIF'];

    const sites = [
        { 
            name: 'Erome', 
            searchUrl: (k, p) => `https://www.erome.com/search?q=${encodeURIComponent(k)}&page=${p}`, 
            container: '#room_results .album-link, .video-link' 
        },
        { 
            name: 'Reddit', 
            type: 'subreddit', 
            subs: redditSubs,
            // CHANGED: sort=new instead of relevance
            searchUrl: (k, sub) => `https://old.reddit.com/r/${sub}/search?q=${encodeURIComponent(k)}&restrict_sr=on&sort=new&t=all`, 
            container: '.search-result-link' 
        },
        { 
            name: 'SpankBang', 
            searchUrl: (k, p) => `https://spankbang.com/s/${encodeURIComponent(k)}/${p}/?o=new`, 
            container: '.video-item' 
        },
        { 
            name: 'Pornhub', 
            searchUrl: (k, p) => `https://www.pornhub.com/video/search?search=${encodeURIComponent(k)}&o=d&page=${p}`, 
            container: '#videoSearchResult .pcVideoListItem, li.videoBox' 
        },
        { 
            name: 'RedTube', 
            searchUrl: (k, p) => `https://www.redtube.com/?search=${encodeURIComponent(k)}&ordering=newest&page=${p}`, 
            container: '.video_block, .video_block_partner' 
        },
        { 
            name: 'XHamster', 
            searchUrl: (k, p) => `https://xhamster.com/search?q=${encodeURIComponent(k)}&sort=new&page=${p}`, 
            container: 'div[data-video-id]' 
        },
        { 
            name: 'XVideos', 
            searchUrl: (k, p) => `https://www.xvideos.com/?k=${encodeURIComponent(k)}&sort=uploaddate&p=${p}`, 
            container: '.frame-block, .thumb-block' 
        },
        { 
            name: 'XNXX', 
            searchUrl: (k, p) => `https://www.xnxx.com/search/${encodeURIComponent(k)}/date/${p}`, 
            container: '.thumb-block' 
        }
    ];

    for (const site of sites) {
        for (const term of keywords) {
            
            if (site.name === 'Reddit') {
                for (const sub of site.subs) {
                    try {
                        console.log(`🔎 [Reddit] Scanning r/${sub} (Newest)...`);
                        await page.goto(site.searchUrl(term, sub), { waitUntil: 'domcontentloaded', timeout: 10000 });
                        allFindings.push(...(await extractFindings(page, site.name, site.container)));
                    } catch (e) {}
                }
                continue;
            }

            for (let pageNum = 1; pageNum <= 2; pageNum++) { // Reduced to 2 pages for speed
                try {
                    console.log(`🔎 [${site.name}] Checking "${term}" (Page ${pageNum})...`);
                    await page.goto(site.searchUrl(term, pageNum), { waitUntil: 'domcontentloaded', timeout: 20000 });

                    if (site.name === 'Pornhub') {
                        try { 
                            if (await page.$('#accessAgeDisclaimerPHBtn')) await page.click('#accessAgeDisclaimerPHBtn');
                            await page.waitForTimeout(500); 
                        } catch(e){}
                    }

                    allFindings.push(...(await extractFindings(page, site.name, site.container)));

                } catch (e) {
                    console.log(`   Skipping [${site.name}] Page ${pageNum}: ${e.message}`);
                }
            }
        }
    }

    await browser.close();
    
    const uniqueResults = [...new Map(allFindings.map(item => [item['url'], item])).values()];
    console.log(`✅ Extraction Complete. Found ${uniqueResults.length} items.`);
    return uniqueResults;
}

async function extractFindings(page, siteName, container) {
    const findings = await page.$$eval(container, (els, siteName) => {
        return els.map(el => {
            let title = "", link = "", date = "";

            if (siteName === 'Erome') {
                title = el.querySelector('.album-title')?.innerText?.trim();
                link = el.getAttribute('href') || el.parentElement?.getAttribute('href');
                date = el.innerText.match(/(\d+\s\w+\sago)/)?.[0];
            }
            else if (siteName === 'Reddit') {
                title = el.querySelector('a.search-title')?.innerText?.trim();
                link = el.querySelector('a.search-title')?.getAttribute('href');
                date = el.querySelector('.search-time time')?.innerText;
                const sub = el.querySelector('.search-subreddit-link')?.innerText;
                if (sub) title = `[${sub}] ${title}`;
            }
            else if (siteName === 'Pornhub') {
                const linkObj = el.querySelector('.title a') || el.querySelector('a.linkVideoThumb');
                title = linkObj?.getAttribute('title') || linkObj?.innerText?.trim();
                link = "https://pornhub.com" + linkObj?.getAttribute('href');
                date = el.querySelector('.added')?.innerText?.trim();
            }
            else if (siteName === 'SpankBang') {
                const linkObj = el.querySelector('.t');
                title = linkObj?.innerText?.trim(); 
                link = "https://spankbang.com" + linkObj?.getAttribute('href');
                date = el.innerText.match(/(\d+\s\w+\sago)/)?.[0];
            }
            else if (siteName === 'RedTube') {
                const linkObj = el.querySelector('a.video_title');
                title = linkObj?.getAttribute('title') || linkObj?.innerText?.trim();
                link = "https://redtube.com" + el.querySelector('a.video_link')?.getAttribute('href');
                date = el.querySelector('.added_time')?.innerText?.trim();
            }
            else if (siteName === 'XHamster') {
                title = el.querySelector('.video-thumb__title')?.innerText?.trim();
                link = el.querySelector('a.video-thumb__link')?.getAttribute('href');
                date = el.querySelector('.video-thumb__upload-time')?.innerText?.trim();
            }
            else if (siteName === 'XVideos') {
                const linkTag = el.querySelector('p.title a');
                title = linkTag?.getAttribute('title') || linkTag?.innerText?.trim();
                link = linkTag?.getAttribute('href');
                if (link && !link.startsWith('http')) link = "https://xvideos.com" + link;
                date = el.innerText.match(/(\d+\s\w+\sago)/)?.[0];
            }
            else if (siteName === 'XNXX') {
                const linkTag = el.querySelector('.thumb-under a') || el.querySelector('a');
                title = linkTag?.getAttribute('title') || el.querySelector('.thumb-under')?.innerText?.split('\n')[0];
                link = linkTag?.getAttribute('href');
                if (link && !link.startsWith('http')) link = "https://xnxx.com" + link;
                date = el.innerText.match(/(\d+\s\w+\sago)/)?.[0];
            }

            if (!title) title = "Unknown Video";
            if (!date) date = "Unknown Date";
            
            return { title, url: link, date, source: siteName };
        });
    }, siteName);

    return findings.filter(f => f && f.url && f.url.length > 5);
}

module.exports = { scanKeywords };
