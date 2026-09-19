import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response

from db import db
from security import bearer, current_user, user_from_token
from storage import APP_NAME, get_object, put_object

router = APIRouter(tags=["uploads"])

ALLOWED_EXT = {"jpg", "jpeg", "png", "webp", "heic"}


@router.post("/upload")
async def upload(file: UploadFile = File(...), user: dict = Depends(current_user)):
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File troppo grande (max 8MB)")
    parts = (file.filename or "img.jpg").rsplit(".", 1)
    ext = parts[-1].lower()[:5] if len(parts) == 2 else "jpg"
    if ext not in ALLOWED_EXT:
        ext = "jpg"
    path = f"{APP_NAME}/uploads/{user['_id']}/{uuid.uuid4()}.{ext}"
    try:
        res = await put_object(path, data, file.content_type or "image/jpeg")
    except Exception:
        raise HTTPException(status_code=502, detail="Caricamento non riuscito, riprova")
    return {"url": f"/api/files/{res['path']}", "path": res["path"]}


@router.get("/files/{path:path}")
async def download(path: str, token: str | None = Query(None), credentials=Depends(bearer)):
    # Catalog media (product/label photos) is public content; anything else requires a session.
    if not path.startswith(f"{APP_NAME}/uploads/"):
        await user_from_token(token or (credentials.credentials if credentials else None))
    try:
        data, ctype = await get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File non trovato")
    return Response(content=data, media_type=ctype, headers={"Cache-Control": "public, max-age=86400"})
