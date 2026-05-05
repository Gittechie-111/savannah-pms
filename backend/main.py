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
import logging
import random
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Savannah Property Management API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = "savannah_property_management_secret_key_2024_32_bytes_minimum"
ALGORITHM = "HS256"
security = HTTPBearer()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
client = MongoClient(MONGO_URI)
db = client["savannah_pms"]

users_col = db["users"]
properties_col = db["properties"]
units_col = db["units"]
transactions_col = db["transactions"]
pending_transactions_col = db["pending_transactions"]

# Ensure basic indexes exist
users_col.create_index("email", unique=True)
properties_col.create_index("id", unique=True)
units_col.create_index("id", unique=True)
transactions_col.create_index("id", unique=True)
pending_transactions_col.create_index("checkout_request_id", unique=True)

# Seed initial data if collections are empty
if users_col.count_documents({}) == 0:
    users_col.insert_many([
        {
            "id": 1,
            "name": "Admin Manager",
            "role": "admin",
            "email": "admin@savannah.co.ke",
            "password": hashlib.sha256("admin123".encode()).hexdigest()
        },
        {
            "id": 2,
            "name": "Jane Wanjiku",
            "role": "accountant",
            "email": "accountant@savannah.co.ke",
            "password": hashlib.sha256("account123".encode()).hexdigest()
        },
        {
            "id": 3,
            "name": "James Mwangi",
            "role": "tenant",
            "unit": "A-101",
            "email": "tenant001@savannah.co.ke",
            "password": hashlib.sha256("tenant123".encode()).hexdigest()
        },
    ])

if properties_col.count_documents({}) == 0:
    properties_col.insert_many([
        {"id": 1, "name": "Savannah Heights", "location": "Westlands, Nairobi", "total_units": 120, "occupied": 108},
        {"id": 2, "name": "Acacia Courts",    "location": "Kilimani, Nairobi",  "total_units": 95,  "occupied": 89},
        {"id": 3, "name": "Baobab Residences","location": "Karen, Nairobi",     "total_units": 85,  "occupied": 72},
    ])

if units_col.count_documents({}) == 0:
    units_col.insert_many([
        {"id": 1, "property_id": 1, "unit_number": "A-101", "rent_amount": 35000, "status": "Occupied",  "tenant": "James Mwangi",    "balance": 0},
        {"id": 2, "property_id": 1, "unit_number": "A-102", "rent_amount": 35000, "status": "Occupied",  "tenant": "Mary Njoroge",    "balance": 35000},
        {"id": 3, "property_id": 1, "unit_number": "B-201", "rent_amount": 42000, "status": "Occupied",  "tenant": "Peter Kamau",     "balance": 0},
        {"id": 4, "property_id": 1, "unit_number": "B-202", "rent_amount": 42000, "status": "Vacant",    "tenant": None,              "balance": 0},
        {"id": 5, "property_id": 2, "unit_number": "C-301", "rent_amount": 55000, "status": "Occupied",  "tenant": "Grace Achieng",   "balance": 55000},
        {"id": 6, "property_id": 2, "unit_number": "C-302", "rent_amount": 55000, "status": "Occupied",  "tenant": "David Otieno",    "balance": 0},
        {"id": 7, "property_id": 3, "unit_number": "D-401", "rent_amount": 75000, "status": "Occupied",  "tenant": "Sarah Muthoni",   "balance": 75000},
        {"id": 8, "property_id": 3, "unit_number": "D-402", "rent_amount": 75000, "status": "Maintenance","tenant": None,             "balance": 0},
    ])

if transactions_col.count_documents({}) == 0:
    transactions_col.insert_many([
        {"id": "TXN-001", "tenant": "James Mwangi",  "unit": "A-101", "amount": 35000, "method": "M-Pesa",       "status": "Completed", "date": "2025-04-05", "ref": "QHF2K8J9"},
        {"id": "TXN-002", "tenant": "Peter Kamau",    "unit": "B-201", "amount": 42000, "method": "Bank Transfer", "status": "Completed", "date": "2025-04-03", "ref": "BTR884K2"},
        {"id": "TXN-003", "tenant": "David Otieno",   "unit": "C-302", "amount": 55000, "method": "Airtel Money",  "status": "Completed", "date": "2025-04-07", "ref": "AMX77P1Q"},
        {"id": "TXN-004", "tenant": "Mary Njoroge",   "unit": "A-102", "amount": 35000, "method": "M-Pesa",       "status": "Pending",   "date": "2025-04-10", "ref": "QHF4T9R2"},
        {"id": "TXN-005", "tenant": "Grace Achieng",  "unit": "C-301", "amount": 55000, "method": "Card",         "status": "Failed",    "date": "2025-04-09", "ref": "CRD992XZ"},
        {"id": "TXN-006", "tenant": "Sarah Muthoni",  "unit": "D-401", "amount": 75000, "method": "M-Pesa",       "status": "Pending",   "date": "2025-04-11", "ref": "QHF7M3N8"},
    ])


