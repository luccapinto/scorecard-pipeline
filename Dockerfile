FROM python:3.11-slim

# libsndfile is required by soundfile (synthetic data tooling); ffmpeg by
# audio backends when the ML extra is installed.
ARG INSTALL_ML=false

WORKDIR /srv/app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libsndfile1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-ml.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && if [ "$INSTALL_ML" = "true" ]; then pip install --no-cache-dir -r requirements-ml.txt; fi

COPY . .

EXPOSE 8000

# Default command runs the API; the worker service overrides it in compose.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
