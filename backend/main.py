from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from mpesa_service import MpesaService
from typing import Optional, List
import os
import jwt
import hashlib
import json
from datetime import datetime, timedelta
import random

app = FastAPI(title="Savannah Property Management API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = "savannah_property_secret_2024"
ALGORITHM = "HS256"
security = HTTPBearer()

# ─── In-memory "database" ───────────────────────────────────────────────
USERS_DB = {
    "admin@savannah.co.ke": {
        "id": 1, "name": "Admin Manager", "role": "admin",
        "password": hashlib.sha256("admin123".encode()).hexdigest()
    },
    "accountant@savannah.co.ke": {
        "id": 2, "name": "Jane Wanjiku", "role": "accountant",
        "password": hashlib.sha256("account123".encode()).hexdigest()
    },
    "tenant001@savannah.co.ke": {
        "id": 3, "name": "James Mwangi", "role": "tenant", "unit": "A-101",
        "password": hashlib.sha256("tenant123".encode()).hexdigest()
    },
}

PROPERTIES_DB = [
    {"id": 1, "name": "Savannah Heights", "location": "Westlands, Nairobi", "total_units": 120, "occupied": 108},
    {"id": 2, "name": "Acacia Courts",    "location": "Kilimani, Nairobi",  "total_units": 95,  "occupied": 89},
    {"id": 3, "name": "Baobab Residences","location": "Karen, Nairobi",     "total_units": 85,  "occupied": 72},
]

UNITS_DB = [
    {"id": 1, "property_id": 1, "unit_number": "A-101", "rent_amount": 35000, "status": "Occupied",  "tenant": "James Mwangi",    "balance": 0},
    {"id": 2, "property_id": 1, "unit_number": "A-102", "rent_amount": 35000, "status": "Occupied",  "tenant": "Mary Njoroge",    "balance": 35000},
    {"id": 3, "property_id": 1, "unit_number": "B-201", "rent_amount": 42000, "status": "Occupied",  "tenant": "Peter Kamau",     "balance": 0},
    {"id": 4, "property_id": 1, "unit_number": "B-202", "rent_amount": 42000, "status": "Vacant",    "tenant": None,              "balance": 0},
    {"id": 5, "property_id": 2, "unit_number": "C-301", "rent_amount": 55000, "status": "Occupied",  "tenant": "Grace Achieng",   "balance": 55000},
    {"id": 6, "property_id": 2, "unit_number": "C-302", "rent_amount": 55000, "status": "Occupied",  "tenant": "David Otieno",    "balance": 0},
    {"id": 7, "property_id": 3, "unit_number": "D-401", "rent_amount": 75000, "status": "Occupied",  "tenant": "Sarah Muthoni",   "balance": 75000},
    {"id": 8, "property_id": 3, "unit_number": "D-402", "rent_amount": 75000, "status": "Maintenance","tenant": None,             "balance": 0},
]

TRANSACTIONS_DB = [
    {"id": "TXN-001", "tenant": "James Mwangi",  "unit": "A-101", "amount": 35000, "method": "M-Pesa",       "status": "Completed", "date": "2025-04-05", "ref": "QHF2K8J9"},
    {"id": "TXN-002", "tenant": "Peter Kamau",    "unit": "B-201", "amount": 42000, "method": "Bank Transfer", "status": "Completed", "date": "2025-04-03", "ref": "BTR884K2"},
    {"id": "TXN-003", "tenant": "David Otieno",   "unit": "C-302", "amount": 55000, "method": "Airtel Money",  "status": "Completed", "date": "2025-04-07", "ref": "AMX77P1Q"},
    {"id": "TXN-004", "tenant": "Mary Njoroge",   "unit": "A-102", "amount": 35000, "method": "M-Pesa",       "status": "Pending",   "date": "2025-04-10", "ref": "QHF4T9R2"},
    {"id": "TXN-005", "tenant": "Grace Achieng",  "unit": "C-301", "amount": 55000, "method": "Card",         "status": "Failed",    "date": "2025-04-09", "ref": "CRD992XZ"},
    {"id": "TXN-006", "tenant": "Sarah Muthoni",  "unit": "D-401", "amount": 75000, "method": "M-Pesa",       "status": "Pending",   "date": "2025-04-11", "ref": "QHF7M3N8"},
]

# ─── Auth ────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: Optional[str] = "tenant"

def create_token(user_data: dict) -> str:
    payload = {**user_data, "exp": datetime.utcnow() + timedelta(hours=8)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/api/auth/login")
def login(req: LoginRequest):
    user = USERS_DB.get(req.email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user["password"] != hashlib.sha256(req.password.encode()).hexdigest():
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token_data = {"id": user["id"], "name": user["name"], "email": req.email, "role": user["role"]}
    return {"token": create_token(token_data), "user": token_data}

@app.post("/api/auth/register")
def register(req: RegisterRequest):
    email = req.email.strip().lower()
    name = req.name.strip()
    password = req.password
    role = "tenant"

    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if not password:
        raise HTTPException(status_code=400, detail="Password is required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")
    if email in USERS_DB:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    new_id = max((user["id"] for user in USERS_DB.values()), default=0) + 1
    user_record = {
        "id": new_id,
        "name": name,
        "role": role,
        "unit": "Pending Assignment",
        "password": hashlib.sha256(password.encode()).hexdigest(),
    }
    USERS_DB[email] = user_record

    token_data = {"id": new_id, "name": name, "email": email, "role": role}
    return {
        "success": True,
        "message": "Account created successfully",
        "token": create_token(token_data),
        "user": token_data,
    }

# ─── Dashboard Stats ─────────────────────────────────────────────────────
@app.get("/api/dashboard/stats")
def get_stats(user=Depends(verify_token)):
    total_units = sum(p["total_units"] for p in PROPERTIES_DB)
    occupied = sum(p["occupied"] for p in PROPERTIES_DB)
    expected_revenue = sum(u["rent_amount"] for u in UNITS_DB if u["status"] == "Occupied")
    collected = sum(t["amount"] for t in TRANSACTIONS_DB if t["status"] == "Completed")
    arrears_count = sum(1 for u in UNITS_DB if u["balance"] > 0)
    return {
        "total_units": total_units,
        "occupied_units": occupied,
        "vacant_units": total_units - occupied,
        "occupancy_rate": round((occupied / total_units) * 100, 1),
        "expected_revenue": expected_revenue,
        "collected_revenue": collected,
        "collection_rate": round((collected / expected_revenue) * 100, 1),
        "tenants_in_arrears": arrears_count,
        "total_properties": len(PROPERTIES_DB),
    }

@app.get("/api/dashboard/monthly-collections")
def monthly_collections(user=Depends(verify_token)):
    return [
        {"month": "Nov", "collected": 198000, "expected": 242000},
        {"month": "Dec", "collected": 225000, "expected": 242000},
        {"month": "Jan", "collected": 210000, "expected": 242000},
        {"month": "Feb", "collected": 238000, "expected": 242000},
        {"month": "Mar", "collected": 215000, "expected": 242000},
        {"month": "Apr", "collected": 132000, "expected": 242000},
    ]

# ─── Properties ──────────────────────────────────────────────────────────
@app.get("/api/properties")
def get_properties(user=Depends(verify_token)):
    return PROPERTIES_DB

# ─── Units ───────────────────────────────────────────────────────────────
@app.get("/api/units")
def get_units(user=Depends(verify_token)):
    return UNITS_DB

# ─── Transactions ─────────────────────────────────────────────────────────
@app.get("/api/transactions")
def get_transactions(user=Depends(verify_token)):
    return TRANSACTIONS_DB

class PaymentRequest(BaseModel):
    unit_id: int
    amount: float
    method: str
    tenant_name: str

# M-Pesa Payment Request Model
class MpesaPaymentRequest(BaseModel):
    tenant_id: int
    amount: float
    phone_number: str
    property_id: int

@app.post("/api/payments/initiate")
def initiate_payment(req: PaymentRequest, user=Depends(verify_token)):
    ref = "FLW-" + "".join([str(random.randint(0,9)) for _ in range(8)])
    new_txn = {
        "id": f"TXN-{len(TRANSACTIONS_DB)+1:03d}",
        "tenant": req.tenant_name,
        "unit": next((u["unit_number"] for u in UNITS_DB if u["id"] == req.unit_id), "N/A"),
        "amount": req.amount,
        "method": req.method,
        "status": "Completed",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "ref": ref,
    }
    TRANSACTIONS_DB.append(new_txn)
    # Update unit balance
    for u in UNITS_DB:
        if u["id"] == req.unit_id:
            u["balance"] = max(0, u["balance"] - req.amount)
    return {"success": True, "transaction": new_txn, "message": f"Payment of KES {req.amount:,.0f} recorded successfully"}

# ─── Tenants in Arrears ───────────────────────────────────────────────────
@app.get("/api/arrears")
def get_arrears(user=Depends(verify_token)):
    return [u for u in UNITS_DB if u["balance"] > 0 and u["status"] == "Occupied"]


# Initialize M-Pesa service
mpesa_service = MpesaService()

# Store pending transactions (in a real app, use a database table)
pending_transactions = {}

# ========== ENDPOINT 1: Initiate STK Push ==========
@app.post("/api/mpesa/stkpush")
async def initiate_mpesa_payment(
    payment_data: MpesaPaymentRequest,
    current_user: dict = Depends(verify_token)  # Use your existing verify_token
):
    """
    Send STK Push to tenant's phone
    """
    import os
    # Use test phone if in sandbox mode
    phone = payment_data.phone_number
    if os.getenv("MPESA_ENV") == "sandbox":
        phone = os.getenv("MPESA_TEST_PHONE", "254708374149")
    
    # Create account reference (for reconciliation)
    account_ref = f"SAV{payment_data.tenant_id}"
    transaction_desc = f"Rent-Property{payment_data.property_id}"
    
    # Send STK Push
    result = mpesa_service.stk_push(
        phone_number=phone,
        amount=payment_data.amount,
        account_reference=account_ref,
        transaction_desc=transaction_desc
    )
    
    if result.get("ResponseCode") == "0":
        # Store transaction for later reference
        checkout_id = result.get("CheckoutRequestID")
        pending_transactions[checkout_id] = {
            "tenant_id": payment_data.tenant_id,
            "amount": payment_data.amount,
            "property_id": payment_data.property_id,
            "phone": phone,
            "status": "pending"
        }
        
        return {
            "status": "success",
            "message": "STK Push sent successfully",
            "checkout_request_id": checkout_id,
            "merchant_request_id": result.get("MerchantRequestID"),
            "response_code": result.get("ResponseCode"),
            "customer_message": result.get("CustomerMessage")
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=result.get("ResponseDescription", "STK Push failed")
        )

# ========== ENDPOINT 2: Check Payment Status ==========
@app.get("/api/mpesa/status/{checkout_request_id}")
async def check_payment_status(checkout_request_id: str):
    """
    Check status of a pending transaction
    """
    result = mpesa_service.query_status(checkout_request_id)
    
    if result.get("ResponseCode") == "0":
        result_code = result.get("ResultCode")
        
        if result_code == "0":
            status = "completed"
        elif result_code == "1037":
            status = "pending"
        else:
            status = "failed"
        
        return {
            "status": status,
            "result_code": result_code,
            "result_desc": result.get("ResultDesc", "Processing..."),
            "checkout_request_id": checkout_request_id
        }
    else:
        return {
            "status": "error",
            "message": result.get("ResponseDescription", "Unknown error")
        }

# ========== ENDPOINT 3: M-Pesa Callback (Webhook) ==========
@app.post("/api/mpesa/callback")
async def mpesa_callback(request: Request):
    """
    M-Pesa sends final payment confirmation here
    This is called automatically when tenant completes payment
    """
    import json
    # Get the callback payload
    payload = await request.json()
    
    print("=" * 50)
    print("M-PESA CALLBACK RECEIVED")
    print("=" * 50)
    print(json.dumps(payload, indent=2))
    
    # Extract transaction details
    body = payload.get("Body", {})
    stk_callback = body.get("stkCallback", {})
    
    result_code = stk_callback.get("ResultCode")
    result_desc = stk_callback.get("ResultDesc")
    checkout_request_id = stk_callback.get("CheckoutRequestID")
    
    # Get pending transaction info
    transaction_info = pending_transactions.get(checkout_request_id, {})
    
    if result_code == "0":
        # Payment successful! Extract amount
        callback_metadata = stk_callback.get("CallbackMetadata", {})
        items = callback_metadata.get("Item", [])
        
        amount = None
        mpesa_receipt = None
        phone = None
        
        for item in items:
            if item.get("Name") == "Amount":
                amount = item.get("Value")
            elif item.get("Name") == "MpesaReceiptNumber":
                mpesa_receipt = item.get("Value")
            elif item.get("Name") == "PhoneNumber":
                phone = item.get("Value")
        
        print(f"✅ SUCCESS: Tenant {transaction_info.get('tenant_id')}")
        print(f"   Amount: KES {amount}")
        print(f"   Receipt: {mpesa_receipt}")
        print(f"   Phone: {phone}")
        
        # Record transaction in your database
        if amount and transaction_info.get('tenant_id'):
            # Find tenant name from USERS_DB
            tenant_name = None
            tenant_email = None
            for email, user in USERS_DB.items():
                if user["id"] == transaction_info["tenant_id"]:
                    tenant_name = user["name"]
                    tenant_email = email
                    break
            
            # Find unit number
            unit_number = None
            for unit in UNITS_DB:
                if unit.get("tenant") == tenant_name:
                    unit_number = unit["unit_number"]
                    break
            
            # Create transaction record
            new_txn = {
                "id": f"TXN-{len(TRANSACTIONS_DB)+1:03d}",
                "tenant": tenant_name,
                "unit": unit_number or "Unknown",
                "amount": amount,
                "method": "M-Pesa",
                "status": "Completed",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "ref": mpesa_receipt or f"MPESA-{checkout_request_id[:8]}",
            }
            TRANSACTIONS_DB.append(new_txn)
            
            # Update unit balance
            for unit in UNITS_DB:
                if unit.get("tenant") == tenant_name:
                    unit["balance"] = max(0, unit.get("balance", 0) - amount)
                    break
        
        # Update pending transaction status
        if checkout_request_id in pending_transactions:
            pending_transactions[checkout_request_id]["status"] = "completed"
            pending_transactions[checkout_request_id]["receipt"] = mpesa_receipt
        
        return {
            "ResultCode": 0,
            "ResultDesc": "Payment recorded successfully"
        }
    else:
        print(f"❌ FAILED: {result_desc}")
        
        if checkout_request_id in pending_transactions:
            pending_transactions[checkout_request_id]["status"] = "failed"
        
        return {
            "ResultCode": result_code,
            "ResultDesc": result_desc
        }

# ========== ENDPOINT 4: Get All Pending Transactions (for debugging) ==========
@app.get("/api/mpesa/pending")
async def get_pending_transactions(user=Depends(verify_token)):
    """Debug endpoint to see pending transactions (admin only)"""
    if user.get("role") not in ["admin", "accountant"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return pending_transactions

# ========== ⬆️ END OF M-PESA CODE ⬆️ ==========

# ─── Root Endpoint ─────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "Savannah Property Management API v1.0", "status": "running"}