def serialize_doc(doc: dict) -> dict:
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


def serialize_docs(cursor):
    return [serialize_doc(doc) for doc in cursor]


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_next_user_id() -> int:
    last = users_col.find_one(sort=[("id", -1)])
    return (last["id"] if last else 0) + 1


def get_next_transaction_id() -> str:
    last = transactions_col.find_one(sort=[("id", -1)])
    if not last or "id" not in last:
        return "TXN-001"
    try:
        last_num = int(last["id"].split("-")[-1])
    except Exception:
        last_num = transactions_col.count_documents({})
    return f"TXN-{last_num + 1:03d}"

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
    email = normalize_email(req.email)
    logger.info("Login attempt for email=%s", email)
    user = users_col.find_one({"email": email})
    if not user:
        logger.info("Login failed: user not found %s", email)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    expected_password = hashlib.sha256(req.password.encode()).hexdigest()
    if user.get("password") != expected_password:
        logger.info("Login failed: invalid password for %s", email)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    logger.info("Login success for %s", email)
    token_data = {"id": user["id"], "name": user["name"], "email": email, "role": user["role"]}
    return {"token": create_token(token_data), "user": token_data}

@app.post("/api/auth/register")
def register(req: RegisterRequest):
    email = normalize_email(req.email)
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
    if users_col.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    new_id = get_next_user_id()
    user_record = {
        "id": new_id,
        "name": name,
        "role": role,
        "unit": "Pending Assignment",
        "email": email,
        "password": hashlib.sha256(password.encode()).hexdigest(),
    }
    users_col.insert_one(user_record)

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
    total_units = sum(p["total_units"] for p in properties_col.find({}))
    occupied = sum(p["occupied"] for p in properties_col.find({}))
    expected_revenue = sum(u["rent_amount"] for u in units_col.find({"status": "Occupied"}))
    collected = sum(t["amount"] for t in transactions_col.find({"status": "Completed"}))
    arrears_count = units_col.count_documents({"balance": {"$gt": 0}, "status": "Occupied"})
    return {
        "total_units": total_units,
        "occupied_units": occupied,
        "vacant_units": total_units - occupied,
        "occupancy_rate": round((occupied / total_units) * 100, 1) if total_units else 0,
        "expected_revenue": expected_revenue,
        "collected_revenue": collected,
        "collection_rate": round((collected / expected_revenue) * 100, 1) if expected_revenue else 0,
        "tenants_in_arrears": arrears_count,
        "total_properties": properties_col.count_documents({}),
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
    return serialize_docs(properties_col.find({}))

# ─── Units ───────────────────────────────────────────────────────────────
@app.get("/api/units")
def get_units(user=Depends(verify_token)):
    return serialize_docs(units_col.find({}))

# ─── Transactions ─────────────────────────────────────────────────────────
@app.get("/api/transactions")
def get_transactions(user=Depends(verify_token)):
    return serialize_docs(transactions_col.find({}))

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
    logger.info("Initiate payment request: user=%s, unit_id=%s, amount=%s, method=%s, tenant=%s", user.get("email"), req.unit_id, req.amount, req.method, req.tenant_name)
    ref = "FLW-" + "".join([str(random.randint(0,9)) for _ in range(8)])
    unit_doc = units_col.find_one({"id": req.unit_id})

    if not unit_doc:
        logger.warning("Payment initiate: unit_id not found: %s", req.unit_id)

    unit_number = unit_doc["unit_number"] if unit_doc else "N/A"
    balance = max(0, (unit_doc.get("balance", 0) if unit_doc else 0) - req.amount)

    new_txn = {
        "id": get_next_transaction_id(),
        "tenant": req.tenant_name,
        "unit": unit_number,
        "amount": req.amount,
        "method": req.method,
        "status": "Completed",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "ref": ref,
    }
    transactions_col.insert_one(new_txn)

    if unit_doc:
        units_col.update_one({"id": req.unit_id}, {"$set": {"balance": balance}})
    else:
        logger.warning("Payment recorded but unit not updated because unit_doc is missing")

    logger.info("Payment recorded: %s", new_txn)
    return {"success": True, "transaction": new_txn, "message": f"Payment of KES {req.amount:,.0f} recorded successfully"}

# ─── Tenants in Arrears ───────────────────────────────────────────────────
@app.get("/api/arrears")
def get_arrears(user=Depends(verify_token)):
    return serialize_docs(units_col.find({"balance": {"$gt": 0}, "status": "Occupied"}))


# Initialize M-Pesa service
mpesa_service = MpesaService()

# Store pending transactions (in a real app, use a database table)
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
    
    try:
        # Format phone number properly
        phone = payment_data.phone_number
        
        # Only use test phone for actual test requests (not replacing user input)
        if not phone or len(phone) < 9:
            phone = os.getenv("MPESA_TEST_PHONE", "254708374149")
            logger.info("Using test phone: %s", phone)
        
        logger.info("Initiating M-Pesa payment: tenant_id=%s, amount=%s, phone=%s", 
                   payment_data.tenant_id, payment_data.amount, phone)
        
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
        
        logger.info("M-Pesa Response: %s", result)
        
        if result.get("ResponseCode") == "0":
            # Store transaction for later reference
            checkout_id = result.get("CheckoutRequestID")
            pending_transactions_col.insert_one({
                "checkout_request_id": checkout_id,
                "tenant_id": payment_data.tenant_id,
                "amount": payment_data.amount,
                "property_id": payment_data.property_id,
                "phone": phone,
                "status": "pending",
                "created_at": datetime.now()
            })
            
            logger.info("STK Push sent successfully: checkout_id=%s", checkout_id)
            
            return {
                "status": "success",
                "message": "STK Push sent successfully",
                "checkout_request_id": checkout_id,
                "merchant_request_id": result.get("MerchantRequestID"),
                "response_code": result.get("ResponseCode"),
                "customer_message": result.get("CustomerMessage")
            }
        else:
            error_msg = result.get("ResponseDescription", "STK Push failed")
            logger.error("STK Push failed: %s", error_msg)
            raise HTTPException(
                status_code=400,
                detail=error_msg
            )
    
    except Exception as e:
        logger.error("Payment initiation error: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Payment error: {str(e)}"
        )

# ========== ENDPOINT 2: Check Payment Status ==========
@app.get("/api/mpesa/status/{checkout_request_id}")
async def check_payment_status(checkout_request_id: str):
    """
    Check status of a pending transaction
    """
    try:
        logger.info("Checking payment status for checkout_id: %s", checkout_request_id)
        
        result = mpesa_service.query_status(checkout_request_id)
        logger.info("Query status response: %s", result)
        
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
            error_msg = result.get("ResponseDescription", "Unknown error")
            logger.error("Query status failed: %s", error_msg)
            return {
                "status": "error",
                "message": error_msg
            }
    
    except Exception as e:
        logger.error("Status check error: %s", str(e))
        return {
            "status": "error",
            "message": str(e)
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
    
    logger.info("Processing M-Pesa callback: result_code=%s, checkout_id=%s, desc=%s", 
               result_code, checkout_request_id, result_desc)
    
    # Get pending transaction info
    transaction_info = serialize_doc(pending_transactions_col.find_one({"checkout_request_id": checkout_request_id})) or {}
    
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
            # Find tenant name from users collection
            user_doc = users_col.find_one({"id": transaction_info["tenant_id"]})
            tenant_name = user_doc["name"] if user_doc else "Unknown"
            tenant_email = user_doc["email"] if user_doc else "unknown@example.com"
            
            logger.info("Recording payment for tenant: %s (id=%s), amount=%s", 
                       tenant_name, transaction_info["tenant_id"], amount)
            
            # Find unit for this tenant
            unit_doc = units_col.find_one({"tenant": tenant_name})
            if unit_doc:
                unit_number = unit_doc["unit_number"]
                unit_balance = max(0, (unit_doc.get("balance", 0) - amount))
                logger.info("Unit found: %s, new balance: %s", unit_number, unit_balance)
            else:
                unit_number = "Unknown"
                unit_balance = 0
                logger.warning("Unit not found for tenant: %s", tenant_name)

            new_txn = {
                "id": get_next_transaction_id(),
                "tenant": tenant_name,
                "unit": unit_number,
                "amount": amount,
                "method": "M-Pesa",
                "status": "Completed",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "ref": mpesa_receipt or f"MPESA-{checkout_request_id[:8]}",
            }
            transactions_col.insert_one(new_txn)
            logger.info("Transaction recorded: %s", new_txn)
            
            # Update unit balance
            if unit_doc:
                units_col.update_one({"id": unit_doc["id"]}, {"$set": {"balance": unit_balance}})
                logger.info("Unit balance updated: %s -> %s", unit_number, unit_balance)
        
        # Update pending transaction status
        pending_transactions_col.update_one(
            {"checkout_request_id": checkout_request_id},
            {"$set": {"status": "completed", "receipt": mpesa_receipt}}
        )
        
        return {
            "ResultCode": 0,
            "ResultDesc": "Payment recorded successfully"
        }
    else:
        print(f"❌ FAILED: {result_desc}")
        
        pending_transactions_col.update_one(
            {"checkout_request_id": checkout_request_id},
            {"$set": {"status": "failed"}}
        )
        
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
    return serialize_docs(pending_transactions_col.find({}))

# ========== ⬆️ END OF M-PESA CODE ⬆️ ==========

# ─── Root Endpoint ─────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "Savannah Property Management API v1.0", "status": "running"}
