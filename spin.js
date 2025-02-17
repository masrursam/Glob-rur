const fs = require('fs');
const axios = require('axios');
const cron = require('node-cron');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

class AutoSpinBot {
    constructor() {
        this.API_BASE_URL = 'https://api-iowa.shaga.xyz';
        this.accounts = [];
        this.countdowns = {};
    }

    async initialize() {
        try {
            // Read tokens from file
            const tokens = fs.readFileSync('tokens.txt', 'utf8')
                .split('\n')
                .filter(token => token.trim() !== '');

            for (const token of tokens) {
                const tokenPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                this.accounts.push({
                    token: token.trim(),
                    uid: tokenPayload.sub,
                    email: tokenPayload.email
                });
            }

            console.log(`${colors.green}\n🚀 Bot initialized successfully with ${this.accounts.length} accounts\n${colors.reset}`);
            this.displayAccountsTable();
        } catch (error) {
            console.error(`${colors.red}Error initializing bot: ${error.message}${colors.reset}`);
            process.exit(1);
        }
    }

    displayAccountsTable() {
        console.log(`${colors.cyan}=== Loaded Accounts ===${colors.reset}`);
        console.log('┌─────┬─────────────────────┬──────────────────────────┐');
        console.log('│ No  │       Email         │         User ID          │');
        console.log('├─────┼─────────────────────┼──────────────────────────┤');

        this.accounts.forEach((account, index) => {
            const num = (index + 1).toString().padEnd(3);
            const email = account.email.padEnd(17);
            console.log(`│ ${num} │ ${email} │ ${account.uid} │`);
        });

        console.log('└─────┴─────────────────────┴──────────────────────────┘\n');
    }

    async checkCanSpin(account) {
        try {
            const response = await axios.get(`${this.API_BASE_URL}/quests/can-spin`, {
                headers: {
                    'authorization': `Bearer ${account.token}`,
                    'accept': 'application/json',
                    'origin': 'https://glob.shaga.xyz',
                    'referer': 'https://glob.shaga.xyz/'
                }
            });
            return response.data;
        } catch (error) {
            console.error(`${colors.red}Error checking spin status for ${account.email}: ${error.message}${colors.reset}`);
            return null;
        }
    }

    async performSpin(account) {
        try {
            const response = await axios.post(`${this.API_BASE_URL}/quests/spin`,
                { uid: account.uid },
                {
                    headers: {
                        'authorization': `Bearer ${account.token}`,
                        'accept': 'application/json',
                        'content-type': 'application/json',
                        'origin': 'https://glob.shaga.xyz',
                        'referer': 'https://glob.shaga.xyz/'
                    }
                }
            );
            return response.data;
        } catch (error) {
            if (error.response && error.response.data) {
                return error.response.data;
            }
            console.error(`${colors.red}Error performing spin for ${account.email}: ${error.message}${colors.reset}`);
            return null;
        }
    }

    formatTimeRemaining(ms) {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((ms % (1000 * 60)) / 1000);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    clearLine() {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
    }

    async checkAndSpin(account) {
        const spinStatus = await this.checkCanSpin(account);
        
        if (!spinStatus) {
            return;
        }

        if (spinStatus.canSpin) {
            if (this.countdowns[account.uid]) {
                clearInterval(this.countdowns[account.uid]);
                delete this.countdowns[account.uid];
                this.clearLine();
            }

            console.log(`${colors.cyan}[${account.email}] Performing spin...${colors.reset}`);
            const spinResult = await this.performSpin(account);
            
            if (spinResult) {
                if (spinResult.message === "Cooldown period not over yet") {
                    console.log(`${colors.yellow}[${account.email}] ${spinResult.message}${colors.reset}`);
                    this.startCountdown(account, spinResult.nextSpinDurationMs);
                } else {
                    console.log(`${colors.green}[${account.email}] Spin successful!${colors.reset}`);
                }
            } else {
                console.log(`${colors.red}[${account.email}] Spin failed${colors.reset}`);
            }
        } else {
            this.startCountdown(account, spinStatus.nextSpinDurationMs);
        }
    }

    startCountdown(account, duration) {
        if (this.countdowns[account.uid]) {
            return;
        }

        const updateInterval = setInterval(() => {
            this.clearLine();
            process.stdout.write(
                `${colors.cyan}[${account.email}] Next spin in ${this.formatTimeRemaining(duration)}${colors.reset}`
            );
            
            duration -= 1000;
            if (duration <= 0) {
                clearInterval(updateInterval);
                delete this.countdowns[account.uid];
                this.checkAndSpin(account);
            }
        }, 1000);

        this.countdowns[account.uid] = updateInterval;
    }

    async checkAllAccounts() {
        console.log(`${colors.yellow}\n🚀Checking all accounts...\n${colors.reset}`);
        await Promise.all(this.accounts.map(account => this.checkAndSpin(account)));
    }

    start() {
        console.log(`${colors.green}🚀 Bot started\n${colors.reset}`);
        
        // Run immediately on start
        this.checkAllAccounts();

        // Schedule to run every hour
        cron.schedule('0 * * * *', () => {
            this.checkAllAccounts();
        });

        console.log(`${colors.cyan}🚀  Bot will check accounts every hour\n${colors.reset}`);
    }
}

// Start the bot without authentication
async function main() {
    console.log(`${colors.yellow}\n=== GLOB Auto Spin Bot | Airdrop Insiders ===${colors.reset}\n`);
    
    const bot = new AutoSpinBot();
    await bot.initialize();
    bot.start();
}

main().catch(console.error);