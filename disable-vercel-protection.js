#!/usr/bin/env node

/**
 * Script to disable Vercel deployment protection via API
 * Usage: VERCEL_TOKEN=xxx node disable-vercel-protection.js
 */

const https = require('https');

const PROJECT_ID = 'prj_aE9XfOzzsjnYaKpE7soxloMy36Gj';
const TEAM_ID = 'team_cFMnWhLYnYGXm6ueTHBxAXqB';

// Get token from environment or prompt user
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;

if (!VERCEL_TOKEN) {
  console.error('❌ Error: VERCEL_TOKEN environment variable not set');
  console.error('');
  console.error('To get a token:');
  console.error('1. Go to https://vercel.com/account/tokens');
  console.error('2. Create a new token (name: "Claude Code Automation")');
  console.error('3. Run: export VERCEL_TOKEN="your_token_here"');
  console.error('4. Run this script again');
  process.exit(1);
}

console.log('🔧 Disabling Vercel deployment protection...\n');

// Prepare API request to update project settings
const data = JSON.stringify({
  ssoProtection: null,           // Disable SSO protection
  passwordProtection: null,      // Disable password protection
  optionsAllowlist: null         // Clear allowlist
});

const options = {
  hostname: 'api.vercel.com',
  port: 443,
  path: `/v9/projects/${PROJECT_ID}?teamId=${TEAM_ID}`,
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✅ SUCCESS: Password protection disabled!');
      console.log('');
      console.log('🌐 Your site is now publicly accessible at:');
      console.log('   https://breslev-books-preview.vercel.app');
      console.log('');
      console.log('🔄 Redeploying to ensure changes take effect...');

      // Trigger a redeploy
      const { exec } = require('child_process');
      exec('vercel --prod --yes', (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Redeploy failed: ${error.message}`);
          return;
        }
        console.log('✅ Redeploy complete!');
      });
    } else if (res.statusCode === 401) {
      console.error('❌ Authentication failed. Token is invalid or expired.');
      console.error('   Create a new token at: https://vercel.com/account/tokens');
    } else if (res.statusCode === 403) {
      console.error('❌ Permission denied. Token needs project write access.');
    } else {
      console.error(`❌ API request failed with status ${res.statusCode}`);
      console.error('Response:', responseData);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error.message);
});

req.write(data);
req.end();
