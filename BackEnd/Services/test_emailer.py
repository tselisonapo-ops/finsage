import smtplib, ssl

smtp_server = "smtp.gmail.com"
port = 465
user = "tselisonapo@gmail.com"
password = "hlsldrpfetmdhtig"  # exactly the app password

context = ssl.create_default_context()

with smtplib.SMTP_SSL(smtp_server, port, context=context) as server:
    server.login(user, password)
    server.sendmail(user, user, "Subject: Test\n\nIf you see this, your SMTP works.")
