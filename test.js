const url = 'http://localhost:3000/v1';

async function run() {
  try {
    const phone = '+8498' + Math.floor(Math.random() * 10000000).toString();
    console.log('Testing with phone:', phone);

    const rand = Math.floor(Math.random() * 100000);
    // 1. Register
    const regRes = await fetch(`${url}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: phone,
        password: 'Password123!',
        taxCode: '12345' + rand,
        businessName: 'My Business',
        ownerName: 'Owner Name',
        cccdNumber: '1234567' + rand,
        provinceCity: 'Ho Chi Minh'
      })
    });
    console.log('Register Response:', await regRes.json());

    // 2. Login
    const loginRes = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: phone,
        password: 'Password123!'
      })
    });
    const loginData = await loginRes.json();
    console.log('Login Status:', loginRes.status);
    const token = loginData?.data?.accessToken;

    if (!token) {
      console.log('No token received!');
      return;
    }

    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // 2.5 Setup Tax Config
    const taxRes = await fetch(`${url}/onboarding/tax-config`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        industryId: 1,
        taxGroupId: 1,
        isOtherIndustry: false
      })
    });
    console.log('Setup Tax Config:', await taxRes.json());

    // 3. Create Product
    const prodRes = await fetch(`${url}/products`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        productName: 'Test Product',
        productType: 'FINISHED_GOOD',
        unit: 'Cái',
        sellingPrice: 100000,
        openingStockQuantity: 10,
        openingStockUnitCost: 50000
      })
    });
    const prodData = await prodRes.json();
    console.log('Create Product:', prodData);
    
    const productPublicId = prodData?.data?.publicId;
    if (!productPublicId) {
      console.log('No product public ID received!');
      return;
    }

    // 4. Create Invoice
    const invRes = await fetch(`${url}/invoices`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        isB2C: true,
        paymentMethod: 'CASH',
        details: [
          {
            productPublicId: productPublicId,
            quantity: 2
          }
        ]
      })
    });
    console.log('Create Invoice:', await invRes.json());

  } catch (err) {
    console.error('Error running test:', err);
  }
}

run();
