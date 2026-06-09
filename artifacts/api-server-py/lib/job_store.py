import time
import threading
from typing import Any, Literal, Optional

JobStatus = Literal["pending", "running", "done", "failed"]

_jobs: dict[str, dict] = {}
_lock = threading.Lock()


def create_job(job_id: str, total: int = 100, user_id: Optional[str] = None) -> dict:
    job = {
        "id": job_id,
        "userId": user_id,
        "status": "pending",
        "progress": 0,
        "total": total,
        "result": None,
        "error": None,
        "createdAt": time.time() * 1000,
    }
    with _lock:
        _jobs[job_id] = job
    return job


def update_job(job_id: str, **patch) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if job:
            job.update(patch)


def get_job(job_id: str) -> Optional[dict]:
    with _lock:
        return dict(_jobs[job_id]) if job_id in _jobs else None


def _cleanup():
    while True:
        time.sleep(300)
        cutoff = (time.time() - 1800) * 1000
        with _lock:
            stale = [k for k, v in _jobs.items() if v["createdAt"] < cutoff]
            for k in stale:
                del _jobs[k]


threading.Thread(target=_cleanup, daemon=True).start()
