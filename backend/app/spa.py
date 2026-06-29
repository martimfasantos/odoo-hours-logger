"""Static-file serving for the built single-page app.

A ``StaticFiles`` subclass that falls back to ``index.html`` for any path that
would 404, so the React Router client-side routes resolve on reload/deep-link.
Real asset files (under /assets, favicon, etc.) are still served as files.
"""
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise
