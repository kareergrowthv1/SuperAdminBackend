const axios = require('axios');

async function testFlow() {
    try {
        const clientName = 'test_ats_flow_' + Date.now();
        console.log('Testing creation flow with ' + clientName);

        const rolesRes = await axios.get('http://localhost:8001/superadmin/admins/roles');
        const atsRole = rolesRes.data.data.find(r => r.code === 'ATS');

        // Create Admin
        const createRes = await axios.post('http://localhost:8001/superadmin/admins/create', {
            email: 'test_' + Date.now() + '@ats.com',
            firstName: 'Test',
            lastName: 'Recruiter',
            phoneNumber: '+19999999999',
            clientName: clientName,
            roleId: atsRole.id
        });

        const adminId = createRes.data.data.userId || createRes.data.data.id;
        console.log('Admin created ID:', adminId);

        // Add credits manually
        const creditsPayload = {
            adminId: adminId,
            interviewCredits: 50,
            positionCredits: 50,
            screeningCredits: 50,
            screeningCreditsMin: 10,
            screeningCreditsCost: 100,
            validTill: '2027-04-03',
            paymentDetails: {
                paymentMethod: 'UPI',
                isManual: true,
                totalAmount: 1000,
                billingCycle: 'ANNUAL',
                atomic: true
            }
        };

        const creditsRes = await axios.post('http://localhost:8001/superadmin/credits/add-auto', creditsPayload);
        console.log('Credits added successfully:', creditsRes.data.data);

        // Wait to fetch AdminBackend directly ensuring credits matched
        const getCreditRes = await axios.get('http://localhost:8002/admins/credits/' + adminId);
        console.log('Credits queried directly from AdminBackend:', getCreditRes.data.data);

    } catch(e) {
        console.error('Test Error:', e.response?.data || e.message);
    }
}
testFlow();
