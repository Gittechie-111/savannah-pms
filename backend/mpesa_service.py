import requests
import base64
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

class MpesaService:
    def __init__(self):
        self.consumer_key = os.getenv("MPESA_CONSUMER_KEY")
        self.consumer_secret = os.getenv("MPESA_CONSUMER_SECRET")
        self.passkey = os.getenv("MPESA_PASSKEY")
        self.shortcode = os.getenv("MPESA_SHORTCODE", "174379")
        self.callback_url = os.getenv("MPESA_CALLBACK_URL")
        self.base_url = "https://sandbox.safaricom.co.ke"
        
    def get_access_token(self):
        """Get OAuth token for API authentication"""
        api_url = f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials"
        
        # Encode consumer key and secret
        credentials = f"{self.consumer_key}:{self.consumer_secret}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        
        headers = {
            "Authorization": f"Basic {encoded_credentials}",
            "Content-Type": "application/json"
        }
        
        response = requests.get(api_url, headers=headers)
        
        if response.status_code == 200:
            return response.json().get("access_token")
        else:
            raise Exception(f"Failed to get token: {response.text}")
    
    def stk_push(self, phone_number, amount, account_reference, transaction_desc):
        """
        Send STK Push to customer's phone
        """
        # Format phone number (must be 254XXXXXXXXX)
        if phone_number.startswith("0"):
            phone_number = "254" + phone_number[1:]
        elif phone_number.startswith("+"):
            phone_number = phone_number[1:]
        
        # Get access token
        token = self.get_access_token()
        
        # Generate timestamp (YYYYMMDDHHMMSS)
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        
        # Generate password (Base64 encoded)
        password_str = f"{self.shortcode}{self.passkey}{timestamp}"
        password = base64.b64encode(password_str.encode()).decode()
        
        # Prepare STK Push payload
        payload = {
            "BusinessShortCode": self.shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": int(amount),
            "PartyA": phone_number,
            "PartyB": self.shortcode,
            "PhoneNumber": phone_number,
            "CallBackURL": self.callback_url,
            "AccountReference": account_reference,
            "TransactionDesc": transaction_desc
        }
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        # Make STK Push request
        response = requests.post(
            f"{self.base_url}/mpesa/stkpush/v1/processrequest",
            json=payload,
            headers=headers
        )
        
        return response.json()
    
    def query_status(self, checkout_request_id):
        """
        Query transaction status
        """
        token = self.get_access_token()
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        
        password_str = f"{self.shortcode}{self.passkey}{timestamp}"
        password = base64.b64encode(password_str.encode()).decode()
        
        payload = {
            "BusinessShortCode": self.shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "CheckoutRequestID": checkout_request_id
        }
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(
            f"{self.base_url}/mpesa/stkpushquery/v1/query",
            json=payload,
            headers=headers
        )
        
        return response.json()