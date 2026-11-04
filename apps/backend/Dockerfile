FROM python:3.11-slim

WORKDIR /workspace

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/workspace:/workspace/apps/backend

COPY licensing /workspace/licensing
COPY apps/backend /workspace/apps/backend

RUN pip install --no-cache-dir \
    fastapi uvicorn[standard] sqlalchemy alembic pydantic PyJWT bcrypt PyNaCl httpx psycopg2-binary

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

