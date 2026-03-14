# Payment & Credits System - API Reference

## Overview
Complete payment, subscription, and credits management system for Superadmin Backend

## Credit Pricing
- **Interview Credit**: $49 per credit
- **Position Credit**: $39 per credit
- **Default Tax Rate**: 18% (configurable)

---

## API Endpoints

### 1. **Calculate Pricing** (Utility)
```
GET /api/superadmin/subscriptions/calculate-pricing
```

**Query Parameters:**
- `interviewCredits` (number): Number of interview credits
- `positionCredits` (number): Number of position credits
- `taxRate` (number, optional): Tax rate percentage (default: 18)
- `taxInclusive` (boolean, optional): Whether price includes tax (default: false)

**Example:**
```bash
curl "http://localhost:9000/api/superadmin/subscriptions/calculate-pricing?interviewCredits=10&positionCredits=5"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "interviewCredits": 10,
    "positionCredits": 5,
    "interviewCreditsPrice": 49,
    "positionCreditsPrice": 39,
    "interviewAmount": 490,
    "positionAmount": 195,
    "subTotal": 685,
    "taxRate": 18,
    "taxAmount": 123.3,
    "grandTotal": 808.3,
    "currency": "USD"
  }
}
```

---

### 2. **Purchase Credits**
```
POST /api/superadmin/subscriptions/purchase-credits
```

**Request Body:**
```json
{
  "clientSchema": "globaltech_mlvtnxis",
  "adminUserId": "uuid",
  "adminEmail": "admin@example.com",
  "interviewCredits": 50,
  "positionCredits": 25,
  "validityExtensionDays": 0,
  "paymentMethod": "RAZORPAY",
  "taxRate": 18,
  "taxInclusive": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Credit purchase initiated. Complete payment to activate credits.",
  "data": {
    "paymentId": "uuid",
    "clientSchema": "globaltech_mlvtnxis",
    "amount": 4041.5,
    "currency": "USD",
    "paymentStatus": "PENDING",
    "interviewCreditsAdded": 50,
    "positionCreditsAdded": 25,
    "pricing": { ... }
  }
}
```

---

### 3. **Create Subscription**
```
POST /api/superadmin/subscriptions
```

**Request Body:**
```json
{
  "clientSchema": "acmecorp_mlvtnpkp",
  "adminUserId": "uuid",
  "adminEmail": "admin@acme.com",
  "interviewCredits": 100,
  "positionCredits": 50,
  "validityDays": 365,
  "billingCycle": "ANNUAL",
  "paymentMethod": "MANUAL",
  "taxRate": 18,
  "discountPercentage": 10
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subscriptionId": "uuid",
    "paymentId": "uuid",
    "pricing": {
      "subTotal": 6850,
      "taxAmount": 1233,
      "discountAmount": 685,
      "finalTotal": 7398,
      "currency": "USD"
    },
    "paymentStatus": "PENDING"
  }
}
```

---

### 4. **Confirm Payment & Activate Credits**
```
POST /api/superadmin/subscriptions/confirm/:paymentId
```

**Request Body:**
```json
{
  "transactionId": "razorpay_txn_xyz123",
  "gatewayResponse": {
    "paymentId": "pay_xyz",
    "status": "captured"
  }
}
```

**Effect:**
- Updates payment status to "COMPLETED"
- Adds credits to client database
- Syncs credits to superadmin_db

---

### 5. **Get Payment Statistics**
```
GET /api/superadmin/payments/stats
```

**Query Parameters:**
- `clientSchema` (optional): Filter by client

**Response:**
```json
{
  "success": true,
  "data": {
    "totals": {
      "totalPayments": 1,
      "totalRevenue": "4041.50",
      "totalInterviewCredits": "50",
      "totalPositionCredits": "25"
    },
    "byStatus": [
      {
        "payment_status": "PENDING",
        "count": 1,
        "totalAmount": "4041.50"
      }
    ]
  }
}
```

---

### 6. **Get All Payments**
```
GET /api/superadmin/payments
```

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10)
- `clientSchema` (string): Filter by client
- `paymentStatus` (string): Filter by status (PENDING, COMPLETED, FAILED, REFUNDED)
- `paymentType` (string): Filter by type (SUBSCRIPTION, INTERVIEW_CREDITS, POSITION_CREDITS, ADDON)

---

### 7. **Get Payment by ID**
```
GET /api/superadmin/payments/:paymentId
```

---

### 8. **Get Payments by Client**
```
GET /api/superadmin/payments/client/:clientSchema
```

---

### 9. **Get Payments by Admin**
```
GET /api/superadmin/payments/admin/:adminUserId
```

---

### 10. **Update Payment Status**
```
PATCH /api/superadmin/payments/:paymentId/status
```

**Request Body:**
```json
{
  "status": "COMPLETED",
  "transactionId": "txn_123",
  "gatewayResponse": { ... }
}
```

---

### 11. **Get Credits by Client**
```
GET /api/superadmin/credits/client/:clientSchema
```

---

### 12. **Get All Credits**
```
GET /api/superadmin/credits
```

**Query Parameters:**
- `isActive` (boolean): Filter active/inactive
- `nearExpiry` (boolean): Filter credits expiring in 30 days

---

### 13. **Get Credit History**
```
GET /api/superadmin/credits/history/:clientSchema
```

---

