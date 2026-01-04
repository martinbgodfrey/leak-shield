// --- GOOGLE DORKING ENGINE ---
// Generates advanced operators to find hidden profiles and deep web traces.

function generateDorks(username) {
    if (!username) return [];

    const cleanUser = username.replace(/\s+/g, ''); // Remove spaces for handle checks

    return [
        // 1. Social Media "Deep Net" (Finds profiles, not just posts)
        `site:instagram.com "${cleanUser}"`,
        `site:twitter.com "${cleanUser}"`,
        `site:facebook.com "${cleanUser}"`,
        `site:onlyfans.com "${cleanUser}"`,
        `site:linkedin.com "${username}"`,

        // 2. Cloud Storage Leaks (Drive, Dropbox, Mega)
        `site:drive.google.com "${username}"`,
        `site:dropbox.com "${username}"`,
        `site:mega.nz "${username}"`,
        `site:mediafire.com "${username}"`,

        // 3. Email Discovery (Matches handle with common providers)
        `"${cleanUser}" "@gmail.com"`,
        `"${cleanUser}" "@yahoo.com"`,
        `"${cleanUser}" "@protonmail.com"`,

        // 4. Paste Sites (Often used for Dox/Leaks)
        `site:pastebin.com "${username}"`,
        `site:anonfiles.com "${username}"`
    ];
}

module.exports = { generateDorks };
