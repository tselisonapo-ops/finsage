from locust import HttpUser, task, between

EMAIL = "testuser@example.com"
PASSWORD = "password123"

class FinSageUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        """Runs when a simulated user starts"""
        payload = {
            "email": EMAIL,
            "password": PASSWORD
        }

        response = self.client.post("/api/auth/login", json=payload, name="login")

        if response.status_code != 200:
            response.failure("Login failed")
        else:
            data = response.json()
            token = data.get("accessToken")

            if token:
                self.client.headers.update({
                    "Authorization": f"Bearer {token}"
                })

    @task(3)
    def load_dashboard(self):
        self.client.get("/api/auth/me", name="auth_me")

    @task(2)
    def customers(self):
        self.client.get("/api/customers", name="customers_list")

    @task(2)
    def invoices(self):
        self.client.get("/api/invoices", name="invoices_list")

    @task(1)
    def journals(self):
        self.client.get("/api/journals", name="journals_list")

    @task(1)
    def reports(self):
        self.client.get("/api/reports/pnl", name="pnl_report")