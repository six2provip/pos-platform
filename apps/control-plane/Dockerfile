FROM python:3.11-slim

WORKDIR /workspace

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/workspace:/workspace/apps/control-plane

COPY licensing /workspace/licensing
COPY apps/control-plane /workspace/apps/control-plane

RUN pip install --no-cache-dir \
    fastapi uvicorn[standard] sqlalchemy alembic pydantic PyJWT bcrypt PyNaCl psycopg2-binary

EXPOSE 8001

CMD ["uvicorn", "control_app.main:app", "--host", "0.0.0.0", "--port", "8001"]