### 14. **Sync Credits**
```
POST /api/superadmin/credits/sync
```

**Request Body:**
```json
{
  "clientSchema": "optional_specific_client"
}
```

---

### 15. **Get Subscription by Client**
```
GET /api/superadmin/subscriptions/client/:clientSchema
```

**Response:**
```json
{
  "success": true,
  "data": {
    "credits": {
      "client_name": "GlobalTech",
      "total_interview_credits": 200,
      "remaining_interview_credits": 150,
      "total_position_credits": 100,
      "remaining_position_credits": 80,
      "valid_till": "2027-06-30"
    },
    "payments": [ ... ]
  }
}
```

---

## Payment Flow

### Standard Credit Purchase Flow:

1. **Calculate Pricing** (Optional)
   ```
   GET /subscriptions/calculate-pricing?interviewCredits=50&positionCredits=25
   ```

2. **Initiate Purchase**
   ```
   POST /subscriptions/purchase-credits
   ```
   Returns `paymentId` with status "PENDING"

3. **Process Payment** (External Gateway)
   - Integrate with Razorpay/Stripe/Manual payment
   - Get transaction ID

4. **Confirm Payment**
   ```
   POST /subscriptions/confirm/:paymentId
   ```
   - Status changes to "COMPLETED"
   - Credits added to client DB
   - Synced to superadmin_db

5. **Verify Credits**
   ```
   GET /credits/client/:clientSchema
   ```

---

## Database Schema

### `payments` Table (superadmin_db)
```sql
CREATE TABLE payments (
  id BINARY(16) PRIMARY KEY,
  client_schema VARCHAR(63),
  admin_user_id CHAR(36),
  admin_email VARCHAR(255),
  payment_type ENUM(...),
  amount DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'USD',
  interview_credits_added INT,
  position_credits_added INT,
  validity_extended_days INT,
  payment_status ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'),
  payment_method VARCHAR(50),
  transaction_id VARCHAR(255),
  transaction_reference VARCHAR(255),
  gateway_name VARCHAR(50),
  gateway_response JSON,
  payment_date TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### `credits` Table (superadmin_db)
```sql
CREATE TABLE credits (
  id BINARY(16) PRIMARY KEY,
  client_name VARCHAR(100),
  client_schema VARCHAR(63) UNIQUE,
  admin_user_id CHAR(36),
  admin_email VARCHAR(255),
  total_interview_credits INT,
  utilized_interview_credits INT,
  remaining_interview_credits INT,
  total_position_credits INT,
  utilized_position_credits INT,
  remaining_position_credits INT,
  valid_till DATE,
  is_active TINYINT(1),
  last_synced_at TIMESTAMP
);
```

---

## Payment Types

- **SUBSCRIPTION**: Annual/monthly subscription with credits
- **INTERVIEW_CREDITS**: Purchase only interview credits
- **POSITION_CREDITS**: Purchase only position credits
- **ADDON**: Purchase both types of credits

## Payment Status

- **PENDING**: Payment initiated but not completed
- **COMPLETED**: Payment successful, credits activated
- **FAILED**: Payment failed
- **REFUNDED**: Payment refunded

## Payment Methods

- **RAZORPAY**: Razorpay payment gateway
- **STRIPE**: Stripe payment gateway
- **MANUAL**: Manual bank transfer/cash
- **UPI**: UPI payment
- **CARD**: Credit/Debit card

---

## Integration Example

```javascript
// 1. Calculate pricing
const pricing = await fetch('/api/superadmin/subscriptions/calculate-pricing?interviewCredits=50&positionCredits=25');

// 2. Initiate purchase
const purchase = await fetch('/api/superadmin/subscriptions/purchase-credits', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    clientSchema: 'client_xyz',
    adminUserId: 'admin-uuid',
    adminEmail: 'admin@example.com',
    interviewCredits: 50,
    positionCredits: 25,
    paymentMethod: 'RAZORPAY'
  })
});

const { paymentId, amount } = purchase.data;

// 3. Process payment with gateway (Razorpay example)
const razorpayOrder = await createRazorpayOrder(amount);
const paymentResult = await razorpay.capture(razorpayOrder.id);

// 4. Confirm payment
await fetch(`/api/superadmin/subscriptions/confirm/${paymentId}`, {
  method: 'POST',
  body: JSON.stringify({
    transactionId: paymentResult.id,
    gatewayResponse: paymentResult
  })
});

// 5. Credits are now active!
```

---

## Testing

```bash
# Test pricing calculation
curl "http://localhost:9000/api/superadmin/subscriptions/calculate-pricing?interviewCredits=10&positionCredits=5"

# Test credit purchase
curl -X POST http://localhost:9000/api/superadmin/subscriptions/purchase-credits \
  -H "Content-Type: application/json" \
  -d '{"clientSchema":"test_client","adminUserId":"uuid","adminEmail":"test@test.com","interviewCredits":50,"positionCredits":25}'

# Check payment stats
curl "http://localhost:9000/api/superadmin/payments/stats"

# Get all credits
curl "http://localhost:9000/api/superadmin/credits"
```

---

## Notes

- All monetary values are in USD
- Tax calculation is configurable per transaction
- Credits are synced automatically after payment confirmation
- Payment history is maintained for audit purposes
- Credit expiry is tracked and can be extended
- Supports multiple payment gateways
