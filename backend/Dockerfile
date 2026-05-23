FROM python:3.11-slim

WORKDIR /app

# Dependencias de sistema para WeasyPrint 62.x
# (Pango, Cairo, GDK-Pixbuf, fuentes y soporte MIME)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-liberation \
    fontconfig \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "python crear_admin.py && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]
