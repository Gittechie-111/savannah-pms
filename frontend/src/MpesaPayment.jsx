import { useState } from 'react';

function MpesaPayment({ tenantId, amount, propertyId, onSuccess, onError }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // null, 'sending', 'pending', 'completed', 'failed'
  const [checkoutId, setCheckoutId] = useState(null);

  const initiatePayment = async () => {
    setLoading(true);
    setStatus('sending');
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Please log in again');
      }
      
      const response = await fetch('http://localhost:8000/api/mpesa/stkpush', {
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
          `http://localhost:8000/api/mpesa/status/${checkoutId}`,
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
    <div className="bg-white rounded-lg shadow-md p-6 max-w-md mx-auto">
      <h3 className="text-xl font-bold text-gray-800 mb-4">Pay with M-Pesa</h3>
      
      {/* Amount Display */}
      <div className="bg-green-50 rounded-lg p-4 mb-6 text-center">
        <p className="text-sm text-gray-600">Amount to Pay</p>
        <p className="text-3xl font-bold text-green-600">KES {amount.toLocaleString()}</p>
      </div>
      
      {/* Payment Form */}
      {!status || status === 'sending' ? (
        <>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              M-Pesa Phone Number
            </label>
            <div className="flex">
              <span className="inline-flex items-center px-3 bg-gray-100 border border-r-0 rounded-l-md text-gray-500">
                +254
              </span>
              <input
                type="tel"
                placeholder="712345678"
                value={phoneNumber}
                onChange={handlePhoneChange}
                className="flex-1 p-2 border rounded-r-md focus:outline-none focus:ring-2 focus:ring-green-500"
                disabled={loading}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Enter 9-digit number (without 0 or +254)
            </p>
          </div>
          
          <button
            onClick={initiatePayment}
            disabled={loading || phoneNumber.length < 9}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : (
              'Pay with M-Pesa'
            )}
          </button>
        </>
      ) : status === 'pending' ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-700 font-medium">Check your phone</p>
          <p className="text-sm text-gray-500 mt-2">
            Enter your M-Pesa PIN on <strong>{phoneNumber}</strong>
          </p>
          <p className="text-xs text-gray-400 mt-4">
            Waiting for confirmation...
          </p>
        </div>
      ) : status === 'completed' ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-green-600 font-bold text-lg">Payment Successful!</p>
          <p className="text-sm text-gray-500 mt-2">Your rent has been updated.</p>
          <button
            onClick={resetPayment}
            className="mt-6 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded-lg transition"
          >
            Pay Another
          </button>
        </div>
      ) : status === 'failed' ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-red-600 font-bold text-lg">Payment Failed</p>
          <p className="text-sm text-gray-500 mt-2">Please try again.</p>
          <button
            onClick={resetPayment}
            className="mt-6 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition"
          >
            Try Again
          </button>
        </div>
      ) : null}
      
      {/* Sandbox Notice */}
      <p className="text-xs text-center text-gray-400 mt-6 border-t pt-4">
        🔬 Sandbox Mode | Test Phone: 254708374149 | PIN: 174379
      </p>
    </div>
  );
}

export default MpesaPayment;