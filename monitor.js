import { execSync } from 'child_process';

console.log("🛡️  LEAK MONITOR ACTIVE. Scanning every 15 minutes...");
console.log("👉 Press Ctrl + C to stop at any time.\n");

function runScanner() {
    try {
        // Runs your existing main.js script
        execSync('node main.js', { stdio: 'inherit' });
    } catch (error) {
        console.error("\n⚠️ Scanner encountered an error (restarting in 15m).");
    }
}

// Run immediately
runScanner();

// Then run every 15 minutes (900,000 ms)
setInterval(runScanner, 900000);