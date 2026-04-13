const { v4: uuidv4 } = require('uuid');
const db = require('../src/config/db');
const superService = require('../src/services/creditsService');

async function testFlow() {
    try {
        await db.initializePool();
        const testAdminId = '62e66c61-cfe1-4ba5-8f87-da7d6df45e7e'; // smith@exe.in
        console.log('Testing ATS credits for admin', testAdminId);

        const result = await superService.addAtsCredits(
            testAdminId,
            12, 13, 14, // interview, position, screening
            20, 20.00,
            '2027-04-03',
            {}
        );

        console.log('addAtsCredits returned:', result);
    } catch(e) {
         console.error('Test Error:', e);
    } finally {
        process.exit();
    }
}
testFlow();
