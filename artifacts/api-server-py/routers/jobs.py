from fastapi import APIRouter, Depends, HTTPException
from lib.job_store import get_job
from .deps import require_auth

router = APIRouter()


@router.get("/jobs/{job_id}")
def get_job_status(job_id: str, user_id: str = Depends(require_auth)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.get("userId") and job["userId"] != user_id:
        raise HTTPException(403, "Forbidden")
    return job
