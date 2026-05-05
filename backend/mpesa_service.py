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
        # Validate credentials are configured
        if not self.consumer_key or not self.consumer_secret:
            raise Exception("M-Pesa credentials not configured. Check MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET in .env file")
        
        api_url = f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials"
        
        # Encode consumer key and secret
        credentials = f"{self.consumer_key}:{self.consumer_secret}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        
        headers = {
            "Authorization": f"Basic {encoded_credentials}",
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.get(api_url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                token = response.json().get("access_token")
                if token:
                    return token
                else:
                    raise Exception("No access token in response")
            else:
                error_detail = response.text
                try:
                    error_detail = response.json()
                except:
                    pass
                raise Exception(f"Failed to get token (status {response.status_code}): {error_detail}")
        
        except requests.exceptions.RequestException as e:
            raise Exception(f"Network error getting M-Pesa token: {str(e)}")
    
    def stk_push(self, phone_number, amount, account_reference, transaction_desc):
        """
        Send STK Push to customer's phone
        """
        # Format phone number (must be 254XXXXXXXXX)
        if phone_number.startswith("0"):
            phone_number = "254" + phone_number[1:]
        elif phone_number.startswith("+"):
            phone_number = phone_number[1:]
        
        # Ensure it's exactly 12 digits starting with 254
        if not phone_number.startswith("254") or len(phone_number) != 12:
            raise Exception(f"Invalid phone number format: {phone_number}. Must be 254XXXXXXXXX")

        import base64
        import requests
        from datetime import datetime
        import pytz

           # 1. Get access token
        token = self.get_access_token()
        if not token:
            raise Exception("Failed to get M-Pesa access token")

        # 2. Generate timestamp (EAT timezone)
        timestamp = datetime.now(pytz.timezone("Africa/Nairobi")).strftime("%Y%m%d%H%M%S")


        
        # Generate password (Base64 encoded)
        password_str = f"{self.shortcode}{self.passkey}{timestamp}"
        password = base64.b64encode(password_str.encode()).decode()
        
        # 4. Ensure amount is integer
        amount = int(amount)

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
        

        # 6. Debug logs (CRITICAL)
        print("\n==== STK PUSH REQUEST ====")
        print(payload)

        try:
            response = requests.post(
                f"{self.base_url}/mpesa/stkpush/v1/processrequest",
                json=payload,
                headers=headers,
                timeout=30
            )

            try:
                response_data = response.json()
            except Exception:
                response_data = {"error": response.text}

            print("\n==== STK PUSH RESPONSE ====")
            print("Status Code:", response.status_code)
            print(response_data)

            return response_data

        except requests.exceptions.RequestException as e:
            print("\n==== STK PUSH ERROR ====")
            print(str(e))
            return {"error": str(e)}

    # try:
    #         response = requests.post(
    #             f"{self.base_url}/mpesa/stkpush/v1/processrequest",
    #             json=payload,
    #             headers=headers,
    #             timeout=30
    #         )
    #     # Make STK Push request
    #     response = requests.post(
    #         f"{self.base_url}/mpesa/stkpush/v1/processrequest",
    #         json=payload,
    #         headers=headers
    #     )
        
    #     try:
    #         response_data = response.json()
    #     except Exception:
    #         response_data = {"error": response.text}

    #     print("==== STK PUSH REQUEST ====")
    #     print(payload)

    #     print("==== STK PUSH RESPONSE ====")
    #     print(response.status_code, response_data)

    #     return response_data
    # except requests.exceptions.RequestException as e:
    #         print("\n==== STK PUSH ERROR ====")
    #         print(str(e))
    #         return {"error": str(e)}
        
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