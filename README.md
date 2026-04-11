# 🏢 Savannah Property Management System

A full-stack rent management and reconciliation system built with:
- **Frontend**: React + Vite (dark dashboard UI)
- **Backend**: Python FastAPI (REST API with JWT auth)

---

## 📁 Project Structure

```
savannah-pms/
├── frontend/               ← React app
│   ├── src/
│   │   ├── App.jsx         ← All UI: login, dashboard, tenant portal
│   │   └── main.jsx        ← React entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.js      ← Proxy: /api/* → localhost:8000
│
└── backend/                ← FastAPI app
    ├── main.py             ← All routes and logic
    └── requirements.txt    ← Python dependencies
```

---

## 🔗 Are They Linked? YES

The frontend and backend are fully connected:

1. The React app makes `fetch("/api/...")` calls
2. Vite's **proxy** (in `vite.config.js`) intercepts those calls
   and forwards them to `http://localhost:8000` (FastAPI)
3. FastAPI processes them and returns real data
4. React displays that data in the dashboard

**Login → FastAPI issues a JWT token → React stores it → Every
subsequent request sends that token → FastAPI verifies it**

---

## 🚀 How to Run

### Step 1 — Start the Backend

```bash
cd savannah-pms/backend

# Install Python dependencies
pip install -r requirements.txt

# Start FastAPI server (port 8000)
uvicorn main:app --reload
```

You should see:
```
INFO: Uvicorn running on http://127.0.0.1:8000
```

### Step 2 — Start the Frontend

Open a **second terminal**:

```bash
cd savannah-pms/frontend

# Install Node dependencies
npm install

# Start React dev server (port 3000)
npm run dev
```

Open your browser at **http://localhost:3000**

---

## 🔑 Login Credentials

| Role        | Email                        | Password     |
|-------------|------------------------------|--------------|
| Admin       | admin@savannah.co.ke         | admin123     |
| Accountant  | accountant@savannah.co.ke    | account123   |
| Tenant      | tenant001@savannah.co.ke     | tenant123    |

---

## 📡 API Endpoints (FastAPI)

| Method | Endpoint                          | Description               |
|--------|-----------------------------------|---------------------------|
| POST   | `/api/auth/login`                 | Login → returns JWT token |
| GET    | `/api/dashboard/stats`            | KPI summary cards         |
| GET    | `/api/dashboard/monthly-collections` | 6-month chart data     |
| GET    | `/api/properties`                 | All properties            |
| GET    | `/api/transactions`               | All transactions          |
| GET    | `/api/arrears`                    | Tenants with balances due |
| POST   | `/api/payments/initiate`          | Record a new payment      |

Interactive API docs: **http://localhost:8000/docs**

---

## ⚙️ Requirements

- **Python** 3.8+
- **Node.js** 18+
- **npm** 9+
