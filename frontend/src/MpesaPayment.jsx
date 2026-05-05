import { useState } from 'react';

// Use the same API base as the main app
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function MpesaPayment({ tenantId, amount, propertyId, onSuccess, onError }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // null, 'sending', 'pending', 'completed', 'failed'
  const [checkoutId, setCheckoutId] = useState(null);

  const initiatePayment = async () => {
    setLoading(true);
    setStatus('sending');
    
    try {
      const token = sessionStorage.getItem('token');
      if (!token) {
        throw new Error('Please log in again');
      }
      
      const response = await fetch(`${API_BASE}/api/mpesa/stkpush`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          amount: amount,
          phone_number: phoneNumber,
          property_id: propertyId
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.status === 'success') {
        setCheckoutId(data.checkout_request_id);
        setStatus('pending');
        
        // Start polling for payment status
        pollPaymentStatus(data.checkout_request_id);
      } else {
        throw new Error(data.detail || 'Payment initiation failed');
      }
    } catch (error) {
      console.error('Payment error:', error);
      setStatus('failed');
      if (onError) onError(error.message);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const pollPaymentStatus = async (checkoutId) => {
    let attempts = 0;
    const maxAttempts = 30; // Poll for 90 seconds (3s * 30)
    
    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          `${API_BASE}/api/mpesa/status/${checkoutId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        const data = await response.json();
        
        if (data.status === 'completed') {
          clearInterval(interval);
          setStatus('completed');
          if (onSuccess) onSuccess();
          alert('✅ Payment successful! Your rent has been updated.');
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setStatus('failed');
          alert('❌ Payment failed. Please try again.');
        }
        
        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          setStatus('timeout');
          alert('⏰ Payment timeout. Check your M-Pesa messages for status.');
        }
      } catch (error) {
        console.error('Status check error:', error);
      }
    }, 3000);
  };

  const resetPayment = () => {
    setStatus(null);
    setCheckoutId(null);
    setPhoneNumber('');
    setLoading(false);
  };

  // Format phone number as user types
  const handlePhoneChange = (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.startsWith('0') && value.length <= 10) {
      value = value.substring(1);
    }
    if (value.length <= 9) {
      setPhoneNumber(value);
    }
  };

  return (
    <div style={{ background: 'rgba(17,24,39,0.98)', borderRadius: '16px', boxShadow: '0 4px 32px rgba(0,0,0,0.3)', padding: 24, maxWidth: 420, margin: '0 auto', color: '#fff' }}>
      <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 16, color: '#fff' }}>Pay with M-Pesa</h3>

      {/* Amount Display */}
      <div style={{ background: 'rgba(16,185,129,0.10)', borderRadius: 12, padding: 16, marginBottom: 24, textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#d1fae5', marginBottom: 2 }}>Amount to Pay</p>
        <p style={{ fontSize: 28, fontWeight: 700, color: '#10b981', margin: 0 }}>KES {amount.toLocaleString()}</p>
      </div>

      {/* Payment Form */}
      {!status || status === 'sending' ? (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              M-Pesa Phone Number
            </label>
            <div style={{ display: 'flex' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 12px', background: '#1e293b', border: '1px solid #334155', borderRight: 0, borderRadius: '8px 0 0 8px', color: '#94a3b8', fontSize: 15 }}>
                +254
              </span>
              <input
                type="tel"
                placeholder="712345678"
                value={phoneNumber}
                onChange={handlePhoneChange}
                style={{ flex: 1, padding: '10px 12px', border: '1px solid #334155', borderRadius: '0 8px 8px 0', background: '#0f172a', color: '#fff', fontSize: 15 }}
                disabled={loading}
              />
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Enter 9-digit number (without 0 or +254)
            </p>
          </div>

          <button
            onClick={initiatePayment}
            disabled={loading || phoneNumber.length < 9}
            style={{ width: '100%', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 16, padding: '13px 0', borderRadius: 10, border: 'none', marginTop: 4, marginBottom: 2, opacity: loading || phoneNumber.length < 9 ? 0.5 : 1, cursor: loading || phoneNumber.length < 9 ? 'not-allowed' : 'pointer', boxShadow: '0 2px 12px rgba(16,185,129,0.15)' }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg style={{ animation: 'spin 1s linear infinite', marginRight: 8, height: 20, width: 20, color: '#fff' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : (
              'Pay with M-Pesa'
            )}
          </button>
        </>
      ) : status === 'pending' ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ animation: 'spin 1s linear infinite', borderRadius: '50%', height: 64, width: 64, borderBottom: '4px solid #10b981', margin: '0 auto 16px' }}></div>
          <p style={{ color: '#fff', fontWeight: 600 }}>Check your phone</p>
          <p style={{ fontSize: 14, color: '#a3e635', marginTop: 8 }}>
            Enter your M-Pesa PIN on <strong style={{ color: '#fff' }}>{phoneNumber}</strong>
          </p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 16 }}>
            Waiting for confirmation...
          </p>
        </div>
      ) : status === 'completed' ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ width: 64, height: 64, background: '#d1fae5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg style={{ width: 32, height: 32, color: '#10b981' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p style={{ color: '#10b981', fontWeight: 700, fontSize: 20 }}>Payment Successful!</p>
          <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 8 }}>Your rent has been updated.</p>
          <button
            onClick={resetPayment}
            style={{ marginTop: 24, background: '#1e293b', color: '#fff', fontWeight: 500, padding: '10px 24px', borderRadius: 8, border: 'none', fontSize: 15, cursor: 'pointer' }}
          >
            Pay Another
          </button>
        </div>
      ) : status === 'failed' ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ width: 64, height: 64, background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg style={{ width: 32, height: 32, color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p style={{ color: '#ef4444', fontWeight: 700, fontSize: 20 }}>Payment Failed</p>
          <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 8 }}>Please try again.</p>
          <button
            onClick={resetPayment}
            style={{ marginTop: 24, background: '#10b981', color: '#fff', fontWeight: 500, padding: '10px 24px', borderRadius: 8, border: 'none', fontSize: 15, cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      ) : null}

      {/* Sandbox Notice */}
      <p style={{ fontSize: 11, textAlign: 'center', color: '#94a3b8', marginTop: 24, borderTop: '1px solid #1e293b', paddingTop: 16 }}>
        🔬 Sandbox Mode | Test Phone: 254708374149 | PIN: 174379
      </p>
    </div>
  );
}

export default MpesaPayment;