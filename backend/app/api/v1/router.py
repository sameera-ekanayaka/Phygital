"""Aggregate all v1 feature routers into a single parent router.

Importing this module gives you one ``APIRouter`` (``api_v1_router``) that
includes every feature sub-router.  The main application factory mounts it
under ``/api/v1``.
"""

from fastapi import APIRouter

from app.api.v1.ingest.routes import router as ingest_router
from app.api.v1.ocr.routes import router as ocr_router
from app.api.v1.qrcode.routes import router as qrcode_router

api_v1_router = APIRouter()

api_v1_router.include_router(ingest_router)
api_v1_router.include_router(ocr_router)
api_v1_router.include_router(qrcode_router)
